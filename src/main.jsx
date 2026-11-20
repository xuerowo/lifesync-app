import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AppDataProvider } from './contexts/AppDataContext'
import ErrorBoundary from './components/Shared/ErrorBoundary.jsx'

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
