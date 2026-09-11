/**
 * 项目空间：一个项目 = 绑定本机一个目录的命名空间。
 *
 * 项目本身只做登记（id/name/rootPath/时间戳）；在项目下开会话时，
 * session 的 workspacePath 指向 rootPath，Mastra Workspace 由 code-sdk
 * 的默认动态工厂按项目路径创建并复用，本模块不持有 Workspace 实例。
 */

export interface RuntimeProject {
  id: string
  /** 展示名称，缺省为 rootPath 的 basename */
  name: string
  /** 项目根目录（绝对路径） */
  rootPath: string
  createdAt: string
  lastOpenedAt?: string
}

export interface RuntimeProjectCreateInput {
  /** 项目根目录；必须是已存在的绝对路径 */
  rootPath: string
  /** 展示名称；缺省取 rootPath 的 basename */
  name?: string
}

/**
 * 项目空间登记服务。只管理登记信息，不创建/删除磁盘目录。
 */
export interface RuntimeProjectService {
  list(): Promise<RuntimeProject[]>
  create(input: RuntimeProjectCreateInput): Promise<RuntimeProject>
  rename(id: string, name: string): Promise<RuntimeProject>
  /** 仅移除登记，不影响磁盘目录 */
  remove(id: string): Promise<void>
  /** 打开项目时更新 lastOpenedAt */
  touch(id: string): Promise<void>
}

/**
 * 项目登记的持久化接口。实现负责落盘格式与容错；
 * 单条记录损坏不应让整个列表加载失败。
 */
export interface RuntimeProjectStore {
  load(): Promise<RuntimeProject[]>
  save(projects: RuntimeProject[]): Promise<void>
}
