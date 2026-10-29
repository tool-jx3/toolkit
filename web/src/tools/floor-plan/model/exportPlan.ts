/**
 * 匯出的計畫（純函式）：要畫哪幾層、用什麼設定、檔名。匯出對話框、測試共用。
 */
import { type ExportImageOptions, type ExportLayout, exportLayout } from '../draw/export';
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
import type { Floor, Project, ThemeId } from './types';

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
