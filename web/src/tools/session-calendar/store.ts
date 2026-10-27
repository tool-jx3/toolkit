/**
 * 狀態與操作：
 * - useCal：行事曆的資料（所有的場次、預定、外觀、CP 色；自動存檔、可以復原；讀回時經過 normalizeData）。
 * - usePrefs：這台裝置的偏好（月曆／年曆、準備事項清單的範圍、最近用過的顏色、空檔日期的格式；不列入復原）。
 * - useUi：畫面狀態（顯示的月份、選取的日期與筆、開著的對話框、拖曳中的範圍；不保存）。
 * - assets：背景圖片（IndexedDB）。
 */

import { create } from 'zustand';
import type { StateStorage } from 'zustand/middleware';
import { createAssetStore } from '@/core/assets';
import { addDays } from '@/core/holidays';
import { createPreviewStore, createToolStore } from '@/core/storage';
import { addMonths, today, type YearMonth, ymOf } from './dates';
import { type DayFilter, DEFAULT_FREE_FORMAT, type FreeDayFormat } from './freeDays';
import { mergeCpColors, mergeEntries } from './json';
import {
  type CalData,
  COLOR_HISTORY_MAX,
  CP_COLORS_MAX,
  type CpColor,
  type Entry,
  type EntryColor,
  type EntryKind,
  initialData,
  type Look,
  movedTo,
  newId,
  normalizeData,
  type Task,
} from './model';
import { reorderTasks } from './tasks';

export const TOOL_ID = 'session-calendar';
export const DATA_VERSION = 1;

export const assets = createAssetStore(TOOL_ID);

function local(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** 自動存檔：讀回時整理（損壞時當作第一次開啟） */
function calStorage(): StateStorage {
  return {
    getItem: (name) => {
      let raw: string | null = null;
      try {
        raw = local()?.getItem(name) ?? null;
      } catch {
        return null;
      }
      if (raw === null) return null;
      try {
        const parsed = JSON.parse(raw) as { state?: { data?: unknown }; version?: number };
        const data = normalizeData(parsed?.state?.data, today());
        if (!data) return null;
        return JSON.stringify({ ...parsed, state: { ...parsed.state, data } });
      } catch {
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

export const useCal = createToolStore<CalData>(TOOL_ID, initialData(today()), {
  version: DATA_VERSION,
  storage: calStorage(),
});

export const calNow = (): CalData => useCal.getState().data;

/* ---------- 這台裝置的偏好 ---------- */

export interface FreePrefs {
  dayFilter: DayFilter;
  excludeWeekdays: number[];
  excludeHolidays: boolean;
  busySession: boolean;
  busyPlan: boolean;
  busyTentative: boolean;
  format: FreeDayFormat;
}

export interface Prefs {
  view: 'month' | 'year';
  taskRange: 'week' | 'all';
  colorHistory: EntryColor[];
  free: FreePrefs;
}

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, {
  view: 'month',
  taskRange: 'week',
  colorHistory: [],
  free: {
    dayFilter: 'all',
    excludeWeekdays: [],
    excludeHolidays: false,
    busySession: true,
    busyPlan: true,
    busyTentative: true,
    format: DEFAULT_FREE_FORMAT,
  },
});

/** 最近用過的顏色：同樣的拿掉、放到最前面，最多 10 個 */
export function pushColorHistory(c: EntryColor): void {
  const key = (x: EntryColor) => (x.mode === 'gradient' ? `g${x.c1}${x.c2}` : `s${x.c1}`);
  const list = usePrefs.getState().data.colorHistory.filter((x) => key(x) !== key(c));
  usePrefs.getState().patch({ colorHistory: [c, ...list].slice(0, COLOR_HISTORY_MAX) });
}

/* ---------- 今天（過了午夜、頁面重新顯示時更新） ---------- */

export const useTodayStore = create<{ today: string }>(() => ({ today: today() }));
/** 畫面上用的「今天」：TodayTicker 在過午夜與頁面重新顯示時更新 */
export const useToday = (): string => useTodayStore((s) => s.today);
export function refreshToday(): void {
  const t = today();
  if (useTodayStore.getState().today !== t) useTodayStore.setState({ today: t });
}

/* ---------- 對話框關閉後的焦點 ---------- */

let returnFocusEl: HTMLElement | null = null;
/**
 * 從選單（「新增 ▾」「匯入匯出 ▾」）打開的對話框：選單項目在對話框打開時已經不在了，關閉後焦點會掉到頁面上，
 * 所以記下選單的按鈕，關閉時把焦點放回去。
 */
export function returnFocusTo(el: HTMLElement | null): void {
  returnFocusEl = el;
}
export function restoreFocus(): void {
  const el = returnFocusEl;
  returnFocusEl = null;
  if (el)
    window.setTimeout(() => {
      if (el.isConnected) el.focus();
    }, 0);
}

/* ---------- 畫面狀態 ---------- */

export type EntryDialogState =
  | { mode: 'new'; kind: EntryKind; start: string; end: string }
  | { mode: 'edit'; id: string }
  | null;

export interface UiState {
  cursor: YearMonth;
  selectedDate: string | null;
  selectedId: string | null;
  entryDialog: EntryDialogState;
  taskDialog: { due: string; entryId: string | null } | null;
  freeOpen: boolean;
  /** 拖曳中：選取的範圍（新增預定）或移動的目標範圍 */
  drag: { kind: 'range' | 'move'; start: string; end: string } | null;
  /** 月份換了之後要聚焦的日子 */
  focusDate: string | null;
}

export const useUi = create<UiState>(() => ({
  cursor: ymOf(today()),
  selectedDate: null,
  selectedId: null,
  entryDialog: null,
  taskDialog: null,
  freeOpen: false,
  drag: null,
  focusDate: null,
}));

export const setCursor = (cursor: YearMonth): void => useUi.setState({ cursor });
export const shiftCursor = (n: number): void => {
  const { cursor } = useUi.getState();
  const view = usePrefs.getState().data.view;
  setCursor(view === 'year' ? { ...cursor, year: cursor.year + n } : addMonths(cursor, n));
};
export const goToday = (): void => {
  const t = today();
  useUi.setState({ cursor: ymOf(t), selectedDate: t, selectedId: null, focusDate: t });
};
export const setView = (view: Prefs['view']): void => usePrefs.getState().patch({ view });

export function selectDate(date: string | null): void {
  useUi.setState({ selectedDate: date, selectedId: null });
}

export function selectEntry(id: string | null, date?: string): void {
  if (!id) {
    useUi.setState({ selectedId: null });
    return;
  }
  const e = calNow().entries.find((x) => x.id === id);
  useUi.setState({ selectedId: id, selectedDate: date ?? e?.start ?? null });
}

/** 打開某一月（年曆點月份、跳到某筆） */
export function openMonth(ym: YearMonth): void {
  setView('month');
  setCursor(ym);
}

/** 讓某一筆出現在畫面上（月曆跳到它的月份並選取） */
export function revealEntry(id: string): void {
  const e = calNow().entries.find((x) => x.id === id);
  if (!e) return;
  useUi.setState({ cursor: ymOf(e.start), selectedId: id, selectedDate: e.start });
}

export const openNewEntry = (kind: EntryKind, start?: string, end?: string): void => {
  const s = start ?? useUi.getState().selectedDate ?? today();
  useUi.setState({ entryDialog: { mode: 'new', kind, start: s, end: end ?? s } });
};
export const openEditEntry = (id: string): void =>
  useUi.setState({ entryDialog: { mode: 'edit', id } });
export const closeEntryDialog = (): void => {
  useUi.setState({ entryDialog: null });
  restoreFocus();
};
export const closeTaskDialog = (): void => {
  useUi.setState({ taskDialog: null });
  restoreFocus();
};

/* ---------- 一筆的操作（每次都是一步復原） ---------- */

/**
 * 一次的操作（新增、刪除、移動、勾選…）各自記成一步復原：包成只有一次變更的手勢
 * （不然 0.4 秒內接連的操作會併成一步）。外觀與設定的變更用 patchLook／patchData：和上一次變更相隔不到 0.4 秒就併進同一步
 * （連續拖滑桿、打字是一步）。
 */
const update = (recipe: (d: CalData) => void) => {
  if (useCal.inGesture()) {
    useCal.getState().update(recipe);
    return;
  }
  useCal.beginGesture();
  try {
    useCal.getState().update(recipe);
  } finally {
    useCal.endGesture();
  }
};

/** 新增或改一筆（對話框的儲存）；範例標記拿掉 */
export function saveEntry(entry: Entry, isNew: boolean): void {
  const clean: Entry = { ...entry };
  delete clean.sample;
  update((d) => {
    const i = d.entries.findIndex((e) => e.id === clean.id);
    if (i >= 0 && !isNew) d.entries[i] = clean;
    else d.entries.push(clean);
  });
  useUi.setState({ selectedId: clean.id, selectedDate: clean.start, cursor: ymOf(clean.start) });
}

export function deleteEntry(id: string): void {
  update((d) => {
    d.entries = d.entries.filter((e) => e.id !== id);
  });
  if (useUi.getState().selectedId === id) useUi.setState({ selectedId: null });
}

/** 移動一筆（拖曳）：開始日改成 newStart，天數不變 */
export function moveEntry(id: string, newStart: string): void {
  update((d) => {
    const i = d.entries.findIndex((e) => e.id === id);
    if (i >= 0) d.entries[i] = movedTo(d.entries[i], newStart);
  });
  useUi.setState({ selectedId: id, selectedDate: newStart });
}

/** 往前、往後移幾天（鍵盤） */
export function shiftEntry(id: string, days: number): void {
  const e = calNow().entries.find((x) => x.id === id);
  if (!e) return;
  const start = addDays(e.start, days);
  moveEntry(id, start);
  const ym = ymOf(start);
  const c = useUi.getState().cursor;
  if (ym.year !== c.year || ym.month !== c.month) setCursor(ym);
}

export function addTask(entryId: string, task: Task): void {
  update((d) => {
    d.entries.find((e) => e.id === entryId)?.tasks.push(task);
  });
}

export function setTaskDone(entryId: string, taskId: string, done: boolean): void {
  update((d) => {
    const t = d.entries.find((e) => e.id === entryId)?.tasks.find((x) => x.id === taskId);
    if (t) t.done = done;
  });
}

/** 準備事項清單的拖曳排序 */
export function moveTask(fromTaskId: string, toTaskId: string): void {
  const orders = reorderTasks(calNow().entries, fromTaskId, toTaskId);
  if (!orders.size) return;
  update((d) => {
    for (const e of d.entries)
      for (const t of e.tasks) {
        const o = orders.get(t.id);
        if (o !== undefined) t.order = o;
      }
  });
}

/** 刪除範例（第一次開啟時放的） */
export function clearSamples(): number {
  const n = calNow().entries.filter((e) => e.sample).length;
  if (!n) return 0;
  update((d) => {
    d.entries = d.entries.filter((e) => !e.sample);
  });
  const { selectedId } = useUi.getState();
  if (selectedId && !calNow().entries.some((e) => e.id === selectedId))
    useUi.setState({ selectedId: null });
  return n;
}

/* ---------- 設定 ---------- */

export const patchData = (patch: Partial<Omit<CalData, 'entries' | 'cpColors' | 'look'>>): void =>
  useCal.getState().patch(patch);

export function patchLook(recipe: (look: Look) => void): void {
  useCal.getState().update((d) => recipe(d.look));
}

export function addCpColor(name: string, c1: string, c2: string): CpColor | null {
  const list = calNow().cpColors;
  if (list.length >= CP_COLORS_MAX) return null;
  const cp: CpColor = { id: newId('cp'), name: name.trim() || `CP 色 ${list.length + 1}`, c1, c2 };
  update((d) => {
    d.cpColors.push(cp);
  });
  return cp;
}

export function removeCpColor(id: string): void {
  update((d) => {
    d.cpColors = d.cpColors.filter((c) => c.id !== id);
  });
}

/* ---------- 讀入 ---------- */

export function applyImport(
  entries: readonly Entry[],
  cpColors: readonly CpColor[],
  { replace, title }: { replace: boolean; title?: string },
): void {
  update((d) => {
    d.entries = mergeEntries(d.entries, entries, replace);
    d.cpColors = mergeCpColors(replace ? [] : d.cpColors, cpColors).slice(0, CP_COLORS_MAX);
    if (replace && title) d.title = title.slice(0, 60);
  });
  const first = [...entries].sort((a, b) => (a.start < b.start ? -1 : 1))[0];
  if (first) useUi.setState({ cursor: ymOf(first.start), selectedDate: null, selectedId: null });
}

/** 全部重來（專案選單的重設）：回到第一次開啟的樣子（含範例） */
export function resetAll(): void {
  useCal.getState().replace(initialData(today()));
  useUi.setState({ selectedId: null, selectedDate: null, cursor: ymOf(today()) });
}
