import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  describeLoadError, describeRestoreFailure, describeRestoreSuccess, describeSecretsUnavailable,
  formatLocalDateTime, baseName, LOAD_ERROR_SAFETY_NOTE,
} from '../src/domain/loadError.js';
import LoadErrorScreen from '../src/components/Shared/LoadErrorScreen.jsx';

describe('describeLoadError', () => {
  it('檔案壞掉（PARSE_ERROR）：說明原因，不建議先重試', () => {
    const d = describeLoadError({ code: 'PARSE_ERROR', error: 'Unexpected end of JSON input' });
    expect(d.reason).toContain('壞掉');
    expect(d.suggestRetryFirst).toBe(false);
  });

  it('資料檔不見但有備份', () => {
    const d = describeLoadError({ code: 'MISSING_WITH_BACKUPS' });
    expect(d.reason).toContain('找不到資料檔');
    expect(d.suggestRetryFirst).toBe(false);
  });

  it.each(['EBUSY', 'EPERM', 'EACCES'])('檔案被鎖住（%s）：建議先重試', (code) => {
    const d = describeLoadError({ code });
    expect(d.reason).toContain('鎖住');
    expect(d.suggestRetryFirst).toBe(true);
  });

  it('格式不對、瀏覽器模式的伺服器錯誤、不認識的錯誤都有說明', () => {
    expect(describeLoadError({ code: 'INVALID_FORMAT' }).reason).toContain('格式');
    expect(describeLoadError({ code: 'HTTP_500' }).reason).toContain('server.js');
    expect(describeLoadError({ code: 'WHATEVER' }).reason).toContain('預料之外');
    expect(describeLoadError(null).reason).toContain('預料之外');
  });
});

describe('describeRestoreFailure', () => {
  it('沒有備份時直說，並保證原檔沒動', () => {
    const text = describeRestoreFailure({ code: 'NO_BACKUP', error: '找不到可用的備份' });
    expect(text).toContain('沒有可以用的自動備份');
    expect(text).toContain('沒有被動過');
  });

  it('其他失敗附上原因', () => {
    expect(describeRestoreFailure({ code: 'EBUSY', error: 'resource busy' })).toContain('resource busy');
  });
});

describe('describeRestoreSuccess', () => {
  it('寫出備份的時間、檔名，以及壞檔保留的位置', () => {
    const lines = describeRestoreSuccess({
      restoredFrom: 'C:\\x\\backups\\lifesync-data-2026-11-19.json',
      restoredFromTime: new Date(2026, 10, 19, 8, 5).toISOString(),
      preservedAs: 'C:\\x\\lifesync-data.corrupt-20261120-093000.json',
    });
    expect(lines[0]).toContain('2026/11/19 08:05');
    expect(lines[0]).toContain('lifesync-data-2026-11-19.json');
    expect(lines[0]).toContain('之後做的修改不在裡面');
    expect(lines[1]).toContain('C:\\x\\lifesync-data.corrupt-20261120-093000.json');
  });

  it('沒有壞檔（資料檔本來就不見）時不提保留位置', () => {
    const lines = describeRestoreSuccess({ restoredFrom: '/x/backups/snapshot-1.json', restoredFromTime: null, preservedAs: null });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('snapshot-1.json');
  });
});

describe('describeSecretsUnavailable', () => {
  it('沒有解不開的欄位時不顯示', () => {
    expect(describeSecretsUnavailable([])).toBeNull();
    expect(describeSecretsUnavailable(undefined)).toBeNull();
  });

  it('列出要重新輸入的欄位', () => {
    const text = describeSecretsUnavailable(['password', 'masterPassword']);
    expect(text).toContain('WebDAV 應用程式密碼和數據加密主密碼');
    expect(text).toContain('重新輸入');
  });
});

describe('小工具', () => {
  it('formatLocalDateTime 用本地時間；看不懂就回傳 null', () => {
    expect(formatLocalDateTime(new Date(2026, 0, 2, 3, 4).toISOString())).toBe('2026/01/02 03:04');
    expect(formatLocalDateTime('not a date')).toBeNull();
    expect(formatLocalDateTime(null)).toBeNull();
  });

  it('baseName 同時處理 \\ 與 /', () => {
    expect(baseName('C:\\a\\b.json')).toBe('b.json');
    expect(baseName('/a/b.json')).toBe('b.json');
    expect(baseName('')).toBe('');
  });
});

describe('LoadErrorScreen', () => {
  const render = (props) =>
    renderToStaticMarkup(
      <LoadErrorScreen
        loadError={{ code: 'PARSE_ERROR', error: 'Unexpected end of JSON input', dataFile: 'C:\\d\\lifesync-data.json' }}
        busy={null}
        canRestore
        restoreFailure={null}
        onRetry={() => {}}
        onRestore={() => {}}
        {...props}
      />,
    );

  it('顯示白話原因、保證資料沒事、兩個按鈕、錯誤代碼與資料檔位置', () => {
    const html = render();
    expect(html).toContain('資料讀不出來');
    expect(html).toContain('壞掉');
    expect(html).toContain(LOAD_ERROR_SAFETY_NOTE);
    expect(html).toContain('重試');
    expect(html).toContain('載入最近一次自動備份');
    expect(html).toContain('PARSE_ERROR');
    expect(html).toContain('C:\\d\\lifesync-data.json');
  });

  it('瀏覽器模式只有重試，並說明不能從這裡載入備份', () => {
    const html = render({ canRestore: false });
    expect(html).toContain('重試');
    expect(html).not.toContain('載入最近一次自動備份');
    expect(html).toContain('瀏覽器模式不能從這裡載入備份');
  });

  it('沒有備份時顯示原因', () => {
    expect(render({ restoreFailure: { code: 'NO_BACKUP' } })).toContain('沒有可以用的自動備份');
  });

  it('進行中時按鈕停用並顯示進度文字', () => {
    const html = render({ busy: 'restore' });
    expect(html).toContain('載入備份中…');
    expect((html.match(/disabled=""/g) || []).length).toBe(2);
  });
});
