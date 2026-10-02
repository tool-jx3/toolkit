/**
 * 減色（最多 256 色，含半透明）。移植自 text-fx（本專案原創，MIT）的 palette.js。
 *
 * 1. 所有影格實際用到的顏色（含半透明）在上限以內 → 直接用原色當調色盤，完全無損。
 * 2. 超過時：在「預乘 alpha」的 RGBA 空間做加權中位切割，再用 k-means 微調。
 *    - 完全不透明與半透明的顏色分成兩群，各自分箱、各自對應：不透明的部分永遠對應到不透明的顏色。
 *    - 預乘之後，幾乎透明的邊緣像素顏色誤差權重自然變小，顏色預算集中在看得到的地方。
 *    - 不抖色（dithering），避免雜點與檔案變大。
 *
 * 像素一律以 Uint32（小端：0xAABBGGRR）表示，也就是 `new Uint32Array(imageData.data.buffer)`。
 * 統計用固定大小的陣列分桶（半透明：RGBA 各 5 位元；不透明：RGB 各 5 位元），畫面色數再多都一樣快。
 *
 * 第 2 步有兩種做法（`PaletteMethod`）：
 * - `'median-cut'`（預設）：上面說的加權中位切割＋k-means 4 次。text-fx 等工具用這個，輸出與以前逐位元組相同。
 * - `'pca'`：主成分切割（參考 cutin 舊版所用 UPNG.js 的減色，MIT）。每次挑「沿主軸的分散量」最大的一群，
 *   用「過這群的平均值、垂直於主軸」的平面切成兩半；切完再 k-means 微調，最後每個像素對應到真正最近的顏色
 *   （不經 6 位元的對應表）。名額依分散量分配：大片單色不會吃掉名額，彩虹這類連續色、半透明的線條也分得到顏色。
 *   不透明與半透明照樣各自成群（不透明的像素一定對應到不透明的顏色）。
 */

const TRANS_BUCKETS = 1 << 20;
const BUCKETS = TRANS_BUCKETS + (1 << 15);
const rgb5 = (v: number) =>
  (((v & 255) >> 3) << 10) | ((((v >>> 8) & 255) >> 3) << 5) | (((v >>> 16) & 255) >> 3);

/** 調色盤的選法（見檔頭說明） */
export type PaletteMethod = 'median-cut' | 'pca';

export class ColorStats {
  /** 上限以內時記下每個原色（值 → 份量） */
  readonly exact = new Map<number, number>();
  overflow = false;
  private readonly limit: number;
  /** 用過半透明的桶（clear 時才需要整個清掉） */
  private usedTrans = false;
  readonly cnt = new Float64Array(BUCKETS);
  readonly sr = new Float64Array(BUCKETS);
  readonly sg = new Float64Array(BUCKETS);
  readonly sb = new Float64Array(BUCKETS);
  readonly sa = new Float64Array(BUCKETS);

  constructor(limit = 256) {
    this.limit = limit;
  }

  /** 清空，重新統計（例如 GIF 每格各自減色時重複使用同一份，不必每格配置新的陣列） */
  clear(): void {
    this.exact.clear();
    this.overflow = false;
    const from = this.usedTrans ? 0 : TRANS_BUCKETS;
    for (const arr of [this.cnt, this.sr, this.sg, this.sb, this.sa]) arr.fill(0, from);
    this.usedTrans = false;
  }

  /** 一段像素：連續相同的值一次累加。weight：這段畫面的份量（停留越久越重要） */
  add(u32: Uint32Array, start: number, end: number, weight = 1): void {
    let i = start;
    while (i < end) {
      let v = u32[i];
      let j = i + 1;
      while (j < end && u32[j] === v) j++;
      const n = (j - i) * weight;
      i = j;
      const a = v >>> 24;
      if (a === 0) v = 0;
      if (!this.overflow) {
        this.exact.set(v, (this.exact.get(v) || 0) + n);
        if (this.exact.size > this.limit) this.overflow = true;
      }
      if (a === 0) continue;
      if (a !== 255) this.usedTrans = true;
      const k = a === 255 ? TRANS_BUCKETS + rgb5(v) : (rgb5(v) << 5) | (a >> 3);
      const w = n * a; // 預乘
      this.cnt[k] += n;
      this.sr[k] += (v & 255) * w;
      this.sg[k] += ((v >>> 8) & 255) * w;
      this.sb[k] += ((v >>> 16) & 255) * w;
      this.sa[k] += a * n;
    }
  }

  addRect(
    u32: Uint32Array,
    width: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    weight = 1,
  ): void {
    for (let y = y0; y < y1; y++) this.add(u32, y * width + x0, y * width + x1, weight);
  }

  get size(): number {
    return this.overflow ? Number.POSITIVE_INFINITY : this.exact.size;
  }

  /** 統計過半透明的像素（沒有時半透明的桶全是 0，不必掃） */
  get translucent(): boolean {
    return this.usedTrans;
  }
}

export interface Palette {
  /** RGBA 平鋪（count×4）。有效果的透明色在 0 號。 */
  colors: Uint8Array;
  /** 是否完全無損（原色數在上限以內） */
  lossless: boolean;
  count: number;
  /** 像素（Uint32，0xAABBGGRR）→ 調色盤索引 */
  indexOf: (v: number) => number;
}

type Searcher = (x: number, y: number, z: number, a: number) => number;

/** 一群顏色（不透明或半透明）的最近色搜尋：依 alpha 排序後從最接近的往兩邊找 */
function makeSearcher(
  cx: Float64Array,
  cy: Float64Array,
  cz: Float64Array,
  ca: Float64Array,
  ids: number[],
): Searcher {
  const sorted = ids.slice().sort((p, q) => ca[p] - ca[q]);
  const C = sorted.length;
  return (x, y, z, a) => {
    let lo = 0;
    let hi = C - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ca[sorted[mid]] < a) lo = mid + 1;
      else hi = mid;
    }
    let bi = sorted[lo];
    let bd = Number.POSITIVE_INFINITY;
    const test = (k: number) => {
      let d = (ca[k] - a) ** 2;
      if (d >= bd) return;
      d += (cx[k] - x) ** 2;
      if (d >= bd) return;
      d += (cy[k] - y) ** 2;
      if (d >= bd) return;
      d += (cz[k] - z) ** 2;
      if (d < bd) {
        bd = d;
        bi = k;
      }
    };
    let l = lo - 1;
    let r = lo;
    let goL = true;
    let goR = true;
    while (goL || goR) {
      if (goR) {
        if (r < C) {
          const k = sorted[r];
          if ((ca[k] - a) ** 2 >= bd) goR = false;
          else test(k);
          r++;
        } else goR = false;
      }
      if (goL) {
        if (l >= 0) {
          const k = sorted[l];
          if ((ca[k] - a) ** 2 >= bd) goL = false;
          else test(k);
          l--;
        } else goL = false;
      }
    }
    return bi;
  };
}

interface Box {
  s: number;
  e: number;
  w: number;
  sse: number;
  varr: number[];
  opaque: boolean;
}

/** 由統計結果建立調色盤。原色數在上限以內時兩種方法都直接用原色（無損）。 */
export function buildPalette(
  stats: ColorStats,
  maxColors = 256,
  method: PaletteMethod = 'median-cut',
): Palette {
  if (!stats.overflow) {
    const keys = [...stats.exact.keys()].sort((a, b) => (a === 0 ? -1 : b === 0 ? 1 : a - b));
    if (!keys.length) keys.push(0);
    const colors = new Uint8Array(keys.length * 4);
    const lut = new Map<number, number>();
    keys.forEach((k, i) => {
      colors[i * 4] = k & 255;
      colors[i * 4 + 1] = (k >>> 8) & 255;
      colors[i * 4 + 2] = (k >>> 16) & 255;
      colors[i * 4 + 3] = k >>> 24;
      lut.set(k, i);
    });
    return {
      colors,
      lossless: true,
      count: keys.length,
      indexOf: (v) => {
        const key = v >>> 24 === 0 ? 0 : v;
        const i = lut.get(key);
        return i === undefined ? 0 : i;
      },
    };
  }
  if (method === 'pca') return buildPcaPalette(stats, maxColors);

  /* ---- 樣本：每個非空的桶一筆（預乘座標的加權平均）；不透明的排在前面 ---- */
  let N = 0;
  let NO = 0;
  for (let k = 0; k < BUCKETS; k++) {
    if (stats.cnt[k] > 0) {
      N++;
      if (k >= TRANS_BUCKETS) NO++;
    }
  }
  const px = new Float32Array(N);
  const py = new Float32Array(N);
  const pz = new Float32Array(N);
  const pa = new Float32Array(N);
  const pw = new Float64Array(N);
  {
    let io = 0;
    let it = NO;
    for (let k = 0; k < BUCKETS; k++) {
      const n = stats.cnt[k];
      if (!(n > 0)) continue;
      const i = k >= TRANS_BUCKETS ? io++ : it++;
      px[i] = stats.sr[k] / n / 255;
      py[i] = stats.sg[k] / n / 255;
      pz[i] = stats.sb[k] / n / 255;
      pa[i] = k >= TRANS_BUCKETS ? 255 : stats.sa[k] / n;
      pw[i] = n;
    }
  }

  const K = maxColors - 1; // 0 號保留給完全透明
  const axes = [px, py, pz, pa];
  const order = new Int32Array(N);
  for (let i = 0; i < N; i++) order[i] = i;
  const stat = (s: number, e: number, opaque: boolean): Box => {
    let w = 0;
    const m = [0, 0, 0, 0];
    const q = [0, 0, 0, 0];
    for (let i = s; i < e; i++) {
      const j = order[i];
      const ww = pw[j];
      w += ww;
      for (let a = 0; a < 4; a++) {
        const v = axes[a][j];
        m[a] += v * ww;
        q[a] += v * v * ww;
      }
    }
    const varr = m.map((mm, a) => (w > 0 ? q[a] - (mm * mm) / w : 0));
    return { s, e, w, sse: varr[0] + varr[1] + varr[2] + varr[3], varr, opaque };
  };
  /* 兩群各自一個起始箱，之後所有箱子一起依誤差大小輪流切，箱子不會跨群 */
  const boxes: Box[] = [];
  if (NO > 0) boxes.push(stat(0, NO, true));
  if (N - NO > 0) boxes.push(stat(NO, N, false));
  while (boxes.length < K) {
    let bi = -1;
    let best = 0;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].e - boxes[i].s > 1 && boxes[i].sse > best) {
        best = boxes[i].sse;
        bi = i;
      }
    }
    if (bi < 0) break;
    const bx = boxes[bi];
    let ax = 0;
    for (let a = 1; a < 4; a++) if (bx.varr[a] > bx.varr[ax]) ax = a;
    const arr = axes[ax];
    order.subarray(bx.s, bx.e).sort((p, q) => arr[p] - arr[q]);
    let acc = 0;
    let cut = bx.s + 1;
    const half = bx.w / 2;
    for (let i = bx.s; i < bx.e - 1; i++) {
      acc += pw[order[i]];
      if (acc >= half) {
        cut = i + 1;
        break;
      }
    }
    cut = Math.min(bx.e - 1, Math.max(bx.s + 1, cut));
    boxes.splice(bi, 1, stat(bx.s, cut, bx.opaque), stat(cut, bx.e, bx.opaque));
  }

  const C = boxes.length;
  const cx = new Float64Array(C);
  const cy = new Float64Array(C);
  const cz = new Float64Array(C);
  const ca = new Float64Array(C);
  const opq = boxes.map((b) => b.opaque);
  boxes.forEach((b, k) => {
    let sw = 0;
    for (let i = b.s; i < b.e; i++) {
      const j = order[i];
      const w = pw[j];
      cx[k] += px[j] * w;
      cy[k] += py[j] * w;
      cz[k] += pz[j] * w;
      ca[k] += pa[j] * w;
      sw += w;
    }
    cx[k] /= sw;
    cy[k] /= sw;
    cz[k] /= sw;
    ca[k] /= sw;
    if (b.opaque) ca[k] = 255;
  });
  const opaqueIds: number[] = [];
  const transIds: number[] = [];
  for (let k = 0; k < C; k++) (opq[k] ? opaqueIds : transIds).push(k);

  /* k-means 微調：不透明樣本只找不透明的顏色，半透明樣本只找半透明的顏色 */
  for (let iter = 0; iter < 4; iter++) {
    const findO = opaqueIds.length ? makeSearcher(cx, cy, cz, ca, opaqueIds) : null;
    const findT = transIds.length ? makeSearcher(cx, cy, cz, ca, transIds) : null;
    const sx = new Float64Array(C);
    const sy = new Float64Array(C);
    const sz = new Float64Array(C);
    const sa = new Float64Array(C);
    const sw = new Float64Array(C);
    for (let j = 0; j < N; j++) {
      const find = j < NO ? findO : findT;
      if (!find) continue;
      const k = find(px[j], py[j], pz[j], pa[j]);
      const w = pw[j];
      sx[k] += px[j] * w;
      sy[k] += py[j] * w;
      sz[k] += pz[j] * w;
      sa[k] += pa[j] * w;
      sw[k] += w;
    }
    for (let k = 0; k < C; k++) {
      if (!(sw[k] > 0)) continue;
      cx[k] = sx[k] / sw[k];
      cy[k] = sy[k] / sw[k];
      cz[k] = sz[k] / sw[k];
      ca[k] = opq[k] ? 255 : sa[k] / sw[k];
    }
  }

  /* 轉回一般（非預乘）RGBA；對應時用「實際存進檔案的顏色」比較 */
  const colors = new Uint8Array((C + 1) * 4);
  for (let k = 0; k < C; k++) {
    const a = opq[k] ? 255 : Math.max(1, Math.min(254, Math.round(ca[k])));
    const f = 255 / a;
    const r = Math.min(255, Math.round(cx[k] * f));
    const g = Math.min(255, Math.round(cy[k] * f));
    const b = Math.min(255, Math.round(cz[k] * f));
    const o = (k + 1) * 4;
    colors[o] = r;
    colors[o + 1] = g;
    colors[o + 2] = b;
    colors[o + 3] = a;
    cx[k] = (r * a) / 255;
    cy[k] = (g * a) / 255;
    cz[k] = (b * a) / 255;
    ca[k] = a;
  }
  const findO = opaqueIds.length ? makeSearcher(cx, cy, cz, ca, opaqueIds) : null;
  const findT = transIds.length ? makeSearcher(cx, cy, cz, ca, transIds) : null;
  const findAny = makeSearcher(
    cx,
    cy,
    cz,
    ca,
    Array.from({ length: C }, (_, k) => k),
  );

  /* 對應表用到時才算：不透明用 RGB 各 6 位元、半透明用 RGBA 各 6 位元一格（格中心找最近色） */
  const lutO = new Uint16Array(1 << 18).fill(0xffff);
  const lutT = new Uint16Array(1 << 24).fill(0xffff);
  return {
    colors,
    lossless: false,
    count: C + 1,
    indexOf: (v) => {
      const a8 = v >>> 24;
      if (a8 === 0) return 0;
      const r6 = (v & 255) >> 2;
      const g6 = ((v >>> 8) & 255) >> 2;
      const b6 = ((v >>> 16) & 255) >> 2;
      if (a8 === 255) {
        const key = (r6 << 12) | (g6 << 6) | b6;
        let i = lutO[key];
        if (i === 0xffff) {
          i = (findO || findAny)(r6 * 4 + 2, g6 * 4 + 2, b6 * 4 + 2, 255) + 1;
          lutO[key] = i;
        }
        return i;
      }
      const key = (r6 << 18) | (g6 << 12) | (b6 << 6) | (a8 >> 2);
      let i = lutT[key];
      if (i === 0xffff) {
        const a = (a8 & 0xfc) + 2;
        const am = a / 255;
        i = (findT || findAny)((r6 * 4 + 2) * am, (g6 * 4 + 2) * am, (b6 * 4 + 2) * am, a) + 1;
        lutT[key] = i;
      }
      return i;
    },
  };
}

/* ======================= 主成分切割（method: 'pca'） ======================= */

/** k-means 微調的次數 */
const PCA_REFINE_ITERATIONS = 6;

/**
 * 4×4 對稱矩陣的最大特徵值與對應的單位特徵向量（Jacobi 旋轉法；固定的步驟，結果決定性）。
 * 用在「一群顏色沿哪個方向最分散」：特徵值＝沿這個方向的加權平方差總和。
 */
export function principalAxis(matrix: ArrayLike<number>): { value: number; axis: number[] } {
  const a = Array.from(matrix);
  const v = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (let sweep = 0; sweep < 32; sweep++) {
    let off = 0;
    let diag = 0;
    for (let p = 0; p < 4; p++) {
      diag += a[p * 5] * a[p * 5];
      for (let q = p + 1; q < 4; q++) off += a[p * 4 + q] * a[p * 4 + q];
    }
    if (off <= diag * 1e-24 || off === 0) break;
    for (let p = 0; p < 3; p++) {
      for (let q = p + 1; q < 4; q++) {
        const apq = a[p * 4 + q];
        if (apq === 0) continue;
        const theta = (a[q * 5] - a[p * 5]) / (2 * apq);
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < 4; k++) {
          const kp = a[k * 4 + p];
          const kq = a[k * 4 + q];
          a[k * 4 + p] = c * kp - s * kq;
          a[k * 4 + q] = s * kp + c * kq;
        }
        for (let k = 0; k < 4; k++) {
          const pk = a[p * 4 + k];
          const qk = a[q * 4 + k];
          a[p * 4 + k] = c * pk - s * qk;
          a[q * 4 + k] = s * pk + c * qk;
        }
        for (let k = 0; k < 4; k++) {
          const kp = v[k * 4 + p];
          const kq = v[k * 4 + q];
          v[k * 4 + p] = c * kp - s * kq;
          v[k * 4 + q] = s * kp + c * kq;
        }
      }
    }
  }
  let best = 0;
  for (let i = 1; i < 4; i++) if (a[i * 5] > a[best * 5]) best = i;
  return { value: a[best * 5], axis: [v[best], v[4 + best], v[8 + best], v[12 + best]] };
}

/** 一群樣本（order[s..e)）的加權和：份量、一次和（4）、二次和（10，上三角） */
interface Sums {
  w: number;
  m: Float64Array;
  q: Float64Array;
}

/** 一個待切的群 */
interface Cell extends Sums {
  s: number;
  e: number;
  opaque: boolean;
  /** 沿主軸的加權平方差總和（越大越該切） */
  spread: number;
  axis: number[];
}

/** 一群顏色的最近色搜尋：沿這群顏色的主軸排序，投影差的平方已經超過目前最佳時就不必再往外找 */
function makeAxisSearcher(
  cx: Float64Array,
  cy: Float64Array,
  cz: Float64Array,
  ca: Float64Array,
  ids: number[],
): Searcher {
  const n = ids.length;
  const mean = [0, 0, 0, 0];
  for (const k of ids) {
    mean[0] += cx[k] / n;
    mean[1] += cy[k] / n;
    mean[2] += cz[k] / n;
    mean[3] += ca[k] / n;
  }
  const cov = new Float64Array(16);
  for (const k of ids) {
    const d = [cx[k] - mean[0], cy[k] - mean[1], cz[k] - mean[2], ca[k] - mean[3]];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) cov[i * 4 + j] += d[i] * d[j];
  }
  const u = principalAxis(cov).axis;
  const proj = (x: number, y: number, z: number, a: number) =>
    u[0] * x + u[1] * y + u[2] * z + u[3] * a;
  const sorted = ids
    .map((k) => ({ k, p: proj(cx[k], cy[k], cz[k], ca[k]) }))
    .sort((p, q) => p.p - q.p || p.k - q.k);
  const P = Float64Array.from(sorted, (o) => o.p);
  const K = Int32Array.from(sorted, (o) => o.k);
  return (x, y, z, a) => {
    const p = proj(x, y, z, a);
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (P[mid] < p) lo = mid + 1;
      else hi = mid;
    }
    let bi = K[Math.min(lo, n - 1)];
    let bd = Number.POSITIVE_INFINITY;
    let l = lo - 1;
    let r = lo;
    while (l >= 0 || r < n) {
      if (r < n) {
        const dp = P[r] - p;
        if (dp * dp >= bd) r = n;
        else {
          const k = K[r];
          const d = (cx[k] - x) ** 2 + (cy[k] - y) ** 2 + (cz[k] - z) ** 2 + (ca[k] - a) ** 2;
          if (d < bd || (d === bd && k < bi)) {
            bd = d;
            bi = k;
          }
          r++;
        }
      }
      if (l >= 0) {
        const dp = p - P[l];
        if (dp * dp >= bd) l = -1;
        else {
          const k = K[l];
          const d = (cx[k] - x) ** 2 + (cy[k] - y) ** 2 + (cz[k] - z) ** 2 + (ca[k] - a) ** 2;
          if (d < bd || (d === bd && k < bi)) {
            bd = d;
            bi = k;
          }
          l--;
        }
      }
    }
    return bi;
  };
}

/** 主成分切割＋k-means（見檔頭）。stats 已確定超過上限（overflow）。 */
function buildPcaPalette(stats: ColorStats, maxColors: number): Palette {
  /* ---- 樣本：每個非空的桶一筆（預乘座標的加權平均，0～255）；不透明的排在前面 ---- */
  const used: number[] = [];
  for (let k = TRANS_BUCKETS; k < BUCKETS; k++) if (stats.cnt[k] > 0) used.push(k);
  const NO = used.length;
  if (stats.translucent) for (let k = 0; k < TRANS_BUCKETS; k++) if (stats.cnt[k] > 0) used.push(k);
  const N = used.length;
  const X = new Float64Array(N * 4);
  const pw = new Float64Array(N);
  used.forEach((k, i) => {
    const n = stats.cnt[k];
    X[i * 4] = stats.sr[k] / n / 255;
    X[i * 4 + 1] = stats.sg[k] / n / 255;
    X[i * 4 + 2] = stats.sb[k] / n / 255;
    X[i * 4 + 3] = k >= TRANS_BUCKETS ? 255 : stats.sa[k] / n;
    pw[i] = n;
  });
  const order = new Int32Array(N);
  for (let i = 0; i < N; i++) order[i] = i;

  const sumsOf = (s: number, e: number): Sums => {
    const m = new Float64Array(4);
    const q = new Float64Array(10);
    let w = 0;
    for (let t = s; t < e; t++) {
      const j = order[t];
      const ww = pw[j];
      const x0 = X[j * 4];
      const x1 = X[j * 4 + 1];
      const x2 = X[j * 4 + 2];
      const x3 = X[j * 4 + 3];
      w += ww;
      m[0] += x0 * ww;
      m[1] += x1 * ww;
      m[2] += x2 * ww;
      m[3] += x3 * ww;
      q[0] += x0 * x0 * ww;
      q[1] += x0 * x1 * ww;
      q[2] += x0 * x2 * ww;
      q[3] += x0 * x3 * ww;
      q[4] += x1 * x1 * ww;
      q[5] += x1 * x2 * ww;
      q[6] += x1 * x3 * ww;
      q[7] += x2 * x2 * ww;
      q[8] += x2 * x3 * ww;
      q[9] += x3 * x3 * ww;
    }
    return { w, m, q };
  };
  const cellOf = (s: number, e: number, opaque: boolean, sums: Sums): Cell => {
    const { w, m, q } = sums;
    /* 共變異（未除以份量）：q − m mᵀ ÷ w */
    const tri = [0, 1, 2, 3, 1, 4, 5, 6, 2, 5, 7, 8, 3, 6, 8, 9];
    const cov = new Float64Array(16);
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) cov[i * 4 + j] = q[tri[i * 4 + j]] - (m[i] * m[j]) / w;
    const pa = e - s > 1 && w > 0 ? principalAxis(cov) : { value: 0, axis: [1, 0, 0, 0] };
    /* 沿主軸的變異小於 1e-4（標準差 0.01 階）就當成同一色，不再切 */
    const spread = pa.value > w * 1e-4 ? pa.value : 0;
    return { s, e, opaque, w, m, q, spread, axis: pa.axis };
  };

  const K = Math.max(1, maxColors - 1); // 0 號保留給完全透明
  const cells: Cell[] = [];
  if (NO > 0) cells.push(cellOf(0, NO, true, sumsOf(0, NO)));
  if (N > NO) cells.push(cellOf(NO, N, false, sumsOf(NO, N)));
  while (cells.length < K) {
    let bi = -1;
    let best = 0;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].spread > best) {
        best = cells[i].spread;
        bi = i;
      }
    }
    if (bi < 0) break;
    const c = cells[bi];
    const u = c.axis;
    const cut = (u[0] * c.m[0] + u[1] * c.m[1] + u[2] * c.m[2] + u[3] * c.m[3]) / c.w;
    /* 依投影分成兩半（≤ 平均值的在左） */
    let lo = c.s;
    let hi = c.e - 1;
    while (lo <= hi) {
      const j = order[lo];
      const p = u[0] * X[j * 4] + u[1] * X[j * 4 + 1] + u[2] * X[j * 4 + 2] + u[3] * X[j * 4 + 3];
      if (p <= cut) lo++;
      else {
        order[lo] = order[hi];
        order[hi] = j;
        hi--;
      }
    }
    if (lo <= c.s || lo >= c.e) {
      c.spread = 0;
      continue;
    }
    /* 小的那半重新加總，大的那半用相減（省時間） */
    const leftSmall = lo - c.s <= c.e - lo;
    const small = leftSmall ? sumsOf(c.s, lo) : sumsOf(lo, c.e);
    const rest: Sums = {
      w: c.w - small.w,
      m: c.m.map((v, i) => v - small.m[i]),
      q: c.q.map((v, i) => v - small.q[i]),
    };
    const left = cellOf(c.s, lo, c.opaque, leftSmall ? small : rest);
    const right = cellOf(lo, c.e, c.opaque, leftSmall ? rest : small);
    cells.splice(bi, 1, left, right);
  }

  const C = cells.length;
  const cx = new Float64Array(C);
  const cy = new Float64Array(C);
  const cz = new Float64Array(C);
  const ca = new Float64Array(C);
  const opq = cells.map((c) => c.opaque);
  cells.forEach((c, k) => {
    cx[k] = c.m[0] / c.w;
    cy[k] = c.m[1] / c.w;
    cz[k] = c.m[2] / c.w;
    ca[k] = c.opaque ? 255 : c.m[3] / c.w;
  });
  const opaqueIds: number[] = [];
  const transIds: number[] = [];
  for (let k = 0; k < C; k++) (opq[k] ? opaqueIds : transIds).push(k);

  /* ---- k-means 微調：不透明樣本只找不透明的顏色，半透明樣本只找半透明的顏色 ---- */
  for (let iter = 0, moved = Number.POSITIVE_INFINITY; iter < PCA_REFINE_ITERATIONS; iter++) {
    /* 上一輪每個顏色移動都不到 0.05 階就停（再算也幾乎不變） */
    if (moved < 0.0025) break;
    moved = 0;
    const findO = opaqueIds.length ? makeAxisSearcher(cx, cy, cz, ca, opaqueIds) : null;
    const findT = transIds.length ? makeAxisSearcher(cx, cy, cz, ca, transIds) : null;
    const sx = new Float64Array(C);
    const sy = new Float64Array(C);
    const sz = new Float64Array(C);
    const sa = new Float64Array(C);
    const sw = new Float64Array(C);
    for (let j = 0; j < N; j++) {
      const find = j < NO ? findO : findT;
      if (!find) continue;
      const k = find(X[j * 4], X[j * 4 + 1], X[j * 4 + 2], X[j * 4 + 3]);
      const w = pw[j];
      sx[k] += X[j * 4] * w;
      sy[k] += X[j * 4 + 1] * w;
      sz[k] += X[j * 4 + 2] * w;
      sa[k] += X[j * 4 + 3] * w;
      sw[k] += w;
    }
    for (let k = 0; k < C; k++) {
      if (!(sw[k] > 0)) continue;
      const nx = sx[k] / sw[k];
      const ny = sy[k] / sw[k];
      const nz = sz[k] / sw[k];
      const na = opq[k] ? 255 : sa[k] / sw[k];
      moved = Math.max(
        moved,
        (nx - cx[k]) ** 2 + (ny - cy[k]) ** 2 + (nz - cz[k]) ** 2 + (na - ca[k]) ** 2,
      );
      cx[k] = nx;
      cy[k] = ny;
      cz[k] = nz;
      ca[k] = na;
    }
  }

  /* ---- 轉回一般（非預乘）RGBA；對應時用「實際存進檔案的顏色」比較 ---- */
  const colors = new Uint8Array((C + 1) * 4);
  for (let k = 0; k < C; k++) {
    const a = opq[k] ? 255 : Math.max(1, Math.min(254, Math.round(ca[k])));
    const f = 255 / a;
    const r = Math.min(255, Math.round(cx[k] * f));
    const g = Math.min(255, Math.round(cy[k] * f));
    const b = Math.min(255, Math.round(cz[k] * f));
    const o = (k + 1) * 4;
    colors[o] = r;
    colors[o + 1] = g;
    colors[o + 2] = b;
    colors[o + 3] = a;
    cx[k] = (r * a) / 255;
    cy[k] = (g * a) / 255;
    cz[k] = (b * a) / 255;
    ca[k] = a;
  }
  const all = Array.from({ length: C }, (_, k) => k);
  const findAny = C ? makeAxisSearcher(cx, cy, cz, ca, all) : null;
  const findO = opaqueIds.length ? makeAxisSearcher(cx, cy, cz, ca, opaqueIds) : findAny;
  const findT = transIds.length ? makeAxisSearcher(cx, cy, cz, ca, transIds) : findAny;

  /* 每個原色只找一次最近色（記在表裡） */
  const cache = new ColorIndexCache();
  return {
    colors,
    lossless: false,
    count: C + 1,
    indexOf: (v) => {
      const a8 = v >>> 24;
      if (a8 === 0 || !findAny) return 0;
      let i = cache.get(v);
      if (i < 0) {
        const f = a8 / 255;
        const find = (a8 === 255 ? findO : findT) ?? findAny;
        i = find((v & 255) * f, ((v >>> 8) & 255) * f, ((v >>> 16) & 255) * f, a8) + 1;
        cache.set(v, i);
      }
      return i;
    },
  };
}

/** 原色（Uint32，不可為 0）→ 調色盤索引的快取：開放定址的雜湊表（逐像素查表比 Map 快很多） */
class ColorIndexCache {
  private keys = new Uint32Array(1 << 14);
  private vals = new Uint16Array(1 << 14);
  private shift = 32 - 14;
  private size = 0;

  /** 沒有時回傳 −1 */
  get(v: number): number {
    const mask = this.keys.length - 1;
    for (let h = Math.imul(v, 0x9e3779b1) >>> this.shift; ; h = (h + 1) & mask) {
      const k = this.keys[h];
      if (k === v) return this.vals[h];
      if (k === 0) return -1;
    }
  }

  set(v: number, index: number): void {
    if ((this.size + 1) * 2 > this.keys.length) this.grow();
    const mask = this.keys.length - 1;
    let h = Math.imul(v, 0x9e3779b1) >>> this.shift;
    while (this.keys[h] !== 0 && this.keys[h] !== v) h = (h + 1) & mask;
    if (this.keys[h] === 0) this.size++;
    this.keys[h] = v;
    this.vals[h] = index;
  }

  private grow(): void {
    const { keys, vals } = this;
    this.keys = new Uint32Array(keys.length * 2);
    this.vals = new Uint16Array(keys.length * 2);
    this.shift--;
    this.size = 0;
    for (let i = 0; i < keys.length; i++) if (keys[i] !== 0) this.set(keys[i], vals[i]);
  }
}
