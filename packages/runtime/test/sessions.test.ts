import type { MastraCodeState } from '@mastra/code-sdk/schema'
import type {
  AgentController,
  AgentControllerEvent,
  AgentControllerThread,
  MastraDBMessage,
  Session
} from '@mastra/core/agent-controller'
import { describe, expect, it, vi } from 'vitest'
import { toRuntimeSessionMessage } from '../src/sessions/messages.js'
import { createRuntimeSessionService } from '../src/sessions/service.js'

function message(
  role: 'user' | 'assistant',
  parts: MastraDBMessage['content']['parts']
): MastraDBMessage {
  return {
    id: `${role}-message`,
    role,
    createdAt: new Date('2026-08-18T10:00:00.000Z'),
    content: { format: 2, parts }
  }
}

describe('runtime session messages', () => {
  it('serializes text, reasoning, tool calls, and image attachments', () => {
    const mapped = toRuntimeSessionMessage(
      message('assistant', [
        { type: 'text', text: 'done' },
        { type: 'reasoning', reasoning: 'checking', details: [] } as never,
        {
          type: 'tool-invocation',
          toolInvocation: {
            state: 'result',
            toolCallId: 'tool-1',
            toolName: 'read_file',
            args: { path: 'README.md' },
            result: 'contents'
          }
        } as never,
        {
          type: 'file',
          data: 'aGVsbG8=',
          mediaType: 'image/png',
          filename: 'preview.png'
        } as never
      ]),
      'gpt-5.6-luna'
    )

    expect(mapped).toEqual(
      expect.objectContaining({
        id: 'assistant-message',
        role: 'assistant',
        modelName: 'gpt-5.6-luna',
        createdAt: '2026-08-18T10:00:00.000Z',
        attachments: [
          expect.objectContaining({
            name: 'preview.png',
            mediaType: 'image/png',
            dataUrl: 'data:image/png;base64,aGVsbG8='
          })
        ]
      })
    )
    expect(mapped?.blocks).toEqual([
      { type: 'text', text: 'done' },
      { type: 'reasoning', text: 'checking' },
      expect.objectContaining({
        type: 'tool',
        id: 'tool-1',
        name: 'read_file',
        status: 'success'
      })
    ])
  })
})

describe('runtime session service', () => {
  it('adapts official controller sessions without leaking SDK instances', async () => {
    const threads = new Map<string, AgentControllerThread>()
    const sessions = new Map<string, Session<MastraCodeState>>()
    const pendingSuspensions = new Map<
      string,
      Map<
        string,
        {
          toolCallId: string
          toolName: string
          args: unknown
          suspendPayload: unknown
        }
      >
    >()
    const eventListeners = new Map<string, (event: AgentControllerEvent) => void>()
    const sendMessage = vi.fn().mockResolvedValue(undefined)
    const deleteSession = vi.fn().mockResolvedValue(true)
    const wireSession = vi.fn().mockResolvedValue(undefined)
    const activateSession = vi.fn()
    const workspacePath = '/tmp/mingyi-workspace'
    const resourceId = 'project-resource'

    const defaultSession = {
      identity: {
        getResourceId: () => resourceId,
        getOwnerId: () => 'owner-1'
      },
      thread: {
        getById: vi.fn(async ({ threadId }: { threadId: string }) => threads.get(threadId) ?? null),
        list: vi.fn(async () => [...threads.values()])
      }
    } as unknown as Session<MastraCodeState>

    const createMockSession = (
      id: string,
      tags: Record<string, string>
    ): Session<MastraCodeState> => {
      let modelId = ''
      let modeId = 'build'
      const sessionSuspensions = new Map()
      pendingSuspensions.set(id, sessionSuspensions)
      const session = {
        identity: {
          getResourceId: () => resourceId,
          getOwnerId: () => 'owner-1'
        },
        displayState: {
          get: () => ({ isRunning: false, pendingSuspensions: sessionSuspensions })
        },
        model: {
          hasSelection: () => Boolean(modelId),
          get: () => modelId,
          displayName: () => modelId.split('/').at(-1) || 'unknown',
          switch: vi.fn(async ({ modelId: next }: { modelId: string }) => {
            modelId = next
            const thread = threads.get(id)
            if (thread) thread.metadata = { ...thread.metadata, currentModelId: next }
          })
        },
        mode: {
          get: () => modeId,
          switch: vi.fn(async ({ modeId: next }: { modeId: string }) => {
            modeId = next
            const thread = threads.get(id)
            if (thread) thread.metadata = { ...thread.metadata, currentModeId: next }
          })
        },
        thread: {
          listActiveMessages: vi.fn().mockResolvedValue([]),
          rename: vi.fn(async ({ title }: { title: string }) => {
            const thread = threads.get(id)
            if (thread) thread.title = title
          }),
          setSetting: vi.fn(async ({ key, value }: { key: string; value: unknown }) => {
            const thread = threads.get(id)
            if (thread) thread.metadata = { ...thread.metadata, [key]: value }
          }),
          delete: vi.fn(async () => threads.delete(id))
        },
        subscribe: vi.fn((listener: (event: AgentControllerEvent) => void) => {
          eventListeners.set(id, listener)
          return () => eventListeners.delete(id)
        }),
        sendMessage,
        respondToToolSuspension: vi.fn(
          async ({ toolCallId }: { toolCallId: string; resumeData: unknown }) => {
            sessionSuspensions.delete(toolCallId)
          }
        ),
        abort: vi.fn()
      } as unknown as Session<MastraCodeState>
      sessions.set(id, session)
      threads.set(id, {
        id,
        resourceId,
        createdAt: new Date('2026-08-18T10:00:00.000Z'),
        updatedAt: new Date('2026-08-18T10:00:00.000Z'),
        metadata: tags
      })
      return session
    }

    const controller = {
      createSession: vi.fn(
        async ({ id, tags }: { id: string; tags: Record<string, string> }) =>
          sessions.get(id) ?? createMockSession(id, tags)
      ),
      deleteSession
    } as unknown as AgentController<MastraCodeState>

    const service = createRuntimeSessionService({
      controller,
      defaultSession,
      workspacePath,
      wireSession,
      activateSession
    })
    const events: unknown[] = []
    service.subscribe((event) => events.push(event))

    const created = await service.create({
      id: 'session-1',
      title: 'First task',
      modelId: 'openai/gpt-5.6-luna',
      modeId: 'plan'
    })
    expect(created).toEqual(
      expect.objectContaining({
        id: 'session-1',
        title: 'First task',
        modelId: 'openai/gpt-5.6-luna',
        modeId: 'plan',
        messages: []
      })
    )
    expect(wireSession).toHaveBeenCalledOnce()
    expect(await service.list()).toHaveLength(1)

    await service.update({ sessionId: 'session-1', pinned: true })
    expect((await service.get('session-1')).pinned).toBe(true)

    eventListeners.get('session-1')?.({ type: 'agent_start' })
    eventListeners.get('session-1')?.({
      type: 'message_update',
      message: message('assistant', [{ type: 'text', text: 'hello' }])
    })
    expect(events).toContainEqual({
      type: 'run_state',
      sessionId: 'session-1',
      isRunning: true
    })
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'message',
        sessionId: 'session-1',
        message: expect.objectContaining({ modelName: 'gpt-5.6-luna' })
      })
    )

    const accessSuspension = {
      toolCallId: 'access-1',
      toolName: 'request_access',
      args: { path: '/tmp/external-audit' },
      suspendPayload: {
        kind: 'sandbox_access_request',
        path: '/tmp/external-audit',
        reason: 'Read prior audit artifacts.'
      }
    }
    pendingSuspensions.get('session-1')?.set('access-1', accessSuspension)
    eventListeners.get('session-1')?.({ type: 'tool_suspended', ...accessSuspension })
    expect(events).toContainEqual({
      type: 'access_request',
      sessionId: 'session-1',
      request: {
        toolCallId: 'access-1',
        path: '/tmp/external-audit',
        reason: 'Read prior audit artifacts.'
      }
    })

    await service.respondToAccessRequest({
      sessionId: 'session-1',
      toolCallId: 'access-1',
      approved: true
    })
    expect(sessions.get('session-1')?.respondToToolSuspension).toHaveBeenCalledWith({
      toolCallId: 'access-1',
      resumeData: 'Yes'
    })
    expect(events).toContainEqual({
      type: 'access_request_resolved',
      sessionId: 'session-1',
      toolCallId: 'access-1',
      approved: true
    })

    await service.sendMessage({ sessionId: 'session-1', content: 'start' })
    expect(activateSession).toHaveBeenCalledWith(sessions.get('session-1'))
    expect(sendMessage).toHaveBeenCalledWith({ content: 'start' })

    await service.delete('session-1')
    expect(await service.list()).toEqual([])
    expect(deleteSession).toHaveBeenCalledWith({
      resourceId,
      scope: 'mingyi-desktop:session-1'
    })
  })

  it('carries project ownership through metadata and lists across workspaces', async () => {
    const threads = new Map<string, AgentControllerThread>()
    const sessions = new Map<string, Session<MastraCodeState>>()
    const workspacePath = '/tmp/mingyi-workspace'
    const resourceId = 'project-resource'

    const defaultSession = {
      identity: {
        getResourceId: () => resourceId,
        getOwnerId: () => 'owner-1'
      },
      thread: {
        getById: vi.fn(async ({ threadId }: { threadId: string }) => threads.get(threadId) ?? null),
        // mock Mastra 的 metadata AND 过滤语义：list 按传入 metadata 逐 key 匹配
        list: vi.fn(async (options?: { metadata?: Record<string, unknown> }) =>
          [...threads.values()].filter((thread) =>
            Object.entries(options?.metadata ?? {}).every(
              ([key, value]) => thread.metadata?.[key] === value
            )
          )
        )
      }
    } as unknown as Session<MastraCodeState>

    const createMockSession = (id: string): Session<MastraCodeState> => {
      const session = {
        identity: {
          getResourceId: () => resourceId,
          getOwnerId: () => 'owner-1'
        },
        displayState: {
          get: () => ({ isRunning: false, pendingSuspensions: new Map() })
        },
        model: { hasSelection: () => false, get: () => '', displayName: () => 'unknown' },
        mode: { get: () => 'build' },
        thread: {
          listActiveMessages: vi.fn().mockResolvedValue([]),
          rename: vi.fn(),
          setSetting: vi.fn(),
          delete: vi.fn(async () => threads.delete(id))
        },
        subscribe: vi.fn(() => () => undefined),
        sendMessage: vi.fn(),
        respondToToolSuspension: vi.fn(),
        abort: vi.fn()
      } as unknown as Session<MastraCodeState>
      sessions.set(id, session)
      return session
    }

    const controller = {
      createSession: vi.fn(
        async ({ id, tags }: { id: string; tags: Record<string, string> }) => {
          const session = createMockSession(id)
          threads.set(id, {
            id,
            resourceId,
            createdAt: new Date('2026-08-18T10:00:00.000Z'),
            updatedAt: new Date('2026-08-18T10:00:00.000Z'),
            metadata: { ...tags }
          })
          return session
        }
      ),
      deleteSession: vi.fn()
    } as unknown as AgentController<MastraCodeState>

    const service = createRuntimeSessionService({
      controller,
      defaultSession,
      workspacePath
    })

    const owned = await service.create({ id: 'owned', title: 'Owned task', projectId: 'proj-1' })
    expect(owned.projectId).toBe('proj-1')
    expect(owned.projectPath).toBe(workspacePath)
    expect(threads.get('owned')?.metadata).toEqual(
      expect.objectContaining({ projectId: 'proj-1', projectPath: workspacePath })
    )

    const temporary = await service.create({ id: 'temporary', title: 'Temp task' })
    expect(temporary.projectId).toBeUndefined()
    expect(temporary.projectPath).toBe(workspacePath)

    // 旧数据兼容：只有 projectPath 没有 projectId 的 thread 仍可读
    threads.set('legacy', {
      id: 'legacy',
      resourceId,
      createdAt: new Date('2026-08-18T09:00:00.000Z'),
      updatedAt: new Date('2026-08-18T09:00:00.000Z'),
      metadata: { mingyiClient: 'desktop', projectPath: workspacePath }
    })

    const listed = await service.list()
    expect(listed.map((summary) => summary.id)).toEqual(['owned', 'temporary', 'legacy'])
    expect(listed.find((summary) => summary.id === 'legacy')?.projectId).toBeUndefined()

    // 跨空间目录：另一个 workspace 的 thread 也进入 listAll
    threads.set('other-space', {
      id: 'other-space',
      resourceId: 'other-resource',
      createdAt: new Date('2026-08-18T08:00:00.000Z'),
      updatedAt: new Date('2026-08-18T08:00:00.000Z'),
      metadata: { mingyiClient: 'desktop', projectPath: '/tmp/other-space' }
    })
    const all = await service.listAll()
    expect(all.map((summary) => summary.id)).toContain('other-space')
    expect(all.find((summary) => summary.id === 'other-space')?.projectPath).toBe('/tmp/other-space')

    // 但当前 workspace 的 list 不包含其他空间的 thread
    expect((await service.list()).map((summary) => summary.id)).not.toContain('other-space')

    // listAll 使用 allResources 选项
    expect(defaultSession.thread.list).toHaveBeenCalledWith(
      expect.objectContaining({ allResources: true })
    )
  })

  it('broadcasts OM state to live sessions and replays overrides on new sessions', async () => {
    const threads = new Map<string, AgentControllerThread>()
    const sessions = new Map<string, Session<MastraCodeState>>()
    const workspacePath = '/tmp/mingyi-workspace'
    const resourceId = 'project-resource'

    const statefulSession = (
      target: Session<MastraCodeState> & { stateSnapshot?: Partial<MastraCodeState> }
    ): void => {
      target.stateSnapshot = {}
      ;(target as unknown as { state: unknown }).state = {
        get: () => target.stateSnapshot,
        set: vi.fn(async (updates: Partial<MastraCodeState>) => {
          target.stateSnapshot = { ...target.stateSnapshot, ...updates }
        })
      }
    }

    const defaultSession = {
      identity: { getResourceId: () => resourceId, getOwnerId: () => 'owner-1' },
      thread: {
        getById: vi.fn(async ({ threadId }: { threadId: string }) => threads.get(threadId) ?? null),
        list: vi.fn(async () => [...threads.values()])
      }
    } as unknown as Session<MastraCodeState>
    statefulSession(defaultSession as Session<MastraCodeState> & { stateSnapshot?: never })

    const createMockSession = (id: string): Session<MastraCodeState> => {
      const session = {
        identity: { getResourceId: () => resourceId, getOwnerId: () => 'owner-1' },
        displayState: { get: () => ({ isRunning: false, pendingSuspensions: new Map() }) },
        model: { hasSelection: () => false, get: () => '', displayName: () => 'unknown' },
        mode: { get: () => 'build' },
        thread: {
          listActiveMessages: vi.fn().mockResolvedValue([]),
          rename: vi.fn(),
          setSetting: vi.fn(),
          delete: vi.fn(async () => threads.delete(id))
        },
        subscribe: vi.fn(() => () => undefined),
        sendMessage: vi.fn(),
        respondToToolSuspension: vi.fn(),
        abort: vi.fn()
      } as unknown as Session<MastraCodeState>
      statefulSession(session)
      sessions.set(id, session)
      return session
    }

    const controller = {
      createSession: vi.fn(async ({ id, tags }: { id: string; tags: Record<string, string> }) => {
        const session = createMockSession(id)
        threads.set(id, {
          id,
          resourceId,
          createdAt: new Date('2026-08-18T10:00:00.000Z'),
          updatedAt: new Date('2026-08-18T10:00:00.000Z'),
          metadata: { ...tags }
        })
        return session
      }),
      deleteSession: vi.fn()
    } as unknown as AgentController<MastraCodeState>

    const service = createRuntimeSessionService({
      controller,
      defaultSession,
      workspacePath
    })

    // 会话先于 OM 更新创建（对应聊天中途修改记忆设置的场景）
    await service.create({ id: 'live-1', title: 'Live' })
    await service.applyOmState({ observerModelId: 'bai/qwen3.8-flash' })

    // default 会话与已物化会话都收到更新
    expect(defaultSession.state.get().observerModelId).toBe('bai/qwen3.8-flash')
    expect(sessions.get('live-1')?.state.get().observerModelId).toBe('bai/qwen3.8-flash')

    // 更新之后创建的新会话在挂载时重放覆盖值
    await service.create({ id: 'live-2', title: 'After update' })
    expect(sessions.get('live-2')?.state.get().observerModelId).toBe('bai/qwen3.8-flash')

    // 覆盖值持续累积：后续更新叠加而不清空早前字段
    await service.applyOmState({ observationThreshold: 24_000 })
    await service.create({ id: 'live-3', title: 'After second update' })
    const third = sessions.get('live-3')?.state.get()
    expect(third?.observerModelId).toBe('bai/qwen3.8-flash')
    expect(third?.observationThreshold).toBe(24_000)
  })
})
