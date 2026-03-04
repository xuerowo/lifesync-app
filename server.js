import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;
const DATA_FILE = path.join(__dirname, 'data', 'lifesync-data.json');

// 中間件
app.use(cors());
app.use(express.json({ limit: '50mb' })); // 支援大型圖片數據

// 確保 data 目錄存在
async function ensureDataDir() {
  const dataDir = path.join(__dirname, 'data');
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

// 讀取數據
app.get('/api/data', async (req, res) => {
  try {
    await ensureDataDir();
    const data = await fs.readFile(DATA_FILE, 'utf-8');
    res.json(JSON.parse(data));
  } catch (error) {
    if (error.code === 'ENOENT') {
      // 文件不存在，返回初始數據
      const initialData = {
        goals: { learning: [], health: [], happiness: [] },
        majorTasks: [],
        subTasks: [],
        archivedTasks: [],
        archivedSubTasks: [],
        rewardFolderPath: '',
        lotteryPrizes: { N: [], R: [], SR: [], SSR: [], UR: [] },
        lotteryProbability: { N: 50, R: 25, SR: 15, SSR: 8, UR: 2 }
      };
      res.json(initialData);
    } else {
      console.error('讀取數據錯誤:', error);
      res.status(500).json({ error: '讀取數據失敗' });
    }
  }
});

// 保存數據
app.post('/api/data', async (req, res) => {
  try {
    await ensureDataDir();
    await fs.writeFile(DATA_FILE, JSON.stringify(req.body, null, 2), 'utf-8');
    res.json({ success: true, message: '數據已保存' });
  } catch (error) {
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
  } catch (error) {
    res.status(404).json({ error: '圖片不存在' });
  }
});

// 健康檢查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'LifeSync API 運行中' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 LifeSync API 服務器運行在 http://localhost:${PORT}`);
  console.log(`📁 數據文件位置: ${DATA_FILE}\n`);
});
