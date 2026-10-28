/**
 * 色票櫃的 PNG（整櫃存成圖片）與角色的色碼表 PNG（規格 1.1 F71、F68；3.6、3.7）。版面是本站自己設計的。
 * 預覽是 DOM（ShelfView），存檔時用這裡的 canvas 畫法；兩倍解析度、最長邊不超過 16000 px。
 */
import { formatHex, parseColor, readableTextColor } from '@/core/color';
import { COLOR_FAMILY_LABELS, COLOR_FAMILY_SWATCHES, type ColorFamily } from '@/core/colornames';
import { ensureFont, fontCss } from '@/core/fonts';
import { canvasToBlob, makeCanvas, roundRectPath } from '@/core/image';
import {
  colorLabel,
  dateText,
  groupCharacters,
  isGrouped,
  keyColorOf,
  type PartColor,
  partGroups,
  roleColors,
  sortCharacters,
} from './characters';
import type { Bar, FamilyKey, Segment, ShelfSettings } from './logic';
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
    /* 沒有名字時和畫面上一樣寫「未命名」（淡一點） */
    ctx.fillStyle = name ? INK : MUTED;
    ctx.fillText(fitText(ctx, name || S.unnamed, P.cardW - 8), cx, cy + 15);
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
    ensureFont(SHELF_FONT, 500, `${names}${S.unnamed}${S.shelfPngSub(0, '')}`),
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

/**
 * 色碼表的版面（本站自己設計的橫式；1 倍，輸出兩倍）：左邊一欄是角色（頭像、名字、「色碼表」、日期，
 * 底色是代表色調淡），右邊一列一列是髮色、瞳色、代表色（每個顏色一個色塊＋色碼，一列放不下就換行），
 * 下面是其他部位（兩欄：色塊、色碼、名稱）。
 */
export const CHART_PNG = {
  width: 960,
  /** 卡片離圖邊 */
  inset: 24,
  radius: 24,
  /** 左邊角色欄的寬 */
  side: 300,
  avatar: 176,
  /** 內容離卡片上緣、右欄左右的留白 */
  top: 56,
  gutter: 40,
  /** 右欄：每列前面的部位名寬、色塊、每個顏色占的寬、行高 */
  label: 76,
  chip: 44,
  item: 150,
  line: 58,
  /** 其他部位：色塊、行高 */
  xChip: 36,
  xLine: 54,
  minHeight: 440,
} as const;

/** 部位的名稱：備註 → 部位名 → 「第 n 段」（n 是整條裡的第幾段；編輯視窗也用這個） */
export function partLabel(bar: Pick<Bar, 'segments'>, seg: Segment): string {
  const memo = (seg.memo ?? '').trim();
  if (memo) return memo;
  if (seg.role) return S.roles[seg.role];
  return S.partNumber(bar.segments.indexOf(seg) + 1);
}

interface ChartRow {
  label: string;
  colors: PartColor[];
}

/** 色碼表的內容：髮色、瞳色、代表色（有的才列）與其他部位（色碼＋名稱） */
export function chartContent(bar: Bar): {
  main: ChartRow[];
  others: { color: PartColor; label: string }[];
} {
  const g = partGroups(bar.segments);
  const toColor = (s: Segment): PartColor => ({ color: s.color, none: !!s.none });
  const main: ChartRow[] = [];
  if (g.hair.length) main.push({ label: S.roles.hair, colors: g.hair.map(toColor) });
  if (g.eye.length) main.push({ label: S.roles.eye, colors: g.eye.map(toColor) });
  if (bar.theme) main.push({ label: S.themeColor, colors: [{ color: bar.theme, none: false }] });
  const others = g.other.map((s) => ({ color: toColor(s), label: partLabel(bar, s) }));
  return { main, others };
}

interface ChartSpot {
  x: number;
  y: number;
  color: PartColor;
  /** 第二行的小字（其他部位的名稱） */
  note?: string;
}

export interface ChartPlan {
  width: number;
  height: number;
  /** 右欄的左右邊界 */
  left: number;
  right: number;
  rows: { label: string; y: number; spots: ChartSpot[] }[];
  /** 列與列之間的分隔線（y） */
  rules: number[];
  othersY: number | null;
  others: ChartSpot[];
}

/** 色碼表的版面：右欄由上往下排，高度取左右兩欄較高的那個 */
export function planChart(bar: Bar): ChartPlan {
  const C = CHART_PNG;
  const { main, others } = chartContent(bar);
  const left = C.inset + C.side + C.gutter;
  const right = C.width - C.inset - C.gutter;
  const perLine = Math.max(1, Math.floor((right - left - C.label) / C.item));
  let y = C.inset + C.top;
  const rows: ChartPlan['rows'] = [];
  const rules: number[] = [];
  main.forEach((r, i) => {
    if (i) {
      rules.push(y - 12);
      y += 8;
    }
    const spots = r.colors.map((color, k) => ({
      x: left + C.label + (k % perLine) * C.item,
      y: y + Math.floor(k / perLine) * C.line,
      color,
    }));
    rows.push({ label: r.label, y, spots });
    y += Math.ceil(r.colors.length / perLine) * C.line + 12;
  });
  let othersY: number | null = null;
  const placed: ChartSpot[] = [];
  if (others.length) {
    if (rows.length) rules.push(y - 12);
    othersY = y + 8;
    y = othersY + 30;
    const colW = (right - left) / 2;
    others.forEach((o, k) => {
      placed.push({
        x: left + (k % 2) * colW,
        y: y + Math.floor(k / 2) * C.xLine,
        color: o.color,
        note: o.label,
      });
    });
    y += Math.ceil(others.length / 2) * C.xLine;
  }
  if (!rows.length && !others.length) y += C.line;
  const height = Math.max(C.minHeight, Math.round(y + C.top + C.inset));
  return { width: C.width, height, left, right, rows, rules, othersY, others: placed };
}

/** 存成這個角色的色碼表（PNG，兩倍解析度） */
export async function renderChartPng(
  bar: Bar,
  bitmap: ImageBitmap | null,
  now = new Date(),
): Promise<{ blob: Blob; width: number; height: number }> {
  const { main, others } = chartContent(bar);
  const text = `${bar.name ?? ''}${S.unnamed}${main.map((r) => r.label).join('')}${others.map((o) => o.label).join('')}${S.chartLabel}${S.noneLabel}${S.otherParts}`;
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

/** 左欄的底色：角色的代表色（沒有時髮色）調得很淡；都沒有時淺灰 */
function sideTint(bar: Bar): string {
  const key = keyColorOf(bar);
  const c = key ? parseColor(key) : null;
  if (!c) return '#f0efec';
  const mix = (v: number) => v + (255 - v) * 0.86;
  return formatHex({ r: mix(c.r), g: mix(c.g), b: mix(c.b), a: 1 }, false);
}

export function drawChart(
  ctx: Ctx2D,
  bar: Bar,
  bitmap: ImageBitmap | null,
  plan: ChartPlan,
  now = new Date(),
) {
  const C = CHART_PNG;
  const { width: W, height: H } = plan;
  const cardW = W - C.inset * 2;
  const cardH = H - C.inset * 2;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  /* 卡片與左欄 */
  ctx.save();
  ctx.beginPath();
  roundRectPath(ctx, C.inset, C.inset, cardW, cardH, C.radius);
  ctx.fillStyle = SURFACE;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = sideTint(bar);
  ctx.fillRect(C.inset, C.inset, C.side, cardH);
  ctx.restore();
  /* 左欄：頭像、名字、「色碼表」、日期 */
  const sx = C.inset + C.side / 2;
  const ay = C.inset + C.top;
  drawAvatar(ctx, bar, bitmap, sx - C.avatar / 2, ay, C.avatar, 'rgba(0,0,0,0.16)');
  const name = (bar.name ?? '').trim();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(700, 24);
  ctx.fillStyle = name ? INK : MUTED;
  ctx.fillText(fitText(ctx, name || S.unnamed, C.side - 48), sx, ay + C.avatar + 36);
  ctx.font = font(500, 13);
  ctx.fillStyle = MUTED;
  ctx.fillText(S.chartLabel, sx, ay + C.avatar + 66);
  ctx.font = font(500, 12);
  ctx.fillText(dateText(now), sx, H - C.inset - 32);
  /* 右欄：髮色、瞳色、代表色 */
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  for (const y of plan.rules) {
    ctx.beginPath();
    ctx.moveTo(plan.left, y);
    ctx.lineTo(plan.right, y);
    ctx.stroke();
  }
  for (const row of plan.rows) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = font(700, 15);
    ctx.fillStyle = INK;
    ctx.fillText(row.label, plan.left, row.y + C.chip / 2);
    for (const spot of row.spots) {
      drawSwatch(ctx, spot.x, spot.y, C.chip, [spot.color], 12);
      ctx.font = font(700, 15);
      ctx.fillStyle = spot.color.none ? MUTED : INK;
      ctx.fillText(colorLabel(spot.color, S.noneLabel), spot.x + C.chip + 12, spot.y + C.chip / 2);
    }
  }
  /* 其他部位 */
  if (plan.othersY != null) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = font(700, 13);
    ctx.fillStyle = MUTED;
    ctx.fillText(S.otherParts, plan.left, plan.othersY + 8);
    const colW = (plan.right - plan.left) / 2;
    for (const spot of plan.others) {
      drawSwatch(ctx, spot.x, spot.y, C.xChip, [spot.color], 10);
      const tx = spot.x + C.xChip + 12;
      ctx.font = font(700, 14);
      ctx.fillStyle = spot.color.none ? MUTED : INK;
      ctx.fillText(colorLabel(spot.color, S.noneLabel), tx, spot.y + 10);
      ctx.font = font(500, 12);
      ctx.fillStyle = MUTED;
      ctx.fillText(fitText(ctx, spot.note ?? '', colW - C.xChip - 24), tx, spot.y + 28);
    }
  }
}

/** 色塊上的字用黑或白（深淺色的背景都看得清楚） */
export const inkOn = (hex: string) => readableTextColor(hex);
