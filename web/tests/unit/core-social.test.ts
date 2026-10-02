/**
 * @/core/social：X 的字數、發文網址、Unicode 花式英數字（session-report 規格 3.3、3.6、3.7）。
 */
import { describe, expect, it } from 'vitest';
import {
  fromSmallCaps,
  isUnicodeTextStyle,
  toUnicodeStyle,
  UNICODE_TEXT_STYLE_IDS,
  UNICODE_TEXT_STYLES,
  X_POST_LIMIT,
  xIntentUrl,
  xPostLength,
} from '@/core/social';

describe('xPostLength', () => {
  it('拉丁、一般標點算 1，其他算 2（規格 3.6 的例子）', () => {
    expect(X_POST_LIMIT).toBe(280);
    expect(xPostLength('abc')).toBe(3);
    expect(xPostLength('團報')).toBe(4);
    expect(xPostLength('𝘼')).toBe(2);
    expect(xPostLength('👍🏻')).toBe(4);
    expect(xPostLength('')).toBe(0);
    expect(xPostLength('a\nb')).toBe(3);
  });

  it('範圍的邊界：U+10FF／U+1100、U+1FFF／U+2000、U+201F／U+2020、U+2031／U+2032、U+2037／U+2038', () => {
    const w = (cp: number) => xPostLength(String.fromCodePoint(cp));
    expect([w(0x10ff), w(0x1100)]).toEqual([1, 2]);
    expect([w(0x1fff), w(0x2000)]).toEqual([2, 1]);
    expect([w(0x201f), w(0x2020)]).toEqual([1, 2]);
    expect([w(0x2031), w(0x2032)]).toEqual([2, 1]);
    expect([w(0x2037), w(0x2038)]).toEqual([1, 2]);
  });

  it('先做 NFC：e＋組合重音算一個字', () => {
    expect(xPostLength('é')).toBe(1);
    expect(xPostLength('が')).toBe(2);
  });
});

describe('xIntentUrl', () => {
  it('文字原樣以 URL 編碼放進 text 參數', () => {
    const url = xIntentUrl('團報 #CoC\n& 100%');
    expect(url.startsWith('https://twitter.com/intent/tweet?text=')).toBe(true);
    expect(new URL(url).searchParams.get('text')).toBe('團報 #CoC\n& 100%');
    expect(url).toContain('%20');
    expect(url).toContain('%0A');
  });
});

describe('toUnicodeStyle', () => {
  it('10 種樣式的順序與預設', () => {
    expect(UNICODE_TEXT_STYLE_IDS).toEqual([
      'sansBoldItalic',
      'sansBold',
      'sansItalic',
      'serifBoldItalic',
      'serifBold',
      'serifItalic',
      'smallCaps',
      'monospace',
      'sans',
      'plain',
    ]);
    expect(UNICODE_TEXT_STYLES.map((s) => s.sample).join('')).toBe('𝘼𝗔𝘈𝑨𝐀𝐴ᴀ𝙰𝖠A');
  });

  it('數學英數字的起點（A、a、0）', () => {
    const cps = (s: string) => Array.from(s, (c) => c.codePointAt(0));
    expect(cps(toUnicodeStyle('Aa0', 'sansBoldItalic'))).toEqual([0x1d63c, 0x1d656, 0x1d7ec]);
    expect(cps(toUnicodeStyle('Aa0', 'sansBold'))).toEqual([0x1d5d4, 0x1d5ee, 0x1d7ec]);
    expect(cps(toUnicodeStyle('Aa0', 'sansItalic'))).toEqual([0x1d608, 0x1d622, 0x30]);
    expect(cps(toUnicodeStyle('Aa0', 'serifBoldItalic'))).toEqual([0x1d468, 0x1d482, 0x1d7ce]);
    expect(cps(toUnicodeStyle('Aa0', 'serifBold'))).toEqual([0x1d400, 0x1d41a, 0x1d7ce]);
    expect(cps(toUnicodeStyle('Aa0', 'serifItalic'))).toEqual([0x1d434, 0x1d44e, 0x30]);
    expect(cps(toUnicodeStyle('Aa0', 'monospace'))).toEqual([0x1d670, 0x1d68a, 0x1d7f6]);
    expect(cps(toUnicodeStyle('Aa0', 'sans'))).toEqual([0x1d5a0, 0x1d5ba, 0x1d7e2]);
    expect(toUnicodeStyle('Zz9', 'serifBold')).toBe('𝐙𝐳𝟗');
  });

  it('襯線斜體的 h 是 ℎ（U+210E）', () => {
    expect(toUnicodeStyle('hgh', 'serifItalic')).toBe('ℎ𝑔ℎ');
  });

  it('小型大寫：大小寫都換；X → x、Q → ꞯ；數字不變', () => {
    expect(toUnicodeStyle('KP Gm xQ 7', 'smallCaps')).toBe('ᴋᴘ ɢᴍ xꞯ 7');
  });

  it('小型大寫字母先換回一般大寫；「不轉換」只做這一步', () => {
    expect(fromSmallCaps('ᴋᴘᴄ/ᴋᴘ x')).toBe('KPC/KP x');
    expect(toUnicodeStyle('ᴘᴄ┊ᴘʟ', 'plain')).toBe('PC┊PL');
    expect(toUnicodeStyle('ᴘᴄ┊ᴘʟ', 'sansBold')).toBe('𝗣𝗖┊𝗣𝗟');
    expect(toUnicodeStyle('ＫＰ', 'plain')).toBe('ＫＰ');
  });

  it('相容分解：全形英數、標點、全形空白變半形，圈號數字變數字', () => {
    expect(toUnicodeStyle('ＫＰ！（１）　①', 'sansBold')).toBe('𝗞𝗣!(𝟭) 𝟭');
  });

  it('最後做 NFC：沒有被轉換的濁音、韓文、帶重音的字組回去；帶重音的英文字母轉換基本字母', () => {
    expect(toUnicodeStyle('ダブルクロス 한글', 'sansBold')).toBe('ダブルクロス 한글');
    expect(toUnicodeStyle('ダ', 'sansBold').length).toBe(1);
    expect(toUnicodeStyle('é', 'sansBold')).toBe('𝗲́');
  });

  it('認不得的樣式：只換回小型大寫', () => {
    expect(isUnicodeTextStyle('toString')).toBe(false);
    expect(isUnicodeTextStyle('smallCaps')).toBe(true);
    expect(toUnicodeStyle('ᴋA', 'bogus' as never)).toBe('KA');
  });
});
