/**
 * @/core/csv：貼上的表格、CSV／TSV 的讀寫（session-log 規格第 2 節、3.11）。
 */
import { describe, expect, it } from 'vitest';
import { csvCell, parseCsv, parseDelimited, toCsv } from '@/core/csv';

describe('parseDelimited', () => {
  it('第一行有 Tab 就是 TSV（不處理引號）', () => {
    expect(parseDelimited('日期\t劇本\r\n2026-01-01\t"霧港"\n\n')).toEqual([
      ['日期', '劇本'],
      ['2026-01-01', '"霧港"'],
    ]);
  });

  it('否則是 CSV：引號裡可以有逗號、換行，"" 是一個引號', () => {
    expect(parseDelimited('a,b,c\r\n"x, y","第一行\n第二行","說""你好"""\n')).toEqual([
      ['a', 'b', 'c'],
      ['x, y', '第一行\n第二行', '說"你好"'],
    ]);
    expect(parseCsv('a,,\nb')).toEqual([['a', '', ''], ['b']]);
  });

  it('空白文字回傳空陣列', () => {
    expect(parseDelimited('  \n\n')).toEqual([]);
    expect(parseDelimited('')).toEqual([]);
  });
});

describe('寫出', () => {
  it('含引號、逗號、換行的格以雙引號包住', () => {
    expect(csvCell('普通')).toBe('普通');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('說"好"')).toBe('"說""好"""');
    expect(csvCell('兩\n行')).toBe('"兩\n行"');
    expect(csvCell(null)).toBe('');
  });

  it('toCsv：BOM 與 CRLF；讀回相同', () => {
    const rows = [
      ['日期', '備註'],
      ['2026-01-01', 'a,"b"\nc'],
    ];
    const text = toCsv(rows, { bom: true });
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text.slice(1)).toBe('日期,備註\r\n2026-01-01,"a,""b""\nc"');
    expect(parseDelimited(text.slice(1))).toEqual(rows);
    expect(toCsv([['a'], ['b']], { eol: '\n' })).toBe('a\nb');
  });
});
