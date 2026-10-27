/**
 * 狀態與動作：
 * - useDoc：用途、畫面大小、外觀、測試文字、目前的底（預設或我的預設）——自動儲存、可以復原（滑桿放開、文字欄離開才記一步）；
 * - usePrefs：設定分頁、預覽背景、範例立繪、試看的圖（資產 id）、放大鏡、四種狀態要看的按鈕——自動儲存，不列入復原；
 * - useSession：只在這次開頁有效（滑過、按下、匯出中、圖片與字型讀好後重畫的計數）；
 * - 試看的背景圖與立繪存在 IndexedDB 的資產庫（只供預覽，不進專案檔與我的預設）。
 */
import { create } from 'zustand';
import { createAssetStore } from '@/core/assets';
import { createPreviewStore, createToolStore, historyGesture } from '@/core/storage';
import {
  addParsed,
  MINE_MAX,
  MINE_NAME_MAX,
  makeMine,
  mineOf,
  type ParsedPreset,
  useMine,
} from './mine';
import {
  baseFromPreset,
  cloneDesign,
  DATA_VERSION,
  type Design,
  type DocState,
  initialState,
  type Mode,
  normalizeState,
  presetById,
  presetName,
  type Resolution,
  SCENES,
  type Scene,
  SYSTEM_BUTTONS,
  type SystemButton,
  TOOL_ID,
} from './model';
import { S } from './strings';

export const useDoc = createToolStore<DocState>(TOOL_ID, initialState(), {
  version: DATA_VERSION,
  migrate: (persisted) => normalizeState(persisted),
  historyLimit: 150,
});

/* 存檔可能缺欄位或被改壞：開頁時整理一次（沒有變化時不寫回），清空復原紀錄 */
{
  const cur = useDoc.getState().data;
  const fixed = normalizeState(cur);
  if (JSON.stringify(fixed) !== JSON.stringify(cur)) useDoc.getState().replace(fixed);
  useDoc.temporal.getState().clear();
}

/** 滑桿、文字欄、顏色拖曳：放開（離開）才記一步 */
export const gesture = historyGesture(useDoc);

export const docNow = (): DocState => useDoc.getState().data;

/** 一次變更＝一步復原（手勢中除外） */
export function edit(recipe: (d: DocState) => void): void {
  useDoc.getState().update((d) => {
    recipe(d as DocState);
  });
}

/**
 * 結束還開著的手勢（文字欄打到一半就切分頁、換用途時，欄位直接卸載、收不到離開事件）：
 * 打的字先記成一步，之後的變更才不會被併進去。
 */
export function settleGesture(): void {
  if (useDoc.inGesture()) useDoc.endGesture();
}

export function historyStep(kind: 'undo' | 'redo'): void {
  if (useDoc.inGesture()) return;
  const t = useDoc.temporal.getState();
  if (kind === 'undo') t.undo();
  else t.redo();
}

/* ---------- 不列入復原的設定 ---------- */

export type TabId = 'style' | 'design' | 'text';
export const TAB_IDS: readonly TabId[] = ['style', 'design', 'text'];
export type InspectTarget = 'choice' | SystemButton;
export const INSPECT_TARGETS: readonly InspectTarget[] = ['choice', ...SYSTEM_BUTTONS];

export interface ImageRef {
  id: string;
  name: string;
}

export interface Prefs {
  tab: TabId;
  scene: Scene;
  samplePortrait: boolean;
  bg: ImageRef | null;
  char: ImageRef | null;
  magnifier: boolean;
  lensZoom: 1 | 2;
  inspect: InspectTarget;
}

export const initialPrefs = (): Prefs => ({
  tab: 'style',
  scene: presetById(initialState().base.id)?.scene ?? 'study',
  samplePortrait: true,
  bg: null,
  char: null,
  magnifier: true,
  lensZoom: 1,
  inspect: 'choice',
});

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, initialPrefs());

const isRef = (v: unknown): v is ImageRef =>
  !!v &&
  typeof v === 'object' &&
  typeof (v as ImageRef).id === 'string' &&
  !!(v as ImageRef).id &&
  typeof (v as ImageRef).name === 'string';

/* 存下來的設定可能被改壞：開頁時整理一次 */
{
  const p = usePrefs.getState().data;
  const d = initialPrefs();
  const fixed: Prefs = {
    tab: TAB_IDS.includes(p.tab) ? p.tab : d.tab,
    scene: SCENES.includes(p.scene) ? p.scene : d.scene,
    samplePortrait: typeof p.samplePortrait === 'boolean' ? p.samplePortrait : d.samplePortrait,
    bg: isRef(p.bg) ? { id: p.bg.id, name: p.bg.name } : null,
    char: isRef(p.char) ? { id: p.char.id, name: p.char.name } : null,
    magnifier: typeof p.magnifier === 'boolean' ? p.magnifier : d.magnifier,
    lensZoom: p.lensZoom === 2 ? 2 : 1,
    inspect: INSPECT_TARGETS.includes(p.inspect) ? p.inspect : d.inspect,
  };
  if (JSON.stringify(fixed) !== JSON.stringify(p)) usePrefs.getState().replace(fixed);
}

export const prefsNow = (): Prefs => usePrefs.getState().data;
export const setPrefs = (patch: Partial<Prefs>): void => usePrefs.getState().patch(patch);

/** 試看的背景圖與立繪 */
export const assets = createAssetStore(TOOL_ID);

/* ---------- 這次開頁才有的狀態 ---------- */

export interface Session {
  hover: string | null;
  pressed: string | null;
  /** 圖片解碼完、字型載入完時加 1（重畫預覽） */
  tick: number;
  /** 字型：載入中、可用、載不到 */
  font: 'loading' | 'ready' | 'fallback';
  /** 匯出中（進度） */
  busy: { done: number; total: number } | null;
}

export const useSession = create<Session>(() => ({
  hover: null,
  pressed: null,
  tick: 0,
  font: 'loading',
  busy: null,
}));

export const bump = (): void => useSession.setState((s) => ({ tick: s.tick + 1 }));

/* ---------- 動作 ---------- */

export function setMode(mode: Mode): void {
  if (docNow().mode === mode) return;
  settleGesture();
  useSession.setState({ hover: null, pressed: null });
  edit((d) => {
    d.mode = mode;
  });
}

export function setResolution(res: Resolution): void {
  if (docNow().resolution === res) return;
  settleGesture();
  edit((d) => {
    d.resolution = res;
  });
}

/** 套用世界觀預設：外觀換成預設的值，用途與測試文字不變；預覽背景換成預設搭配的背景 */
export function applyPreset(id: string): void {
  const p = presetById(id);
  if (!p) return;
  settleGesture();
  edit((d) => {
    d.design = cloneDesign(p.design);
    d.base = baseFromPreset(p, presetName(p.id));
  });
  setPrefs({ scene: p.scene });
}

/** 套用我的預設：外觀與測試文字 */
export function applyMine(id: string): void {
  const m = mineOf(id);
  if (!m) return;
  settleGesture();
  edit((d) => {
    d.design = cloneDesign(m.design);
    d.texts = { ...m.texts };
    d.base = { kind: 'mine', id: m.id, name: m.name, design: cloneDesign(m.design) };
  });
}

/** 一個欄位回到原始值（套用的預設或我的預設） */
export function resetField(key: keyof Design): void {
  const s = docNow();
  if (s.design[key] === s.base.design[key]) return;
  settleGesture();
  edit((d) => {
    (d.design as unknown as Record<string, unknown>)[key] = s.base.design[key];
  });
}

/** 外觀全部回到原始值 */
export function resetDesignToBase(): void {
  settleGesture();
  edit((d) => {
    d.design = cloneDesign(d.base.design);
  });
}

/** 存成我的預設（之後以它為底）；滿了回傳 null */
export function saveMine(name: string): string | null {
  const items = useMine.getState().data.items;
  if (items.length >= MINE_MAX) return null;
  const s = docNow();
  const m = makeMine(items, name, s.design, s.texts);
  useMine.getState().replace({ items: [...items, m] });
  useDoc.temporal.getState().pause();
  try {
    edit((d) => {
      d.base = { kind: 'mine', id: m.id, name: m.name, design: cloneDesign(m.design) };
    });
  } finally {
    useDoc.temporal.getState().resume();
  }
  return m.name;
}

export function renameMine(id: string, raw: string): void {
  /* 打字中可以是空的（顯示「未命名」）；最多 40 字 */
  const name = Array.from(raw).slice(0, MINE_NAME_MAX).join('');
  useMine.getState().update((m) => {
    const t = m.items.find((x) => x.id === id);
    if (t) t.name = name;
  });
  const s = docNow();
  if (s.base.kind === 'mine' && s.base.id === id) {
    useDoc.temporal.getState().pause();
    try {
      edit((d) => {
        d.base.name = name || S.mine.unnamed;
      });
    } finally {
      useDoc.temporal.getState().resume();
    }
  }
}

export function removeMine(id: string): void {
  const items = useMine.getState().data.items;
  useMine.getState().replace({ items: items.filter((t) => t.id !== id) });
}

export function importMine(parsed: readonly ParsedPreset[]): { added: number; dropped: number } {
  const r = addParsed(useMine.getState().data.items, parsed);
  useMine.getState().replace({ items: r.items });
  return { added: r.added, dropped: r.dropped };
}

/** 開啟專案檔、重設：換掉整份內容（可以復原） */
export function replaceDoc(next: DocState): void {
  settleGesture();
  useSession.setState({ hover: null, pressed: null });
  useDoc.getState().replace(next);
}
