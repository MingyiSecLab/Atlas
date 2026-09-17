import { expect, test, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import * as path from 'node:path'
import { runtimeTestEnv } from './runtime-env'

const TURNS = 6

/**
 * 导轨曾经"存在但看不见"：首屏 `entries.length < 2` 让组件返回 null，挂载期的
 * effect 只读到空 ref 且永不重跑，高度停在 `100%`，而父级是 `h-0` 的 sticky 盒子，
 * 于是所有刻度被压到视口顶端裁掉。这些断言盯的是几何，不是 display —— 只查
 * DOM 是否存在（或只查 display 不为 none）当年会全绿，这正是它漏掉 bug 的原因。
 */
test.describe('Conversation rail geometry', () => {
  let electronApp: ElectronApplication
  let page: Page
  let sessionId = ''
  let originalSidebarCollapsed = 'false'

  test.beforeAll(async () => {
    const env = { ...runtimeTestEnv('conversation-rail') }
    // 本地沙箱会注入 ELECTRON_RUN_AS_NODE，让 Electron 退化成纯 Node 无法启动应用。
    delete env['ELECTRON_RUN_AS_NODE']

    electronApp = await electron.launch({ args: [path.join(__dirname, '..')], env })
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    // ⚠️ Electron 用例与外层真实应用**共享同一份 userData**（`~/.config`/Library 下的
    // mingyi-app），侧栏折叠态存在 localStorage 的 `mingyi_sidebar_collapsed` 里。
    // 不归一化就会受上一次运行/用户手动操作影响（侧栏折叠时任务标题被工作区盖住点不到），
    // 也不该把测试结果写回用户的状态 —— 所以读完原值后先展开，收尾再还原。
    originalSidebarCollapsed = await page.evaluate(
      () => window.localStorage.getItem('mingyi_sidebar_collapsed') ?? 'false'
    )
    await page.evaluate(() => {
      window.localStorage.setItem('mingyi_sidebar_collapsed', 'false')
      window.localStorage.setItem('mingyi_right_panel_open', 'false')
    })

    const created = await page.evaluate(() => window.api.sessions.create({ title: '导轨几何' }))
    sessionId = (created as { id: string }).id
    await page.reload()
  })

  test.afterAll(async () => {
    await page
      ?.evaluate((value) => {
        window.localStorage.setItem('mingyi_sidebar_collapsed', value)
        window.localStorage.setItem('mingyi_right_panel_open', 'false')
      }, originalSidebarCollapsed)
      .catch(() => undefined)
    await electronApp.close()
  })

  test('renders ticks at a real height for a multi-turn snapshot', async () => {
    const now = new Date().toISOString()
    await electronApp.evaluate(
      ({ ipcMain }, { id, createdAt, turns }) => {
        const messages: Array<Record<string, unknown>> = []
        for (let i = 1; i <= turns; i++) {
          messages.push({
            id: `user-${i}`,
            role: 'user',
            blocks: [{ type: 'text', text: `第 ${i} 轮用户提问，用于验证导轨索引` }],
            createdAt
          })
          messages.push({
            id: `assistant-${i}`,
            role: 'assistant',
            blocks: [{ type: 'text', text: `第 ${i} 轮回答内容` }],
            modelName: 'claude-sonnet-5',
            createdAt
          })
        }
        ipcMain.removeHandler('runtime:session:get')
        ipcMain.handle('runtime:session:get', async () => ({
          id,
          title: '导轨几何',
          pinned: false,
          createdAt,
          updatedAt: createdAt,
          modelId: null,
          modeId: 'pentest',
          isRunning: false,
          messages,
          accessRequests: []
        }))
      },
      { id: sessionId, createdAt: now, turns: TURNS }
    )

    await page.getByText('导轨几何', { exact: true }).first().click()
    await expect(page.locator('.chat-workspace')).toBeVisible()
    await expect(page.locator('.chat-user-message')).toHaveCount(TURNS)

    // 外层是 sticky h-0 垫片（不占流内空间），可见性只能看里面的 nav。
    const rail = page.locator("[data-slot='conversation-map-rail']")
    const nav = page.locator("[data-slot='conversation-map']")
    await expect(rail).toHaveCount(1)
    await expect(nav).toBeVisible()

    // 1. 导轨拿到了滚动视口的真实高度，而不是 h-0 父级传下来的 0。
    const viewportHeight = await page
      .locator('.chat-scroll')
      .evaluate((element) => element.clientHeight)
    const navBox = await nav.boundingBox()
    expect(navBox).not.toBeNull()
    expect(navBox!.height).toBeGreaterThan(viewportHeight - 120)

    // 2. 刻度数量跟随轮次。
    const ticks = page.locator("[data-slot='conversation-map-tick']")
    await expect(ticks).toHaveCount(TURNS)

    // 3. 每个刻度都落在视口内、且纵向错开 —— 这就是那个被裁掉的失败态。
    const scrollBox = await page.locator('.chat-scroll').boundingBox()
    const tickBoxes = await ticks.evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.querySelector('span')!.getBoundingClientRect()
        return { y: box.y, height: box.height }
      })
    )
    expect(tickBoxes).toHaveLength(TURNS)
    for (const tick of tickBoxes) {
      expect(tick.height).toBeGreaterThanOrEqual(2)
      expect(tick.y).toBeGreaterThanOrEqual(scrollBox!.y)
      expect(tick.y).toBeLessThanOrEqual(scrollBox!.y + scrollBox!.height)
    }
    const distinct = new Set(tickBoxes.map((tick) => Math.round(tick.y)))
    expect(distinct.size).toBe(TURNS)
    expect(
      Math.max(...tickBoxes.map((t) => t.y)) - Math.min(...tickBoxes.map((t) => t.y))
    ).toBeGreaterThan(TURNS * 6)

    console.log(
      `\n[rail] viewport=${viewportHeight} nav=${Math.round(navBox!.height)} ` +
        `ticks=${tickBoxes.map((t) => `${Math.round(t.y)}/${t.height}`).join(' ')}`
    )

    // 4. 导轨坐在消息列左侧的空隙里，不是贴在对话区最左缘（px-3 曾被全局 reset 吃掉）。
    const railBodyBox = await page.locator("[data-slot='conversation-map']").evaluate((element) => {
      const style = getComputedStyle(element.parentElement!)
      return { paddingLeft: style.paddingLeft, paddingTop: style.paddingTop }
    })
    expect(railBodyBox).toEqual({ paddingLeft: '12px', paddingTop: '40px' })

    await page.screenshot({ path: 'test-results/conversation-rail.png' })
  })

  test('hides the rail when the chat column loses its side gutter', async () => {
    const nav = page.locator("[data-slot='conversation-map']")
    const panel = page.getByTestId('right-capability-panel')

    if (!(await panel.isVisible())) await page.getByTitle('打开右侧工作台').click()
    await expect(panel).toBeVisible()
    await expect(nav).toBeHidden()

    await page.getByTitle('关闭右侧工作台').click()
    await expect(nav).toBeVisible()
  })

  test('stays anchored to the chat column edge when the sidebar is collapsed', async () => {
    const nav = page.locator("[data-slot='conversation-map']")
    const workspace = page.locator('.chat-workspace')

    const before = await workspace.boundingBox()
    await page.getByTitle('收起侧边栏').click()
    await expect(workspace).not.toHaveCSS('width', `${before!.width}px`)
    // 侧栏宽度是带过渡的，量早了会拿到中间值。
    await page.waitForTimeout(600)

    // 侧栏收起后空隙变宽，导轨依然可见且仍贴着对话区左缘。
    const workspaceBox = await workspace.boundingBox()
    const navBox = await nav.boundingBox()
    expect(workspaceBox!.width).toBeGreaterThan(before!.width)
    await expect(nav).toBeVisible()
    expect(navBox!.x - workspaceBox!.x).toBe(12)

    console.log(
      `\n[rail] sidebar: ${Math.round(before!.width)}px → ${Math.round(workspaceBox!.width)}px ` +
        `(x=${Math.round(workspaceBox!.x)}, nav x=${Math.round(navBox!.x)}, ` +
        `gutter=${Math.round((workspaceBox!.width - 760) / 2)})`
    )
    await page.screenshot({ path: 'test-results/conversation-rail-sidebar-collapsed.png' })
  })
})
