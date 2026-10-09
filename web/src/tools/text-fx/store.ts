/**
 * 設定的狀態：三種模式各自的設定與目前範本、依範本記住的文字、手動檔名。
 * 自動存檔（localStorage `trpg-toolkit:text-fx`）＋復原／重做；第一次開啟時匯入舊版的存檔。
 * 預覽相關的偏好（底色、循環、分頁、匯出格式）另外存，不進復原歷史。
 */
import type { Draft } from 'immer';
import { create } from 'zustand';
import { createToolStore } from '@/core/storage';
import { settingsFromTemplate, TEMPLATES, templateById } from './library';
import { addParsed, makeMine, mineOf, type ParsedTemplate, useMine } from './mine';
import { deepClone, MODES, type Mode, normalizeSettings, type Settings } from './settings';

export interface ModeEntry {
  tpl: string;
  s: Settings;
  /** 套用中的「我的範本」（P11；套用內建範本時清掉） */
  mine?: string | null;
}

export interface TextMemo {
  title: Record<string, { text: string; sub: string }>;
  long: Record<string, { text: string }>;
  caption: { text: string; sub: string } | null;
}

export interface TfxData {
  mode: Mode;
  modes: Record<Mode, ModeEntry>;
  memo: TextMemo;
  /** 每個模式的手動檔名（空＝自動命名） */
  names: Record<Mode, string>;
}

export const TOOL_ID = 'text-fx';
export const LEGACY_KEY = 'trpg-toolkit:text-fx:v1';
const isMode = (m: unknown): m is Mode => MODES.some(([k]) => k === m);

/** 套用範本：畫面尺寸與登場、退場開關保留原本的設定，其他回到「基礎預設＋範本差異」，並恢復記住的文字 */
export function templateEntry(
  data: Pick<TfxData, 'memo'>,
  mode: Mode,
  id: string,
  prev: Settings | null,
  { ignoreMemo = false }: { ignoreMemo?: boolean } = {},
): ModeEntry {
  const tpl = templateById(mode, id);
  const s = normalizeSettings(mode, settingsFromTemplate(mode, tpl));
  if (prev) {
    s.canvasW = prev.canvasW;
    s.canvasH = prev.canvasH;
    s.introOn = prev.introOn;
    s.outroOn = prev.outroOn;
  }
  if (!ignoreMemo) {
    if (mode === 'caption') {
      const m = data.memo.caption;
      if (m) {
        s.text = m.text;
        s.sub = m.sub;
      }
    } else if (mode === 'title') {
      const m = data.memo.title[tpl.id];
      if (m) {
        s.text = m.text;
        s.sub = m.sub || '';
      }
    } else {
      const m = data.memo.long[tpl.id];
      if (m) s.text = m.text;
    }
  }
  return { tpl: tpl.id, s };
}

export function initialData(): TfxData {
  const memo: TextMemo = { title: {}, long: {}, caption: null };
  const modes = Object.fromEntries(
    MODES.map(([m]) => [m, templateEntry({ memo }, m, TEMPLATES[m][0].id, null)]),
  ) as Record<Mode, ModeEntry>;
  return { mode: 'title', modes, memo, names: { title: '', long: '', caption: '' } };
}

/** 存檔、專案檔、舊版存檔 → 完整且合法的資料 */
export function normalizeData(raw: unknown): TfxData {
  const base = initialData();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<TfxData> & { memo?: Partial<TextMemo> };
  const out: TfxData = {
    mode: isMode(r.mode) ? r.mode : 'title',
    memo: {
      title: { ...(r.memo?.title ?? {}) },
      long: { ...(r.memo?.long ?? {}) },
      caption: r.memo?.caption ?? null,
    },
    names: { ...base.names, ...(r.names ?? {}) },
    modes: base.modes,
  };
  const modes = { ...base.modes };
  for (const [m] of MODES) {
    const e = (
      r.modes as Record<string, { tpl?: string; s?: unknown; mine?: unknown }> | undefined
    )?.[m];
    if (e?.s)
      modes[m] = {
        tpl: templateById(m, e.tpl).id,
        s: normalizeSettings(m, e.s),
        ...(typeof e.mine === 'string' && e.mine ? { mine: e.mine } : {}),
      };
  }
  out.modes = modes;
  return out;
}

/** 新版還沒有存檔、但有舊版存檔時讀出舊版（要在建立 store 之前讀，避免被新版的存檔蓋過） */
function readLegacy(): unknown {
  try {
    if (typeof localStorage === 'undefined') return null;
    if (localStorage.getItem(`trpg-toolkit:${TOOL_ID}`) !== null) return null;
    const raw = localStorage.getItem(LEGACY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const legacy = readLegacy() as {
  view?: { bg?: string; color?: string; loop?: boolean };
} | null;

export const useTfx = createToolStore<TfxData>(TOOL_ID, initialData(), {
  version: 1,
  migrate: (persisted) => normalizeData(persisted),
});

/* ---------- 預覽偏好（不進復原歷史） ---------- */

export interface ViewPrefs {
  bg: 'checker' | 'dark' | 'light' | 'color';
  color: string;
  loop: boolean;
  tab: string;
  format: string;
  scale: number;
  /** 一次匯出多個（P11）：off／每一行（長文每一頁）各一個／勾選的範本 */
  batch: 'off' | 'lines' | 'templates';
  /** 批次匯出勾選的範本（每個模式各自；內建 b:<id>、我的範本 m:<id>） */
  batchPick: Record<Mode, string[]>;
}

export const VIEW_DEFAULTS: ViewPrefs = {
  bg: 'checker',
  color: '#808080',
  loop: true,
  tab: 'mode',
  format: 'apng',
  scale: 1,
  batch: 'off',
  batchPick: { title: [], long: [], caption: [] },
};

export const useView = createToolStore<ViewPrefs>(`${TOOL_ID}:view`, VIEW_DEFAULTS, {
  historyLimit: 1,
});

/* ---------- 第一次開啟：修正存檔／匯入舊版 ---------- */

if (legacy && typeof legacy === 'object') {
  useTfx.getState().replace(normalizeData(legacy));
  const v = legacy.view;
  if (v) {
    const bgMap: Record<string, Partial<ViewPrefs>> = {
      checker: { bg: 'checker' },
      black: { bg: 'dark' },
      white: { bg: 'light' },
      gray: { bg: 'color', color: '#808080' },
      color: { bg: 'color', color: typeof v.color === 'string' ? v.color : '#808080' },
    };
    useView.getState().patch({
      ...(bgMap[v.bg ?? ''] ?? {}),
      ...(typeof v.loop === 'boolean' ? { loop: v.loop } : {}),
    });
  }
} else {
  /* 存檔可能是舊格式或缺欄位：修正一次（沒有變化時不寫回） */
  const cur = useTfx.getState().data;
  const fixed = normalizeData(cur);
  if (JSON.stringify(fixed) !== JSON.stringify(cur)) useTfx.getState().replace(fixed);
}
useTfx.temporal.getState().clear();
useView.temporal.getState().clear();

/* ---------- 重播訊號（套用範本、切換模式時從頭播放） ---------- */

export const useReplay = create<{ token: number }>(() => ({ token: 0 }));
const bumpReplay = () => useReplay.setState((s) => ({ token: s.token + 1 }));

/* ---------- 動作 ---------- */

export const cfgOf = (d: TfxData): Settings => d.modes[d.mode].s;

function rememberText(d: Draft<TfxData>): void {
  /* 套用中的是「我的範本」：文字跟著那一組設定，不記到內建範本 */
  if (d.modes[d.mode].mine) return;
  const s = d.modes[d.mode].s;
  const tpl = d.modes[d.mode].tpl;
  if (d.mode === 'caption') d.memo.caption = { text: s.text, sub: s.sub };
  else if (d.mode === 'title') d.memo.title[tpl] = { text: s.text, sub: s.sub };
  else d.memo.long[tpl] = { text: s.text };
}

/** 改目前模式的設定（Immer 寫法）；改到文字時記到這個範本 */
export function updateCfg(recipe: (s: Draft<Settings>) => void): void {
  useTfx.getState().update((d) => {
    const s = d.modes[d.mode].s;
    const text = s.text;
    const sub = s.sub;
    recipe(s);
    if (s.text !== text || s.sub !== sub) rememberText(d);
  });
}

export function setMode(m: Mode): void {
  const d = useTfx.getState().data;
  if (m === d.mode || !d.modes[m]) return;
  useTfx.getState().update((x) => {
    x.mode = m;
  });
  bumpReplay();
}

export function applyTemplate(id: string): void {
  const d = useTfx.getState().data;
  /* 整組換掉：套用中的我的範本也一起清掉 */
  const entry = templateEntry(d, d.mode, id, d.modes[d.mode].s);
  useTfx.getState().update((x) => {
    x.modes[x.mode] = entry;
  });
  bumpReplay();
}

/** 把目前模式的所有設定（含文字）恢復成範本原樣（套用中的是我的範本時回到那個範本） */
export function resetTemplate(): void {
  const d = useTfx.getState().data;
  const mine = mineOf(d.modes[d.mode].mine);
  if (mine && mine.mode === d.mode) {
    applyMine(mine.id);
    return;
  }
  const id = d.modes[d.mode].tpl;
  const entry = templateEntry(d, d.mode, id, deepClone(d.modes[d.mode].s), { ignoreMemo: true });
  useTfx.getState().update((x) => {
    if (x.mode === 'caption') x.memo.caption = null;
    else if (x.mode === 'title') delete x.memo.title[id];
    else delete x.memo.long[id];
    x.modes[x.mode] = entry;
  });
  bumpReplay();
}

/* ---------- 我的範本（P11） ---------- */

/** 套用我的範本：完整的設定（含文字、登場與退場開關），只保留目前的畫面尺寸 */
export function mineEntry(prev: ModeEntry, mineS: Settings, mode: Mode, id: string): ModeEntry {
  const s = normalizeSettings(mode, deepClone(mineS));
  s.canvasW = prev.s.canvasW;
  s.canvasH = prev.s.canvasH;
  return { tpl: prev.tpl, s, mine: id };
}

export function applyMine(id: string): void {
  const item = mineOf(id);
  const d = useTfx.getState().data;
  if (!item || item.mode !== d.mode) return;
  const entry = mineEntry(d.modes[d.mode], item.s, d.mode, item.id);
  useTfx.getState().update((x) => {
    x.modes[x.mode] = entry;
  });
  bumpReplay();
}

/** 把目前模式的設定存成我的範本（回傳新的範本） */
export function saveMine(name: string) {
  const d = useTfx.getState().data;
  const item = makeMine(useMine.getState().data.items, d.mode, d.modes[d.mode].s, name);
  useMine.getState().update((m) => {
    m.items.push(item);
  });
  return item;
}

export function renameMine(id: string, name: string): void {
  useMine.getState().update((m) => {
    const t = m.items.find((x) => x.id === id);
    /* 打字中可以是空的（顯示「未命名範本」）；最多 40 字 */
    if (t) t.name = Array.from(name).slice(0, 40).join('');
  });
}

/** 讀入的範本加進清單（名稱重複時加編號） */
export function importMine(parsed: readonly ParsedTemplate[]): void {
  if (!parsed.length) return;
  useMine.getState().replace({ items: addParsed(useMine.getState().data.items, parsed) });
}

export function removeMine(id: string): void {
  useMine.getState().update((m) => {
    m.items = m.items.filter((x) => x.id !== id);
  });
}

export function setManualName(v: string): void {
  useTfx.getState().update((d) => {
    d.names[d.mode] = v.trim();
  });
}

/** 開啟專案檔／重設之後從頭播放 */
export function replaceAll(data: TfxData): void {
  useTfx.getState().replace(data);
  bumpReplay();
}
