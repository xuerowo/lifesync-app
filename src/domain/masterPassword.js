/**
 * 設定頁的「數據加密主密碼」與「再輸入一次主密碼」（H11），以及 WebDAV 網址的 http 警告。
 *
 * 主密碼打錯一個字，雲端備份就永遠解不開，所以「修改」主密碼時要輸入兩次，兩次一樣才儲存。
 * 已經存好主密碼的人（沒有在改）不強迫重新輸入：他們一直用這個主密碼上傳，雲端那份就是用它加密的，
 * 硬要他們再輸入一次，萬一想不起來反而什麼都不能做。想確認自己記得沒錯，也可以在確認欄輸入看看。
 *
 * 只處理規則與文字，不碰畫面，所以可以直接測試。
 */

/**
 * @typedef {'unchanged'|'verified'|'needs-confirm'|'mismatch'|'empty'|'match'} MasterPasswordStatus
 *   unchanged：沒有在改，也沒填確認欄（可以使用雲端功能）
 *   verified：沒有在改，確認欄和已存的主密碼相同
 *   needs-confirm：改了主密碼，確認欄還沒填
 *   mismatch：兩次輸入不一樣
 *   empty：把主密碼改成空白
 *   match：改了主密碼，兩次相同（應該立刻儲存）
 */

/**
 * @param {{ saved: string, draft: string|null, confirm: string }} input
 *   saved：已經存起來的主密碼；draft：主密碼欄正在輸入的內容（null＝沒有在改，顯示已存的）；confirm：確認欄
 * @returns {{ status: MasterPasswordStatus, value: string, changed: boolean, blocksCloud: boolean, shouldCommit: boolean, message: string|null, tone: 'ok'|'warning'|'error'|null }}
 */
export function evaluateMasterPassword({ saved, draft, confirm }) {
  const savedValue = saved || '';
  const confirmValue = confirm || '';
  const value = draft ?? savedValue;
  const changed = draft !== null && draft !== undefined && draft !== savedValue;

  const result = (status, extra) => ({ status, value, changed, blocksCloud: false, shouldCommit: false, message: null, tone: null, ...extra });

  if (changed) {
    if (value === '') {
      return result('empty', {
        blocksCloud: true,
        tone: 'warning',
        message: '主密碼不能是空的。不想改的話，按「取消修改」改回原本的主密碼。',
      });
    }
    if (confirmValue === '') {
      return result('needs-confirm', {
        blocksCloud: true,
        tone: 'warning',
        message: '主密碼改過了，請在「再輸入一次主密碼」填入一模一樣的內容；兩次一樣才會儲存。',
      });
    }
    if (confirmValue !== value) {
      return result('mismatch', {
        blocksCloud: true,
        tone: 'error',
        message: '兩次輸入的主密碼不一樣，新的主密碼還沒有儲存。請重新輸入，或按「取消修改」改回原本的主密碼。',
      });
    }
    return result('match', { shouldCommit: true, tone: 'ok', message: '兩次輸入相同，新的主密碼已儲存。' });
  }

  if (confirmValue === '') return result('unchanged');
  if (confirmValue === value) {
    return result('verified', { tone: 'ok', message: '兩次輸入相同。' });
  }
  return result('mismatch', {
    blocksCloud: true,
    tone: 'error',
    message: '「再輸入一次」和目前存著的主密碼不一樣。請確認哪一個才是正確的主密碼：用錯的主密碼上傳，之後就解不開了。',
  });
}

/**
 * 主密碼還沒確認好時，按雲端按鈕要跳出的說明。
 * @param {ReturnType<typeof evaluateMasterPassword>} state
 * @param {string} actionLabel 例如「上傳」「還原」
 * @returns {string|null} 不需要擋的時候回傳 null
 */
export function masterPasswordBlockMessage(state, actionLabel) {
  if (!state?.blocksCloud) return null;
  return `主密碼還沒確認好，所以這次沒有${actionLabel}。\n\n${state.message}`;
}

/** WebDAV 網址是不是 http://（沒有加密的連線） */
export function isInsecureWebdavUrl(url) {
  return /^\s*http:\/\//i.test(String(url || ''));
}

export const INSECURE_URL_WARNING =
  '這個網址是 http:// 開頭，連線沒有加密：你的 WebDAV 帳號和應用程式密碼會用明文在網路上傳送，同一個網路上的人有機會看到。' +
  '資料檔本身仍然有主密碼加密。如果服務商支援，請改用 https:// 開頭的網址。';
