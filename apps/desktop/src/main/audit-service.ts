import type { LocalRuntimeInstance, RuntimeAuditEvent } from '@mingyi/runtime'
import type { WebContents } from 'electron'
import { ipcMain } from 'electron'
import { RUNTIME_IPC } from '../shared/runtime-ipc'
import type { DesktopAuditEvent } from '../shared/runtime-ipc'
import type { DesktopRuntimeManager } from './runtime-manager'

function auditRunId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 256) {
    throw new Error('Invalid audit run ID.')
  }
  return value.trim()
}

/**
 * 右侧审计工作视图的 IPC 注册：
 * - auditList / auditGet / latest：读取 Runtime 审计服务的 run 快照
 * - auditEvent：广播父编排器工具（init_audit_run / update_audit_ledger /
 *   record_audit_finding / set_audit_phase / set_audit_run_status）产生的实时事件
 */
export function registerAuditService(runtimeManager: DesktopRuntimeManager): {
  dispose: () => void
} {
  const subscribers = new Set<WebContents>()
  let unsubscribe: (() => void) | undefined
  let watched: LocalRuntimeInstance | undefined

  const removeSubscriber = (owner: WebContents): void => {
    subscribers.delete(owner)
  }

  const subscribeOwner = (owner: WebContents): void => {
    if (subscribers.has(owner)) return
    subscribers.add(owner)
    owner.once('destroyed', () => removeSubscriber(owner))
  }

  const broadcast = (event: DesktopAuditEvent): void => {
    for (const owner of subscribers) {
      if (!owner.isDestroyed()) owner.send(RUNTIME_IPC.auditEvent, event)
    }
  }

  const getRuntime = async (owner: WebContents): Promise<LocalRuntimeInstance> => {
    subscribeOwner(owner)
    const runtime = await runtimeManager.getRuntime()
    if (watched !== runtime) {
      unsubscribe?.()
      unsubscribe = runtime.audit.subscribe((event: RuntimeAuditEvent) => {
        broadcast({ runId: event.runId, event })
      })
      watched = runtime
    }
    return runtime
  }

  ipcMain.handle(RUNTIME_IPC.auditList, async (event) => {
    const runtime = await getRuntime(event.sender)
    return [...runtime.audit.list()]
  })

  ipcMain.handle(RUNTIME_IPC.auditGet, async (event, input: unknown) => {
    const runtime = await getRuntime(event.sender)
    const runId = auditRunId(input)
    return runtime.audit.get(runId)?.snapshot() ?? null
  })

  ipcMain.handle(RUNTIME_IPC.auditLatest, async (event) => {
    const runtime = await getRuntime(event.sender)
    return runtime.audit.latest()?.snapshot() ?? null
  })

  return {
    dispose: () => {
      unsubscribe?.()
      subscribers.clear()
    }
  }
}
