/**
 * 圖片：頭像（原圖長邊最多 1400 px＋256 × 256 的成品）、背景圖（長邊最多 2048 px）放進資產庫；
 * 編輯畫面用物件網址，匯出時換成 data URI（SVG 放進 <img> 點陣化時讀不到 blob 網址）。
 */
import { useEffect, useMemo, useState } from 'react';
import { addImageFile } from '@/core/assets';
import {
  canvasToBlob,
  DEFAULT_PLACEMENT,
  drawPlacedCrop,
  type FramePlacement,
  makeCanvas,
} from '@/core/image';
import { bgIds, charLists } from '../model/timeline';
import type { Avatar, Project } from '../model/types';
import { assets } from './store';

export const AVATAR_SIZE = 256;
const SOURCE_MAX = 1400;
const BG_MAX = 2048;

/** 依位置把原圖裁成 256 × 256 的頭像，存進資產庫，回傳 id */
export async function renderAvatar(srcId: string, place: FramePlacement): Promise<string> {
  const bmp = await assets.bitmap(srcId);
  if (!bmp) throw new Error('missing');
  const canvas = makeCanvas(AVATAR_SIZE, AVATAR_SIZE);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  drawPlacedCrop(
    ctx,
    bmp,
    { width: bmp.width, height: bmp.height },
    { x: 0, y: 0, width: AVATAR_SIZE, height: AVATAR_SIZE },
    place,
  );
  const blob = await canvasToBlob(canvas as HTMLCanvasElement, 'image/png');
  const added = await assets.add(blob);
  return added.id;
}

/** 一張圖變成頭像（原圖＋置中裁切的成品）；讀不了時丟 ImageLoadError */
export async function avatarFromBlob(
  blob: Blob,
  name?: string,
): Promise<{ avatar: Avatar; persisted: boolean }> {
  const src = await addImageFile(assets, blob, { name, maxSide: SOURCE_MAX });
  const img = await renderAvatar(src.ref.id, DEFAULT_PLACEMENT);
  return { avatar: { img, src: src.ref.id, place: null }, persisted: src.persisted };
}

/** 背景圖 */
export async function backgroundFromBlob(
  blob: Blob,
  name?: string,
): Promise<{ id: string; persisted: boolean }> {
  const r = await addImageFile(assets, blob, { name, maxSide: BG_MAX });
  return { id: r.ref.id, persisted: r.persisted };
}

/** 從網址讀圖（對方網站要允許跨站讀取） */
export async function fetchImage(url: string): Promise<Blob> {
  const u = url.trim();
  if (!/^(https?:\/\/|data:image\/)/i.test(u)) throw new Error('bad-url');
  const res = await fetch(u, { mode: 'cors' });
  if (!res.ok) throw new Error('http');
  return await res.blob();
}

/** 專案用到的圖（目前的分頁優先）的物件網址 */
export function useImageUrls(ids: readonly string[]): Map<string, string> {
  const key = [...new Set(ids)].sort().join(',');
  const [urls, setUrls] = useState<Map<string, string>>(() => new Map());
  useEffect(() => {
    let alive = true;
    const list = key ? key.split(',') : [];
    void (async () => {
      const out = new Map<string, string>();
      for (const id of list) {
        const u = await assets.url(id).catch(() => undefined);
        if (u) out.set(id, u);
      }
      if (alive) setUrls(out);
    })();
    return () => {
      alive = false;
    };
  }, [key]);
  return useMemo(() => urls, [urls]);
}

const blobToDataUri = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/** 匯出用：資產 id → data URI（讀不到的不在結果裡） */
export async function dataUris(ids: Iterable<string>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const id of new Set(ids)) {
    const b = await assets.get(id).catch(() => undefined);
    if (b) out.set(id, await blobToDataUri(b));
  }
  return out;
}

/** 這些分頁畫圖時用到的圖（頭像成品、背景圖；有給頭像框庫時連框一起） */
export function drawnImageIds(
  p: Pick<Project, 'sheets'> & Partial<Pick<Project, 'frames'>>,
  sheetIdx?: readonly number[],
): string[] {
  const out = new Set<string>();
  p.sheets.forEach((s, i) => {
    if (sheetIdx && !sheetIdx.includes(i)) return;
    /* 時間軸分頁：每一格（補間預覽、GIF／影片、互動網頁的動畫都會畫到） */
    for (const b of bgIds(s)) out.add(b);
    for (const list of charLists(s)) for (const c of list) if (c.avatar) out.add(c.avatar.img);
  });
  for (const f of p.frames ?? []) out.add(f.id);
  return [...out];
}
