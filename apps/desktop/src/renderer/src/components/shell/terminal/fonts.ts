import type { ResttyFontInput } from 'restty'
import ibmPlexMono400 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2?inline'
import ibmPlexMono700 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-700-normal.woff2?inline'
import notoEmoji from '@fontsource/noto-emoji/files/noto-emoji-emoji-400-normal.woff2?inline'
import notoSansSc from '@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff2?inline'

interface LocalFontData {
  family: string
  fullName: string
  postscriptName: string
}

function decodeDataUri(uri: string): ArrayBuffer {
  const binary = atob(uri.slice(uri.indexOf(',') + 1))
  return Uint8Array.from(binary, (char) => char.codePointAt(0) ?? 0).buffer
}

function pickLocalFamily(
  fonts: readonly LocalFontData[],
  matchers: readonly string[]
): string | null {
  for (const matcher of matchers) {
    const hit = fonts.find((font) =>
      `${font.family} ${font.fullName} ${font.postscriptName}`.toLowerCase().includes(matcher)
    )
    if (hit) return hit.family
  }
  return null
}

async function queryLocalFontsSafe(): Promise<readonly LocalFontData[]> {
  const query = (
    window as typeof window & {
      queryLocalFonts?: () => Promise<LocalFontData[]>
    }
  ).queryLocalFonts
  if (!query) return []
  try {
    return await query.call(window)
  } catch {
    return []
  }
}

const CJK_FAMILIES = [
  'hiragino sans gb',
  'heiti sc',
  'microsoft yahei',
  'noto sans cjk',
  'source han sans',
  'arial unicode'
]

const MONO_FAMILIES = ['sf mono', 'menlo', 'monaco', 'consolas', 'dejavu sans mono']

const terminalFontsCache = new Map<string, Promise<ResttyFontInput[]>>()

async function buildTerminalFonts(preferredFamily: string): Promise<ResttyFontInput[]> {
  const local = await queryLocalFontsSafe()
  if (local.length === 0) terminalFontsCache.delete(preferredFamily)
  const cjk = pickLocalFamily(local, CJK_FAMILIES)
  const mono = pickLocalFamily(local, MONO_FAMILIES)
  const trimmed = preferredFamily.trim()
  return [
    ...(trimmed === '' || trimmed === 'default'
      ? []
      : [{ family: trimmed, local: 'prefer' as const }]),
    { data: decodeDataUri(ibmPlexMono400), name: 'IBM Plex Mono', weight: 400 },
    { data: decodeDataUri(ibmPlexMono700), name: 'IBM Plex Mono Bold', weight: 700 },
    // CJK must follow the Latin primary face so ASCII retains terminal metrics while Han glyphs
    // are resolved from a real system font. On macOS this normally selects Hiragino Sans GB.
    ...(cjk ? [{ family: cjk }] : []),
    // Keep a bundled fallback for packaged/headless Electron sessions where Local Font Access is
    // unavailable or denied. This subset contains Simplified Chinese and common punctuation.
    { data: decodeDataUri(notoSansSc), name: 'Noto Sans SC', weight: 400 },
    ...(mono ? [{ family: mono }] : []),
    { data: decodeDataUri(notoEmoji), name: 'Noto Emoji' }
  ]
}

export function resolveTerminalFonts(preferredFamily = 'default'): Promise<ResttyFontInput[]> {
  let fonts = terminalFontsCache.get(preferredFamily)
  if (!fonts) {
    fonts = buildTerminalFonts(preferredFamily)
    terminalFontsCache.set(preferredFamily, fonts)
  }
  return fonts
}
