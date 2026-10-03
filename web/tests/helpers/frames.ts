/** 測試用影格產生器（決定性） */

/** 透明背景上移動的半透明方塊；hold 指定哪些格要和前一格相同 */
export function movingSquare(
  W: number,
  H: number,
  n: number,
  hold: number[] = [],
): Uint8ClampedArray[] {
  const frames: Uint8ClampedArray[] = [];
  let pos = 0;
  for (let i = 0; i < n; i++) {
    if (!hold.includes(i)) pos = i;
    const f = new Uint8ClampedArray(W * H * 4);
    const s = Math.max(2, Math.floor(Math.min(W, H) / 4));
    const x0 = (pos * 3) % (W - s);
    const y0 = (pos * 2) % (H - s);
    for (let y = y0; y < y0 + s; y++) {
      for (let x = x0; x < x0 + s; x++) {
        const k = (y * W + x) * 4;
        f[k] = 200;
        f[k + 1] = 80 + (pos % 5) * 20;
        f[k + 2] = 40;
        f[k + 3] = x === x0 ? 128 : 255; // 左邊一列半透明
      }
    }
    /* 固定的角落點，確保有不會變的區域 */
    f[0] = 10;
    f[1] = 20;
    f[2] = 30;
    f[3] = 255;
    frames.push(f);
  }
  return frames;
}

/** 很多顏色的漸層（超過 256 色），用來測減色的有損路徑 */
export function gradient(W: number, H: number, phase = 0): Uint8ClampedArray {
  const f = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = (y * W + x) * 4;
      f[k] = (x * 255) / (W - 1);
      f[k + 1] = (y * 255) / (H - 1);
      f[k + 2] = (phase * 37 + x * 3 + y * 5) & 255;
      f[k + 3] = y < 2 ? 0 : y < 4 ? 100 : 255;
    }
  }
  return f;
}

/**
 * 影片風格的影格（不透明）：雜訊底＋每格往右移 2 px 的白色方塊；奇數格另有零星的閃爍點
 * （每格都只有一部分改變，範圍很大但範圍裡多半沒變）。
 */
export function videoLike(W: number, H: number, n: number): Uint8ClampedArray[] {
  const out: Uint8ClampedArray[] = [];
  for (let i = 0; i < n; i++) {
    const f = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const k = (y * W + x) * 4;
        const inBox = x >= 2 + i * 2 && x < 8 + i * 2 && y >= 3 && y < 9;
        const flicker = (x + y + i) % 7 === 0 && i % 2 === 1;
        f[k] = inBox ? 250 : (x * 13 + y * 7) & 255;
        f[k + 1] = inBox ? 250 : flicker ? 3 : (x * 5 + y * 11) & 255;
        f[k + 2] = inBox ? 250 : (x * 3 + y * 17) & 255;
        f[k + 3] = 255;
      }
    out.push(f);
  }
  return out;
}

export const copyFrames = (frames: Uint8ClampedArray[]) => frames.map((f) => f.slice());

/** 兩段位元組是否完全相同 */
export function sameBytes(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
