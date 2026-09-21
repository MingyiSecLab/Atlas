import { expect, test, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { runtimeTestEnv } from './runtime-env'

/** 关于页展示的版本 = __APP_VERSION__（构建期从 apps/desktop/package.json 注入）。 */
const expectedVersion = `v${
  JSON.parse(readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')).version as string
}`

test.describe('About & updates settings page', () => {
  let electronApp: ElectronApplication
  let page: Page

  test.beforeAll(async () => {
    // runtimeTestEnv 注入 MINGYI_DISABLE_UPDATE_CHECK=1：状态机保持确定性，
    // 不会因为外网可达性、GitHub 配额或仓库真实 Release 而抖动
    electronApp = await electron.launch({
      args: [path.join(__dirname, '..')],
      env: runtimeTestEnv('about-settings')
    })
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test('shows version info and reports the disabled update check', async () => {
    // 必须在手动检查之前：此时状态仍是主进程的初始缓存值
    expect(await page.evaluate(() => window.api.update.getStatus())).toEqual({ state: 'idle' })

    await page.keyboard.press('Meta+,')
    const dialog = page.getByRole('dialog', { name: '设置' })
    await expect(dialog).toBeVisible()

    await dialog
      .getByRole('navigation', { name: '设置分类' })
      .getByRole('button', { name: '关于与更新' })
      .click()
    await expect(dialog.locator('.settings-page')).toHaveAttribute('aria-label', '关于与更新')
    await expect(dialog.getByRole('heading', { name: '版本信息' })).toBeVisible()

    // 端到端验证构建期版本注入：注入失效时这里渲染不出正确值
    const facts = dialog.locator('.about-fact')
    await expect(facts).toHaveCount(2)
    await expect(facts.filter({ hasText: '当前版本' })).toContainText(expectedVersion)
    await expect(facts.filter({ hasText: '构建提交' })).toBeVisible()

    // 启动自查被 env 关停，因此首次进入停留在 idle
    const status = dialog.locator('.about-status')
    await expect(status).toHaveText('尚未检查更新。')

    // 无更新时不应出现下载入口；手动检查按钮是唯一的操作
    const actions = dialog.locator('.about-actions button')
    await expect(actions).toHaveCount(1)
    await actions.first().click()
    await expect(status).toHaveClass(/is-unavailable/)
    await expect(status).toContainText('更新检查已禁用')
    await expect(dialog.getByRole('button', { name: '前往下载' })).toHaveCount(0)
    // 检查结束后按钮回到可再次点击的状态，不会卡在 loading
    await expect(actions).toHaveCount(1)
    await expect(actions.first()).toBeEnabled()
    await expect(actions.first()).toHaveText(/检查更新/)
    await page.screenshot({ path: 'test-results/settings-about.png' })
  })

  test('rejects release URLs outside the Atlas repository', async () => {
    // openRelease 会把 URL 交给 shell.openExternal：主进程必须锁死仓库前缀，
    // 否则渲染层一旦被注入即可唤起任意链接。这里只验证拒绝路径，避免真的打开浏览器。
    const message = await page.evaluate(() =>
      window.api.update.openRelease('https://evil.example/MingyiSecLab/Atlas/releases').then(
        () => '',
        (error: Error) => error.message
      )
    )
    expect(message).toContain('Unsupported release URL')
  })
})
