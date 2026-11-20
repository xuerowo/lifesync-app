/**
 * 分頁輔助（純函式）
 */

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
