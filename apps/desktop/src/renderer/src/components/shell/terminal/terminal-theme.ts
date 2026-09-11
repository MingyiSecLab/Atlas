import type { Restty } from 'restty'
import { getBuiltinTheme } from 'restty'
import type { TerminalColorScheme } from './prefs'

export function applyTerminalTheme(
  terminal: Restty,
  frame?: HTMLElement | null,
  colorScheme: TerminalColorScheme = 'auto'
): void {
  const name =
    colorScheme === 'auto'
      ? document.documentElement.classList.contains('dark')
        ? 'Dark+'
        : 'GitHub Light Default'
      : colorScheme
  const theme = getBuiltinTheme(name)
  if (!theme) return
  terminal.applyTheme(theme)
  const background = theme.colors.background
  if (frame && background) {
    frame.style.backgroundColor = `rgb(${background.r} ${background.g} ${background.b})`
  }
}
