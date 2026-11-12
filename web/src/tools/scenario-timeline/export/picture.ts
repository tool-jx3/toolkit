/**
 * 匯出的圖（規格 F70～F73、3.8）：從看得到的資料（visibleDoc）、時間範圍與寬度算出一份「畫面描述」（矩形、線、圓、文字、剪裁），
 * 同一份描述畫成 PNG（canvas）或寫成 SVG，兩種輸出的版面完全相同。排版（列、堆疊、刻度、旗子）和互動的時間軸共用。
 */
import { contrastRatio } from '@/core/color';
import { type AlibiGap, durationText } from '../model/alibi';
import { axisTicks, placeMajor } from '../model/axis';
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
  itemExtent,
  LABEL_GAP,
  layoutTimeline,
  MIN_BAR,
  POINT_R,
  type Span,
} from '../model/layout';
import { LINK_STYLES, linkGeometry } from '../model/links';
import { ellipsize, type TextMeasure } from '../model/measure';
import { readTime } from '../model/time';
import { EXIT_COLOR, eventColor, GM_COLOR, TRUTH_COLOR } from '../model/types';
import { usedCategories, type VisibleDoc } from '../model/visible';
import {
  BACKDROP,
  CURL_PAD,
  FRAME_PAD,
  flapPath,
  OUTER_MARGIN,
  PAPER_PALETTES,
  type PaperStyle,
  sheetPath,
  TITLE_FONT_SPECS,
  type TitleFont,
  type WearShape,
  wearShapes,
} from './paper';

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
  /** SVG 的路徑（關聯線的曲線；canvas 用 Path2D 畫） */
  | {
      t: 'path';
      d: string;
      stroke: string;
      sw: number;
      dash?: number[];
      opacity?: number;
    }
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
      /** 字型（沒有＝圖的預設字型；標題的字體用，F139） */
      family?: string;
    }
  | { t: 'clip'; x: number; y: number; w: number; h: number; r?: number; children: Prim[] }
  /** 一組（第五批：位移、淡化；聚光的淡化、圖框與紙的留白） */
  | { t: 'group'; dx?: number; dy?: number; opacity?: number; children: Prim[] }
  /** 填色的路徑（第五批：紙、污漬、摺痕、紙翻角；漸層、落影） */
  | {
      t: 'shape';
      d: string;
      fill: WearShape['fill'];
      stroke?: WearShape['stroke'];
      shadow?: { dx: number; dy: number; blur: number; color: string; alpha: number };
    };

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
  /** 上排的刻度 11 px 粗（沒有時用 small） */
  major?: TextMeasure;
  /** 泳道名稱 12 px 粗 */
  lane: TextMeasure;
  /** 標題 18 px 粗 */
  title: TextMeasure;
  /** 標題的字體不是黑體時的量字（F139；沒有時用 title） */
  titleAlt?: TextMeasure;
}

/** 圖下方的調書（F140）的內容：標題與幾塊（每塊一個小標題與幾行） */
export interface PanelSpec {
  title: string;
  /** columns：每塊一欄（接觸調書）；cards：每塊一張卡片（時間切片的地點） */
  layout: 'columns' | 'cards';
  blocks: {
    heading: string;
    /** 強調的塊（同席的地點） */
    accent?: boolean;
    lines: { text: string; tone?: 'muted' | 'alert' | 'truth' }[];
  }[];
  /** 塊的下面另外的幾行（所在不明、退場…） */
  footer?: { text: string; tone?: 'muted' | 'alert' | 'truth' }[];
}

/**
 * 第五批的圖面設定（F131～F141；都是選填，沒有時畫法和改版前相同）：
 * 紙的樣式與老舊、紙翻角與落影、標題的字體、圖框、時間格線、記號的說明、不在場證明空白、聚光與時間切片的淡化、
 * 時間切片的線、圖下方的調書、頁碼。
 */
export interface PictureStyle {
  paper?: PaperStyle;
  /** 紙的老舊 0～1 */
  age?: number;
  seed?: number;
  /** 紙翻角與落影（有紙的樣式時） */
  curl?: boolean;
  /** 紙翻角時外側透明（false：外側填底色） */
  transparent?: boolean;
  titleFont?: TitleFont;
  frame?: boolean;
  /** 時間格線（預設畫） */
  grid?: boolean;
  /** 記號的說明（圖例的後面） */
  marks?: boolean;
  /** 不在場證明空白 */
  gaps?: readonly AlibiGap[];
  /** 強調的事件（其他淡化；null＝全部照常）與強調的泳道（列的名稱淡化；null＝全部照常） */
  lit?: ReadonlySet<string> | null;
  litLanes?: ReadonlySet<string> | null;
  /** 時間切片的位置 */
  sliceV?: number | null;
  sliceLabel?: string;
  panel?: PanelSpec | null;
  /** 頁碼的文字（「第 01／02 頁」） */
  pageLabel?: string;
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
    /** 人物別的標（「霧島醫師 視角」；F118） */
    pov?: string;
    /** 真相、證詞、伏字、查明、退場的小標（F116～F121） */
    truth?: string;
    alibi?: string;
    redacted?: string;
    opened?: string;
    exit?: string;
    /** 第五批：空白的標（「空白」）、記號的說明 */
    gap?: string;
    marks?: Partial<Record<MarkKind, string>>;
  };
  nowV: number | null;
  /** 第五批的圖面設定（沒有＝改版前的畫法） */
  style?: PictureStyle;
}

/** 記號的說明（F138）的種類 */
export type MarkKind =
  | 'truth'
  | 'masked'
  | 'alibi'
  | 'redacted'
  | 'opened'
  | 'exit'
  | 'gap'
  | 'slice'
  | 'gm';

/** 淡化（聚光、時間切片）的不透明度 */
export const DIM_OPACITY = 0.25;

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

/** 小標（真相、證詞、伏字、查明；GM 小標同一個位置） */
function tagBadge(x: number, y: number, text: string, fill: string): Prim[] {
  const w = 6 + text.length * 8;
  return [
    { t: 'rect', x, y, w, h: 12, r: 3, fill },
    {
      t: 'text',
      x: x + w / 2,
      y: y + 9.5,
      text,
      size: 8,
      weight: 700,
      fill: '#ffffff',
      anchor: 'middle',
    },
  ];
}
const tagWidth = (text: string) => 6 + text.length * 8;
export const FACE_FILL = '#475569';
/** 真相、退場的字與線（深色配色用亮一點的，對比才夠） */
const truthInk = (dark: boolean) => (dark ? '#fb923c' : TRUTH_COLOR);
const exitInk = (dark: boolean) => (dark ? '#f87171' : EXIT_COLOR);
export const OPENED_FILL = '#2563eb';

/** 退場之後的斜線（灰色，135°、每 9 px 一條） */
function exitStripes(x: number, y: number, w: number, h: number): Prim {
  const lines: Prim[] = [];
  for (let s = -h; s < w + h; s += 9)
    lines.push({
      t: 'line',
      x1: x + s,
      y1: y + h,
      x2: x + s + h,
      y2: y,
      stroke: '#6b7280',
      sw: 2,
      opacity: 0.2,
    });
  return { t: 'clip', x, y, w, h, children: lines };
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
  const inRange = (e: VisibleDoc['events'][number]) => {
    const s = eventSpan(input.vdoc.mode, e, input.vdoc);
    return !!s && s.b >= range.a && s.a <= range.b;
  };
  const vdoc: VisibleDoc = {
    ...input.vdoc,
    events: input.vdoc.events.filter(inRange),
    ...(input.vdoc.truths?.length ? { truths: input.vdoc.truths.filter(inRange) } : {}),
  };
  const st = input.style ?? {};
  const paper = st.paper && st.paper !== 'none' ? PAPER_PALETTES[st.paper] : null;
  const pal: Palette = paper ?? PALETTES[theme];
  /** 真相、退場用亮一點的紅（深色的配色、深色的紙） */
  const darkInk = paper ? paper.dark : theme === 'dark';
  const lit = st.lit ?? null;
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
  const ticks = axisTicks(vdoc.mode, range.a, range.b, k, M.small, vdoc);
  /* 時間切片（F133）：標籤是標記列的旗子（和其他旗子錯開，不壓到事件的標題） */
  const sliceOn =
    st.sliceV !== undefined && st.sliceV !== null && st.sliceV >= range.a && st.sliceV <= range.b;
  const flags = placeFlags(
    collectFlags(
      vdoc,
      { progress: S.progress, now: S.now, exit: S.exit, untitled: S.untitled },
      input.nowV,
      sliceOn ? { v: st.sliceV as number, label: st.sliceLabel ?? '', color: pal.accent } : null,
    ),
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

  /* 圖例（分類；第五批：後面接記號的說明，F138） */
  const cats = input.legend ? usedCategories(vdoc) : [];
  const legendItems: {
    x: number;
    y: number;
    name: string;
    color: string;
    mark?: MarkKind;
  }[] = [];
  const marks = st.marks ? usedMarks(vdoc, st, S) : [];
  let legendH = 0;
  if (cats.length || marks.length) {
    let lx = 16;
    let ly = 0;
    const entries = [
      ...cats.map((c) => ({ name: c.name.trim() || S.untitled, color: c.color, mark: undefined })),
      ...marks.map((m) => ({ name: m.label, color: '', mark: m.kind })),
    ];
    for (const c of entries) {
      const glyph = c.mark ? markGlyphWidth(c.mark, S) : 18;
      const w = glyph + M.small(c.name) + 18;
      if (lx + w > W - 16 && lx > 16) {
        lx = 16;
        ly += LEGEND_ROW;
      }
      legendItems.push({
        x: lx,
        y: ly,
        name: c.name,
        color: c.color,
        ...(c.mark ? { mark: c.mark } : {}),
      });
      lx += w;
    }
    legendH = ly + LEGEND_ROW;
  }
  /* 圖下方的調書（F140） */
  const legendBottom = lanesBottom + (legendH ? 8 + legendH : 0);
  const panel = st.panel ? layoutPanel(st.panel, W, M.small) : null;
  const height = Math.ceil(legendBottom + (panel ? 10 + panel.h : 0) + BOTTOM_PAD);

  prims.push({ t: 'rect', x: 0, y: 0, w: W, h: height, fill: pal.bg });

  /* 標題列 */
  if (input.title) titleRow(prims, vdoc, W, M, S, st, pal);

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

  /* 格線與刻度標籤（剪在時間軸的範圍；第五批：時間格線關掉時只畫刻度那兩排，F137） */
  const grid: Prim[] = [];
  const gridBottom = st.grid === false ? flagTop : lanesBottom;
  for (const t of ticks.minor) {
    const x = xOf(t.v);
    grid.push({
      t: 'line',
      x1: x,
      y1: axisTop + AXIS_ROW,
      x2: x,
      y2: gridBottom,
      stroke: pal.grid,
      sw: 1,
    });
    /* 左邊被切到的格子不寫標籤；右邊放不下整個標籤的也不寫（不畫被切掉的半個字） */
    if (x < LW - 1 || x + 4 + M.small(t.label) > LW + trackW) continue;
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
      y2: gridBottom,
      stroke: pal.gridMajor,
      sw: 1,
    });
    /* 左邊被切到的那一格：標籤貼在左邊；放不下（壓到下一格、超出右邊）時用短寫法，都放不下時不畫 */
    const next = ticks.major[i + 1];
    const at = placeMajor(t, x, next ? xOf(next.v) : null, LW, LW + trackW, M.major ?? M.small);
    if (!at) return;
    grid.push({
      t: 'text',
      x: at.left,
      y: axisTop + 16,
      text: at.text,
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

  /* 泳道名稱與分隔線（第五批：聚光在泳道上時其他列的名稱淡化） */
  const litLanes = st.litLanes ?? null;
  for (const row of layout.rows) {
    const y = lanesTop + row.y;
    const from = prims.length;
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
    if (litLanes && !litLanes.has(row.key)) dimFrom(prims, from);
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
    const from = track.length;
    const x1 = Math.max(xOf(bg.a), LW - 2);
    const x2 = Math.min(xOf(bg.b), W + 2);
    const row = bg.row === null ? null : layout.rows[bg.row];
    const y = lanesTop + (row ? row.y : 0);
    const h = row ? row.height : lanesH;
    const color = eventColor(vdoc, bg.event);
    track.push({ t: 'rect', x: x1, y, w: Math.max(2, x2 - x1), h, fill: color, opacity: 0.18 });
    if (gm && bg.event.secret) track.push(stripes(x1, y, Math.max(2, x2 - x1), h));
    const label = ellipsize(bg.event.title.trim() || S.untitled, Math.max(0, x2 - x1 - 8), M.small);
    /* 標題和同一列的事件一起堆疊（不會被同位置的事件蓋住） */
    if (label)
      track.push({
        t: 'text',
        x: x1 + 4,
        y: lanesTop + bg.labelY + 15,
        text: label,
        size: 11,
        weight: 600,
        fill: pal.muted,
      });
    if (lit && !lit.has(bg.id)) dimFrom(track, from);
  }
  /* 退場時刻之後（F121）：灰色斜線、紅色虛線（在事件的下面；標籤是標記列的旗子） */
  for (const row of layout.rows) {
    const ex = row.lane?.exit;
    if (!ex || row.key !== row.lane?.id) continue;
    const t = readTime(vdoc.mode, ex.time, vdoc);
    if (!t || t.v > range.b) continue;
    const x = Math.max(xOf(t.v), LW - 2);
    const y = lanesTop + row.y;
    const w = Math.max(0, W + 2 - x);
    track.push({ t: 'rect', x, y, w, h: row.height, fill: '#6b7280', opacity: 0.08 });
    track.push(exitStripes(x, y, w, row.height));
    if (t.v >= range.a) {
      track.push({
        t: 'line',
        x1: x,
        y1: y,
        x2: x,
        y2: y + row.height,
        stroke: exitInk(darkInk),
        sw: 1.5,
        dash: [4, 3],
      });
    }
  }
  /* 不在場證明空白（F131）：那一列的空白時段畫虛線框（在事件的下面） */
  if (st.gaps?.length)
    track.push(
      ...gapPrims(
        st.gaps,
        layout,
        xOf,
        lanesTop,
        range,
        pal,
        M.small,
        S.gap ?? '',
        vdoc.mode,
        flags.flags.filter((f) => f.kind !== 'exit').map((f) => xOf(f.v)),
      ),
    );
  for (const f of flags.flags) {
    /* 退場的線只畫在那一列（上面）；時間切片的線畫在事件的上面（下面） */
    if (f.kind === 'exit' || f.kind === 'slice') continue;
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
  /* 關聯線（F93）：在事件的下面；GM 用時 GM 專用的線是琥珀色 */
  if (vdoc.links.length) {
    const boxes = new Map<
      string,
      { kind: 'point' | 'range' | 'background'; x1: number; x2: number; cy: number }
    >();
    for (const it of layout.items) {
      const x1 = xOf(it.a);
      boxes.set(it.id, {
        kind: it.event.kind === 'point' ? 'point' : 'range',
        x1,
        x2: it.event.kind === 'point' ? x1 : x1 + Math.max(MIN_BAR, (it.b - it.a) * k),
        cy: lanesTop + it.y + ITEM_H / 2,
      });
    }
    for (const bg of layout.backgrounds)
      boxes.set(bg.id, {
        kind: 'background',
        x1: xOf(bg.a),
        x2: xOf(bg.a),
        cy: lanesTop + bg.labelY + ITEM_H / 2,
      });
    for (const kk of vdoc.links) {
      const a = boxes.get(kk.from);
      const b = boxes.get(kk.to);
      if (!a || !b) continue;
      const from = track.length;
      const ls = LINK_STYLES[kk.kind];
      const g = linkGeometry(a, b, ls.arrow);
      const color = gm && kk.secret ? GM_COLOR : ls.color;
      track.push({
        t: 'path',
        d: g.d,
        stroke: color,
        sw: ls.width,
        ...(ls.dash ? { dash: ls.dash } : {}),
      });
      if (g.head) track.push({ t: 'poly', points: g.head, fill: color });
      if (ls.cross) {
        const [mx, my] = g.mid;
        track.push({
          t: 'path',
          d: `M${mx - 4} ${my - 4}L${mx + 4} ${my + 4}M${mx + 4} ${my - 4}L${mx - 4} ${my + 4}`,
          stroke: color,
          sw: 2,
        });
      }
      if (lit && !(lit.has(kk.from) || lit.has(kk.to))) dimFrom(track, from);
    }
  }
  /** 證詞、伏字、查明的小標（GM 小標的右邊） */
  const faceBadges = (e: (typeof layout.items)[number]['event'], x: number, y: number) => {
    const out: Prim[] = [];
    let bx = x + (gm && e.gm ? 22 : 0);
    const add = (text: string | undefined, fill: string) => {
      if (!text) return;
      out.push(...tagBadge(bx, y, text, fill));
      bx += tagWidth(text) + 2;
    };
    if (e.truthOf) add(S.truth, TRUTH_COLOR);
    else {
      if (e.scope === 'alibi') add(S.alibi, FACE_FILL);
      if (e.scope === 'redacted') add(S.redacted, FACE_FILL);
      if (e.opened) add(S.opened, OPENED_FILL);
    }
    return out;
  };
  const drawItem = (it: (typeof layout.items)[number]) => {
    const e = it.event;
    const x1 = xOf(it.a);
    const y = lanesTop + it.y;
    /* 真相（F116）：淡色的底、紅色虛線框；伏字（F117）：灰色虛線框、標題「？？？」 */
    if (e.truthOf || e.masked) {
      const stroke = e.truthOf ? truthInk(darkInk) : pal.muted;
      const base = e.truthOf ? eventColor(vdoc, e) : pal.muted;
      if (e.kind === 'point') {
        track.push({
          t: 'circle',
          cx: x1,
          cy: y + ITEM_H / 2,
          r: POINT_R,
          fill: pal.bg,
          stroke,
          sw: 2,
        });
        track.push({
          t: 'text',
          x: x1 + POINT_R + LABEL_GAP,
          y: y + 15,
          text: it.label,
          size: 12,
          weight: 500,
          fill: e.truthOf ? truthInk(darkInk) : pal.muted,
        });
        track.push(...faceBadges(e, x1 - POINT_R - 2, y - 7));
        return;
      }
      const w = Math.max(MIN_BAR, (it.b - it.a) * k);
      track.push({ t: 'rect', x: x1, y, w, h: ITEM_H, r: 4, fill: base, opacity: 0.18 });
      track.push({
        t: 'rect',
        x: x1 + 0.75,
        y: y + 0.75,
        w: Math.max(1, w - 1.5),
        h: ITEM_H - 1.5,
        r: 4,
        stroke,
        sw: 1.5,
        dash: [4, 3],
      });
      const fill = e.truthOf ? truthInk(darkInk) : pal.muted;
      if (it.inside) {
        const visL = Math.max(x1, LW);
        const label = ellipsize(it.label, x1 + w - visL - INSIDE_PAD * 2, M.item);
        if (label)
          track.push({
            t: 'text',
            x: visL + INSIDE_PAD,
            y: y + 15,
            text: label,
            size: 12,
            weight: 500,
            fill,
          });
      } else
        track.push({
          t: 'text',
          x: x1 + w + LABEL_GAP,
          y: y + 15,
          text: it.label,
          size: 12,
          weight: 500,
          fill,
        });
      track.push(...faceBadges(e, x1, y - 7));
      return;
    }
    const color = eventColor(vdoc, e);
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
      track.push(...faceBadges(e, x1 - POINT_R - 2, y - 7));
      if (gm && e.gmNote.trim()) track.push(noteMark(x1 + POINT_R + LABEL_GAP + it.labelW + 6, y));
      return;
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
    track.push(...faceBadges(e, x1, y - 7));
    if (gm && e.gmNote.trim())
      track.push(noteMark(it.inside ? x1 + w : x1 + w + LABEL_GAP + it.labelW + 6, y));
  };
  for (const it of layout.items) {
    const from = track.length;
    drawItem(it);
    if (lit && !lit.has(it.id)) dimFrom(track, from);
  }
  /* 時間切片（F133）：那一刻的直線（在事件的上面；標籤是旗子） */
  if (sliceOn) track.push(...slicePrims(xOf(st.sliceV as number), flagTop, lanesBottom, pal));
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

  /* 頁碼（F141）：沒有標題列時放在刻度的右上角 */
  if (st.pageLabel && !input.title)
    prims.push(
      ...pageBadge(W - 8 - (M.small(st.pageLabel) + 18), axisTop + 3, st.pageLabel, pal, M.small),
    );

  /* 圖例 */
  if (legendItems.length) {
    const ly0 = lanesBottom + 8;
    for (const li of legendItems) {
      if (li.mark) {
        prims.push(...markGlyph(li.mark, li.x, ly0 + li.y + 8, pal, darkInk, S));
        prims.push({
          t: 'text',
          x: li.x + markGlyphWidth(li.mark, S),
          y: ly0 + li.y + 18,
          text: li.name,
          size: 11,
          weight: 400,
          fill: pal.text,
        });
        continue;
      }
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
  /* 圖下方的調書（F140） */
  if (panel) prims.push(...panelPrims(panel, legendBottom + 10, W, pal, darkInk));

  const pic: Picture = {
    width: W,
    height,
    background: pal.bg,
    title: vdoc.title.trim() || S.fallbackTitle,
    prims,
  };
  return st.frame || paper ? dressPicture(pic, st, pal, paper) : pic;
}

/* ---------- 第五批：紙、圖框、記號的說明、空白、時間切片、調書、頁碼 ---------- */

/** 標題列（專案名稱、人物別或 GM 用的標、範圍、右上角的頁碼）；時間軸的圖與調書的頁共用 */
function titleRow(
  prims: Prim[],
  vdoc: VisibleDoc,
  W: number,
  M: PictureMeasures,
  S: PictureInput['strings'],
  st: PictureStyle,
  pal: Palette,
): void {
  const gm = vdoc.audience === 'gm';
  const title = vdoc.title.trim() || S.fallbackTitle;
  let tx = 16;
  const povW = !gm && vdoc.pov && S.pov ? M.small(S.pov) + 28 : 0;
  /* 頁碼（F141）在右上角；標題的字體（F139） */
  const pageW = st.pageLabel ? M.small(st.pageLabel) + 30 : 0;
  const font = st.titleFont && st.titleFont !== 'sans' ? TITLE_FONT_SPECS[st.titleFont] : null;
  const TM = font ? (M.titleAlt ?? M.title) : M.title;
  const titleText = ellipsize(title, W - 32 - (gm ? 60 : 0) - povW - pageW, TM);
  prims.push({
    t: 'text',
    x: tx,
    y: 26,
    text: titleText,
    size: 18,
    weight: font ? font.weight : 700,
    fill: pal.text,
    ...(font ? { family: font.stack } : {}),
  });
  tx += TM(titleText) + 10;
  if (!gm && vdoc.pov && S.pov) {
    const pw = M.small(S.pov) + 18;
    prims.push({ t: 'rect', x: tx, y: 12, w: pw, h: 18, r: 9, fill: pal.accent });
    prims.push({
      t: 'text',
      x: tx + pw / 2,
      y: 25,
      text: S.pov,
      size: 11,
      weight: 700,
      fill: barTextColor(pal.accent),
      anchor: 'middle',
    });
  }
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
    text: ellipsize(S.rangeText, W - 32 - pageW, M.small),
    size: 11,
    weight: 400,
    fill: pal.muted,
  });
  if (st.pageLabel) prims.push(...pageBadge(W - 16 - (pageW - 12), 12, st.pageLabel, pal, M.small));
}

/** 從 from 起的指令合成一組、淡化（聚光、時間切片） */
function dimFrom(list: Prim[], from: number, opacity = DIM_OPACITY): void {
  if (from >= list.length) return;
  const kids = list.splice(from);
  list.push({ t: 'group', opacity, children: kids });
}

/**
 * 紙與圖框（F136、F137）：圖框四周留白、框線；紙的樣式時再加污漬與摺痕、紙翻角與落影（外側透明或填底色）。
 * 內容整個平移，裡面的畫法不變。
 */
function dressPicture(
  pic: Picture,
  st: PictureStyle,
  pal: Palette,
  paper: (typeof PAPER_PALETTES)[keyof typeof PAPER_PALETTES] | null,
): Picture {
  const fp = st.frame ? FRAME_PAD : 0;
  const curl = !!paper && st.curl !== false;
  const om = curl ? OUTER_MARGIN : 0;
  const sw = pic.width + fp * 2;
  const sh = pic.height + fp * 2 + (curl ? CURL_PAD : 0);
  const out: Prim[] = [];
  if (curl && st.transparent === false)
    out.push({
      t: 'rect',
      x: 0,
      y: 0,
      w: sw + om * 2,
      h: sh + om * 2,
      fill: paper?.dark ? BACKDROP.dark : BACKDROP.light,
    });
  /* 紙（翻角時右下角切掉、落影） */
  out.push({
    t: 'shape',
    d: sheetPath(om, om, sw, sh, curl),
    fill: { kind: 'solid', color: pal.bg, alpha: 1 },
    ...(curl ? { shadow: { dx: 4, dy: 7, blur: 9, color: '#050709', alpha: 0.42 } } : {}),
  });
  out.push({ t: 'group', dx: om + fp, dy: om + fp, children: pic.prims });
  /* 紙的老舊：污漬與摺痕（共用的配置，@/core/paperWear） */
  if (paper && (st.age ?? 0) > 0) {
    const shapes = wearShapes(
      { x: om, y: om, w: sw, h: sh },
      st.seed ?? 0,
      st.age ?? 0,
      paper.dark,
    );
    out.push({
      t: 'clip',
      x: om,
      y: om,
      w: sw,
      h: sh,
      children: shapes.map((w) => ({
        t: 'shape',
        d: w.d,
        fill: w.fill,
        ...(w.stroke ? { stroke: w.stroke } : {}),
      })),
    });
  }
  if (st.frame)
    out.push({
      t: 'rect',
      x: om + fp / 2,
      y: om + fp / 2,
      w: sw - fp,
      h: sh - fp - (curl ? CURL_PAD : 0),
      stroke: pal.text,
      sw: 1,
      opacity: 0.45,
    });
  if (curl && paper)
    out.push({
      t: 'shape',
      d: flapPath(om, om, sw, sh),
      fill: {
        kind: 'linear',
        x1: om + sw - 44,
        y1: om + sh - 36,
        x2: om + sw,
        y2: om + sh,
        stops: [
          [0, paper.flap[0], 1],
          [0.6, paper.flap[1], 1],
          [1, paper.flap[2], 1],
        ],
      },
      shadow: { dx: -2, dy: -2, blur: 4, color: '#000000', alpha: 0.35 },
    });
  return {
    ...pic,
    width: sw + om * 2,
    height: sh + om * 2,
    background: curl
      ? st.transparent === false
        ? paper?.dark
          ? BACKDROP.dark
          : BACKDROP.light
        : 'transparent'
      : pal.bg,
    prims: out,
  };
}

/**
 * 只有調書的一頁（A4 自動分頁時調書放不進最後一頁，F141）：標題列（有開時）＋調書，紙與圖框照樣。
 * 寬度照一般的頁；調書太高時由呼叫端先用 `splitPanel` 切成好幾段。
 */
export function buildPanelPicture(input: {
  vdoc: VisibleDoc;
  width: number;
  title: boolean;
  theme: Theme;
  measures: PictureMeasures;
  strings: PictureInput['strings'];
  style: PictureStyle;
  panel: PanelSpec;
}): Picture {
  const { vdoc, measures: M, strings: S, style: st, theme } = input;
  const paper = st.paper && st.paper !== 'none' ? PAPER_PALETTES[st.paper] : null;
  const pal: Palette = paper ?? PALETTES[theme];
  const darkInk = paper ? paper.dark : theme === 'dark';
  const W = Math.max(200, Math.round(input.width));
  const top = input.title ? TITLE_H : 0;
  const panel = layoutPanel(input.panel, W, M.small);
  const height = Math.ceil(top + 10 + panel.h + BOTTOM_PAD);
  const prims: Prim[] = [{ t: 'rect', x: 0, y: 0, w: W, h: height, fill: pal.bg }];
  if (input.title) titleRow(prims, vdoc, W, M, S, st, pal);
  else if (st.pageLabel)
    prims.push(...pageBadge(W - 8 - (M.small(st.pageLabel) + 18), 4, st.pageLabel, pal, M.small));
  prims.push(...panelPrims(panel, top + 10, W, pal, darkInk));
  const pic: Picture = {
    width: W,
    height,
    background: pal.bg,
    title: vdoc.title.trim() || S.fallbackTitle,
    prims,
  };
  return st.frame || paper ? dressPicture(pic, st, pal, paper) : pic;
}

/** 調書的高（px；版面同 buildPicture 的圖下方） */
export const panelHeight = (spec: PanelSpec, width: number, measure: TextMeasure): number =>
  layoutPanel(spec, Math.max(200, Math.round(width)), measure).h;

/**
 * 調書切成好幾段，每段的高不超過 maxH（一排一排放；至少一排；最後一段帶著下面的幾行）。
 * 接觸調書只有一排（每塊最多 12 行），時間切片的卡片很多時才會切。後面的段標題加 contSuffix。
 */
export function splitPanel(
  spec: PanelSpec,
  width: number,
  measure: TextMeasure,
  maxH: number,
  contSuffix: string,
): PanelSpec[] {
  const lay = layoutPanel(spec, Math.max(200, Math.round(width)), measure);
  if (lay.h <= maxH || lay.rows.length <= 1) return [spec];
  const footerH = (spec.footer?.length ?? 0) * PANEL_LINE + 6;
  const out: PanelSpec[] = [];
  let cur: PanelSpec['blocks'] = [];
  let h = PANEL_HEAD;
  lay.rows.forEach((row, i) => {
    const last = i === lay.rows.length - 1;
    const need = row.h + 8 + (last ? footerH : 0);
    if (cur.length && h + need > maxH) {
      out.push({
        ...spec,
        title: out.length ? `${spec.title}${contSuffix}` : spec.title,
        blocks: cur,
        footer: [],
      });
      cur = [];
      h = PANEL_HEAD;
    }
    cur.push(...row.blocks);
    h += row.h + 8;
  });
  out.push({ ...spec, title: out.length ? `${spec.title}${contSuffix}` : spec.title, blocks: cur });
  return out;
}

/** 頁碼的框（右上角） */
function pageBadge(x: number, y: number, text: string, pal: Palette, measure: TextMeasure): Prim[] {
  const w = measure(text) + 18;
  return [
    { t: 'rect', x, y, w, h: 18, r: 4, fill: pal.surface, stroke: pal.border, sw: 1 },
    {
      t: 'text',
      x: x + w / 2,
      y: y + 13,
      text,
      size: 11,
      weight: 700,
      fill: pal.text,
      anchor: 'middle',
    },
  ];
}

/** 不在場證明空白（F131）：那一列的空白時段畫虛線框，放得下時中間寫「空白 1 小時 20 分」 */
function gapPrims(
  gaps: readonly AlibiGap[],
  layout: ReturnType<typeof layoutTimeline>,
  xOf: (v: number) => number,
  lanesTop: number,
  range: Span,
  pal: Palette,
  measure: TextMeasure,
  label: string,
  mode: VisibleDoc['mode'],
  /** 貫穿泳道的線（標記、目前進度、時間切片）的位置：字不壓在線上 */
  lines: readonly number[] = [],
): Prim[] {
  const out: Prim[] = [];
  const rows = layout.rows;
  const rowOf = new Map(
    rows.filter((r) => r.lane && !(r.collapsed && r.hasChildren)).map((r) => [r.key, r]),
  );
  const rowIndex = new Map(rows.map((r, i) => [r.key, i]));
  for (const g of gaps) {
    const row = rowOf.get(g.laneId);
    if (!row || g.b < range.a || g.a > range.b) continue;
    const x1 = xOf(g.a) + 2;
    const x2 = xOf(g.b) - 2;
    if (x2 - x1 < 4) continue;
    const y = lanesTop + row.y + 4;
    const h = row.height - 8;
    out.push({
      t: 'rect',
      x: x1,
      y,
      w: x2 - x1,
      h,
      r: 4,
      stroke: pal.muted,
      sw: 1,
      dash: [4, 3],
      opacity: 0.75,
    });
    const text = label ? `${label} ${durationText(mode, g.b - g.a)}` : '';
    /*
     * 標籤在看得到的那一段的中間（分頁時空白跨過頁的邊，字不會被切成兩半）；
     * 那一列的事件（含右邊的標題）、貫穿的線壓到時不寫
     */
    const tw = measure(text);
    const vx1 = Math.max(x1, xOf(range.a));
    const vx2 = Math.min(x2, xOf(range.b));
    const cx = (vx1 + vx2) / 2;
    const ri = rowIndex.get(row.key);
    const hit = (left: number, right: number) => right > cx - tw / 2 - 4 && left < cx + tw / 2 + 4;
    const clear =
      !lines.some((x) => hit(x - 2, x + 2)) &&
      !layout.items.some((it) => {
        if (it.row !== ri) return false;
        const ext = itemExtent(it.event.kind, xOf(it.a), xOf(it.b), it.labelW);
        return hit(ext.left, ext.right);
      }) &&
      /* 背景的標題（和事件一起堆疊在這一列的） */
      !layout.backgrounds.some(
        (bg) =>
          bg.labelRow === ri &&
          hit(xOf(bg.a), xOf(bg.a) + measure(bg.event.title.trim() || ' ') + 12),
      );
    if (text && clear && tw + 8 <= vx2 - vx1)
      out.push({
        t: 'text',
        x: cx,
        y: y + h / 2 + 4,
        text,
        size: 11,
        weight: 600,
        fill: pal.muted,
        anchor: 'middle',
      });
  }
  return out;
}

/** 時間切片（F133）：那一刻的直線（強調色的虛線、淡淡的帶）；標籤是標記列的旗子 */
function slicePrims(x: number, top: number, bottom: number, pal: Palette): Prim[] {
  return [
    { t: 'rect', x: x - 5, y: top, w: 10, h: bottom - top, fill: pal.accent, opacity: 0.1 },
    { t: 'line', x1: x, y1: top, x2: x, y2: bottom, stroke: pal.accent, sw: 2, dash: [6, 3] },
  ];
}

/** 這張圖用到的記號（F138；依說明的順序） */
function usedMarks(
  vdoc: VisibleDoc,
  st: PictureStyle,
  S: PictureInput['strings'],
): { kind: MarkKind; label: string }[] {
  const L = S.marks ?? {};
  const gm = vdoc.audience === 'gm';
  const has: Record<MarkKind, boolean> = {
    truth: !!vdoc.truths?.length,
    masked: vdoc.events.some((e) => e.masked),
    alibi: vdoc.events.some((e) => e.scope === 'alibi'),
    redacted: vdoc.events.some((e) => e.scope === 'redacted'),
    opened: vdoc.events.some((e) => e.opened),
    exit: vdoc.lanes.some((l) => !!l.exit),
    gap: !!st.gaps?.length,
    slice: st.sliceV !== undefined && st.sliceV !== null,
    gm: gm && (vdoc.events.some((e) => e.secret) || vdoc.lanes.some((l) => l.secret)),
  };
  const order: MarkKind[] = [
    'truth',
    'alibi',
    'redacted',
    'masked',
    'opened',
    'exit',
    'gap',
    'slice',
    'gm',
  ];
  return order.filter((k) => has[k] && L[k]).map((k) => ({ kind: k, label: L[k] as string }));
}

/** 記號的圖（說明的左邊）佔的寬 */
function markGlyphWidth(kind: MarkKind, S: PictureInput['strings']): number {
  if (kind === 'alibi' || kind === 'redacted' || kind === 'opened') {
    const text = kind === 'alibi' ? S.alibi : kind === 'redacted' ? S.redacted : S.opened;
    return tagWidth(text ?? '') + 6;
  }
  return 22;
}

function markGlyph(
  kind: MarkKind,
  x: number,
  y: number,
  pal: Palette,
  darkInk: boolean,
  S: PictureInput['strings'],
): Prim[] {
  switch (kind) {
    case 'truth':
      return [
        { t: 'rect', x, y, w: 16, h: 12, r: 3, fill: TRUTH_COLOR, opacity: 0.18 },
        {
          t: 'rect',
          x: x + 0.75,
          y: y + 0.75,
          w: 14.5,
          h: 10.5,
          r: 3,
          stroke: truthInk(darkInk),
          sw: 1.5,
          dash: [3, 2],
        },
      ];
    case 'masked':
      return [
        {
          t: 'rect',
          x: x + 0.75,
          y: y + 0.75,
          w: 14.5,
          h: 10.5,
          r: 3,
          stroke: pal.muted,
          sw: 1.5,
          dash: [3, 2],
        },
      ];
    case 'alibi':
      return tagBadge(x, y, S.alibi ?? '', FACE_FILL);
    case 'redacted':
      return tagBadge(x, y, S.redacted ?? '', FACE_FILL);
    case 'opened':
      return tagBadge(x, y, S.opened ?? '', OPENED_FILL);
    case 'exit':
      return [
        { t: 'rect', x, y, w: 16, h: 12, fill: '#6b7280', opacity: 0.08 },
        exitStripes(x, y, 16, 12),
        {
          t: 'line',
          x1: x,
          y1: y,
          x2: x,
          y2: y + 12,
          stroke: exitInk(darkInk),
          sw: 1.5,
          dash: [3, 2],
        },
      ];
    case 'gap':
      return [
        {
          t: 'rect',
          x: x + 0.5,
          y: y + 0.5,
          w: 15,
          h: 11,
          r: 3,
          stroke: pal.muted,
          sw: 1,
          dash: [3, 2],
        },
      ];
    case 'slice':
      return [
        { t: 'rect', x: x + 4, y, w: 8, h: 12, fill: pal.accent, opacity: 0.12 },
        {
          t: 'line',
          x1: x + 8,
          y1: y,
          x2: x + 8,
          y2: y + 12,
          stroke: pal.accent,
          sw: 2,
          dash: [3, 2],
        },
      ];
    case 'gm':
      return [
        { t: 'rect', x, y, w: 16, h: 12, r: 3, stroke: GM_COLOR, sw: 1 },
        stripes(x, y, 16, 12, 3),
      ];
  }
}

const PANEL_LINE = 16;
const PANEL_HEAD = 30;
const BLOCK_GAP = 12;
const CARD_MIN = 230;

interface PanelLayout {
  spec: PanelSpec;
  h: number;
  cols: number;
  colW: number;
  rows: { y: number; h: number; blocks: PanelSpec['blocks'] }[];
  footerY: number;
  measure: TextMeasure;
}

/** 調書的版面：一欄一塊（接觸調書）或卡片排成格子（時間切片） */
function layoutPanel(spec: PanelSpec, W: number, measure: TextMeasure): PanelLayout {
  const inner = W - 32;
  const n = spec.blocks.length;
  const cols =
    spec.layout === 'columns'
      ? Math.max(
          1,
          Math.min(n, Math.floor((inner + BLOCK_GAP) / (CARD_MIN * 0.8 + BLOCK_GAP)) || 1),
        )
      : Math.max(1, Math.min(n, Math.floor((inner + BLOCK_GAP) / (CARD_MIN + BLOCK_GAP)) || 1));
  const colW = (inner - (cols - 1) * BLOCK_GAP) / cols;
  const rows: PanelLayout['rows'] = [];
  let y = PANEL_HEAD;
  for (let i = 0; i < n; i += cols) {
    const blocks = spec.blocks.slice(i, i + cols);
    const lines = Math.max(...blocks.map((b) => b.lines.length), 0);
    const h = 26 + Math.max(1, lines) * PANEL_LINE + 6;
    rows.push({ y, h, blocks });
    y += h + 8;
  }
  const footerY = y;
  const h = footerY + (spec.footer?.length ?? 0) * PANEL_LINE + 6;
  return { spec, h, cols, colW, rows, footerY, measure };
}

function panelPrims(
  p: PanelLayout,
  top: number,
  W: number,
  pal: Palette,
  darkInk: boolean,
): Prim[] {
  const out: Prim[] = [];
  const x0 = 16;
  out.push({
    t: 'rect',
    x: x0 - 8,
    y: top,
    w: W - 16,
    h: p.h,
    r: 6,
    fill: pal.surface,
    stroke: pal.border,
    sw: 1,
  });
  out.push({
    t: 'text',
    x: x0,
    y: top + 20,
    text: ellipsize(p.spec.title, W - 48, p.measure),
    size: 12,
    weight: 700,
    fill: pal.text,
  });
  const tone = (t?: 'muted' | 'alert' | 'truth') =>
    t === 'muted'
      ? pal.muted
      : t === 'alert'
        ? exitInk(darkInk)
        : t === 'truth'
          ? truthInk(darkInk)
          : pal.text;
  for (const row of p.rows) {
    row.blocks.forEach((b, i) => {
      const x = x0 + i * (p.colW + BLOCK_GAP);
      const y = top + row.y;
      if (p.spec.layout === 'cards')
        out.push({
          t: 'rect',
          x,
          y,
          w: p.colW,
          h: row.h,
          r: 4,
          fill: pal.bg,
          stroke: b.accent ? pal.accent : pal.border,
          sw: b.accent ? 1.5 : 1,
        });
      else if (i > 0)
        out.push({
          t: 'line',
          x1: x - BLOCK_GAP / 2,
          y1: y + 4,
          x2: x - BLOCK_GAP / 2,
          y2: y + row.h - 4,
          stroke: pal.border,
          sw: 1,
          dash: [3, 3],
        });
      const pad = p.spec.layout === 'cards' ? 8 : 0;
      out.push({
        t: 'text',
        x: x + pad,
        y: y + 18,
        text: ellipsize(b.heading, p.colW - pad * 2, p.measure),
        size: 11,
        weight: 700,
        fill: b.accent ? pal.accent : pal.text,
      });
      b.lines.forEach((ln, j) => {
        out.push({
          t: 'text',
          x: x + pad,
          y: y + 26 + (j + 1) * PANEL_LINE - 3,
          text: ellipsize(ln.text, p.colW - pad * 2, p.measure),
          size: 11,
          weight: 400,
          fill: tone(ln.tone),
        });
      });
    });
  }
  (p.spec.footer ?? []).forEach((ln, j) => {
    out.push({
      t: 'text',
      x: x0,
      y: top + p.footerY + (j + 1) * PANEL_LINE - 3,
      text: ellipsize(ln.text, W - 48, p.measure),
      size: 11,
      weight: 400,
      fill: tone(ln.tone),
    });
  });
  return out;
}

/** 用到的字（依粗細；嵌入 SVG 字型的子集用；另外指定字型的字〔標題的字體〕不算，見 pictureFamilyChars） */
export function pictureChars(pic: Picture): Map<number, Set<string>> {
  const out = new Map<number, Set<string>>();
  const walk = (list: Prim[]) => {
    for (const p of list) {
      if (p.t === 'clip' || p.t === 'group') walk(p.children);
      else if (p.t === 'text' && !p.family) {
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

/** 另外指定字型的字（標題的字體，F139）：字型堆疊 → 粗細 → 字 */
export function pictureFamilyChars(pic: Picture): Map<string, Map<number, Set<string>>> {
  const out = new Map<string, Map<number, Set<string>>>();
  const walk = (list: Prim[]) => {
    for (const p of list) {
      if (p.t === 'clip' || p.t === 'group') walk(p.children);
      else if (p.t === 'text' && p.family) {
        let byW = out.get(p.family);
        if (!byW) {
          byW = new Map();
          out.set(p.family, byW);
        }
        let set = byW.get(p.weight);
        if (!set) {
          set = new Set();
          byW.set(p.weight, set);
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
const n3 = (v: number) => String(Math.round(v * 1000) / 1000);
const esc = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const SVG_FAMILY =
  "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', 'Noto Sans CJK TC', sans-serif";

export function pictureToSvg(pic: Picture, fontCss = ''): string {
  let clipN = 0;
  let gradN = 0;
  let filterN = 0;
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
          case 'path':
            return `<path d="${p.d}" fill="none" stroke="${p.stroke}" stroke-width="${n(p.sw)}" stroke-linecap="round"${p.dash ? ` stroke-dasharray="${p.dash.join(' ')}"` : ''}${p.opacity !== undefined ? ` opacity="${n(p.opacity)}"` : ''}/>`;
          case 'text':
            return `<text x="${n(p.x)}" y="${n(p.y)}" font-size="${p.size}" font-weight="${p.weight}" fill="${p.fill}"${p.anchor && p.anchor !== 'start' ? ` text-anchor="${p.anchor}"` : ''}${p.family ? ` font-family="${esc(p.family)}"` : ''}>${esc(p.text)}</text>`;
          case 'clip': {
            const id = `c${++clipN}`;
            defs.push(
              `<clipPath id="${id}"><rect x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}"${p.r ? ` rx="${n(p.r)}"` : ''}/></clipPath>`,
            );
            return `<g clip-path="url(#${id})">${draw(p.children)}</g>`;
          }
          case 'group': {
            const tr =
              p.dx || p.dy ? ` transform="translate(${n(p.dx ?? 0)} ${n(p.dy ?? 0)})"` : '';
            const op = p.opacity !== undefined ? ` opacity="${n(p.opacity)}"` : '';
            return `<g${tr}${op}>${draw(p.children)}</g>`;
          }
          case 'shape': {
            let fill: string;
            if (p.fill.kind === 'solid')
              fill = ` fill="${p.fill.color}"${p.fill.alpha < 1 ? ` fill-opacity="${n3(p.fill.alpha)}"` : ''}`;
            else {
              const id = `g${++gradN}`;
              const stops = p.fill.stops
                .map(
                  ([o, c, a]) =>
                    `<stop offset="${n3(o)}" stop-color="${c}"${a < 1 ? ` stop-opacity="${n3(a)}"` : ''}/>`,
                )
                .join('');
              defs.push(
                p.fill.kind === 'radial'
                  ? `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(p.fill.cx)}" cy="${n(p.fill.cy)}" r="${n(p.fill.r1)}" fr="${n(p.fill.r0)}">${stops}</radialGradient>`
                  : `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(p.fill.x1)}" y1="${n(p.fill.y1)}" x2="${n(p.fill.x2)}" y2="${n(p.fill.y2)}">${stops}</linearGradient>`,
              );
              fill = ` fill="url(#${id})"`;
            }
            const stroke = p.stroke
              ? ` stroke="${p.stroke.color}" stroke-width="${n(p.stroke.width)}"${p.stroke.alpha < 1 ? ` stroke-opacity="${n3(p.stroke.alpha)}"` : ''}`
              : '';
            let filter = '';
            if (p.shadow) {
              const id = `f${++filterN}`;
              defs.push(
                `<filter id="${id}" x="-10%" y="-10%" width="125%" height="125%"><feDropShadow dx="${n(p.shadow.dx)}" dy="${n(p.shadow.dy)}" stdDeviation="${n(p.shadow.blur / 2)}" flood-color="${p.shadow.color}" flood-opacity="${n3(p.shadow.alpha)}"/></filter>`,
              );
              filter = ` filter="url(#${id})"`;
            }
            return `<path d="${p.d}"${fill}${stroke}${filter}/>`;
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

/** #rrggbb＋不透明度 → canvas 的顏色 */
function rgba(hex: string, a: number): string {
  if (a >= 1) return hex;
  const v = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${a})`;
}

export function drawPicture(ctx: Ctx, pic: Picture, family = SVG_FAMILY): void {
  const draw = (list: Prim[]) => {
    for (const p of list) {
      switch (p.t) {
        case 'rect': {
          ctx.save();
          if (p.opacity !== undefined) ctx.globalAlpha *= p.opacity;
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
          if (p.opacity !== undefined) ctx.globalAlpha *= p.opacity;
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
        case 'path':
          ctx.save();
          if (p.opacity !== undefined) ctx.globalAlpha *= p.opacity;
          ctx.strokeStyle = p.stroke;
          ctx.lineWidth = p.sw;
          ctx.lineCap = 'round';
          ctx.setLineDash(p.dash ?? []);
          ctx.stroke(new Path2D(p.d));
          ctx.restore();
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
          ctx.font = `${p.weight} ${p.size}px ${p.family ?? family}`;
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
        case 'group':
          ctx.save();
          if (p.dx || p.dy) ctx.translate(p.dx ?? 0, p.dy ?? 0);
          if (p.opacity !== undefined) ctx.globalAlpha *= p.opacity;
          draw(p.children);
          ctx.restore();
          break;
        case 'shape': {
          ctx.save();
          const path = new Path2D(p.d);
          const f = p.fill;
          if (f.kind === 'solid') ctx.fillStyle = rgba(f.color, f.alpha);
          else {
            const g =
              f.kind === 'radial'
                ? ctx.createRadialGradient(f.cx, f.cy, f.r0, f.cx, f.cy, f.r1)
                : ctx.createLinearGradient(f.x1, f.y1, f.x2, f.y2);
            for (const [o, c, a] of f.stops) g.addColorStop(o, rgba(c, a));
            ctx.fillStyle = g;
          }
          if (p.shadow) {
            /* 落影的位移與模糊不跟著變換（canvas 的規定）：照目前的倍率換算 */
            const m = ctx.getTransform();
            const sc = Math.hypot(m.a, m.b) || 1;
            ctx.shadowColor = rgba(p.shadow.color, p.shadow.alpha);
            ctx.shadowBlur = p.shadow.blur * sc;
            ctx.shadowOffsetX = p.shadow.dx * sc;
            ctx.shadowOffsetY = p.shadow.dy * sc;
          }
          ctx.fill(path);
          if (p.stroke) {
            ctx.shadowColor = 'transparent';
            ctx.strokeStyle = rgba(p.stroke.color, p.stroke.alpha);
            ctx.lineWidth = p.stroke.width;
            ctx.setLineDash([]);
            ctx.stroke(path);
          }
          ctx.restore();
          break;
        }
      }
    }
  };
  draw(pic.prims);
}
