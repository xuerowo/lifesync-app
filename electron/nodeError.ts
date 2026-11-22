// catch 到的錯誤在 TypeScript 裡是 unknown（什麼都可能被丟出來），直接寫 e.message、e.code 會被型別檢查擋下。
// 主程序、瀏覽器模式的 server 與腳本裡會丟錯的，都是 Node（fs、JSON.parse……）或 webdav 套件丟出的 Error，
// 有字串的 message、可能有 code，所以統一用這個函式當成 Node 的錯誤物件來讀。
//
// 它只告訴型別檢查「欄位是什麼型別」，不檢查、不轉換內容：執行起來和原本直接寫 e.message、e.code 完全一樣。

/** 把 catch 到的錯誤當成 Node 的錯誤物件（message、code）來讀 */
export const nodeError = (error: unknown): NodeJS.ErrnoException =>
  error as NodeJS.ErrnoException; // 只改型別、不改值：這裡的錯誤都來自 Node 或 webdav（見檔案開頭）
