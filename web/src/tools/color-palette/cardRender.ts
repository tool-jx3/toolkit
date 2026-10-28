/**
 * 畫配色卡（預覽、PNG、GIF 共用同一段畫法；規格 1.2）。版型是本站自己的：暖白的卡、圓角照片、
 * 每一列一個圓角色塊（左邊色名、右邊 HEX）、混色帶、綜合色。
 */
import { readableTextColor } from '@/core/color';
import { createEncoder } from '@/core/encode';
import { ensureFont, fontCss } from '@/core/fonts';
import {
  canvasToBlob,
  clampPlacement,
  drawPlacedCrop,
  makeCanvas,
  roundRectPath,
} from '@/core/image';
import { CARD, type CardLayout, hexOf, type ResolvedColumn, type Rgb } from './card';
import { type CardColumn, type CardSettings, LIMITS } from './logic';
import type { Ctx2D } from './paint';
import { S } from './strings';

export const CARD_FONT = 'Noto Sans TC';
const font = (weight: number, px: number) => fontCss({ family: CARD_FONT, weight }, px);

const PAPER = '#fffdf9';
const INK = '#1f1d1a';
const FRAME = '#ebe7e0';
const EMPTY = '#f3f0ea';

type Bitmaps = ReadonlyMap<string, ImageBitmap>;

export interface CardAnim {
  /** 正在出現的是第幾步（layout.steps 的索引；之前的都已出現、之後的還沒） */
  step: number;
  /** 這一步出現了多少（0～1） */
  p: number;
}

export interface CardPaint {
  card: CardSettings;
  columns: readonly CardColumn[];
  layout: CardLayout;
  resolved: readonly ResolvedColumn[];
  names: { swatch: string[][]; blend: string };
  bitmaps: Bitmaps;
}

const hex = (rgb: readonly number[]) => hexOf(rgb);

function rr(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, h, Math.min(r, w / 2, h / 2));
  ctx.closePath();
}

function spaced(ctx: Ctx2D, px: number) {
  try {
    (ctx as CanvasRenderingContext2D).letterSpacing = `${px}px`;
  } catch {
    /* 不支援字距的瀏覽器照常畫 */
  }
}

/** 一列色塊：圓角矩形，左邊色名、右邊 HEX（不顯示色名時 HEX 置中）；代表色前面一個小圓點 */
function swatchRow(
  ctx: Ctx2D,
  rgb: Rgb,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  isKey: boolean,
) {
  const fill = hex(rgb);
  const fg = readableTextColor(fill);
  ctx.save();
  ctx.shadowColor = 'rgba(40,30,20,0.08)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  rr(ctx, x, y, w, h, CARD.rowR);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
  rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, CARD.rowR);
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();
  const mid = y + h / 2;
  const padX = 22;
  ctx.fillStyle = fg;
  ctx.textBaseline = 'middle';
  let left = x + padX;
  if (isKey) {
    ctx.beginPath();
    ctx.arc(x + 14, mid, 4, 0, Math.PI * 2);
    ctx.fill();
    left = x + 28;
  }
  const hs = Math.max(13, Math.min(18, w * 0.045));
  ctx.font = font(400, hs);
  spaced(ctx, 1);
  if (!name) {
    ctx.textAlign = 'center';
    ctx.fillText(fill, x + w / 2, mid);
    spaced(ctx, 0);
    return;
  }
  ctx.textAlign = 'right';
  ctx.fillText(fill, x + w - padX, mid);
  const hw = ctx.measureText(fill).width;
  spaced(ctx, 0);
  let ns = Math.max(13, Math.min(20, w * 0.05));
  const room = x + w - padX - hw - 20 - left;
  ctx.font = font(500, ns);
  while (ctx.measureText(name).width > room && ns > 10) {
    ns -= 0.5;
    ctx.font = font(500, ns);
  }
  ctx.textAlign = 'left';
  ctx.fillText(name, left, mid);
}

function mixStrip(ctx: Ctx2D, a: Rgb, b: Rgb, x: number, y: number, w: number, h: number) {
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, hex(a));
  g.addColorStop(1, hex(b));
  rr(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = g;
  ctx.fill();
  rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, h / 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.07)';
  ctx.lineWidth = 1;
  ctx.stroke();
  const fs = 15;
  ctx.font = font(400, fs);
  ctx.textBaseline = 'middle';
  spaced(ctx, 1);
  ctx.textAlign = 'left';
  ctx.fillStyle = readableTextColor(hex(a));
  ctx.fillText(hex(a), x + h * 0.5, y + h / 2);
  ctx.textAlign = 'right';
  ctx.fillStyle = readableTextColor(hex(b));
  ctx.fillText(hex(b), x + w - h * 0.5, y + h / 2);
  spaced(ctx, 0);
}

function photo(
  ctx: Ctx2D,
  col: CardColumn,
  r: ResolvedColumn,
  bmp: ImageBitmap | null,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.save();
  ctx.shadowColor = 'rgba(40,30,20,0.14)';
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 12;
  rr(ctx, x, y, w, h, CARD.photoR);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
  ctx.save();
  rr(ctx, x, y, w, h, CARD.photoR);
  ctx.clip();
  if (bmp && r.image) {
    /* 照片比例換過之後，舊的位置可能露出照片框：畫的時候夾回蓋滿的範圍 */
    const p = clampPlacement(r.image, { width: w, height: h }, col.placement, LIMITS.cardZoom);
    drawPlacedCrop(ctx, bmp, r.image, { x, y, width: w, height: h }, p);
  } else {
    ctx.fillStyle = EMPTY;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#c9c3b8';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.beginPath();
    ctx.moveTo(cx - 24, cy);
    ctx.lineTo(cx + 24, cy);
    ctx.moveTo(cx, cy - 24);
    ctx.lineTo(cx, cy + 24);
    ctx.stroke();
  }
  ctx.restore();
  rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, CARD.photoR);
  ctx.strokeStyle = 'rgba(0,0,0,0.07)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** 畫整張卡（scale：1 倍座標乘上幾倍；anim：GIF 的某一格） */
export function drawCard(ctx: Ctx2D, p: CardPaint, scale: number, anim: CardAnim | null = null) {
  const { card, layout: L, resolved, names, bitmaps, columns } = p;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, L.width, L.height);
  /* 內框 */
  rr(ctx, 24.5, 24.5, L.width - 49, L.height - 49, 18);
  ctx.strokeStyle = FRAME;
  ctx.lineWidth = 1;
  ctx.stroke();
  const accent = L.blend ?? resolved.find((c) => c.key)?.key ?? null;

  let step = 0;
  /** 依 GIF 的進度決定這一步畫不畫、畫多少 */
  const reveal = (fn: () => void) => {
    const i = step++;
    const v = !anim || i < anim.step ? 1 : i === anim.step ? anim.p : 0;
    if (v <= 0) return;
    if (v >= 1) {
      fn();
      return;
    }
    ctx.save();
    ctx.globalAlpha = v;
    ctx.translate(0, (1 - v) * 14);
    fn();
    ctx.restore();
  };

  if (L.title) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = font(700, 40);
    spaced(ctx, 4);
    ctx.fillStyle = INK;
    ctx.fillText(card.title.trim(), L.width / 2, L.titleY + 50);
    spaced(ctx, 0);
    rr(ctx, L.width / 2 - 28, L.titleY + 70, 56, 4, 2);
    ctx.fillStyle = accent ? hex(accent) : '#cfc9bf';
    ctx.fill();
  }

  L.cols.forEach((c, i) => {
    const r = resolved[i];
    const col = columns[i];
    if (!r || !col) return;
    const bmp = r.image ? (bitmaps.get(r.image.id) ?? null) : null;
    photo(ctx, col, r, bmp, c.x, L.photoY, c.w, L.photoH);
    if (r.name) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = font(500, 24);
      spaced(ctx, 2);
      ctx.fillStyle = INK;
      ctx.fillText(r.name, c.x + c.w / 2, L.nameY + CARD.nameH / 2 + 4);
      spaced(ctx, 0);
    }
  });

  for (let j = 0; j < L.rows; j++) {
    const y = L.rowsY + j * (CARD.rowH + CARD.rowGap);
    if (!anim)
      L.cols.forEach((c, i) => {
        if (!resolved[i]?.swatches[j]) {
          rr(ctx, c.x, y, c.w, CARD.rowH, CARD.rowR);
          ctx.fillStyle = EMPTY;
          ctx.fill();
        }
      });
    reveal(() => {
      L.cols.forEach((c, i) => {
        const r = resolved[i];
        const s = r?.swatches[j];
        if (!s) return;
        const isKey = !!r.key && hex(r.key) === hex(s.rgb);
        swatchRow(
          ctx,
          s.rgb,
          c.x,
          y,
          c.w,
          CARD.rowH,
          card.showNames ? (names.swatch[i]?.[j] ?? '') : '',
          isKey,
        );
      });
    });
  }

  L.mix.forEach(([a, b], k) => {
    const y = L.mixY + k * (CARD.mixH + CARD.mixGap);
    reveal(() => mixStrip(ctx, a, b, CARD.pad, y, L.width - CARD.pad * 2, CARD.mixH));
  });

  if (L.blend) {
    const b = L.blend;
    reveal(() => {
      const x = CARD.pad;
      const w = L.width - CARD.pad * 2;
      swatchRow(
        ctx,
        b,
        x,
        L.blendY,
        w,
        CARD.blendH,
        card.showNames ? `${S.cardBlend}・${names.blend}` : '',
        false,
      );
    });
  }
  ctx.restore();
}

/** 卡片要用到的字（下載前先載好字型） */
export function cardText(p: Pick<CardPaint, 'card' | 'resolved' | 'names'>): string {
  return [
    p.card.title,
    ...p.resolved.map((r) => r.name),
    ...p.names.swatch.flat(),
    p.names.blend,
    S.cardBlend,
    '#0123456789ABCDEF・',
  ].join('');
}

export async function ensureCardFonts(text: string): Promise<void> {
  await Promise.all([
    ensureFont(CARD_FONT, 700, text),
    ensureFont(CARD_FONT, 500, text),
    ensureFont(CARD_FONT, 400, text),
  ]);
}

/** PNG（兩倍解析度） */
export async function renderCardPng(
  p: CardPaint,
): Promise<{ blob: Blob; width: number; height: number }> {
  await ensureCardFonts(cardText(p));
  const k = 2;
  const c = makeCanvas(p.layout.width * k, p.layout.height * k);
  const ctx = c.getContext('2d') as Ctx2D;
  drawCard(ctx, p, k);
  return { blob: await canvasToBlob(c), width: c.width, height: c.height };
}

/** GIF 的時間（毫秒；本站自訂）：第一格、每一步的中間格、每一步的最後一格、整張出現後停留 */
export const GIF_TIMING = { first: 300, sub: 50, stepEnd: 100, last: 2000, subFrames: 4 } as const;

/** GIF 的大小：寬不超過 gifWidth、高不超過 gifWidth × 1.75（不放大） */
export function gifSize(layout: Pick<CardLayout, 'width' | 'height'>, gifWidth: number) {
  const s = Math.min(1, gifWidth / layout.width, (gifWidth * 1.75) / layout.height);
  return { scale: s, width: Math.round(layout.width * s), height: Math.round(layout.height * s) };
}

/** 每一格的進度與長度（第一格什麼都還沒出現；之後每一步 4 格，由淡入與上浮帶出） */
export function gifFrames(steps: number): { anim: CardAnim | null; ms: number }[] {
  const T = GIF_TIMING;
  const ease = (t: number) => 1 - (1 - t) ** 2;
  const out: { anim: CardAnim | null; ms: number }[] = [{ anim: { step: 0, p: 0 }, ms: T.first }];
  for (let e = 0; e < steps; e++)
    for (let k = 1; k <= T.subFrames; k++) {
      const end = k === T.subFrames;
      out.push({
        anim: end ? { step: e + 1, p: 0 } : { step: e, p: ease(k / T.subFrames) },
        ms: end ? (e === steps - 1 ? T.last : T.stepEnd) : T.sub,
      });
    }
  if (!steps) out[0] = { anim: null, ms: T.last };
  return out;
}

/** GIF：色票一列一列出現（無限循環） */
export async function renderCardGif(
  p: CardPaint,
  { signal, onProgress }: { signal?: AbortSignal; onProgress?: (r: number) => void } = {},
): Promise<{ blob: Blob; width: number; height: number; frames: number }> {
  await ensureCardFonts(cardText(p));
  const size = gifSize(p.layout, p.card.gifWidth);
  const c = makeCanvas(size.width, size.height);
  const ctx = c.getContext('2d', { willReadFrequently: true }) as Ctx2D;
  const frames = gifFrames(p.layout.steps.length);
  const enc = createEncoder({
    format: 'gif',
    options: {
      width: size.width,
      height: size.height,
      fps: 1000,
      variableDelay: true,
      plays: 0,
      /* 整張出現的畫面也算進調色盤的統計（只出現在最後一格的顏色才分得到色） */
      stillWeight: frames.length,
    },
  });
  const stop = () => enc.abort();
  signal?.addEventListener('abort', stop);
  try {
    drawCard(ctx, p, size.scale, null);
    await enc.setStill(ctx.getImageData(0, 0, size.width, size.height).data);
    for (let i = 0; i < frames.length; i++) {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      drawCard(ctx, p, size.scale, frames[i].anim);
      await enc.addFrame(ctx.getImageData(0, 0, size.width, size.height).data, frames[i].ms);
      onProgress?.((i + 1) / frames.length);
    }
    const file = await enc.finish();
    return {
      blob: new Blob([file.bytes as Uint8Array<ArrayBuffer>], { type: 'image/gif' }),
      width: size.width,
      height: size.height,
      frames: frames.length,
    };
  } finally {
    signal?.removeEventListener('abort', stop);
  }
}
