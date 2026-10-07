/**
 * AI 去背的前後處理：照 SkyTNT/anime-segmentation `inference.py` 的 `get_mask()`（commit 55d8740）逐值實作。
 *
 * 前處理（`toModelInput`）：
 * 1. RGB 每個值 ÷ 255 轉成 float32（不減平均、不除標準差；原圖的透明度不看，同 cv2.imread 的 IMREAD_COLOR）。
 * 2. 等比縮放：長邊＝s，短邊＝int(s × 短邊 ÷ 長邊)（無條件捨去；高 > 寬時高是長邊，其餘寬是長邊）；
 *    縮放用 OpenCV INTER_LINEAR（`core/image` 的 `resizeLinearRows`）。
 * 3. 放進 s × s 的全 0 畫布：上方留 (s − h) // 2、左方留 (s − w) // 2。
 * 4. HWC → CHW，加上批次維度：[1, 3, s, s]。
 *
 * 後處理（`fromModelOutput`）：模型輸出 [1, 1, s, s]（已經過 sigmoid，0～1）→ 裁掉補的邊（同上的位置與大小）→
 * INTER_LINEAR 縮回原圖尺寸 → 0～1 的浮點數遮罩。
 *
 * 唯一的差異：原作在極端長寬比（短邊算出來是 0）時會出錯；新版短邊至少 1 px。
 */
import { resizeLinear, resizeLinearRows } from '@/core/image/resample';

/** 官方 isnetis.onnx 的輸入尺寸（模型的形狀固定是 [1, 3, 1024, 1024]，不能改） */
export const MODEL_SIZE = 1024;
/** 模型的輸入、輸出名稱（讀模型檔確認：img → mask） */
export const MODEL_INPUT = 'img';
export const MODEL_OUTPUT = 'mask';

export interface Letterbox {
  /** 推論尺寸 */
  s: number;
  /** 原圖尺寸 */
  w0: number;
  h0: number;
  /** 縮放後的尺寸 */
  w: number;
  h: number;
  /** 補邊後在 s × s 裡的左上角：pw // 2、ph // 2 */
  left: number;
  top: number;
}

/** 等比縮放與補邊的位置（get_mask 的 h, w, ph, pw） */
export function letterbox(w0: number, h0: number, s = MODEL_SIZE): Letterbox {
  let h: number;
  let w: number;
  if (h0 > w0) {
    h = s;
    w = Math.trunc((s * w0) / h0);
  } else {
    h = Math.trunc((s * h0) / w0);
    w = s;
  }
  h = Math.max(1, h);
  w = Math.max(1, w);
  return { s, w0, h0, w, h, left: Math.floor((s - w) / 2), top: Math.floor((s - h) / 2) };
}

/**
 * 原圖（RGBA，交錯排列）→ 模型輸入（float32，[1, 3, s, s] 攤平）。
 * 大圖不會整張轉成浮點數：只讀縮放用到的列。
 */
export function toModelInput(
  rgba: Uint8Array | Uint8ClampedArray,
  w0: number,
  h0: number,
  s = MODEL_SIZE,
): { tensor: Float32Array; box: Letterbox } {
  const box = letterbox(w0, h0, s);
  const { w, h, left, top } = box;
  const row = new Float32Array(w0 * 3);
  const getRow = (y: number) => {
    const o = y * w0 * 4;
    for (let x = 0, p = o, q = 0; x < w0; x++, p += 4, q += 3) {
      row[q] = Math.fround(rgba[p] / 255);
      row[q + 1] = Math.fround(rgba[p + 1] / 255);
      row[q + 2] = Math.fround(rgba[p + 2] / 255);
    }
    /* resizeLinearRows 會留住同一列的結果，這裡每次都回傳新的複本 */
    return row.slice();
  };
  let hwc: Float32Array;
  if (w === w0 && h === h0) {
    /* 尺寸相同時 OpenCV 直接複製 */
    hwc = new Float32Array(w * h * 3);
    for (let y = 0; y < h; y++) hwc.set(getRow(y), y * w * 3);
  } else {
    hwc = resizeLinearRows(w0, h0, 3, w, h, getRow);
  }
  const plane = s * s;
  const tensor = new Float32Array(3 * plane);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const q = (y * w + x) * 3;
      const o = (y + top) * s + x + left;
      tensor[o] = hwc[q];
      tensor[plane + o] = hwc[q + 1];
      tensor[2 * plane + o] = hwc[q + 2];
    }
  }
  return { tensor, box };
}

/** 模型輸出（[1, 1, s, s] 攤平）→ 原圖尺寸的 0～1 遮罩 */
export function fromModelOutput(pred: Float32Array, box: Letterbox): Float32Array {
  const { s, w, h, w0, h0, left, top } = box;
  const crop = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    crop.set(pred.subarray((y + top) * s + left, (y + top) * s + left + w), y * w);
  }
  return resizeLinear(crop, w, h, 1, w0, h0);
}
