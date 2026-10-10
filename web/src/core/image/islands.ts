/**
 * 遮罩的分塊與去掉孤島（立繪去背工具的「去掉孤島」、「AI＋背景色」）。純函式（主執行緒、Worker、Node 都能跑）。
 *
 * ```ts
 * const out = removeIslands(mask, w, h, { minRatio: 0.01 });     // 只留比最大一塊的 1% 大的塊
 * const p = maskPieces(mask, w, h, 128);                          // 自己決定留哪幾塊
 * const keep = piecesTouching(p, ai, 255);                        // 例如：塊裡有 AI 認定是角色的像素
 * const kept = keepPieces(mask, w, h, p, keep);
 * ```
 *
 * - 塊：遮罩值 ≥ threshold（「夠不透明」）的像素，以八連通（斜的也算相連）連在一起的一群；大小＝像素數。
 *   低於門檻的淡像素（例如 AI 的淡霧、色鍵的柔邊）不算連在一起，碎塊不會被淡霧串成一大塊。
 * - 留下的塊：塊裡的像素照原值；連到它的淡像素（0 < 值 < threshold，經由淡像素八連通）也照原值（邊緣的半透明留著）；
 *   其餘一律 0。
 * - 以每一列的「區段」做聯集找根（不必每個像素一個編號），大圖也省記憶體；不遞迴。
 */
import type { Mask } from './mask';

export interface MaskPieces {
  width: number;
  height: number;
  /** 連通的門檻（≥ 這個值才算「夠不透明」） */
  threshold: number;
  /** 幾塊 */
  count: number;
  /** 每一塊的像素數 */
  sizes: Int32Array;
  /** 每一段（同一列連續夠不透明的像素）：列、起點、終點（不含）、屬於哪一塊 */
  runs: { count: number; y: Int32Array; x0: Int32Array; x1: Int32Array; piece: Int32Array };
}

/** 可以長大的 Int32Array */
class IntList {
  data = new Int32Array(1024);
  length = 0;
  push(v: number) {
    if (this.length === this.data.length) {
      const next = new Int32Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    this.data[this.length++] = v;
  }
  done() {
    return this.data.subarray(0, this.length);
  }
}

/** 遮罩裡 ≥ threshold 的像素以八連通分塊 */
export function maskPieces(
  mask: Uint8Array,
  width: number,
  height: number,
  threshold = 128,
): MaskPieces {
  const ys = new IntList();
  const x0s = new IntList();
  const x1s = new IntList();
  /* 每一列的第一段的編號（最後多一個＝總段數） */
  const rowStart = new Int32Array(height + 1);
  for (let y = 0; y < height; y++) {
    rowStart[y] = ys.length;
    const row = y * width;
    let x = 0;
    while (x < width) {
      if (mask[row + x] < threshold) {
        x++;
        continue;
      }
      const start = x;
      while (x < width && mask[row + x] >= threshold) x++;
      ys.push(y);
      x0s.push(start);
      x1s.push(x);
    }
  }
  rowStart[height] = ys.length;
  const n = ys.length;
  const y = ys.done();
  const x0 = x0s.done();
  const x1 = x1s.done();
  /* 聯集找根：上一列和這一列相鄰（八連通）的段併成一塊 */
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (i: number) => {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    while (parent[i] !== r) {
      const next = parent[i];
      parent[i] = r;
      i = next;
    }
    return r;
  };
  for (let row = 1; row < height; row++) {
    let j = rowStart[row - 1];
    const prevEnd = rowStart[row];
    for (let i = rowStart[row], end = rowStart[row + 1]; i < end; i++) {
      /* 上一列的段 [a, b) 和這一段 [x0, x1) 八連通相鄰：a ≤ x1 而且 b ≥ x0 */
      while (j < prevEnd && x1[j] < x0[i]) j++;
      for (let k = j; k < prevEnd && x0[k] <= x1[i]; k++) {
        const a = find(i);
        const b = find(k);
        if (a !== b) parent[a < b ? b : a] = a < b ? a : b;
      }
    }
  }
  const piece = new Int32Array(n);
  const idOf = new Int32Array(n).fill(-1);
  const sizes = new IntList();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let id = idOf[r];
    if (id < 0) {
      id = sizes.length;
      idOf[r] = id;
      sizes.push(0);
    }
    piece[i] = id;
    sizes.data[id] += x1[i] - x0[i];
  }
  return {
    width,
    height,
    threshold,
    count: sizes.length,
    sizes: sizes.done().slice(),
    runs: { count: n, y, x0, x1, piece },
  };
}

/** 每一塊裡有沒有 values ≥ min 的像素（1＝有） */
export function piecesTouching(
  pieces: MaskPieces,
  values: ArrayLike<number>,
  min = 1,
): Uint8Array<ArrayBuffer> {
  const hit = new Uint8Array(pieces.count);
  const { y, x0, x1, piece, count } = pieces.runs;
  for (let r = 0; r < count; r++) {
    const id = piece[r];
    if (hit[id]) continue;
    const row = y[r] * pieces.width;
    for (let i = row + x0[r], end = row + x1[r]; i < end; i++) {
      if (values[i] >= min) {
        hit[id] = 1;
        break;
      }
    }
  }
  return hit;
}

/**
 * 只留 keep[塊] 為真的塊：塊裡的像素照原值；連到這些塊的淡像素（0 < 值 < threshold，經由淡像素八連通）照原值；
 * 其餘（沒留的塊、沒連到的淡像素）一律 0。回傳新的遮罩。
 */
export function keepPieces(
  mask: Uint8Array,
  width: number,
  height: number,
  pieces: MaskPieces,
  keep: ArrayLike<number | boolean>,
): Mask {
  const out = new Uint8Array(width * height) as Mask;
  const t = pieces.threshold;
  const { y, x0, x1, piece, count } = pieces.runs;
  let weak = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] > 0 && mask[i] < t) weak++;
  const queue = new Int32Array(weak);
  let tail = 0;
  const visit = (xx: number, yy: number) => {
    if (xx < 0 || yy < 0 || xx >= width || yy >= height) return;
    const j = yy * width + xx;
    const m = mask[j];
    if (m === 0 || m >= t || out[j]) return;
    out[j] = m;
    queue[tail++] = j;
  };
  for (let r = 0; r < count; r++) {
    if (!keep[piece[r]]) continue;
    const yy = y[r];
    const row = yy * width;
    out.set(mask.subarray(row + x0[r], row + x1[r]), row + x0[r]);
    if (!weak) continue;
    /* 這一段四周（上下兩列、左右兩端）的淡像素 */
    for (let xx = x0[r] - 1; xx <= x1[r]; xx++) {
      visit(xx, yy - 1);
      visit(xx, yy + 1);
    }
    visit(x0[r] - 1, yy);
    visit(x1[r], yy);
  }
  for (let head = 0; head < tail; head++) {
    const j = queue[head];
    const xx = j % width;
    const yy = (j - xx) / width;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) if (dx || dy) visit(xx + dx, yy + dy);
    }
  }
  return out;
}

export interface IslandOptions {
  /** 留比最大一塊的這個比例（0～1）大的塊（0＝全部留著，只去掉沒連到任何塊的淡像素） */
  minRatio: number;
  /** 連通的門檻（預設 128：至少一半不透明才算連在一起） */
  threshold?: number;
}

/**
 * 去掉孤島：只留比最大一塊的 minRatio 倍大（或一樣大）的塊與連到它們的淡邊，其餘變 0。
 * 兩個角色、和角色分開的道具只要夠大就留得住；背景剩下的碎塊、點點去掉。回傳新的遮罩。
 */
export function removeIslands(
  mask: Uint8Array,
  width: number,
  height: number,
  { minRatio, threshold = 128 }: IslandOptions,
): Mask {
  const p = maskPieces(mask, width, height, threshold);
  let largest = 0;
  for (const s of p.sizes) if (s > largest) largest = s;
  /* 比例 × 最大的像素數（去掉浮點數的尾數，例如 0.02 × 50） */
  const min = Math.max(0, minRatio) * largest - 1e-9;
  const keep = new Uint8Array(p.count);
  for (let k = 0; k < p.count; k++) keep[k] = p.sizes[k] >= min ? 1 : 0;
  return keepPieces(mask, width, height, p, keep);
}
