// 畫面上顯示日期、時間的統一寫法（docs/wording-review.md「標點與格式」）：
// 日期 2026/11/22、時間 14:05（24 小時制、不顯示秒）、範圍用「～」。
// 只負責「怎麼寫出來」：傳進來的 Date 要怎麼解讀（本地時間、UTC）由呼叫的地方照原本的方式決定。

const pad2 = (n) => String(n).padStart(2, '0');

const toDate = (value) => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value === null || value === undefined || value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** 範圍的分隔符號，例如「09:00～10:00」 */
export const RANGE_SEP = '～';

/** 2026/11/22（看不懂的值回傳空字串） */
export function formatDisplayDate(value) {
  const d = toDate(value);
  return d ? `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}` : '';
}

/** 14:05（24 小時制，看不懂的值回傳空字串） */
export function formatDisplayTime(value) {
  const d = toDate(value);
  return d ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : '';
}

/** 2026/11/22 14:05 */
export function formatDisplayDateTime(value) {
  const d = toDate(value);
  return d ? `${formatDisplayDate(d)} ${formatDisplayTime(d)}` : '';
}

/** 2026 年 11 月 */
export function formatDisplayMonth(value) {
  const d = toDate(value);
  return d ? `${d.getFullYear()} 年 ${d.getMonth() + 1} 月` : '';
}
