/**
 * 狀態：
 * - useConfig：設定與角色名單（自動儲存、可復原；照片只記資產 id，原檔在 core/assets 的 IndexedDB）；
 * - useGame：這一局（出場順序、名次、進度；自動儲存，重新整理後接著玩；**不列入復原**——確定的名次不能反悔）；
 * - useSession：這次開頁才有的東西（分頁、播放畫面、擺放模式、抽選中輪流的角色、解碼後的圖）。
 */
import { create } from 'zustand';
import { createAssetStore, referencedAssetIds } from '@/core/assets';
import { createPreviewStore, createToolStore, historyGesture } from '@/core/storage';
import {
  type Config,
  configAssetIds,
  defaultConfig,
  normalizeConfig,
  type RankCharacter,
  type Run,
  RunError,
  sanitizeRun,
} from './model';
import type { TabId } from './strings';

export const TOOL_ID = 'rank-chart';
/** 自動儲存與專案檔的資料版本 */
export const DATA_VERSION = 1;

const prefersReducedMotion = (): boolean => {
  try {
    return (
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
};

export const initialConfig = (): Config => defaultConfig(prefersReducedMotion());

export const useConfig = createToolStore<Config>(TOOL_ID, initialConfig(), {
  version: DATA_VERSION,
  migrate: (persisted) => normalizeConfig(persisted, prefersReducedMotion()),
  coalesceMs: 0,
  historyLimit: 150,
});

/* 存檔可能缺欄位或被改壞：開頁時整理一次（沒有變化時不寫回），清空復原紀錄 */
{
  const cur = useConfig.getState().data;
  const fixed = normalizeConfig(cur, cur.reducedMotion);
  if (JSON.stringify(fixed) !== JSON.stringify(cur)) useConfig.getState().replace(fixed);
  useConfig.temporal.getState().clear();
}

/** 拖曳、滑桿、文字欄：放開（離開）才記一步 */
export const gesture = historyGesture(useConfig);

export const configNow = (): Config => useConfig.getState().data;

/** 一次變更＝一步復原（手勢中除外） */
export function edit(recipe: (d: Config) => void): void {
  useConfig.getState().update((d) => {
    recipe(d as Config);
  });
}

export const assets = createAssetStore(TOOL_ID);

/**
 * 目前的設定與復原紀錄用到的圖片（開頁的整理時保留）。這次開頁才放進資產庫的圖（例如裁切視窗開著、
 * 還沒套用的新照片）由 assets.gcStale 保留，不必另外記。
 */
export const referencedImages = (): Set<string> => referencedAssetIds(useConfig, configAssetIds);

/* ---------- 這一局 ---------- */

export interface GameData {
  run: Run | null;
}

export const useGame = createPreviewStore<GameData>(TOOL_ID, { run: null });

export const runNow = (): Run | null => useGame.getState().data.run;
export const setRun = (run: Run | null): void => useGame.getState().replace({ run });

/** 開頁時整理存下來的這一局；回傳要顯示的通知 */
export type BootNotice = 'resumed' | 'restoredDone' | 'runLost' | null;
function bootRun(): BootNotice {
  const raw = useGame.getState().data.run;
  if (!raw) return null;
  try {
    const run = sanitizeRun(raw, configNow());
    setRun(run);
    if (!run) return null;
    return run.phase === 'complete' ? 'restoredDone' : 'resumed';
  } catch (e) {
    setRun(null);
    if (e instanceof RunError) return 'runLost';
    throw e;
  }
}

/* ---------- 這次開頁 ---------- */

export interface Session {
  tab: TabId;
  /** 播放畫面（隱藏設定欄） */
  focus: boolean;
  /** 擺放排名者照片與卡片 */
  placing: boolean;
  /** 抽選中輪流出現的角色 */
  spinId: string | null;
  /** 解碼後的圖（資產 id → 圖；讀不到時 null） */
  images: Record<string, ImageBitmap | null>;
  /** 處理照片中（顯示的進度文字） */
  busy: string | null;
  exporting: boolean;
  /** 下載的解析度與附錄（這次開頁有效） */
  exportScale: 1 | 2;
  includeMissing: boolean;
  /** 開頁時要顯示的通知（顯示後清掉） */
  boot: BootNotice;
  /** 字型載好的次數（預覽重畫用） */
  fontTick: number;
}

/** 窄畫面（≤ 760 px；開始與接著玩時自動進入播放畫面） */
export const isNarrow = (): boolean => {
  try {
    return typeof matchMedia === 'function' && matchMedia('(max-width: 760px)').matches;
  } catch {
    return false;
  }
};

const boot = bootRun();

export const useSession = create<Session>(() => ({
  tab: 'topic',
  /* 窄畫面接著玩（重新整理時有這一局）：直接進入播放畫面（照原作，對等驗證 7.1） */
  focus: runNow() !== null && isNarrow(),
  placing: false,
  spinId: null,
  images: {},
  busy: null,
  exporting: false,
  exportScale: 1,
  includeMissing: false,
  boot,
  fontTick: 0,
}));

export const setTab = (tab: TabId): void => useSession.setState({ tab });
export const sessionNow = (): Session => useSession.getState();

/** 解碼後的圖（還沒讀到或讀不到時 null） */
export const imageOf = (id: string | null | undefined): ImageBitmap | null =>
  (id && useSession.getState().images[id]) || null;

/** 角色的裁切圖 */
export const thumbOf = (ch: RankCharacter): ImageBitmap | null => imageOf(ch.thumb);

const loading = new Set<string>();
/** 把要用的圖解碼後放進 useSession.images（已經有的、正在讀的略過） */
export function ensureImages(ids: Iterable<string | null | undefined>): void {
  const have = useSession.getState().images;
  for (const id of ids) {
    if (!id || id in have || loading.has(id)) continue;
    loading.add(id);
    assets
      .bitmap(id)
      .then(
        (b) => b ?? null,
        () => null,
      )
      .then((bmp) => {
        loading.delete(id);
        useSession.setState((st) => ({ images: { ...st.images, [id]: bmp } }));
      });
  }
}

/** 剛做好的圖直接放進 useSession.images（不必再從資產庫解碼） */
export function putImage(id: string, bmp: ImageBitmap): void {
  useSession.setState((st) => ({ images: { ...st.images, [id]: bmp } }));
}

/** 遊戲進行中（含完成、還沒回到設定）設定都鎖住 */
export const isLocked = (): boolean => runNow() !== null;
