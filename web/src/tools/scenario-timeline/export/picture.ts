/**
 * 匯出的圖（規格 F70～F73、3.8）：從看得到的資料（visibleDoc）、時間範圍與寬度算出一份「畫面描述」（矩形、線、圓、文字、剪裁），
 * 同一份描述畫成 PNG（canvas）或寫成 SVG，兩種輸出的版面完全相同。排版（列、堆疊、刻度、旗子）和互動的時間軸共用。
 */
import { contrastRatio } from '@/core/color';
import { axisTicks } from '../model/axis';
import {
  collectFlags,
  FLAG_GAP,
  FLAG_H,
  FLAG_PAD,
  flagRowHeight,
  placeFlags,
} from '../model/flags';
import {
  eventSpan,
  INSIDE_PAD,
  ITEM_H,
  LABEL_GAP,
  layoutTimeline,
  MIN_BAR,
  POINT_R,
  type Span,
} from '../model/layout';
import { ellipsize, type TextMeasure } from '../model/measure';
import { eventColor, GM_COLOR } from '../model/types';
import { usedCategories, type VisibleDoc } from '../model/visible';

export type Prim =
  | {
      t: 'rect';
      x: number;
      y: number;
      w: number;
      h: number;
      r?: number;
      fill?: string;
      stroke?: string;
      sw?: number;
      dash?: number[];
      opacity?: number;
    }
  | {
      t: 'line';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      stroke: string;
      sw: number;
      dash?: number[];
      opacity?: number;
    }
  | { t: 'circle'; cx: number; cy: number; r: number; fill: string; stroke?: string; sw?: number }
  | { t: 'poly'; points: [number, number][]; fill: string }
  | {
      t: 'text';
      x: number;
      /** 基線 */
      y: number;
      text: string;
      size: number;
      weight: number;
      fill: string;
      anchor?: 'start' | 'middle' | 'end';
    }
  | { t: 'clip'; x: number; y: number; w: number; h: number; r?: number; children: Prim[] };

export interface Picture {
  width: number;
  height: number;
  background: string;
  title: string;
  prims: Prim[];
}

export type Theme = 'light' | 'dark';

export interface Palette {
  bg: string;
  surface: string;
  grid: string;
  gridMajor: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
}

export const PALETTES: Record<Theme, Palette> = {
  light: {
    bg: '#ffffff',
    surface: '#f3f4f6',
    grid: '#e5e7eb',
    gridMajor: '#cbd5e1',
    text: '#1f2937',
    muted: '#6b7280',
    border: '#d1d5db',
    accent: '#6a4c9c',
  },
  dark: {
    bg: '#111827',
    surface: '#1a2233',
    grid: '#273244',
    gridMajor: '#3b4a61',
    text: '#e5e7eb',
    muted: '#9ca3af',
    border: '#374151',
    accent: '#b79ce0',
  },
};

export interface PictureMeasures {
  /** 事件標題 12 px */
  item: TextMeasure;
  /** 刻度、小字 11 px */
  small: TextMeasure;
  /** 泳道名稱 12 px 粗 */
  lane: TextMeasure;
  /** 標題 18 px 粗 */
  title: TextMeasure;
}

export interface PictureInput {
  vdoc: VisibleDoc;
  range: Span;
  width: number;
  title: boolean;
  legend: boolean;
  theme: Theme;
  collapsed: Readonly<Record<string, boolean>>;
  measures: PictureMeasures;
  strings: {
    untitled: string;
    main: string;
    fallbackTitle: string;
    gmUse: string;
    progress: string;
    now: string;
    rangeText: string;
  };
  nowV: number | null;
}

export const TITLE_H = 52;
export const AXIS_ROW = 24;
export const LEGEND_ROW = 28;
export const BOTTOM_PAD = 12;
export const LANE_INDENT = 14;

/** 泳道名稱欄的寬：最長的名稱＋28 px（GM 用多留 GM 小標），120～240 px */
export function laneColumnWidth(
  vdoc: VisibleDoc,
  M: Pick<PictureMeasures, 'lane'>,
  main: string,
  untitled: string,
): number {
  const names = [main, ...vdoc.lanes.map((l) => l.name.trim() || untitled)];
  const maxName = Math.max(0, ...names.map((n) => M.lane(n)));
  const gm = vdoc.audience === 'gm';
  return Math.round(Math.min(240, Math.max(120, maxName + 28 + (gm ? 26 : 0))));
}

/** 色條上的字：白或深灰，對比高的那一個 */
export function barTextColor(color: string): string {
  return contrastRatio('#ffffff', color) >= contrastRatio('#1f2937', color) ? '#ffffff' : '#1f2937';
}

/** 斜線（GM 專用）：135°、每 9 px 一條、寬 3 px，剪在範圍裡 */
function stripes(x: number, y: number, w: number, h: number, r = 0): Prim {
  const lines: Prim[] = [];
  for (let s = -h; s < w + h; s += 9)
    lines.push({
      t: 'line',
      x1: x + s,
      y1: y + h,
      x2: x + s + h,
      y2: y,
      stroke: GM_COLOR,
      sw: 3,
      opacity: 0.22,
    });
  return { t: 'clip', x, y, w, h, r, children: lines };
}

function gmBadge(x: number, y: number): Prim[] {
  return [
    { t: 'rect', x, y, w: 20, h: 12, r: 3, fill: GM_COLOR },
    {
      t: 'text',
      x: x + 10,
      y: y + 9.5,
      text: 'GM',
      size: 8,
      weight: 700,
      fill: '#2b1f06',
      anchor: 'middle',
    },
  ];
}

function noteMark(x: number, y: number): Prim {
  return {
    t: 'poly',
    points: [
      [x - 8, y],
      [x, y],
      [x, y + 8],
    ],
    fill: GM_COLOR,
  };
}

/** 算出整張圖 */
export function buildPicture(input: PictureInput): Picture {
  const { range, measures: M, strings: S, theme } = input;
  /* 只畫範圍裡的事件（堆疊與圖例也只算它們） */
  const vdoc: VisibleDoc = {
    ...input.vdoc,
    events: input.vdoc.events.filter((e) => {
      const s = eventSpan(input.vdoc.mode, e, input.vdoc.era);
      return !!s && s.b >= range.a && s.a <= range.b;
    }),
  };
  const pal = PALETTES[theme];
  const gm = vdoc.audience === 'gm';
  const prims: Prim[] = [];
  const W = Math.max(200, Math.round(input.width));

  /* 泳道名稱欄 */
  const LW = laneColumnWidth(vdoc, M, S.main, S.untitled);
  const trackW = Math.max(40, W - LW);
  const span = Math.max(1e-9, range.b - range.a);
  const k = trackW / span;
  const xOf = (v: number) => LW + (v - range.a) * k;

  const layout = layoutTimeline(vdoc, {
    k,
    measure: M.item,
    collapsed: input.collapsed,
    untitled: S.untitled,
  });
  const ticks = axisTicks(vdoc.mode, range.a, range.b, k, M.small);
  const flags = placeFlags(
    collectFlags(vdoc, { progress: S.progress, now: S.now }, input.nowV),
    xOf,
    M.small,
  );

  const titleH = input.title ? TITLE_H : 0;
  const axisTop = titleH;
  const flagTop = axisTop + AXIS_ROW * 2;
  const flagH = flagRowHeight(flags.levels);
  const lanesTop = flagTop + flagH;
  const lanesH = layout.height;
  const lanesBottom = lanesTop + lanesH;

  /* 圖例 */
  const cats = input.legend ? usedCategories(vdoc) : [];
  const legendItems: { x: number; y: number; name: string; color: string }[] = [];
  let legendH = 0;
  if (cats.length) {
    let lx = 16;
    let ly = 0;
    for (const c of cats) {
      const name = c.name.trim() || S.untitled;
      const w = 18 + M.small(name) + 18;
      if (lx + w > W - 16 && lx > 16) {
        lx = 16;
        ly += LEGEND_ROW;
      }
      legendItems.push({ x: lx, y: ly, name, color: c.color });
      lx += w;
    }
    legendH = ly + LEGEND_ROW;
  }
  const height = Math.ceil(lanesBottom + (legendH ? 8 + legendH : 0) + BOTTOM_PAD);

  prims.push({ t: 'rect', x: 0, y: 0, w: W, h: height, fill: pal.bg });

  /* 標題列 */
  if (input.title) {
    const title = vdoc.title.trim() || S.fallbackTitle;
    let tx = 16;
    const titleText = ellipsize(title, W - 32 - (gm ? 60 : 0), M.title);
    prims.push({ t: 'text', x: tx, y: 26, text: titleText, size: 18, weight: 700, fill: pal.text });
    tx += M.title(titleText) + 10;
    if (gm) {
      prims.push({ t: 'rect', x: tx, y: 12, w: 46, h: 18, r: 9, fill: GM_COLOR });
      prims.push({
        t: 'text',
        x: tx + 23,
        y: 25,
        text: S.gmUse,
        size: 11,
        weight: 700,
        fill: '#2b1f06',
        anchor: 'middle',
      });
    }
    prims.push({
      t: 'text',
      x: 16,
      y: 44,
      text: ellipsize(S.rangeText, W - 32, M.small),
      size: 11,
      weight: 400,
      fill: pal.muted,
    });
  }

  /* 刻度的底與左上角 */
  prims.push({ t: 'rect', x: 0, y: axisTop, w: W, h: AXIS_ROW * 2 + flagH, fill: pal.surface });
  prims.push({ t: 'rect', x: 0, y: lanesTop, w: LW, h: lanesH, fill: pal.surface });
  if (vdoc.mode === 'year' && vdoc.era.trim())
    prims.push({
      t: 'text',
      x: 12,
      y: axisTop + AXIS_ROW + 16,
      text: ellipsize(vdoc.era.trim(), LW - 16, M.small),
      size: 11,
      weight: 600,
      fill: pal.muted,
    });

  /* 格線與刻度標籤（剪在時間軸的範圍） */
  const grid: Prim[] = [];
  for (const t of ticks.minor) {
    const x = xOf(t.v);
    grid.push({
      t: 'line',
      x1: x,
      y1: axisTop + AXIS_ROW,
      x2: x,
      y2: lanesBottom,
      stroke: pal.grid,
      sw: 1,
    });
    /* 左邊被切到的格子不寫標籤 */
    if (x < LW - 1) continue;
    grid.push({
      t: 'text',
      x: x + 4,
      y: axisTop + AXIS_ROW + 16,
      text: t.label,
      size: 11,
      weight: 400,
      fill: pal.muted,
    });
  }
  ticks.major.forEach((t, i) => {
    const x = xOf(t.v);
    grid.push({
      t: 'line',
      x1: x,
      y1: axisTop,
      x2: x,
      y2: lanesBottom,
      stroke: pal.gridMajor,
      sw: 1,
    });
    /* 左邊被切到的那一格：標籤貼在左邊；放不下（會壓到下一格的標籤）時不畫 */
    const next = ticks.major[i + 1];
    const w = M.small(t.label);
    const lx = Math.max(x, LW) + 4;
    if (next && lx + w + 8 > xOf(next.v)) return;
    grid.push({
      t: 'text',
      x: lx,
      y: axisTop + 16,
      text: t.label,
      size: 11,
      weight: 600,
      fill: pal.text,
    });
  });
  prims.push({ t: 'clip', x: LW, y: axisTop, w: trackW, h: lanesBottom - axisTop, children: grid });
  prims.push({
    t: 'line',
    x1: 0,
    y1: axisTop + AXIS_ROW,
    x2: W,
    y2: axisTop + AXIS_ROW,
    stroke: pal.border,
    sw: 1,
  });
  prims.push({ t: 'line', x1: 0, y1: lanesTop, x2: W, y2: lanesTop, stroke: pal.border, sw: 1 });
  prims.push({
    t: 'line',
    x1: LW,
    y1: axisTop,
    x2: LW,
    y2: lanesBottom,
    stroke: pal.border,
    sw: 1,
  });

  /* 泳道名稱與分隔線 */
  for (const row of layout.rows) {
    const y = lanesTop + row.y;
    if (gm && row.secret) prims.push(stripes(0, y, LW, row.height));
    const color = row.lane?.color ?? pal.muted;
    const indent = row.depth ? LANE_INDENT : 0;
    let x = 10 + indent;
    prims.push({ t: 'circle', cx: x + 4, cy: y + 17, r: 4, fill: color });
    x += 14;
    const badge = gm && row.lane?.gm ? 24 : 0;
    const name = row.lane ? row.lane.name.trim() || S.untitled : S.main;
    const shown = ellipsize(
      row.hasChildren && row.collapsed ? `${name} ▸` : name,
      LW - x - 8 - badge,
      M.lane,
    );
    prims.push({ t: 'text', x, y: y + 21, text: shown, size: 12, weight: 600, fill: pal.text });
    if (badge) prims.push(...gmBadge(x + M.lane(shown) + 4, y + 11));
    prims.push({
      t: 'line',
      x1: 0,
      y1: y + row.height,
      x2: W,
      y2: y + row.height,
      stroke: pal.grid,
      sw: 1,
    });
  }

  /* 時間軸上的東西（剪在時間軸的範圍） */
  const track: Prim[] = [];
  for (const bg of layout.backgrounds) {
    if (bg.b < range.a || bg.a > range.b) continue;
    const x1 = Math.max(xOf(bg.a), LW - 2);
    const x2 = Math.min(xOf(bg.b), W + 2);
    const row = bg.row === null ? null : layout.rows[bg.row];
    const y = lanesTop + (row ? row.y : 0);
    const h = row ? row.height : lanesH;
    const color = eventColor(vdoc, bg.event);
    track.push({ t: 'rect', x: x1, y, w: Math.max(2, x2 - x1), h, fill: color, opacity: 0.18 });
    if (gm && bg.event.secret) track.push(stripes(x1, y, Math.max(2, x2 - x1), h));
    const label = ellipsize(bg.event.title.trim() || S.untitled, Math.max(0, x2 - x1 - 8), M.small);
    if (label)
      track.push({
        t: 'text',
        x: x1 + 4,
        y: y + 13,
        text: label,
        size: 11,
        weight: 600,
        fill: pal.muted,
      });
  }
  for (const f of flags.flags) {
    const x = xOf(f.v);
    const color = f.kind === 'progress' ? pal.accent : f.color;
    track.push({
      t: 'line',
      x1: x,
      y1: flagTop,
      x2: x,
      y2: lanesBottom,
      stroke: f.secret && gm ? GM_COLOR : color,
      sw: f.kind === 'marker' ? 1.5 : 2,
      dash: f.kind === 'marker' ? [5, 4] : undefined,
    });
  }
  for (const it of layout.items) {
    const e = it.event;
    const color = eventColor(vdoc, e);
    const x1 = xOf(it.a);
    const y = lanesTop + it.y;
    if (e.kind === 'point') {
      const extentW = POINT_R * 2 + LABEL_GAP + it.labelW + 4;
      if (gm && e.secret) track.push(stripes(x1 - POINT_R - 2, y, extentW, ITEM_H, 4));
      track.push({
        t: 'circle',
        cx: x1,
        cy: y + ITEM_H / 2,
        r: POINT_R,
        fill: color,
        stroke: pal.bg,
        sw: 1.5,
      });
      track.push({
        t: 'text',
        x: x1 + POINT_R + LABEL_GAP,
        y: y + 15,
        text: it.label,
        size: 12,
        weight: 500,
        fill: pal.text,
      });
      if (gm && e.gm) track.push(...gmBadge(x1 - POINT_R - 2, y - 7));
      if (gm && e.gmNote.trim()) track.push(noteMark(x1 + POINT_R + LABEL_GAP + it.labelW + 6, y));
      continue;
    }
    const w = Math.max(MIN_BAR, (it.b - it.a) * k);
    track.push({ t: 'rect', x: x1, y, w, h: ITEM_H, r: 4, fill: color });
    if (gm && e.secret) track.push(stripes(x1, y, w, ITEM_H, 4));
    if (it.inside) {
      /* 開頭在左邊外面時，標題貼在看得到的地方 */
      const visL = Math.max(x1, LW);
      const room = x1 + w - visL - INSIDE_PAD * 2;
      const label = ellipsize(it.label, room, M.item);
      if (label)
        track.push({
          t: 'text',
          x: visL + INSIDE_PAD,
          y: y + 15,
          text: label,
          size: 12,
          weight: 500,
          fill: barTextColor(color),
        });
    } else
      track.push({
        t: 'text',
        x: x1 + w + LABEL_GAP,
        y: y + 15,
        text: it.label,
        size: 12,
        weight: 500,
        fill: pal.text,
      });
    if (gm && e.gm) track.push(...gmBadge(x1, y - 7));
    if (gm && e.gmNote.trim())
      track.push(noteMark(it.inside ? x1 + w : x1 + w + LABEL_GAP + it.labelW + 6, y));
  }
  /* 旗子（標記列） */
  for (const f of flags.flags) {
    const x = xOf(f.v);
    const fy = flagTop + FLAG_GAP + f.level * (FLAG_H + FLAG_GAP);
    const fill = f.kind === 'progress' ? pal.accent : f.color;
    track.push({ t: 'rect', x, y: fy, w: f.w, h: FLAG_H, r: 3, fill });
    if (gm && f.secret) track.push(stripes(x, fy, f.w, FLAG_H, 3));
    track.push({
      t: 'text',
      x: x + FLAG_PAD,
      y: fy + 13,
      text: f.label,
      size: 11,
      weight: 600,
      fill: barTextColor(fill),
    });
  }
  prims.push({
    t: 'clip',
    x: LW + 1,
    y: flagTop,
    w: trackW - 1,
    h: lanesBottom - flagTop,
    children: track,
  });

  /* 圖例 */
  if (legendItems.length) {
    const ly0 = lanesBottom + 8;
    for (const li of legendItems) {
      prims.push({ t: 'rect', x: li.x, y: ly0 + li.y + 8, w: 12, h: 12, r: 3, fill: li.color });
      prims.push({
        t: 'text',
        x: li.x + 18,
        y: ly0 + li.y + 18,
        text: li.name,
        size: 11,
        weight: 400,
        fill: pal.text,
      });
    }
  }

  return {
    width: W,
    height,
    background: pal.bg,
    title: vdoc.title.trim() || S.fallbackTitle,
    prims,
  };
}

/** 用到的字（依粗細；嵌入 SVG 字型的子集用） */
export function pictureChars(pic: Picture): Map<number, Set<string>> {
  const out = new Map<number, Set<string>>();
  const walk = (list: Prim[]) => {
    for (const p of list) {
      if (p.t === 'clip') walk(p.children);
      else if (p.t === 'text') {
        let set = out.get(p.weight);
        if (!set) {
          set = new Set();
          out.set(p.weight, set);
        }
        for (const ch of p.text) set.add(ch);
      }
    }
  };
  walk(pic.prims);
  return out;
}

/* ---------- SVG ---------- */

const n = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};
const esc = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const SVG_FAMILY =
  "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', 'Noto Sans CJK TC', sans-serif";

export function pictureToSvg(pic: Picture, fontCss = ''): string {
  let clipN = 0;
  const defs: string[] = [];
  const draw = (list: Prim[]): string =>
    list
      .map((p) => {
        switch (p.t) {
          case 'rect':
            return `<rect x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}"${p.r ? ` rx="${n(p.r)}"` : ''}${p.fill ? ` fill="${p.fill}"` : ' fill="none"'}${p.stroke ? ` stroke="${p.stroke}" stroke-width="${n(p.sw ?? 1)}"` : ''}${p.dash ? ` stroke-dasharray="${p.dash.join(' ')}"` : ''}${p.opacity !== undefined ? ` opacity="${n(p.opacity)}"` : ''}/>`;
          case 'line':
            return `<line x1="${n(p.x1)}" y1="${n(p.y1)}" x2="${n(p.x2)}" y2="${n(p.y2)}" stroke="${p.stroke}" stroke-width="${n(p.sw)}"${p.dash ? ` stroke-dasharray="${p.dash.join(' ')}"` : ''}${p.opacity !== undefined ? ` opacity="${n(p.opacity)}"` : ''}/>`;
          case 'circle':
            return `<circle cx="${n(p.cx)}" cy="${n(p.cy)}" r="${n(p.r)}" fill="${p.fill}"${p.stroke ? ` stroke="${p.stroke}" stroke-width="${n(p.sw ?? 1)}"` : ''}/>`;
          case 'poly':
            return `<polygon points="${p.points.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')}" fill="${p.fill}"/>`;
          case 'text':
            return `<text x="${n(p.x)}" y="${n(p.y)}" font-size="${p.size}" font-weight="${p.weight}" fill="${p.fill}"${p.anchor && p.anchor !== 'start' ? ` text-anchor="${p.anchor}"` : ''}>${esc(p.text)}</text>`;
          case 'clip': {
            const id = `c${++clipN}`;
            defs.push(
              `<clipPath id="${id}"><rect x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}"${p.r ? ` rx="${n(p.r)}"` : ''}/></clipPath>`,
            );
            return `<g clip-path="url(#${id})">${draw(p.children)}</g>`;
          }
        }
        return '';
      })
      .join('');
  const body = draw(pic.prims);
  const style = `${fontCss}\ntext{font-family:${SVG_FAMILY};white-space:pre}`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${pic.width}" height="${pic.height}" viewBox="0 0 ${pic.width} ${pic.height}"><title>${esc(pic.title)}</title><style>${style.replace(/</g, '\\3c ')}</style><defs>${defs.join('')}</defs>${body}</svg>\n`;
}

/* ---------- canvas ---------- */

type Ctx = CanvasRenderingContext2D;

export function drawPicture(ctx: Ctx, pic: Picture, family = SVG_FAMILY): void {
  const draw = (list: Prim[]) => {
    for (const p of list) {
      switch (p.t) {
        case 'rect': {
          ctx.save();
          if (p.opacity !== undefined) ctx.globalAlpha = p.opacity;
          ctx.beginPath();
          if (p.r && 'roundRect' in ctx) ctx.roundRect(p.x, p.y, p.w, p.h, p.r);
          else ctx.rect(p.x, p.y, p.w, p.h);
          if (p.fill) {
            ctx.fillStyle = p.fill;
            ctx.fill();
          }
          if (p.stroke) {
            ctx.strokeStyle = p.stroke;
            ctx.lineWidth = p.sw ?? 1;
            ctx.setLineDash(p.dash ?? []);
            ctx.stroke();
          }
          ctx.restore();
          break;
        }
        case 'line':
          ctx.save();
          if (p.opacity !== undefined) ctx.globalAlpha = p.opacity;
          ctx.strokeStyle = p.stroke;
          ctx.lineWidth = p.sw;
          ctx.setLineDash(p.dash ?? []);
          ctx.beginPath();
          ctx.moveTo(p.x1, p.y1);
          ctx.lineTo(p.x2, p.y2);
          ctx.stroke();
          ctx.restore();
          break;
        case 'circle':
          ctx.beginPath();
          ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2);
          ctx.fillStyle = p.fill;
          ctx.fill();
          if (p.stroke) {
            ctx.strokeStyle = p.stroke;
            ctx.lineWidth = p.sw ?? 1;
            ctx.setLineDash([]);
            ctx.stroke();
          }
          break;
        case 'poly':
          ctx.beginPath();
          for (const [i, [x, y]] of p.points.entries()) {
            if (i) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
          }
          ctx.closePath();
          ctx.fillStyle = p.fill;
          ctx.fill();
          break;
        case 'text':
          ctx.font = `${p.weight} ${p.size}px ${family}`;
          ctx.fillStyle = p.fill;
          ctx.textAlign = p.anchor === 'middle' ? 'center' : p.anchor === 'end' ? 'right' : 'left';
          ctx.textBaseline = 'alphabetic';
          ctx.fillText(p.text, p.x, p.y);
          break;
        case 'clip':
          ctx.save();
          ctx.beginPath();
          if (p.r && 'roundRect' in ctx) ctx.roundRect(p.x, p.y, p.w, p.h, p.r);
          else ctx.rect(p.x, p.y, p.w, p.h);
          ctx.clip();
          draw(p.children);
          ctx.restore();
          break;
      }
    }
  };
  draw(pic.prims);
}
