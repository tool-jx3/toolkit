/**
 * 樣式選項的縮圖：用目前的顏色畫一小塊示範的格子（點）、一個角的外框與中心。
 * 預設外觀的縮圖：同一段短網址套上那一組外觀，畫成小圖（data: 網址）。
 */
import {
  buildQrScene,
  cornerDotPath,
  cornerSquarePath,
  dotPath,
  drawQrScene,
  encodeQr,
  paintFill,
  type QrCornerDotType,
  type QrCornerSquareType,
  type QrDotType,
  type QrPaint,
  qrFillStyle,
} from '@/core/qr';
import { backgroundPaint, type DocState, foregroundPaints, initialDoc, toStyle } from './model';
import type { LookPreset } from './presets';

/** 示範用的 6 × 6 格（1＝深色） */
const SAMPLE = [
  [1, 1, 0, 1, 0, 0],
  [1, 0, 0, 1, 1, 0],
  [0, 0, 1, 0, 1, 1],
  [1, 1, 1, 0, 0, 1],
  [0, 1, 0, 0, 1, 1],
  [1, 1, 0, 1, 1, 0],
];

type Ctx = CanvasRenderingContext2D;

function paintBackground(ctx: Ctx, d: DocState, w: number, h: number) {
  const bg = backgroundPaint(d.background);
  if (!bg) return;
  ctx.fillStyle = qrFillStyle(ctx, paintFill(bg, 0, 0, w, h));
  ctx.fillRect(0, 0, w, h);
}

function fill(ctx: Ctx, paint: QrPaint, path: string, rule: CanvasFillRule, w: number, h: number) {
  ctx.fillStyle = qrFillStyle(ctx, paintFill(paint, 0, 0, w, h));
  ctx.fill(new Path2D(path), rule);
}

export function drawDotThumb(ctx: Ctx, d: DocState, type: QrDotType): void {
  const { width: w, height: h } = ctx.canvas;
  paintBackground(ctx, d, w, h);
  const cell = Math.floor(Math.min(w, h) / 7);
  const ox = Math.floor((w - cell * 6) / 2);
  const oy = Math.floor((h - cell * 6) / 2);
  let path = '';
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < 6; c++)
      if (SAMPLE[r][c])
        path += dotPath(
          type,
          ox + c * cell,
          oy + r * cell,
          cell,
          (dx, dy) => !!SAMPLE[r + dy]?.[c + dx],
        );
  fill(ctx, foregroundPaints(d)[0], path, 'nonzero', w, h);
}

export function drawCornerSquareThumb(
  ctx: Ctx,
  d: DocState,
  type: 'none' | QrCornerSquareType,
): void {
  const { width: w, height: h } = ctx.canvas;
  paintBackground(ctx, d, w, h);
  const cell = Math.floor(Math.min(w, h) / 9);
  const ox = Math.floor((w - cell * 7) / 2);
  const oy = Math.floor((h - cell * 7) / 2);
  const [, square, dot] = foregroundPaints(d);
  const sq = cornerSquarePath(type === 'none' ? d.dots.type : type, ox, oy, cell);
  fill(ctx, square, sq.d, sq.rule, w, h);
  const center = cornerDotPath(
    d.cornerDot.type === 'none' ? d.dots.type : d.cornerDot.type,
    ox,
    oy,
    cell,
  );
  fill(ctx, dot, center.d, center.rule, w, h);
}

export function drawCornerDotThumb(ctx: Ctx, d: DocState, type: 'none' | QrCornerDotType): void {
  const { width: w, height: h } = ctx.canvas;
  paintBackground(ctx, d, w, h);
  const cell = Math.floor(Math.min(w, h) / 9);
  const ox = Math.floor((w - cell * 7) / 2);
  const oy = Math.floor((h - cell * 7) / 2);
  const [, square, dot] = foregroundPaints(d);
  /* 外框畫淡一點，看得出中心的形狀 */
  ctx.globalAlpha = 0.35;
  const sqType = d.cornerSquare.type === 'none' ? d.dots.type : d.cornerSquare.type;
  const sq = cornerSquarePath(sqType, ox, oy, cell);
  fill(ctx, square, sq.d, sq.rule, w, h);
  ctx.globalAlpha = 1;
  const center = cornerDotPath(type === 'none' ? d.dots.type : type, ox, oy, cell);
  fill(ctx, dot, center.d, center.rule, w, h);
}

/* ---------- 預設外觀的縮圖 ---------- */

const PREVIEW_TEXT = 'https://example.com/trpg';
const thumbCache = new Map<string, string>();

/** 預設外觀套在示範網址上的小圖（data: 網址；同一組只畫一次） */
export function lookThumb(preset: LookPreset, size = 160): string {
  const hit = thumbCache.get(preset.id);
  if (hit) return hit;
  const r = encodeQr(PREVIEW_TEXT, { ecl: 'M' });
  if (!r.ok || typeof document === 'undefined') return '';
  const doc: DocState = {
    ...initialDoc(),
    ...preset.look,
    width: size,
    height: size,
    margin: preset.look.shape === 'circle' ? 4 : 10,
  };
  const s = buildQrScene(r.code, 'M', toStyle(doc, null));
  if (!s.ok) return '';
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  drawQrScene(ctx, s.scene);
  const url = canvas.toDataURL('image/png');
  thumbCache.set(preset.id, url);
  return url;
}
