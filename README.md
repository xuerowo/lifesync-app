# LifeSync App

LifeSync 是一款基於 React + Electron + Vite 開發的個人生活管理工具。它結合了維度追蹤、任務規劃、番茄鐘、獎勵系統與生活筆記，旨在幫助用戶建立平衡的生活。

## 🌟 主要功能

-   **維度追蹤 (Indicators)**：視覺化追蹤學習、健康與快樂等生活維度。
-   **行動藍圖 (Tasks)**：
    -   **計畫清單**：管理主要任務與子任務，並設置獎勵機制。
    -   **優先級管理**：智能排序任務優先順序。
    -   **任務歷史**：回顧已完成的挑戰。
-   **專注計時 (Pomodoro)**：
    -   支援番茄鐘（專注/休息循環）與心流模式。
    -   即時統計專注時長與完成進度。
    -   支援背景計時與迷你懸浮視窗。
-   **獎勵系統 (Rewards)**：
    -   **抽卡機制**：完成任務獲取抽卡券，從自定義獎勵庫中抽取驚喜。
    -   **等級與稀有度**：支援 UR, SSR, SR, R, N 不同稀有度的獎勵。
    -   **圖庫管理**：自動掃描並管理獎勵圖片。
-   **日程視圖 (Calendar)**：以日曆形式查看每日任務。
-   **生活筆記 (Note)**：記錄隨筆與感悟，支援 Markdown 風格與標籤。
-   **行為準則 (Rules)**：建立個人核心價值觀與習慣。
-   **數據同步與備份**：
    -   支援 WebDAV 雲端同步。
    -   支援本地完整備份與還原（包含數據與圖庫）。
    -   使用 `safeStorage` 加密敏感配置資訊。

## 🛠️ 技術棧

-   **前端**：React 19, Tailwind CSS, Framer Motion, Lucide React
-   **後端/環境**：Electron, Node.js (Express 用於開發環境 API)
-   **建構工具**：Vite, electron-builder

## 🚀 快速開始

### Windows 用戶快速啟動

如果你是 Windows 用戶，可以使用以下方式快速啟動開發環境：

1.  確保已安裝 [Node.js](https://nodejs.org/)。
2.  在專案根目錄雙擊執行 `run.bat` 檔案。
    *這將自動執行 `npm run dev:all` 並啟動應用程序。*

### 標準開發環境

1.  安裝依賴：
    ```bash
    npm install
    ```
2.  啟動開發伺服器：
    ```bash
    npm run dev:all
    ```
    *這將同時啟動 Vite 前端伺服器與數據處理伺服器。*

### 打包與分發 (Windows .exe)

如果你想將應用程序打包成獨立的 `.exe` 安裝檔：

1.  執行打包指令：
    ```bash
    npm run build
    ```
2.  等待建構完成後，打包好的安裝程式將位於 `dist/` 目錄中。
    *注意：打包過程會先使用 Vite 建構前端資源，隨後由 electron-builder 封裝成 Windows 執行檔。*

## 📁 專案結構

-   `src/`：React 前端原始碼
    -   `components/`：功能模組組件
    -   `contexts/`：數據與全局狀態管理
    -   `hooks/`：自定義 React Hooks
    -   `utils/`：工具函數
-   `electron/`：Electron 主程序與 IPC 處理
-   `data/`：本地數據存儲目錄（`.gitignore` 已排除，包含 `lifesync-data.json` 與 `gallery/`）
