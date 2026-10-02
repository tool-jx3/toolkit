/**
 * 表情產生器的狀態：
 * - useEmotions：表情清單（含勾選）與自訂部件的名稱，每次變更立即存進 localStorage（F44）；
 *   自訂部件的圖片放在 IndexedDB 的資產庫（主控裁定），這裡只記資產 id。
 * - useEditor：編輯區的草稿與編輯狀態（不保存）。
 * - useSheetOptions：合輯圖選項（同一次開頁期間保留，重新整理回到預設；F41）。
 * - useCustomImages：已解碼的自訂部件圖片（資產 id → ImageBitmap）。
 */
import { create } from 'zustand';
import { createAssetStore } from '@/core/assets';
import { createToolStore } from '@/core/storage';
import {
  type CustomPart,
  DEFAULT_SHEET,
  type Draft,
  EMPTY_DRAFT,
  type Expression,
  type SheetRaw,
} from './logic';

export const TOOL_ID = 'emotion-maker';

export interface EmotionData {
  expressions: Expression[];
  customParts: CustomPart[];
}

/* 沒有復原／重做（規格）：歷史只留 1 步，省記憶體 */
export const useEmotions = createToolStore<EmotionData>(
  TOOL_ID,
  { expressions: [], customParts: [] },
  { historyLimit: 1 },
);

export interface EditorState {
  draft: Draft;
  editingId: string | null;
  setDraft: (patch: Partial<Draft>) => void;
  /** 重設編輯區（F17）：清空選擇與標籤、顯示文字恢復勾選、結束編輯 */
  reset: () => void;
  edit: (id: string, draft: Draft) => void;
}

export const useEditor = create<EditorState>()((set) => ({
  draft: EMPTY_DRAFT,
  editingId: null,
  setDraft: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
  reset: () => set({ draft: EMPTY_DRAFT, editingId: null }),
  edit: (id, draft) => set({ draft, editingId: id }),
}));

export interface SheetOptionsState {
  raw: SheetRaw;
  patch: (patch: Partial<SheetRaw>) => void;
}

export const useSheetOptions = create<SheetOptionsState>()((set) => ({
  raw: DEFAULT_SHEET,
  patch: (patch) => set((s) => ({ raw: { ...s.raw, ...patch } })),
}));

/** 自訂部件的圖片（IndexedDB：trpg-toolkit:tool:emotion-maker:parts） */
export const partAssets = createAssetStore(TOOL_ID, { name: 'parts' });

export interface CustomImagesState {
  images: Record<string, ImageBitmap>;
  /** 找不到圖片的資產 id */
  missing: Record<string, true>;
  put: (assetId: string, image: ImageBitmap) => void;
  markMissing: (assetId: string) => void;
}

export const useCustomImages = create<CustomImagesState>()((set) => ({
  images: {},
  missing: {},
  put: (assetId, image) =>
    set((s) => {
      const { [assetId]: _, ...missing } = s.missing;
      return { images: { ...s.images, [assetId]: image }, missing };
    }),
  markMissing: (assetId) => set((s) => ({ missing: { ...s.missing, [assetId]: true } })),
}));

let seq = 0;
/** 新的 id（表情 e…、自訂部件 c…） */
export function newId(prefix: 'e' | 'c'): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}${Math.floor(Math.random() * 1296)
    .toString(36)
    .padStart(2, '0')}`;
}
