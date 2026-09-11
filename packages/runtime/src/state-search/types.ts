/**
 * Safe, in-process state-space search primitives.
 *
 * The search engine stores evidence and coordination state only. It does not
 * execute commands, make network requests, or discover targets by itself.
 */

export type RuntimeSearchStatus = 'active' | 'stopped' | 'completed'
export type RuntimeSearchExecutionMode = 'read-only' | 'authorized-active'

export interface RuntimeSearchAuthorization {
  /** Human or service identity responsible for the assessment. */
  principal: string
  /** Explicitly authorized targets or resource identifiers. */
  scope: readonly string[]
  /** Ticket, engagement, or change reference; never a secret. */
  authorizationRef: string
  executionMode?: RuntimeSearchExecutionMode
  expiresAt?: number
}

export interface RuntimeSearchProjectConfig {
  title: string
  origin: string
  goal: string
  authorization: RuntimeSearchAuthorization
  maxFacts?: number
  maxIntents?: number
  maxHints?: number
  intentLeaseMs?: number
  reasonLeaseMs?: number
  maxDescriptionLength?: number
}

export interface RuntimeSearchFact {
  id: string
  description: string
  createdAt: number
  sourceIntentId?: string
}

export interface RuntimeSearchIntent {
  id: string
  from: readonly string[]
  to?: string
  description: string
  creator: string
  worker?: string
  lastHeartbeatAt?: number
  createdAt: number
  concludedAt?: number
}

export interface RuntimeSearchHint {
  id: string
  content: string
  creator: string
  createdAt: number
}

export interface RuntimeSearchLease {
  worker: string
  trigger: string
  startedAt: number
  lastHeartbeatAt: number
}

export interface RuntimeSearchBoardSnapshot {
  title: string
  status: RuntimeSearchStatus
  facts: readonly RuntimeSearchFact[]
  intents: readonly RuntimeSearchIntent[]
  hints: readonly RuntimeSearchHint[]
  reason?: RuntimeSearchLease
  authorization: Omit<RuntimeSearchAuthorization, 'authorizationRef'> & {
    authorizationRef: string
  }
}

export type RuntimeSearchReasonDecision =
  | { type: 'complete'; from: readonly string[]; description: string }
  | {
      type: 'intents'
      intents: readonly { from: readonly string[]; description: string }[]
    }
  | { type: 'noop' }

export type RuntimeSearchExploreDecision =
  { type: 'fact'; description: string } | { type: 'release' }

export interface RuntimeSearchWorkerContext {
  board: RuntimeSearchBoardSnapshot
  intent: RuntimeSearchIntent
  worker: string
  signal: AbortSignal
  executionMode: RuntimeSearchExecutionMode
}

export interface RuntimeSearchReasonContext {
  board: RuntimeSearchBoardSnapshot
  worker: string
  signal: AbortSignal
  executionMode: RuntimeSearchExecutionMode
}

export interface RuntimeSearchRunOptions {
  worker: string
  maxSteps?: number
  concurrency?: number
  signal?: AbortSignal
  reason?: (context: RuntimeSearchReasonContext) => Promise<RuntimeSearchReasonDecision>
  explore: (context: RuntimeSearchWorkerContext) => Promise<RuntimeSearchExploreDecision>
}

export type RuntimeSearchEvent =
  | { type: 'fact_added'; fact: RuntimeSearchFact }
  | { type: 'intent_created'; intent: RuntimeSearchIntent }
  | { type: 'intent_claimed'; intent: RuntimeSearchIntent }
  | { type: 'intent_released'; intent: RuntimeSearchIntent }
  | { type: 'intent_concluded'; intent: RuntimeSearchIntent; fact: RuntimeSearchFact }
  | { type: 'hint_added'; hint: RuntimeSearchHint }
  | { type: 'status_changed'; status: RuntimeSearchStatus }
  | { type: 'search_started'; worker: string }
  | { type: 'search_finished'; worker: string; status: RuntimeSearchStatus; steps: number }

export interface RuntimeStateSearchProject {
  readonly id: string
  readonly config: RuntimeSearchProjectConfig
  snapshot(): RuntimeSearchBoardSnapshot
  addHint(content: string, creator: string): RuntimeSearchHint
  createIntent(input: {
    from: readonly string[]
    description: string
    creator: string
    worker?: string
  }): RuntimeSearchIntent
  claimIntent(intentId: string, worker: string, now?: number): RuntimeSearchIntent
  heartbeatIntent(intentId: string, worker: string, now?: number): RuntimeSearchIntent
  releaseIntent(intentId: string, worker: string): RuntimeSearchIntent
  concludeIntent(
    intentId: string,
    worker: string,
    description: string,
    now?: number
  ): { intent: RuntimeSearchIntent; fact: RuntimeSearchFact }
  claimReason(worker: string, trigger: string, now?: number): RuntimeSearchLease
  heartbeatReason(worker: string, now?: number): RuntimeSearchLease
  releaseReason(worker: string): void
  complete(from: readonly string[], description: string, worker: string): RuntimeSearchIntent
  stop(): void
  resume(): void
  subscribe(listener: (event: RuntimeSearchEvent) => void): () => void
  run(options: RuntimeSearchRunOptions): Promise<RuntimeSearchBoardSnapshot>
}

/** 持久化恢复输入：用已保存的 board 状态重建 project（含原 id 与状态）。 */
export interface RuntimeSearchProjectRestore {
  id: string
  status: RuntimeSearchStatus
  facts: readonly RuntimeSearchFact[]
  intents: readonly RuntimeSearchIntent[]
  hints: readonly RuntimeSearchHint[]
}

export interface RuntimeStateSearchService {
  create(config: RuntimeSearchProjectConfig, restore?: RuntimeSearchProjectRestore): RuntimeStateSearchProject
}
