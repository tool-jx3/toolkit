/**
 * 場景（規格 3）：把設定排版成畫布、算好時間表，提供 render(ctx, t) 給預覽與匯出共用（AnimationSource）。
 */
import { ensureFont } from '@/core/fonts';
import { type AnimationSource, type Ctx2D, clamp01, hashSigned, timeSlot } from '@/core/timeline';
import { canvasMeasure, type MeasureFn } from '@/core/typeset/measure';
import { type DrawEnv, deviceScale, drawBubble, FULL_TEXT, type TextState } from './draw';
import {
  arrangeBubbles,
  type BubbleLayout,
  boldWeight,
  cachedUnit,
  layoutBubble,
  planCanvas,
} from './layout';
import { type Bubble, hasContent, type SbData } from './model';
import { combine, enterPose, exitPose, idlePose, type Pose } from './motion';
import {
  appearanceOrder,
  computeTiming,
  type ItemTiming,
  LINE_FADE,
  LINE_STEP,
  TEXT_FADE,
  type Timing,
  textDuration,
} from './timeline';

export interface SceneItem {
  index: number;
  bubble: Bubble;
  layout: BubbleLayout;
  /** 本體左上角在畫布上的位置 */
  x: number;
  y: number;
  rotate: number;
  timing: ItemTiming;
  seed: number;
  phase: number;
}

export interface Scene extends AnimationSource {
  width: number;
  height: number;
  duration: number;
  /** 全部出現完的時間（代表畫面） */
  ready: number;
  leave: number;
  stillTime: number;
  items: SceneItem[];
  /** 依出現順序（後出現的畫在上面） */
  drawOrder: SceneItem[];
  timing: Timing;
  /** 沒有任何內容 */
  empty: boolean;
  /** 自訂畫布放不下內容（會被裁掉） */
  overflow: boolean;
  /** 要載入的字型（預覽與匯出前） */
  fontLoads: { family: string; weight: number; text: string }[];
  fontKey: string;
}

/** 沒有內容時的畫布 */
export const EMPTY_SIZE = { width: 320, height: 180 };

/** 每個泡泡的亂數種子：只看清單位置（改字、換造型時外形不會跳） */
export const itemSeed = (index: number): number => 7919 * (index + 1) + 101;

export function buildScene(d: SbData, measure: MeasureFn = canvasMeasure): Scene {
  const unit = cachedUnit(measure);
  const opts = {
    font: d.font,
    fontSize: d.fontSize,
    lineHeight: d.lineHeight,
    wrapWidth: d.wrapWidth,
    shadow: d.shadow,
  };
  const live = d.bubbles
    .map((bubble, index) => ({ bubble, index }))
    .filter((x) => hasContent(x.bubble));
  const layouts = live.map(({ bubble, index }) => ({
    index,
    layout: layoutBubble(bubble, opts, unit),
  }));
  const allOrder = appearanceOrder(
    d.bubbles.map((_, i) => String(i)),
    d.order,
  );
  const order = allOrder.filter((i) => layouts.some((l) => l.index === i));
  const arranged = arrangeBubbles(layouts, d, order);
  const plan = planCanvas(arranged, d);
  const timing = computeTiming(
    layouts.map(({ index, layout }) => ({
      index,
      textDur: textDuration(d, layout.chars, layout.lines.length),
    })),
    order,
    d,
  );
  const byIndex = new Map(timing.items.map((t) => [t.index, t]));
  const items: SceneItem[] = arranged.items.map((p) => {
    const tm = byIndex.get(p.index)!;
    return {
      index: p.index,
      bubble: d.bubbles[p.index],
      layout: p.layout,
      x: plan.ox + p.x,
      y: plan.oy + p.y,
      rotate: p.rotate,
      timing: tm,
      seed: itemSeed(p.index),
      phase: (tm.rank * 0.37) % 1,
    };
  });
  const drawOrder = [...items].sort((a, b) => a.timing.rank - b.timing.rank);
  const empty = items.length === 0;
  const width = empty ? EMPTY_SIZE.width : plan.width;
  const height = empty ? EMPTY_SIZE.height : plan.height;
  const duration = empty ? 1 : Math.max(0.05, timing.duration);

  const bodyText = live.map((x) => x.bubble.text).join('');
  const titleText = live.map((x) => x.bubble.title + x.bubble.button).join('');
  const fontLoads = [
    { family: d.font.family, weight: d.font.weight, text: bodyText || '永' },
    { family: d.font.family, weight: boldWeight(d.font.weight), text: titleText || '永' },
  ];

  const scene: Scene = {
    width,
    height,
    duration,
    ready: timing.ready,
    leave: timing.leave,
    stillTime: empty ? 0 : Math.min(duration, timing.ready),
    segments: timing.segments,
    items,
    drawOrder,
    timing,
    empty,
    overflow: plan.overflow,
    fontLoads,
    fontKey: JSON.stringify(fontLoads),
    prepare: async () => {
      await loadSceneFonts(scene);
    },
    render: (ctx, t) => renderScene(ctx, scene, d, t),
  };
  return scene;
}

export async function loadSceneFonts(scene: Pick<Scene, 'fontLoads'>): Promise<void> {
  await Promise.all(
    scene.fontLoads.map((f) => ensureFont(f.family, f.weight, f.text).catch(() => false)),
  );
}

/** 這個泡泡在 t 秒的文字狀態（規格 3.4） */
export function textStateAt(d: SbData, it: SceneItem, t: number): TextState {
  const tm = it.timing;
  const L = it.layout;
  switch (d.textAnim) {
    case 'with':
      return FULL_TEXT;
    case 'fade':
      return { ...FULL_TEXT, alpha: clamp01((t - tm.text0) / TEXT_FADE) };
    case 'line':
      return {
        ...FULL_TEXT,
        lines: L.lines.map((_, i) => {
          const p = clamp01((t - tm.text0 - i * LINE_STEP) / LINE_FADE);
          return { alpha: p, dy: (1 - (1 - (1 - p) ** 3)) * L.fs * 0.35 };
        }),
      };
    case 'type': {
      const visible = t < tm.text0 ? 0 : Math.floor((t - tm.text0) * d.typeSpeed + 1e-6);
      const typing = t < tm.text1;
      return {
        visible,
        alpha: 1,
        lines: null,
        cursor: d.cursor,
        cursorOn: typing || Math.floor((t - tm.text1) / 0.5 + 1e-6) % 2 === 0,
      };
    }
  }
}

/** 這個泡泡在 t 秒的姿勢（登場 × 停留 × 退場） */
export function poseAt(
  d: SbData,
  it: SceneItem,
  t: number,
  scene: Pick<Scene, 'items'>,
): Pose | null {
  const tm = it.timing;
  if (t < tm.enter0 || t >= tm.exit1) return null;
  const ctx = { fs: it.layout.fs, align: it.bubble.align, seed: it.seed, t };
  const enter = enterPose(d.enter, d.enterDur > 0 ? (t - tm.enter0) / d.enterDur : 1, ctx);
  const idle = idlePose(d.idle, t - tm.enter1, {
    fs: it.layout.fs,
    seed: it.seed,
    phase: it.phase,
  });
  let pose = combine(enter, idle);
  if (Number.isFinite(tm.exit0) && t >= tm.exit0) {
    /* 輪流時沒有退場動畫的中間泡泡用淡出讓位 */
    const kind = d.exit === 'none' ? 'fade' : d.exit;
    const len = tm.exit1 - tm.exit0;
    pose = combine(pose, exitPose(kind, len > 0 ? (t - tm.exit0) / len : 1, ctx));
  }
  void scene;
  return pose.alpha > 0.001 && pose.scale > 0.001 ? pose : null;
}

/* ---------- 故障效果用的暫存畫布 ---------- */

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
const pool: AnyCanvas[] = [];

function scratch(i: number, w: number, h: number): { c: AnyCanvas; x: Ctx2D } | null {
  if (!pool[i]) {
    if (typeof document !== 'undefined') pool[i] = document.createElement('canvas');
    else if (typeof OffscreenCanvas !== 'undefined') pool[i] = new OffscreenCanvas(1, 1);
    else return null;
  }
  const c = pool[i];
  const W = Math.max(1, Math.ceil(w));
  const H = Math.max(1, Math.ceil(h));
  if (c.width !== W || c.height !== H) {
    c.width = W;
    c.height = H;
  }
  const x = c.getContext('2d') as Ctx2D | null;
  if (!x) return null;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalAlpha = 1;
  x.globalCompositeOperation = 'source-over';
  x.clearRect(0, 0, W, H);
  return { c, x };
}

/** 故障：先畫到暫存畫布，再切成橫條左右錯開，加上青色、洋紅的殘影 */
function drawGlitched(ctx: Ctx2D, it: SceneItem, env: DrawEnv, g: number, t: number): boolean {
  const L = it.layout;
  const s = Math.min(4, deviceScale(ctx));
  const ex = L.ext;
  const vw = L.w + ex.l + ex.r;
  const vh = L.h + ex.t + ex.b;
  const layer = scratch(0, vw * s, vh * s);
  if (!layer) return false;
  layer.x.setTransform(s, 0, 0, s, ex.l * s, ex.t * s);
  drawBubble(layer.x, L, it.bubble, env);
  const slot = timeSlot(t, 15);
  const fs = L.fs;
  /* 殘影 */
  const tint = scratch(1, vw * s, vh * s);
  if (tint) {
    for (const [col, k] of [
      ['#00e5ff', -1],
      ['#ff2bd6', 1],
    ] as const) {
      tint.x.setTransform(1, 0, 0, 1, 0, 0);
      tint.x.globalCompositeOperation = 'source-over';
      tint.x.clearRect(0, 0, tint.c.width, tint.c.height);
      tint.x.drawImage(layer.c, 0, 0);
      tint.x.globalCompositeOperation = 'source-in';
      tint.x.fillStyle = col;
      tint.x.fillRect(0, 0, tint.c.width, tint.c.height);
      ctx.save();
      ctx.globalAlpha *= 0.45 * g;
      ctx.drawImage(tint.c, -ex.l + k * fs * 0.22 * g, -ex.t, vw, vh);
      ctx.restore();
    }
  }
  /* 橫條錯開 */
  const bands = 7;
  let y = 0;
  for (let k = 0; k < bands; k++) {
    const hk =
      k === bands - 1 ? vh - y : vh * (0.08 + 0.12 * Math.abs(hashSigned(it.seed, slot, 60 + k)));
    const off =
      Math.abs(hashSigned(it.seed, slot, 80 + k)) > 0.45
        ? hashSigned(it.seed, slot, 90 + k) * fs * 0.7 * g
        : 0;
    const h = Math.max(0, Math.min(hk, vh - y));
    if (h > 0) ctx.drawImage(layer.c, 0, y * s, vw * s, h * s, -ex.l + off, -ex.t + y, vw, h);
    y += h;
    if (y >= vh) break;
  }
  return true;
}

/** 畫 t 秒的畫面（畫布已清空；原點在畫布左上角） */
export function renderScene(ctx: Ctx2D, scene: Scene, d: SbData, t: number): void {
  for (const it of scene.drawOrder) {
    const pose = poseAt(d, it, t, scene);
    if (!pose) continue;
    const L = it.layout;
    const env: DrawEnv = {
      shadow: d.shadow,
      u: t - it.timing.enter1,
      seed: it.seed,
      text: textStateAt(d, it, t),
      shine: pose.shine,
      scan: pose.scan,
    };
    ctx.save();
    ctx.translate(it.x + L.w / 2 + pose.dx, it.y + L.h / 2 + pose.dy);
    ctx.rotate(((it.rotate + pose.rotate) * Math.PI) / 180);
    ctx.scale(pose.scale, pose.scale);
    ctx.translate(-L.w / 2, -L.h / 2);
    ctx.globalAlpha *= pose.alpha;
    if (pose.clipX || pose.clipY) {
      const x0 = -L.ext.l;
      const y0 = -L.ext.t;
      const vw = L.w + L.ext.l + L.ext.r;
      const vh = L.h + L.ext.t + L.ext.b;
      const [a, b] = pose.clipX ?? [0, 1];
      const [c, e] = pose.clipY ?? [0, 1];
      ctx.beginPath();
      ctx.rect(x0 + vw * a, y0 + vh * c, Math.max(0, vw * (b - a)), Math.max(0, vh * (e - c)));
      ctx.clip();
    }
    if (!(pose.glitch > 0.02 && drawGlitched(ctx, it, env, pose.glitch, t)))
      drawBubble(ctx, L, it.bubble, env);
    ctx.restore();
  }
}
