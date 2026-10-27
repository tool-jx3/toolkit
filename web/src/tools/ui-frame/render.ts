/**
 * 畫框（規格 3.3～3.7，自訂）：一個框依序畫「陰影或光暈＋框底漸層 → 質感 → 上緣的光澤 → 框線（有窗時窗也描邊） → 內框線 →
 * 四角裝飾 → 大框上下緣的紋章 → 文字」。四種狀態：滑過＝框底變亮、框線變亮、外面一圈光暈；按下＝往下沉、陰影變小、框底變暗；
 * 停用＝彩度拿掉、整體淡一點（文字和框底的對比仍至少 3:1）。
 *
 * 座標一律以 1920 × 1080 為準；輸出 1280 × 720 時呼叫端先把 context 縮放 2/3。陰影、光暈的模糊不跟著 context 縮放，
 * 所以乘上 env.scale。
 */
import { makeCanvas } from '@/core/image';
import {
  type CanvasMaker,
  cornerDiagonalInset,
  cornerRadius,
  drawCrest,
  drawCursorShape,
  drawOrnamentUnit,
  ORNAMENT_REACH,
  textureTile,
  traceFrame,
} from './art';
import { fontCssOf } from './fonts';
import type { Rect } from './layout';
import type { ButtonState, Design, Texture } from './model';
import { type Palette, palette } from './palette';

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface RenderEnv {
  /** 輸出 px ÷ 1920 基準 px（陰影的模糊要乘上它） */
  scale: number;
  /** 建立畫布（質感的圖樣用；Node 測試時用 node-canvas） */
  make?: CanvasMaker;
}

export interface FrameOptions extends Rect {
  design: Design;
  state?: ButtonState;
  label?: string;
  /** 文字大小（1920 基準 px） */
  fontSize?: number;
  /** 文字的對齊（預設置中） */
  align?: 'center' | 'left';
  /** 上下緣中央的紋章（寬 600 以上的大框才畫） */
  crest?: boolean;
  /** 中間透明的窗（畫面外框、角色框） */
  hole?: Rect | null;
  /** 框外可以畫陰影、光暈的空間（PNG 的透明邊）：光暈與陰影的模糊不超過它 */
  room?: number;
  /** 剪裁範圍（PNG 的範圍）：陰影與光暈不畫到這個範圍外（預覽與匯出一致） */
  clip?: Rect | null;
}

/** 停用狀態的整體不透明度 */
export const DISABLED_ALPHA = 0.8;

/* ---------- 質感 ---------- */

const tileCache = new Map<string, HTMLCanvasElement | OffscreenCanvas>();

function texturePattern(
  ctx: Ctx,
  type: Texture,
  tint: string,
  make: CanvasMaker,
): CanvasPattern | null {
  if (type === 'none') return null;
  const key = `${type}|${tint}`;
  let tile = tileCache.get(key);
  if (!tile) {
    if (tileCache.size > 120) tileCache.clear();
    tile = textureTile(type, tint, make);
    tileCache.set(key, tile);
  }
  return ctx.createPattern(tile as CanvasImageSource, 'repeat');
}

/* ---------- 尺寸的調整 ---------- */

/** 小按鈕的角不要太大：最多高度的 4 成 */
export const frameRadius = (d: Design, w: number, h: number): number =>
  cornerRadius(Math.min(d.cornerSize, h * 0.4), w, h);

/** 小按鈕的框線不要太粗：最多高度的 8%（至少 1.5） */
export const frameBorder = (d: Design, h: number): number =>
  Math.min(d.borderWidth, Math.max(1.5, h * 0.08));

/**
 * 四角裝飾的倍率：隨框的高度（0.5～1.25 倍），而且對角的兩個裝飾不會碰在一起；
 * 有窗的框（band＝角落那一圈的寬）裝飾不伸進窗裡。
 */
export function ornamentScaleFor(
  d: Design,
  w: number,
  h: number,
  inset: number,
  band = Number.POSITIVE_INFINITY,
): number {
  if (d.ornament === 'none') return 0;
  const want = (d.ornamentScale / 100) * Math.max(0.5, Math.min(1.25, h / 96));
  const reach = ORNAMENT_REACH[d.ornament];
  const room = (Math.min(w, h) / 2 - 3 - inset) / reach;
  const ring = (band - 3 - inset) / reach;
  return Math.max(0, Math.min(want, room, ring));
}

/** 四角裝飾從框的左右邊往內佔多寬（沒有裝飾時 0）：文字不壓到裝飾 */
export function ornamentExtent(d: Design, w: number, h: number): number {
  if (d.ornament === 'none') return 0;
  const r = frameRadius(d, w, h);
  const inset = cornerDiagonalInset(d.corner, r);
  return inset + ORNAMENT_REACH[d.ornament] * ornamentScaleFor(d, w, h, inset);
}

/** 置中的文字左右要留的距離：裝飾＋8，至少 16 */
export const labelInset = (d: Design, w: number, h: number): number =>
  Math.max(16, Math.ceil(ornamentExtent(d, w, h)) + 8);

/** 一行字放不下時：先縮小字級（最小 70%），還放不下就截斷加「…」 */
export function fitLine(
  measure: (s: string, size: number) => number,
  text: string,
  maxWidth: number,
  size: number,
): { text: string; size: number } {
  const min = Math.max(10, Math.round(size * 0.7));
  const w = measure(text, size);
  if (w <= maxWidth) return { text, size };
  const scaled = Math.max(min, Math.floor((size * maxWidth) / w));
  if (measure(text, scaled) <= maxWidth) return { text, size: scaled };
  let chars = Array.from(text);
  while (chars.length && measure(`${chars.join('')}…`, min) > maxWidth) chars = chars.slice(0, -1);
  return { text: `${chars.join('')}…`, size: min };
}

/* ---------- 一個框 ---------- */

/** 窗的角半徑（比外框小一點） */
const holeRadius = (o: FrameOptions, r: number): number =>
  o.hole ? cornerRadius(r * 0.8, o.hole.w, o.hole.h) : 0;

/** 外框＋窗（evenodd 時窗是空的） */
function traceWithHole(ctx: Ctx, o: FrameOptions, y: number, r: number) {
  traceFrame(ctx, o.x, y, o.w, o.h, o.design.corner, r);
  if (o.hole)
    traceFrame(
      ctx,
      o.hole.x,
      o.hole.y + (y - o.y),
      o.hole.w,
      o.hole.h,
      o.design.corner,
      holeRadius(o, r),
      false,
    );
}

export function drawFrame(ctx: Ctx, o: FrameOptions, env: RenderEnv): void {
  const d = o.design;
  const state = o.state ?? 'normal';
  const pal = palette(d, state);
  const make = env.make ?? makeCanvas;
  const sc = env.scale;
  const y = o.y + (state === 'active' ? d.activeShift : 0);
  const r = frameRadius(d, o.w, o.h);
  const bw = frameBorder(d, o.h);
  const fillRule: CanvasFillRule = o.hole ? 'evenodd' : 'nonzero';

  const room = o.room ?? Number.POSITIVE_INFINITY;

  ctx.save();
  if (o.clip) {
    ctx.beginPath();
    ctx.rect(o.clip.x, o.clip.y, o.clip.w, o.clip.h);
    ctx.clip();
  }
  if (state === 'disabled') ctx.globalAlpha = DISABLED_ALPHA;

  /*
   * 1. 陰影或光暈：只畫在框的外面——剪掉框的內部再畫，所以半透明的框底不會被自己的陰影弄暗，有窗的框窗裡也沒有陰影。
   *    陰影的濃度跟著框底的不透明度；光暈不變。
   */
  ctx.save();
  ctx.beginPath();
  ctx.rect(o.x - 400, y - 400, o.w + 800, o.h + 800);
  traceFrame(ctx, o.x, y, o.w, o.h, d.corner, r, false);
  ctx.clip('evenodd');
  /* 透明邊不夠時縮小模糊（系統按鈕的透明邊只有 12） */
  if (state === 'hover') {
    ctx.shadowColor = pal.glow;
    ctx.shadowBlur = Math.min(d.hoverGlow, room) * sc;
  } else {
    ctx.shadowColor = pal.shadow;
    ctx.globalAlpha *= d.bgOpacity / 100;
    ctx.shadowBlur = Math.min(state === 'active' ? 4 : 14, room * 0.6) * sc;
    ctx.shadowOffsetY = Math.min(state === 'active' ? 1 : 5, room * 0.25) * sc;
  }
  ctx.fillStyle = '#000000';
  traceFrame(ctx, o.x, y, o.w, o.h, d.corner, r);
  ctx.fill();
  ctx.restore();

  /* 框底（上、中、下的漸層；有窗時窗是空的） */
  const g = ctx.createLinearGradient(0, y, 0, y + o.h);
  g.addColorStop(0, pal.panelTop);
  g.addColorStop(0.5, pal.panelMid);
  g.addColorStop(1, pal.panelBottom);
  ctx.fillStyle = g;
  traceWithHole(ctx, o, y, r);
  ctx.fill(fillRule);

  /* 2. 質感與上緣的光澤（剪在框裡） */
  ctx.save();
  traceWithHole(ctx, o, y, r);
  ctx.clip(fillRule);
  const pat = texturePattern(ctx, d.texture, pal.tint, make);
  if (pat) {
    ctx.fillStyle = pat;
    ctx.fillRect(o.x, y, o.w, o.h);
  }
  const sheenH = Math.min(o.h * 0.45, 160);
  const sh = ctx.createLinearGradient(0, y, 0, y + sheenH);
  sh.addColorStop(0, pal.sheen);
  sh.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = sh;
  ctx.fillRect(o.x, y, o.w, sheenH);
  ctx.restore();

  /* 3. 框線（窗也描邊）；滑過時框線也帶一點光 */
  ctx.save();
  ctx.strokeStyle = pal.border;
  ctx.lineWidth = bw;
  ctx.lineJoin = 'round';
  if (state === 'hover') {
    ctx.shadowColor = pal.glow;
    ctx.shadowBlur = Math.min(d.hoverGlow, room) * 0.6 * sc;
  }
  traceFrame(ctx, o.x, y, o.w, o.h, d.corner, r);
  ctx.stroke();
  if (o.hole) {
    traceFrame(ctx, o.hole.x, o.hole.y + (y - o.y), o.hole.w, o.hole.h, d.corner, holeRadius(o, r));
    ctx.stroke();
  }
  ctx.restore();

  /* 4. 內框線 */
  const io = d.innerOffset;
  if (io > 0 && o.w > io * 4 && o.h > io * 4) {
    ctx.save();
    ctx.strokeStyle = pal.inner;
    ctx.lineWidth = 1;
    traceFrame(
      ctx,
      o.x + io,
      y + io,
      o.w - io * 2,
      o.h - io * 2,
      d.corner,
      Math.max(0, r - io * 0.5),
    );
    ctx.stroke();
    ctx.restore();
  }

  /* 5. 四角裝飾 */
  drawCorners(ctx, o, y, r, bw, pal);

  /* 6. 紋章 */
  if (o.crest && o.w > 600 && d.ornament !== 'none') {
    ctx.save();
    ctx.fillStyle = pal.ornament;
    ctx.strokeStyle = pal.ornament;
    const k = (d.ornamentScale / 100) * 0.9;
    drawCrest(ctx, d.ornament, o.x + o.w / 2, y, k);
    drawCrest(ctx, d.ornament, o.x + o.w / 2, y + o.h, k);
    ctx.restore();
  }

  /* 7. 文字 */
  if (o.label) drawLabel(ctx, o, y, pal);
  ctx.restore();
}

function drawCorners(ctx: Ctx, o: FrameOptions, y: number, r: number, bw: number, pal: Palette) {
  const d = o.design;
  if (d.ornament === 'none') return;
  const inset = cornerDiagonalInset(d.corner, r);
  const band = o.hole
    ? Math.min(o.hole.x - o.x, o.hole.y - o.y, o.x + o.w - o.hole.x - o.hole.w)
    : Number.POSITIVE_INFINITY;
  const k = ornamentScaleFor(d, o.w, o.h, inset, band);
  if (k <= 0) return;
  const lw = Math.max(1.3, Math.min(3, bw * 0.75));
  ctx.save();
  ctx.fillStyle = pal.ornament;
  ctx.strokeStyle = pal.ornament;
  const corners: [number, number, number, number][] = [
    [o.x + inset, y + inset, 1, 1],
    [o.x + o.w - inset, y + inset, -1, 1],
    [o.x + inset, y + o.h - inset, 1, -1],
    [o.x + o.w - inset, y + o.h - inset, -1, -1],
  ];
  for (const [cx, cy, sx, sy] of corners) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(sx, sy);
    drawOrnamentUnit(ctx, d.ornament, k, lw);
    ctx.restore();
  }
  ctx.restore();
}

function drawLabel(ctx: Ctx, o: FrameOptions, y: number, pal: Palette) {
  const size = o.fontSize ?? 24;
  const align = o.align ?? 'center';
  const pad = align === 'center' ? labelInset(o.design, o.w, o.h) : 36;
  const tx = align === 'center' ? o.x + o.w / 2 : o.x + pad;
  const ty = y + o.h / 2 + 1;
  drawFittedText(
    ctx,
    o.design,
    pal,
    o.label ?? '',
    tx,
    ty,
    Math.max(20, o.w - pad * 2),
    size,
    align,
  );
}

/** 一行字：放不下時縮小、再截斷（不橫向壓扁） */
function drawFittedText(
  ctx: Ctx,
  design: Design,
  pal: Palette,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  align: 'center' | 'left',
) {
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = align;
  const fit = fitLine(
    (t, sz) => {
      ctx.font = fontCssOf(design.font, sz);
      return ctx.measureText(t).width;
    },
    text,
    maxWidth,
    size,
  );
  ctx.font = fontCssOf(design.font, fit.size);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = pal.textEdge;
  ctx.lineWidth = Math.max(3, fit.size * 0.18);
  ctx.strokeText(fit.text, x, y);
  ctx.fillStyle = pal.text;
  ctx.fillText(fit.text, x, y);
  ctx.restore();
}

/* ---------- 長文字（訊息框、留言板） ---------- */

/** 逐字換行；超過 maxLines 時最後一行加「…」 */
export function wrapLines(
  measure: (s: string) => number,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const ch of Array.from(para)) {
      if (line && measure(line + ch) > maxWidth) {
        lines.push(line);
        line = ch;
      } else line += ch;
    }
    lines.push(line);
  }
  if (lines.length <= maxLines) return lines;
  const out = lines.slice(0, maxLines);
  let last = out[out.length - 1];
  while (last && measure(`${last}…`) > maxWidth) last = Array.from(last).slice(0, -1).join('');
  out[out.length - 1] = `${last}…`;
  return out;
}

export function drawParagraph(
  ctx: Ctx,
  design: Design,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  maxLines: number,
  size: number,
  lineHeight: number,
): void {
  if (!text.trim()) return;
  const pal = palette(design);
  ctx.save();
  ctx.font = fontCssOf(design.font, size);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = pal.textEdge;
  ctx.lineWidth = 3;
  ctx.fillStyle = pal.text;
  const lines = wrapLines((s) => ctx.measureText(s).width, text, maxWidth, maxLines);
  lines.forEach((line, i) => {
    ctx.strokeText(line, x, y + i * lineHeight);
    ctx.fillText(line, x, y + i * lineHeight);
  });
  ctx.restore();
}

/** 置中的一行字（不畫框；角色框的名字） */
export function drawCenteredText(
  ctx: Ctx,
  design: Design,
  text: string,
  cx: number,
  cy: number,
  maxWidth: number,
  size: number,
): void {
  const t = text.replace(/\n/g, ' ');
  if (!t.trim()) return;
  drawFittedText(
    ctx,
    design,
    palette(design),
    t,
    cx,
    cy + 1,
    Math.max(20, maxWidth),
    size,
    'center',
  );
}

/* ---------- 翻頁游標 ---------- */

export function drawCursor(ctx: Ctx, design: Design, cx: number, cy: number): void {
  const pal = palette(design);
  ctx.save();
  ctx.translate(cx, cy);
  drawCursorShape(ctx, design.cursor, pal.ornament, pal.text);
  ctx.restore();
}
