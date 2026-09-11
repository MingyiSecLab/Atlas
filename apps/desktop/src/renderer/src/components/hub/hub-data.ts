import type { RuntimeExpertDefinition, RuntimeExpertSaveInput } from '@mingyi/runtime'
import type { BuiltinConnector, ExpertItem, SkillItem, ToolItem } from './hub-types'
import websiteSecurityMonitorLogo from '../../assets/website-security-monitor.png'

export const SYSTEM_BUILTIN_EXPERTS: ExpertItem[] = [
  {
    id: 'builtin_fullstack_architect',
    name: '全栈架构专家',
    title: '高级全栈架构师',
    iconName: 'Layers',
    description: '专注于复杂工程架构设计、模块分层、技术选型评估与高扩展性系统设计。',
    systemPrompt:
      '你是一名拥有10年以上大型项目架构经验的全栈架构师。你的目标是帮助用户评估系统架构、编写清晰的设计文档、规划接口契约，并遵循 Clean Architecture 与单一职责原则。',
    tags: ['架构设计', '技术选型', '模块分层'],
    isCustom: false,
    suggestedPrompts: [
      '帮我评估这个模块的目录结构与职责边界划分',
      '如何设计一个支持多租户与插件扩展的数据层架构？',
      '为这个复杂的异步业务流程编写一份技术设计方案'
    ]
  },
  {
    id: 'builtin_code_reviewer',
    name: '代码审查专家',
    title: '代码重构与审查员',
    iconName: 'Code2',
    description: '严格把控代码质量、类型安全、命名规范、边界防御与潜在 Bug 排查。',
    systemPrompt:
      '你是一名资深代码审查员，以严谨的技术标准审查代码。你需要指出潜在的逻辑漏洞、性能隐患、类型不安全以及不符合规范的命名，并给出重构后的标准代码示例。',
    tags: ['代码重构', 'TypeScript', '质量审查'],
    isCustom: false,
    suggestedPrompts: [
      '审查这段 TypeScript 代码并提供重构建议',
      '检查这个 React Hook 是否存在闭包陷阱或内存泄漏风险',
      '优化这段数据处理逻辑以提升可读性与执行效率'
    ]
  },
  {
    id: 'builtin_test_qa',
    name: '测试与质量保证',
    title: '测试与质量保证顾问',
    iconName: 'Terminal',
    description: '专业设计单元测试、集成测试、Mock 方案以及全方位的边界测试用例。',
    systemPrompt:
      '你是一名测试与质量保证专家，精通 Vitest、Playwright、Jest 等测试框架。你擅长分析代码逻辑中的边界条件，并编写高覆盖率、低耦合的单元测试与端到端测试用例。',
    tags: ['单元测试', 'Vitest', '用例设计'],
    isCustom: false,
    suggestedPrompts: [
      '为这个核心业务函数生成覆盖所有边界情况的 Vitest 单元测试',
      '设计一份面向 Electron 桌面端主进程 IPC 的测试用例方案'
    ]
  },
  {
    id: 'builtin_tech_writer',
    name: '技术文档专家',
    title: '技术文档与知识架构师',
    iconName: 'FileText',
    description: '将复杂的技术实现提炼为结构清晰、表达精准的 README、API 文档与架构白皮书。',
    systemPrompt:
      '你是一名专业的技术写作与知识架构师。你擅长用严谨且平实的语言编写清晰的技术文档、README、快速入门指南与 API 参考手册，并善于使用 Markdown、Mermaid 图表进行可视化呈现。',
    tags: ['技术文档', 'API参考', '架构图表'],
    isCustom: false,
    suggestedPrompts: [
      '为这个开源工具包编写一份专业、优雅的 README.md',
      '将这段复杂的设计逻辑梳理为结构化的架构文档'
    ]
  },
  {
    id: 'builtin_security_auditor',
    name: '安全合规审计师',
    title: '安全与合规审计专家',
    iconName: 'ShieldCheck',
    description: '排查代码中的安全漏洞、注入风险、鉴权缺陷与敏感信息泄露隐患。',
    systemPrompt:
      '你是一名应用安全审计专家。你擅长审查代码中的安全缺陷（如 XSS、CSRF、SQL/命令注入、不安全的序列化、明文密钥存储等），并提供符合安全标准的修复代码。',
    tags: ['安全审计', '漏洞修复', '合规防御'],
    isCustom: false,
    suggestedPrompts: [
      '检查这段 IPC 通信与命令行执行代码是否存在注入安全风险',
      '为用户认证与令牌存储提供安全的加密实践方案'
    ]
  }
]

export const SYSTEM_SKILLS: SkillItem[] = [
  {
    id: 'skill_git_pro',
    name: 'Git 版本控制工具包',
    identifier: 'mingyi/git-pro',
    author: '系统内置',
    iconName: 'GitBranch',
    description: '自动化执行复杂的 Git 操作，包括交互式 Rebase、冲突智能分析与语义化提交。',
    categories: ['代码工程', '效率工具'],
    tags: ['版本控制', 'Git', '自动化'],
    isBuiltin: true,
    isEnabled: true,
    toolsCount: 5,
    tools: ['git_smart_commit', 'git_conflict_resolver', 'git_branch_cleaner']
  },
  {
    id: 'skill_web_search',
    name: '网络检索与提炼',
    identifier: 'mingyi/web-search',
    author: '系统内置',
    iconName: 'Globe',
    description: '实时检索技术文档、新闻资讯与开源库更新，自动清洗并提炼关键摘要。',
    categories: ['搜索检索', '效率工具'],
    tags: ['实时搜索', '网页抓取', '信息提炼'],
    isBuiltin: true,
    isEnabled: true,
    toolsCount: 3,
    tools: ['search_web', 'read_url_content']
  },
  {
    id: 'skill_doc_parser',
    name: '文档多模态解析器',
    identifier: 'mingyi/doc-parser',
    author: '系统内置',
    iconName: 'FileSearch',
    description: '支持 PDF、DOCX、Markdown、JSON 等多种格式深度解析与结构化提取。',
    categories: ['文档处理', '数据分析'],
    tags: ['PDF解析', '文档转换', '结构化提取'],
    isBuiltin: true,
    isEnabled: true,
    toolsCount: 4,
    tools: ['parse_pdf', 'convert_markdown', 'extract_tables']
  },
  {
    id: 'skill_task_scheduler',
    name: '任务调度与定时器',
    identifier: 'mingyi/task-scheduler',
    author: '系统内置',
    iconName: 'Clock',
    description: '支持自然语言设定一次性提醒或周期性 Cron 自动化任务调度与健康检查。',
    categories: ['自动化', '效率工具'],
    tags: ['定时任务', 'Cron', '健康检查'],
    isBuiltin: true,
    isEnabled: true,
    toolsCount: 2,
    tools: ['schedule_timer', 'cron_job']
  }
]

export const BUILTIN_CONNECTORS: BuiltinConnector[] = [
  {
    id: 'connector_website_security_monitor',
    name: '网站安全监测',
    identifier: 'mingyi/website-security-monitor',
    author: '系统内置',
    iconName: 'ShieldCheck',
    logo: websiteSecurityMonitorLogo,
    description:
      '持续检查网站的 HTTPS、TLS 证书、安全响应头、DNS 配置与可用性，及时发现高风险配置变化。',
    transport: '内置连接器',
    status: {
      connected: true,
      toolCount: 5,
      toolNames: [
        'website_security_scan',
        'tls_certificate_check',
        'security_headers_check',
        'dns_health_check',
        'uptime_check'
      ]
    },
    tags: ['HTTPS', 'TLS', '安全响应头', 'DNS', '可用性'],
    categories: ['安全监测', '网站运维'],
    tools: [
      'website_security_scan',
      'tls_certificate_check',
      'security_headers_check',
      'dns_health_check',
      'uptime_check'
    ]
  }
]

export const SYSTEM_TOOLS: ToolItem[] = [
  {
    id: 'tool_bash_execute',
    name: '终端指令执行器',
    identifier: 'bash_execute',
    author: '系统核心',
    iconName: 'Terminal',
    description: '在受控沙箱或本地工作空间执行 Shell/Bash 脚本与系统命令，实时捕获输出流与退出码。',
    category: '系统执行',
    tags: ['Shell', '命令执行', '工作空间'],
    isBuiltin: true,
    isEnabled: true,
    parametersCount: 3,
    usageExample: 'bash_execute({ command: "npm test", timeout: 30000 })'
  },
  {
    id: 'tool_grep_search',
    name: '代码正则检索 (ripgrep)',
    identifier: 'grep_search',
    author: '系统核心',
    iconName: 'Search',
    description: '基于高速 ripgrep 引擎在项目中对文件路径或文本内容进行精准正则匹配与快速过滤。',
    category: '代码智能',
    tags: ['代码检索', '正则表达式', 'ripgrep'],
    isBuiltin: true,
    isEnabled: true,
    parametersCount: 4,
    usageExample: 'grep_search({ query: "interface HubTab", path: "src" })'
  },
  {
    id: 'tool_view_file',
    name: '多模态文件检视器',
    identifier: 'view_file',
    author: '系统核心',
    iconName: 'FileCode',
    description: '高效读取文本、代码切片、配置、PDF 以及多媒体文件的结构化内容与元数据。',
    category: '文件操作',
    tags: ['文件读取', '分片预览', '多模态'],
    isBuiltin: true,
    isEnabled: true,
    parametersCount: 4,
    usageExample: 'view_file({ filePath: "package.json", startLine: 1, endLine: 50 })'
  },
  {
    id: 'tool_replace_content',
    name: '代码精准替换修改',
    identifier: 'replace_file_content',
    author: '系统核心',
    iconName: 'Edit3',
    description: '基于精确行范围与目标块匹配，对源代码进行原子替换与防断裂安全修改。',
    category: '代码智能',
    tags: ['代码修改', '精确重构', '原子替换'],
    isBuiltin: true,
    isEnabled: true,
    parametersCount: 5,
    usageExample:
      'replace_file_content({ filePath: "src/App.tsx", oldContent: "...", newContent: "..." })'
  },
  {
    id: 'tool_web_search',
    name: '实时网络搜索引擎',
    identifier: 'search_web',
    author: '系统核心',
    iconName: 'Globe',
    description: '通过智能搜索引擎检索全球最新开发文档、技术资讯、开源项目与实时信息。',
    category: '网络检索',
    tags: ['网络搜索', '实时资讯', '开源生态'],
    isBuiltin: true,
    isEnabled: true,
    parametersCount: 2,
    usageExample: 'search_web({ query: "Electron 30 release notes" })'
  },
  {
    id: 'tool_browser_subagent',
    name: 'Headless 自动化浏览器',
    identifier: 'browser_subagent',
    author: '系统核心',
    iconName: 'Compass',
    description: '启动独立的浏览器子 Agent，执行页面交互、截图抓取、DOM 结构分析与前端 E2E 验证。',
    category: '网络检索',
    tags: ['浏览器', '自动化', '页面抓取'],
    isBuiltin: true,
    isEnabled: true,
    parametersCount: 4,
    usageExample: 'browser_subagent({ url: "http://localhost:5173", action: "screenshot" })'
  },
  {
    id: 'tool_schedule_timer',
    name: '任务调度与定时器',
    identifier: 'schedule_timer',
    author: '系统核心',
    iconName: 'Clock',
    description: '注册单次延时回调或周期性 Cron 调度任务，用于自动化轮询与状态监控。',
    category: '自动化',
    tags: ['定时任务', 'Cron', '后台调度'],
    isBuiltin: true,
    isEnabled: true,
    parametersCount: 3,
    usageExample: 'schedule_timer({ cron: "*/5 * * * *", prompt: "检查构建状态" })'
  },
  {
    id: 'tool_git_ops',
    name: 'Git 仓库与版本控制',
    identifier: 'git_action',
    author: '系统核心',
    iconName: 'GitBranch',
    description: '智能生成语义化 Commit Message，分析变更 Diff，管理分支切换与合并冲突。',
    category: '版本控制',
    tags: ['Git', '版本控制', 'Diff分析'],
    isBuiltin: true,
    isEnabled: true,
    parametersCount: 3,
    usageExample: 'git_action({ action: "smart_commit", messagePrefix: "feat" })'
  }
]

/**
 * 自定义专家的持久化已迁移到工作区磁盘（`<workspace>/.mastracode/agents/*.md`，
 * 由 @mingyi/runtime 扫描并注册为 modes）；下面只做 RuntimeExpertDefinition
 * 与 UI 的 ExpertItem 之间的映射。
 */

export function expertDefinitionsToItems(
  experts: readonly RuntimeExpertDefinition[]
): ExpertItem[] {
  return experts.map((expert) => ({
    id: expert.id,
    name: expert.name,
    title: expert.name,
    iconName: expert.icon,
    description: expert.description,
    systemPrompt: expert.instructions,
    tags: expert.tags ?? [],
    isCustom: true,
    modelId: expert.model,
    suggestedPrompts: expert.suggestedPrompts
  }))
}

export function expertItemToSaveInput(item: ExpertItem): RuntimeExpertSaveInput {
  return {
    ...(item.id.startsWith('expert:') ? { slug: item.id.slice('expert:'.length) } : {}),
    name: item.name,
    description: item.description,
    instructions: item.systemPrompt,
    ...(item.modelId ? { model: item.modelId } : {}),
    ...(item.tags?.length ? { tags: item.tags } : {}),
    ...(item.iconName ? { icon: item.iconName } : {}),
    ...(item.suggestedPrompts?.length ? { suggestedPrompts: item.suggestedPrompts } : {})
  }
}
