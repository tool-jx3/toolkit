/**
 * core/files 的 decodeText：BOM（UTF-8、UTF-16 LE／BE）→ UTF-8（嚴格）→ 備用編碼（預設 Big5）→ UTF-8（有替換字元）。
 * （scenario-cards 移植時新增）
 */
import { describe, expect, it } from 'vitest';
import { decodeText } from '@/core/files';

const utf8 = (s: string) => new TextEncoder().encode(s);
const utf16 = (s: string, le: boolean) => {
  const out = new Uint8Array(2 + s.length * 2);
  out.set(le ? [0xff, 0xfe] : [0xfe, 0xff]);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out[2 + i * 2] = le ? c & 0xff : c >> 8;
    out[3 + i * 2] = le ? c >> 8 : c & 0xff;
  }
  return out;
};

describe('decodeText', () => {
  it('UTF-8（沒有 BOM、有 BOM）', () => {
    expect(decodeText(utf8('霧港的燈塔\n𠀋'))).toEqual({
      text: '霧港的燈塔\n𠀋',
      encoding: 'utf-8',
      bom: false,
      lossy: false,
    });
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('有 BOM')]);
    expect(decodeText(withBom)).toEqual({
      text: '有 BOM',
      encoding: 'utf-8',
      bom: true,
      lossy: false,
    });
    expect(decodeText(new ArrayBuffer(0)).text).toBe('');
  });

  it('有 BOM 的 UTF-16（LE、BE）', () => {
    expect(decodeText(utf16('燈塔 A𠀋', true))).toMatchObject({
      text: '燈塔 A𠀋',
      encoding: 'utf-16le',
      bom: true,
      lossy: false,
    });
    expect(decodeText(utf16('燈塔 A𠀋', false))).toMatchObject({
      text: '燈塔 A𠀋',
      encoding: 'utf-16be',
      bom: true,
    });
  });

  it('不是 UTF-8 時試 Big5', () => {
    /* 「中文」的 Big5 */
    const big5 = new Uint8Array([0xa4, 0xa4, 0xa4, 0xe5, 0x0a, 0x41]);
    expect(decodeText(big5)).toEqual({
      text: '中文\nA',
      encoding: 'big5',
      bom: false,
      lossy: false,
    });
    /* 不試備用編碼時以 UTF-8 解讀並換成替換字元 */
    const r = decodeText(big5, { fallbacks: [] });
    expect(r.encoding).toBe('utf-8');
    expect(r.lossy).toBe(true);
    expect(r.text).toContain('�');
  });

  it('UTF-8 與 Big5 都不合時以 UTF-8 解讀（lossy）', () => {
    /* 0xA4 不是 UTF-8 的開頭；在 Big5 是兩位元組字的開頭，但後面接的不是合法的第二個位元組 */
    const bad = new Uint8Array([0x41, 0xa4, 0x20]);
    const r = decodeText(bad);
    expect(r.encoding).toBe('utf-8');
    expect(r.lossy).toBe(true);
    expect(r.text).toContain('A');
  });
});
