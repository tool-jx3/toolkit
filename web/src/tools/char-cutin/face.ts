/**
 * 臉的自動對準（規格 3.4）：讀進立繪時估計眼睛的高度、臉的橫向位置與臉的基準長度。
 *
 * 做法（看不透明的輪廓，不認臉）：
 * 1. 從最上面一列有不透明像素（透明度 > 40）的地方算起，往下看圖高 70% 的範圍，量每一列的左右界。
 * 2. 找脖子：一列一列往下記住目前最寬的寬度；第一次窄到最寬的 82% 以下時，從那裡往下找最窄的一列，
 *    直到又變寬到最窄的 1.35 倍為止——最窄的那一列就是脖子。
 * 3. 有脖子而且頭頂到脖子超過圖高的 4%：眼睛＝頭頂往下（頭頂到脖子）× 0.68，基準長度＝（頭頂到脖子）× 2.3。
 *    沒有：圖比 1 : 1.9 還細長（全身圖）時眼睛＝頭頂往下圖高的 10%、基準長度＝（眼睛 − 頭頂）÷ 0.3；
 *    否則眼睛＝頭頂往下（圖高 − 頭頂）× 0.45、基準長度＝圖高。
 * 4. 橫向位置＝眼睛上下（眼睛 − 頭頂）× 0.35 以內、有不透明像素的列的左右界中點的平均；沒有就是 50%。
 * 5. 基準長度至少是圖高的 10%。整張透明時：眼睛 25%、橫向 50%、基準長度＝圖高。
 *
 * 只吃像素（RGBA）與寬高，方便單元測試；瀏覽器裡先把立繪縮到寬約 240 px 再交給 `guessFace`（`faceOfBitmap`）。
 * 頭部中心的找法和立繪裁切器（ccfolia-cropper 的 measureFigure）不同：那邊只要頭的左右中點，這裡還要眼睛的高度與臉的大小。
 */
import { makeCanvas } from '@/core/image';

export interface FaceGuess {
  /** 眼睛的高度（圖高的 %，一位小數） */
  eyeY: number;
  /** 臉的橫向位置（圖寬的 %，一位小數） */
  eyeX: number;
  /** 臉的基準長度（圖高的比例） */
  headLen: number;
}

export interface AlphaSource {
  width: number;
  height: number;
  /** RGBA（每像素 4 位元組） */
  data: ArrayLike<number>;
}

/** 透明度大於這個值才算輪廓 */
export const SOLID_ALPHA = 40;
/** 往下看多少（圖高的比例） */
const SCAN_DEPTH = 0.7;
/** 窄到最寬的這個比例以下＝開始收窄 */
const NARROW_RATIO = 0.82;
/** 又寬到最窄的這個倍數＝脖子結束 */
const WIDEN_RATIO = 1.35;
/** 頭頂到脖子至少要圖高的這個比例才算數 */
const MIN_HEAD = 0.04;
/** 頭頂到脖子 × 這個比例＝眼睛 */
const EYE_IN_HEAD = 0.68;
/** 頭頂到脖子 × 這個倍數＝基準長度 */
const HEAD_TO_LEN = 2.3;
/** 細長的全身圖（高 ÷ 寬超過這個值） */
const TALL_RATIO = 1.9;

interface Span {
  y: number;
  /** 左右界的寬度（沒有不透明像素時 0） */
  width: number;
  /** 左右界的中點（沒有時是圖的中央） */
  mid: number;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

function solidAt(src: AlphaSource, x: number, y: number): boolean {
  return src.data[(y * src.width + x) * 4 + 3] > SOLID_ALPHA;
}

/** 最上面一列有輪廓的列（沒有時 -1） */
function topRow(src: AlphaSource): number {
  for (let y = 0; y < src.height; y++)
    for (let x = 0; x < src.width; x++) if (solidAt(src, x, y)) return y;
  return -1;
}

/** from（含）到 to（不含）每一列的左右界 */
function spans(src: AlphaSource, from: number, to: number): Span[] {
  const out: Span[] = [];
  for (let y = from; y < to; y++) {
    let left = -1;
    let right = -1;
    for (let x = 0; x < src.width; x++) {
      if (!solidAt(src, x, y)) continue;
      if (left < 0) left = x;
      right = x;
    }
    out.push(
      left < 0
        ? { y, width: 0, mid: src.width / 2 }
        : { y, width: right - left, mid: (left + right) / 2 },
    );
  }
  return out;
}

/** 脖子的那一列（找不到時 null） */
export function neckOf(rows: readonly { y: number; width: number }[]): number | null {
  let widest = 0;
  let start = -1;
  for (const [i, r] of rows.entries()) {
    if (r.width > widest) widest = r.width;
    else if (widest > 0 && r.width < widest * NARROW_RATIO) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;
  /* 從開始收窄的地方往下：記住最窄的一列，又變寬到 1.35 倍就停 */
  let best = rows[start];
  for (const r of rows.slice(start)) {
    if (r.width < best.width) best = r;
    if (r.width > best.width * WIDEN_RATIO) break;
  }
  return best.y;
}

/** 從像素估計臉的位置與大小 */
export function guessFace(src: AlphaSource): FaceGuess {
  const { width: w, height: h } = src;
  const top = topRow(src);
  if (top < 0 || w < 1 || h < 1) return { eyeY: 25, eyeX: 50, headLen: 1 };
  const rows = spans(src, top, Math.min(h, Math.ceil(top + h * SCAN_DEPTH)));
  const neck = neckOf(rows);
  let eye: number;
  let len: number;
  if (neck !== null && neck - top > h * MIN_HEAD) {
    eye = top + (neck - top) * EYE_IN_HEAD;
    len = (neck - top) * HEAD_TO_LEN;
  } else if (h / w > TALL_RATIO) {
    eye = top + h * 0.1;
    len = (eye - top) / 0.3;
  } else {
    eye = top + (h - top) * 0.45;
    len = h;
  }
  const band = (eye - top) * 0.35;
  let sum = 0;
  let count = 0;
  for (const r of rows)
    if (r.width > 0 && Math.abs(r.y - eye) < band) {
      sum += r.mid;
      count++;
    }
  const mid = count ? sum / count : w / 2;
  return {
    eyeY: round1((eye / h) * 100),
    eyeX: round1((mid / w) * 100),
    headLen: Math.max(h * 0.1, len) / h,
  };
}

/** 分析用的寬度（立繪先縮到這麼寬；高度等比，至少 1 px） */
export const FACE_GRID_WIDTH = 240;

/** 瀏覽器裡：縮小後讀像素再估計 */
export function faceOfBitmap(
  img: CanvasImageSource & { width: number; height: number },
): FaceGuess {
  const gw = Math.max(1, Math.min(FACE_GRID_WIDTH, img.width));
  const gh = Math.max(1, Math.round((img.height * gw) / img.width));
  const c = makeCanvas(gw, gh);
  const ctx = c.getContext('2d', { willReadFrequently: true }) as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) return { eyeY: 25, eyeX: 50, headLen: 1 };
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, gw, gh);
  const data = ctx.getImageData(0, 0, gw, gh).data;
  return guessFace({ width: gw, height: gh, data });
}
