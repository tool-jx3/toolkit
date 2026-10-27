/**
 * 截圖（F62～F64，規格 3.9）：月曆、年曆畫成 PNG。用 core/scene 的場景節點畫在畫布上（不擷取網頁畫面），
 * 寬度是設定的截圖寬度、實際輸出 2 倍；背景、顏色與畫面上相同（介面配色時讀頁面的設計 token）。
 */

import { readableTextColor } from '@/core/color';
import { canvasGradient } from '@/core/gradient';
import { dayNumber, holidayOf, weekdayOf } from '@/core/holidays';
import {
  canvasToBlob,
  deviceResolutionLimits,
  limitResolution,
  loadImage,
  makeCanvas,
} from '@/core/image';
import {
  type LinearPaint,
  loadSceneFonts,
  type Paint,
  renderScene,
  type SceneNode,
  type TextFont,
} from '@/core/scene';
import {
  addDays,
  daysInMonth,
  firstOfMonth,
  monthTitle,
  monthWeeks,
  today,
  WEEKDAY_NAMES,
  weekOrder,
  type YearMonth,
  ymOf,
} from './dates';
import { layoutWeek, yearMarks } from './layout';
import {
  IMAGE_TILE_WIDTH,
  type Palette,
  paletteOf,
  patternSvg,
  patternTile,
  svgDataUrl,
} from './look';
import { type CalData, colorSlice, type EntryColor, entryTitle, spanDays } from './model';

const FAMILY = 'Noto Sans TC';
const font = (size: number, weight = 400): TextFont => ({ family: FAMILY, size, weight });

/** 背景圖（圖片背景時的 ImageBitmap） */
export type ShotImage = CanvasImageSource | null;

/** 背景的繪製（整張） */
async function backgroundNode(
  data: CalData,
  w: number,
  h: number,
  pal: Palette,
  image: ShotImage,
): Promise<SceneNode[]> {
  const look = data.look;
  if (look.bg === 'theme') return [{ kind: 'rect', x: 0, y: 0, w, h, fill: pal.base }];
  if (look.bg === 'gradient') {
    const [a, b, c] = look.gradient.colors;
    return [
      {
        kind: 'custom',
        draw: (ctx) => {
          ctx.fillStyle = canvasGradient(
            ctx,
            {
              kind: 'linear',
              angle: look.gradient.angle,
              stops: [
                { offset: 0, color: a },
                { offset: 0.5, color: b },
                { offset: 1, color: c },
              ],
            },
            0,
            0,
            w,
            h,
          );
          ctx.fillRect(0, 0, w, h);
        },
      },
    ];
  }
  if (look.bg === 'pattern') {
    const p = look.pattern;
    const tile = patternTile(p.kind, p.size);
    const svg = await loadImage(svgDataUrl(patternSvg(p.kind, p.color, p.alpha))).catch(() => null);
    const cell = makeCanvas(tile * 2, tile * 2);
    const cctx = cell.getContext('2d') as CanvasRenderingContext2D;
    if (svg) cctx.drawImage(svg, 0, 0, tile * 2, tile * 2);
    return [
      { kind: 'rect', x: 0, y: 0, w, h, fill: p.base },
      {
        kind: 'custom',
        draw: (ctx) => {
          if (!svg) return;
          const pattern = ctx.createPattern(cell as CanvasImageSource, 'repeat');
          if (!pattern) return;
          pattern.setTransform(new DOMMatrix().scale(0.5, 0.5));
          ctx.fillStyle = pattern;
          ctx.fillRect(0, 0, w, h);
        },
      },
    ];
  }
  /* 圖片：鋪滿或並排，上面蓋一層白色 */
  const nodes: SceneNode[] = [{ kind: 'rect', x: 0, y: 0, w, h, fill: '#ffffff' }];
  if (image) {
    if (look.image.fit === 'tile') {
      const iw = (image as { width: number }).width || 1;
      const ih = (image as { height: number }).height || 1;
      const tw = IMAGE_TILE_WIDTH;
      const th = (tw * ih) / iw;
      for (let y = 0; y < h; y += th)
        for (let x = 0; x < w; x += tw)
          nodes.push({ kind: 'image', x, y, w: tw, h: th, image, fit: 'fill' });
    } else nodes.push({ kind: 'image', x: 0, y: 0, w, h, image, fit: 'cover' });
  }
  nodes.push({
    kind: 'rect',
    x: 0,
    y: 0,
    w,
    h,
    fill: `rgba(255,255,255,${look.image.fade / 100})`,
  });
  return nodes;
}

/** 單色或往右的漸層 */
function paint(c: EntryColor, x: number, w: number): Paint {
  if (c.mode !== 'gradient') return c.c1;
  const lp: LinearPaint = {
    linear: {
      x0: x,
      y0: 0,
      x1: x + w,
      y1: 0,
      stops: [
        [0, c.c1],
        [1, c.c2],
      ],
    },
  };
  return lp;
}

function dayColor(date: string, pal: Palette, showHolidays: boolean): string {
  const h = showHolidays ? holidayOf(date) : null;
  if (h && !h.off) return pal.text;
  const w = weekdayOf(date);
  if (w === 0 || h?.off) return pal.holiday;
  if (w === 6) return pal.saturday;
  return pal.text;
}

export interface ShotResult {
  blob: Blob;
  width: number;
  height: number;
}

async function finish(width: number, height: number, nodes: SceneNode[]): Promise<ShotResult> {
  await loadSceneFonts(nodes);
  const scale = limitResolution(2, { width, height }, deviceResolutionLimits());
  const canvas = renderScene({ width, height }, nodes, { scale });
  const blob = await canvasToBlob(canvas, 'image/png');
  return { blob, width: canvas.width, height: canvas.height };
}

/** 標題列：行事曆標題（有填時）＋月份或年份；回傳節點與高度 */
function header(title: string, sub: string, x: number, y: number, w: number, pal: Palette) {
  const nodes: SceneNode[] = [];
  let top = y;
  if (title.trim()) {
    nodes.push({
      kind: 'text',
      x,
      y: top,
      w,
      text: title.trim(),
      font: font(18, 700),
      color: pal.muted,
      shrink: 0.5,
    });
    top += 28;
  }
  nodes.push({
    kind: 'text',
    x,
    y: top,
    w,
    text: sub,
    font: font(28, 700),
    color: pal.text,
    shrink: 0.5,
  });
  top += 44;
  return { nodes, height: top - y };
}

/* ---------- 月曆 ---------- */

export function monthShotLayout(data: CalData, ym: YearMonth, pal: Palette) {
  const W = data.shotWidth;
  const P = Math.round(Math.max(16, W * 0.025));
  const gridW = W - P * 2;
  const colW = gridW / 7;
  const nodes: SceneNode[] = [];
  const head = header(data.title, monthTitle(ym), P, P, gridW, pal);
  nodes.push(...head.nodes);
  let y = P + head.height;
  /* 星期 */
  weekOrder(data.weekStart).forEach((wd, i) => {
    nodes.push({
      kind: 'text',
      x: P + colW * i,
      y,
      w: colW,
      h: 24,
      text: WEEKDAY_NAMES[wd],
      font: font(13, 700),
      color: wd === 0 ? pal.holiday : wd === 6 ? pal.saturday : pal.muted,
      align: 'center',
      valign: 'middle',
    });
  });
  y += 28;
  const t = today();
  const BAR_H = 20;
  const CHIP_H = 18;
  for (const week of monthWeeks(ym, data.weekStart)) {
    const l = layoutWeek(week, data.entries, {
      maxBars: 3,
      maxChips: 3,
      showTasks: data.showTasks,
    });
    const chipRows = Math.max(0, ...l.chips.map((c, i) => c.length + (l.more[i] ? 1 : 0)));
    const rowH = Math.max(86, 30 + l.lanes * (BAR_H + 2) + chipRows * (CHIP_H + 2) + 8);
    week.forEach((date, i) => {
      const x = P + colW * i;
      const other = ymOf(date).month !== ym.month;
      nodes.push({
        kind: 'rect',
        x,
        y,
        w: colW,
        h: rowH,
        fill: pal.card,
        stroke: { color: pal.border, width: 1 },
        opacity: other ? 0.5 : 1,
      });
      const isToday = date === t;
      if (isToday)
        nodes.push({
          kind: 'rect',
          x: x + 4,
          y: y + 4,
          w: 22,
          h: 22,
          circle: true,
          fill: pal.accent,
        });
      nodes.push({
        kind: 'text',
        x: x + 4,
        y: y + 4,
        w: 22,
        h: 22,
        text: String(Number(date.slice(8))),
        font: font(13, 700),
        color: isToday ? readableTextColor(pal.accent) : dayColor(date, pal, data.showHolidays),
        align: 'center',
        valign: 'middle',
        opacity: other ? 0.5 : 1,
      });
      const h = data.showHolidays ? holidayOf(date) : null;
      if (h)
        nodes.push({
          kind: 'group',
          clip: { x: x + 28, y: y + 4, width: colW - 32, height: 22 },
          children: [
            {
              kind: 'text',
              x: x + 28,
              y: y + 4,
              h: 22,
              text: h.name,
              font: font(10, 700),
              color: h.off ? pal.holiday : pal.muted,
              valign: 'middle',
            },
          ],
        });
    });
    for (const seg of l.bars) {
      const bx = P + colW * seg.col + (seg.head ? 2 : 0);
      const bw = colW * seg.span - (seg.head ? 2 : 0) - (seg.tail ? 2 : 0);
      const by = y + 30 + seg.lane * (BAR_H + 2);
      const r = 5;
      const radius: [number, number, number, number] = [
        seg.head ? r : 0,
        seg.tail ? r : 0,
        seg.tail ? r : 0,
        seg.head ? r : 0,
      ];
      const e = seg.entry;
      nodes.push({
        kind: 'rect',
        x: bx,
        y: by,
        w: bw,
        h: BAR_H,
        radius,
        fill: paint(
          colorSlice(
            e.color,
            dayNumber(addDays(week[0], seg.col)) - dayNumber(e.start),
            seg.span,
            spanDays(e),
          ),
          bx,
          bw,
        ),
      });
      nodes.push({
        kind: 'group',
        clip: { x: bx + 4, y: by, width: Math.max(0, bw - 8), height: BAR_H },
        children: [
          {
            kind: 'text',
            x: bx + 5,
            y: by,
            h: BAR_H,
            text: `${e.kind === 'session' && e.startTime && seg.head ? `${e.startTime} ` : ''}${entryTitle(e)}`,
            font: font(11, 700),
            color: readableTextColor(e.color.c1),
            valign: 'middle',
          },
        ],
      });
    }
    week.forEach((_, i) => {
      let cy = y + 30 + l.lanes * (BAR_H + 2);
      const cx = P + colW * i + 3;
      const cw = colW - 6;
      for (const c of l.chips[i]) {
        const e = c.entry;
        if (c.type === 'session') {
          nodes.push({
            kind: 'rect',
            x: cx,
            y: cy,
            w: cw,
            h: CHIP_H,
            radius: 3,
            fill: pal.card,
            stroke: {
              color: pal.border,
              width: 1,
              dash: e.status === 'tentative' ? [3, 2] : undefined,
            },
          });
          nodes.push({
            kind: 'rect',
            x: cx,
            y: cy,
            w: 3,
            h: CHIP_H,
            radius: [3, 0, 0, 3],
            fill: e.color.c1,
          });
        }
        nodes.push({
          kind: 'group',
          clip: { x: cx + 5, y: cy, width: Math.max(0, cw - 7), height: CHIP_H },
          opacity: c.type === 'session' && e.status === 'completed' ? 0.7 : 1,
          children: [
            {
              kind: 'text',
              x: cx + 6,
              y: cy,
              h: CHIP_H,
              text:
                c.type === 'task'
                  ? `${c.task.done ? '☑' : '☐'} ${c.task.title}`
                  : `${e.startTime ? `${e.startTime} ` : ''}${e.status === 'completed' ? '✓ ' : ''}${entryTitle(e)}`,
              font: font(11, c.type === 'task' ? 400 : 500),
              color: c.type === 'task' ? pal.muted : pal.text,
              valign: 'middle',
            },
          ],
        });
        cy += CHIP_H + 2;
      }
      if (l.more[i])
        nodes.push({
          kind: 'text',
          x: cx + 2,
          y: cy,
          h: CHIP_H,
          w: cw,
          text: `另有 ${l.more[i]} 筆`,
          font: font(10),
          color: pal.muted,
          valign: 'middle',
          shrink: 0.6,
        });
    });
    y += rowH;
  }
  return { width: W, height: Math.ceil(y + P), nodes };
}

export async function renderMonthPng(
  data: CalData,
  ym: YearMonth,
  image: ShotImage = null,
): Promise<ShotResult> {
  const pal = paletteOf(data.look);
  const lay = monthShotLayout(data, ym, pal);
  const bg = await backgroundNode(data, lay.width, lay.height, pal, image);
  return finish(lay.width, lay.height, [...bg, ...lay.nodes]);
}

/* ---------- 年曆 ---------- */

export function yearShotLayout(data: CalData, year: number, pal: Palette) {
  const W = data.shotWidth;
  const P = Math.round(Math.max(16, W * 0.025));
  const cols = W >= 960 ? 4 : W >= 640 ? 3 : 2;
  const gap = 12;
  const cardW = (W - P * 2 - gap * (cols - 1)) / cols;
  const cell = (cardW - 16) / 7;
  const cardH = 30 + 16 + cell * 6 + 10;
  const nodes: SceneNode[] = [];
  const head = header(data.title, `${year}年`, P, P, W - P * 2, pal);
  nodes.push(...head.nodes);
  const top = P + head.height;
  const marks = yearMarks(data.entries, year);
  const t = today();
  const order = weekOrder(data.weekStart);
  for (let m = 1; m <= 12; m++) {
    const ci = (m - 1) % cols;
    const ri = Math.floor((m - 1) / cols);
    const x = P + ci * (cardW + gap);
    const y = top + ri * (cardH + gap);
    nodes.push({
      kind: 'rect',
      x,
      y,
      w: cardW,
      h: cardH,
      radius: 6,
      fill: pal.card,
      stroke: { color: pal.border, width: 1 },
    });
    nodes.push({
      kind: 'text',
      x: x + 8,
      y: y + 6,
      h: 22,
      text: `${m}月`,
      font: font(14, 700),
      color: pal.text,
      valign: 'middle',
    });
    order.forEach((wd, i) => {
      nodes.push({
        kind: 'text',
        x: x + 8 + cell * i,
        y: y + 30,
        w: cell,
        h: 14,
        text: WEEKDAY_NAMES[wd],
        font: font(Math.min(10, cell * 0.5), 700),
        color: wd === 0 ? pal.holiday : wd === 6 ? pal.saturday : pal.muted,
        align: 'center',
        valign: 'middle',
      });
    });
    const ym = { year, month: m };
    const first = firstOfMonth(ym);
    const lead = (weekdayOf(first) - data.weekStart + 7) % 7;
    for (let k = 0; k < daysInMonth(ym); k++) {
      const date = addDays(first, k);
      const pos = lead + k;
      const cx = x + 8 + cell * (pos % 7);
      const cy = y + 46 + cell * Math.floor(pos / 7);
      const mark = marks.get(date);
      if (mark) {
        const r = cell / 2;
        nodes.push({
          kind: 'rect',
          x: cx,
          y: cy + 1,
          w: cell,
          h: cell - 2,
          radius: [mark.head ? r : 0, mark.tail ? r : 0, mark.tail ? r : 0, mark.head ? r : 0],
          fill: paint(
            colorSlice(
              mark.entry.color,
              dayNumber(date) - dayNumber(mark.entry.start),
              1,
              spanDays(mark.entry),
            ),
            cx,
            cell,
          ),
        });
      }
      if (date === t)
        nodes.push({
          kind: 'rect',
          x: cx + 1,
          y: cy + 1,
          w: cell - 2,
          h: cell - 2,
          circle: true,
          stroke: { color: pal.accent, width: 1.5 },
        });
      nodes.push({
        kind: 'text',
        x: cx,
        y: cy,
        w: cell,
        h: cell,
        text: String(k + 1),
        font: font(Math.min(11, cell * 0.5), mark ? 700 : 400),
        color: mark
          ? readableTextColor(mark.entry.color.c1)
          : dayColor(date, pal, data.showHolidays),
        align: 'center',
        valign: 'middle',
      });
    }
  }
  const rows = Math.ceil(12 / cols);
  return { width: W, height: Math.ceil(top + rows * cardH + (rows - 1) * gap + P), nodes };
}

export async function renderYearPng(
  data: CalData,
  year: number,
  image: ShotImage = null,
): Promise<ShotResult> {
  const pal = paletteOf(data.look);
  const lay = yearShotLayout(data, year, pal);
  const bg = await backgroundNode(data, lay.width, lay.height, pal, image);
  return finish(lay.width, lay.height, [...bg, ...lay.nodes]);
}

/** 檔名：<標題>_2026年10月.png／<標題>_2026年.png */
export function shotFileName(title: string, ym: YearMonth | number): string {
  const base =
    title
      .trim()
      .replace(/[\\/:*?"<>|]/g, '_')
      .slice(0, 40) || '團期行事曆';
  return typeof ym === 'number' ? `${base}_${ym}年.png` : `${base}_${monthTitle(ym)}.png`;
}
