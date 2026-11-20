import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createStorage } from './electron/storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;
// 資料夾：設了 LIFESYNC_DATA_DIR（沙盒、測試用）就用它，否則用專案內的 data/
const DATA_DIR = process.env.LIFESYNC_DATA_DIR
  ? path.resolve(process.env.LIFESYNC_DATA_DIR)
  : path.join(__dirname, 'data');

// 與 Electron 版共用同一套存檔機制（安全寫入、每日備份、讀檔失敗就禁止存檔）。
// 瀏覽器模式維持原本的行為：密碼不加密。
const storage = createStorage({ dataDir: DATA_DIR });

// 中間件
app.use(cors());
app.use(express.json({ limit: '50mb' })); // 支援大型圖片數據

// 讀取數據
app.get('/api/data', async (req, res) => {
  try {
    const result = await storage.load();
    if (result.status === 'error') {
      console.error('讀取數據錯誤（已停止存檔）:', result.code, result.error);
      return res.status(500).json({ error: `讀取數據失敗（${result.code}）`, code: result.code });
    }
    res.json(result.data);
  } catch (error) {
    console.error('讀取數據錯誤:', error);
    res.status(500).json({ error: '讀取數據失敗' });
  }
});

// 保存數據
app.post('/api/data', async (req, res) => {
  try {
    await storage.save(req.body);
    res.json({ success: true, message: '數據已保存' });
  } catch (error) {
    if (error.code === 'SAVE_BLOCKED') {
      console.error('已拒絕存檔:', error.message);
      return res.status(409).json({ error: error.message, code: error.code });
    }
    console.error('保存數據錯誤:', error);
    res.status(500).json({ error: '保存數據失敗' });
  }
});

// 掃描獎勵圖片資料夾
app.post('/api/rewards/scan', async (req, res) => {
  const { folderPath } = req.body;

  if (!folderPath) {
    return res.status(400).json({ error: '請提供資料夾路徑' });
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
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: '資料夾不存在' });
    } else if (error.code === 'EACCES') {
      res.status(403).json({ error: '無權訪問該資料夾' });
    } else {
      console.error('掃描資料夾錯誤:', error);
      res.status(500).json({ error: '掃描資料夾失敗' });
    }
  }
});

// 提供圖片文件訪問
app.get('/api/rewards/image', async (req, res) => {
  const { imagePath } = req.query;

  if (!imagePath) {
    return res.status(400).json({ error: '請提供圖片路徑' });
  }

  try {
    await fs.access(imagePath);
    res.sendFile(imagePath);
  } catch {
    res.status(404).json({ error: '圖片不存在' });
  }
});

// 健康檢查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'LifeSync API 運行中' });
});

// 啟動時先讀一次，讓讀檔問題立刻顯示在主控台
const initialLoad = await storage.load();
if (initialLoad.status === 'error') {
  console.error(`⚠️  資料檔讀取失敗（${initialLoad.code}）：${initialLoad.error}`);
  console.error('   在問題排除前，所有存檔要求都會被拒絕，原檔不會被覆寫。');
}

app.listen(PORT, () => {
  console.log(`\n🚀 LifeSync API 服務器運行在 http://localhost:${PORT}`);
  console.log(`📁 數據文件位置: ${storage.dataFile}\n`);
});
