/**
 * 畫一格動態背景（預覽、匯出、卡片縮圖共用同一段程式；規格 3.4 的畫面構成）：
 * 1. 塗黑（透明淡化除外）；2. 圖片蓋滿畫面後依效果位移、縮放、旋轉（水波、淡化、轉場另外畫）；
 * 3. 套濾鏡（整個畫面，含黑邊與淡化的顏色；透明淡化不套、單張轉場只套在下一張）；4. 疊上轉白／轉黑的顏色。
 *
 * 預覽用比輸出小的畫布：`pixelScale` 是畫布 px ÷ 輸出 px，位移等以輸出 px 計的量照比例縮小，
 * 濾鏡的 px 參數（模糊、方塊、錯位、掃描線）也一起縮小，所以預覽就是輸出畫面的等比縮圖。
 */
import {
  applyFilterToCanvas,
  FILTER_PRESETS,
  type FilterOp,
  type FilterPresetId,
  makeCanvas,
} from '@/core/image';
import {
  type Ctx2D,
  drawFade,
  drawImageMotion,
  drawSwitch,
  fillOverlay,
  type SizedImage,
} from '@/core/motion';
import type { AnimationSource, SampledFrame } from '@/core/timeline';
import {
  crossfadeScale,
  EFFECTS,
  type EffectId,
  fadeAt,
  fadeColor,
  placementAt,
  switchAt,
  WAVE_STRIPS,
  waveStripOffset,
} from './effects';
import { type MiniScene, miniScene } from './sample';
import type { FilterChoice } from './strings';

export interface Scene {
  /** 目前順序的圖片（第一張是主圖；轉場才用到第 2 張以後） */
  images: readonly SizedImage[];
  effect: EffectId | null;
  filter: FilterPresetId | null;
  /** 淡化的順序換成「顏色 → 圖片」（淡入） */
  fadeIn: boolean;
}

export interface RenderOptions {
  /** 輸出尺寸（px） */
  width: number;
  height: number;
  /** 畫布 px ÷ 輸出 px（預覽、縮圖小於 1；預設 1） */
  pixelScale?: number;
  /** 第幾格（顆粒每格不同） */
  frame?: number;
}

/** 濾鏡裡以 px 計的量乘上倍率（縮小的預覽、縮圖） */
export function scaleFilterOps(ops: readonly FilterOp[], k: number): FilterOp[] {
  if (k === 1) return [...ops];
  const pair = (v?: readonly [number, number]) => (v ? ([v[0] * k, v[1] * k] as const) : undefined);
  return ops.map((op): FilterOp => {
    switch (op.op) {
      case 'blur':
        return { ...op, radius: op.radius * k };
      case 'sharpen':
        return { ...op, radius: (op.radius ?? 1) * k };
      case 'mosaic':
        return { ...op, size: Math.max(1, op.size * k) };
      case 'shift':
        return { ...op, r: pair(op.r), g: pair(op.g), b: pair(op.b) };
      case 'scanlines':
        return {
          ...op,
          period: Math.max(1, op.period * k),
          offset: (op.offset ?? 0) * k,
          width: (op.width ?? 1) * k,
        };
      default:
        return op;
    }
  });
}

/** 蓋滿畫面、以中心放大 scale 倍（相對剛好蓋滿） */
const drawCover = (ctx: Ctx2D, img: SizedImage, W: number, H: number, scale: number) =>
  drawImageMotion(ctx, img, W, H, { scale });

/** 水波：底圖（倍率 scale）切成 72 條水平細帶，各自左右偏移 */
export function drawWaveStrips(
  ctx: Ctx2D,
  img: SizedImage,
  W: number,
  H: number,
  scale: number,
  p: number,
): void {
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const srcH = img.height / WAVE_STRIPS;
  const dstH = drawH / WAVE_STRIPS;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  for (let i = 0; i < WAVE_STRIPS; i++) {
    const sy = srcH * i;
    /* 每條多取 1 px、多畫 1.5 px，互相重疊不留縫（最後一條超出原圖的部分依比例裁掉） */
    const sh = Math.min(srcH + 1, img.height - sy);
    if (sh <= 0) continue;
    const dh = (dstH + 1.5) * (sh / (srcH + 1));
    ctx.drawImage(
      img,
      0,
      sy,
      img.width,
      sh,
      -drawW / 2 + waveStripOffset(i, p, drawW),
      -drawH / 2 + dstH * i,
      drawW,
      dh,
    );
  }
  ctx.restore();
}

/* 單張＋濾鏡的轉場：「下一張」是套濾鏡的同一張圖（暫存畫布；設定相同時沿用上一次的結果） */
let filtered: {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  key: string;
  img: SizedImage | null;
  ops: readonly FilterOp[] | null;
} | null = null;

function drawFilteredCover(
  ctx: Ctx2D,
  img: SizedImage,
  W: number,
  H: number,
  ps: number,
  scale: number,
  ops: readonly FilterOp[],
  frame: number,
) {
  const pw = Math.max(1, Math.round(W * ps));
  const ph = Math.max(1, Math.round(H * ps));
  const animated = ops.some((o) => o.op === 'grain');
  const key = `${pw}x${ph}:${scale}:${animated ? frame : 0}`;
  if (!filtered || filtered.canvas.width !== pw || filtered.canvas.height !== ph) {
    filtered = { canvas: makeCanvas(pw, ph), key: '', img: null, ops: null };
  }
  if (filtered.key !== key || filtered.img !== img || filtered.ops !== ops) {
    const c = filtered.canvas.getContext('2d', { willReadFrequently: true }) as Ctx2D | null;
    if (!c) return;
    c.setTransform(ps, 0, 0, ps, 0, 0);
    c.globalAlpha = 1;
    c.fillStyle = '#000000';
    c.fillRect(0, 0, W, H);
    drawCover(c, img, W, H, scale);
    c.setTransform(1, 0, 0, 1, 0, 0);
    applyFilterToCanvas(c, ops, { frame });
    filtered.key = key;
    filtered.img = img;
    filtered.ops = ops;
  }
  ctx.drawImage(filtered.canvas, 0, 0, W, H);
}

/* 縮放後的濾鏡步驟（同一組濾鏡與倍率時沿用） */
const scaledOps = new Map<string, FilterOp[]>();
function opsFor(filter: FilterPresetId | null, ps: number): FilterOp[] {
  if (!filter) return [];
  const key = `${filter}@${ps}`;
  let ops = scaledOps.get(key);
  if (!ops) {
    if (scaledOps.size > 64) scaledOps.clear();
    ops = scaleFilterOps(FILTER_PRESETS[filter], ps);
    scaledOps.set(key, ops);
  }
  return ops;
}

/** 畫進度 p（0～1）的那一格。ctx 的畫布應為 round(寬 × pixelScale) × round(高 × pixelScale) */
export function renderScene(ctx: Ctx2D, scene: Scene, p: number, o: RenderOptions): void {
  const { width: W, height: H } = o;
  const ps = o.pixelScale ?? 1;
  const frame = o.frame ?? 0;
  const { effect } = scene;
  const spec = effect ? EFFECTS[effect] : null;
  const clear = effect === 'fadeClear';
  const img = scene.images[0];

  ctx.save();
  ctx.setTransform(ps, 0, 0, ps, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, W, H);
  if (!clear) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
  }
  if (!img) {
    ctx.restore();
    return;
  }
  const ops = opsFor(scene.filter, ps);
  /* 濾鏡套在整個畫面；透明淡化不套、單張轉場只套在下一張 */
  let filterWhole = ops.length > 0 && !clear;

  if (spec?.kind === 'switch') {
    const st = switchAt(p, scene.images.length, ops.length > 0);
    if (st.filtered) filterWhole = false;
    const mode = effect as 'crossfade' | 'cut' | 'wipe';
    const sc = mode === 'crossfade' ? crossfadeScale(st.k) : { from: 1.0302, to: 1.0302 };
    const from = scene.images[st.from] ?? img;
    const to = scene.images[st.to] ?? img;
    drawSwitch(
      ctx,
      W,
      H,
      (c) => drawCover(c, from, W, H, sc.from),
      st.filtered
        ? (c) => drawFilteredCover(c, from, W, H, ps, sc.to, ops, frame)
        : (c) => drawCover(c, to, W, H, sc.to),
      { k: st.k, mode, base: '#000000' },
    );
  } else if (spec?.kind === 'fade' && effect) {
    drawFade(ctx, W, H, {
      drawImage: (c) => drawCover(c, img, W, H, 1),
      layers: fadeAt(p, scene.fadeIn),
      color: fadeColor(effect),
      base: clear ? null : '#000000',
    });
  } else if (spec?.kind === 'wave') {
    drawWaveStrips(ctx, img, W, H, placementAt(effect, p, img.width, img.height, W, H).scale, p);
  } else {
    const pl = placementAt(effect, p, img.width, img.height, W, H);
    drawImageMotion(ctx, img, W, H, {
      dx: pl.dx,
      dy: pl.dy,
      rotate: pl.rotate,
      scale: pl.relative,
    });
  }
  ctx.restore();

  if (filterWhole) applyFilterToCanvas(ctx, ops, { frame });

  if (spec?.overlay) {
    const a = placementAt(effect, p, img.width, img.height, W, H).overlay;
    if (a > 0) {
      ctx.save();
      ctx.setTransform(ps, 0, 0, ps, 0, 0);
      fillOverlay(ctx, W, H, spec.overlay, a);
      ctx.restore();
    }
  }
}

/* ---------- 匯出 ---------- */

/**
 * 匯出用的動畫來源：照影格表逐格畫（每格的時間＝進度 × 秒數，延遲是整數毫秒）。
 * stillTime＝0：單張 PNG 是第一格。onFrame 在每畫一格時呼叫（進度顯示用）。
 */
export function exportSource(
  scene: Scene,
  size: { width: number; height: number },
  seconds: number,
  frames: readonly SampledFrame[],
  onFrame?: (index: number, total: number) => void,
): AnimationSource {
  const index = new Map(frames.map((f, i) => [f.t, i]));
  const total = frames.reduce((a, f) => a + f.ms, 0) / 1000;
  return {
    width: size.width,
    height: size.height,
    duration: total,
    frames: frames.map((f) => ({ ms: f.ms, t: f.t })),
    stillTime: 0,
    render(ctx, t) {
      const i = index.get(t) ?? 0;
      onFrame?.(i, frames.length);
      renderScene(ctx, scene, seconds > 0 ? t / seconds : 0, { ...size, frame: i });
    },
  };
}

/** 單張靜態圖（第一格或只套濾鏡）的來源 */
export function stillSource(
  scene: Scene,
  size: { width: number; height: number },
): AnimationSource {
  return {
    width: size.width,
    height: size.height,
    duration: 1,
    stillTime: 0,
    render(ctx) {
      renderScene(ctx, scene, 0, { ...size, frame: 0 });
    },
  };
}

/* ---------- 卡片縮圖 ---------- */

const THUMB_W = 640;
const THUMB_H = 360;

const thumbImages = (kinds: MiniScene[]) => kinds.map((k) => miniScene(k));

/** 效果卡片的示意動畫：小風景套上效果（轉場用白天→黃昏→夜晚三張） */
export function drawEffectThumb(ctx: CanvasRenderingContext2D, effect: EffectId, t: number) {
  const images =
    EFFECTS[effect].kind === 'switch'
      ? thumbImages(['day', 'dusk', 'night'])
      : thumbImages(['dusk']);
  renderScene(ctx, { images, effect, filter: null, fadeIn: false }, t, {
    width: THUMB_W,
    height: THUMB_H,
    pixelScale: ctx.canvas.width / THUMB_W,
  });
}

/** 濾鏡卡片的縮圖：目前的第一張圖（沒有圖時用小風景）套上濾鏡 */
export function drawFilterThumb(
  ctx: CanvasRenderingContext2D,
  filter: FilterChoice,
  source: SizedImage | null,
) {
  const W = 400;
  const H = 225;
  renderScene(
    ctx,
    {
      images: [source ?? miniScene('day')],
      effect: null,
      filter: filter === 'none' ? null : filter,
      fadeIn: false,
    },
    0,
    { width: W, height: H, pixelScale: ctx.canvas.width / W },
  );
}

/** 淡化順序卡片的顏色縮圖（透明時留空，卡片會顯示棋盤格） */
export function colorSwatch(effect: EffectId): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 90;
  const color = fadeColor(effect);
  const ctx = c.getContext('2d');
  if (ctx && color) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  return c;
}
