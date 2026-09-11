import type { RuntimeExpertDefinition, RuntimeExpertSaveInput, RuntimeExpertScanResult } from './types.js'
import { deleteExpertFile, expertsDirectory, scanExpertModes, writeExpertFile } from './scanner.js'

export interface RuntimeExpertService {
  /** 重新扫描专家目录（扫描很廉价，每次调用都是最新磁盘状态）。 */
  scan(): RuntimeExpertScanResult
  /** 当前专家列表（等价于 scan().experts）。 */
  list(): readonly RuntimeExpertDefinition[]
  /**
   * 写入/覆盖一个专家文件。返回 requiresRestart: true——mode 注册发生在
   * Controller 构造时，新专家需要工作区重连或应用重启后才能被会话激活。
   */
  save(input: RuntimeExpertSaveInput): { path: string; slug: string; requiresRestart: boolean }
  /** 删除专家文件（接受 `expert:<slug>` 或裸 slug）。 */
  delete(slug: string): { removed: boolean; requiresRestart: boolean }
  /** 专家目录绝对路径。 */
  directory(): string
}

export function createRuntimeExpertService(options: {
  workspacePath: string
  configDirName?: string
}): RuntimeExpertService {
  return {
    scan: () => scanExpertModes(options),
    list: () => scanExpertModes(options).experts,
    save: (input) => writeExpertFile(options, input),
    delete: (slug) => deleteExpertFile(options, slug),
    directory: () => expertsDirectory(options.workspacePath, options.configDirName)
  }
}
