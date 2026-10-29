/**
 * 色彩調整與效果（eidolon-ui 的做法，MIT），像素上的純計算（Safari、Node 沒有 ctx.filter，所以自己算）：
 * - 色彩調整：亮度、對比、飽和度、色相，照 CSS filter 的公式一步一步套用（每一步之後夾在 0～255）；
 * - 效果：色調（單色、霓虹＝暗 → 外框色 → 第二色、全像＝外框色＋條紋）、故障（水平切片錯開）、RGB 分離、顆粒；
 *   暗角與掃描線畫在開口與出框上（source-atop）。
 * 故障與顆粒用決定性的亂數（棋子 id＋種子），重畫時不會閃。
 */
import type { Ctx2D } from './frames';
import type { Adjust, Fx } from './model';

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/* ---------- 色彩調整 ---------- */

type Mat = number[]; // 3 × 4（列：r、g、b；最後一欄是位移，0～255）

const mul = (a: Mat, b: Mat): Mat => {
  const out: number[] = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 4; c++) {
      let v = 0;
      for (let k = 0; k < 3; k++) v += a[r * 4 + k] * b[k * 4 + c];
      if (c === 3) v += a[r * 4 + 3];
      out.push(v);
    }
  return out;
};

/** brightness → contrast → saturate → hue-rotate（CSS filter）各自的矩陣；預設值（沒有作用）的那一步略過 */
export function adjustSteps(a: Adjust): Mat[] {
  const steps: Mat[] = [];
  const b = a.bright / 100;
  const c = a.contrast / 100;
  const s = a.sat / 100;
  const h = (a.hue * Math.PI) / 180;
  if (b !== 1) steps.push([b, 0, 0, 0, 0, b, 0, 0, 0, 0, b, 0]);
  if (c !== 1) {
    const off = 255 * (0.5 - 0.5 * c);
    steps.push([c, 0, 0, off, 0, c, 0, off, 0, 0, c, off]);
  }
  if (s !== 1)
    steps.push([
      0.213 + 0.787 * s,
      0.715 - 0.715 * s,
      0.072 - 0.072 * s,
      0,
      0.213 - 0.213 * s,
      0.715 + 0.285 * s,
      0.072 - 0.072 * s,
      0,
      0.213 - 0.213 * s,
      0.715 - 0.715 * s,
      0.072 + 0.928 * s,
      0,
    ]);
  if (h) {
    const co = Math.cos(h);
    const si = Math.sin(h);
    steps.push([
      0.213 + co * 0.787 - si * 0.213,
      0.715 - co * 0.715 - si * 0.715,
      0.072 - co * 0.072 + si * 0.928,
      0,
      0.213 - co * 0.213 + si * 0.143,
      0.715 + co * 0.285 + si * 0.14,
      0.072 - co * 0.072 - si * 0.283,
      0,
      0.213 - co * 0.213 - si * 0.787,
      0.715 - co * 0.715 + si * 0.715,
      0.072 + co * 0.928 + si * 0.072,
      0,
    ]);
  }
  return steps;
}

/** 四步合成一個矩陣（不夾值；只在每一步都不會超出 0～255 時等於逐步套用） */
export function adjustMatrix(a: Adjust): Mat {
  return adjustSteps(a).reduce((acc, m) => mul(m, acc), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * 色彩調整（就地；透明度不變）：照 CSS filter 一步一步套用，**每一步之後都夾在 0～255**
 * （合成一個矩陣的話，亮度、對比拉高時超出範圍的值會在下一步被拉回來，和瀏覽器的 filter 不同）。
 */
export function applyAdjust(px: Pixels, a: Adjust): void {
  const steps = adjustSteps(a);
  if (!steps.length) return;
  const d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];
    for (const m of steps) {
      const nr = clamp255(m[0] * r + m[1] * g + m[2] * b + m[3]);
      const ng = clamp255(m[4] * r + m[5] * g + m[6] * b + m[7]);
      const nb = clamp255(m[8] * r + m[9] * g + m[10] * b + m[11]);
      r = nr;
      g = ng;
      b = nb;
    }
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
}

/* ---------- 效果 ---------- */

function rgbOf(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace('#', '').slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 決定性的亂數（字串當種子） */
export function seededRandom(seed: string): () => number {
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = Math.imul(s ^ seed.charCodeAt(i), 2654435761) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const fxActive = (fx: Fx): boolean =>
  fx.on &&
  ((fx.tone !== 'none' && fx.toneMix > 0) ||
    (fx.glitch && fx.glitchAmt > 0) ||
    (fx.rgb && fx.rgbAmt > 0) ||
    (fx.grain && fx.grainAmt > 0) ||
    (fx.vig && fx.vigAmt > 0) ||
    (fx.scan && fx.scanAmt > 0));

/** 圖片層要不要做像素的效果（色調、故障、RGB、顆粒） */
export const portraitFxActive = (fx: Fx): boolean =>
  fx.on &&
  ((fx.tone !== 'none' && fx.toneMix > 0) ||
    (fx.glitch && fx.glitchAmt > 0) ||
    (fx.rgb && fx.rgbAmt > 0) ||
    (fx.grain && fx.grainAmt > 0));

/** 色調：單色、霓虹（暗 → 外框色 → 第二色）、全像（外框色＋條紋）；依混合 % 疊回 */
function toneMap(px: Pixels, fx: Fx, main: string, accent: string): void {
  const m = fx.toneMix / 100;
  const dark = [5, 5, 7];
  const a = rgbOf(main);
  const b = rgbOf(accent);
  const N = px.width;
  const period = Math.max(2, Math.round(N / 150));
  const d = px.data;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const r = d[i];
    const g = d[i + 1];
    const bl = d[i + 2];
    const al = d[i + 3];
    const l = (0.299 * r + 0.587 * g + 0.114 * bl) / 255;
    let tr: number;
    let tg: number;
    let tb: number;
    let ta = al;
    if (fx.tone === 'mono') {
      tr = tg = tb = l * 255;
    } else if (fx.tone === 'neon') {
      const k0 = Math.min(1, Math.max(0, (l - 0.5) * 1.25 + 0.5));
      const [p0, q0, k] = k0 < 0.5 ? [dark, a, k0 * 2] : [a, b, (k0 - 0.5) * 2];
      tr = p0[0] + (q0[0] - p0[0]) * k;
      tg = p0[1] + (q0[1] - p0[1]) * k;
      tb = p0[2] + (q0[2] - p0[2]) * k;
    } else {
      const band = Math.floor(p / N) % period < period / 2 ? 1 : 0.55;
      const ll = 0.25 + l * 1.05;
      tr = a[0] * ll + 40 * ll;
      tg = a[1] * ll + 40 * ll;
      tb = a[2] * ll + 40 * ll;
      ta = al * 0.9 * band;
    }
    d[i] = r + (tr - r) * m;
    d[i + 1] = g + (tg - g) * m;
    d[i + 2] = bl + (tb - bl) * m;
    d[i + 3] = al + (ta - al) * m;
  }
}

/** 故障（水平切片左右錯開）與 RGB 分離（紅、藍各往一邊取樣） */
function resample(px: Pixels, fx: Fx, seed: string, glitch: boolean, split: boolean): void {
  const N = px.width;
  const H = px.height;
  const d = px.data;
  const src = new Uint8ClampedArray(d);
  const shift = new Int32Array(H);
  if (glitch) {
    const amt = fx.glitchAmt / 100;
    const rand = seededRandom(`${seed}:${fx.glitchSeed}`);
    const count = 3 + Math.round(amt * 9);
    for (let k = 0; k < count; k++) {
      const y0 = Math.floor(rand() * H);
      const h = Math.max(1, Math.floor((0.008 + rand() * 0.05) * H));
      const dx = Math.round((rand() - 0.5) * 2 * amt * 0.1 * N);
      for (let y = y0; y < Math.min(H, y0 + h); y++) shift[y] = dx;
    }
  }
  const sh = split ? Math.max(1, Math.round((fx.rgbAmt * N) / 512)) : 0;
  const at = (y: number, x: number) => (y * N + Math.min(N - 1, Math.max(0, x))) * 4;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      const xs = x - shift[y];
      const ir = at(y, xs - sh);
      const ig = at(y, xs);
      const ib = at(y, xs + sh);
      d[i] = src[ir];
      d[i + 1] = src[ig + 1];
      d[i + 2] = src[ib + 2];
      d[i + 3] = Math.max(src[ir + 3], src[ig + 3], src[ib + 3]);
    }
}

function grain(px: Pixels, fx: Fx): void {
  const rand = seededRandom(`grain:${px.width}`);
  const a = fx.grainAmt * 1.1;
  const d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const n = (rand() - 0.5) * a;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
}

/** 圖片層的效果（就地）：色調 → 故障／RGB → 顆粒 */
export function portraitFx(px: Pixels, fx: Fx, main: string, accent: string, seed: string): void {
  if (!fx.on) return;
  if (fx.tone !== 'none' && fx.toneMix > 0) toneMap(px, fx, main, accent);
  const glitch = fx.glitch && fx.glitchAmt > 0;
  const split = fx.rgb && fx.rgbAmt > 0;
  if (glitch || split) resample(px, fx, seed, glitch, split);
  if (fx.grain && fx.grainAmt > 0) grain(px, fx);
}

/** 暗角與掃描線：畫在已經有東西的地方上面（source-atop） */
export function overlayFx(ctx: Ctx2D, fx: Fx, N: number, c: number, R: number): void {
  if (!fx.on) return;
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  if (fx.vig && fx.vigAmt > 0) {
    const [r, g, b] = rgbOf(fx.vigColor);
    const gr = ctx.createRadialGradient(c, c, R * 0.35, c, c, R);
    gr.addColorStop(0, `rgba(${r},${g},${b},0)`);
    gr.addColorStop(1, `rgba(${r},${g},${b},${fx.vigAmt / 100})`);
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, N, N);
  }
  if (fx.scan && fx.scanAmt > 0) {
    const p = Math.max(2, Math.round((fx.scanGap * N) / 512));
    const h = Math.max(1, Math.round(p / 2));
    ctx.fillStyle = `rgba(0,0,0,${fx.scanAmt / 100})`;
    for (let y = 0; y < N; y += p) ctx.fillRect(0, y, N, h);
  }
  ctx.restore();
}
