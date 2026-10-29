/**
 * QR code 規格（ISO/IEC 18004）的固定表：每個版本、錯誤更正等級的區塊數與每塊的錯誤更正碼字數，
 * 對位圖案的位置、功能圖案（尋像、時序、對位、格式與版本資訊）的範圍。解碼（`decode.ts`）用。
 */
import type { QrEcl } from './encode';

/** 每塊的錯誤更正碼字數（版本 1～40） */
const ECC_PER_BLOCK: Record<QrEcl, readonly number[]> = {
  L: [
    7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30,
    26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
  M: [
    10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28,
    28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
  ],
  Q: [
    13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30,
    30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
  H: [
    17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30,
    30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
};

/** 區塊數（版本 1～40） */
const BLOCKS: Record<QrEcl, readonly number[]> = {
  L: [
    1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15,
    16, 17, 18, 19, 19, 20, 21, 22, 24, 25,
  ],
  M: [
    1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25,
    26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
  ],
  Q: [
    1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34,
    35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68,
  ],
  H: [
    1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37,
    40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81,
  ],
};

/** 格式資訊裡的錯誤更正等級（2 位元） */
export const ECL_BITS: Record<QrEcl, number> = { L: 1, M: 0, Q: 3, H: 2 };
export const ECL_FROM_BITS: readonly QrEcl[] = ['M', 'L', 'H', 'Q'];

export const qrSizeOf = (version: number): number => version * 4 + 17;

/** 對位圖案的中心座標（列與行共用；版本 1 沒有） */
export function alignmentPositions(version: number): number[] {
  if (version <= 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2;
  const out = [6];
  for (let pos = qrSizeOf(version) - 7; out.length < count; pos -= step) out.splice(1, 0, pos);
  return out;
}

/** 功能圖案（不放資料的格）：1＝功能圖案 */
export function functionMask(version: number): Uint8Array {
  const size = qrSizeOf(version);
  const m = new Uint8Array(size * size);
  const set = (r: number, c: number) => {
    if (r >= 0 && c >= 0 && r < size && c < size) m[r * size + c] = 1;
  };
  /* 尋像圖案＋分隔線＋格式資訊（左上 9 × 9、右上 8 列 × 9、左下 9 × 8） */
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) set(r, c);
  for (let r = 0; r < 9; r++) for (let c = size - 8; c < size; c++) set(r, c);
  for (let r = size - 8; r < size; r++) for (let c = 0; c < 9; c++) set(r, c);
  /* 時序圖案 */
  for (let i = 0; i < size; i++) {
    set(6, i);
    set(i, 6);
  }
  /* 對位圖案（和尋像圖案重疊的三個不放） */
  const pos = alignmentPositions(version);
  const last = pos.length - 1;
  for (let i = 0; i < pos.length; i++)
    for (let j = 0; j < pos.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      for (let dr = -2; dr <= 2; dr++)
        for (let dc = -2; dc <= 2; dc++) set(pos[i] + dr, pos[j] + dc);
    }
  /* 版本資訊（第 7 版起） */
  if (version >= 7)
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 3; j++) {
        set(i, size - 11 + j);
        set(size - 11 + j, i);
      }
  return m;
}

export interface QrBlockLayout {
  /** 每塊的資料碼字數 */
  data: number[];
  /** 每塊的錯誤更正碼字數（每塊相同） */
  ecc: number;
  /** 總碼字數 */
  total: number;
}

/** 這個版本、等級的區塊配置；total＝資料區能放的碼字數（功能圖案以外的格數 ÷ 8） */
export function blockLayout(version: number, ecl: QrEcl, total: number): QrBlockLayout {
  const n = BLOCKS[ecl][version - 1];
  const ecc = ECC_PER_BLOCK[ecl][version - 1];
  const short = n - (total % n);
  const shortLen = Math.floor(total / n);
  const data: number[] = [];
  for (let i = 0; i < n; i++) data.push((i < short ? shortLen : shortLen + 1) - ecc);
  return { data, ecc, total };
}

/** 遮罩：true 的格要反過來（i＝列、j＝行） */
export function maskAt(mask: number, i: number, j: number): boolean {
  switch (mask) {
    case 0:
      return (i + j) % 2 === 0;
    case 1:
      return i % 2 === 0;
    case 2:
      return j % 3 === 0;
    case 3:
      return (i + j) % 3 === 0;
    case 4:
      return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
    case 5:
      return ((i * j) % 2) + ((i * j) % 3) === 0;
    case 6:
      return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
    default:
      return (((i * j) % 3) + ((i + j) % 2)) % 2 === 0;
  }
}
