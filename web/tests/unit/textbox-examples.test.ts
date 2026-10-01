/**
 * 文字方框產生器：規格附件 docs/refactor/specs/textbox.examples.json 的逐字比對。
 * - 「範例」60 組：輸出必須逐字相符（含行尾空白、U+3000，結尾沒有換行）。
 * - 「舊版異常」：依規格第 7 節主控裁定處理（見下方各組的說明）。
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUT, renderTextbox, type TextboxInput } from '@/tools/textbox/layout';
import examples from '../../../docs/refactor/specs/textbox.examples.json';

interface ExampleInput {
  模式: '方框' | '表格';
  寬度校準: 'CCFOLIA' | '等寬' | '自訂';
  框線: '單線' | '雙線';
  補白: '全形為主' | '只用半形';
  側邊框線: boolean;
  自訂寬字寬度: string;
  自訂框線寬度: string;
  方框寬度上限?: string;
  表格寬度上限?: string;
  首列當表頭?: boolean;
  標題?: string;
  內文?: string;
  表格資料?: string;
}

interface Example {
  編號: string;
  說明: string;
  輸入: ExampleInput;
  預期輸出: string | null;
}

const doc = examples as unknown as { 範例: Example[]; 舊版異常: Example[] };

function toInput(e: ExampleInput): TextboxInput {
  return {
    ...DEFAULT_INPUT,
    mode: e.模式 === '方框' ? 'box' : 'table',
    calibration: e.寬度校準 === 'CCFOLIA' ? 'ccfolia' : e.寬度校準 === '等寬' ? 'mono' : 'custom',
    line: e.框線 === '單線' ? 'single' : 'double',
    pad: e.補白 === '全形為主' ? 'fullwidth' : 'halfwidth',
    sides: e.側邊框線,
    customWide: e.自訂寬字寬度,
    customBorder: e.自訂框線寬度,
    boxWidth: e.方框寬度上限 ?? DEFAULT_INPUT.boxWidth,
    tableWidth: e.表格寬度上限 ?? DEFAULT_INPUT.tableWidth,
    header: e.首列當表頭 ?? false,
    title: e.標題 ?? '',
    body: e.內文 ?? '',
    table: e.表格資料 ?? '',
  };
}

const byId = (list: Example[], id: string) => {
  const e = list.find((x) => x.編號 === id);
  if (!e) throw new Error(`附件裡沒有 ${id}`);
  return e;
};

describe('textbox：附件「範例」逐字相符', () => {
  it('附件有 60 組範例', () => {
    expect(doc.範例).toHaveLength(60);
  });

  it.each(doc.範例.map((e) => [e.編號, e.說明, e] as const))('%s %s', (_id, _desc, e) => {
    const out = renderTextbox(toInput(e.輸入));
    expect(out.text).toBe(e.預期輸出);
    expect(out.warnings).toEqual([]);
  });
});

describe('textbox：附件「舊版異常」依主控裁定', () => {
  it('附件有 6 組舊版異常', () => {
    expect(doc.舊版異常.map((e) => e.編號)).toEqual(['B24', 'E1', 'E1b', 'E3', 'E4', 'E9']);
  });

  it('B24 方框寬度上限為負數：改成以 1 計算並提示（刻意差異）', () => {
    const out = renderTextbox(toInput(byId(doc.舊版異常, 'B24').輸入));
    expect(out.warnings).toEqual([
      { field: 'boxWidth', message: '寬度上限至少為 1，目前以 1 計算。' },
    ]);
    /* 寬度上限 1：每個字獨佔一行，框寬 1 */
    expect(out.text).toBe('┌─┐\n│ 霧 │\n│ 氣 │\n└─┘');
    /* 與直接輸入 1 的結果相同 */
    const one = renderTextbox({ ...toInput(byId(doc.舊版異常, 'B24').輸入), boxWidth: '1' });
    expect(one.text).toBe(out.text);
    expect(one.warnings).toEqual([]);
  });

  it('E1 表格只有分隔列（側邊框線開）：輸出與舊版逐字相同，另加提示', () => {
    const e = byId(doc.舊版異常, 'E1');
    const out = renderTextbox(toInput(e.輸入));
    expect(out.text).toBe(e.預期輸出);
    expect(out.warnings.map((w) => w.field)).toEqual(['table']);
  });

  it('E1b 表格只有分隔列（側邊框線關）：舊版出錯；新版改輸出空表格的小方框並提示（刻意差異）', () => {
    const out = renderTextbox(toInput(byId(doc.舊版異常, 'E1b').輸入));
    const empty = renderTextbox({ ...toInput(byId(doc.舊版異常, 'E1b').輸入), table: '' });
    expect(out.text).toBe(empty.text);
    expect(out.text).toBe('┌─┐\n│   │\n└─┘');
    expect(out.warnings.map((w) => w.field)).toEqual(['table']);
  });

  it('E3 自訂框線寬度為負數：改用 1 計算並提示（刻意差異）', () => {
    const input = toInput(byId(doc.舊版異常, 'E3').輸入);
    const out = renderTextbox(input);
    expect(out.warnings).toEqual([
      { field: 'customBorder', message: '寬度必須大於 0，目前以 1 計算。' },
    ]);
    expect(out.text).toBe(renderTextbox({ ...input, customBorder: '1' }).text);
  });

  it('E4 自訂寬字寬度為負數：改用 2 計算並提示（刻意差異）', () => {
    const input = toInput(byId(doc.舊版異常, 'E4').輸入);
    const out = renderTextbox(input);
    expect(out.warnings).toEqual([
      { field: 'customWide', message: '寬度必須大於 0，目前以 2 計算。' },
    ]);
    expect(out.text).toBe(renderTextbox({ ...input, customWide: '2' }).text);
  });

  it('E9 寬度上限打成「3e1」：保留舊行為（只取到 3），與舊版逐字相同', () => {
    const e = byId(doc.舊版異常, 'E9');
    const out = renderTextbox(toInput(e.輸入));
    expect(out.text).toBe(e.預期輸出);
    expect(out.warnings).toEqual([]);
  });
});
