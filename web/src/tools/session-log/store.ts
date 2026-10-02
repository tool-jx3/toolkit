/**
 * 狀態與操作：
 * - useLog：所有列與欄位設定（自動存檔、可以復原；F106）。讀回時用 restoreLogData 整理，損壞時當作第一次開啟。
 *   新版還沒有存檔、而瀏覽器裡有舊版的存檔（`sessionLogTool.state.v1`）時，第一次開啟就搬過來（舊鍵保留不刪）。
 * - usePrefs：自己的名字（F71；只存在這台裝置、不列入復原、不進 JSON）。舊版的 `sessionLogTool.selfNames.v1` 同樣搬過來。
 * - useUi：選取的列、搜尋與篩選、開著的對話框與面板、輸出類型（都不保存）。
 */
import { create } from 'zustand';
import type { StateStorage } from 'zustand/middleware';
import { downloadText } from '@/core/files';
import { localIsoDate, type SessionRow, selfNameSet } from '@/core/sessions';
import { createPreviewStore, createToolStore } from '@/core/storage';
import {
  addCustomColumn,
  type ColumnState,
  type ColumnsData,
  defaultColumns,
  ensureColumnsForKeys,
  hideColumn,
  mergeColumns,
  moveColumn,
  moveColumnBy,
  resetColumns,
  resizeColumn,
  showColumn,
} from './columns';
import type { ExportMode } from './exportText';
import {
  DEFAULT_FILTER,
  exportJsonFileName,
  exportJsonText,
  type FilterState,
  initialLogData,
  type LogData,
  newRowId,
  passesFilter,
  restoreLogData,
} from './logic';

export const TOOL_ID = 'session-log';
/** 舊版的存檔鍵名 */
export const LEGACY_STATE_KEY = 'sessionLogTool.state.v1';
export const LEGACY_SELF_NAMES_KEY = 'sessionLogTool.selfNames.v1';

function local(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readLocal(key: string): string | null {
  try {
    return local()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** 自動存檔的儲存位置：讀回時整理（損壞時刪掉、當作沒有存檔）；沒有存檔時搬舊版的資料 */
function logStorage(): StateStorage {
  return {
    getItem: (name) => {
      const raw = readLocal(name);
      if (raw === null) {
        const legacy = readLocal(LEGACY_STATE_KEY);
        if (legacy === null) return null;
        try {
          const data = restoreLogData(JSON.parse(legacy));
          return data ? JSON.stringify({ state: { data }, version: 1 }) : null;
        } catch {
          return null;
        }
      }
      try {
        const parsed = JSON.parse(raw) as { state?: { data?: unknown }; version?: number };
        const data = restoreLogData(parsed?.state?.data);
        if (!data) throw new Error('broken');
        return JSON.stringify({ ...parsed, state: { ...parsed.state, data } });
      } catch {
        try {
          local()?.removeItem(name);
        } catch {
          /* 刪不掉就算了 */
        }
        return null;
      }
    },
    setItem: (name, value) => {
      const ls = local();
      if (!ls) throw new Error('localStorage 無法使用');
      ls.setItem(name, value);
    },
    removeItem: (name) => {
      try {
        local()?.removeItem(name);
      } catch {
        /* 刪不掉就算了 */
      }
    },
  };
}

export const useLog = createToolStore<LogData>(TOOL_ID, initialLogData(), {
  storage: logStorage(),
});

/* ---------- 自己的名字 ---------- */

export interface Prefs {
  /** 「你的稱呼」的原文（「、」分隔） */
  selfNames: string;
}

function prefsStorage(): StateStorage {
  return {
    getItem: (name) => {
      const raw = readLocal(name);
      if (raw !== null) return raw;
      const legacy = readLocal(LEGACY_SELF_NAMES_KEY);
      return legacy === null
        ? null
        : JSON.stringify({ state: { data: { selfNames: legacy } }, version: 1 });
    },
    setItem: (name, value) => local()?.setItem(name, value),
    removeItem: (name) => local()?.removeItem(name),
  };
}

export const usePrefs = createPreviewStore<Prefs>(
  TOOL_ID,
  { selfNames: '' },
  { storage: prefsStorage() },
);

export const setSelfNames = (text: string): void => usePrefs.getState().patch({ selfNames: text });

/** 自己的名字（內建通用詞＋使用者填的，已正規化） */
export const useSelfNames = (): ReadonlySet<string> => {
  const text = usePrefs((s) => s.data.selfNames);
  return selfSetFor(text);
};

let selfCache: { text: string; set: ReadonlySet<string> } | null = null;
export function selfSetFor(text: string): ReadonlySet<string> {
  if (selfCache?.text !== text) selfCache = { text, set: selfNameSet(text) };
  return selfCache.set;
}
export const currentSelf = (): ReadonlySet<string> =>
  selfSetFor(usePrefs.getState().data.selfNames);

/* ---------- 畫面狀態（不保存） ---------- */

export type DialogState = { mode: 'add' } | { mode: 'edit'; id: string } | null;
export type PanelState = 'add' | 'remove' | null;

export interface UiState {
  activeId: string | null;
  filter: FilterState;
  detailOpen: boolean;
  dialog: DialogState;
  importOpen: boolean;
  panel: PanelState;
  /** 剛匯入、要亮起的列（F37） */
  flash: { ids: readonly string[]; seq: number };
  /** 要捲到畫面中央的列（匯入後） */
  reveal: { id: string; seq: number } | null;
  exportMode: ExportMode;
  exportQuery: string;
}

export const useUi = create<UiState>(() => ({
  activeId: useLog.getState().data.rows[0]?.id ?? null,
  filter: DEFAULT_FILTER,
  detailOpen: false,
  dialog: null,
  importOpen: false,
  panel: null,
  flash: { ids: [], seq: 0 },
  reveal: null,
  exportMode: 'all',
  exportQuery: '',
}));

/** 實際選取的列：選取的不在了就是第一列（F30） */
export function activeRowOf(
  rows: readonly SessionRow[],
  activeId: string | null,
): SessionRow | null {
  return rows.find((r) => r.id === activeId) ?? rows[0] ?? null;
}

export const useActiveRow = (): SessionRow | null => {
  const rows = useLog((s) => s.data.rows);
  const activeId = useUi((s) => s.activeId);
  return activeRowOf(rows, activeId);
};

export const selectRow = (id: string): void => useUi.setState({ activeId: id });
export const setFilter = (patch: Partial<FilterState>): void =>
  useUi.setState((s) => ({ filter: { ...s.filter, ...patch } }));
export const openDetail = (id?: string): void =>
  useUi.setState(id ? { activeId: id, detailOpen: true } : { detailOpen: true });
export const closeDetail = (): void => useUi.setState({ detailOpen: false });
export const openAddDialog = (): void => useUi.setState({ dialog: { mode: 'add' } });
export const openEditDialog = (id: string): void =>
  useUi.setState({ activeId: id, dialog: { mode: 'edit', id } });
export const closeDialog = (): void => useUi.setState({ dialog: null });
export const openImport = (): void => useUi.setState({ importOpen: true });
export const closeImport = (): void => useUi.setState({ importOpen: false });
export const togglePanel = (panel: Exclude<PanelState, null>): void =>
  useUi.setState((s) => ({ panel: s.panel === panel ? null : panel }));
export const closePanel = (): void => useUi.setState({ panel: null });

/* ---------- 列的操作 ---------- */

const updateLog = (recipe: (d: LogData) => void) => useLog.getState().update(recipe);

/** 側欄的即時編輯（F69）：不取消範例標記 */
export function setRowField(id: string, key: string, value: unknown): void {
  updateLog((d) => {
    const row = d.rows.find((r) => r.id === id);
    if (row) row[key] = value as never;
  });
}

/** 改一團的多個欄位（側欄的日期等） */
export function patchRow(id: string, patch: Partial<SessionRow>): void {
  updateLog((d) => {
    const row = d.rows.find((r) => r.id === id);
    if (row) Object.assign(row, patch);
  });
}

/** 團報勾選（F28） */
export const setReported = (id: string, reported: boolean): void =>
  setRowField(id, 'reported', reported);

/** 對話框的儲存（F53）：範例標記取消；新的一團加在最後並選取 */
export function saveDialogRow(row: SessionRow, isNew: boolean): void {
  const clean: SessionRow = { ...row };
  delete clean.sample;
  updateLog((d) => {
    if (isNew) d.rows.push(clean);
    else {
      const i = d.rows.findIndex((r) => r.id === row.id);
      if (i >= 0) d.rows[i] = clean;
      else d.rows.push(clean);
    }
  });
  useUi.setState({ activeId: clean.id, dialog: null });
}

export function deleteRow(id: string): void {
  updateLog((d) => {
    d.rows = d.rows.filter((r) => r.id !== id);
  });
  const { activeId } = useUi.getState();
  if (activeId === id) useUi.setState({ activeId: useLog.getState().data.rows[0]?.id ?? null });
}

/** 刪除範例（F34；不確認，可以復原） */
export function deleteSamples(): number {
  const n = useLog.getState().data.rows.filter((r) => r.sample).length;
  if (!n) return 0;
  updateLog((d) => {
    d.rows = d.rows.filter((r) => !r.sample);
  });
  const rows = useLog.getState().data.rows;
  const { activeId } = useUi.getState();
  if (!rows.some((r) => r.id === activeId)) useUi.setState({ activeId: rows[0]?.id ?? null });
  return n;
}

/* ---------- 欄位的操作 ---------- */

function updateColumns(fn: (c: ColumnsData) => ColumnsData): void {
  const data = useLog.getState().data;
  const next = fn(data);
  if (next === data) return;
  useLog.getState().patch({
    columns: next.columns,
    hiddenColumns: next.hiddenColumns,
    customColumns: next.customColumns,
  });
}

export const showColumnAction = (col: Pick<ColumnState, 'key'> & Partial<ColumnState>): void =>
  updateColumns((c) => showColumn(c, col));
export const hideColumnAction = (key: string): void => updateColumns((c) => hideColumn(c, key));
export const resetColumnsAction = (): void => updateColumns(resetColumns);
export const addCustomColumnAction = (label: string): void =>
  updateColumns((c) => addCustomColumn(c, label));
export const moveColumnAction = (src: string, target: string, side: 'before' | 'after'): void =>
  updateColumns((c) => ({ ...c, columns: moveColumn(c.columns, src, target, side) }));
export const moveColumnByAction = (key: string, delta: -1 | 1): void =>
  updateColumns((c) => ({ ...c, columns: moveColumnBy(c.columns, key, delta) }));
export const resizeColumnAction = (key: string, width: number): void =>
  updateColumns((c) => ({ ...c, columns: resizeColumn(c.columns, key, width) }));

/* ---------- 匯入（F90、3.8.7） ---------- */

export interface ImportPlan {
  rows: SessionRow[];
  target: 'append' | 'overwrite';
  /** JSON 檔的欄位設定 */
  columns: ColumnState[] | null;
  /** 匯入後要顯示的可選欄位 */
  ensureKeys: string[];
}

/** 套用匯入；回傳匯入的識別碼 */
export function applyImport(plan: ImportPlan): string[] {
  const data = useLog.getState().data;
  const used = new Set(plan.target === 'overwrite' ? [] : data.rows.map((r) => r.id));
  const rows = plan.rows.map((r) => {
    let id = r.id;
    if (!id || used.has(id)) id = newRowId();
    used.add(id);
    return id === r.id ? r : { ...r, id };
  });
  let next: LogData;
  if (plan.target === 'overwrite') {
    next = {
      rows,
      columns: plan.columns?.length ? plan.columns : defaultColumns(),
      hiddenColumns: [],
      customColumns: [],
    };
  } else {
    next = {
      ...data,
      rows: [...data.rows, ...rows],
      columns: plan.columns ? mergeColumns(data.columns, plan.columns) : data.columns,
    };
  }
  next = { ...next, ...ensureColumnsForKeys(next, plan.ensureKeys) };
  useLog.getState().replace(next);
  const ids = rows.map((r) => r.id);
  revealRows(ids);
  return ids;
}

/** 匯入後：選取第一筆、亮起、捲到中央；被搜尋或篩選藏起來時先清除（F37） */
export function revealRows(ids: readonly string[]): void {
  const ui = useUi.getState();
  const rows = useLog.getState().data.rows;
  const imported = rows.filter((r) => ids.includes(r.id));
  const patch: Partial<UiState> = {
    activeId: ids[0] ?? rows[0]?.id ?? null,
    flash: { ids, seq: ui.flash.seq + 1 },
    reveal: ids[0] ? { id: ids[0], seq: (ui.reveal?.seq ?? 0) + 1 } : null,
  };
  if (imported.length && !imported.some((r) => passesFilter(r, ui.filter)))
    patch.filter = { ...ui.filter, search: '', system: '', role: 'all' };
  useUi.setState(patch);
}

/* ---------- 匯出（F92） ---------- */

export function exportJson(now: Date = new Date()): string {
  const name = exportJsonFileName(now);
  downloadText(exportJsonText(useLog.getState().data, now), name, 'application/json');
  return name;
}

export const today = (): string => localIsoDate();
