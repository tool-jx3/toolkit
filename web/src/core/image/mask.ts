/**
 * 遮罩（每個像素一個 0～255 的不透明度）的處理：收縮／擴張、羽化、筆刷、套到圖片上、鋪底色。
 * 全部是像素陣列上的純函式（主執行緒、Worker、Node 都能跑），同樣的輸入結果逐位元組相同。
 *
 * ```ts
 * let m = growMask(base, w, h, -2);       // 往內收 2 px
 * m = featherMask(m, w, h, 3);            // 羽化 3 px（σ ＝ 1.5）
 * for (const s of strokes) applyStroke(m, w, h, s);   // 筆刷（擦掉／補回）
 * const out = applyMask(rgba, m, { clearTransparent: true });
 * ```
 *
 * - 遮罩：Uint8Array（寬 × 高），255＝留下、0＝去掉。
 * - 收縮／擴張：灰階形態學（圓形結構元素，半徑＝整數 px）：擴張取圓內最大值、收縮取最小值；圖外當成「和最近的邊相同」。
 * - 羽化：高斯模糊，σ ＝ 羽化 px ÷ 2（同 canvas shadowBlur 的換算，`gaussianBlurMask`）。
 * - 筆刷：一筆的覆蓋率＝這一筆所有線段的「到線段的距離 → 覆蓋率」取最大（同一筆重疊的地方不會越塗越濃）；
 *   擦掉 m ←（1 − c）× m，補回 m ← m ＋（255 − m）× c，四捨五入。
 */
import { gaussianBlurMask } from './effects';

export type Mask = Uint8Array<ArrayBuffer>;

/* ---------- 收縮／擴張 ---------- */

/** 一維最大（或最小）值濾波，半寬 k（van Herk／Gil-Werman，O(n)），邊界外取最近的值 */
function minMax1d(
  src: Uint8Array,
  dst: Uint8Array,
  n: number,
  k: number,
  isMax: boolean,
  g: Uint8Array,
  h: Uint8Array,
) {
  if (k <= 0) {
    dst.set(src.subarray(0, n));
    return;
  }
  const size = 2 * k + 1;
  /* 補過邊的來源 P[i] ＝ src[i − k]（夾在 0～n − 1）；切成 size 一段，算段內的前綴（g）與後綴（h）極值 */
  const last = n - 1;
  const at = (i: number) => src[i <= k ? 0 : i - k >= last ? last : i - k];
  const padded = Math.ceil((n + 2 * k) / size) * size;
  for (let s = 0; s < padded; s += size) {
    let acc = at(s);
    for (let i = s; i < s + size; i++) {
      const v = at(i);
      if (isMax ? v > acc : v < acc) acc = v;
      g[i] = acc;
    }
    acc = at(s + size - 1);
    for (let i = s + size - 1; i >= s; i--) {
      const v = at(i);
      if (isMax ? v > acc : v < acc) acc = v;
      h[i] = acc;
    }
  }
  /* 位置 x 的視窗是 P[x .. x + 2k]：取 h[x] 與 g[x + 2k] 的極值 */
  for (let x = 0; x < n; x++) {
    const a = h[x];
    const b = g[x + 2 * k];
    dst[x] = isMax ? (a > b ? a : b) : a < b ? a : b;
  }
}

/**
 * 收縮（radius < 0）或擴張（radius > 0）遮罩。radius 四捨五入成整數 px；0 時回傳複本。
 * 圓形結構元素：與中心距離 ≤ |radius| 的像素（每一列的半寬 floor(√(r² − dy²))）。
 */
export function growMask(mask: Uint8Array, width: number, height: number, radius: number): Mask {
  const r = Math.round(Math.abs(radius));
  if (!r || !width || !height) return new Uint8Array(mask) as Mask;
  const isMax = radius > 0;
  const out = new Uint8Array(width * height) as Mask;
  const halfWidths: number[] = [];
  for (let dy = -r; dy <= r; dy++) halfWidths.push(Math.floor(Math.sqrt(r * r - dy * dy)));
  const g = new Uint8Array(width + 4 * r + 2);
  const h = new Uint8Array(width + 4 * r + 2);
  const row = new Uint8Array(width);
  const acc = new Uint8Array(width);
  /* 同一個來源列、同一個半寬的濾波結果會被相鄰的 2r＋1 個輸出列用到：以（列, 半寬）快取最近用過的 */
  const cache = new Map<number, Uint8Array>();
  const keyOf = (y: number, k: number) => y * (r + 1) + k;
  const filtered = (y: number, k: number): Uint8Array => {
    const key = keyOf(y, k);
    const hit = cache.get(key);
    if (hit) return hit;
    const res = new Uint8Array(width);
    row.set(mask.subarray(y * width, (y + 1) * width));
    minMax1d(row, res, width, k, isMax, g, h);
    cache.set(key, res);
    return res;
  };
  for (let y = 0; y < height; y++) {
    acc.fill(isMax ? 0 : 255);
    for (let i = 0; i < halfWidths.length; i++) {
      const sy = Math.min(height - 1, Math.max(0, y + i - r));
      const f = filtered(sy, halfWidths[i]);
      if (isMax) {
        for (let x = 0; x < width; x++) if (f[x] > acc[x]) acc[x] = f[x];
      } else {
        for (let x = 0; x < width; x++) if (f[x] < acc[x]) acc[x] = f[x];
      }
    }
    out.set(acc, y * width);
    /* 之後的輸出列不會再用到 y − r 以前的來源列 */
    const drop = y - r;
    if (drop >= 0) for (let k = 0; k <= r; k++) cache.delete(keyOf(drop, k));
  }
  return out;
}

/* ---------- 羽化 ---------- */

/** 羽化（高斯模糊，σ ＝ amount ÷ 2 px）。amount ≤ 0 時回傳複本。圖外當成和邊緣相同（不會讓圖邊變透明） */
export function featherMask(mask: Uint8Array, width: number, height: number, amount: number): Mask {
  if (!(amount > 0) || !width || !height) return new Uint8Array(mask) as Mask;
  const sigma = amount / 2;
  /* 先往外補邊（重複邊緣），模糊後再裁回，圖邊才不會被當成透明拉低 */
  const pad = Math.ceil(sigma * 3) + 1;
  const pw = width + 2 * pad;
  const ph = height + 2 * pad;
  const f = new Float32Array(pw * ph);
  for (let y = 0; y < ph; y++) {
    const sy = Math.min(height - 1, Math.max(0, y - pad));
    for (let x = 0; x < pw; x++) {
      const sx = Math.min(width - 1, Math.max(0, x - pad));
      f[y * pw + x] = mask[sy * width + sx] / 255;
    }
  }
  const b = gaussianBlurMask(f, pw, ph, sigma);
  const out = new Uint8Array(width * height) as Mask;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = Math.round(b[(y + pad) * pw + x + pad] * 255);
      out[y * width + x] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  return out;
}

/* ---------- 筆刷 ---------- */

export type BrushMode = 'erase' | 'restore';

export interface BrushStroke {
  mode: BrushMode;
  /** 筆刷直徑（px，圖片座標） */
  size: number;
  /** 硬度 0～100：100＝邊緣只有 1 px 的反鋸齒；越小邊緣越柔（從半徑 × 硬度 ÷ 100 處開始變淡） */
  hardness: number;
  /** 經過的點 [x0, y0, x1, y1, …]（圖片座標，可以是小數）；只有一個點時是一個圓點 */
  points: readonly number[];
}

export interface BrushRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 到中心距離 d 時的覆蓋率（0～1） */
export function brushCoverage(d: number, size: number, hardness: number): number {
  const r = Math.max(0.5, size / 2);
  const hard = Math.min(100, Math.max(0, hardness)) / 100;
  if (hard >= 1) {
    const c = r + 0.5 - d;
    return c <= 0 ? 0 : c >= 1 ? 1 : c;
  }
  const inner = r * hard;
  if (d <= inner) return 1;
  if (d >= r) return 0;
  const t = (r - d) / (r - inner);
  /* smoothstep：中心到邊緣平滑變淡 */
  return t * t * (3 - 2 * t);
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = px - (ax + t * dx);
  const ey = py - (ay + t * dy);
  return Math.sqrt(ex * ex + ey * ey);
}

/** 一筆會影響到的範圍（夾在圖內；完全在圖外時 null） */
export function strokeBounds(stroke: BrushStroke, width: number, height: number): BrushRect | null {
  const p = stroke.points;
  if (p.length < 2) return null;
  const pad = Math.max(0.5, stroke.size / 2) + 1;
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (let i = 0; i + 1 < p.length; i += 2) {
    x0 = Math.min(x0, p[i]);
    x1 = Math.max(x1, p[i]);
    y0 = Math.min(y0, p[i + 1]);
    y1 = Math.max(y1, p[i + 1]);
  }
  const left = Math.max(0, Math.floor(x0 - pad));
  const top = Math.max(0, Math.floor(y0 - pad));
  const right = Math.min(width, Math.ceil(x1 + pad) + 1);
  const bottom = Math.min(height, Math.ceil(y1 + pad) + 1);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * 一筆畫到一半時的狀態：記住這一筆開始前的遮罩與目前的覆蓋率，新的線段只更新它影響到的像素。
 * 畫完（或重播）的結果與 `applyStroke` 完全相同。
 */
export class StrokePainter {
  readonly coverage: Float32Array;
  private readonly before: Uint8Array;
  private last: [number, number] | null = null;

  constructor(
    private readonly mask: Uint8Array,
    private readonly width: number,
    private readonly height: number,
    private readonly mode: BrushMode,
    private readonly size: number,
    private readonly hardness: number,
  ) {
    this.before = new Uint8Array(mask);
    this.coverage = new Float32Array(width * height);
  }

  /** 加一個點（第一個點畫圓點，之後畫上一點到這一點的線段）；回傳改到的範圍 */
  add(x: number, y: number): BrushRect | null {
    const a = this.last ?? [x, y];
    this.last = [x, y];
    return this.segment(a[0], a[1], x, y);
  }

  private segment(ax: number, ay: number, bx: number, by: number): BrushRect | null {
    const rect = strokeBounds(
      { mode: this.mode, size: this.size, hardness: this.hardness, points: [ax, ay, bx, by] },
      this.width,
      this.height,
    );
    if (!rect) return null;
    const { mask, before, coverage, width, size, hardness } = this;
    const erase = this.mode === 'erase';
    for (let y = rect.y; y < rect.y + rect.height; y++) {
      for (let x = rect.x; x < rect.x + rect.width; x++) {
        /* 以像素中心量距離 */
        const c = brushCoverage(distToSegment(x + 0.5, y + 0.5, ax, ay, bx, by), size, hardness);
        const i = y * width + x;
        if (c <= coverage[i]) continue;
        coverage[i] = c;
        const m = before[i];
        mask[i] = erase ? Math.round(m * (1 - c)) : Math.round(m + (255 - m) * c);
      }
    }
    return rect;
  }
}

/** 把一筆畫到遮罩上（直接改 mask）；回傳改到的範圍 */
export function applyStroke(
  mask: Uint8Array,
  width: number,
  height: number,
  stroke: BrushStroke,
): BrushRect | null {
  const p = stroke.points;
  if (p.length < 2) return null;
  const painter = new StrokePainter(mask, width, height, stroke.mode, stroke.size, stroke.hardness);
  for (let i = 0; i + 1 < p.length; i += 2) painter.add(p[i], p[i + 1]);
  return strokeBounds(stroke, width, height);
}

/* ---------- 套用與輸出 ---------- */

export interface ApplyMaskOptions {
  /** 完全透明的像素 RGB 改成 0（檔案比較小；預設 false） */
  clearTransparent?: boolean;
}

/**
 * 遮罩套到 RGBA：不透明度＝原圖不透明度 × 遮罩 ÷ 255（四捨五入），RGB 不變（直接存色，邊緣不會變暗）。
 */
export function applyMask(
  rgba: Uint8Array | Uint8ClampedArray,
  mask: Uint8Array,
  { clearTransparent = false }: ApplyMaskOptions = {},
): Uint8ClampedArray<ArrayBuffer> {
  const n = mask.length;
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const a = Math.round((rgba[p + 3] * mask[i]) / 255);
    out[p + 3] = a;
    if (clearTransparent && a === 0) continue;
    out[p] = rgba[p];
    out[p + 1] = rgba[p + 1];
    out[p + 2] = rgba[p + 2];
  }
  return out;
}

/** 合成到不透明的底色上（一般的 alpha 合成，四捨五入） */
export function flattenRgba(
  rgba: Uint8Array | Uint8ClampedArray,
  color: readonly [number, number, number],
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(rgba.length);
  const [r, g, b] = color;
  for (let p = 0; p < rgba.length; p += 4) {
    const a = rgba[p + 3];
    const k = 255 - a;
    out[p] = Math.round((rgba[p] * a + r * k) / 255);
    out[p + 1] = Math.round((rgba[p + 1] * a + g * k) / 255);
    out[p + 2] = Math.round((rgba[p + 2] * a + b * k) / 255);
    out[p + 3] = 255;
  }
  return out;
}

/** 遮罩畫成灰階不透明的 RGBA（白＝留下、黑＝去掉） */
export function maskToRgba(mask: Uint8Array): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(mask.length * 4);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    out[p] = out[p + 1] = out[p + 2] = mask[i];
    out[p + 3] = 255;
  }
  return out;
}

/** 從灰階（或 RGBA 的 R 通道）讀回遮罩 */
export function maskFromRgba(rgba: Uint8Array | Uint8ClampedArray): Mask {
  const n = rgba.length >> 2;
  const out = new Uint8Array(n) as Mask;
  for (let i = 0; i < n; i++) out[i] = rgba[i * 4];
  return out;
}

/**
 * 色階：值 ≤ lo 變 0、≥ hi 變 255，中間線性拉開（四捨五入）。回傳新的遮罩。
 * 用途：AI 的遮罩把看不到的淡霧清成 0、把模型「幾乎確定」的地方變成完全不透明，邊緣的半透明照樣保留。
 */
export function levelsMask(mask: Uint8Array, lo: number, hi: number): Mask {
  const out = new Uint8Array(mask.length) as Mask;
  const span = hi - lo;
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i];
    out[i] = v <= lo ? 0 : v >= hi ? 255 : Math.round(((v - lo) * 255) / span);
  }
  return out;
}

/** 0～1 的浮點數遮罩 → 0～255：floor(float32(m × 255))，與 numpy 的 `(mask * 255).astype(np.uint8)` 相同（先夾在 0～1） */
export function quantizeMask(mask: Float32Array): Mask {
  const out = new Uint8Array(mask.length) as Mask;
  for (let i = 0; i < mask.length; i++) {
    const m = mask[i];
    out[i] = m <= 0 ? 0 : m >= 1 ? 255 : Math.floor(Math.fround(m * 255));
  }
  return out;
}
