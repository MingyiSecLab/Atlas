import React from 'react'
import { Sparkles } from 'lucide-react'

export interface PromptSuggestionItem {
  id: string
  label: string
  prompt: string
  icon?: string
}

export interface PromptSuggestionsProps {
  mode?: string
  onSelect: (prompt: string) => void
  disabled?: boolean
}

const PENTEST_SUGGESTIONS: PromptSuggestionItem[] = [
  {
    id: 'pentest-recon',
    label: '信息收集与端口服务探测',
    prompt: '对当前目标进行基础信息收集，探测开放端口与运行的服务版本',
    icon: '🔍'
  },
  {
    id: 'pentest-vuln',
    label: '已知服务漏洞与弱配置排查',
    prompt: '针对已探测到的服务与端口，排查是否存在已知漏洞或默认弱口令配置',
    icon: '🛡️'
  },
  {
    id: 'pentest-evidence',
    label: '分析利用证据并给出验证方案',
    prompt: '结合当前收集到的证据链，评估可利用性并生成无损验证方案',
    icon: '⚡'
  },
  {
    id: 'pentest-report',
    label: '汇总安全评估结果与修复建议',
    prompt: '汇总当前安全测试的所有发现，按风险等级给出修复和加固建议',
    icon: '📋'
  }
]

const AUDIT_SUGGESTIONS: PromptSuggestionItem[] = [
  {
    id: 'audit-auth',
    label: '鉴权与权限校验逻辑审计',
    prompt: '审计当前代码中的身份认证、权限校验与越权访问隐患',
    icon: '🔐'
  },
  {
    id: 'audit-injection',
    label: 'SQL / 命令注入风险排查',
    prompt: '检查外部输入处理逻辑，排查 SQL 注入、命令注入及路径遍历风险',
    icon: '🔎'
  },
  {
    id: 'audit-deps',
    label: '依赖组件与供应链漏洞分析',
    prompt: '检查项目 package.json 及依赖版本是否存在已公开 CVE 漏洞',
    icon: '📦'
  }
]

const GENERAL_SUGGESTIONS: PromptSuggestionItem[] = [
  {
    id: 'gen-tools',
    label: '查看当前环境工具集与权限',
    prompt: '请列出当前会话可调用的安全工具清单及各自的功能说明',
    icon: '🛠️'
  },
  {
    id: 'gen-plan',
    label: '制定任务执行计划',
    prompt: '请帮我梳理当前评估任务的执行思路并列出详细步骤',
    icon: '📝'
  }
]

export const PromptSuggestions: React.FC<PromptSuggestionsProps> = ({
  mode = 'pentest',
  onSelect,
  disabled = false
}) => {
  const normalizedMode = mode.toLowerCase()
  const items =
    normalizedMode === 'pentest'
      ? PENTEST_SUGGESTIONS
      : normalizedMode === 'audit'
        ? AUDIT_SUGGESTIONS
        : GENERAL_SUGGESTIONS

  return (
    <div className="aui-suggestions-container" role="region" aria-label="快捷提示词建议">
      <div className="aui-suggestions-header">
        <Sparkles size={11} className="aui-suggestions-icon" />
        <span className="aui-suggestions-title">快速指引</span>
      </div>
      <div className="aui-suggestions-grid">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="aui-suggestion-chip"
            disabled={disabled}
            onClick={() => onSelect(item.prompt)}
            title={item.prompt}
          >
            {item.icon && <span className="aui-suggestion-emoji">{item.icon}</span>}
            <span className="aui-suggestion-label">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
