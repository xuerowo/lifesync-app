import { describe, it, expect } from 'vitest';
import {
  evaluateMasterPassword, masterPasswordBlockMessage, isInsecureWebdavUrl, INSECURE_URL_WARNING,
} from '../src/domain/masterPassword.js';

const evaluate = (saved, draft, confirm) => evaluateMasterPassword({ saved, draft, confirm });

describe('evaluateMasterPassword：已經存好主密碼的人', () => {
  it('沒有在改、確認欄空白：不擋任何雲端功能，也不顯示訊息', () => {
    const s = evaluate('old-secret', null, '');
    expect(s).toMatchObject({ status: 'unchanged', value: 'old-secret', changed: false, blocksCloud: false, shouldCommit: false, message: null });
  });

  it('主密碼欄改回和原本一樣：視為沒有在改', () => {
    expect(evaluate('old-secret', 'old-secret', '').status).toBe('unchanged');
  });

  it('自己在確認欄驗證，輸入正確：顯示相同', () => {
    const s = evaluate('old-secret', null, 'old-secret');
    expect(s.status).toBe('verified');
    expect(s.blocksCloud).toBe(false);
    expect(s.tone).toBe('ok');
  });

  it('自己在確認欄驗證，輸入不同：擋下雲端功能並提醒', () => {
    const s = evaluate('old-secret', null, 'old-secrex');
    expect(s.status).toBe('mismatch');
    expect(s.blocksCloud).toBe(true);
    expect(s.message).toContain('不一樣');
  });
});

describe('evaluateMasterPassword：修改或第一次輸入主密碼', () => {
  it('第一次輸入、確認欄還沒填：要求再輸入一次，擋下雲端功能，不儲存', () => {
    const s = evaluate('', 'new-secret', '');
    expect(s).toMatchObject({ status: 'needs-confirm', changed: true, blocksCloud: true, shouldCommit: false, tone: 'warning' });
    expect(s.message).toContain('再輸入一次主密碼');
  });

  it('兩次不一樣：擋下且不儲存', () => {
    const s = evaluate('old-secret', 'new-secret', 'new-secrt');
    expect(s).toMatchObject({ status: 'mismatch', blocksCloud: true, shouldCommit: false, tone: 'error' });
    expect(s.message).toContain('還沒有儲存');
  });

  it('兩次一樣：應該立刻儲存', () => {
    const s = evaluate('old-secret', 'new-secret', 'new-secret');
    expect(s).toMatchObject({ status: 'match', value: 'new-secret', blocksCloud: false, shouldCommit: true });
  });

  it('把已存的主密碼刪成空白：不儲存，提示可以取消修改', () => {
    const s = evaluate('old-secret', '', '');
    expect(s).toMatchObject({ status: 'empty', blocksCloud: true, shouldCommit: false });
    expect(s.message).toContain('取消修改');
  });

  it('已存的是空白、什麼都沒填：不算在改（雲端按鈕由「請先設定主密碼」擋下）', () => {
    expect(evaluate('', null, '').status).toBe('unchanged');
    expect(evaluate(undefined, '', '').status).toBe('unchanged');
  });

  it('只差大小寫或空白也算不一樣', () => {
    expect(evaluate('', 'Secret', 'secret').status).toBe('mismatch');
    expect(evaluate('', 'secret', 'secret ').status).toBe('mismatch');
  });
});

describe('masterPasswordBlockMessage', () => {
  it('不需要擋時回傳 null', () => {
    expect(masterPasswordBlockMessage(evaluate('a', null, ''), '上傳')).toBeNull();
  });

  it('需要擋時說明這次沒有做什麼，以及原因', () => {
    const msg = masterPasswordBlockMessage(evaluate('a', 'b', 'c'), '上傳');
    expect(msg).toContain('這次沒有上傳');
    expect(msg).toContain('不一樣');
  });
});

describe('isInsecureWebdavUrl', () => {
  it('http:// 開頭（不分大小寫、前面有空白）要警告', () => {
    expect(isInsecureWebdavUrl('http://nas.local/dav')).toBe(true);
    expect(isInsecureWebdavUrl('  HTTP://nas.local')).toBe(true);
  });

  it('https://、空白、其他文字不警告', () => {
    expect(isInsecureWebdavUrl('https://app.koofr.net/dav/Koofr')).toBe(false);
    expect(isInsecureWebdavUrl('')).toBe(false);
    expect(isInsecureWebdavUrl(undefined)).toBe(false);
    expect(isInsecureWebdavUrl('httpx://a')).toBe(false);
  });

  it('警告文字說明風險與建議', () => {
    expect(INSECURE_URL_WARNING).toContain('明文');
    expect(INSECURE_URL_WARNING).toContain('https://');
  });
});
