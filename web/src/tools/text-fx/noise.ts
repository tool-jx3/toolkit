/**
 * 雜訊外觀（雜訊干擾、偶爾雜訊、雜訊斷訊共用的畫法；F082、F137、F157）：
 * 洋紅往左、青色往右的兩份單色複本墊在後面，再加 2～6 條水平錯位切片。亂數每 1/20 秒換一次，不隨輸出 fps 變。
 *
 * 從 Scene 抽出來，讓 SF 標題（2026-10-26）也用同一套雜訊；標語、長文、字幕的畫面不變。
 */
import { clamp, clamp01, hashSigned, timeSlot } from '@/core/timeline';
import type { SpriteCanvas } from '@/core/typeset';

type Ctx = CanvasRenderingContext2D;

export interface NoiseLayer {
  c: SpriteCanvas;
  x: Ctx;
}

/** 雜訊要用的暫存層（和畫面同尺寸）：text／mix 輪流當合成層，a、b 是兩份分色 */
export interface NoiseLayers {
  text: NoiseLayer;
  a: NoiseLayer;
  b: NoiseLayer;
  mix: NoiseLayer;
}

export interface NoiseOptions {
  W: number;
  H: number;
  /** 強度（0～2.5 以上都當 2.5） */
  amount: number;
  /** 絕對時間（秒） */
  t: number;
  /** 尺度：分色距離、切片高度與錯開量的基準（標語是實際字級） */
  unit: number;
  /** 切片落在這個範圍（上緣、高度；再往外擴 0.2 個尺度） */
  top: number;
  height: number;
  colorA: string;
  colorB: string;
}

/** 把 src 加上雜訊外觀畫到 ctx（ctx 的變形不影響，一律以畫面座標畫） */
export function paintNoise(ctx: Ctx, src: SpriteCanvas, L: NoiseLayers, o: NoiseOptions): void {
  const { W, H } = o;
  const g = o.amount;
  const S = o.unit;
  const slot = timeSlot(o.t, 20);
  const seed = 4242;
  const u01 = (n: number) => (hashSigned(slot, n, seed) + 1) / 2;
  const off = S * (0.03 + 0.03 * u01(1)) * Math.min(g, 2.5);
  const tint = (layer: NoiseLayer, color: string) => {
    const x = layer.x;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-over';
    x.globalAlpha = 1;
    x.clearRect(0, 0, W, H);
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'source-over';
  };
  tint(L.a, o.colorA);
  tint(L.b, o.colorB);
  /* 合成層：src 是 text 層時用 mix，src 已經是 mix（裂開效果）時改用 text 層 */
  const comp = src === L.mix.c ? L.text : L.mix;
  const m = comp.x;
  m.setTransform(1, 0, 0, 1, 0, 0);
  m.globalCompositeOperation = 'source-over';
  m.globalAlpha = 1;
  m.clearRect(0, 0, W, H);
  m.globalAlpha = 0.8 * clamp01(g * 2.5);
  m.drawImage(L.a.c, -off, 0);
  m.drawImage(L.b.c, off, 0);
  m.globalAlpha = 1;
  m.drawImage(src, 0, 0);
  /* 水平切片錯位：在另一層（L.a，已用完）組好，再整張畫到畫面上，不動到底下的背景與裝飾 */
  const out = L.a.x;
  out.setTransform(1, 0, 0, 1, 0, 0);
  out.globalAlpha = 1;
  out.clearRect(0, 0, W, H);
  out.drawImage(comp.c, 0, 0);
  const n = 2 + Math.floor(u01(2) * 5);
  for (let i = 0; i < n; i++) {
    const hgt = S * (0.03 + 0.14 * u01(20 + i));
    const y = Math.round(o.top - S * 0.2 + u01(10 + i) * (o.height + S * 0.4) - hgt / 2);
    const shift = Math.round(hashSigned(slot, 30 + i, seed) * 0.25 * S * Math.min(g, 2.5));
    const y0 = clamp(y, 0, H - 1);
    const y1 = clamp(y + Math.max(1, Math.round(hgt)), 0, H);
    if (y1 <= y0) continue;
    out.clearRect(0, y0, W, y1 - y0);
    out.drawImage(comp.c, 0, y0, W, y1 - y0, shift, y0, W, y1 - y0);
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(L.a.c, 0, 0);
  ctx.restore();
}
