/**
 * 匯出圖片：把一層或好幾層畫成一張 PNG。
 *
 * - 每層的範圍＝看得到的東西的外接範圍＋四周 margin 格；好幾層時用所有樓層的共同範圍（疊起來位置一樣），
 *   上方留 2 格寫樓層名稱，樓層之間空 1 格。
 * - 一排太長（寬高比 > 5）時改成多排：選最接近 4:3 的欄數。
 * - GM 用的圖上方加一條「GM 用」的字帶（不會和 PL 用的搞混）。
 * - 實際的倍率：每格 px，但超過瀏覽器能畫的大小時自動縮小（core/image 的 limitResolution、deviceResolutionLimits）。
 */
import { deviceResolutionLimits, limitResolution, type ResolutionLimits } from '@/core/image';
import { floorBounds, unionRect, visibleFloor } from '../model/geometry';
import type { Floor, Rect, SizeMode, ThemeId } from '../model/types';
import { haloText } from './labels';
import { drawFloor } from './render';
import { getTheme } from './themes';

export interface ExportImageOptions {
  theme: ThemeId;
  /** 每格的像素數 */
  px: number;
  showSize: SizeMode;
  hideNames: boolean;
  playerView: boolean;
  hideClues: boolean;
  grid: boolean;
  transparent: boolean;
  /** 四周留白（格；預設 2） */
  margin?: number;
  /** 只有一層也寫樓層名稱 */
  titles?: boolean;
  /** GM 用的字帶文字（null＝不加） */
  gmBadge?: string | null;
  /** 畫布上限（測試用；預設依裝置） */
  limit?: ResolutionLimits;
}

export interface ExportLayout {
  frames: Rect[];
  cols: number;
  rows: number;
  gap: number;
  titleH: number;
  margin: number;
  badgeFont: number;
  badgeH: number;
  /** 整張圖（格） */
  width: number;
  height: number;
  /** 實際的每格 px（可能比要求的小） */
  scale: number;
  /** 輸出的像素尺寸 */
  pxWidth: number;
  pxHeight: number;
}

const EMPTY: Rect = { x: 0, y: 0, w: 10, h: 8 };

/** 匯出的版面（不畫，只算尺寸；預覽與實際匯出共用） */
export function exportLayout(floors: readonly Floor[], opts: ExportImageOptions): ExportLayout {
  const margin = opts.margin ?? 2;
  const shown = floors.map((f) => visibleFloor(f, opts.playerView, opts.hideClues));
  const multi = floors.length > 1;
  let common: Rect | null = null;
  if (multi)
    for (const f of shown) {
      const b = floorBounds(f as Floor);
      if (b) common = unionRect(common, b);
    }
  const titleH = multi || opts.titles ? 2 : 0;
  const frames = shown.map((f) => {
    const b = common ?? floorBounds(f as Floor) ?? EMPTY;
    return {
      x: b.x - margin,
      y: b.y - margin - titleH,
      w: b.w + margin * 2,
      h: b.h + margin * 2 + titleH,
    };
  });
  const gap = multi ? 1 : 0;
  const fh = Math.max(...frames.map((f) => f.h));
  const sizeFor = (cols: number) => {
    const rows = Math.ceil(frames.length / cols);
    const w = frames.slice(0, cols).reduce((s, f) => s + f.w, 0) + gap * (cols - 1);
    return { cols, rows, w, h: rows * fh + gap * (rows - 1) };
  };
  const offAspect = (l: { w: number; h: number }) => Math.abs(Math.log(l.w / l.h / (4 / 3)));
  let layout = sizeFor(frames.length);
  if (layout.w / layout.h > 5)
    for (let cols = 1; cols < frames.length; cols++) {
      const cand = sizeFor(cols);
      if (offAspect(cand) < offAspect(layout)) layout = cand;
    }
  const badgeFont = Math.min(4, Math.max(1.1, layout.w * 0.025));
  const badgeH = opts.gmBadge ? badgeFont * 1.6 : 0;
  const width = layout.w;
  const height = layout.h + badgeH;
  const scale = limitResolution(opts.px, { width, height }, opts.limit ?? deviceResolutionLimits());
  return {
    frames,
    cols: layout.cols,
    rows: layout.rows,
    gap,
    titleH,
    margin,
    badgeFont,
    badgeH,
    width,
    height,
    scale,
    pxWidth: Math.max(1, Math.round(width * scale)),
    pxHeight: Math.max(1, Math.round(height * scale)),
  };
}

/** 畫成 canvas */
export function renderImage(floors: readonly Floor[], opts: ExportImageOptions): HTMLCanvasElement {
  const theme = getTheme(opts.theme);
  const L = exportLayout(floors, opts);
  const canvas = document.createElement('canvas');
  canvas.width = L.pxWidth;
  canvas.height = L.pxHeight;
  const c = canvas.getContext('2d');
  if (!c) return canvas;
  if (!opts.transparent) {
    c.fillStyle = theme.bg;
    c.fillRect(0, 0, canvas.width, canvas.height);
  }
  const s = L.scale;
  const fh = Math.max(...L.frames.map((f) => f.h));
  let offset = 0;
  floors.forEach((floor, i) => {
    const f = L.frames[i];
    const row = Math.floor(i / L.cols);
    if (i % L.cols === 0) offset = 0;
    c.save();
    c.setTransform(s, 0, 0, s, (offset - f.x) * s, (L.badgeH + row * (fh + L.gap) - f.y) * s);
    drawFloor(c, floor, {
      theme: opts.transparent ? { ...theme, bg: 'transparent' } : theme,
      zoom: s,
      showSize: opts.showSize,
      hideNames: opts.hideNames,
      playerView: opts.playerView,
      hideClues: opts.hideClues,
      editor: false,
      grid: opts.grid,
      viewRect: f,
      background: false,
    });
    if (L.titleH) {
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      haloText(
        c,
        floor.name || '',
        f.x + L.margin,
        f.y + L.titleH / 2 + 0.3,
        { weight: 800, size: 1.1, family: theme.font },
        theme.label,
        null,
        0,
      );
    }
    c.restore();
    offset += f.w + L.gap;
  });
  if (L.badgeH && opts.gmBadge) {
    c.save();
    c.setTransform(s, 0, 0, s, 0, 0);
    c.globalAlpha = 0.55;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    haloText(
      c,
      opts.gmBadge,
      L.badgeFont * 0.5,
      L.badgeH / 2 + L.badgeFont * 0.1,
      { weight: 900, size: L.badgeFont, family: theme.font },
      theme.gm,
      null,
      0,
    );
    c.restore();
  }
  return canvas;
}

/** 有沒有東西可以匯出（每一層都空時 false） */
export function hasExportContent(
  floors: readonly Floor[],
  playerView: boolean,
  hideClues: boolean,
): boolean {
  return floors.some((f) => floorBounds(visibleFloor(f, playerView, hideClues) as Floor));
}
