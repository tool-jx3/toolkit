/**
 * 「散落」的排版（lyric-fx 規格 3.5、3.6）：這一次排位置用的量（字高、邊距、一行最多多寬、出現範圍）、
 * 折行與改折行、斜排後每個字的位置與整塊的範圍、錨點可以在的範圍。
 * 只有幾何與量字，沒有亂數；找位置在 search.ts，時間軸的模擬在 plan.ts。
 */
import type { LyricMeasureEnv } from '../../types';
import type { ScatterSettings } from './settings';

/** 字高 ÷ 字級（規格 3.5、D11） */
export const TEXT_HEIGHT_RATIO = 1.32;
/** 行距 ÷ 字高 */
export const LINE_SPACING_RATIO = 0.3;
/** 影子邊（px，整塊的 pad 的一部分） */
export const SHADOW_MARGIN = 6;
/** 光暈邊的底數（發光開時再加光暈粗細） */
const GLOW_EDGE = 4;
/** 基本邊距：畫面對角線的比例、最小值 */
const EDGE_RATIO = 0.03;
const EDGE_MIN = 30;
/** 一行最多多寬：最窄、上限（畫面寬的比例） */
const ROW_FLOOR = 120;
const ROW_CAP = 0.78;
/** 改折行：變寬每次 × 1.5、最多 6 次；變窄每次 ÷ 1.5（無條件捨去），大於 160 才試 */
const WIDEN_STEP = 1.5;
const WIDEN_TIMES = 6;
const NARROW_STEP = 1.5;
const NARROW_MIN = 160;

/** 整數範圍（含兩端） */
export interface Span {
  lo: number;
  hi: number;
}

/** 這一次排位置用的量（基準畫面；規格 3.5「常數」） */
export interface Metrics {
  W: number;
  H: number;
  /** 字高、行距 */
  th: number;
  ls: number;
  /** 字間距 */
  spacing: number;
  /** pad＝光暈邊＋影子邊 */
  pad: number;
  /** 基本邊距 B */
  edge: number;
  /** 透視邊 */
  px: number;
  py: number;
  /** 一行最多多寬 */
  rowMax: number;
  /** 出現範圍（錨點） */
  usableX: Span;
  usableY: Span;
  /** 角度範圍（最小 ≤ 最大，D12） */
  angleLo: number;
  angleHi: number;
}

export function metricsFor(s: ScatterSettings, W: number, H: number): Metrics {
  const th = s.fontSize * TEXT_HEIGHT_RATIO;
  const glowEdge = s.glow ? s.glowSize + GLOW_EDGE : GLOW_EDGE;
  const edge = Math.max(EDGE_MIN, Math.floor(Math.hypot(W, H) * EDGE_RATIO));
  const qx = s.perspX * 1e-6;
  const qy = s.perspY * 1e-5;
  const comp = s.perspComp * 0.01;
  const px = s.perspective ? Math.floor(W * Math.max(Math.abs(qx), 0.001) * 2) : 0;
  const py = s.perspective ? Math.floor(H * Math.max(Math.abs(qy), 0.001) * 2) : 0;
  const angleLo = Math.min(s.angleMin, s.angleMax);
  const angleHi = Math.max(s.angleMin, s.angleMax);

  /* 一行最多多寬：扣掉兩邊的邊距，再扣掉斜排與透視多佔的寬度（規格 3.5） */
  const steep = (Math.max(Math.abs(s.angleMin), Math.abs(s.angleMax), 1) * Math.PI) / 180;
  const cosSteep = Math.abs(Math.cos(steep)) < 1e-12 ? 0.01 : Math.abs(Math.cos(steep));
  const sinSteep = Math.abs(Math.sin(steep));
  let room = W - 2 * (edge + glowEdge + SHADOW_MARGIN + px);
  room = (room - 3 * th * sinSteep) / cosSteep;
  if (s.perspective) room /= 1 + comp;
  room -= Math.floor(room * 0.05) + Math.floor(th / 2);
  let cap = Math.floor(W * ROW_CAP);
  if (s.perspective) cap = Math.floor(cap / (1 + comp));
  const rowMax = Math.max(Math.min(Math.floor(room), cap), ROW_FLOOR);

  return {
    W,
    H,
    th,
    ls: th * LINE_SPACING_RATIO,
    spacing: s.spacing,
    pad: glowEdge + SHADOW_MARGIN,
    edge,
    px,
    py,
    rowMax,
    usableX: { lo: Math.floor((W * s.posXMin) / 100), hi: Math.floor((W * s.posXMax) / 100) },
    usableY: { lo: Math.floor((H * s.posYMin) / 100), hi: Math.floor((H * s.posYMax) / 100) },
    angleLo,
    angleHi,
  };
}

/* ---------- 量字 ---------- */

/** 一套字型的尺：每個字的前進寬度、一段字的寬（不算字距調整：逐字相加＋字間距） */
export interface Ruler {
  advance(ch: string): number;
  width(text: string): number;
  spacing: number;
}

export function rulerFor(env: LyricMeasureEnv, font: string, spacing: number): Ruler {
  const advance = (ch: string) => env.advance(ch, font);
  return {
    advance,
    spacing,
    width(text) {
      let w = 0;
      let n = 0;
      for (const ch of text) {
        w += advance(ch);
        n++;
      }
      return n ? w + (n - 1) * spacing : 0;
    },
  };
}

/* ---------- 折行 ---------- */

/**
 * 一段（原文、翻譯，或沒有時間的歌詞的一行）折好的樣子。joins[i]＝第 i 行和第 i＋1 行在原文裡中間的字
 * （以空白斷開的是「 」，拆字的是空字串）：改折行時把幾行併回一行用（D13）。
 */
export interface Paragraph {
  rows: string[];
  joins: string[];
}

/** 一句：原文與翻譯各自的段（各自折行，不互相合併） */
export type Wrapping = Paragraph[];

export const rowsOf = (w: Wrapping): string[] => w.flatMap((p) => p.rows);

/** 這一句要各自折行的段：原文的每一行、翻譯的每一行（空的不算） */
export function segmentsOf(text: string, tr: string): string[] {
  const out: string[] = [];
  for (const part of [text, tr])
    for (const seg of part.split('\n')) {
      const t = seg.trim();
      if (t) out.push(t);
    }
  return out;
}

/** 逐字加，加了會超過 limit 就換行；回傳完整的行與最後一行（還可以接字） */
function fillChars(
  word: string,
  limit: number,
  ruler: Ruler,
  out: Paragraph,
): { tail: string; tailWidth: number } {
  let tail = '';
  let tailWidth = 0;
  for (const ch of word) {
    const a = ruler.advance(ch);
    const next = tail ? tailWidth + ruler.spacing + a : a;
    if (tail && next > limit) {
      out.rows.push(tail);
      out.joins.push('');
      tail = ch;
      tailWidth = a;
    } else {
      tail += ch;
      tailWidth = next;
    }
  }
  return { tail, tailWidth };
}

/** 折一段（規格 3.5「折行」）：放得下就一行；有空白就以空白分詞，否則逐字 */
export function wrapSegment(seg: string, limit: number, ruler: Ruler): Paragraph {
  const out: Paragraph = { rows: [], joins: [] };
  if (ruler.width(seg) <= limit) {
    out.rows.push(seg);
    return out;
  }
  const words = seg.split(/\s+/u).filter(Boolean);
  if (words.length < 2) {
    const { tail } = fillChars(seg, limit, ruler, out);
    if (tail) out.rows.push(tail);
    return out;
  }
  const space = ruler.advance(' ');
  let line = '';
  let lineWidth = 0;
  for (const word of words) {
    const w = ruler.width(word);
    if (line) {
      const joined = lineWidth + 2 * ruler.spacing + space + w;
      if (joined <= limit) {
        line += ` ${word}`;
        lineWidth = joined;
        continue;
      }
      out.rows.push(line);
      out.joins.push(' ');
    }
    if (w <= limit) {
      line = word;
      lineWidth = w;
    } else {
      /* 單字比一行還寬：拆字，最後一段留著接下一個字 */
      const { tail, tailWidth } = fillChars(word, limit, ruler, out);
      line = tail;
      lineWidth = tailWidth;
    }
  }
  if (line) out.rows.push(line);
  return out;
}

export const wrapAll = (segments: readonly string[], limit: number, ruler: Ruler): Wrapping =>
  segments.map((seg) => wrapSegment(seg, limit, ruler));

const keyOf = (w: Wrapping) => rowsOf(w).join('\n');

/** 合併成最多 target 行：從第 target 行起，同一段的行併成一行（原文與翻譯不合併，D13） */
function squeeze(w: Wrapping, target: number): Wrapping {
  let seen = 0;
  return w.map((p) => {
    const keep = Math.max(1, Math.min(p.rows.length, target - seen));
    seen += p.rows.length;
    if (keep >= p.rows.length) return p;
    let merged = p.rows[keep - 1];
    for (let i = keep; i < p.rows.length; i++) merged += p.joins[i - 1] + p.rows[i];
    return { rows: [...p.rows.slice(0, keep - 1), merged], joins: p.joins.slice(0, keep - 1) };
  });
}

/**
 * 改折行的候選（規格 3.5「改折行」）：先變寬（目標行數 n − 1、n − 2…1：折行寬度每次 × 1.5、最多 6 次，
 * 還是太多行時把最後幾行併成一行），再變窄（寬度每次 ÷ 1.5、無條件捨去，大於 160 才試）；
 * 和原本的、之前的候選相同的不列。
 */
export function rewraps(
  segments: readonly string[],
  base: Wrapping,
  rowMax: number,
  ruler: Ruler,
): Wrapping[] {
  const seen = new Set([keyOf(base)]);
  const out: Wrapping[] = [];
  const add = (w: Wrapping) => {
    const k = keyOf(w);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(w);
  };
  const count = rowsOf(base).length;
  for (let target = count - 1; target >= 1; target--) {
    let limit = rowMax;
    let w = base;
    for (let k = 0; k < WIDEN_TIMES; k++) {
      limit *= WIDEN_STEP;
      w = wrapAll(segments, limit, ruler);
      if (rowsOf(w).length <= target) break;
    }
    add(rowsOf(w).length > target ? squeeze(w, target) : w);
  }
  for (let limit = Math.floor(rowMax / NARROW_STEP); limit > NARROW_MIN; ) {
    add(wrapAll(segments, limit, ruler));
    limit = Math.floor(limit / NARROW_STEP);
  }
  return out;
}

/** 記下的折行和這一句的字對得上（只比非空白的字） */
export function rowsMatch(rows: readonly string[], text: string, tr: string): boolean {
  const squash = (s: string) => s.replace(/\s+/gu, '');
  return squash(rows.join('')) === squash(text + tr);
}

/* ---------- 斜排與整塊的範圍 ---------- */

export interface Glyph {
  ch: string;
  /** 相對錨點的基線起點（還沒加 th ÷ 3） */
  ox: number;
  oy: number;
  /** 前進寬度 */
  adv: number;
}

/** 整塊相對錨點的範圍（含 pad；left ≤ 0 < right、top < 0 < bottom） */
export interface Extent {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** 一種折行在一個角度的樣子 */
export interface Shape {
  rows: string[];
  angle: number;
  glyphs: Glyph[];
  ext: Extent;
}

/**
 * 斜排（規格 3.6）：第 r 行第 j 個字的基線起點＝(c cos a, c sin a ＋ r(th ＋ ls))，c＝前面的字的前進寬度＋字間距的和；
 * 字本身直立。整塊的範圍（規格 3.5）＝每個字的格子 [ox, ox ＋ 字寬] × [oy − th, oy ＋ ls] 的聯集，四邊再加 pad。
 */
export function shapeOf(rows: readonly string[], angle: number, ruler: Ruler, m: Metrics): Shape {
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const glyphs: Glyph[] = [];
  let left = 0;
  let right = 0;
  let top = -m.th;
  let bottom = m.ls;
  rows.forEach((row, r) => {
    const down = r * (m.th + m.ls);
    let c = 0;
    for (const ch of row) {
      const adv = ruler.advance(ch);
      const ox = c * cos;
      const oy = c * sin + down;
      glyphs.push({ ch, ox, oy, adv });
      left = Math.min(left, ox);
      right = Math.max(right, ox + adv);
      top = Math.min(top, oy - m.th);
      bottom = Math.max(bottom, oy + m.ls);
      c += adv + m.spacing;
    }
  });
  return {
    rows: [...rows],
    angle,
    glyphs,
    ext: { left: left - m.pad, top: top - m.pad, right: right + m.pad, bottom: bottom + m.pad },
  };
}

/** 錨點在 (x, y) 時的整塊（基準畫面座標） */
export const boxAt = (ext: Extent, x: number, y: number) => ({
  x: x + ext.left,
  y: y + ext.top,
  width: ext.right - ext.left,
  height: ext.bottom - ext.top,
});

/** 錨點可以在的範圍：整塊在畫面內留 B（＋透視邊）的邊；最小值無條件進位、最大值無條件捨去 */
export function screenSpan(ext: Extent, m: Metrics): { x: Span; y: Span } {
  return {
    x: {
      lo: Math.ceil(m.edge + m.px - ext.left),
      hi: Math.floor(m.W - m.edge - m.px - ext.right),
    },
    y: {
      lo: Math.ceil(m.edge + m.py - ext.top),
      hi: Math.floor(m.H - m.edge - m.py - ext.bottom),
    },
  };
}

/** 一軸：先和出現範圍取交集，空的就只用畫面的範圍，還是空的就固定在最小值（規格 3.5、F60） */
function narrowAxis(screen: Span, usable: Span | null): Span {
  if (usable) {
    const both = { lo: Math.max(screen.lo, usable.lo), hi: Math.min(screen.hi, usable.hi) };
    if (both.lo <= both.hi) return both;
  }
  return screen.lo <= screen.hi ? screen : { lo: screen.lo, hi: screen.lo };
}

/** 左右分區（F52）：第偶數句左半、第奇數句右半 */
export type Side = 'left' | 'right' | null;

/**
 * 錨點的範圍（角度、折行已定）：withUsable＝沒有避開區域時再和出現範圍取交集；side＝左右分區（分完是空的就不分）。
 */
export function anchorSpan(
  ext: Extent,
  m: Metrics,
  withUsable: boolean,
  side: Side,
): { x: Span; y: Span } {
  const screen = screenSpan(ext, m);
  const x = narrowAxis(screen.x, withUsable ? m.usableX : null);
  const y = narrowAxis(screen.y, withUsable ? m.usableY : null);
  if (side) {
    const half =
      side === 'left'
        ? { lo: x.lo, hi: Math.floor((x.lo + x.hi) / 2) }
        : { lo: Math.ceil((x.lo + x.hi) / 2), hi: x.hi };
    if (half.lo <= half.hi) return { x: half, y };
  }
  return { x, y };
}
