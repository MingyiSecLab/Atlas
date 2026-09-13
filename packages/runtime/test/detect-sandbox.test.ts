import { describe, expect, it } from 'vitest'
import type { SandboxDockerRunner, SandboxProcessResult } from '../src/sandbox/docker.js'
import {
  createDetectSandboxTool,
  detectSandboxEnvironment,
  formatDetectSandboxReport,
  type DetectSandboxToolOptions
} from '../src/tools/security-tools/detect-sandbox.js'
import { DEFAULT_PENTEST_TOOLS } from '../src/pentest/builtin-tools.js'
import { createSecurityMastraTools } from '../src/tools/security-tools/mastra-adapters.js'

function ok(stdout = '', stderr = ''): SandboxProcessResult {
  return { stdout, stderr, exitCode: 0, timedOut: false }
}

function fail(stderr = 'error', exitCode = 1): SandboxProcessResult {
  return { stdout: '', stderr, exitCode, timedOut: false }
}

describe('detect-sandbox security tool', () => {
  it('未安装 Docker 时返回 need_install_docker', async () => {
    const runner: SandboxDockerRunner = async (args) => {
      if (args[0] === '--version') return fail('docker: command not found (ENOENT)')
      return fail('unexpected call')
    }

    const diag = await detectSandboxEnvironment({ runner })
    expect(diag.dockerInstalled).toBe(false)
    expect(diag.level).toBe('need_install_docker')
    expect(diag.suggestion).toContain('安装')
  })

  it('Docker 已安装但 Daemon 未启动时返回 need_start_docker', async () => {
    const runner: SandboxDockerRunner = async (args) => {
      if (args[0] === '--version') return ok('Docker version 25.0.3, build 4debf41\n')
      if (args[0] === 'info') return fail('Cannot connect to the Docker daemon at unix:///var/run/docker.sock')
      return fail('unexpected call')
    }

    const diag = await detectSandboxEnvironment({ runner })
    expect(diag.dockerInstalled).toBe(true)
    expect(diag.daemonRunning).toBe(false)
    expect(diag.level).toBe('need_start_docker')
    expect(diag.suggestion).toContain('启动 Docker')
  })

  it('Docker 正常但镜像与容器皆缺失时返回 need_build_image', async () => {
    const runner: SandboxDockerRunner = async (args) => {
      if (args[0] === '--version') return ok('Docker version 25.0.3\n')
      if (args[0] === 'info') return ok('25.0.3\n')
      if (args[0] === 'image' && args[1] === 'inspect') return fail('Error: No such image: mingyi-sandbox:latest')
      if (args[0] === 'inspect' && args[1] === '--type' && args[2] === 'container') {
        return fail('Error: No such container: mingyi-sandbox')
      }
      return fail('unexpected call')
    }

    const diag = await detectSandboxEnvironment({ runner })
    expect(diag.dockerInstalled).toBe(true)
    expect(diag.daemonRunning).toBe(true)
    expect(diag.imageExists).toBe(false)
    expect(diag.containerState).toBe('missing')
    expect(diag.level).toBe('need_build_image')
    expect(diag.suggestion).toContain('container:build')
  })

  it('镜像已就绪但容器尚未创建时返回 need_run_container', async () => {
    const runner: SandboxDockerRunner = async (args) => {
      if (args[0] === '--version') return ok('Docker version 25.0.3\n')
      if (args[0] === 'info') return ok('25.0.3\n')
      if (args[0] === 'image' && args[1] === 'inspect') return ok('sha256:abcd1234efgh\n')
      if (args[0] === 'inspect' && args[1] === '--type' && args[2] === 'container') {
        return fail('Error: No such container: mingyi-sandbox')
      }
      return fail('unexpected call')
    }

    const diag = await detectSandboxEnvironment({ runner })
    expect(diag.imageExists).toBe(true)
    expect(diag.containerState).toBe('missing')
    expect(diag.level).toBe('need_run_container')
    expect(diag.suggestion).toContain('container:run')
  })

  it('容器已存在但处于停止状态时返回 need_start_container', async () => {
    const runner: SandboxDockerRunner = async (args) => {
      if (args[0] === '--version') return ok('Docker version 25.0.3\n')
      if (args[0] === 'info') return ok('25.0.3\n')
      if (args[0] === 'image' && args[1] === 'inspect') return ok('sha256:abcd1234efgh\n')
      if (args[0] === 'inspect' && args[1] === '--type' && args[2] === 'container') {
        return ok('exited\n1234567890abcdef\n')
      }
      return fail('unexpected call')
    }

    const diag = await detectSandboxEnvironment({ runner })
    expect(diag.imageExists).toBe(true)
    expect(diag.containerState).toBe('stopped')
    expect(diag.containerId).toBe('1234567890ab')
    expect(diag.level).toBe('need_start_container')
    expect(diag.suggestion).toContain('docker start')
  })

  it('沙箱容器正在运行且环境就绪时返回 ready', async () => {
    const runner: SandboxDockerRunner = async (args) => {
      if (args[0] === '--version') return ok('Docker version 25.0.3\n')
      if (args[0] === 'info') return ok('25.0.3\n')
      if (args[0] === 'image' && args[1] === 'inspect') return ok('sha256:abcd1234efgh\n')
      if (args[0] === 'inspect' && args[1] === '--type' && args[2] === 'container') {
        return ok('running\nfedcba0987654321\n')
      }
      return fail('unexpected call')
    }

    const diag = await detectSandboxEnvironment({ runner })
    expect(diag.level).toBe('ready')
    expect(diag.containerState).toBe('running')
    expect(diag.containerId).toBe('fedcba098765')
    expect(diag.summary).toContain('就绪')
  })

  it('formatDetectSandboxReport 格式化文本报告包含关键信息', () => {
    const report = formatDetectSandboxReport({
      dockerInstalled: true,
      dockerVersion: '25.0.3',
      daemonRunning: true,
      imageExists: true,
      imageName: 'mingyi-sandbox:latest',
      containerState: 'running',
      containerName: 'mingyi-sandbox',
      containerId: 'fedcba098765',
      level: 'ready',
      summary: '沙箱环境已就绪',
      suggestion: '可直接执行渗透任务'
    })

    expect(report).toContain('Mingyi Kali Sandbox 状态检测报告')
    expect(report).toContain('Docker CLI: 已安装 (25.0.3)')
    expect(report).toContain('Docker 服务: 正在运行')
    expect(report).toContain('沙箱容器 (mingyi-sandbox): running [fedcba098765]')
    expect(report).toContain('诊断结论: [ready] 沙箱环境已就绪')
  })

  it('createDetectSandboxTool 符合 RuntimePentestTool 只读契约并在 ready 时返回 exitCode 0', async () => {
    const runner: SandboxDockerRunner = async (args) => {
      if (args[0] === '--version') return ok('Docker version 25.0.3\n')
      if (args[0] === 'info') return ok('25.0.3\n')
      if (args[0] === 'image' && args[1] === 'inspect') return ok('sha256:abcd1234efgh\n')
      if (args[0] === 'inspect') return ok('running\n1122334455667788\n')
      return fail()
    }

    const tool = createDetectSandboxTool({ runner })
    expect(tool.name).toBe('detect_sandbox_environment')
    expect(tool.kind).toBe('read-only')

    const res = await tool.execute(
      { toolName: 'detect_sandbox_environment', targetRef: 'sandbox', arguments: {} },
      {
        workspacePath: process.cwd(),
        scope: ['*'],
        allowDestructive: false,
        signal: new AbortController().signal
      }
    )

    expect(res.exitCode).toBe(0)
    expect(res.output).toContain('Mingyi Kali Sandbox 状态检测报告')
  })

  it('DEFAULT_PENTEST_TOOLS 包含 detect_sandbox_environment', () => {
    const names = DEFAULT_PENTEST_TOOLS.map((t) => t.name)
    expect(names).toContain('detect_sandbox_environment')
  })

  it('createSecurityMastraTools 导出了 detect_sandbox_environment 工具', async () => {
    const tools = createSecurityMastraTools()
    expect(tools).toHaveProperty('detect_sandbox_environment')
    const tool = (tools as any).detect_sandbox_environment
    expect(tool.id).toBe('detect_sandbox_environment')
    expect(typeof tool.execute).toBe('function')
  })
})
