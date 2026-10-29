/**
 * 匯出的計畫（純函式）：要畫哪幾層、用什麼設定、檔名。匯出對話框、測試共用。
 */
import type { HandoffRoom, HandoffRooms } from '@/core/handoff';
import {
  type ExportImageOptions,
  type ExportLayout,
  exportLayout,
  floorOffset,
  hasExportContent,
} from '../draw/export';
import { S } from '../strings';
import {
  DEFAULT_CELL,
  type ExportPx,
  VTT_MAX_PIXELS,
  VTT_MAX_SIDE,
  VTT_PX,
  type VttPx,
} from './catalog';
import { coordGrid } from './coords';
import { floorHasClues } from './geometry';
import { composedFloor } from './interior';
import { cutRect, roomContainsRoom } from './shape';
import type { Floor, Project, Rect, Room, ThemeId } from './types';

export type ExportRange = 'current' | 'all' | 'each';

/** 匯出設定（記在瀏覽器裡） */
export interface ExportSettings {
  range: ExportRange;
  view: 'pl' | 'gm';
  clues: 'show' | 'hide';
  px: ExportPx;
  grid: boolean;
  transparent: boolean;
  /** 用途：一般圖片／VTT 用（2026-10-29，F265；沒有＝一般圖片） */
  mode?: 'image' | 'vtt';
  /** VTT 的一格幾 px（沒有＝100） */
  vttPx?: VttPx;
  /** 黑色電影、監視終端的顆粒與雜訊（2026-10-29；沒有＝畫，D74） */
  noise?: boolean;
}

/** VTT 用的匯出（2026-10-29，F265） */
export const isVtt = (exp: Pick<ExportSettings, 'mode'>): boolean => exp.mode === 'vtt';
/** VTT 的一格（格）：棋子方格的大小；沒有棋子方格時 1 m */
export const vttCell = (p: Pick<Project, 'tokenGrid'>): number => p.tokenGrid || DEFAULT_CELL;
export const vttPxOf = (exp: Pick<ExportSettings, 'vttPx'>): VttPx =>
  exp.vttPx && (VTT_PX as readonly number[]).includes(exp.vttPx) ? exp.vttPx : 100;

/** 檔名不能用的字元與空白（連續的算一個）→ _ */
const BAD_FILE_CHARS = /[\\/:*?"<>|\s]+/g;

/** 檔名用的地圖名稱：不能用的字元與空白換成 _，最多 60 字；空白時「未命名地圖」 */
export function fileBase(name: string): string {
  const base = (name || '').trim() || S.untitled;
  return base.replace(BAD_FILE_CHARS, '_').slice(0, 60) || 'map';
}

/** 要畫的樓層（外觀層打開「顯示內部」時是疊好的樓層，2026-10 第二批） */
export function exportFloors(p: Project, range: ExportRange): Floor[] {
  return (range === 'all' ? p.floors : [p.floors[p.active]]).map((f) => composedFloor(f, p.floors));
}

/**
 * 匯出的選項。`px`：一般圖片的每格 px（預覽時傳比較小的值）；VTT 用時改用「VTT 的一格幾 px ÷ 一格的格數」，
 * 範圍對齊 VTT 的一格、不自動縮小（`preview` 時照樣縮成預覽的大小）。
 */
export function exportOptions(
  p: Project,
  exp: ExportSettings,
  theme: ThemeId,
  px: number,
  preview = false,
): ExportImageOptions {
  const vtt = isVtt(exp);
  const cell = vttCell(p);
  const vttScale = vttPxOf(exp) / cell;
  return {
    theme,
    px: vtt ? (preview ? Math.min(vttScale, px) : vttScale) : px,
    ...(vtt ? { alignCell: cell, fixedScale: !preview } : {}),
    coordGrid: p.coords ? coordGrid(p.floors, p.tokenGrid) : null,
    wear: p.wear ? { strength: p.wear, seed: p.wearSeed ?? 0 } : null,
    noNoise: exp.noise === false,
    showSize: p.showSize,
    hideNames: p.showNames === false,
    playerView: exp.view === 'pl',
    hideClues: exp.clues === 'hide',
    grid: exp.grid,
    transparent: exp.transparent,
    gmBadge: exp.view === 'pl' ? null : S.badgeGm,
    tokenGrid: p.tokenGrid ?? 0,
    tokenGridColor: p.tokenGridColor,
    tokenGridOpacity: p.tokenGridOpacity,
  };
}

/** 棋子方格每格的像素數（匯出資訊用；小數 2 位，沒有方格時 0） */
export const tokenGridPx = (tokenGrid: number, scale: number): number =>
  tokenGrid > 0 ? Math.round(tokenGrid * scale * 100) / 100 : 0;

/** VTT 的格數（橫、縱）：圖的格數 ÷ VTT 的一格 */
export function vttCells(L: Pick<ExportLayout, 'width' | 'height'>, cell: number) {
  return { x: Math.round(L.width / cell), y: Math.round(L.height / cell) };
}

/** VTT 用的圖太大（任一邊超過 8192 px 或總像素超過 3200 萬，F266） */
export const vttTooLarge = (L: Pick<ExportLayout, 'pxWidth' | 'pxHeight'>): boolean =>
  L.pxWidth > VTT_MAX_SIDE || L.pxHeight > VTT_MAX_SIDE || L.pxWidth * L.pxHeight > VTT_MAX_PIXELS;

/** 匯出的檔名：地圖名稱[_樓層]_PL／GM[_無線索][_橫x縱（VTT）].png */
export function exportFileName(
  p: Project,
  exp: ExportSettings,
  floor: Floor | null,
  cells?: { x: number; y: number } | null,
): string {
  const parts = [fileBase(p.name)];
  if (floor) parts.push(String(floor.name || '').replace(/[\\/:*?"<>|\s]+/g, '_'));
  parts.push(exp.view === 'pl' ? 'PL' : 'GM');
  if (exp.clues === 'hide' && p.floors.some(floorHasClues)) parts.push(S.exp.noClueSuffix);
  if (cells) parts.push(`${cells.x}x${cells.y}`);
  return `${parts.filter(Boolean).join('_')}.png`;
}

export interface ExportJob {
  floors: Floor[];
  name: string;
}

export function exportJobs(p: Project, exp: ExportSettings): ExportJob[] {
  const multi = p.floors.length > 1;
  /* VTT 用：檔名加上格數（每一張各自算） */
  const cells = (floors: Floor[]) =>
    isVtt(exp)
      ? vttCells(exportLayout(floors, exportOptions(p, exp, p.theme, exp.px)), vttCell(p))
      : null;
  if (exp.range === 'each' && multi)
    return p.floors.map((f) => {
      const floors = [composedFloor(f, p.floors)];
      return { floors, name: exportFileName(p, exp, f, cells(floors)) };
    });
  const floors = exportFloors(p, exp.range);
  return [
    {
      floors,
      name: exportFileName(
        p,
        exp,
        exp.range === 'all' && multi ? null : multi ? p.floors[p.active] : null,
        cells(floors),
      ),
    },
  ];
}

/**
 * 編輯畫面上紙的污漬與摺痕的「紙」（F263、D75）：用目前的匯出設定匯出「這一層」時整張圖的範圍（世界座標，
 * 含四周的留白、座標的字、GM 字帶），所以畫面上的污漬和匯出這一層的圖在同一個位置
 * （2026-10-29 驗證後修訂：原本是所有樓層的範圍）。隱藏線索照畫面上目前的狀態（同匯出對話框打開時）。沒有東西時 null。
 */
export function wearSheet(p: Project, exp: ExportSettings, showClues: boolean): Rect | null {
  const e: ExportSettings = { ...exp, range: 'current', clues: showClues ? 'show' : 'hide' };
  const floors = exportFloors(p, 'current');
  if (!hasExportContent(floors, e.view === 'pl', e.clues === 'hide')) return null;
  const L = exportLayout(floors, exportOptions(p, e, p.theme, 24));
  const f = L.frames[0];
  return { x: f.x, y: f.y, w: L.width, h: L.height };
}

/**
 * 送到地圖演出產生器的房間範圍（2026-10-29，F271、D82；map-fx F85）：匯出的這張圖（`L`＝它的版面）上每一間房的外框與 L 形的缺角，
 * 換算成圖的 px（含四周的留白、座標的字、GM 字帶、樓層名稱列與好幾層排成一張時的位置；每條邊各自四捨五入，相鄰的房間共用同一條線）。
 *
 * - 帶哪些：「不顯示名字」的房間（拼接的小塊、走廊）不帶；PL 用的圖（`playerView`）不帶 GM 專用的房間與在它裡面的房間（只剩牆框，
 *   名字也不能帶）。順序同「替這一層的房間編號」（F219）：每一層 PL 看得到的房間由上到下、由左到右，GM 專用的接在後面；樓層照圖上的順序。
 * - 名字：圖上寫的名字（PL 用的圖用「給 PL 看的名字」）；匯出時不顯示房間名字（`hideNames`）就是空的。
 * - `gm`：GM 用的圖上只有 GM 看得到的房間（含在 GM 專用房間裡面的）。
 */
export function handoffRoomsOf(
  floors: readonly Floor[],
  L: ExportLayout,
  opts: Pick<ExportImageOptions, 'playerView' | 'hideNames'>,
): HandoffRooms {
  const s = L.scale;
  const list: HandoffRoom[] = [];
  floors.forEach((floor, i) => {
    if (!L.frames[i]) return;
    const o = floorOffset(L, i);
    const px = (v: number, d: number) => Math.round((v + d) * s);
    const hidden = floor.rooms.filter((r) => r.gm);
    const isGm = (r: Room) => !!r.gm || hidden.some((g) => g !== r && roomContainsRoom(g, r));
    const byPosition = (a: Room, b: Room) => a.y - b.y || a.x - b.x;
    const target = floor.rooms.filter((r) => !r.hideLabel);
    const visible = target.filter((r) => !isGm(r)).sort(byPosition);
    const gmOnly = opts.playerView ? [] : target.filter(isGm).sort(byPosition);
    for (const r of [...visible, ...gmOnly]) {
      const x0 = px(r.x, o.x);
      const y0 = px(r.y, o.y);
      const x1 = px(r.x + r.w, o.x);
      const y1 = px(r.y + r.h, o.y);
      if (x1 - x0 < 1 || y1 - y0 < 1) continue;
      const name = opts.hideNames ? '' : (opts.playerView && r.plName) || r.name || '';
      const room: HandoffRoom = { name, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      const k = cutRect(r);
      if (k && r.cut) {
        /* 缺角的內側那一點也各自四捨五入（和牆線對齊） */
        const west = r.cut.c === 'nw' || r.cut.c === 'sw';
        const north = r.cut.c === 'nw' || r.cut.c === 'ne';
        const cw = west ? px(k.x + k.w, o.x) - x0 : x1 - px(k.x, o.x);
        const ch = north ? px(k.y + k.h, o.y) - y0 : y1 - px(k.y, o.y);
        if (cw >= 1 && ch >= 1 && cw < room.w && ch < room.h)
          room.cut = { c: r.cut.c, w: cw, h: ch };
      }
      if (isGm(r)) room.gm = true;
      list.push(room);
    }
  });
  return { width: L.pxWidth, height: L.pxHeight, list };
}
