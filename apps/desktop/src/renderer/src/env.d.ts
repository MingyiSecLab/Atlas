/// <reference types="vite/client" />

/** electron.vite.config.ts renderer.define 构建期注入；不要在代码里手工赋值。 */
declare const __APP_VERSION__: string
/** 当前构建对应的 git commit 短 SHA；本地开发为空串。 */
declare const __BUILD_COMMIT__: string
