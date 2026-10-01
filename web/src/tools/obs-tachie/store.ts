/**
 * 狀態：
 * - useTachie：使用者、預設集、已儲存組合、目前的組合（自動存 localStorage，可復原）。
 * - useView：編輯中的預設集（自動存檔，不列入復原）。
 * - useImages：立繪圖片（data URI 或網址）。內容存 IndexedDB（裁定：localStorage 容量太小），
 *   預設集只記圖片的鍵；換圖時一律用新的鍵，所以復原／重做之後舊圖還在。
 *   開頁時讀回用得到的圖片，用不到的刪掉。另外記每張圖量到的實際尺寸（不存檔）。
 */
import { create } from 'zustand';
import { createImageStore, measureImageUrl } from '@/core/image';
import { createPreviewStore, createToolStore } from '@/core/storage';
import type { Size } from './logic';
import { DEFAULT_DATA, newId, normalizeData, type TachieData } from './model';

export const TOOL_ID = 'obs-tachie';

export const useTachie = createToolStore<TachieData>(TOOL_ID, DEFAULT_DATA, {
  version: 1,
  migrate: (persisted) => normalizeData(persisted),
  coalesceMs: 0,
  historyLimit: 150,
});

/* 讀回的存檔一律修正一次（規格 F76「開頁讀回並修正」），不留下復原紀錄 */
{
  const data = useTachie.getState().data;
  const fixed = normalizeData(data);
  if (JSON.stringify(fixed) !== JSON.stringify(data)) useTachie.setState({ data: fixed });
  useTachie.temporal.getState().clear();
}

export const useView = createPreviewStore<{ editingId: string | null }>(TOOL_ID, {
  editingId: null,
});

/* ---------- 圖片 ---------- */

export type SizeState = { status: 'loading' } | { status: 'ok'; size: Size } | { status: 'failed' };

interface ImageState {
  /** 讀完 IndexedDB 了嗎 */
  ready: boolean;
  /** 鍵 → data URI 或網址 */
  map: Record<string, string>;
  /** 鍵 → 量到的實際尺寸 */
  sizes: Record<string, SizeState>;
}

export const useImages = create<ImageState>(() => ({ ready: false, map: {}, sizes: {} }));

export const imageDb = createImageStore(TOOL_ID);

/** 預設集用到的圖片鍵 */
export function referencedImages(data: TachieData): string[] {
  return [...new Set(data.presets.map((p) => p.image).filter((v): v is string => !!v))];
}

/** 量一張圖的實際尺寸（每個鍵只量一次；最多等 8 秒） */
export function measure(key: string): void {
  const st = useImages.getState();
  const src = st.map[key];
  if (!src || st.sizes[key]) return;
  useImages.setState((s) => ({ sizes: { ...s.sizes, [key]: { status: 'loading' } } }));
  void measureImageUrl(src, { timeoutMs: 8000 }).then((size) =>
    useImages.setState((s) => ({
      sizes: { ...s.sizes, [key]: size ? { status: 'ok', size } : { status: 'failed' } },
    })),
  );
}

/** 開頁：讀回用得到的圖片，刪掉用不到的 */
export async function loadImages(): Promise<void> {
  const used = new Set(referencedImages(useTachie.getState().data));
  const map: Record<string, string> = {};
  for (const key of await imageDb.keys()) {
    if (!used.has(key)) {
      await imageDb.remove(key);
      continue;
    }
    const v = await imageDb.load(key);
    if (typeof v === 'string') map[key] = v;
  }
  useImages.setState((s) => ({ ready: true, map: { ...map, ...s.map } }));
  for (const key of Object.keys(map)) measure(key);
}

/** 加一張圖：回傳新的鍵與是否存進了瀏覽器（存不下時 saved＝false，圖片仍可在這次使用） */
export async function addImage(src: string, size?: Size): Promise<{ key: string; saved: boolean }> {
  const key = newId();
  useImages.setState((s) => ({
    map: { ...s.map, [key]: src },
    sizes: size ? { ...s.sizes, [key]: { status: 'ok', size } } : s.sizes,
  }));
  if (!size) measure(key);
  const saved = await imageDb.save(key, src);
  return { key, saved };
}

/** 開啟專案檔：把檔案裡的圖片放進來（存檔失敗的鍵回傳） */
export async function importImages(images: Record<string, string>): Promise<string[]> {
  useImages.setState((s) => ({ map: { ...s.map, ...images } }));
  const failed: string[] = [];
  for (const [key, src] of Object.entries(images)) {
    measure(key);
    if (!(await imageDb.save(key, src))) failed.push(key);
  }
  return failed;
}

export function useImageSrc(key: string | null | undefined): string | null {
  return useImages((s) => (key ? (s.map[key] ?? null) : null));
}

export function useImageSize(key: string | null | undefined): SizeState | null {
  return useImages((s) => (key ? (s.sizes[key] ?? null) : null));
}
