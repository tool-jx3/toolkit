/**
 * 操作流程（載入、畫布尺寸、匯出、單張下載、試算、還原、清除）：讀寫 store、交給處理 Worker、顯示處理中畫面與通知。
 */
import { readRoomZip } from '@/ccfolia';
import { downloadBytes, filesInMemory, readAsBytes } from '@/core/files';
import type { ConfirmOptions, ToastOptions } from '@/ui';
import { type AssetAdjust, compileAdjust } from './adjust';
import { busy } from './Busy';
import { isAbort, type StudioRunner } from './client';
import { formatMb, savingPercent, targetBytes } from './compress';
import {
  basename,
  centerOffset,
  containerOriginName,
  dispatchFiles,
  exportZipName,
  isGridAligned,
  originNameOf,
  padTo24,
  pngOutputName,
  psdLayerFileNames,
  relativePath,
  resolvePlays,
  uniqueAssetName,
  validCanvasSize,
} from './naming';
import {
  type ExportJob,
  type ExportProgress,
  type OutputOptions,
  type ProcessInfo,
  type ProcessProgress,
  padRgba,
  resizeRgba,
  thumbSize,
} from './process';
import {
  clearSavedSession,
  deserializeWorkspace,
  loadSavedSession,
  readSavedFile,
  type SavedSession,
} from './session';
import {
  type Asset,
  emptyWorkspace,
  newAssetId,
  type Settings,
  sanitizeSettings,
  useSettings,
  useWorkspace,
  visibilityOf,
  type Workspace,
} from './store';
import { S } from './strings';
import { clearThumbs, getThumbSource, keepThumbs, setThumb } from './thumbs';

export interface Ctx {
  runner: StudioRunner;
  toast: (o: ToastOptions) => void;
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  /** 壓縮狀態文字（F89） */
  setStatus: (text: string) => void;
}

const TOAST_MS = 2500;
const note = (
  ctx: Ctx,
  title: string,
  tone: ToastOptions['tone'] = 'success',
  description?: string,
) =>
  ctx.toast({
    title,
    tone,
    description,
    replace: true,
    duration: tone === 'danger' ? 7000 : TOAST_MS,
  });

const settings = (): Settings => sanitizeSettings(useSettings.getState().data);
const ws = () => useWorkspace.getState();

/** F84～F88：匯出的選項（播放次數另外依每張算） */
export function outputOptions(s: Settings): Omit<OutputOptions, 'plays'> {
  return {
    compress: s.compress,
    targetBytes: targetBytes(s.targetMb),
    skip: s.frameSkip,
    compressStatic: s.compressStatic,
  };
}

export const playsOf = (a: Asset, s: Settings): number =>
  resolvePlays(
    { mode: a.loopMode, count: a.loopCount },
    { mode: s.loopMode, count: s.loopCount },
    a.plays,
  );

const errMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/* ---------- 載入（F06～F11） ---------- */

export async function handleFiles(ctx: Ctx, files: File[]): Promise<void> {
  const d = dispatchFiles(files);
  if (d.kind === 'none') {
    note(ctx, S.unsupported, 'danger', S.unsupportedHint);
    return;
  }
  if (d.kind === 'psd') return loadPsd(ctx, d.file);
  if (d.kind === 'zip') return loadZip(ctx, d.file);
  /*
   * 圖片是一張一張處理：先全部讀進記憶體（保留資料夾裡的相對路徑），後面的檔案才不會等到讀不到
   * （Android 的相片挑選器給的檔案，讀取權限之後會失效）。PSD、ZIP 本來就是一開始就讀。
   */
  return loadImages(ctx, await filesInMemory(d.files));
}

function newAsset(
  id: string,
  name: string,
  bytes: Uint8Array,
  info: {
    width: number;
    height: number;
    apng: boolean;
    frames: number;
    delays: number[];
    plays: number;
  },
  extra: Partial<Asset> = {},
): Asset {
  return {
    id,
    name,
    label: basename(name),
    inZip: false,
    zipIntact: false,
    bytes,
    width: info.width,
    height: info.height,
    apng: info.apng,
    frames: info.frames,
    delays: info.delays,
    plays: info.plays,
    layer: null,
    visible: true,
    solo: false,
    adjust: null,
    loopMode: 'global',
    loopCount: 1,
    rev: 0,
    ...extra,
  };
}

/** F07：一般圖片——不是圖片模式時換掉原內容；已經是圖片模式時累加 */
export async function loadImages(ctx: Ctx, files: File[]): Promise<void> {
  const cur = ws();
  const append = cur.mode === 'image';
  const used = new Set(append ? cur.assets.map((a) => a.name) : []);
  const added: Asset[] = [];
  const failed: string[] = [];
  busy.start(S.busyReading, S.busyReadingSub);
  try {
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      busy.update({
        title: S.busyImages(i + 1, files.length),
        sub: relativePath(f),
        progress: i / files.length,
      });
      try {
        const bytes = await readAsBytes(f);
        const info = await ctx.runner.prepare(bytes);
        const id = newAssetId();
        setThumb(id, 0, info.thumb);
        added.push(newAsset(id, uniqueAssetName(relativePath(f), used), bytes, info));
      } catch (e) {
        if (isAbort(e)) throw e;
        failed.push(relativePath(f));
      }
    }
  } finally {
    busy.end();
  }
  if (!added.length) {
    note(ctx, S.someFailed(failed.length), 'danger', S.failedList(failed));
    return;
  }
  const last = added[added.length - 1];
  if (append) {
    ws().set({ assets: [...ws().assets, ...added], selectedId: last.id, tab: 'list' });
  } else {
    keepThumbs(added.map((a) => a.id));
    ws().load({
      mode: 'image',
      assets: added,
      origin: originNameOf(files[0]),
      tab: 'list',
      selectedId: last.id,
    });
  }
  if (failed.length) note(ctx, S.someFailed(failed.length), 'warning', S.failedList(failed));
  else note(ctx, S.imagesAdded(added.length));
}

/** F09：ZIP——房間資料看得出是房間就是房間模式，否則圖片模式（記住原 ZIP） */
export async function loadZip(ctx: Ctx, file: File): Promise<void> {
  busy.start(S.busyZip, file.name);
  const added: Asset[] = [];
  const failed: string[] = [];
  let read: ReturnType<typeof readRoomZip>;
  let bytes: Uint8Array;
  try {
    try {
      bytes = await readAsBytes(file);
      read = readRoomZip(bytes);
    } catch (e) {
      busy.end();
      note(ctx, S.zipFailed, 'danger', S.zipFailedHint(errMessage(e)));
      return;
    }
    for (let i = 0; i < read.images.length; i++) {
      const img = read.images[i];
      busy.update({
        title: S.busyZipImages(i + 1, read.images.length),
        sub: img.path,
        progress: i / read.images.length,
      });
      try {
        const info = await ctx.runner.prepare(img.data);
        const id = newAssetId();
        setThumb(id, 0, info.thumb);
        added.push(newAsset(id, img.path, img.data, info, { inZip: true, zipIntact: true }));
      } catch (e) {
        if (isAbort(e)) throw e;
        failed.push(img.path);
      }
    }
  } finally {
    busy.end();
  }
  if (!added.length) {
    note(ctx, S.zipNoImages, 'danger', failed.length ? S.failedList(failed) : undefined);
    return;
  }
  keepThumbs(added.map((a) => a.id));
  const room = read.isRoom;
  ws().load({
    mode: room ? 'room' : 'image',
    assets: added,
    origin: containerOriginName(file.name, 'zip'),
    zip: { bytes: bytes!, entries: read.entries, dataPath: read.dataPath, json: read.json },
    roomJson: room ? read.json : null,
    tab: room ? 'layout' : 'list',
  });
  const msg = room ? S.roomLoaded(added.length) : S.zipImagesLoaded(added.length);
  if (failed.length) note(ctx, msg, 'warning', S.failedList(failed));
  else note(ctx, msg);
}

/** F10：PSD——看得見、有像素的圖層各成一個素材；清單與面板由上到下（第 7 節裁定） */
export async function loadPsd(ctx: Ctx, file: File): Promise<void> {
  busy.start(S.busyPsd, S.busyPsdSub);
  let out: Awaited<ReturnType<StudioRunner['loadPsd']>>;
  try {
    const bytes = await readAsBytes(file);
    out = await ctx.runner.loadPsd(bytes, (i, n, name) =>
      busy.update({ title: S.busyPsdLayers(i, n), sub: name, progress: i / n }),
    );
  } catch (e) {
    busy.end();
    if (!isAbort(e)) note(ctx, S.psdFailed, 'danger', errMessage(e));
    return;
  }
  busy.end();
  if (!out.layers.length) {
    note(ctx, S.psdNoLayers, 'danger', S.psdNoLayersHint);
    return;
  }
  const topDown = [...out.layers].reverse();
  const names = psdLayerFileNames(
    topDown.map((l) => l.name),
    S.emptyLayerName,
  );
  const assets = topDown.map((l, i) => {
    const id = newAssetId();
    setThumb(id, 0, l.thumb, l.maskedThumb);
    return newAsset(
      id,
      names[i],
      l.png,
      { width: l.width, height: l.height, apng: false, frames: 1, delays: [0], plays: 0 },
      {
        label: l.name.trim() ? l.name : S.emptyLayerName(i + 1),
        layer: {
          left: l.left,
          top: l.top,
          opacity: l.opacity,
          blendMode: l.blendMode,
          clipping: l.clipping,
        },
      },
    );
  });
  keepThumbs(assets.map((a) => a.id));
  ws().load({
    mode: 'psd',
    assets,
    origin: containerOriginName(file.name, 'psd'),
    psd: { width: out.width, height: out.height },
    tab: 'layout',
  });
  note(ctx, S.psdLoaded(assets.length));
}

/* ---------- 畫布尺寸（F101～F103） ---------- */

async function applyResize(ctx: Ctx, a: Asset, w: number, h: number): Promise<Asset> {
  const { dx, dy } = centerOffset(a.width, a.height, w, h);
  const out = await ctx.runner.resizeCanvas(a.bytes, w, h, dx, dy);
  const rev = a.rev + 1;
  /* 遮色片縮圖（PSD）跟著補：在縮圖的比例上補邊再縮到新縮圖的大小 */
  const old = getThumbSource(a.id);
  let masked = null;
  if (old?.masked) {
    const k = old.masked.width / a.width;
    const pw = Math.max(1, Math.round(w * k));
    const ph = Math.max(1, Math.round(h * k));
    const padded = padRgba(
      old.masked.rgba,
      old.masked.width,
      old.masked.height,
      pw,
      ph,
      Math.round(dx * k),
      Math.round(dy * k),
    );
    const t = thumbSize(w, h);
    masked = { ...t, rgba: resizeRgba(padded, pw, ph, t.width, t.height) };
  }
  setThumb(a.id, rev, out.info.thumb, masked);
  return {
    ...a,
    bytes: out.bytes,
    width: w,
    height: h,
    frames: out.info.frames,
    delays: out.info.delays,
    zipIntact: false,
    rev,
    layer: a.layer ? { ...a.layer, left: a.layer.left - dx, top: a.layer.top - dy } : null,
  };
}

/** F101：改成指定尺寸（比原圖小時先確認會裁切，第 5 節第 31 項） */
export async function resizeAsset(ctx: Ctx, id: string, w: number, h: number): Promise<void> {
  const a = ws().assets.find((x) => x.id === id);
  if (!a || !validCanvasSize(w, h)) return;
  if (a.width === w && a.height === h) {
    note(ctx, S.sameSize(w, h), 'info');
    return;
  }
  if (w < a.width || h < a.height) {
    const ok = await ctx.confirm({
      title: S.cropConfirmTitle,
      description: S.cropConfirmBody(a.width, a.height, w, h),
      confirmLabel: S.cropConfirmOk,
      danger: true,
    });
    if (!ok) return;
  }
  busy.start(S.busyResize, `${a.label}（${a.width}×${a.height} → ${w}×${h}）`);
  try {
    const next = await applyResize(ctx, a, w, h);
    ws().updateAsset(id, () => next);
    note(ctx, S.resized(w, h));
  } catch (e) {
    if (!isAbort(e)) note(ctx, errMessage(e), 'danger');
  } finally {
    busy.end();
  }
}

/** F102：補到 24 的倍數 */
export async function padAsset(ctx: Ctx, id: string): Promise<void> {
  const a = ws().assets.find((x) => x.id === id);
  if (!a) return;
  if (isGridAligned(a.width, a.height)) {
    note(ctx, S.alreadyAligned(a.width, a.height), 'info');
    return;
  }
  const t = padTo24(a.width, a.height);
  await resizeAsset(ctx, id, t.width, t.height);
}

/** F103：全部補到 24 的倍數（含看不見的；已整除的跳過） */
export async function padAll(ctx: Ctx): Promise<void> {
  const list = ws().assets.filter((a) => !isGridAligned(a.width, a.height));
  if (!list.length) {
    note(ctx, S.paddedNone, 'info');
    return;
  }
  busy.start(S.busyResizeAll);
  let count = 0;
  try {
    for (let i = 0; i < list.length; i++) {
      const a = ws().assets.find((x) => x.id === list[i].id);
      if (!a) continue;
      busy.update({ sub: a.label, progress: i / list.length });
      const t = padTo24(a.width, a.height);
      const next = await applyResize(ctx, a, t.width, t.height);
      ws().updateAsset(a.id, () => next);
      count++;
    }
  } catch (e) {
    if (!isAbort(e)) note(ctx, errMessage(e), 'danger');
  } finally {
    busy.end();
  }
  note(ctx, S.paddedAll(count));
}

/* ---------- 匯出（F84～F100） ---------- */

const statusText = (p: ProcessProgress): string | null => {
  if (p.type === 'try') return S.status(Math.round(p.scale * 100), p.colors);
  if (p.type === 'skip') return S.statusSkip;
  return null;
};

/** 匯出的工作內容 */
export function buildExportJob(w: Workspace, s: Settings): ExportJob {
  const visible = visibilityOf(w.assets);
  return {
    mode: w.mode === 'psd' ? 'psd' : w.mode === 'room' ? 'room' : 'image',
    global: s.global,
    output: outputOptions(s),
    assets: w.assets.map((a) => ({
      name: a.name,
      zipPath: a.inZip ? a.name : undefined,
      bytes: a.bytes,
      asset: a.adjust,
      visible: visible(a),
      plays: playsOf(a, s),
    })),
    zip: w.zip ? { entries: w.zip.entries, dataPath: w.zip.dataPath, json: w.zip.json } : null,
  };
}

export async function exportAll(ctx: Ctx): Promise<void> {
  const w = ws();
  if (!w.assets.length) return;
  const s = settings();
  if (w.mode === 'room' && !w.zip) {
    note(ctx, S.needZip, 'danger', S.needZipHint);
    return;
  }
  const job = buildExportJob(w, s);
  if (w.mode !== 'room' && !job.assets.some((a) => a.visible)) {
    note(ctx, S.noVisible, 'warning');
    return;
  }
  const name = exportZipName(w.origin, S.fallbackZip[w.mode]);
  let cancelled = false;
  busy.start(w.mode === 'psd' ? S.busyExportPsd : S.busyExport, '', () => {
    cancelled = true;
    ctx.runner.cancel();
  });
  try {
    let assetTotal = 1;
    let assetIndex = 0;
    const r = await ctx.runner.exportZip(job, (p: ExportProgress) => {
      if (p.type === 'asset') {
        assetIndex = p.index;
        assetTotal = p.total;
        busy.update({
          title: S.busyAsset(p.index, p.total),
          sub: p.name,
          progress: (p.index - 1) / p.total,
        });
      } else if (p.type === 'detail') {
        const d = p.detail;
        if (d.type === 'frame') {
          busy.update({
            sub: S.busyFrame(d.index, d.total),
            progress: (assetIndex - 1 + d.index / d.total / 2) / assetTotal,
          });
        } else {
          const t = statusText(d);
          if (t) {
            ctx.setStatus(t);
            busy.update({
              sub: d.type === 'try' ? S.busyTry(Math.round(d.scale * 100), d.colors) : S.busySkip,
            });
          }
        }
      } else {
        busy.update({ title: S.busyPack, sub: name, progress: 1 });
      }
    });
    downloadBytes(r.bytes, name, 'application/zip');
    note(ctx, S.exportDone(name));
    if (r.over.length) note(ctx, S.exportDone(name), 'warning', S.exportOver(r.over));
  } catch (e) {
    if (cancelled || isAbort(e)) note(ctx, S.canceled, 'info');
    else note(ctx, S.exportFailed, 'danger', errMessage(e));
  } finally {
    busy.end();
    ctx.setStatus('');
  }
}

/** F71：只處理並下載這一張（規則同匯出） */
export async function downloadOne(ctx: Ctx, id: string): Promise<void> {
  const a = ws().assets.find((x) => x.id === id);
  if (!a) return;
  const s = settings();
  let cancelled = false;
  busy.start(S.busySingle, a.label, () => {
    cancelled = true;
    ctx.runner.cancel();
  });
  try {
    const r = await ctx.runner.processImage(
      a.bytes,
      { global: s.global, asset: a.adjust },
      { ...outputOptions(s), plays: playsOf(a, s) },
      (p) => {
        const t = statusText(p);
        if (t) {
          ctx.setStatus(t);
          busy.update({ sub: t });
        } else if (p.type === 'frame')
          busy.update({ sub: S.busyFrame(p.index, p.total), progress: p.index / p.total });
      },
    );
    /* 檔名：PSD 是圖層的檔名（圖層名清理後＋.png，第 5 節第 27 項）；其他是檔名（不含資料夾），重新編碼成 PNG 的靜態圖改 .png */
    const base = basename(a.name);
    const name = r.info.apng ? base : pngOutputName(base);
    downloadBytes(r.data, name, 'image/png');
    if (r.info.compressed && r.info.apng)
      note(
        ctx,
        S.downloaded(name),
        'success',
        S.compressDone(Math.round(r.info.scale * 100), formatMb(r.info.size)),
      );
    else note(ctx, S.downloaded(name));
    if (r.info.over) note(ctx, S.downloaded(name), 'warning', S.testOver);
  } catch (e) {
    if (cancelled || isAbort(e)) note(ctx, S.canceled, 'info');
    else note(ctx, S.exportFailed, 'danger', errMessage(e));
  } finally {
    busy.end();
    ctx.setStatus('');
  }
}

/** F81：容量壓縮試算（不看壓縮總開關；用目前的調色、目標容量、跳格設定） */
export async function testOne(ctx: Ctx, id: string): Promise<ProcessInfo | null> {
  const a = ws().assets.find((x) => x.id === id);
  if (!a) return null;
  const s = settings();
  try {
    const r = await ctx.runner.processImage(
      a.bytes,
      { global: s.global, asset: a.adjust },
      { ...outputOptions(s), compress: true, plays: playsOf(a, s) },
      (p) => {
        const t = statusText(p);
        if (t) ctx.setStatus(t);
      },
    );
    note(
      ctx,
      S.testToast(
        formatMb(r.info.origSize),
        formatMb(r.info.size),
        savingPercent(r.info.origSize, r.info.size),
      ),
      r.info.over ? 'warning' : 'success',
    );
    return r.info;
  } catch (e) {
    if (!isAbort(e)) note(ctx, S.exportFailed, 'danger', errMessage(e));
    return null;
  } finally {
    ctx.setStatus('');
  }
}

/* ---------- 還原與清除（F104～F106） ---------- */

/** 存檔 → 作業（自動還原與開啟專案檔共用） */
export async function restoreFrom(
  ctx: Ctx,
  session: SavedSession,
  getFile: (name: string) => Promise<Uint8Array | undefined>,
): Promise<number> {
  busy.start(S.busyRestore, S.busyRestoreSub(session.assets.length));
  try {
    const r = await deserializeWorkspace(session, getFile);
    const assets = r.workspace.assets ?? [];
    const ok: Asset[] = [];
    for (let i = 0; i < assets.length; i++) {
      const a = assets[i];
      busy.update({
        title: S.busyRestoreItem(i + 1, assets.length),
        sub: a.label,
        progress: i / assets.length,
      });
      try {
        const info = await ctx.runner.prepare(a.bytes);
        setThumb(a.id, a.rev, info.thumb, r.masks.get(a.id) ?? null);
        ok.push({
          ...a,
          plays: info.plays,
          delays: info.delays,
          frames: info.frames,
          apng: info.apng,
        });
      } catch (e) {
        if (isAbort(e)) throw e;
      }
    }
    keepThumbs(ok.map((a) => a.id));
    ws().load({ ...r.workspace, assets: ok, mode: ok.length ? r.workspace.mode : 'idle' });
    return ok.length;
  } finally {
    busy.end();
  }
}

export async function restoreOnStart(ctx: Ctx): Promise<void> {
  const session = await loadSavedSession();
  if (!session) return;
  try {
    const n = await restoreFrom(ctx, session, readSavedFile);
    if (n) note(ctx, S.restored(n));
  } catch {
    note(ctx, S.restoreFailed, 'danger');
  }
}

/** F106：清除作業（整體調色不重設；模式回到等待、面板收起——第 5 節第 23 項） */
export async function clearWork(ctx: Ctx): Promise<void> {
  const ok = await ctx.confirm({
    title: S.clearConfirmTitle,
    description: S.clearConfirmBody,
    confirmLabel: S.clearConfirmOk,
    danger: true,
  });
  if (!ok) return;
  await clearSavedSession().catch(() => {});
  clearThumbs();
  ws().load(emptyWorkspace());
  note(ctx, S.cleared);
}

/** 個別調色的變更（F72～F75；null＝個別重設） */
export function setAssetAdjust(id: string, adjust: AssetAdjust | null): void {
  ws().updateAsset(id, (a) => ({ ...a, adjust }));
}

/** 預覽縮圖要用的調色（給 thumbs.requestThumbs） */
export const compileFor = (s: Settings, a: Asset) => () => compileAdjust(s.global, a.adjust);
