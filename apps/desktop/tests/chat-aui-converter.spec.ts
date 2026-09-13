import { expect, test } from '@playwright/test'
import type { RuntimeSessionEvent, RuntimeSessionMessage } from '@mingyi/runtime'
import { AssistantRunAccumulator } from '../src/renderer/src/components/chat/runtime/accumulator'
import {
  dataUrlMediaType,
  dataUrlPayload,
  extractSendPayload,
  messageAnchorId,
  partsToChatBlocks,
  runtimeBlocksToParts,
  runtimeMessageToThreadMessageLike
} from '../src/renderer/src/components/chat/runtime/converter'
import type { ThreadMessage } from '@assistant-ui/react'

const PNG_DATA_URL = 'data:image/png;base64,aGVsbG8='

function wireMessage(partial: Partial<RuntimeSessionMessage>): RuntimeSessionMessage {
  return {
    id: 'm-1',
    role: 'assistant',
    blocks: [],
    createdAt: '2026-09-13T08:00:00.000Z',
    ...partial
  }
}

function threadMessage(
  message: ReturnType<typeof runtimeMessageToThreadMessageLike>
): ThreadMessage {
  return message as unknown as ThreadMessage
}

test.describe('runtimeBlocksToParts tool status mapping', () => {
  test('maps every runtime tool status onto the part encoding', () => {
    const parts = runtimeBlocksToParts(
      [
        { type: 'tool', id: 't-pending', name: 'http_request', status: 'pending' },
        { type: 'tool', id: 't-running', name: 'http_request', status: 'running' },
        {
          type: 'tool',
          id: 't-success',
          name: 'http_request',
          input: '{"url":"http://target"}',
          output: '{"status":200}',
          status: 'success'
        },
        { type: 'tool', id: 't-error', name: 'bash', output: 'boom', status: 'error' }
      ],
      'assistant'
    )

    expect(parts).toHaveLength(4)
    const [pending, running, success, error] = parts as Array<{
      result?: unknown
      isError?: boolean
      approval?: { approved?: boolean }
    }>

    expect(pending.result).toBeUndefined()
    expect(running.result).toBeUndefined()
    expect(success.result).toEqual({ status: 200 })
    expect((success as { isError?: boolean }).isError).toBeUndefined()
    expect(error.result).toBe('boom')
    expect(error.isError).toBe(true)

    const blocks = partsToChatBlocks(parts, false)
    expect(blocks.map((block) => (block.type === 'tool' ? block.status : block.type))).toEqual([
      'running',
      'running',
      'success',
      'error'
    ])
  })

  test('encodes denied and waiting_approval via approval fields and overlay', () => {
    const overlay = new Map([['t-wait', 'waiting_approval' as const]])
    const parts = runtimeBlocksToParts(
      [
        { type: 'tool', id: 't-wait', name: 'bash', status: 'running' },
        { type: 'tool', id: 't-denied', name: 'bash', status: 'denied' }
      ],
      'assistant',
      overlay
    )
    const blocks = partsToChatBlocks(parts, false)
    expect(blocks.map((block) => (block.type === 'tool' ? block.status : block.type))).toEqual([
      'waiting_approval',
      'denied'
    ])
  })

  test('drops empty text and reasoning blocks', () => {
    const parts = runtimeBlocksToParts(
      [
        { type: 'text', text: '' },
        { type: 'reasoning', text: '   ' },
        { type: 'text', text: '结论' }
      ],
      'assistant'
    )
    expect(parts).toEqual([{ type: 'text', text: '结论' }])
  })
})

test.describe('runtimeMessageToThreadMessageLike history hydration', () => {
  test('assistant message keeps runtime id, model metadata and anchors', () => {
    const like = runtimeMessageToThreadMessageLike(
      wireMessage({
        id: 'assistant-1',
        modelName: 'claude-sonnet-5',
        blocks: [{ type: 'text', text: '完成' }]
      })
    )
    const message = threadMessage(like)
    expect(message.id).toBe('assistant-1')
    expect(messageAnchorId(message)).toBe('assistant-1')
    expect(message.metadata.custom).toMatchObject({
      runtimeMessageId: 'assistant-1',
      modelName: 'claude-sonnet-5',
      messageEnded: true
    })
  })

  test('user skill envelope becomes a data part and round-trips to SkillBlock', () => {
    const like = runtimeMessageToThreadMessageLike(
      wireMessage({
        id: 'user-1',
        role: 'user',
        blocks: [
          {
            type: 'text',
            text: '<skill name="security-audit">\n# Security audit\n\nARGUMENTS: 检查 OAuth\n</skill>'
          }
        ],
        attachments: [
          { id: 'a-1', name: 'shot.png', mediaType: 'image/png', dataUrl: PNG_DATA_URL }
        ]
      })
    )
    const message = threadMessage(like)
    expect(message.content[0].type).toBe('image')
    expect(message.content[1]).toEqual({
      type: 'data',
      name: 'skill',
      data: {
        type: 'skill',
        name: 'security-audit',
        instructions: '# Security audit',
        arguments: '检查 OAuth'
      }
    })
    const blocks = partsToChatBlocks(message.content, false)
    expect(blocks).toEqual([
      {
        type: 'skill',
        name: 'security-audit',
        instructions: '# Security audit',
        arguments: '检查 OAuth'
      }
    ])
  })
})

test.describe('extractSendPayload', () => {
  test('derives message payload with files and composer metadata', () => {
    const like = runtimeMessageToThreadMessageLike(
      wireMessage({
        id: 'user-2',
        role: 'user',
        blocks: [{ type: 'text', text: '帮我审计' }],
        attachments: [
          { id: 'a-1', name: 'evidence.png', mediaType: 'image/png', dataUrl: PNG_DATA_URL }
        ]
      })
    )
    const payload = extractSendPayload([threadMessage(like)])
    // 手动补上 append 阶段写入的 custom metadata
    const withMeta = threadMessage({
      ...like,
      metadata: { custom: { goalMode: true, expertName: 'audit' } }
    })
    const enriched = extractSendPayload([withMeta])
    expect(payload).toEqual({
      kind: 'message',
      text: '帮我审计',
      files: [{ data: 'aGVsbG8=', mediaType: 'image/png', filename: 'evidence.png' }]
    })
    expect(enriched).toMatchObject({ kind: 'message', goalMode: true, expertName: 'audit' })
    expect(dataUrlPayload(PNG_DATA_URL)).toBe('aGVsbG8=')
    expect(dataUrlMediaType(PNG_DATA_URL)).toBe('image/png')
  })

  test('returns skill payload for data-skill part and null for non-user tail', () => {
    const skillLike = runtimeMessageToThreadMessageLike(
      wireMessage({
        id: 'user-3',
        role: 'user',
        blocks: [
          {
            type: 'text',
            text: '<skill name="nmap-scan">scan\n\nARGUMENTS: -sV target</skill>'
          }
        ]
      })
    )
    expect(extractSendPayload([threadMessage(skillLike)])).toEqual({
      kind: 'skill',
      name: 'nmap-scan',
      arguments: '-sV target',
      files: []
    })

    const assistantLike = runtimeMessageToThreadMessageLike(
      wireMessage({ id: 'assistant-2', blocks: [{ type: 'text', text: 'done' }] })
    )
    expect(extractSendPayload([threadMessage(assistantLike)])).toBeNull()
  })
})

test.describe('AssistantRunAccumulator', () => {
  test('merges multiple assistant messages of one run in first-seen order', () => {
    const accumulator = new AssistantRunAccumulator()
    accumulator.applyEvent({
      type: 'message',
      sessionId: 's1',
      phase: 'end',
      message: wireMessage({ id: 'a-1', blocks: [{ type: 'text', text: '第一段' }] })
    })
    accumulator.applyEvent({
      type: 'message',
      sessionId: 's1',
      phase: 'update',
      message: wireMessage({ id: 'a-2', blocks: [{ type: 'text', text: '第二段' }] })
    })
    // a-1 再次更新：仍保持在首见位置
    accumulator.applyEvent({
      type: 'message',
      sessionId: 's1',
      phase: 'end',
      message: wireMessage({
        id: 'a-1',
        blocks: [{ type: 'text', text: '第一段（更新）' }]
      })
    })

    const texts = accumulator.parts
      .map((part) => (part.type === 'text' ? part.text : part.type))
      .filter((value) => typeof value === 'string')
    expect(texts).toEqual(['第一段（更新）', '第二段'])
    expect(accumulator.metadata.custom).toEqual({
      runtimeMessageId: 'a-1',
      messageEnded: true
    })
    expect(accumulator.sawContent).toBe(true)
  })

  test('access request events flip tool overlay status', () => {
    const accumulator = new AssistantRunAccumulator()
    accumulator.applyEvent({
      type: 'message',
      sessionId: 's1',
      phase: 'update',
      message: wireMessage({
        id: 'a-1',
        blocks: [{ type: 'tool', id: 't-1', name: 'bash', status: 'running' }]
      })
    })
    accumulator.applyEvent({
      type: 'access_request',
      sessionId: 's1',
      request: { toolCallId: 't-1', path: '/etc/passwd', reason: '读取敏感路径' }
    })
    expect(partsToChatBlocks(accumulator.parts)[0]).toMatchObject({ status: 'waiting_approval' })

    accumulator.applyEvent({
      type: 'access_request_resolved',
      sessionId: 's1',
      toolCallId: 't-1',
      approved: true
    })
    expect(partsToChatBlocks(accumulator.parts)[0]).toMatchObject({ status: 'running' })

    accumulator.applyEvent({
      type: 'access_request_resolved',
      sessionId: 's1',
      toolCallId: 't-1',
      approved: false
    })
    expect(partsToChatBlocks(accumulator.parts)[0]).toMatchObject({ status: 'denied' })
  })

  test('seed restores in-flight messages and overlay for resume', () => {
    const seedOverlay = new Map([['t-9', 'waiting_approval' as const]])
    const accumulator = new AssistantRunAccumulator({
      seed: [wireMessage({ id: 'a-9', blocks: [{ type: 'text', text: '进行中' }] })],
      seedOverlay
    })
    expect(accumulator.sawContent).toBe(true)
    expect(accumulator.metadata.custom).toEqual({
      runtimeMessageId: 'a-9',
      messageEnded: false
    })
    expect(accumulator.statusOverlay.get('t-9')).toBe('waiting_approval')
  })
})

test('ignores user-role message events when accumulating assistant runs', () => {
  const event: RuntimeSessionEvent = {
    type: 'message',
    sessionId: 's1',
    phase: 'end',
    message: wireMessage({
      id: 'u-1',
      role: 'user',
      blocks: [{ type: 'text', text: '用户消息' }]
    })
  }
  const accumulator = new AssistantRunAccumulator()
  accumulator.applyEvent(event)
  expect(accumulator.sawContent).toBe(false)
  expect(accumulator.parts).toEqual([])
})
