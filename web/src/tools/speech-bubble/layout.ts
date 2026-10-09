/**
 * 排版（規格 3.1、3.3）：量文字、換行、算每個泡泡的大小與內容的位置，再把泡泡排到畫布上。
 * 純函式；字寬由 measure 提供（瀏覽器用 canvas，單元測試用假的）。
 */
import { type FontValue, fontCss } from '@/core/fonts';
import { anchorRatio } from '@/core/typeset/fit';
import type { MeasureFn } from '@/core/typeset/measure';
import { breakText } from '@/core/typeset/wrap';
import { type Bubble, MAX_CANVAS, type SbData, singleLine } from './model';
import { type StyleSpec, styleOf } from './styles';

export interface TextLine {
  chars: string[];
  /** 每個字的前進寬度 */
  adv: number[];
  w: number;
  /** 行的左緣（相對於泡泡左上角） */
  x: number;
  /** 行的中線 y（相對於泡泡左上角） */
  cy: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Extents {
  l: number;
  t: number;
  r: number;
  b: number;
}

export interface BubbleLayout {
  spec: StyleSpec;
  /** 內文字級、行高 */
  fs: number;
  lineH: number;
  /** 標題字級 */
  ts: number;
  font: string;
  titleFont: string;
  buttonFont: string;
  lines: TextLine[];
  /** 內文的總字數（字素） */
  chars: number;
  title: string;
  titleW: number;
  /** 標題的左緣與中線（相對於泡泡左上角；outside 時在泡泡外面） */
  titleX: number;
  titleCy: number;
  button: string;
  buttonW: number;
  buttonBox: Rect | null;
  icon: { cx: number; cy: number; size: number } | null;
  /** 泡泡本體（不含尾巴、名字、陰影）的寬高 */
  w: number;
  h: number;
  /** 標題列的高度（bar） */
  barH: number;
  /** 左邊實心標籤的寬（label） */
  labelW: number;
  /** 名牌（tag） */
  tagBox: Rect | null;
  /** 內容區（扣掉內距、標籤、圖示）的範圍 */
  content: Rect;
  /** 尾巴尖端的 x（相對於泡泡左上角） */
  tailX: number;
  /** 畫出來會超出本體的範圍 */
  ext: Extents;
  align: Bubble['align'];
}

export interface LayoutOptions {
  font: FontValue;
  fontSize: number;
  lineHeight: number;
  wrapWidth: number;
  shadow: boolean;
}

export const boldWeight = (w: number): number => Math.min(900, Math.max(700, w));

/** 字寬快取（同一個字型字串＋字） */
export function cachedUnit(measure: MeasureFn) {
  const cache = new Map<string, number>();
  return (font: string, ch: string): number => {
    const k = `${font}\u0000${ch}`;
    let v = cache.get(k);
    if (v === undefined) {
      v = measure(font, ch).w;
      cache.set(k, v);
    }
    return v;
  };
}

type Unit = (font: string, ch: string) => number;

const graphemes = (s: string): string[] => {
  const Seg = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg)
    return Array.from(new Seg('zh-Hant', { granularity: 'grapheme' }).segment(s), (x) => x.segment);
  return Array.from(s);
};

const widthOf = (unit: Unit, font: string, s: string): number =>
  graphemes(s).reduce((sum, ch) => sum + unit(font, ch), 0);

/** 一個泡泡的版面（規格 3.3） */
export function layoutBubble(b: Bubble, o: LayoutOptions, unit: Unit): BubbleLayout {
  const spec = styleOf(b.style);
  const fs = o.fontSize;
  const lineH = fs * o.lineHeight;
  const ts = Math.round(fs * spec.titleScale * 10) / 10;
  const titleLH = ts * 1.35;
  const font = fontCss(o.font, fs);
  const titleFont = fontCss(
    { family: o.font.family, weight: spec.titleBold ? boldWeight(o.font.weight) : o.font.weight },
    ts,
  );
  const bs = Math.round(fs * 0.72 * 10) / 10;
  const buttonFont = fontCss({ family: o.font.family, weight: boldWeight(o.font.weight) }, bs);

  /* 內文：保留原本的換行，超過寬度上限自動換行（中文逐字、英文單字不切、避頭尾） */
  const text = b.text.replace(/\s+$/, '');
  const raw = text
    ? breakText(text, { limit: o.wrapWidth, unit: (ch) => unit(font, ch), segment: 'grapheme' })
    : [];
  const lines: TextLine[] = raw.map((chars) => {
    const adv = chars.map((ch) => unit(font, ch));
    return { chars, adv, w: adv.reduce((s, v) => s + v, 0), x: 0, cy: 0 };
  });
  const textW = lines.reduce((m, l) => Math.max(m, l.w), 0);
  const textH = lines.length * lineH;
  const chars = lines.reduce((s, l) => s + l.chars.length, 0);

  const title = singleLine(b.title).trim();
  const hasTitle = title !== '';
  const titleW = hasTitle ? widthOf(unit, titleFont, title) : 0;
  const button = spec.button ? singleLine(b.button).trim() : '';
  const buttonW = button ? widthOf(unit, buttonFont, button) : 0;

  const [pt0, pr0, pb0, pl0] = spec.pad;
  const pt = pt0 * fs;
  const pr = pr0 * fs;
  const pb = pb0 * fs;
  const pl = pl0 * fs;

  /* 圖示欄 */
  const hasIcon = spec.icon !== 'none' && b.icon !== 'none';
  const iconSize = !hasIcon
    ? 0
    : spec.icon === 'badge'
      ? ts * 1.3
      : spec.icon === 'small'
        ? fs * 0.62
        : fs * 1.6;
  const iconGap = !hasIcon ? 0 : spec.icon === 'badge' ? ts * 0.55 : fs * 0.6;
  const iconCol = hasIcon ? iconSize + iconGap : 0;

  /* 內容（標題＋內文） */
  const gapTT = fs * 0.25;
  const sideGap = fs * 0.7;
  const mode = spec.titleMode;
  let cW: number;
  let cH: number;
  if (mode === 'above') {
    cW = Math.max(titleW, textW);
    cH = (hasTitle ? titleLH : 0) + (hasTitle && lines.length ? gapTT : 0) + textH;
  } else if (mode === 'side') {
    const sideW = hasTitle ? titleW + (lines.length ? sideGap : 0) : 0;
    cW = sideW + textW;
    cH = Math.max(hasTitle ? Math.max(titleLH, lineH) : 0, textH);
  } else {
    cW = textW;
    cH = textH;
  }
  let innerW = iconCol + cW;
  let innerH = Math.max(cH, iconSize);
  const blockH = innerH;
  const btnH = button ? bs * 2.1 : 0;
  const btnW = button ? buttonW + bs * 2.4 : 0;
  if (button) {
    innerH += (blockH > 0 ? fs * 0.7 : 0) + btnH;
    innerW = Math.max(innerW, btnW);
  }

  let barH = 0;
  let labelW = 0;
  let w = pl + innerW + pr;
  let h = pt + innerH + pb;
  if (mode === 'bar') {
    barH = Math.round(ts * 2.2);
    h += barH;
    w = Math.max(w, pl + titleW + ts * 5 + pr);
    if (spec.id === 'terminal') w = Math.max(w, titleW + ts * 10);
  }
  if (mode === 'label' && hasTitle) {
    labelW = titleW + ts * 1.7;
    w += labelW;
  }
  let tagBox: Rect | null = null;
  if (mode === 'tag' && hasTitle) {
    const tagH = ts * 1.75;
    const tagW = titleW + ts * 1.6;
    tagBox = { x: fs * 0.9, y: -tagH / 2, w: tagW, h: tagH };
    w = Math.max(w, tagW + fs * 1.8);
  }
  w = Math.max(w, spec.minW * fs);
  h = Math.max(h, spec.minH * fs);
  if (spec.id === 'sticky') h = Math.max(h, w * 0.62);
  if (spec.id === 'capsule') w = Math.max(w, h * 1.6);
  if (spec.id === 'speech' || spec.id === 'thought' || spec.id === 'shout') {
    /* 橢圓：內容要放進橢圓裡，外框比內容框大一圈 */
    w = Math.max(w, (pl + innerW + pr) * 1.12);
    h = Math.max(h, (pt + innerH + pb) * 1.18);
  }
  w = Math.round(w * 10) / 10;
  h = Math.round(h * 10) / 10;

  /* 內容區：扣掉內距、標題列、標籤、圖示；最小尺寸撐大時內容上下置中 */
  const used = pt + barH + innerH + pb;
  const top = pt + barH + Math.max(0, (h - used) / 2);
  const areaLeft = pl + labelW;
  const areaW = w - pl - pr - labelW;
  const contentLeft = areaLeft + iconCol;
  const contentW = areaW - iconCol;
  const content: Rect = { x: contentLeft, y: top, w: contentW, h: innerH };

  /* 標題與內文的位置 */
  const center = spec.textAlign === 'center';
  const placeLine = (lw: number, left: number, width: number) =>
    center ? left + (width - lw) / 2 : left;
  let titleX = 0;
  let titleCy = 0;
  let textTop = top;
  let textLeft = contentLeft;
  let textAreaW = contentW;
  if (mode === 'above') {
    if (hasTitle) {
      /* 置中的造型：標題與內文一起置中（內容寬＝兩者較寬的） */
      titleX = placeLine(titleW, contentLeft, contentW);
      titleCy = top + titleLH / 2;
      textTop = top + titleLH + (lines.length ? gapTT : 0);
    }
  } else if (mode === 'side') {
    const sideW = hasTitle ? titleW + (lines.length ? sideGap : 0) : 0;
    const blockW = sideW + textW;
    const blockLeft = placeLine(blockW, contentLeft, contentW);
    titleX = blockLeft;
    titleCy = top + Math.max(titleLH, lineH) / 2;
    textTop =
      top + Math.max(0, (Math.max(hasTitle ? Math.max(titleLH, lineH) : 0, textH) - textH) / 2);
    textLeft = blockLeft + sideW;
    textAreaW = textW;
  } else if (mode === 'bar') {
    titleCy = barH / 2;
    titleX = spec.id === 'terminal' ? (w - titleW) / 2 : pl * 0.75;
  } else if (mode === 'label') {
    titleX = (labelW - titleW) / 2;
    titleCy = h / 2;
  } else if (mode === 'tag' && tagBox) {
    titleX = tagBox.x + (tagBox.w - titleW) / 2;
    titleCy = 0;
  }
  const blockTextW = mode === 'side' ? textW : center ? contentW : textW;
  lines.forEach((l, i) => {
    l.x =
      mode === 'side'
        ? center
          ? textLeft + (textAreaW - l.w) / 2
          : textLeft
        : placeLine(l.w, textLeft, center ? textAreaW : blockTextW);
    l.cy = textTop + i * lineH + lineH / 2;
  });
  /* 左側標題對齊內文的第一行 */
  if (mode === 'side' && lines.length) titleCy = lines[0].cy;

  let icon: BubbleLayout['icon'] = null;
  if (hasIcon) {
    const cx = contentLeft - iconGap - iconSize / 2;
    let cy: number;
    if (spec.icon === 'badge') cy = hasTitle ? titleCy : (lines[0]?.cy ?? top + iconSize / 2);
    else if (spec.icon === 'avatar') cy = top + iconSize / 2;
    else cy = top + Math.max(cH, iconSize) / 2;
    icon = { cx, cy, size: iconSize };
  }
  const buttonBox: Rect | null = button
    ? { x: w - pr - btnW, y: top + innerH - btnH, w: btnW, h: btnH }
    : null;

  /* 超出本體的範圍：名字、名牌、尾巴、光暈、陰影 */
  const ext: Extents = { l: 2, t: 2, r: 2, b: 2 };
  if (mode === 'outside' && hasTitle) {
    ext.t += titleLH + fs * 0.15;
    titleCy = -(titleLH / 2 + fs * 0.15);
    titleX =
      b.align === 'right'
        ? w - titleW - fs * 0.3
        : b.align === 'center'
          ? (w - titleW) / 2
          : fs * 0.3;
  }
  if (tagBox) ext.t = Math.max(ext.t, tagBox.h / 2 + 2);
  if (spec.tail === 'hook') {
    ext.b += fs * 0.4;
    if (b.align === 'left') ext.l += fs * 0.35;
    if (b.align === 'right') ext.r += fs * 0.35;
  }
  if (spec.tail === 'point') ext.b += fs * 1.25;
  if (spec.tail === 'dots') ext.b += fs * 1.8;
  const ov = spec.overflow * fs;
  ext.l += ov;
  ext.r += ov;
  ext.t += ov;
  ext.b += ov;
  if (spec.shadow && o.shadow) {
    const blur = fs * 0.6;
    const off = fs * 0.22;
    ext.l += blur;
    ext.r += blur;
    ext.t += Math.max(0, blur - off);
    ext.b += blur + off;
  }
  /* 尾巴的位置：訊息泡泡在角落，漫畫、想法泡泡在底部約三成處 */
  const inset = spec.tail === 'hook' ? fs * 1.1 : w * 0.28;
  const tailX = b.align === 'right' ? w - inset : b.align === 'center' ? w / 2 : inset;

  return {
    spec,
    fs,
    lineH,
    ts,
    font,
    titleFont,
    buttonFont,
    lines,
    chars,
    title,
    titleW,
    titleX,
    titleCy,
    button,
    buttonW,
    buttonBox,
    icon,
    w,
    h,
    barH,
    labelW,
    tagBox,
    content,
    tailX,
    ext,
    align: b.align,
  };
}

/* ---------- 排列 ---------- */

export interface Placed {
  /** 泡泡在清單裡的位置 */
  index: number;
  layout: BubbleLayout;
  /** 本體左上角在畫布上的位置 */
  x: number;
  y: number;
  /** 旋轉（度；便利貼本身的歪斜＋疊放的歪斜） */
  rotate: number;
}

/** 本體連同超出範圍、旋轉之後的外接框（相對於本體左上角） */
export function visualBox(L: BubbleLayout, rotateDeg: number) {
  const x0 = -L.ext.l;
  const y0 = -L.ext.t;
  const x1 = L.w + L.ext.r;
  const y1 = L.h + L.ext.b;
  if (!rotateDeg) return { x0, y0, x1, y1 };
  const a = (rotateDeg * Math.PI) / 180;
  const cx = L.w / 2;
  const cy = L.h / 2;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const pts = [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ].map(([px, py]) => [
    cx + (px - cx) * cos - (py - cy) * sin,
    cy + (px - cx) * sin + (py - cy) * cos,
  ]);
  return {
    x0: Math.min(...pts.map((p) => p[0])),
    y0: Math.min(...pts.map((p) => p[1])),
    x1: Math.max(...pts.map((p) => p[0])),
    y1: Math.max(...pts.map((p) => p[1])),
  };
}

/** 疊放時第 k 張的歪斜（度）：左右交替 1～2 度 */
export const pileTilt = (k: number): number =>
  k === 0 ? 0 : (k % 2 ? 1 : -1) * (1 + ((k * 37) % 10) / 10);

export interface Arranged {
  items: Placed[];
  /** 內容的寬高（左上角是 0, 0） */
  width: number;
  height: number;
}

/**
 * 排列（規格 3.3）：order 是出現的順序（清單位置的陣列），疊放時越晚出現的越上面、越往右上。
 */
export function arrangeBubbles(
  layouts: readonly { index: number; layout: BubbleLayout }[],
  o: Pick<SbData, 'arrange' | 'columns' | 'gap' | 'indent'>,
  order: readonly number[],
): Arranged {
  if (!layouts.length) return { items: [], width: 0, height: 0 };
  const rank = new Map(order.map((idx, k) => [idx, k]));
  const items: Placed[] = layouts.map(({ index, layout }) => ({
    index,
    layout,
    x: 0,
    y: 0,
    rotate: layout.spec.tilt + (o.arrange === 'pile' ? pileTilt(rank.get(index) ?? 0) : 0),
  }));
  const boxes = items.map((it) => visualBox(it.layout, it.rotate));
  const vw = boxes.map((b) => b.x1 - b.x0);
  const vh = boxes.map((b) => b.y1 - b.y0);

  if (o.arrange === 'column') {
    const aligns = new Set(items.map((it) => it.layout.align));
    const mixed = aligns.size > 1;
    const W = Math.max(
      ...items.map((it, i) => vw[i] + (mixed && it.layout.align !== 'center' ? o.indent : 0)),
    );
    let y = 0;
    items.forEach((it, i) => {
      const a = it.layout.align;
      const vx = a === 'left' ? 0 : a === 'right' ? W - vw[i] : (W - vw[i]) / 2;
      it.x = vx - boxes[i].x0;
      it.y = y - boxes[i].y0;
      y += vh[i] + o.gap;
    });
    return { items, width: W, height: y - o.gap };
  }

  if (o.arrange === 'grid') {
    const C = Math.max(1, Math.min(o.columns, items.length));
    const colW = Math.max(...vw);
    const rows = Math.ceil(items.length / C);
    let y = 0;
    for (let r = 0; r < rows; r++) {
      const row = items.slice(r * C, r * C + C);
      const rowH = Math.max(...row.map((_, j) => vh[r * C + j]));
      row.forEach((it, j) => {
        const i = r * C + j;
        const a = it.layout.align;
        const cellX = j * (colW + o.gap);
        const vx = a === 'left' ? 0 : a === 'right' ? colW - vw[i] : (colW - vw[i]) / 2;
        it.x = cellX + vx - boxes[i].x0;
        it.y = y - boxes[i].y0;
      });
      y += rowH + o.gap;
    }
    return { items, width: C * colW + (C - 1) * o.gap, height: y - o.gap };
  }

  /* 疊放、輪流：以本體中心對齊，算完再整體平移到左上角 0, 0 */
  items.forEach((it, i) => {
    const k = rank.get(it.index) ?? i;
    const ox = o.arrange === 'pile' ? k * o.gap : 0;
    const oy = o.arrange === 'pile' ? -k * o.gap * 0.55 : 0;
    /* 輪流：外觀範圍（含名字、尾巴）的中心對齊；疊放：本體中心對齊 */
    const cx = o.arrange === 'swap' ? (boxes[i].x0 + boxes[i].x1) / 2 : it.layout.w / 2;
    const cy = o.arrange === 'swap' ? (boxes[i].y0 + boxes[i].y1) / 2 : it.layout.h / 2;
    it.x = ox - cx;
    it.y = oy - cy;
  });
  const x0 = Math.min(...items.map((it, i) => it.x + boxes[i].x0));
  const y0 = Math.min(...items.map((it, i) => it.y + boxes[i].y0));
  const x1 = Math.max(...items.map((it, i) => it.x + boxes[i].x1));
  const y1 = Math.max(...items.map((it, i) => it.y + boxes[i].y1));
  for (const it of items) {
    it.x -= x0;
    it.y -= y0;
  }
  return { items, width: x1 - x0, height: y1 - y0 };
}

export interface CanvasPlan {
  width: number;
  height: number;
  /** 內容左上角在畫布上的位置 */
  ox: number;
  oy: number;
  /** 內容比畫布大（自訂畫布時會被裁掉） */
  overflow: boolean;
}

/** 畫布大小與內容的位置（規格 3.1） */
export function planCanvas(
  content: { width: number; height: number },
  o: Pick<SbData, 'canvasMode' | 'margin' | 'width' | 'height' | 'anchor'>,
): CanvasPlan {
  const m = o.margin;
  if (o.canvasMode === 'auto') {
    const wantW = Math.ceil(content.width + 2 * m - 1e-6);
    const wantH = Math.ceil(content.height + 2 * m - 1e-6);
    const width = Math.max(1, Math.min(MAX_CANVAS, wantW));
    const height = Math.max(1, Math.min(MAX_CANVAS, wantH));
    /* 進位多出來的不到 1 px 平均分到兩邊 */
    return {
      width,
      height,
      ox: m + (width - (content.width + 2 * m)) / 2,
      oy: m + (height - (content.height + 2 * m)) / 2,
      overflow: wantW > MAX_CANVAS || wantH > MAX_CANVAS,
    };
  }
  const { x: ax, y: ay } = anchorRatio(o.anchor);
  const width = o.width;
  const height = o.height;
  return {
    width,
    height,
    ox: m + (width - 2 * m - content.width) * ax,
    oy: m + (height - 2 * m - content.height) * ay,
    overflow: content.width + 2 * m > width + 0.5 || content.height + 2 * m > height + 0.5,
  };
}
