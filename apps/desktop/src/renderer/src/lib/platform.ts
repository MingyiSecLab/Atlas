/**
 * 窗口外壳的平台判定。
 *
 * 只服务于「外壳差异」：顶栏左右留白、系统窗口按钮让位等。
 * 业务逻辑不要依赖它 —— 需要平台行为差异时优先在主进程收敛
 * （例如 BrowserWindow 的按平台展开），渲染层只消费结果。
 *
 * 平台差异一律落到 CSS 修饰类上，不要写 `isMac ? <A /> : <B />` 这类 JSX 分支：
 * 分支会让两套外壳无法同时演进，而修饰类只是在同一份布局上覆盖几行留白。
 */
export type AppShellPlatform = 'darwin' | 'win32' | 'linux' | 'other'

function resolveAppShellPlatform(): AppShellPlatform {
  // preload 在渲染脚本之前执行，正常路径下 window.api.platform 一定存在；
  // 纯浏览器（测试 / 预览）里没有 preload，退化成 other 走中性留白。
  const platform = window?.api?.platform
  if (platform === 'darwin' || platform === 'win32' || platform === 'linux') return platform
  return 'other'
}

export const appShellPlatform: AppShellPlatform = resolveAppShellPlatform()

/** 顶栏平台修饰类，与 main.css 中的 `.topheader--<platform>` 规则一一对应。 */
export const topHeaderPlatformClass = `topheader--${appShellPlatform}`
