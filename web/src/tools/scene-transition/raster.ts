/**
 * 剪影轉場用的點陣化（純函式，不依賴 canvas）：多邊形 → 每個像素的覆蓋率（0～1，反鋸齒），與覆蓋率的模糊。
 * 不用瀏覽器的 canvas，所以每個瀏覽器、Node（單元測試）畫出來都逐位元組相同。
 *
 * 反鋸齒：每一列取 4 條次掃描線，每條在水平方向精確算出跨過每個像素的長度（4 × 精確水平）。
 * 多邊形不能自己交叉（剪影的外形都是簡單多邊形），內外用奇偶規則。
 */

/** 每一列算好的覆蓋率交給 sink：x 在 [x0, x1) 的 row[x]（0～1）；sink 回傳後這一段會被清成 0 */
export type RowSink = (y: number, x0: number, x1: number, row: Float32Array) => void;

/** 點陣化用的暫存（同一個尺寸重複使用，不必每次配置） */
export class Rasterizer {
  readonly width: number;
  readonly height: number;
  private readonly row: Float32Array;
  private xs = new Float64Array(16);
  /* 邊：上端 y、下端 y、上端的 x、斜率（dx／dy）；依上端排序的索引；目前跨過掃描線的邊 */
  private top = new Float64Array(64);
  private bottom = new Float64Array(64);
  private x0 = new Float64Array(64);
  private slope = new Float64Array(64);
  private order = new Int32Array(64);
  private active = new Int32Array(64);

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.row = new Float32Array(width + 1);
  }

  private ensure(n: number): void {
    if (this.top.length >= n) return;
    const m = Math.max(n, this.top.length * 2);
    this.top = new Float64Array(m);
    this.bottom = new Float64Array(m);
    this.x0 = new Float64Array(m);
    this.slope = new Float64Array(m);
    this.order = new Int32Array(m);
    this.active = new Int32Array(m);
  }

  /**
   * 填一個多邊形（pts：x0, y0, x1, y1, …，像素座標；n：點數）。
   * 只處理畫面內的列與欄；整個在畫面外時什麼都不做。
   */
  fill(pts: Float64Array, n: number, sink: RowSink): void {
    const W = this.width;
    const H = this.height;
    if (n < 3) return;
    let minY = Infinity;
    let maxY = -Infinity;
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = pts[i * 2];
      const y = pts[i * 2 + 1];
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    if (maxX <= 0 || minX >= W || maxY <= 0 || minY >= H) return;
    /* 邊表（水平的邊不會和掃描線相交，略過） */
    this.ensure(n);
    const { top, bottom, x0, slope, order, active } = this;
    let m = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ax = pts[j * 2];
      const ay = pts[j * 2 + 1];
      const bx = pts[i * 2];
      const by = pts[i * 2 + 1];
      if (ay === by) continue;
      const up = ay < by;
      top[m] = up ? ay : by;
      bottom[m] = up ? by : ay;
      x0[m] = up ? ax : bx;
      slope[m] = (bx - ax) / (by - ay);
      /* 依上端插入排序 */
      let k = m - 1;
      while (k >= 0 && top[order[k]] > top[m]) {
        order[k + 1] = order[k];
        k--;
      }
      order[k + 1] = m;
      m++;
    }
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(H - 1, Math.floor(maxY));
    const row = this.row;
    let next = 0;
    let na = 0;
    for (let y = y0; y <= y1; y++) {
      let lo = W;
      let hi = -1;
      for (let s = 0; s < 4; s++) {
        const ys = y + (s + 0.5) / 4;
        /* 邊跨過 ys 的條件：上端 ≤ ys < 下端 */
        while (next < m && top[order[next]] <= ys) active[na++] = order[next++];
        let k = 0;
        for (let i = 0; i < na; ) {
          const e = active[i];
          if (bottom[e] <= ys) {
            active[i] = active[--na];
            continue;
          }
          if (k === this.xs.length) {
            const grown = new Float64Array(k * 2);
            grown.set(this.xs);
            this.xs = grown;
          }
          this.xs[k++] = x0[e] + (ys - top[e]) * slope[e];
          i++;
        }
        if (k < 2) continue;
        const xs = this.xs;
        /* 交點很少（通常 2～6 個）：插入排序 */
        for (let i = 1; i < k; i++) {
          const v = xs[i];
          let j = i - 1;
          while (j >= 0 && xs[j] > v) {
            xs[j + 1] = xs[j];
            j--;
          }
          xs[j + 1] = v;
        }
        for (let i = 0; i + 1 < k; i += 2) {
          const a = xs[i] < 0 ? 0 : xs[i] > W ? W : xs[i];
          const b = xs[i + 1] < 0 ? 0 : xs[i + 1] > W ? W : xs[i + 1];
          if (b <= a) continue;
          const ia = Math.floor(a);
          const ib = Math.floor(b);
          if (ia === ib) row[ia] += 0.25 * (b - a);
          else {
            row[ia] += 0.25 * (ia + 1 - a);
            for (let x = ia + 1; x < ib; x++) row[x] += 0.25;
            if (ib < W) row[ib] += 0.25 * (b - ib);
          }
          if (ia < lo) lo = ia;
          const last = ib < W ? ib : W - 1;
          if (last > hi) hi = last;
        }
      }
      if (hi < lo) continue;
      sink(y, lo, hi + 1, row);
      row.fill(0, lo, hi + 1);
    }
  }
}

/**
 * 覆蓋率的模糊（邊緣柔和度）：水平、垂直各做兩次半徑 r 的方框模糊（近似高斯，邊緣以最外一圈延伸，
 * 所以整片蓋滿的地方模糊後仍然是 1）。r < 1 時不動。
 */
export function blurCoverage(buf: Float32Array, W: number, H: number, r: number): void {
  const R = Math.floor(r);
  if (R < 1) return;
  const tmp = new Float32Array(Math.max(W, H));
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < H; y++) boxLine(buf, y * W, 1, W, R, tmp);
    for (let x = 0; x < W; x++) boxLine(buf, x, W, H, R, tmp);
  }
}

/** 一條線（起點 o、間隔 step、長度 n）的方框模糊，邊緣延伸 */
function boxLine(
  buf: Float32Array,
  o: number,
  step: number,
  n: number,
  r: number,
  tmp: Float32Array,
) {
  for (let i = 0; i < n; i++) tmp[i] = buf[o + i * step];
  const at = (i: number) => tmp[i < 0 ? 0 : i >= n ? n - 1 : i];
  let sum = 0;
  for (let i = -r; i <= r; i++) sum += at(i);
  const k = 1 / (2 * r + 1);
  for (let i = 0; i < n; i++) {
    buf[o + i * step] = sum * k;
    sum += at(i + r + 1) - at(i - r);
  }
}
