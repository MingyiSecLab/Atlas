import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import type { Extension } from '@codemirror/state'

export function getLanguageExtension(filename: string): {
  extension: Extension | null
  label: string
} {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'ts':
      return { extension: javascript({ typescript: true }), label: 'TypeScript' }
    case 'tsx':
      return { extension: javascript({ typescript: true, jsx: true }), label: 'TypeScript React' }
    case 'js':
    case 'mjs':
    case 'cjs':
      return { extension: javascript(), label: 'JavaScript' }
    case 'jsx':
      return { extension: javascript({ jsx: true }), label: 'JavaScript React' }
    case 'json':
      return { extension: json(), label: 'JSON' }
    case 'py':
      return { extension: python(), label: 'Python' }
    case 'md':
    case 'markdown':
      return { extension: markdown(), label: 'Markdown' }
    case 'html':
    case 'htm':
      return { extension: html(), label: 'HTML' }
    case 'css':
    case 'scss':
    case 'less':
      return { extension: css(), label: 'CSS' }
    default:
      return { extension: null, label: ext ? ext.toUpperCase() : 'Plain Text' }
  }
}
