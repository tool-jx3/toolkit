/**
 * 畫配色卡（預覽、PNG、GIF 共用同一段畫法；規格 1.2、3.8）。版型是本站自己設計的：
 * 米灰的底上一張圓角的卡；標題靠左、右邊是各張的代表色圓點；圓角照片；每格色票是「色塊＋色名＋HEX」；
 * 代表色不在色票裡時色票下面多一列標出來；混色帶是細的漸層條、兩端的 HEX 寫在下面；最後是綜合色。
 * GIF 的動畫：色票一列一列（再來是代表色、混色帶、綜合色）由左往右展開、同時淡入。
 */
import { createEncoder } from '@/core/encode';
import { ensureFont, fontCss } from '@/core/fonts';
import {
  canvasToBlob,
  clampPlacement,
  drawPlacedCrop,
  type FramePlacement,
  makeCanvas,
  roundRectPath,
} from '@/core/image';
import { CARD, type CardLayout, hexOf, type ResolvedColumn, type Rgb } from './card';
import { type CardColumn, type CardSettings, LIMITS } from './logic';
import { type Ctx2D, fitText } from './paint';
import { S } from './strings';

export const CARD_FONT = 'Noto Sans TC';
const font = (weight: number, px: number) => fontCss({ family: CARD_FONT, weight }, px);

const MAT = '#efebe4';
const PAPER = '#fffdf9';
const INK = '#26231f';
const MUTED = '#8a847b';
const EDGE = 'rgba(0,0,0,0.08)';
const EMPTY = '#f3efe8';

type Bitmaps = ReadonlyMap<string, ImageBitmap>;

/** GIF 的某一格：t＝已經出現了幾步（可以有小數：那一步出現到一半） */
export interface CardAnim {
  t: number;
}

export interface CardPaint {
  card: CardSettings;
  columns: readonly CardColumn[];
  layout: CardLayout;
  resolved: readonly ResolvedColumn[];
  names: { swatch: string[][]; blend: string };
  bitmaps: Bitmaps;
}

function rr(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, h, Math.min(r, w / 2, h / 2));
  ctx.closePath();
}

/** 代表色的記號：色塊中央一個白點、外圈深色 */
function keyMark(ctx: Ctx2D, cx: number, cy: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

/** 色塊（圓角方形） */
function chip(ctx: Ctx2D, rgb: Rgb, x: number, y: number, size: number, r: number) {
  rr(ctx, x, y, size, size, r);
  ctx.fillStyle = hexOf(rgb);
  ctx.fill();
  rr(ctx, x + 0.5, y + 0.5, size - 1, size - 1, r);
  ctx.strokeStyle = EDGE;
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** 一格色票：左邊色塊、右邊兩行字（色名、HEX）；不顯示色名時只有 HEX */
function swatchItem(
  ctx: Ctx2D,
  rgb: Rgb,
  x: number,
  y: number,
  w: number,
  name: string,
  isKey: boolean,
) {
  const h = CARD.rowH;
  chip(ctx, rgb, x, y, h, 12);
  if (isKey) keyMark(ctx, x + h / 2, y + h / 2);
  const tx = x + h + 14;
  const room = w - h - 14;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  if (name) {
    ctx.font = font(700, 17);
    ctx.fillStyle = INK;
    ctx.fillText(fitText(ctx, name, room), tx, y + h * 0.33);
    ctx.font = font(400, 14);
    ctx.fillStyle = MUTED;
    ctx.fillText(hexOf(rgb), tx, y + h * 0.71);
  } else {
    ctx.font = font(500, 16);
    ctx.fillStyle = INK;
    ctx.fillText(hexOf(rgb), tx, y + h / 2);
  }
}

/** 色票下面的「代表色」那一列（代表色不在取出的顏色裡時） */
function keyItem(ctx: Ctx2D, rgb: Rgb, x: number, y: number, w: number) {
  const h = CARD.keyH;
  chip(ctx, rgb, x, y, h, 10);
  keyMark(ctx, x + h / 2, y + h / 2);
  const tx = x + h + 14;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = font(500, 13);
  ctx.fillStyle = MUTED;
  ctx.fillText(fitText(ctx, S.cardKeyOffPalette, w - h - 14), tx, y + h * 0.3);
  ctx.font = font(500, 15);
  ctx.fillStyle = INK;
  ctx.fillText(hexOf(rgb), tx, y + h * 0.72);
}

/** 混色帶：細的漸層條，兩端的 HEX 寫在條的下面 */
function mixBar(ctx: Ctx2D, a: Rgb, b: Rgb, x: number, y: number, w: number) {
  const barH = 20;
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, hexOf(a));
  g.addColorStop(1, hexOf(b));
  rr(ctx, x, y, w, barH, barH / 2);
  ctx.fillStyle = g;
  ctx.fill();
  rr(ctx, x + 0.5, y + 0.5, w - 1, barH - 1, barH / 2);
  ctx.strokeStyle = EDGE;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.font = font(400, 13);
  ctx.fillStyle = MUTED;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(hexOf(a), x, y + barH + 13);
  ctx.textAlign = 'right';
  ctx.fillText(hexOf(b), x + w, y + barH + 13);
}

/** 綜合色：大色塊＋「綜合色」、色名、HEX */
function blendItem(ctx: Ctx2D, rgb: Rgb, x: number, y: number, name: string) {
  const h = CARD.blendH;
  chip(ctx, rgb, x, y, h, 16);
  const tx = x + h + 18;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = font(500, 13);
  ctx.fillStyle = MUTED;
  ctx.fillText(S.cardBlend, tx, y + 16);
  if (name) {
    ctx.font = font(700, 22);
    ctx.fillStyle = INK;
    ctx.fillText(name, tx, y + 40);
    const nw = ctx.measureText(name).width;
    ctx.font = font(400, 15);
    ctx.fillStyle = MUTED;
    ctx.fillText(hexOf(rgb), tx + nw + 12, y + 41);
  } else {
    ctx.font = font(500, 18);
    ctx.fillStyle = INK;
    ctx.fillText(hexOf(rgb), tx, y + 41);
  }
}

/** 還沒放照片的框：虛線框與中間的「＋」（預覽上點一下可以選照片） */
function emptyPhoto(ctx: Ctx2D, x: number, y: number, w: number, h: number) {
  rr(ctx, x, y, w, h, CARD.photoR);
  ctx.fillStyle = EMPTY;
  ctx.fill();
  ctx.save();
  rr(ctx, x + 6, y + 6, w - 12, h - 12, CARD.photoR - 6);
  ctx.setLineDash([8, 6]);
  ctx.strokeStyle = '#cbc2b4';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 26, 0, Math.PI * 2);
  ctx.strokeStyle = '#b5ab9c';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 11, cy);
  ctx.lineTo(cx + 11, cy);
  ctx.moveTo(cx, cy - 11);
  ctx.lineTo(cx, cy + 11);
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.lineCap = 'butt';
}

/**
 * 一張照片（拖曳時只重畫這一塊）。placement 不給時用欄的位置；照片比例換過之後舊的位置可能露出照片框，
 * 畫的時候夾回蓋滿的範圍。scale 有給時先設定座標的倍率、而且用較快的縮放（預覽的拖曳重畫用；
 * 放開之後整張卡用高品質重畫）。
 */
export function drawCardPhoto(
  ctx: Ctx2D,
  p: Pick<CardPaint, 'layout' | 'resolved' | 'columns' | 'bitmaps'>,
  i: number,
  placement?: FramePlacement,
  scale?: number,
) {
  const L = p.layout;
  const c = L.cols[i];
  const r = p.resolved[i];
  const col = p.columns[i];
  if (!c || !r || !col) return;
  const bmp = r.image ? (p.bitmaps.get(r.image.id) ?? null) : null;
  const box = { x: c.x, y: L.photoY, width: c.w, height: L.photoH };
  ctx.save();
  if (scale != null) ctx.setTransform(scale, 0, 0, scale, 0, 0);
  if (bmp && r.image) {
    const place = clampPlacement(
      r.image,
      { width: box.width, height: box.height },
      placement ?? col.placement,
      LIMITS.cardZoom,
    );
    rr(ctx, box.x, box.y, box.width, box.height, CARD.photoR);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(box.x, box.y, box.width, box.height);
    drawPlacedCrop(ctx, bmp, r.image, box, place, scale != null ? 'low' : 'high');
    ctx.restore();
    rr(ctx, box.x + 0.5, box.y + 0.5, box.width - 1, box.height - 1, CARD.photoR);
    ctx.strokeStyle = EDGE;
    ctx.lineWidth = 1;
    ctx.stroke();
  } else emptyPhoto(ctx, box.x, box.y, box.width, box.height);
  ctx.restore();
}

/** 畫整張卡（scale：1 倍座標乘上幾倍；anim：GIF 的某一格，null＝全部出現） */
export function drawCard(ctx: Ctx2D, p: CardPaint, scale: number, anim: CardAnim | null = null) {
  const { card, layout: L, resolved, names } = p;
  const contentW = L.right - L.left;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = MAT;
  ctx.fillRect(0, 0, L.width, L.height);
  rr(
    ctx,
    CARD.margin,
    CARD.margin,
    L.width - CARD.margin * 2,
    L.height - CARD.margin * 2,
    CARD.radius,
  );
  ctx.fillStyle = PAPER;
  ctx.fill();

  /** 第 i 步出現了多少（0～1） */
  const shown = (i: number) => (anim ? Math.min(1, Math.max(0, anim.t - i)) : 1);
  /** 出現到一半的那一步：由左往右展開＋淡入 */
  const appear = (i: number, y: number, h: number, draw: () => void) => {
    const v = shown(i);
    if (v <= 0) return;
    if (v >= 1) {
      draw();
      return;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(L.left - 4, y - 4, (contentW + 8) * v, h + 8);
    ctx.clip();
    ctx.globalAlpha = 0.3 + 0.7 * v;
    draw();
    ctx.restore();
  };

  /* 標題（靠左）與右邊各張的代表色圓點 */
  if (L.title) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = font(700, 32);
    ctx.fillStyle = INK;
    const keys = resolved.map((r) => r.key).filter((k): k is Rgb => !!k);
    const dotsW = keys.length ? keys.length * 22 + 12 : 0;
    ctx.fillText(fitText(ctx, card.title.trim(), contentW - dotsW), L.left, L.titleY + 26);
    keys.forEach((k, i) => {
      const cx = L.right - 8 - (keys.length - 1 - i) * 22;
      ctx.beginPath();
      ctx.arc(cx, L.titleY + 26, 8, 0, Math.PI * 2);
      ctx.fillStyle = hexOf(k);
      ctx.fill();
      ctx.strokeStyle = EDGE;
      ctx.lineWidth = 1;
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.moveTo(L.left, L.titleY + 58);
    ctx.lineTo(L.right, L.titleY + 58);
    ctx.strokeStyle = '#e7e1d7';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /* 照片與名字 */
  L.cols.forEach((c, i) => {
    drawCardPhoto(ctx, p, i);
    const r = resolved[i];
    if (r?.name) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = font(500, 20);
      ctx.fillStyle = INK;
      ctx.fillText(fitText(ctx, r.name, c.w - 16), c.x + c.w / 2, L.nameY + CARD.nameH / 2 + 2);
    }
  });

  /* 色票：一列一列；還沒取到色的格子是淺色的空格（GIF 的畫面不畫空格） */
  let step = 0;
  for (let j = 0; j < L.rows; j++) {
    const y = L.rowsY + j * (CARD.rowH + CARD.rowGap);
    if (!anim)
      L.cols.forEach((c, i) => {
        if (resolved[i]?.swatches[j]) return;
        rr(ctx, c.x, y, c.w, CARD.rowH, 12);
        ctx.fillStyle = EMPTY;
        ctx.fill();
      });
    appear(step++, y, CARD.rowH, () => {
      L.cols.forEach((c, i) => {
        const r = resolved[i];
        const s = r?.swatches[j];
        if (!s) return;
        const isKey = r.keyIndex === j;
        const name = card.showNames ? (names.swatch[i]?.[j] ?? '') : '';
        swatchItem(ctx, s.rgb as Rgb, c.x, y, c.w, name, isKey);
      });
    });
  }

  /* 代表色不在色票裡的那幾張：色票下面標出代表色 */
  const keyY = L.keyY;
  if (keyY != null)
    appear(step++, keyY, CARD.keyH, () => {
      L.cols.forEach((c, i) => {
        const r = resolved[i];
        if (r?.key && !r.keyInSwatches) keyItem(ctx, r.key, c.x, keyY, c.w);
      });
    });

  L.mix.forEach(([a, b], k) => {
    const y = L.mixY + k * (CARD.mixH + CARD.mixGap);
    appear(step++, y, CARD.mixH, () => mixBar(ctx, a, b, L.left, y, contentW));
  });

  const blend = L.blend;
  if (blend)
    appear(step++, L.blendY, CARD.blendH, () =>
      blendItem(ctx, blend, L.left, L.blendY, card.showNames ? names.blend : ''),
    );
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
    S.cardKeyOffPalette,
    '#0123456789ABCDEF',
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

/**
 * 每一格的進度與長度：第一格什麼都還沒出現；之後每一步 4 格（展開的進度依 1 −（1 − x）² 加快後放慢），
 * 每一步的最後一格停久一點，全部出現的最後一格停 2 秒。沒有任何步驟時只有一格。
 */
export function gifFrames(steps: number): { anim: CardAnim | null; ms: number }[] {
  const T = GIF_TIMING;
  if (!steps) return [{ anim: null, ms: T.last }];
  const ease = (x: number) => 1 - (1 - x) ** 2;
  const out: { anim: CardAnim | null; ms: number }[] = [{ anim: { t: 0 }, ms: T.first }];
  for (let e = 0; e < steps; e++)
    for (let k = 1; k <= T.subFrames; k++) {
      const end = k === T.subFrames;
      out.push({
        anim: { t: e + ease(k / T.subFrames) },
        ms: end ? (e === steps - 1 ? T.last : T.stepEnd) : T.sub,
      });
    }
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
