import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'

/**
 * 全局 `* { margin: 0; padding: 0 }` 必须是「层内」声明。
 *
 * 它曾经是无层规则，而无层声明优先级高于任何 @layer，包括 Tailwind v4 的
 * @layer utilities —— 结果全应用所有只设置 margin/padding 的工具类
 * （px-*、py-*、p-*、m-* 系列）静默失效，表现就是内容贴边、输入框撑不开。
 * 修复方式是把重置搬进 @layer base（与 Tailwind preflight 同层，参考
 * tests/linkcode/apps/desktop/src/renderer/src/index.css 的做法）。
 *
 * 这个守卫不启动 Electron，纯文本解析 main.css：
 * 1. 层外不能残留通用重置；
 * 2. 层内必须存在通用重置（防止有人直接删掉导致全站默认间距回归）。
 */
const MAIN_CSS = path.resolve(__dirname, '../src/renderer/src/assets/main.css')

const UNIVERSAL_RESET = /\*\s*\{[^}]*margin:\s*0[^}]*padding:\s*0[^}]*\}/s

interface LayerBlock {
  name: string
  body: string
}

/** 去掉 CSS 注释：注释里出现 `@layer` 字样会干扰下面的层块解析。 */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

function collectLayerBlocks(source: string): { rest: string; blocks: LayerBlock[] } {
  const css = stripComments(source)
  const blocks: LayerBlock[] = []
  let rest = ''
  let index = 0

  while (index < css.length) {
    const layerIndex = css.indexOf('@layer', index)
    if (layerIndex === -1) {
      rest += css.slice(index)
      break
    }
    rest += css.slice(index, layerIndex)

    const open = css.indexOf('{', layerIndex)
    if (open === -1) {
      rest += css.slice(layerIndex)
      break
    }

    let depth = 0
    let cursor = open
    for (; cursor < css.length; cursor += 1) {
      if (css[cursor] === '{') depth += 1
      else if (css[cursor] === '}') {
        depth -= 1
        if (depth === 0) {
          cursor += 1
          break
        }
      }
    }

    blocks.push({
      name: css.slice(layerIndex, open).trim(),
      body: css.slice(open + 1, cursor - 1)
    })
    index = cursor
  }

  return { rest, blocks }
}

test.describe('main.css 全局重置的级联层位置', () => {
  const css = readFileSync(MAIN_CSS, 'utf8')
  const { rest, blocks } = collectLayerBlocks(css)

  test('层外没有通用 margin/padding 重置', () => {
    expect(UNIVERSAL_RESET.test(rest)).toBe(false)
  })

  test('重置位于 @layer base 内', () => {
    const resetBlocks = blocks.filter((block) => UNIVERSAL_RESET.test(block.body))
    expect(resetBlocks.length).toBeGreaterThan(0)
    for (const block of resetBlocks) {
      expect(block.name).toMatch(/^@layer\s+base\b/)
    }
  })
})

/**
 * 消息列宽度锁。
 *
 * `.chat-assistant-message` 的 align-items: flex-start 让子项在纵向 flex 里不再横向
 * 拉伸，宽度退化成 fit-content；工具输出是 `<pre>`（white-space: pre），min-content
 * 等于最长行且不可断行，于是 fit-content 被顶到远超消息列（实测 704px 列被撑到
 * 1846px）：思路分析卡片被挤出屏幕（看着像"不换行"），OUTPUT 框自己也跟着变宽，
 * 它那层 overflow-x-auto 因此没有可滚区域 —— 也就是没有横向滚动条。
 * 显式 width: 100% 是唯一能把它锁回消息列宽度的写法（min-w-0 在交叉轴上不生效）。
 */
test.describe('assistant 消息列宽度锁', () => {
  const css = readFileSync(MAIN_CSS, 'utf8')

  test('块容器被显式锁定为 100% 宽度', () => {
    const stripped = stripComments(css)
    // 规则允许引号风格差异与多选择器合并（blocks 与 footer 可能共用一条规则）
    const slotRule = (slot: string): RegExp =>
      new RegExp(`\\.chat-message\\s*>\\s*\\[data-slot=['"]${slot}['"]\\]([^{}]*)\\{([^}]*)\\}`)

    const blocks = slotRule('aui-assistant-message-blocks').exec(stripped)
    expect(
      blocks,
      '缺少 .chat-message > [data-slot="aui-assistant-message-blocks"] 规则'
    ).toBeTruthy()
    expect(blocks![2]).toMatch(/(^|[;\s])width:\s*100%\s*;?/)

    const footer = slotRule('aui-assistant-message-footer').exec(stripped)
    expect(
      footer,
      '缺少 .chat-message > [data-slot="aui-assistant-message-footer"] 规则'
    ).toBeTruthy()
    expect(footer![2]).toMatch(/(^|[;\s])width:\s*100%\s*;?/)
  })
})
