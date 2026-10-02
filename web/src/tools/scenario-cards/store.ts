/**
 * 狀態與操作：
 * - useWorkspace：專案名稱、內文、卡片（每次變更立即自動存檔；列入復原，第 7 節裁定：刪除卡片、清除內文、
 *   讀取專案都可以復原）。
 * - usePrefs：篩選、兩個類型選單（自動存檔，不列入復原）。
 * - useCardUi：新卡片的捲動與聚焦、移動後亮起（不保存）。
 * - useSaved：存在瀏覽器裡的專案名稱（F30～F32）。
 * - useStatus：狀態訊息（F38：約 2.5 秒後自動清空；可復原的操作附「復原」鈕，留久一點）。
 * 自動存檔讀回時整理格式（F37：損壞時丟棄、用空白開始）。
 */

import { create } from 'zustand';
import type { StateStorage } from 'zustand/middleware';
import { copyText } from '@/core/files';
import {
  createPreviewStore,
  createToolStore,
  parseProject,
  serializeProject,
} from '@/core/storage';
import type { NoticeTone } from '@/ui';
import {
  applyProjectData,
  type Card,
  type CardContent,
  type CardFilter,
  type CardType,
  cardFromSelection,
  cardText,
  duplicateOf,
  INITIAL_PREFS,
  INITIAL_WORKSPACE,
  moveCard,
  newCardId,
  type Prefs,
  type ProjectData,
  restorePrefs,
  restoreWorkspace,
  sortProjectNames,
  typeText,
  type Workspace,
} from './logic';
import { S } from './strings';

export const TOOL_ID = 'scenario-cards';
/** 專案檔（與存在瀏覽器裡的專案）的資料版本 */
export const PROJECT_VERSION = 1;

/** 狀態訊息的顯示時間（F38） */
export const STATUS_MS = 2500;
/** 附「復原」鈕的訊息顯示時間（按得到） */
export const UNDO_STATUS_MS = 6000;

/* ---------- localStorage（讀寫一律包 try/catch） ---------- */

function local(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * 自動存檔用的儲存位置：讀回時用 clean 整理 data，格式不對（JSON 損壞、不是物件）時刪掉並當作沒有存檔。
 * 寫入失敗時丟錯，由 createToolStore 攔下並呼叫 onPersistError。
 */
function cleaningStorage(clean: (data: unknown) => unknown): StateStorage {
  return {
    getItem: (name) => {
      const ls = local();
      if (!ls) return null;
      let raw: string | null = null;
      try {
        raw = ls.getItem(name);
      } catch {
        return null;
      }
      if (raw === null) return null;
      try {
        const parsed = JSON.parse(raw) as { state?: { data?: unknown } } | null;
        const state = parsed?.state;
        if (!state || typeof state !== 'object') throw new Error('broken');
        const data = clean(state.data);
        if (!data) throw new Error('broken');
        return JSON.stringify({ ...parsed, state: { ...state, data } });
      } catch {
        try {
          ls.removeItem(name);
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

/* ---------- 狀態訊息 ---------- */

export interface StatusState {
  message: string;
  tone: NoticeTone;
  /** 可復原的操作：做完時的內容（目前的內容還是它時才顯示「復原」） */
  undoData: Workspace | null;
  seq: number;
}

export const useStatus = create<StatusState>(() => ({
  message: '',
  tone: 'info',
  undoData: null,
  seq: 0,
}));

let statusTimer: ReturnType<typeof setTimeout> | undefined;

export function notify(
  message: string,
  tone: NoticeTone = 'info',
  { undoable = false }: { undoable?: boolean } = {},
): void {
  clearTimeout(statusTimer);
  useStatus.setState((s) => ({
    message,
    tone,
    undoData: undoable ? useWorkspace.getState().data : null,
    seq: s.seq + 1,
  }));
  statusTimer = setTimeout(
    () => useStatus.setState({ message: '', undoData: null }),
    undoable ? UNDO_STATUS_MS : STATUS_MS,
  );
}

const persistFailed = () => notify(S.status.autosaveFailed, 'danger');

/* ---------- 自動存檔 ---------- */

export const useWorkspace = createToolStore<Workspace>(TOOL_ID, INITIAL_WORKSPACE, {
  storage: cleaningStorage(restoreWorkspace),
  onPersistError: persistFailed,
});

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, INITIAL_PREFS, {
  storage: cleaningStorage(restorePrefs),
  onPersistError: persistFailed,
});

const ws = () => useWorkspace.getState();
const prefs = () => usePrefs.getState();

/**
 * 一次操作算一步復原（刪除、清除、讀取…）：不和前後 400 ms 內的打字合併，
 * 狀態列的「復原」才剛好回到這次操作之前。
 */
function step<R>(fn: () => R): R {
  useWorkspace.beginGesture();
  try {
    return fn();
  } finally {
    useWorkspace.endGesture();
  }
}

/* ---------- 新卡片的捲動與聚焦、移動後亮起 ---------- */

export interface CardUiState {
  /** 捲到這張卡片並亮起；title 時游標移到標題欄並全選 */
  reveal: { id: string; title: boolean; seq: number } | null;
}

export const useCardUi = create<CardUiState>(() => ({ reveal: null }));

let revealSeq = 0;
function reveal(id: string, title: boolean) {
  revealSeq += 1;
  useCardUi.setState({ reveal: { id, title, seq: revealSeq } });
}

/* ---------- 內文與專案名稱 ---------- */

export const setText = (text: string) => ws().patch({ text });
export const setName = (name: string) => ws().patch({ name });

/** 讀入 TXT 後取代內文（F02）；專案名稱空白時填入 name */
export function importText(text: string, name: string | null) {
  step(() =>
    ws().update((d) => {
      d.text = text;
      if (name && !d.name.trim()) d.name = name;
    }),
  );
}

/** 清除內文（F04；可以復原） */
export function clearText() {
  step(() => setText(''));
  notify(S.status.textCleared, 'info', { undoable: true });
}

/* ---------- 卡片 ---------- */

export function setFilter(filter: CardFilter) {
  prefs().patch({ filter });
}

export function setNewType(type: CardType) {
  prefs().patch({ newType: type });
}

export function setSelectionType(type: CardType) {
  prefs().patch({ selectionType: type });
}

/** 新增卡片（F14）：加在清單最後、捲到它、亮起、游標到標題欄；篩選中看不到時切回「全部」（第 7 節裁定） */
export function addCard(content: CardContent): Card {
  const card: Card = { id: newCardId(), ...content };
  step(() =>
    ws().update((d) => {
      d.cards.push(card);
    }),
  );
  const { filter } = prefs().data;
  const unfiltered = filter !== 'all' && filter !== card.type;
  if (unfiltered) setFilter('all');
  reveal(card.id, true);
  notify(
    unfiltered
      ? S.status.cardCreatedUnfiltered(typeText(card.type))
      : S.status.cardCreated(typeText(card.type)),
    'success',
  );
  return card;
}

export const addBlankCard = () =>
  addCard({ type: prefs().data.newType, title: '', extra: '', body: '' });

/** 以選取內容建卡（F12、F13；3.2） */
export function createFromSelection(text: string, start: number, end: number): Card | null {
  const r = cardFromSelection(text, start, end, prefs().data.selectionType);
  if (!r.ok) {
    notify(r.reason === 'none' ? S.status.needSelection : S.status.emptySelection, 'warning');
    return null;
  }
  return addCard(r.card);
}

export function updateCard(id: string, patch: Partial<CardContent>) {
  ws().update((d) => {
    const c = d.cards.find((x) => x.id === id);
    if (c) Object.assign(c, patch);
  });
}

/** 換類型（F18）：標題、內文、第二標題都保留 */
export function setCardType(id: string, type: CardType) {
  step(() => updateCard(id, { type }));
  notify(S.status.typeChanged(typeText(type)));
}

/** 建立副本（F24）：加在清單最後 */
export function duplicateCard(id: string) {
  const card = ws().data.cards.find((c) => c.id === id);
  if (!card) return;
  const copy = duplicateOf(card);
  step(() =>
    ws().update((d) => {
      d.cards.push(copy);
    }),
  );
  notify(S.status.duplicated, 'success');
}

/** 刪除（F25；可以復原） */
export function deleteCard(id: string) {
  const card = ws().data.cards.find((c) => c.id === id);
  if (!card) return;
  step(() =>
    ws().update((d) => {
      d.cards = d.cards.filter((c) => c.id !== id);
    }),
  );
  notify(S.status.deleted(card.title.trim() || S.untitled), 'info', { undoable: true });
}

/** 排序（F26）：把 sourceId 放到 targetId 之前（或之後） */
export function moveCardTo(
  sourceId: string,
  targetId: string,
  where: 'before' | 'after' = 'before',
) {
  step(() => ws().patch({ cards: moveCard(ws().data.cards, sourceId, targetId, where) }));
  reveal(sourceId, false);
  notify(S.status.reordered);
}

/** 複製文字（F22） */
export async function copyCard(id: string) {
  const card = ws().data.cards.find((c) => c.id === id);
  if (!card) return;
  const ok = await copyText(cardText(card));
  notify(ok ? S.status.copied : S.status.copyFailed, ok ? 'success' : 'danger');
}

/* ---------- 專案（F30～F37） ---------- */

/** 目前的專案內容（存到瀏覽器、匯出專案檔） */
export function currentProject(): ProjectData {
  const { name, text, cards } = ws().data;
  return { name: name.trim(), text, cards, ...prefs().data };
}

/** 讀取專案時套用（F33）。fallbackName：檔案裡沒有名稱時用的名稱。不是本工具的資料時回傳 false */
export function applyProject(raw: unknown, fallbackName?: string): boolean {
  const current: ProjectData = {
    ...ws().data,
    ...prefs().data,
    name: fallbackName ?? ws().data.name,
  };
  const next = applyProjectData(current, raw);
  if (!next) return false;
  step(() => ws().replace({ name: next.name, text: next.text, cards: next.cards }));
  prefs().replace({
    filter: next.filter,
    newType: next.newType,
    selectionType: next.selectionType,
  });
  return true;
}

/** 清空全部（頁首專案選單；可以復原） */
export function resetAll() {
  step(() => ws().replace(INITIAL_WORKSPACE));
  setFilter('all');
  notify(S.status.reset, 'info', { undoable: true });
}

/* ---------- 存在瀏覽器裡的專案 ---------- */

export const SAVED_PREFIX = `trpg-toolkit:${TOOL_ID}:saved:`;

function listSaved(): string[] {
  const ls = local();
  if (!ls) return [];
  const names: string[] = [];
  try {
    for (let i = 0; i < ls.length; i++) {
      const key = ls.key(i);
      if (key?.startsWith(SAVED_PREFIX)) names.push(key.slice(SAVED_PREFIX.length));
    }
  } catch {
    return [];
  }
  return sortProjectNames(names);
}

export interface SavedState {
  names: string[];
  /** 清單上目前選的名稱（'' 是提示文字） */
  selected: string;
}

export const useSaved = create<SavedState>(() => ({ names: listSaved(), selected: '' }));

export const refreshSaved = () => useSaved.setState({ names: listSaved() });

/** 存到瀏覽器（F30）：名稱去頭尾空白，同名直接覆蓋 */
export function saveNamed(): 'ok' | 'no-name' | 'failed' {
  const name = ws().data.name.trim();
  if (!name) {
    notify(S.status.needName, 'warning');
    return 'no-name';
  }
  try {
    const ls = local();
    if (!ls) throw new Error('localStorage 無法使用');
    ls.setItem(SAVED_PREFIX + name, serializeProject(TOOL_ID, PROJECT_VERSION, currentProject()));
  } catch {
    notify(S.status.saveFailed, 'danger');
    return 'failed';
  }
  useSaved.setState({ names: listSaved(), selected: name });
  notify(S.status.saved(name), 'success');
  return 'ok';
}

/** 讀取存在瀏覽器裡的專案（F31、F32；可以復原） */
export function loadNamed(rawName: string): 'ok' | 'no-name' | 'missing' | 'broken' {
  const name = rawName.trim();
  if (!name) {
    notify(S.status.needLoadName, 'warning');
    return 'no-name';
  }
  let raw: string | null = null;
  try {
    raw = local()?.getItem(SAVED_PREFIX + name) ?? null;
  } catch {
    raw = null;
  }
  if (raw === null) {
    notify(S.status.projectNotFound(name), 'warning');
    return 'missing';
  }
  try {
    const project = parseProject(raw, TOOL_ID);
    if (!applyProject(project.data, name)) throw new Error('broken');
  } catch {
    notify(S.status.loadFailed(name), 'danger');
    return 'broken';
  }
  useSaved.setState({ selected: name });
  notify(S.status.loaded(name), 'success', { undoable: true });
  return 'ok';
}

/** 從瀏覽器刪除已存的專案（第 7 節裁定核准的新增功能） */
export function deleteNamed(name: string) {
  try {
    local()?.removeItem(SAVED_PREFIX + name);
  } catch {
    /* 刪不掉時清單照實際狀態顯示 */
  }
  useSaved.setState((s) => ({
    names: listSaved(),
    selected: s.selected === name ? '' : s.selected,
  }));
  notify(S.status.savedDeleted(name));
}
