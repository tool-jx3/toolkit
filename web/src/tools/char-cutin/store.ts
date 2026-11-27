/**
 * 狀態：
 * - useDoc：演員清單（立繪的資產 id、名字、小標題、台詞、大小、臉的位置、代表色）、目前的型、六種型各自的樣式、
 *   重擊字、VS 的對手、匯出設定（自動儲存 localStorage `trpg-toolkit:char-cutin`、復原／重做 100 步）。
 * - usePrefs：選取中的演員（記在這個瀏覽器、不列入復原）。
 * - useUi：這次開頁的狀態（匯出中、狀態訊息、讀不到的圖、容量的預估），不存。
 * - assets：立繪本身（IndexedDB `trpg-toolkit:tool:char-cutin:assets`；useDoc 只記 id）。
 */
import { create } from 'zustand';
import { createAssetStore, referencedAssetIds } from '@/core/assets';
import { createPreviewStore, createToolStore, historyGesture } from '@/core/storage';
import type { NoticeTone } from '@/ui';
import { cleanDoc, DOC_VERSION, type Doc, defaultDoc, TOOL_ID } from './model';

export const useDoc = createToolStore<Doc>(TOOL_ID, defaultDoc(), {
  version: DOC_VERSION,
  historyLimit: 100,
  migrate: (persisted) => cleanDoc(persisted),
});

/* 存檔可能缺欄位或被改壞：開頁時整理一次（沒有變化時不寫回）；復原紀錄從空的開始 */
{
  const cur = useDoc.getState().data;
  const fixed = cleanDoc(cur);
  if (JSON.stringify(fixed) !== JSON.stringify(cur)) useDoc.getState().replace(fixed);
  useDoc.temporal.getState().clear();
}

/** 滑桿、文字欄的「放開／離開才記一步」 */
export const gesture = historyGesture(useDoc);

export const doc = (): Doc => useDoc.getState().data;
export const update = (recipe: (d: Doc) => void): void => useDoc.getState().update(recipe);

export const usePrefs = createPreviewStore<{ selected: string | null }>(TOOL_ID, {
  selected: null,
});

export interface Status {
  text: string;
  tone: NoticeTone;
  seq: number;
}

export interface UiState {
  /** 匯出中：做到哪裡（0～1）與說明 */
  busy: { ratio: number; label: string } | null;
  /** 匯出區的訊息 */
  status: Status | null;
  /** 演員區的訊息（加入、換圖） */
  castStatus: Status | null;
  /** 讀不到的立繪（資產 id） */
  missing: ReadonlySet<string>;
  /** 開頁時讀回立繪完成 */
  ready: boolean;
  /** 容量的預估（文字；null＝還沒算或不適用） */
  estimate: string | null;
}

export const useUi = create<UiState>(() => ({
  busy: null,
  status: null,
  castStatus: null,
  missing: new Set(),
  ready: false,
  estimate: null,
}));

let seq = 0;
export function say(area: 'status' | 'castStatus', text: string, tone: NoticeTone = 'info'): void {
  seq++;
  useUi.setState({ [area]: { text, tone, seq } } as Partial<UiState>);
}
export const hush = (area: 'status' | 'castStatus'): void =>
  useUi.setState({ [area]: null } as Partial<UiState>);

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

/* ---------- 立繪 ---------- */

export const assets = createAssetStore(TOOL_ID);

export const imageIdsOf = (d: Doc): string[] => d.actors.map((a) => a.image);

/** 開頁：讀回用到的立繪、記下讀不到的，再清掉以前留下沒人用的圖 */
export async function hydrate(): Promise<void> {
  const ids = imageIdsOf(doc());
  try {
    const { missing } = await assets.preload(ids);
    markMissing(missing, true);
  } catch {
    markMissing(ids, true);
  }
  useUi.setState({ ready: true });
  try {
    await assets.gcStale(referencedAssetIds(useDoc, imageIdsOf));
  } catch {
    /* 清不掉就下次再清 */
  }
}
