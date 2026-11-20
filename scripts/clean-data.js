// 清理 LifeSync 資料檔裡已經沒有用到的舊欄位。
//
// 用法：
//   node scripts/clean-data.js --file <資料檔路徑>           只顯示會改什麼（試跑，不寫入）
//   node scripts/clean-data.js --file <資料檔路徑> --apply   真的寫入（寫入前會先備份原檔）
//
// 會清掉的欄位（程式已經不再讀取）：
//   - achievements 裡的 rewardRarity、rewardCount
//   - pomodoroHistory 每筆紀錄 tasks 裡的 isPriority、priorityOrder、learningOrder
// 不會動 rewardHistory.taskTitle（抽獎紀錄的「來源任務」，編輯畫面仍在使用）。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ACHIEVEMENT_FIELDS = ['rewardRarity', 'rewardCount'];
const POMODORO_TASK_FIELDS = ['isPriority', 'priorityOrder', 'learningOrder'];

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const stripBom = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

/** 回傳移除指定欄位後的新物件，以及實際移除了幾個欄位 */
function omitFields(obj, fields) {
  if (!isPlainObject(obj)) return { value: obj, removed: 0 };
  let removed = 0;
  const value = { ...obj };
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(value, field)) {
      delete value[field];
      removed++;
    }
  }
  return { value, removed };
}

/**
 * 清理資料（純函式：不修改傳入的物件）。
 *
 * @param {object} data 整份資料
 * @returns {{ data: object, report: {
 *   achievements: number, achievementFields: number,
 *   pomodoroTasks: number, pomodoroTaskFields: number,
 *   totalFields: number,
 * } }} report 裡是「有被清理的筆數」與「實際移除的欄位數」
 */
export function cleanData(data) {
  if (!isPlainObject(data)) throw new Error('資料不是預期的格式（最外層應該是物件）');
  const out = { ...data };
  const report = { achievements: 0, achievementFields: 0, pomodoroTasks: 0, pomodoroTaskFields: 0, totalFields: 0 };

  if (Array.isArray(data.achievements)) {
    out.achievements = data.achievements.map((achievement) => {
      const { value, removed } = omitFields(achievement, ACHIEVEMENT_FIELDS);
      if (removed > 0) {
        report.achievements++;
        report.achievementFields += removed;
      }
      return value;
    });
  }

  if (Array.isArray(data.pomodoroHistory)) {
    out.pomodoroHistory = data.pomodoroHistory.map((session) => {
      if (!isPlainObject(session) || !Array.isArray(session.tasks)) return session;
      return {
        ...session,
        tasks: session.tasks.map((task) => {
          const { value, removed } = omitFields(task, POMODORO_TASK_FIELDS);
          if (removed > 0) {
            report.pomodoroTasks++;
            report.pomodoroTaskFields += removed;
          }
          return value;
        }),
      };
    });
  }

  report.totalFields = report.achievementFields + report.pomodoroTaskFields;
  return { data: out, report };
}

const USAGE = `清理 LifeSync 資料檔裡已經沒有用到的舊欄位。

用法：
  node scripts/clean-data.js --file <資料檔路徑>           只顯示會改什麼（試跑，不寫入）
  node scripts/clean-data.js --file <資料檔路徑> --apply   真的寫入

說明：
  - 一定要用 --file 指定資料檔，例如安裝版的
    "%APPDATA%\\lifesync-app\\data\\lifesync-data.json"
  - 加上 --apply 時，會先把原檔複製成「<檔名>.before-clean-<時間>.json」再寫入。
  - 執行 --apply 前請先關閉 LifeSync，否則程式下次存檔時會把清理結果蓋回去。`;

function parseArgs(argv) {
  const options = { file: null, apply: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--file') {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error('--file 後面要接資料檔路徑');
      options.file = value;
    } else if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`看不懂的參數：${arg}`);
    }
  }
  return options;
}

const timeStamp = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

/** 先寫到同資料夾的暫存檔，成功後再改名蓋過原檔（Windows 上被暫時鎖住時重試幾次） */
function writeAtomicSync(filePath, text) {
  const tmp = `${filePath}.clean-${process.pid}-${Date.now()}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        fs.renameSync(tmp, filePath);
        return;
      } catch (error) {
        if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 5) throw error;
        // 同步等待一小段時間再重試
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100 * attempt);
      }
    }
  } catch (error) {
    try { fs.rmSync(tmp, { force: true }); } catch { /* 暫存檔清不掉也不影響原檔 */ }
    throw error;
  }
}

/**
 * 執行清理流程，回傳結束碼（0 成功、1 失敗）。
 * @param {string[]} argv 命令列參數（不含 node 與腳本路徑）
 */
export function main(argv, { log = console.log, error = console.error, now = () => new Date() } = {}) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (e) {
    error(`❌ ${e.message}\n`);
    log(USAGE);
    return 1;
  }
  if (options.help) {
    log(USAGE);
    return 0;
  }
  if (!options.file) {
    error('❌ 請用 --file 指定要清理的資料檔。\n');
    log(USAGE);
    return 1;
  }

  const filePath = path.resolve(options.file);
  let data;
  try {
    data = JSON.parse(stripBom(fs.readFileSync(filePath, 'utf8')));
  } catch (e) {
    error(`❌ 無法讀取資料檔 ${filePath}：${e.message}`);
    return 1;
  }

  let result;
  try {
    result = cleanData(data);
  } catch (e) {
    error(`❌ ${e.message}`);
    return 1;
  }
  const { report } = result;

  log(`📄 資料檔：${filePath}\n`);
  log(`- achievements：${report.achievements} 筆，共 ${report.achievementFields} 個欄位（${ACHIEVEMENT_FIELDS.join('、')}）`);
  log(`- pomodoroHistory 的任務：${report.pomodoroTasks} 筆，共 ${report.pomodoroTaskFields} 個欄位（${POMODORO_TASK_FIELDS.join('、')}）`);
  log(`\n📊 總計會移除 ${report.totalFields} 個欄位`);

  if (report.totalFields === 0) {
    log('\n✅ 沒有需要清理的欄位，檔案不會變動。');
    return 0;
  }
  if (!options.apply) {
    log('\n🔎 這是試跑，檔案沒有任何變動。確認無誤後，加上 --apply 才會真的寫入。');
    return 0;
  }

  const backupPath = path.join(path.dirname(filePath), `${path.basename(filePath)}.before-clean-${timeStamp(now())}.json`);
  try {
    fs.copyFileSync(filePath, backupPath, fs.constants.COPYFILE_EXCL);
  } catch (e) {
    error(`❌ 備份原檔失敗，沒有寫入任何東西：${e.message}`);
    return 1;
  }
  log(`\n💾 已備份原檔：${backupPath}`);

  try {
    writeAtomicSync(filePath, JSON.stringify(result.data, null, 2));
  } catch (e) {
    error(`❌ 寫入失敗，原檔沒有被改動：${e.message}`);
    return 1;
  }
  const stats = fs.statSync(filePath);
  log(`✨ 清理完成，已寫入 ${filePath}（目前大小 ${(stats.size / 1024).toFixed(2)} KB）`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
