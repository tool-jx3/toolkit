/**
 * 測試與對等驗證用的入口（window.__bgMotion 的圖片切換部分）：讀／改內容、時間軸與影格表、
 * 用目前的內容畫指定時間的一格（回傳 RGBA 的 base64）。
 */
import { loadAssetBitmaps } from '@/core/assets';
import { type DeckState, deckAssetIds } from './deck';
import { lastDeckExport } from './deckExport';
import { buildTimeline, type CapState, capStep, framePlan } from './deckPlan';
import { DeckPainter, type DeckScene } from './deckRender';
import { assets, deckNow, patchDeck, useDeck } from './deckStore';

const toBase64 = (data: Uint8ClampedArray): string => {
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < data.length; i += step) {
    bin += String.fromCharCode(...data.subarray(i, i + step));
  }
  return btoa(bin);
};

export const deckDebug = () => ({
  deck: () => deckNow(),
  /** 一次改好幾個欄位（一步復原） */
  deckSet: (patch: Partial<DeckState>) => patchDeck(patch),
  deckUndoDepth: () => useDeck.temporal.getState().pastStates.length,
  /** 最近一次匯出的每次嘗試（畫質、FPS、尺寸、大小、影格數） */
  deckLastExport: () => lastDeckExport.attempts,
  /** 容量調整的下一步（單元測試之外，對照參考來源的每次嘗試用） */
  deckCapStep: (st: CapState, ratio: number, format: DeckState['format'], fps0: number) =>
    capStep(st, ratio, format, fps0),
  /** 時間軸與影格表 */
  deckPlan: (fps: number) => {
    const tl = buildTimeline(deckNow());
    return { segs: tl.segs, total: tl.total, plan: framePlan(tl.segs, fps) };
  },
  /** 用目前的內容畫時間軸上 t 秒的一格（輸出尺寸，或指定的 w × h） */
  deckFrame: async (t: number, w?: number, h?: number) => {
    const d = deckNow();
    const bitmaps = await loadAssetBitmaps(assets, deckAssetIds(d));
    const tl = buildTimeline(d);
    const scene: DeckScene = {
      images: d.slides.map((s) => bitmaps.get(s.image.id) ?? null),
      segs: tl.segs,
      fit: d.fit,
      bg: d.bg,
      transparent: d.transparent,
      easing: d.easing,
    };
    const W = w ?? d.width;
    const H = h ?? d.height;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('canvas');
    new DeckPainter().paint(ctx, scene, W, H, t);
    return { w: W, h: H, b64: toBase64(ctx.getImageData(0, 0, W, H).data) };
  },
});
