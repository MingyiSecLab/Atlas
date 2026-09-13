/**
 * 安全工具域：检测系统 Docker 及 mingyi-sandbox 沙箱容器的就绪状态。
 *
 * 架构定位：
 * - 面向授权安全评估的读/探测类工具（kind: 'read-only'），安全闸零阻碍；
 * - 实现 pentest 的 RuntimePentestTool 契约，经 DEFAULT_PENTEST_TOOLS 注册；
 * - 经 mastra-adapters 暴露为 detect_sandbox_environment 工具，帮助安全 Agent
 *   在执行 kali_exec / kali_session_* 前自主完成 Pre-flight 环境体检，
 *   并在缺失时为用户提供精准的一键/脚本化启动建议。
 */

import {
  createSpawnDockerRunner,
  type SandboxDockerRunner
} from '../../sandbox/docker.js'
import { DEFAULT_SANDBOX_IMAGE } from '../../sandbox/types.js'
import type { RuntimePentestTool, RuntimePentestToolCommand, RuntimePentestToolContext } from '../../pentest/tools.js'

export type SandboxStatusLevel =
  | 'ready'
  | 'need_start_container'
  | 'need_run_container'
  | 'need_build_image'
  | 'need_start_docker'
  | 'need_install_docker'

export interface DetectSandboxDiagnostic {
  dockerInstalled: boolean
  dockerVersion?: string
  daemonRunning: boolean
  daemonError?: string
  imageExists: boolean
  imageName: string
  containerState: 'running' | 'stopped' | 'missing' | 'unknown'
  containerName: string
  containerId?: string
  level: SandboxStatusLevel
  summary: string
  suggestion: string
}

export interface DetectSandboxToolOptions {
  runner?: SandboxDockerRunner
  dockerBin?: string
  containerName?: string
  image?: string
}

/**
 * 核心诊断探测：检测宿主 Docker 与 mingyi-sandbox 就绪状态
 */
export async function detectSandboxEnvironment(
  options?: DetectSandboxToolOptions
): Promise<DetectSandboxDiagnostic> {
  const dockerBin = options?.dockerBin || process.env.MINGYI_DOCKER_BIN || 'docker'
  const containerName =
    options?.containerName || process.env.MINGYI_SANDBOX_CONTAINER || 'mingyi-sandbox'
  const imageName =
    options?.image || process.env.MINGYI_SANDBOX_IMAGE || DEFAULT_SANDBOX_IMAGE
  const runner = options?.runner ?? createSpawnDockerRunner(dockerBin)

  // 1. 检测 Docker CLI
  let dockerInstalled = false
  let dockerVersion: string | undefined
  const versionRes = await runner(['--version'], { timeoutMs: 5000 })
  if (
    versionRes.exitCode === 0 &&
    versionRes.stdout.toLowerCase().includes('docker version')
  ) {
    dockerInstalled = true
    dockerVersion = versionRes.stdout.trim().split('\n')[0]
  } else if (/enoent|not found|no such file/i.test(versionRes.stderr)) {
    dockerInstalled = false
  }

  if (!dockerInstalled) {
    return {
      dockerInstalled: false,
      daemonRunning: false,
      imageExists: false,
      imageName,
      containerState: 'missing',
      containerName,
      level: 'need_install_docker',
      summary: '宿主机未检测到 Docker CLI 可执行程序。',
      suggestion:
        '请先安装并启动 Docker Desktop 或 Docker Engine（参考 https://docs.docker.com/get-docker/）。'
    }
  }

  // 2. 检测 Docker Daemon
  let daemonRunning = false
  let daemonError: string | undefined
  const infoRes = await runner(['info', '--format', '{{.ServerVersion}}'], { timeoutMs: 8000 })
  if (infoRes.exitCode === 0 && infoRes.stdout.trim().length > 0) {
    daemonRunning = true
  } else {
    daemonRunning = false
    daemonError = infoRes.stderr.trim() || 'Cannot connect to the Docker daemon.'
    return {
      dockerInstalled: true,
      dockerVersion,
      daemonRunning: false,
      daemonError,
      imageExists: false,
      imageName,
      containerState: 'unknown',
      containerName,
      level: 'need_start_docker',
      summary: 'Docker CLI 已安装，但 Docker Daemon 未运行或无法连接。',
      suggestion:
        '请启动 Docker Desktop 应用，或在终端执行 "sudo systemctl start docker" 启动 Docker 守护进程。'
    }
  }

  // 3. 检测沙箱镜像
  let imageExists = false
  const imgRes = await runner(
    ['image', 'inspect', imageName, '--format', '{{.Id}}'],
    { timeoutMs: 8000 }
  )
  if (imgRes.exitCode === 0 && imgRes.stdout.trim().length > 0) {
    imageExists = true
  }

  // 4. 检测沙箱容器
  let containerState: 'running' | 'stopped' | 'missing' | 'unknown' = 'unknown'
  let containerId: string | undefined
  const cRes = await runner(
    ['inspect', '--type', 'container', '--format', '{{.State.Status}}\n{{.Id}}', containerName],
    { timeoutMs: 8000 }
  )

  if (cRes.exitCode === 0) {
    const lines = cRes.stdout.trim().split('\n')
    const rawStatus = lines[0]?.trim().toLowerCase()
    const rawId = lines[1]?.trim()
    containerId = rawId ? rawId.slice(0, 12) : undefined

    if (rawStatus === 'running') {
      containerState = 'running'
    } else {
      containerState = 'stopped'
    }
  } else if (/no such object|not found|no such container/i.test(cRes.stderr)) {
    containerState = 'missing'
  }

  // 5. 综合判定 Level 与建议
  let level: SandboxStatusLevel = 'ready'
  let summary = ''
  let suggestion = ''

  if (containerState === 'running') {
    level = 'ready'
    summary = `沙箱环境已就绪：mingyi-sandbox 容器正在运行 (ID: ${containerId ?? 'unknown'})。`
    suggestion =
      '沙箱就绪，Agent 可通过 kali_exec / kali_session 等工具执行 nmap、nuclei、sqlmap 等专业渗透测试。'
  } else if (containerState === 'stopped') {
    level = 'need_start_container'
    summary = `沙箱容器 ${containerName} 已存在，但当前处于停止状态。`
    suggestion = `执行 "docker start ${containerName}" 即可唤醒沙箱。`
  } else if (!imageExists) {
    level = 'need_build_image'
    summary = `沙箱镜像 ${imageName} 尚未在本地构建。`
    suggestion =
      '请在项目根目录运行 "npm run container:build" 构建 Kali 沙箱镜像，构建完成后执行 "npm run container:run" 启动。'
  } else {
    level = 'need_run_container'
    summary = `沙箱镜像 ${imageName} 已就绪，但容器 ${containerName} 尚未启动。`
    suggestion =
      `可执行 "npm run container:run" 或 "docker run -d --name ${containerName} --network host --cap-add=NET_RAW --cap-add=NET_ADMIN ${imageName}" 创建并启动沙箱容器。`
  }

  return {
    dockerInstalled,
    dockerVersion,
    daemonRunning,
    imageExists,
    imageName,
    containerState,
    containerName,
    containerId,
    level,
    summary,
    suggestion
  }
}

/**
 * 格式化输出为清晰易读的文本报告，方便模型解析与向用户展示
 */
export function formatDetectSandboxReport(diag: DetectSandboxDiagnostic): string {
  const lines: string[] = [
    '=== Mingyi Kali Sandbox 状态检测报告 ===',
    `- Docker CLI: ${diag.dockerInstalled ? `已安装 (${diag.dockerVersion || '版本正常'})` : '未安装'}`,
    `- Docker 服务: ${diag.daemonRunning ? '正在运行' : `未连接 (${diag.daemonError || '离线'})`}`,
    `- 沙箱镜像 (${diag.imageName}): ${diag.imageExists ? '已下载/就绪' : '本地缺失'}`,
    `- 沙箱容器 (${diag.containerName}): ${diag.containerState}${diag.containerId ? ` [${diag.containerId}]` : ''}`,
    `- 诊断结论: [${diag.level}] ${diag.summary}`,
    `- 操作建议: ${diag.suggestion}`
  ]
  return lines.join('\n')
}

/**
 * 创建 detect_sandbox_environment Pentest 工具
 */
export function createDetectSandboxTool(options?: DetectSandboxToolOptions): RuntimePentestTool {
  return {
    name: 'detect_sandbox_environment',
    kind: 'read-only',
    description: [
      'Check host Docker installation, Docker daemon status, and the mingyi-sandbox container readiness.',
      'Returns whether Kali sandbox execution tools (kali_exec, etc.) are available and provides setup commands if missing.',
      'Arguments: none required (all options default to standard mingyi-sandbox setup).'
    ].join(' '),
    timeoutMs: 30_000,
    async execute(_command: RuntimePentestToolCommand, _context: RuntimePentestToolContext) {
      const diag = await detectSandboxEnvironment(options)
      const report = formatDetectSandboxReport(diag)
      return {
        output: `${report}\n\n${JSON.stringify(diag, null, 2)}`,
        exitCode: diag.level === 'ready' ? 0 : 1
      }
    }
  }
}
