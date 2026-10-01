/**
 * 立繪身高比較板的作畫：盤面（PanZoomViewport 的 draw／gutter）、基準線的位置與點選、匯出 PNG。
 */
import { FALLBACK_STACK } from '@/core/fonts';
import type { Box } from '@/core/layout';
import { RULER_STYLE, type RulerTickKind, rulerTicks } from '@/core/ruler';
import type { PanZoomView } from '@/ui';
import {
  type Character,
  type ExportLayout,
  exportPoint,
  geometry,
  MAJOR_TICK_CM,
  TICK_CM,
} from './logic';

/** 盤面上畫的一位角色（世界座標的範圍；拖基準線時是凍結的範圍） */
export interface BoardItem {
  c: Character;
  box: Box;
}

export interface BoardScene {
  /** 顯示中的角色，依前後順序（後 → 前） */
  items: readonly BoardItem[];
  /** 刻度的上緣（cm） */
  top: number;
  selectedId: string | null;
  hoverId: string | null;
  /** 正在拖的基準線 */
  dragLine: LineKind | null;
  image: (id: string) => CanvasImageSource | undefined;
}

export type LineKind = 'top' | 'bottom';

/** 盤面上的刻度數字 */
export const RULER_FONT_PX = 11;
/** 左側刻度欄寬（px） */
export const GUTTER_PX = 58;
/** 盤面四周的留白（px）：上下各 14 px */
export const BOARD_PADDING = { top: 14, bottom: 14, left: 0, right: 0 };

const COLORS = {
  background: '#ffffff',
  gutterLine: '#bcbcbc',
  hover: '#8a8f98',
  select: '#2563eb',
  line: '#e53935',
  lineActive: '#9f1d1a',
  tagText: '#ffffff',
};

const UI_FONT = FALLBACK_STACK;

const ticksFor = (top: number, scale: number, fontPx: number) =>
  rulerTicks({
    min: 0,
    max: top,
    step: TICK_CM,
    majorEvery: MAJOR_TICK_CM,
    scale,
    fontPx,
    floor: 0,
  });

/* ---------- 基準線（F16、F17） ---------- */

const TAG = { width: 34, height: 16, gap: 6 };
/** 抓取範圍：線的上下 8 px；水平是線與標籤再加 4 px */
export const LINE_GRAB = { y: 8, x: 4 };

export interface LineHandle {
  kind: LineKind;
  /** 畫布上的位置（CSS px） */
  y: number;
  x0: number;
  x1: number;
  tag: { x: number; y: number; width: number; height: number };
}

/** 選取中角色的兩條線（畫布座標）；標籤在角色左側，放不下時改放右側 */
export function lineHandles(v: PanZoomView, item: BoardItem): LineHandle[] {
  const p = v.toScreen(item.box.x, item.box.y);
  const w = item.box.width * v.scale;
  const h = item.box.height * v.scale;
  const left = p.x - TAG.gap - TAG.width;
  const tagX = left >= 2 ? left : p.x + w + TAG.gap;
  return (['top', 'bottom'] as const).map((kind) => {
    const pct = kind === 'top' ? item.c.top : item.c.bottom;
    const y = p.y + (pct / 100) * h;
    return {
      kind,
      y,
      x0: p.x,
      x1: p.x + w,
      tag: { x: tagX, y: y - TAG.height / 2, width: TAG.width, height: TAG.height },
    };
  });
}

/** 指標（畫布座標）在哪條線的抓取範圍裡；兩條都在時取比較近的 */
export function hitLine(handles: readonly LineHandle[], x: number, y: number): LineHandle | null {
  let best: LineHandle | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const h of handles) {
    const d = Math.abs(y - h.y);
    if (d > LINE_GRAB.y) continue;
    const lo = Math.min(h.x0, h.tag.x) - LINE_GRAB.x;
    const hi = Math.max(h.x1, h.tag.x + h.tag.width) + LINE_GRAB.x;
    if (x < lo || x > hi) continue;
    if (d < bestD) {
      best = h;
      bestD = d;
    }
  }
  return best;
}

/* ---------- 盤面 ---------- */

function strokeH(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number) {
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
}

/** 1 px 線對齊像素 */
const crisp = (y: number, width: number) =>
  Math.round(width) % 2 === 1 ? Math.round(y - 0.5) + 0.5 : Math.round(y);

export function drawBoard(ctx: CanvasRenderingContext2D, v: PanZoomView, scene: BoardScene): void {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, v.width, v.height);
  const x0 = Math.max(0, v.toScreen(v.world.x, 0).x);
  const x1 = Math.min(v.width, v.toScreen(v.world.x + v.world.width, 0).x);

  /* 10 cm 刻度線（在所有角色之下） */
  for (const t of ticksFor(scene.top, v.scale, RULER_FONT_PX)) {
    const style = RULER_STYLE[t.kind];
    ctx.strokeStyle = style.line;
    ctx.lineWidth = style.widthRatio;
    strokeH(ctx, x0, x1, crisp(v.toScreen(0, -t.value).y, style.widthRatio));
  }

  /* 角色（後 → 前） */
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'medium';
  for (const it of scene.items) {
    const img = scene.image(it.c.imageId);
    if (!img) continue;
    const p = v.toScreen(it.box.x, it.box.y);
    const { crop } = it.c;
    ctx.drawImage(
      img,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      p.x,
      p.y,
      it.box.width * v.scale,
      it.box.height * v.scale,
    );
  }

  /* 滑過的角色：在身高的位置畫一條橫貫盤面的灰色虛線 */
  const hov = scene.dragLine ? null : scene.items.find((it) => it.c.id === scene.hoverId);
  if (hov) {
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = COLORS.hover;
    ctx.lineWidth = 1;
    strokeH(ctx, x0, x1, crisp(v.toScreen(0, -hov.c.height).y, 1));
    ctx.setLineDash([]);
  }

  /* 選取中的角色：虛線框＋兩條基準線 */
  const sel = scene.items.find((it) => it.c.id === scene.selectedId);
  if (!sel) return;
  const p = v.toScreen(sel.box.x, sel.box.y);
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = COLORS.select;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(
    Math.round(p.x) - 2.5,
    Math.round(p.y) - 2.5,
    Math.round(sel.box.width * v.scale) + 5,
    Math.round(sel.box.height * v.scale) + 5,
  );
  ctx.setLineDash([]);
  ctx.font = `700 11px ${UI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const h of lineHandles(v, sel)) {
    const active = scene.dragLine === h.kind;
    const color = active ? COLORS.lineActive : COLORS.line;
    ctx.strokeStyle = color;
    ctx.lineWidth = active ? 3 : 1.5;
    strokeH(ctx, h.x0, h.x1, h.y);
    /* 標籤和角色之間的短線 */
    const near = h.tag.x < h.x0 ? h.tag.x + h.tag.width : h.tag.x;
    const edge = h.tag.x < h.x0 ? h.x0 : h.x1;
    ctx.lineWidth = active ? 2 : 1;
    strokeH(ctx, Math.min(near, edge), Math.max(near, edge), h.y);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(h.tag.x, h.tag.y, h.tag.width, h.tag.height, 3);
    ctx.fill();
    ctx.fillStyle = COLORS.tagText;
    ctx.fillText(h.kind === 'top' ? '頭頂' : '腳底', h.tag.x + h.tag.width / 2, h.y + 0.5);
  }
}

/** 左側固定的刻度欄（數字靠右、不帶單位；地面與 50 的倍數較深較粗） */
export function drawRulerGutter(
  ctx: CanvasRenderingContext2D,
  v: PanZoomView,
  top: number,
  width = GUTTER_PX,
): void {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, v.height);
  ctx.strokeStyle = COLORS.gutterLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(width - 0.5, 0);
  ctx.lineTo(width - 0.5, v.height);
  ctx.stroke();
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const t of ticksFor(top, v.scale, RULER_FONT_PX)) {
    const style = RULER_STYLE[t.kind];
    const y = v.toScreen(0, -t.value).y;
    ctx.strokeStyle = style.line === RULER_STYLE.minor.line ? '#cfcfcf' : style.line;
    ctx.lineWidth = style.widthRatio;
    strokeH(ctx, width - 7, width, crisp(y, style.widthRatio));
    if (t.label === null) continue;
    ctx.fillStyle = style.text;
    ctx.font = `${style.weight} ${RULER_FONT_PX}px ${UI_FONT}`;
    ctx.fillText(t.label, width - 10, y);
  }
}

/* ---------- 匯出（3.2） ---------- */

const EXPORT_LINE: Record<RulerTickKind, number> = { zero: 1.6, major: 1.3, minor: 1 };

/**
 * 匯出 PNG 的畫布：白底、左側刻度欄（數字＋短刻度＋縱線）、10 cm 橫線、顯示中的角色（原圖、平滑縮放）。
 * 不含名稱、選取框、基準線等操作標示。
 */
export function renderExport(
  characters: readonly Character[],
  layout: ExportLayout,
  image: (id: string) => CanvasImageSource | undefined,
  fontFamily = UI_FONT,
): HTMLCanvasElement {
  const { width, height, gutter, pxPerCm, fontPx } = layout;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('無法建立畫布');
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);

  const base = Math.max(1, pxPerCm / 5);
  const ticks = ticksFor(layout.top, pxPerCm, fontPx);
  /* 橫線（刻度欄右側整張） */
  for (const t of ticks) {
    const lw = base * EXPORT_LINE[t.kind];
    ctx.strokeStyle = RULER_STYLE[t.kind].line;
    ctx.lineWidth = lw;
    strokeH(ctx, gutter, width, exportPoint(layout, 0, t.value).y);
  }
  /* 刻度欄：縱線、短刻度、數字 */
  ctx.strokeStyle = COLORS.gutterLine;
  ctx.lineWidth = base;
  ctx.beginPath();
  ctx.moveTo(gutter - base / 2, 0);
  ctx.lineTo(gutter - base / 2, height);
  ctx.stroke();
  const tick = Math.max(3, gutter * 0.12);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const t of ticks) {
    const y = exportPoint(layout, 0, t.value).y;
    const style = RULER_STYLE[t.kind];
    ctx.strokeStyle = t.kind === 'minor' ? '#cfcfcf' : style.line;
    ctx.lineWidth = base * EXPORT_LINE[t.kind];
    strokeH(ctx, gutter - tick, gutter, y);
    if (t.label === null) continue;
    ctx.fillStyle = style.text;
    ctx.font = `${style.weight} ${fontPx}px ${fontFamily}`;
    ctx.fillText(t.label, gutter - tick - Math.max(2, gutter * 0.06), y);
  }
  /* 角色（後 → 前，原圖） */
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  for (const c of characters) {
    if (!c.visible) continue;
    const img = image(c.imageId);
    if (!img) throw new Error('圖片還沒讀好');
    const g = geometry(c);
    const p = exportPoint(layout, c.x, g.imageTop);
    ctx.drawImage(
      img,
      c.crop.x,
      c.crop.y,
      c.crop.width,
      c.crop.height,
      p.x,
      p.y,
      g.width * pxPerCm,
      g.box.height * pxPerCm,
    );
  }
  return canvas;
}
