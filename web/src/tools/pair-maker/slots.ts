/**
 * 存檔槽：存在 IndexedDB（`trpg-toolkit:tool:pair-maker:slots`），每筆是一個版型的編輯內容＋20% 大小的預覽圖＋時間。
 * 圖片本身在圖片庫裡（內容只記 id），整理圖片庫時存檔槽用到的圖片會保留。
 */
import { idbDel, idbEntries, idbGet, idbSet, idbStore } from '@/core/storage';
import { type Draft, draftAssets } from './model';

export interface SlotRecord {
  id: string;
  templateId: string;
  name: string;
  data: Draft;
  /** 預覽圖（PNG） */
  preview: Blob | null;
  savedAt: number;
}

/** 存檔槽名稱的上限 */
export const SLOT_NAME_MAX = 40;

let db: ReturnType<typeof idbStore> | null = null;
const store = () => {
  db ??= idbStore('tool:pair-maker:slots');
  return db;
};

/** 名稱：去頭尾空白、最多 40 字，空白時用預設名稱 */
export const slotName = (raw: string, fallback: string): string =>
  raw.trim().slice(0, SLOT_NAME_MAX) || fallback;

export async function listSlots(templateId: string): Promise<SlotRecord[]> {
  const all = await idbEntries<SlotRecord>(store());
  return all
    .map(([, r]) => r)
    .filter((r) => r && r.templateId === templateId)
    .sort((a, b) => b.savedAt - a.savedAt);
}

export const getSlot = (id: string): Promise<SlotRecord | undefined> =>
  idbGet<SlotRecord>(id, store());
export const putSlot = (r: SlotRecord): Promise<void> => idbSet(r.id, r, store());
export const deleteSlot = (id: string): Promise<void> => idbDel(id, store());

/** 所有存檔槽用到的圖片 */
export async function slotAssetIds(): Promise<string[]> {
  try {
    const all = await idbEntries<SlotRecord>(store());
    return all.flatMap(([, r]) => (r?.data ? draftAssets(r.data) : []));
  } catch {
    return [];
  }
}
