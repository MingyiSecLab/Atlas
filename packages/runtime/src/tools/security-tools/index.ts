/**
 * 安全工具域：面向授权安全评估的 HTTP 交互类工具。
 *
 * 成员实现 pentest 的 RuntimePentestTool 契约，经 DEFAULT_PENTEST_TOOLS
 * 暴露给 pentest 域的 executor 与安全闸调度；新增工具在本目录追加文件后
 * 于本入口汇总导出。
 */
export { createExtractJsEndpointsTool } from './extract-js-endpoints.js'
export { createHttpRequestTool } from './http-request.js'
