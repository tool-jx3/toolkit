/**
 * 純色背景去除（色鍵）：依背景色與容許度算出遮罩，不需要 AI 模型。立繪委託常見的白底、單色底用。
 * 純函式（主執行緒、Worker、Node 都能跑）。
 *
 * ```ts
 * const bg = estimateBackground(rgba, w, h);              // 從四邊找最多的顏色
 * const mask = colorKeyMask(rgba, w, h, { color: bg.color, tolerance: 12, softness: 8, connected: true });
 * const clean = decontaminate(rgba, mask, bg.color, { width: w, height: h, edge: 2 });   // 去色邊（含邊緣一圈）
 * ```
 *
 * - 顏色差：RGB 歐氏距離換成 0～100（黑與白的距離＝100）。
 * - 差 ≤ 容許度：背景（0）；差 ≥ 容許度＋柔邊：留下（255）；中間依比例（線性）半透明。
 * - connected（預設）：只去掉「從圖的四邊連過來」的背景（四連通，經過差 < 容許度＋柔邊的像素）；
 *   角色身上和背景同色的地方（白衣服、眼白）只要沒有和外面相連就留著。關掉時整張圖同色的都去掉。
 * - 原圖完全透明的像素一律當成背景（可以通過）。
 * - 多個背景色（`extra`）：顏色差＝到最近的背景色；`blend` 時兩兩之間的混色（RGB 空間裡兩色的連線）也算背景，
 *   顏色差也取到每條連線的距離（例如左白右紫、中間是網點或漸層）。只有一個背景色時結果和單色完全相同。
 */
import type { Rgb } from './filters';

/** 背景色的集合：一個或多個顏色；blend 時兩兩之間的混色（兩色的連線上的顏色）也算背景 */
export interface KeyColors {
  colors: readonly Rgb[];
  blend?: boolean;
}

interface Segment {
  a: Rgb;
  v: [number, number, number];
  vv: number;
}

function segmentsOf(set: KeyColors): Segment[] {
  const out: Segment[] = [];
  if (!set.blend) return out;
  const c = set.colors;
  for (let i = 0; i < c.length; i++) {
    for (let j = i + 1; j < c.length; j++) {
      const v: [number, number, number] = [c[j][0] - c[i][0], c[j][1] - c[i][1], c[j][2] - c[i][2]];
      const vv = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
      if (vv > 0) out.push({ a: c[i], v, vv });
    }
  }
  return out;
}

export interface ColorKeyOptions {
  /** 背景色 */
  color: Rgb;
  /** 容許度 0～100 */
  tolerance: number;
  /** 柔邊 0～100：容許度之外再多這麼多的範圍逐漸變不透明 */
  softness: number;
  /** 只去掉和圖邊相連的背景（預設 true） */
  connected?: boolean;
  /** 其他背景色（多色背景；不給或空的時候只有 color） */
  extra?: readonly Rgb[];
  /** 兩個背景色之間的混色也算背景（2 色以上才有作用） */
  blend?: boolean;
}

/** 0～100 的顏色差（黑白的距離＝100） */
export const COLOR_DISTANCE_MAX = 255 * Math.sqrt(3);

export function colorDistance(r: number, g: number, b: number, c: Rgb): number {
  const dr = r - c[0];
  const dg = g - c[1];
  const db = b - c[2];
  return (Math.sqrt(dr * dr + dg * dg + db * db) / COLOR_DISTANCE_MAX) * 100;
}

/**
 * 到背景色集合的顏色差（0～100）：到每個背景色、blend 時也到每兩個背景色的連線（線段），取最小。
 * 只有一個顏色時就是 colorDistance（逐值相同）。
 */
export function keyDistance(set: KeyColors): (r: number, g: number, b: number) => number {
  const colors = set.colors;
  if (colors.length === 1) {
    const c = colors[0];
    return (r, g, b) => colorDistance(r, g, b, c);
  }
  const segs = segmentsOf(set);
  return (r, g, b) => (Math.sqrt(keySquared(colors, segs, r, g, b)) / COLOR_DISTANCE_MAX) * 100;
}

/** 到背景色集合的距離的平方（RGB 0～255） */
function keySquared(
  colors: readonly Rgb[],
  segs: readonly Segment[],
  r: number,
  g: number,
  b: number,
): number {
  let best = Number.POSITIVE_INFINITY;
  for (const c of colors) {
    const dr = r - c[0];
    const dg = g - c[1];
    const db = b - c[2];
    const d = dr * dr + dg * dg + db * db;
    if (d < best) best = d;
  }
  for (const { a, v, vv } of segs) {
    const pr = r - a[0];
    const pg = g - a[1];
    const pb = b - a[2];
    const t = (pr * v[0] + pg * v[1] + pb * v[2]) / vv;
    /* 兩端外面：最近的是端點（上面已經算過） */
    if (t <= 0 || t >= 1) continue;
    const er = pr - t * v[0];
    const eg = pg - t * v[1];
    const eb = pb - t * v[2];
    const d = er * er + eg * eg + eb * eb;
    if (d < best) best = d;
  }
  return best;
}

/** 背景色集合裡離 (r, g, b) 最近的一點：某個背景色，或 blend 時兩色連線上的混色（去色邊用） */
export function nearestKeyColor(set: KeyColors): (r: number, g: number, b: number) => Rgb {
  const colors = set.colors;
  if (colors.length === 1) {
    const c = colors[0];
    return () => c;
  }
  const segs = segmentsOf(set);
  return (r, g, b) => {
    let best = Number.POSITIVE_INFINITY;
    let at: Rgb = colors[0];
    for (const c of colors) {
      const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
      if (d < best) {
        best = d;
        at = c;
      }
    }
    for (const { a, v, vv } of segs) {
      const t = ((r - a[0]) * v[0] + (g - a[1]) * v[1] + (b - a[2]) * v[2]) / vv;
      if (t <= 0 || t >= 1) continue;
      const p: Rgb = [a[0] + t * v[0], a[1] + t * v[1], a[2] + t * v[2]];
      const d = (r - p[0]) ** 2 + (g - p[1]) ** 2 + (b - p[2]) ** 2;
      if (d < best) {
        best = d;
        at = p;
      }
    }
    return at;
  };
}

/** 差 d 時的不透明度（0～255） */
export function keyAlpha(d: number, tolerance: number, softness: number): number {
  if (d <= tolerance) return 0;
  if (softness <= 0 || d >= tolerance + softness) return 255;
  return Math.round(((d - tolerance) / softness) * 255);
}

/** 依背景色算遮罩（255＝留下） */
export function colorKeyMask(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  { color, tolerance, softness, connected = true, extra, blend = false }: ColorKeyOptions,
): Uint8Array<ArrayBuffer> {
  const n = width * height;
  const tol = Math.max(0, tolerance);
  const soft = Math.max(0, softness);
  /* 每個像素的「背景程度」：0＝背景、255＝不像背景；原圖透明的像素是背景 */
  const key = new Uint8Array(n);
  if (!extra?.length) {
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      key[i] =
        rgba[p + 3] === 0
          ? 0
          : keyAlpha(colorDistance(rgba[p], rgba[p + 1], rgba[p + 2], color), tol, soft);
    }
  } else {
    multiKey(rgba, key, { colors: [color, ...extra], blend }, tol, soft);
  }
  if (!connected) return key;
  /* 從四邊往內找連在一起的背景（差 < 容許度＋柔邊，或透明）；沒連到的一律留下 */
  const out = new Uint8Array(n).fill(255);
  const passable = (i: number) => key[i] < 255;
  const seen = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const push = (i: number) => {
    if (seen[i] || !passable(i)) return;
    seen[i] = 1;
    queue[tail++] = i;
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (head < tail) {
    const i = queue[head++];
    out[i] = key[i];
    const x = i % width;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (i >= width) push(i - width);
    if (i + width < n) push(i + width);
  }
  return out;
}

/** 像素數到這麼多才用色碼表（表本身 32 MB） */
const MEMO_MIN_PIXELS = 1 << 21;

/**
 * 多個背景色的色鍵值（寫進 key）。大圖時同一個顏色只算一次（記在以 24 位元色碼為索引的表裡；常有大片同色）。
 */
function multiKey(
  rgba: Uint8Array | Uint8ClampedArray,
  key: Uint8Array,
  set: KeyColors,
  tol: number,
  soft: number,
) {
  const dist = keyDistance(set);
  const n = key.length;
  if (n < MEMO_MIN_PIXELS) {
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      key[i] = rgba[p + 3] === 0 ? 0 : keyAlpha(dist(rgba[p], rgba[p + 1], rgba[p + 2]), tol, soft);
    }
    return;
  }
  /* 2^24 個顏色：值＋1（0＝還沒算） */
  const memo = new Uint16Array(1 << 24);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    if (rgba[p + 3] === 0) {
      key[i] = 0;
      continue;
    }
    const c = (rgba[p] << 16) | (rgba[p + 1] << 8) | rgba[p + 2];
    let v = memo[c];
    if (!v) {
      v = keyAlpha(dist(rgba[p], rgba[p + 1], rgba[p + 2]), tol, soft) + 1;
      memo[c] = v;
    }
    key[i] = v - 1;
  }
}

export interface BackgroundEstimate {
  /** 背景色（該組顏色的平均） */
  color: [number, number, number];
  /** 四邊有多少比例是這個顏色（0～1）；太低時大概不是純色背景 */
  ratio: number;
}

/**
 * 從圖的四邊（最外圈 border px）找最多的顏色：RGB 各切 16 格（每格 16）統計，取最多的一格（同數量取先達到的），
 * 回傳這一格裡像素的平均色。完全透明的像素不算。沒有可算的像素時是白色、比例 0。
 */
export function estimateBackground(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  border = 2,
): BackgroundEstimate {
  const counts = new Map<number, { n: number; r: number; g: number; b: number }>();
  let best: { n: number; r: number; g: number; b: number } | null = null;
  let total = 0;
  const bw = Math.min(border, Math.ceil(width / 2));
  const bh = Math.min(border, Math.ceil(height / 2));
  const visit = (x: number, y: number) => {
    const p = (y * width + x) * 4;
    if (rgba[p + 3] === 0) return;
    total++;
    const r = rgba[p];
    const g = rgba[p + 1];
    const b = rgba[p + 2];
    const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    let e = counts.get(k);
    if (!e) {
      e = { n: 0, r: 0, g: 0, b: 0 };
      counts.set(k, e);
    }
    e.n++;
    e.r += r;
    e.g += g;
    e.b += b;
    if (!best || e.n > best.n) best = e;
  };
  for (let y = 0; y < height; y++) {
    const edgeRow = y < bh || y >= height - bh;
    for (let x = 0; x < width; x++) {
      if (edgeRow || x < bw || x >= width - bw) visit(x, y);
    }
  }
  const b = best as { n: number; r: number; g: number; b: number } | null;
  if (!b || !total) return { color: [255, 255, 255], ratio: 0 };
  return {
    color: [Math.round(b.r / b.n), Math.round(b.g / b.n), Math.round(b.b / b.n)],
    ratio: b.n / total,
  };
}

export interface BorderColor {
  /** 這一群的平均色 */
  color: [number, number, number];
  /** 四邊有多少比例是這一群（0～1） */
  ratio: number;
}

export interface BorderColorOptions {
  /** 看最外幾 px（預設 2，同 estimateBackground） */
  border?: number;
  /** 比例低於這個的不列（預設 0.1） */
  minRatio?: number;
  /** 顏色差（0～100）在這以內的併成一群（預設 12；有細顆粒、JPG 雜訊的底色不會被拆成好幾群） */
  merge?: number;
}

/**
 * 四邊常見的顏色（給「建議的背景色」用）：同 estimateBackground 的 16 格統計，格子由多到少（同數量取先達到的），
 * 每一格的平均色離已經有的某一群的第一格 ≤ merge 時併進那一群，否則自成一群。回傳比例 ≥ minRatio 的群，比例由大到小。
 * 完全透明的像素不算；沒有可算的像素時是空的。
 */
export function borderColors(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  { border = 2, minRatio = 0.1, merge = 12 }: BorderColorOptions = {},
): BorderColor[] {
  const counts = new Map<number, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  const bw = Math.min(border, Math.ceil(width / 2));
  const bh = Math.min(border, Math.ceil(height / 2));
  for (let y = 0; y < height; y++) {
    const edgeRow = y < bh || y >= height - bh;
    for (let x = 0; x < width; x++) {
      if (!(edgeRow || x < bw || x >= width - bw)) continue;
      const p = (y * width + x) * 4;
      if (rgba[p + 3] === 0) continue;
      total++;
      const r = rgba[p];
      const g = rgba[p + 1];
      const b = rgba[p + 2];
      const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      let e = counts.get(k);
      if (!e) {
        e = { n: 0, r: 0, g: 0, b: 0 };
        counts.set(k, e);
      }
      e.n++;
      e.r += r;
      e.g += g;
      e.b += b;
    }
  }
  if (!total) return [];
  /* Map 依先達到的順序；sort 是穩定的，同數量時先達到的在前 */
  const buckets = [...counts.values()].sort((a, b) => b.n - a.n);
  const groups: { seed: Rgb; n: number; r: number; g: number; b: number }[] = [];
  for (const e of buckets) {
    const avg: Rgb = [e.r / e.n, e.g / e.n, e.b / e.n];
    let best: (typeof groups)[number] | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const gr of groups) {
      const d = colorDistance(avg[0], avg[1], avg[2], gr.seed);
      if (d < bestD) {
        bestD = d;
        best = gr;
      }
    }
    if (best && bestD <= merge) {
      best.n += e.n;
      best.r += e.r;
      best.g += e.g;
      best.b += e.b;
    } else {
      groups.push({ seed: avg, n: e.n, r: e.r, g: e.g, b: e.b });
    }
  }
  return groups
    .map((gr) => ({
      color: [Math.round(gr.r / gr.n), Math.round(gr.g / gr.n), Math.round(gr.b / gr.n)] as [
        number,
        number,
        number,
      ],
      ratio: gr.n / total,
    }))
    .filter((c) => c.ratio >= minRatio)
    .sort((a, b) => b.ratio - a.ratio);
}

export interface DecontaminateOptions {
  /** 圖的寬高（edge > 0 時要） */
  width: number;
  height: number;
  /**
   * 也處理去背邊界旁這麼寬（px）的一圈不透明像素（預設 0＝只處理半透明的像素）。純色去背的反鋸齒邊緣多半是不透明的
   * （顏色已經混到背景色，但差距超過容許度＋柔邊），換到深色背景時會留一圈淺色邊。
   */
  edge?: number;
}

/**
 * 1＝離遮罩 < 255 的像素 r px 以內（圓形範圍）。結果同「`growMask(mask, w, h, -r)` 不是 255」，但只看邊界：
 * 最近的那個遮罩 < 255 的像素一定緊鄰（上下左右）遮罩 255 的像素，所以只要在這種像素周圍蓋半徑 r 的圓
 * （圖外當成和最近的邊相同也不會更近）。大圖時比整張做形態學快很多。
 */
function nearMap(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const near = new Uint8Array(w * h);
  const disk: [number, number][] = [];
  for (let dy = -r; dy <= r; dy++) {
    const hw = Math.floor(Math.sqrt(r * r - dy * dy));
    for (let dx = -hw; dx <= hw; dx++) disk.push([dx, dy]);
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i] === 255) continue;
      near[i] = 1;
      const edge =
        (x > 0 && mask[i - 1] === 255) ||
        (x < w - 1 && mask[i + 1] === 255) ||
        (y > 0 && mask[i - w] === 255) ||
        (y < h - 1 && mask[i + w] === 255);
      if (!edge) continue;
      for (const [dx, dy] of disk) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < w && yy >= 0 && yy < h) near[yy * w + xx] = 1;
      }
    }
  }
  return near;
}

/** 邊緣一圈：前景色和背景色至少要差這麼多（RGB 0～255 的歐氏距離）才處理 */
const EDGE_MIN_CONTRAST = 16;
/** 邊緣一圈：顏色離「背景色 → 前景色」這條線最多這麼遠（× 兩色的距離）才算混到背景色 */
const EDGE_MAX_RESIDUAL = 0.2;

/** 多個背景色時，找「附近被去掉的像素」的範圍（以像素為中心 (2r＋1) 見方） */
const LOCAL_BG_RADIUS = 6;

/** 每個像素的背景色 B：一個顏色時固定；多個顏色時見 decontaminate 的說明 */
function backgroundPicker(
  rgba: Uint8Array | Uint8ClampedArray,
  mask: Uint8Array,
  bg: Rgb | KeyColors,
  options?: DecontaminateOptions,
): (i: number) => Rgb {
  const set: KeyColors = isKeyColors(bg) ? bg : { colors: [bg] };
  if (set.colors.length <= 1) {
    const fixed: Rgb = set.colors[0] ?? [255, 255, 255];
    return () => fixed;
  }
  const nearest = nearestKeyColor(set);
  const own = (i: number) => nearest(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
  if (!options) return own;
  const { width: w, height: h } = options;
  const r = LOCAL_BG_RADIUS;
  return (i) => {
    const x = i % w;
    const y = (i - x) / w;
    let n = 0;
    let sr = 0;
    let sg = 0;
    let sb = 0;
    const x0 = Math.max(0, x - r);
    const x1 = Math.min(w - 1, x + r);
    const y1 = Math.min(h - 1, y + r);
    for (let yy = Math.max(0, y - r); yy <= y1; yy++) {
      for (let j = yy * w + x0, je = yy * w + x1; j <= je; j++) {
        if (mask[j] !== 0 || rgba[j * 4 + 3] === 0) continue;
        n++;
        sr += rgba[j * 4];
        sg += rgba[j * 4 + 1];
        sb += rgba[j * 4 + 2];
      }
    }
    return n ? nearest(sr / n, sg / n, sb / n) : own(i);
  };
}

const isKeyColors = (bg: Rgb | KeyColors): bg is KeyColors => !Array.isArray(bg);

/**
 * 去色邊：把邊緣混到的背景色扣掉。回傳新的 RGBA（透明度不變；其他像素原樣）。
 *
 * - 半透明的像素（0 < 遮罩 < 255）：看到的顏色 C ＝ a × F ＋（1 − a）× B，還原 F ＝（C −（1 − a）× B）÷ a
 *   （夾在 0～255，四捨五入）。
 * - edge > 0 時另外處理去背邊界旁一圈（遮罩 255、與遮罩 < 255 的像素距離 ≤ edge px，圓形範圍）：
 *   前景色 F̄ ＝ 周圍 (2 × (edge＋2)＋1) 見方裡「離邊界超過 edge px」的像素的平均色（沒有就不處理）；D ＝ F̄ − B；
 *   t ＝ (C − B)·D ÷ |D|²（C 在背景色 → 前景色這條線上的位置）。只處理 |D| ≥ 16、0 < t < 1、
 *   而且 |C − B − tD| ≤ 0.2 |D|（顏色是前景色混到背景色，不是另一種顏色）的像素：新顏色 ＝ C ＋（1 − t）D
 *   （混到的背景色換成前景色），夾在 0～255，四捨五入。
 * - 多個背景色（bg 是有 2 個以上顏色的 KeyColors）時，每個像素的 B 各自決定：附近（以這個像素為中心
 *   (2 × 6＋1) 見方）被去掉的像素（遮罩 0、原圖不透明）的平均色，在背景色集合裡最接近的一點（某個背景色，或 blend 時
 *   兩色連線上的混色）；附近沒有被去掉的像素（或沒給寬高）時，改用離這個像素自己的顏色最近的一點。
 *   只看像素自己的顏色會選錯：例如 40% 的紅疊在白上，顏色反而比較接近紫色。
 *   只有一個顏色時和直接給那個顏色完全相同。
 */
export function decontaminate(
  rgba: Uint8Array | Uint8ClampedArray,
  mask: Uint8Array,
  bg: Rgb | KeyColors,
  options?: DecontaminateOptions,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(rgba);
  const bgAt = backgroundPicker(rgba, mask, bg, options);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    const m = mask[i];
    if (m === 0 || m === 255) continue;
    const a = m / 255;
    const k = 1 - a;
    const b = bgAt(i);
    for (let c = 0; c < 3; c++) {
      const v = (rgba[p + c] - k * b[c]) / a;
      out[p + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    }
  }
  const edge = Math.round(options?.edge ?? 0);
  if (!options || edge <= 0) return out;
  const { width: w, height: h } = options;
  /* 1＝離去背邊界 edge px 以內；遮罩 255 而且不在這裡的是「純」前景（同收縮 edge px 後仍是 255） */
  const near = nearMap(mask, w, h, edge);
  const win = edge + 2;
  const minL2 = EDGE_MIN_CONTRAST * EDGE_MIN_CONTRAST;
  const maxR2 = EDGE_MAX_RESIDUAL * EDGE_MAX_RESIDUAL;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i] !== 255 || !near[i]) continue;
      /* 周圍純前景的平均色 */
      let n = 0;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      const y1 = Math.min(h - 1, y + win);
      const x0 = Math.max(0, x - win);
      const x1 = Math.min(w - 1, x + win);
      for (let yy = Math.max(0, y - win); yy <= y1; yy++) {
        for (let j = yy * w + x0, je = yy * w + x1; j <= je; j++) {
          if (near[j] || mask[j] !== 255) continue;
          n++;
          sr += rgba[j * 4];
          sg += rgba[j * 4 + 1];
          sb += rgba[j * 4 + 2];
        }
      }
      if (!n) continue;
      const b = bgAt(i);
      const dr = sr / n - b[0];
      const dg = sg / n - b[1];
      const db = sb / n - b[2];
      const l2 = dr * dr + dg * dg + db * db;
      if (l2 < minL2) continue;
      const p = i * 4;
      const vr = rgba[p] - b[0];
      const vg = rgba[p + 1] - b[1];
      const vb = rgba[p + 2] - b[2];
      const t = (vr * dr + vg * dg + vb * db) / l2;
      if (!(t > 0 && t < 1)) continue;
      const rr = vr - t * dr;
      const rg = vg - t * dg;
      const rb = vb - t * db;
      if (rr * rr + rg * rg + rb * rb > maxR2 * l2) continue;
      const k = 1 - t;
      const nr = rgba[p] + k * dr;
      const ng = rgba[p + 1] + k * dg;
      const nb = rgba[p + 2] + k * db;
      out[p] = nr < 0 ? 0 : nr > 255 ? 255 : Math.round(nr);
      out[p + 1] = ng < 0 ? 0 : ng > 255 ? 255 : Math.round(ng);
      out[p + 2] = nb < 0 ? 0 : nb > 255 ? 255 : Math.round(nb);
    }
  }
  return out;
}
