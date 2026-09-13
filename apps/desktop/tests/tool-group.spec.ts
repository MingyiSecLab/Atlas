import { expect, test } from '@playwright/test'
import {
  calculateToolGroupSummary,
  groupChatBlocks
} from '../src/renderer/src/components/chat/tool-ui/types'
import type { ChatBlock, ToolBlock } from '../src/renderer/src/components/chat/types'

test.describe('ToolGroup aggregation and status calculation', () => {
  test('aggregates consecutive tool blocks and preceding reasoning into a single ToolGroup', () => {
    const blocks: ChatBlock[] = [
      { type: 'text', text: '开始进行渗透测试：' },
      { type: 'reasoning', text: '首先初始化目标靶场' },
      {
        type: 'tool',
        name: 'init_pentest_engagement',
        input: '{"targetUrl":"http://39.105.79.16/login.php"}',
        status: 'success'
      },
      { type: 'reasoning', text: '检查认证方案' },
      {
        type: 'tool',
        name: 'detect_auth_scheme',
        input: '{"url":"http://39.105.79.16/login.php"}',
        status: 'success'
      },
      {
        type: 'tool',
        name: 'kali_exec',
        input: '{"CommandLine":"cd /home/kali/workspace && curl -sS -i http://39.105.79.16"}',
        status: 'success'
      },
      {
        type: 'tool',
        name: 'kali_exec',
        input: '{"CommandLine":"cd /home/kali/workspace && rm -f cj.txt"}',
        status: 'error',
        output: 'Permission denied'
      },
      { type: 'text', text: '渗透测试第一阶段完成。' }
    ]

    const units = groupChatBlocks(blocks, 'msg-1')

    // 结构应当是: text -> tool_group -> text
    expect(units).toHaveLength(3)
    expect(units[0].type).toBe('single')
    expect(units[0].block.type).toBe('text')

    expect(units[1].type).toBe('tool_group')
    if (units[1].type === 'tool_group') {
      const summary = units[1].summary
      expect(summary.totalCount).toBe(4)
      expect(summary.successCount).toBe(3)
      expect(summary.errorCount).toBe(1)
      expect(summary.status).toBe('error')
      expect(summary.headline).toContain('已执行 4 个步骤 (3 成功, 1 失败)')

      // 验证第一步的前置思考过程被挂载到了步骤中
      expect(summary.steps[0].precedingReasoning).toBe('首先初始化目标靶场')
      expect(summary.steps[1].precedingReasoning).toBe('检查认证方案')
    }

    expect(units[2].type).toBe('single')
    expect(units[2].block.type).toBe('text')
  })

  test('keeps single tool call as single unit when not part of consecutive run', () => {
    const blocks: ChatBlock[] = [
      {
        type: 'tool',
        name: 'view_file',
        input: '{"AbsolutePath":"/path/to/file.ts"}',
        status: 'success'
      }
    ]

    const units = groupChatBlocks(blocks, 'msg-2')
    expect(units).toHaveLength(1)
    expect(units[0].type).toBe('single')
    expect(units[0].block.type).toBe('tool')
  })

  test('correctly sets running status when any step in the group is running', () => {
    const tools: ToolBlock[] = [
      { name: 'kali_exec', input: '{"cmd":"ls"}', status: 'success', type: 'tool' },
      { name: 'kali_exec', input: '{"cmd":"curl http://target"}', status: 'running', type: 'tool' }
    ]

    const steps = tools.map((toolBlock, i) => ({
      id: `${i}`,
      toolBlock,
      parsed: {
        category: 'terminal' as const,
        displayName: '终端命令',
        isJsonArgs: true
      }
    }))

    const summary = calculateToolGroupSummary(steps)
    expect(summary.status).toBe('running')
    expect(summary.runningIndex).toBe(2)
    expect(summary.headline).toContain('正在执行第 2/2 步')
  })
})
