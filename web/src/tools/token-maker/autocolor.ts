/**
 * 自動配色（eidolon-ui 的 AUTO，MIT）：從圖片挑外框色與第二色。
 * - 外框色：64 px 的縮圖、中心的像素份量大；先扣掉背景（四邊 4% 的主要顏色），k-means 6 群，
 *   挑「大、鮮豔、和圖片外緣亮度差夠多」的，亮度調到和外緣至少差 0.22。
 * - 第二色：整張圖以 5 位元分箱（細小的顏色也留得住）；挑鮮豔、和外框色差很多的群，先依色相分家族再挑一個。
 * 每按一次種子加一，依分數加權隨機換下一個候選；第一次（種子 0）取分數最高的。純計算，不碰 DOM。
 */
export interface Pixels {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

type P4 = [number, number, number, number];
type C3 = [number, number, number];

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist2 = (a: readonly number[], b: readonly number[]) =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const lightness = (c: readonly number[]) =>
  (Math.max(c[0], c[1], c[2]) + Math.min(c[0], c[1], c[2])) / 510;
const sat = (c: readonly number[]) => {
  const mx = Math.max(c[0], c[1], c[2]);
  return mx ? (mx - Math.min(c[0], c[1], c[2])) / mx : 0;
};
const vivid = (c: readonly number[]) => {
  const mx = Math.max(c[0], c[1], c[2]);
  const mn = Math.min(c[0], c[1], c[2]);
  return mx ? ((mx - mn) / mx) * (mx / 255) : 0;
};
const hexRgb = (h: string): C3 =>
  [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16) || 0) as C3;

function mulberry(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** 加權 k-means（k-means++ 起點）→ [{ c, w }]，w 加總為 1 */
function kmeans(px: P4[], K: number, rand: () => number, minW = 0.02): { c: C3; w: number }[] {
  if (!px.length) return [];
  const cents: C3[] = [px[Math.floor(rand() * px.length)].slice(0, 3) as C3];
  while (cents.length < K) {
    let sum = 0;
    const d = px.map((p) => {
      const v = p[3] * Math.min(...cents.map((c) => dist2(p, c)));
      sum += v;
      return v;
    });
    if (!sum) break;
    let r = rand() * sum;
    let i = 0;
    while (i < d.length - 1) {
      r -= d[i];
      if (r <= 0) break;
      i++;
    }
    cents.push(px[i].slice(0, 3) as C3);
  }
  let acc: number[][] = [];
  for (let it = 0; it < 10; it++) {
    acc = cents.map(() => [0, 0, 0, 0]);
    for (const p of px) {
      let best = 0;
      let bd = Number.POSITIVE_INFINITY;
      cents.forEach((c, j) => {
        const v = dist2(p, c);
        if (v < bd) {
          bd = v;
          best = j;
        }
      });
      const a = acc[best];
      a[0] += p[0] * p[3];
      a[1] += p[1] * p[3];
      a[2] += p[2] * p[3];
      a[3] += p[3];
    }
    acc.forEach((a, j) => {
      if (a[3]) cents[j] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]];
    });
  }
  const total = acc.reduce((s, a) => s + a[3], 0) || 1;
  return cents.map((c, j) => ({ c, w: acc[j][3] / total })).filter((o) => o.w > minW);
}

/** 縮到 64 px 的像素（中心份量大）、背景色、外緣亮度 */
function smallPixels(img: Pixels): { px: P4[]; bg: C3[]; outerL: number | null } {
  const { width: W0, height: H0, data } = img;
  const k = 64 / Math.max(W0, H0);
  const W = Math.max(1, Math.round(W0 * k));
  const H = Math.max(1, Math.round(H0 * k));
  const px: P4[] = [];
  const border: P4[] = [];
  const edge = Math.max(1, Math.round(Math.min(W, H) * 0.04));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = Math.min(W0 - 1, Math.floor(((x + 0.5) / W) * W0));
      const sy = Math.min(H0 - 1, Math.floor(((y + 0.5) / H) * H0));
      const i = (sy * W0 + sx) * 4;
      if (data[i + 3] < 128) continue;
      const dx = (x + 0.5) / W - 0.5;
      const dy = (y + 0.5) / H - 0.5;
      px.push([data[i], data[i + 1], data[i + 2], Math.exp(-(dx * dx + dy * dy) * 5)]);
      if (y < edge || y >= H - edge || x < edge || x >= W - edge)
        border.push([data[i], data[i + 1], data[i + 2], 1]);
    }
  const bg = border.length
    ? kmeans(border, Math.min(3, border.length), mulberry(7))
        .filter((o) => o.w > 0.3)
        .map((o) => o.c)
    : [];
  const outerL = border.length
    ? border.reduce((s, p) => s + lightness(p), 0) / border.length
    : null;
  return { px, bg, outerL };
}

/** 整張圖 5 位元分箱（每箱留平均色），細小的顏色不會被平均掉 */
function binnedPixels(img: Pixels): P4[] {
  const { width: W, height: H, data } = img;
  const bins = new Float64Array(32768 * 4);
  for (let y = 0; y < H; y++) {
    const dy = (y + 0.5) / H - 0.5;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (data[i + 3] < 128) continue;
      const dx = (x + 0.5) / W - 0.5;
      const w = Math.exp(-(dx * dx + dy * dy) * 5);
      const b = (((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3)) * 4;
      bins[b] += data[i] * w;
      bins[b + 1] += data[i + 1] * w;
      bins[b + 2] += data[i + 2] * w;
      bins[b + 3] += w;
    }
  }
  const out: P4[] = [];
  for (let b = 0; b < bins.length; b += 4) {
    const w = bins[b + 3];
    if (w) out.push([bins[b] / w, bins[b + 1] / w, bins[b + 2] / w, w]);
  }
  return out;
}

const notBg = (c: readonly number[], bg: C3[]) =>
  bg.reduce((f, b) => f * (1 - Math.exp(-dist2(c, b) / (2 * 28 * 28))), 1);

function dropBg(px: P4[], bg: C3[]): P4[] {
  const out = px.map((p) => [p[0], p[1], p[2], p[3] * notBg(p, bg)] as P4);
  const sum = (a: P4[]) => a.reduce((s, p) => s + p[3], 0);
  return sum(out) > 0.15 * sum(px) ? out.filter((p) => p[3] > 0) : px;
}

const ACCENT_SAT = 0.45;
const FRAME_GAP = 0.22;

function accentClusters(px: P4[], main: C3, rand: () => number) {
  const chroma = (p: readonly number[]) =>
    (Math.max(p[0], p[1], p[2]) - Math.min(p[0], p[1], p[2])) / 255;
  const far = px.filter((p) => dist2(p, main) > 90 * 90);
  let set: P4[] = far
    .filter((p) => chroma(p) > 0.2 && sat(p) >= ACCENT_SAT)
    .map((p) => [p[0], p[1], p[2], p[3] * chroma(p)] as P4);
  if (set.length < 24) set = far;
  if (set.length < 24) {
    const by = px.map((p) => [dist2(p, main), p] as const).sort((a, b) => b[0] - a[0]);
    set = by.slice(0, Math.max(1, Math.ceil(by.length * 0.15))).map((e) => e[1]);
  }
  return kmeans(set, Math.min(5, set.length), rand, 0.01);
}

interface Cand {
  hex: string;
  s: number;
}

function hueFamilies(cand: Cand[]): { h: number; grey: boolean; s: number; m: Cand[] }[] {
  const fams: { h: number; grey: boolean; s: number; m: Cand[] }[] = [];
  for (const o of cand) {
    const [r, g, b] = hexRgb(o.hex);
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const ch = mx - mn;
    const grey = !mx || ch / mx < 0.15;
    const h =
      grey || !ch
        ? 0
        : 60 * (mx === r ? ((g - b) / ch + 6) % 6 : mx === g ? (b - r) / ch + 2 : (r - g) / ch + 4);
    const f = fams.find(
      (x) => x.grey === grey && (grey || Math.min(Math.abs(x.h - h), 360 - Math.abs(x.h - h)) < 35),
    );
    if (f) f.m.push(o);
    else fams.push({ h, grey, s: o.s, m: [o] });
  }
  return fams;
}

function seededPick<T>(list: T[], w: (o: T) => number, seed: number, rand: () => number): T {
  if (!seed) return list[0];
  const sum = list.reduce((s, o) => s + w(o), 0);
  let r = rand() * sum;
  for (const o of list) {
    r -= w(o);
    if (r <= 0) return o;
  }
  return list[list.length - 1];
}

/** 調整亮度：外框色和外緣至少差 FRAME_GAP；第二色夾在 0.3～0.8（在深色的畫面上看得到） */
function relight(c: C3, outer: number | null): string {
  let [r, g, b] = c.map((v) => v / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  let L = clamp(l, 0.3, 0.8);
  if (outer != null && Math.abs(l - outer) < FRAME_GAP)
    L = clamp(outer < 0.5 ? outer + FRAME_GAP : outer - FRAME_GAP, 0.08, 0.92);
  else if (outer != null) L = clamp(l, 0.08, 0.92);
  if (L !== l) {
    const s = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
    const k = (s * (1 - Math.abs(2 * L - 1))) / (mx - mn || 1);
    [r, g, b] = [r, g, b].map((v) => L + (v - l) * k);
  }
  return `#${[r, g, b]
    .map((v) =>
      Math.round(clamp(v, 0, 1) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/**
 * 從圖片挑一個顏色：kind＝'frame'（外框色）或 'accent'（第二色，避開 frameHex）；current 是目前的顏色（盡量不要挑回一樣的）。
 * 找不到時 null。
 */
export function autoColor(
  img: Pixels,
  kind: 'frame' | 'accent',
  frameHex: string,
  current: string,
  seed: number,
): string | null {
  const small = smallPixels(img);
  const isFrame = kind === 'frame';
  const px = dropBg(isFrame ? small.px : binnedPixels(img), small.bg);
  if (!px.length) return null;
  const rand = mulberry(seed * 2654435761 + 1);
  const frame = hexRgb(frameHex);
  const now = hexRgb(current);
  const clusters = isFrame ? kmeans(px, 6, rand) : accentClusters(px, frame, rand);
  const outer = isFrame ? small.outerL : null;
  const score = (o: { c: C3; w: number }) =>
    isFrame
      ? o.w * (0.15 + vivid(o.c)) * (outer == null ? 1 : 0.3 + Math.abs(lightness(o.c) - outer))
      : (o.w ** 0.2 * (0.2 + vivid(o.c)) * Math.sqrt(dist2(o.c, frame))) / 441;
  let cand: Cand[] = clusters
    .map((o) => ({ hex: relight(o.c, outer), s: score(o) }))
    .filter((o) => o.s > 0)
    .sort((a, b) => b.s - a.s);
  const fresh = cand.filter((o) => dist2(hexRgb(o.hex), now) > 900);
  if (fresh.length) cand = fresh;
  const vivids = isFrame ? [] : cand.filter((o) => sat(hexRgb(o.hex)) >= ACCENT_SAT);
  if (vivids.length) cand = vivids;
  if (!cand.length) return null;
  const pool = isFrame ? cand : seededPick(hueFamilies(cand), (f) => f.s, seed, rand).m;
  return seededPick(pool, (o) => o.s * o.s, seed, rand).hex;
}
