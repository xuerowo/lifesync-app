import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

// LIFESYNC_NO_ELECTRON=1：只啟動網頁（瀏覽器模式，搭配 server.js），不建置也不開啟 Electron
const noElectron = process.env.LIFESYNC_NO_ELECTRON === '1'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    ...(noElectron
      ? []
      : [
          electron([
            {
              // Main-Process entry file of the Electron App.
              entry: 'electron/main.js',
            },
            {
              entry: 'electron/preload.js',
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
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  }
})
