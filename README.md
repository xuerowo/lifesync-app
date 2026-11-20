# LifeSync App

LifeSync 是一款用 React + Electron + Vite 做的個人生活管理工具。它結合了維度追蹤、任務規劃、番茄鐘、獎勵抽卡與生活筆記，幫助你建立平衡的生活。

## 🌟 主要功能

-   **維度追蹤 (Indicators)**：追蹤學習、健康與快樂等生活維度。
-   **行動藍圖 (Tasks)**：
    -   **計畫清單**：管理主要任務與子任務，完成後可獲得抽卡券。
    -   **優先順序**：自行排定任務的優先順序。
    -   **任務歷史**：回顧已完成的挑戰。
-   **專注計時 (Pomodoro)**：
    -   番茄鐘（專注／休息循環）與心流模式。
    -   統計專注時長與完成進度。
    -   切到其他頁面時照常計時，畫面上方會顯示迷你計時器。
-   **獎勵系統 (Rewards)**：
    -   **抽卡**：用完成任務得到的抽卡券，從自己設定的獎勵庫抽獎。
    -   **稀有度**：UR、SSR、SR、R、N 五種稀有度。
    -   **圖庫**：掃描資料夾，把圖片複製進程式自己的圖庫；同名但內容不同的圖片會自動改名，不會蓋掉舊圖。
-   **日程視圖 (Calendar)**：用日曆查看每天的任務。
-   **生活筆記 (Note)**：用純文字記錄隨筆與感悟。
-   **行為準則 (Rules)**：寫下個人的核心價值與習慣。
-   **資料同步與備份**：
    -   WebDAV 雲端同步（上傳前用你設定的主密碼加密）。
    -   本地完整備份與還原（包含資料與圖庫）。
    -   雲端密碼用 Windows 內建的加密功能（Electron 的 `safeStorage`）加密後才存檔。

## 📁 你的資料放在哪裡

| 使用方式 | 資料位置 |
|---|---|
| 安裝版、免安裝可攜版 | `%APPDATA%\lifesync-app\data\` |
| 開發模式（`run.bat`、`npm run dev:all`、`npm run dev`）與瀏覽器模式 | 專案資料夾裡的 `data\` |

-   資料檔是 `lifesync-data.json`，圖庫圖片在同一層的 `gallery\` 資料夾。
-   **可攜版的資料一樣放在 `%APPDATA%`，不會跟著 exe 檔走。** 要備份或搬家，請複製上面的資料夾。
-   安裝版和開發模式用的是**兩份不同的資料**，互不相通。
-   **每日自動備份**：每天第一次存檔前，程式會先把原本的資料檔複製到資料夾裡的 `backups\`，最多保留最近 10 份。
-   **讀檔失敗時不會覆蓋原檔**：資料檔讀不出來（例如內容損壞）時，程式會停止存檔，原檔保持原樣，並顯示「資料讀不出來」的畫面，讓你選「重試」或「載入最近一次自動備份」。載入備份前，讀不出來的資料檔會先改名成 `lifesync-data.corrupt-時間.json` 保留，不會被刪除。

## 🚀 快速開始

### 第一次使用

1.  安裝 [Node.js](https://nodejs.org/)。
2.  在專案資料夾執行一次 `npm install`（安裝依賴套件）。用 `run.bat` 啟動的話，它發現還沒安裝時會自動執行。

### Windows 快速啟動：`run.bat`

在專案資料夾雙擊 `run.bat`，它會：

1.  切換到專案資料夾（從任何地方開都可以）。
2.  還沒安裝依賴套件時，先自動執行 `npm install`。
3.  執行 `npm run dev:all`，同時啟動：
    -   **Electron 視窗**（開發模式的 LifeSync）。
    -   **瀏覽器模式的資料伺服器**（`server.js`）：只接受這台電腦自己的連線，同一個 Wi-Fi 底下的手機或其他電腦連不進來。開發時可以用瀏覽器開 Vite 顯示的網址（通常是 `http://localhost:5173`），使用同一份資料。
4.  出錯時視窗會停住，讓你看到錯誤訊息。

> ⚠️ Electron 視窗和瀏覽器寫的是同一個資料檔，**不要兩邊同時修改資料**，否則後存的會蓋掉先存的。

### 手動啟動

```bash
npm run dev:all   # Electron 視窗 + 瀏覽器模式伺服器（和 run.bat 相同）
npm run dev       # 只開 Electron 視窗
```

## 🧪 開發者工具

```bash
npm test          # 執行自動測試（Vitest）
npm run lint      # 用 ESLint 檢查程式寫法（目前仍會列出一些既有問題，屬於待整理項目）
```

### 沙盒啟動：`npm run sandbox`（不會動到真實資料）

沙盒會在系統暫存資料夾建立一份獨立的資料，再用它啟動程式。**資料檔、圖庫、Electron 自己的設定都放在沙盒裡，完全不會讀寫你的真實資料**，可以放心測試。

```bash
npm run sandbox                          # 空白資料，開 Electron
npm run sandbox -- --copy <資料檔路徑>    # 複製指定的資料檔進沙盒（原檔只讀不寫）
npm run sandbox -- --copy-installed      # 複製安裝版的資料檔進沙盒
npm run sandbox -- --reuse <沙盒資料夾>   # 沿用之前建立的沙盒（例如確認關窗後資料有存到）
npm run sandbox -- --browser             # 改用瀏覽器模式，可以和上面的參數一起用
```

-   複製進沙盒的資料會**清掉雲端設定**（網址、帳號、密碼、主密碼），避免不小心連到真實的雲端。
-   只複製資料檔，不複製圖庫，所以沙盒裡的獎勵圖片會顯示不出來。
-   沙盒結束後不會自動刪除，路徑會印在畫面上，方便檢查。
-   原理：沙盒是透過環境變數 `LIFESYNC_DATA_DIR` 指定資料夾。自己啟動程式時設定這個變數，也能達到同樣的隔離效果。

### 清理舊欄位：`scripts/clean-data.js`（小心使用）

這支腳本會刪掉資料檔裡程式已經不再使用的舊欄位（成就的 `rewardRarity`、`rewardCount`，以及番茄鐘紀錄裡任務的 `isPriority`、`priorityOrder`、`learningOrder`）。抽獎紀錄的「來源任務」不會被刪。

```bash
node scripts/clean-data.js --file <資料檔路徑>           # 試跑：只顯示會改什麼，不寫入
node scripts/clean-data.js --file <資料檔路徑> --apply   # 真的寫入
```

-   一定要用 `--file` 指定資料檔，沒指定就只會顯示說明。
-   加上 `--apply` 時，會先把原檔複製成 `<檔名>.before-clean-<時間>.json`，再寫入。
-   **風險**：被刪掉的欄位不會自動回來，要還原只能用上面那份備份。執行 `--apply` 前請先**關閉 LifeSync**（否則程式下次存檔會把清理結果蓋回去），也建議先自己另外複製一份資料資料夾。

## 📦 打包成 Windows 安裝檔

```bash
npm run build
```

-   會先清空舊的 `dist/` 與 `dist-electron/`，再建置畫面並由 electron-builder 打包。
-   完成後的檔案在 **`dist_electron/`**：
    -   `LifeSync Setup 1.0.0.exe`：安裝程式。
    -   `LifeSync 1.0.0.exe`：免安裝可攜版（資料一樣存在 `%APPDATA%\lifesync-app\data\`）。
    -   `win-unpacked/`：解開後的程式資料夾。

## 🛠️ 技術棧

-   **畫面**：React 19、Tailwind CSS、Framer Motion、Lucide React
-   **桌面程式**：Electron（主程序負責讀寫硬碟）；Express 只用在開發時的瀏覽器模式
-   **建置與測試**：Vite、electron-builder、Vitest、ESLint

## 📂 專案結構

-   `src/`：React 畫面原始碼
    -   `components/`：各功能的畫面
    -   `contexts/`：資料與全域狀態
    -   `hooks/`、`domain/`、`shared/`、`utils/`：共用邏輯
-   `electron/`：Electron 主程序；`storage.js` 負責安全存檔與每日備份
-   `server.js`：瀏覽器模式用的本機資料伺服器
-   `scripts/`：沙盒啟動、資料清理、打包前清理等小工具
-   `tests/`：自動測試
-   `docs/`：手動檢查清單等文件
-   `data/`：開發模式的資料（已被 `.gitignore` 排除）
