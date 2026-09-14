/**
 * 清洗 Markdown 文本，去除表格语法、代码块标记、HTML 标签等，
 * 提取用于对话导轨 (ConversationMap) 和预览卡片的纯净摘要。
 */
export function cleanMarkdownPreview(markdown?: string, maxLength = 160): string {
  if (!markdown) return ''

  const cleaned = markdown
    // 1. 去除代码块 ```...```，保留首行提示
    .replace(/```[\s\S]*?```/g, (match) => {
      const inner = match
        .replace(/```[a-zA-Z0-9_-]*\n?/, '')
        .replace(/```$/, '')
        .trim()
      const firstLine = inner.split('\n')[0]?.trim()
      return firstLine ? ` [代码: ${firstLine}] ` : ' [代码块] '
    })
    // 2. 去除表格表头对齐线，如 |---|---| 或 | :--- | :---: |
    .replace(/\|?\s*[: -]{2,}\s*\|[\s:|-]*/g, ' ')
    // 3. 将表格管道符转换为自然空格
    .replace(/\|/g, ' ')
    // 4. 去除 Markdown 标题符号
    .replace(/^#{1,6}\s+/gm, '')
    // 5. 去除图片语法 ![alt](url)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, ' [图片] ')
    // 6. 去除链接语法 [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // 7. 去除粗体、斜体、删除线 **text** / *text* / ~~text~~
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1')
    // 8. 去除内联代码 `code`
    .replace(/`([^`]+)`/g, '$1')
    // 9. 去除引用标记 >
    .replace(/^>\s*/gm, '')
    // 10. 去除无序列表/有序列表前缀 - [ ] / - / * / 1.
    .replace(/^[-*+]\s+(\[[ xX]\]\s+)?/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    // 11. 去除 HTML 标签
    .replace(/<[^>]+>/g, '')
    // 12. 合并多余换行与空格
    .replace(/\s+/g, ' ')
    .trim()

  if (cleaned.length > maxLength) {
    return cleaned.slice(0, maxLength) + '…'
  }
  return cleaned
}
