/**
 * 編輯用（不影響輸出）：編輯區的倍率、輔助線的圓標大小、疊放順序與點選；匯出的取樣時間與檔名。
 */
import { clamp, frameCount, frameTime } from '@/core/timeline';
import type { FrameBase, Point, Rect, Size } from './types';

/* ---------- 編輯區的倍率 ---------- */

/** 編輯區的倍率選項（符合畫面＝1） */
export const EDIT_ZOOMS: readonly number[] = [1, 1.5, 2, 3, 4, 6, 8];
export const EDIT_ZOOM_MAX = 8;

/** −／＋：到下一個（上一個）選項 */
export function stepEditZoom(z: number, dir: 1 | -1): number {
  if (dir > 0) return EDIT_ZOOMS.find((v) => v > z + 1e-3) ?? EDIT_ZOOM_MAX;
  return [...EDIT_ZOOMS].reverse().find((v) => v < z - 1e-3) ?? 1;
}

/** 把一個範圍（畫面 px）放大到佔編輯區的 fill 比例：倍率（1～8，取到 0.01） */
export function editZoomFor(r: Rect, canvas: Size, fill: number): number {
  if (!(r.w > 0) || !(r.h > 0)) return 1;
  const z = fill * Math.min(canvas.width / r.w, canvas.height / r.h);
  return clamp(Math.round(z * 100) / 100, 1, EDIT_ZOOM_MAX);
}

/* ---------- 編輯層的疊放與點選 ---------- */

/**
 * 輔助線的序號圓標直徑（螢幕 px）：舞台顯示寬度的 1/40，夾在 12～20 px——窄螢幕（舞台縮得很小）時跟著縮小，
 * 圓標比較不會互相蓋住
 */
export const badgeDiameter = (displayWidth: number): number =>
  Math.min(20, Math.max(12, displayWidth / 40));

/**
 * 預覽上的疊放順序（下 → 上），也是點選的命中順序：放大框（清單順序）在下，其他的框（清單順序）在上——
 * 跟放大框重疊的框畫在彈出的卡片上面，看起來就在放大框上面；選取中的框放最上面（控點不被別的框蓋住）。
 */
export function stackOrder<F extends FrameBase>(
  frames: readonly F[],
  selected: string | null = null,
): F[] {
  return [
    ...frames.filter((f) => f.kind === 'zoom'),
    ...frames.filter((f) => f.kind !== 'zoom'),
  ].sort((a, b) => Number(a.id === selected) - Number(b.id === selected));
}

/** 點一下選到的框：疊放順序最上面、範圍（四邊往外 pad，原圖 px）含這一點的；都沒有時 null */
export function frameAt<F extends FrameBase>(
  frames: readonly F[],
  selected: string | null,
  p: Point,
  pad = 0,
): F | null {
  const order = stackOrder(frames, selected);
  for (let i = order.length - 1; i >= 0; i--) {
    const f = order[i];
    if (p.x >= f.x - pad && p.x <= f.x + f.w + pad && p.y >= f.y - pad && p.y <= f.y + f.h + pad)
      return f;
  }
  return null;
}

/* ---------- 匯出 ---------- */

/** APNG 的取樣時間（每格 1 ÷ FPS 秒；最後一格是完成的樣子） */
export function apngTimes(total: number, fps: number): number[] {
  const n = frameCount(total, fps);
  return Array.from({ length: n }, (_, i) => frameTime(i, n, total, fps));
}

/** 影片的格數與取樣時間（同 APNG：最後一格是完成的樣子） */
export const videoTimes = apngTimes;

const pad2 = (n: number) => String(n).padStart(2, '0');
export const stamp = (d: Date): string =>
  `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;

/** 匯出的種類（副檔名或 ZIP 的後綴） */
export type FileKind =
  | 'png'
  | 'apng'
  | 'mp4'
  | 'webm'
  | 'mov'
  | 'steps'
  | 'layers'
  | 'frames'
  | (string & {});
/** 檔名：<工具 id>-年月日-時分秒（APNG 加 -anim；ZIP 是 -<種類>.zip） */
export function fxFileName(prefix: string, kind: FileKind, now: Date, zip = false): string {
  const base = `${prefix}-${stamp(now)}`;
  if (kind === 'apng') return `${base}-anim.png`;
  if (zip || kind === 'steps' || kind === 'layers' || kind === 'frames')
    return `${base}-${kind}.zip`;
  return `${base}.${kind}`;
}

/** 連番 PNG 最多幾格（防呆；自訂） */
export const SEQUENCE_MAX_FRAMES = 1200;
/** ZIP 裡的檔名：段階 step_00.png…、連番 frame_0001.png…、圖層四張 */
export const stepFileName = (k: number): string => `step_${String(k).padStart(2, '0')}.png`;
export const frameFileName = (i: number, n: number): string =>
  `frame_${String(i + 1).padStart(Math.max(4, String(n).length), '0')}.png`;
export type LayerId = 'background' | 'cutouts' | 'markers' | 'final';
export const LAYERS: readonly LayerId[] = ['background', 'cutouts', 'markers', 'final'];
export const layerFileName = (id: LayerId): string => `${LAYERS.indexOf(id) + 1}_${id}.png`;
