/**
 * 匯出的計畫（純函式）：要畫哪幾層、用什麼設定、檔名。匯出對話框、測試共用。
 */
import type { ExportImageOptions } from '../draw/export';
import { S } from '../strings';
import type { ExportPx } from './catalog';
import { floorHasClues } from './geometry';
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
}

/** 檔名不能用的字元與空白（連續的算一個）→ _ */
const BAD_FILE_CHARS = /[\\/:*?"<>|\s]+/g;

/** 檔名用的地圖名稱：不能用的字元與空白換成 _，最多 60 字；空白時「未命名地圖」 */
export function fileBase(name: string): string {
  const base = (name || '').trim() || S.untitled;
  return base.replace(BAD_FILE_CHARS, '_').slice(0, 60) || 'map';
}

export function exportFloors(p: Project, range: ExportRange): Floor[] {
  return range === 'all' ? p.floors : [p.floors[p.active]];
}

export function exportOptions(
  p: Project,
  exp: ExportSettings,
  theme: ThemeId,
  px: number,
): ExportImageOptions {
  return {
    theme,
    px,
    showSize: p.showSize,
    hideNames: p.showNames === false,
    playerView: exp.view === 'pl',
    hideClues: exp.clues === 'hide',
    grid: exp.grid,
    transparent: exp.transparent,
    gmBadge: exp.view === 'pl' ? null : S.badgeGm,
  };
}

/** 匯出的檔名：地圖名稱[_樓層]_PL／GM[_無線索].png */
export function exportFileName(p: Project, exp: ExportSettings, floor: Floor | null): string {
  const parts = [fileBase(p.name)];
  if (floor) parts.push(String(floor.name || '').replace(/[\\/:*?"<>|\s]+/g, '_'));
  parts.push(exp.view === 'pl' ? 'PL' : 'GM');
  if (exp.clues === 'hide' && p.floors.some(floorHasClues)) parts.push(S.exp.noClueSuffix);
  return `${parts.filter(Boolean).join('_')}.png`;
}

export interface ExportJob {
  floors: Floor[];
  name: string;
}

export function exportJobs(p: Project, exp: ExportSettings): ExportJob[] {
  const multi = p.floors.length > 1;
  if (exp.range === 'each' && multi)
    return p.floors.map((f) => ({ floors: [f], name: exportFileName(p, exp, f) }));
  const floors = exportFloors(p, exp.range);
  return [
    {
      floors,
      name: exportFileName(
        p,
        exp,
        exp.range === 'all' && multi ? null : multi ? p.floors[p.active] : null,
      ),
    },
  ];
}
