import { describe, it, expect } from 'vitest';
import {
  httpStatusOf, errorCodeOf, cloudErrorReason, describeCloudError, fileErrorReason, describeFileError,
} from '../src/shared/errorMessages.js';

// webdav 套件丟出的錯誤長這樣：訊息「Invalid response: 401 Unauthorized」，另外帶 status
const httpError = (status, text) => Object.assign(new Error(`Invalid response: ${status} ${text}`), { status });
// node-fetch 連不上時：訊息含原因，code 是 Node 的錯誤碼
const netError = (code) =>
  Object.assign(new Error(`request to https://dav.example.com/ failed, reason: getaddrinfo ${code} dav.example.com`), { code });
const fsError = (code) => Object.assign(new Error(`${code}: no such file or directory, scandir 'D:\\x'`), { code });

describe('httpStatusOf / errorCodeOf', () => {
  it('從錯誤物件取，也能從已經變成文字的訊息取', () => {
    expect(httpStatusOf(httpError(401, 'Unauthorized'))).toBe(401);
    expect(httpStatusOf('Invalid response: 404 Not Found')).toBe(404);
    expect(errorCodeOf(netError('ENOTFOUND'))).toBe('ENOTFOUND');
    expect(errorCodeOf('request to https://x/ failed, reason: connect ECONNREFUSED 127.0.0.1:443')).toBe('ECONNREFUSED');
  });

  it('網址裡的數字（例如 :443）不會被當成狀態碼', () => {
    expect(httpStatusOf('request to https://x:443/dav failed')).toBeNull();
  });
});

describe('cloudErrorReason', () => {
  it('401：帳號或應用程式密碼錯誤', () => {
    expect(cloudErrorReason(httpError(401, 'Unauthorized'))).toContain('帳號或應用程式密碼錯誤');
  });

  it('404：下載時說雲端還沒有備份；圖庫下載說還沒有圖庫；其他時候說網址可能打錯', () => {
    expect(cloudErrorReason(httpError(404, 'Not Found'), { action: 'download' })).toContain('雲端上還沒有備份，請先在另一台電腦按「上傳到雲端」');
    expect(cloudErrorReason(httpError(404, 'Not Found'), { action: 'gallery-download' })).toContain('「上傳圖庫」');
    expect(cloudErrorReason(httpError(404, 'Not Found'), { action: 'test' })).toContain('網址');
  });

  it('連不上（DNS、被拒絕、逾時、網路斷線）：請檢查網址和網路', () => {
    for (const code of ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT']) {
      expect(cloudErrorReason(netError(code))).toBe('連不上伺服器，請檢查網址和網路。');
    }
    expect(cloudErrorReason(new Error('network down'))).toBe('連不上伺服器，請檢查網址和網路。');
  });

  it('空間不足、伺服器錯誤、憑證問題、網址格式不對', () => {
    expect(cloudErrorReason(httpError(507, 'Insufficient Storage'))).toContain('空間不足');
    expect(cloudErrorReason(httpError(503, 'Service Unavailable'))).toContain('稍後再試');
    expect(cloudErrorReason(Object.assign(new Error('certificate has expired'), { code: 'CERT_HAS_EXPIRED' }))).toContain('憑證');
    expect(cloudErrorReason(Object.assign(new TypeError('Invalid URL'), { code: 'ERR_INVALID_URL' }))).toContain('網址格式不對');
  });

  it('認不出來的錯誤回傳 null', () => {
    expect(cloudErrorReason(new Error('something odd'))).toBeNull();
    expect(cloudErrorReason(null)).toBeNull();
  });
});

describe('describeCloudError', () => {
  it('白話說明在前，英文原文放在「技術細節」', () => {
    expect(describeCloudError(httpError(401, 'Unauthorized'), { action: 'test' })).toBe(
      '帳號或應用程式密碼錯誤。請確認「使用者名稱」和「應用程式密碼」（要用在雲端服務網站建立的應用程式密碼，不是你的登入密碼）。\n' +
        '（技術細節：Invalid response: 401 Unauthorized）'
    );
  });

  it('認不出來的錯誤原樣顯示，不吃掉原文', () => {
    expect(describeCloudError(new Error('something odd'))).toBe('something odd');
    expect(describeCloudError(undefined)).toBe('未知的錯誤');
  });
});

describe('fileErrorReason / describeFileError', () => {
  it('掃描資料夾找不到：請確認路徑', () => {
    expect(fileErrorReason(fsError('ENOENT'), { action: 'scan-folder' })).toBe('找不到這個資料夾，請確認路徑。');
    expect(describeFileError(fsError('ENOENT'), { action: 'scan-folder' })).toContain('技術細節：ENOENT');
  });

  it('還原備份時資料夾裡沒有 lifesync-data.json：不是 LifeSync 的完整備份', () => {
    expect(fileErrorReason(fsError('ENOENT'), { action: 'restore-backup' })).toContain('這個資料夾不是 LifeSync 的完整備份');
  });

  it('還原備份時資料檔壞掉（JSON 解析失敗）', () => {
    let parseError;
    try {
      JSON.parse('{oops');
    } catch (e) {
      parseError = e;
    }
    expect(fileErrorReason(parseError, { action: 'restore-backup' })).toContain('壞掉了');
    // 不是還原備份時，解析錯誤不認得
    expect(fileErrorReason(parseError, { action: 'scan-folder' })).toBeNull();
  });

  it('權限、磁碟空間不足；沒有錯誤碼的錯誤原樣顯示', () => {
    expect(fileErrorReason(fsError('EACCES'))).toContain('沒有權限');
    expect(fileErrorReason(fsError('ENOSPC'))).toContain('磁碟空間不足');
    expect(describeFileError(new Error('weird'))).toBe('weird');
  });
});
