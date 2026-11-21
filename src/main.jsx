import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AppDataProvider } from './contexts/AppDataContext'
import ErrorBoundary from './components/Shared/ErrorBoundary.jsx'
import { installNativeDialogs } from './utils/nativeDialogs.js'

// 在 Electron 裡改用主程序的訊息框，避免關掉 alert／confirm 後點輸入框打不了字（原因見 nativeDialogs.js）
installNativeDialogs(window)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* 錯誤保護放在 AppDataProvider 裡面：畫面出錯時，存檔機制仍照常運作 */}
    <AppDataProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </AppDataProvider>
  </StrictMode>,
)
