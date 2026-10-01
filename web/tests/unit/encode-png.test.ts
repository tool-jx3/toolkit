import { describe, expect, it } from 'vitest';
import { chunk, crc32, encodePng, filterRows, zlib } from '@/core/encode/png';
import { gradient, sameBytes } from '../helpers/frames';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

describe('PNG 編碼', () => {
  it('crc32 與已知值相同', () => {
    const iend = new TextEncoder().encode('IEND');
    expect(crc32(iend)).toBe(0xae426082);
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('chunk 帶正確的長度與 CRC', () => {
    const c = chunk('tEXt', new Uint8Array([1, 2, 3]));
    expect(c.length).toBe(15);
    expect(new DataView(c.buffer).getUint32(0)).toBe(3);
    expect(new DataView(c.buffer).getUint32(11)).toBe(crc32(c, 4, 11));
  });

  it('全彩 RGBA 可以解回原本的像素（含半透明、各種濾波）', async () => {
    const W = 37;
    const H = 23;
    const px = gradient(W, H, 3);
    const png = await encodePng(px, W, H);
    const chunks = parseChunks(png);
    expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(chunks.every((c) => c.crcOk)).toBe(true);
    expect(readIhdr(chunks)).toEqual({ width: W, height: H, bitDepth: 8, colorType: 6 });
    const back = decodePixels(chunks[1].data, W, H, 6);
    expect(sameBytes(back, px)).toBe(true);
  });

  it('調色盤 PNG 帶 PLTE 與 tRNS', async () => {
    const palette = new Uint8Array([0, 0, 0, 0, 255, 0, 0, 255, 0, 0, 255, 128]);
    const idx = new Uint8Array([0, 1, 2, 1, 2, 0]);
    const png = await encodePng(idx, 3, 2, palette);
    const chunks = parseChunks(png);
    expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);
    const rgba = decodePixels(chunks[3].data, 3, 2, 3, chunks[1].data, chunks[2].data);
    expect(Array.from(rgba.subarray(4, 8))).toEqual([255, 0, 0, 255]);
    expect(Array.from(rgba.subarray(8, 12))).toEqual([0, 0, 255, 128]);
    expect(rgba[3]).toBe(0);
  });

  it('原生壓縮與 fflate 都能解回同樣內容', async () => {
    const data = filterRows(gradient(16, 16), 16, 16, 4, true);
    const a = await zlib(data, 'native');
    const b = await zlib(data, 'fflate');
    const { unzlibSync } = await import('fflate');
    expect(sameBytes(unzlibSync(a), data)).toBe(true);
    expect(sameBytes(unzlibSync(b), data)).toBe(true);
  });
});
