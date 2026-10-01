/**
 * 四個模式的動畫來源（AnimationSource＋影格表）。預覽（Stage）與匯出（exportAnimation）共用同一個來源，
 * 所以預覽看到的每一格就是匯出的那一格（亂碼也相同）。
 *
 * 字的外觀（規格 3.4）用 core/typeset 的 paintGlyph 逐字畫成 sprite：外框以字形輪廓為中心（外側看得到一半）、
 * 圓角；陰影跟著外框（外框 0 時跟著填色）；底線、刪除線以填色畫在外框之後。淡出時整個字一起變透明（主控裁定）。
 * 打字與故障先排好全文、再逐字顯示，字的位置固定（主控裁定）。
 */
import { loopShape } from '@/core/path';
import { createLayerPool, drawKaraokeLine, withLayer } from '@/core/textfx';
import {
  type AnimationSource,
  type Ctx2D,
  type FrameSpec,
  frameIndexAt,
  frameTableDuration,
  seedOf,
} from '@/core/timeline';
import {
  type DecorationRect,
  type GlyphArt,
  type GlyphStyle,
  hangulSteps,
  isWide,
  layoutOnPath,
  type MeasureFn,
  type Meter,
  paintGlyph,
  type TypesetResult,
  textDecorationRects,
  typeset,
  typingVisibleAt,
} from '@/core/typeset';
import { type FontLoad, fontFn, fontKeyOf, fontLoads, loadFonts } from './fonts';
import {
  CREDITS_MARGIN,
  horizontalBlockX,
  horizontalBlockY,
  karaokeRowBand,
  karaokeRowTop,
  verticalBlockX,
  verticalBlockY,
} from './layout';
import type {
  BaseSettings,
  CreditsSettings,
  GlitchSettings,
  HAlign,
  KaraokeSettings,
  Mode,
  TextModeSettings,
  TwData,
  TypingSettings,
  VAlign,
} from './settings';
import {
  creditsFrameCount,
  creditsTop,
  type GlitchTimeline,
  glitchChar,
  glitchSegments,
  glitchTimeline,
  type KaraokeShowPlan,
  karaokeFrames,
  karaokeShowPlan,
  type LyricSchedule,
  lineProgress,
  normalizeNewlines,
  parseLyrics,
  scheduleLyrics,
  type TypingTimeline,
  typingTimeline,
} from './timeline';

export interface TwSource extends AnimationSource {
  mode: Mode;
  frames: FrameSpec[];
  /** 沒有文字（沒有動畫） */
  empty: boolean;
  /** 需要載入的字型與它的代號（代號不變就不必重新載入） */
  fontLoads: FontLoad[];
  fontKey: string;
  prepare(): Promise<void>;
  /** 依文字裁切時要量的那一格 */
  fitFrame: number;
  /** 文字內容的大約範圍（px，依文字裁切時決定暫存畫布的大小） */
  extent: { w: number; h: number };
  /** 測試入口用的時間軸資料 */
  debug:
    | { mode: 'typing'; timeline: TypingTimeline }
    | { mode: 'glitch'; timeline: GlitchTimeline; seed: number }
    | { mode: 'credits'; frames: number; blockH: number; tops: number[] }
    | {
        mode: 'karaoke';
        schedule: LyricSchedule;
        plan: KaraokeShowPlan;
        times: number[];
        /** 每一行未縮放的寬度（字距只算一倍） */
        lineWidths: number[];
      };
}

export interface BuildOptions {
  /** 換掉量測函式（Node 測試用） */
  measure?: MeasureFn;
}

const pool = createLayerPool();
const DEG = Math.PI / 180;

/* ---------- 共用：字的樣式、sprite、背景 ---------- */

function glyphStyle(
  fill: string,
  strokeColor: string,
  strokeWidth: number,
  s: Pick<BaseSettings, 'shadowColor' | 'shadowBlur' | 'shadowX' | 'shadowY'> | null,
): GlyphStyle {
  return {
    fill: { type: 'solid', color: fill, stops: [], opacity: 1 },
    stroke: strokeWidth > 0 ? { w: strokeWidth / 2, color: strokeColor } : null,
    outer: null,
    shadow: s ? { color: s.shadowColor, blur: s.shadowBlur, x: s.shadowX, y: s.shadowY } : null,
    glow: null,
  };
}

type DecoFn = (slotAdv: number, rot0: number) => DecorationRect[];

/** 直書轉 90° 的字：底線、刪除線原本是欄方向的直條，換算到字自己的座標（畫的時候會跟著字轉回去） */
function rotateRectBack(r: DecorationRect): DecorationRect {
  return { x: r.y, y: -r.x - r.w, w: r.h, h: r.w };
}

/** 逐字 sprite 的快取：同一個字、同樣的字格寬度與固定旋轉只畫一次 */
function createPainter(
  css: string,
  meter: Meter,
  style: GlyphStyle,
  italic: boolean,
  deco: DecoFn | null,
): (ch: string, slotAdv: number, rot0: number) => GlyphArt | null {
  const cache = new Map<string, GlyphArt | null>();
  return (ch, slotAdv, rot0) => {
    const key = `${ch}\u0000${slotAdv.toFixed(3)}\u0000${rot0 ? 1 : 0}`;
    let art = cache.get(key);
    if (art === undefined) {
      const m = meter.get(ch);
      art = paintGlyph(ch, css, m, m.w, meter.central, style, null, italic, {
        decorations: deco ? deco(slotAdv, rot0) : [],
      });
      cache.set(key, art);
    }
    return art;
  };
}

/** 把一個字的 sprite 畫在 (x, y)（字身中心）：先水平縮放、再轉 */
function blit(
  ctx: Ctx2D,
  art: GlyphArt | null,
  x: number,
  y: number,
  rot: number,
  sx: number,
  alpha = 1,
): void {
  if (!art || alpha <= 0) return;
  ctx.save();
  if (alpha < 1) ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  if (sx !== 1) ctx.scale(sx, 1);
  if (rot) ctx.rotate(rot);
  ctx.drawImage(art.body as CanvasImageSource, -art.px, -art.py);
  ctx.restore();
}

function paintBackground(ctx: Ctx2D, s: BaseSettings): void {
  if (!s.bgOn) return;
  ctx.save();
  ctx.fillStyle = s.bgColor;
  ctx.fillRect(0, 0, s.width, s.height);
  ctx.restore();
}

const hAlignOf = (a: HAlign) => (a === 'left' ? 'start' : a === 'right' ? 'end' : 'center');
const vAlignOf = (a: VAlign) => (a === 'top' ? 'start' : a === 'bottom' ? 'end' : 'center');

function frameSpecs(ms: readonly number[]): FrameSpec[] {
  return ms.map((v) => ({ ms: v }));
}

/** 外框、陰影、斜體往外擴的距離（依文字裁切時的暫存畫布留白） */
function inkPad(s: BaseSettings & { italic?: boolean }): number {
  return (
    s.strokeWidth +
    s.shadowBlur * 2 +
    Math.max(Math.abs(s.shadowX), Math.abs(s.shadowY)) +
    s.size * (s.italic ? 0.6 : 0.3)
  );
}

/* ---------- 打字與故障：排版（先排好全文） ---------- */

interface Slot {
  /** 字身中心 */
  x: number;
  y: number;
  /** 畫的時候的旋轉（弧度） */
  rot: number;
  /** 固定旋轉（直書轉 90° 的字；決定底線的方向） */
  rot0: number;
  /** 字格沿行方向的寬度（底線的長度） */
  adv: number;
}

interface LinearLayout {
  r: TypesetResult;
  /** 每個單位（units 的索引）的位置；換行為 null */
  slots: (Slot | null)[];
  sx: number;
}

export function linearLayout(
  s: TextModeSettings,
  units: readonly string[],
  font: (px: number) => string,
  measure?: MeasureFn,
): LinearLayout {
  const sx = s.scaleX / 100;
  const S = s.size;
  const text = units.join('');
  const r = typeset({
    main: text,
    size: S,
    mainFont: font,
    vertical: s.vertical,
    tracking: s.tracking / S,
    leading: s.leading,
    align: s.vertical ? vAlignOf(s.valign) : hAlignOf(s.align),
    scaleX: sx,
    measure,
  });
  const lines = Math.max(1, r.lines.main.length);
  const bx = s.vertical
    ? verticalBlockX(s.align, s.width, lines, S, s.leading, sx)
    : horizontalBlockX(s.align, s.width, r.block.w / sx, sx);
  const by = s.vertical
    ? verticalBlockY(s.valign, s.height, r.block.h)
    : horizontalBlockY(s.valign, s.height, lines, S, s.leading);
  let gi = 0;
  const slots = units.map((c) => {
    if (c === '\n') return null;
    const g = r.block.glyphs[gi++];
    if (!g) return null;
    return { x: bx + g.x, y: by + g.y, rot: g.rot0, rot0: g.rot0, adv: g.adv };
  });
  return { r, slots, sx };
}

/** 沿圖形排字（規格 3.6）：字的底邊貼在邊上、字頭朝外；rotationDeg：整個圖形以畫布中心轉幾度 */
function shapeSlots(
  s: TypingSettings,
  units: readonly string[],
  meter: Meter,
): (rotationDeg: number) => (Slot | null)[] {
  if (s.shape === 'none') return () => units.map(() => null);
  const cx = s.width / 2;
  const cy = s.height / 2;
  const path = loopShape(s.shape, cx, cy, s.shapeSize);
  const idx: number[] = [];
  units.forEach((c, i) => {
    if (c !== '\n') idx.push(i);
  });
  const advs = idx.map((i) => meter.get(units[i]).w);
  const base = layoutOnPath(path, advs, {
    tracking: s.tracking,
    offset: s.size / 2,
    center: { x: cx, y: cy },
  });
  return (deg) => {
    const a = deg * DEG;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const out: (Slot | null)[] = units.map(() => null);
    idx.forEach((u, k) => {
      const p = base[k];
      const dx = p.x - cx;
      const dy = p.y - cy;
      out[u] = {
        x: cx + dx * cos - dy * sin,
        y: cy + dx * sin + dy * cos,
        rot: p.angle + a,
        rot0: 0,
        adv: advs[k],
      };
    });
    return out;
  };
}

function decoFor(s: TextModeSettings, path: boolean): DecoFn | null {
  if (!s.underline && !s.strike) return null;
  const kinds = { underline: s.underline, strike: s.strike };
  if (path) return (adv) => textDecorationRects(kinds, adv, { size: s.size, mode: 'path' });
  return (adv, rot0) => {
    const rects = textDecorationRects(kinds, adv, {
      size: s.size,
      tracking: s.tracking,
      vertical: s.vertical,
    });
    return rot0 ? rects.map(rotateRectBack) : rects;
  };
}

/* ---------- 打字 ---------- */

export function buildTypingSource(s: TypingSettings, o: BuildOptions = {}): TwSource {
  const shape = s.shape !== 'none';
  const tl = typingTimeline({
    text: s.text,
    reverse: s.direction === 'reverse',
    fade: s.fade,
    fadeMs: s.fadeMs,
    fps: s.fps,
    holdMs: s.holdMs,
    shape,
    rotate: s.rotate,
  });
  const { units, steps } = tl;
  const drawn = [...new Set(units.flatMap((c) => hangulSteps(c)))].join('');
  const loads = fontLoads(s, drawn);
  const font = fontFn(s, drawn);
  const layout = linearLayout(
    { ...s, vertical: shape ? false : s.vertical },
    units,
    font,
    o.measure,
  );
  const { r, sx } = layout;
  const slotsAt = shape ? shapeSlots(s, units, r.mainMeter) : () => layout.slots;
  const paint = createPainter(
    r.mainCss,
    r.mainMeter,
    glyphStyle(s.fill, s.strokeColor, s.strokeWidth, s),
    s.italic,
    decoFor(s, shape),
  );
  const frames = frameSpecs(tl.frames.map((f) => f.ms));
  const maxCount = tl.frames.reduce((m, f) => Math.max(m, f.count), 0);
  const pad = inkPad(s);
  return {
    mode: 'typing',
    width: s.width,
    height: s.height,
    duration: frameTableDuration(frames),
    frames,
    empty: !tl.frames.length,
    fontLoads: loads,
    fontKey: fontKeyOf(loads),
    prepare: () => loadFonts(loads),
    fitFrame: Math.max(
      0,
      tl.frames.findIndex((f) => f.count === maxCount),
    ),
    extent: shape
      ? { w: 2 * (s.shapeSize + s.size * 1.6) + pad, h: 2 * (s.shapeSize + s.size * 1.6) + pad }
      : { w: r.block.w + pad, h: r.block.h + pad },
    debug: { mode: 'typing', timeline: tl },
    render(ctx, t) {
      paintBackground(ctx, s);
      const i = frameIndexAt(frames, t);
      if (i < 0) return;
      const fr = tl.frames[i];
      const shown = typingVisibleAt(units, steps, fr.count);
      const slots = slotsAt(fr.rotation);
      const draw = (c: Ctx2D) => {
        c.save();
        if (shape && sx !== 1) {
          c.translate(s.width / 2, 0);
          c.scale(sx, 1);
          c.translate(-s.width / 2, 0);
        }
        shown.forEach((ch, u) => {
          if (ch === null || ch === '\n') return;
          const slot = slots[u];
          if (!slot) return;
          const a = fr.alphas ? fr.alphas[u] : 1;
          if (a <= 0) return;
          blit(c, paint(ch, slot.adv, slot.rot0), slot.x, slot.y, slot.rot, shape ? 1 : sx, a);
        });
        c.restore();
      };
      if (fr.alpha < 1) withLayer(ctx, pool, draw, { alpha: fr.alpha });
      else draw(ctx);
    },
  };
}

/* ---------- 故障 ---------- */

/** 亂碼的種子：只看會影響時間軸與亂碼的設定（同樣的設定每次都抽到同樣的亂碼） */
export function glitchSeed(s: GlitchSettings): number {
  return seedOf(
    JSON.stringify([normalizeNewlines(s.text), s.intensity, s.together, s.charsets, s.fps]),
  );
}

export function buildGlitchSource(s: GlitchSettings, o: BuildOptions = {}): TwSource {
  const tl = glitchTimeline({
    text: s.text,
    intensity: s.intensity,
    together: s.together,
    fps: s.fps,
    holdMs: s.holdMs,
  });
  const { units } = tl;
  const seed = glitchSeed(s);
  const segs = glitchSegments(s.charsets);
  /* 每一格的亂碼（預覽與匯出相同）；也決定要載入哪些字 */
  const randoms: Map<number, string>[] = tl.frames.map((f, i) => {
    const m = new Map<number, string>();
    for (const u of f.glitched) m.set(u, glitchChar(seed, i, u, segs));
    return m;
  });
  const used = new Set(units);
  for (const m of randoms) for (const c of m.values()) used.add(c);
  used.delete('\n');
  const drawn = [...used].join('');
  const loads = fontLoads(s, drawn);
  const font = fontFn(s, drawn);
  const layout = linearLayout(s, units, font, o.measure);
  const { r, sx } = layout;
  const paint = createPainter(
    r.mainCss,
    r.mainMeter,
    glyphStyle(s.fill, s.strokeColor, s.strokeWidth, s),
    s.italic,
    decoFor(s, false),
  );
  const frames = frameSpecs(tl.frames.map((f) => f.ms));
  const pad = inkPad(s);
  return {
    mode: 'glitch',
    width: s.width,
    height: s.height,
    duration: frameTableDuration(frames),
    frames,
    empty: !tl.frames.length,
    fontLoads: loads,
    fontKey: fontKeyOf(loads),
    prepare: () => loadFonts(loads),
    fitFrame: Math.max(0, tl.frames.length - 1),
    extent: { w: r.block.w + pad, h: r.block.h + pad },
    debug: { mode: 'glitch', timeline: tl, seed },
    render(ctx, t) {
      paintBackground(ctx, s);
      const i = frameIndexAt(frames, t);
      if (i < 0) return;
      const fr = tl.frames[i];
      const rnd = randoms[i];
      for (let u = 0; u < fr.shown; u++) {
        const ch = units[u];
        if (ch === '\n') continue;
        const slot = layout.slots[u];
        if (!slot) continue;
        const rc = rnd.get(u);
        if (rc === undefined) {
          blit(ctx, paint(ch, slot.adv, slot.rot0), slot.x, slot.y, slot.rot, sx);
          continue;
        }
        /* 亂碼畫在那個字的位置（置中）；直書時半形的亂碼跟英數一樣轉 90° */
        const rot0 = s.vertical && !isWide(rc) ? Math.PI / 2 : 0;
        blit(ctx, paint(rc, slot.adv, rot0), slot.x, slot.y, rot0, sx);
      }
    },
  };
}

/* ---------- 片尾名單 ---------- */

export function buildCreditsSource(s: CreditsSettings, o: BuildOptions = {}): TwSource {
  const text = normalizeNewlines(s.text);
  const empty = text === '';
  const spec = { ...s, italic: false };
  const drawn = [...new Set(Array.from(text))].filter((c) => c !== '\n').join('');
  const loads = fontLoads(spec, drawn);
  const font = fontFn(spec, drawn);
  const S = s.size;
  const r = typeset({
    main: text,
    size: S,
    mainFont: font,
    leading: s.leading,
    align: hAlignOf(s.align),
    measure: o.measure,
  });
  const lineCount = text.split('\n').length;
  const blockH = lineCount * S * s.leading;
  const bx = horizontalBlockX(s.align, s.width, r.block.w, 1, CREDITS_MARGIN);
  const n = empty ? 0 : creditsFrameCount(s.duration, s.fps);
  const frames = frameSpecs(Array.from({ length: n }, () => 1000 / s.fps));
  const tops = Array.from({ length: n }, (_, i) => creditsTop(i, n, s.height, blockH));
  const paint = createPainter(
    r.mainCss,
    r.mainMeter,
    glyphStyle(s.fill, s.strokeColor, s.strokeWidth, s),
    false,
    null,
  );
  const pad = inkPad(s) + S;
  return {
    mode: 'credits',
    width: s.width,
    height: s.height,
    duration: frameTableDuration(frames),
    frames,
    empty,
    fontLoads: loads,
    fontKey: fontKeyOf(loads),
    prepare: () => loadFonts(loads),
    fitFrame: 0,
    extent: { w: r.block.w, h: blockH },
    debug: { mode: 'credits', frames: n, blockH, tops },
    render(ctx, t) {
      paintBackground(ctx, s);
      const i = frameIndexAt(frames, t);
      if (i < 0) return;
      const top = tops[i];
      for (const g of r.block.glyphs) {
        const y = top + g.y;
        if (y < -pad || y > s.height + pad) continue;
        blit(ctx, paint(g.ch, g.adv, 0), bx + g.x, y, 0, 1);
      }
    },
  };
}

/* ---------- 卡拉 OK ---------- */

export function buildKaraokeSource(s: KaraokeSettings, o: BuildOptions = {}): TwSource {
  const schedule = scheduleLyrics(parseLyrics(s.text), {
    duration: s.duration,
    intro: s.intro,
    alloc: s.alloc,
  });
  const kf = karaokeFrames(schedule, s.fps, s.holdMs);
  const plan = karaokeShowPlan(schedule, s.show, s.rows, s.swapFade);
  const L = schedule.lines;
  const display = L.map((l) => l.text).join('\n');
  const drawn = [...new Set(Array.from(display))].filter((c) => c !== '\n').join('');
  const loads = fontLoads(s, drawn);
  const font = fontFn(s, drawn);
  const S = s.size;
  const sx = s.scaleX / 100;
  const r = typeset({
    main: display,
    size: S,
    mainFont: font,
    tracking: s.tracking / S,
    leading: s.leading,
    align: 'start',
    scaleX: sx,
    measure: o.measure,
  });
  const glyphsOf = L.map(() => [] as TypesetResult['block']['glyphs']);
  for (const g of r.block.glyphs) glyphsOf[g.line]?.push(g);
  const lineWidths = L.map((_, i) => r.main.lineInfo[i]?.len ?? 0);
  const lineX = lineWidths.map((w) => horizontalBlockX(s.align, s.width, w, sx));
  const rowTop = (row: number) => karaokeRowTop(row, plan.rows, s.valign, s.height, S, s.leading);
  const before = createPainter(
    r.mainCss,
    r.mainMeter,
    glyphStyle(s.beforeFill, s.beforeStroke, s.strokeWidth, s),
    s.italic,
    null,
  );
  const after = createPainter(
    r.mainCss,
    r.mainMeter,
    glyphStyle(s.afterFill, s.afterStroke, s.strokeWidth, null),
    s.italic,
    null,
  );
  const frames = frameSpecs(kf.map((f) => f.ms));
  const drawGlyphs =
    (li: number, painter: typeof before, top: number) =>
    (c: Ctx2D): void => {
      for (const g of glyphsOf[li])
        blit(c, painter(g.ch, g.adv, 0), lineX[li] + g.x, top + S / 2, 0, sx);
    };
  const drawLine = (c: Ctx2D, li: number, t: number) => {
    const row = plan.rowOf[li];
    if (row < 0) return;
    const top = rowTop(row);
    const band = karaokeRowBand(row, plan.rows, top, s.height, S, s.leading);
    const left = lineX[li];
    drawKaraokeLine(c, pool, {
      drawBefore: drawGlyphs(li, before, top),
      drawAfter: drawGlyphs(li, after, top),
      progress: lineProgress(L[li], t),
      lineLeft: left,
      lineRight: left + lineWidths[li] * sx,
      top: band.top,
      bottom: band.bottom,
      extend: s.strokeWidth + s.shadowBlur + 8,
      softness: s.softness,
      direction: s.direction,
      glow: s.glowOn ? { color: s.glowColor, width: s.glowWidth } : null,
    });
  };
  return {
    mode: 'karaoke',
    width: s.width,
    height: s.height,
    duration: frameTableDuration(frames),
    frames,
    empty: !kf.length,
    fontLoads: loads,
    fontKey: fontKeyOf(loads),
    prepare: () => loadFonts(loads),
    fitFrame: Math.max(0, kf.length - 1),
    extent: { w: Math.max(0, ...lineWidths) * sx, h: plan.rows * S * s.leading },
    debug: { mode: 'karaoke', schedule, plan, times: kf.map((f) => f.t), lineWidths },
    render(ctx, t) {
      paintBackground(ctx, s);
      const i = frameIndexAt(frames, t);
      if (i < 0) return;
      const tau = kf[i].t;
      const alphas = plan.alphaAt(tau);
      /* 同一透明度的句子先合成完整畫面（唱前＋唱後＋發光）再整體套透明度 */
      const groups = new Map<number, number[]>();
      alphas.forEach((a, li) => {
        if (a <= 0 || !L[li].sung) return;
        const list = groups.get(a);
        if (list) list.push(li);
        else groups.set(a, [li]);
      });
      for (const [a, list] of groups) {
        const draw = (c: Ctx2D) => {
          for (const li of list) drawLine(c, li, tau);
        };
        if (a >= 1) draw(ctx);
        else withLayer(ctx, pool, draw, { alpha: a });
      }
    },
  };
}

/* ---------- 依模式建立 ---------- */

export function buildSource(mode: Mode, data: TwData, o: BuildOptions = {}): TwSource {
  switch (mode) {
    case 'typing':
      return buildTypingSource(data.typing, o);
    case 'glitch':
      return buildGlitchSource(data.glitch, o);
    case 'credits':
      return buildCreditsSource(data.credits, o);
    case 'karaoke':
      return buildKaraokeSource(data.karaoke, o);
  }
}
