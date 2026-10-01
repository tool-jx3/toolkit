/* 文字演出產生器：減色（最多 256 色，含半透明）
 *
 * 1. 所有影格實際用到的顏色（含半透明）在 256 色以內 → 直接用原色當調色盤，完全無損。
 * 2. 超過時：在「預乘 alpha」的 RGBA 空間做加權中位切割，再用 k-means 微調。
 *    - 完全不透明的顏色與半透明的顏色分成兩群，各自分箱、各自對應：
 *      不透明的字身永遠對應到不透明的顏色，不會變成「有點透明」。
 *    - 預乘之後，幾乎透明的邊緣像素顏色誤差權重自然變小，顏色預算集中在看得到的地方。
 *    - 不抖色（dithering），避免雜點與檔案變大。
 *
 * 統計用固定大小的陣列分桶（半透明：RGBA 各 5 位元；不透明：RGB 各 5 位元），
 * 桶內記加權總和，不管畫面有幾十萬色都一樣快。 */

const TRANS_BUCKETS = 1 << 20;
const BUCKETS = TRANS_BUCKETS + (1 << 15);
const rgb5 = v => (((v & 255) >> 3) << 10) | ((((v >>> 8) & 255) >> 3) << 5) | (((v >>> 16) & 255) >> 3);

export class ColorStats {
  constructor() {
    this.exact = new Map();   // 256 色以內時記下每個原色
    this.overflow = false;
    this.cnt = new Float64Array(BUCKETS);
    this.sr = new Float64Array(BUCKETS);
    this.sg = new Float64Array(BUCKETS);
    this.sb = new Float64Array(BUCKETS);
    this.sa = new Float64Array(BUCKETS);
  }
  /* 一段像素：連續相同的值一次累加。weight：這段畫面的份量（停留越久越重要） */
  add(u32, start, end, weight = 1) {
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
        if (this.exact.size > 256) this.overflow = true;
      }
      if (a === 0) continue;
      const k = a === 255 ? TRANS_BUCKETS + rgb5(v) : (rgb5(v) << 5) | (a >> 3);
      const w = n * a; // 預乘
      this.cnt[k] += n;
      this.sr[k] += (v & 255) * w;
      this.sg[k] += ((v >>> 8) & 255) * w;
      this.sb[k] += ((v >>> 16) & 255) * w;
      this.sa[k] += a * n;
    }
  }
  addRect(u32, width, x0, y0, x1, y1) {
    for (let y = y0; y < y1; y++) this.add(u32, y * width + x0, y * width + x1);
  }
  get size() { return this.overflow ? Infinity : this.exact.size; }
}

/* 一群顏色（不透明或半透明）的最近色搜尋：依 alpha 排序後從最接近的往兩邊找 */
function makeSearcher(cx, cy, cz, ca, ids) {
  const sorted = ids.slice().sort((p, q) => ca[p] - ca[q]);
  const C = sorted.length;
  return (x, y, z, a) => {
    let lo = 0, hi = C - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (ca[sorted[mid]] < a) lo = mid + 1; else hi = mid; }
    let bi = sorted[lo], bd = Infinity;
    const test = k => {
      let d = (ca[k] - a) ** 2;
      if (d >= bd) return;
      d += (cx[k] - x) ** 2; if (d >= bd) return;
      d += (cy[k] - y) ** 2; if (d >= bd) return;
      d += (cz[k] - z) ** 2;
      if (d < bd) { bd = d; bi = k; }
    };
    let l = lo - 1, r = lo, goL = true, goR = true;
    while (goL || goR) {
      if (goR) { if (r < C) { const k = sorted[r]; if ((ca[k] - a) ** 2 >= bd) goR = false; else test(k); r++; } else goR = false; }
      if (goL) { if (l >= 0) { const k = sorted[l]; if ((ca[k] - a) ** 2 >= bd) goL = false; else test(k); l--; } else goL = false; }
    }
    return bi;
  };
}

/* 回傳 { colors: Uint8Array(n*4)（RGBA）, lossless, count, indexOf(u32) } */
export function buildPalette(stats, maxColors = 256) {
  if (!stats.overflow) {
    const keys = [...stats.exact.keys()].sort((a, b) => (a === 0 ? -1 : b === 0 ? 1 : a - b));
    if (!keys.length) keys.push(0);
    const colors = new Uint8Array(keys.length * 4);
    const lut = new Map();
    keys.forEach((k, i) => {
      colors[i * 4] = k & 255; colors[i * 4 + 1] = (k >>> 8) & 255; colors[i * 4 + 2] = (k >>> 16) & 255; colors[i * 4 + 3] = k >>> 24;
      lut.set(k, i);
    });
    return {
      colors, lossless: true, count: keys.length,
      indexOf: v => { if ((v >>> 24) === 0) v = 0; const i = lut.get(v); return i === undefined ? 0 : i; }
    };
  }

  /* ---- 樣本：每個非空的桶一筆（預乘座標的加權平均）；不透明的排在前面 ---- */
  let N = 0, NO = 0;
  for (let k = 0; k < BUCKETS; k++) if (stats.cnt[k] > 0) { N++; if (k >= TRANS_BUCKETS) NO++; }
  const px = new Float32Array(N), py = new Float32Array(N), pz = new Float32Array(N), pa = new Float32Array(N), pw = new Float64Array(N);
  {
    let io = 0, it = NO;
    for (let k = 0; k < BUCKETS; k++) {
      const n = stats.cnt[k];
      if (!(n > 0)) continue;
      const i = k >= TRANS_BUCKETS ? io++ : it++;
      px[i] = stats.sr[k] / n / 255; py[i] = stats.sg[k] / n / 255; pz[i] = stats.sb[k] / n / 255;
      pa[i] = k >= TRANS_BUCKETS ? 255 : stats.sa[k] / n; pw[i] = n;
    }
  }

  const K = maxColors - 1; // 0 號保留給完全透明
  const axes = [px, py, pz, pa];
  const order = new Int32Array(N);
  for (let i = 0; i < N; i++) order[i] = i;
  const stat = (s, e, opaque) => {
    let w = 0; const m = [0, 0, 0, 0], q = [0, 0, 0, 0];
    for (let i = s; i < e; i++) {
      const j = order[i], ww = pw[j];
      w += ww;
      for (let a = 0; a < 4; a++) { const v = axes[a][j]; m[a] += v * ww; q[a] += v * v * ww; }
    }
    const varr = m.map((mm, a) => (w > 0 ? q[a] - mm * mm / w : 0));
    return { s, e, w, sse: varr[0] + varr[1] + varr[2] + varr[3], varr, opaque };
  };
  /* 兩群各自一個起始箱，之後所有箱子一起依誤差大小輪流切，箱子不會跨群 */
  const boxes = [];
  if (NO > 0) boxes.push(stat(0, NO, true));
  if (N - NO > 0) boxes.push(stat(NO, N, false));
  while (boxes.length < K) {
    let bi = -1, best = 0;
    for (let i = 0; i < boxes.length; i++) if (boxes[i].e - boxes[i].s > 1 && boxes[i].sse > best) { best = boxes[i].sse; bi = i; }
    if (bi < 0) break;
    const bx = boxes[bi];
    let ax = 0;
    for (let a = 1; a < 4; a++) if (bx.varr[a] > bx.varr[ax]) ax = a;
    const arr = axes[ax];
    order.subarray(bx.s, bx.e).sort((p, q) => arr[p] - arr[q]);
    let acc = 0, cut = bx.s + 1;
    const half = bx.w / 2;
    for (let i = bx.s; i < bx.e - 1; i++) { acc += pw[order[i]]; if (acc >= half) { cut = i + 1; break; } }
    cut = Math.min(bx.e - 1, Math.max(bx.s + 1, cut));
    boxes.splice(bi, 1, stat(bx.s, cut, bx.opaque), stat(cut, bx.e, bx.opaque));
  }

  const C = boxes.length;
  const cx = new Float64Array(C), cy = new Float64Array(C), cz = new Float64Array(C), ca = new Float64Array(C);
  const opq = boxes.map(b => b.opaque);
  boxes.forEach((b, k) => {
    let sw = 0;
    for (let i = b.s; i < b.e; i++) {
      const j = order[i], w = pw[j];
      cx[k] += px[j] * w; cy[k] += py[j] * w; cz[k] += pz[j] * w; ca[k] += pa[j] * w; sw += w;
    }
    cx[k] /= sw; cy[k] /= sw; cz[k] /= sw; ca[k] /= sw;
    if (b.opaque) ca[k] = 255;
  });
  const opaqueIds = [], transIds = [];
  for (let k = 0; k < C; k++) (opq[k] ? opaqueIds : transIds).push(k);

  /* k-means 微調：不透明樣本只找不透明的顏色，半透明樣本只找半透明的顏色 */
  for (let iter = 0; iter < 4; iter++) {
    const findO = opaqueIds.length ? makeSearcher(cx, cy, cz, ca, opaqueIds) : null;
    const findT = transIds.length ? makeSearcher(cx, cy, cz, ca, transIds) : null;
    const sx = new Float64Array(C), sy = new Float64Array(C), sz = new Float64Array(C), sa = new Float64Array(C), sw = new Float64Array(C);
    for (let j = 0; j < N; j++) {
      const find = j < NO ? findO : findT;
      if (!find) continue;
      const k = find(px[j], py[j], pz[j], pa[j]);
      const w = pw[j];
      sx[k] += px[j] * w; sy[k] += py[j] * w; sz[k] += pz[j] * w; sa[k] += pa[j] * w; sw[k] += w;
    }
    for (let k = 0; k < C; k++) {
      if (!(sw[k] > 0)) continue;
      cx[k] = sx[k] / sw[k]; cy[k] = sy[k] / sw[k]; cz[k] = sz[k] / sw[k];
      ca[k] = opq[k] ? 255 : sa[k] / sw[k];
    }
  }

  /* 轉回一般（非預乘）RGBA；對應時用「實際存進檔案的顏色」比較 */
  const colors = new Uint8Array((C + 1) * 4);
  for (let k = 0; k < C; k++) {
    const a = opq[k] ? 255 : Math.max(1, Math.min(254, Math.round(ca[k])));
    const f = 255 / a;
    const r = Math.min(255, Math.round(cx[k] * f)), g = Math.min(255, Math.round(cy[k] * f)), b = Math.min(255, Math.round(cz[k] * f));
    const o = (k + 1) * 4;
    colors[o] = r; colors[o + 1] = g; colors[o + 2] = b; colors[o + 3] = a;
    cx[k] = r * a / 255; cy[k] = g * a / 255; cz[k] = b * a / 255; ca[k] = a;
  }
  const findO = opaqueIds.length ? makeSearcher(cx, cy, cz, ca, opaqueIds) : null;
  const findT = transIds.length ? makeSearcher(cx, cy, cz, ca, transIds) : null;
  const findAny = makeSearcher(cx, cy, cz, ca, Array.from({ length: C }, (_, k) => k));

  /* 對應表用到時才算：不透明用 RGB 各 6 位元、半透明用 RGBA 各 6 位元一格（格中心找最近色） */
  const lutO = new Uint16Array(1 << 18).fill(0xffff);
  const lutT = new Uint16Array(1 << 24).fill(0xffff);
  return {
    colors, lossless: false, count: C + 1,
    indexOf: v => {
      const a8 = v >>> 24;
      if (a8 === 0) return 0;
      const r6 = (v & 255) >> 2, g6 = ((v >>> 8) & 255) >> 2, b6 = ((v >>> 16) & 255) >> 2;
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
        const a = (a8 & 0xfc) + 2, am = a / 255;
        i = (findT || findAny)((r6 * 4 + 2) * am, (g6 * 4 + 2) * am, (b6 * 4 + 2) * am, a) + 1;
        lutT[key] = i;
      }
      return i;
    }
  };
}
