/**
 * 需要讀資料、算遮罩、存檔的動作：讀圖、自動選出主體、魔術棒（含改容許度時重新選）、選取的修改、讀入遮罩圖、匯出。
 * 每個動作的結果整理成一則通知（BatchNotice），由畫面決定怎麼顯示。
 */
import { ImageLoadError, splitImageFiles } from '@/core/assets';
import { canvasToBlob } from '@/core/image';
import {
  applyRegion,
  autoSubject,
  emptyMask,
  filledMask,
  hasTransparency,
  invertMask,
  type Mask,
  maskFromAlpha,
  maskFromImage,
  maskIsEmpty,
  maskSizeFor,
  morphMask,
  selectedRatio,
  wandRegion,
} from './mask';
import type { ExportFormat, Look, TokenItem } from './model';

export { tokenFileName } from './model';

import { type RenderSources, releaseScratch, renderTokenCanvas } from './render';
import {
  imageRgbaAt,
  loadImageWork,
  loadMask,
  peekImageWork,
  peekMask,
  softMaskCanvas,
  storeImage,
} from './sources';
import {
  applyImage,
  commitMask,
  currentToken,
  docNow,
  effectiveMode,
  prefsNow,
  setTool,
  tokenPad,
  useUi,
} from './store';
import { S } from './strings';
import { ensureTexture } from './textures';

export interface BatchNotice {
  title: string;
  description?: string;
  tone: 'success' | 'warning' | 'danger' | 'info';
}

const pct = (r: number) =>
  r < 0.001 ? '0.1 以下' : r < 0.1 ? (r * 100).toFixed(1) : String(Math.round(r * 100));

async function busy<T>(label: string, fn: () => Promise<T>): Promise<T> {
  useUi.setState({ busy: label });
  try {
    return await fn();
  } finally {
    useUi.setState({ busy: null });
  }
}

/* ---------- 讀圖 ---------- */

/**
 * 讀圖（選檔、拖放、貼上）：用第一張圖片換掉目前棋子的圖片（沒有棋子時新增一個）；
 * 其餘的檔案列在同一則通知裡。打開「讀入時自動選出主體」時接著自動選。
 */
export async function loadImageFiles(files: readonly File[]): Promise<BatchNotice | null> {
  if (!files.length) return null;
  const { images, others } = await splitImageFiles(files);
  const notes: string[] = others.map((f) => S.notImage(f.name));
  const [first, ...rest] = images;
  if (rest.length) notes.push(S.onlyFirst(rest.map((f) => f.name).join('」「')));
  if (!first)
    return {
      title: S.notImage(files[0].name),
      description: notes.slice(1).join('；') || undefined,
      tone: 'danger',
    };
  let stored: Awaited<ReturnType<typeof storeImage>>;
  try {
    stored = await busy(S.busy, () => storeImage(first));
  } catch (e) {
    const name = e instanceof ImageLoadError ? e.fileName || first.name : first.name;
    return {
      title: S.readFailed(name),
      description: notes.join('；') || undefined,
      tone: 'danger',
    };
  }
  const id = applyImage(stored.ref);
  if (!stored.persisted) notes.push(S.imageNotSaved);
  let autoNote: string | null = null;
  if (prefsNow().autoDetect) {
    const r = await runAuto(id, { quiet: true });
    if (r) autoNote = r.title;
  }
  return {
    title: S.imageLoaded(first.name),
    description: [autoNote, ...notes].filter(Boolean).join('；') || undefined,
    tone: notes.length ? 'warning' : 'success',
  };
}

/* ---------- 自動選出主體 ---------- */

/** 自動選出主體：有透明背景用透明度，否則從四邊的背景往內找；找不到時切到魔術棒 */
export async function runAuto(
  tokenId: string | null = docNow().current,
  { quiet = false } = {},
): Promise<BatchNotice | null> {
  const token = docNow().tokens.find((t) => t.id === tokenId);
  if (!token?.image) return { title: S.noImageYet, tone: 'warning' };
  const work = await loadImageWork(token.image);
  if (!work) return { title: S.imageMissing, tone: 'danger' };
  const alpha = hasTransparency(work.work);
  const mask = await busy(S.busy, async () => {
    await new Promise((r) => setTimeout(r, 0));
    return alpha ? maskFromAlpha(work.work) : autoSubject(work.work);
  });
  if (!mask || maskIsEmpty(mask)) {
    if (!quiet) setTool('wand');
    return { title: S.autoNone, tone: 'warning' };
  }
  await commitMask(token.id, mask);
  useUi.setState({ wand: null });
  return { title: alpha ? S.autoAlpha : S.autoFound, tone: 'success' };
}

/* ---------- 選取 ---------- */

/** 目前棋子的遮罩（還沒讀好時先讀；沒有遮罩時是空的） */
async function currentMask(token: TokenItem): Promise<Mask | null> {
  if (!token.image) return null;
  const size = token.mask ?? maskSizeFor(token.image);
  if (!token.mask) return emptyMask(size.width, size.height);
  return (await loadMask(token.mask)) ?? emptyMask(size.width, size.height);
}

/** 魔術棒：在遮罩的 (x, y) 點一下 */
export async function wandAt(x: number, y: number): Promise<BatchNotice | null> {
  const token = currentToken();
  if (!token?.image) return null;
  const work = peekImageWork(token.image.id) ?? (await loadImageWork(token.image));
  const base = await currentMask(token);
  if (!work || !base) return null;
  const p = prefsNow();
  const mode = effectiveMode();
  const { region } = wandRegion(work.work, x, y, p.tolerance, p.contiguous);
  const { mask, changed } = applyRegion(base, region, mode);
  if (!changed) {
    useUi.setState({ wand: null });
    return { title: S.wandNothing, tone: 'info' };
  }
  const baseRef = token.mask;
  const id = await commitMask(token.id, maskIsEmpty(mask) ? null : mask);
  useUi.setState({ wand: { tokenId: token.id, x, y, mode, base: baseRef, result: id } });
  const r = changed / (mask.width * mask.height);
  return { title: mode === 'add' ? S.wandAdded(pct(r)) : S.wandRemoved(pct(r)), tone: 'success' };
}

/** 改了容許度或「只選相連的」：從魔術棒上次點的地方重新選（遮罩被別的動作改掉時不做事） */
export async function retuneWand(final = true): Promise<void> {
  const seed = useUi.getState().wand;
  const token = currentToken();
  if (!seed || !token?.image || token.id !== seed.tokenId) return;
  if ((token.mask?.id ?? null) !== seed.result) {
    useUi.setState({ wand: null });
    return;
  }
  const work = peekImageWork(token.image.id);
  if (!work) return;
  const size = maskSizeFor(token.image);
  const base = seed.base ? await loadMask(seed.base) : emptyMask(size.width, size.height);
  if (!base) return;
  const p = prefsNow();
  const { region } = wandRegion(work.work, seed.x, seed.y, p.tolerance, p.contiguous);
  const { mask } = applyRegion(base, region, seed.mode);
  if (!final) {
    /* 拖滑桿中：只換預覽（放開才存成一步） */
    useUi.setState((u) => ({
      liveMask: { tokenId: token.id, mask, version: (u.liveMask?.version ?? 0) + 1 },
    }));
    return;
  }
  const id = await commitMask(token.id, maskIsEmpty(mask) ? null : mask);
  useUi.setState({ liveMask: null });
  const now = useUi.getState().wand;
  if (now === seed) useUi.setState({ wand: { ...seed, result: id } });
}

/** 遮罩的整體修改：清除、反轉、擴大、縮小、全部選取 */
export async function changeMask(
  kind: 'clear' | 'invert' | 'grow' | 'shrink' | 'fill',
): Promise<BatchNotice | null> {
  const token = currentToken();
  if (!token?.image) return { title: S.noImageYet, tone: 'warning' };
  const base = await currentMask(token);
  if (!base) return null;
  useUi.setState({ wand: null });
  if (kind === 'clear') {
    if (!token.mask) return null;
    await commitMask(token.id, null);
    return { title: S.cleared, tone: 'info' };
  }
  const work = peekImageWork(token.image.id) ?? (await loadImageWork(token.image));
  const next =
    kind === 'invert'
      ? invertMask(base, work?.work ?? null)
      : kind === 'fill'
        ? filledMask(base.width, base.height)
        : morphMask(base, kind === 'grow');
  await commitMask(token.id, maskIsEmpty(next) ? null : next);
  return null;
}

/** 讀入遮罩圖（拉伸到圖片的範圍；有透明的用透明度、否則用亮度） */
export async function loadMaskFile(file: File): Promise<BatchNotice> {
  const token = currentToken();
  if (!token?.image) return { title: S.noImageYet, tone: 'warning' };
  const size = maskSizeFor(token.image);
  try {
    const rgba = await imageRgbaAt(file, size.width, size.height);
    const mask = maskFromImage(rgba);
    await commitMask(token.id, maskIsEmpty(mask) ? null : mask);
    useUi.setState({ wand: null });
    return { title: S.maskLoaded, tone: 'success' };
  } catch {
    return { title: S.maskLoadFailed, description: file.name, tone: 'danger' };
  }
}

export function selectionText(mask: Mask | null): string {
  const r = selectedRatio(mask);
  return r > 0 ? S.selectedRatio(pct(r)) : S.selectedNone;
}

/* ---------- 匯出 ---------- */

/** 匯出一個棋子要用的東西都讀好（圖片、遮罩、質感），算出邊距 */
export async function prepareToken(
  token: TokenItem,
  look: Look,
): Promise<{ src: RenderSources; pad: number } | null> {
  if (!token.image) return null;
  const work = await loadImageWork(token.image);
  if (!work) return null;
  const mask = token.mask
    ? (peekMask(token.mask.id) ?? (await loadMask(token.mask)) ?? null)
    : null;
  const texture = await ensureTexture(look.texture, look.texSeed).catch(() => null);
  return {
    src: {
      image: work.bitmap,
      size: token.image,
      popMask: mask && token.popOn ? softMaskCanvas(mask, look.feather) : null,
      texture,
    },
    pad: tokenPad(look, token, mask),
  };
}

export const MIME: Record<ExportFormat, string> = { png: 'image/png', webp: 'image/webp' };

/** 一個棋子的圖檔 */
export async function renderTokenBlob(
  token: TokenItem,
  look: Look,
  N: number,
  format: ExportFormat,
): Promise<Blob> {
  const prep = await prepareToken(token, look);
  if (!prep) throw new Error('no image');
  const canvas = renderTokenCanvas(
    { N, pad: prep.pad, look, token, cacheFrame: N <= 1024 },
    prep.src,
  );
  try {
    return await canvasToBlob(canvas, MIME[format], format === 'webp' ? 0.95 : undefined);
  } finally {
    if (N > 1024) releaseScratch();
  }
}
