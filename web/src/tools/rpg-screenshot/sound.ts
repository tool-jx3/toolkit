/**
 * 打字音效（F46、F47）：每打出一個字發出一聲短促的方波（約 0.05 秒、音量很小、音高在設定值的 ±6% 內隨機），同原作。
 * 第一次播放時才建立 AudioContext（瀏覽器要求在使用者的操作之後）。
 */
let actx: AudioContext | null = null;

/** 測試用：記下每一聲的音高（window.__rpgBlips 是陣列時） */
declare global {
  interface Window {
    __rpgBlips?: number[];
  }
}

export function blip(pitch: number): void {
  const hz = pitch * (0.94 + Math.random() * 0.12);
  if (typeof window !== 'undefined' && Array.isArray(window.__rpgBlips)) window.__rpgBlips.push(hz);
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    actx = actx || new Ctor();
    const t = actx.currentTime;
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = 'square';
    o.frequency.value = hz;
    g.gain.setValueAtTime(0.035, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + 0.06);
  } catch {
    /* 沒有聲音也照常播放 */
  }
}
