import { useEffect, useState } from 'react'
import type { UpdateStatus } from '../../../shared/update-ipc'

/**
 * 订阅主进程的更新检查状态（启动自查 + 手动检查共用同一条状态）。
 *
 * 挂载时先拉一次缓存值（启动自查通常已先完成），之后靠主进程推送保持同步；
 * 多个组件各自订阅是安全的——状态的唯一来源在主进程，本地只做展示副本。
 */
export function useUpdateStatus(): UpdateStatus {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })

  useEffect(() => {
    let active = true
    void window.api.update
      .getStatus()
      .then((next) => {
        if (active) setStatus(next)
      })
      .catch(() => undefined)

    const unsubscribe = window.api.update.onStateChanged((next) => setStatus(next))
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return status
}
