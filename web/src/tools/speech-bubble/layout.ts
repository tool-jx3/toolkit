/**
 * 排版（規格 3.1、3.3）：量文字、換行、算每個泡泡的大小與內容的位置，再把泡泡排到畫布上。
 * 純函式；字寬由 measure 提供（瀏覽器用 canvas，單元測試用假的）。
 * 2026-10：樣式的其他項目（字距、對齊、內距、圓角、尾巴與角、陰影、說話者與日期…，`LayoutOptions.fmt`）；
 * 不給或是預設值時，每一個數值的算法都和以前相同（沒用到新功能時輸出不變）。
 * 2026-10 第二步：內文的部分文字格式（`LayoutInput.rich`）與整個內文的斜體、刪除線、底線（3.15）——
 * 每個字記著自己的字型與裝飾（`TextLine.fx`）；沒有格式時走原本的排法（`fx` 不給）。
 */
import { type FontValue, fontCss } from '@/core/fonts';
import type { RichDoc, RichRun } from '@/core/richtext';
import { anchorRatio } from '@/core/typeset/fit';
import { splitChars } from '@/core/typeset/graphemes';
import type { MeasureFn } from '@/core/typeset/measure';
import { breakText, wrapChars } from '@/core/typeset/wrap';
import {
  type Bubble,
  type CornerId,
  DEFAULT_FMT,
  type Fmt,
  MAX_CANVAS,
  type MetaModeId,
  type SbData,
  singleLine,
} from './model';
import { type StyleSpec, styleOf, type TailKind } from './styles';

export interface TextLine {
  chars: string[];
  /** 每個字的前進寬度（含字距） */
  adv: number[];
  w: number;
  /** 行的左緣（相對於泡泡左上角） */
  x: number;
  /** 行的中線 y（相對於泡泡左上角） */
  cy: number;
  /** 每個字的格式（有部分格式或整個內文的斜體／刪除線／底線時才有；長度同 chars） */
  fx?: CharFx[];
}

/** 一個字的格式（同樣格式的字共用同一個物件） */
export interface CharFx {
  /** canvas 的字型（粗體、斜體已算進去） */
  font: string;
  /** 文字顏色；null＝泡泡的內文色 */
  color: string | null;
  strike: boolean;
  underline: boolean;
  /** 螢光筆的顏色；null＝沒有 */
  highlight: string | null;
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

/** 說話者與日期的版面（相對於泡泡本體左上角；本體外的部分算進 ext） */
export interface MetaLayout {
  mode: Exclude<MetaModeId, 'off'>;
  color: string;
  /** 字級、行高 */
  size: number;
  lh: number;
  /** 名字（粗體）與日期時間的字型 */
  nameFont: string;
  timeFont: string;
  speaker: string;
  time: string;
  nameW: number;
  timeW: number;
  /** 名字、日期時間、中間的「・」的左緣與中線；沒有就是 null */
  name: { x: number; cy: number } | null;
  timeAt: { x: number; cy: number } | null;
  sep: { x: number; cy: number } | null;
  /** 泡泡內時的分隔線 */
  divider: { x0: number; x1: number; y: number } | null;
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
  /* ---- 2026-10 的樣式（預設值時畫法和以前相同） ---- */
  /** 實際的尾巴（「尾巴與角」選了沒有尾巴時是 none） */
  tail: TailKind;
  corner: CornerId;
  /** 圓角（畫布 px）；null＝造型預設 */
  radius: number | null;
  /** 邊框粗細的倍數 */
  borderScale: number;
  /** 柔和陰影：跟著「版面」（auto）／一律開／一律關 */
  softShadow: Fmt['softShadow'];
  /** 底部實色陰影 */
  solid: { color: string; offset: number } | null;
  /** 想法泡泡的雲朵大小 */
  puff: number;
  /** 字距（畫布 px） */
  ls: number;
  meta: MetaLayout | null;
}

export interface LayoutOptions {
  font: FontValue;
  fontSize: number;
  lineHeight: number;
  wrapWidth: number;
  shadow: boolean;
  /**
   * 2026-10：樣式的其他項目（不給＝預設，和以前相同）。字型、字級、行距已經換算進上面三個欄位，
   * 這裡的 font／fontSize／lineHeight 不看。
   */
  fmt?: Fmt;
  /** 說話者與日期的字型（不給＝和內文相同） */
  metaFont?: FontValue;
}

/** 排版需要的泡泡內容（測試、縮圖可以只給這些） */
export type LayoutInput = Pick<Bubble, 'style' | 'title' | 'text' | 'icon' | 'button' | 'align'> & {
  speaker?: string;
  time?: string;
  /** 內文的格式（docText(rich) 要等於 text；不一致時不用） */
  rich?: RichDoc;
};

export const boldWeight = (w: number): number => Math.min(900, Math.max(700, w));

/** 內文的格式（和內文不一致時不用） */
function richOf(rich: RichDoc, text: string): RichDoc | null {
  const joined = rich.lines.map((l) => l.runs.map((r) => r.text).join('')).join('\n');
  return joined === text ? rich : null;
}

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

export const widthOf = (unit: Unit, font: string, s: string): number =>
  graphemes(s).reduce((sum, ch) => sum + unit(font, ch), 0);

/**
 * 有格式的內文排成多行（規格 3.15）：換行的規則和純文字相同（`breakText`：保留原本的換行、中文逐字、英文單字不切、避頭尾），
 * 每個字用自己的字型量寬度（粗體、斜體）。換行時同一個字用它在這一段裡最寬的寫法估（不會超出寬度上限；
 * 只有顏色、刪除線、底線、螢光筆時和純文字完全相同），排好之後每個字用自己的寬度。
 */
function styledLines(
  text: string,
  rich: RichDoc | null,
  limit: number,
  fxOf: (r: RichRun | null) => CharFx,
  widthOf: (fx: CharFx, ch: string) => number,
): TextLine[] {
  const out: TextLine[] = [];
  text.split('\n').forEach((hard, li) => {
    /* 這一段每個字（字素）的格式：字素開頭那個字所在的片段 */
    const runs = rich?.lines[li]?.runs ?? [];
    const chars = hard ? splitChars(hard, 'grapheme') : [];
    const cells: { ch: string; fx: CharFx; w: number }[] = [];
    let pos = 0;
    let ri = 0;
    let rEnd = runs[0]?.text.length ?? 0;
    for (const ch of chars) {
      while (ri < runs.length - 1 && pos >= rEnd) {
        ri += 1;
        rEnd += runs[ri].text.length;
      }
      const fx = fxOf(runs[ri] ?? null);
      cells.push({ ch, fx, w: widthOf(fx, ch) });
      pos += ch.length;
    }
    if (!cells.length) {
      out.push({ chars: [], adv: [], w: 0, x: 0, cy: 0, fx: [] });
      return;
    }
    const widest = new Map<string, number>();
    for (const c of cells) widest.set(c.ch, Math.max(widest.get(c.ch) ?? 0, c.w));
    const wrapped = limit > 0 ? wrapChars(chars, limit, (ch) => widest.get(ch) ?? 0) : [chars];
    /* 換行時只會拿掉行頭、行尾的空白：依序對回原本的字 */
    let p = 0;
    for (const line of wrapped) {
      const lc: string[] = [];
      const adv: number[] = [];
      const fx: CharFx[] = [];
      for (const ch of line) {
        while (p < cells.length && cells[p].ch !== ch) p += 1;
        const c = cells[p] ?? { ch, fx: fxOf(null), w: 0 };
        p += 1;
        lc.push(ch);
        adv.push(c.w);
        fx.push(c.fx);
      }
      out.push({ chars: lc, adv, w: adv.reduce((s, v) => s + v, 0), x: 0, cy: 0, fx });
    }
  });
  return out;
}

/** 實際的尾巴：「全圓」沒有尾巴；「尖角」時訊息泡泡的小勾換成尖角（漫畫、想法泡泡照舊） */
export const effectiveTail = (spec: StyleSpec, corner: CornerId): TailKind =>
  corner === 'round' ? 'none' : corner === 'point' && spec.tail === 'hook' ? 'none' : spec.tail;

/** 一個泡泡的版面（規格 3.3） */
export function layoutBubble(b: LayoutInput, o: LayoutOptions, unit: Unit): BubbleLayout {
  const spec = styleOf(b.style);
  const f = o.fmt ?? DEFAULT_FMT;
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
  const ls = f.letterSpacing;
  const bodyUnit = ls ? (ch: string) => unit(font, ch) + ls : (ch: string) => unit(font, ch);

  /* 內文：保留原本的換行，超過寬度上限自動換行（中文逐字、英文單字不切、避頭尾） */
  const text = b.text.replace(/\s+$/, '');
  const rich = b.rich ? richOf(b.rich, b.text) : null;
  let lines: TextLine[];
  if (rich || f.italic || f.strike || f.underline) {
    /* 有格式：每個字用自己的字型（粗體、斜體）；刪除線、底線、顏色、螢光筆另外記著 */
    const cache = new Map<string, CharFx>();
    const fxOf = (r: RichRun | null): CharFx => {
      const bold = !!r?.bold;
      const italic = f.italic || !!r?.italic;
      const key = `${bold ? 1 : 0}${italic ? 1 : 0}${r?.color ?? ''}|${f.strike || r?.strike ? 1 : 0}${f.underline || r?.underline ? 1 : 0}|${r?.highlight ?? ''}`;
      let fx = cache.get(key);
      if (!fx) {
        fx = {
          font: fontCss(
            { family: o.font.family, weight: bold ? boldWeight(o.font.weight) : o.font.weight },
            fs,
            italic ? 'italic' : 'normal',
          ),
          color: r?.color || null,
          strike: f.strike || !!r?.strike,
          underline: f.underline || !!r?.underline,
          highlight: r?.highlight || null,
        };
        cache.set(key, fx);
      }
      return fx;
    };
    const fxUnit = ls
      ? (fx: CharFx, ch: string) => unit(fx.font, ch) + ls
      : (fx: CharFx, ch: string) => unit(fx.font, ch);
    lines = text ? styledLines(text, rich, o.wrapWidth, fxOf, fxUnit) : [];
  } else {
    const raw = text
      ? breakText(text, { limit: o.wrapWidth, unit: bodyUnit, segment: 'grapheme' })
      : [];
    lines = raw.map((chars) => {
      const adv = chars.map(bodyUnit);
      return { chars, adv, w: adv.reduce((s, v) => s + v, 0), x: 0, cy: 0 };
    });
  }
  const fitW = lines.reduce((m, l) => Math.max(m, l.w), 0);
  /* 寬度不貼合文字：內文的寬度固定是文字寬度上限 */
  const textW = f.fitWidth ? fitW : Math.max(fitW, o.wrapWidth);
  const textH = lines.length * lineH;
  const chars = lines.reduce((s, l) => s + l.chars.length, 0);

  const title = singleLine(b.title).trim();
  const hasTitle = title !== '';
  const titleW = hasTitle ? widthOf(unit, titleFont, title) : 0;
  const button = spec.button ? singleLine(b.button).trim() : '';
  const buttonW = button ? widthOf(unit, buttonFont, button) : 0;

  const [pt0, pr0, pb0, pl0] = spec.pad;
  const pt = pt0 * fs * f.padY;
  const pr = pr0 * fs * f.padX;
  const pb = pb0 * fs * f.padY;
  const pl = pl0 * fs * f.padX;

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

  /* 說話者與日期 */
  const speaker = singleLine(b.speaker ?? '').trim();
  const timeText = singleLine(b.time ?? '').trim();
  const metaMode = f.meta !== 'off' && (speaker || timeText) ? f.meta : null;
  const mFont = o.metaFont ?? o.font;
  const ms = Math.round(fs * f.metaScale * 10) / 10;
  const metaLH = ms * 1.3;
  const nameFont = fontCss({ family: mFont.family, weight: boldWeight(mFont.weight) }, ms);
  const timeFont = fontCss(mFont, ms);
  const nameW = metaMode && speaker ? widthOf(unit, nameFont, speaker) : 0;
  const timeW = metaMode && timeText ? widthOf(unit, timeFont, timeText) : 0;
  const sepW = speaker && timeText ? ms * 1.1 : 0;

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
  /* 說話者與日期在泡泡裡：最下面加一列（分隔線＋名字・日期時間） */
  const innerBase = innerH;
  const inside = metaMode === 'inside';
  const rowGap = ms * 0.7;
  const rowW = nameW + sepW + timeW;
  if (inside) {
    innerH += rowGap + metaLH;
    innerW = Math.max(innerW, rowW);
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

  /* 標題與內文的位置（文字對齊：造型預設或自己選的靠左／置中／靠右） */
  const ha = f.textAlign === 'auto' ? spec.textAlign : f.textAlign;
  const center = ha === 'center';
  const right = ha === 'right';
  const placeLine = (lw: number, left: number, width: number) =>
    center ? left + (width - lw) / 2 : right ? left + width - lw : left;
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
  const blockTextW = mode === 'side' ? textW : center || right ? contentW : textW;
  lines.forEach((l, i) => {
    l.x =
      mode === 'side'
        ? center
          ? textLeft + (textAreaW - l.w) / 2
          : right
            ? textLeft + textAreaW - l.w
            : textLeft
        : placeLine(l.w, textLeft, center || right ? textAreaW : blockTextW);
    l.cy = textTop + i * lineH + lineH / 2;
  });
  /* 左側標題對齊內文的第一行 */
  if (mode === 'side' && lines.length) titleCy = lines[0].cy;
  /* 文字上下微調（只移動內文） */
  if (f.textDy) for (const l of lines) l.cy += f.textDy;

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
    ? { x: w - pr - btnW, y: top + innerBase - btnH, w: btnW, h: btnH }
    : null;

  /* 超出本體的範圍：名字、名牌、尾巴、光暈、陰影 */
  const tail = effectiveTail(spec, f.corner);
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
  if (tail === 'hook') {
    ext.b += fs * 0.4;
    if (b.align === 'left') ext.l += fs * 0.35;
    if (b.align === 'right') ext.r += fs * 0.35;
  }
  if (tail === 'point') ext.b += fs * 1.25;
  if (tail === 'dots') ext.b += fs * 1.8;
  const ov = spec.overflow * fs * (spec.id === 'thought' ? f.cloudPuff : 1);
  ext.l += ov;
  ext.r += ov;
  ext.t += ov;
  ext.b += ov;
  const shadowExt = f.softShadow === 'auto' ? spec.shadow && o.shadow : f.softShadow === 'on';
  if (shadowExt) {
    const blur = fs * 0.6;
    const off = fs * 0.22;
    ext.l += blur;
    ext.r += blur;
    ext.t += Math.max(0, blur - off);
    ext.b += blur + off;
  }
  if (f.solidShadow) ext.b += f.solidOffset;

  /* 說話者與日期 */
  let meta: MetaLayout | null = null;
  if (metaMode) {
    meta = {
      mode: metaMode,
      color: f.metaColor,
      size: ms,
      lh: metaLH,
      nameFont,
      timeFont,
      speaker,
      time: timeText,
      nameW,
      timeW,
      name: null,
      timeAt: null,
      sep: null,
      divider: null,
    };
    if (inside) {
      const rowAlign = b.align === 'right' ? 'right' : ha;
      const rx =
        rowAlign === 'center'
          ? contentLeft + (contentW - rowW) / 2
          : rowAlign === 'right'
            ? contentLeft + contentW - rowW
            : contentLeft;
      const cy = top + innerBase + rowGap + metaLH / 2;
      if (speaker) meta.name = { x: rx, cy };
      if (sepW) meta.sep = { x: rx + nameW, cy };
      if (timeText) meta.timeAt = { x: rx + nameW + sepW, cy };
      meta.divider = {
        x0: contentLeft,
        x1: contentLeft + contentW,
        y: top + innerBase + rowGap * 0.4,
      };
    } else {
      /* 泡泡外：放在名字、名牌、光暈的外面 */
      const gapM = ms * 0.35;
      const edge = fs * 0.3;
      const above =
        (mode === 'outside' && hasTitle ? titleLH + fs * 0.15 : 0) +
        (tagBox ? tagBox.h / 2 : 0) +
        ov;
      const placeX = (wd: number) =>
        b.align === 'right' ? w - wd - edge : b.align === 'center' ? (w - wd) / 2 : edge;
      const m2 = metaMode === 'side' && b.align === 'center' ? 'above' : metaMode;
      if (m2 === 'above' || m2 === 'header') {
        const gapNT = speaker && timeText ? ms * 0.6 : 0;
        const rowOut = m2 === 'header' ? nameW + gapNT + timeW : nameW;
        if (rowOut > 0) {
          const cy = -(above + gapM + metaLH / 2);
          const x = placeX(rowOut);
          if (speaker) meta.name = { x, cy };
          if (m2 === 'header' && timeText) meta.timeAt = { x: x + nameW + gapNT, cy };
          ext.t = Math.max(ext.t, above + gapM + metaLH + 2);
        }
        if (m2 === 'above' && timeText) {
          const cy = h - metaLH / 2;
          const need = ov + gapM + timeW + 2;
          if (b.align === 'right') {
            meta.timeAt = { x: -(ov + gapM + timeW), cy };
            ext.l = Math.max(ext.l, need);
          } else {
            meta.timeAt = { x: w + ov + gapM, cy };
            ext.r = Math.max(ext.r, need);
          }
        }
      } else {
        /* 旁邊：靠左的泡泡放在左邊、靠右的放在右邊（外側），上緣對齊泡泡 */
        const leftSide = b.align === 'left';
        const edgeX = leftSide ? -(ov + gapM) : w + ov + gapM;
        const xOf = (wd: number) => (leftSide ? edgeX - wd : edgeX);
        let cy = metaLH / 2;
        if (speaker) {
          meta.name = { x: xOf(nameW), cy };
          cy += metaLH;
        }
        if (timeText) meta.timeAt = { x: xOf(timeW), cy };
        const need = ov + gapM + Math.max(nameW, timeW) + 2;
        if (leftSide) ext.l = Math.max(ext.l, need);
        else ext.r = Math.max(ext.r, need);
        const blockOut = (speaker ? metaLH : 0) + (timeText ? metaLH : 0);
        ext.b = Math.max(ext.b, blockOut - h + 2);
      }
    }
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
    tail,
    corner: f.corner,
    radius: f.radius,
    borderScale: f.borderScale,
    softShadow: f.softShadow,
    solid: f.solidShadow ? { color: f.solidColor, offset: f.solidOffset } : null,
    puff: f.cloudPuff,
    ls,
    meta,
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
/** 比例畫布的寬高比（寬:高） */
export const CANVAS_RATIOS = { square: [1, 1], story: [9, 16], wide: [16, 9] } as const;

/** 畫布大小與內容的位置（規格 3.1） */
export function planCanvas(
  content: { width: number; height: number },
  o: Pick<SbData, 'canvasMode' | 'margin' | 'width' | 'height' | 'anchor'> & {
    minHeight?: number;
  },
): CanvasPlan {
  const m = o.margin;
  const minH = o.minHeight ?? 0;
  if (o.canvasMode === 'auto') {
    const wantW = Math.ceil(content.width + 2 * m - 1e-6);
    const wantH = Math.ceil(content.height + 2 * m - 1e-6);
    const width = Math.max(1, Math.min(MAX_CANVAS, wantW));
    if (minH > wantH) {
      /* 最小高度撐高：多出來的高度依內容位置的上下比例分配 */
      const height = Math.min(MAX_CANVAS, minH);
      return {
        width,
        height,
        ox: m + (width - (content.width + 2 * m)) / 2,
        oy: m + (height - 2 * m - content.height) * anchorRatio(o.anchor).y,
        overflow: wantW > MAX_CANVAS || minH > MAX_CANVAS,
      };
    }
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
  if (o.canvasMode !== 'fixed') {
    /* 比例畫布：放得下內容（與最小高度）的最小整數倍，例如 9:16 是 9k × 16k */
    const [rw, rh] = CANVAS_RATIOS[o.canvasMode];
    const needW = content.width + 2 * m;
    const needH = Math.max(content.height + 2 * m, minH);
    const want = Math.max(1, Math.ceil(Math.max(needW / rw, needH / rh) - 1e-6));
    const kMax = Math.floor(MAX_CANVAS / Math.max(rw, rh));
    const k = Math.min(want, kMax);
    const width = rw * k;
    const height = rh * k;
    return {
      width,
      height,
      ox: m + (width - 2 * m - content.width) * ax,
      oy: m + (height - 2 * m - content.height) * ay,
      overflow: want > kMax,
    };
  }
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
