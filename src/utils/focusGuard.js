// 保險：點了畫面、頁面卻沒有鍵盤焦點時，請主程序把焦點交回頁面。
//
// Windows 上的 Electron 會進入「視窗在最前面、頁面卻沒有鍵盤焦點」的狀態
// （已在打包版實測重現：畫面原生的 alert／confirm 關掉之後；也可能有其他還不知道的原因）。
// 這時點輸入框，輸入框雖然變成「目前的元素」，但 document.hasFocus() 是 false，
// 不會出現游標、打字也進不去；視窗沒有切換，所以主程序也不會收到任何焦點事件。
// 這裡在每次按下滑鼠後稍等一下再檢查：還是沒有焦點，就請主程序修復（electron/main.js 的 page-refocus）。
// 稍等是為了避開「從別的程式點回這個視窗」的正常情況：那時焦點會在點擊後馬上到位，不需要修。
// 平常每次點擊只多讀一個布林值，成本可以忽略。

export const RECHECK_DELAY_MS = 150;
const MIN_INTERVAL_MS = 1000;

/** 裝上保險；回傳移除用的函式。target 通常是 window，沒有 Electron 的 api 時什麼都不做 */
export function installFocusGuard(target, { delayMs = RECHECK_DELAY_MS, now = () => Date.now() } = {}) {
  const api = target?.electronAPI;
  if (typeof api?.refocusPage !== 'function') return () => {};
  const doc = target.document;
  let lastRequest = -Infinity;
  let timer = null;
  const onPointerDown = () => {
    if (timer !== null) return;
    timer = target.setTimeout(() => {
      timer = null;
      if (doc.hasFocus() || doc.visibilityState === 'hidden') return;
      // 修復時視窗焦點會換一下，太頻繁會閃，一秒最多一次
      if (now() - lastRequest < MIN_INTERVAL_MS) return;
      lastRequest = now();
      api.refocusPage();
    }, delayMs);
  };
  target.addEventListener('pointerdown', onPointerDown, true);
  return () => {
    target.removeEventListener('pointerdown', onPointerDown, true);
    if (timer !== null) target.clearTimeout(timer);
  };
}
