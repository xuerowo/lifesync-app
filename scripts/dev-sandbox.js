// 用暫存資料安全地啟動開發版，完全不碰真實資料。
//
// 用法（在專案資料夾執行）：
//   npm run sandbox                          空白資料，開 Electron
//   npm run sandbox -- --copy <資料檔路徑>    複製一份資料檔進沙盒（來源只讀不寫）
//   npm run sandbox -- --copy-installed      複製安裝版的資料檔（%APPDATA%\lifesync-app\data\lifesync-data.json）
//   npm run sandbox -- --reuse <沙盒資料夾>   沿用之前建立的沙盒（例如關窗後再開，確認資料有存到）
//   npm run sandbox -- --browser             改用瀏覽器模式（server.js + 網頁），可和上面的參數一起用
//
// 複製進來的資料會清掉雲端設定（網址、帳號、密碼、主密碼，並關閉雲端），避免誤連真實雲端。
// 沙盒放在系統暫存資料夾，結束後不會自動刪除，方便檢查；路徑會印在畫面上。
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_FILE_NAME = 'lifesync-data.json';

function printHelp() {
  console.log(`用法：
  npm run sandbox                          空白資料，開 Electron
  npm run sandbox -- --copy <資料檔路徑>    複製指定的資料檔進沙盒
  npm run sandbox -- --copy-installed      複製安裝版的資料檔
  npm run sandbox -- --reuse <沙盒資料夾>   沿用之前建立的沙盒
  npm run sandbox -- --browser             改用瀏覽器模式（server.js + 網頁）`);
}

function fail(message) {
  console.error(`[sandbox] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { copyFrom: null, reuse: null, browser: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--copy') {
      const value = argv[++i];
      if (!value || value.startsWith('--')) fail('--copy 後面要接資料檔路徑');
      options.copyFrom = path.resolve(value);
    } else if (arg === '--copy-installed') {
      if (!process.env.APPDATA) fail('找不到 APPDATA 環境變數，無法定位安裝版資料檔');
      options.copyFrom = path.join(process.env.APPDATA, 'lifesync-app', 'data', DATA_FILE_NAME);
    } else if (arg === '--reuse') {
      const value = argv[++i];
      if (!value || value.startsWith('--')) fail('--reuse 後面要接沙盒資料夾路徑');
      options.reuse = path.resolve(value);
    } else if (arg === '--browser') {
      options.browser = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      printHelp();
      fail(`看不懂的參數：${arg}`);
    }
  }
  if (options.reuse && options.copyFrom) fail('--reuse 不能和 --copy／--copy-installed 一起用');
  return options;
}

// 只接受系統暫存資料夾底下、由本腳本建立的沙盒，避免不小心指到真實資料夾
export function isSandboxDir(dir, tmpRoot = os.tmpdir()) {
  const resolved = path.resolve(dir);
  return (
    path.dirname(resolved).toLowerCase() === path.resolve(tmpRoot).toLowerCase() &&
    path.basename(resolved).startsWith('lifesync-sandbox-') &&
    fs.existsSync(resolved) &&
    fs.statSync(resolved).isDirectory()
  );
}

function timeStamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function createSandbox(copyFrom, tmpRoot = os.tmpdir()) {
  // mkdtemp 會在名稱後加上隨機字元，保證是全新的空資料夾
  const sandboxDir = fs.mkdtempSync(path.join(tmpRoot, `lifesync-sandbox-${timeStamp()}-`));

  if (copyFrom) {
    try {
      copyDataInto(copyFrom, sandboxDir);
    } catch (e) {
      // 複製失敗就不留下空的沙盒
      fs.rmSync(sandboxDir, { recursive: true, force: true });
      throw e;
    }
  }

  return sandboxDir;
}

// 讀取來源資料檔（只讀不寫），清掉雲端設定後寫進沙盒
function copyDataInto(copyFrom, sandboxDir) {
  let text;
  try {
    // 只讀取來源，絕不寫回
    text = fs.readFileSync(copyFrom, 'utf-8');
  } catch (e) {
    throw new Error(`讀不到來源資料檔：${copyFrom}（${e.message}）`);
  }
  let data;
  try {
    data = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (e) {
    throw new Error(`來源資料檔不是有效的 JSON：${copyFrom}（${e.message}）`);
  }
  // 清掉雲端設定，避免沙盒誤連真實雲端；加密過的密碼在沙盒裡本來也解不開
  if (data && typeof data === 'object' && data.cloudConfig && typeof data.cloudConfig === 'object') {
    data.cloudConfig = {
      ...data.cloudConfig,
      url: '',
      username: '',
      password: '',
      masterPassword: '',
      enabled: false,
    };
  }
  fs.writeFileSync(path.join(sandboxDir, DATA_FILE_NAME), JSON.stringify(data, null, 2), 'utf-8');
}

function startChildren(sandboxDir, browser) {
  const isWindows = process.platform === 'win32';
  const baseEnv = { ...process.env, LIFESYNC_DATA_DIR: sandboxDir };
  const children = [];

  const run = (label, command, args, env, useShell) => {
    const child = spawn(command, args, {
      cwd: PROJECT_ROOT,
      env,
      stdio: 'inherit',
      // Windows 上 npx 是 .cmd 檔，需要透過 shell 執行
      shell: useShell,
    });
    child.label = label;
    children.push(child);
    child.on('exit', (code, signal) => {
      console.log(`[sandbox] ${label} 已結束（${signal || code}）`);
      shutdown(code ?? 0);
    });
    child.on('error', (e) => {
      console.error(`[sandbox] 無法啟動 ${label}：${e.message}`);
      shutdown(1);
    });
    return child;
  };

  let shuttingDown = false;
  const shutdown = (code) => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children) {
      if (child.exitCode === null && !child.killed) child.kill();
    }
    console.log(`[sandbox] 沙盒資料保留在：${sandboxDir}`);
    setTimeout(() => process.exit(code), 500);
  };

  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));

  if (browser) {
    run('server.js', process.execPath, ['server.js'], baseEnv, false);
    run('vite', 'npx', ['vite'], { ...baseEnv, LIFESYNC_NO_ELECTRON: '1' }, isWindows);
  } else {
    run('vite + Electron', 'npx', ['vite'], baseEnv, isWindows);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  let sandboxDir;
  if (options.reuse) {
    if (!isSandboxDir(options.reuse)) {
      fail(`不是本腳本建立的沙盒資料夾（必須在 ${os.tmpdir()} 底下，名稱以 lifesync-sandbox- 開頭）：${options.reuse}`);
    }
    sandboxDir = options.reuse;
  } else {
    try {
      sandboxDir = createSandbox(options.copyFrom);
    } catch (e) {
      fail(e.message);
    }
  }

  console.log('');
  console.log(`[sandbox] 沙盒資料夾：${sandboxDir}`);
  console.log(`[sandbox] 資料檔：${path.join(sandboxDir, DATA_FILE_NAME)}${options.reuse ? '（沿用既有沙盒）' : options.copyFrom ? `（複製自 ${options.copyFrom}）` : '（空資料）'}`);
  console.log(`[sandbox] 模式：${options.browser ? '瀏覽器（請開啟 vite 顯示的網址）' : 'Electron'}；按 Ctrl+C 結束`);
  console.log('');

  startChildren(sandboxDir, options.browser);
}

// 直接執行時才啟動；被測試 import 時只提供函式
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
