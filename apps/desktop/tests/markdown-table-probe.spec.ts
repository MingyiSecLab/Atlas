import { expect, test, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import * as path from 'node:path'
import { runtimeTestEnv } from './runtime-env'

test('inspect computed styles of a GFM table in an assistant message', async () => {
  const electronApp: ElectronApplication = await electron.launch({
    args: [path.join(__dirname, '..')],
    env: runtimeTestEnv('mdprobe')
  })
  const page: Page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.evaluate(() => window.api.sessions.create({ title: '表格探针' }))
  await page.reload()
  await page.getByText('表格探针', { exact: true }).first().click()
  await expect(page.locator('.chat-workspace')).toBeVisible()

  const [session] = await page.evaluate(() => window.api.sessions.list())
  await electronApp.evaluate(({ BrowserWindow }, sessionId) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('runtime:session:event', {
      type: 'message',
      sessionId,
      phase: 'end',
      message: {
        id: 'assistant-table-probe',
        role: 'assistant',
        blocks: [
          {
            type: 'text',
            text: '## 测试结果总览\n\n| 等级 | 防护逻辑 | 结果 | PoC |\n| --- | --- | --- | --- |\n| medium | 黑名单仅替换 && 和 ; | 绕过成功 | ip=127.0.0.1&id → uid=33(www-data) |\n| impossible | CSRF checkToken + IPv4 四段数字白名单 | 防护有效 | 127.0.0.1;id → ERROR |\n'
          }
        ],
        createdAt: new Date().toISOString()
      }
    })
  }, session!.id)

  const message = page.locator('#message-assistant-table-probe')
  await expect(message.locator('table')).toHaveCount(1)

  const info = await message.evaluate((root) => {
    const table = root.querySelector('table')!
    const cell = table.querySelector('td')!
    const wrapper = table.parentElement!
    const cs = getComputedStyle(cell)
    const ts = getComputedStyle(table)
    const chain: string[] = []
    let el: HTMLElement | null = cell
    while (el && el !== document.body) {
      chain.push(
        `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ').slice(0, 3).join('.')}`
      )
      el = el.parentElement
    }
    return {
      chain,
      tableClass: table.className,
      wrapperClass: wrapper.className,
      wrapperTag: wrapper.tagName,
      tableLayout: ts.tableLayout,
      tableWidth: ts.width,
      wrapperOverflowX: getComputedStyle(wrapper).overflowX,
      cellOverflowWrap: cs.overflowWrap,
      cellWordBreak: cs.wordBreak,
      cellText: cell.textContent
    }
  })
  console.log('PROBE', JSON.stringify(info, null, 2))

  const broken = await message.evaluate((root) => {
    const out: string[] = []
    root.querySelectorAll('td, th').forEach((c) => {
      const t = c.textContent || ''
      if (/medi|impossi/.test(t)) {
        out.push(
          `[${t}] overflow-wrap=${getComputedStyle(c).overflowWrap} word-break=${getComputedStyle(c).wordBreak}`
        )
      }
    })
    return out
  })
  console.log('CELLS', JSON.stringify(broken, null, 2))

  await electronApp.close()
})
