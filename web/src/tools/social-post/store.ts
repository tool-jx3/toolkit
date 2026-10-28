/**
 * 狀態與動作：
 * - useDoc：深淺色、帳號、狀態列、貼文、限時動態、個人頁（自動儲存、可以復原；文字欄離開、滑桿放開、拖曳放開才記一步）；
 * - usePrefs：分頁、目前的貼文與限時動態、選取中的格子與貼紙、匯出設定（自動儲存，不列入復原）；
 * - 照片存在 IndexedDB 的資產庫（core/assets），狀態只記 id。
 */
import { createAssetStore, referencedAssetIds } from '@/core/assets';
import { createPreviewStore, createToolStore, historyGesture } from '@/core/storage';
import {
  collectAssetIds,
  initialState,
  MODEL_VERSION,
  normalizeState,
  type Post,
  type SocialState,
  type Story,
} from './model';
import type { ScreenId, TabId } from './strings';

export const TOOL_ID = 'social-post';
/**
 * 專案檔與自動儲存的資料版本。2（2026-10）：照片與格子的位置多了選填的 ax、ay（剛好放得下的那一邊記著的比例，place.ts）；
 * 3（2026-10 跟進原作 beb5ef1）：朋友身分、首頁動態、私訊；限時動態的進度條預設 1 段（舊預設 3 段的轉成 1 段）。
 * 舊版本的存檔、專案檔照常讀（normalizeState 整理與轉換，規格 3.9）。
 */
export const DATA_VERSION = MODEL_VERSION;

export const useDoc = createToolStore<SocialState>(TOOL_ID, initialState(), {
  version: DATA_VERSION,
  migrate: (persisted, from) => normalizeState(persisted, from),
  historyLimit: 150,
});

/* 存檔可能缺欄位或被改壞：開頁時整理一次（沒有變化時不寫回），清空復原紀錄 */
{
  const cur = useDoc.getState().data;
  const fixed = normalizeState(cur);
  if (JSON.stringify(fixed) !== JSON.stringify(cur)) useDoc.getState().replace(fixed);
  useDoc.temporal.getState().clear();
}

/** 文字欄、滑桿、拖曳：放開（離開）才記一步 */
export const gesture = historyGesture(useDoc);

export const docNow = (): SocialState => useDoc.getState().data;

/** 一次變更（400 ms 內的連續變更算一步；手勢中合成一步） */
export function edit(recipe: (d: SocialState) => void): void {
  useDoc.getState().update((d) => {
    recipe(d as SocialState);
  });
}

/** 改某則貼文 */
export function editPost(id: string, recipe: (p: Post, d: SocialState) => void): void {
  edit((d) => {
    const p = d.posts.find((x) => x.id === id);
    if (p) recipe(p, d);
  });
}

/** 改某則限時動態 */
export function editStory(id: string, recipe: (s: Story, d: SocialState) => void): void {
  edit((d) => {
    const s = d.stories.find((x) => x.id === id);
    if (s) recipe(s, d);
  });
}

/** 復原／重做（手勢中不做事） */
export function historyStep(kind: 'undo' | 'redo'): void {
  if (useDoc.inGesture()) return;
  const t = useDoc.temporal.getState();
  if (kind === 'undo') t.undo();
  else t.redo();
}

/* ---------- 不列入復原的設定 ---------- */

export type ExportFormat = 'png' | 'html';
export type HtmlScope = 'one' | 'all';
export const SCALES = [1, 2, 3] as const;

export interface Prefs {
  tab: TabId;
  /** 預覽的畫面（選「帳號與畫面」分頁時停在上一個畫面） */
  screen: ScreenId;
  postId: string;
  storyId: string;
  /** 選取中的格子（限時動態） */
  cell: number;
  /** 選取中的貼紙 */
  sticker: string | null;
  format: ExportFormat;
  htmlScope: HtmlScope;
  scale: number;
}

export const initialPrefs = (): Prefs => ({
  tab: 'post',
  screen: 'post',
  postId: 'p1',
  storyId: 's1',
  cell: 0,
  sticker: null,
  format: 'png',
  htmlScope: 'one',
  scale: 3,
});

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, initialPrefs());

const TABS: readonly TabId[] = ['post', 'comments', 'story', 'profile', 'feed', 'common'];
const SCREENS: readonly ScreenId[] = ['post', 'comments', 'story', 'profile', 'feed'];

/* 存下來的設定可能被改壞：開頁時整理一次 */
{
  const p = usePrefs.getState().data;
  const fixed: Prefs = {
    ...initialPrefs(),
    tab: TABS.includes(p.tab) ? p.tab : 'post',
    screen: SCREENS.includes(p.screen) ? p.screen : 'post',
    postId: typeof p.postId === 'string' ? p.postId : 'p1',
    storyId: typeof p.storyId === 'string' ? p.storyId : 's1',
    cell: typeof p.cell === 'number' && p.cell >= 0 && p.cell < 6 ? Math.round(p.cell) : 0,
    sticker: typeof p.sticker === 'string' ? p.sticker : null,
    format: p.format === 'html' ? 'html' : 'png',
    htmlScope: p.htmlScope === 'all' ? 'all' : 'one',
    scale: (SCALES as readonly number[]).includes(p.scale) ? p.scale : 3,
  };
  if (JSON.stringify(fixed) !== JSON.stringify(p)) usePrefs.getState().replace(fixed);
}

export const prefsNow = (): Prefs => usePrefs.getState().data;
export const setPrefs = (patch: Partial<Prefs>): void => usePrefs.getState().patch(patch);

/** 換分頁：前四個分頁也換預覽的畫面 */
export function setTab(tab: TabId): void {
  setPrefs(tab === 'common' ? { tab } : { tab, screen: tab });
}

/** 目前的貼文（找不到時第一則） */
export const currentPost = (d: SocialState, p: Prefs): Post =>
  d.posts.find((x) => x.id === p.postId) ?? d.posts[0];
export const currentStory = (d: SocialState, p: Prefs): Story =>
  d.stories.find((x) => x.id === p.storyId) ?? d.stories[0];

export function useCurrentPost(): Post {
  const posts = useDoc((s) => s.data.posts);
  const id = usePrefs((p) => p.data.postId);
  return posts.find((x) => x.id === id) ?? posts[0];
}

export function useCurrentStory(): Story {
  const stories = useDoc((s) => s.data.stories);
  const id = usePrefs((p) => p.data.storyId);
  return stories.find((x) => x.id === id) ?? stories[0];
}

/* ---------- 資產 ---------- */

export const assets = createAssetStore(TOOL_ID);

/** 目前的狀態與復原紀錄用到的圖（開頁的整理時保留） */
export function referencedImages(): Set<string> {
  return referencedAssetIds(useDoc, collectAssetIds);
}

/* ---------- 重設 ---------- */

/** 換掉整份內容（重設、開啟專案檔；可以復原） */
export function resetAll(next: SocialState): void {
  useDoc.getState().replace(next);
}
