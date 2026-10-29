/**
 * @/core/csv：貼上的表格、CSV／TSV 的讀寫（session-log 規格第 2 節、3.11）。
 */
import { describe, expect, it } from 'vitest';
import { csvCell, guardFormula, parseCsv, parseDelimited, toCsv, unguardFormula } from '@/core/csv';

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

  it('quotes: true：試算表複製的引號（含換行、Tab、"" 跳脫）讀成一格', () => {
    const text = '標題\t說明\n甲\t"第一行\n第二行"\n乙\t"含""引號""的說明"\n丙\t"a\tb"\n';
    expect(parseDelimited(text, { quotes: true })).toEqual([
      ['標題', '說明'],
      ['甲', '第一行\n第二行'],
      ['乙', '含"引號"的說明'],
      ['丙', 'a\tb'],
    ]);
    // 不給時照舊（不處理引號）
    expect(parseDelimited('a\tb\n"x"\ty', {})).toEqual([
      ['a', 'b'],
      ['"x"', 'y'],
    ]);
  });

  it('quotes: true：引號沒有收尾、收尾後還有字、中間的引號照原文', () => {
    expect(parseDelimited('a\tb\n"未收尾\t說"好"\n"x"y\tz', { quotes: true })).toEqual([
      ['a', 'b'],
      ['"未收尾', '說"好"'],
      ['"x"y', 'z'],
    ]);
    expect(parseDelimited('a\tb\n""\t"', { quotes: true })).toEqual([
      ['a', 'b'],
      ['', '"'],
    ]);
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

  it('不給 guard 時不動公式開頭的格', () => {
    expect(csvCell('=1+1')).toBe('=1+1');
    expect(toCsv([['=A1', '-3', '@x']])).toBe('=A1,-3,@x');
  });
});

describe('防公式注入', () => {
  const risky = ['=1+1', '+886', '-3', '@SUM(A1)', '\t=x', '\rcmd', "'=已經有引號", "''+兩個"];
  const safe = ['普通', "'開頭", "'", '', '1-2', 'a=b'];

  it("guardFormula：危險開頭加 '，其他不變；unguardFormula 還原", () => {
    for (const t of risky) {
      expect(guardFormula(t)).toBe(`'${t}`);
      expect(unguardFormula(guardFormula(t))).toBe(t);
    }
    for (const t of safe) {
      expect(guardFormula(t)).toBe(t);
      expect(unguardFormula(guardFormula(t))).toBe(t);
    }
  });

  it('csvCell／toCsv 的 guard：true 是每一格，函式時只防指定的欄；讀回再 unguard 相同', () => {
    expect(csvCell('=HYPERLINK("x")', { guard: true })).toBe('"\'=HYPERLINK(""x"")"');
    const rows = [
      ['標題', '開始'],
      ['=1+1', '-0044'],
      ['@人', '+12'],
    ];
    const text = toCsv(rows, { guard: (c) => c === 0 });
    expect(text).toBe("標題,開始\r\n'=1+1,-0044\r\n'@人,+12");
    expect(parseDelimited(text).map(([a, b]) => [unguardFormula(a), b])).toEqual(rows);
    expect(toCsv([['-1', '=2']], { guard: true })).toBe("'-1,'=2");
  });
});
