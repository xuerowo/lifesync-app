import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 獲取當前文件的目錄路徑
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 讀取數據文件
const dataPath = path.join(__dirname, '../data/lifesync-data.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

console.log('🔍 開始分析冗餘數據...\n');

let changeCount = 0;

// 1. 清理 rewardHistory 中的 taskTitle 欄位
if (data.rewardHistory && Array.isArray(data.rewardHistory)) {
  const beforeCount = data.rewardHistory.filter(r => 'taskTitle' in r).length;
  data.rewardHistory = data.rewardHistory.map(reward => {
    const { taskTitle, ...rest } = reward;
    return rest;
  });
  console.log(`✅ 已清理 rewardHistory 中的 taskTitle 欄位 (${beforeCount} 筆)`);
  changeCount += beforeCount;
}

// 2. 清理 achievements 中的 rewardRarity 和 rewardCount
if (data.achievements && Array.isArray(data.achievements)) {
  const beforeCount = data.achievements.filter(a => 'rewardRarity' in a || 'rewardCount' in a).length;
  data.achievements = data.achievements.map(achievement => {
    const { rewardRarity, rewardCount, ...rest } = achievement;
    return rest;
  });
  console.log(`✅ 已清理 achievements 中的 rewardRarity 和 rewardCount 欄位 (${beforeCount} 筆)`);
  changeCount += beforeCount * 2;
}

// 3. 清理 pomodoroHistory.tasks 中的冗餘欄位
if (data.pomodoroHistory && Array.isArray(data.pomodoroHistory)) {
  let taskFieldCount = 0;
  data.pomodoroHistory = data.pomodoroHistory.map(session => {
    if (session.tasks && Array.isArray(session.tasks)) {
      session.tasks = session.tasks.map(task => {
        const { isPriority, priorityOrder, learningOrder, ...rest } = task;
        if ('isPriority' in task) taskFieldCount++;
        return rest;
      });
    }
    return session;
  });
  console.log(`✅ 已清理 pomodoroHistory.tasks 中的冗餘欄位 (${taskFieldCount} 個任務)`);
  changeCount += taskFieldCount * 3;
}

// 4. 檢查重複的 lotteryTickets 定義
const jsonString = JSON.stringify(data, null, 2);
const lotteryTicketsMatches = jsonString.match(/"lotteryTickets":/g);
if (lotteryTicketsMatches && lotteryTicketsMatches.length > 1) {
  console.log(`⚠️  警告: lotteryTickets 出現 ${lotteryTicketsMatches.length} 次（應該只有 1 次）`);
}

// 5. 檢查重複的 taskHistory 定義
const taskHistoryMatches = jsonString.match(/"taskHistory":/g);
if (taskHistoryMatches && taskHistoryMatches.length > 1) {
  console.log(`⚠️  警告: taskHistory 出現 ${taskHistoryMatches.length} 次（應該只有 1 次）`);
}

console.log(`\n📊 總計清理了 ${changeCount} 個冗餘欄位`);

// 6. 保存清理後的數據
fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
console.log('\n✨ 數據清理完成！已保存至', dataPath);

// 7. 顯示文件大小變化
const stats = fs.statSync(dataPath);
console.log(`📁 當前文件大小: ${(stats.size / 1024).toFixed(2)} KB`);