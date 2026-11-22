import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createStorage } from './electron/storage.js';
import { resolveDevServerImagePath } from './electron/galleryFiles.js';
import { describeFileError } from './src/shared/errorMessages.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;
// 只接受本機連線：同一個網路上的其他裝置連不進來
const HOST = '127.0.0.1';
// 允許的 Host 標頭（擋下「DNS 重新綁定」：惡意網站把自己的網域指到 127.0.0.1 來讀資料）
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
// 資料夾：設了 LIFESYNC_DATA_DIR（沙盒、測試用）就用它，否則用專案內的 data/
const DATA_DIR = process.env.LIFESYNC_DATA_DIR
  ? path.resolve(process.env.LIFESYNC_DATA_DIR)
  : path.join(__dirname, 'data');

// 與 Electron 版共用同一套存檔機制（安全寫入、每日備份、讀檔失敗就禁止存檔）。
// 瀏覽器模式維持原本的行為：密碼不加密。
const storage = createStorage({ dataDir: DATA_DIR });
// 最近一次成功讀到或存好的資料：讀圖片時用來判斷「卡池用到的資料夾」有哪些
let currentData = null;

// 中間件
// 不開放跨網站呼叫（不使用 cors）：開發時畫面經由 Vite 的 /api 轉送，屬於同一個網站，不需要。
app.use((req, res, next) => {
  if (!ALLOWED_HOSTS.has(String(req.headers.host || '').toLowerCase())) {
    return res.status(403).json({ error: '只接受本機連線' });
  }
  next();
});
app.use(express.json({ limit: '50mb' })); // 支援很大的資料

// 讀取資料
app.get('/api/data', async (req, res) => {
  try {
    const result = await storage.load();
    if (result.status === 'error') {
      console.error('讀取資料錯誤（已停止存檔）:', result.code, result.error);
      return res.status(500).json({ error: `讀取資料失敗（${result.code}）`, code: result.code });
    }
    currentData = result.data;
    res.json(result.data);
  } catch (error) {
    console.error('讀取資料錯誤:', error);
    res.status(500).json({ error: '讀取資料失敗' });
  }
});

// 儲存資料
app.post('/api/data', async (req, res) => {
  try {
    await storage.save(req.body);
    currentData = req.body;
    res.json({ success: true, message: '資料已儲存' });
  } catch (error) {
    if (error.code === 'SAVE_BLOCKED') {
      console.error('已拒絕存檔:', error.message);
      return res.status(409).json({ error: error.message, code: error.code });
    }
    console.error('儲存資料錯誤:', error);
    res.status(500).json({ error: '儲存資料失敗' });
  }
});

// 掃描獎勵圖片資料夾
app.post('/api/rewards/scan', async (req, res) => {
  const { folderPath } = req.body;

  if (!folderPath) {
    return res.status(400).json({ error: '請先輸入資料夾路徑。' });
  }

  try {
    // 檢查路徑是否存在
    await fs.access(folderPath);

    // 讀取資料夾內容
    const files = await fs.readdir(folderPath);

    // 過濾圖片文件（支援常見格式）
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
    const imageFiles = files
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        return imageExtensions.includes(ext);
      })
      .map(file => ({
        name: file,
        path: path.join(folderPath, file)
      }));

    res.json({
      success: true,
      images: imageFiles,
      count: imageFiles.length
    });
  } catch (error) {
    // 白話說明＋技術細節，和桌面版（electron/main.js 的 scan-folder）相同
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      res.status(404).json({ error: describeFileError(error, { action: 'scan-folder' }) });
    } else if (error.code === 'EACCES' || error.code === 'EPERM') {
      res.status(403).json({ error: describeFileError(error, { action: 'scan-folder' }) });
    } else {
      console.error('掃描資料夾錯誤:', error);
      res.status(500).json({ error: describeFileError(error, { action: 'scan-folder' }) });
    }
  }
});

// 提供圖片檔案
app.get('/api/rewards/image', async (req, res) => {
  const { imagePath } = req.query;

  if (!imagePath) {
    return res.status(400).json({ error: '請提供圖片路徑' });
  }

  // 只讀圖片檔，而且只能讀資料資料夾（含圖庫）裡的，或目前資料裡卡池用到的資料夾／圖片；
  // 相對路徑以資料資料夾為基準，不能跳出去
  const absolutePath = resolveDevServerImagePath(DATA_DIR, String(imagePath), currentData);
  if (!absolutePath) {
    return res.status(403).json({ error: '不允許讀取這個檔案' });
  }

  // sendFile 需要絕對路徑；路徑已檢查過，允許路徑中有以「.」開頭的資料夾
  res.sendFile(absolutePath, { dotfiles: 'allow' }, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: '圖片不存在' });
    }
  });
});

// 健康檢查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'LifeSync API 執行中' });
});

// 啟動時先讀一次，讓讀檔問題立刻顯示在主控台
const initialLoad = await storage.load();
if (initialLoad.status !== 'error') currentData = initialLoad.data;
if (initialLoad.status === 'error') {
  console.error(`⚠️  資料檔讀取失敗（${initialLoad.code}）：${initialLoad.error}`);
  console.error('   在問題排除前，所有存檔要求都會被拒絕，原檔不會被覆寫。');
}

app.listen(PORT, HOST, () => {
  console.log(`\n🚀 LifeSync API 伺服器執行中：http://${HOST}:${PORT}（只限本機）`);
  console.log(`📁 資料檔位置：${storage.dataFile}\n`);
});
