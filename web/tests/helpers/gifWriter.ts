/**
 * 測試用的 GIF 產生器（不依賴被測的編碼器）：每格可以指定範圍、延遲、處置方式、透明色、區域調色盤。
 * LZW 只用「不壓縮」的寫法（每個像素一個碼、定期送清除碼），任何解碼器都讀得懂。
 */

export interface GifWriterFrame {
  /** 這格的範圍（預設整張） */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** 調色盤索引（width × height 個） */
  indices: ArrayLike<number>;
  /** 延遲（1/100 秒）；null＝不寫圖形控制延伸 */
  delayCs?: number | null;
  /** 處置方式 0～3 */
  disposal?: number;
  transparentIndex?: number | null;
  /** 區域調色盤（RGB 平鋪，2^n 色） */
  localPalette?: ArrayLike<number> | null;
}

export interface GifWriterOptions {
  width: number;
  height: number;
  /** 全域調色盤（RGB 平鋪，最多 256 色；會補到 2^n） */
  palette: ArrayLike<number>;
  /** NETSCAPE 重播次數（0＝無限）；null＝不寫 */
  loop?: number | null;
  frames: GifWriterFrame[];
}

function tableBits(colors: number): number {
  let n = 1;
  while (1 << n < colors) n++;
  return n;
}

function padPalette(p: ArrayLike<number>): { bytes: number[]; bits: number } {
  const colors = Math.max(2, Math.ceil(p.length / 3));
  const bits = tableBits(colors);
  const bytes = Array.from(p);
  while (bytes.length < 3 * (1 << bits)) bytes.push(0);
  return { bytes, bits };
}

/** 不壓縮的 LZW：碼長固定在 minSize＋1，字典快長到下一個碼長前送清除碼 */
function lzwUncompressed(indices: ArrayLike<number>, minSize: number): number[] {
  const clear = 1 << minSize;
  const eoi = clear + 1;
  const size = minSize + 1;
  const limit = (1 << size) - (clear + 2) - 1;
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  const put = (code: number) => {
    acc |= code << bits;
    bits += size;
    while (bits >= 8) {
      out.push(acc & 255);
      acc >>>= 8;
      bits -= 8;
    }
  };
  put(clear);
  let run = 0;
  for (let i = 0; i < indices.length; i++) {
    if (run >= limit) {
      put(clear);
      run = 0;
    }
    put(indices[i]);
    run++;
  }
  put(eoi);
  if (bits > 0) out.push(acc & 255);
  return out;
}

function subBlocks(data: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < data.length; i += 255) {
    const part = data.slice(i, i + 255);
    out.push(part.length, ...part);
  }
  out.push(0);
  return out;
}

const u16 = (v: number) => [v & 255, (v >> 8) & 255];

export function writeGif(o: GifWriterOptions): Uint8Array {
  const g = padPalette(o.palette);
  const bytes: number[] = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
  bytes.push(...u16(o.width), ...u16(o.height), 0x80 | ((g.bits - 1) << 4) | (g.bits - 1), 0, 0);
  bytes.push(...g.bytes);
  if (o.loop !== null && o.loop !== undefined)
    bytes.push(
      0x21,
      0xff,
      11,
      ...Array.from('NETSCAPE2.0', (c) => c.charCodeAt(0)),
      3,
      1,
      ...u16(o.loop),
      0,
    );
  for (const f of o.frames) {
    const w = f.width ?? o.width;
    const h = f.height ?? o.height;
    if (f.delayCs !== null) {
      const t = f.transparentIndex ?? null;
      bytes.push(
        0x21,
        0xf9,
        4,
        ((f.disposal ?? 0) << 2) | (t === null ? 0 : 1),
        ...u16(f.delayCs ?? 0),
        t ?? 0,
        0,
      );
    }
    bytes.push(0x2c, ...u16(f.x ?? 0), ...u16(f.y ?? 0), ...u16(w), ...u16(h));
    if (f.localPalette) {
      const lp = padPalette(f.localPalette);
      bytes.push(0x80 | (lp.bits - 1), ...lp.bytes);
    } else bytes.push(0);
    /* 碼長一律 9 位元（最小碼長 8 對任何調色盤都合法），清除碼最少 */
    const minSize = 8;
    bytes.push(minSize, ...subBlocks(lzwUncompressed(f.indices, minSize)));
  }
  bytes.push(0x3b);
  return new Uint8Array(bytes);
}

/** 單色的整格（每格一個調色盤索引） */
export function solidFrames(
  width: number,
  height: number,
  colorIndex: readonly number[],
  delayCs: readonly (number | null)[],
): GifWriterFrame[] {
  return colorIndex.map((c, i) => ({
    indices: new Uint8Array(width * height).fill(c),
    delayCs: delayCs[i] ?? 10,
  }));
}
