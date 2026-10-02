/**
 * 「轉場與動態」分頁的示範內容：形狀與曲線的名稱、卡片縮圖、轉場的影格表來源、圖片動態＋濾鏡＋結尾消失演出的來源。
 * 名稱是展示頁自己取的（工具的名稱由各工具決定）；示範圖是 Stage 的示意場景（本站自己畫的 SVG）。
 */
import { applyFilterToCanvas, FILTER_PRESETS, type FilterPresetId, loadImage } from '@/core/image';
import {
  crossfadeScales,
  drawImageMotion,
  drawSwitch,
  drawVanish,
  drawWave,
  fillOverlay,
  overlayAmount,
  type SizedImage,
  sequencePosition,
} from '@/core/motion';
import {
  type AnimationSource,
  CURVES,
  type CurveName,
  getCurve,
  loopNoise,
  sampledFrames,
  sequenceSource,
  smootherstep,
  smoothstep,
  type TransitionFrame,
  transitionFrames,
} from '@/core/timeline';
import {
  type ArrivalMap,
  type ArrivalParams,
  buildArrivalMap,
  drawTransition,
  isDynamicShape,
  type TransitionShape,
} from '@/core/transition';
import type { EffectGridItem } from '@/ui';
import { STAGE_SCENE_SVG } from '@/ui';
import type { G2Settings, MotionDemo } from './store';

/* ---------- 名稱 ---------- */

export const SHAPE_ITEMS: EffectGridItem<TransitionShape>[] = [
  { value: 'flat', label: '整片', description: '整個畫面一起變化', group: '基本形狀' },
  { value: 'linear', label: '直線擦除', description: '從一邊推到另一邊', group: '基本形狀' },
  { value: 'diagonal', label: '斜線擦除', description: '從角落斜著推進', group: '基本形狀' },
  { value: 'split', label: '兩側合攏', description: '上下往中央合起', group: '基本形狀' },
  { value: 'blinds', label: '百葉窗', description: '每條帶各自填滿', group: '基本形狀' },
  { value: 'circle', label: '圓形', description: '從中心擴開或收束', group: '基本形狀' },
  { value: 'figure', label: '圖形', description: '星形從中心收束', group: '基本形狀' },
  { value: 'clock', label: '時鐘', description: '像指針一樣繞一圈', group: '基本形狀' },
  { value: 'spiral', label: '螺旋', description: '從外圍捲向中心', group: '基本形狀' },
  { value: 'rotate', label: '旋轉合攏', description: '合成一條會轉的線', group: '基本形狀' },
  { value: 'wave', label: '波浪邊', description: '邊界起伏的擦除', group: '紋理與花紋' },
  { value: 'ink', label: '暈染', description: '不規則的墨跡邊緣', group: '紋理與花紋' },
  { value: 'drip', label: '垂流', description: '液滴先垂下再蓋滿', group: '紋理與花紋' },
  { value: 'dissolve', label: '方塊溶解', description: '小方塊隨機浮現', group: '紋理與花紋' },
  { value: 'grid', label: '格子', description: '每格從中心長出', group: '紋理與花紋' },
  { value: 'hex', label: '六角格', description: '六角格依序長出', group: '紋理與花紋' },
  { value: 'rings', label: '同心環', description: '隔一環交錯長出', group: '紋理與花紋' },
  { value: 'interlace', label: '隔行掃描', description: '先單數線、再雙數線', group: '紋理與花紋' },
  { value: 'tear', label: '撕裂帶', description: '水平帶隨機掃過', group: '紋理與花紋' },
  { value: 'rain', label: '方塊雨', description: '直欄一格格落下', group: '紋理與花紋' },
];

export const CURVE_OPTIONS: { value: CurveName; label: string }[] = [
  { value: 'smoothstep', label: '慢進慢出（smoothstep）' },
  { value: 'linear', label: '等速' },
  { value: 'quadIn', label: '加速（二次）' },
  { value: 'quadOut', label: '減速（二次）' },
  { value: 'quadInOut', label: 'S 形（二次）' },
  { value: 'cubicIn', label: '漸快（三次）' },
  { value: 'cubicOut', label: '漸慢（三次）' },
  { value: 'cubicInOut', label: '慢快慢（三次）' },
  { value: 'smootherstep', label: '平緩 S 形（smootherstep）' },
  { value: 'bounceOut', label: '彈跳' },
  { value: 'steps10', label: '10 階階梯' },
  { value: 'flicker', label: '明滅後蓋上' },
  { value: 'lightning', label: '雷閃' },
  { value: 'heartbeat', label: '心跳' },
];

export const FILTER_LABELS: Record<FilterPresetId, { label: string; group: string }> = {
  mono: { label: '黑白', group: '基本處理' },
  sepia: { label: '暖褐', group: '基本處理' },
  posterize: { label: '色階簡化', group: '基本處理' },
  contrast: { label: '加強對比', group: '基本處理' },
  soft: { label: '柔光', group: '基本處理' },
  sharpen: { label: '銳化', group: '基本處理' },
  'line-dark': { label: '黑線稿', group: '基本處理' },
  'line-light': { label: '白線稿', group: '基本處理' },
  ink: { label: '水墨', group: '基本處理' },
  mosaic: { label: '馬賽克', group: '基本處理' },
  grain: { label: '粗顆粒', group: '基本處理' },
  crt: { label: '舊式螢幕', group: '基本處理' },
  vignette: { label: '四角壓暗', group: '基本處理' },
  'rgb-split': { label: 'RGB 錯位', group: '基本處理' },
  dawn: { label: '清晨', group: '時段' },
  noon: { label: '正午', group: '時段' },
  dusk: { label: '黃昏', group: '時段' },
  night: { label: '夜', group: '時段' },
  midnight: { label: '深夜', group: '時段' },
  moonlit: { label: '月夜', group: '時段' },
  horror: { label: '驚悚', group: '氛圍' },
  fog: { label: '起霧', group: '氛圍' },
  neon: { label: '霓虹', group: '氛圍' },
  underwater: { label: '水下', group: '氛圍' },
  dream: { label: '夢幻', group: '氛圍' },
  faded: { label: '褪色照片', group: '氛圍' },
};

export const MOTION_ITEMS: EffectGridItem<MotionDemo>[] = [
  { value: 'shake', label: '震動', description: '固定像素的位移，露出黑邊' },
  { value: 'push', label: '推近轉黑', description: 'S 形放大＋疊色' },
  { value: 'wave', label: '水波', description: '水平細帶左右偏移' },
  { value: 'crossfade', label: '交叉溶接', description: '原圖→濾鏡圖' },
  { value: 'wipe', label: '擦除', description: '垂直硬邊往右' },
  { value: 'cut', label: '硬切', description: '正中間一刀切換' },
];

export const VANISH_LABELS = {
  fade: '平順淡出',
  sparkle: '星光閃爍',
  noise: '雜訊條紋',
  shatter: '碎片飛散',
  dissolve: '方塊消融',
  pop: '彈一下後縮小',
  float: '往上飄走',
  close: '往中央收起',
  spin: '旋轉縮小',
  burst: '閃光爆開',
} as const;

/** 各形狀的示範參數 */
export function shapeDemoParams(shape: TransitionShape): ArrivalParams {
  switch (shape) {
    case 'linear':
      return { direction: 'right' };
    case 'diagonal':
      return { direction: 'down-right' };
    case 'split':
      return { axis: 'vertical' };
    case 'blinds':
      return { axis: 'vertical', count: 8 };
    case 'figure':
      return { figure: 'star' };
    case 'wave':
      return { wave: 'sine', direction: 'right', count: 3, strength: 40 };
    case 'ink':
      return { spread: 'center', strength: 60, seed: 5 };
    case 'drip':
      return { count: 18, strength: 60, seed: 11 };
    case 'dissolve':
      return { blockSize: 12, seed: 7 };
    case 'grid':
      return { cell: 'circle', order: 'direction', direction: 'down-right', count: 12 };
    case 'hex':
      return { order: 'center', count: 12 };
    case 'rings':
      return { count: 8 };
    case 'interlace':
      return { count: 36 };
    case 'tear':
      return { count: 20, seed: 13 };
    case 'rain':
      return { count: 32, seed: 21 };
    case 'spiral':
      return { count: 3 };
    case 'rotate':
      return { strength: 50 };
    default:
      return {};
  }
}

/* ---------- 縮圖 ---------- */

const thumbMaps = new Map<string, ArrivalMap>();

/** 效果卡片的示意動畫：小場景上依序蓋上、停一下、再揭開 */
export function drawShapeThumb(ctx: CanvasRenderingContext2D, shape: TransitionShape, t: number) {
  const { width: W, height: H } = ctx.canvas;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#5b3d8c');
  g.addColorStop(0.6, '#d9708a');
  g.addColorStop(1, '#f6b26b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  /* 0～0.45 蓋上、0.45～0.6 停、0.6～1 揭開 */
  const p = t < 0.45 ? smoothstep(t / 0.45) : t < 0.6 ? 1 : 1 - smoothstep((t - 0.6) / 0.4);
  const params = shapeDemoParams(shape);
  let map: ArrivalMap;
  if (isDynamicShape(shape)) {
    map = buildArrivalMap(shape, W, H, { ...params, angle: Math.PI * p });
  } else {
    const key = `${shape}:${W}x${H}`;
    map = thumbMaps.get(key) ?? buildArrivalMap(shape, W, H, params);
    thumbMaps.set(key, map);
  }
  drawTransition(ctx, map, {
    progress: p,
    softness: 16,
    color: '#120a24',
    reverse: shape === 'circle' || shape === 'figure',
  });
}

/** 曲線卡片：畫出曲線，並有一個點沿著時間走 */
export function drawCurveThumb(ctx: CanvasRenderingContext2D, name: CurveName, t: number) {
  const { width: W, height: H } = ctx.canvas;
  const f = getCurve(name);
  const pad = 10;
  ctx.fillStyle = '#1b1830';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.strokeRect(pad, pad, W - pad * 2, H - pad * 2);
  ctx.strokeStyle = '#f6b26b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 80; i++) {
    const u = i / 80;
    const x = pad + u * (W - pad * 2);
    const y = H - pad - f(u) * (H - pad * 2);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(pad + t * (W - pad * 2), H - pad - f(t) * (H - pad * 2), 3.5, 0, Math.PI * 2);
  ctx.fill();
}

/* ---------- 示範圖 ---------- */

let demoImage: Promise<ImageBitmap> | null = null;

/** 示意場景（Stage 的背景）點陣化成 960 × 540 的 ImageBitmap（濾鏡、圖片動態用；SVG 只有 viewBox，補上寬高） */
export function loadDemoImage(): Promise<ImageBitmap> {
  const svg = STAGE_SCENE_SVG.replace('<svg ', '<svg width="960" height="540" ');
  if (!demoImage)
    demoImage = loadImage(new Blob([svg], { type: 'image/svg+xml' })).catch((e) => {
      demoImage = null;
      throw e;
    });
  return demoImage;
}

/* ---------- 轉場的影格表來源 ---------- */

export const TRANSITION_SIZE = { width: 480, height: 270 };

export function createTransitionSource(
  s: G2Settings,
  size = TRANSITION_SIZE,
): AnimationSource & { frameList: TransitionFrame[] } {
  const frames = transitionFrames({
    duration: s.duration,
    fps: s.fps,
    holdMs: s.hold * 1000,
    roundTrip: s.roundTrip,
    reverse: s.reversePlay,
  });
  const params = shapeDemoParams(s.shape);
  const staticMap = isDynamicShape(s.shape)
    ? null
    : buildArrivalMap(s.shape, size.width, size.height, params);
  const curve = getCurve(s.curve);
  const source = sequenceSource({
    width: size.width,
    height: size.height,
    frames,
    renderFrame(ctx, f) {
      const eased = curve(f.progress);
      const map =
        staticMap ??
        buildArrivalMap(s.shape, size.width, size.height, {
          ...params,
          /* 旋轉合攏：轉過「強度 × 3.6°」，回程繼續往同方向轉 */
          angle:
            (((params.strength ?? 50) * 3.6 * Math.PI) / 180) *
            (f.leg === 'back' ? 2 - eased : eased),
        });
      drawTransition(ctx, map, {
        progress: eased * (s.reach / 100),
        mode: s.mode,
        softness: s.softness,
        reverse: s.reverseOrder,
        color: s.color,
        glow: s.glow ? s.glowColor : null,
      });
    },
  });
  return Object.assign(source, { frameList: frames });
}

/* ---------- 圖片動態＋濾鏡＋結尾消失 ---------- */

export const MOTION_SIZE = { width: 480, height: 270 };

/**
 * 示範的圖片動態：前 70% 是動態（或兩張之間的轉場），最後 30% 是結尾消失演出。
 * 濾鏡套在整個動態畫面上；交叉溶接／擦除／硬切時是「原圖→套濾鏡的同一張」（單張＋濾鏡的轉場）。
 */
export function createMotionSource(s: G2Settings, image: SizedImage | null): AnimationSource {
  const { width: W, height: H } = MOTION_SIZE;
  const duration = 3;
  const filterOps = s.filter ? FILTER_PRESETS[s.filter] : [];
  let layer: OffscreenCanvas | null = null;
  let filtered: OffscreenCanvas | null = null;
  const getLayer = () => {
    layer ??= new OffscreenCanvas(W, H);
    return layer;
  };
  const drawBase = (ctx: OffscreenCanvasRenderingContext2D, t: number) => {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
    if (!image) return;
    const m = s.motion;
    if (m === 'shake') {
      drawImageMotion(ctx, image, W, H, {
        dx: 10 * loopNoise('shake', t, { channel: 0 }),
        dy: 8 * loopNoise('shake', t, { channel: 1 }),
        rotate: 0.6 * loopNoise('shake', t * 2, { channel: 2 }),
      });
    } else if (m === 'push') {
      /* S 形（二次）放大 30%，後段疊黑 */
      drawImageMotion(ctx, image, W, H, { scale: 1 + 0.3 * CURVES.quadInOut(t) });
      fillOverlay(ctx, W, H, '#000000', overlayAmount(t));
    } else if (m === 'wave') {
      const src = new OffscreenCanvas(W, H);
      const sctx = src.getContext('2d');
      if (sctx) drawImageMotion(sctx, image, W, H, { bleed: 14 });
      drawWave(ctx, src, W, H, { amplitude: W * 0.018, waves: 3, phase: t });
    } else drawImageMotion(ctx, image, W, H);
  };
  return {
    width: W,
    height: H,
    duration,
    loop: false,
    stillTime: 1,
    render(ctx, time) {
      const t = Math.min(1, time / (duration * 0.7));
      const lay = getLayer();
      const lctx = lay.getContext('2d');
      if (!lctx) return;
      const m = s.motion;
      if (image && (m === 'crossfade' || m === 'wipe' || m === 'cut')) {
        /* 單張＋濾鏡的轉場：原圖 → 套濾鏡的同一張 */
        filtered ??= (() => {
          const c = new OffscreenCanvas(W, H);
          const cctx = c.getContext('2d');
          if (cctx) {
            drawImageMotion(cctx, image, W, H, { scale: 1.03 });
            applyFilterToCanvas(cctx, filterOps.length ? filterOps : FILTER_PRESETS.mono, {
              frame: 0,
            });
          }
          return c;
        })();
        const k = smootherstep(sequencePosition(t, 2).local);
        const sc = crossfadeScales(k);
        lctx.clearRect(0, 0, W, H);
        drawSwitch(
          lctx,
          W,
          H,
          (c) => drawImageMotion(c, image, W, H, { scale: m === 'crossfade' ? sc.from : 1.03 }),
          (c) => c.drawImage(filtered as OffscreenCanvas, 0, 0),
          { k, mode: m },
        );
      } else {
        drawBase(lctx, t);
        if (filterOps.length)
          applyFilterToCanvas(lctx, filterOps, { frame: Math.round(time * 24) });
      }
      /* 結尾消失演出（ctx 先清空成透明） */
      const p = Math.max(0, (time / duration - 0.7) / 0.3);
      ctx.clearRect(0, 0, W, H);
      if (p <= 0) ctx.drawImage(lay, 0, 0);
      else
        drawVanish(ctx, lay, W, H, s.vanish, p, {
          intensity: s.intensity,
          seed: 3,
          colors: ['#ffb347', '#ff7ea8', '#8fd3ff'],
        });
    },
  };
}

/** 匯出設定（給 ExportPanel 的預估列） */
export const motionFrames = (fps: number) => sampledFrames({ duration: 3, fps });
