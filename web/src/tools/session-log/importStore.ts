/**
 * 匯入對話框的狀態（F70～F91；不保存，每次開啟都是全新的狀態）與「要匯入的團」的計算。
 */
import { create } from 'zustand';
import { parseDelimited } from '@/core/csv';
import type { SessionRow } from '@/core/sessions';
import type { NoticeTone } from '@/ui';
import {
  CC_SHEET_FIELDS,
  type CcForm,
  type CcSpeaker,
  formGm,
  formPl,
  formRole,
  formRow,
} from './importCcfolia';
import {
  detectSheet,
  finishPartialRows,
  normalizeImportedRow,
  type PartialRow,
  type SheetGrid,
  type SheetMapping,
} from './importSheet';
import { type JsonImportPayload, normalizeLoadedRow } from './logic';
import { S } from './strings';

export type ImportTab = 'sheet' | 'text' | 'ccfolia' | 'json';

export interface ImportMsg {
  tone: NoticeTone;
  text: string;
}

export interface CcState {
  form: CcForm;
  speakers: CcSpeaker[];
  detected: { scenario: string; date: string; system: string };
}

export interface ImportState {
  tab: ImportTab;
  target: 'append' | 'overwrite';
  skipDup: boolean;
  sheetText: string;
  sheetFile: string;
  sheetMsg: ImportMsg | null;
  grid: SheetGrid | null;
  reportText: string;
  /** null＝還沒解讀 */
  reportRows: PartialRow[] | null;
  ccFiles: string;
  ccMsg: ImportMsg | null;
  cc: CcState | null;
  jsonFile: string;
  json: JsonImportPayload | null;
  jsonError: boolean;
}

export const INITIAL_IMPORT: ImportState = {
  tab: 'sheet',
  target: 'append',
  skipDup: true,
  sheetText: '',
  sheetFile: '',
  sheetMsg: null,
  grid: null,
  reportText: '',
  reportRows: null,
  ccFiles: '',
  ccMsg: null,
  cc: null,
  jsonFile: '',
  json: null,
  jsonError: false,
};

export const useImport = create<ImportState>(() => INITIAL_IMPORT);

export const resetImport = (): void => useImport.setState(INITIAL_IMPORT, true);
export const setImport = (patch: Partial<ImportState>): void => useImport.setState(patch);

/* ---------- 試算表 ---------- */

/** 貼上的文字 → 格線（F73）；沒有內容時清掉訊息 */
export function parseSheetText(text: string): void {
  const grid = detectSheet(parseDelimited(text));
  if (!grid) {
    setImport({ grid: null, sheetMsg: null });
    return;
  }
  setImport({
    grid,
    sheetMsg: {
      tone: 'info',
      text: grid.hasHeader
        ? S.import.headerFound(grid.rows.length)
        : S.import.noHeader(grid.rows.length),
    },
  });
}

/** 轉成格線並切到試算表分頁（CCFOLIA・紀錄，F83、F84） */
export function routeToSheet(rows: string[][], message: string): void {
  const labels = S.sheet.fields;
  setImport({
    tab: 'sheet',
    grid: {
      columns: CC_SHEET_FIELDS.map((f) =>
        f === 'gm' ? 'GM' : f === 'players' ? 'PL' : f === 'pc' ? 'PC' : labels[f],
      ),
      mapping: [...CC_SHEET_FIELDS],
      rows,
      hasHeader: true,
    },
    sheetMsg: { tone: 'success', text: message },
  });
}

const updateGrid = (fn: (g: SheetGrid) => SheetGrid) => {
  const g = useImport.getState().grid;
  if (g) setImport({ grid: fn(g) });
};

export const setCell = (row: number, col: number, value: string): void =>
  updateGrid((g) => ({
    ...g,
    rows: g.rows.map((r, i) => (i === row ? r.map((c, j) => (j === col ? value : c)) : r)),
  }));

export const setMapping = (col: number, value: SheetMapping): void =>
  updateGrid((g) => ({ ...g, mapping: g.mapping.map((m, i) => (i === col ? value : m)) }));

export const deleteGridRow = (row: number): void =>
  updateGrid((g) => ({ ...g, rows: g.rows.filter((_, i) => i !== row) }));

export const addGridRow = (): void =>
  updateGrid((g) => ({ ...g, rows: [...g.rows, new Array<string>(g.columns.length).fill('')] }));

/** 改貼其他資料 */
export const repaste = (): void =>
  setImport({ grid: null, sheetText: '', sheetFile: '', sheetMsg: null });

/* ---------- CCFOLIA 表單 ---------- */

/** 改發言者的指定：重算 GM、PL、身分三欄（F82） */
export function setSpeakerRole(
  index: number,
  role: CcSpeaker['role'],
  self: ReadonlySet<string>,
): void {
  const cc = useImport.getState().cc;
  if (!cc) return;
  const speakers = cc.speakers.map((s, i) => (i === index ? { ...s, role } : s));
  setImport({
    cc: {
      ...cc,
      speakers,
      form: {
        ...cc.form,
        gm: formGm(speakers),
        players: formPl(speakers),
        role: formRole(speakers, self),
      },
    },
  });
}

export function setCcField(key: keyof CcForm, value: string): void {
  const cc = useImport.getState().cc;
  if (cc) setImport({ cc: { ...cc, form: { ...cc.form, [key]: value } } });
}

export const ccFormRow = (cc: CcState | null): PartialRow | null =>
  cc ? formRow(cc.form, cc.speakers, cc.detected) : null;

/* ---------- 要匯入的團 ---------- */

/** JSON 檔的列（3.8.7：保留識別碼） */
export function jsonRows(payload: JsonImportPayload): SessionRow[] {
  return payload.rows.map((r) => normalizeImportedRow(normalizeLoadedRow(r)));
}

/** 團報文字、CCFOLIA 表單的預覽列 */
export function partialRows(rows: readonly PartialRow[], self: ReadonlySet<string>): SessionRow[] {
  return finishPartialRows(rows, self);
}
