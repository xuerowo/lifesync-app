// 瀏覽器模式的 server.ts「掃描獎勵圖片資料夾」（POST /api/rewards/scan）：從要求內容取出資料夾路徑。
// 獨立成一個檔案，是因為 server.ts 一載入就會開始監聽連接埠，測試不能直接 import 它（tests/scanFolderRequest.test.ts）。

/** 沒有填路徑（或要求裡根本沒有內容）時回給畫面的錯誤 */
export const MISSING_FOLDER_PATH_MESSAGE = '請先輸入資料夾路徑。';

/**
 * 取出要求內容裡的 folderPath；沒有、不是文字或只有空白時回傳 null。
 * 要求沒有 JSON 內容時，Express 給的 req.body 是 undefined，所以參數是 unknown，不能直接解構。
 * 路徑原樣回傳（不去掉前後空白），和原本一樣交給檔案系統判斷存不存在。
 */
export function folderPathFromBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const folderPath = (body as { folderPath?: unknown }).folderPath; // 已確認是物件，只讀這一個欄位
  if (typeof folderPath !== 'string' || folderPath.trim() === '') return null;
  return folderPath;
}
