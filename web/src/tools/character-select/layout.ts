/**
 * 版面幾何（規格 3.2，純函式）：主格與清單的分割、大格、小清單的格子、自動間距、畫布尺寸與版型。
 */
import { clamp } from '@/core/timeline';
import type { Settings } from './model';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IndexedBox extends Box {
  index: number;
}

type LayoutInput = Pick<Settings, 'layout' | 'mainPanel' | 'characters'>;

/** 小清單的列數（自動加列時至少能放下所有角色） */
export function effectiveRows(s: LayoutInput): number {
  const minimum = Math.max(1, s.layout.rows);
  if (!s.layout.autoRows) return minimum;
  return Math.max(minimum, Math.ceil(Math.max(1, s.characters.length) / s.layout.columns));
}

/** 主格區域（大主格模式才有）與清單區域 */
export function compositionRects(s: LayoutInput): { main: Box | null; grid: Box } {
  const { x, y, width, height } = s.layout;
  const bounds = { x, y, width, height };
  if (!s.mainPanel.enabled) return { main: null, grid: bounds };
  const vertical = s.mainPanel.position === 'top';
  const length = vertical ? height : width;
  const gap = Math.min(s.mainPanel.gap, length * 0.2);
  const mainLength = ((length - gap) * s.mainPanel.size) / 100;
  const gridLength = length - gap - mainLength;
  if (vertical)
    return {
      main: { x, y, width, height: mainLength },
      grid: { x, y: y + mainLength + gap, width, height: gridLength },
    };
  const mainOnLeft = s.mainPanel.position === 'left';
  return {
    main: { x: mainOnLeft ? x : x + gridLength + gap, y, width: mainLength, height },
    grid: { x: mainOnLeft ? x + mainLength + gap : x, y, width: gridLength, height },
  };
}

/** 大格（主格區域裡的 n 格） */
export function mainPanelRects(s: LayoutInput): IndexedBox[] {
  const bounds = compositionRects(s).main;
  if (!bounds) return [];
  const count = s.mainPanel.count;
  const columns = s.mainPanel.columns;
  const rows = Math.ceil(count / columns);
  const gap = Math.min(
    s.mainPanel.slotGap,
    (bounds.width / columns) * 0.35,
    (bounds.height / rows) * 0.35,
  );
  const width = (bounds.width - gap * (columns - 1)) / columns;
  const height = (bounds.height - gap * (rows - 1)) / rows;
  return Array.from({ length: count }, (_, index) => ({
    x: bounds.x + (index % columns) * (width + gap),
    y: bounds.y + Math.floor(index / columns) * (height + gap),
    width,
    height,
    index,
  }));
}

/**
 * 小清單的間距：自動時依區域比例與格數算，手動時用輸入值；兩種都夾在 0～上限（格子不會變成負的）。
 */
export function layoutGap(s: LayoutInput): number {
  const columns = s.layout.columns;
  const rows = effectiveRows(s);
  const { width, height } = compositionRects(s).grid;
  const maximum = Math.max(
    0,
    Math.floor(
      Math.min(
        120,
        columns > 1 ? (width - Math.min(width / 2, columns)) / (columns - 1) : 120,
        rows > 1 ? (height - Math.min(height / 2, rows)) / (rows - 1) : 120,
      ),
    ),
  );
  const automatic = Math.round(
    Math.min(
      (width * 0.09) / (columns + 0.09 * (columns - 1)),
      (height * 0.09) / (rows + 0.09 * (rows - 1)),
    ),
  );
  const v = s.layout.autoGap ? automatic : Number(s.layout.gap) || 0;
  return clamp(v, 0, maximum);
}

/** 畫面上的角色數（格子數與角色數取小） */
export function visibleCount(s: LayoutInput): number {
  return Math.min(s.characters.length, s.layout.columns * effectiveRows(s));
}

/** 小清單的格子（只有畫面上的角色） */
export function tileRects(s: LayoutInput): IndexedBox[] {
  const count = visibleCount(s);
  const columns = Math.max(1, s.layout.columns);
  const rows = effectiveRows(s);
  const gap = s.layout.gap;
  const grid = compositionRects(s).grid;
  const cellWidth = (grid.width - gap * (columns - 1)) / columns;
  const cellHeight = (grid.height - gap * (rows - 1)) / rows;
  const out: IndexedBox[] = [];
  for (let index = 0; index < count; index++) {
    out.push({
      x: grid.x + (index % columns) * (cellWidth + gap),
      y: grid.y + Math.floor(index / columns) * (cellHeight + gap),
      width: cellWidth,
      height: cellHeight,
      index,
    });
  }
  return out;
}

/** 畫布上 (x, y) 的格子（沒有時 −1） */
export function tileAt(s: LayoutInput, x: number, y: number): number {
  return tileRects(s).findIndex(
    (r) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height,
  );
}

/** 等比放大（以中心為準） */
export function scaleBox(r: Box, k: number): Box {
  const width = r.width * k;
  const height = r.height * k;
  return { x: r.x + (r.width - width) / 2, y: r.y + (r.height - height) / 2, width, height };
}

/* ---------- 畫布尺寸與版型（直接改草稿；呼叫端之後要 sanitize） ---------- */

/** 改畫布尺寸：區域依寬高的倍率縮放、圓角依較小的倍率縮放（四捨五入） */
export function resizeCanvas(d: Settings, width: number, height: number): void {
  const pw = d.canvas.width;
  const ph = d.canvas.height;
  d.canvas.width = clamp(Math.round(Number(width) || 960), 240, 4096);
  d.canvas.height = clamp(Math.round(Number(height) || 540), 180, 4096);
  const kx = d.canvas.width / pw;
  const ky = d.canvas.height / ph;
  d.layout.x = Math.round(d.layout.x * kx);
  d.layout.y = Math.round(d.layout.y * ky);
  d.layout.width = Math.round(d.layout.width * kx);
  d.layout.height = Math.round(d.layout.height * ky);
  d.layout.radius = Math.round(d.layout.radius * Math.min(kx, ky));
}

export interface CanvasPreset {
  id: string;
  width: number;
  height: number;
  /** 直式格狀版型的欄、列 */
  grid?: readonly [number, number];
}

/** 畫布版型（規格 F51） */
export const CANVAS_PRESETS: readonly CanvasPreset[] = [
  { id: '16:9', width: 960, height: 540 },
  { id: '1:1', width: 1000, height: 1000 },
  { id: 'blog', width: 1200, height: 630 },
  { id: 'hd', width: 1280, height: 720 },
  { id: 'p8', width: 960, height: 1280, grid: [2, 4] },
  { id: 'p5', width: 720, height: 1280, grid: [1, 5] },
];

/** 套用畫布版型：先縮放，直式格狀版型再套用固定的格狀排列 */
export function applyCanvasPreset(d: Settings, preset: CanvasPreset): void {
  resizeCanvas(d, preset.width, preset.height);
  if (!preset.grid) return;
  d.mainPanel.enabled = false;
  const [columns, rows] = preset.grid;
  const marginX = Math.round(d.canvas.width / 15);
  Object.assign(d.layout, {
    columns,
    rows,
    autoRows: false,
    autoGap: true,
    x: marginX,
    y: 168,
    width: d.canvas.width - marginX * 2,
    height: d.canvas.height - 280,
    radius: 24,
  });
}

export type ShowcaseOrientation = 'portrait' | 'landscape';

/** 主格版型（規格 F36） */
export function applyShowcasePreset(d: Settings, orientation: ShowcaseOrientation): void {
  const portrait = orientation === 'portrait';
  d.canvas = portrait ? { width: 960, height: 1280 } : { width: 1280, height: 720 };
  Object.assign(d.mainPanel, {
    enabled: true,
    position: portrait ? 'top' : 'left',
    size: 62,
    gap: 24,
  });
  Object.assign(d.layout, {
    x: 64,
    y: portrait ? 152 : 128,
    width: portrait ? 832 : 1152,
    height: portrait ? 1020 : 496,
    columns: portrait ? 4 : 2,
    rows: portrait ? 2 : 4,
    autoRows: true,
    autoGap: true,
    radius: 18,
  });
}

/** 目前的設定是否符合某個主格版型（按鈕的按下狀態） */
export function showcaseActive(s: Settings, orientation: ShowcaseOrientation): boolean {
  const portrait = orientation === 'portrait';
  return (
    s.mainPanel.enabled &&
    s.mainPanel.position === (portrait ? 'top' : 'left') &&
    s.canvas.width === (portrait ? 960 : 1280) &&
    s.canvas.height === (portrait ? 1280 : 720)
  );
}

/** 大格的快速排列（數量、欄） */
export const MAIN_GRID_PRESETS = [
  { id: 'one', count: 1, columns: 1 },
  { id: 'row2', count: 2, columns: 2 },
  { id: 'col2', count: 2, columns: 1 },
  { id: 'grid4', count: 4, columns: 2 },
] as const;
