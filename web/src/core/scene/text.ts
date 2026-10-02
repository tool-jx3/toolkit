/**
 * 版型畫布的文字：一般文字（換行、對齊、縮小到放得下）與格式化文字（core/richtext）在畫布上的排版。
 * 排版只靠「量字寬」的函式，所以單元測試可以用假的字寬；實際畫圖時由 canvas 量。
 */
import { fontFamilyCss } from '../fonts';
import { layoutRich, type RichRow, rowsThatFit } from '../richtext';
import type { RichNode, TextFont, TextNode } from './types';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** canvas 的 font 字串 */
export function fontString(f: TextFont, size = f.size, weight = f.weight ?? 400): string {
  return `${f.italic ? 'italic ' : ''}${weight} ${size}px ${fontFamilyCss(f.family)}`;
}

/* ---------- 量字寬（快取） ---------- */

const widthCache = new Map<string, number>();
const metricCache = new Map<string, { ascent: number; descent: number }>();

/** 清掉字寬快取（字型載入後呼叫） */
export function clearTextCache(): void {
  widthCache.clear();
  metricCache.clear();
}

/** 字串在某個字型下的寬度（不含字距） */
export function measureWidth(ctx: Ctx, font: string, text: string): number {
  const key = `${font}\n${text}`;
  let w = widthCache.get(key);
  if (w === undefined) {
    ctx.font = font;
    w = ctx.measureText(text).width;
    if (widthCache.size > 50_000) widthCache.clear();
    widthCache.set(key, w);
  }
  return w;
}

/** 字型的上下高度（字身框，與 canvas 的 middle 基線相同的依據）；量不到時用字級的 0.88／0.12 */
export function fontMetrics(
  ctx: Ctx,
  font: string,
  size: number,
): { ascent: number; descent: number } {
  let m = metricCache.get(font);
  if (!m) {
    ctx.font = font;
    const t = ctx.measureText('永Ag');
    const a = t.fontBoundingBoxAscent;
    const d = t.fontBoundingBoxDescent;
    m =
      Number.isFinite(a) && Number.isFinite(d) && a + d > 0
        ? { ascent: a, descent: d }
        : { ascent: size * 0.88, descent: size * 0.12 };
    metricCache.set(font, m);
  }
  return m;
}

/** 行框裡的基線位置（字身框在行高裡垂直置中） */
export function baselineIn(
  top: number,
  lineHeightPx: number,
  m: { ascent: number; descent: number },
) {
  return top + (lineHeightPx - (m.ascent + m.descent)) / 2 + m.ascent;
}

/* ---------- 一般文字 ---------- */

export interface PlainLine {
  text: string;
  width: number;
}

/**
 * 一般文字分行：先依原文換行；wrap 為 'char' 時，加上這個字會超過 width 就換行（逐字，不避頭尾）。
 * charWidth 是一個字的寬度（含字距）。
 */
export function wrapPlain(
  text: string,
  width: number | undefined,
  wrap: 'none' | 'char',
  charWidth: (ch: string) => number,
): PlainLine[] {
  const out: PlainLine[] = [];
  for (const para of String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')) {
    let line = '';
    let w = 0;
    for (const ch of Array.from(para)) {
      const cw = charWidth(ch);
      if (wrap === 'char' && width !== undefined && line && w + cw > width + 1e-6) {
        out.push({ text: line, width: w });
        line = '';
        w = 0;
      }
      line += ch;
      w += cw;
    }
    out.push({ text: line, width: w });
  }
  return out;
}

export interface PlainLayout {
  lines: PlainLine[];
  /** 實際用的字級（縮小後） */
  size: number;
  font: string;
  lineHeightPx: number;
  /** 第一行的上緣 */
  top: number;
  /** 每一行的左緣 */
  xs: number[];
}

/** 一般文字的排版（畫圖與點選範圍共用） */
export function layoutText(ctx: Ctx, n: TextNode): PlainLayout {
  const wrap = n.wrap ?? 'none';
  const ls = n.letterSpacing ?? 0;
  let size = n.font.size;
  let font = fontString(n.font, size);
  const cw = (ch: string) => measureWidth(ctx, font, ch) + ls;
  let lines = wrapPlain(n.text, n.w, wrap, cw);
  if (n.shrink && n.w && wrap === 'none') {
    const widest = Math.max(0, ...lines.map((l) => l.width));
    if (widest > n.w) {
      size = n.font.size * Math.max(n.shrink, n.w / widest);
      font = fontString(n.font, size);
      lines = wrapPlain(n.text, n.w, wrap, cw);
    }
  }
  const lineHeightPx = size * (n.lineHeight ?? 1.2);
  if (n.h !== undefined) {
    const fit = Math.floor(n.h / lineHeightPx + 1e-6);
    if (lines.length > fit) lines = lines.slice(0, Math.max(0, fit));
  }
  const blockH = lines.length * lineHeightPx;
  const top =
    n.h === undefined || (n.valign ?? 'top') === 'top'
      ? n.y
      : n.valign === 'middle'
        ? n.y + (n.h - blockH) / 2
        : n.y + n.h - blockH;
  const align = n.align ?? 'left';
  const xs = lines.map((l) =>
    n.w === undefined || align === 'left'
      ? n.x
      : align === 'center'
        ? n.x + (n.w - l.width) / 2
        : n.x + n.w - l.width,
  );
  return { lines, size, font, lineHeightPx, top, xs };
}

/** 量一段文字的寬（含字距；給點選範圍、置中的計算用） */
export function textWidth(
  ctx: Ctx,
  n: Pick<TextNode, 'font' | 'letterSpacing'>,
  s: string,
): number {
  const font = fontString(n.font);
  const ls = n.letterSpacing ?? 0;
  let w = 0;
  for (const ch of Array.from(s)) w += measureWidth(ctx, font, ch) + ls;
  return w;
}

/* ---------- 格式化文字 ---------- */

export interface RichGlyph {
  ch: string;
  /** 字的左緣（畫布座標，已含壓縮） */
  x: number;
  baseline: number;
  /** 前進寬度（已含壓縮） */
  advance: number;
  size: number;
  weight: number;
  color: string;
  family: string;
  /** 水平壓縮比例 */
  scaleX: number;
}

export interface RichLayout {
  rows: RichRow[];
  /** 實際畫出的行數 */
  shown: number;
  lineHeightPx: number;
  /** 第一行的上緣 */
  top: number;
  /** 畫出的高度 */
  height: number;
  glyphs: RichGlyph[];
}

/** 格式化文字一個字的前進寬度（含字距；半形空白依 spaceScale 加寬；負值當 0） */
export function richAdvance(ctx: Ctx, n: RichNode, ch: string, bold: boolean): number {
  const weight = bold ? (n.boldWeight ?? 700) : (n.font.weight ?? 400);
  const w = Math.max(
    0,
    measureWidth(ctx, fontString(n.font, n.font.size, weight), ch) + (n.letterSpacing ?? 0),
  );
  return ch === ' ' ? w * (n.spaceScale ?? 1) : w;
}

/** 格式化文字的排版（畫圖、點選、PDF 共用） */
export function layoutRichNode(ctx: Ctx, n: RichNode): RichLayout {
  const k = n.scaleX ?? 1;
  const rows = layoutRich(n.doc, {
    width: n.w,
    advance: (ch, bold) => richAdvance(ctx, n, ch, bold),
    indent: n.indent ?? 0,
    continued: n.continued,
    scaleX: k,
  });
  const lineHeightPx = n.font.size * (n.lineHeight ?? 1.3);
  const shown = Math.min(rows.length, n.maxLines ?? rowsThatFit(n.h, lineHeightPx));
  const height = Math.min(n.h, rows.length * lineHeightPx);
  const valign = n.valign ?? 'top';
  const top =
    valign === 'middle' ? n.y + (n.h - height) / 2 : valign === 'bottom' ? n.y + n.h - height : n.y;
  const glyphs: RichGlyph[] = [];
  for (let i = 0; i < shown; i++) {
    const row = rows[i];
    const rowTop = top + i * lineHeightPx;
    /* 靠右的行對齊同一個右端（不算縮排），靠左的行算進縮排 */
    let x = n.align === 'right' ? n.x + n.w - row.width * k : n.x + row.indent * k;
    for (const run of row.runs) {
      const weight = run.bold ? (n.boldWeight ?? 700) : (n.font.weight ?? 400);
      const font = fontString(n.font, n.font.size, weight);
      const m = fontMetrics(ctx, font, n.font.size);
      const baseline = baselineIn(rowTop, lineHeightPx, m);
      for (const ch of Array.from(run.text)) {
        const adv = richAdvance(ctx, n, ch, run.bold) * k;
        glyphs.push({
          ch,
          x,
          baseline,
          advance: adv,
          size: n.font.size,
          weight,
          color: run.color,
          family: n.font.family,
          scaleX: k,
        });
        x += adv;
      }
    }
  }
  return { rows, shown, lineHeightPx, top, height, glyphs };
}
