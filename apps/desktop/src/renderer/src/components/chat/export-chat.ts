import type { RuntimeSessionSnapshot } from '@mingyi/runtime'

/**
 * 将会话快照格式化为结构整洁的 Markdown 文档
 */
export function formatSessionAsMarkdown(snapshot: RuntimeSessionSnapshot): string {
  const lines: string[] = []
  const title = snapshot.title?.trim() || 'Mingyi 会话记录'
  lines.push(`# ${title}`)
  lines.push(`*导出时间: ${new Date().toLocaleString('zh-CN')}*`)
  if (snapshot.modelId) {
    lines.push(`*模型: ${snapshot.modelId}*`)
  }
  lines.push('\n---\n')

  for (const msg of snapshot.messages) {
    const roleTitle = msg.role === 'user' ? '### 👤 用户' : '### 🤖 Mingyi Agent'
    const time = msg.createdAt
      ? new Date(msg.createdAt).toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      : ''
    lines.push(`${roleTitle} ${time ? `*(${time})*` : ''}\n`)

    for (const block of msg.blocks) {
      if (block.type === 'text' && block.text) {
        lines.push(block.text)
        lines.push('')
      } else if (block.type === 'reasoning' && block.text) {
        lines.push('> **思考过程**')
        lines.push('> ' + block.text.replace(/\n/g, '\n> '))
        lines.push('')
      } else if (block.type === 'tool') {
        lines.push(`\`[工具调用: ${block.name}]\``)
        if (block.output) {
          lines.push('```')
          lines.push(
            typeof block.output === 'string' ? block.output : JSON.stringify(block.output, null, 2)
          )
          lines.push('```')
        }
        lines.push('')
      }
    }
    lines.push('\n---\n')
  }

  return lines.join('\n')
}

/**
 * 触发浏览器本地下载 Markdown 文件
 */
export function downloadMarkdownFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
