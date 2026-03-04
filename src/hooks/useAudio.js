export const useAudio = () => {
  const playNotificationSound = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      
      const ctx = new AudioContext();
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
    } catch (e) {
      console.error("Audio play failed", e);
    }
  };

  return { playNotificationSound };
};