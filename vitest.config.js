import { defineConfig } from 'vitest/config'

// 測試設定與 vite.config.js 分開，避免測試時啟動 Electron 外掛
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{js,jsx}'],
  },
})
