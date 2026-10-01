/**
 * 匿名拼貼信產生器：HTML 文字（規格 3.7）、Roll20 格式文字（3.8）、檔名（3.9）、紙張斑點（3.5）。
 * 逐字比對用手寫的紙片；另外用 layoutCollage 的輸出驗證每一段的數值與排版一致。
 */
import { describe, expect, it } from 'vitest';
import { createRandom } from '@/core/timeline';
import {
  cleanFamily,
  clipPolygon,
  exportFileName,
  type LayoutInput,
  type Line,
  layoutCollage,
  type MeasureFn,
  type Piece,
  ROLL20_BASIC_FONTS,
  roll20Size,
  roll20Text,
  SYSTEM_SANS,
  speckCount,
  toHtml,
  toRoll20,
} from '@/tools/collage-letter/collage';

const piece = (over: Partial<Piece> = {}): Piece => ({
  kind: 'piece',
  ch: '信',
  font: { family: 'Gaegu', weight: 700 },
  size: 57,
  bg: '#d42a1f',
  fg: '#fff6e5',
  rotate: -7,
  textWidth: 57,
  width: 82,
  height: 80,
  insets: [0.1, 0.05, 0, 0.2, 0.15, 0.01, 0.2, 0],
  radii: [2, 5, 12, 7],
  gap: 3,
  x: 0,
  y: 0,
  ...over,
});

const line = (items: Line['items']): Line => ({ mid: 0, left: 0, width: 0, items });
const space = { kind: 'space' as const, width: 28, x: 0 };

const OUTER =
  'display: inline-block; transform: rotate(-7deg); filter: drop-shadow(2px 3px 2px rgba(0, 0, 0, 0.5)); margin: 2px 4px;';
const inner = (family: string, ch: string) =>
  `<span style="display: inline-block; font-family: ${family}; font-size: 31px; background: #d42a1f; color: #fff6e5; clip-path: polygon(5.0% 2.5%, 100.0% 10.0%, 92.5% 99.5%, 10.0% 100.0%); padding: 6px 12px; font-weight: 900; text-shadow: none; line-height: 1;">${ch}</span>`;

describe('HTML 文字（3.7）', () => {
  it('兩個字、一個空白、一個字、換行、空行：逐字相同；字一律跳脫', () => {
    const layout = {
      lines: [line([piece({ ch: '<' }), piece({ ch: '&' }), space, piece({ ch: '"' })]), line([])],
    };
    const html = toHtml(layout, 'right');
    const fam = "'Gaegu', sans-serif";
    expect(html).toBe(
      '<div style="text-align: right; line-height: 2.5; padding: 20px; background: #2a2a2a; border-radius: 10px;">\n' +
        `<span style="${OUTER}">${inner(fam, '&lt;')}</span>` +
        `<span style="${OUTER}">${inner(fam, '&amp;')}</span>` +
        '&nbsp;&nbsp;' +
        `<span style="${OUTER}">${inner(fam, '&quot;')}</span>` +
        '<br>\n' +
        '<br>\n' +
        '\n</div>',
    );
  });

  it('對齊方式照傳入的值（複製當下的值）；系統字型只寫 sans-serif', () => {
    const layout = { lines: [line([piece({ font: SYSTEM_SANS })])] };
    expect(toHtml(layout, 'left')).toContain('text-align: left;');
    expect(toHtml(layout, 'center')).toContain('text-align: center;');
    expect(toHtml(layout, 'left')).toContain('font-family: sans-serif;');
  });

  it('多邊形：四個角以百分比表示（一位小數），與畫布的內縮相同', () => {
    expect(clipPolygon([0, 0, 0, 0, 0, 0, 0, 0])).toBe(
      '0.0% 0.0%, 100.0% 0.0%, 100.0% 100.0%, 0.0% 100.0%',
    );
    expect(clipPolygon([0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2])).toBe(
      '10.0% 10.0%, 90.0% 10.0%, 90.0% 90.0%, 10.0% 90.0%',
    );
    expect(clipPolygon([0.123, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.199])).toBe(
      '6.2% 0.0%, 100.0% 0.0%, 100.0% 100.0%, 0.0% 90.0%',
    );
  });

  it('字型名稱去掉會弄壞樣式或屬性的字元', () => {
    expect(cleanFamily(`Evil"; } <x> 'Font'`)).toBe('Evil x Font');
    const html = toHtml(
      { lines: [line([piece({ font: { family: `A"B'C<D>`, weight: 400 } })])] },
      'left',
    );
    expect(html).toContain("font-family: 'ABCD', sans-serif;");
  });
});

describe('Roll20 格式文字（3.8）', () => {
  it('每張紙片一段「[字](#" style="…")」；空白輸出兩個半形空白；每行結尾換行', () => {
    const layout = {
      a: 45,
      b: 70,
      lines: [
        line([piece(), space, piece({ ch: 'A', size: 70, radii: [12, 12, 2, 2] })]),
        line([]),
      ],
    };
    const text = toRoll20(layout, { basic: false, min: 16, max: 24 }, createRandom(1));
    const style = (size: number, radii: string) =>
      `text-decoration: none; display: inline-block; font-family: Gaegu, sans-serif; font-size: ${size}px; line-height: 1.2; background-color: #d42a1f; color: #fff6e5; padding: 5px; border-radius: ${radii}; margin: 2px; font-weight: bold; box-shadow: 2px 3px 5px #333333;`;
    expect(text).toBe(
      `[信](#" style="${style(19, '2px 5px 12px 7px')}")` +
        '  ' +
        `[A](#" style="${style(24, '12px 12px 2px 2px')}")` +
        '\n\n',
    );
  });

  it('字級換算：45～70 對應 16～24 時 57 → 19、70 → 24、45 → 16；a＝b 一律最小；不對調', () => {
    expect(roll20Size(57, 45, 70, 16, 24)).toBe(19);
    expect(roll20Size(70, 45, 70, 16, 24)).toBe(24);
    expect(roll20Size(45, 45, 70, 16, 24)).toBe(16);
    expect(roll20Size(30, 30, 30, 16, 24)).toBe(16);
    /* 最小大於最大：大字反而變小（取整數部分） */
    expect(roll20Size(70, 45, 70, 24, 16)).toBe(16);
    expect(roll20Size(57, 45, 70, 24, 16)).toBe(20);
  });

  it('基本字型開：每個字從 Batang、Dotum、Gungsuh 隨機挑；每次複製都重新挑', () => {
    const layout = { a: 45, b: 70, lines: [line(Array.from({ length: 60 }, () => piece()))] };
    const families = (seed: number) =>
      [
        ...toRoll20(layout, { basic: true, min: 16, max: 24 }, createRandom(seed)).matchAll(
          /font-family: ([^;]+);/g,
        ),
      ].map((m) => m[1]);
    const a = families(1);
    expect(a).toHaveLength(60);
    expect(new Set(a)).toEqual(new Set(ROLL20_BASIC_FONTS.map((f) => `${f}, sans-serif`)));
    expect(families(2)).not.toEqual(a);
  });

  it('連結語法的特殊字元改成全形（主控裁定：跳脫）；系統字型只寫 sans-serif', () => {
    expect(roll20Text('[x]("y")')).toBe('［x］（＂y＂）');
    const layout = { a: 45, b: 70, lines: [line([piece({ ch: ']', font: SYSTEM_SANS })])] };
    const text = toRoll20(layout, { basic: false, min: 16, max: 24 }, createRandom(1));
    expect(text.startsWith('[］](#" style="')).toBe(true);
    expect(text).toContain('font-family: sans-serif;');
  });
});

describe('與排版一致', () => {
  const measure: MeasureFn = (_ch, _f, size) => size;
  const input: LayoutInput = {
    text: '今晚 12 點\n\n舊鐘樓<見>',
    emptyText: '',
    a: 45,
    b: 70,
    width: 800,
    autoWidth: false,
    align: 'center',
    fonts: [
      { family: 'Noto Sans TC', weight: 900 },
      { family: 'Black Han Sans', weight: 400 },
    ],
    palettes: [
      { bg: '#161616', fg: '#f4efe4' },
      { bg: '#f5d327', fg: '#171717' },
    ],
  };
  const layout = layoutCollage(input, createRandom(42), measure);
  const all = layout.lines.flatMap((l) => l.items.filter((i): i is Piece => i.kind === 'piece'));

  it('HTML：每張紙片的角度、字級 × 0.55、底色、字色、四角百分比都對得上；空白與換行的對應', () => {
    const html = toHtml(layout, 'left');
    const re =
      /<span style="display: inline-block; transform: rotate\((-?\d+)deg\);[^"]*"><span style="display: inline-block; font-family: '([^']+)', sans-serif; font-size: (\d+)px; background: (#[0-9a-f]{6}); color: (#[0-9a-f]{6}); clip-path: polygon\(([^)]*)\);[^"]*">([^<]*)<\/span><\/span>/g;
    const found = [...html.matchAll(re)];
    expect(found).toHaveLength(all.length);
    found.forEach((m, i) => {
      const p = all[i];
      expect(Number(m[1])).toBe(p.rotate);
      expect(m[2]).toBe(p.font.family);
      expect(Number(m[3])).toBe(Math.round(p.size * 0.55));
      expect([m[4], m[5]]).toEqual([p.bg, p.fg]);
      expect(m[6]).toBe(clipPolygon(p.insets));
    });
    expect(found.map((m) => m[7]).join('')).toBe('今晚12點舊鐘樓&lt;見&gt;');
    expect(html.match(/&nbsp;&nbsp;/g)).toHaveLength(2);
    expect(html.match(/<br>\n/g)).toHaveLength(layout.lines.length);
  });

  it('Roll20：字級換算、底色、字色、圓角與排版一致；行數相同', () => {
    const text = toRoll20(layout, { basic: false, min: 16, max: 24 }, createRandom(1));
    const re =
      /\[([^\]]*)\]\(#" style="text-decoration: none; display: inline-block; font-family: ([^;]+), sans-serif; font-size: (\d+)px; line-height: 1\.2; background-color: (#[0-9a-f]{6}); color: (#[0-9a-f]{6}); padding: 5px; border-radius: (\d+)px (\d+)px (\d+)px (\d+)px; margin: 2px; font-weight: bold; box-shadow: 2px 3px 5px #333333;"\)/g;
    const found = [...text.matchAll(re)];
    expect(found).toHaveLength(all.length);
    found.forEach((m, i) => {
      const p = all[i];
      expect(m[1]).toBe(p.ch);
      expect(m[2]).toBe(p.font.family);
      expect(Number(m[3])).toBe(Math.trunc(16 + ((p.size - 45) / 25) * 8));
      expect([m[4], m[5]]).toEqual([p.bg, p.fg]);
      expect(m.slice(6, 10).map(Number)).toEqual([...p.radii]);
    });
    expect(text.split('\n')).toHaveLength(layout.lines.length + 1);
    expect(text.endsWith('\n')).toBe(true);
    /* 同一份排版複製兩次：除了基本字型，其他值不變 */
    expect(toRoll20(layout, { basic: false, min: 16, max: 24 }, createRandom(9))).toBe(text);
  });
});

describe('其他', () => {
  it('檔名：calling_card_＋毫秒時間戳', () => {
    expect(exportFileName('png', 1790873129562)).toBe('calling_card_1790873129562.png');
    expect(exportFileName('jpg', 1790873129562)).toBe('calling_card_1790873129562.jpg');
    expect(exportFileName('png')).toMatch(/^calling_card_\d{13}\.png$/);
  });

  it('紙張斑點數量約 寬 × 高 ÷ 150', () => {
    expect(speckCount(800, 348)).toBe(1856);
    expect(speckCount(1500, 257)).toBe(2570);
  });
});
