/**
 * 狀態與動作：
 * - useDoc：道具清單（每一張的全部設定；自動儲存、可以復原；滑桿放開、文字欄離開才記一步）；
 * - usePrefs：目前編輯的那一張、分頁、匯出的倍率與範圍（自動儲存，不列入復原）；
 * - 附圖與背景圖存在 IndexedDB 的資產庫（core/assets），狀態只記 id。
 */
import { createAssetStore, referencedAssetIds } from '@/core/assets';
import { createPreviewStore, createToolStore, historyGesture } from '@/core/storage';
import { EXAMPLES, exampleHandout } from './examples';
import {
  blankHandout,
  colorsForTheme,
  DEFAULT_SCALE,
  type ExportScale,
  HANDOUT_MAX,
  type Handout,
  type HandoutState,
  newHandoutId,
  normalizeSize,
  normalizeState,
  SCALES,
  snapSize,
  stateAssetIds,
  THEME_DEFAULTS,
  type ThemeId,
} from './model';

export const TOOL_ID = 'handout-maker';
/** 專案檔與自動儲存的資料版本 */
export const DATA_VERSION = 1;

/** 第一次開頁：一張基本主題的範例 */
export const initialState = (): HandoutState => ({ items: [exampleHandout(EXAMPLES.basic)] });

export const useDoc = createToolStore<HandoutState>(TOOL_ID, initialState(), {
  version: DATA_VERSION,
  migrate: (persisted) => normalizeState(persisted, initialState),
  coalesceMs: 0,
  historyLimit: 150,
});

/* 存檔可能缺欄位或被改壞：開頁時整理一次（沒有變化時不寫回），清空復原紀錄 */
{
  const cur = useDoc.getState().data;
  const fixed = normalizeState(cur, initialState);
  if (JSON.stringify(fixed) !== JSON.stringify(cur)) useDoc.getState().replace(fixed);
  useDoc.temporal.getState().clear();
}

/** 滑桿、文字欄：放開（離開）才記一步 */
export const gesture = historyGesture(useDoc);

export const docNow = (): HandoutState => useDoc.getState().data;

/** 復原／重做（手勢中不做事） */
export function historyStep(kind: 'undo' | 'redo'): void {
  if (useDoc.inGesture()) return;
  const t = useDoc.temporal.getState();
  if (kind === 'undo') t.undo();
  else t.redo();
}

/* ---------- 不列入復原的設定 ---------- */

export type TabId = 'content' | 'look' | 'images';
export type ExportTarget = 'one' | 'all';

export interface Prefs {
  /** 目前編輯的那一張（找不到時用第一張） */
  active: string;
  tab: TabId;
  scale: ExportScale;
  target: ExportTarget;
}

export const initialPrefs = (): Prefs => ({
  active: '',
  tab: 'content',
  scale: DEFAULT_SCALE,
  target: 'one',
});

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, initialPrefs());

/* 存下來的設定可能被改壞：開頁時整理一次 */
{
  const p = usePrefs.getState().data;
  const fixed: Prefs = {
    active: typeof p.active === 'string' ? p.active : '',
    tab: (['content', 'look', 'images'] as const).includes(p.tab) ? p.tab : 'content',
    scale: SCALES.includes(p.scale) ? p.scale : DEFAULT_SCALE,
    target: p.target === 'all' ? 'all' : 'one',
  };
  if (JSON.stringify(fixed) !== JSON.stringify(p)) usePrefs.getState().replace(fixed);
}

export const prefsNow = (): Prefs => usePrefs.getState().data;
export const setPrefs = (patch: Partial<Prefs>): void => usePrefs.getState().patch(patch);

/* ---------- 目前這一張 ---------- */

/** 目前編輯的那一張（prefs 的 id 找不到時是第一張） */
export function activeOf(s: HandoutState, id: string): Handout {
  return s.items.find((h) => h.id === id) ?? s.items[0];
}

export const activeNow = (): Handout => activeOf(docNow(), prefsNow().active);

/** React：目前這一張 */
export function useActive(): Handout {
  const id = usePrefs((p) => p.data.active);
  return useDoc((s) => activeOf(s.data, id));
}

/** 改某一張（一次變更＝一步復原，手勢中除外）；找不到時不做事 */
export function editHandout(id: string, recipe: (h: Handout) => void): void {
  if (!docNow().items.some((x) => x.id === id)) return;
  useDoc.getState().update((d) => {
    const h = d.items.find((x) => x.id === id);
    if (h) recipe(h as Handout);
  });
}

/** 改目前這一張 */
export function editActive(recipe: (h: Handout) => void): void {
  editHandout(activeNow().id, recipe);
}

/* ---------- 清單 ---------- */

export const select = (id: string): void => setPrefs({ active: id });

/** 加一張（放在目前這一張後面）並選取；滿了回傳 null */
export function addHandout(make: (id: string) => Handout): string | null {
  const s = docNow();
  if (s.items.length >= HANDOUT_MAX) return null;
  const id = newHandoutId(s.items.map((h) => h.id));
  const cur = activeNow();
  const at = s.items.findIndex((h) => h.id === cur.id) + 1;
  useDoc.getState().update((d) => {
    d.items.splice(at, 0, make(id));
  });
  select(id);
  return id;
}

/** 新增空白的一張：主題、大小、對齊 24 px 跟目前這一張相同 */
export function addBlank(): string | null {
  const cur = activeNow();
  return addHandout((id) => ({
    ...blankHandout(cur.theme, id),
    width: cur.width,
    height: cur.height,
    snap: cur.snap,
  }));
}

/** 目前這一張的副本 */
export function duplicateActive(): string | null {
  const cur = activeNow();
  return addHandout((id) => structuredClone({ ...cur, id }));
}

/** 刪掉一張（至少留一張）；回傳刪掉的那一張 */
export function removeHandout(id: string): Handout | null {
  const s = docNow();
  if (s.items.length <= 1) return null;
  const i = s.items.findIndex((h) => h.id === id);
  if (i < 0) return null;
  const gone = s.items[i];
  const wasActive = activeNow().id === id;
  useDoc.getState().update((d) => {
    d.items.splice(i, 1);
  });
  if (wasActive) {
    const next = docNow().items[Math.min(i, docNow().items.length - 1)];
    if (next) select(next.id);
  }
  return gone;
}

/** 換順序 */
export function moveHandout(from: number, to: number): void {
  const n = docNow().items.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return;
  useDoc.getState().update((d) => {
    const [h] = d.items.splice(from, 1);
    d.items.splice(to, 0, h);
  });
}

/** 換掉目前這一張（套用範例；id 不變） */
export function replaceActive(next: Handout): void {
  const id = activeNow().id;
  useDoc.getState().update((d) => {
    const i = d.items.findIndex((x) => x.id === id);
    if (i >= 0) d.items[i] = { ...next, id };
  });
}

/* ---------- 設定的動作 ---------- */

/** 換主題：兩個顏色都還是某個主題的預設時一起換成新主題的預設（同原作） */
export function setTheme(theme: ThemeId): void {
  editActive((h) => {
    if (h.theme === theme) return;
    const c = colorsForTheme(h, theme);
    h.theme = theme;
    h.bgColor = c.bgColor;
    h.textColor = c.textColor;
  });
}

export function resetColor(which: 'bg' | 'text'): void {
  editActive((h) => {
    const d = THEME_DEFAULTS[h.theme];
    if (which === 'bg') h.bgColor = d.bg;
    else h.textColor = d.text;
  });
}

/** 開關「對齊 24 px」：打開時寬高馬上對齊 */
export function setSnap(on: boolean): void {
  editActive((h) => {
    h.snap = on;
    if (on) {
      h.width = snapSize(h.width);
      h.height = snapSize(h.height);
    }
  });
}

/** 寬或高（打字中不對齊，離開欄位時才對齊：normalize 由 commit 做） */
export function setSize(which: 'width' | 'height', v: number, commit = false): void {
  editActive((h) => {
    h[which] = commit ? normalizeSize(v, h.snap) : Math.round(v);
  });
}

/* ---------- 資產 ---------- */

export const assets = createAssetStore(TOOL_ID);

/** 目前的狀態與復原紀錄用到的圖（開頁的整理時保留） */
export function referencedImages(): Set<string> {
  return referencedAssetIds(useDoc, stateAssetIds);
}

/* ---------- 重設 ---------- */

/** 換掉整份內容（重設、開啟專案檔；可以復原） */
export function resetAll(next: HandoutState): void {
  useDoc.getState().replace(next);
  select(next.items[0]?.id ?? '');
}

/** 重設：只留一張空白的 */
export const blankState = (): HandoutState => ({ items: [blankHandout('basic')] });
