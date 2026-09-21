import { tmpdir } from 'node:os'
import * as path from 'node:path'

let environmentSequence = 0

export function runtimeTestEnv(suite: string): NodeJS.ProcessEnv {
  environmentSequence += 1
  const id = `${suite}-${process.pid}-${Date.now()}-${environmentSequence}`
  const workspacePath = path.resolve(__dirname, '../..')
  return {
    ...process.env,
    NODE_ENV: 'production',
    MINGYI_WORKSPACE_PATH: workspacePath,
    MINGYI_PENTEST_DATA_DIR: path.join(tmpdir(), `${id}-pentest-data`),
    // 项目空间登记是全局注册表；每个 suite 用独立目录避免相互污染
    MINGYI_PROJECTS_DATA_DIR: path.join(tmpdir(), `${id}-projects-data`),
    MASTRA_APP_DATA_DIR: path.join(tmpdir(), `${id}-app-data`),
    MASTRA_DB_URL: `file:${path.join(tmpdir(), `${id}.db`)}`,
    MASTRA_OBSERVABILITY_DB_PATH: path.join(tmpdir(), `${id}-observability.db`),
    // 更新检查默认联网打 GitHub API：e2e 一律关停，保证断言不依赖外网与配额
    MINGYI_DISABLE_UPDATE_CHECK: '1'
  }
}
