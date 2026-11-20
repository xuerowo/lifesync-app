// 整個程式共用同一個 AudioContext（瀏覽器的音效播放器）。
// 每次播放都 new 一個而且不關閉，會一直累積；瀏覽器對同時存在的數量也有上限。
let sharedAudioContext = null;

/** 取得共用的 AudioContext：第一次需要時才建立；被瀏覽器暫停（suspended）時恢復。不支援時回傳 null */
const getAudioContext = () => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new AudioContextClass();
  }
  if (sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume().catch((e) => console.error('Audio resume failed', e));
  }
  return sharedAudioContext;
};

export const useAudio = () => {
  const playNotificationSound = () => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.type = 'sine';
      // 琶音旋律：A5 -> C#5 -> E5 -> A6 -> E5 -> C#5
      oscillator.frequency.setValueAtTime(880, ctx.currentTime); // A5
      oscillator.frequency.setValueAtTime(554.37, ctx.currentTime + 0.4); // C#5
      oscillator.frequency.setValueAtTime(659.25, ctx.currentTime + 0.8); // E5
      oscillator.frequency.setValueAtTime(1760, ctx.currentTime + 1.2); // A6
      oscillator.frequency.setValueAtTime(659.25, ctx.currentTime + 1.6); // E5
      oscillator.frequency.setValueAtTime(554.37, ctx.currentTime + 2.0); // C#5

      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 3.0);

      oscillator.start();
      oscillator.stop(ctx.currentTime + 3.0);
      // 播完後斷開連線，讓這次用的節點可以被回收（AudioContext 本身留著重複使用）
      oscillator.onended = () => {
        oscillator.disconnect();
        gainNode.disconnect();
      };
    } catch (e) {
      console.error("Audio play failed", e);
    }
  };

  return { playNotificationSound };
};
