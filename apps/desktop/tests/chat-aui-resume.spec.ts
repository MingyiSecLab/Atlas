import { expect, test, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import * as path from 'node:path'
import { runtimeTestEnv } from './runtime-env'

test.describe('Chat UI run resume', () => {
  let electronApp: ElectronApplication
  let page: Page
  const pageErrors: string[] = []

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [path.join(__dirname, '..')],
      env: runtimeTestEnv('chat-aui-resume')
    })
    page = await electronApp.firstWindow()
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.waitForLoadState('domcontentloaded')

    await page.evaluate(async () => {
      await window.api.sessions.create({ title: '续流主会话' })
      await window.api.sessions.create({ title: '临时会话' })
    })
    await page.reload()
    await page.getByText('续流主会话', { exact: true }).first().click()
    await expect(page.locator('.chat-workspace')).toBeVisible()
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  function sendEvent(event: unknown): Promise<unknown> {
    return electronApp.evaluate(({ BrowserWindow }, payload) => {
      return BrowserWindow.getAllWindows()[0]?.webContents.send('runtime:session:event', payload)
    }, event)
  }

  function wireMessage(
    id: string,
    text: string,
    createdAt: string,
    modelName?: string
  ): {
    id: string
    role: 'assistant'
    blocks: Array<{ type: 'text'; text: string }>
    createdAt: string
    modelName?: string
  } {
    return {
      id,
      role: 'assistant',
      blocks: [{ type: 'text', text }],
      createdAt,
      ...(modelName ? { modelName } : {})
    }
  }

  test('continues a running assistant stream after switching sessions and back', async () => {
    const sessions = await page.evaluate(() => window.api.sessions.list())
    const main = sessions.find((session) => session.title === '续流主会话')
    const other = sessions.find((session) => session.title === '临时会话')
    expect(main).toBeDefined()
    expect(other).toBeDefined()
    const now = new Date().toISOString()

    // 挂起 send-message：保持 run 存活
    await electronApp.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('runtime:session:send-message')
      ipcMain.handle('runtime:session:send-message', async () => undefined)
    })

    const composer = page.getByLabel('发送消息')
    await composer.fill('请继续分析')
    await composer.press('Enter')
    await expect(page.locator('.chat-user-message')).toContainText('请继续分析')

    // 流式第一段
    await sendEvent({
      type: 'message',
      sessionId: main!.id,
      phase: 'update',
      message: wireMessage('assistant-resume-1', '第一段', now)
    })
    await expect(page.locator('#message-assistant-resume-1')).toContainText('第一段')

    // mock session:get：主会话返回“仍在运行、末条为在途 assistant”的快照
    await electronApp.evaluate(
      ({ ipcMain }, { mainId, otherId, title, now: createdAt, userText, partialText }) => {
        const summary = (id: string, name: string) => ({
          id,
          title: name,
          pinned: false,
          createdAt,
          updatedAt: createdAt,
          modelId: null,
          modeId: 'pentest',
          isRunning: false,
          messages: [],
          accessRequests: []
        })
        ipcMain.removeHandler('runtime:session:get')
        ipcMain.handle('runtime:session:get', async (_event, sessionId: string) => {
          if (sessionId !== mainId) return summary(otherId, '临时会话')
          return {
            ...summary(mainId, title),
            isRunning: true,
            messages: [
              {
                id: 'user-resume-1',
                role: 'user',
                blocks: [{ type: 'text', text: userText }],
                createdAt
              },
              {
                id: 'assistant-resume-1',
                role: 'assistant',
                blocks: [{ type: 'text', text: partialText }],
                modelName: 'claude-sonnet-5',
                createdAt
              }
            ]
          }
        })
      },
      {
        mainId: main!.id,
        otherId: other!.id,
        title: '续流主会话',
        now,
        userText: '请继续分析',
        partialText: '第一段'
      }
    )

    // 切走再切回：ChatWorkspace 重挂载并 resume
    await page.getByText('临时会话', { exact: true }).first().click()
    await expect(page.locator('.chat-workspace')).toBeVisible()
    await page.getByText('续流主会话', { exact: true }).first().click()
    await expect(page.locator('#message-assistant-resume-1')).toContainText('第一段')
    await expect(page.locator('.chat-user-message')).toContainText('请继续分析')

    // 注入续流内容并结束
    await sendEvent({
      type: 'message',
      sessionId: main!.id,
      phase: 'update',
      message: wireMessage(
        'assistant-resume-1',
        '第一段，随后是第二段结论。',
        now,
        'claude-sonnet-5'
      )
    })
    await sendEvent({
      type: 'run_state',
      sessionId: main!.id,
      isRunning: false,
      reason: 'complete'
    })

    // 单条连续 assistant 消息：合并内容、无重复气泡、结束后出现 footer
    const message = page.locator('#message-assistant-resume-1')
    await expect(message).toContainText('第二段结论')
    await expect(page.locator('.chat-assistant-message')).toHaveCount(1)
    await expect(message.locator('.chat-turn-provenance')).toContainText('claude-sonnet-5')
    expect(pageErrors).toEqual([])
  })
})
