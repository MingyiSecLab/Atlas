#!/usr/bin/env node
/**
 * Release tag ↔ 桌面端版本一致性门禁。
 *
 * 版本的单一来源是 apps/desktop/package.json 的 version 字段：electron-builder
 * 用它命名安装包，electron-vite 构建时把它注入渲染层（__APP_VERSION__）。
 * Release tag 若与该字段不一致，会出现"tag 是 v0.2.0、安装包叫 1.0.0、
 * 界面里也显示 v1.0.0"的三方漂移 —— 这个门禁在廉价的 preflight 阶段直接拦下。
 *
 * 用法：RELEASE_TAG=v1.2.3 node validate-release-tag.mjs（由 release.yml 调用）
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const tag = (process.env.RELEASE_TAG ?? '').trim()
if (!tag) {
  console.error('::error::RELEASE_TAG 未设置，无法校验发布版本。')
  process.exit(1)
}

// 与 docs/release-guide.md 的 SemVer 规范一致：v<MAJOR>.<MINOR>.<PATCH>[-预发布标识]
const semver = /^(v)?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/
const match = semver.exec(tag)
if (!match) {
  console.error(
    `::error::Release tag "${tag}" 不符合 SemVer 规范（期望形如 v1.2.3 或 v1.2.3-beta.1），请修正后重新触发。`
  )
  process.exit(1)
}
const tagVersion = `${match[2]}.${match[3]}.${match[4]}${match[5] ? `-${match[5]}` : ''}`

const pkgVersion = JSON.parse(readFileSync(resolve('apps/desktop/package.json'), 'utf8')).version
if (tagVersion !== pkgVersion) {
  console.error(
    `::error::Release tag (${tagVersion}) 与 apps/desktop/package.json 的 version (${pkgVersion}) 不一致。\n` +
      '请先把 apps/desktop/package.json 的 version 更新为发布版本并提交，再触发 Release 流水线；\n' +
      '否则安装包命名与界面显示的版本都会与 Release tag 漂移。'
  )
  process.exit(1)
}

console.log(`Release tag 校验通过：${tag} ↔ apps/desktop@${pkgVersion}`)
