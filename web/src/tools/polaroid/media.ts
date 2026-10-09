/**
 * 照片與貼紙的載入、讀回：放進資產庫（IndexedDB）→ 解碼確認 → 換上照片／加入貼紙。
 * 同一批檔案的結果整理成一則通知（加入了哪些、哪些沒有加入與原因）。
 * 重新整理後從資產庫讀回；讀不到時回報。
 */
import { useEffect, useState } from 'react';
import { nextStickerId, STICKER_MAX, type Sticker, stickerBaseSize, stickerStart } from './model';
import { addStickers, applyPhoto, assets, docNow, markSessionAsset } from './store';
import { S } from './strings';

export const isImageFile = (f: File): boolean =>
  f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|avif|bmp|svg)$/i.test(f.name);

/** 一則通知的內容 */
export interface BatchNotice {
  title: string;
  description?: string;
  tone: 'success' | 'warning' | 'danger' | 'info';
}

/** 讀一張圖放進資產庫並解碼；失敗時回傳原因 */
async function storeImage(
  file: File,
): Promise<
  { ok: true; id: string; bitmap: ImageBitmap; persisted: boolean } | { ok: false; reason: string }
> {
  if (!isImageFile(file)) return { ok: false, reason: S.notImage(file.name) };
  let added: { id: string; persisted: boolean };
  try {
    added = await assets.add(file);
  } catch {
    /* 讀不到檔案本身（例如手機的相片權限已失效），不是檔案壞掉 */
    return { ok: false, reason: S.readError(file.name) };
  }
  markSessionAsset(added.id);
  /*
   * 解碼失敗（bitmap 丟錯）才是「檔案可能已損壞」；圖從資產庫裡不見了（bitmap 是 undefined）是另一回事，
   * 不能說成檔案壞掉（對等驗證 F51：寫入很慢時圖曾被開頁的整理刪掉，訊息卻說無法讀取）。
   */
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await assets.bitmap(added.id);
  } catch {
    return { ok: false, reason: S.decodeError(file.name) };
  }
  if (!bitmap) return { ok: false, reason: S.lostError(file.name) };
  if (!bitmap.width || !bitmap.height) return { ok: false, reason: S.decodeError(file.name) };
  return { ok: true, id: added.id, bitmap, persisted: added.persisted };
}

/**
 * 照片（選檔、拖放、貼上）：用第一張圖片；其餘的檔案（不是圖片、第二張以後）列在同一則通知裡。
 * 沒有問題時不通知（回傳 null）。
 */
export async function loadPhotoFiles(files: readonly File[]): Promise<BatchNotice | null> {
  if (!files.length) return null;
  const notes: string[] = [];
  const first = files.find(isImageFile);
  for (const f of files) {
    if (f === first) continue;
    if (!isImageFile(f)) notes.push(S.notImage(f.name));
  }
  const extra = files.filter((f) => f !== first && isImageFile(f));
  if (extra.length) notes.push(S.onlyFirst(extra.map((f) => f.name).join('」「')));
  if (!first) return { title: S.photoFailed, description: notes.join('；'), tone: 'danger' };
  const r = await storeImage(first);
  if (!r.ok) {
    return { title: S.photoFailed, description: [r.reason, ...notes].join('；'), tone: 'danger' };
  }
  applyPhoto({ id: r.id, name: first.name, width: r.bitmap.width, height: r.bitmap.height });
  if (!r.persisted) notes.push(S.photoNotSaved);
  if (!notes.length) return null;
  return { title: S.photoLoaded(first.name), description: notes.join('；'), tone: 'warning' };
}

/**
 * 貼紙（可以多張）：依序加到滿 5 張（新的一張比前一張往右上錯開一點）；不是圖片、讀不到、超過上限的列在同一則通知裡。
 */
export async function addStickerFiles(files: readonly File[]): Promise<BatchNotice | null> {
  if (!files.length) return null;
  const d = docNow();
  const room = Math.max(0, STICKER_MAX - d.stickers.length);
  const failed: string[] = [];
  const over: string[] = [];
  const added: Sticker[] = [];
  let notSaved = false;
  const start = stickerStart(d.aspect);
  for (const f of files) {
    if (!isImageFile(f)) {
      failed.push(S.notImage(f.name));
      continue;
    }
    if (added.length >= room) {
      over.push(f.name);
      continue;
    }
    const r = await storeImage(f);
    if (!r.ok) {
      failed.push(r.reason);
      continue;
    }
    if (!r.persisted) notSaved = true;
    const size = stickerBaseSize({ width: r.bitmap.width, height: r.bitmap.height });
    const i = added.length;
    added.push({
      id: nextStickerId([...docNow().stickers, ...added]),
      asset: r.id,
      name: f.name,
      cx: start.x + i * 24,
      cy: start.y - i * 24,
      width: size.width,
      height: size.height,
      rotation: 0,
    });
  }
  addStickers(added);
  const notes = [...failed];
  if (over.length) notes.push(S.stickerOver(over.join('」「'), STICKER_MAX));
  if (notSaved) notes.push(S.stickerNotSaved);
  const description = notes.length ? notes.join('；') : undefined;
  if (!added.length) return { title: S.stickersNone, description, tone: 'danger' };
  return {
    title: S.stickersAdded(added.length),
    description,
    tone: notes.length ? 'warning' : 'success',
  };
}

/* ---------- 讀回 ---------- */

export type ImageStatus = 'none' | 'loading' | 'ready' | 'missing';

/** 一張圖的解碼結果（id 換了就重讀；同一個 id 只解碼一次） */
export function useAssetImage(id: string | null | undefined): {
  bitmap: ImageBitmap | null;
  status: ImageStatus;
} {
  const [state, setState] = useState<{
    id: string | null;
    bitmap: ImageBitmap | null;
    status: ImageStatus;
  }>(() => {
    const hit = id ? assets.peekBitmap(id) : undefined;
    return {
      id: id ?? null,
      bitmap: hit ?? null,
      status: !id ? 'none' : hit ? 'ready' : 'loading',
    };
  });
  useEffect(() => {
    let alive = true;
    if (!id) {
      setState({ id: null, bitmap: null, status: 'none' });
      return;
    }
    const hit = assets.peekBitmap(id);
    if (hit) {
      setState({ id, bitmap: hit, status: 'ready' });
      return;
    }
    setState({ id, bitmap: null, status: 'loading' });
    assets
      .bitmap(id)
      .then((b) => {
        if (alive) setState({ id, bitmap: b ?? null, status: b ? 'ready' : 'missing' });
      })
      .catch(() => {
        if (alive) setState({ id, bitmap: null, status: 'missing' });
      });
    return () => {
      alive = false;
    };
  }, [id]);
  /* id 剛換、effect 還沒跑的那一次 render：不要拿舊的圖畫 */
  if ((state.id ?? null) !== (id ?? null)) {
    const hit = id ? assets.peekBitmap(id) : undefined;
    return { bitmap: hit ?? null, status: !id ? 'none' : hit ? 'ready' : 'loading' };
  }
  return { bitmap: state.bitmap, status: state.status };
}

/** 一組圖（貼紙）的解碼結果：資產 id → 圖；讀不到的另外列出 */
export function useAssetImages(ids: readonly string[]): {
  images: ReadonlyMap<string, ImageBitmap>;
  missing: readonly string[];
} {
  const key = [...new Set(ids)].sort().join('|');
  const [state, setState] = useState<{
    images: Map<string, ImageBitmap>;
    missing: string[];
  }>(() => {
    const images = new Map<string, ImageBitmap>();
    for (const id of ids) {
      const hit = assets.peekBitmap(id);
      if (hit) images.set(id, hit);
    }
    return { images, missing: [] };
  });
  useEffect(() => {
    let alive = true;
    const list = key ? key.split('|') : [];
    void Promise.all(
      list.map(async (id) => {
        const b = assets.peekBitmap(id) ?? (await assets.bitmap(id).catch(() => undefined));
        return [id, b] as const;
      }),
    ).then((pairs) => {
      if (!alive) return;
      const images = new Map<string, ImageBitmap>();
      const missing: string[] = [];
      for (const [id, b] of pairs) {
        if (b) images.set(id, b);
        else missing.push(id);
      }
      setState({ images, missing });
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return state;
}
