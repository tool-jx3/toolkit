/**
 * core/encode 的 PNG 文字（tEXt／zTXt／iTXt）：寫入、讀出、取代同一個關鍵字、其他 chunk 原樣保留（token-maker 引入時新增）。
 */
import { zlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  chunk,
  concat,
  encodePng,
  isPngTextKeyword,
  PNG_SIGNATURE,
  readPngText,
  readPngTexts,
  setPngText,
} from '@/core/encode/png';
import { gradient, sameBytes } from '../helpers/frames';
import { decodePixels, parseChunks } from '../helpers/png';

const latin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

async function samplePng(): Promise<Uint8Array> {
  return encodePng(gradient(9, 7, 1), 9, 7);
}

describe('PNG 的文字 chunk', () => {
  it('寫入 iTXt（UTF-8、可壓縮）再讀出，影像資料不變、CRC 正確、放在 IEND 前', async () => {
    const png = await samplePng();
    const text = JSON.stringify({ 名字: '哥布林', n: 3, emoji: '🐉' });
    for (const compress of [false, true]) {
      const out = setPngText(png, 'trpg-toolkit', text, { compress });
      const chunks = parseChunks(out);
      expect(chunks.every((c) => c.crcOk)).toBe(true);
      expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'iTXt', 'IEND']);
      expect(readPngText(out, 'trpg-toolkit')).toBe(text);
      const before = parseChunks(png).find((c) => c.type === 'IDAT')?.data;
      expect(sameBytes(chunks[1].data, before as Uint8Array)).toBe(true);
      expect(Array.from(decodePixels(chunks[1].data, 9, 7, 6).subarray(0, 8))).toEqual(
        Array.from(gradient(9, 7, 1).subarray(0, 8)),
      );
    }
  });

  it('壓縮旗標：長的文字壓縮後比較小', async () => {
    const png = await samplePng();
    const long = 'abc'.repeat(2000);
    const a = setPngText(png, 'k', long);
    const b = setPngText(png, 'k', long, { compress: true });
    expect(b.length).toBeLessThan(a.length / 10);
    expect(readPngText(b, 'k')).toBe(long);
  });

  it('同一個關鍵字只留新的一個；其他關鍵字保留；text 為 null 時拿掉', async () => {
    const png = await samplePng();
    let out = setPngText(png, 'a', 'one');
    out = setPngText(out, 'b', 'two');
    out = setPngText(out, 'a', 'three', { compress: true });
    expect(readPngTexts(out).map((e) => [e.keyword, e.text])).toEqual([
      ['b', 'two'],
      ['a', 'three'],
    ]);
    out = setPngText(out, 'b', null);
    expect(readPngTexts(out).map((e) => e.keyword)).toEqual(['a']);
  });

  it('讀得到別的程式寫的 tEXt、zTXt', async () => {
    const png = await samplePng();
    const iend = png.length - 12;
    const tEXt = chunk('tEXt', concat([latin1('Comment'), new Uint8Array([0]), latin1('hello')]));
    const zTXt = chunk(
      'zTXt',
      concat([latin1('Title'), new Uint8Array([0, 0]), zlibSync(latin1('compressed!'))]),
    );
    const out = concat([png.subarray(0, iend), tEXt, zTXt, png.subarray(iend)]);
    expect(readPngTexts(out)).toEqual([
      { type: 'tEXt', keyword: 'Comment', text: 'hello' },
      { type: 'zTXt', keyword: 'Title', text: 'compressed!' },
    ]);
    expect(readPngText(out, 'Title')).toBe('compressed!');
    expect(readPngText(out, 'none')).toBeNull();
  });

  it('關鍵字的規範；不是 PNG 時不改', () => {
    expect(isPngTextKeyword('trpg-toolkit')).toBe(true);
    expect(isPngTextKeyword('')).toBe(false);
    expect(isPngTextKeyword(' a')).toBe(false);
    expect(isPngTextKeyword('a  b')).toBe(false);
    expect(isPngTextKeyword('中文')).toBe(false);
    expect(isPngTextKeyword('x'.repeat(80))).toBe(false);
    expect(() => setPngText(PNG_SIGNATURE, '中文', 'x')).toThrow();
    const notPng = new Uint8Array([1, 2, 3]);
    const out = setPngText(notPng, 'k', 'v');
    expect(Array.from(out)).toEqual([1, 2, 3]);
    expect(out).not.toBe(notPng);
    expect(readPngTexts(notPng)).toEqual([]);
  });
});
