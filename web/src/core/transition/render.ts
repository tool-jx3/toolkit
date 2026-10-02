/**
 * 轉場畫面：到達先後圖＋查表（256 項）→ 單色（可加邊緣發光、邊緣實心）的半透明圖層。
 *
 * 進度是「速度曲線換算後、再乘上推進比例」的畫面進度（0～1）。規則（scene-transition 3.3、3.5）：
 * - 蓋上：一條過渡帶（寬＝柔和度 ÷ 255 的全範圍）沿到達先後推進；進度 0 時全透明、1 時全不透明，帶內透明度與到達先後呈直線。
 * - 揭開：每一點＝255 −「蓋上」；掃過：一條帶（中心最濃、往兩側直線遞減，半寬＝帶寬 ÷ 255）從 0 之前走到 1 之後。
 * - 整片：透明度＝進度 × 255（掃過＝0 → 255 → 0，頂點在一半）。
 * - 反向順序：到達先後顛倒。
 * - 邊緣發光：蓋上的程度 c（0～255）→ 強度 g＝255·sin(π·c ÷ 255)；顏色依 g 混向發光色，透明度＝max(原本, g)。
 * - 邊緣實心（只在有邊緣發光時作用，揭開時不作用）：蓋上一半以上的地方不透明；其他地方＝max(原本, min(255, 2g))。
 *   沒有發光時不作用，合攏處是半透明的縫（同原作）。
 */
import { parseColor } from '../color';
import type { ArrivalMap } from './arrival';

export type TransitionMode = 'cover' | 'reveal' | 'sweep';

export type RgbInput = string | readonly [number, number, number];

export interface TransitionLook {
  /** 畫面進度（已套速度曲線與推進比例），0～1 */
  progress: number;
  mode?: TransitionMode;
  /** 邊緣柔和度 1～255（預設 40） */
  softness?: number;
  /** 掃過的帶寬 10～255（預設 80） */
  bandWidth?: number;
  /** 反向順序 */
  reverse?: boolean;
  /** 顏色（#rrggbb 或 [r, g, b]） */
  color: RgbInput;
  /** 邊緣發光的顏色；不給＝不發光 */
  glow?: RgbInput | null;
  /** 邊緣實心（合攏成發亮的線）；只在有 glow 時作用 */
  solidEdge?: boolean;
}

export interface TransitionLut {
  /** 每一階的透明度 */
  alpha: Uint8Array;
  r: Uint8Array;
  g: Uint8Array;
  b: Uint8Array;
  /** 每一階「蓋上的程度」0～255（揭開時仍以蓋上計；給發光、字幕等其他效果參考） */
  cover: Uint8Array;
}

const toRgb = (c: RgbInput): [number, number, number] => {
  if (typeof c !== 'string') return [c[0], c[1], c[2]];
  const p = parseColor(c);
  return p ? [p.r, p.g, p.b] : [0, 0, 0];
};

/** 邊緣發光的強度（蓋上的程度 0～255 → 0～255） */
export const glowStrength = (cover255: number): number =>
  Math.round(255 * Math.sin((Math.PI * Math.max(0, Math.min(255, cover255))) / 255));

/**
 * 每一階（到達先後 0～255）的蓋上程度 0～1。
 * range：到達先後圖實際用到的範圍（ArrivalMap.range；不給＝[0, 255]），過渡帶從最小值之前走到最大值之後，
 * 帶寬仍是「柔和度」階（同原作：柔和度 ÷ 255 約是全範圍的比例）。範圍只有一階時同整片。
 */
export function coverAmount(
  level: number,
  { progress, mode = 'cover', softness = 40, bandWidth = 80, reverse = false }: TransitionLook,
  flat = false,
  range?: readonly [number, number],
): number {
  const p = progress;
  const lo = range ? range[0] : 0;
  const hi = range ? range[1] : 255;
  const span = hi - lo;
  if (flat || !(span > 0)) {
    if (mode === 'sweep') return Math.max(0, 1 - Math.abs(2 * p - 1));
    return Math.max(0, Math.min(1, p));
  }
  /* 反向順序：每一階換成 255 − 階（範圍跟著換） */
  const v = reverse ? 255 - level : level;
  const start = reverse ? 255 - hi : lo;
  if (mode === 'sweep') {
    const b = Math.max(1, bandWidth);
    const pos = start - b + p * (span + 2 * b);
    return Math.max(0, 1 - Math.abs(v - pos) / b);
  }
  const f = Math.max(1, softness);
  const edge = start + p * (span + f);
  return Math.max(0, Math.min(1, (edge - v) / f));
}

/**
 * 建立查表（每一格算一次，再用 renderTransition 套到整張圖）。
 * range：到達先後圖的 ArrivalMap.range（不給＝[0, 255]）；renderTransition／drawTransition 會自動帶入。
 */
export function transitionLut(
  look: TransitionLook,
  flat = false,
  range?: readonly [number, number],
): TransitionLut {
  const mode = look.mode ?? 'cover';
  const [r0, g0, b0] = toRgb(look.color);
  const glow = look.glow ? toRgb(look.glow) : null;
  /* 邊緣實心疊在邊緣發光之上：沒有發光時不作用（同原作） */
  const solid = !!glow && !!look.solidEdge && mode !== 'reveal';
  const out: TransitionLut = {
    alpha: new Uint8Array(256),
    r: new Uint8Array(256),
    g: new Uint8Array(256),
    b: new Uint8Array(256),
    cover: new Uint8Array(256),
  };
  for (let L = 0; L < 256; L++) {
    const cov = coverAmount(L, look, flat, range);
    const c = Math.round(cov * 255);
    let alpha = mode === 'reveal' ? 255 - c : c;
    let r = r0;
    let g = g0;
    let b = b0;
    if (glow) {
      const s = glowStrength(c);
      const k = s / 255;
      r = Math.round(r0 + (glow[0] - r0) * k);
      g = Math.round(g0 + (glow[1] - g0) * k);
      b = Math.round(b0 + (glow[2] - b0) * k);
      alpha = Math.max(alpha, s);
      if (solid) alpha = c >= 128 ? 255 : Math.max(alpha, Math.min(255, s * 2));
    }
    out.alpha[L] = alpha;
    out.r[L] = r;
    out.g[L] = g;
    out.b[L] = b;
    out.cover[L] = c;
  }
  return out;
}

/** 依到達先後圖與查表填入 RGBA（out 長度＝寬 × 高 × 4）；完全透明的像素也存成同一個顏色 */
export function applyTransitionLut(
  map: ArrivalMap,
  lut: TransitionLut,
  out: Uint8ClampedArray | Uint8Array,
): void {
  const { levels } = map;
  /* 預先組成 32 位元的像素（little-endian：ABGR） */
  const px = new Uint32Array(256);
  for (let L = 0; L < 256; L++)
    px[L] = ((lut.alpha[L] << 24) | (lut.b[L] << 16) | (lut.g[L] << 8) | lut.r[L]) >>> 0;
  if (out.byteOffset % 4 === 0) {
    const u32 = new Uint32Array(out.buffer, out.byteOffset, levels.length);
    for (let i = 0; i < levels.length; i++) u32[i] = px[levels[i]];
    return;
  }
  for (let i = 0, o = 0; i < levels.length; i++, o += 4) {
    const L = levels[i];
    out[o] = lut.r[L];
    out[o + 1] = lut.g[L];
    out[o + 2] = lut.b[L];
    out[o + 3] = lut.alpha[L];
  }
}

/** 算出整張圖層的 RGBA */
export function renderTransition(
  map: ArrivalMap,
  look: TransitionLook,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(map.width * map.height * 4);
  applyTransitionLut(map, transitionLut(look, map.flat, map.range), out);
  return out;
}

let scratch: OffscreenCanvas | null = null;

/**
 * 把轉場圖層疊到 canvas 的 (x, y)：經過一張暫存畫布再 drawImage，所以依 ctx 的變形（匯出縮放）與合成方式疊在現有內容上。
 * 沒有 OffscreenCanvas 的環境改用 putImageData（直接取代那一塊像素、不受變形影響）。
 */
export function drawTransition(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  map: ArrivalMap,
  look: TransitionLook,
  x = 0,
  y = 0,
): void {
  const img = new ImageData(renderTransition(map, look), map.width, map.height);
  if (typeof OffscreenCanvas === 'undefined') {
    ctx.putImageData(img, x, y);
    return;
  }
  if (!scratch || scratch.width !== map.width || scratch.height !== map.height)
    scratch = new OffscreenCanvas(map.width, map.height);
  const sctx = scratch.getContext('2d');
  if (!sctx) {
    ctx.putImageData(img, x, y);
    return;
  }
  sctx.putImageData(img, 0, 0);
  ctx.drawImage(scratch, x, y);
}

/**
 * 雙色閃換：時間進度（不受速度曲線影響）的前 75% 等分成 count 段，輪流用第一色（0）、第二色（1）；
 * 之後維持最後一段（count 奇數＝第一色、偶數＝第二色）。count ≤ 1 時一律第一色。
 */
export function alternatingColorIndex(timeProgress: number, count: number): 0 | 1 {
  const n = Math.max(0, Math.round(count));
  if (n <= 1) return 0;
  const seg = Math.min(n - 1, Math.floor(Math.max(0, timeProgress) / (0.75 / n) + 1e-9));
  return (seg % 2) as 0 | 1;
}
