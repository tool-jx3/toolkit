/**
 * 素材面板的小圖示（家具、門窗、牆），用「彩色」樣式畫在淺色底上。
 */
import { ASSET } from '../model/assets';
import { OPEN, wallThickness } from '../model/catalog';
import type { OpeningKind, WallKind } from '../model/types';
import type { WallRun } from '../model/walls';
import { FURNITURE_DRAW } from './furniture';
import { drawOpening, drawRun, furnStyle } from './render';
import { THEMES } from './themes';

function prepare(canvas: HTMLCanvasElement, size: number): CanvasRenderingContext2D | null {
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  const c = canvas.getContext('2d');
  if (!c) return null;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, size, size);
  return c;
}

export function drawAssetIcon(canvas: HTMLCanvasElement, id: string, size = 44): void {
  const a = ASSET[id];
  const draw = FURNITURE_DRAW[id];
  const c = prepare(canvas, size);
  if (!a || !draw || !c) return;
  const pad = 4;
  const k = Math.min((size - pad * 2) / a.w, (size - pad * 2) / a.h);
  c.translate((size - a.w * k) / 2, (size - a.h * k) / 2);
  c.scale(k, k);
  const lw = Math.max(1 / 22, 1 / k);
  const S = furnStyle(THEMES.clean, lw);
  c.lineWidth = lw;
  c.strokeStyle = S.ink;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  draw(c, S, a.w, a.h, { label: '1' });
}

export function drawOpeningIcon(canvas: HTMLCanvasElement, kind: OpeningKind, size = 44): void {
  const c = prepare(canvas, size);
  if (!c) return;
  const theme = THEMES.clean;
  const info = OPEN[kind];
  const len = Math.min(info.len, 3.5);
  const k = (size - 6) / (len + 1.4);
  c.translate(3, size * 0.34);
  c.scale(k, k);
  const lw = Math.max(1 / 22, 1 / k);
  const t = info.group === 'window' ? 0.34 : 0.26;
  c.fillStyle = theme.wall;
  c.fillRect(0, -t / 2, 0.7, t);
  c.fillRect(0.7 + len, -t / 2, 0.7, t);
  drawOpening(c, { id: 'icon', kind, o: 'h', x: 0.7, y: 0, len, side: 1, hinge: 0 }, t, theme, lw, {
    playerView: false,
    editor: true,
  });
}

export function drawWallIcon(canvas: HTMLCanvasElement, kind: WallKind, size = 44): void {
  const c = prepare(canvas, size);
  if (!c) return;
  const k = size / 4.4;
  c.translate(0, size / 2);
  c.scale(k, k);
  const run: WallRun = { o: 'h', c: 0, a: 0.6, b: 3.8, kind, capA: false, capB: false };
  const lw = Math.max(1 / 22, 1 / k);
  if (kind === 'rail' || kind === 'fence') {
    /* 細的牆放大一點才看得見 */
    c.save();
    c.scale(1, 1.6);
    drawRun(c, run, THEMES.clean, lw, true);
    c.restore();
    return;
  }
  drawRun(c, { ...run, a: 0.6 + wallThickness(kind) / 2 - 0.0 }, THEMES.clean, lw, true);
}
