/**
 * 狀態與操作：
 * - useDoc：專案的資料（事件、泳道、分類、標記…；自動儲存、可以復原；讀回時經過 normalizeDoc）。
 * - usePrefs：這台裝置的畫面設定（檢視、GM／PL、畫面範圍、收合、分頁、匯出設定；不列入復原）。
 * - useUi：畫面狀態（選取、畫面範圍、拖曳中的預覽；不保存）。
 * 改資料的操作在 PL 檢視時不作用（通知「切回 GM 檢視才能編輯」）。
 */
import { create } from 'zustand';
import type { StateStorage } from 'zustand/middleware';
import { createPreviewStore, createToolStore } from '@/core/storage';
import { exampleDoc } from './model/example';
import {
  canonical,
  convertTime,
  dateValue,
  dayOneValue,
  MINUTES_PER_DAY,
  readTime,
  type SnapUnit,
  snapTv,
  type TimeMode,
} from './model/time';
import {
  blankDoc,
  type Category,
  type Lane,
  LIMITS,
  type Marker,
  newEvent,
  newId,
  normalizeDoc,
  PALETTE,
  type TimelineDoc,
  type TimelineEvent,
} from './model/types';
import type { Audience } from './model/visible';
import type { Win } from './model/window';
import { notify } from './notify';
import { S } from './strings';

export const TOOL_ID = 'scenario-timeline';
export const DATA_VERSION = 1;

function local(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** 自動存檔：讀回時整理（壞掉時當作第一次開啟） */
function docStorage(): StateStorage {
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
        const data = normalizeDoc(parsed?.state?.data);
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

export const useDoc = createToolStore<TimelineDoc>(TOOL_ID, exampleDoc(), {
  version: DATA_VERSION,
  storage: docStorage(),
});
export const docNow = (): TimelineDoc => useDoc.getState().data;

/* ---------- 這台裝置的畫面設定 ---------- */

export type SettingsTab = 'event' | 'lanes' | 'project' | 'export';
export type ViewKind = 'timeline' | 'chronicle';
export type RangeKind = 'all' | 'view' | 'custom';

export interface ExportPrefs {
  range: RangeKind;
  from: string;
  to: string;
  width: number;
  title: boolean;
  legend: boolean;
  theme: 'light' | 'dark';
  audience: Audience;
  format: 'png' | 'svg';
  scale: number;
}

export interface Prefs {
  tab: SettingsTab;
  /** null＝還沒選過（窄畫面開年表） */
  view: ViewKind | null;
  viewMode: Audience;
  /** 每種寫法上次的畫面範圍 */
  windows: Partial<Record<TimeMode, Win>>;
  collapsed: Record<string, boolean>;
  export: ExportPrefs;
  text: { format: 'text' | 'md'; audience: Audience };
}

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, {
  tab: 'event',
  view: null,
  viewMode: 'gm',
  windows: {},
  collapsed: {},
  export: {
    range: 'all',
    from: '',
    to: '',
    width: 1600,
    title: true,
    legend: true,
    theme: 'light',
    audience: 'pl',
    format: 'png',
    scale: 1,
  },
  text: { format: 'text', audience: 'pl' },
});
export const prefsNow = (): Prefs => usePrefs.getState().data;
export const setPrefs = (patch: Partial<Prefs>): void => usePrefs.getState().patch(patch);
export const setExportPrefs = (patch: Partial<ExportPrefs>): void =>
  usePrefs.getState().update((d) => {
    Object.assign(d.export, patch);
  });
export const isPl = (): boolean => prefsNow().viewMode === 'pl';

/* ---------- 畫面狀態 ---------- */

export interface DragPreview {
  id: string;
  start: string;
  end: string;
  laneId: string;
}

export interface UiState {
  selectedId: string | null;
  /** 時間軸的畫面範圍（null＝還沒算，開頁時全覽或用上次的） */
  win: Win | null;
  /** win 是哪一種寫法的範圍 */
  winMode: TimeMode | null;
  /** 要求把焦點放到「事件」分頁的標題欄（n 每次加 1；id＝哪個事件） */
  focusTitle: { n: number; id: string | null };
  /** 拖曳中的事件（畫在新的位置；放開才寫進資料） */
  drag: DragPreview | null;
  /** 拖曳中的標記、目前進度 */
  flagDrag: { id: string; time: string } | null;
  /** 要求全覽（換寫法、開專案檔、讀入之後） */
  fitRequest: number;
  pasteOpen: boolean;
  convertTo: TimeMode | null;
}

export const useUi = create<UiState>(() => ({
  selectedId: null,
  win: null,
  winMode: null,
  focusTitle: { n: 0, id: null },
  drag: null,
  flagDrag: null,
  fitRequest: 0,
  pasteOpen: false,
  convertTo: null,
}));

export const select = (id: string | null): void => useUi.setState({ selectedId: id });
export const requestFit = (): void => useUi.setState((s) => ({ fitRequest: s.fitRequest + 1 }));

let saveTimer = 0;
/** 換畫面範圍（停下 0.4 秒後記住） */
export function setWin(win: Win): void {
  useUi.setState({ win, winMode: docNow().mode });
  if (typeof window === 'undefined') return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const mode = docNow().mode;
    usePrefs.getState().update((d) => {
      d.windows[mode] = { start: win.start, end: win.end };
    });
  }, 400);
}

export function editEvent(id: string): void {
  useUi.setState((s) => ({ selectedId: id, focusTitle: { n: s.focusTitle.n + 1, id } }));
  setPrefs({ tab: 'event' });
}

/* ---------- 改資料（每次一步復原；PL 檢視時不作用） ---------- */

/** PL 檢視時通知、回傳 false */
export function guard(): boolean {
  if (!isPl()) return true;
  notify({ title: S.needGm, tone: 'warning' });
  return false;
}

/** 一次的操作記成一步（0.4 秒內的連續操作不會併在一起；手勢中照常） */
export function commit(recipe: (d: TimelineDoc) => void): void {
  if (useDoc.inGesture()) {
    useDoc.getState().update(recipe);
    return;
  }
  useDoc.beginGesture();
  try {
    useDoc.getState().update(recipe);
  } finally {
    useDoc.endGesture();
  }
}

export const findEvent = (id: string | null): TimelineEvent | undefined =>
  id ? docNow().events.find((e) => e.id === id) : undefined;

/** 新增事件（選取、切到「事件」分頁、標題欄全選） */
export function addEvent(partial: Partial<TimelineEvent>): string | null {
  if (!guard()) return null;
  const doc = docNow();
  if (doc.events.length >= LIMITS.events) {
    notify({ title: `事件最多 ${LIMITS.events} 個`, tone: 'warning' });
    return null;
  }
  const e = newEvent(partial);
  commit((d) => {
    d.events.push(e);
  });
  editEvent(e.id);
  return e.id;
}

export function updateEvent(id: string, recipe: (e: TimelineEvent) => void, step = true): void {
  if (!guard()) return;
  const fn = (d: TimelineDoc) => {
    const e = d.events.find((x) => x.id === id);
    if (e) recipe(e);
  };
  if (step) commit(fn);
  else useDoc.getState().update(fn);
}

export function deleteEvent(id: string): TimelineEvent | null {
  if (!guard()) return null;
  const e = findEvent(id);
  if (!e) return null;
  commit((d) => {
    d.events = d.events.filter((x) => x.id !== id);
  });
  if (useUi.getState().selectedId === id) select(null);
  notify({
    title: S.deleted(e.title.trim() || S.untitled),
    tone: 'success',
    action: { label: S.undoAction, onClick: () => undo() },
  });
  return e;
}

export function duplicateEvent(id: string): void {
  const e = findEvent(id);
  if (!e) return;
  const { id: _old, ...rest } = e;
  addEvent({
    ...rest,
    title: `${e.title}${S.duplicateSuffix}`.slice(0, LIMITS.eventTitle),
    people: [...e.people],
  });
}

/** 拖曳、鍵盤移動後寫進資料 */
export function placeEvent(
  id: string,
  next: { start: string; end: string; laneId: string },
  step = true,
): void {
  updateEvent(
    id,
    (e) => {
      e.start = next.start;
      e.end = next.end;
      e.laneId = next.laneId;
    },
    step,
  );
}

/* ---------- 泳道 ---------- */

export function addLane(): string | null {
  if (!guard()) return null;
  const doc = docNow();
  if (doc.lanes.length >= LIMITS.lanes) return null;
  const lane: Lane = {
    id: newId('l'),
    name: S.laneName(doc.lanes.length + 1),
    kind: 'other',
    color: PALETTE[doc.lanes.length % PALETTE.length],
    parentId: '',
    gm: false,
  };
  commit((d) => {
    d.lanes.push(lane);
  });
  return lane.id;
}

export function updateLane(id: string, recipe: (l: Lane) => void, step = true): void {
  if (!guard()) return;
  const fn = (d: TimelineDoc) => {
    const l = d.lanes.find((x) => x.id === id);
    if (l) recipe(l);
  };
  if (step) commit(fn);
  else useDoc.getState().update(fn);
}

/**
 * 泳道的順序：拖曳排序在「最上層的清單」上進行（上層＋它的子泳道一起移動）。
 * from、to 是 laneOrderList 的位置。
 */
export function topLevelOrder(lanes: readonly Lane[]): Lane[] {
  return lanes.filter((l) => !l.parentId || !lanes.some((p) => p.id === l.parentId));
}

/** 清單的顯示順序：上層之後接它的子泳道 */
export function displayOrder(lanes: readonly Lane[]): Lane[] {
  const out: Lane[] = [];
  for (const l of topLevelOrder(lanes)) {
    out.push(l);
    for (const c of lanes) if (c.parentId === l.id) out.push(c);
  }
  return out;
}

/** 把顯示順序第 from 個移到第 to 個（子泳道只在同一個上層裡移動；上層連同子泳道一起移動） */
export function moveLaneInList(lanes: readonly Lane[], from: number, to: number): Lane[] | null {
  const order = displayOrder(lanes);
  const item = order[from];
  const target = order[to];
  if (!item || !target || from === to) return null;
  if (item.parentId) {
    /* 子泳道：只在同一個上層裡換位置 */
    const parentId = item.parentId;
    const sibs = order.filter((l) => l.parentId === parentId);
    let ti = sibs.indexOf(target);
    if (ti < 0) {
      if (target.id === parentId) ti = 0;
      else if (to > from) ti = sibs.length - 1;
      else return null;
    }
    const fi = sibs.indexOf(item);
    const next = [...sibs];
    next.splice(fi, 1);
    next.splice(ti, 0, item);
    const rest = lanes.filter((l) => l.parentId !== parentId);
    return [...rest, ...next];
  }
  const tops = topLevelOrder(lanes);
  const fi = tops.indexOf(item);
  const targetTop = target.parentId ? tops.find((t) => t.id === target.parentId) : target;
  if (!targetTop) return null;
  let ti = tops.indexOf(targetTop);
  if (ti === fi) return null;
  if (ti < 0) ti = tops.length - 1;
  const nextTops = [...tops];
  nextTops.splice(fi, 1);
  nextTops.splice(ti, 0, item);
  const out: Lane[] = [];
  for (const t of nextTops) {
    out.push(t);
    for (const c of lanes) if (c.parentId === t.id) out.push(c);
  }
  return out;
}

export function moveLane(from: number, to: number, step = true): void {
  if (!guard()) return;
  const next = moveLaneInList(docNow().lanes, from, to);
  if (!next) return;
  const fn = (d: TimelineDoc) => {
    d.lanes = next.map((l) => d.lanes.find((x) => x.id === l.id) ?? l);
  };
  if (step) commit(fn);
  else useDoc.getState().update(fn);
}

export function setLaneParent(id: string, parentId: string): void {
  if (!guard()) return;
  const doc = docNow();
  if (parentId) {
    const p = doc.lanes.find((l) => l.id === parentId);
    if (!p || p.parentId || p.id === id) return;
    if (doc.lanes.some((l) => l.parentId === id)) return;
  }
  commit((d) => {
    const l = d.lanes.find((x) => x.id === id);
    if (!l) return;
    l.parentId = parentId;
    /* 換了上層：移到新上層的子泳道最後面（清單的順序決定時間軸的順序） */
    const i = d.lanes.indexOf(l);
    d.lanes.splice(i, 1);
    if (parentId) {
      let at = d.lanes.findIndex((x) => x.id === parentId);
      while (at + 1 < d.lanes.length && d.lanes[at + 1].parentId === parentId) at++;
      d.lanes.splice(at + 1, 0, l);
    } else d.lanes.push(l);
  });
}

export function deleteLane(id: string, withEvents: boolean): void {
  if (!guard()) return;
  commit((d) => {
    d.lanes = d.lanes.filter((l) => l.id !== id);
    for (const l of d.lanes) if (l.parentId === id) l.parentId = '';
    if (withEvents) d.events = d.events.filter((e) => e.laneId !== id);
    else for (const e of d.events) if (e.laneId === id) e.laneId = '';
  });
}

/* ---------- 分類 ---------- */

export function addCategory(): string | null {
  if (!guard()) return null;
  const doc = docNow();
  if (doc.categories.length >= LIMITS.categories) return null;
  const c: Category = {
    id: newId('c'),
    name: S.catName(doc.categories.length + 1),
    color: PALETTE[doc.categories.length % PALETTE.length],
  };
  commit((d) => {
    d.categories.push(c);
  });
  return c.id;
}

export function updateCategory(id: string, recipe: (c: Category) => void, step = true): void {
  if (!guard()) return;
  const fn = (d: TimelineDoc) => {
    const c = d.categories.find((x) => x.id === id);
    if (c) recipe(c);
  };
  if (step) commit(fn);
  else useDoc.getState().update(fn);
}

export function deleteCategory(id: string): void {
  if (!guard()) return;
  commit((d) => {
    d.categories = d.categories.filter((c) => c.id !== id);
    for (const e of d.events) if (e.categoryId === id) e.categoryId = '';
  });
}

/* ---------- 標記與目前進度 ---------- */

export function addMarker(time: string): string | null {
  if (!guard()) return null;
  const doc = docNow();
  if (doc.markers.length >= LIMITS.markers) return null;
  const m: Marker = { id: newId('m'), label: S.markerDefault, time, color: '#8a63d2', gm: false };
  commit((d) => {
    d.markers.push(m);
  });
  return m.id;
}

export function updateMarker(id: string, recipe: (m: Marker) => void, step = true): void {
  if (!guard()) return;
  const fn = (d: TimelineDoc) => {
    const m = d.markers.find((x) => x.id === id);
    if (m) recipe(m);
  };
  if (step) commit(fn);
  else useDoc.getState().update(fn);
}

export function deleteMarker(id: string): void {
  if (!guard()) return;
  commit((d) => {
    d.markers = d.markers.filter((m) => m.id !== id);
  });
}

export function patchDoc(patch: Partial<TimelineDoc>, step = true): void {
  if (!guard()) return;
  if (step) commit((d) => Object.assign(d, patch));
  else useDoc.getState().update((d) => Object.assign(d, patch));
}

/* ---------- 換寫法（規格 F04） ---------- */

export interface ConvertPlan {
  /** 換不過去的數目 */
  bad: number;
  apply: () => void;
}

/** 換算的計畫：dayOne 是「第 1 天」的日期（YYYY-MM-DD） */
export function planConvert(to: TimeMode, dayOneText: string): ConvertPlan | null {
  const doc = docNow();
  const dayOne = dayOneValue(dayOneText);
  const needsDay = doc.mode === 'day' || to === 'day';
  if (needsDay && dayOne === null) return null;
  const opts = { era: doc.era, dayOne: dayOne ?? 0 };
  let bad = 0;
  const conv = (s: string) => {
    if (!s) return '';
    const out = convertTime(doc.mode, to, s, opts);
    if (out === null) bad++;
    return out ?? '';
  };
  const events = doc.events.map((e) => ({ ...e, start: conv(e.start), end: conv(e.end) }));
  const markers = doc.markers.map((m) => ({ ...m, time: conv(m.time) }));
  const progressTime = conv(doc.progress.time);
  return {
    bad,
    apply: () => {
      if (bad || !guard()) return;
      commit((d) => {
        d.mode = to;
        d.events = events;
        d.markers = markers;
        d.progress.time = progressTime;
        if (needsDay && dayOneText) d.dayOne = canonical('date', { v: dayOne ?? 0, p: 'day' });
      });
      requestFit();
    },
  };
}

/** 換寫法時「第 1 天」的預設：上次指定的、最早的事件那天、今天 */
export function defaultDayOne(): string {
  const doc = docNow();
  if (doc.dayOne) return doc.dayOne;
  if (doc.mode === 'date') {
    let lo = Number.POSITIVE_INFINITY;
    for (const e of doc.events) {
      const t = readTime('date', e.start, '');
      if (t && t.v < lo) lo = t.v;
    }
    if (Number.isFinite(lo))
      return canonical('date', { v: Math.floor(lo / MINUTES_PER_DAY) * MINUTES_PER_DAY, p: 'day' });
  }
  const now = new Date();
  return canonical('date', {
    v: dateValue(now.getFullYear(), now.getMonth() + 1, now.getDate()),
    p: 'day',
  });
}

/* ---------- 讀入、重設 ---------- */

export function applyImport(
  events: TimelineEvent[],
  lanes: Lane[],
  categories: Category[],
  replace: boolean,
): number {
  if (!guard()) return 0;
  const room = replace ? LIMITS.events : LIMITS.events - docNow().events.length;
  const add = events.slice(0, Math.max(0, room));
  commit((d) => {
    d.lanes.push(...lanes.slice(0, LIMITS.lanes - d.lanes.length));
    d.categories.push(...categories.slice(0, LIMITS.categories - d.categories.length));
    d.events = replace ? add : [...d.events, ...add];
  });
  select(null);
  requestFit();
  return add.length;
}

/** 換成另一份資料（開啟專案檔、載入範例、重設）；可以復原 */
export function replaceDoc(next: TimelineDoc): void {
  commit((d) => {
    Object.assign(d, next);
  });
  useUi.setState({ selectedId: null, drag: null, flagDrag: null });
  requestFit();
}

export const resetBlank = (): void => replaceDoc(blankDoc());
export const loadExample = (): void => replaceDoc(exampleDoc());

/* ---------- 復原 ---------- */

export function undo(): void {
  if (!guard()) return;
  useDoc.endGesture();
  useDoc.temporal.getState().undo();
}
export function redo(): void {
  if (!guard()) return;
  useDoc.endGesture();
  useDoc.temporal.getState().redo();
}

/* ---------- 其他 ---------- */

/** 時間吸附（給拖曳、鍵盤用）；結果是標準寫法 */
export function snapText(
  mode: TimeMode,
  v: number,
  p: Parameters<typeof snapTv>[2],
  unit: SnapUnit,
) {
  return canonical(mode, snapTv(mode, v, p, unit));
}
