import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { IpcMainInvokeEvent } from 'electron';

// 用真的 webdav 套件（不模擬），確認它對打錯的設定實際丟出什麼，以及處理程序都把錯誤包成白話的 { success: false }，
// 而不是丟出去（丟出去的錯誤到畫面會變成英文的「Error invoking remote method」）。
// 這裡的設定都在連線前就出錯（網址格式不對、帳號密碼有中文），不會真的連到任何伺服器。
const { setupCloudHandlers } = await import('../electron/cloudManager.ts');

type Result = { success: boolean; error?: string };
type Handler = (event: IpcMainInvokeEvent, payload: unknown) => Promise<Result>;

const event = { sender: { send: () => {} } } as unknown as IpcMainInvokeEvent;
let tmpRoot: string;
let handlers: Record<string, Handler>;

beforeEach(async () => {
  // 圖庫資料夾放在系統暫存資料夾，不碰真實資料
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lifesync-cloud-errors-test-'));
  handlers = {};
  setupCloudHandlers(
    { handle: (name: string, fn: Handler) => { handlers[name] = fn; } },
    { GALLERY_DIR: path.join(tmpRoot, 'gallery') },
  );
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

/** 五個雲端處理程序，各自用指定的設定呼叫一次 */
const callAll = (config: { url: string; username: string; password: string }) => ({
  'cloud-test-connection': () => handlers['cloud-test-connection'](event, config),
  'cloud-upload': () => handlers['cloud-upload'](event, { config, fileName: 'x.dat', encryptedData: new Uint8Array([1]) }),
  'cloud-download': () => handlers['cloud-download'](event, { config, fileName: 'x.dat' }),
  'cloud-sync-gallery': () => handlers['cloud-sync-gallery'](event, { config, masterPassword: 'pw' }),
  'cloud-restore-gallery': () => handlers['cloud-restore-gallery'](event, { config, masterPassword: 'pw' }),
});

describe('雲端設定打錯時，處理程序回傳白話錯誤而不是丟出錯誤', () => {
  for (const url of ['not a url', '']) {
    it(`網址格式不對（${JSON.stringify(url)}）`, async () => {
      for (const [name, call] of Object.entries(callAll({ url, username: 'u', password: 'p' }))) {
        const result = await call();
        expect(result.success, name).toBe(false);
        expect(result.error, name).toContain('網址格式不對');
        expect(result.error, name).toContain('（技術細節：Invalid URL');
      }
    });
  }

  it('應用程式密碼有中文（webdav 建立連線時就出錯）', async () => {
    for (const [name, call] of Object.entries(callAll({ url: 'https://dav.example.invalid/', username: 'u', password: '密碼' }))) {
      const result = await call();
      expect(result.success, name).toBe(false);
      expect(result.error, name).toContain('「使用者名稱」或「應用程式密碼」裡有不能用的字元');
      expect(result.error, name).toContain('Latin1');
    }
  });
});
