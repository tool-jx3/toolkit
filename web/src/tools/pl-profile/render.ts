/**
 * 圖片（規格 F30～F35、3.3）：先排版（純計算，量字寬的函式由外面給，單元測試可以用假的），再畫到 canvas。
 * 預覽與下載用同一份排版，只有倍率不同。版面、配色本站自己設計。
 *
 * 一張圖寬 800（邏輯 px），下載時 × 倍率（look.scale）。自介卡：上方色帶、頭像、名字；下面兩欄的資訊卡片。
 * 地雷表：標題、圖例；依程度（每個程度一塊，主題是彩色的標籤）或依分類（每個分類一塊，兩欄的「程度＋主題」）。
 */
import { contrastRatio, parseColor, readableTextColor } from '@/core/color';
import { ensureFont, fontFamilyCss } from '@/core/fonts';
import { DEFAULT_PLACEMENT, drawPlacedCrop, type FramePlacement } from '@/core/image';
import { breakText } from '@/core/typeset';
import { LEVELS, type LevelId, type ProfileData, type ThemeId } from './model';
import { OUT } from './strings';
import { type JiraiView, jiraiTitle, jiraiView, type ProfileView, profileView } from './view';

export const CARD_WIDTH = 800;
/**
 * 一張圖最多幾個像素、一邊最長幾 px（iOS Safari 的 canvas 上限約 1,677 萬像素，超過就畫不出來）：
 * 很長的圖下載、複製、預覽時自動降低倍率（規格 F33）。
 */
export const MAX_IMAGE_PIXELS = 16_000_000;
export const MAX_IMAGE_SIDE = 16_000;

/** 實際的倍率：想要的倍率，但面積不超過 MAX_IMAGE_PIXELS、邊長不超過 MAX_IMAGE_SIDE */
export function exportScale(image: { width: number; height: number }, scale: number): number {
  const byArea = Math.sqrt(MAX_IMAGE_PIXELS / Math.max(1, image.width * image.height));
  const bySide = MAX_IMAGE_SIDE / Math.max(1, image.width, image.height);
  return Math.min(scale, byArea, bySide);
}

/** 下載的大小（px） */
export function exportSize(image: { width: number; height: number }, scale: number) {
  const s = exportScale(image, scale);
  /* 無條件捨去：縮小過的圖不會因為四捨五入超過上限 */
  const px = (v: number) => Math.max(1, Math.floor(v * s + 1e-6));
  return { width: px(image.width), height: px(image.height), scale: s };
}
const P = 36;
const GAP = 16;
const INNER = CARD_WIDTH - P * 2;
const BAND = 96;
const AVATAR_R = 72;
const PANEL_PAD = 16;
const PANEL_R = 14;

export const PNG_FONT_FAMILY = 'Noto Sans TC';

/* ---------- 配色 ---------- */

interface ThemeBase {
  bg: string;
  card: string;
  ink: string;
  muted: string;
  line: string;
  dark: boolean;
}

export const THEME_BASES: Record<ThemeId, ThemeBase> = {
  paper: {
    bg: '#f6f4ef',
    card: '#ffffff',
    ink: '#24221e',
    muted: '#68635b',
    line: '#e2ddd3',
    dark: false,
  },
  cream: {
    bg: '#f1e6d8',
    card: '#fffaf2',
    ink: '#3a2e24',
    muted: '#735f4e',
    line: '#e3d3bf',
    dark: false,
  },
  mint: {
    bg: '#e5f2ed',
    card: '#fbfffd',
    ink: '#1e3932',
    muted: '#4b6a64',
    line: '#cbe2da',
    dark: false,
  },
  sakura: {
    bg: '#f7e8ed',
    card: '#fffafc',
    ink: '#3e2830',
    muted: '#765863',
    line: '#ebd1da',
    dark: false,
  },
  night: {
    bg: '#1a1f2e',
    card: '#232a3c',
    ink: '#eef1f8',
    muted: '#a7aec2',
    line: '#394158',
    dark: true,
  },
  ink: {
    bg: '#111111',
    card: '#1d1d1d',
    ink: '#f1f1f1',
    muted: '#a6a6a6',
    line: '#353535',
    dark: true,
  },
};

interface LevelColors {
  /** 實心標籤（程度的名稱） */
  pill: string;
  pillText: string;
  /** 淡底（主題的標籤） */
  soft: string;
}

const LEVEL_LIGHT: Record<LevelId, LevelColors> = {
  love: { pill: '#1a7d52', pillText: '#ffffff', soft: '#dcf1e5' },
  like: { pill: '#7cc79b', pillText: '#10351f', soft: '#eaf6ee' },
  ok: { pill: '#cbc7c1', pillText: '#2e2b27', soft: '#efedea' },
  ask: { pill: '#f0b43c', pillText: '#3b2600', soft: '#fcefd2' },
  ng: { pill: '#c43c3c', pillText: '#ffffff', soft: '#f9dcdc' },
};

const LEVEL_DARK: Record<LevelId, LevelColors> = {
  love: { pill: '#3fbf86', pillText: '#08251a', soft: '#1d3b2f' },
  like: { pill: '#8fd6ad', pillText: '#0f2a1c', soft: '#22352b' },
  ok: { pill: '#8d8a86', pillText: '#151515', soft: '#33312f' },
  ask: { pill: '#f2b84b', pillText: '#2b1b00', soft: '#3d311c' },
  ng: { pill: '#f06b6b', pillText: '#2a0606', soft: '#452324' },
};

export interface Palette extends ThemeBase {
  accent: string;
  /** 卡片上的標題字（和卡片底色的對比至少 4.5） */
  accentText: string;
  /** 標籤的淡底 */
  accentSoft: string;
  /** 淡底上的主色字（PL／KP、年齡、系統的 often、頭像的字；對比至少 4.5） */
  accentOnSoft: string;
  accentLine: string;
  band: string;
  /** 主色實心底上的字 */
  onAccent: string;
  levels: Record<LevelId, LevelColors>;
}

const hex2 = (n: number) =>
  Math.round(Math.min(255, Math.max(0, n)))
    .toString(16)
    .padStart(2, '0');

/** a 往 b 混 t（0＝a、1＝b） */
export function mixHex(a: string, b: string, t: number): string {
  const x = parseColor(a) ?? { r: 0, g: 0, b: 0, a: 1 };
  const y = parseColor(b) ?? { r: 0, g: 0, b: 0, a: 1 };
  return `#${hex2(x.r + (y.r - x.r) * t)}${hex2(x.g + (y.g - x.g) * t)}${hex2(x.b + (y.b - x.b) * t)}`;
}

/** color 放在 bg 上至少 min 的對比：不夠時一步一步往 toward 混 */
export function readableOn(color: string, bg: string, toward: string, min = 4.5): string {
  let c = color;
  for (let i = 1; i <= 10 && contrastRatio(c, bg) < min; i++) c = mixHex(color, toward, i / 10);
  return c;
}

/** 主色的淡底：往卡片底色混，直到卡片的字放在上面對比至少 4.5 */
function softOf(accent: string, base: ThemeBase): string {
  let t = base.dark ? 0.74 : 0.86;
  let soft = mixHex(accent, base.card, t);
  while (t < 0.98 && contrastRatio(base.ink, soft) < 4.5) {
    t += 0.03;
    soft = mixHex(accent, base.card, t);
  }
  return soft;
}

export function paletteFor(theme: ThemeId, accent: string): Palette {
  const base = THEME_BASES[theme];
  const accentText = readableOn(accent, base.card, base.ink);
  const accentSoft = softOf(accent, base);
  return {
    ...base,
    accent,
    accentText,
    accentSoft,
    accentOnSoft: readableOn(accentText, accentSoft, base.ink),
    accentLine: mixHex(accent, base.card, base.dark ? 0.5 : 0.6),
    band: base.dark ? mixHex(accent, base.bg, 0.45) : mixHex(accent, '#ffffff', 0.5),
    onAccent: readableTextColor(accent),
    levels: base.dark ? LEVEL_DARK : LEVEL_LIGHT,
  };
}

/* ---------- 排版 ---------- */

export interface FontSpec {
  size: number;
  weight: 400 | 700;
}

/** 量一段文字的寬度（邏輯 px） */
export type MeasureFn = (text: string, font: FontSpec) => number;

export type DrawOp =
  | {
      t: 'rect';
      x: number;
      y: number;
      w: number;
      h: number;
      fill?: string;
      stroke?: string;
      lw?: number;
      r?: number;
    }
  | {
      t: 'text';
      x: number;
      /** 這一行的中線 */
      y: number;
      text: string;
      font: FontSpec;
      color: string;
      align: 'left' | 'center' | 'right';
    }
  | { t: 'circle'; cx: number; cy: number; r: number; fill?: string; stroke?: string; lw?: number }
  | { t: 'dots'; x: number; y: number; w: number; h: number; color: string; gap: number; r: number }
  /** 頭像（有圖片時畫圖片，沒有時畫預設的圓與暱稱的第一個字） */
  | {
      t: 'avatar';
      cx: number;
      cy: number;
      r: number;
      initial: string;
      fill: string;
      color: string;
    };

export type ImageKind = 'combined' | 'profile' | 'jirai';

export interface CardImage {
  kind: ImageKind;
  width: number;
  height: number;
  background: string;
  ops: DrawOp[];
}

const F = (size: number, weight: 400 | 700 = 400): FontSpec => ({ size, weight });

/** 依寬度斷行（中文逐字、英文以詞為單位、行首行尾禁則；原本的換行保留）。
 * 比整行還寬的英數字詞（沒有空白的長字）再逐字切開，字不會超出框。 */
export function wrapLines(text: string, width: number, font: FontSpec, measure: MeasureFn) {
  const limit = Math.max(1, width);
  const out: string[] = [];
  for (const chars of breakText(text, {
    limit,
    unit: (ch) => measure(ch, font),
    segment: 'grapheme',
  })) {
    const line = chars.join('');
    /* 行尾掛出去的一個標點（禁則）不算超出 */
    if (chars.length < 2 || measure(chars.slice(0, -1).join(''), font) <= limit + 0.5) {
      out.push(line);
      continue;
    }
    let cur = '';
    for (const ch of chars) {
      if (cur && measure(cur + ch, font) > limit) {
        out.push(cur);
        cur = ch;
      } else cur += ch;
    }
    out.push(cur);
  }
  return out;
}

/** 單行放不下時截斷並加「…」 */
export function ellipsize(text: string, width: number, font: FontSpec, measure: MeasureFn) {
  if (measure(text, font) <= width) return text;
  const chars = Array.from(text);
  while (chars.length > 1 && measure(`${chars.join('')}…`, font) > width) chars.pop();
  return `${chars.join('')}…`;
}

/** 收集畫圖指令的小工具（座標從 (0, y0) 開始往下排） */
class Builder {
  ops: DrawOp[] = [];
  constructor(
    readonly pal: Palette,
    readonly measure: MeasureFn,
  ) {}
  rect(op: Omit<Extract<DrawOp, { t: 'rect' }>, 't'>) {
    this.ops.push({ t: 'rect', ...op });
  }
  text(
    text: string,
    x: number,
    y: number,
    font: FontSpec,
    color: string,
    align: 'left' | 'center' | 'right' = 'left',
  ) {
    if (text) this.ops.push({ t: 'text', x, y, text, font, color, align });
  }
  /** 多行文字（左上角 x, y、行高 lh）；回傳高度 */
  para(text: string, x: number, y: number, w: number, font: FontSpec, color: string, lh: number) {
    const lines = wrapLines(text, w, font, this.measure);
    lines.forEach((l, i) => {
      this.text(l, x, y + lh * i + lh / 2, font, color);
    });
    return lines.length * lh;
  }
  /** 多行文字的高度（不畫） */
  paraHeight(text: string, w: number, font: FontSpec, lh: number) {
    return wrapLines(text, w, font, this.measure).length * lh;
  }
}

/* ----- 標籤（圓角的小塊，可以換行；放不下時自己也會折成多行） ----- */

interface Chip {
  text: string;
  fill: string;
  color: string;
  font?: FontSpec;
  stroke?: string;
}

const CHIP_FONT = F(14);
const CHIP_H = 30;
const CHIP_PX = 12;
const CHIP_GAP = 8;
const CHIP_LH = 20;

/** 排一列一列的標籤；draw 為 false 時只量高度 */
function chips(
  b: Builder,
  list: readonly Chip[],
  x0: number,
  y0: number,
  w: number,
  draw: boolean,
): number {
  let x = x0;
  let y = y0;
  let rowH = 0;
  for (const c of list) {
    const font = c.font ?? CHIP_FONT;
    const textW = b.measure(c.text, font);
    const maxText = w - CHIP_PX * 2;
    const lines = textW > maxText ? wrapLines(c.text, maxText, font, b.measure) : [c.text];
    const cw =
      lines.length > 1 ? w : Math.min(w, Math.ceil(b.measure(lines[0], font)) + CHIP_PX * 2);
    const ch = lines.length > 1 ? CHIP_H - CHIP_LH + CHIP_LH * lines.length : CHIP_H;
    if (x > x0 && x + cw > x0 + w) {
      x = x0;
      y += rowH + CHIP_GAP;
      rowH = 0;
    }
    if (draw) {
      b.rect({
        x,
        y,
        w: cw,
        h: ch,
        fill: c.fill,
        stroke: c.stroke,
        lw: 1.5,
        r: lines.length > 1 ? 12 : ch / 2,
      });
      lines.forEach((l, i) => {
        b.text(
          l,
          x + CHIP_PX,
          y + (CHIP_H - CHIP_LH) / 2 + CHIP_LH * i + CHIP_LH / 2,
          font,
          c.color,
        );
      });
    }
    x += cw + CHIP_GAP;
    rowH = Math.max(rowH, ch);
  }
  return list.length ? y + rowH - y0 : 0;
}

/** 小的實心標籤（程度、PL／KP）；回傳寬度 */
function pill(
  b: Builder,
  text: string,
  x: number,
  cy: number,
  fill: string,
  color: string,
  font: FontSpec = F(13, 700),
  minW = 0,
  stroke?: string,
): number {
  const w = Math.max(minW, Math.ceil(b.measure(text, font)) + 20);
  const h = font.size + 12;
  b.rect({ x, y: cy - h / 2, w, h, fill, stroke, lw: 1.5, r: h / 2 });
  b.text(text, x + w / 2, cy, font, color, 'center');
  return w;
}

/* ----- 資訊卡片（標題＋內容） ----- */

interface Block {
  span: 1 | 2;
  /** 給寬度 w，回傳內容的高度；draw 時畫在 (x, y) */
  body: (b: Builder, x: number, y: number, w: number, draw: boolean) => number;
  title: string;
}

const TITLE_H = 22;
const TITLE_GAP = 10;

function blockHeight(b: Builder, blk: Block, w: number): number {
  return PANEL_PAD * 2 + TITLE_H + TITLE_GAP + blk.body(b, 0, 0, w - PANEL_PAD * 2, false);
}

function drawBlock(b: Builder, blk: Block, x: number, y: number, w: number, h: number) {
  const pal = b.pal;
  b.rect({ x, y, w, h, fill: pal.card, stroke: pal.line, lw: 1, r: PANEL_R });
  b.ops.push({
    t: 'circle',
    cx: x + PANEL_PAD + 4,
    cy: y + PANEL_PAD + TITLE_H / 2,
    r: 4,
    fill: pal.accent,
  });
  b.text(blk.title, x + PANEL_PAD + 14, y + PANEL_PAD + TITLE_H / 2, F(15, 700), pal.accentText);
  blk.body(b, x + PANEL_PAD, y + PANEL_PAD + TITLE_H + TITLE_GAP, w - PANEL_PAD * 2, true);
}

/** 兩欄排資訊卡片：span 1 兩個一列（同一列一樣高），span 2 或落單的 span 1 撐滿一列；回傳高度 */
function layoutBlocks(b: Builder, blocks: readonly Block[], y0: number): number {
  const half = (INNER - GAP) / 2;
  const rows: Block[][] = [];
  let pending: Block | null = null;
  for (const blk of blocks) {
    if (blk.span === 2) {
      if (pending) rows.push([pending]);
      pending = null;
      rows.push([blk]);
    } else if (pending) {
      rows.push([pending, blk]);
      pending = null;
    } else pending = blk;
  }
  if (pending) rows.push([pending]);
  let y = y0;
  for (const row of rows) {
    if (row.length === 2) {
      const h = Math.max(blockHeight(b, row[0], half), blockHeight(b, row[1], half));
      drawBlock(b, row[0], P, y, half, h);
      drawBlock(b, row[1], P + half + GAP, y, half, h);
      y += h + GAP;
    } else {
      const h = blockHeight(b, row[0], INNER);
      drawBlock(b, row[0], P, y, INNER, h);
      y += h + GAP;
    }
  }
  return rows.length ? y - GAP - y0 : 0;
}

/* ---------- 自介卡 ---------- */

function firstChar(text: string): string {
  const seg =
    typeof Intl !== 'undefined' && 'Segmenter' in Intl
      ? new Intl.Segmenter('zh-Hant', { granularity: 'grapheme' })
          .segment(text)
          [Symbol.iterator]()
          .next().value?.segment
      : Array.from(text)[0];
  return seg ?? '';
}

/** 資訊卡片的順序：玩過的系統（撐滿）先放，半寬的卡片才能兩兩一列（經驗＋風格…），想說的話最後 */
function profileBlocks(v: ProfileView, pal: Palette): Block[] {
  const blocks: Block[] = [];
  const muted = pal.muted;
  if (v.systems.length) {
    blocks.push({
      span: 2,
      title: OUT.fields.systems,
      body: (b, x, y, w, draw) => {
        const cols = v.systems.length > 2 ? 2 : 1;
        const colW = cols === 2 ? (w - GAP) / 2 : w;
        /* 程度的標籤一樣寬（放得下最長的名稱） */
        const LEVEL_W = Math.max(
          64,
          ...Object.values(OUT.systemLevels).map((t) => Math.ceil(b.measure(t, F(12, 700))) + 20),
        );
        let h = 0;
        for (let i = 0; i < v.systems.length; i += cols) {
          let rowH = 0;
          for (let c = 0; c < cols && i + c < v.systems.length; c++) {
            const s = v.systems[i + c];
            const cx = x + c * (colW + GAP);
            const textX = cx + LEVEL_W + 10;
            const textW = colW - LEVEL_W - 10;
            const kpW = s.kp ? Math.ceil(b.measure(OUT.canKp, F(12, 700))) + 16 + 8 : 0;
            const nameLines = wrapLines(s.name, Math.max(40, textW - kpW), F(16, 700), b.measure);
            let ih = nameLines.length * 24;
            if (s.note) ih += b.paraHeight(s.note, textW, F(13), 19);
            if (draw) {
              const solid = s.levelId === 'main';
              const soft = s.levelId === 'often';
              const want = s.levelId === 'want';
              pill(
                b,
                s.level,
                cx,
                y + h + 12,
                solid ? pal.accent : soft ? pal.accentSoft : want ? pal.card : pal.line,
                solid ? pal.onAccent : soft ? pal.accentOnSoft : want ? pal.accentText : pal.ink,
                F(12, 700),
                LEVEL_W,
                want ? pal.accentLine : undefined,
              );
              nameLines.forEach((l, li) => {
                b.text(l, textX, y + h + 12 + li * 24, F(16, 700), pal.ink);
              });
              if (s.kp) {
                const lastW = b.measure(nameLines[nameLines.length - 1], F(16, 700));
                pill(
                  b,
                  OUT.canKp,
                  textX + lastW + 8,
                  y + h + 12 + (nameLines.length - 1) * 24,
                  pal.card,
                  pal.accentText,
                  F(12, 700),
                  0,
                  pal.accentLine,
                );
              }
              if (s.note)
                b.para(s.note, textX, y + h + nameLines.length * 24, textW, F(13), muted, 19);
            }
            rowH = Math.max(rowH, ih);
          }
          h += rowH + 10;
        }
        return h - 10;
      },
    });
  }
  if (v.experience) {
    const e = v.experience;
    blocks.push({
      span: 1,
      title: OUT.fields.experience,
      body: (b, x, y, w, draw) => {
        let h = 0;
        for (const [label, value] of [
          ['PL', e.pl],
          ['KP', e.kp],
        ] as const) {
          if (!value) continue;
          if (draw) {
            const pw = pill(
              b,
              label,
              x,
              y + h + 14,
              pal.accentSoft,
              pal.accentOnSoft,
              F(13, 700),
              44,
            );
            b.text(value, x + pw + 10, y + h + 14, F(16, 700), pal.ink);
          }
          h += 34;
        }
        if (e.note) {
          if (h) h += 4;
          h += draw
            ? b.para(e.note, x, y + h, w, F(13), muted, 20)
            : b.paraHeight(e.note, w, F(13), 20);
        }
        return h;
      },
    });
  }
  for (const g of v.tags) {
    blocks.push({
      span: 1,
      title: g.title,
      body: (b, x, y, w, draw) => {
        const list = g.items.map((text) => ({ text, fill: pal.accentSoft, color: pal.ink }));
        let h = chips(b, list, x, y, w, draw);
        if (g.note) {
          if (h) h += 8;
          h += draw
            ? b.para(g.note, x, y + h, w, F(13), muted, 20)
            : b.paraHeight(g.note, w, F(13), 20);
        }
        return h;
      },
    });
  }
  if (v.contacts.length) {
    blocks.push({
      span: 1,
      title: OUT.fields.contact,
      body: (b, x, y, w, draw) => {
        let h = 0;
        for (const c of v.contacts) {
          const kindW = c.kind
            ? Math.min(w * 0.4, Math.ceil(b.measure(c.kind, F(13, 700))) + 12)
            : 0;
          const valueW = w - kindW;
          const lines = c.value ? wrapLines(c.value, valueW, F(15), b.measure) : [''];
          if (draw) {
            if (c.kind)
              b.text(
                ellipsize(c.kind, kindW - 12, F(13, 700), b.measure),
                x,
                y + h + 12,
                F(13, 700),
                muted,
              );
            lines.forEach((l, i) => {
              b.text(l, x + kindW, y + h + 12 + i * 22, F(15), pal.ink);
            });
          }
          h += lines.length * 22 + 6;
        }
        return h - 6;
      },
    });
  }
  if (v.memo) {
    blocks.push({
      span: 2,
      title: OUT.fields.memo,
      body: (b, x, y, w, draw) =>
        draw ? b.para(v.memo, x, y, w, F(15), pal.ink, 26) : b.paraHeight(v.memo, w, F(15), 26),
    });
  }
  return blocks;
}

/** 自介卡（從 y0 開始）；回傳下一個可以用的 y */
function layoutProfile(b: Builder, v: ProfileView, y0: number): number {
  const pal = b.pal;
  b.rect({ x: 0, y: y0, w: CARD_WIDTH, h: BAND, fill: pal.band });
  b.ops.push({
    t: 'dots',
    x: 0,
    y: y0,
    w: CARD_WIDTH,
    h: BAND,
    color: pal.dark ? mixHex(pal.band, '#ffffff', 0.18) : mixHex(pal.band, '#ffffff', 0.35),
    gap: 18,
    r: 2,
  });
  const top = y0 + BAND;
  let nameX = P;
  let headerBottom = top + 16;
  if (v.avatar) {
    const cx = P + AVATAR_R;
    b.ops.push({ t: 'circle', cx, cy: top, r: AVATAR_R + 6, fill: pal.bg });
    b.ops.push({
      t: 'avatar',
      cx,
      cy: top,
      r: AVATAR_R,
      initial: firstChar(v.nickname),
      fill: pal.accentSoft,
      color: pal.accentOnSoft,
    });
    nameX = P + AVATAR_R * 2 + 24;
    headerBottom = top + AVATAR_R + 6;
  }
  const nameW = CARD_WIDTH - P - nameX;
  /* 名字：放不下時縮小到 22 px，再放不下加「…」 */
  let size = 32;
  const name = v.nickname || OUT.noName;
  while (size > 22 && b.measure(name, F(size, 700)) > nameW) size -= 2;
  let y = top + 14;
  b.text(
    ellipsize(name, nameW, F(size, 700), b.measure),
    nameX,
    y + 20,
    F(size, 700),
    v.nickname ? pal.ink : pal.muted,
  );
  y += 44;
  const meta: string[] = [];
  if (v.handle) meta.push(v.handle);
  if (v.handle || v.age) {
    let x = nameX;
    if (v.handle) {
      const hw = Math.min(nameW - (v.age ? 90 : 0), b.measure(v.handle, F(16)));
      b.text(ellipsize(v.handle, hw, F(16), b.measure), x, y + 11, F(16), pal.muted);
      x += hw + 12;
    }
    if (v.age) pill(b, v.age, x, y + 11, pal.accentSoft, pal.accentOnSoft, F(12, 700));
    y += 28;
  }
  if (v.avatarCredit) {
    b.text(
      ellipsize(OUT.avatarCredit(v.avatarCredit), nameW, F(12), b.measure),
      nameX,
      y + 9,
      F(12),
      pal.muted,
    );
    y += 22;
  }
  y = Math.max(y, headerBottom) + 20;
  if (v.tagline) {
    const tw = INNER - PANEL_PAD * 2 - 8;
    const th = b.paraHeight(v.tagline, tw, F(17, 700), 28);
    const h = th + PANEL_PAD * 2 - 6;
    b.rect({ x: P, y, w: INNER, h, fill: pal.card, stroke: pal.line, lw: 1, r: PANEL_R });
    b.rect({ x: P, y, w: 6, h, fill: pal.accent, r: 3 });
    b.para(v.tagline, P + PANEL_PAD + 8, y + PANEL_PAD - 3, tw, F(17, 700), pal.ink, 28);
    y += h + GAP;
  }
  const blocks = profileBlocks(v, pal);
  const bh = layoutBlocks(b, blocks, y);
  return bh ? y + bh + GAP : y;
}

/* ---------- 地雷表 ---------- */

/** 圖例：一排程度的標籤；回傳高度 */
function legend(b: Builder, x0: number, y0: number, w: number, draw: boolean): number {
  let x = x0;
  let y = y0;
  for (const l of LEVELS) {
    const text = `${OUT.symbols[l]} ${OUT.levels[l]}`;
    const pw = Math.ceil(b.measure(text, F(13, 700))) + 20;
    if (x > x0 && x + pw > x0 + w) {
      x = x0;
      y += 34;
    }
    if (draw) pill(b, text, x, y + 13, b.pal.levels[l].pill, b.pal.levels[l].pillText, F(13, 700));
    x += pw + 8;
  }
  return y - y0 + 26;
}

const topicLabel = (label: string, note: string) => (note ? `${label}（${note}）` : label);

/** 最長的「符號 程度名稱」有多寬 */
const levelLabelWidth = (b: Builder, font: FontSpec) =>
  Math.ceil(Math.max(...LEVELS.map((l) => b.measure(`${OUT.symbols[l]} ${OUT.levels[l]}`, font))));

function layoutJirai(
  b: Builder,
  j: JiraiView,
  title: string,
  y0: number,
  standalone: boolean,
): number {
  const pal = b.pal;
  let y = y0;
  if (standalone) {
    b.rect({ x: 0, y, w: CARD_WIDTH, h: 12, fill: pal.band });
    y += 12 + P - 8;
  } else {
    b.rect({ x: P, y, w: INNER, h: 2, fill: pal.line });
    y += 26;
  }
  b.text(ellipsize(title, INNER, F(26, 700), b.measure), P, y + 18, F(26, 700), pal.ink);
  y += 46;
  /* 依分類時才放圖例（依程度時每一列的開頭就是程度） */
  if (j.mode === 'category' && j.any) y += legend(b, P, y, INNER, true) + 18;

  if (!j.any) {
    const h = 58;
    b.rect({ x: P, y, w: INNER, h, fill: pal.card, stroke: pal.line, lw: 1, r: PANEL_R });
    b.text(OUT.jiraiEmpty, P + PANEL_PAD, y + h / 2, F(15), pal.muted);
    y += h + GAP;
  } else if (j.mode === 'level') {
    /* 一塊卡片，每個程度一列（左邊是程度、右邊是主題的標籤），列與列之間細線 */
    /* 程度的標籤一樣寬（放得下最長的「符號 名稱」） */
    const LABEL_W = Math.max(124, levelLabelWidth(b, F(15, 700)) + 24);
    const ROW_GAP = 26;
    const ph = 32;
    const cx = P + PANEL_PAD + LABEL_W + 14;
    const cw = INNER - PANEL_PAD * 2 - LABEL_W - 14;
    const rows = j.groups.map((g) => {
      const lv = g.level ?? 'ok';
      const list = g.items.map((it) => ({
        text: topicLabel(it.label, it.note),
        fill: pal.levels[lv].soft,
        color: pal.ink,
      }));
      return { lv, list, h: Math.max(chips(b, list, cx, 0, cw, false), ph) };
    });
    const h = PANEL_PAD * 2 + rows.reduce((a, r) => a + r.h, 0) + (rows.length - 1) * ROW_GAP;
    b.rect({ x: P, y, w: INNER, h, fill: pal.card, stroke: pal.line, lw: 1, r: PANEL_R });
    let ry = y + PANEL_PAD;
    rows.forEach((r, i) => {
      if (i > 0)
        b.rect({
          x: P + PANEL_PAD,
          y: ry - ROW_GAP / 2 - 0.5,
          w: INNER - PANEL_PAD * 2,
          h: 1,
          fill: pal.line,
        });
      b.rect({
        x: P + PANEL_PAD,
        y: ry,
        w: LABEL_W,
        h: ph,
        fill: pal.levels[r.lv].pill,
        r: ph / 2,
      });
      b.text(
        `${OUT.symbols[r.lv]} ${OUT.levels[r.lv]}`,
        P + PANEL_PAD + LABEL_W / 2,
        ry + ph / 2,
        F(15, 700),
        pal.levels[r.lv].pillText,
        'center',
      );
      chips(b, r.list, cx, ry + 1, cw, true);
      ry += r.h + ROW_GAP;
    });
    y += h + GAP;
  } else {
    const colW = (INNER - PANEL_PAD * 2 - GAP) / 2;
    const LEVEL_W = Math.max(92, levelLabelWidth(b, F(12, 700)) + 20);
    for (const g of j.groups) {
      /* 先量每一列的高度（兩個主題一列） */
      const measureItem = (it: (typeof g.items)[number]) => {
        const tw = colW - LEVEL_W - 10;
        let h = b.paraHeight(it.label, tw, F(15), 22);
        if (it.note) h += b.paraHeight(it.note, tw, F(12), 18);
        return Math.max(h, 26);
      };
      const rows: number[] = [];
      for (let i = 0; i < g.items.length; i += 2)
        rows.push(
          Math.max(measureItem(g.items[i]), g.items[i + 1] ? measureItem(g.items[i + 1]) : 0),
        );
      const bodyH = rows.reduce((a, r) => a + r, 0) + (rows.length - 1) * 10;
      const h = PANEL_PAD * 2 + TITLE_H + TITLE_GAP + bodyH;
      b.rect({ x: P, y, w: INNER, h, fill: pal.card, stroke: pal.line, lw: 1, r: PANEL_R });
      b.ops.push({
        t: 'circle',
        cx: P + PANEL_PAD + 4,
        cy: y + PANEL_PAD + TITLE_H / 2,
        r: 4,
        fill: pal.accent,
      });
      b.text(g.title, P + PANEL_PAD + 14, y + PANEL_PAD + TITLE_H / 2, F(15, 700), pal.accentText);
      let ry = y + PANEL_PAD + TITLE_H + TITLE_GAP;
      for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < 2; c++) {
          const it = g.items[r * 2 + c];
          if (!it) continue;
          const x = P + PANEL_PAD + c * (colW + GAP);
          const lc = pal.levels[it.level];
          pill(
            b,
            `${OUT.symbols[it.level]} ${OUT.levels[it.level]}`,
            x,
            ry + 12,
            lc.pill,
            lc.pillText,
            F(12, 700),
            LEVEL_W,
          );
          const tx = x + LEVEL_W + 10;
          const tw = colW - LEVEL_W - 10;
          const lh = b.para(it.label, tx, ry + 1, tw, F(15), pal.ink, 22);
          if (it.note) b.para(it.note, tx, ry + 1 + lh, tw, F(12), pal.muted, 18);
        }
        ry += rows[r] + 10;
      }
      y += h + GAP;
    }
  }

  if (j.memo) {
    const tw = INNER - PANEL_PAD * 2;
    const th = b.paraHeight(j.memo, tw, F(15), 26);
    const h = PANEL_PAD * 2 + TITLE_H + TITLE_GAP + th;
    b.rect({ x: P, y, w: INNER, h, fill: pal.card, stroke: pal.line, lw: 1, r: PANEL_R });
    b.ops.push({
      t: 'circle',
      cx: P + PANEL_PAD + 4,
      cy: y + PANEL_PAD + TITLE_H / 2,
      r: 4,
      fill: pal.accent,
    });
    b.text(
      OUT.jiraiMemo,
      P + PANEL_PAD + 14,
      y + PANEL_PAD + TITLE_H / 2,
      F(15, 700),
      pal.accentText,
    );
    b.para(j.memo, P + PANEL_PAD, y + PANEL_PAD + TITLE_H + TITLE_GAP, tw, F(15), pal.ink, 26);
    y += h + GAP;
  }
  return y;
}

/** 要畫的圖（依 look.images：一張或兩張） */
export function layoutImages(d: ProfileData, measure: MeasureFn): CardImage[] {
  const pal = paletteFor(d.look.theme, d.look.accent);
  const pv = profileView(d);
  const jv = jiraiView(d);
  const title = jiraiTitle(d);
  const make = (kind: ImageKind): CardImage => {
    const b = new Builder(pal, measure);
    let y = 0;
    if (kind !== 'jirai') y = layoutProfile(b, pv, 0);
    if (kind !== 'profile')
      y = layoutJirai(b, jv, title, kind === 'combined' ? y + 4 : 0, kind === 'jirai');
    const height = Math.ceil(y - GAP + P);
    return { kind, width: CARD_WIDTH, height, background: pal.bg, ops: b.ops };
  };
  switch (d.look.images) {
    case 'combined':
      return [make('combined')];
    case 'split':
      return [make('profile'), make('jirai')];
    case 'profile':
      return [make('profile')];
    default:
      return [make('jirai')];
  }
}

/* ---------- 畫到 canvas ---------- */

const FAMILY = fontFamilyCss(PNG_FONT_FAMILY);
export const fontString = (f: FontSpec) => `${f.weight} ${f.size}px ${FAMILY}`;

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 用 canvas 量字寬（同一個字型同一段字只量一次） */
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

export interface AvatarSource {
  image: CanvasImageSource;
  width: number;
  height: number;
  placement: FramePlacement | null;
}

function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (r > 0 && 'roundRect' in ctx) ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  else ctx.rect(x, y, w, h);
}

/** 依排版畫圖；scale＝輸出倍率（canvas 的大小要先設好：寬 image.width × scale） */
export function paintImage(
  ctx: Ctx2D,
  image: CardImage,
  scale: number,
  avatar: AvatarSource | null,
): void {
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = image.background;
  ctx.fillRect(0, 0, image.width, image.height);
  for (const op of image.ops) {
    switch (op.t) {
      case 'rect':
        roundRect(ctx, op.x, op.y, op.w, op.h, op.r ?? 0);
        if (op.fill) {
          ctx.fillStyle = op.fill;
          ctx.fill();
        }
        if (op.stroke) {
          ctx.strokeStyle = op.stroke;
          ctx.lineWidth = op.lw ?? 1;
          ctx.stroke();
        }
        break;
      case 'circle':
        ctx.beginPath();
        ctx.arc(op.cx, op.cy, op.r, 0, Math.PI * 2);
        if (op.fill) {
          ctx.fillStyle = op.fill;
          ctx.fill();
        }
        if (op.stroke) {
          ctx.strokeStyle = op.stroke;
          ctx.lineWidth = op.lw ?? 1;
          ctx.stroke();
        }
        break;
      case 'dots':
        ctx.fillStyle = op.color;
        for (let y = op.y + op.gap / 2; y < op.y + op.h; y += op.gap)
          for (let x = op.x + op.gap / 2; x < op.x + op.w; x += op.gap) {
            ctx.beginPath();
            ctx.arc(x, y, op.r, 0, Math.PI * 2);
            ctx.fill();
          }
        break;
      case 'avatar':
        ctx.save();
        ctx.beginPath();
        ctx.arc(op.cx, op.cy, op.r, 0, Math.PI * 2);
        ctx.clip();
        if (avatar) {
          drawPlacedCrop(
            ctx,
            avatar.image,
            { width: avatar.width, height: avatar.height },
            { x: op.cx - op.r, y: op.cy - op.r, width: op.r * 2, height: op.r * 2 },
            avatar.placement ?? DEFAULT_PLACEMENT,
          );
        } else {
          ctx.fillStyle = op.fill;
          ctx.fillRect(op.cx - op.r, op.cy - op.r, op.r * 2, op.r * 2);
          if (op.initial) {
            ctx.font = fontString(F(Math.round(op.r * 0.9), 700));
            ctx.fillStyle = op.color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(op.initial, op.cx, op.cy + op.r * 0.04);
          } else {
            /* 沒有暱稱：簡單的人形 */
            ctx.fillStyle = op.color;
            ctx.globalAlpha = 0.35;
            ctx.beginPath();
            ctx.arc(op.cx, op.cy - op.r * 0.18, op.r * 0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(op.cx, op.cy + op.r * 0.62, op.r * 0.55, op.r * 0.42, 0, Math.PI, 0);
            ctx.fill();
          }
        }
        ctx.restore();
        break;
      default:
        ctx.font = fontString(op.font);
        ctx.fillStyle = op.color;
        ctx.textAlign = op.align;
        ctx.textBaseline = 'middle';
        ctx.fillText(op.text, op.x, op.y);
    }
  }
  ctx.restore();
}

/** 圖裡用到的所有字（載入字型用） */
export function imageText(images: readonly CardImage[]): string {
  const parts: string[] = [];
  for (const im of images)
    for (const op of im.ops) {
      if (op.t === 'text') parts.push(op.text);
      else if (op.t === 'avatar') parts.push(op.initial);
    }
  return Array.from(new Set(Array.from(parts.join('')))).join('');
}

/** 先載入 Noto Sans TC（只下載用到的字；載不到時用系統字型） */
export async function loadImageFonts(images: readonly CardImage[]): Promise<void> {
  const chars = imageText(images);
  await Promise.all([
    ensureFont(PNG_FONT_FAMILY, 400, chars, { timeoutMs: 5000 }),
    ensureFont(PNG_FONT_FAMILY, 700, chars, { timeoutMs: 5000 }),
  ]);
}

let probeCtx: CanvasRenderingContext2D | null = null;

/** 量字用的 canvas（共用一個） */
export function measureContext(): CanvasRenderingContext2D {
  if (!probeCtx) probeCtx = document.createElement('canvas').getContext('2d');
  if (!probeCtx) throw new Error('無法建立畫布');
  return probeCtx;
}

/** 排版＋畫圖，回傳畫好的 canvas（下載、複製用） */
export function renderImage(image: CardImage, scale: number, avatar: AvatarSource | null) {
  const size = exportSize(image, scale);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('無法建立畫布');
  paintImage(ctx, image, size.scale, avatar);
  return canvas;
}
