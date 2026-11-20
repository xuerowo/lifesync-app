/**
 * 日期換算（純函式）
 *
 * 資料裡的時間欄位有四種格式，各自的換算方式不同，不可一律用 new Date() 處理：
 *
 * | 欄位                         | 格式                                   | 意思               |
 * |------------------------------|----------------------------------------|--------------------|
 * | completedAt、createdAt        | 真正的 UTC 時間，例如 2026-03-04T17:30:00.000Z | 要先換成本地時間   |
 * | lastCompletedAt              | 本地時間，但結尾也標了 Z（getLocalISOString 產生） | 前 10 個字就是本地日期 |
 * | startDateTime、endDateTime    | 本地時間、沒有 Z，例如 2026-03-05T09:00 | 前 10 個字就是本地日期 |
 * | startDate、endDate（計畫）     | 只有日期，例如 2026-03-05               | 原樣就是本地日期   |
 *
 * 所有函式都回傳「本地日期」字串 YYYY-MM-DD；無法辨識時回傳 null。
 */

const DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

const pad2 = (n) => String(n).padStart(2, '0');

/** Date 物件 → 本地日期 YYYY-MM-DD */
export function localDateOf(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** 本地日期 YYYY-MM-DD → 當天本地午夜的 Date；格式不對回傳 null */
export function parseLocalDate(dateStr) {
  const m = typeof dateStr === 'string' ? DATE_PREFIX.exec(dateStr) : null;
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

/** 取字串開頭的 YYYY-MM-DD；沒有就回傳 null */
function datePrefix(str) {
  if (typeof str !== 'string') return null;
  const m = DATE_PREFIX.exec(str);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * 真正的 UTC 時間（completedAt、createdAt）→ 本地日期。
 * @param {string} iso
 * @param {number} [offsetMinutes] 時區差，正負號與 Date#getTimezoneOffset 相同
 *   （UTC+8 是 -480，UTC-5 是 300）。不給就用該時間點本機的時區（會處理日光節約）。
 */
export function localDateFromUtcIso(iso, offsetMinutes) {
  if (typeof iso !== 'string' || !iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const offset = Number.isFinite(offsetMinutes) ? offsetMinutes : d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

/** lastCompletedAt（本地時間，結尾標了 Z）→ 本地日期 */
export function localDateFromLocalStampedIso(str) {
  return datePrefix(str);
}

/** startDateTime、endDateTime（本地時間，沒有 Z）→ 本地日期 */
export function localDateFromLocalDateTime(str) {
  return datePrefix(str);
}

/** startDate、endDate（只有日期）→ 本地日期 */
export function localDateFromDateOnly(str) {
  return datePrefix(str);
}
