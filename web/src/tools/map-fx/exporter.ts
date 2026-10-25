/**
 * 匯出（規格 3.9、F57～F68）：PNG、APNG、影片、段階公開／圖層／連番 PNG 的 ZIP 都走共用的 createFxExporter；
 * 地圖演出自己的兩種：
 * - X 用 MP4：30 fps、長邊 1280 以內（整張畫面等比縮小放進去）、透明的地方鋪「單色背景」的顏色；不改編輯中的設定。
 * - 房間遮罩 ZIP（CCFOLIA 自由探索用）：原地圖一張、每個房間遮罩兩張——和地圖同尺寸的透明 PNG（放在地圖上不用對位）
 *   與裁切到房間大小的 PNG（檔名寫上以「1 格＝N px」換算的格數）；遮罩一律是蓋滿的樣子。
 */

import { makeCanvas } from '@/core/image';
import {
  createFxExporter,
  drawRedact,
  encodeFxVideo,
  type FxExportContext,
  type FxExportOutput,
  sizeBadge as fxSizeBadge,
  type ImageSource,
  pngBytes,
  RenderCache,
  type VideoMode,
  zipOutput,
} from '@/core/imagefx';
import {
  computeLayout,
  exportFileName,
  type Frame,
  type MapState,
  mapFileName,
  type RedactFrame,
  roomFileNames,
  unitOf,
  X_FPS,
  xVideoSize,
} from './model';
import { KIT } from './render';
import { S } from './strings';

export {
  type ApngJob,
  detectVideoMode,
  formatSize,
  setForceRealtime,
  type VideoMode,
} from '@/core/imagefx';

export const exporter = createFxExporter<Frame, MapState>(KIT, 'map-fx', S);

export const {
  ensureFonts,
  finalPng,
  exportPng,
  exportApng,
  exportVideo,
  exportSteps,
  exportLayers,
  exportSequence,
} = exporter;

/** 試算大小的徽章 */
export const sizeBadge = (bytes: number) => fxSizeBadge(bytes, S);

/** X 用 MP4（mode：detectVideoMode(xVideoSize(畫面), 30, false)） */
export async function exportXVideo(
  s: MapState,
  image: ImageSource,
  mode: VideoMode,
  ctx: FxExportContext,
): Promise<FxExportOutput> {
  await ensureFonts(s);
  const layout = computeLayout(s, { width: image.width, height: image.height });
  const full = layout.canvas;
  const size = xVideoSize(full);
  const anim = exporter.animFrameDrawer(s, image);
  const src = makeCanvas(full.width, full.height);
  const sg = src.getContext('2d') as CanvasRenderingContext2D;
  const out = await encodeFxVideo(
    mode,
    {
      size,
      fps: X_FPS,
      total: anim.total,
      matte: s.bg.color,
      draw: (g, t) => {
        anim.draw(sg, t);
        g.save();
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, size.width, size.height);
        g.imageSmoothingQuality = 'high';
        g.drawImage(src, 0, 0, size.width, size.height);
        g.restore();
      },
      fileName: () => exportFileName('x', new Date()),
    },
    S,
    ctx,
  );
  const vp9 = mode.kind === 'mp4' && mode.plan.video.codec === 'vp09';
  return vp9
    ? { ...out, details: [...(out.details ?? []), { label: S.detailNote, value: S.xVp9Note }] }
    : out;
}

/** 清單裡的房間遮罩（照清單順序） */
export const roomsOf = (s: MapState): RedactFrame[] =>
  s.frames.filter((f): f is RedactFrame => f.kind === 'redact');

/** 一個房間遮罩畫在和地圖同尺寸的透明畫布上（蓋滿的樣子；外觀與預覽相同，只是以地圖原本的解析度畫） */
export function drawRoomMask(
  g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  s: MapState,
  image: ImageSource,
  room: RedactFrame,
  cache: RenderCache,
): void {
  const layout = computeLayout(s, { width: image.width, height: image.height });
  const f = layout.shot.f;
  drawRedact(
    g,
    room,
    { x: room.x, y: room.y, w: room.w, h: room.h },
    { span: [0, 1], alpha: 1 },
    {
      img: image,
      cache,
      baseScale: f,
      u: unitOf(layout.canvas) / f,
      m: { ox: 0, oy: 0, s: 1, k: 1 },
      canvas: { width: image.width, height: image.height },
    },
    KIT.paintRedact,
  );
}

/** 房間遮罩 ZIP：map_W×H.png（原地圖）＋每個房間 01_房名_full.png、01_房名_6x4.png */
export async function exportRooms(
  s: MapState,
  image: ImageSource,
  grid: number,
  { signal, onProgress }: FxExportContext,
): Promise<FxExportOutput> {
  await ensureFonts(s);
  const rooms = roomsOf(s);
  if (!rooms.length) throw new Error(S.roomsNone);
  const W = image.width;
  const H = image.height;
  const names = roomFileNames(rooms, grid);
  const entries: { name: string; data: Uint8Array }[] = [];
  const map = makeCanvas(W, H);
  (map.getContext('2d') as CanvasRenderingContext2D).drawImage(image, 0, 0);
  entries.push({ name: mapFileName({ width: W, height: H }, grid), data: await pngBytes(map) });
  const cache = new RenderCache();
  const full = makeCanvas(W, H);
  const g = full.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  for (const [i, room] of rooms.entries()) {
    if (signal.aborted) throw new DOMException('已取消', 'AbortError');
    g.clearRect(0, 0, W, H);
    drawRoomMask(g, s, image, room, cache);
    entries.push({ name: names[i].full, data: await pngBytes(full) });
    const crop = makeCanvas(room.w, room.h);
    (crop.getContext('2d') as CanvasRenderingContext2D).drawImage(
      full,
      room.x,
      room.y,
      room.w,
      room.h,
      0,
      0,
      room.w,
      room.h,
    );
    entries.push({ name: names[i].crop, data: await pngBytes(crop) });
    onProgress((i + 1) / (rooms.length + 1), S.rendering(i + 1, rooms.length));
  }
  return zipOutput(entries, exportFileName('rooms', new Date()), { width: W, height: H }, [
    { label: S.detailFiles, value: S.roomsValue(rooms.length) },
    { label: S.detailGrid, value: S.gridValue(grid) },
  ]);
}
