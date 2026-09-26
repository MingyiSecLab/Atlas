import { useCallback, useEffect, useRef, useState } from 'react'
import type { RuntimeAuditRunSnapshot } from '@mingyi/runtime'
import type { DesktopAuditEvent } from '../../../../../shared/runtime-ipc'

export interface AuditConsoleError {
  message: string
}

/**
 * 右侧审计面板的运行时状态：run 列表、当前快照与实时刷新。
 *
 * 数据源是 Runtime 审计服务（audit mode 父编排器经 init_audit_run /
 * update_audit_ledger / record_audit_finding 等工具写入）；事件到达后
 * 重新拉取快照，保持覆盖矩阵与发现列表实时。
 */
export function useAuditRun(): {
  snapshot: RuntimeAuditRunSnapshot | null
  runIds: readonly string[]
  activeRunId: string | null
  loading: boolean
  error: AuditConsoleError | null
  selectRun: (runId: string) => Promise<void>
  dismissError: () => void
} {
  const [snapshot, setSnapshot] = useState<RuntimeAuditRunSnapshot | null>(null)
  const [runIds, setRunIds] = useState<readonly string[]>([])
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<AuditConsoleError | null>(null)
  const activeIdRef = useRef<string | null>(null)

  const toError = (cause: unknown): AuditConsoleError => ({
    message: cause instanceof Error ? cause.message : String(cause)
  })

  const refresh = useCallback(async (runId: string): Promise<void> => {
    try {
      const next = await window.api.audit.get(runId)
      if (activeIdRef.current === runId) setSnapshot(next)
    } catch (cause) {
      setError(toError(cause))
    }
  }, [])

  // 初始加载：取 run 列表并选中最新一个。
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const ids = await window.api.audit.list()
        if (cancelled) return
        setRunIds(ids)
        const initial = ids[0]
        if (initial) {
          activeIdRef.current = initial
          setActiveRunId(initial)
          const snap = await window.api.audit.get(initial)
          if (!cancelled) setSnapshot(snap)
        }
      } catch (cause) {
        if (!cancelled) setError(toError(cause))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // 实时事件：覆盖台账/发现/阶段/状态任一变更即刷新当前快照。
  useEffect(() => {
    const off = window.api.audit.onEvent((event: DesktopAuditEvent) => {
      setRunIds((prev) => (prev.includes(event.runId) ? prev : [event.runId, ...prev]))
      if (event.runId === activeIdRef.current) {
        void refresh(event.runId)
      } else if (!activeIdRef.current) {
        activeIdRef.current = event.runId
        setActiveRunId(event.runId)
        void refresh(event.runId)
      }
    })
    return off
  }, [refresh])

  const selectRun = useCallback(
    async (runId: string): Promise<void> => {
      activeIdRef.current = runId
      setActiveRunId(runId)
      await refresh(runId)
    },
    [refresh]
  )

  const dismissError = useCallback((): void => setError(null), [])

  return {
    snapshot,
    runIds,
    activeRunId,
    loading,
    error,
    selectRun,
    dismissError
  }
}
