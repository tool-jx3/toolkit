/**
 * 與 OpenCV `cv2.resize(…, interpolation=INTER_LINEAR)`（預設）相同的雙線性縮放，給「照 Python 參考做法逐值實作」的
 * 前後處理用（例如 AI 去背模型的輸入與遮罩：`core/onnx` 的模型多半是用 OpenCV 準備資料訓練的）。
 *
 * 規則（OpenCV 的 resize 一般路徑，浮點數影像）：
 * - 比例 scale ＝ 1 ÷（輸出 ÷ 來源），取樣位置 f ＝ float32((d ＋ 0.5) × scale − 0.5)（像素中心對齊），
 *   s ＝ floor(f)、權重 (1 − (f − s), f − s)，係數以 float32 計算。
 * - 橫向：s < 0 時取第 0 格、權重 (1, 0)；s ≥ 寬 − 1 時直接取最後一格。
 * - 縱向：用到的兩列各自夾在 0～高 − 1（權重不變）。
 * - 先橫向、再縱向；每一步以 float32 進位。結果與 OpenCV 的通用實作逐值相同（單元測試以 Python 產生的參考值比對）；
 *   OpenCV 開了 Intel IPP 時（x86 的 pip 套件預設）縮放走 IPP，進位不同，最多差約 4e-5。
 * - 縮小也是雙線性（不是面積平均，與 OpenCV 相同：大幅縮小時會跳過像素）。
 * - 例外：兩個方向都剛好縮小一半時，OpenCV 改走 INTER_AREA 的快速路徑（2 × 2 平均，數學上與雙線性相同，
 *   但加法的順序不同）：單通道每列前 floor(寬 ÷ 4) × 4 格是 ((a ＋ b) ＋ (c ＋ d)) × 0.25（128 位元 SIMD），
 *   其餘格與其他通道數是 (((a ＋ b) ＋ c) ＋ d) × 0.25；四通道一律是前者。這裡照做（`isHalfSize`）。
 *
 * 大圖不必先整張轉成浮點數：`resizeLinearRows` 依需要逐列讀來源（`getRow(y)`），只讀用到的列。
 */

const f32 = Math.fround;

/** 一個方向的取樣表：每個輸出位置的來源索引與兩個權重 */
export interface LinearAxis {
  /** 來源索引（第一個點） */
  index: Int32Array;
  /** 第二個點的權重（float32）；第一個點是 1 − 這個值 */
  frac: Float32Array;
  /** 第一個點的權重（float32，＝ float32(1 − frac)） */
  base: Float32Array;
  /** 這個位置只取一個點（橫向的右邊界） */
  single: Uint8Array;
}

/**
 * 算出一個方向的取樣表。
 * @param horizontal 橫向（左右邊界的處理與縱向不同，見檔頭）
 */
export function linearAxis(src: number, dst: number, horizontal: boolean): LinearAxis {
  const index = new Int32Array(dst);
  const frac = new Float32Array(dst);
  const base = new Float32Array(dst);
  const single = new Uint8Array(dst);
  /* OpenCV：inv_scale = (double)dsize / ssize、scale = 1. / inv_scale */
  const scale = 1 / (dst / src);
  for (let d = 0; d < dst; d++) {
    let f = f32((d + 0.5) * scale - 0.5);
    let s = Math.floor(f);
    f = f32(f - s);
    if (horizontal) {
      if (s < 0) {
        f = 0;
        s = 0;
      }
      if (s + 1 >= src) {
        single[d] = 1;
        if (s >= src - 1) {
          f = 0;
          s = src - 1;
        }
      }
    }
    index[d] = s;
    frac[d] = f;
    base[d] = f32(1 - f);
  }
  return { index, frac, base, single };
}

/**
 * OpenCV 的判斷：比例＝1 ÷（輸出 ÷ 來源）兩個方向都剛好是整數 2（INTER_LINEAR 改走 INTER_AREA 的快速路徑）。
 */
export function isHalfSize(sw: number, sh: number, dw: number, dh: number): boolean {
  const sx = 1 / (dw / sw);
  const sy = 1 / (dh / sh);
  const ix = Math.round(sx);
  const iy = Math.round(sy);
  return (
    ix === 2 && iy === 2 && Math.abs(sx - ix) < Number.EPSILON && Math.abs(sy - iy) < Number.EPSILON
  );
}

/** 剛好縮小一半（OpenCV 的 INTER_AREA 快速路徑，加法順序見檔頭） */
function halveRows(
  dw: number,
  dh: number,
  channels: number,
  getRow: (y: number) => ArrayLike<number>,
  out: Float32Array,
): Float32Array {
  const ch = channels;
  /* 單通道：前 floor(dw ÷ 4) × 4 格是 SIMD 的加法順序；四通道全部是 */
  const pairedPixels = ch === 4 ? dw : ch === 1 ? dw - (dw % 4) : 0;
  for (let dy = 0; dy < dh; dy++) {
    /* 兩列都要留著：getRow 可能每次回傳同一塊緩衝區，先複製第一列 */
    const r0 = Float32Array.from(getRow(2 * dy) as ArrayLike<number>);
    const r1 = getRow(2 * dy + 1);
    const o = dy * dw * ch;
    for (let dx = 0; dx < dw; dx++) {
      const paired = dx < pairedPixels;
      for (let c = 0; c < ch; c++) {
        const i = 2 * dx * ch + c;
        const a = r0[i];
        const b = r0[i + ch];
        const cc = r1[i];
        const d = r1[i + ch];
        const sum = paired ? f32(f32(a + b) + f32(cc + d)) : f32(f32(f32(a + b) + cc) + d);
        out[o + dx * ch + c] = f32(sum * 0.25);
      }
    }
  }
  return out;
}

/**
 * 逐列讀取來源的雙線性縮放。
 * @param getRow 第 y 列（長度 ≥ 來源寬 × channels，交錯排列）；同一列可能被要求不只一次（呼叫端自己決定要不要快取）
 * @returns 輸出（dw × dh × channels，交錯排列，float32）
 */
export function resizeLinearRows(
  sw: number,
  sh: number,
  channels: number,
  dw: number,
  dh: number,
  getRow: (y: number) => ArrayLike<number>,
  out: Float32Array = new Float32Array(dw * dh * channels),
): Float32Array {
  if (isHalfSize(sw, sh, dw, dh)) return halveRows(dw, dh, channels, getRow, out);
  const xs = linearAxis(sw, dw, true);
  const ys = linearAxis(sh, dh, false);
  const ch = channels;
  /* 橫向縮好的列（最多留兩列：相鄰輸出列多半共用來源列） */
  const cache = new Map<number, Float32Array>();
  const hrow = (y: number): Float32Array => {
    const hit = cache.get(y);
    if (hit) return hit;
    const s = getRow(y);
    const row = new Float32Array(dw * ch);
    for (let dx = 0; dx < dw; dx++) {
      const sx = xs.index[dx] * ch;
      const o = dx * ch;
      if (xs.single[dx]) {
        for (let c = 0; c < ch; c++) row[o + c] = s[sx + c];
      } else {
        const a0 = xs.base[dx];
        const a1 = xs.frac[dx];
        for (let c = 0; c < ch; c++)
          row[o + c] = f32(f32(s[sx + c] * a0) + f32(s[sx + ch + c] * a1));
      }
    }
    if (cache.size >= 2) cache.delete(cache.keys().next().value as number);
    cache.set(y, row);
    return row;
  };
  const clampRow = (y: number) => (y < 0 ? 0 : y >= sh ? sh - 1 : y);
  for (let dy = 0; dy < dh; dy++) {
    const sy = ys.index[dy];
    const r0 = hrow(clampRow(sy));
    const r1 = hrow(clampRow(sy + 1));
    const b0 = ys.base[dy];
    const b1 = ys.frac[dy];
    const o = dy * dw * ch;
    for (let i = 0; i < dw * ch; i++) out[o + i] = f32(f32(r0[i] * b0) + f32(r1[i] * b1));
  }
  return out;
}

/**
 * 浮點數影像（交錯排列）的雙線性縮放，同 `cv2.resize(src, (dw, dh))`。
 * 來源與輸出尺寸相同時直接複製（OpenCV 也是）。
 */
export function resizeLinear(
  src: Float32Array,
  sw: number,
  sh: number,
  channels: number,
  dw: number,
  dh: number,
): Float32Array {
  if (sw === dw && sh === dh) return src.slice(0, sw * sh * channels);
  const rowLen = sw * channels;
  return resizeLinearRows(sw, sh, channels, dw, dh, (y) =>
    src.subarray(y * rowLen, (y + 1) * rowLen),
  );
}
