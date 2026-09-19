import { expect, test, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { runtimeTestEnv } from './runtime-env'

/** 侧边栏展示的版本 = __APP_VERSION__（构建期从 apps/desktop/package.json 注入）。 */
const expectedVersion = `v${
  JSON.parse(readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')).version as string
}`

test.describe('Sidebar footer', () => {
  let electronApp: ElectronApplication
  let page: Page

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [path.join(__dirname, '..')],
      env: runtimeTestEnv('sidebar-footer')
    })
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test('shows device, notifications and version with working panels', async () => {
    const expandSidebar = page.getByTitle('展开侧边栏')
    if (await expandSidebar.isVisible()) await expandSidebar.click()

    const collapseButton = page.getByTitle('收起侧边栏')
    const searchButton = page.getByTitle('全局搜索 (⌘K)')
    const filterButton = page.getByTitle('筛选', { exact: true })
    await expect(collapseButton).toBeVisible()
    await expect(searchButton).toBeVisible()
    await expect(filterButton).toBeVisible()

    const footer = page.getByTestId('sidebar-footer')
    await expect(footer).toBeVisible()
    // 端到端验证构建期版本注入：若 define 失效这里会渲染不出版本或值不对
    await expect(footer.getByText(expectedVersion, { exact: true })).toBeVisible()
    await expect(footer.getByRole('button')).toHaveCount(2)

    const buttons = footer.getByRole('button')
    await expect(buttons.nth(0)).toHaveAccessibleName('打开本机运行环境')
    await expect(buttons.nth(1)).toHaveAccessibleName(/打开通知中心/)

    await footer.getByRole('button', { name: /打开通知中心/ }).click()
    const notifications = page.getByRole('dialog', { name: '通知中心' })
    await expect(notifications).toBeVisible()
    await expect
      .poll(async () => (await notifications.boundingBox())?.width ?? 0)
      .toBeGreaterThan(300)
    const readAll = notifications.getByRole('button', { name: '全部已读' })
    if (await readAll.isEnabled()) await readAll.click()
    await expect(notifications.getByText('已全部读完')).toBeVisible()
    await expect(footer.getByRole('button', { name: '打开通知中心' })).toBeVisible()

    await footer.getByRole('button', { name: '打开本机运行环境' }).click()
    const devicePanel = page.getByRole('dialog', { name: '本机运行环境' })
    await expect(devicePanel).toBeVisible()
    await devicePanel.getByRole('button', { name: '打开应用设置' }).click()
    await expect(page.getByRole('dialog', { name: '设置' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '模型配置', exact: true })).toBeVisible()
  })
})
