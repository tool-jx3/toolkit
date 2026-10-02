/**
 * 匿名拼貼信產生器：數值欄、版面幾何（規格 3.1）、換行與空白（F26～F30）、拼貼片的統計分布（3.2）、內建配色與字型。
 * 量字寬用假的量法（漢字＝字級、半形＝0.6 倍、Tab／零寬＝量不到），結果與字型無關。
 */
import { describe, expect, it } from 'vitest';
import { contrastRatio, parseColor, relativeLuminance } from '@/core/color';
import { findGoogleFont } from '@/core/fonts';
import { createRandom, type Random } from '@/core/timeline';
import {
  activeFonts,
  activePalettes,
  type CollageLayout,
  firstMidOf,
  imageHeightOf,
  type LayoutInput,
  layoutCollage,
  layoutText,
  lineHeightOf,
  MARGIN,
  MAX_CANVAS_SIDE,
  type MeasureFn,
  type Piece,
  parseIntField,
  parseSeedParam,
  pieceCorners,
  resolveRoll20Range,
  resolveSizeRange,
  resolveWidth,
  SIZE_LIMIT,
  SYSTEM_SANS,
  WIDTH_LIMIT,
} from '@/tools/collage-letter/collage';
import { DEFAULT_FONTS, DEFAULT_PALETTES } from '@/tools/collage-letter/presets';

const measure: MeasureFn = (ch, _font, size) => {
  if (ch === '\t' || ch === '​') return 0;
  return /^[ -~]$/.test(ch) ? size * 0.6 : size;
};

const FONTS = Array.from({ length: 10 }, (_, i) => ({ family: `Font ${i}`, weight: 400 }));
const PALETTES = Array.from({ length: 8 }, (_, i) => ({ bg: `#00000${i}`, fg: '#ffffff' }));

const input = (over: Partial<LayoutInput> = {}): LayoutInput => ({
  text: '一二三',
  emptyText: '請輸入信件內容',
  a: 45,
  b: 70,
  width: 800,
  autoWidth: false,
  align: 'center',
  fonts: FONTS,
  palettes: PALETTES,
  ...over,
});

const lay = (over: Partial<LayoutInput> = {}, seed = 1) =>
  layoutCollage(input(over), createRandom(seed), measure);

const pieces = (l: CollageLayout): Piece[] =>
  l.lines.flatMap((line) => line.items.filter((it): it is Piece => it.kind === 'piece'));

/** 不含行尾間隔的行寬（最後一張紙片的右緣；規格 3.10 第 1 點依主控裁定 7.1 改寫） */
const contentWidth = (line: CollageLayout['lines'][number]) => {
  const last = line.items.at(-1);
  return last?.kind === 'piece' ? line.width - last.gap : line.width;
};

/** 每個隨機量都取最小值的亂數：紙片寬＝字寬＋20、間隔＝2，方便算出剛好的寬度 */
const minRandom: Random = {
  next: () => 0,
  range: (min) => min,
  int: (min) => min,
  signed: () => -1,
  pick: (items) => items[0],
};

describe('數值欄（F05、F06、F37）', () => {
  it('取整數部分；空白、0、非數字退回預設', () => {
    expect(parseIntField('45.9', 1)).toBe(45);
    expect(parseIntField('12.7', 1)).toBe(12);
    expect(parseIntField('-20.9', 1)).toBe(-20);
    expect(parseIntField('', 7)).toBe(7);
    expect(parseIntField('   ', 7)).toBe(7);
    expect(parseIntField('0', 7)).toBe(7);
    expect(parseIntField('0.5', 7)).toBe(7);
    expect(parseIntField('-0.5', 7)).toBe(7);
    expect(parseIntField('abc', 7)).toBe(7);
  });

  it('科學記號只讀開頭的整數部分（主控裁定 7.1：1e2 → 1）', () => {
    expect(parseIntField('1e2', 7)).toBe(1);
    expect(parseIntField('3e1', 7)).toBe(3);
    expect(parseIntField('1.5e3', 7)).toBe(1);
    expect(parseIntField('-2e1', 7)).toBe(-2);
    expect(parseIntField('0e5', 7)).toBe(7);
    expect(parseIntField(' 45 ', 7)).toBe(45);
    /* 讀到的整數再夾進合理範圍：2e3 → 2 → 寬度下限 100（不是 2000） */
    expect(resolveWidth('2e3')).toBe(100);
    expect(resolveWidth('1500e0')).toBe(1500);
    expect(resolveSizeRange('30', '1e2')).toEqual({ a: 8, b: 30 });
    expect(resolveRoll20Range('2e1', '3e1')).toEqual({ min: 8, max: 8 });
  });

  it('限制在合理範圍（主控裁定）：字級 8～200、寬度 100～4000', () => {
    expect(parseIntField('-5', 45, SIZE_LIMIT)).toBe(8);
    expect(parseIntField('999', 45, SIZE_LIMIT)).toBe(200);
    expect(resolveWidth('50')).toBe(100);
    expect(resolveWidth('-800')).toBe(100);
    expect(resolveWidth('99999')).toBe(WIDTH_LIMIT.max);
    expect(resolveWidth('1500.7')).toBe(1500);
    expect(resolveWidth('')).toBe(800);
    expect(resolveWidth('0')).toBe(800);
  });

  it('字級範圍：最小大於最大時對調使用；空白時 45～70', () => {
    expect(resolveSizeRange('80', '40')).toEqual({ a: 40, b: 80 });
    expect(resolveSizeRange('', '')).toEqual({ a: 45, b: 70 });
    expect(resolveSizeRange('0', 'abc')).toEqual({ a: 45, b: 70 });
    expect(resolveSizeRange('30', '30')).toEqual({ a: 30, b: 30 });
    expect(resolveSizeRange('100', '')).toEqual({ a: 70, b: 100 });
  });

  it('Roll20 字級範圍：不對調；空白、0 時 16～24', () => {
    expect(resolveRoll20Range('30', '10')).toEqual({ min: 30, max: 10 });
    expect(resolveRoll20Range('', '0')).toEqual({ min: 16, max: 24 });
    expect(resolveRoll20Range('12.9', '45.2')).toEqual({ min: 12, max: 45 });
  });

  it('測試用種子 ?seed=<整數>', () => {
    expect(parseSeedParam('?seed=123')).toBe(123);
    expect(parseSeedParam('?seed=0')).toBe(0);
    expect(parseSeedParam('?seed=abc')).toBeNull();
    expect(parseSeedParam('?seed=-1')).toBeNull();
    expect(parseSeedParam('')).toBeNull();
    expect(parseSeedParam('?seed=99999999999')).toBeNull();
  });
});

describe('版面幾何（規格 3.1、F29）', () => {
  it('行距＝最大字級 × 1.3、第一行中線＝40＋最大字級的一半、高＝中線＋行數 × 行距', () => {
    expect(lineHeightOf(70)).toBe(91);
    expect(firstMidOf(70)).toBe(75);
    expect([1, 2, 3, 4].map((n) => imageHeightOf(70, n))).toEqual([166, 257, 348, 439]);
  });

  it('行距取整數部分（無條件捨去，主控裁定 7.1）：45 → 58、49 → 63、55 → 71', () => {
    /* 這些值四捨五入會多 1（59、64、72） */
    expect(lineHeightOf(45)).toBe(58);
    expect(lineHeightOf(49)).toBe(63);
    expect(lineHeightOf(55)).toBe(71);
    expect(lineHeightOf(42)).toBe(54);
    expect(lineHeightOf(30)).toBe(39);
    /* 3 行：b＝45 → 236.5、b＝55 → 280.5（舊版實測） */
    expect(imageHeightOf(45, 3)).toBe(236.5);
    expect(imageHeightOf(55, 3)).toBe(280.5);
    /* 字級 8～200 全部與整數運算的 ⌊b × 13 ÷ 10⌋ 相同 */
    for (let b = SIZE_LIMIT.min; b <= SIZE_LIMIT.max; b++)
      expect(lineHeightOf(b), String(b)).toBe(Math.floor((b * 13) / 10));
  });

  it('最大字級 45、3 行：行距 58，中線 62.5、120.5、178.5，高 236.5（畫布 236）', () => {
    const l = lay({ text: '一\n二\n三', a: 45, b: 45 });
    expect(l.lineHeight).toBe(58);
    expect(l.lines.map((x) => x.mid)).toEqual([62.5, 120.5, 178.5]);
    expect([l.height, l.canvasHeight]).toEqual([236.5, 236]);
  });

  it('「一二三／空行／四五六」、預設 45～70、800：800 × 348，三行中線 75、166、257', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const l = lay({ text: '一二三\n\n四五六' }, seed);
      expect([l.width, l.height, l.canvasWidth, l.canvasHeight]).toEqual([800, 348, 800, 348]);
      expect(l.lines.map((x) => x.mid)).toEqual([75, 166, 257]);
      expect(l.lines[1].items).toEqual([]);
      for (const p of pieces(l)) expect(p.y).toBe(l.lines.find((x) => x.items.includes(p))?.mid);
    }
  });

  it('字級 30～30：800 × 172，中線 55、94、133', () => {
    const l = lay({ text: '一\n\n二', a: 30, b: 30 });
    expect([l.width, l.height]).toEqual([800, 172]);
    expect(l.lines.map((x) => x.mid)).toEqual([55, 94, 133]);
    for (const p of pieces(l)) expect(p.size).toBe(30);
  });

  it('字級欄 80、40（對調成 40～80）：800 × 392，第一行中線 80', () => {
    const { a, b } = resolveSizeRange('80', '40');
    const l = lay({ text: '一\n\n二', a, b });
    expect([l.width, l.height, l.firstMid]).toEqual([800, 392, 80]);
  });

  it('最大字級是奇數時高度帶 0.5，畫布取整數部分', () => {
    const l = lay({ text: '一', a: 45, b: 71 });
    expect(l.lineHeight).toBe(92);
    expect(l.firstMid).toBe(75.5);
    expect(l.height).toBe(167.5);
    expect(l.canvasHeight).toBe(167);
  });

  it('行距與高度只看最大字級，與實際抽到的字級無關', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const l = lay({ text: '一二\n三', a: 10, b: 70 }, seed);
      expect(l.height).toBe(257);
    }
  });

  it('30 個漢字、自動寬度：一行，寬＝最寬一行＋80（無條件進位），高 166', () => {
    const text = '永'.repeat(30);
    for (let seed = 1; seed <= 20; seed++) {
      const l = lay({ text, autoWidth: true }, seed);
      expect(l.lines).toHaveLength(1);
      expect(l.height).toBe(166);
      expect(l.width).toBe(Math.ceil(l.lines[0].width + 80));
      /* 置中：(寬 − 行寬) ÷ 2，只差無條件進位的零頭 */
      expect(l.lines[0].left).toBeGreaterThanOrEqual(MARGIN);
      expect(l.lines[0].left).toBeLessThan(MARGIN + 0.5);
    }
  });

  it('自動寬度：各行依最寬一行的圖片寬對齊', () => {
    const l = lay({ text: '一二三四五\n六', autoWidth: true, align: 'right' });
    const [long, short] = l.lines;
    expect(long.left).toBeGreaterThanOrEqual(MARGIN);
    expect(long.left).toBeLessThan(MARGIN + 1);
    expect(long.left + long.width).toBeCloseTo(l.width - MARGIN, 9);
    expect(short.left).toBeCloseTo(l.width - MARGIN - short.width, 9);
  });

  it('寬 200：每個字各佔一行', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const l = lay({ text: '一二三', width: 200 }, seed);
      expect(l.lines.map((x) => x.items.length)).toEqual([1, 1, 1]);
      expect(l.height).toBe(348);
    }
  });

  it('寬 1500、30 個漢字：不含行尾間隔的行寬 ≤ 可用寬度，且加上下一行第一張的紙片寬就會超過（逐字換行）', () => {
    const text = '永'.repeat(30);
    for (let seed = 1; seed <= 50; seed++) {
      const l = lay({ text, width: 1500 }, seed);
      expect(l.width).toBe(1500);
      expect(l.height).toBe(imageHeightOf(70, l.lines.length));
      for (let k = 0; k < l.lines.length; k++) {
        const line = l.lines[k];
        expect(contentWidth(line)).toBeLessThanOrEqual(1420);
        const next = l.lines[k + 1];
        if (next) expect(line.width + next.items[0].width).toBeGreaterThan(1420);
      }
      expect(pieces(l)).toHaveLength(30);
    }
  });

  it('換行判斷不算行尾間隔（主控裁定 7.1）：行寬＋紙片寬剛好等於可用寬度、加上間隔才超過時不換行', () => {
    /* 字級 50、紙片寬 70、間隔 2：「一二」＝72＋70＝142（含第二張的間隔是 144） */
    const at = (width: number, text = '一二', align: LayoutInput['align'] = 'center') =>
      layoutCollage(input({ text, a: 50, b: 50, width, align }), minRandom, measure);
    const fit = at(80 + 142);
    expect(fit.lines.map((x) => x.items.length)).toEqual([2]);
    expect(contentWidth(fit.lines[0])).toBe(142);
    expect(fit.lines[0].width).toBe(144);
    /* 行寬（含間隔）比可用寬度多 2：從左留白開始，最後一張的右緣剛好貼齊右留白 */
    expect(fit.lines[0].left).toBe(MARGIN);
    const last = fit.lines[0].items[1] as Piece;
    expect(last.x + last.width / 2).toBe(fit.width - MARGIN);
    /* 少 1 px 就換行 */
    expect(at(80 + 141).lines.map((x) => x.items.length)).toEqual([1, 1]);
    /* 三張：72＋72＋70＝214 */
    expect(at(80 + 214, '一二三').lines.map((x) => x.items.length)).toEqual([3]);
    expect(at(80 + 213, '一二三').lines.map((x) => x.items.length)).toEqual([2, 1]);
    /* 空白沒有間隔：「一 二」＝72＋20＋70＝162 */
    expect(at(80 + 162, '一 二').lines.map((x) => x.items.length)).toEqual([3]);
    expect(at(80 + 161, '一 二').lines.map((x) => x.items.length)).toEqual([2, 1]);
  });

  it('隨機排版：每行最後一張紙片的右緣不超出可用寬度，只有看不見的間隔會超出', () => {
    const text = `${'天地玄黃宇宙洪荒日月盈昃辰宿列張'.repeat(3)} The quick brown fox jumps over the lazy dog`;
    let gapOverflow = 0;
    let breaks = 0;
    for (const width of [300, 800, 1234]) {
      for (let seed = 1; seed <= 30; seed++) {
        const l = lay({ text, width }, seed);
        const avail = width - 2 * MARGIN;
        l.lines.forEach((line, k) => {
          if (line.items.length > 1) expect(contentWidth(line)).toBeLessThanOrEqual(avail);
          if (line.width > avail && contentWidth(line) <= avail) gapOverflow++;
          const next = l.lines[k + 1];
          if (next) {
            breaks++;
            expect(line.width + next.items[0].width).toBeGreaterThan(avail);
          }
        });
      }
    }
    expect(breaks).toBeGreaterThan(100);
    expect(gapOverflow).toBeGreaterThan(0);
  });

  it('一張紙片比可用寬度還寬時獨佔一行（超出畫布），左緣不小於左留白', () => {
    const l = lay({ text: '一二', width: 100, align: 'right' });
    expect(l.lines).toHaveLength(2);
    for (const line of l.lines) {
      expect(line.width).toBeGreaterThan(20);
      expect(line.left).toBe(MARGIN);
    }
  });

  it('空白內容：用提示文字排版；只有空白字元時照常排版（沒有紙片）', () => {
    const empty = lay({ text: '' });
    expect(empty.text).toBe('請輸入信件內容');
    expect(empty.pieceCount).toBe(Array.from('請輸入信件內容').length);
    const blank = lay({ text: '   ' });
    expect(blank.pieceCount).toBe(0);
    expect(blank.lines).toHaveLength(1);
    expect(blank.lines[0].width).toBeCloseTo(3 * 70 * 0.4, 9);
    expect(layoutText('a\r\nb\rc', 'x')).toBe('a\nb\nc');
  });

  it('連續換行產生空行；結尾的換行多出一個空行', () => {
    expect(lay({ text: '一\n' }).lines).toHaveLength(2);
    expect(lay({ text: '\n\n' }).lines).toHaveLength(3);
    expect(lay({ text: '一\n\n\n二' }).lines.map((x) => x.items.length)).toEqual([1, 0, 0, 1]);
  });
});

describe('空白字元與切字（F26、F45）', () => {
  it('半形空白不產生紙片，只佔最大字級 × 0.4；連續空白累加', () => {
    const l = lay({ text: '一  二' });
    const items = l.lines[0].items;
    expect(items.map((x) => x.kind)).toEqual(['piece', 'space', 'space', 'piece']);
    expect(items[1].width).toBe(28);
    expect(items[2].width).toBe(28);
    expect(l.pieceCount).toBe(2);
    /* 空白的位置緊接在前一張紙片（含間隔）之後 */
    const p = items[0] as Piece;
    expect(items[1].x).toBeCloseTo(p.x + p.width / 2 + p.gap, 9);
    expect(items[2].x).toBeCloseTo(items[1].x + 28, 9);
  });

  it('全形空白、Tab 當成一般字，產生空白的紙片；字寬量不到時以字級的 0.8 倍計', () => {
    const l = lay({ text: '　\t' });
    const [full, tab] = pieces(l);
    expect(full.ch).toBe('　');
    expect(full.textWidth).toBe(full.size);
    expect(tab.ch).toBe('\t');
    expect(tab.textWidth).toBe(tab.size * 0.8);
  });

  it('以字素切字：表情符號、國旗、組合字元各是一張紙片（主控裁定）', () => {
    const l = lay({ text: '🎲👍🏽👨‍👩‍👧🇹🇼é𪜶', autoWidth: true });
    expect(pieces(l).map((p) => p.ch)).toEqual(['🎲', '👍🏽', '👨‍👩‍👧', '🇹🇼', 'é', '𪜶']);
  });

  it('造成換行的空白留在新行的開頭（佔寬度）', () => {
    /* a＝b＝70：紙片佔 92～108；可用寬度 110 → 紙片＋空白 ≥ 120 一定換行 */
    const l = lay({ text: '一 二', a: 70, b: 70, width: 190 });
    expect(l.lines.map((x) => x.items.map((it) => it.kind))).toEqual([
      ['piece'],
      ['space'],
      ['piece'],
    ]);
    expect(l.lines[1].width).toBe(28);
  });
});

describe('對齊（F30）', () => {
  const text = '一二三';
  it('靠左：從左留白開始；置中：行置中；靠右：右端貼齊右留白', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const left = lay({ text, align: 'left' }, seed).lines[0];
      expect(left.left).toBe(40);
      const center = lay({ text, align: 'center' }, seed).lines[0];
      expect(center.left).toBeCloseTo((800 - center.width) / 2, 9);
      const right = lay({ text, align: 'right' }, seed).lines[0];
      expect(right.left + right.width).toBeCloseTo(760, 9);
      /* 行寬含最後一張之後的間隔：置中、靠右的實際內容偏左 2～8 px */
      const last = right.items.at(-1) as Piece;
      const gapRight = 760 - (last.x + last.width / 2);
      expect(gapRight).toBe(last.gap);
      expect(gapRight).toBeGreaterThanOrEqual(2);
      expect(gapRight).toBeLessThanOrEqual(8);
    }
  });

  it('紙片的中心：行的左緣＋前面的紙片寬、間隔、空白＋自己的半寬', () => {
    const l = lay({ text: '一二 三', align: 'left' });
    const [a, b, , c] = l.lines[0].items as Piece[];
    expect(a.x).toBeCloseTo(40 + a.width / 2, 9);
    expect(b.x).toBeCloseTo(40 + a.width + a.gap + b.width / 2, 9);
    expect(c.x).toBeCloseTo(40 + a.width + a.gap + b.width + b.gap + 28 + c.width / 2, 9);
  });
});

describe('拼貼片的分布（規格 3.2：86 字 × 40 次）', () => {
  const text = `${'天地玄黃宇宙洪荒日月盈昃辰宿列張寒來暑往秋收冬藏閏餘成歲律呂調陽雲騰致雨露結為霜'}abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRST`;
  const all: Piece[] = [];
  for (let seed = 0; seed < 40; seed++) all.push(...pieces(lay({ text, autoWidth: true }, seed)));
  const median = (xs: number[]) => {
    const s = [...xs].sort((x, y) => x - y);
    return s[Math.floor(s.length / 2)];
  };
  const range = (xs: number[]) => [Math.min(...xs), Math.max(...xs)];
  const ints = (xs: number[]) => xs.every((x) => Number.isInteger(x));

  it('共 3,440 張', () => {
    expect(Array.from(text)).toHaveLength(86);
    expect(all).toHaveLength(3440);
  });

  it('旋轉：−18～18 的整數，中位約 0', () => {
    const r = all.map((p) => p.rotate);
    expect(ints(r)).toBe(true);
    expect(range(r)).toEqual([-18, 18]);
    expect(Math.abs(median(r))).toBeLessThanOrEqual(2);
  });

  it('字級：45～70 的整數，中位約 57.5', () => {
    const s = all.map((p) => p.size);
    expect(ints(s)).toBe(true);
    expect(range(s)).toEqual([45, 70]);
    expect(Math.abs(median(s) - 57.5)).toBeLessThanOrEqual(5.75);
  });

  it('紙片寬 − 字寬：20～30 的整數；紙片高 − 字級：15～30 的整數', () => {
    const w = all.map((p) => Math.round((p.width - p.textWidth) * 1e6) / 1e6);
    expect(ints(w)).toBe(true);
    expect(range(w)).toEqual([20, 30]);
    expect(Math.abs(median(w) - 25)).toBeLessThanOrEqual(2.5);
    const h = all.map((p) => p.height - p.size);
    expect(ints(h)).toBe(true);
    expect(range(h)).toEqual([15, 30]);
    expect(Math.abs(median(h) - 22.5)).toBeLessThanOrEqual(2.25);
  });

  it('四角內縮：0～20%、四角獨立，中位約 0.10', () => {
    const v = all.flatMap((p) => [...p.insets]);
    expect(Math.min(...v)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...v)).toBeLessThan(0.2);
    expect(Math.max(...v)).toBeGreaterThan(0.19);
    expect(Math.abs(median(v) - 0.1)).toBeLessThanOrEqual(0.01);
    /* 紙片不是正矩形 */
    expect(all.filter((p) => p.insets.every((x) => x === 0))).toHaveLength(0);
  });

  it('間隔：2～8 的整數，中位約 5；Roll20 圓角 2～12 的整數', () => {
    const g = all.map((p) => p.gap);
    expect(ints(g)).toBe(true);
    expect(range(g)).toEqual([2, 8]);
    expect(Math.abs(median(g) - 5)).toBeLessThanOrEqual(0.5);
    const r = all.flatMap((p) => [...p.radii]);
    expect(ints(r)).toBe(true);
    expect(range(r)).toEqual([2, 12]);
  });

  it('字型、配色：勾選的平均分配', () => {
    const count = (key: (p: Piece) => string) => {
      const m = new Map<string, number>();
      for (const p of all) m.set(key(p), (m.get(key(p)) ?? 0) + 1);
      return [...m.values()].map((n) => n / all.length);
    };
    const fonts = count((p) => p.font.family);
    expect(fonts).toHaveLength(10);
    for (const share of fonts) expect(Math.abs(share - 0.1)).toBeLessThan(0.025);
    const pals = count((p) => p.bg);
    expect(pals).toHaveLength(8);
    for (const share of pals) expect(Math.abs(share - 0.125)).toBeLessThan(0.025);
  });

  it('同一個種子得到同樣的排版；換種子就不同', () => {
    expect(lay({ text }, 7)).toEqual(lay({ text }, 7));
    expect(lay({ text }, 7)).not.toEqual(lay({ text }, 8));
  });
});

describe('全部未勾選（F12、F15）與清單', () => {
  it('配色全部未勾選：用清單的第一組（即使它沒勾）', () => {
    const off = DEFAULT_PALETTES.map((p) => ({ ...p, enabled: false }));
    expect(activePalettes(off)).toEqual([{ bg: off[0].a, fg: off[0].b }]);
    const some = DEFAULT_PALETTES.map((p, i) => ({ ...p, enabled: i === 3 || i === 5 }));
    expect(activePalettes(some)).toEqual([
      { bg: some[3].a, fg: some[3].b },
      { bg: some[5].a, fg: some[5].b },
    ]);
    const l = layoutCollage(
      input({ text: '一二三四五六七八', palettes: activePalettes(off) }),
      createRandom(3),
      measure,
    );
    expect(new Set(pieces(l).map((p) => p.bg))).toEqual(new Set([off[0].a]));
  });

  it('字型全部未勾選：一律用系統的無襯線字型', () => {
    const off = DEFAULT_FONTS.map((f) => ({ ...f, enabled: false }));
    expect(activeFonts(off)).toEqual([SYSTEM_SANS]);
    const l = layoutCollage(
      input({ text: '一二三', fonts: activeFonts(off) }),
      createRandom(3),
      measure,
    );
    for (const p of pieces(l)) expect(p.font.generic).toBe(true);
  });

  it('內建配色 8 組全選：深底淺字 4 組、淺底深字 4 組', () => {
    expect(DEFAULT_PALETTES).toHaveLength(8);
    expect(DEFAULT_PALETTES.every((p) => p.enabled && !p.custom)).toBe(true);
    const lum = (c: string) => relativeLuminance(parseColor(c)!);
    const dark = DEFAULT_PALETTES.filter((p) => lum(p.a) < lum(p.b));
    expect(dark).toHaveLength(4);
    /* 字在紙片上看得清楚 */
    for (const p of DEFAULT_PALETTES) expect(contrastRatio(p.b, p.a), p.name).toBeGreaterThan(4.5);
    expect(new Set(DEFAULT_PALETTES.map((p) => p.id)).size).toBe(8);
  });

  it('內建字型 15 套：都在 Google 字型目錄裡；繁中 5 套、預設勾選其中 3 套；其他 10 套全勾', () => {
    expect(DEFAULT_FONTS).toHaveLength(15);
    for (const f of DEFAULT_FONTS) {
      const entry = findGoogleFont(f.font.family);
      expect(entry, f.font.family).toBeDefined();
      expect(entry?.weights).toContain(f.font.weight);
    }
    const tc = DEFAULT_FONTS.filter((f) => findGoogleFont(f.font.family)?.scripts.includes('tc'));
    expect(tc).toHaveLength(5);
    expect(tc.filter((f) => f.enabled).map((f) => f.font.family)).toEqual([
      'Noto Sans TC',
      'Noto Serif TC',
      'LXGW WenKai TC',
    ]);
    const others = DEFAULT_FONTS.filter((f) => !tc.includes(f));
    expect(others.every((f) => f.enabled)).toBe(true);
    expect(others.map((f) => f.font.family)).toEqual(
      expect.arrayContaining([
        'Black Han Sans',
        'Do Hyeon',
        'DotGothic16',
        'Jua',
        'Permanent Marker',
        'Rampart One',
      ]),
    );
  });
});

describe('紙片的四邊形', () => {
  it('四個角各自往內縮（以紙片中心為原點）', () => {
    const base = { width: 100, height: 60 };
    expect(pieceCorners({ ...base, insets: [0, 0, 0, 0, 0, 0, 0, 0] })).toEqual([
      [-50, -30],
      [50, -30],
      [50, 30],
      [-50, 30],
    ]);
    expect(
      pieceCorners({ ...base, insets: [0.2, 0.1, 0.2, 0.1, 0.2, 0.1, 0.2, 0.1] }).map((c) =>
        c.map((v) => Math.round(v * 1e6) / 1e6),
      ),
    ).toEqual([
      [-40, -27],
      [40, -27],
      [40, 27],
      [-40, 27],
    ]);
  });

  it('畫布邊長超過上限時標記為裁切', () => {
    const l = lay({ text: '永'.repeat(300), autoWidth: true });
    expect(l.width).toBeGreaterThan(MAX_CANVAS_SIDE);
    expect(l.canvasWidth).toBe(MAX_CANVAS_SIDE);
    expect(l.clipped).toBe(true);
    expect(lay({ text: '永' }).clipped).toBe(false);
    /* 總像素上限：寬 4000 時最多 10,000 px 高 */
    const tall = lay({ text: '永\n'.repeat(150), width: 4000 });
    expect(tall.height).toBeGreaterThan(10000);
    expect([tall.canvasWidth, tall.canvasHeight]).toEqual([4000, 10000]);
    expect(tall.clipped).toBe(true);
  });
});
