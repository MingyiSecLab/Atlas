import React from 'react'

export interface IconProps {
  size?: number
  color?: string
  style?: React.CSSProperties
}

// 侧边栏折叠图标 (面板 + 左箭号) - 参考 Wanta / Lucide PanelLeftClose
export const PanelLeftCloseIcon: React.FC<IconProps> = ({
  size = 16,
  color = 'currentColor',
  style
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={style}
  >
    <rect x="2" y="2" width="12" height="12" rx="2" stroke={color} strokeWidth="1.3" />
    <path d="M6 2V14" stroke={color} strokeWidth="1.3" />
    <path
      d="M10.5 5.5L8 8L10.5 10.5"
      stroke={color}
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

// 侧边栏展开图标 (面板 + 右箭号) - 参考 Wanta / Lucide PanelLeftOpen
export const PanelLeftOpenIcon: React.FC<IconProps> = ({
  size = 16,
  color = 'currentColor',
  style
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={style}
  >
    <rect x="2" y="2" width="12" height="12" rx="2" stroke={color} strokeWidth="1.3" />
    <path d="M6 2V14" stroke={color} strokeWidth="1.3" />
    <path
      d="M9 5.5L11.5 8L9 10.5"
      stroke={color}
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

// 侧边栏通用面板图标 [||]
export const SidebarToggleIcon: React.FC<IconProps> = ({
  size = 16,
  color = 'currentColor',
  style
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={style}
  >
    <rect x="2" y="2" width="12" height="12" rx="2.5" stroke={color} strokeWidth="1.3" />
    <path d="M6 2.5V13.5" stroke={color} strokeWidth="1.3" />
  </svg>
)

// 顶部新建任务按钮 [+]
export const NewTaskCircleIcon: React.FC<IconProps> = ({
  size = 16,
  color = 'currentColor',
  style
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={style}
  >
    <circle cx="8" cy="8" r="6" stroke={color} strokeWidth="1.3" />
    <path d="M8 5V11M5 8H11" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
  </svg>
)

// 代码开发 Mode Icon <>
export const CodeDevIcon: React.FC<IconProps> = ({ size = 15, color = 'currentColor', style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={style}
  >
    <path
      d="M5.5 4.5L2 8L5.5 11.5M10.5 4.5L14 8L10.5 11.5"
      stroke={color}
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

// 日常办公 Coffee ☕
export const CoffeeCupIcon: React.FC<IconProps> = ({
  size = 15,
  color = 'currentColor',
  style
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={style}
  >
    <path
      d="M3 5H11V10C11 11.5 9.8 12.5 8.3 12.5H5.7C4.2 12.5 3 11.5 3 10V5Z"
      stroke={color}
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
    <path
      d="M11 6.5H12.5C13.3 6.5 14 7.2 14 8C14 8.8 13.3 9.5 12.5 9.5H11"
      stroke={color}
      strokeWidth="1.3"
    />
    <path d="M2 13.5H13" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
  </svg>
)

// 设计创意 Palette 🎨
export const DesignPaletteIcon: React.FC<IconProps> = ({
  size = 15,
  color = 'currentColor',
  style
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={style}
  >
    <path
      d="M8 2.5C4.7 2.5 2 5.2 2 8.5C2 11.8 4.7 13.5 6.5 13.5C7.2 13.5 7.8 13 7.8 12.2C7.8 11.8 7.6 11.4 7.4 11.1C7.2 10.8 7 10.4 7 10C7 9.2 7.7 8.5 8.5 8.5H10C11.9 8.5 13.5 6.9 13.5 5C13.5 3.6 11 2.5 8 2.5Z"
      stroke={color}
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
    <circle cx="4.5" cy="6" r="0.8" fill={color} />
    <circle cx="7" cy="4.5" r="0.8" fill={color} />
    <circle cx="9.5" cy="5" r="0.8" fill={color} />
    <circle cx="11.5" cy="7" r="0.8" fill={color} />
  </svg>
)

// 做任务赢积分好礼 🎁
export const GiftBoxIcon: React.FC<IconProps> = ({ size = 15, color = 'currentColor', style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={style}
  >
    <path d="M2.5 6.5H13.5V14H2.5V6.5Z" stroke={color} strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M1.5 4H14.5V6.5H1.5V4Z" stroke={color} strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M8 4V14" stroke={color} strokeWidth="1.3" />
    <path d="M8 4C8 4 6.5 2 5 2C3.8 2 3 2.8 3 4C3 4 5.5 4 8 4Z" stroke={color} strokeWidth="1.3" />
    <path
      d="M8 4C8 4 9.5 2 11 2C12.2 2 13 2.8 13 4C13 4 10.5 4 8 4Z"
      stroke={color}
      strokeWidth="1.3"
    />
  </svg>
)

// 金融服务 Briefcase 💼
export const FinancialBriefcaseIcon: React.FC<IconProps> = ({
  size = 15,
  color = 'currentColor',
  style
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={style}
  >
    <rect x="2" y="5" width="12" height="9" rx="1.5" stroke={color} strokeWidth="1.3" />
    <path
      d="M5.5 5V3.5C5.5 2.7 6.2 2 7 2H9C9.8 2 10.5 2.7 10.5 3.5V5"
      stroke={color}
      strokeWidth="1.3"
    />
    <path d="M2 8.5H14" stroke={color} strokeWidth="1.3" />
  </svg>
)

// 数据分析及可视化 📈
export const DataTrendingIcon: React.FC<IconProps> = ({
  size = 15,
  color = 'currentColor',
  style
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={style}
  >
    <path
      d="M2 12.5L6 8.5L9 11.5L14 5.5"
      stroke={color}
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M10.5 5.5H14V9"
      stroke={color}
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

// 个人工作台 🔲
export const WorkspaceGridIcon: React.FC<IconProps> = ({
  size = 15,
  color = 'currentColor',
  style
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={style}
  >
    <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" stroke={color} strokeWidth="1.3" />
    <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" stroke={color} strokeWidth="1.3" />
    <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" stroke={color} strokeWidth="1.3" />
    <rect x="9" y="9" width="4.5" height="4.5" rx="1" stroke={color} strokeWidth="1.3" />
  </svg>
)

// 深度研究 🔍
export const ResearchSearchIcon: React.FC<IconProps> = ({
  size = 15,
  color = 'currentColor',
  style
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={style}
  >
    <circle cx="7" cy="7" r="4.5" stroke={color} strokeWidth="1.3" />
    <path d="M10.5 10.5L14 14" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
  </svg>
)

// 文档处理 📄
export const DocumentTextIcon: React.FC<IconProps> = ({
  size = 15,
  color = 'currentColor',
  style
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={style}
  >
    <path
      d="M3.5 2.5H10L13 5.5V13.5H3.5V2.5Z"
      stroke={color}
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
    <path d="M9.5 2.5V6H13" stroke={color} strokeWidth="1.3" />
    <path d="M5.5 8.5H10.5M5.5 11H8.5" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
  </svg>
)
