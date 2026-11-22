import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import type { Plugin } from 'vite'

// LIFESYNC_NO_ELECTRON=1：只啟動網頁（瀏覽器模式，搭配 server.ts），不建置也不開啟 Electron
const noElectron = process.env.LIFESYNC_NO_ELECTRON === '1'

// 內容安全政策（CSP）：規定頁面只能載入程式自己的東西，不能連到外部網站。
// 只在打包（vite build）時加入；開發模式的 Vite 熱更新需要內嵌腳本，加了會壞。
// - style-src 要允許 'unsafe-inline'：App.tsx、MultiRewardReveal.tsx 有 <style> 標籤，framer-motion 也會動態插入 <style>
// - img-src 要允許 data: 與 blob:：圖片是由主程序讀成 data: 網址再顯示
// - 沒有使用外部字型，字型只允許自己與 data:
// 瀏覽器模式（LIFESYNC_NO_ELECTRON=1）的建置也套用同一份：它只呼叫同一個網站的 /api，政策同樣適用。
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ')

const injectCsp = (): Plugin => ({
  name: 'lifesync-inject-csp',
  apply: 'build',
  transformIndexHtml() {
    return [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
        // 必須放在所有 <script> 之前才會生效
        injectTo: 'head-prepend',
      },
    ]
  },
})

// https://vite.dev/config/
export default defineConfig({
  // 打包版用 file:// 載入 dist/index.html，資源必須用相對路徑
  base: './',
  plugins: [
    react(),
    injectCsp(),
    ...(noElectron
      ? []
      : [
          electron([
            {
              // Main-Process entry file of the Electron App.
              entry: 'electron/main.ts',
            },
            {
              entry: 'electron/preload.ts',
              onstart(options) {
                // Notify the Renderer-Process to reload the page when the Preload-Script build is complete,
                // instead of restarting the entire Electron App.
                options.reload()
              },
            },
          ]),
          renderer(),
        ]),
  ],
  server: {
    proxy: {
      '/api': {
        // server.ts 只監聽 127.0.0.1；寫 localhost 可能被解析成 IPv6 的 ::1 而連不上
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      }
    }
  }
})
