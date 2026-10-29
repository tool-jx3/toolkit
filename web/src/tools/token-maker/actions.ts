/**
 * 需要讀資料、算遮罩、存檔的動作：讀圖（名單、嵌了設定的 PNG）、換圖片、自動選出主體、魔術棒（含改容許度時重新選）、
 * 選取的修改、讀入遮罩圖、自訂外框與遮罩、自動配色、匯出（單張、全部打包、編號組；可以嵌入設定）。
 * 每個動作的結果整理成一則通知（BatchNotice），由畫面決定怎麼顯示。
 */
import { ImageLoadError, splitImageFiles } from '@/core/assets';
import { uniqueFileName, zipFiles } from '@/core/files';
import { ensureFont } from '@/core/fonts';
import { canvasToBlob } from '@/core/image';
import { autoColor } from './autocolor';
import { detectInner } from './custom';
import { type EmbeddedToken, embedInPng, readEmbedded } from './embed';
import { badgeText, labelText } from './labels';
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
  resampleMask,
  selectedRatio,
  wandRegion,
} from './mask';
import {
  type ExportFormat,
  type Look,
  ratioText,
  type TokenItem,
  tokenBaseName,
  type ZipJob,
} from './model';

export {
  allZipName,
  setFileName,
  setJobs,
  setZipName,
  stamp,
  tokenFileName,
  type ZipJob,
  zipAllJobs,
} from './model';

import { type RenderSources, releaseScratch, renderTokenCanvas } from './render';
import {
  assets,
  decodeMaskPng,
  imageRgbaAt,
  loadCustomMask,
  loadImageWork,
  loadMask,
  peekImageWork,
  peekMask,
  pinImage,
  putMask,
  releaseImageWork,
  softMaskCanvas,
  storeImage,
} from './sources';
import {
  addTokens,
  commitMask,
  currentToken,
  docNow,
  edit,
  effectiveMode,
  flushBurst,
  prefsNow,
  replaceImage,
  setCustomFrame,
  setCustomMask,
  setPrefs,
  setTool,
  tokenPad,
  useDoc,
  useUi,
} from './store';
import { S } from './strings';
import { ensureTexture } from './textures';

export interface BatchNotice {
  title: string;
  description?: string;
  tone: 'success' | 'warning' | 'danger' | 'info';
}

const pct = ratioText;

async function busy<T>(label: string, fn: () => Promise<T>): Promise<T> {
  useUi.setState({ busy: label });
  try {
    return await fn();
  } finally {
    useUi.setState({ busy: null });
  }
}

/* ---------- 讀圖 ---------- */

/** 嵌了設定的 PNG 要怎麼開：開啟成棋子、當成一般圖片；null＝取消 */
export type EmbedChoice = 'open' | 'plain' | null;

async function embeddedOf(file: File): Promise<EmbeddedToken | null> {
  if (file.type && file.type !== 'image/png' && !/\.png$/i.test(file.name)) return null;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return readEmbedded(bytes, docNow().look);
  } catch {
    return null;
  }
}

/** 嵌在 PNG 裡的棋子 → 新的棋子（圖片、遮罩存進資產庫）；外觀換成它的 */
async function restoreEmbedded(
  e: EmbeddedToken,
  fileName: string,
): Promise<{ token: Partial<TokenItem>; persisted: boolean }> {
  /* token-workshop 的 PNG 裡沒有原本的檔名：用讀入的檔名（去掉副檔名），下載的檔名才不會都一樣 */
  const name =
    e.source === 'token-workshop'
      ? fileName.replace(/\.[^.]+$/, '') || 'token'
      : e.image.name || 'token.png';
  const stored = await storeImage(
    new File([e.image.bytes as Uint8Array<ArrayBuffer>], name, { type: e.image.type }),
  );
  const ms = maskSizeFor(stored.ref);
  let mask: Mask | null = null;
  if (e.mask?.kind === 'png')
    /* 遮罩讀不出來：沒有出框，其他照樣開 */
    mask = await decodeMaskPng(
      new Blob([e.mask.bytes as Uint8Array<ArrayBuffer>], { type: 'image/png' }),
      e.mask.width,
      e.mask.height,
    ).catch(() => null);
  else if (e.mask?.kind === 'pixels')
    mask = {
      width: e.mask.width,
      height: e.mask.height,
      data: e.mask.data as Uint8Array<ArrayBuffer>,
    };
  if (mask && (mask.width !== ms.width || mask.height !== ms.height))
    mask = resampleMask(mask, ms.width, ms.height);
  const put = mask && !maskIsEmpty(mask) ? await putMask(mask) : null;
  return {
    token: {
      image: stored.ref,
      view: e.token.view,
      popOn: e.token.popOn,
      name: e.token.name,
      badge: e.token.badge,
      adjust: e.token.adjust,
      mask: put?.ref ?? null,
    },
    persisted: stored.persisted,
  };
}

/**
 * 讀圖（選檔、拖放、貼上）：每張圖一個新的棋子（名單），選取第一個新的；嵌了設定的 PNG 先問要不要開成可以再編輯的棋子。
 * 讀不了的、不是圖片的列在同一則通知裡。打開「讀入時自動選出主體」時接著自動選。
 */
export async function loadImageFiles(
  files: readonly File[],
  ask: (count: number) => Promise<EmbedChoice> = async () => 'open',
): Promise<BatchNotice | null> {
  if (!files.length) return null;
  const { images, others } = await splitImageFiles(files);
  const notes: string[] = others.map((f) => S.notImage(f.name));
  if (!images.length)
    return { title: S.noneLoaded, description: notes.join('；') || undefined, tone: 'danger' };
  const embedded = new Map<File, EmbeddedToken>();
  for (const f of images) {
    const e = await embeddedOf(f);
    if (e) embedded.set(f, e);
  }
  let choice: EmbedChoice = 'plain';
  if (embedded.size) {
    choice = await ask(embedded.size);
    if (choice === null) return null;
  }
  const tokens: Partial<TokenItem>[] = [];
  /** 每個讀到的棋子是不是從嵌入的設定開的（自動選出主體時略過） */
  const opened: boolean[] = [];
  const names: string[] = [];
  let notSaved = false;
  let look: Look | null = null;
  await busy(S.busy, async () => {
    for (const f of images) {
      try {
        const e = choice === 'open' ? embedded.get(f) : undefined;
        const restored = e ? await restoreEmbedded(e, f.name).catch(() => null) : null;
        if (e && restored) {
          tokens.push(restored.token);
          opened.push(true);
          if (!restored.persisted) notSaved = true;
          look = e.look;
        } else {
          /* 嵌入的設定讀不出來（資料壞掉）：當成一般圖片 */
          if (e) notes.push(S.embedBroken(f.name));
          const r = await storeImage(f);
          tokens.push({ image: r.ref, name: '' });
          opened.push(false);
          if (!r.persisted) notSaved = true;
        }
        names.push(f.name);
      } catch (err) {
        const name = err instanceof ImageLoadError ? err.fileName || f.name : f.name;
        notes.push(S.readFailed(name));
      }
    }
  });
  if (!tokens.length)
    return { title: S.noneLoaded, description: notes.join('；') || undefined, tone: 'danger' };
  /* 換外觀＋加入棋子＝一步復原 */
  const restoredLook = look as Look | null;
  flushBurst();
  useDoc.beginGesture();
  let ids: string[] = [];
  try {
    if (restoredLook) {
      const custom = docNow().custom.frame;
      edit((d) => {
        d.look =
          restoredLook.frame === 'custom' && !custom
            ? { ...restoredLook, frame: 'plain' }
            : restoredLook;
      });
    }
    ids = addTokens(tokens);
  } finally {
    useDoc.endGesture();
  }
  if (ids.length < tokens.length) notes.push(S.rosterFull(ids.length));
  if (notSaved) notes.push(S.imageNotSaved);
  if (prefsNow().autoDetect)
    for (const [i, id] of ids.entries()) if (!opened[i]) await runAuto(id, { quiet: true });
  const openedCount = opened.filter(Boolean).length;
  const title = openedCount
    ? S.embeddedOpened(openedCount)
    : ids.length === 1
      ? S.imageLoaded(names[0])
      : S.imagesLoaded(ids.length);
  return {
    title,
    description: notes.join('；') || undefined,
    tone: notes.length ? 'warning' : 'success',
  };
}

/** 換掉目前棋子的圖片 */
export async function replaceCurrentImage(file: File): Promise<BatchNotice | null> {
  const token = currentToken();
  if (!token) return loadImageFiles([file]);
  try {
    const r = await busy(S.busy, () => storeImage(file));
    replaceImage(token.id, r.ref);
    if (prefsNow().autoDetect) await runAuto(token.id, { quiet: true });
    return {
      title: S.imageReplaced(file.name),
      description: r.persisted ? undefined : S.imageNotSaved,
      tone: r.persisted ? 'success' : 'warning',
    };
  } catch (err) {
    const name = err instanceof ImageLoadError ? err.fileName || file.name : file.name;
    return { title: S.readFailed(name), tone: 'danger' };
  }
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

/** 匯出一個棋子要用的東西都讀好（圖片、遮罩、質感、自訂外框與遮罩、字型），算出邊距 */
export async function prepareToken(
  token: TokenItem,
  look: Look,
  badge?: string | null,
): Promise<{ src: RenderSources; pad: number } | null> {
  if (!token.image) return null;
  const work = await loadImageWork(token.image);
  if (!work) return null;
  const mask = token.mask
    ? (peekMask(token.mask.id) ?? (await loadMask(token.mask)) ?? null)
    : null;
  const texture = await ensureTexture(look.texture, look.texSeed).catch(() => null);
  const custom = docNow().custom;
  const frameImg =
    look.frame === 'custom' && custom.frame
      ? ((await assets.bitmap(custom.frame.id).catch(() => undefined)) ?? null)
      : null;
  const customMask = custom.mask ? await loadCustomMask(custom.mask.id) : null;
  const text = `${labelText(look, token)}${badgeText(look, token, badge)}`;
  if (text && look.font.family)
    await ensureFont(look.font.family, look.font.weight, text).catch(() => false);
  return {
    src: {
      image: work.bitmap,
      size: token.image,
      popMask: mask && token.popOn ? softMaskCanvas(mask, look.feather) : null,
      texture,
      customFrame: frameImg,
      customFrameId: custom.frame?.id ?? null,
      customMask,
    },
    pad: tokenPad(look, token, mask),
  };
}

export const MIME: Record<ExportFormat, string> = { png: 'image/png', webp: 'image/webp' };

export interface RenderBlobOptions {
  /** 徽章換成這個（編號組） */
  badge?: string | null;
  /** 把設定嵌進 PNG */
  embed?: boolean;
}

/** 嵌進 PNG 的內容：外觀、棋子的設定、原圖與遮罩 */
async function embedFor(
  token: TokenItem,
  look: Look,
  badge: string | null | undefined,
  png: Uint8Array,
): Promise<Uint8Array> {
  if (!token.image) return png;
  const img = await assets.get(token.image.id);
  if (!img) return png;
  const maskBlob = token.mask ? await assets.get(token.mask.id) : undefined;
  return embedInPng(png, {
    look,
    token: {
      name: token.name,
      badge: badge ?? token.badge,
      view: token.view,
      popOn: token.popOn,
      adjust: token.adjust,
    },
    image: {
      name: token.image.name,
      type: img.type || 'image/png',
      bytes: new Uint8Array(await img.arrayBuffer()),
    },
    mask:
      token.mask && maskBlob
        ? {
            width: token.mask.width,
            height: token.mask.height,
            bytes: new Uint8Array(await maskBlob.arrayBuffer()),
          }
        : null,
  });
}

/** 一個棋子的圖檔 */
export async function renderTokenBlob(
  token: TokenItem,
  look: Look,
  N: number,
  format: ExportFormat,
  { badge, embed = false }: RenderBlobOptions = {},
): Promise<Blob> {
  /* 畫完之前這張大圖不會被放掉 */
  const unpin = token.image ? pinImage(token.image.id) : () => undefined;
  try {
    const prep = await prepareToken(token, look, badge);
    if (!prep) throw new Error('no image');
    const canvas = renderTokenCanvas(
      { N, pad: prep.pad, look, token, cacheFrame: N <= 1024, badge },
      prep.src,
    );
    unpin();
    const blob = await canvasToBlob(canvas, MIME[format], format === 'webp' ? 0.95 : undefined);
    if (!embed || format !== 'png') return blob;
    const bytes = await embedFor(token, look, badge, new Uint8Array(await blob.arrayBuffer()));
    return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/png' });
  } finally {
    unpin();
    if (N > 1024) releaseScratch();
  }
}

/** 一張一張畫好打包成 ZIP（每張之間讓畫面喘口氣）；onProgress(i, n) */
export async function zipTokens(
  jobs: readonly ZipJob[],
  look: Look,
  N: number,
  format: ExportFormat,
  embed: boolean,
  onProgress?: (i: number, n: number) => void,
): Promise<Blob> {
  const used = new Set<string>();
  const entries: { name: string; data: Uint8Array }[] = [];
  for (const [i, job] of jobs.entries()) {
    onProgress?.(i + 1, jobs.length);
    const blob = await renderTokenBlob(job.token, look, N, format, { badge: job.badge, embed });
    entries.push({
      name: uniqueFileName(job.name, used),
      data: new Uint8Array(await blob.arrayBuffer()),
    });
    /* 畫完就放掉這張大圖（目前的棋子留著） */
    if (job.token.image) releaseImageWork(job.token.image.id);
    await new Promise((r) => setTimeout(r, 0));
  }
  const bytes = await zipFiles(
    entries.map((e) => ({ ...e, level: 0 })),
    {},
  );
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
}

/* ---------- 自訂外框、自訂遮罩、自動配色 ---------- */

export async function loadCustomFrame(file: File): Promise<BatchNotice> {
  try {
    const r = await storeImage(file);
    const bmp = await assets.bitmap(r.ref.id);
    if (!bmp) throw new Error('decode');
    const inner = Math.round(Math.max(30, Math.min(100, detectInner(bmp) * 100)));
    setCustomFrame(r.ref, inner);
    return {
      title: S.customFrameLoaded(inner),
      tone: r.persisted ? 'success' : 'warning',
      description: r.persisted ? undefined : S.imageNotSaved,
    };
  } catch {
    return { title: S.readFailed(file.name), tone: 'danger' };
  }
}

export async function loadCustomMaskFile(file: File): Promise<BatchNotice> {
  try {
    const r = await storeImage(file);
    const c = await loadCustomMask(r.ref.id);
    if (!c) throw new Error('decode');
    setCustomMask(r.ref);
    return {
      title: S.customMaskLoaded,
      tone: r.persisted ? 'success' : 'warning',
      description: r.persisted ? undefined : S.imageNotSaved,
    };
  } catch {
    return { title: S.readFailed(file.name), tone: 'danger' };
  }
}

/** 自動配色：從目前棋子的圖片挑外框色或第二色（每按一次換下一個候選） */
export async function autoPickColor(kind: 'frame' | 'accent'): Promise<BatchNotice | null> {
  const token = currentToken();
  if (!token?.image) return { title: S.noImageYet, tone: 'warning' };
  const work = peekImageWork(token.image.id) ?? (await loadImageWork(token.image));
  if (!work) return { title: S.imageMissing, tone: 'danger' };
  const look = docNow().look;
  const seed = useUi.getState().autoSeed;
  useUi.setState({ autoSeed: seed + 1 });
  const main = look.colorMode === 'gradient' ? look.g1 : look.color;
  const hex = autoColor(work.work, kind, main, kind === 'frame' ? main : look.accent, seed);
  if (!hex) return { title: S.autoColorNone, tone: 'warning' };
  edit((d) => {
    if (kind === 'frame') {
      d.look.colorMode = 'solid';
      d.look.color = hex;
      d.look.colorKey = 'custom';
    } else {
      d.look.accent = hex;
      d.look.accentOn = true;
    }
  });
  return null;
}

/* ---------- 參考圖 ---------- */

/** 讀入參考圖（存進資產庫；記在偏好裡） */
export async function loadRefImage(file: File): Promise<BatchNotice> {
  try {
    const r = await storeImage(file);
    setPrefs({ refImage: r.ref.id, refKind: 'custom' });
    return { title: S.refLoaded, tone: 'success' };
  } catch {
    return { title: S.readFailed(file.name), tone: 'danger' };
  }
}

/** 名單裡的棋子照匯出的樣子畫成參考圖（eidolon-ui 的「當參考」） */
export async function tokenAsRef(token: TokenItem): Promise<BatchNotice> {
  try {
    const blob = await renderTokenBlob(token, docNow().look, 1024, 'png');
    if (token.image) releaseImageWork(token.image.id);
    const r = await storeImage(new File([blob], 'reference.png', { type: 'image/png' }));
    setPrefs({ refImage: r.ref.id, refKind: 'custom' });
    return { title: S.refFromToken(tokenBaseName(token) || S.untitled), tone: 'success' };
  } catch {
    return { title: S.exportFailed, tone: 'danger' };
  }
}
