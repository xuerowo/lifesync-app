// 打包前清空舊的建置產物，避免舊檔混進新的安裝檔。
// 只會刪除專案裡的 dist/ 與 dist-electron/ 兩個資料夾，其他一律不碰。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = ['dist', 'dist-electron'];

for (const name of TARGETS) {
  const target = path.resolve(projectRoot, name);
  // 多一層保險：確認要刪的資料夾就在專案資料夾的正下方
  if (path.dirname(target) !== projectRoot || path.basename(target) !== name) {
    console.error(`拒絕刪除專案以外的路徑：${target}`);
    process.exit(1);
  }
  if (!fs.existsSync(target)) continue;
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) {
    // 連結（例如 junction）只移除連結本身，不跟進去刪除裡面的內容
    fs.unlinkSync(target);
  } else {
    fs.rmSync(target, { recursive: true, force: true });
  }
  console.log(`已清除 ${name}/`);
}
