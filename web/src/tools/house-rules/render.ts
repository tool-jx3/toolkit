/**
 * 房規表的 PNG（規格 3.5）：先排版（純計算，量字寬的函式由外面給，單元測試可以用假的），再依配色畫到 canvas。
 * 預覽與下載用同一份排版，只有倍率不同（下載 2 倍）。
 */
import { ensureFont, fontFamilyCss } from '@/core/fonts';
import { breakText } from '@/core/typeset';
import { hasNotes, type RowView, type TableModel, type ValueKind } from './model';
import { OUT } from './strings';

export type PngTheme = 'dark' | 'light';
export type PngLayoutKind = 'wide' | 'narrow';

export interface PngOptions {
  theme: PngTheme;
  layout: PngLayoutKind;
  /** 包含注記 */
  notes: boolean;
  /** 包含圖例 */
  legend: boolean;
}

/** 邏輯寬度（px）；下載的 PNG 是 2 倍 */
export const PNG_WIDTH: Record<PngLayoutKind, number> = { wide: 960, narrow: 600 };
export const PNG_SCALE = 2;
export const PNG_FONT_FAMILY = 'Noto Sans TC';

export type ColorKey =
  | 'bg'
  | 'ink'
  | 'muted'
  | 'faint'
  | 'line'
  | 'zebra'
  | 'edition'
  | 'editionSoft'
  | 'common'
  | 'commonSoft'
  | 'o'
  | 'x'
  | 'm'
  | 'modSoft';

export const PALETTES: Record<PngTheme, Record<ColorKey, string>> = {
  dark: {
    bg: '#17161c',
    ink: '#efece6',
    muted: '#aca69e',
    faint: '#827c86',
    line: '#3a3644',
    zebra: '#1f1d25',
    edition: '#b79ce0',
    editionSoft: '#2a2436',
    common: '#7fc4bb',
    commonSoft: '#1e2b2b',
    o: '#7fcf9a',
    x: '#948e99',
    m: '#f2a65a',
    modSoft: '#2c221b',
  },
  light: {
    bg: '#ffffff',
    ink: '#1f1d1a',
    muted: '#5b5751',
    faint: '#8a847c',
    line: '#e2dbe9',
    zebra: '#f7f5fa',
    edition: '#6a4c9c',
    editionSoft: '#efe9f7',
    common: '#2b7a72',
    commonSoft: '#e5f2f0',
    o: '#1d7a45',
    x: '#7b7681',
    m: '#b5541a',
    modSoft: '#fbf0e6',
  },
};

export interface FontSpec {
  size: number;
  weight: number;
}

/** 量一段文字的寬度（邏輯 px） */
export type MeasureFn = (text: string, font: FontSpec) => number;

export type DrawOp =
  | { t: 'rect'; x: number; y: number; w: number; h: number; color: ColorKey; r?: number }
  | {
      t: 'text';
      /** 對齊點的 x */
      x: number;
      /** 這一行的中線 */
      y: number;
      text: string;
      font: FontSpec;
      color: ColorKey;
      align: 'left' | 'center' | 'right';
    };

export interface PngLayout {
  width: number;
  height: number;
  ops: DrawOp[];
  /** 有沒有畫注記欄 */
  noteColumn: boolean;
}

/** 依寬度斷行（中文逐字、英文以詞為單位、行首行尾禁則；原本的換行保留） */
export function wrapText(text: string, maxWidth: number, font: FontSpec, measure: MeasureFn) {
  return breakText(text, {
    limit: Math.max(1, maxWidth),
    unit: (ch) => measure(ch, font),
    segment: 'grapheme',
  }).map((chars) => chars.join(''));
}

const SYMBOL_KINDS: readonly ValueKind[] = ['o', 'x', 'm'];
const valueFont = (kind: ValueKind): FontSpec =>
  SYMBOL_KINDS.includes(kind) ? { size: 18, weight: 700 } : { size: 14, weight: 700 };
const valueColor = (kind: ValueKind): ColorKey =>
  kind === 'o' || kind === 'x' || kind === 'm' ? kind : kind === 'unset' ? 'faint' : 'ink';

/** 排版：回傳畫圖指令與高度（邏輯 px） */
export function layoutPng(model: TableModel, opts: PngOptions, measure: MeasureFn): PngLayout {
  const narrow = opts.layout === 'narrow';
  const W = PNG_WIDTH[opts.layout];
  const PAD = narrow ? 24 : 40;
  const inner = W - PAD * 2;
  const withNotes = opts.notes && hasNotes(model);
  const ops: DrawOp[] = [];
  const rect = (x: number, y: number, w: number, h: number, color: ColorKey, r?: number) =>
    ops.push({ t: 'rect', x, y, w, h, color, r });
  const text = (
    s: string,
    x: number,
    y: number,
    font: FontSpec,
    color: ColorKey,
    align: 'left' | 'center' | 'right' = 'left',
  ) => {
    if (s) ops.push({ t: 'text', x, y, text: s, font, color, align });
  };
  /** 一段多行文字：第一行的上緣 top、行高 lh */
  const block = (
    lines: string[],
    x: number,
    top: number,
    lh: number,
    font: FontSpec,
    color: ColorKey,
    align: 'left' | 'center' | 'right' = 'left',
  ) => {
    lines.forEach((line, i) => {
      text(line, x, top + i * lh + lh / 2, font, color, align);
    });
  };

  let y = 0;
  rect(0, 0, W, 6, 'edition');
  y = PAD + 6;

  /* 標題與表頭資訊 */
  const titleFont = { size: narrow ? 24 : 28, weight: 700 };
  const titleLh = Math.round(titleFont.size * 1.35);
  const titleLines = wrapText(model.title, inner, titleFont, measure);
  block(titleLines, PAD, y, titleLh, titleFont, 'ink');
  y += titleLines.length * titleLh;
  if (model.meta.length) {
    y += 6;
    const metaFont = { size: 13, weight: 400 };
    const items = model.meta.map(([label, value]) => `${label}：${value}`);
    const metaLines = narrow
      ? items.flatMap((s) => wrapText(s, inner, metaFont, measure))
      : wrapText(items.join('　／　'), inner, metaFont, measure);
    block(metaLines, PAD, y, 20, metaFont, 'muted');
    y += metaLines.length * 20;
  }
  y += 16;
  rect(PAD, y, inner, 1, 'line');
  y += 1;

  /* 欄寬（橫式） */
  const c1 = withNotes ? inner * 0.34 : inner * 0.56;
  const c2 = withNotes ? inner * 0.2 : inner * 0.44;
  const c3 = inner - c1 - c2;
  const nameFont = { size: 14, weight: 700 };
  const noteFont = { size: narrow ? 12.5 : 13, weight: 400 };
  const catFont = { size: 13, weight: 700 };
  const headFont = { size: 11, weight: 700 };

  const drawRow = (row: RowView, index: number) => {
    const note = withNotes ? row.note : '';
    const mod = row.kind === 'm';
    const vf = valueFont(row.kind);
    const vlh = vf.size + 6;
    if (!narrow) {
      const nameL = wrapText(row.name, c1 - 24, nameFont, measure);
      const valL = wrapText(row.value, c2 - 16, vf, measure);
      const noteL = note ? wrapText(note, c3 - 26, noteFont, measure) : [];
      const h = Math.max(nameL.length * 21, valL.length * vlh, noteL.length * 20) + 18;
      if (index % 2 === 1) rect(PAD, y, inner, h, 'zebra');
      if (mod && note) {
        rect(PAD + c1 + c2, y, c3, h, 'modSoft');
        rect(PAD + c1 + c2, y, 3, h, 'm');
      }
      block(nameL, PAD + 12, y + (h - nameL.length * 21) / 2, 21, nameFont, 'ink');
      block(
        valL,
        PAD + c1 + c2 / 2,
        y + (h - valL.length * vlh) / 2,
        vlh,
        vf,
        valueColor(row.kind),
        'center',
      );
      block(
        noteL,
        PAD + c1 + c2 + 14,
        y + (h - noteL.length * 20) / 2,
        20,
        noteFont,
        mod ? 'ink' : 'muted',
      );
      y += h;
      return;
    }
    const valW = Math.min(
      Math.max(...row.value.split('\n').map((s) => measure(s, vf))),
      inner * 0.46,
    );
    const valL = wrapText(row.value, inner * 0.46, vf, measure);
    const nameL = wrapText(row.name, inner - valW - 34, nameFont, measure);
    const noteL = note ? wrapText(note, inner - 34, noteFont, measure) : [];
    const top = Math.max(nameL.length * 21, valL.length * vlh);
    const h = top + (noteL.length ? noteL.length * 19 + 6 : 0) + 18;
    if (index % 2 === 1) rect(PAD, y, inner, h, 'zebra');
    block(nameL, PAD + 10, y + 9, 21, nameFont, 'ink');
    block(valL, PAD + inner - 10, y + 9, vlh, vf, valueColor(row.kind), 'right');
    if (noteL.length) {
      const ny = y + 9 + top + 4;
      if (mod) rect(PAD + 12, ny, 3, noteL.length * 19 - 2, 'm');
      block(noteL, PAD + 22, ny, 19, noteFont, mod ? 'ink' : 'muted');
    }
    y += h;
  };

  model.sections.forEach((sec) => {
    y += 22;
    const tone: ColorKey = sec.tone === 'common' ? 'common' : 'edition';
    const soft: ColorKey = sec.tone === 'common' ? 'commonSoft' : 'editionSoft';
    const secFont = { size: narrow ? 17 : 18, weight: 700 };
    rect(PAD, y, inner, 34, soft, 6);
    rect(PAD, y, 4, 34, tone);
    text(sec.title, PAD + 16, y + 17, secFont, 'ink');
    y += 34 + 8;
    if (!narrow) {
      const hy = y + 8;
      text(OUT.cols.rule, PAD + 12, hy, headFont, 'faint');
      text(OUT.cols.value, PAD + c1 + c2 / 2, hy, headFont, 'faint', 'center');
      if (withNotes) text(OUT.cols.note, PAD + c1 + c2 + 14, hy, headFont, 'faint');
      y += 18;
    }
    sec.cats.forEach((cat, ci) => {
      y += ci ? 12 : 6;
      text(cat.title, PAD + 2, y + 10, catFont, tone);
      y += 22;
      rect(PAD, y, inner, 1, 'line');
      y += 1;
      cat.rows.forEach((row, ri) => {
        drawRow(row, ri);
      });
      rect(PAD, y, inner, 1, 'line');
      y += 1;
    });
  });

  if (model.remarks) {
    y += 26;
    const headF = { size: 15, weight: 700 };
    rect(PAD, y, 4, 22, 'common');
    text(OUT.remarks, PAD + 14, y + 11, headF, 'ink');
    y += 32;
    const bodyF = { size: 13.5, weight: 400 };
    const lines = wrapText(model.remarks, inner - 12, bodyF, measure);
    block(lines, PAD + 2, y, 21, bodyF, 'ink');
    y += lines.length * 21;
  }

  if (opts.legend) {
    y += 20;
    rect(PAD, y, inner, 1, 'line');
    y += 12;
    const legF = { size: 12, weight: 400 };
    const lines = wrapText(OUT.legend, inner, legF, measure);
    block(lines, PAD, y, 18, legF, 'muted');
    y += lines.length * 18;
  }
  y += PAD;
  return { width: W, height: Math.ceil(y), ops, noteColumn: withNotes };
}

/* ---------- 畫到 canvas ---------- */

const FAMILY = fontFamilyCss(PNG_FONT_FAMILY);
export const fontString = (f: FontSpec) => `${f.weight} ${f.size}px ${FAMILY}`;

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 用 canvas 量字寬（同一個字型同一個字只量一次） */
export function canvasMeasure(ctx: Ctx2D): MeasureFn {
  const cache = new Map<string, number>();
  return (s, f) => {
    const font = fontString(f);
    const key = `${font}\u0000${s}`;
    let w = cache.get(key);
    if (w === undefined) {
      ctx.font = font;
      w = ctx.measureText(s).width;
      cache.set(key, w);
    }
    return w;
  };
}

/** 依排版畫圖；scale＝輸出倍率（canvas 的大小要先設好：寬 layout.width × scale） */
export function paintPng(ctx: Ctx2D, layout: PngLayout, theme: PngTheme, scale: number): void {
  const pal = PALETTES[theme];
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, layout.width, layout.height);
  for (const op of layout.ops) {
    if (op.t === 'rect') {
      ctx.fillStyle = pal[op.color];
      if (op.r && 'roundRect' in ctx) {
        ctx.beginPath();
        ctx.roundRect(op.x, op.y, op.w, op.h, op.r);
        ctx.fill();
      } else ctx.fillRect(op.x, op.y, op.w, op.h);
      continue;
    }
    ctx.font = fontString(op.font);
    ctx.fillStyle = pal[op.color];
    ctx.textAlign = op.align;
    ctx.textBaseline = 'middle';
    ctx.fillText(op.text, op.x, op.y);
  }
  ctx.restore();
}

/** 表裡用到的所有字（載入字型用） */
export function modelText(model: TableModel): string {
  const parts = [model.title, model.remarks, OUT.legend, OUT.remarks, ...Object.values(OUT.cols)];
  for (const [a, b] of model.meta) parts.push(a, b);
  for (const s of model.sections) {
    parts.push(s.title);
    for (const c of s.cats) {
      parts.push(c.title);
      for (const r of c.rows) parts.push(r.name, r.value, r.note);
    }
  }
  return Array.from(new Set(Array.from(parts.join('')))).join('');
}

/** 先載入 Noto Sans TC（只下載用到的字；載不到時用系統字型） */
export async function loadPngFonts(model: TableModel): Promise<void> {
  const chars = modelText(model);
  await Promise.all([
    ensureFont(PNG_FONT_FAMILY, 400, chars, { timeoutMs: 5000 }),
    ensureFont(PNG_FONT_FAMILY, 700, chars, { timeoutMs: 5000 }),
  ]);
}

/** canvas 一邊的上限（瀏覽器多半是 32,767 px）；表很長時倍率跟著降低 */
export const MAX_CANVAS_SIDE = 32000;

/** 實際的倍率：想要的倍率，但高度不超過 MAX_CANVAS_SIDE */
export const effectiveScale = (layout: PngLayout, scale: number) =>
  Math.min(scale, MAX_CANVAS_SIDE / layout.height);

let probeCtx: CanvasRenderingContext2D | null = null;

/** 量字用的 canvas（共用一個） */
export function measureContext(): CanvasRenderingContext2D {
  if (!probeCtx) probeCtx = document.createElement('canvas').getContext('2d');
  if (!probeCtx) throw new Error('無法建立畫布');
  return probeCtx;
}

/** 排版＋畫圖，回傳畫好的 canvas（下載、複製用；預覽另外畫在畫面上的 canvas） */
export function renderPng(model: TableModel, opts: PngOptions, scale = PNG_SCALE) {
  const layout = layoutPng(model, opts, canvasMeasure(measureContext()));
  const s = effectiveScale(layout, scale);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(layout.width * s);
  canvas.height = Math.round(layout.height * s);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('無法建立畫布');
  paintPng(ctx, layout, opts.theme, s);
  return { canvas, layout };
}
