/**
 * QR code 的解碼（模組矩陣 → 文字）：讀格式資訊（容許 3 位元錯）→ 去掉遮罩 → 依 Z 字順序讀出碼字 →
 * 拆回各區塊、Reed–Solomon 修正 → 解析資料段（數字、英數字、位元組、漢字、ECI）。
 *
 * 這裡**不找圖上的 QR code**（尋像圖案的定位、透視校正）：讀得出來的檢查（`check.ts`）知道每一格畫在哪裡，
 * 直接在格子中央取樣成矩陣再交給這裡；所以它檢查的是「每一格的顏色與資料能不能讀回原來的內容」。
 */
import { QR_VERSION_MAX, type QrDataMode, type QrEcl } from './encode';
import { RsError, rsCorrect } from './rs';
import { sjisDecode } from './sjis';
import { blockLayout, ECL_FROM_BITS, functionMask, maskAt, qrSizeOf } from './tables';

export interface QrDecoded {
  ok: true;
  text: string;
  version: number;
  ecl: QrEcl;
  mask: number;
  /** 用到的模式（依出現順序，不重複） */
  modes: QrDataMode[];
  /** 修正了幾個碼字（全部區塊加起來） */
  corrected: number;
  /** 最多可以修正幾個碼字（全部區塊加起來） */
  capacity: number;
  /** 修正最多的區塊用掉了多少容錯（0～1） */
  worst: number;
}

export type QrDecodeFailure =
  | 'size'
  /** 格式資訊讀不出來（錯誤更正等級與遮罩） */
  | 'format'
  /** 錯太多，修不回來 */
  | 'correction'
  /** 資料段壞掉 */
  | 'data';

export type QrDecodeResult = QrDecoded | { ok: false; reason: QrDecodeFailure };

/** 格式資訊的 32 種正確碼字（15 位元，已 XOR 0x5412） */
const FORMAT_WORDS: number[] = (() => {
  const out: number[] = [];
  for (let data = 0; data < 32; data++) {
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    out.push(((data << 10) | rem) ^ 0x5412);
  }
  return out;
})();

const popcount = (x: number): number => {
  let n = 0;
  for (let v = x; v; v &= v - 1) n++;
  return n;
};

function readFormat(size: number, dark: (r: number, c: number) => boolean): number | null {
  const bit = (r: number, c: number) => (dark(r, c) ? 1 : 0);
  let a = 0;
  for (let i = 0; i <= 5; i++) a |= bit(i, 8) << i;
  a |= bit(7, 8) << 6;
  a |= bit(8, 8) << 7;
  a |= bit(8, 7) << 8;
  for (let i = 9; i < 15; i++) a |= bit(8, 14 - i) << i;
  let b = 0;
  for (let i = 0; i < 8; i++) b |= bit(8, size - 1 - i) << i;
  for (let i = 8; i < 15; i++) b |= bit(size - 15 + i, 8) << i;
  let best = -1;
  let bestDist = 99;
  for (let d = 0; d < 32; d++) {
    const dist = Math.min(popcount(a ^ FORMAT_WORDS[d]), popcount(b ^ FORMAT_WORDS[d]));
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return bestDist <= 3 ? best : null;
}

/** 依 Z 字順序讀出所有資料格（已去掉遮罩），8 位元一個碼字 */
function readCodewords(
  size: number,
  version: number,
  mask: number,
  dark: (r: number, c: number) => boolean,
): Uint8Array {
  const fn = functionMask(version);
  let count = 0;
  for (let i = 0; i < fn.length; i++) if (!fn[i]) count++;
  const out = new Uint8Array(Math.floor(count / 8));
  let bitIndex = 0;
  let up = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let k = 0; k < size; k++) {
      const row = up ? size - 1 - k : k;
      for (let j = 0; j < 2; j++) {
        const col = right - j;
        if (fn[row * size + col]) continue;
        const byte = bitIndex >> 3;
        if (byte < out.length && dark(row, col) !== maskAt(mask, row, col))
          out[byte] |= 0x80 >> (bitIndex & 7);
        bitIndex++;
      }
    }
    up = !up;
  }
  return out;
}

class BitReader {
  private pos = 0;
  constructor(private readonly bytes: Uint8Array) {}
  get left(): number {
    return this.bytes.length * 8 - this.pos;
  }
  read(n: number): number {
    if (n > this.left) throw new DataError();
    let v = 0;
    for (let i = 0; i < n; i++) {
      const b = (this.bytes[this.pos >> 3] >> (7 - (this.pos & 7))) & 1;
      v = (v << 1) | b;
      this.pos++;
    }
    return v;
  }
}

class DataError extends Error {}

const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

function countBits(mode: QrDataMode, version: number): number {
  const k = version <= 9 ? 0 : version <= 26 ? 1 : 2;
  const table: Record<QrDataMode, readonly number[]> = {
    numeric: [10, 12, 14],
    alphanumeric: [9, 11, 13],
    byte: [8, 16, 16],
    kanji: [8, 10, 12],
  };
  return table[mode][k];
}

/** ECI 的字集 → TextDecoder 的名稱（常見的幾個） */
const ECI_CHARSETS: Record<number, string> = {
  1: 'iso-8859-1',
  3: 'iso-8859-1',
  20: 'shift_jis',
  22: 'windows-1251',
  26: 'utf-8',
  28: 'big5',
  29: 'gb18030',
  30: 'euc-kr',
};

/** 沒有 ECI 的位元組：是合法的 UTF-8 就當 UTF-8（大部分手機的做法），不然當 ISO-8859-1 */
function decodeBytes(bytes: Uint8Array, charset: string | null): string {
  if (charset) {
    try {
      return new TextDecoder(charset).decode(bytes);
    } catch {
      /* 不認得的字集：往下猜 */
    }
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('iso-8859-1').decode(bytes);
  }
}

function parseSegments(data: Uint8Array, version: number): { text: string; modes: QrDataMode[] } {
  const r = new BitReader(data);
  let text = '';
  const modes: QrDataMode[] = [];
  let charset: string | null = null;
  const use = (m: QrDataMode) => {
    if (!modes.includes(m)) modes.push(m);
  };
  while (r.left >= 4) {
    const ind = r.read(4);
    if (ind === 0) break;
    if (ind === 0b0111) {
      /* ECI：1、2 或 3 個位元組的字集編號 */
      const first = r.read(8);
      const id =
        (first & 0x80) === 0
          ? first
          : (first & 0xc0) === 0x80
            ? ((first & 0x3f) << 8) | r.read(8)
            : ((first & 0x1f) << 16) | r.read(16);
      charset = ECI_CHARSETS[id] ?? null;
      continue;
    }
    if (ind === 0b0011) {
      r.read(16);
      continue;
    }
    if (ind === 0b0101) continue;
    if (ind === 0b1001) {
      r.read(8);
      continue;
    }
    const mode: QrDataMode | null =
      ind === 0b0001
        ? 'numeric'
        : ind === 0b0010
          ? 'alphanumeric'
          : ind === 0b0100
            ? 'byte'
            : ind === 0b1000
              ? 'kanji'
              : null;
    if (!mode) throw new DataError();
    use(mode);
    let n = r.read(countBits(mode, version));
    if (mode === 'numeric') {
      while (n >= 3) {
        const v = r.read(10);
        if (v > 999) throw new DataError();
        text += String(v).padStart(3, '0');
        n -= 3;
      }
      if (n === 2) {
        const v = r.read(7);
        if (v > 99) throw new DataError();
        text += String(v).padStart(2, '0');
      } else if (n === 1) {
        const v = r.read(4);
        if (v > 9) throw new DataError();
        text += String(v);
      }
    } else if (mode === 'alphanumeric') {
      while (n >= 2) {
        const v = r.read(11);
        const a = Math.floor(v / 45);
        if (a >= 45) throw new DataError();
        text += ALNUM[a] + ALNUM[v % 45];
        n -= 2;
      }
      if (n === 1) {
        const v = r.read(6);
        if (v >= 45) throw new DataError();
        text += ALNUM[v];
      }
    } else if (mode === 'byte') {
      const bytes = new Uint8Array(n);
      for (let i = 0; i < n; i++) bytes[i] = r.read(8);
      text += decodeBytes(bytes, charset);
    } else {
      const bytes = new Uint8Array(n * 2);
      for (let i = 0; i < n; i++) {
        const v = r.read(13);
        let code = (Math.floor(v / 0xc0) << 8) | (v % 0xc0);
        code += code < 0x1f00 ? 0x8140 : 0xc140;
        bytes[i * 2] = code >> 8;
        bytes[i * 2 + 1] = code & 0xff;
      }
      text += sjisDecode(bytes);
    }
  }
  return { text, modes };
}

/** 模組矩陣 → 文字（size＝一邊幾格；dark(r, c)＝第 r 列第 c 行是不是深色） */
export function decodeQrMatrix(
  size: number,
  dark: (r: number, c: number) => boolean,
): QrDecodeResult {
  const version = (size - 17) / 4;
  if (!Number.isInteger(version) || version < 1 || version > QR_VERSION_MAX)
    return { ok: false, reason: 'size' };
  const format = readFormat(size, dark);
  if (format === null) return { ok: false, reason: 'format' };
  const ecl = ECL_FROM_BITS[format >> 3];
  const mask = format & 7;
  const raw = readCodewords(qrSizeOf(version), version, mask, dark);
  const layout = blockLayout(version, ecl, raw.length);
  /* 拆回區塊：資料碼字依序輪流放（短的區塊先結束），之後是錯誤更正碼字 */
  const blocks = layout.data.map((d) => new Uint8Array(d + layout.ecc));
  const maxData = Math.max(...layout.data);
  let k = 0;
  for (let i = 0; i < maxData; i++)
    for (let b = 0; b < blocks.length; b++) if (i < layout.data[b]) blocks[b][i] = raw[k++];
  for (let i = 0; i < layout.ecc; i++)
    for (let b = 0; b < blocks.length; b++) blocks[b][layout.data[b] + i] = raw[k++];
  let corrected = 0;
  let worst = 0;
  const half = Math.floor(layout.ecc / 2);
  try {
    for (const block of blocks) {
      const n = rsCorrect(block, layout.ecc);
      if (n > half) return { ok: false, reason: 'correction' };
      corrected += n;
      worst = Math.max(worst, n / half);
    }
  } catch (e) {
    if (e instanceof RsError) return { ok: false, reason: 'correction' };
    throw e;
  }
  const total = layout.data.reduce((s, d) => s + d, 0);
  const data = new Uint8Array(total);
  let o = 0;
  for (let b = 0; b < blocks.length; b++) {
    data.set(blocks[b].subarray(0, layout.data[b]), o);
    o += layout.data[b];
  }
  try {
    const { text, modes } = parseSegments(data, version);
    return {
      ok: true,
      text,
      version,
      ecl,
      mask,
      modes,
      corrected,
      capacity: half * blocks.length,
      worst,
    };
  } catch (e) {
    if (e instanceof DataError) return { ok: false, reason: 'data' };
    throw e;
  }
}
