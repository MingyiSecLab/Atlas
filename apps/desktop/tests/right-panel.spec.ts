import { expect, test, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import * as path from 'node:path'
import { runtimeTestEnv } from './runtime-env'

test.describe('Right capability panel', () => {
  let electronApp: ElectronApplication
  let page: Page
  let suiteEnv: NodeJS.ProcessEnv

  test.beforeAll(async () => {
    suiteEnv = runtimeTestEnv('right-panel')
    electronApp = await electron.launch({
      args: [path.join(__dirname, '..')],
      env: suiteEnv
    })
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await page.evaluate(() => window.api.sessions.create({ title: '右侧工作台布局' }))
    await page.reload()
    await page.getByText('右侧工作台布局', { exact: true }).first().click()
    await expect(page.locator('.chat-workspace')).toBeVisible()
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test('switches capability sections and preserves the panel shell', async () => {
    const close = page.getByTitle('关闭右侧工作台')
    if (await close.isVisible()) await close.click()
    await page.getByTitle('打开右侧工作台').click()

    const panel = page.getByTestId('right-capability-panel')
    const sectionStrip = page.getByRole('navigation', { name: '右侧工作台区段' })
    await expect(panel).toBeVisible()
    await expect(sectionStrip).toBeVisible()
    await sectionStrip.getByRole('button', { name: '渗透', exact: true }).click()
    await expect(panel.getByTestId('right-panel-pentest')).toBeVisible()

    const sections = [
      ['终端', 'right-panel-terminal'],
      ['浏览器', 'right-panel-browser'],
      ['文件', 'right-panel-files'],
      ['渗透', 'right-panel-pentest']
    ] as const
    for (const [section, testId] of sections) {
      await sectionStrip.getByRole('button', { name: section, exact: true }).click()
      await expect(panel.getByTestId(testId)).toBeVisible()
    }

    const stripBounds = await sectionStrip.boundingBox()
    expect(stripBounds).not.toBeNull()
    expect((stripBounds?.y ?? 99) + (stripBounds?.height ?? 99)).toBeLessThanOrEqual(42)

    const titleBounds = await page.locator('.topheader-task-title').boundingBox()
    expect(titleBounds).not.toBeNull()
    expect(titleBounds?.x ?? Number.POSITIVE_INFINITY).toBeLessThan(
      (page.viewportSize()?.width ?? 1280) / 3
    )
  })

  test('creates an engagement and shows the real-time blackboard canvas, tabs, and report', async () => {
    const openBtn = page.getByTitle('打开右侧工作台')
    if (await openBtn.isVisible()) {
      await openBtn.click()
    }

    const sectionStrip = page.getByRole('navigation', { name: '右侧工作台区段' })
    await sectionStrip.getByRole('button', { name: '渗透', exact: true }).click()

    const pentest = page.getByTestId('right-panel-pentest')
    await expect(pentest).toBeVisible()

    // 0. 右侧不再承载表单：测试用 IPC 建立真实 engagement。
    await page.evaluate(() =>
      window.api.pentest.create({
        title: '黑板视图验证评估',
        goal: '验证黑板实时视图数据流',
        origin: 'workspace://',
        scope: ['workspace://'],
        principal: 'security-team',
        authorizationRef: 'ENG-E2E-001'
      })
    )
    await expect(pentest.getByTestId('pentest-console')).toBeVisible()
    await expect(pentest.getByTestId('pentest-status')).toContainText('待启动')

    // 1. Tab 1: Blackboard explore view (infinite canvas with goal anchor)
    await expect(pentest.getByTestId('pentest-subtabs')).toBeVisible()
    await expect(pentest.getByTestId('pentest-explore')).toBeVisible()
    await expect(pentest.getByTestId('explore-node-goal')).toBeVisible()
    await expect(pentest.getByTestId('tree-canvas-toolbar')).toBeVisible()
    await page.screenshot({ path: 'test-results/pentest-tab-explore.png' })

    // Tree collapse / expand interaction
    const firstToggle = pentest.locator('.tree-node-toggle-btn').first()
    if (await firstToggle.isVisible()) {
      await firstToggle.click()
      await page.screenshot({ path: 'test-results/pentest-tab-explore-collapsed.png' })
      await firstToggle.click()
    }

    // 2. Tab 2: Findings view starts empty until facts pass the verification gate
    await pentest.getByTestId('pentest-tab-findings').click()
    await expect(pentest.getByTestId('pentest-findings')).toBeVisible()
    await expect(pentest.getByTestId('pentest-findings-empty')).toBeVisible()
    await page.screenshot({ path: 'test-results/pentest-tab-findings.png' })

    // 3. Tab 3: Assets view starts empty until evidence is collected
    await pentest.getByTestId('pentest-tab-assets').click()
    await expect(pentest.getByTestId('pentest-assets-empty')).toBeVisible()
    await page.screenshot({ path: 'test-results/pentest-tab-assets-vertical-tree.png' })

    // 4. Tab 4: Report view reflects the engagement snapshot
    await pentest.getByTestId('pentest-tab-report').click()
    await expect(pentest.getByTestId('pentest-report')).toBeVisible()
    await expect(pentest.getByTestId('pentest-report-copy')).toBeVisible()
    await expect(pentest.getByTestId('pentest-report-download')).toBeVisible()
    await page.screenshot({ path: 'test-results/pentest-tab-report.png' })

    // Switch back to the blackboard canvas
    await pentest.getByTestId('pentest-tab-explore').click()
    await expect(pentest.getByTestId('pentest-explore')).toBeVisible()
  })

  test('restores the engagement after an app restart instead of showing the create form', async () => {
    test.setTimeout(120_000)
    const openBtn = page.getByTitle('打开右侧工作台')
    if (await openBtn.isVisible()) await openBtn.click()
    const sectionStrip = page.getByRole('navigation', { name: '右侧工作台区段' })
    await sectionStrip.getByRole('button', { name: '渗透', exact: true }).click()
    const pentest = page.getByTestId('right-panel-pentest')
    await expect(pentest).toBeVisible()

    // 自包含准备：无任务时通过 IPC 建立 engagement（生产流程由聊天确认卡完成）。
    if (
      await pentest
        .getByTestId('pentest-chat-onboarding')
        .isVisible()
        .catch(() => false)
    ) {
      await page.evaluate(() =>
        window.api.pentest.create({
          title: '重启恢复评估',
          goal: '验证重启后 engagement 恢复',
          origin: 'workspace://',
          scope: ['workspace://'],
          principal: 'security-team',
          authorizationRef: 'ENG-RESTART'
        })
      )
    }
    await expect(pentest.getByTestId('pentest-console')).toBeVisible({ timeout: 15_000 })

    const persistedIds = await page.evaluate(() => window.api.pentest.list())
    expect(persistedIds.length).toBeGreaterThan(0)
    // 落盘是 fire-and-forget 镜像，重启前留出写盘窗口
    await page.waitForTimeout(500)

    await electronApp.close()
    electronApp = await electron.launch({
      args: [path.join(__dirname, '..')],
      env: suiteEnv
    })
    page = await electronApp.firstWindow()
    // 首窗可能在 ready-to-show 前被重建；句柄失效时回退到当前窗口列表
    if (page.isClosed()) page = electronApp.windows()[0]
    await page.waitForLoadState('domcontentloaded')

    // 重启后应用回到任务列表：先进入聊天工作区，右侧面板才存在
    const chatWorkspace = page.locator('.chat-workspace')
    if (!(await chatWorkspace.isVisible().catch(() => false))) {
      await page.getByText('右侧工作台布局', { exact: true }).first().click()
      await expect(chatWorkspace).toBeVisible({ timeout: 15_000 })
    }

    const reopened = page.getByTitle('打开右侧工作台')
    if (await reopened.isVisible()) await reopened.click()
    const strip = page.getByRole('navigation', { name: '右侧工作台区段' })
    await strip.getByRole('button', { name: '渗透', exact: true }).click()

    const restoredPanel = page.getByTestId('right-panel-pentest')
    await expect(restoredPanel.getByTestId('pentest-console')).toBeVisible({ timeout: 15_000 })
    await expect(restoredPanel.getByTestId('pentest-chat-onboarding')).toHaveCount(0)
    const restoredIds = await page.evaluate(() => window.api.pentest.list())
    expect(restoredIds).toEqual(persistedIds)
    await page.screenshot({ path: 'test-results/pentest-restored-after-restart.png' })
  })

  test('supports expand, restore and close controls', async () => {
    const openBtn = page.getByTitle('打开右侧工作台')
    if (await openBtn.isVisible()) {
      await openBtn.click()
    }
    const panel = page.getByTestId('right-capability-panel')
    await page
      .getByRole('navigation', { name: '右侧工作台区段' })
      .getByRole('button', { name: '渗透', exact: true })
      .click()
    await page.getByTitle('展开右侧工作台').click()
    await expect(panel).toHaveClass(/is-expanded/)
    await expect(panel.locator('.pentest-tab-content')).toBeVisible()
    await expect(panel.locator('.pentest-desktop-view')).toBeVisible()
    await page.screenshot({ path: 'test-results/pentest-panel-expanded.png' })

    // Capture wide screenshot of the assets view in expanded mode
    await panel.getByTestId('pentest-tab-assets').click()
    await expect(
      panel.getByTestId('pentest-assets-empty').or(panel.getByTestId('pentest-assets'))
    ).toBeVisible()
    await page.screenshot({ path: 'test-results/pentest-assets-vertical-tree-expanded.png' })
    await panel.getByTestId('pentest-tab-explore').click()

    await page.getByTitle('还原右侧工作台').click()
    await expect(panel).not.toHaveClass(/is-expanded/)

    await page.getByTitle('关闭右侧工作台').click()
    await expect(panel).toHaveCount(0)
    await expect(page.getByTitle('打开右侧工作台')).toBeVisible()
  })

  test('supports keyboard width adjustments on the resize separator', async () => {
    await page.getByTitle('打开右侧工作台').click()
    const separator = page.locator('.right-panel-resize-handle')
    const initialWidth = Number(await separator.getAttribute('aria-valuenow'))

    await separator.evaluate((element) => {
      element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    })
    await expect(separator).toHaveAttribute('aria-valuenow', String(initialWidth + 10))

    await separator.evaluate((element) => {
      element.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true })
      )
    })
    await expect(separator).toHaveAttribute(
      'aria-valuenow',
      String(Math.max(320, initialWidth - 30))
    )
  })

  test('supports browser multi-tab, omnibox, quick links and find in page', async () => {
    const openBtn = page.getByTitle('打开右侧工作台')
    if (await openBtn.isVisible()) {
      await openBtn.click()
    }

    const sectionStrip = page.getByRole('navigation', { name: '右侧工作台区段' })
    await sectionStrip.getByRole('button', { name: '浏览器', exact: true }).click()

    const browserView = page.getByTestId('right-panel-browser')
    await expect(browserView).toBeVisible()
    await expect(browserView.locator('.browser-tab-strip')).toBeVisible()

    // Add a new tab
    const addTabBtn = browserView.getByTitle('新建标签页')
    await addTabBtn.click()
    const tabs = browserView.locator('.browser-tab-item')
    await expect(tabs).toHaveCount(2)

    // Verify empty state is shown for empty tab
    const emptyState = browserView.locator('.browser-empty-state')
    await expect(emptyState).toBeVisible()

    // Click a quick link
    await browserView.getByRole('button', { name: 'Localhost (3000)' }).click()
    const omniboxInput = browserView.locator('.browser-omnibox-input').last()
    await expect(omniboxInput).toHaveValue(/^http:\/\/localhost:3000\/?$/)

    // Open more menu and trigger find
    await browserView.getByTitle('更多选项').last().click()
    const findBtn = page.getByRole('button', { name: '查找页面内容' })
    await expect(findBtn).toBeVisible()
    await findBtn.click()
    await expect(browserView.locator('.browser-find-bar')).toBeVisible()

    // Close find bar
    await browserView.getByTitle('关闭 (Esc)').click()
    await expect(browserView.locator('.browser-find-bar')).toHaveCount(0)

    // Close the second tab
    await tabs.nth(1).getByTitle('关闭标签').click()
    await expect(browserView.locator('.browser-tab-item')).toHaveCount(1)
  })

  test('supports right panel terminal multi-tab, switching, and session management', async () => {
    const openBtn = page.getByTitle('打开右侧工作台')
    if (await openBtn.isVisible()) {
      await openBtn.click()
    }

    const sectionStrip = page.getByRole('navigation', { name: '右侧工作台区段' })
    await sectionStrip.getByRole('button', { name: '终端', exact: true }).click()

    const terminalView = page.getByTestId('right-panel-terminal')
    await expect(terminalView).toBeVisible()
    await expect(terminalView.locator('.right-panel-terminal-tabs')).toBeVisible()

    // Verify initial tab exists
    const initialTabs = terminalView.locator('.terminal-tab-button')
    await expect(initialTabs).toHaveCount(1)
    await expect(initialTabs.first()).toContainText('Terminal 1')
    await expect(terminalView.locator('.right-terminal-pane.is-active')).toBeVisible()

    // Add a new tab
    const addTabBtn = terminalView.getByTitle('新建终端')
    await addTabBtn.click()

    const tabsAfterAdd = terminalView.locator('.terminal-tab-button')
    await expect(tabsAfterAdd).toHaveCount(2)
    await expect(tabsAfterAdd.nth(1)).toContainText('Terminal 2')
    await expect(tabsAfterAdd.nth(1)).toHaveClass(/is-active/)

    // Switch back to Terminal 1
    await tabsAfterAdd.first().locator('.terminal-tab-trigger').click()
    await expect(tabsAfterAdd.first()).toHaveClass(/is-active/)
    await expect(tabsAfterAdd.nth(1)).not.toHaveClass(/is-active/)

    // Close Terminal 2
    await tabsAfterAdd.nth(1).locator('.terminal-tab-close-btn').click()
    await expect(terminalView.locator('.terminal-tab-button')).toHaveCount(1)
    await expect(terminalView.locator('.terminal-tab-button').first()).toContainText('Terminal 1')
  })

  test('supports real workspace file tree, opening and editing with CodeMirror', async () => {
    // Switch to files section
    await page.getByRole('button', { name: '文件' }).click()
    const filesView = page.getByTestId('right-panel-files')
    await expect(filesView).toBeVisible()

    // Verify workspace header and tree pane are shown
    await expect(filesView.locator('.workspace-files-header')).toBeVisible()
    await expect(filesView.locator('.workspace-files-tree-pane')).toBeVisible()

    // Verify file tree items are rendered
    const fileRows = filesView.locator('.file-tree-row')
    await expect(fileRows.first()).toBeVisible({ timeout: 5000 })

    // Find a file to click (e.g. package.json or any file row)
    const fileItem = fileRows.filter({ hasText: 'package.json' }).first()
    if ((await fileItem.count()) > 0) {
      await fileItem.click()

      // Verify editor card and CodeMirror mount
      await expect(filesView.locator('.workspace-editor-card')).toBeVisible()
      await expect(filesView.locator('.cm-editor')).toBeVisible()
      await expect(filesView.locator('.cm-line').first()).toBeVisible()

      // Verify status bar shows language and line/col info
      await expect(filesView.locator('.workspace-code-editor-statusbar')).toContainText('JSON')

      // Close the editor tab
      await filesView.locator('.workspace-editor-tab-close').click()
      await expect(filesView.locator('.workspace-editor-placeholder')).toBeVisible()
    }
  })
})
