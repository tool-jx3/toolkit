/**
 * 房間 ZIP 產生器的狀態：
 * - useProject：專案內容（createToolStore：自動存到 localStorage、復原／重做 40 步、0.8 秒內的連續變更合成一步；
 *   開頁自動還原，第 7 節裁定 D15）。圖片本體在 IndexedDB（assets），專案只記圖片檔名。
 * - useSettings：工具設定（同一瀏覽器內跨專案）。
 * - useLibrary：跨專案的範本與收藏（部件範本、棋子範本、演出預設、切入範本、KP 範本、劇本範本、最愛），圖片在 libAssets；
 *   「範本領域」有自己的復原／重做（F273）。
 * - useLayout：介面配置（右側面板、底部欄、左側收合…，記在瀏覽器）。
 * - useSession：這次開頁的介面狀態（目前頁面、場景、選取、對話框、記住的場景設定…）。
 * - useBlobs：素材圖片的物件網址與遺失清單。
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createAssetStore } from '@/core/assets';
import { createToolStore, safeStorage } from '@/core/storage';
import { type Ctx, ctxOf, finalize } from './actions';
import type { FadeEndpoints } from './fade';
import {
  createProject,
  createToolSettings,
  type FullFit,
  type PieceKind,
  type Project,
  type SearchSite,
  type Skill,
  type Tag,
  TOOL_ID,
  type ToolSettings,
} from './model';
import type { SceneClip } from './scenes';

/* ---------- 持久化的小 store ---------- */

function storage() {
  return createJSONStorage(() =>
    safeStorage(
      typeof localStorage === 'undefined'
        ? { getItem: () => null, setItem: () => undefined, removeItem: () => undefined }
        : localStorage,
    ),
  );
}

interface Persisted<T> {
  data: T;
  patch: (p: Partial<T>) => void;
  replace: (d: T) => void;
}

function persisted<T extends object>(key: string, initial: T) {
  return create<Persisted<T>>()(
    persist(
      (set, get) => ({
        data: initial,
        patch: (p) => set({ data: { ...get().data, ...p } }),
        replace: (d) => set({ data: d }),
      }),
      {
        name: `trpg-toolkit:${TOOL_ID}:${key}`,
        storage: storage(),
        partialize: (s) => ({ data: s.data }),
        merge: (p, cur) => ({
          ...cur,
          data: { ...initial, ...((p as { data?: Partial<T> } | undefined)?.data ?? {}) },
        }),
      },
    ),
  );
}

/* ---------- 專案 ---------- */

export const HISTORY_LIMIT = 40;
export const HISTORY_COALESCE_MS = 800;

export const useProject = createToolStore<Project>(TOOL_ID, createProject(), {
  version: 1,
  historyLimit: HISTORY_LIMIT,
  coalesceMs: HISTORY_COALESCE_MS,
});

/* ---------- 工具設定 ---------- */

export const useSettings = persisted<ToolSettings>('settings', createToolSettings());

export const settings = (): ToolSettings => useSettings.getState().data;
export const ctx = (p: Project = useProject.getState().data): Ctx => ctxOf(p, settings());

/** 改專案：recipe 之後套用立繪庫的同步（F233、D5） */
export function commit(recipe: (d: Project, c: Ctx) => void): void {
  useProject.getState().update((d) => {
    const c = ctxOf(d as Project, settings());
    recipe(d as Project, c);
    finalize(d as Project, c);
  });
  domain.current = 'project';
}

/* ---------- 範本與收藏（跨專案） ---------- */

export interface PartTemplate {
  id: string;
  kind: 'marker' | 'panel';
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  lockAspect: boolean;
  locked: boolean;
  visible: boolean;
  text: string;
  /** 圖片（libAssets 的 id＝房間圖片檔名） */
  imageUrl: string;
  imageLabel: string;
  imageWidth: number;
  imageHeight: number;
}

export interface PieceTemplate {
  id: string;
  name: string;
  kind: Exclude<PieceKind, 'kp'>;
  iconUrl: string | null;
  hp: string;
  mp: string;
  faces: { label: string; iconUrl: string | null }[];
  armor: string;
  dodge: string;
  noDodge: boolean;
  skills: Omit<Skill, 'id'>[];
  commands: string;
  memo: string;
}

/** 演出預設與切入範本的清單項目（可以穿插分隔） */
export type LayoutEntry<T> =
  | { type: 'item'; item: T }
  | { type: 'separator'; id: string; label: string };

export interface EffectPreset {
  id: string;
  name: string;
  imageUrl: string | null;
  imageLabel: string;
  kind: 'full' | 'free';
  fullFit: FullFit;
  z: number;
  width: number;
  height: number;
  text: string;
}

export interface CutinTemplate {
  id: string;
  name: string;
  imageUrl: string | null;
  imageLabel: string;
}

export interface KpTemplate {
  id: string;
  name: string;
  system: Project['kp']['system'];
  values: Project['kp']['tpl']['coc6'];
}

export interface StoryTemplate {
  id: string;
  name: string;
  title: string;
  body: string;
}

export interface Favorite {
  /** libAssets 的 id＝房間圖片檔名 */
  name: string;
  label: string;
  tags: Tag[];
  mime: string;
  originalName: string;
}

export interface Library {
  partTemplates: PartTemplate[];
  pieceTemplates: PieceTemplate[];
  effectPresets: LayoutEntry<EffectPreset>[];
  cutinTemplates: LayoutEntry<CutinTemplate>[];
  kpTemplates: KpTemplate[];
  storyTemplates: StoryTemplate[];
  favorites: Favorite[];
}

export const emptyLibrary = (): Library => ({
  partTemplates: [],
  pieceTemplates: [],
  effectPresets: [],
  cutinTemplates: [],
  kpTemplates: [],
  storyTemplates: [],
  favorites: [],
});

export const useLibrary = persisted<Library>('library', emptyLibrary());

/** 最後一次動作屬於哪個領域（F273：屬於範本領域時，復原先作用在範本領域） */
export const domain: { current: 'project' | 'template' } = { current: 'project' };

interface TemplateHistory {
  past: Library[];
  future: Library[];
}
export const useTemplateHistory = create<TemplateHistory>(() => ({ past: [], future: [] }));

/** 改範本領域（記一步「範本領域」的復原） */
export function commitLibrary(recipe: (lib: Library) => Library): void {
  const before = useLibrary.getState().data;
  const after = recipe(structuredClone(before));
  useLibrary.getState().replace(after);
  const h = useTemplateHistory.getState();
  useTemplateHistory.setState({ past: [...h.past, before].slice(-HISTORY_LIMIT), future: [] });
  domain.current = 'template';
}

/** 改收藏或劇本範本（不列入範本領域的復原） */
export function patchLibrary(recipe: (lib: Library) => Library): void {
  useLibrary.getState().replace(recipe(structuredClone(useLibrary.getState().data)));
}

/* ---------- 圖片 ---------- */

/** 素材圖片（IndexedDB：trpg-toolkit:tool:room-zip:assets；id＝房間圖片檔名） */
export const assets = createAssetStore(TOOL_ID);
/** 範本與收藏的圖片（trpg-toolkit:tool:room-zip:library） */
export const libAssets = createAssetStore(TOOL_ID, { name: 'library' });

interface Blobs {
  /** 檔名 → 物件網址（本專案的素材） */
  urls: Record<string, string>;
  /** 範本與收藏的圖（libAssets） */
  lib: Record<string, string>;
  /** 讀不到圖片資料的檔名 */
  missing: Record<string, true>;
  /** 存不進 IndexedDB 的原因（只在記憶體裡） */
  persistFailure: 'quota' | 'unavailable' | null;
}
export const useBlobs = create<Blobs>(() => ({
  urls: {},
  lib: {},
  missing: {},
  persistFailure: null,
}));

/** 放進一張圖（素材）；回傳是否存進 IndexedDB */
export async function putBlob(name: string, blob: Blob): Promise<boolean> {
  const r = await assets.put(name, blob);
  const url = await assets.url(name);
  useBlobs.setState((s) => {
    const { [name]: _, ...missing } = s.missing;
    return {
      urls: url ? { ...s.urls, [name]: url } : s.urls,
      missing,
      persistFailure: r.persisted
        ? s.persistFailure
        : r.reason === 'quota'
          ? 'quota'
          : 'unavailable',
    };
  });
  return r.persisted;
}

/** 讀回圖片（重新整理後）；回傳找不到的檔名 */
export async function loadBlobs(names: Iterable<string>): Promise<string[]> {
  const lost: string[] = [];
  const urls: Record<string, string> = {};
  for (const n of new Set(names)) {
    if (useBlobs.getState().urls[n]) continue;
    const u = await assets.url(n).catch(() => undefined);
    if (u) urls[n] = u;
    else lost.push(n);
  }
  useBlobs.setState((s) => ({
    urls: { ...s.urls, ...urls },
    missing: { ...s.missing, ...Object.fromEntries(lost.map((n) => [n, true as const])) },
  }));
  return lost;
}

export const hasBlob = (name: string): boolean => !!useBlobs.getState().urls[name];

/* ---------- 介面配置（記在瀏覽器） ---------- */

export type PageId =
  | 'home'
  | 'room'
  | 'materials'
  | 'scenes'
  | 'tachie'
  | 'cutins'
  | 'story'
  | 'pieces'
  | 'save'
  | 'settings';

export interface Layout {
  rightOpen: boolean;
  rightPinned: boolean;
  rightTab: 'media' | 'preview';
  rightWidth: number;
  bottomOpen: boolean;
  sideCollapsed: boolean;
  /** 最後一次開過的非首頁頁面（F026） */
  lastPage: PageId | null;
  /** 場景詳細四個區塊的開合（F191） */
  sceneFolds: Record<string, boolean>;
  /** 其他可摺疊區塊的開合 */
  folds: Record<string, boolean>;
  sceneZoom: number;
  scenePvHeight: number;
  roomZoom: number;
  roomLayers: boolean;
  /** 預覽暫時隱藏（各場景共用；F220） */
  previewHidden: Record<string, true>;
  /** 立繪頁預覽的隱藏（F225） */
  tachiePreviewHidden: Record<string, true>;
}

export const useLayout = persisted<Layout>('layout', {
  rightOpen: true,
  rightPinned: true,
  rightTab: 'media',
  rightWidth: 340,
  bottomOpen: false,
  sideCollapsed: false,
  lastPage: null,
  sceneFolds: {},
  folds: {},
  sceneZoom: 1,
  scenePvHeight: 220,
  roomZoom: 0.82,
  roomLayers: true,
  previewHidden: {},
  tachiePreviewHidden: {},
});

export const layout = (): Layout => useLayout.getState().data;
export const patchLayout = (p: Partial<Layout>): void => useLayout.getState().patch(p);

/* ---------- 這次開頁的狀態 ---------- */

/** 選圖面板的對象（選了就呼叫 apply） */
export interface PickTarget {
  current: string | null;
  /** 欄位空白時的說明（例如「無」「之後再選」） */
  empty: string;
  /** 預設只列的用途 */
  role: Tag | null;
  apply: (name: string | null) => void;
}

export type MakeContext =
  | { kind: 'material' }
  | { kind: 'picker' }
  | { kind: 'scene'; sceneId: string; effectId: string }
  | { kind: 'preset'; presetId: string }
  | { kind: 'edit' }
  | { kind: 'room'; partId: string };

export interface FadeState extends FadeEndpoints {
  context: MakeContext;
  source: string | null;
  /** 從加工開啟時的加工結果（PNG） */
  temp: { blob: Blob; label: string; width: number; height: number; url: string } | null;
  rejected: boolean;
  color: string;
  seconds: number;
  loop: boolean;
}

export type Modal =
  | { kind: 'solid' }
  | { kind: 'fade'; state: FadeState }
  | { kind: 'maker'; context: MakeContext; background: string }
  | { kind: 'edit'; name: string; context: MakeContext; stayRoom?: string }
  | { kind: 'multi'; for: 'scene' | 'tachie' | 'marker' | 'panel' | 'cutin' }
  | { kind: 'bulk' }
  | { kind: 'sceneTemplates' }
  | { kind: 'broken' }
  | { kind: 'info'; name: string }
  | { kind: 'rename' }
  | { kind: 'sceneRename' }
  | { kind: 'partTemplates' }
  | {
      kind: 'source';
      ref: { kind: 'tachie' | 'part' | 'effect' | 'cutin'; id: string; sceneId?: string };
    }
  | { kind: 'templateDetail'; ref: { kind: 'scene' | 'cutin' | 'piece'; id: string } }
  | { kind: 'pieceTemplate'; id: string }
  | null;

export interface Session {
  page: PageId;
  sceneId: string | null;
  /** 場景一覽的勾選 */
  sceneSel: string[];
  sceneAnchor: string | null;
  multiPickMode: boolean;
  /** 素材一覽的選取（依點選順序） */
  imgSel: string[];
  imgAnchor: string | null;
  imgQuery: string;
  imgTags: Tag[];
  /** 房間設計的選取 */
  roomSel: string[];
  /** 記住的場景設定（F208） */
  clip: SceneClip | null;
  modal: Modal;
  picker: PickTarget | null;
  /** 忙碌遮罩（F017） */
  busy: { title: string; detail: string; done: number; total: number } | null;
  /** 場景詳細：共用部件區塊顯示全部（F204） */
  overridesAll: boolean;
  /** 展開數值欄的共用標記（全域，F206） */
  overrideOpen: Record<string, true>;
  /** 詳細設定展開中的場景（F185） */
  advancedSceneId: string | null;
  /** 劇本頁的模式（F238） */
  storyMode: 'single' | 'bulk';
  storySel: string[];
  storyAnchor: string | null;
  /** 切入頁的選取模式（F236） */
  cutinSelectMode: boolean;
  cutinSel: string[];
  /** 預覽的目前選取（F217） */
  previewSel: string | null;
  /** 跳到場景詳細的哪個區塊（閃一下） */
  flash: string | null;
  /** 角色篩選（F228） */
  tachieGroup: string;
  /** 素材頁：批次操作面板收起 */
  batchCollapsed: boolean;
  /** 工具設定的分類 */
  settingsCat: 'display' | 'create' | 'templates' | 'save';
}

export const useSession = create<Session>(() => ({
  page: 'home',
  sceneId: null,
  sceneSel: [],
  sceneAnchor: null,
  multiPickMode: false,
  imgSel: [],
  imgAnchor: null,
  imgQuery: '',
  imgTags: [],
  roomSel: [],
  clip: null,
  modal: null,
  picker: null,
  busy: null,
  overridesAll: false,
  overrideOpen: {},
  advancedSceneId: null,
  storyMode: 'single',
  storySel: [],
  storyAnchor: null,
  cutinSelectMode: false,
  cutinSel: [],
  previewSel: null,
  flash: null,
  tachieGroup: '',
  batchCollapsed: false,
  settingsCat: 'display',
}));

export const session = (): Session => useSession.getState();
export const setSession = (p: Partial<Session>): void => useSession.setState(p);

/** 換頁（記住最後一次開過的非首頁頁面） */
export function goPage(page: PageId): void {
  setSession({ page });
  if (page !== 'home') patchLayout({ lastPage: page });
}

/* ---------- 已儲存的內容（F021 離開頁面提醒） ---------- */

const saved: { snapshot: string | null } = { snapshot: null };
export const projectSnapshot = (p: Project = useProject.getState().data): string =>
  JSON.stringify(p);
export const markSaved = (snapshot = projectSnapshot()): void => {
  saved.snapshot = snapshot;
};
export const isDirty = (): boolean =>
  saved.snapshot != null && saved.snapshot !== projectSnapshot();

/* ---------- 自動儲存清單（F276、F269） ---------- */

export const AUTOSAVE_KEY = `trpg-toolkit:${TOOL_ID}:autosaves`;
export const AUTOSAVE_INTERVAL_MS = 10 * 60 * 1000;
export const AUTOSAVE_KEEP = 5;

export interface AutoSave {
  at: number;
  title: string;
  data: string;
}

export function autoSaves(): AutoSave[] {
  try {
    const a = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || '[]');
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

let lastAuto = 0;
/** 專案內容有變更時呼叫：距離上一份超過 10 分鐘就存一份（保留最新 5 份；沒有圖片資料） */
export function autoSaveTick(p: Project, now = Date.now()): void {
  if (now - lastAuto < AUTOSAVE_INTERVAL_MS) return;
  lastAuto = now;
  try {
    const list = [{ at: now, title: p.name, data: JSON.stringify(p) }, ...autoSaves()].slice(
      0,
      AUTOSAVE_KEEP,
    );
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(list));
  } catch {
    /* 存不進去就算了 */
  }
}

export type { SearchSite };
