/**
 * 圖片的加入（F97～F100）：選檔、拖放、貼上、圖片網址 → 解碼確認、長邊超過上限時縮小 → 資產庫 → 寫進狀態的某個位置。
 * 同一批的結果合成一則通知（加了幾張、哪些讀不到、存不進瀏覽器、超過上限沒加的）。
 */
import { addImageFile, ImageLoadError, splitImageFiles } from '@/core/assets';
import {
  type AssetImage,
  addMessage,
  addPhotos,
  addSticker,
  CELL_SLOTS,
  cellCount,
  IMAGE_MAX,
  MAX,
  nextId,
  setCellImage,
} from './model';
import { assets, docNow, edit, setPrefs } from './store';
import { S } from './strings';
import { fetchImageUrl, UrlImageError, type UrlImageErrorKind } from './url';

export type ImageTarget =
  | { kind: 'avatar' }
  | { kind: 'comment-avatar'; postId: string; commentId: string }
  | { kind: 'post-photos'; postId: string }
  | { kind: 'grid' }
  | { kind: 'cell'; storyId: string; index: number }
  | { kind: 'sticker'; storyId: string }
  | { kind: 'music'; storyId: string; stickerId: string }
  | { kind: 'highlight'; id: string }
  /** 朋友的貼文、限時動態的大頭貼（F111、F112） */
  | { kind: 'owner-avatar'; postId?: string; storyId?: string }
  /** 私訊：對話的大頭貼、訊息的照片、拖放的照片（每張一則我的訊息） */
  | { kind: 'thread-avatar'; threadId: string }
  | { kind: 'message-image'; threadId: string; messageId: string }
  | { kind: 'dm-photos'; threadId: string };

/** 可以一次加好幾張的位置 */
export const isMultiTarget = (t: ImageTarget): boolean =>
  t.kind === 'post-photos' || t.kind === 'grid' || t.kind === 'cell' || t.kind === 'dm-photos';

const maxSide = (t: ImageTarget): number =>
  t.kind === 'avatar' ||
  t.kind === 'comment-avatar' ||
  t.kind === 'owner-avatar' ||
  t.kind === 'thread-avatar'
    ? IMAGE_MAX.avatar
    : t.kind === 'sticker'
      ? IMAGE_MAX.sticker
      : IMAGE_MAX.photo;

export interface BatchNotice {
  title: string;
  description?: string;
  tone: 'success' | 'warning' | 'danger' | 'info';
}

/** 寫進狀態；回傳沒放進去的張數（超過上限、沒有空格子） */
function applyRefs(target: ImageTarget, refs: AssetImage[]): { skipped: number; note?: string } {
  if (!refs.length) return { skipped: 0 };
  const d0 = docNow();
  switch (target.kind) {
    case 'avatar':
      edit((d) => {
        d.profile.avatar = refs[0];
      });
      return { skipped: refs.length - 1 };
    case 'comment-avatar':
      edit((d) => {
        const c = d.posts
          .find((p) => p.id === target.postId)
          ?.sheet.items.find((x) => x.id === target.commentId);
        if (c) c.avatar = refs[0];
      });
      return { skipped: refs.length - 1 };
    case 'owner-avatar':
      edit((d) => {
        const x = target.postId
          ? d.posts.find((p) => p.id === target.postId)
          : d.stories.find((st) => st.id === target.storyId);
        if (x) x.owner.avatar = refs[0];
      });
      return { skipped: refs.length - 1 };
    case 'thread-avatar':
      edit((d) => {
        const t = d.dm.threads.find((x) => x.id === target.threadId);
        if (t) t.avatar = refs[0];
      });
      return { skipped: refs.length - 1 };
    case 'message-image':
      edit((d) => {
        const m = d.dm.threads
          .find((x) => x.id === target.threadId)
          ?.messages.find((x) => x.id === target.messageId);
        if (m && m.from !== 'time') m.image = refs[0];
      });
      return { skipped: refs.length - 1 };
    case 'dm-photos': {
      let added = 0;
      edit((d) => {
        for (const ref of refs) if (addMessage(d, target.threadId, 'me', ref)) added++;
      });
      const skipped = refs.length - added;
      return skipped ? { skipped, note: S.messagesFull(MAX.messages) } : { skipped: 0 };
    }
    case 'highlight':
      edit((d) => {
        const h = d.account.highlights.find((x) => x.id === target.id);
        if (h) h.image = refs[0];
      });
      return { skipped: refs.length - 1 };
    case 'music':
      edit((d) => {
        const k = d.stories
          .find((s) => s.id === target.storyId)
          ?.stickers.find((x) => x.id === target.stickerId);
        if (k?.type === 'music') k.image = refs[0];
      });
      return { skipped: refs.length - 1 };
    case 'sticker': {
      let id: string | null = null;
      edit((d) => {
        const st = d.stories.find((s) => s.id === target.storyId);
        if (st)
          id = addSticker(
            st,
            'image',
            { image: refs[0] },
            d.stories.flatMap((s) => s.stickers.map((k) => k.id)),
          );
      });
      if (id) setPrefs({ sticker: id });
      else return { skipped: refs.length, note: S.stickersFull(MAX.stickers) };
      return { skipped: refs.length - 1 };
    }
    case 'post-photos': {
      let added = 0;
      edit((d) => {
        const p = d.posts.find((x) => x.id === target.postId);
        if (p)
          added = addPhotos(
            p,
            refs,
            d.posts.flatMap((x) => x.photos.map((ph) => ph.id)),
          );
      });
      const skipped = refs.length - added;
      return skipped ? { skipped, note: S.limitReached(skipped) } : { skipped: 0 };
    }
    case 'grid': {
      const room = Math.max(0, MAX.grid - d0.account.grid.length);
      const list = refs.slice(0, room);
      edit((d) => {
        const used = new Set(d.account.grid.map((g) => g.id));
        for (const image of list) {
          const id = nextId('g', used);
          used.add(id);
          d.account.grid.push({ id, image });
        }
      });
      const skipped = refs.length - list.length;
      return skipped ? { skipped, note: S.limitReached(skipped) } : { skipped: 0 };
    }
    case 'cell': {
      const st = d0.stories.find((s) => s.id === target.storyId);
      if (!st) return { skipped: refs.length };
      const n = cellCount(st.layout);
      const slots = [target.index];
      for (let i = target.index + 1; i < Math.min(n, CELL_SLOTS) && slots.length < refs.length; i++)
        if (!st.cells[i].image) slots.push(i);
      edit((d) => {
        const s = d.stories.find((x) => x.id === target.storyId);
        if (!s) return;
        slots.forEach((i, k) => {
          if (refs[k]) setCellImage(s, i, refs[k]);
        });
      });
      setPrefs({ cell: target.index });
      const skipped = Math.max(0, refs.length - slots.length);
      return skipped ? { skipped, note: S.cellsFull } : { skipped: 0 };
    }
  }
}

function summarize(
  added: number,
  failed: string[],
  notPersisted: boolean,
  note: string | undefined,
): BatchNotice | null {
  const notes = [...failed];
  if (note) notes.push(note);
  if (notPersisted) notes.push(S.notSaved);
  if (!added && !notes.length) return null;
  if (!added) return { title: S.imagesFailed, description: notes.join('；'), tone: 'danger' };
  if (!notes.length) return { title: S.imagesAdded(added), tone: 'success' };
  return { title: S.imagesAdded(added), description: notes.join('；'), tone: 'warning' };
}

/** 選檔、拖放、貼上：讀進資產庫並放到 target；回傳一則通知 */
export async function addImageFiles(
  files: readonly File[],
  target: ImageTarget,
): Promise<BatchNotice | null> {
  if (!files.length) return null;
  const { images, others } = await splitImageFiles(files);
  const failed = others.map((f) => S.notImage(f.name));
  const list = isMultiTarget(target) ? images : images.slice(0, 1);
  const refs: AssetImage[] = [];
  let notPersisted = false;
  for (const file of list) {
    try {
      const r = await addImageFile(assets, file, { maxSide: maxSide(target) });
      refs.push({ kind: 'asset', ...r.ref });
      if (!r.persisted) notPersisted = true;
    } catch (e) {
      failed.push(S.readFailed(e instanceof ImageLoadError ? e.fileName : file.name));
    }
  }
  const r = applyRefs(target, refs);
  return summarize(refs.length - r.skipped, failed, notPersisted, r.note);
}

export interface UrlFailure {
  url: string;
  kind: UrlImageErrorKind | 'decode';
}

/** 圖片網址：一個一個下載、放進資產庫；成功的照樣加入，讀不到的列出原因 */
export async function addImageUrls(
  urls: readonly string[],
  target: ImageTarget,
  signal?: AbortSignal,
): Promise<{ added: number; failed: UrlFailure[]; notice: BatchNotice | null }> {
  const refs: AssetImage[] = [];
  const failed: UrlFailure[] = [];
  let notPersisted = false;
  const list = isMultiTarget(target) ? urls : urls.slice(0, 1);
  await Promise.all(
    list.map(async (url, i) => {
      try {
        const blob = await fetchImageUrl(url, { signal });
        const name = decodeURIComponent(url.split(/[?#]/)[0].split('/').pop() || 'image');
        const r = await addImageFile(assets, blob, { name, maxSide: maxSide(target) });
        refs[i] = { kind: 'asset', ...r.ref };
        if (!r.persisted) notPersisted = true;
      } catch (e) {
        failed.push({ url, kind: e instanceof UrlImageError ? e.kind : 'decode' });
      }
    }),
  );
  const ok = refs.filter(Boolean);
  const r = applyRefs(target, ok);
  const added = ok.length - r.skipped;
  const notes: string[] = [];
  if (r.note) notes.push(r.note);
  if (notPersisted) notes.push(S.notSaved);
  const notice: BatchNotice | null = added
    ? {
        title: S.urlAdded(added),
        description: notes.join('；') || undefined,
        tone: notes.length ? 'warning' : 'success',
      }
    : null;
  return { added, failed, notice };
}
