import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir, release, type as osType } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { ipcMain } from 'electron'
import {
  ENVIRONMENT_IPC,
  type DockerStatusInfo,
  type EnvironmentCheckResult,
  type HostOsInfo,
  type HostPlatform,
  type SandboxContainerInfo,
  type SandboxImageInfo,
  type SandboxToolStatus,
  type StartSandboxResult,
  type StopSandboxResult
} from '../shared/environment-ipc'
import type { DesktopRuntimeManager } from './runtime-manager'

const pExecFile = promisify(execFile)

/** 跨平台运行子进程并获取输出，带容错与超时 */
async function runCmd(
  cmd: string,
  args: string[],
  timeoutMs = 15000
): Promise<{ stdout: string; stderr: string; ok: boolean; exitCode: number }> {
  try {
    const res = await pExecFile(cmd, args, {
      timeout: timeoutMs,
      encoding: 'utf8',
      windowsHide: true
    })
    return {
      stdout: res.stdout || '',
      stderr: res.stderr || '',
      ok: true,
      exitCode: 0
    }
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number | string; message?: string }
    return {
      stdout: e?.stdout || '',
      stderr: e?.stderr || e?.message || '',
      ok: false,
      exitCode: typeof e?.code === 'number' ? e.code : 1
    }
  }
}

/** 1. 跨平台操作系统识别 */
function getHostOsInfo(): HostOsInfo {
  const rawPlatform = process.platform
  let platform: HostPlatform = 'linux'
  let osName = `${osType()} ${release()}`

  if (rawPlatform === 'win32') {
    platform = 'windows'
    osName = `Windows (${release()})`
  } else if (rawPlatform === 'darwin') {
    platform = 'macos'
    const majorRelease = Number.parseInt(release().split('.')[0] || '0', 10)
    // 简易映射 macOS 版本
    let macMarketing = 'macOS'
    if (majorRelease >= 24) macMarketing = 'macOS 15 (Sequoia)'
    else if (majorRelease === 23) macMarketing = 'macOS 14 (Sonoma)'
    else if (majorRelease === 22) macMarketing = 'macOS 13 (Ventura)'
    else if (majorRelease === 21) macMarketing = 'macOS 12 (Monterey)'
    osName = `${macMarketing} [Darwin ${release()}]`
  } else {
    platform = 'linux'
    try {
      if (existsSync('/etc/os-release')) {
        const content = readFileSync('/etc/os-release', 'utf8')
        const match = content.match(/^PRETTY_NAME=["']?([^"'\n]+)["']?/m)
        if (match?.[1]) osName = match[1]
      }
    } catch {
      // ignore
    }
  }

  return {
    platform,
    platformRaw: rawPlatform,
    arch: process.arch,
    osName,
    hostname: osType()
  }
}

/** 2. 跨平台寻找 Docker CLI 可执行路径 */
async function locateDockerBinary(platform: HostPlatform): Promise<string | null> {
  const candidates: string[] = []

  if (platform === 'windows') {
    candidates.push(
      'docker.exe',
      'docker',
      'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe',
      'C:\\ProgramData\\DockerDesktop\\version-bin\\docker.exe'
    )
  } else if (platform === 'macos') {
    candidates.push(
      'docker',
      '/usr/local/bin/docker',
      '/opt/homebrew/bin/docker',
      join(homedir(), '.docker', 'bin', 'docker'),
      '/Applications/Docker.app/Contents/Resources/bin/docker'
    )
  } else {
    // Linux
    candidates.push(
      'docker',
      '/usr/bin/docker',
      '/usr/local/bin/docker',
      '/snap/bin/docker',
      join(homedir(), '.docker', 'bin', 'docker')
    )
  }

  for (const bin of candidates) {
    // 若为绝对路径直接检查存在性
    if (bin.includes('/') || bin.includes('\\')) {
      if (existsSync(bin)) return bin
    } else {
      // 检查 PATH 是否可用
      const check = await runCmd(bin, ['--version'], 3000)
      if (check.ok) return bin
    }
  }

  return null
}

/** 3. 检查 Docker 引擎与运行状态 */
async function checkDockerStatus(
  platform: HostPlatform,
  dockerBin: string | null
): Promise<DockerStatusInfo> {
  if (!dockerBin) {
    let suggestion = '请先安装 Docker 环境。'
    if (platform === 'windows') {
      suggestion = '未检测到 Docker。请下载安装 Docker Desktop for Windows，并启用 WSL2 后端。'
    } else if (platform === 'macos') {
      suggestion = '未检测到 Docker。请安装 Docker Desktop for Mac 或 OrbStack。'
    } else {
      suggestion =
        '未检测到 Docker。请使用发行版包管理器安装 docker-ce (例如 apt install docker.io)。'
    }
    return {
      installed: false,
      running: false,
      error: '系统未检测到 docker 可执行文件',
      suggestion
    }
  }

  // 运行 docker version 验证 client & server
  const versionRes = await runCmd(dockerBin, ['version', '--format', '{{json .}}'], 5000)
  if (!versionRes.ok) {
    let suggestion = 'Docker 守护进程未启动，请启动 Docker 服务。'
    if (platform === 'windows') {
      suggestion =
        'Docker Desktop 可能尚未启动，请从开始菜单运行 Docker Desktop 并等待其进入 Running 状态。'
    } else if (platform === 'macos') {
      suggestion = 'Docker Desktop 或 OrbStack 尚未启动，请从应用程序目录打开并等待引擎启动完成。'
    } else {
      suggestion =
        'Docker 守护进程未运行或无权限。请执行 "sudo systemctl start docker" 并检查当前用户是否加入 docker 用户组。'
    }

    return {
      installed: true,
      running: false,
      executablePath: dockerBin,
      error: versionRes.stderr || '无法连接到 Docker 守护进程',
      suggestion
    }
  }

  let versionStr = 'Unknown'
  let apiVersion = 'Unknown'
  try {
    const parsed = JSON.parse(versionRes.stdout) as {
      Client?: { Version?: string }
      Server?: { Version?: string; ApiVersion?: string }
    }
    versionStr = parsed.Server?.Version || parsed.Client?.Version || 'Docker Engine'
    apiVersion = parsed.Server?.ApiVersion || 'v1.4x'
  } catch {
    // 简易文本提取
    const match = versionRes.stdout.match(/Version:\s*([0-9.]+)/i)
    if (match?.[1]) versionStr = match[1]
  }

  return {
    installed: true,
    running: true,
    executablePath: dockerBin,
    version: versionStr,
    apiVersion
  }
}

/** 4. 检查 mingyi-sandbox:latest 镜像 */
async function checkSandboxImage(dockerBin: string, hostArch: string): Promise<SandboxImageInfo> {
  const inspectRes = await runCmd(
    dockerBin,
    ['image', 'inspect', 'mingyi-sandbox:latest', '--format', '{{json .}}'],
    8000
  )

  if (!inspectRes.ok) {
    return {
      exists: false,
      imageTag: 'mingyi-sandbox:latest'
    }
  }

  try {
    const info = JSON.parse(inspectRes.stdout) as {
      Id?: string
      Size?: number
      Created?: string
      Architecture?: string
    }
    const sizeBytes = info.Size || 0
    const sizeGB = (sizeBytes / (1024 * 1024 * 1024)).toFixed(2)
    const imgArch = info.Architecture || 'unknown'
    const isMatch =
      (hostArch === 'arm64' && (imgArch === 'arm64' || imgArch === 'amd64')) ||
      (hostArch === 'x64' && imgArch === 'amd64')

    return {
      exists: true,
      imageTag: 'mingyi-sandbox:latest',
      imageId: info.Id ? info.Id.slice(7, 19) : undefined,
      sizeBytes,
      sizeHuman: `${sizeGB} GB`,
      createdAt: info.Created ? info.Created.split('T')[0] : undefined,
      architecture: imgArch,
      isArchitectureMatch: isMatch
    }
  } catch {
    return {
      exists: true,
      imageTag: 'mingyi-sandbox:latest'
    }
  }
}

/** 5. 检查 mingyi-sandbox 容器运行状态 */
async function checkSandboxContainer(dockerBin: string): Promise<SandboxContainerInfo> {
  const inspectRes = await runCmd(
    dockerBin,
    ['inspect', '--type', 'container', 'mingyi-sandbox', '--format', '{{json .}}'],
    6000
  )

  if (!inspectRes.ok) {
    return {
      exists: false,
      running: false,
      containerName: 'mingyi-sandbox'
    }
  }

  try {
    const info = JSON.parse(inspectRes.stdout) as {
      Id?: string
      State?: { Status?: string; Running?: boolean }
      Created?: string
      HostConfig?: { CapAdd?: string[] }
    }
    const isRunning = Boolean(info.State?.Running || info.State?.Status === 'running')
    const capAdd = info.HostConfig?.CapAdd || []
    const hasNetCaps = capAdd.includes('NET_RAW') || capAdd.includes('NET_ADMIN')

    return {
      exists: true,
      running: isRunning,
      containerId: info.Id ? info.Id.slice(0, 12) : undefined,
      containerName: 'mingyi-sandbox',
      statusText: info.State?.Status || (isRunning ? 'running' : 'stopped'),
      createdAt: info.Created ? info.Created.split('T')[0] : undefined,
      hasNetCaps
    }
  } catch {
    return {
      exists: false,
      running: false,
      containerName: 'mingyi-sandbox'
    }
  }
}

/** 6. 探活沙箱内内置的核心安全工具 */
async function checkSandboxTools(
  dockerBin: string,
  container: SandboxContainerInfo,
  image: SandboxImageInfo,
  hostArch: string
): Promise<SandboxToolStatus[]> {
  if (!image.exists) {
    return []
  }

  const runPrefix = container.running
    ? [dockerBin, 'exec', 'mingyi-sandbox', 'bash', '-c']
    : [
        dockerBin,
        'run',
        '--rm',
        ...(image.architecture === 'amd64' && hostArch === 'arm64'
          ? ['--platform', 'linux/amd64']
          : []),
        '--cap-add=NET_RAW',
        '--cap-add=NET_ADMIN',
        'mingyi-sandbox:latest',
        'bash',
        '-c'
      ]

  const probeScript = `
echo "===NMAP===" && (nmap --version 2>&1 | head -n 1) || echo "NMAP_FAIL"
echo "===NUCLEI===" && (nuclei -version 2>&1 | grep -i "Engine Version" | head -n 1) || echo "NUCLEI_FAIL"
echo "===KATANA===" && (katana -version 2>&1 | grep -i "version" | head -n 1) || echo "KATANA_FAIL"
echo "===DALFOX===" && (dalfox version 2>&1 | grep -i "v[0-9]" | head -n 1) || echo "DALFOX_FAIL"
echo "===SQLMAP===" && (sqlmap --version 2>&1 | head -n 1) || echo "SQLMAP_FAIL"
echo "===PWNTOOLS===" && (python3 -c 'import pwnlib; print("pwntools " + pwnlib.__version__)' 2>&1) || echo "PWNTOOLS_FAIL"
echo "===SECLISTS===" && ([ -d /home/kali/knowledges/SecLists ] && echo "SecLists Ready" || echo "SECLISTS_MISSING")
echo "===PATT===" && ([ -d "/home/kali/knowledges/PayloadsAllTheThings" ] && echo "Payloads Ready" || echo "PATT_MISSING")
echo "===TEMPLATES===" && ([ -d /home/kali/pocs/nuclei-templates ] && echo "Nuclei Templates Ready" || echo "TEMPLATES_MISSING")
`

  const res = await runCmd(runPrefix[0]!, [...runPrefix.slice(1), probeScript], 25000)
  const output = res.stdout || ''

  const stripAnsi = (text: string): string =>
    // eslint-disable-next-line no-control-regex
    text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim()

  const parseSection = (sectionTag: string): string | null => {
    const lines = output.split('\n')
    const idx = lines.findIndex((l) => l.includes(`===${sectionTag}===`))
    if (idx !== -1 && idx + 1 < lines.length) {
      const line = stripAnsi(lines[idx + 1]!)
      if (line && !line.includes('FAIL') && !line.includes('MISSING')) {
        return line
      }
    }
    return null
  }

  const nmapVer = parseSection('NMAP')
  const nucleiVer = parseSection('NUCLEI')
  const katanaVer = parseSection('KATANA')
  const dalfoxVer = parseSection('DALFOX')
  const sqlmapVer = parseSection('SQLMAP')
  const pwnVer = parseSection('PWNTOOLS')
  const seclistsOk = parseSection('SECLISTS')
  const pattOk = parseSection('PATT')
  const templatesOk = parseSection('TEMPLATES')

  return [
    {
      id: 'nmap',
      name: 'Nmap (网络端口侦测与扫描)',
      category: 'recon',
      available: Boolean(nmapVer),
      version: nmapVer || undefined,
      error: nmapVer ? undefined : '无法执行，请确保容器具有 NET_RAW/NET_ADMIN 权限'
    },
    {
      id: 'nuclei',
      name: 'Nuclei (基于模版的快速漏扫引擎)',
      category: 'exploit',
      available: Boolean(nucleiVer),
      version: nucleiVer || undefined,
      error: nucleiVer ? undefined : '未在容器环境中检索到 nuclei'
    },
    {
      id: 'katana',
      name: 'Katana (下一代快速网络爬虫)',
      category: 'recon',
      available: Boolean(katanaVer),
      version: katanaVer || undefined,
      error: katanaVer ? undefined : '未在容器环境中检索到 katana'
    },
    {
      id: 'dalfox',
      name: 'Dalfox (参数分析与 XSS 自动化检测)',
      category: 'recon',
      available: Boolean(dalfoxVer),
      version: dalfoxVer || undefined,
      error: dalfoxVer ? undefined : '未在容器环境中检索到 dalfox'
    },
    {
      id: 'sqlmap',
      name: 'Sqlmap (自动化 SQL 注入测试工具)',
      category: 'exploit',
      available: Boolean(sqlmapVer),
      version: sqlmapVer || undefined,
      error: sqlmapVer ? undefined : '未在容器环境中检索到 sqlmap'
    },
    {
      id: 'pwntools',
      name: 'Pwntools (二进制利用与 Exploit 框架)',
      category: 'exploit',
      available: Boolean(pwnVer),
      version: pwnVer || undefined,
      error: pwnVer ? undefined : '未在容器环境中检索到 pwntools'
    },
    {
      id: 'knowledges',
      name: '离线知识库 (PayloadsAllTheThings & SecLists)',
      category: 'knowledge',
      available: Boolean(seclistsOk && pattOk),
      version: '已挂载于 /home/kali/knowledges',
      detail: '支持在断网或离线环境中无感检索 Web/网络安全攻击字典与 Payloads'
    },
    {
      id: 'templates',
      name: 'Nuclei Templates (社区漏洞 PoC 模版)',
      category: 'knowledge',
      available: Boolean(templatesOk),
      version: '已挂载于 /home/kali/pocs',
      detail: '涵盖 CVE、默认配置、敏感信息泄露等数万条检测模版'
    }
  ]
}

/** 核心服务实现类 */
export class EnvironmentService {
  constructor(private readonly runtimeManager: DesktopRuntimeManager) {}

  async check(): Promise<EnvironmentCheckResult> {
    const host = getHostOsInfo()
    const dockerBin = await locateDockerBinary(host.platform)
    const docker = await checkDockerStatus(host.platform, dockerBin)

    let sandboxImage: SandboxImageInfo = {
      exists: false,
      imageTag: 'mingyi-sandbox:latest'
    }
    let sandboxContainer: SandboxContainerInfo = {
      exists: false,
      running: false,
      containerName: 'mingyi-sandbox'
    }
    let tools: SandboxToolStatus[] = []

    if (docker.running && dockerBin) {
      sandboxImage = await checkSandboxImage(dockerBin, host.arch)
      sandboxContainer = await checkSandboxContainer(dockerBin)
      if (sandboxImage.exists) {
        tools = await checkSandboxTools(dockerBin, sandboxContainer, sandboxImage, host.arch)
      }
    }

    const overallHealthy =
      docker.running &&
      sandboxImage.exists &&
      (sandboxContainer.running || tools.some((t) => t.available))

    return {
      checkedAt: Date.now(),
      host,
      docker,
      sandboxImage,
      sandboxContainer,
      tools,
      overallHealthy
    }
  }

  async startSandbox(): Promise<StartSandboxResult> {
    const host = getHostOsInfo()
    const dockerBin = await locateDockerBinary(host.platform)
    if (!dockerBin) {
      return { ok: false, error: '未找到 Docker 可执行文件，请先确认 Docker 是否已安装并启动' }
    }

    const containerInfo = await checkSandboxContainer(dockerBin)
    if (containerInfo.running) {
      return { ok: true, containerId: containerInfo.containerId }
    }

    // 1. 若已有容器处于停止状态，尝试直接启动
    if (containerInfo.exists) {
      const startRes = await runCmd(dockerBin, ['start', 'mingyi-sandbox'], 10000)
      if (startRes.ok) {
        // 短暂等待并确认其是否真正维持 running
        await new Promise((r) => setTimeout(r, 600))
        const verify = await checkSandboxContainer(dockerBin)
        if (verify.running) {
          return { ok: true, containerId: verify.containerId }
        }
      }
      // 启动失败或未维持运行（如容器损坏或已被删除），强制清理后进入重建流程
      await runCmd(dockerBin, ['rm', '-f', 'mingyi-sandbox'], 5000)
    }

    // 2. 检查镜像是否存在
    const imageInfo = await checkSandboxImage(dockerBin, host.arch)
    if (!imageInfo.exists) {
      return {
        ok: false,
        error:
          '未检出 mingyi-sandbox:latest 镜像。请先在终端运行 npm run container:build 构建沙箱镜像。'
      }
    }

    // 3. 准备工作区目录挂载
    const currentWorkspace = this.runtimeManager.getWorkspacePath()
    try {
      if (!existsSync(currentWorkspace)) {
        mkdirSync(currentWorkspace, { recursive: true })
      }
    } catch {
      // ignore
    }

    // 在 docker run 前先执行一次强行删除，确保名称未被意外占用
    await runCmd(dockerBin, ['rm', '-f', 'mingyi-sandbox'], 5000)

    // 4. 构建启动参数
    const runArgs = ['run', '-d', '--name', 'mingyi-sandbox']

    // 若镜像架构为 amd64 且宿主为 arm64 (如 macOS Apple Silicon)，显式传递 platform 参数
    if (imageInfo.architecture === 'amd64' && host.arch === 'arm64') {
      runArgs.push('--platform', 'linux/amd64')
    }

    // 网络模式与能力
    if (host.platform === 'linux') {
      runArgs.push('--network', 'host')
    }
    runArgs.push(
      '--cap-add=NET_RAW',
      '--cap-add=NET_ADMIN',
      '-v',
      `${currentWorkspace}:/home/kali/workspace`,
      'mingyi-sandbox:latest'
    )

    const runRes = await runCmd(dockerBin, runArgs, 25000)
    if (!runRes.ok) {
      return { ok: false, error: runRes.stderr || '创建并运行沙箱容器失败' }
    }

    // 二次确认运行状态
    await new Promise((r) => setTimeout(r, 800))
    const verifyAfterRun = await checkSandboxContainer(dockerBin)
    if (verifyAfterRun.running) {
      return { ok: true, containerId: verifyAfterRun.containerId }
    }

    // 若未能维持运行，读取最后的日志辅助排查
    const logsRes = await runCmd(dockerBin, ['logs', '--tail', '20', 'mingyi-sandbox'], 5000)
    return {
      ok: false,
      error: `容器已启动但未正常维持运行。日志: ${logsRes.stdout || logsRes.stderr || '无输出'}`
    }
  }

  async stopSandbox(): Promise<StopSandboxResult> {
    const host = getHostOsInfo()
    const dockerBin = await locateDockerBinary(host.platform)
    if (!dockerBin) {
      return { ok: false, error: '未找到 Docker 可执行文件' }
    }

    const containerInfo = await checkSandboxContainer(dockerBin)
    if (!containerInfo.exists || !containerInfo.running) {
      return { ok: true }
    }

    const stopRes = await runCmd(dockerBin, ['stop', 'mingyi-sandbox'], 15000)
    if (stopRes.ok) {
      return { ok: true }
    }
    return { ok: false, error: stopRes.stderr || '停止容器失败' }
  }
}

export function registerEnvironmentService(runtimeManager: DesktopRuntimeManager): () => void {
  const service = new EnvironmentService(runtimeManager)

  ipcMain.handle(ENVIRONMENT_IPC.check, async () => {
    return await service.check()
  })

  ipcMain.handle(ENVIRONMENT_IPC.startSandbox, async () => {
    return await service.startSandbox()
  })

  ipcMain.handle(ENVIRONMENT_IPC.stopSandbox, async () => {
    return await service.stopSandbox()
  })

  return () => {
    ipcMain.removeHandler(ENVIRONMENT_IPC.check)
    ipcMain.removeHandler(ENVIRONMENT_IPC.startSandbox)
    ipcMain.removeHandler(ENVIRONMENT_IPC.stopSandbox)
  }
}
