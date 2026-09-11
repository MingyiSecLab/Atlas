import type { LucideIcon } from 'lucide-react'
import { Compass, FolderCode, ShieldCheck, SquareTerminal } from 'lucide-react'

export const RIGHT_PANEL_SECTIONS = ['terminal', 'browser', 'files', 'pentest'] as const

export type RightPanelSection = (typeof RIGHT_PANEL_SECTIONS)[number]

export interface RightPanelSectionDefinition {
  id: RightPanelSection
  label: string
  icon: LucideIcon
}

export const RIGHT_PANEL_SECTION_DEFINITIONS: RightPanelSectionDefinition[] = [
  { id: 'terminal', label: '终端', icon: SquareTerminal },
  { id: 'browser', label: '浏览器', icon: Compass },
  { id: 'files', label: '文件', icon: FolderCode },
  { id: 'pentest', label: '渗透', icon: ShieldCheck }
]

export function isRightPanelSection(value: string | null): value is RightPanelSection {
  return RIGHT_PANEL_SECTIONS.some((section) => section === value)
}
