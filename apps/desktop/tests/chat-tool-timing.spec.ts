import { expect, test } from '@playwright/test'
import { formatLiveElapsedMs } from '../src/renderer/src/components/chat/useRunningClock'
import { calculateToolGroupSummary } from '../src/renderer/src/components/chat/tool-ui/types'
import {
  partsToChatBlocks,
  runtimeBlocksToParts
} from '../src/renderer/src/components/chat/runtime/converter'
import type { ToolBlock } from '../src/renderer/src/components/chat/types'

const parsedTerminal = {
  category: 'terminal' as const,
  displayName: '终端命令',
  verb: 'Ran',
  chip: 'curl http://target',
  isJsonArgs: true
}

test.describe('formatLiveElapsedMs', () => {
  test('uses whole seconds below a minute and minute padding above', () => {
    expect(formatLiveElapsedMs(0)).toBe('0s')
    expect(formatLiveElapsedMs(999)).toBe('0s')
    expect(formatLiveElapsedMs(1000)).toBe('1s')
    expect(formatLiveElapsedMs(59_999)).toBe('59s')
    expect(formatLiveElapsedMs(60_000)).toBe('1m 00s')
    expect(formatLiveElapsedMs(125_400)).toBe('2m 05s')
  })

  test('clamps negative input instead of rendering a negative duration', () => {
    expect(formatLiveElapsedMs(-500)).toBe('0s')
  })
})

test.describe('ToolGroup live timing data', () => {
  test('exposes the running step start time and the settled elapsed total', () => {
    const steps = [
      {
        id: '0',
        parsed: parsedTerminal,
        toolBlock: {
          type: 'tool',
          name: 'kali_exec',
          input: '{"cmd":"ls"}',
          status: 'success',
          elapsedMs: 1200,
          startedAt: 1_000_000
        } satisfies ToolBlock
      },
      {
        id: '1',
        parsed: parsedTerminal,
        toolBlock: {
          type: 'tool',
          name: 'kali_exec',
          input: '{"cmd":"curl http://target"}',
          status: 'running',
          startedAt: 1_002_000
        } satisfies ToolBlock
      }
    ]

    const summary = calculateToolGroupSummary(steps)
    expect(summary.status).toBe('running')
    expect(summary.runningIndex).toBe(2)
    // 已结算步骤耗时之和构成实时计时的基数，运行中步骤由 startedAt 现场推算
    expect(summary.totalElapsedMs).toBe(1200)
    expect(summary.runningStepStartedAt).toBe(1_002_000)
    // 运行中不做静态结算耗时的拼接，由渲染层每秒刷新
    expect(summary.headline).not.toContain('· 1.2s')
  })

  test('leaves running step start undefined for history without timing data', () => {
    const summary = calculateToolGroupSummary([
      {
        id: '0',
        parsed: parsedTerminal,
        toolBlock: { type: 'tool', name: 'kali_exec', status: 'running' }
      }
    ])

    expect(summary.status).toBe('running')
    expect(summary.runningStepStartedAt).toBeUndefined()
    expect(summary.totalElapsedMs).toBe(0)
  })
})

test.describe('tool timing round-trip', () => {
  test('carries elapsedMs and startedAt through parts back into chat blocks', () => {
    const parts = runtimeBlocksToParts(
      [{ type: 'tool', id: 't-1', name: 'kali_exec', input: '{"cmd":"ls"}', status: 'running' }],
      'assistant',
      undefined,
      new Map([['t-1', 800]]),
      new Map([['t-1', 1_700_000_000_000]])
    )

    const blocks = partsToChatBlocks(parts, true)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({
      type: 'tool',
      id: 't-1',
      status: 'running',
      elapsedMs: 800,
      startedAt: 1_700_000_000_000
    })
  })

  test('omits timing metadata entirely when no timing maps are supplied', () => {
    const parts = runtimeBlocksToParts(
      [{ type: 'tool', id: 't-1', name: 'kali_exec', status: 'success' }],
      'assistant'
    )

    expect(parts[0].providerMetadata).toBeUndefined()
    const blocks = partsToChatBlocks(parts, false)
    expect(blocks[0]).not.toHaveProperty('startedAt')
    expect(blocks[0]).not.toHaveProperty('elapsedMs')
  })
})
