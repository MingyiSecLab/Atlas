import { readFileSync } from 'node:fs'
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * 构建期注入的版本信息（单一来源：apps/desktop/package.json 的 version 字段）。
 * CI 的 release 流水线在 preflight 门禁里强制 release tag 与该字段一致，
 * 因此渲染层展示的版本、安装包命名、GitHub Release tag 三者天然对齐；
 * GIT_COMMIT 由 release.yml 的 build job 注入，用于定位安装包对应的提交。
 */
const pkg: { version: string } = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
const buildCommit = process.env.GIT_COMMIT?.slice(0, 10) ?? ''

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    define: {
      __APP_VERSION__: JSON.stringify(`v${pkg.version}`),
      __BUILD_COMMIT__: JSON.stringify(buildCommit)
    },
    server: {
      port: 5174,
      strictPort: true
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
