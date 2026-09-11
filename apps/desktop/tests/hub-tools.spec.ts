import { expect, test, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import * as path from 'node:path'
import { runtimeTestEnv } from './runtime-env'

test.describe('Hub and Tools tab', () => {
  let electronApp: ElectronApplication
  let page: Page

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [path.join(__dirname, '..')],
      env: runtimeTestEnv('hub-tools')
    })
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test('navigates to Hub and interacts with Tools tab', async () => {
    const expandSidebarBtn = page.locator('button[title="展开侧边栏"]')
    if (await expandSidebarBtn.isVisible()) {
      await expandSidebarBtn.click()
      await page.waitForTimeout(300)
    }

    // 1. Click '专家·技能·工具' in sidebar
    const hubNav = page.locator('aside').getByText('专家·技能·连接器')
    await expect(hubNav).toBeVisible()
    await hubNav.click()

    // 2. Check TopHeader Hub tabs
    const expertTab = page.getByRole('button', { name: '专家', exact: true })
    const skillTab = page.getByRole('button', { name: '技能', exact: true })
    const toolTab = page.getByRole('button', { name: '连接器', exact: true })

    await expect(expertTab).toBeVisible()
    await expect(skillTab).toBeVisible()
    await expect(toolTab).toBeVisible()

    // 3. Switch to Tools tab
    await toolTab.click()
    await expect(toolTab).toHaveClass(/is-active/)

    // 4. Verify the connectors card grid and custom connector modal
    const connectorCard = page.locator('.connector-card').filter({ hasText: '网站安全监测' })
    await expect(connectorCard).toBeVisible()

    await page.getByRole('button', { name: '自定义连接器' }).click()
    await expect(page.getByRole('heading', { name: '编辑 MCP 配置' })).toBeVisible()
    await page.getByRole('button', { name: '关闭' }).click()

    // 5. Test search filter on tools
    const searchInput = page.locator('.hub-header-search-input')
    await expect(searchInput).toHaveAttribute('placeholder', '搜索连接器名称或功能描述')
    await searchInput.fill('不存在的连接器搜索词')

    await expect(page.getByText('未搜索到匹配的连接器')).toBeVisible()

    // Clear search
    const clearBtn = page.getByRole('button', { name: '清空搜索' })
    await clearBtn.click()
    await expect(connectorCard).toBeVisible()
  })
})

test.describe('Built-in skills', () => {
  let electronApp: ElectronApplication
  let page: Page

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [path.join(__dirname, '..')],
      env: runtimeTestEnv('hub-built-in-skills')
    })
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test('shows the website security monitoring in connectors tab and not in skills', async () => {
    const expandSidebarBtn = page.locator('button[title="展开侧边栏"]')
    if (await expandSidebarBtn.isVisible()) await expandSidebarBtn.click()
    await page.locator('aside').getByText('专家·技能·连接器').click()
    await page.getByRole('button', { name: '技能', exact: true }).click()

    // Verified: No longer in skills
    const skillCard = page.locator('.hub-card').filter({ hasText: '网站安全监测' })
    await expect(skillCard).toHaveCount(0)

    // Verified: In connectors as light card
    await page.getByRole('button', { name: '连接器', exact: true }).click()
    const connectorCard = page.locator('.connector-card').filter({ hasText: '网站安全监测' })
    await expect(connectorCard).toBeVisible()
    await expect(connectorCard).toContainText('HTTPS')
    await expect(connectorCard).toContainText('TLS')
    await expect(connectorCard).toContainText('5 个工具')
  })
})
