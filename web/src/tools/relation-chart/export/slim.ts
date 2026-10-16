/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 互動網頁的壓縮頭像（F146；原作的 buildViewerImgSlimMap）：只在這次匯出替換，專案檔與預覽都用原圖。
 * 每張被畫到的頭像：需求邊長＝ceil(頭像半徑 × 2 × 2)（同一張圖取最大）；嵌入模式另有上限 128；
 * 縮放 k＝min(1, 需求 ÷ 原圖長邊)（只縮不放）；重新編碼成 WebP 品質 0.92（不能編 WebP 時用 PNG；
 * 尺寸不用縮又不能換 WebP＝略過）；結果比原本大就不換。背景圖、世界觀與角色資訊的圖不處理。
 */
import { supportsWebpEncoding } from '@/core/encode';
import { charRadius, sheetCtx } from '../engine/geom';
import type { Sheet } from '../model/types';

/** 每張頭像（資產 id）的需求邊長 */
export function avatarNeeds(sheets: readonly Sheet[], embed: boolean): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of sheets) {
    const ctx = sheetCtx(s);
    for (const c of s.chars) {
      if (!c.avatar || c.noAvatar) continue;
      let need = Math.ceil(charRadius(ctx, c) * 2 * 2);
      if (embed) need = Math.min(need, 128);
      out.set(c.avatar.img, Math.max(out.get(c.avatar.img) ?? 0, need));
    }
  }
  return out;
}

/** 縮放比例（只縮不放） */
export const slimScale = (need: number, w: number, h: number): number =>
  Math.min(1, need / Math.max(1, w, h));

const blobToDataUri = (b: Blob): Promise<string> =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

async function slimOne(uri: string, need: number, webp: boolean): Promise<string | null> {
  const img = await createImageBitmap(await (await fetch(uri)).blob());
  const k = slimScale(need, img.width, img.height);
  if (k >= 1 && !webp) {
    img.close();
    return null;
  }
  const w = Math.max(1, Math.round(img.width * k));
  const h = Math.max(1, Math.round(img.height * k));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) return null;
  /* 平滑品質用瀏覽器預設（同原作；實測 256 → 184 px 的 WebP 和原作逐位元組相同） */
  g.drawImage(img, 0, 0, w, h);
  img.close();
  const blob = await new Promise<Blob | null>((res) =>
    c.toBlob(res, webp ? 'image/webp' : 'image/png', webp ? 0.92 : undefined),
  );
  if (!blob) return null;
  const out = await blobToDataUri(blob);
  return out.length < uri.length ? out : null;
}

/** 這次匯出要換掉的頭像：資產 id → 縮過的 data URI（沒換的不在表裡） */
export async function slimAvatars(
  sheets: readonly Sheet[],
  uris: ReadonlyMap<string, string>,
  embed: boolean,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const needs = avatarNeeds(sheets, embed);
  if (!needs.size) return out;
  const webp = await supportsWebpEncoding().catch(() => false);
  for (const [id, need] of needs) {
    const uri = uris.get(id);
    if (!uri) continue;
    try {
      const r = await slimOne(uri, need, webp);
      if (r) out.set(id, r);
    } catch {
      /* 讀不了的照原圖 */
    }
  }
  return out;
}
