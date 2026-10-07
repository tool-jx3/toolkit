/**
 * 清單的縮圖（資產 id → 物件網址）：加圖時 Worker 檢查檔案順便做好的，或之後（例如重新整理後）在 Worker 裡補做。
 * 清單不直接放原圖：大圖（例如 4000 × 4000）要整張解碼，十張就是十份原圖大小的記憶體。做不出縮圖時才用原圖的網址。
 */
import { pixels } from './engine';
import { assets } from './store';

const urls = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

/** 記下加圖時做好的縮圖 */
export function rememberThumb(id: string, thumb: Blob | null): void {
  if (thumb && !urls.has(id)) urls.set(id, URL.createObjectURL(thumb));
}

/** 這張圖的縮圖網址（還沒有就在 Worker 裡做） */
export function thumbUrl(id: string): Promise<string | null> {
  const hit = urls.get(id);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(id);
  if (!p) {
    p = (async () => {
      const blob = await assets.get(id);
      if (!blob) return null;
      const thumb = await pixels.thumb(blob).catch(() => null);
      if (thumb) {
        rememberThumb(id, thumb);
        return urls.get(id) ?? null;
      }
      return (await assets.url(id)) ?? null;
    })().finally(() => pending.delete(id));
    pending.set(id, p);
  }
  return p;
}
