/**
 * 狀態：
 * - useDoc：圖片庫（名稱）、輸入、讀取方式、改過的讀法與欄的用途、已確定、貼上的、手動修改的清單、全體設定
 *   （自動儲存、復原／重做 150 步）。
 * - usePrefs：左欄的分頁、說明的展開（自動儲存，不列入復原）。
 * - useUi：選取中的棋子、各區塊的狀態訊息、處理中、找不到內容的圖（不儲存）。
 * - assets：圖片庫的圖片內容（IndexedDB；useDoc 只記資產 id）。
 */
import { create } from 'zustand';
import { createAssetStore, referencedAssetIds } from '@/core/assets';
import { createPreviewStore, createToolStore, hasIndexedDb } from '@/core/storage';
import type { NoticeTone } from '@/ui';
import { piecesOf } from './derived';
import { cleanDoc, type Doc, defaultDoc } from './model';
import { S } from './strings';

export const TOOL_ID = 'ccfolia-batch';
/** 專案檔的資料版本 */
export const PROJECT_VERSION = 1;
/** 復原的步數（同原作） */
export const HISTORY_LIMIT = 150;

export const useDoc = createToolStore<Doc>(TOOL_ID, defaultDoc(), {
  version: 1,
  historyLimit: HISTORY_LIMIT,
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

export type InputTab = 'input' | 'images' | 'settings';

export const usePrefs = createPreviewStore<{ tab: InputTab; helpOpen: boolean }>(TOOL_ID, {
  tab: 'input',
  helpOpen: true,
});

export type StatusArea = 'shelf' | 'paste' | 'list' | 'export';

export interface Status {
  text: string;
  tone: NoticeTone;
  /** 每次更新 +1（同一段文字再出現時也重新朗讀） */
  seq: number;
}

interface UiState {
  /** 選取中的棋子（目前清單的索引；-1＝沒有選取） */
  selected: number;
  status: Partial<Record<StatusArea, Status>>;
  busy: { room: boolean; assets: boolean };
  /** 找不到內容的資產 id */
  missing: ReadonlySet<string>;
  /** 啟動時的資產讀回完成 */
  ready: boolean;
}

export const useUi = create<UiState>(() => ({
  selected: -1,
  status: {},
  busy: { room: false, assets: false },
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

/* 清單變短（改輸入、刪除、復原…）時選取跟著夾回範圍 */
useDoc.subscribe((s) => {
  const last = piecesOf(s.data).length - 1;
  if (useUi.getState().selected > last) useUi.setState({ selected: last });
});

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

export const assetIdsOf = (d: Doc): string[] => d.images.map((im) => im.asset);

/** 開頁的整理：清掉以前留下、沒有人用的圖（目前＋復原／重做歷史都保留） */
export async function collectGarbage(): Promise<void> {
  const keep = referencedAssetIds(useDoc, assetIdsOf);
  try {
    await assets.gcStale(keep);
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
  if (!hasIndexedDb()) say('shelf', S.noIndexedDb, 'warning');
  void collectGarbage();
}
