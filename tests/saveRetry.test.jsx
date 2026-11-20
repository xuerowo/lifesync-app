import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  saveRetryDelay, saveResultError, toSaveFailure, describeSaveError, SAVE_RETRY_DELAYS_MS,
} from '../src/domain/saveRetry.js';
import SaveErrorBanner from '../src/components/Shared/SaveErrorBanner.jsx';

describe('saveRetryDelay', () => {
  it('依序 2、5、10、30、60 秒，之後固定 60 秒', () => {
    expect([1, 2, 3, 4, 5, 6, 50].map(saveRetryDelay)).toEqual([2000, 5000, 10000, 30000, 60000, 60000, 60000]);
  });

  it('奇怪的次數當成第 1 次', () => {
    expect(saveRetryDelay(0)).toBe(SAVE_RETRY_DELAYS_MS[0]);
    expect(saveRetryDelay(-3)).toBe(SAVE_RETRY_DELAYS_MS[0]);
    expect(saveRetryDelay(NaN)).toBe(SAVE_RETRY_DELAYS_MS[0]);
  });
});

describe('saveResultError', () => {
  it('成功或舊版回傳值（沒有 success 欄位）都不算錯', () => {
    expect(saveResultError({ success: true })).toBeNull();
    expect(saveResultError({ success: true, superseded: true })).toBeNull();
    expect(saveResultError(undefined)).toBeNull();
  });

  it('失敗時保留錯誤碼與訊息', () => {
    const err = saveResultError({ success: false, code: 'EPERM', error: 'operation not permitted' });
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('EPERM');
    expect(err.message).toBe('operation not permitted');
  });

  it('沒有錯誤碼時用 SAVE_FAILED', () => {
    expect(saveResultError({ success: false }).code).toBe('SAVE_FAILED');
  });
});

describe('toSaveFailure', () => {
  const now = new Date('2026-11-20T01:00:00Z');

  it('一般失敗：記下次數與下一次重試的等待時間', () => {
    const f = toSaveFailure(Object.assign(new Error('busy'), { code: 'EBUSY' }), 3, now);
    expect(f).toEqual({ code: 'EBUSY', error: 'busy', blocked: false, failures: 3, retryInMs: 10000, at: now.toISOString() });
  });

  it('SAVE_BLOCKED（讀檔失敗而被擋下）：不排自動重試', () => {
    const f = toSaveFailure(Object.assign(new Error('blocked'), { code: 'SAVE_BLOCKED' }), 1, now);
    expect(f.blocked).toBe(true);
    expect(f.retryInMs).toBeNull();
  });

  it('丟出的不是 Error 也能處理', () => {
    const f = toSaveFailure('boom', 1, now);
    expect(f.code).toBe('SAVE_FAILED');
    expect(f.error).toBe('boom');
  });
});

describe('describeSaveError', () => {
  it('沒有錯誤時不顯示', () => {
    expect(describeSaveError(null)).toBeNull();
  });

  it('一般失敗：說「沒存到」、白話原因、會自動重試、可以手動重試', () => {
    const text = describeSaveError(toSaveFailure(Object.assign(new Error('x'), { code: 'EPERM' }), 2));
    expect(text.title).toContain('還沒有存到');
    expect(text.lines.join('')).toContain('鎖住');
    expect(text.lines.join('')).toContain('約 5 秒後');
    expect(text.canRetry).toBe(true);
  });

  it('瀏覽器模式連不到伺服器、伺服器回錯誤', () => {
    expect(describeSaveError(toSaveFailure({ code: 'SERVER_UNREACHABLE', message: 'Failed to fetch' }, 1)).lines[0]).toContain('連不到');
    expect(describeSaveError(toSaveFailure({ code: 'HTTP_500', message: 'x' }, 1)).lines[0]).toContain('回報錯誤');
    expect(describeSaveError(toSaveFailure({ code: 'ENOSPC', message: 'x' }, 1)).lines[0]).toContain('空間不足');
  });

  it('SAVE_BLOCKED：說明暫停存檔，沒有重試按鈕', () => {
    const text = describeSaveError(toSaveFailure({ code: 'SAVE_BLOCKED', message: 'x' }, 1));
    expect(text.title).toContain('暫停');
    expect(text.canRetry).toBe(false);
  });
});

describe('SaveErrorBanner', () => {
  it('沒有錯誤時什麼都不顯示', () => {
    expect(renderToStaticMarkup(<SaveErrorBanner saveError={null} onRetry={() => {}} />)).toBe('');
  });

  it('失敗時顯示紅色提示、錯誤代碼與「立即重試」', () => {
    const html = renderToStaticMarkup(
      <SaveErrorBanner saveError={toSaveFailure({ code: 'EBUSY', message: 'resource busy' }, 1)} onRetry={() => {}} />,
    );
    expect(html).toContain('最近的修改還沒有存到硬碟');
    expect(html).toContain('EBUSY');
    expect(html).toContain('立即重試');
    expect(html).toContain('role="alert"');
  });

  it('重試中按鈕停用', () => {
    const html = renderToStaticMarkup(
      <SaveErrorBanner saveError={toSaveFailure({ code: 'EBUSY', message: 'x' }, 1)} isRetrying onRetry={() => {}} />,
    );
    expect(html).toContain('重試中…');
    expect(html).toContain('disabled=""');
  });

  it('SAVE_BLOCKED 沒有重試按鈕', () => {
    const html = renderToStaticMarkup(
      <SaveErrorBanner saveError={toSaveFailure({ code: 'SAVE_BLOCKED', message: 'x' }, 1)} onRetry={() => {}} />,
    );
    expect(html).toContain('存檔已暫停');
    expect(html).not.toContain('立即重試');
  });
});
