// 資料檔的讀寫、備份與還原。
// 這個檔案刻意不 import electron，讓它能直接在 Node（Vitest）中測試；
// 加密/解密函式由呼叫端（electron/main.ts）注入。
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { createDefaultData, normalizeData } from '../src/shared/defaultData.ts';
import type {
  LoadFailure,
  LoadResult,
  RestoreBackupResult,
  SaveResult,
  SecretField,
} from '../src/types/electronApi.ts';
import { nodeError } from './nodeError.ts';

export const DATA_FILE_NAME = 'lifesync-data.json';
export const BACKUP_DIR_NAME = 'backups';

const SECRET_FIELDS: readonly SecretField[] = ['password', 'masterPassword'];
// Windows 上防毒軟體或索引服務暫時鎖住檔案時常見的錯誤碼
const RETRYABLE_RENAME_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
const MAX_RENAME_RETRIES = 5;

const DAILY_BACKUP_RE = /^lifesync-data-\d{4}-\d{2}-\d{2}\.json$/;
const SNAPSHOT_RE = /^snapshot-\d{8}-\d{6}(-[A-Za-z0-9_-]+)?\.json$/;
// 從檔名取出時間（daily：日期；snapshot：日期-時間）與同一秒內的序號（-2、-3…，沒有就是 1）
const DAILY_KEY_RE = /^lifesync-data-(\d{4}-\d{2}-\d{2})\.json$/;
const SNAPSHOT_KEY_RE = /^snapshot-(\d{8}-\d{6})(?:-[A-Za-z0-9_-]*?)?(?:-(\d+))?\.json$/;

/** 是不是程式自己建立的備份檔（每日備份或快照）；偵測「有沒有備份」和還原時都用這個判斷 */
export const isBackupFileName = (name: string): boolean => DAILY_BACKUP_RE.test(name) || SNAPSHOT_RE.test(name);

/**
 * 備份檔的排序依據：先比時間，同一秒內再比序號（沒有序號的是第 1 份）。
 * 不能直接比字串：「-2.json」的「-」排在「.json」的「.」前面，第 2 份會被當成比第 1 份舊。
 */
const backupSortKey = (name: string): { time: string; seq: number } => {
  const daily = DAILY_KEY_RE.exec(name);
  if (daily) return { time: daily[1], seq: 1 };
  const snap = SNAPSHOT_KEY_RE.exec(name);
  if (snap) return { time: snap[1], seq: snap[2] ? Number(snap[2]) : 1 };
  return { time: '', seq: 0 };
};

/** 舊的在前 */
export const compareBackupNames = (a: string, b: string): number => {
  const ka = backupSortKey(a);
  const kb = backupSortKey(b);
  if (ka.time !== kb.time) return ka.time < kb.time ? -1 : 1;
  if (ka.seq !== kb.seq) return ka.seq - kb.seq;
  return a < b ? -1 : a > b ? 1 : 0;
};

const pad = (n: number) => String(n).padStart(2, '0');
const dateStamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeStamp = (d: Date) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

const isPlainObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
// 去掉可能被文字編輯器加上的 BOM
const stripBom = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const sleepSync = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const makeError = (code: string, message: string) => Object.assign(new Error(message), { code });

// 錯誤訊息裡描述讀檔狀態的中文（訊息會顯示在畫面的「錯誤代碼」那一行，不要露出 error、ok 這種內部代碼）
const LOAD_STATUS_TEXT: Record<LoadStatus, string> = { ok: '已正常讀取', new: '新建立的資料', error: '上次讀檔失敗' };
const loadStatusText = (status: LoadStatus | null) => (status && LOAD_STATUS_TEXT[status]) || '還沒讀取';

const existsSync = (p: string) => {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
};

/** 讀檔結果的狀態；error 時禁止存檔 */
type LoadStatus = LoadResult['status'];

/** 寫入成功（失敗時丟錯，由呼叫端轉成 SaveResult 的失敗格式） */
export type WriteResult = Extract<SaveResult, { success: true }>;

export interface StorageOptions {
  /** 資料資料夾：資料檔與 backups\ 都在這裡 */
  dataDir?: string;
  /** 把密碼加密成要寫進檔案的字串（預設不加密） */
  encrypt?: (plainText: string) => string;
  /** 把檔案裡的密碼解開；解不開時丟錯（預設不解密） */
  decrypt?: (stored: string) => string;
  /** 現在時間（測試用） */
  now?: () => Date;
  maxDailyBackups?: number;
  maxSnapshots?: number;
  /** 改名被暫時鎖住時，第 n 次重試前等 retryDelayMs × n 毫秒 */
  retryDelayMs?: number;
}

export type Storage = ReturnType<typeof createStorage>;

export function createStorage({
  dataDir,
  encrypt = (s) => s,
  decrypt = (s) => s,
  now = () => new Date(),
  maxDailyBackups = 10,
  maxSnapshots = 10,
  retryDelayMs = 50,
}: StorageOptions = {}) {
  if (!dataDir) throw new Error('createStorage: 需要 dataDir');

  const dataFile = path.join(dataDir, DATA_FILE_NAME);
  const backupDir = path.join(dataDir, BACKUP_DIR_NAME);

  // 最近一次 load 的結果；只有 'ok' 或 'new' 時才允許存檔
  let lastLoadStatus: LoadStatus | null = null;
  // 解不開的加密密碼：欄位名 → 原本的加密字串（存檔時原樣寫回）
  let retained: Partial<Record<SecretField, string>> = {};
  let tmpCounter = 0;
  // 每次存檔要求都拿一個遞增編號；committedGeneration 是已經成功寫入的最新編號
  let generation = 0;
  let committedGeneration = 0;
  // 最近一次同步存檔的內容，用來補救「非同步改名進行中時發生同步存檔」的極少數情況
  let lastSyncCommit: { gen: number; json: string } | null = null;
  // 所有非同步操作依序排隊，一次只做一件
  let queue: Promise<unknown> = Promise.resolve();

  const enqueue = <T>(task: () => T | Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  };

  const canSave = () => lastLoadStatus === 'ok' || lastLoadStatus === 'new';

  const assertCanSave = () => {
    if (!canSave()) {
      throw makeError('SAVE_BLOCKED', `資料沒有成功載入（${loadStatusText(lastLoadStatus)}），已停止存檔以免覆蓋原檔`);
    }
  };

  const tmpPathFor = (target: string) => `${target}.${process.pid}.${++tmpCounter}.tmp`;

  // 把要寫入的資料轉成 JSON：處理密碼加密，不修改傳入物件
  const serialize = (data: unknown): string => {
    if (!isPlainObject(data)) throw makeError('INVALID_DATA', '要存檔的資料格式不正確');
    const out = { ...data };
    if (isPlainObject(data.cloudConfig)) {
      const cloudConfig: Record<string, unknown> = { ...data.cloudConfig };
      for (const field of SECRET_FIELDS) {
        const value = cloudConfig[field];
        if (typeof value === 'string' && value !== '') {
          cloudConfig[field] = encrypt(value);
          delete retained[field];
        } else if (retained[field]) {
          cloudConfig[field] = retained[field];
        } else {
          cloudConfig[field] = '';
        }
      }
      out.cloudConfig = cloudConfig;
    }
    return JSON.stringify(out, null, 2);
  };

  // ---- 備份相關 ----

  const listBackupFiles = (re: RegExp): string[] => {
    try {
      return fs.readdirSync(backupDir).filter((name) => re.test(name)).sort(compareBackupNames);
    } catch {
      return [];
    }
  };

  const prune = (re: RegExp, keep: number) => {
    const files = listBackupFiles(re);
    const excess = files.length - Math.max(0, keep);
    for (let i = 0; i < excess; i++) {
      try {
        fs.rmSync(path.join(backupDir, files[i]), { force: true });
      } catch (e) {
        console.warn('[storage] 刪除舊備份失敗:', files[i], nodeError(e).message);
      }
    }
  };

  // 只算程式自己建立的備份（和還原時接受的檔名相同），使用者自己丟進去的其他 .json 不算
  const hasAnyBackup = () => {
    try {
      return fs.readdirSync(backupDir).some(isBackupFileName);
    } catch {
      return false;
    }
  };

  // 資料檔現在讀得出來、而且是物件（用在上次讀檔失敗、但檔案可能已經好了的情況）
  const dataFileParses = () => {
    try {
      return isPlainObject(JSON.parse(stripBom(fs.readFileSync(dataFile, 'utf-8'))));
    } catch {
      return false;
    }
  };

  // ---- 同步版本的底層寫入（saveSync、備份、還原共用） ----

  const renameWithRetrySync = (from: string, to: string) => {
    for (let attempt = 0; ; attempt++) {
      try {
        fs.renameSync(from, to);
        return;
      } catch (e) {
        if (!RETRYABLE_RENAME_CODES.has(nodeError(e).code ?? '') || attempt >= MAX_RENAME_RETRIES) throw e;
        sleepSync(retryDelayMs * (attempt + 1));
      }
    }
  };

  const writeFileDurableSync = (file: string, content: string) => {
    const fd = fs.openSync(file, 'w');
    try {
      fs.writeFileSync(fd, content, 'utf-8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  };

  // 複製檔案到目標位置：先複製到暫存檔再改名，避免留下複製到一半的檔案
  const copyAtomicSync = (from: string, to: string) => {
    const tmp = tmpPathFor(to);
    try {
      fs.copyFileSync(from, tmp);
      renameWithRetrySync(tmp, to);
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      throw e;
    }
  };

  // 每天第一次存檔前，把原檔複製到 backups/
  const ensureDailyBackupSync = () => {
    if (!existsSync(dataFile)) return;
    const target = path.join(backupDir, `lifesync-data-${dateStamp(now())}.json`);
    if (existsSync(target)) return;
    try {
      fs.mkdirSync(backupDir, { recursive: true });
      copyAtomicSync(dataFile, target);
      prune(DAILY_BACKUP_RE, maxDailyBackups);
    } catch (e) {
      // 備份失敗不阻擋存檔：存下使用者的最新資料比較重要
      console.warn('[storage] 建立每日備份失敗:', nodeError(e).message);
    }
  };

  const writeAtomicSync = (json: string, gen: number): WriteResult => {
    if (committedGeneration > gen) return { success: true, superseded: true };
    fs.mkdirSync(dataDir, { recursive: true });
    ensureDailyBackupSync();
    const tmp = tmpPathFor(dataFile);
    try {
      writeFileDurableSync(tmp, json);
      if (committedGeneration > gen) {
        fs.rmSync(tmp, { force: true });
        return { success: true, superseded: true };
      }
      renameWithRetrySync(tmp, dataFile);
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      throw e;
    }
    committedGeneration = Math.max(committedGeneration, gen);
    return { success: true };
  };

  // ---- 非同步版本的底層寫入 ----

  const writeFileDurable = async (file: string, content: string) => {
    const handle = await fsp.open(file, 'w');
    try {
      await handle.writeFile(content, 'utf-8');
      await handle.sync();
    } finally {
      await handle.close();
    }
  };

  const writeAtomic = async (json: string, gen: number): Promise<WriteResult> => {
    if (committedGeneration > gen) return { success: true, superseded: true };
    await fsp.mkdir(dataDir, { recursive: true });
    ensureDailyBackupSync();
    const tmp = tmpPathFor(dataFile);
    try {
      await writeFileDurable(tmp, json);
      for (let attempt = 0; ; attempt++) {
        // 改名前再檢查一次：期間若已有較新的寫入（例如關窗前的同步存檔）完成，就放棄這次
        if (committedGeneration > gen) {
          await fsp.rm(tmp, { force: true });
          return { success: true, superseded: true };
        }
        try {
          await fsp.rename(tmp, dataFile);
          break;
        } catch (e) {
          if (!RETRYABLE_RENAME_CODES.has(nodeError(e).code ?? '') || attempt >= MAX_RENAME_RETRIES) throw e;
          await sleep(retryDelayMs * (attempt + 1));
        }
      }
    } catch (e) {
      await fsp.rm(tmp, { force: true }).catch(() => {});
      throw e;
    }
    if (committedGeneration > gen && lastSyncCommit && lastSyncCommit.gen === committedGeneration) {
      // 改名進行中時發生了同步存檔，無法確定哪一個改名較晚完成，所以把較新的內容再寫一次
      writeAtomicSync(lastSyncCommit.json, lastSyncCommit.gen);
      return { success: true, superseded: true };
    }
    committedGeneration = Math.max(committedGeneration, gen);
    return { success: true };
  };

  // ---- 讀取 ----

  const loadError = (code: string, error: string): LoadFailure => {
    lastLoadStatus = 'error';
    return { status: 'error', code, error };
  };

  const doLoad = async (): Promise<LoadResult> => {
    retained = {};
    let text: string;
    try {
      text = await fsp.readFile(dataFile, 'utf-8');
    } catch (caught) {
      const e = nodeError(caught);
      if (e.code === 'ENOENT') {
        if (hasAnyBackup()) {
          return loadError('MISSING_WITH_BACKUPS', '找不到資料檔，但備份資料夾中有備份檔');
        }
        lastLoadStatus = 'new';
        return { status: 'new', data: createDefaultData(), secretsUnavailable: [] };
      }
      return loadError(e.code || 'READ_ERROR', e.message);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripBom(text));
    } catch (e) {
      return loadError('PARSE_ERROR', nodeError(e).message);
    }
    if (!isPlainObject(parsed)) {
      return loadError('INVALID_FORMAT', '資料檔的內容不是預期的格式');
    }

    const data = normalizeData(parsed);
    const secretsUnavailable: SecretField[] = [];
    // normalizeData 會建立新的 cloudConfig 物件，可以直接修改
    for (const field of SECRET_FIELDS) {
      const value = data.cloudConfig[field];
      if (typeof value !== 'string' || value === '') continue;
      try {
        data.cloudConfig[field] = decrypt(value);
      } catch {
        retained[field] = value;
        data.cloudConfig[field] = '';
        secretsUnavailable.push(field);
      }
    }

    lastLoadStatus = 'ok';
    return { status: 'ok', data, secretsUnavailable };
  };

  // ---- 對外介面 ----

  const load = () => enqueue(doLoad);

  const save = async (data: unknown): Promise<WriteResult> => {
    assertCanSave();
    const json = serialize(data);
    const gen = ++generation;
    return enqueue(async () => {
      assertCanSave();
      return writeAtomic(json, gen);
    });
  };

  const saveSync = (data: unknown): WriteResult => {
    assertCanSave();
    const json = serialize(data);
    const gen = ++generation;
    const result = writeAtomicSync(json, gen);
    if (!result.superseded) lastSyncCommit = { gen, json };
    return result;
  };

  // 拍快照：把目前的資料檔複製一份到 backups\。
  // 上次讀檔失敗、而且資料檔現在還是讀不出來時拒絕（SNAPSHOT_BLOCKED）：
  // 否則每拍一次壞檔，就會把一份好的快照擠出「最多保留 N 份」的範圍。
  const snapshot = (reason: unknown = 'manual') =>
    enqueue(async (): Promise<string | null> => {
      if (!existsSync(dataFile)) return null;
      if (!canSave() && !dataFileParses()) {
        throw makeError(
          'SNAPSHOT_BLOCKED',
          `資料檔沒有成功載入（${loadStatusText(lastLoadStatus)}），而且現在仍讀不出來，不替它拍快照，以免擠掉較舊的好快照`,
        );
      }
      fs.mkdirSync(backupDir, { recursive: true });
      // 原因結尾若是「-數字」，會和同一秒內的序號（-2、-3…）分不清，所以改成「_數字」
      const safeReason =
        String(reason).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40).replace(/-(\d+)$/, '_$1') || 'manual';
      const base = `snapshot-${timeStamp(now())}-${safeReason}`;
      let target = path.join(backupDir, `${base}.json`);
      for (let i = 2; existsSync(target); i++) {
        target = path.join(backupDir, `${base}-${i}.json`);
      }
      copyAtomicSync(dataFile, target);
      prune(SNAPSHOT_RE, maxSnapshots);
      return target;
    });

  // 覆蓋本機資料（雲端還原、匯入）之前使用：有傳 data 時先把它存好再拍快照，
  // 快照才會包含畫面上最新、存檔排程還沒寫進檔案的修改。
  // 存檔或快照失敗都會丟錯，呼叫端必須因此取消覆蓋。
  const snapshotCurrent = async (reason: unknown, data?: unknown): Promise<string | null> => {
    if (data !== undefined && data !== null) await save(data);
    return snapshot(reason);
  };

  // 只在上次讀檔失敗時才能用：資料檔好好的時候還原，會把一份健康的資料檔改名成 .corrupt、改用較舊的備份
  const restoreLatestBackup = () =>
    enqueue(async (): Promise<RestoreBackupResult> => {
      if (lastLoadStatus !== 'error') {
        return {
          status: 'error',
          code: 'RESTORE_NOT_ALLOWED',
          error: `資料沒有讀檔失敗（${loadStatusText(lastLoadStatus)}），不需要也不允許從備份還原`,
        };
      }
      const candidates = [...listBackupFiles(DAILY_BACKUP_RE), ...listBackupFiles(SNAPSHOT_RE)]
        .map((name) => {
          const full = path.join(backupDir, name);
          let mtime = 0;
          try {
            mtime = fs.statSync(full).mtimeMs;
          } catch {
            /* 讀不到就排最後 */
          }
          return { name, full, mtime };
        })
        // 新的在前；修改時間相同時依檔名排序
        .sort((a, b) => b.mtime - a.mtime || b.name.localeCompare(a.name));

      const usable = candidates.find(({ full }) => {
        try {
          const parsed = JSON.parse(stripBom(fs.readFileSync(full, 'utf-8')));
          return isPlainObject(parsed);
        } catch {
          return false;
        }
      });
      if (!usable) {
        return { status: 'error', code: 'NO_BACKUP', error: '找不到可用的備份' };
      }

      // 讓排隊中、內容較舊的存檔不會蓋掉還原後的資料
      committedGeneration = ++generation;

      // 壞掉的資料檔只改名保留，絕不刪除（之後可能還救得回裡面的內容）
      let preservedAs: string | null = null;
      if (existsSync(dataFile)) {
        const base = `lifesync-data.corrupt-${timeStamp(now())}`;
        let corruptPath = path.join(dataDir, `${base}.json`);
        for (let i = 2; existsSync(corruptPath); i++) {
          corruptPath = path.join(dataDir, `${base}-${i}.json`);
        }
        renameWithRetrySync(dataFile, corruptPath);
        preservedAs = corruptPath;
      }
      copyAtomicSync(usable.full, dataFile);
      const result = await doLoad();
      return {
        ...result,
        restoredFrom: usable.full,
        // 備份檔的修改時間，讓畫面告訴使用者「還原到什麼時候的資料」
        restoredFromTime: usable.mtime ? new Date(usable.mtime).toISOString() : null,
        preservedAs,
      };
    });

  return {
    dataFile,
    backupDir,
    load,
    save,
    saveSync,
    snapshot,
    snapshotCurrent,
    restoreLatestBackup,
  };
}
