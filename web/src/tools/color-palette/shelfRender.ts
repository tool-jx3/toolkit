/**
 * 色票櫃的 PNG（整櫃存成圖片）與角色的色碼表 PNG（規格 1.1 F55、F49）。版面是本站自己的。
 * 預覽是 DOM（ShelfView），存檔時用這裡的 canvas 畫法；兩倍解析度、最長邊不超過 16000 px。
 */
import { readableTextColor } from '@/core/color';
import { COLOR_FAMILY_LABELS, COLOR_FAMILY_SWATCHES, type ColorFamily } from '@/core/colornames';
import { ensureFont, fontCss } from '@/core/fonts';
import { canvasToBlob, makeCanvas, roundRectPath } from '@/core/image';
import {
  colorLabel,
  dateText,
  groupCharacters,
  isGrouped,
  type PartColor,
  partGroups,
  roleColors,
  sortCharacters,
} from './characters';
import type { Bar, FamilyKey, ShelfSettings } from './logic';
import { type Ctx2D, drawAvatar, drawSwatch, fitText } from './paint';
import { S } from './strings';

export const SHELF_FONT = 'Noto Sans TC';
const font = (weight: number, px: number) => fontCss({ family: SHELF_FONT, weight }, px);

const INK = '#1d1d21';
const MUTED = '#86868e';
const LINE = '#e5e4e8';
const PAPER = '#f4f3f1';
const SURFACE = '#ffffff';

type Bitmaps = ReadonlyMap<string, ImageBitmap>;
const bitmapOf = (bar: Bar, bitmaps: Bitmaps) =>
  bar.image ? (bitmaps.get(bar.image.id) ?? null) : null;

/** 輸出的倍率：兩倍，太大時縮到最長邊 16000 px */
const outScale = (w: number, h: number) => Math.max(1, Math.min(2, 16000 / Math.max(w, h)));

export const familyLabel = (f: FamilyKey | null, role: 'hair' | 'eye'): string =>
  f == null
    ? role === 'hair'
      ? S.familyNoneHair
      : S.familyNoneEye
    : f === 'twotone' || f === 'oddeye' || f === 'other'
      ? S.familyExtra[f]
      : `${COLOR_FAMILY_LABELS[f as ColorFamily]}${S.familySuffix}`;

/** 色系小標前的圓點 */
function drawFamilyDot(ctx: Ctx2D, cx: number, cy: number, r: number, f: FamilyKey | null) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  if (f && f !== 'twotone' && f !== 'oddeye' && f !== 'other') {
    ctx.fillStyle = COLOR_FAMILY_SWATCHES[f];
    ctx.fill();
  } else if (f === 'twotone' || f === 'oddeye') {
    ctx.clip();
    ctx.fillStyle = f === 'twotone' ? '#d94040' : '#3f86e0';
    ctx.fillRect(cx - r, cy - r, r, r * 2);
    ctx.fillStyle = f === 'twotone' ? '#3f86e0' : '#e8b33c';
    ctx.fillRect(cx, cy - r, r, r * 2);
  } else {
    ctx.strokeStyle = MUTED;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 2]);
    ctx.stroke();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

/* ---------- 色票櫃 ---------- */

export const SHELF_PNG = {
  pad: 32,
  head: 92,
  cardW: 120,
  avatar: 84,
  chip: 22,
  chipGap: 6,
  gapX: 12,
  gapY: 14,
  groupHead: 38,
  /** 每列幾位「自動」時：最多 6 位 */
  autoColumns: 6,
} as const;

/** 色塊的清單（髮色、瞳色、代表色；代表色只在「顯示代表色」時） */
export function chipsOf(
  bar: Bar,
  showTheme: boolean,
): { role: 'hair' | 'eye' | 'theme'; colors: PartColor[] }[] {
  const out: { role: 'hair' | 'eye' | 'theme'; colors: PartColor[] }[] = [
    { role: 'hair', colors: roleColors(bar, 'hair') },
    { role: 'eye', colors: roleColors(bar, 'eye') },
  ];
  if (showTheme && bar.theme)
    out.push({ role: 'theme', colors: [{ color: bar.theme, none: false }] });
  return out;
}

export interface ShelfPngPlan {
  width: number;
  height: number;
  columns: number;
}

/** 色票櫃 PNG 的大小（1 倍） */
export function planShelf(bars: readonly Bar[], shelf: ShelfSettings): ShelfPngPlan {
  const P = SHELF_PNG;
  const cols = Math.max(1, shelf.columns || Math.min(P.autoColumns, Math.max(1, bars.length)));
  const sorted = sortCharacters(bars, shelf.sort);
  const groups = groupCharacters(sorted, shelf.sort, shelf.group);
  const grouped = isGrouped(shelf.sort, shelf.group);
  const cardH = cardHeight(shelf.showNames);
  let h = P.head + 16;
  for (const g of groups) {
    const rows = Math.max(1, Math.ceil(g.bars.length / cols));
    h += (grouped ? P.groupHead : 0) + rows * cardH + (rows - 1) * P.gapY + 16;
  }
  h += P.pad;
  const w = P.pad * 2 + 32 + cols * P.cardW + (cols - 1) * P.gapX;
  return { width: Math.max(360, w), height: Math.round(h), columns: cols };
}

const cardHeight = (names: boolean) =>
  12 + SHELF_PNG.avatar + (names ? 30 : 10) + SHELF_PNG.chip + 12;

function drawShelfCard(
  ctx: Ctx2D,
  bar: Bar,
  bitmap: ImageBitmap | null,
  x: number,
  y: number,
  shelf: ShelfSettings,
) {
  const P = SHELF_PNG;
  const cx = x + P.cardW / 2;
  drawAvatar(ctx, bar, bitmap, cx - P.avatar / 2, y + 12, P.avatar);
  let cy = y + 12 + P.avatar;
  if (shelf.showNames) {
    ctx.font = font(500, 13);
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const name = (bar.name ?? '').trim();
    if (name) ctx.fillText(fitText(ctx, name, P.cardW - 8), cx, cy + 15);
    cy += 30;
  } else cy += 10;
  const chips = chipsOf(bar, shelf.showTheme);
  const total = chips.length * P.chip + (chips.length - 1) * P.chipGap;
  chips.forEach((c, k) => {
    const sx = cx - total / 2 + k * (P.chip + P.chipGap);
    drawSwatch(ctx, sx, cy, P.chip, c.colors, c.role === 'theme' ? 6 : null);
  });
}

/** 整櫃存成圖片（PNG） */
export async function renderShelfPng(
  bars: readonly Bar[],
  shelf: ShelfSettings,
  bitmaps: Bitmaps,
  now = new Date(),
): Promise<{ blob: Blob; width: number; height: number }> {
  const names = bars.map((b) => b.name ?? '').join('');
  await Promise.all([
    ensureFont(SHELF_FONT, 700, `${S.shelfPngTitle}0123456789`),
    ensureFont(SHELF_FONT, 500, `${names}${S.shelfPngSub(0, '')}`),
  ]);
  const plan = planShelf(bars, shelf);
  const k = outScale(plan.width, plan.height);
  const c = makeCanvas(Math.round(plan.width * k), Math.round(plan.height * k));
  const ctx = c.getContext('2d') as Ctx2D;
  ctx.scale(k, k);
  drawShelf(ctx, bars, shelf, bitmaps, plan, now);
  return { blob: await canvasToBlob(c), width: c.width, height: c.height };
}

export function drawShelf(
  ctx: Ctx2D,
  bars: readonly Bar[],
  shelf: ShelfSettings,
  bitmaps: Bitmaps,
  plan: ShelfPngPlan,
  now = new Date(),
) {
  const P = SHELF_PNG;
  const { width: W, height: H, columns: cols } = plan;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  /* 標題 */
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(700, 26);
  ctx.fillStyle = INK;
  ctx.fillText(S.shelfPngTitle, P.pad, 58);
  const tw = ctx.measureText(S.shelfPngTitle).width;
  ctx.font = font(500, 13);
  ctx.fillStyle = MUTED;
  ctx.fillText(S.shelfPngSub(bars.length, S.sortLabels[shelf.sort]), P.pad + tw + 12, 57);
  ctx.textAlign = 'right';
  ctx.fillText(dateText(now), W - P.pad, 57);
  /* 面板 */
  const panelY = P.head;
  ctx.save();
  ctx.beginPath();
  roundRectPath(ctx, P.pad, panelY, W - P.pad * 2, H - panelY - P.pad, 18);
  ctx.fillStyle = SURFACE;
  ctx.fill();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  const sorted = sortCharacters(bars, shelf.sort);
  const groups = groupCharacters(sorted, shelf.sort, shelf.group);
  const grouped = isGrouped(shelf.sort, shelf.group);
  const role = shelf.sort === 'eye' ? 'eye' : 'hair';
  const cardH = cardHeight(shelf.showNames);
  const x0 = P.pad + 16;
  let y = panelY + 16;
  for (const g of groups) {
    if (grouped) {
      drawFamilyDot(ctx, x0 + 9, y + 18, 8, g.family);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = font(700, 14);
      ctx.fillStyle = INK;
      const label = familyLabel(g.family, role);
      ctx.fillText(label, x0 + 24, y + 18);
      const lw = ctx.measureText(label).width;
      ctx.font = font(500, 12);
      ctx.fillStyle = MUTED;
      ctx.fillText(String(g.bars.length), x0 + 24 + lw + 8, y + 18);
      y += P.groupHead;
    }
    g.bars.forEach((bar, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      drawShelfCard(
        ctx,
        bar,
        bitmapOf(bar, bitmaps),
        x0 + col * (P.cardW + P.gapX),
        y + row * (cardH + P.gapY),
        shelf,
      );
    });
    const rows = Math.max(1, Math.ceil(g.bars.length / cols));
    y += rows * cardH + (rows - 1) * P.gapY + 16;
  }
}

/* ---------- 色碼表（一位角色） ---------- */

export const CHART_PNG = {
  width: 720,
  pad: 48,
  avatar: 220,
  chip: 96,
  gap: 20,
  xChip: 40,
  xRow: 58,
} as const;

interface ChartRow {
  label: string;
  colors: PartColor[];
}

/** 色碼表的內容：上面三欄（髮色、瞳色、代表色，有的才列），下面是其他部位（色碼＋名稱） */
export function chartContent(bar: Bar): {
  main: ChartRow[];
  others: { color: PartColor; label: string }[];
} {
  const g = partGroups(bar.segments);
  const main: ChartRow[] = [];
  if (g.hair.length)
    main.push({
      label: S.roles.hair,
      colors: g.hair.map((s) => ({ color: s.color, none: !!s.none })),
    });
  if (g.eye.length)
    main.push({
      label: S.roles.eye,
      colors: g.eye.map((s) => ({ color: s.color, none: !!s.none })),
    });
  if (bar.theme) main.push({ label: S.themeColor, colors: [{ color: bar.theme, none: false }] });
  const others = g.other.map((s, i) => ({
    color: { color: s.color, none: !!s.none },
    label: (s.memo ?? '').trim() || (s.role ? S.roles[s.role] : S.partNumber(i + 1)),
  }));
  return { main, others };
}

export function planChart(bar: Bar): { width: number; height: number } {
  const C = CHART_PNG;
  const { main, others } = chartContent(bar);
  const name = (bar.name ?? '').trim();
  const lines = Math.max(1, ...main.map((r) => r.colors.length));
  const mainH = main.length ? C.chip + 12 + 18 + 6 + lines * 21 + 8 : 0;
  const xLines = Math.ceil(others.length / 2);
  let h = C.pad + 8 + C.avatar + 28 + (name ? 40 : 0) + 30 + 16 + mainH;
  if (others.length) h += 24 + 34 + xLines * C.xRow;
  h += 48 + C.pad;
  return { width: C.width, height: Math.round(h) };
}

/** 存成這個角色的色碼表（PNG，兩倍解析度） */
export async function renderChartPng(
  bar: Bar,
  bitmap: ImageBitmap | null,
  now = new Date(),
): Promise<{ blob: Blob; width: number; height: number }> {
  const { main, others } = chartContent(bar);
  const text = `${bar.name ?? ''}${main.map((r) => r.label).join('')}${others.map((o) => o.label).join('')}${S.chartLabel}${S.noneLabel}${S.otherParts}`;
  await Promise.all([
    ensureFont(SHELF_FONT, 700, `${text}#0123456789ABCDEF`),
    ensureFont(SHELF_FONT, 500, `${text}0123456789.`),
  ]);
  const plan = planChart(bar);
  const k = 2;
  const c = makeCanvas(plan.width * k, plan.height * k);
  const ctx = c.getContext('2d') as Ctx2D;
  ctx.scale(k, k);
  drawChart(ctx, bar, bitmap, plan, now);
  return { blob: await canvasToBlob(c), width: c.width, height: c.height };
}

export function drawChart(
  ctx: Ctx2D,
  bar: Bar,
  bitmap: ImageBitmap | null,
  plan: { width: number; height: number },
  now = new Date(),
) {
  const C = CHART_PNG;
  const W = plan.width;
  const H = plan.height;
  const { main, others } = chartContent(bar);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.beginPath();
  roundRectPath(ctx, 20, 20, W - 40, H - 40, 28);
  ctx.fillStyle = SURFACE;
  ctx.fill();
  ctx.restore();
  let y = C.pad + 8;
  const cx = W / 2;
  drawAvatar(ctx, bar, bitmap, cx - C.avatar / 2, y, C.avatar, LINE);
  y += C.avatar + 28;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const name = (bar.name ?? '').trim();
  if (name) {
    ctx.font = font(700, 28);
    ctx.fillStyle = INK;
    ctx.fillText(fitText(ctx, name, W - C.pad * 2), cx, y + 14);
    y += 40;
  }
  ctx.font = font(500, 12);
  ctx.fillStyle = MUTED;
  ctx.fillText(S.chartLabel, cx, y + 6);
  y += 30;
  ctx.beginPath();
  ctx.moveTo(C.pad, y - 8);
  ctx.lineTo(W - C.pad, y - 8);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.stroke();
  y += 16;
  const n = Math.max(1, main.length);
  const colW = (W - C.pad * 2 - C.gap * (n - 1)) / n;
  const chip = Math.min(C.chip, colW - 24);
  const lines = Math.max(1, ...main.map((r) => r.colors.length));
  main.forEach((r, i) => {
    const ccx = C.pad + i * (colW + C.gap) + colW / 2;
    drawSwatch(ctx, ccx - chip / 2, y, chip, r.colors, 18);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = font(500, 13);
    ctx.fillStyle = MUTED;
    ctx.fillText(r.label, ccx, y + chip + 12);
    ctx.font = font(700, 16);
    ctx.fillStyle = INK;
    r.colors.forEach((c, k) => {
      ctx.fillText(colorLabel(c, S.noneLabel), ccx, y + chip + 36 + k * 21);
    });
  });
  if (main.length) y += chip + 12 + 18 + 6 + lines * 21 + 8;
  if (others.length) {
    y += 8;
    ctx.beginPath();
    ctx.moveTo(C.pad, y);
    ctx.lineTo(W - C.pad, y);
    ctx.strokeStyle = LINE;
    ctx.stroke();
    y += 16;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = font(700, 13);
    ctx.fillStyle = MUTED;
    ctx.fillText(S.otherParts, C.pad, y);
    y += 34;
    const xColW = (W - C.pad * 2 - C.gap) / 2;
    others.forEach((o, k) => {
      const ex = C.pad + (k % 2) * (xColW + C.gap);
      const ey = y + Math.floor(k / 2) * C.xRow;
      drawSwatch(ctx, ex, ey, C.xChip, [o.color], 10);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = font(700, 15);
      ctx.fillStyle = INK;
      ctx.fillText(colorLabel(o.color, S.noneLabel), ex + C.xChip + 12, ey + 11);
      ctx.font = font(500, 12.5);
      ctx.fillStyle = MUTED;
      ctx.fillText(fitText(ctx, o.label, xColW - C.xChip - 16), ex + C.xChip + 12, ey + 30);
    });
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(500, 11);
  ctx.fillStyle = MUTED;
  ctx.fillText(`${S.chartLabel} · ${dateText(now)}`, cx, H - C.pad + 4);
}

/** 色塊上的字用黑或白（深淺色的背景都看得清楚） */
export const inkOn = (hex: string) => readableTextColor(hex);
