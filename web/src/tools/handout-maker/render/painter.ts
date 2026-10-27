/**
 * 主題共用的畫法：標題、印章、附圖、本文（含塗黑、分欄）。各主題（themes.ts）用它們排出自己的版面。
 */
import { FONT_SPECS, type FontSpec } from '../fonts';
import { type FlowRow, flowPlain, flowText, imageBox, splitColumns } from '../layout';
import { parseBody, type Segment } from '../markup';
import { type Align, type Handout, resolveFontId, type StampId } from '../model';
import { type Ctx, drawRows, measurer, roundRectPath, rowHeight, type TextStyle } from './canvas';
import { filteredImage, type ImageCache } from './images';
import { drawStamp } from './stamps';

export type Bitmap = CanvasImageSource & { width: number; height: number };

export interface PaintEnv {
  /** 畫布倍率（匯出 2 倍＝2；陰影、濾鏡的像素用） */
  scale: number;
  /** 附圖（原圖） */
  image: Bitmap | null;
  /** 背景圖（原圖） */
  bgImage: Bitmap | null;
  /** 濾鏡結果的快取（預覽用） */
  cache?: ImageCache;
}

export interface PaintResult {
  /** 內容超出畫面（有字或圖沒有畫出來） */
  overflow: boolean;
}

/** 印章的大小（同原作 2.5rem） */
export const STAMP_SIZE = 40;

export class Painter {
  readonly font: FontSpec;
  readonly W: number;
  readonly H: number;
  overflow = false;

  constructor(
    readonly ctx: Ctx,
    readonly h: Handout,
    readonly env: PaintEnv,
  ) {
    this.font = FONT_SPECS[resolveFontId(h)];
    this.W = h.width;
    this.H = h.height;
  }

  get ink(): string {
    return this.h.textColor;
  }

  /** 這張的字型（字重預設 regular） */
  style(o: Partial<TextStyle> & { size: number; lineHeight: number }): TextStyle {
    return {
      family: this.font.family,
      weight: this.font.regular,
      color: this.ink,
      ...o,
    };
  }

  /** 標題用的字型（粗體） */
  titleStyle(size: number, o: Partial<TextStyle> = {}): TextStyle {
    return this.style({ size, lineHeight: 1.3, weight: this.font.bold, ...o });
  }

  /** 排一段一般文字（標題等） */
  flowPlain(text: string, s: TextStyle, width: number, align: Align = 'left'): FlowRow[] {
    if (!text.trim()) return [];
    return flowPlain(text.trim(), {
      width,
      measure: measurer(this.ctx, s),
      letterSpacing: s.letterSpacing,
      align: align === 'justify' ? 'left' : align,
    });
  }

  /** 畫一段排好的行；回傳高度 */
  drawRows(rows: readonly FlowRow[], x: number, y: number, s: TextStyle): number {
    if (rows.length) drawRows(this.ctx, rows, x, y, s, this.env.scale);
    return rows.length * rowHeight(s);
  }

  /** 標題（多行時換行）；回傳高度（沒有標題時 0） */
  title(
    text: string,
    x: number,
    y: number,
    w: number,
    s: TextStyle,
    align: Align = 'left',
  ): number {
    return this.drawRows(this.flowPlain(text, s, w, align), x, y, s);
  }

  stamp(x: number, y: number, size = STAMP_SIZE, color = this.ink, alpha = 0.8): void {
    drawStamp(this.ctx, this.h.stamp as StampId, x, y, size, color, alpha);
  }

  get hasStamp(): boolean {
    return this.h.stamp !== 'none';
  }

  /** 附圖的顯示大小（沒有附圖時 null） */
  imageSize(
    contentW: number,
    percent = this.h.imageSize,
  ): { width: number; height: number } | null {
    const img = this.env.image;
    if (!img || !this.h.image) return null;
    const b = imageBox({ width: img.width, height: img.height }, contentW, percent);
    return b.width > 0 ? b : null;
  }

  /** 附圖（套濾鏡）畫在 (x, y)、w × h；圓角、細框 */
  drawImage(
    x: number,
    y: number,
    w: number,
    hgt: number,
    o: { radius?: number; border?: string | null; backdrop?: string } = {},
  ): void {
    const img = this.env.image;
    if (!img || !this.h.image) return;
    const src: CanvasImageSource =
      filteredImage(
        img,
        this.h.image.id,
        this.h.imageFilter,
        w,
        hgt,
        this.env.scale,
        this.env.cache,
      ) ?? img;
    const { ctx } = this;
    const r = o.radius ?? 6;
    ctx.save();
    ctx.beginPath();
    roundRectPath(ctx, x, y, w, hgt, r);
    ctx.clip();
    if (o.backdrop) {
      ctx.fillStyle = o.backdrop;
      ctx.fillRect(x, y, w, hgt);
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, x, y, w, hgt);
    ctx.restore();
    if (o.border !== null) {
      ctx.save();
      ctx.beginPath();
      roundRectPath(ctx, x + 0.5, y + 0.5, w - 1, hgt - 1, Math.max(0, r - 0.5));
      ctx.strokeStyle = o.border ?? 'rgba(0, 0, 0, 0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }

  /** 置中的附圖區塊：回傳佔用的高度（沒有附圖時 0） */
  imageBlock(x: number, y: number, w: number, o: Parameters<Painter['drawImage']>[4] = {}): number {
    const b = this.imageSize(w);
    if (!b) return 0;
    this.drawImage(x + (w - b.width) / 2, y, b.width, b.height, o);
    return b.height;
  }

  /** 本文的片段（終端機加上提示字元與游標） */
  bodyLines(o: { prefix?: string; cursor?: string } = {}): Segment[][] {
    const lines = parseBody(this.h.body).map((l) => l.map((s) => ({ ...s })));
    if (o.prefix || o.cursor) {
      if (!lines.length) lines.push([]);
      if (o.prefix) lines[0].unshift({ text: o.prefix, censored: false });
      if (o.cursor) lines[lines.length - 1].push({ text: o.cursor, censored: false });
    }
    return lines;
  }

  /** 排本文 */
  flowBody(lines: Segment[][], w: number, s: TextStyle, align: Align): FlowRow[] {
    return flowText(lines, {
      width: w,
      measure: measurer(this.ctx, s),
      letterSpacing: s.letterSpacing,
      censorPad: Math.max(2, s.size * 0.25),
      align,
    });
  }

  /**
   * 本文區塊：從 y 排到 bottom（放得下的行才畫），超出時記下 overflow。columns 兩欄以上時平均分欄。
   */
  body(
    x: number,
    y: number,
    w: number,
    bottom: number,
    s: TextStyle,
    align: Align,
    o: { prefix?: string; cursor?: string; columns?: number; gap?: number; rule?: string } = {},
  ): void {
    const lines = this.bodyLines(o);
    if (!lines.length) return;
    const n = Math.max(1, o.columns ?? 1);
    const gap = o.gap ?? 24;
    const colW = (w - gap * (n - 1)) / n;
    const rows = this.flowBody(lines, colW, s, align);
    const lh = rowHeight(s);
    const maxRows = Math.max(0, Math.floor((bottom - y) / lh + 1e-6));
    const { columns, clipped } = splitColumns(rows, n, maxRows);
    if (clipped) this.overflow = true;
    columns.forEach((col, i) => {
      this.drawRows(col, x + i * (colW + gap), y, s);
    });
    if (o.rule && n > 1 && columns[1]?.length) {
      const used = Math.max(...columns.map((c) => c.length)) * lh;
      const { ctx } = this;
      ctx.save();
      ctx.fillStyle = o.rule;
      for (let i = 1; i < n; i++) ctx.fillRect(x + i * (colW + gap) - gap / 2 - 0.5, y, 1, used);
      ctx.restore();
    }
  }

  /** 從 y 開始還放得下東西嗎（放不下時記 overflow） */
  check(y: number, bottom: number): boolean {
    if (y > bottom + 0.5) {
      this.overflow = true;
      return false;
    }
    return true;
  }

  /** 標題、印章並排的一列：標題在左（寬度扣掉印章），印章靠右上；回傳這一列的高度 */
  headerRow(
    text: string,
    x: number,
    y: number,
    w: number,
    s: TextStyle,
    align: Align,
    o: { stampSize?: number; gap?: number } = {},
  ): number {
    const size = o.stampSize ?? STAMP_SIZE;
    const gap = o.gap ?? 12;
    const tw = this.hasStamp ? w - size - gap : w;
    const rows = this.flowPlain(text, s, tw, align);
    const th = rows.length * rowHeight(s);
    const hgt = Math.max(th, this.hasStamp ? size : 0);
    this.drawRows(rows, x, y + (rows.length && th < hgt ? (hgt - th) / 2 : 0), s);
    if (this.hasStamp) this.stamp(x + w - size, y + (th > size ? (th - size) / 2 : 0), size);
    return hgt;
  }
}
