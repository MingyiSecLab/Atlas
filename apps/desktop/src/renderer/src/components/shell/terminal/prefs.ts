import type { ResttyBuiltinThemeName } from 'restty'

export const DEFAULT_TERMINAL_FONT_FAMILY = ''
export const DEFAULT_TERMINAL_FONT_SIZE = 13

const TERMINAL_NAMED_SCHEMES = [
  'GitHub Dark Default',
  'GitHub Light Default',
  'Dracula',
  'Nord',
  'Catppuccin Mocha',
  'Catppuccin Latte',
  'One Half Dark',
  'One Half Light',
  'Gruvbox Dark'
] as const satisfies readonly ResttyBuiltinThemeName[]

export const TERMINAL_COLOR_SCHEMES = ['auto', ...TERMINAL_NAMED_SCHEMES] as const
export type TerminalColorScheme = (typeof TERMINAL_COLOR_SCHEMES)[number]
export const DEFAULT_TERMINAL_COLOR_SCHEME: TerminalColorScheme = 'auto'
