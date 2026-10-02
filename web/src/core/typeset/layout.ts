/**
 * 排版：一個字群（主文字或副文字）的逐字位置、主＋副文字組成一個區塊、可見字編號。
 * 移植自 text-fx（本專案原創，MIT）的 typeset.js。
 *
 * 座標：每個字的 (x, y) 是它的「樞紐點」＝字身中心；縮放、旋轉都以這點為準。
 * 橫書時 along＝x、across＝y；直書時 along＝y（由上往下）、across＝x（行由右往左）。
 */
import { CORNER_V, isBlankChar, isWide, ROTATE_V, SMALL_KANA } from './chars';
import type { GlyphMetrics, Meter } from './measure';

export type Align = 'start' | 'center' | 'end';

/** 字群內的一個字（尚未對齊） */
export interface GroupGlyph {
  ch: string;
  /** 第幾行（從 0 起） */
  line: number;
  /** 行內第幾個字 */
  col: number;
  space: boolean;
  wide: boolean;
  /** 沿著行方向佔的長度 */
  adv: number;
  /** 直書時的固定旋轉（半形英數、括號等順時針 90°） */
  rot0: number;
  m: GlyphMetrics;
  /** 行方向上的中心位置（行首為 0） */
  along: number;
  /** 跨行方向上的中心位置 */
  across: number;
  /** 直書句讀、小假名的位移 */
  shiftX: number;
  shiftY: number;
}

export interface LineInfo {
  /** 行長（含字距，不含最後一個字之後的字距） */
  len: number;
  /** 這一行可見字的最大墨跡上緣／下緣 */
  inkA: number;
  inkD: number;
  count: number;
}

export interface GroupLayout {
  glyphs: GroupGlyph[];
  lineInfo: LineInfo[];
  S: number;
  /** 行距（px） */
  pitch: number;
  extentAcross: number;
  extentAlong: number;
  vertical: boolean;
  meter: Meter;
  lines: readonly (readonly string[])[];
}

export interface LayoutGroupOptions {
  /** 字級（px） */
  S: number;
  meter: Meter;
  vertical?: boolean;
  /** 直書時半形英數直立（預設整串轉 90°） */
  latinUpright?: boolean;
  /** 直書時「，。、．」置中（預設移到右上） */
  punctCenter?: boolean;
  /** 字距（字級的倍數） */
  tracking?: number;
  /** 行距（字級的倍數） */
  leading?: number;
}

/** 排一個字群。座標以字群的行首、第一行為原點；對齊在 composeBlock 處理。 */
export function layoutGroup(
  lines: readonly (readonly string[])[],
  o: LayoutGroupOptions,
): GroupLayout {
  const { S, meter } = o;
  const vertical = !!o.vertical;
  const track = (o.tracking ?? 0) * S;
  const pitch = (o.leading ?? 1.5) * S;
  const glyphs: GroupGlyph[] = [];
  const lineInfo: LineInfo[] = [];
  lines.forEach((chars, li) => {
    let pos = 0;
    const items: {
      ch: string;
      adv: number;
      rot0: number;
      sx: number;
      sy: number;
      space: boolean;
      wide: boolean;
      m: GlyphMetrics;
      pos: number;
    }[] = [];
    chars.forEach((ch, ci) => {
      const m = meter.get(ch);
      const space = isBlankChar(ch);
      const wide = isWide(ch);
      let adv: number;
      let rot0 = 0;
      let sx = 0;
      let sy = 0;
      if (!vertical) {
        adv = m.w;
      } else if (!wide && !o.latinUpright) {
        adv = m.w;
        rot0 = Math.PI / 2;
      } else if (ROTATE_V.has(ch)) {
        adv = Math.max(m.w, S * 0.5);
        rot0 = Math.PI / 2;
      } else {
        adv = space && ch === ' ' ? Math.max(m.w, S * 0.3) : S;
        if (CORNER_V.has(ch)) {
          /* 依墨跡把句讀放到字格右上角（或正中央），不受字型原本位置影響 */
          const inkX = (m.r - m.l) / 2 - m.w / 2;
          const inkY = (m.d - m.a) / 2 + meter.central;
          const tx = o.punctCenter ? 0 : S * 0.24;
          const ty = o.punctCenter ? 0 : -S * 0.24;
          sx = tx - inkX;
          sy = ty - inkY;
        } else if (SMALL_KANA.has(ch)) {
          sx = S * 0.1;
          sy = -S * 0.1;
        }
      }
      items.push({ ch, adv, rot0, sx, sy, space, wide, m, pos });
      pos += adv + (ci < chars.length - 1 ? track : 0);
    });
    let inkA = 0;
    let inkD = 0;
    for (const it of items) {
      if (!it.space) {
        inkA = Math.max(inkA, it.m.a);
        inkD = Math.max(inkD, it.m.d);
      }
    }
    lineInfo.push({ len: pos, inkA, inkD, count: items.length });
    items.forEach((it, ci) => {
      glyphs.push({
        ch: it.ch,
        line: li,
        col: ci,
        space: it.space,
        wide: it.wide,
        adv: it.adv,
        rot0: it.rot0,
        m: it.m,
        along: it.pos + it.adv / 2,
        across: li * pitch + S / 2,
        shiftX: it.sx,
        shiftY: it.sy,
      });
    });
  });
  const lineCount = Math.max(1, lines.length);
  return {
    glyphs,
    lineInfo,
    S,
    pitch,
    extentAcross: (lineCount - 1) * pitch + S,
    extentAlong: Math.max(0, ...lineInfo.map((l) => l.len)),
    vertical,
    meter,
    lines,
  };
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 放進區塊後的字（區塊座標） */
export interface PlacedGlyph extends GroupGlyph {
  group: 'main' | 'sub';
  x: number;
  y: number;
  /** 行方向上的位置（含對齊位移） */
  axisPos: number;
  /** 所在行的中心、行首、行長（行方向） */
  lineCenter: number;
  lineStart: number;
  lineLen: number;
  lineInkA: number;
  lineInkD: number;
  /** 可見字編號（空白為 −1），indexVisible 填入 */
  vis?: number;
  /** 行內第幾個可見字 */
  lineVis?: number;
  /** 這一行有幾個可見字 */
  lineVisN?: number;
}

export interface BlockLayout {
  w: number;
  h: number;
  glyphs: PlacedGlyph[];
  subGlyphs: PlacedGlyph[];
  mainBox: Box;
  subBox: Box | null;
  /** 主、副文字的間距（px） */
  gapPx: number;
  /** 水平縮放（typeset 的 scaleX；畫字時以樞紐點 ctx.scale(scaleX, 1)）。不填＝1 */
  scaleX?: number;
}

export interface ComposeOptions {
  vertical?: boolean;
  align?: Align;
  /** 副文字在主文字之前（上方／直書右側）或之後 */
  subPos?: 'before' | 'after';
  /** 主、副文字的間距（px） */
  subGap?: number;
}

/** 主文字＋副文字組成一個區塊：每個字的區塊內座標，以及主文字框、副文字框、整體大小 */
export function composeBlock(
  main: GroupLayout,
  sub: GroupLayout | null,
  o: ComposeOptions = {},
): BlockLayout {
  const vertical = !!o.vertical;
  const alignK = { start: 0, center: 0.5, end: 1 }[o.align ?? 'center'] ?? 0.5;
  const gap = sub ? (o.subGap ?? 0) : 0;
  const along = Math.max(main.extentAlong, sub ? sub.extentAlong : 0);
  const mainAcross = main.extentAcross;
  const subAcross = sub ? sub.extentAcross : 0;
  const blockAcross = mainAcross + (sub ? gap + subAcross : 0);
  let mainOff: number;
  let subOff: number;
  if (o.subPos === 'before') {
    subOff = 0;
    mainOff = sub ? subAcross + gap : 0;
  } else {
    mainOff = 0;
    subOff = mainAcross + gap;
  }
  const W = vertical ? blockAcross : along;
  const H = vertical ? along : blockAcross;
  const place = (grp: GroupLayout, off: number, group: 'main' | 'sub'): PlacedGlyph[] =>
    grp.glyphs.map((g) => {
      const li = grp.lineInfo[g.line];
      const shiftAlong = (along - li.len) * alignK;
      const a = g.along + shiftAlong;
      const c = g.across + off;
      const x = vertical ? W - c : a;
      const y = vertical ? a : c;
      return {
        ...g,
        group,
        x: x + g.shiftX,
        y: y + g.shiftY,
        axisPos: a,
        lineCenter: shiftAlong + li.len / 2,
        lineStart: shiftAlong,
        lineLen: li.len,
        lineInkA: li.inkA,
        lineInkD: li.inkD,
      };
    });
  const boxOf = (off: number, across: number, len: number): Box =>
    !vertical
      ? { x: (along - len) * alignK, y: off, w: len, h: across }
      : { x: W - off - across, y: (along - len) * alignK, w: across, h: len };
  return {
    w: W,
    h: H,
    glyphs: place(main, mainOff, 'main'),
    subGlyphs: sub ? place(sub, subOff, 'sub') : [],
    mainBox: boxOf(mainOff, mainAcross, main.extentAlong),
    subBox: sub ? boxOf(subOff, subAcross, sub.extentAlong) : null,
    gapPx: gap,
  };
}

/** 給可見字（非空白）編號：vis（整個字群）、lineVis（行內）、lineVisN（行內總數）。回傳可見字數。 */
export function indexVisible(glyphs: PlacedGlyph[]): number {
  let n = 0;
  const perLine = new Map<number, number>();
  for (const g of glyphs) {
    if (g.space) {
      g.vis = -1;
      continue;
    }
    g.vis = n++;
    const k = g.line;
    g.lineVis = perLine.get(k) || 0;
    perLine.set(k, g.lineVis + 1);
  }
  for (const g of glyphs) g.lineVisN = perLine.get(g.line) || 0;
  return n;
}
