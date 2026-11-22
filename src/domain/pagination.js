/**
 * 分頁輔助（純函式）
 */
import { RANGE_SEP } from '../utils/displayFormat.js';

/** 總頁數，至少 1 頁 */
export function getTotalPages(totalItems, perPage) {
  if (!(perPage > 0)) return 1;
  return Math.max(1, Math.ceil((Number(totalItems) || 0) / perPage));
}

/**
 * 把頁碼限制在 1 ～ 總頁數之間。
 * 資料變少（例如刪除）讓目前頁碼超出範圍時，會退回最後一頁。
 */
export function clampPage(page, totalItems, perPage) {
  const totalPages = getTotalPages(totalItems, perPage);
  const p = Number.isFinite(page) ? Math.floor(page) : 1;
  return Math.min(Math.max(1, p), totalPages);
}

/**
 * 分頁下方的說明文字，例如「第 11～20 筆，共 25 筆」。
 * page 會先限制在 1 ～ 總頁數之間；沒有資料時回傳「共 0 筆」。
 */
export function formatPageRange(page, totalItems, perPage) {
  const total = Math.max(0, Number(totalItems) || 0);
  if (total === 0 || !(perPage > 0)) return `共 ${total} 筆`;
  const p = clampPage(page, total, perPage);
  const from = (p - 1) * perPage + 1;
  const to = Math.min(p * perPage, total);
  return `第 ${from}${RANGE_SEP}${to} 筆，共 ${total} 筆`;
}
