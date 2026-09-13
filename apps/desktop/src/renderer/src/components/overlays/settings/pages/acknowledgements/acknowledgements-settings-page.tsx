import React, { useState } from 'react'
import { Check, Copy, ExternalLink, Heart, Sparkles } from 'lucide-react'
import { SettingsPageLayout } from '../../components/settings-controls'
import m7rickAvatar from '@renderer/assets/contributors/m7rick.png'
import mingyiAvatar from '@renderer/assets/contributors/mingyiseclab.png'

interface ContributorItem {
  id: string
  name: string
  role: string
  badge: string
  avatar?: string
  link?: string
}

const CONTRIBUTORS_LIST: ContributorItem[] = [
  {
    id: 'm7rick',
    name: 'm7rick',
    role: '项目发起人 & 主要开发者',
    badge: 'Founder',
    avatar: m7rickAvatar,
    link: 'https://github.com/m7rick'
  },
  {
    id: 'mingyi-team',
    name: 'Mingyi Team',
    role: '核心研发团队',
    badge: 'Core',
    avatar: mingyiAvatar,
    link: 'https://github.com/MingyiSecLab'
  }
]

export const AcknowledgementsSettingsPage: React.FC = () => {
  const [copied, setCopied] = useState(false)
  const contactEmail = 'starrepository@gmail.com'

  const handleCopyEmail = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(contactEmail)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 忽略剪贴板不可用时的异常
    }
  }

  return (
    <SettingsPageLayout label="致谢">
      <div className="ack-header">
        <div className="ack-header-icon">
          <Heart size={16} className="ack-heart-icon" />
        </div>
        <div className="ack-header-content">
          <h2>致谢与贡献者</h2>
          <p>感谢所有主导与参与 Atlas 开源核心、模型路由、工具生态及安全研究的开发者与伙伴。</p>
        </div>
      </div>

      <section className="settings-section">
        <div className="settings-section-heading">
          <h2>贡献者名单</h2>
          <p>持续记录参与开源项目建设的开发者与团队。</p>
        </div>
        <div className="ack-grid">
          {CONTRIBUTORS_LIST.map((contributor) => (
            <div className="ack-card" key={contributor.id}>
              <div className="ack-avatar">
                {contributor.avatar ? (
                  <img src={contributor.avatar} alt={contributor.name} className="ack-avatar-img" />
                ) : (
                  contributor.name.slice(0, 2).toUpperCase()
                )}
              </div>
              <div className="ack-card-info">
                <div className="ack-name-row">
                  <span className="ack-name">{contributor.name}</span>
                  <span className={`ack-badge is-${contributor.badge.toLowerCase()}`}>
                    {contributor.badge}
                  </span>
                </div>
                <span className="ack-role">{contributor.role}</span>
              </div>
              {contributor.link && (
                <a
                  href={contributor.link}
                  target="_blank"
                  rel="noreferrer"
                  className="ack-link-btn"
                  title={`访问 ${contributor.name} 的 GitHub`}
                >
                  <ExternalLink size={13} />
                </a>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="settings-section ack-join-section">
        <div className="ack-join-card">
          <div className="ack-join-info">
            <div className="ack-join-title">
              <Sparkles size={16} className="ack-sparkle-icon" />
              <span>想要加入贡献者名单？</span>
            </div>
            <p className="ack-join-desc">
              无论是提交安全评估工具集、修复 Issue、完善文档，还是提出创新的 Agent 模式，
              我们都热忱欢迎你的参与！贡献合并后将在此永久展示。
            </p>
          </div>
          <button
            type="button"
            className="ack-copy-btn"
            onClick={handleCopyEmail}
            title="复制团队联系邮箱"
          >
            {copied ? (
              <>
                <Check size={13} className="ack-copied-icon" />
                <span>已复制邮箱</span>
              </>
            ) : (
              <>
                <Copy size={13} />
                <span>联系我们加入</span>
              </>
            )}
          </button>
        </div>
      </section>
    </SettingsPageLayout>
  )
}
