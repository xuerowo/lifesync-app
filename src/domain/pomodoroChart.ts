// 專注紀錄（PomodoroSummary）的時間分配圖：每段長條多寬、每個標記放在哪裡（百分比）。
// 純函式，不碰畫面，方便測試。

/** 全程秒數能不能拿來當分母：要是大於 0 的正常數字 */
const usableTotal = (totalSeconds: number | null | undefined): totalSeconds is number =>
  typeof totalSeconds === 'number' && Number.isFinite(totalSeconds) && totalSeconds > 0;

/**
 * 一段長條佔全程的百分比。
 * 全程時間是 0（或缺少、不是正常數字）時沒辦法算比例，一律回傳 0，不會變成無限大或 NaN。
 */
export function segmentWidthPercent(durationSeconds: number, totalSeconds: number | null | undefined): number {
  if (!usableTotal(totalSeconds) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  return (durationSeconds / totalSeconds) * 100;
}

/**
 * 某個時間點在時間軸上的位置（從開始算起佔全程的百分比，沒有限制在 0～100 之間）。
 * 全程時間是 0、或時間讀不出來時回傳 null（沒有位置可放）。
 */
export function timelinePercent(
  time: string | null | undefined,
  startTime: string | null | undefined,
  totalSeconds: number | null | undefined,
): number | null {
  if (!usableTotal(totalSeconds) || !time || !startTime) return null;
  const offsetMs = new Date(time).getTime() - new Date(startTime).getTime();
  if (!Number.isFinite(offsetMs)) return null;
  return (offsetMs / (totalSeconds * 1000)) * 100;
}

/**
 * 任務完成標記的位置：和 timelinePercent 相同，但限制在 0～100% 之間
 * （例如結束那一刻才按完成，時間稍微超過結束時間，就放在最右邊，不會跑到圖外面）。
 */
export function taskMarkerPercent(
  time: string | null | undefined,
  startTime: string | null | undefined,
  totalSeconds: number | null | undefined,
): number | null {
  const percent = timelinePercent(time, startTime, totalSeconds);
  return percent === null ? null : Math.min(100, Math.max(0, percent));
}
