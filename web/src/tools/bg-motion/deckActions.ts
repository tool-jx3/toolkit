/**
 * 「圖片切換」模式的操作（規格 F111～F116、F123）：加入圖片（選檔、拖放、貼上都走這裡）、範例圖、複製、輸出尺寸。
 * 通知透過 actions.ts 的 notify（ToolShell 裡的 ToastBridge 交過來的 toast）。
 */
import { addImageFiles, splitImageFiles } from '@/core/assets';
import { canvasToBlob } from '@/core/image';
import { notify } from './actions';
import { DECK_IMAGE_MAX_SIDE, fitFirstSize, LIMITS, newUid } from './deck';
import { appendSlides, assets, deckNow, duplicateSlide, edit } from './deckStore';
import { drawMiniScene, type MiniScene } from './sample';
import { DECK } from './strings';

/** 加入一批圖片（接在清單最後面）；清單原本是空的時，輸出尺寸改成照第一張 */
export async function addDeckImages(files: readonly File[]): Promise<number> {
  if (!files.length) return 0;
  const { images, others } = await splitImageFiles(files);
  const { loaded, failed } = await addImageFiles(assets, images, { maxSide: DECK_IMAGE_MAX_SIDE });
  const notes: string[] = [];
  if (others.length) notes.push(DECK.notImages(others.map((f) => f.name).join('、')));
  if (failed.length) notes.push(DECK.addFailed(failed.join('、')));
  const unsaved = loaded.some((l) => !l.persisted);
  if (unsaved) notes.push(DECK.imageNotSaved);
  appendSlides(loaded.map((l) => l.ref));
  if (loaded.length || notes.length) {
    notify({
      title: loaded.length ? DECK.added(loaded.length) : notes[0],
      description: loaded.length
        ? notes.join('；') || undefined
        : notes.slice(1).join('；') || undefined,
      tone: notes.length ? 'warning' : 'success',
      duration: notes.length ? 6000 : 2400,
    });
  }
  return loaded.length;
}

/** 範例圖：4 張 16:9 的小風景（白天、黃昏、夜晚、清晨），轉成 PNG 檔後走和使用者上傳相同的流程 */
export async function addDeckSamples(): Promise<number> {
  const kinds: MiniScene[] = ['day', 'dusk', 'night', 'dawn'];
  const files: File[] = [];
  for (let i = 0; i < kinds.length; i++) {
    const c = document.createElement('canvas');
    c.width = 800;
    c.height = 450;
    const ctx = c.getContext('2d');
    if (!ctx) continue;
    drawMiniScene(ctx, c.width, c.height, kinds[i]);
    const blob = await canvasToBlob(c, 'image/png');
    files.push(new File([blob], DECK.sampleNames[i], { type: 'image/png' }));
  }
  return addDeckImages(files);
}

/** 複製一列（同一張圖、同樣的秒數與效果） */
export const duplicateDeckSlide = (uid: string): void => duplicateSlide(uid, newUid());

/** 輸出尺寸（夾進 16～4096、整數） */
export function setDeckSize(width: number, height: number): void {
  const w = Math.round(Math.min(LIMITS.width.max, Math.max(LIMITS.width.min, width)));
  const h = Math.round(Math.min(LIMITS.height.max, Math.max(LIMITS.height.min, height)));
  const d = deckNow();
  if (d.width === w && d.height === h) return;
  edit((x) => {
    x.width = w;
    x.height = h;
  });
}

/** 「照第一張」 */
export function fitDeckToFirst(): void {
  const first = deckNow().slides[0];
  if (!first) return;
  const r = fitFirstSize(first.image.width, first.image.height);
  setDeckSize(r.width, r.height);
}
