import { WEEK_DAYS } from '../constants/index.jsx';

export const generateTeethPath = (width, height, teethHeight, isTop) => {
  const teethCount = 20;
  const toothWidth = width / teethCount;
  let path = '';
  if (isTop) {
    path = `M0,0 L${width},0 L${width},${height - teethHeight} `;
    for (let i = 0; i < teethCount; i++) {
      const x = width - (i * toothWidth);
      path += `L${x - (toothWidth / 2)},${height} L${x - toothWidth},${height - teethHeight} `;
    }
    path += 'Z';
  } else {
    path = `M0,${height} L0,0 `;
    for (let i = 0; i < teethCount; i++) {
      const x = i * toothWidth;
      path += `L${x + (toothWidth / 2)},${teethHeight} L${x + toothWidth},0 `;
    }
    path += `L${width},${height} Z`;
  }
  return path;
};

export const getDateStr = (date = new Date()) => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().split('T')[0];
};

export const getTodayStr = () => getDateStr(new Date());

export const getLocalISOString = (date = new Date()) => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString();
};

export const formatForDateTimeLocal = (isoStr) => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
};

export const formatTaskTime = (task, isCompact = false) => {
  if (task.type === 'daily') {
    if (task.noTime) return isCompact ? '' : '每日 (不限時間)';
    return isCompact ? `${task.startTime} - ${task.endTime}` : `每日 ${task.startTime} - ${task.endTime}`;
  }
  if (task.type === 'weekly') {
    const daysStr = task.days.map(d => WEEK_DAYS[d]).join('、');
    if (task.noTime) return isCompact ? '' : `每週(${daysStr}) (不限時間)`;
    return isCompact ? `${task.startTime} - ${task.endTime}` : `每週(${daysStr}) ${task.startTime} - ${task.endTime}`;
  }
  if (task.type === 'precise') {
    if (task.noTime) return isCompact ? '' : '不限時間';
    const startFull = task.startDateTime?.replace('T', ' ').slice(0, 16);
    const endFull = task.endDateTime?.replace('T', ' ').slice(0, 16);
    if (isCompact) return endFull ? `${startFull} ~ ${endFull}` : startFull;
    return endFull ? `${startFull} ~ ${endFull}` : startFull;
  }
  if (task.type === 'infinite') {
    return isCompact ? '' : '隨時挑戰';
  }
  return '今日行動';
};

export const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const formatFlowTime = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const calculatePomodoroStats = (timeline) => {
  let focusDuration = 0;
  let flowDuration = 0;
  let breakDuration = 0;
  const segments = [];

  if (!timeline || timeline.length < 2) {
    return { focusDuration, flowDuration, breakDuration, segments };
  }

  let currentMode = 'focus'; // 預設模式
  let isPaused = false;

  for (let i = 0; i < timeline.length - 1; i++) {
    const startEvent = timeline[i];
    const endEvent = timeline[i + 1];
    const startTime = new Date(startEvent.time);
    const endTime = new Date(endEvent.time);
    const duration = Math.max(0, (endTime - startTime) / 1000);

    // 根據段落起始事件更新狀態
    // 進入新階段一定代表已解除暫停（舊紀錄在暫停中切換階段時沒有寫 pause_end）
    if (startEvent.type === 'focus_start') {
      currentMode = 'focus';
      isPaused = false;
    } else if (startEvent.type === 'flow_start') {
      currentMode = 'flow';
      isPaused = false;
    } else if (startEvent.type === 'break_start') {
      currentMode = 'break';
      isPaused = false;
    } else if (startEvent.type === 'await_start') {
      // 時間到、等使用者按「開始休息／開始專注」：等待的時間不算專注也不算休息（2026-11-20 起）
      currentMode = 'await';
      isPaused = false;
    } else if (startEvent.type === 'pause_start') {
      isPaused = true;
    } else if (startEvent.type === 'pause_end') {
      isPaused = false;
    }
    // task_complete 或其他事件不改變模式與暫停狀態

    if (duration > 0) {
      if (!isPaused) {
        if (currentMode === 'focus') focusDuration += duration;
        else if (currentMode === 'flow') flowDuration += duration;
        else if (currentMode === 'break') breakDuration += duration;
      }

      segments.push({
        duration,
        mode: currentMode,
        isPaused,
        type: startEvent.type,
        startTime: startEvent.time,
        endTime: endEvent.time
      });
    }
  }

  return { focusDuration, flowDuration, breakDuration, segments };
};

/**
 * 一輪番茄鐘的「純專注」秒數（專注 + 心流，四捨五入到整秒）。
 * 總結畫面、專注歷史、結算畫面的專注時長和時間給的抽卡券，都用這一個數字，才不會互相對不上。
 */
export const pomodoroWorkSeconds = (timeline) => {
  const { focusDuration, flowDuration } = calculatePomodoroStats(timeline);
  return Math.round((focusDuration || 0) + (flowDuration || 0));
};