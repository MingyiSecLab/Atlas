import { expect, test, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import * as path from 'node:path'
import { runtimeTestEnv } from './runtime-env'

test.describe('Sidebar task actions', () => {
  let electronApp: ElectronApplication
  let page: Page

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [path.join(__dirname, '..')],
      env: runtimeTestEnv('sidebar-tasks')
    })
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test('manages tasks from the sidebar and top header menus', async () => {
    const expandSidebar = page.getByRole('button', { name: '展开侧边栏' })
    if (await expandSidebar.isVisible()) await expandSidebar.click()

    await page.evaluate(async () => {
      await window.api.sessions.create({ title: '打招呼' })
      await window.api.sessions.create({ title: '你好' })
    })
    await page.reload()
    await page.getByText('你好', { exact: true }).first().click()

    const firstMore = page.getByRole('button', { name: '任务“打招呼”的更多操作' })
    const secondMore = page.getByRole('button', { name: '任务“你好”的更多操作', exact: true })

    await firstMore.click()
    await expect(firstMore).toHaveAttribute('aria-expanded', 'true')
    await secondMore.click()
    await expect(firstMore).toHaveAttribute('aria-expanded', 'false')
    await expect(secondMore).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('menu')).toHaveCount(1)
    await page.screenshot({ path: 'test-results/sidebar-task-menu.png' })

    await page.getByRole('menuitem', { name: '置顶' }).click()
    await expect(page.locator('.sidebar-task-title').first()).toHaveText('你好')
    await expect(page.locator('.sidebar-task-pin').first()).toHaveAccessibleName('已置顶')

    await page.locator('.sidebar-task-main').first().click()
    await page.getByRole('button', { name: '任务“你好”的更多操作', exact: true }).click()
    await page.getByRole('menuitem', { name: '重命名' }).click()

    const renameInput = page.getByRole('textbox', { name: '重命名任务“你好”' })
    await expect(renameInput).toBeFocused()
    await renameInput.fill('置顶任务')
    await renameInput.press('Enter')
    await expect(page.locator('.sidebar-task-title').first()).toHaveText('置顶任务')
    await expect(page.locator('header').getByText('置顶任务', { exact: true })).toBeVisible()

    const renamedMore = page.getByRole('button', {
      name: '任务“置顶任务”的更多操作',
      exact: true
    })
    await renamedMore.click()
    await page.getByRole('menuitem', { name: '删除' }).click()
    const confirmation = page.getByRole('alertdialog', { name: '确认删除任务“置顶任务”' })
    await expect(confirmation).toContainText('此操作无法撤销')
    await confirmation.getByRole('button', { name: '取消' }).click()
    await expect(page.getByText('置顶任务', { exact: true }).first()).toBeVisible()

    await page.getByRole('menuitem', { name: '删除' }).click()
    await page
      .getByRole('alertdialog', { name: '确认删除任务“置顶任务”' })
      .getByRole('button', { name: '删除' })
      .click()

    await expect(page.getByText('置顶任务', { exact: true })).toHaveCount(0)
    await expect(
      page.getByPlaceholder(/What can I help you build|描述想让 Agent 做什么/)
    ).toBeVisible()

    await page.locator('.sidebar-task-main').first().click()
    const headerMore = page.getByRole('button', {
      name: '当前任务“打招呼”的更多操作'
    })
    await headerMore.click()
    const headerMenu = page.getByRole('menu', { name: '当前任务“打招呼”操作' })
    await expect(headerMenu).toBeVisible()
    await expect
      .poll(() => headerMenu.evaluate((element) => getComputedStyle(element).opacity))
      .toBe('1')
    await page.screenshot({ path: 'test-results/topheader-task-menu.png' })

    await page.getByRole('menuitem', { name: '重命名' }).click()
    const renameDialog = page.getByRole('dialog', { name: '重命名当前任务“打招呼”' })
    const headerRenameInput = renameDialog.getByRole('textbox', { name: '任务名称' })
    await expect(headerRenameInput).toBeFocused()
    await headerRenameInput.fill('顶部任务')
    await renameDialog.getByRole('button', { name: '保存' }).click()
    await expect(page.locator('header').getByText('顶部任务', { exact: true })).toBeVisible()
    await expect(page.locator('.sidebar-task-title').first()).toHaveText('顶部任务')

    await page.getByRole('button', { name: '全局搜索 (⌘K)' }).click()
    const searchDialog = page.getByRole('dialog', { name: '全局搜索' })
    await expect(searchDialog.getByPlaceholder('搜索对话或指令...')).toBeVisible()
    await expect(searchDialog.getByText('顶部任务', { exact: true })).toBeVisible()
    await expect(searchDialog.getByText('打招呼', { exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(searchDialog).toHaveCount(0)

    const renamedHeaderMore = page.getByRole('button', {
      name: '当前任务“顶部任务”的更多操作'
    })
    await renamedHeaderMore.click()
    await page.getByRole('menuitem', { name: '置顶' }).click()
    await expect(page.locator('.sidebar-task-pin').first()).toHaveAccessibleName('已置顶')

    await renamedHeaderMore.click()
    await page.getByRole('menuitem', { name: '删除' }).click()
    const headerDeleteConfirmation = page.getByRole('alertdialog', {
      name: '确认删除当前任务“顶部任务”'
    })
    await expect(headerDeleteConfirmation).toContainText('此操作无法撤销')
    await headerDeleteConfirmation.getByRole('button', { name: '删除' }).click()

    await expect(page.locator('.sidebar-task-empty')).toHaveText('暂无任务')
    await expect(page.getByText('顶部任务', { exact: true })).toHaveCount(0)
  })

  test('groups tasks by project space and creates tasks via the space plus button', async () => {
    const expandSidebar = page.getByRole('button', { name: '展开侧边栏' })
    if (await expandSidebar.isVisible()) await expandSidebar.click()

    // 登记一个空间，并分别创建空间内任务与临时任务
    await page.evaluate(async () => {
      await window.api.projects.create({ rootPath: '/', name: '根空间' })
      const projects = await window.api.projects.list()
      const root = projects.find((project) => project.name === '根空间')
      if (!root) throw new Error('根空间未登记')
      await window.api.sessions.create({ title: '空间内任务', projectId: root.id })
      await window.api.sessions.create({ title: '临时任务' })
    })
    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    // 等待 Provider refresh 完成（workspace 与 sessions 拉取）
    await expect
      .poll(async () => page.evaluate(() => window.api.sessions.list().then((list) => list.length)))
      .toBeGreaterThan(0)

    const spaceHeader = page.getByRole('button', { name: /空间 \(1\)/ })
    await expect(spaceHeader).toBeVisible()
    // localStorage 会保留上次运行的折叠状态；确保空间组展开
    if ((await spaceHeader.getAttribute('aria-expanded')) === 'false') await spaceHeader.click()
    const spaceGroup = page.getByRole('button', { name: '展开空间“根空间”' })
    await expect(spaceGroup).toBeVisible()

    // 空间组内出现归属任务（临时任务无 projectId，但 projectPath 同为 '/'，按路径归入根空间）
    // 展开按钮的 accessible name 同时包含计数文本
    await expect(page.getByRole('button', { name: /展开空间“根空间”/ })).toContainText('根空间 (2)')
    await expect(
      page.locator('.sidebar-task-title').filter({ hasText: '空间内任务' })
    ).toBeVisible()
    await expect(page.locator('.sidebar-task-title').filter({ hasText: '临时任务' })).toBeVisible()

    // 空间组 hover 的 + 创建携带 projectId 的新任务（回到主页待输入）
    await page.getByRole('button', { name: '在空间“根空间”中新建任务' }).click()
    await expect(
      page.getByPlaceholder(/What can I help you build|描述想让 Agent 做什么/)
    ).toBeVisible()
  })
})
