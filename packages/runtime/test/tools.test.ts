import { describe, expect, it } from 'vitest'
import {
  createRuntimeToolExecutor,
  MAX_TOOL_OUTPUT_LENGTH,
  RuntimeToolError,
  RuntimeToolRegistry,
  truncateToolOutput,
  type RuntimeTool,
  type RuntimeToolContext
} from '../src/tools/index.js'

function context(signal = new AbortController().signal): RuntimeToolContext {
  return { signal }
}

function echoTool(overrides: Partial<RuntimeTool> = {}): RuntimeTool {
  return {
    name: 'echo',
    kind: 'read-only',
    description: 'returns its arguments as text',
    execute: async (command) => ({ output: JSON.stringify(command.arguments), exitCode: 0 }),
    ...overrides
  }
}

describe('generic tool registry', () => {
  it('rejects duplicate and invalid tool definitions', () => {
    const registry = new RuntimeToolRegistry()
    registry.register(echoTool())
    expect(() => registry.register(echoTool())).toThrow('Duplicate tool: echo.')
    expect(() =>
      registry.register(echoTool({ name: '', execute: async () => ({}) }))
    ).toThrow('Invalid tool definition')
  })

  it('lists registered tools', () => {
    const registry = new RuntimeToolRegistry([echoTool()])
    expect(registry.list().map((tool) => tool.name)).toEqual(['echo'])
    expect(registry.get('echo')?.description).toContain('arguments')
    expect(registry.get('missing')).toBeUndefined()
  })
})

describe('generic tool executor', () => {
  it('executes registered tools and rejects unknown ones', async () => {
    const executor = createRuntimeToolExecutor([echoTool()])
    const result = await executor.execute(
      { toolName: 'echo', arguments: { message: 'hi' } },
      context()
    )
    expect(result.output).toBe('{"message":"hi"}')

    await expect(
      executor.execute({ toolName: 'missing', arguments: {} }, context())
    ).rejects.toMatchObject({ code: 'unknown_tool' })
  })

  it('runs guards in order and lets them enrich the context', async () => {
    const seen: string[] = []
    const executor = createRuntimeToolExecutor([
      echoTool({
        execute: async (_command, guardContext) => ({
          output: String((guardContext as { tag?: string }).tag)
        })
      })
    ])
    const result = await executor.execute({ toolName: 'echo', arguments: {} }, context(), {
      guards: [
        (command, guardContext) => {
          seen.push(`first:${command.toolName}`)
          return guardContext
        },
        (command, guardContext) => {
          seen.push(`second:${command.toolName}`)
          return { ...guardContext, tag: 'enriched' }
        }
      ]
    })
    expect(seen).toEqual(['first:echo', 'second:echo'])
    expect(result.output).toBe('enriched')
  })

  it('propagates guard rejections without wrapping them', async () => {
    const executor = createRuntimeToolExecutor([echoTool()])
    await expect(
      executor.execute({ toolName: 'echo', arguments: {} }, context(), {
        guards: [
          () => {
            throw new Error('domain says no')
          }
        ]
      })
    ).rejects.toThrow('domain says no')
  })

  it('does not guard tools that are not registered', async () => {
    const guardCalls: string[] = []
    const executor = createRuntimeToolExecutor([echoTool()])
    await expect(
      executor.execute({ toolName: 'missing', arguments: {} }, context(), {
        guards: [
          (command) => {
            guardCalls.push(command.toolName)
            return {}
          }
        ]
      })
    ).rejects.toBeInstanceOf(RuntimeToolError)
    expect(guardCalls).toEqual([])
  })

  it('turns timeouts into evidence-friendly results', async () => {
    const executor = createRuntimeToolExecutor([
      echoTool({ timeoutMs: 30, execute: () => new Promise(() => undefined) })
    ])
    const result = await executor.execute({ toolName: 'echo', arguments: {} }, context())
    expect(result.timedOut).toBe(true)
    expect(result.exitCode).toBe(-1)
  })

  it('propagates abort signals as errors', async () => {
    const executor = createRuntimeToolExecutor([
      echoTool({ execute: () => new Promise(() => undefined) })
    ])
    const abort = new AbortController()
    abort.abort()
    await expect(
      executor.execute({ toolName: 'echo', arguments: {} }, context(abort.signal))
    ).rejects.toThrow('aborted')
  })

  it('enforces the minimum interval between executions', async () => {
    const started: number[] = []
    const executor = createRuntimeToolExecutor([
      echoTool({
        execute: async () => {
          started.push(Date.now())
          return { output: 'done' }
        }
      })
    ])
    await Promise.all(
      [0, 1, 2].map(() =>
        executor.execute({ toolName: 'echo', arguments: {} }, context(), {
          minIntervalMs: 80
        })
      )
    )
    const gaps = started.slice(1).map((time, index) => time - started[index])
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(70)
  })

  it('caps concurrent executions', async () => {
    let inFlight = 0
    let peak = 0
    const executor = createRuntimeToolExecutor([
      echoTool({
        execute: async () => {
          inFlight += 1
          peak = Math.max(peak, inFlight)
          await new Promise((resolve) => setTimeout(resolve, 20))
          inFlight -= 1
          return { output: 'done' }
        }
      })
    ])
    await Promise.all(
      [0, 1, 2, 3, 4, 5].map(() =>
        executor.execute({ toolName: 'echo', arguments: {} }, context(), {
          maxConcurrent: 2,
          // 速率限制默认 250ms 会把起跑串行化；置零才能真正压到并发上限
          minIntervalMs: 0
        })
      )
    )
    expect(peak).toBe(2)
  })

  it('truncates oversized output', async () => {
    const executor = createRuntimeToolExecutor([
      echoTool({ execute: async () => ({ output: 'x'.repeat(MAX_TOOL_OUTPUT_LENGTH + 1) }) })
    ])
    const result = await executor.execute({ toolName: 'echo', arguments: {} }, context())
    expect(result.output?.length).toBeLessThanOrEqual(MAX_TOOL_OUTPUT_LENGTH + 64)
    expect(result.output).toContain('(truncated at')
  })
})

describe('truncateToolOutput', () => {
  it('keeps short output untouched', () => {
    expect(truncateToolOutput('short')).toBe('short')
  })
})
