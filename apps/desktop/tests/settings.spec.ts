import { expect, test, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import * as path from 'node:path'
import { runtimeTestEnv } from './runtime-env'

test.describe('Settings', () => {
  let electronApp: ElectronApplication
  let page: Page

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [path.join(__dirname, '..')],
      env: {
        ...runtimeTestEnv('settings'),
        MINIMAX_API_KEY: 'test-minimax-key',
        OPENAI_API_KEY: 'test-openai-key'
      }
    })
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test.beforeEach(async () => {
    if ((await page.getByRole('dialog', { name: '设置' }).count()) === 0) {
      await page.keyboard.press('Meta+,')
    }
    await expect(page.getByRole('dialog', { name: '设置' })).toBeVisible()
  })

  test('renders grouped navigation and the general settings sections', async () => {
    const dialog = page.getByRole('dialog', { name: '设置' })
    const nav = dialog.getByRole('navigation', { name: '设置分类' })

    await expect(nav.getByText('个人', { exact: true })).toBeVisible()
    await expect(nav.getByText('集成', { exact: true })).toBeVisible()
    // 个人(基础/记忆/终端/通知) + 集成(模型服务/连接器) = 6 个导航项
    await expect(nav.getByRole('button')).toHaveCount(6)
    await expect(dialog.locator('.settings-page')).toHaveAttribute('aria-label', '基础设置')
    await expect(dialog.getByRole('heading', { name: '模型配置' })).toBeVisible()
    await expect(dialog.getByRole('heading', { name: '安全中心' })).toBeVisible()
    await page.waitForTimeout(200)
    await page.screenshot({ path: 'test-results/settings-general.png' })

    const model = dialog.getByLabel('默认模型')
    await model.selectOption('auto')
    await expect(model).toHaveValue('auto')

    const workspaceOnly = dialog.getByRole('switch', { name: '仅限工作区' })
    const before = await workspaceOnly.getAttribute('aria-checked')
    await workspaceOnly.click()
    await expect(workspaceOnly).toHaveAttribute(
      'aria-checked',
      before === 'true' ? 'false' : 'true'
    )
  })

  test('navigates terminal, notifications and integration pages', async () => {
    const dialog = page.getByRole('dialog', { name: '设置' })
    const nav = dialog.getByRole('navigation', { name: '设置分类' })

    await nav.getByRole('button', { name: '终端' }).click()
    await expect(dialog.locator('.settings-page')).toHaveAttribute('aria-label', '终端设置')
    await expect(dialog.getByRole('heading', { name: '终端偏好', exact: true })).toBeVisible()
    await page.waitForTimeout(200)
    await page.screenshot({ path: 'test-results/settings-terminal.png' })
    const fontSize = dialog.getByLabel('终端字体大小')
    await expect(fontSize).toBeVisible()
    await fontSize.fill('16')
    await expect(dialog.getByText('16px', { exact: true })).toBeVisible()
    await dialog.getByLabel('终端配色主题').selectOption('dark')

    await page.keyboard.press('Meta+J')
    const terminalPanel = page.getByTestId('terminal-panel')
    await expect(terminalPanel).toHaveAttribute('data-open', '')
    await expect(
      terminalPanel.locator('.terminal-content-active [data-terminal-ready]')
    ).toHaveCount(1)
    await expect
      .poll(() =>
        terminalPanel
          .locator('.terminal-content-active [data-keyboard-shortcut-local]')
          .evaluate((node) => getComputedStyle(node).backgroundColor)
      )
      .toBe('rgb(13, 17, 23)')
    await page.keyboard.press('Meta+J')

    await nav.getByRole('button', { name: '通知' }).click()
    await expect(dialog.locator('.settings-page')).toHaveAttribute('aria-label', '通知设置')
    await expect(dialog.getByRole('heading', { name: '通知总开关', exact: true })).toBeVisible()
    await page.waitForTimeout(200)
    await page.screenshot({ path: 'test-results/settings-notifications.png' })
    await expect(dialog.getByRole('switch', { name: '允许桌面通知' })).toBeVisible()

    await nav.getByRole('button', { name: '模型服务' }).click()
    await expect(dialog.locator('.settings-page')).toHaveAttribute('aria-label', '模型服务设置')
    await expect(dialog.getByRole('heading', { name: '模型服务', exact: true })).toHaveCount(0)
    await expect(dialog.getByText('配置可供助理使用的模型服务。')).toHaveCount(0)
    const providerPayload = await page.evaluate(() => window.api.providers.list())
    expect(providerPayload.length).toBeGreaterThan(0)
    expect(
      providerPayload.every((provider) => !('key' in provider) && !('token' in provider))
    ).toBe(true)

    const configuredProviderIds = providerPayload
      .filter((provider) => provider.source !== 'none')
      .map((provider) => provider.provider)
    const configuredProvider = providerPayload.find((provider) => provider.source !== 'none')
    const unconfiguredProvider = providerPayload.find((provider) => provider.source === 'none')
    await expect(dialog.locator('.settings-provider-row')).toHaveCount(configuredProviderIds.length)
    await expect(dialog.locator('.settings-provider-list input')).toHaveCount(0)

    if (configuredProvider) {
      await dialog.getByRole('button', { name: `管理模型服务：${configuredProvider.name}` }).click()
      const manageDialog = page.getByRole('dialog', {
        name: `管理模型服务：${configuredProvider.name}`
      })
      await expect(manageDialog).toBeVisible()
      await expect(manageDialog.getByLabel(`${configuredProvider.name} API Key`)).toBeVisible()
      await page.waitForTimeout(200)
      await page.screenshot({ path: 'test-results/provider-manage.png' })
      await manageDialog.getByRole('button', { name: '关闭模型服务管理' }).click()
      await expect(manageDialog).toHaveCount(0)
    }

    await dialog.getByRole('button', { name: '添加', exact: true }).click()
    const addDialog = page.getByRole('dialog', { name: '添加模型服务' })
    await expect(addDialog).toBeVisible()
    const providerSelect = addDialog.getByLabel('选择模型供应商')
    await expect(providerSelect).toBeVisible()
    if (unconfiguredProvider) {
      await expect(
        providerSelect.locator(`option[value="${unconfiguredProvider.provider}"]`)
      ).toHaveCount(1)
    }

    await addDialog.getByRole('button', { name: '自定义模型' }).click()
    await addDialog.getByLabel('自定义供应商名称').fill('Test Local Models')
    await addDialog.getByLabel('自定义供应商 Base URL').fill('http://127.0.0.1:11434/v1')
    await addDialog.getByLabel('自定义供应商接口协议').selectOption('anthropic')
    await addDialog.getByLabel('自定义模型 ID').fill('qwen3-coder\ndeepseek-r1')
    await addDialog.getByLabel('自定义供应商 API Key').fill('test-custom-secret')
    await page.screenshot({ path: 'test-results/provider-add-custom.png' })
    await addDialog.getByRole('button', { name: '添加服务' }).click()
    await expect(addDialog).toHaveCount(0)

    const customRow = dialog
      .locator('.settings-provider-row')
      .filter({ hasText: 'Test Local Models' })
    await expect(customRow).toBeVisible()
    await expect(customRow).toContainText('2 个模型')
    await expect(customRow).toContainText('Anthropic Messages')
    const customPayload = await page.evaluate(() => window.api.providers.listCustom())
    expect(customPayload).toEqual([
      expect.objectContaining({
        id: 'test-local-models',
        models: ['qwen3-coder', 'deepseek-r1'],
        protocol: 'anthropic',
        hasApiKey: true
      })
    ])
    expect(JSON.stringify(customPayload)).not.toContain('test-custom-secret')
    const modelPayload = await page.evaluate(() => window.api.models.list())
    expect(modelPayload.map((model) => model.id)).toEqual(
      expect.arrayContaining(['test-local-models/qwen3-coder', 'test-local-models/deepseek-r1'])
    )
    await page.screenshot({ path: 'test-results/provider-settings-configured.png' })

    const editCustomBtn = customRow.getByRole('button', {
      name: '编辑自定义模型：Test Local Models'
    })
    await editCustomBtn.click()
    const editDialog = dialog.locator('.settings-provider-modal')
    await expect(editDialog).toBeVisible()
    await expect(editDialog.getByRole('heading', { name: '编辑自定义模型' })).toBeVisible()
    await expect(editDialog.getByRole('button', { name: '取消' })).toBeVisible()
    await expect(editDialog.getByRole('button', { name: '保存修改' })).toBeVisible()
    await page.waitForTimeout(200)
    await page.screenshot({ path: 'test-results/provider-edit-custom.png' })
    await editDialog.getByRole('button', { name: '取消' }).click()
    await expect(editDialog).toHaveCount(0)

    const providerSearch = dialog.getByLabel('搜索已配置的模型服务')
    await providerSearch.fill('qwen3')
    await expect(dialog.locator('.settings-provider-row')).toHaveCount(1)
    await providerSearch.fill('')
    await customRow.getByRole('button', { name: '删除自定义模型：Test Local Models' }).click()
    await expect(customRow).toHaveCount(0)

    await nav.getByRole('button', { name: '连接器' }).click()
    await expect(dialog.locator('.settings-page')).toHaveAttribute('aria-label', '连接器设置')
    await expect(dialog.getByRole('switch', { name: '本地终端连接器' })).toBeVisible()
    await expect(dialog.getByRole('switch', { name: 'MCP 工具连接器' })).toBeVisible()
    await page.waitForTimeout(200)
    await page.screenshot({ path: 'test-results/settings-connectors.png' })
  })

  test('closes with Escape', async () => {
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: '设置' })).toHaveCount(0)
  })
})
