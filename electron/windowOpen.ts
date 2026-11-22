// 畫面要求開新視窗（例如 <a target="_blank">、window.open）時怎麼處理。
// 這個檔案刻意不 import electron，讓它能直接在 Node（Vitest）中測試。

/**
 * 回傳 { action: 'external', url } 表示交給系統預設的瀏覽器開啟；
 * 回傳 { action: 'deny' } 表示什麼都不開。
 * 只有 http: 與 https: 的網址會交給瀏覽器；file:、javascript:、mailto:、自訂協定等一律拒絕，
 * 程式本身也一律不開新的 Electron 視窗（新視窗沒有網址列，而且可能繼承程式內部的功能）。
 */
export type WindowOpenDecision = { action: 'external'; url: string } | { action: 'deny' };

export function decideWindowOpen(targetUrl: string): WindowOpenDecision {
  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    return { action: 'deny' };
  }
  if (url.protocol === 'http:' || url.protocol === 'https:') {
    return { action: 'external', url: url.href };
  }
  return { action: 'deny' };
}
