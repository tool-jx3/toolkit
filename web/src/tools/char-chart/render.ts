/**
 * 畫四象限與關係圖（預覽與下載同一段程式，規格第 3 節）。選取標示、關係圖上點了第一個人的外圈不在這裡畫
 * （疊在預覽上的操作層）。所有座標都是畫布 px；`scale` 是匯出倍率（整張放大，陰影也跟著放大）。
 */
import { readableTextColor } from '@/core/color';
import { ensureFont, fontCss } from '@/core/fonts';
import { canvasToBlob, makeCanvas } from '@/core/image';
import {
  axisRadius,
  type Character,
  type ChartState,
  imageMarkerSize,
  initialOf,
  type LineStyle,
  labelAnchors,
  mapMembers,
  markerOf,
  QUAD,
  QUAD_COLORS,
  type QuadPage,
  REL,
  REL_COLORS,
  relationLayout,
  type Size,
} from './model';
import { S } from './strings';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type Bitmaps = ReadonlyMap<string, CanvasImageSource>;

/** 畫圖用的字型（思源黑體；載不到時用系統的黑體） */
export const CHART_FONT = 'Noto Sans TC';
const font = (weight: number, px: number) => fontCss({ family: CHART_FONT, weight }, px);

function line(ctx: Ctx2D, x0: number, y0: number, x1: number, y1: number) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/* ---------- 四象限 ---------- */

export const quadSize = (): Size => ({ width: QUAD.size, height: QUAD.size });

/** 軸兩端的箭頭（實心三角形，往外指） */
function axisArrow(ctx: Ctx2D, x: number, y: number, dir: 'left' | 'right' | 'up' | 'down') {
  const h = QUAD.arrow;
  ctx.beginPath();
  ctx.moveTo(x, y);
  if (dir === 'left') {
    ctx.lineTo(x + h, y - h / 2);
    ctx.lineTo(x + h, y + h / 2);
  } else if (dir === 'right') {
    ctx.lineTo(x - h, y - h / 2);
    ctx.lineTo(x - h, y + h / 2);
  } else if (dir === 'up') {
    ctx.lineTo(x - h / 2, y + h);
    ctx.lineTo(x + h / 2, y + h);
  } else {
    ctx.lineTo(x - h / 2, y - h);
    ctx.lineTo(x + h / 2, y - h);
  }
  ctx.fill();
}

export function drawQuadrant(
  ctx: Ctx2D,
  characters: readonly Character[],
  page: QuadPage,
  bitmaps: Bitmaps,
  scale = 1,
): void {
  const W = QUAD.size;
  const H = QUAD.size;
  const cx = W / 2;
  const cy = H / 2;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = QUAD_COLORS.background;
  ctx.fillRect(0, 0, W, H);

  /* 格線：從中心往兩邊每 20 px 一條（中心那條畫兩次） */
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = QUAD_COLORS.grid;
  for (let x = cx; x < W; x += QUAD.grid) line(ctx, x, 0, x, H);
  for (let x = cx; x > 0; x -= QUAD.grid) line(ctx, x, 0, x, H);
  for (let y = cy; y < H; y += QUAD.grid) line(ctx, 0, y, W, y);
  for (let y = cy; y > 0; y -= QUAD.grid) line(ctx, 0, y, W, y);

  /* 兩條軸與四個箭頭 */
  const r = axisRadius(H);
  ctx.lineWidth = 2;
  ctx.strokeStyle = QUAD_COLORS.axis;
  line(ctx, cx - r, cy, cx + r, cy);
  line(ctx, cx, cy - r, cx, cy + r);
  ctx.fillStyle = QUAD_COLORS.axis;
  axisArrow(ctx, cx + r, cy, 'right');
  axisArrow(ctx, cx - r, cy, 'left');
  axisArrow(ctx, cx, cy - r, 'up');
  axisArrow(ctx, cx, cy + r, 'down');

  /* 標題 */
  const a = labelAnchors(H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(700, 24);
  ctx.fillStyle = QUAD_COLORS.title;
  ctx.fillText(page.title, a.title.x, a.title.y);

  /* 四個軸名：白色描邊襯底 */
  ctx.font = font(700, 14);
  ctx.fillStyle = QUAD_COLORS.label;
  ctx.strokeStyle = QUAD_COLORS.labelOutline;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  for (const k of ['top', 'bottom', 'left', 'right'] as const) {
    ctx.strokeText(page.labels[k], a[k].x, a[k].y);
    ctx.fillText(page.labels[k], a[k].x, a[k].y);
  }

  /* 角色（清單後面的畫在上面） */
  for (const c of characters) {
    const pos = page.positions[c.id];
    if (!pos) continue;
    const x = cx + pos.x;
    const y = cy + pos.y;
    const bmp = c.image && markerOf(c) === 'image' ? bitmaps.get(c.image.id) : undefined;
    const img = bmp && c.image ? imageMarkerSize(c.image) : null;
    ctx.save();
    ctx.shadowColor = QUAD_COLORS.shadow;
    ctx.shadowBlur = 4 * scale;
    ctx.shadowOffsetX = 2 * scale;
    ctx.shadowOffsetY = 2 * scale;
    if (bmp && img) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, x - img.width / 2, y - img.height / 2, img.width, img.height);
    } else {
      ctx.fillStyle = c.color;
      ctx.beginPath();
      ctx.arc(x, y, QUAD.dotRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = QUAD_COLORS.dotOutline;
      ctx.stroke();
    }
    ctx.restore();

    if (!c.name) continue;
    ctx.font = font(400, QUAD.nameFont);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const ty = img ? y + img.height / 2 + 5 : y + 12;
    const tw = ctx.measureText(c.name).width;
    ctx.fillStyle = QUAD_COLORS.nameBox;
    ctx.fillRect(x - tw / 2 - 2, ty, tw + 4, QUAD.nameBoxHeight);
    ctx.fillStyle = QUAD_COLORS.name;
    ctx.fillText(c.name, x, ty);
  }
  ctx.restore();
}

/** 四象限用到的字（載入字型時只下載這些字） */
export function quadrantText(
  characters: readonly Character[],
  page: QuadPage,
): {
  bold: string;
  regular: string;
} {
  return {
    bold: [page.title, ...Object.values(page.labels)].join(''),
    regular: characters
      .filter((c) => page.positions[c.id])
      .map((c) => c.name)
      .join(''),
  };
}

/* ---------- 關係圖 ---------- */

/** 實心箭頭（尖端在 (x, y)，往 angle 的方向） */
function arrowHead(ctx: Ctx2D, x: number, y: number, angle: number, color: string) {
  const h = REL.arrowHead;
  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.moveTo(x, y);
  ctx.lineTo(x - h * Math.cos(angle - Math.PI / 6), y - h * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x - h * Math.cos(angle + Math.PI / 6), y - h * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

/** 線的樣式：虛線的線段與間隔（圖例 5、連線 10） */
const dash = (style: LineStyle, len: number): number[] => (style === 'dash' ? [len, len] : []);

/** 關係圖的畫布大小（人多時寬度可能有 0.5 px：畫布取整數、無條件捨去，位置照算） */
export function relationSize(d: ChartState): Size {
  const L = relationLayout(mapMembers(d.characters).map((c) => c.id));
  return { width: Math.floor(L.width), height: Math.floor(L.height) };
}

export function drawRelation(ctx: Ctx2D, d: ChartState, bitmaps: Bitmaps, scale = 1): void {
  const members = mapMembers(d.characters);
  const L = relationLayout(members.map((c) => c.id));
  const nodes = new Map(L.nodes.map((n) => [n.id, n]));
  const rel = d.relation;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = REL_COLORS.background;
  ctx.fillRect(0, 0, L.width, L.height);

  /* 標題（左上） */
  ctx.fillStyle = REL_COLORS.title;
  ctx.font = font(700, REL.titleFont);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(rel.title, REL.titleX, REL.titleY);

  /* 圖例（標題下方） */
  ctx.font = font(700, REL.legendFont);
  ctx.fillStyle = REL_COLORS.legendTitle;
  ctx.fillText(S.canvasLegend, REL.legendX, REL.legendY);
  let y = REL.legendFirst;
  for (const l of rel.legends) {
    ctx.beginPath();
    ctx.strokeStyle = l.color;
    ctx.lineWidth = REL.lineWidth;
    ctx.setLineDash(dash(l.style, 5));
    ctx.moveTo(REL.legendX, y);
    ctx.lineTo(REL.legendX + REL.legendSample, y);
    ctx.stroke();
    if (l.style === 'arrow') arrowHead(ctx, REL.legendX + REL.legendSample, y, 0, l.color);
    ctx.setLineDash([]);
    ctx.fillStyle = REL_COLORS.legendLabel;
    ctx.font = font(400, REL.legendItemFont);
    ctx.textBaseline = 'middle';
    ctx.fillText(l.label, REL.legendX + REL.legendSample + 10, y);
    y += REL.legendStep;
  }

  /* 連線（在頭像下面） */
  for (const link of rel.links) {
    const a = nodes.get(link.from);
    const b = nodes.get(link.to);
    const l = rel.legends.find((x) => x.id === link.legend);
    if (!a || !b || !l) continue;
    ctx.beginPath();
    ctx.strokeStyle = l.color;
    ctx.lineWidth = REL.lineWidth;
    ctx.setLineDash(dash(l.style, 10));
    ctx.moveTo(a.ax, a.ay);
    ctx.lineTo(b.ax, b.ay);
    ctx.stroke();
    ctx.setLineDash([]);
    if (l.style === 'arrow')
      arrowHead(ctx, b.ax, b.ay, Math.atan2(b.ay - a.ay, b.ax - a.ax), l.color);
  }

  /* 頭像：圓形，取圖片中央的正方形；沒有圖片時用角色的顏色與第一個字 */
  const R = REL.nodeRadius;
  for (const c of members) {
    const n = nodes.get(c.id);
    if (!n) continue;
    const bmp = c.image ? bitmaps.get(c.image.id) : undefined;
    ctx.save();
    ctx.beginPath();
    ctx.arc(n.x, n.y, R, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (bmp && c.image) {
      const iw = c.image.width;
      const ih = c.image.height;
      const side = Math.min(iw, ih);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(
        bmp,
        (iw - side) / 2,
        (ih - side) / 2,
        side,
        side,
        n.x - R,
        n.y - R,
        R * 2,
        R * 2,
      );
    } else {
      ctx.fillStyle = c.color;
      ctx.fillRect(n.x - R, n.y - R, R * 2, R * 2);
      const ch = initialOf(c.name);
      if (ch) {
        ctx.fillStyle = readableTextColor(c.color);
        ctx.font = font(700, REL.initialFont);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ch, n.x, n.y);
      }
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(n.x, n.y, R, 0, Math.PI * 2);
    ctx.strokeStyle = REL_COLORS.nodeBorder;
    ctx.lineWidth = 2;
    ctx.stroke();

    if (rel.showNames && c.name) {
      ctx.font = font(700, REL.nameFont);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(c.name).width;
      ctx.fillStyle = REL_COLORS.nameBox;
      ctx.fillRect(
        n.x - tw / 2 - REL.namePad,
        n.y + R + REL.nameGap,
        tw + REL.namePad * 2,
        REL.nameBoxHeight,
      );
      ctx.fillStyle = REL_COLORS.name;
      ctx.fillText(c.name, n.x, n.y + R + REL.nameGap + REL.nameBoxHeight / 2);
    }
  }
  ctx.restore();
}

/** 關係圖用到的字 */
export function relationText(d: ChartState): { bold: string; regular: string } {
  const members = mapMembers(d.characters);
  return {
    bold: [
      d.relation.title,
      S.canvasLegend,
      ...members.map((c) => (d.relation.showNames ? c.name : '') + initialOf(c.name)),
    ].join(''),
    regular: d.relation.legends.map((l) => l.label).join(''),
  };
}

/** 載入畫圖用的字型（只下載用到的字）；回傳是否都載到了 */
export async function ensureChartFonts(text: { bold: string; regular: string }): Promise<boolean> {
  const [b, r] = await Promise.all([
    text.bold.trim() ? ensureFont(CHART_FONT, 700, text.bold) : Promise.resolve(true),
    text.regular.trim() ? ensureFont(CHART_FONT, 400, text.regular) : Promise.resolve(true),
  ]);
  return b && r;
}

/* ---------- 下載 ---------- */

export async function renderQuadrantPng(
  characters: readonly Character[],
  page: QuadPage,
  bitmaps: Bitmaps,
  scale = 1,
): Promise<Blob> {
  await ensureChartFonts(quadrantText(characters, page));
  const canvas = makeCanvas(QUAD.size * scale, QUAD.size * scale);
  const ctx = canvas.getContext('2d') as Ctx2D | null;
  if (!ctx) throw new Error('canvas');
  drawQuadrant(ctx, characters, page, bitmaps, scale);
  return canvasToBlob(canvas);
}

export async function renderRelationPng(d: ChartState, bitmaps: Bitmaps, scale = 1): Promise<Blob> {
  await ensureChartFonts(relationText(d));
  const size = relationSize(d);
  const canvas = makeCanvas(Math.floor(size.width * scale), Math.floor(size.height * scale));
  const ctx = canvas.getContext('2d') as Ctx2D | null;
  if (!ctx) throw new Error('canvas');
  drawRelation(ctx, d, bitmaps, scale);
  return canvasToBlob(canvas);
}
