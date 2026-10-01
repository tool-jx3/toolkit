import { describe, expect, it } from 'vitest';
import {
  findGoogleFont,
  GOOGLE_FONTS,
  googleFontCssUrl,
  nearestWeight,
} from '@/core/fonts/catalog';
import { readFontNames } from '@/core/fonts/sfnt';

/** 做一個只有 name 表的最小 TrueType 檔 */
function fakeFont(records: { lang: number; id: number; text: string }[]): Uint8Array {
  const strings = records.map((r) => {
    const b = new Uint8Array(r.text.length * 2);
    for (let i = 0; i < r.text.length; i++) {
      b[i * 2] = r.text.charCodeAt(i) >> 8;
      b[i * 2 + 1] = r.text.charCodeAt(i) & 255;
    }
    return b;
  });
  const nameLen = 6 + records.length * 12 + strings.reduce((s, b) => s + b.length, 0);
  const out = new Uint8Array(12 + 16 + nameLen);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x00010000);
  dv.setUint16(4, 1);
  out.set([110, 97, 109, 101], 12); // 'name'
  dv.setUint32(12 + 8, 28);
  dv.setUint32(12 + 12, nameLen);
  const n = 28;
  dv.setUint16(n + 2, records.length);
  dv.setUint16(n + 4, 6 + records.length * 12);
  let off = 0;
  records.forEach((r, i) => {
    const o = n + 6 + i * 12;
    dv.setUint16(o, 3);
    dv.setUint16(o + 2, 1);
    dv.setUint16(o + 4, r.lang);
    dv.setUint16(o + 6, r.id);
    dv.setUint16(o + 8, strings[i].length);
    dv.setUint16(o + 10, off);
    out.set(strings[i], n + 6 + records.length * 12 + off);
    off += strings[i].length;
  });
  return out;
}

describe('字型', () => {
  it('從 name 表讀出名稱（繁中優先）', () => {
    const font = fakeFont([
      { lang: 0x0409, id: 1, text: 'My Font' },
      { lang: 0x0404, id: 1, text: '我的字型' },
    ]);
    expect(readFontNames(font)).toEqual({ family: '我的字型', familyEn: 'My Font' });
    expect(readFontNames(fakeFont([{ lang: 0x0409, id: 1, text: 'Only En' }]))).toEqual({
      family: 'Only En',
      familyEn: 'Only En',
    });
    expect(readFontNames(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it('目錄：繁中五套都在、字重已排序', () => {
    for (const f of [
      'Noto Sans TC',
      'Noto Serif TC',
      'LXGW WenKai TC',
      'Chocolate Classical Sans',
      'Cactus Classical Serif',
      'Huninn',
      'Iansui',
      'Noto Sans KR',
      'Noto Sans JP',
    ]) {
      expect(findGoogleFont(f), f).toBeTruthy();
    }
    for (const f of GOOGLE_FONTS)
      expect([...f.weights]).toEqual([...f.weights].sort((a, b) => a - b));
    expect(new Set(GOOGLE_FONTS.map((f) => f.family)).size).toBe(GOOGLE_FONTS.length);
  });

  it('css2 網址', () => {
    expect(googleFontCssUrl('Noto Sans TC', [400, 700])).toBe(
      'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;700&display=swap',
    );
    expect(googleFontCssUrl('Huninn')).toBe(
      'https://fonts.googleapis.com/css2?family=Huninn&display=swap',
    );
    expect(googleFontCssUrl('LXGW WenKai TC')).toBe(
      'https://fonts.googleapis.com/css2?family=LXGW+WenKai+TC:wght@300;400;700&display=swap',
    );
    expect(googleFontCssUrl('Iansui', [400], '預覽')).toContain('&text=%E9%A0%90%E8%A6%BD');
    expect(nearestWeight([300, 400, 700], 600)).toBe(700);
  });
});
