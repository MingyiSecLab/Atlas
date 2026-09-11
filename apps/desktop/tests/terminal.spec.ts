import { expect, test, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import * as path from 'node:path'
import { runtimeTestEnv } from './runtime-env'

test.describe('Terminal', () => {
  let electronApp: ElectronApplication
  let page: Page

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [path.join(__dirname, '..')],
      env: runtimeTestEnv('terminal')
    })
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test.beforeEach(async () => {
    const panel = page.getByTestId('terminal-panel')
    if ((await panel.getAttribute('data-open')) === null) {
      await page.keyboard.press('Meta+J')
    }
    await expect(panel).toHaveAttribute('data-open', '', { timeout: 10_000 })
    await expect(
      panel.locator('.terminal-content-active [data-keyboard-shortcut-local]')
    ).toBeVisible({ timeout: 10_000 })
  })

  test('opens one interactive pane without split controls', async () => {
    const panel = page.getByTestId('terminal-panel')
    await expect(panel.getByRole('tab')).toHaveCount(1)
    await expect(panel.locator('.restty-pane-border, .restty-resize-handle')).toHaveCount(0)
    await expect(panel.locator('.terminal-content-active [data-pane-id]')).toHaveCount(1)
    const canvas = panel.locator('.terminal-content-active canvas').first()
    await expect(canvas).toBeVisible()
    await expect(panel.locator('.terminal-content-active [data-terminal-ready]')).toHaveCount(1)
    await expect.poll(() => canvas.evaluate((node) => node.width * node.height)).toBeGreaterThan(0)
  })

  test('keeps terminal sessions mounted when switching tabs', async () => {
    const panel = page.getByTestId('terminal-panel')
    await panel.getByRole('button', { name: '新建终端标签' }).click()
    await expect(panel.getByRole('tab')).toHaveCount(2)
    await expect(panel.locator('[data-keyboard-shortcut-local]')).toHaveCount(2)

    const tabs = panel.getByRole('tab')
    await tabs.nth(0).click()
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true')
    await expect(panel.locator('.terminal-content-active')).toHaveCount(1)
    await tabs.nth(1).click()
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
    await expect(panel.locator('[data-keyboard-shortcut-local]')).toHaveCount(2)
  })

  test('closing the active tab selects a neighboring session', async () => {
    const panel = page.getByTestId('terminal-panel')
    const tabCount = await panel.getByRole('tab').count()
    if (tabCount < 2) await panel.getByRole('button', { name: '新建终端标签' }).click()

    const activeTab = panel.getByRole('tab', { selected: true })
    const label = (await activeTab.textContent())?.trim() ?? ''
    await panel.getByRole('button', { name: `关闭${label}` }).click()
    await expect(panel.getByRole('tab', { selected: true })).toHaveCount(1)
  })

  test('theme changes are applied to every resident terminal', async () => {
    const frames = page.getByTestId('terminal-panel').locator('[data-keyboard-shortcut-local]')
    await page.keyboard.press('Meta+,')
    const settings = page.getByRole('dialog', { name: '设置' })
    await settings.getByRole('button', { name: '终端' }).click()
    await settings.getByLabel('终端配色主题').selectOption('system')
    await page.keyboard.press('Escape')
    await page.evaluate(() => document.documentElement.classList.remove('dark'))
    await expect
      .poll(() => frames.first().evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe('rgb(255, 255, 255)')
    const before = await frames
      .first()
      .evaluate((element) => getComputedStyle(element).backgroundColor)
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await expect
      .poll(() => frames.first().evaluate((element) => getComputedStyle(element).backgroundColor))
      .not.toBe(before)
  })

  test('maximizes, restores and closes without disposing tabs', async () => {
    const panel = page.getByTestId('terminal-panel')
    const tabCount = await panel.getByRole('tab').count()
    const initial = await panel.boundingBox()

    await panel.getByRole('button', { name: '最大化面板' }).click()
    await expect(panel).toHaveAttribute('data-maximized', '')
    await expect
      .poll(async () => (await panel.boundingBox())?.height ?? 0)
      .toBeGreaterThan((initial?.height ?? 0) + 100)

    await panel.getByRole('button', { name: '还原面板' }).click()
    await expect(panel).not.toHaveAttribute('data-maximized', '')
    await panel.getByRole('button', { name: '关闭终端', exact: true }).click()
    await expect(panel).not.toHaveAttribute('data-open', '')
    const residentCanvas = panel.locator('canvas').first()
    await residentCanvas.evaluate((canvas) => canvas.setAttribute('data-resident-canvas', ''))

    await page.keyboard.press('Meta+J')
    await expect(panel).toHaveAttribute('data-open', '')
    await expect(panel.getByRole('tab')).toHaveCount(tabCount)
    await expect(panel.locator('canvas[data-resident-canvas]')).toHaveCount(1)
  })
})
