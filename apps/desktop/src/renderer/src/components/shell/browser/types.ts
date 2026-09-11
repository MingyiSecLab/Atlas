export interface BrowserFindState {
  query: string
  /** 1-based active ordinal / total matches; null before the first result arrives. */
  matches: { active: number; total: number } | null
}

export interface WebviewNavState {
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  failure: string | null
  guestReady: boolean
}

export interface BrowserTab {
  id: string
  title: string | null
  url: string | null
}
