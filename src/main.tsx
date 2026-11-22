import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AppDataProvider } from './contexts/AppDataContext.tsx'
import ErrorBoundary from './components/Shared/ErrorBoundary.tsx'
import { installNativeDialogs } from './utils/nativeDialogs.ts'
import { installFocusGuard } from './utils/focusGuard.ts'
import { installFocusDiagnostics } from './utils/focusDiagnostics.ts'

// 在 Electron 裡改用主程序的訊息框，避免關掉 alert／confirm 後點輸入框打不了字（原因見 nativeDialogs.ts）
installNativeDialogs(window)
// 點了畫面、頁面卻沒有鍵盤焦點時，把焦點交回頁面（原因見 focusGuard.ts）
installFocusGuard(window)
// 焦點診斷：平常不記錄，Ctrl+Shift+F11 開啟、Ctrl+Shift+F12 記下狀態（見 focusDiagnostics.ts）
installFocusDiagnostics(window)

// index.html 一定有 <div id="root">，所以 ! 是安全的
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* 錯誤保護放在 AppDataProvider 裡面：畫面出錯時，存檔機制仍照常運作 */}
    <AppDataProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </AppDataProvider>
  </StrictMode>,
)
