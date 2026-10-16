/**
 * 畫卡片（預覽、PNG 與動畫的底圖都用這一段；規格 3.1）：白底、圓角 6 的卡片與淺灰外框 → 色帶（主題色、三行文字、代表圖）
 * → 圖片格（空格是淺灰）→ 底部操作列（三個圖示＋主題色的驗證按鈕）→ 勾選標示（主題色框線＋左上的勾勾圓）。
 * 座標一律是卡片單位；呼叫端先 scale 好。
 */
import { ensureFont, fontCss } from '@/core/fonts';
import { canvasToBlob, drawPlaced, makeCanvas, type Rect, roundRectPath } from '@/core/image';
import {
  AVATAR,
  BORDER,
  CARD_RADIUS,
  type CardLayout,
  cardLayout,
  ellipsize,
  FOOT,
  HEAD_TEXT,
  type Measure,
  SELECTION,
} from './layout';
import {
  type CaptchaState,
  type CardImage,
  type Cell,
  themeTextColor,
  visibleCells,
} from './model';
import { sampleCanvas } from './samples';

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

/** 卡片的字型：思源黑體（本站的字型模組，只下載用到的字） */
export const CARD_FONT = 'Noto Sans TC';
export const font = (size: number, weight: number): string =>
  fontCss({ family: CARD_FONT, weight }, size);

export const COLORS = {
  cardBorder: '#e3e4e8',
  emptyCell: '#eceef2',
  footLine: '#f0f1f4',
  footIcon: '#9aa0a6',
  avatarEmpty: 'rgba(255, 255, 255, 0.16)',
  avatarBorder: 'rgba(255, 255, 255, 0.25)',
} as const;

/** 圖片來源：範例圖是畫好的畫布；資產是解碼後的圖（還沒讀到時 null，不畫） */
export type ImageResolver = (
  img: CardImage,
) => { source: CanvasImageSource; width: number; height: number } | null;

export function resolverFrom(bitmaps: ReadonlyMap<string, ImageBitmap>): ImageResolver {
  return (img) => {
    if (img.kind === 'sample') {
      const c = sampleCanvas(img.key);
      return { source: c, width: c.width, height: c.height };
    }
    const b = bitmaps.get(img.id);
    return b ? { source: b, width: b.width, height: b.height } : null;
  };
}

/** 用畫布量字 */
export function canvasMeasure(ctx: Ctx): Measure {
  return (text, f) => {
    ctx.save();
    ctx.font = font(f.size, f.weight);
    const w = ctx.measureText(text).width;
    ctx.restore();
    return w;
  };
}

/** 卡片要用的字（載入字型時只下載這些字） */
export function cardText(d: CaptchaState): string {
  return [
    d.prompt,
    d.keyword,
    d.note,
    d.verify,
    d.checkLabel,
    d.errorText,
    d.popup.title,
    d.popup.message,
    d.popup.button,
    '…安全驗證',
  ].join('');
}

/** 字型載好（逾時就用備用字型）；回傳是否都載到 */
export async function loadCardFonts(d: CaptchaState): Promise<boolean> {
  const text = cardText(d);
  const r = await Promise.all(
    [400, 500, 600, 700].map((w) => ensureFont(CARD_FONT, w, text).catch(() => false)),
  );
  return r.every(Boolean);
}

/* ---------- 小零件 ---------- */

function photo(ctx: Ctx, img: CardImage, place: Cell['place'], box: Rect, resolve: ImageResolver) {
  const r = resolve(img);
  if (!r) return;
  drawPlaced(ctx, r.source, { width: r.width, height: r.height }, box, place);
}

/** 勾選標示：主題色框線（圓角 9）＋左上的勾勾圓（白邊、主題色、白色勾） */
export function drawSelection(ctx: Ctx, r: Rect, color: string): void {
  const lw = SELECTION.line;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  roundRectPath(ctx, r.x + lw / 2, r.y + lw / 2, r.width - lw, r.height - lw, SELECTION.radius);
  ctx.stroke();
  drawCheckBadge(
    ctx,
    r.x + SELECTION.badgeInset,
    r.y + SELECTION.badgeInset,
    SELECTION.badge,
    color,
  );
  ctx.restore();
}

export function drawCheckBadge(ctx: Ctx, x: number, y: number, size: number, color: string): void {
  const r = size / 2;
  const cx = x + r;
  const cy = y + r;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r - size * 0.085, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = size * 0.13;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.42, cy + r * 0.02);
  ctx.lineTo(cx - r * 0.08, cy + r * 0.38);
  ctx.lineTo(cx + r * 0.46, cy - r * 0.34);
  ctx.stroke();
  ctx.restore();
}

/** 底部操作列的三個圖示（重新整理、耳機、說明），本站自己畫的線條圖示 */
function footIcons(ctx: Ctx, icons: Rect[]) {
  ctx.save();
  ctx.strokeStyle = COLORS.footIcon;
  ctx.fillStyle = COLORS.footIcon;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  icons.forEach((b, i) => {
    const k = b.width / 24;
    const X = (v: number) => b.x + v * k;
    const Y = (v: number) => b.y + v * k;
    ctx.lineWidth = 2 * k;
    ctx.beginPath();
    if (i === 0) {
      /* 重新整理：缺一角的圓＋箭頭 */
      ctx.arc(X(12), Y(12), 8 * k, -Math.PI * 0.35, Math.PI * 1.45);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(X(19.5), Y(3.5));
      ctx.lineTo(X(19.2), Y(8.6));
      ctx.lineTo(X(14.2), Y(8.2));
      ctx.stroke();
    } else if (i === 1) {
      /* 耳機 */
      ctx.arc(X(12), Y(13), 8 * k, Math.PI, 0);
      ctx.stroke();
      for (const x0 of [3, 17]) {
        ctx.beginPath();
        ctx.roundRect(X(x0), Y(13), 4 * k, 7 * k, 1.5 * k);
        ctx.stroke();
      }
    } else {
      /* 說明：圓圈裡的 i */
      ctx.arc(X(12), Y(12), 9 * k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(X(12), Y(11));
      ctx.lineTo(X(12), Y(16.5));
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(X(12), Y(7.6), 1.15 * k, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.restore();
}

function headText(
  ctx: Ctx,
  text: string,
  box: Rect,
  f: { size: number; weight: number; alpha: number },
  color: string,
) {
  ctx.save();
  ctx.font = font(f.size, f.weight);
  ctx.fillStyle = color;
  ctx.globalAlpha = f.alpha;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const fitted = ellipsize(text, box.width, (s) => ctx.measureText(s).width);
  ctx.fillText(fitted, box.x, box.y + box.height / 2 + 0.5);
  ctx.restore();
}

/* ---------- 整張卡片 ---------- */

export interface DrawCardOptions {
  /** 畫勾選標示（預覽、PNG：是；動畫的底圖：否） */
  selections?: boolean;
}

/** 畫整張卡片（卡片單位；ctx 已經 scale 好） */
export function drawCard(
  ctx: Ctx,
  d: CaptchaState,
  L: CardLayout,
  resolve: ImageResolver,
  { selections = true }: DrawCardOptions = {},
): void {
  const textColor = themeTextColor(d.theme);
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, L.width, L.height);
  ctx.save();
  ctx.beginPath();
  roundRectPath(ctx, 0, 0, L.width, L.height, CARD_RADIUS);
  ctx.clip();

  /* 色帶 */
  ctx.fillStyle = d.theme;
  ctx.fillRect(L.head.x, L.head.y, L.head.width, L.head.height);
  headText(ctx, d.prompt, L.prompt, HEAD_TEXT.prompt, textColor);
  headText(ctx, d.keyword, L.keyword, HEAD_TEXT.keyword, textColor);
  headText(ctx, d.note, L.note, HEAD_TEXT.note, textColor);

  /* 代表圖 */
  const av = L.avatar;
  const avImage = d.avatar.image;
  const avSrc = avImage ? resolve(avImage) : null;
  ctx.save();
  ctx.beginPath();
  roundRectPath(ctx, av.x, av.y, av.width, av.height, AVATAR.radius);
  if (avImage && avSrc) {
    ctx.clip();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(av.x, av.y, av.width, av.height);
    photo(ctx, avImage, d.avatar.place, av, resolve);
  } else {
    ctx.fillStyle = COLORS.avatarEmpty;
    ctx.fill();
    ctx.strokeStyle = COLORS.avatarBorder;
    ctx.lineWidth = AVATAR.border;
    ctx.beginPath();
    const h = AVATAR.border / 2;
    roundRectPath(
      ctx,
      av.x + h,
      av.y + h,
      av.width - AVATAR.border,
      av.height - AVATAR.border,
      AVATAR.radius - h,
    );
    ctx.stroke();
  }
  ctx.restore();

  /* 圖片格 */
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(L.grid.x, L.grid.y, L.grid.width, L.grid.height);
  const cells = visibleCells(d);
  L.cells.forEach((r, i) => {
    const c = cells[i];
    if (c?.image && resolve(c.image)) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.width, r.height);
      ctx.clip();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(r.x, r.y, r.width, r.height);
      photo(ctx, c.image, c.place, r, resolve);
      ctx.restore();
    } else {
      ctx.fillStyle = COLORS.emptyCell;
      ctx.fillRect(r.x, r.y, r.width, r.height);
    }
  });

  /* 底部操作列 */
  if (L.foot && L.verify) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(L.foot.x, L.foot.y, L.foot.width, L.foot.height);
    ctx.fillStyle = COLORS.footLine;
    ctx.fillRect(L.foot.x, L.foot.y, L.foot.width, 1);
    footIcons(ctx, L.icons);
    const v = L.verify;
    ctx.fillStyle = d.theme;
    ctx.beginPath();
    roundRectPath(ctx, v.x, v.y, v.width, v.height, FOOT.button.radius);
    ctx.fill();
    ctx.fillStyle = textColor;
    ctx.font = font(FOOT.button.size, FOOT.button.weight);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.verify, v.x + v.width / 2, v.y + v.height / 2 + 0.5);
  }

  if (selections)
    L.cells.forEach((r, i) => {
      const c = cells[i];
      if (c?.image && c.selected) drawSelection(ctx, r, d.theme);
    });
  ctx.restore();

  /* 外框 */
  ctx.strokeStyle = COLORS.cardBorder;
  ctx.lineWidth = BORDER;
  ctx.beginPath();
  roundRectPath(ctx, 0.5, 0.5, L.width - 1, L.height - 1, CARD_RADIUS - 0.5);
  ctx.stroke();
  ctx.restore();
}

/** 卡片的版面（用這個畫布量字） */
export function layoutFor(ctx: Ctx, d: CaptchaState): CardLayout {
  return cardLayout(d, canvasMeasure(ctx));
}

/** 以倍率 scale 畫好整張卡片的畫布 */
export function renderCardCanvas(
  d: CaptchaState,
  resolve: ImageResolver,
  scale: number,
  options: DrawCardOptions = {},
): { canvas: AnyCanvas; layout: CardLayout } {
  const probe = makeCanvas(1, 1).getContext('2d') as Ctx;
  const layout = layoutFor(probe, d);
  const canvas = makeCanvas(Math.round(layout.width * scale), Math.round(layout.height * scale));
  const ctx = canvas.getContext('2d') as Ctx | null;
  if (!ctx) throw new Error('無法建立畫布');
  ctx.setTransform(canvas.width / layout.width, 0, 0, canvas.height / layout.height, 0, 0);
  drawCard(ctx, d, layout, resolve, options);
  return { canvas, layout };
}

/** PNG（靜態的卡片＋勾選標示）；先等字型 */
export async function renderPng(
  d: CaptchaState,
  resolve: ImageResolver,
  scale: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  await loadCardFonts(d);
  const { canvas } = renderCardCanvas(d, resolve, scale);
  const blob = await canvasToBlob(canvas, 'image/png');
  return { blob, width: canvas.width, height: canvas.height };
}
