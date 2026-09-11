import { expect, test, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import * as path from 'node:path'
import { runtimeTestEnv } from './runtime-env'

test.describe('Chat UI shell', () => {
  let electronApp: ElectronApplication
  let page: Page
  const pageErrors: string[] = []

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [path.join(__dirname, '..')],
      env: runtimeTestEnv('chat')
    })
    page = await electronApp.firstWindow()
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.waitForLoadState('domcontentloaded')

    await page.evaluate(() => window.api.sessions.create({ title: '界面测试' }))
    await page.reload()
    await page.getByText('界面测试', { exact: true }).first().click()
    await expect(page.locator('.chat-workspace')).toBeVisible()
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test('exposes the typed runtime bridge without a global SDK instance', async () => {
    expect(await page.evaluate(() => typeof window.api.sessions.list)).toBe('function')
    expect(await page.evaluate(() => typeof window.api.workspace.select)).toBe('function')
    expect(await page.evaluate(() => 'mastra' in window)).toBe(false)
    await expect(page.getByTestId('runtime-status-banner')).toHaveCount(0)
  })

  test('loads an empty persisted Runtime session without inventing a response', async () => {
    const snapshots = await page.evaluate(() => window.api.sessions.list())
    expect(snapshots).toEqual([expect.objectContaining({ title: '界面测试' })])
    await expect(page.getByLabel('发送消息')).toHaveValue('')
    await expect(page.locator('.chat-message-assistant')).toHaveCount(0)
  })

  test('shows the submitted user message before the Runtime responds', async () => {
    await electronApp.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('runtime:session:send-message')
      ipcMain.handle('runtime:session:send-message', async () => undefined)
    })

    const composer = page.getByLabel('发送消息')
    await composer.fill('这条用户消息应立即展示')
    await composer.press('Enter')

    await expect(page.locator('.chat-user-message')).toContainText('这条用户消息应立即展示')
    await expect(composer).toHaveValue('')
  })

  test('shows the active model beside the bot icon in an assistant message footer', async () => {
    const [session] = await page.evaluate(() => window.api.sessions.list())
    expect(session).toBeDefined()

    await electronApp.evaluate(({ BrowserWindow }, sessionId) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('runtime:session:event', {
        type: 'message',
        sessionId,
        phase: 'end',
        message: {
          id: 'assistant-model-label',
          role: 'assistant',
          blocks: [{ type: 'text', text: '模型标签测试' }],
          modelName: 'gpt-5.6-luna',
          createdAt: new Date().toISOString()
        }
      })
    }, session!.id)

    const message = page.locator('#message-assistant-model-label')
    await expect(message).toContainText('模型标签测试')
    await message.hover()
    await expect(message.locator('.chat-turn-provenance')).toContainText('gpt-5.6-luna')
  })

  test('keeps markdown links and raw HTML inert in assistant content', async () => {
    const [session] = await page.evaluate(() => window.api.sessions.list())
    expect(session).toBeDefined()

    await electronApp.evaluate(({ BrowserWindow }, sessionId) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('runtime:session:event', {
        type: 'message',
        sessionId,
        phase: 'end',
        message: {
          id: 'assistant-markdown-xss',
          role: 'assistant',
          blocks: [
            {
              type: 'text',
              text: '[danger](javascript:alert(1))\n\n<img src=x onerror=alert(1)>'
            }
          ],
          createdAt: new Date().toISOString()
        }
      })
    }, session!.id)

    const message = page.locator('#message-assistant-markdown-xss')
    await expect(message).toContainText('danger')
    await expect(message).toContainText('[blocked]')
    await expect(message).toContainText('[Image blocked: No description]')
    await expect(message.locator('a')).toHaveCount(0)
    await expect(message.locator('img')).toHaveCount(0)
    await expect(pageErrors).toEqual([])
  })

  test('keeps composer option menus mutually exclusive', async () => {
    const add = page.getByRole('button', { name: '添加内容' })
    const permission = page.getByRole('button', { name: 'Agent 模式' })
    const model = page.getByRole('button', { name: '模型' })

    await permission.click()
    await expect(permission).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('menu')).toHaveCount(1)

    await add.click()
    await expect(permission).toHaveAttribute('aria-expanded', 'false')
    await expect(add).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('menu')).toHaveCount(1)
    await expect(page.getByRole('menuitem', { name: '图片' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: '命令' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: '提及' })).toBeVisible()
    await expect(page.getByRole('menuitemcheckbox', { name: /Goal/ })).toBeVisible()

    await model.click()
    await expect(add).toHaveAttribute('aria-expanded', 'false')
    await expect(model).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('menu')).toHaveCount(1)

    await page.keyboard.press('Escape')
    await expect(model).toHaveAttribute('aria-expanded', 'false')
  })

  test('keeps command, mention and Goal actions wired to the composer', async () => {
    const add = page.getByRole('button', { name: '添加内容' })
    const composer = page.getByLabel('发送消息')

    await composer.fill('已有内容')
    await add.click()
    await page.getByRole('menuitem', { name: '命令' }).click()
    await expect(composer).toHaveValue('已有内容 /')

    await composer.fill('')
    await add.click()
    await page.getByRole('menuitem', { name: '提及' }).click()
    await expect(composer).toHaveValue('@')

    await composer.fill('')
    await add.click()
    await page.getByRole('menuitemcheckbox', { name: /Goal/ }).click()
    await expect(page.getByRole('button', { name: '关闭 Goal 模式' })).toBeVisible()
  })

  test('searches and explicitly invokes Skills from + or /skill', async () => {
    await electronApp.evaluate(({ ipcMain }) => {
      const state = globalThis as typeof globalThis & { __mingyiSkillInvocations?: unknown[] }
      state.__mingyiSkillInvocations = []

      ipcMain.removeHandler('runtime:skill:list')
      ipcMain.removeHandler('runtime:skill:search')
      ipcMain.removeHandler('runtime:skill:invoke')
      ipcMain.handle('runtime:skill:list', async () => [
        {
          name: 'security-audit',
          path: '.agents/skills/security-audit',
          description: '检查可利用的安全问题'
        }
      ])
      ipcMain.handle('runtime:skill:search', async (_event, input: { query: string }) => [
        {
          name: 'security-audit',
          path: '.agents/skills/security-audit',
          description: `匹配 ${input.query}`,
          content: '检查信任边界',
          score: 1,
          source: 'SKILL.md'
        }
      ])
      ipcMain.handle('runtime:skill:invoke', async (_event, input: unknown) => {
        state.__mingyiSkillInvocations?.push(input)
      })
    })

    const composer = page.getByLabel('发送消息')
    await page.getByRole('button', { name: '添加内容' }).click()
    await page.getByRole('menuitem', { name: /Skills/ }).click()
    await expect(page.getByRole('dialog', { name: '选择 Skill' })).toBeVisible()

    await page.getByLabel('搜索 Skills').fill('security')
    const option = page.getByRole('option', { name: /security-audit/ })
    await expect(option).toContainText('匹配 security')
    await option.click()
    await expect(page.getByRole('group', { name: '已选择 Skill' })).toContainText('security-audit')

    await composer.fill('只检查登录边界')
    await composer.press('Enter')
    await expect(page.locator('.chat-skill-activation').last()).toContainText(
      'security-audit 只检查登录边界'
    )

    await composer.fill('/')
    await expect(page.getByRole('dialog', { name: '选择 Skill' })).toBeVisible()
    await expect(page.getByRole('option', { name: /security-audit/ })).toBeVisible()
    await composer.press('Enter')
    await expect(page.getByRole('group', { name: '已选择 Skill' })).toContainText('security-audit')
    await page.getByRole('button', { name: '移除 Skill security-audit' }).click()

    await composer.fill('/skill/security-audit 检查 OAuth')
    await composer.press('Enter')
    await expect(page.locator('.chat-skill-activation').last()).toContainText(
      'security-audit 检查 OAuth'
    )

    const invocations = await electronApp.evaluate(() => {
      const state = globalThis as typeof globalThis & { __mingyiSkillInvocations?: unknown[] }
      return state.__mingyiSkillInvocations
    })
    expect(invocations).toEqual([
      expect.objectContaining({ name: 'security-audit', arguments: '只检查登录边界' }),
      expect.objectContaining({ name: 'security-audit', arguments: '检查 OAuth' })
    ])
  })

  test('shows and resolves a suspended directory access request', async () => {
    const [session] = await page.evaluate(() => window.api.sessions.list())
    expect(session).toBeDefined()

    await electronApp.evaluate(({ BrowserWindow, ipcMain }, sessionId) => {
      const state = globalThis as typeof globalThis & { __mingyiAccessResponses?: unknown[] }
      state.__mingyiAccessResponses = []
      ipcMain.removeHandler('runtime:session:respond-access')
      ipcMain.handle('runtime:session:respond-access', async (event, input: unknown) => {
        state.__mingyiAccessResponses?.push(input)
        event.sender.send('runtime:session:event', {
          type: 'access_request_resolved',
          sessionId,
          toolCallId: 'access-tool-1',
          approved: true
        })
      })
      BrowserWindow.getAllWindows()[0]?.webContents.send('runtime:session:event', {
        type: 'access_request',
        sessionId,
        request: {
          toolCallId: 'access-tool-1',
          path: '/Users/administrator/security-audit-skill/mingyi-tot',
          reason: '读取历史审计并写入报告。'
        }
      })
    }, session!.id)

    const approval = page.getByRole('group', {
      name: '目录访问请求：/Users/administrator/security-audit-skill/mingyi-tot'
    })
    await expect(approval).toBeVisible()
    await expect(approval).toContainText('读取历史审计并写入报告。')
    const dock = page.getByTestId('chat-approval-dock')
    await expect(dock).toBeVisible()
    await expect(dock.locator('.chat-approval')).toHaveCount(1)
    expect(await dock.locator('xpath=ancestor::*[contains(@class, "chat-scroll")]').count()).toBe(0)
    const approvalBox = await approval.boundingBox()
    const composerBox = await page.locator('.chat-composer').boundingBox()
    expect(approvalBox).not.toBeNull()
    expect(composerBox).not.toBeNull()
    expect(approvalBox!.y + approvalBox!.height).toBeLessThanOrEqual(composerBox!.y)
    await page.getByRole('button', { name: '允许访问' }).click()
    await expect(approval).toHaveCount(0)

    const responses = await electronApp.evaluate(() => {
      const state = globalThis as typeof globalThis & { __mingyiAccessResponses?: unknown[] }
      return state.__mingyiAccessResponses
    })
    expect(responses).toEqual([
      expect.objectContaining({
        sessionId: session!.id,
        toolCallId: 'access-tool-1',
        approved: true
      })
    ])
  })

  test('previews and removes image data without starting a paid model run', async () => {
    const image = {
      name: 'composer-preview.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64'
      )
    }

    await page.getByLabel('选择图片').setInputFiles(image)
    await expect(page.locator('.chat-composer-attachment img')).toHaveAttribute('alt', image.name)
    const preview = page.locator('.chat-composer-attachment img')
    await expect(preview).toHaveAttribute('src', /^data:image\/png;base64,/)
    await expect.poll(() => preview.evaluate((element) => element.naturalWidth)).toBe(1)
    await page.getByRole('button', { name: `移除图片 ${image.name}` }).click()
    await expect(preview).toHaveCount(0)
    expect(pageErrors).toEqual([])
  })
})
