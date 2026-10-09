/**
 * discord-color：效果的逐字配色（規格 3.6）、讀回的整理（3.7）。
 */
import { describe, expect, it } from 'vitest';
import { br, code, rgb, text } from '../../src/tools/discord-color/ansi';
import {
  defaultDoc,
  initialSettings,
  sanitizeDoc,
  sanitizeSettings,
  sanitizeView,
} from '../../src/tools/discord-color/model';
import {
  DEFAULT_CUSTOM,
  effectColors,
  gradientColor,
  hslToRgb,
  normalizeHex,
  rainbowColor,
  splitGraphemes,
  THEMES,
  zebraColor,
} from '../../src/tools/discord-color/palette';

describe('效果的顏色', () => {
  it('彩虹：色相 0～360° 平均分配，各色版 ×255 無條件捨去', () => {
    expect(Array.from({ length: 5 }, (_, i) => rainbowColor(i, 5))).toEqual([
      '#FF0000',
      '#7FFF00',
      '#00FFFF',
      '#7F00FF',
      '#FF0000',
    ]);
    expect(hslToRgb(120, 1, 0.5)).toEqual([0, 1, 0]);
  });

  it('漸層：逐色版直線內插、無條件捨去', () => {
    expect(Array.from({ length: 3 }, (_, i) => gradientColor('#FD9855', '#D161A2', i, 3))).toEqual([
      '#FD9855',
      '#E77C7B',
      '#D161A2',
    ]);
  });

  it('斑馬：兩色輪流', () => {
    expect([0, 1, 2, 3].map((i) => zebraColor(['#A35454', '#FFB2B2'], i))).toEqual([
      '#A35454',
      '#FFB2B2',
      '#A35454',
      '#FFB2B2',
    ]);
  });

  it('只有一個字時用第一個顏色（原作是無效的 NaN 色碼；規格 5. D2）', () => {
    expect(rainbowColor(0, 1)).toBe('#FF0000');
    expect(gradientColor('#112233', '#445566', 0, 1)).toBe('#112233');
  });

  it('effectColors 依效果與字數給每個字的顏色', () => {
    const colors = {
      gradient: ['#000000', '#FFFFFF'] as [string, string],
      zebra: ['#111111', '#222222'] as [string, string],
    };
    expect(effectColors('gradient', 2, colors)).toEqual(['#000000', '#FFFFFF']);
    expect(effectColors('zebra', 3, colors)).toEqual(['#111111', '#222222', '#111111']);
    expect(effectColors('rainbow', 0, colors)).toEqual([]);
  });

  it('切字：表情符號、組合字算一個字，換行也是一個字', () => {
    expect(splitGraphemes('a👨‍👩‍👧é\n字')).toEqual(['a', '👨‍👩‍👧', 'é', '\n', '字']);
  });

  it('色碼整理成大寫 #RRGGBB', () => {
    expect(normalizeHex('#abc')).toBe('#AABBCC');
    expect(normalizeHex(' #5865f2 ')).toBe('#5865F2');
    expect(normalizeHex('red')).toBeNull();
    expect(normalizeHex(42)).toBeNull();
  });
});

describe('主題', () => {
  it('四種主題都有 8 個經典色；淺色主題的選取用深色', () => {
    for (const t of Object.values(THEMES)) expect(t.ansi).toHaveLength(8);
    expect(THEMES.light.light).toBe(true);
    expect(THEMES.ash.light).toBe(false);
  });
});

describe('讀回的整理', () => {
  it('開頁的範例：歡迎使用＋藍紫底白字的 Discord＋粗體的經典 7 色', () => {
    expect(defaultDoc()).toEqual([
      text('歡迎使用 '),
      rgb('#5865F2', false, [rgb('#FFFFFF', true, [text('Discord')])]),
      text(' '),
      code(1, [
        code(31, [text('彩')]),
        code(32, [text('色')]),
        code(33, [text('文')]),
        code(34, [text('字')]),
        code(35, [text('產')]),
        code(36, [text('生')]),
        code(37, [text('器')]),
      ]),
      text('！'),
    ]);
  });

  it('格式樹：認不得的節點略過（內容保留）、無效的代碼與色碼不當格式、相鄰的文字合併', () => {
    expect(
      sanitizeDoc([
        { type: 'text', text: 'a' },
        { type: 'code', code: 5, children: [{ type: 'text', text: 'b' }] },
        { type: 'rgb', hex: '#abc', fg: true, children: [{ type: 'text', text: 'c' }] },
        { type: 'rgb', hex: 'nope', children: [{ type: 'br' }] },
        { type: 'text', text: '' },
        { type: 'img' },
        null,
        { type: 'code', code: 41, children: 'bad' },
      ]),
    ).toEqual([text('ab'), rgb('#AABBCC', true, [text('c')]), br(), code(41, [])]);
    expect(sanitizeDoc('x')).toBeNull();
  });

  it('設定：壞掉的欄位用預設值，自訂色補齊 8 個', () => {
    expect(sanitizeSettings(null)).toBeNull();
    expect(sanitizeSettings([])).toBeNull();
    const s = sanitizeSettings({ doc: 'x', custom: ['#fff', 'bad'], gradient: ['#000000'] });
    expect(s?.doc).toEqual(initialSettings().doc);
    expect(s?.custom).toEqual(['#FFFFFF', ...DEFAULT_CUSTOM.slice(1)]);
    expect(s?.gradient).toEqual(['#000000', '#D161A2']);
    expect(s?.zebra).toEqual(['#A35454', '#FFB2B2']);
  });

  it('預覽：未知的主題換成 Ash、套用到只有文字／背景', () => {
    expect(sanitizeView({ theme: 'onyx', target: 'bg' })).toEqual({ theme: 'onyx', target: 'bg' });
    expect(sanitizeView({ theme: 'midnight', target: 'x' })).toEqual({
      theme: 'ash',
      target: 'fg',
    });
    expect(sanitizeView(undefined)).toEqual({ theme: 'ash', target: 'fg' });
  });
});
