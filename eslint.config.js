import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // 建置產物與打包輸出不檢查
  globalIgnores(['dist', 'dist-electron', 'dist_electron', 'coverage', '.claude']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: { react },
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      // 讓 ESLint 認得 <motion.div> 這類 JSX 用法，避免誤報「變數沒用到」
      'react/jsx-uses-vars': 'error',
    },
  },
  {
    // Electron 主程序、開發伺服器、腳本與測試在 Node 環境執行
    files: ['electron/**/*.js', 'server.js', 'scripts/**/*.js', 'vite.config.js', '**/*.test.{js,jsx}', 'tests/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // preload 會被建置成 CommonJS，可以使用 require
    files: ['electron/preload.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
])
