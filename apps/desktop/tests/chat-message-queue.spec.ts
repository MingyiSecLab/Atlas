import { expect, test, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import * as path from 'node:path'
import { runtimeTestEnv } from './runtime-env'

test.describe('Chat Message Queue', () => {
  let electronApp: ElectronApplication
  let page: Page

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [path.join(__dirname, '..')],
      env: runtimeTestEnv('chat-queue')
    })
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await page.evaluate(() => window.api.sessions.create({ title: '队列功能测试' }))
    await page.reload()
    await page.getByText('队列功能测试', { exact: true }).first().click()
    await expect(page.locator('.chat-workspace')).toBeVisible()
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test('queues messages when busy, supports steer, cancel, and clear all', async () => {
    // 模拟 send-message 挂起，使当前任务保持在 isRunning (streaming) 状态
    await electronApp.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('runtime:session:send-message')
      ipcMain.handle('runtime:session:send-message', () => new Promise(() => {}))
    })

    const composer = page.getByLabel('发送消息')

    // 1. 发送正在执行的首条消息（使其进入 isRunning: true 状态）
    await composer.fill('正在运行的初始任务')
    await composer.press('Enter')
    await expect(page.locator('.chat-user-message').first()).toContainText('正在运行的初始任务')

    // 2. 在 busy 状态下提交第一条排队任务 A
    await composer.fill('排队任务 A')
    await composer.press('Enter')

    // 验证队列容器出现，并展示任务 A
    const queueContainer = page.locator('.message-queue-container')
    await expect(queueContainer).toBeVisible()
    await expect(page.locator('.message-queue-header-count')).toContainText('1 条待处理')
    await expect(page.locator('.message-queue-item').first()).toContainText('排队任务 A')

    // 3. 提交第二条排队任务 B
    await composer.fill('排队任务 B')
    await composer.press('Enter')

    await expect(page.locator('.message-queue-header-count')).toContainText('2 条待处理')
    const items = page.locator('.message-queue-item')
    await expect(items).toHaveCount(2)
    await expect(items.nth(0)).toContainText('排队任务 A')
    await expect(items.nth(1)).toContainText('排队任务 B')

    // 4. 提交第三条排队任务 C
    await composer.fill('排队任务 C (需要优先)')
    await composer.press('Enter')
    await expect(items).toHaveCount(3)

    // 5. 测试插队优先功能 (Steer)：将第三条任务优先插到首位
    const steerBtn = items.nth(2).getByRole('button', { name: /优先插队/ })
    await expect(steerBtn).toBeVisible()
    await steerBtn.click()

    // 验证首位变成任务 C
    await expect(items.nth(0)).toContainText('排队任务 C (需要优先)')
    await expect(items.nth(1)).toContainText('排队任务 A')
    await expect(items.nth(2)).toContainText('排队任务 B')

    // 6. 测试单项取消功能 (Cancel item)：移除任务 A
    const cancelBtn = items.nth(1).getByRole('button', { name: /移除/ })
    await cancelBtn.click()

    await expect(items).toHaveCount(2)
    await expect(items.nth(0)).toContainText('排队任务 C (需要优先)')
    await expect(items.nth(1)).toContainText('排队任务 B')

    // 6.5 测试直接编辑 Prompt 功能 (Edit item prompt)
    const editBtn = items.nth(1).getByRole('button', { name: /编辑排队任务/ })
    await editBtn.click()
    const editModal = page.locator('.message-queue-edit-modal')
    await expect(editModal).toBeVisible()
    const editTextarea = editModal.locator('textarea')
    await expect(editTextarea).toHaveValue('排队任务 B')

    // 修改为新提示词并保存
    await editTextarea.fill('排队任务 B (已编辑修改)')
    await page.getByRole('button', { name: '保存修改' }).click()

    // 确认模态框关闭且队列文本更新
    await expect(editModal).toHaveCount(0)
    await expect(items.nth(1)).toContainText('排队任务 B (已编辑修改)')

    // 7. 测试折叠与展开
    const toggleCollapseBtn = page.getByRole('button', { name: '收起排队列表' })
    await toggleCollapseBtn.click()
    await expect(page.locator('.message-queue-list')).toHaveCount(0)

    const toggleExpandBtn = page.getByRole('button', { name: '展开排队列表' })
    await toggleExpandBtn.click()
    await expect(page.locator('.message-queue-list')).toBeVisible()

    // 8. 测试清空全部 (Clear all)
    const clearAllBtn = page.getByRole('button', { name: /清空/ })
    await clearAllBtn.click()

    await expect(queueContainer).toHaveCount(0)
  })
})
