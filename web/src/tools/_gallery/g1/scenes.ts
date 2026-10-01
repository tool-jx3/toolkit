/**
 * 「文字演出」分頁的示範動畫（只是共用層的用法示範，不是任何工具的正式輸出）：
 * - 打字（影格表）：先排好全文、再逐字顯示（韓文依組字過程），最後一格停留任意毫秒；底線、刪除線、水平縮放。
 * - 循環：放大填滿的字級＋整段文字的裝飾層（core/textfx）＋循環特效層（core/fxlayers），無縫循環。
 * - 卡拉 OK：唱前文字＋遮罩後的唱後文字＋加亮的掃描發光帶。
 */
import { ensureFont } from '@/core/fonts';
import { drawLoopFx, LOOP_FX_ORDER, type LoopFxEnv, type LoopFxKind } from '@/core/fxlayers';
import {
  createLayerPool,
  drawKaraokeLine,
  fillBox,
  type Paint,
  renderTextFx,
  shapeFromTypeset,
  shapeRadius,
  type TextFxLayer,
  type TextShape,
  textFxExtent,
  traceShape,
} from '@/core/textfx';
import {
  type AnimationSource,
  type Ctx2D,
  type FrameSpec,
  frameIndexAt,
  frameTableDuration,
  loopNoise2,
  uniformFrames,
} from '@/core/timeline';
import {
  canvasFont,
  fontStack,
  type GlyphArt,
  type GlyphStyle,
  hangulSteps,
  paintGlyph,
  placeBox,
  textDecorationRects,
  typeset,
  typesetToFill,
  typingSteps,
  typingVisibleAt,
} from '@/core/typeset';
import type { G1DemoState, StyleId } from './store';

const FAMILY = 'Noto Sans TC';
const KR = 'Noto Sans KR';
const fontFor = (text: string, weight: number) => (px: number) =>
  canvasFont(fontStack({ family: FAMILY, styleClass: 'sans' }, text), weight, px);

/** 字型（只下載用到的字；韓文另外接 Noto Sans KR） */
async function loadFonts(text: string, weight: number): Promise<void> {
  const hangul = Array.from(text).filter((c) => /[ᄀ-ᇿ㄰-㆏가-힣]/.test(c));
  await Promise.all([
    ensureFont(FAMILY, weight, text),
    hangul.length ? ensureFont(KR, weight, hangul.join('')) : Promise.resolve(),
  ]);
}

/* ---------- 打字（影格表） ---------- */

export const TYPING_W = 480;
export const TYPING_H = 270;

export interface TypingSource extends AnimationSource {
  frames: readonly FrameSpec[];
  /** 逐字步驟數（＝影格數） */
  steps: number;
}

/** 文字的每個碼位對應到排版後的哪個字（換行是 null：佔一步、不畫） */
function unitsOf(text: string) {
  return Array.from(text.replace(/\r\n?/g, '\n'));
}

export function createTypingSource(s: G1DemoState, text = s.typingText): TypingSource {
  const units = unitsOf(text);
  const steps = typingSteps(units);
  const allShown = [...new Set(units.flatMap((c) => hangulSteps(c)))].join('');
  const font = fontFor(text + allShown, 700);
  const r = typeset({ main: text, size: 40, mainFont: font, leading: 1.35, scaleX: s.scaleX });
  const area = { width: TYPING_W, height: TYPING_H, marginX: 16, marginY: 16 };
  const pos = placeBox({ w: r.block.w, h: r.block.h }, area, 'mc', { keepInside: false });
  /* 碼位 → 排版後的字（排版不含換行） */
  const glyphOf: (number | null)[] = [];
  let gi = 0;
  for (const c of units) {
    if (c === '\n') glyphOf.push(null);
    else glyphOf.push(gi++);
  }
  const style: GlyphStyle = {
    fill: { type: 'solid', color: '#fff7e8', stops: [], opacity: 1 },
    stroke: { w: 3, color: '#20172e' },
    outer: null,
    shadow: { color: 'rgba(0,0,0,0.45)', blur: 4, x: 2, y: 2 },
    glow: null,
  };
  const sprites = new Map<string, GlyphArt | null>();
  const sprite = (ch: string) => {
    let a = sprites.get(ch);
    if (a === undefined) {
      const m = r.mainMeter.get(ch);
      a = paintGlyph(ch, r.mainCss, m, m.w, r.mainMeter.central, style, null, false, {
        decorations: textDecorationRects({ underline: s.underline, strike: s.strike }, m.w, {
          size: r.size,
        }),
      });
      sprites.set(ch, a);
    }
    return a;
  };
  const frames = uniformFrames(steps.length, s.typingFps, { holdMs: s.holdMs });
  const sx = r.block.scaleX ?? 1;
  return {
    width: TYPING_W,
    height: TYPING_H,
    duration: frameTableDuration(frames),
    frames,
    steps: steps.length,
    prepare: () => loadFonts(text + allShown, 700),
    render(ctx: Ctx2D, t: number) {
      const shown = typingVisibleAt(units, steps, frameIndexAt(frames, t) + 1);
      shown.forEach((ch, i) => {
        const g = glyphOf[i];
        if (ch === null || g === null) return;
        const glyph = r.block.glyphs[g];
        const art = sprite(ch);
        if (!glyph || !art) return;
        ctx.save();
        ctx.translate(pos.x + glyph.x, pos.y + glyph.y);
        if (glyph.rot0) ctx.rotate(glyph.rot0);
        if (sx !== 1) ctx.scale(sx, 1);
        ctx.drawImage(art.body as CanvasImageSource, -art.px, -art.py);
        ctx.restore();
      });
    },
  };
}

/** 分段（示範多檔匯出）：以第一個換行切成兩段 */
export function typingParts(s: G1DemoState): { name: string; text: string }[] {
  const lines = s.typingText.split('\n');
  const head = lines[0] ?? '';
  const rest = lines.slice(1).join('\n');
  return [
    { name: `1_${head || '片段'}`, text: head || ' ' },
    { name: `2_${rest.split('\n')[0] || '片段'}`, text: rest || ' ' },
  ];
}

/* ---------- 循環：文字加工＋特效 ---------- */

export const STYLE_LABELS: Record<StyleId, string> = {
  double: '雙層外框',
  extrude: '立體擠出',
  neon: '霓虹發光',
  hard: '硬陰影',
  sticker: '貼紙',
  glitch: '色差',
  stripes: '斜紋填色',
  knockout: '挖空',
};

const RAINBOW: Paint = { kind: 'rainbow' };

/** 示範用的加工組合（以字級為單位；數值是這個展示頁自己定的） */
export function styleLayers(style: StyleId, S: number): TextFxLayer[] {
  const solid = (color: string): Paint => ({ kind: 'solid', color });
  switch (style) {
    case 'double':
      return [
        { kind: 'outline', paint: solid('#1d1233'), width: S * 0.1 },
        { kind: 'outline', paint: solid('#ffffff'), width: S * 0.04 },
        { kind: 'fill', paint: RAINBOW },
      ];
    case 'extrude':
      return [
        {
          kind: 'extrude',
          paint: solid('#5b2a0c'),
          dx: S * 0.09 * Math.cos(Math.PI / 3),
          dy: S * 0.09 * Math.sin(Math.PI / 3),
          spread: S * 0.05,
        },
        { kind: 'outline', paint: solid('#5b2a0c'), width: S * 0.05 },
        { kind: 'fill', paint: { kind: 'metal', tone: 'gold' } },
      ];
    case 'neon':
      return [
        { kind: 'glow', color: '#ff4fd8', blur: S * 0.22 },
        { kind: 'glow', color: '#ff4fd8', blur: S * 0.11 },
        { kind: 'glow', color: '#ff4fd8', blur: S * 0.05 },
        { kind: 'outline', paint: solid('#ff4fd8'), width: S * 0.025 },
        { kind: 'fill', paint: solid('#ffffff') },
      ];
    case 'hard':
      return [
        { kind: 'shadow', color: '#00b3a4', dx: S * 0.07, dy: S * 0.07, spread: S * 0.07 },
        { kind: 'outline', paint: solid('#11131a'), width: S * 0.07 },
        {
          kind: 'fill',
          paint: {
            kind: 'gradient',
            stops: [
              { offset: 0, color: '#fff3b0' },
              { offset: 1, color: '#ff8a3d' },
            ],
          },
        },
      ];
    case 'sticker':
      return [
        {
          kind: 'shadow',
          color: 'rgba(0,0,0,0.45)',
          blur: S * 0.05,
          dx: S * 0.02,
          dy: S * 0.04,
          spread: S * 0.14,
        },
        { kind: 'outline', paint: solid('#ffffff'), width: S * 0.14 },
        { kind: 'outline', paint: solid('#2a2440'), width: S * 0.05 },
        { kind: 'fill', paint: solid('#ffd23f') },
      ];
    case 'glitch':
      return [
        { kind: 'outline', paint: solid('#0b0d17'), width: S * 0.06 },
        {
          kind: 'aberration',
          colors: ['#ff2a55', '#00e5ff'],
          dx: S * 0.03,
          jitter: [
            { x: S * 0.008, y: -S * 0.006 },
            { x: -S * 0.01, y: S * 0.004 },
          ],
          spread: S * 0.06,
        },
        { kind: 'fill', paint: solid('#f5f7ff') },
      ];
    case 'stripes':
      return [
        { kind: 'outline', paint: solid('#1d1233'), width: S * 0.1 },
        { kind: 'outline', paint: solid('#ffffff'), width: S * 0.04 },
        {
          kind: 'fill',
          paint: { kind: 'stripes', colors: ['#ffffff', '#e8283c'], width: S * 0.16 },
        },
      ];
    case 'knockout':
      return [{ kind: 'knockout' }];
  }
}

export interface LoopScene {
  /** 畫 t（循環進度 0～1）的畫面 */
  draw(ctx: Ctx2D, t: number): void;
  size: number;
  shape: TextShape;
}

const pool = createLayerPool();

/** 一個循環的畫面（正方形畫布 size × size） */
export function buildLoopScene(
  s: Pick<G1DemoState, 'loopText' | 'style' | 'fx' | 'pulse' | 'lines'>,
  size: number,
  { lineScale = 1 }: { lineScale?: number } = {},
): LoopScene {
  const text = s.loopText.trim() ? s.loopText : ' ';
  const probe = styleLayers(s.style, 1);
  const ext = textFxExtent(probe);
  const r = typesetToFill(
    { main: text, mainFont: fontFor(text, 900), leading: 1.1, tracking: 0.02 },
    { width: size, height: size, padPerSize: Math.max(ext.max, ext.outlineSum) },
  );
  const pos = { x: (size - r.block.w) / 2, y: (size - r.block.h) / 2 };
  const shape = shapeFromTypeset(r, pos);
  const layers = styleLayers(s.style, r.size);
  const env: LoopFxEnv = { width: size, height: size, textRadius: shapeRadius(shape), seed: 12345 };
  const fx = s.fx === 'none' ? null : (s.fx as LoopFxKind);
  const fxOptions =
    fx === 'speedLines' ? { count: Math.max(4, Math.round(s.lines * lineScale)) } : {};
  return {
    size,
    shape,
    draw(ctx, t) {
      if (s.style === 'knockout') fillBox(ctx, RAINBOW, { x: 0, y: 0, w: size, h: size }, t);
      if (fx && LOOP_FX_ORDER[fx] === 'behind') drawLoopFx(ctx, fx, env, fxOptions, t);
      const jitter = loopNoise2(12345, t);
      renderTextFx(ctx, shape, layers, {
        t,
        pool,
        transform: s.pulse
          ? {
              cx: size / 2,
              cy: size / 2,
              scale: 1 + 0.05 * Math.sin(t * Math.PI * 2),
              dx: jitter.x * size * 0.004,
              dy: jitter.y * size * 0.004,
            }
          : undefined,
      });
      if (fx && LOOP_FX_ORDER[fx] === 'front') drawLoopFx(ctx, fx, env, fxOptions, t);
    },
  };
}

export function createLoopSource(
  s: G1DemoState,
  { lineScale = 1 }: { lineScale?: number } = {},
): AnimationSource {
  const scene = buildLoopScene(s, s.size, { lineScale });
  return {
    width: s.size,
    height: s.size,
    duration: s.frames / s.fps,
    loop: true,
    stillTime: 0,
    prepare: () => loadFonts(s.loopText, 900),
    render(ctx, t) {
      scene.draw(ctx, ((t * s.fps) / s.frames) % 1);
    },
  };
}

/* ---------- 卡拉 OK ---------- */

export const KARAOKE_W = 480;
export const KARAOKE_H = 270;
const INTRO = 0.5;
const PER_LINE = 1.5;

export function createKaraokeSource(s: G1DemoState): AnimationSource {
  const lines = s.lyrics.split('\n');
  const font = fontFor(s.lyrics, 700);
  const S = 30;
  const pitch = S * 1.5;
  const top0 = (KARAOKE_H - lines.length * pitch) / 2;
  const layouts = lines.map((line, i) => {
    const r = typeset({ main: line || ' ', size: S, mainFont: font });
    const x = (KARAOKE_W - r.block.w) / 2;
    const y = top0 + i * pitch + (pitch - S) / 2;
    return { r, shape: shapeFromTypeset(r, { x, y }), x, y, w: r.block.w };
  });
  const sung = lines.filter((l) => l.trim()).length;
  const duration = INTRO + sung * PER_LINE + 1;
  const draw = (shape: TextShape, fill: string, stroke: string, shadow: boolean) => (c: Ctx2D) => {
    c.save();
    if (shadow) {
      c.shadowColor = 'rgba(0,0,0,0.6)';
      c.shadowBlur = 6;
      c.shadowOffsetX = 2;
      c.shadowOffsetY = 2;
    }
    c.lineWidth = 6;
    c.strokeStyle = stroke;
    traceShape(c, shape, 'stroke');
    c.shadowColor = 'transparent';
    c.fillStyle = fill;
    traceShape(c, shape, 'fill');
    c.restore();
  };
  return {
    width: KARAOKE_W,
    height: KARAOKE_H,
    duration,
    stillTime: duration,
    prepare: () => loadFonts(s.lyrics, 700),
    render(ctx, t) {
      let k = 0;
      layouts.forEach((L, i) => {
        if (!lines[i].trim()) return;
        const start = INTRO + k * PER_LINE;
        k++;
        const progress = (t - start) / PER_LINE;
        drawKaraokeLine(ctx, pool, {
          drawBefore: draw(L.shape, '#ffffff', '#333333', true),
          drawAfter: draw(L.shape, '#ffe66d', '#ff2e63', false),
          progress,
          lineLeft: L.x,
          lineRight: L.x + L.w,
          top: i === 0 ? 0 : L.y - (pitch - S) / 2,
          bottom: i === lines.length - 1 ? KARAOKE_H : L.y + S + (pitch - S) / 2,
          extend: 6 + 6 + 8,
          softness: s.softness,
          glow: s.glow ? { color: '#ffffff', width: 26 } : null,
        });
      });
    },
  };
}
