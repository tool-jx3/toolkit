/**
 * 印刷用的共用函式（id-ticket 移植時新增）：mm ↔ 指定 dpi 的像素、含出血的整數尺寸（core/paged）、PNG 的 pHYs（core/encode）。
 */
import { describe, expect, it } from 'vitest';
import { dpiToPixelsPerMeter, encodePng, readPngDpi, setPngDpi } from '@/core/encode';
import { dotsToMm, MM_PER_INCH, mmToDots, printPixels } from '@/core/paged';
import { parseChunks } from '../helpers/png';

describe('core/paged：mm 與 dpi', () => {
  it('mm → 600 dpi 的像素與反過來', () => {
    expect(MM_PER_INCH).toBe(25.4);
    expect(mmToDots(25.4, 600)).toBe(600);
    expect(mmToDots(54, 600)).toBeCloseTo(1275.59, 2);
    expect(dotsToMm(600, 300)).toBeCloseTo(50.8, 6);
  });

  it('printPixels：成品尺寸＋出血，四捨五入', () => {
    expect(printPixels({ w: 54, h: 86 }, 600)).toEqual({ width: 1276, height: 2031 });
    expect(printPixels({ w: 54, h: 86 }, 600, 2)).toEqual({ width: 1370, height: 2126 });
    expect(printPixels({ w: 86, h: 54 }, 600, 2)).toEqual({ width: 2126, height: 1370 });
    expect(printPixels({ w: 210, h: 297 }, 300)).toEqual({ width: 2480, height: 3508 });
  });
});

describe('core/encode：PNG 的解析度（pHYs）', () => {
  it('dpi → 每公尺像素', () => {
    expect(dpiToPixelsPerMeter(600)).toBe(23622);
    expect(dpiToPixelsPerMeter(72)).toBe(2835);
    expect(dpiToPixelsPerMeter(300)).toBe(11811);
  });

  it('寫在 IHDR 後面；原本的影像資料不變；讀得回 dpi', async () => {
    const px = new Uint8Array(4 * 3 * 2).fill(200);
    const png = await encodePng(px, 3, 2);
    expect(readPngDpi(png)).toBeNull();
    const out = setPngDpi(png, 600);
    const chunks = parseChunks(out);
    expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'pHYs', 'IDAT', 'IEND']);
    expect(chunks.every((c) => c.crcOk)).toBe(true);
    const phys = chunks[1].data;
    const dv = new DataView(phys.buffer, phys.byteOffset, phys.byteLength);
    expect([dv.getUint32(0), dv.getUint32(4), phys[8]]).toEqual([23622, 23622, 1]);
    expect(readPngDpi(out)).toEqual({ x: 600, y: 600 });
    /* IDAT 原封不動 */
    const before = parseChunks(png).find((c) => c.type === 'IDAT')?.data;
    expect(Array.from(chunks[2].data)).toEqual(Array.from(before ?? []));
    expect(out.length).toBe(png.length + 21);
  });

  it('已經有 pHYs 時換掉（不會有兩個）；不同的 x、y', async () => {
    const png = await encodePng(new Uint8Array(4).fill(1), 1, 1);
    const twice = setPngDpi(setPngDpi(png, 72), 300, 150);
    const types = parseChunks(twice).map((c) => c.type);
    expect(types.filter((t) => t === 'pHYs')).toHaveLength(1);
    expect(readPngDpi(twice)).toEqual({ x: 300, y: 150 });
  });

  it('不是 PNG 時原樣回傳複本', () => {
    const junk = new Uint8Array([1, 2, 3, 4]);
    const out = setPngDpi(junk, 600);
    expect(Array.from(out)).toEqual([1, 2, 3, 4]);
    expect(out).not.toBe(junk);
    expect(readPngDpi(junk)).toBeNull();
  });
});
