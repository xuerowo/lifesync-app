/**
 * 設定頁的「資料加密主密碼」與「再輸入一次主密碼」（H11），以及 WebDAV 網址的 http 警告。
 *
 * 主密碼打錯一個字，雲端備份就永遠解不開，所以「修改」主密碼時要輸入兩次，兩次一樣才儲存。
 * 已經存好主密碼的人（沒有在改）不強迫重新輸入：他們一直用這個主密碼上傳，雲端那份就是用它加密的，
 * 硬要他們再輸入一次，萬一想不起來反而什麼都不能做。想確認自己記得沒錯，也可以在確認欄輸入看看。
 *
 * 只處理規則與文字，不碰畫面，所以可以直接測試。
 */

/**
 * 主密碼兩欄目前的狀態：
 *   unchanged：沒有在改，也沒填確認欄（可以使用雲端功能）
 *   verified：沒有在改，確認欄和已存的主密碼相同
 *   needs-confirm：改了主密碼，確認欄還沒填
 *   mismatch：兩次輸入不一樣
 *   empty：把主密碼改成空白
 *   match：改了主密碼，兩次相同（可以按「確認主密碼」儲存；按之前還沒存，雲端功能仍會擋下）
 *
 * 不會在打字途中自動儲存：兩欄「剛好」一樣的那一刻（例如確認欄先打好 abcd，主密碼欄打 abcde 打到一半），
 * 不代表使用者打完了。所以一律等使用者按「確認主密碼」才存，取消修改時也才能改回原本的主密碼。
 */
export type MasterPasswordStatus = 'unchanged' | 'verified' | 'needs-confirm' | 'mismatch' | 'empty' | 'match';

/** evaluateMasterPassword 的結果 */
export interface MasterPasswordState {
  status: MasterPasswordStatus;
  /** 目前主密碼欄的內容（沒有在改時是已存的主密碼） */
  value: string;
  /** 主密碼欄和已存的不一樣 */
  changed: boolean;
  /** 這個狀態下要擋住雲端功能 */
  blocksCloud: boolean;
  /** 可以儲存（只有 match 時為 true），由使用者按「確認主密碼」觸發 */
  canCommit: boolean;
  /** 要顯示的說明；沒有時是 null */
  message: string | null;
  /** 說明的顏色 */
  tone: 'ok' | 'warning' | 'error' | null;
}

/**
 * saved：已經存起來的主密碼；draft：主密碼欄正在輸入的內容（null＝沒有在改，顯示已存的）；confirm：確認欄
 */
export function evaluateMasterPassword({
  saved,
  draft,
  confirm,
}: {
  saved: string | null | undefined;
  draft: string | null | undefined;
  confirm: string | null | undefined;
}): MasterPasswordState {
  const savedValue = saved || '';
  const confirmValue = confirm || '';
  const value = draft ?? savedValue;
  const changed = draft !== null && draft !== undefined && draft !== savedValue;

  const result = (status: MasterPasswordStatus, extra?: Partial<MasterPasswordState>): MasterPasswordState => ({
    status, value, changed, blocksCloud: false, canCommit: false, message: null, tone: null, ...extra,
  });

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
        message: '主密碼改過了，請在「再輸入一次主密碼」填入一模一樣的內容，再按「確認主密碼」才會儲存。',
      });
    }
    if (confirmValue !== value) {
      return result('mismatch', {
        blocksCloud: true,
        tone: 'error',
        message: '兩次輸入的主密碼不一樣，新的主密碼還沒有儲存。請重新輸入，或按「取消修改」改回原本的主密碼。',
      });
    }
    return result('match', {
      canCommit: true,
      blocksCloud: true,
      tone: 'warning',
      message: '兩次輸入相同。按「確認主密碼」才會儲存新的主密碼；沒按就離開設定頁，這次修改會被放棄。',
    });
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

/** 按「確認主密碼」儲存後顯示的訊息 */
export const MASTER_PASSWORD_SAVED_MESSAGE = '新的主密碼已儲存。';

/**
 * 主密碼還沒確認好時，按雲端按鈕要跳出的說明。
 * @param actionLabel 例如「上傳到雲端」「從雲端還原」
 * 不需要擋的時候回傳 null
 */
export function masterPasswordBlockMessage(state: Pick<MasterPasswordState, 'blocksCloud' | 'message'> | null | undefined, actionLabel: string): string | null {
  if (!state?.blocksCloud) return null;
  return `主密碼還沒確認好，所以這次沒有${actionLabel}。\n\n${state.message}`;
}

/** WebDAV 網址是不是 http://（沒有加密的連線） */
export function isInsecureWebdavUrl(url: unknown): boolean {
  return /^\s*http:\/\//i.test(String(url || ''));
}

export const INSECURE_URL_WARNING =
  '這個網址是 http:// 開頭，連線沒有加密：你的 WebDAV 帳號和應用程式密碼會用明文在網路上傳送，同一個網路上的人有機會看到。' +
  '資料檔本身仍然有主密碼加密。如果服務商支援，請改用 https:// 開頭的網址。';
