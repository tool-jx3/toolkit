/**
 * 文字方框產生器的排版核心：字寬、換行、補白、數值解析的規則，以及隨機輸入的性質測試。
 * （附件逐字比對在 textbox-examples.test.ts）
 */
import { describe, expect, it } from 'vitest';
import { createRandom } from '@/core/timeline';
import {
  BORDERS,
  type Calibration,
  CCFOLIA_METRICS,
  charWidth,
  customMetrics,
  DEFAULT_INPUT,
  type Metrics,
  MONO_METRICS,
  padTo,
  parseLimit,
  parseRatio,
  parseTable,
  renderTextbox,
  resolveMetrics,
  type TextboxInput,
  textWidth,
  wrapText,
} from '@/tools/textbox/layout';

const cp = (s: string) => s.codePointAt(0)!;

describe('字寬（3.1）', () => {
  it('CCFOLIA 校準的比例（以框線字元＝1）至少 4 位小數與規格相符', () => {
    const m = CCFOLIA_METRICS;
    const ratio = (w: number) => Number((w / m.border).toFixed(4));
    expect(ratio(charWidth(cp('漢'), m))).toBe(1.3025);
    expect(ratio(charWidth(cp('ㅋ'), m))).toBe(1.2185);
    expect(ratio(charWidth(cp(' '), m))).toBe(0.3697);
    expect(ratio(charWidth(cp('A'), m))).toBe(0.7815);
    expect(ratio(charWidth(cp('🎲'), m))).toBe(1.563);
  });

  it('寬字的範圍與常見的例外', () => {
    const m = MONO_METRICS;
    for (const ch of [
      '，',
      '。',
      '「',
      'あ',
      'ア',
      'ㄅ',
      '한',
      '！',
      '～',
      '　',
      '𪜶',
      '豈',
      '︐',
      '﹏',
      '￥',
    ])
      expect(charWidth(cp(ch), m), ch).toBe(2);
    for (const ch of ['ｱ', '…', '—', '→', '≦', '♪', '─', '═', '│', '\t', 'a', '1'])
      expect(charWidth(cp(ch), m), ch).toBe(1);
    expect(charWidth(0xa0, CCFOLIA_METRICS)).toBe(CCFOLIA_METRICS.space);
    /* 韓文字母在 CCFOLIA 校準有自己的寬度，韓文音節是一般寬字 */
    expect(charWidth(cp('ᄀ'), CCFOLIA_METRICS)).toBe(CCFOLIA_METRICS.jamo);
    expect(charWidth(cp('한'), CCFOLIA_METRICS)).toBe(CCFOLIA_METRICS.wide);
    /* 基本平面以外、又不是寬字：兩個「其他」 */
    expect(charWidth(cp('🎲'), CCFOLIA_METRICS)).toBe(2 * CCFOLIA_METRICS.other);
  });

  it('逐碼位計寬：擴充 B 漢字是一個寬字', () => {
    expect(Array.from('𪜶')).toHaveLength(1);
    expect(textWidth('𪜶', MONO_METRICS)).toBe(2);
    expect(textWidth('a𪜶b', MONO_METRICS)).toBe(4);
  });

  it('自訂比例換算成整數：2.66 與 2.12 沒有浮點誤差', () => {
    const m = customMetrics(2.66, 2.12);
    expect(m.wide).toBe(2_660_000);
    expect(m.border).toBe(2_120_000);
    expect(m.emptyTableWidth).toBe(5);
  });
});

describe('換行（3.2）', () => {
  const m = MONO_METRICS;
  it('逐字斷行、英文單字也會切開、每行至少一個字', () => {
    expect(wrapText('abcdef', 4, m)).toEqual(['abcd', 'ef']);
    expect(wrapText('一二三', 3, m)).toEqual(['一', '二', '三']);
    expect(wrapText('一', 1, m)).toEqual(['一']);
  });
  it('空行與只有空白的行變成空字串；行首的半形空白保留', () => {
    expect(wrapText('a\n\n 　\t\nb', 10, m)).toEqual(['a', '', '', 'b']);
    expect(wrapText('  a', 10, m)).toEqual(['  a']);
  });
  it('不切開表情符號與擴充 B 漢字', () => {
    expect(wrapText('a🎲b', 2, m)).toEqual(['a', '🎲', 'b']);
    expect(wrapText('𪜶𪜶', 3, m)).toEqual(['𪜶', '𪜶']);
  });
});

describe('補白（3.3）', () => {
  const m = MONO_METRICS;
  it('全形為主：先全形空白、再半形空白四捨五入', () => {
    expect(padTo('a', 6, m, 'fullwidth')).toBe('a　　 ');
    expect(padTo('a', 6, m, 'halfwidth')).toBe('a     ');
  });
  it('差額 ≤ 0 時不加也不截斷', () => {
    expect(padTo('abc', 2, m, 'fullwidth')).toBe('abc');
    expect(padTo('abc', 3, m, 'halfwidth')).toBe('abc');
  });
  it('剛好一半時進位', () => {
    const half = customMetrics(2, 1);
    /* 差額 0.5 個半形 → 1 個半形空白 */
    expect(padTo('', 500_000, half, 'halfwidth')).toBe(' ');
    expect(padTo('', 499_999, half, 'halfwidth')).toBe('');
  });
});

describe('數值欄的解析', () => {
  it('寬度上限取整數部分；空白、0、無法解析用退回值；超出微調範圍照用', () => {
    expect(parseLimit('12.9', 24)).toBe(12);
    expect(parseLimit('3e1', 24)).toBe(3);
    expect(parseLimit('', 24)).toBe(24);
    expect(parseLimit('0', 30)).toBe(30);
    expect(parseLimit('abc', 30)).toBe(30);
    expect(parseLimit('5', 24)).toBe(5);
    expect(parseLimit('1000', 24)).toBe(1000);
    expect(parseLimit('-3', 24)).toBe(-3);
  });
  it('自訂比例：小數照用；空白、0、不是數字退回；負數、過大限制並回報', () => {
    expect(parseRatio('2.66', 2)).toEqual({ value: 2.66 });
    expect(parseRatio('', 2)).toEqual({ value: 2 });
    expect(parseRatio('0', 1)).toEqual({ value: 1 });
    expect(parseRatio('x', 1)).toEqual({ value: 1 });
    expect(parseRatio('-1', 1)).toEqual({ value: 1, problem: 'negative' });
    expect(parseRatio('1e-9', 1)).toEqual({ value: 1, problem: 'tooSmall' });
    expect(parseRatio('500', 2)).toEqual({ value: 100, problem: 'tooLarge' });
  });
  it('只有自訂比例才看自訂欄位', () => {
    const bad = { customWide: '-1', customBorder: '-1' };
    expect(resolveMetrics({ calibration: 'ccfolia', ...bad }).warnings).toEqual([]);
    expect(resolveMetrics({ calibration: 'mono', ...bad }).warnings).toEqual([]);
    expect(resolveMetrics({ calibration: 'custom', ...bad }).warnings).toHaveLength(2);
  });
});

describe('表格解析（3.6）', () => {
  it('分隔列只認 - = _ ─；空列忽略；行首行尾的直線多出空欄', () => {
    expect(parseTable('---\n=_─\n- - -\n═══\n\n  \n| a |')).toEqual([
      { kind: 'separator' },
      { kind: 'separator' },
      { kind: 'data', cells: ['- - -'] },
      { kind: 'data', cells: ['═══'] },
      { kind: 'data', cells: ['', 'a', ''] },
    ]);
  });
  it('全形「｜」不是分隔符', () => {
    expect(parseTable('甲｜乙')).toEqual([{ kind: 'data', cells: ['甲｜乙'] }]);
  });
});

/* ---------- 性質測試 ---------- */

const POOL = [
  ...'霧港鐘樓午夜調查員線索日記，。「」！～',
  ...'abcdefgHIJKLM0123456789-_/()',
  ' ',
  ' ',
  '　',
  '\t',
  'ㅋ',
  '한',
  '𪜶',
  '🎲',
  '…',
  '→',
];

function randomText(r: ReturnType<typeof createRandom>, maxLines: number, maxLen: number) {
  const lines: string[] = [];
  const n = r.int(1, maxLines);
  for (let i = 0; i < n; i++) {
    let s = '';
    const len = r.int(0, maxLen);
    for (let k = 0; k < len; k++) s += r.pick(POOL);
    lines.push(s);
  }
  return lines.join('\n');
}

function metricsOf(input: TextboxInput): Metrics {
  return resolveMetrics(input).metrics;
}

/** 去掉每行頭尾的直線，回傳中間的寬度 */
const inner = (line: string) => Array.from(line).slice(1, -1).join('');

describe('性質：隨機輸入', () => {
  const r = createRandom('textbox-property');
  const calibrations: Calibration[] = ['ccfolia', 'mono', 'custom'];

  it('方框：每一行的估計寬度與整行寬差不超過半個半形空白；沒有結尾換行', () => {
    for (let i = 0; i < 1500; i++) {
      const input: TextboxInput = {
        ...DEFAULT_INPUT,
        mode: 'box',
        calibration: r.pick(calibrations),
        customWide: r.pick(['2.66', '2', '3', '1.75']),
        customBorder: r.pick(['2.12', '1', '1.5', '2']),
        line: r.pick(['single', 'double'] as const),
        pad: r.pick(['fullwidth', 'halfwidth'] as const),
        sides: r.next() < 0.5,
        boxWidth: String(r.int(10, 40)),
        title: r.next() < 0.4 ? randomText(r, 1, 30) : '',
        body: `${r.pick(POOL)}${randomText(r, 4, 60)}`,
      };
      const m = metricsOf(input);
      const out = renderTextbox(input);
      expect(out.warnings).toEqual([]);
      expect(out.text.endsWith('\n')).toBe(false);
      const lines = out.text.split('\n');
      const c = BORDERS[input.line];
      const bar = lines[0];
      const n = input.sides ? Array.from(bar).length - 2 : Array.from(bar).length;
      const T = n * m.border;
      expect(n).toBeLessThanOrEqual(Number(input.boxWidth));
      for (const line of lines) {
        if (line.includes(c.h)) continue;
        const w = input.sides ? textWidth(inner(line), m) : textWidth(line, m);
        expect(Math.abs(w - T), JSON.stringify({ input, line })).toBeLessThanOrEqual(m.space / 2);
      }
    }
  });

  it('表格：每一格的估計寬度與欄寬差不超過半個半形空白；欄數一致；沒有結尾換行', () => {
    for (let i = 0; i < 1500; i++) {
      const cols = r.int(1, 4);
      const rows: string[] = [];
      for (let k = r.int(1, 5); k > 0; k--) {
        if (r.next() < 0.15) rows.push(r.pick(['---', '===', '___', '───']));
        else
          rows.push(
            Array.from({ length: r.int(1, cols) }, () => randomText(r, 1, 14).trim()).join(' | '),
          );
      }
      const input: TextboxInput = {
        ...DEFAULT_INPUT,
        mode: 'table',
        calibration: r.pick(calibrations),
        pad: r.pick(['fullwidth', 'halfwidth'] as const),
        line: r.pick(['single', 'double'] as const),
        sides: r.next() < 0.5,
        header: r.next() < 0.5,
        /* 夠寬，不會縮到最小欄寬 */
        tableWidth: '150',
        table: `資料 | 內容\n${rows.join('\n')}`,
      };
      const m = metricsOf(input);
      const out = renderTextbox(input);
      expect(out.text.endsWith('\n')).toBe(false);
      const c = BORDERS[input.line];
      const lines = out.text.split('\n');
      const top = lines[0];
      const widths = input.sides
        ? inner(top)
            .split(c.tt)
            .map((x) => Array.from(x).length)
        : null;
      for (const line of lines) {
        if (line.startsWith(c.h) || line.startsWith(c.tl) || line.startsWith(c.lt)) continue;
        if (line.startsWith(c.bl)) continue;
        const cells = (input.sides ? inner(line) : line).split(c.v);
        if (widths) {
          expect(cells).toHaveLength(widths.length);
          cells.forEach((cell, k) => {
            const w = textWidth(cell, m);
            expect(
              Math.abs(w - widths[k] * m.border),
              JSON.stringify({ input, line }),
            ).toBeLessThanOrEqual(m.space / 2);
          });
        }
      }
    }
  });

  it('同樣的輸入永遠得到同樣的輸出', () => {
    const input: TextboxInput = { ...DEFAULT_INPUT, body: '鐘樓在午夜敲了十三下。', sides: true };
    expect(renderTextbox(input).text).toBe(renderTextbox({ ...input }).text);
  });
});
