import { LibSQLVector } from '@mastra/libsql'

/**
 * 构造本地向量库实例（LibSQL），经 MastraCodeConfig.vector 注入 Controller。
 *
 * code-sdk 默认在 getAppDataDir()/mastra-vectors.db 创建向量库且不提供路径覆盖；
 * `config.vector` 是官方逃生口（注入实例时跳过默认创建），不属于重复实现。
 * 版本必须与 @mastra/code-sdk 内部锁定版本保持一致（1.22.2），
 * 避免出现双份 LibSQLVector 类型漂移。
 */
export function createRuntimeVectorStore(options: { url: string }): LibSQLVector {
  return new LibSQLVector({ id: 'atlas-vectors', url: options.url })
}
