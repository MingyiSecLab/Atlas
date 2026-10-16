import { MC_TOOLS } from '@mastra/code-sdk/tool-names'

/**
 * audit subagent 的工作区工具白名单。
 *
 * SDK 只对 `allowedWorkspaceTools` 做过滤；`allowedControllerTools` 只能追加
 * controller 工具（subagent / task_* 等），写工作区工具名既不生效也不限制——
 * 缺省 `allowedWorkspaceTools` 时 subagent 会拿到全部工作区工具（含 write_file /
 * execute_command）。参照 code-sdk 内置 explore subagent 的写法。
 */
export const AUDIT_READ_ONLY_TOOLS = [
  MC_TOOLS.VIEW,
  MC_TOOLS.SEARCH_CONTENT,
  MC_TOOLS.FIND_FILES,
  MC_TOOLS.FILE_STAT
] as const

/** report-writer 额外需要写报告目录的能力（不含编辑/删除/命令执行）。 */
export const AUDIT_REPORT_WRITER_TOOLS = [
  ...AUDIT_READ_ONLY_TOOLS,
  MC_TOOLS.WRITE_FILE,
  MC_TOOLS.MKDIR
] as const
