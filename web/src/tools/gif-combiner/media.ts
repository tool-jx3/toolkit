/**
 * 加入的動圖：原始檔存在資產庫（IndexedDB，core/assets），畫布上的每一筆只記資產 id；
 * 解碼後的影格（ImageBitmap）放在記憶體快取，同一個檔案只解碼一次。
 */
import { create } from 'zustand';
import { createAssetStore, referencedAssetIds } from '@/core/assets';
import { animationTimeline, decodeAnimatedImage } from '@/core/decode';
import type { ImageSaveFailure } from '@/core/image';
import { DECODE_OPTIONS, TOOL_ID } from './logic';
import { useCombiner } from './store';

export const assets = createAssetStore(TOOL_ID);

/** 一張動圖解碼後的樣子 */
export interface Media {
  width: number;
  height: number;
  /** 每格完整畫面 */
  frames: ImageBitmap[];
  /** 每格時間（毫秒，至少 20） */
  delays: number[];
  /** 一輪的長度（毫秒） */
  total: number;
  /** 超過 500 格被截斷 */
  truncated: boolean;
}

/** 解碼好的動圖（資產 id → Media）；改變時預覽重畫 */
export const useMedia = create<{ media: Record<string, Media> }>(() => ({ media: {} }));

const pending = new Map<string, Promise<Media>>();

async function decodeBlob(blob: Blob): Promise<Media> {
  const anim = await decodeAnimatedImage(blob, DECODE_OPTIONS);
  const frames: ImageBitmap[] = [];
  for (const f of anim.frames)
    frames.push(await createImageBitmap(new ImageData(f.rgba, anim.width, anim.height)));
  const delays = anim.frames.map((f) => f.delayMs);
  return {
    width: anim.width,
    height: anim.height,
    frames,
    delays,
    total: animationTimeline(delays).total,
    truncated: anim.truncated,
  };
}

function remember(id: string, m: Media): Media {
  useMedia.setState((s) => ({ media: { ...s.media, [id]: m } }));
  return m;
}

/** 從資產庫讀回並解碼（快取）；找不到或解不開時丟錯 */
export function loadMedia(id: string): Promise<Media> {
  const hit = useMedia.getState().media[id];
  if (hit) return Promise.resolve(hit);
  let p = pending.get(id);
  if (!p) {
    p = (async () => {
      const blob = await assets.get(id);
      if (!blob) throw new Error('missing');
      return remember(id, await decodeBlob(blob));
    })();
    p.catch(() => pending.delete(id));
    pending.set(id, p);
  }
  return p;
}

export interface AddedFile {
  asset: string;
  media: Media;
  persisted: boolean;
  reason?: ImageSaveFailure;
}

/** 解碼一個檔案並存進資產庫（解碼失敗丟錯，不會存） */
export async function addFile(file: Blob): Promise<AddedFile> {
  const media = await decodeBlob(file);
  const r = await assets.add(file);
  const known = useMedia.getState().media[r.id];
  if (known) {
    for (const b of media.frames) b.close?.();
    return { asset: r.id, media: known, persisted: r.persisted, reason: r.reason };
  }
  remember(r.id, media);
  return { asset: r.id, media, persisted: r.persisted, reason: r.reason };
}

/**
 * 清掉沒有人用的檔案（目前的畫布＋復原／重做歷史都保留），解碼好的影格一起釋放。
 * 開頁時（onOpen）只清以前留下的（gcStale：這次開頁加入、讀到一半的檔案不刪，避免和進行中的加入互相干擾）；
 * 全部重設、開了別的專案檔之後照常釋放（gc：這次開頁加入、已經不用的也刪）。
 */
export async function collectGarbage({ onOpen = false } = {}): Promise<void> {
  const keep = referencedAssetIds(useCombiner, (d) => d.items.map((it) => it.asset));
  try {
    const removed = await (onOpen ? assets.gcStale(keep) : assets.gc(keep));
    if (!removed.length) return;
    useMedia.setState((s) => {
      const media = { ...s.media };
      for (const id of removed) {
        for (const b of media[id]?.frames ?? []) b.close?.();
        delete media[id];
        pending.delete(id);
      }
      return { media };
    });
  } catch {
    /* 清不掉就下次再清 */
  }
}
