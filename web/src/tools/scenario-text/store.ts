/**
 * 狀態：
 * - useDoc：圖片庫（名稱、出處）、說話者、文字、讀取方式、手動修改的清單、已確定（自動保存、復原／重做）。
 * - usePrefs：預覽的視窗寬度、左欄的分頁（自動保存，不列入復原）。
 * - useUi：選取中的一則、各區塊的狀態訊息、處理中、找不到內容的圖（不保存）。
 * - assets：圖片庫的圖片內容（IndexedDB；useDoc 只記資產 id）。
 */
import { create } from 'zustand';
import { createAssetStore, referencedAssetIds } from '@/core/assets';
import { createPreviewStore, createToolStore, hasIndexedDb } from '@/core/storage';
import type { NoticeTone } from '@/ui';
import { cleanDoc, type Doc, defaultDoc } from './model';
import { S } from './strings';

export const TOOL_ID = 'scenario-text';
/** 專案檔的資料版本 */
export const PROJECT_VERSION = 1;

export const useDoc = createToolStore<Doc>(TOOL_ID, defaultDoc(), {
  version: 1,
  /* 讀回時整理（缺的欄位補預設、格式不對的項目丟掉） */
  migrate: (persisted) => cleanDoc(persisted),
});

/*
 * createToolStore 的 merge 只補頂層欄位：讀回（localStorage 是同步的，建立 store 時就讀完）後再整理一次，
 * 損壞或手改過的存檔也能用（不記成一步復原）。
 */
{
  const d = useDoc.getState().data;
  const clean = cleanDoc(d);
  if (JSON.stringify(clean) !== JSON.stringify(d)) {
    useDoc.temporal.getState().pause();
    useDoc.getState().replace(clean);
    useDoc.temporal.getState().resume();
  }
}

export type ViewSize = 'pc' | 'mid' | 'phone';
export type InputTab = 'text' | 'speakers' | 'images';

export const usePrefs = createPreviewStore<{ view: ViewSize; tab: InputTab }>(TOOL_ID, {
  view: 'pc',
  tab: 'text',
});

export type StatusArea = 'shelf' | 'speakers' | 'list' | 'export';

export interface Status {
  text: string;
  tone: NoticeTone;
  /** 每次更新 +1（同一段文字再出現時也重新朗讀） */
  seq: number;
}

interface UiState {
  /** 選取中的一則（目前清單的索引；-1＝沒有選取） */
  selected: number;
  status: Partial<Record<StatusArea, Status>>;
  /** 匯出房間 ZIP、打包圖片、效果差分處理中 */
  busy: { export: boolean; bundle: boolean; fx: boolean };
  /** 打包時放入圖片庫的所有圖片 */
  bundleAll: boolean;
  /** 找不到內容的資產 id */
  missing: ReadonlySet<string>;
  /** 啟動時的資產讀回完成 */
  ready: boolean;
}

export const useUi = create<UiState>(() => ({
  selected: -1,
  status: {},
  busy: { export: false, bundle: false, fx: false },
  bundleAll: false,
  missing: new Set(),
  ready: false,
}));

let statusSeq = 0;

/** 在某個區塊顯示狀態訊息（取代那一區原本的訊息） */
export function say(area: StatusArea, text: string, tone: NoticeTone = 'info'): void {
  statusSeq++;
  useUi.setState((s) => ({ status: { ...s.status, [area]: { text, tone, seq: statusSeq } } }));
}

export const select = (i: number): void => useUi.setState({ selected: i });

export function setBusy(key: keyof UiState['busy'], v: boolean): void {
  useUi.setState((s) => ({ busy: { ...s.busy, [key]: v } }));
}

export function markMissing(ids: Iterable<string>, missing: boolean): void {
  useUi.setState((s) => {
    const next = new Set(s.missing);
    for (const id of ids) {
      if (missing) next.add(id);
      else next.delete(id);
    }
    return { missing: next };
  });
}

/* ---------- 圖片內容 ---------- */

export const assets = createAssetStore(TOOL_ID);

/** 這次開頁加進資產庫的圖（清理時保留） */
const sessionAssets = new Set<string>();
export const markSessionAsset = (id: string): void => {
  sessionAssets.add(id);
};

const assetIdsOf = (d: Doc): string[] =>
  d.images.flatMap((im) => (im.kind === 'file' ? [im.asset] : []));

/** 清掉沒有人用的圖（目前＋復原／重做歷史＋這次開頁加入的都保留） */
export async function collectGarbage(): Promise<void> {
  const keep = referencedAssetIds(useDoc, assetIdsOf);
  for (const id of sessionAssets) keep.add(id);
  try {
    await assets.gc(keep);
  } catch {
    /* 清不掉就下次再清 */
  }
}

/** 啟動：讀回圖片庫的圖，記下找不到的，再清掉沒人用的 */
export async function hydrateAssets(): Promise<void> {
  const ids = assetIdsOf(useDoc.getState().data);
  try {
    const { missing } = await assets.preload(ids);
    markMissing(missing, true);
  } catch {
    markMissing(ids, true);
  }
  useUi.setState({ ready: true });
  /* 存不了圖片的瀏覽器：提醒用專案檔保存（F18） */
  if (!hasIndexedDb()) say('shelf', S.noIndexedDb, 'warning');
  void collectGarbage();
}
