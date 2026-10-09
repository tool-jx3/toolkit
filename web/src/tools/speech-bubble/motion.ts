/**
 * 動態（規格 3.5）：登場、退場、停留時的動作，換算成「姿勢」（透明度、縮放、旋轉、位移、裁切、故障強度）。
 * 純函式；進度 p 都是 0～1。
 */
import { clamp01, hashSigned, hashUnit, timeSlot } from '@/core/timeline';
import type { Align, EnterId, ExitId, IdleId } from './model';

export interface Pose {
  alpha: number;
  scale: number;
  /** 度 */
  rotate: number;
  dx: number;
  dy: number;
  /** 水平裁切：只畫 [from, to] 這段（本體寬的比例，含超出的範圍） */
  clipX: [number, number] | null;
  /** 垂直裁切 */
  clipY: [number, number] | null;
  /** 故障強度 0～1（橫切錯位、色偏） */
  glitch: number;
  /** 閃光、掃描線的位置（0～1；null＝沒有） */
  shine: number | null;
  scan: number | null;
}

export const REST: Pose = {
  alpha: 1,
  scale: 1,
  rotate: 0,
  dx: 0,
  dy: 0,
  clipX: null,
  clipY: null,
  glitch: 0,
  shine: null,
  scan: null,
};

/* 緩動 */
const outCubic = (u: number) => 1 - (1 - u) ** 3;
const inCubic = (u: number) => u ** 3;
const inOut = (u: number) => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2);
/** 過衝回彈（最大約 1.04） */
const outBack = (u: number) => {
  const k = 1.2;
  return 1 + (k + 1) * (u - 1) ** 3 + k * (u - 1) ** 2;
};
const inBack = (u: number) => {
  const k = 1.2;
  return (k + 1) * u ** 3 - k * u ** 2;
};

export const EASINGS = { outCubic, inCubic, inOut, outBack, inBack };

/** 滑入的距離（內文字級的倍數） */
export const SLIDE_EM = 5;
/** 掉落時往下的距離（內文字級的倍數） */
export const FALL_EM = 3.5;

type Dir = 'left' | 'right' | 'up' | 'down';

/** 「所在側」：靠左的從左、靠右的從右、置中的從下 */
export const sideDir = (align: Align): Dir =>
  align === 'left' ? 'left' : align === 'right' ? 'right' : 'down';

const dirVec = (d: Dir): [number, number] =>
  d === 'left' ? [-1, 0] : d === 'right' ? [1, 0] : d === 'up' ? [0, -1] : [0, 1];

/** 故障時的閃爍：每秒 15 次換一次，進度越前面越常消失；進度 0 時完全透明（第一格是空的，3.4） */
function glitchAlpha(p: number, seed: number, t: number): number {
  if (p <= 0) return 0;
  const r = hashUnit(seed, timeSlot(t, 15), 7);
  return r < 0.45 * (1 - p) ? 0.15 : Math.min(1, 0.4 + p);
}

/**
 * 登場（p：0＝還沒出現 → 1＝到位）。fs＝內文字級（滑動距離以它為準）。
 * 「從左／從右」指從哪一側進來。
 */
export function enterPose(
  kind: EnterId,
  p0: number,
  ctx: { fs: number; align: Align; seed: number; t: number },
): Pose {
  const p = clamp01(p0);
  if (p >= 1) return REST;
  const pose: Pose = { ...REST };
  const fade = Math.min(1, p / 0.45);
  switch (kind) {
    case 'pop':
      pose.scale = 0.3 + 0.7 * outBack(p);
      pose.alpha = Math.min(1, p / 0.3);
      break;
    case 'fade':
      pose.alpha = outCubic(p);
      break;
    case 'zoom':
      pose.scale = 0.86 + 0.14 * outCubic(p);
      pose.alpha = outCubic(p);
      break;
    case 'side':
    case 'left':
    case 'right':
    case 'up':
    case 'down': {
      /* 從某一側進來：起點在那一側 */
      const from: Dir =
        kind === 'side'
          ? sideDir(ctx.align)
          : kind === 'up'
            ? 'down'
            : kind === 'down'
              ? 'up'
              : kind;
      const [vx, vy] = dirVec(from);
      const k = (1 - outCubic(p)) * SLIDE_EM * ctx.fs;
      pose.dx = vx * k;
      pose.dy = vy * k;
      pose.alpha = fade;
      break;
    }
    case 'wipe': {
      const q = inOut(p);
      pose.clipX = ctx.align === 'right' ? [1 - q, 1] : [0, q];
      break;
    }
    case 'unroll':
      pose.clipY = [0, outCubic(p)];
      break;
    case 'glitch':
      pose.glitch = 1 - p;
      pose.alpha = glitchAlpha(p, ctx.seed, ctx.t);
      pose.dx = hashSigned(ctx.seed, timeSlot(ctx.t, 15), 3) * ctx.fs * 0.3 * (1 - p);
      break;
    case 'drop':
      pose.scale = 1.22 - 0.22 * outCubic(p);
      pose.rotate = (1 - outCubic(p)) * 5;
      pose.alpha = fade;
      break;
    case 'spin':
      pose.scale = 0.3 + 0.7 * outBack(p);
      pose.rotate = -(1 - outCubic(p)) * 14;
      pose.alpha = Math.min(1, p / 0.35);
      break;
  }
  return pose;
}

/**
 * 退場（p：0＝還在 → 1＝消失）。「往左／往右／往上／往下」指往哪一側離開；「所在側」同登場。
 */
export function exitPose(
  kind: ExitId,
  p0: number,
  ctx: { fs: number; align: Align; seed: number; t: number },
): Pose {
  const p = clamp01(p0);
  if (kind === 'none' || p <= 0) return REST;
  if (p >= 1) return { ...REST, alpha: 0 };
  const pose: Pose = { ...REST };
  const fade = 1 - Math.max(0, (p - 0.35) / 0.65);
  switch (kind) {
    case 'fade':
      pose.alpha = 1 - p;
      break;
    case 'zoom':
      pose.scale = 1 - 0.14 * inCubic(p);
      pose.alpha = 1 - p;
      break;
    case 'pop':
      pose.scale = Math.max(0, 1 - inBack(p));
      pose.alpha = 1 - Math.max(0, (p - 0.6) / 0.4);
      break;
    case 'side':
    case 'left':
    case 'right':
    case 'up':
    case 'down': {
      const to: Dir = kind === 'side' ? sideDir(ctx.align) : kind;
      const [vx, vy] = dirVec(to);
      const k = inCubic(p) * SLIDE_EM * ctx.fs;
      pose.dx = vx * k;
      pose.dy = vy * k;
      pose.alpha = fade;
      break;
    }
    case 'wipe': {
      const q = 1 - inOut(p);
      pose.clipX = ctx.align === 'right' ? [1 - q, 1] : [0, q];
      break;
    }
    case 'unroll':
      pose.clipY = [0, 1 - inCubic(p)];
      break;
    case 'glitch':
      pose.glitch = p;
      pose.alpha = glitchAlpha(1 - p, ctx.seed, ctx.t);
      pose.dx = hashSigned(ctx.seed, timeSlot(ctx.t, 15), 5) * ctx.fs * 0.3 * p;
      break;
    case 'fall':
      pose.dy = inCubic(p) * FALL_EM * ctx.fs;
      pose.rotate = inCubic(p) * 16;
      pose.alpha = 1 - inCubic(p);
      break;
    case 'spin':
      pose.scale = 1 - 0.7 * inCubic(p);
      pose.rotate = inCubic(p) * 14;
      pose.alpha = 1 - p;
      break;
  }
  return pose;
}

/** 漂浮的週期與幅度 */
export const FLOAT_PERIOD = 1.4;
export const FLOAT_EM = 0.18;
/** 閃光掃過：每 1.8 秒一次，掃過要 1.1 秒 */
export const SHINE_PERIOD = 1.8;
export const SHINE_SWEEP = 1.1;
/** 掃描線：每 1.6 秒從上到下一次 */
export const SCAN_PERIOD = 1.6;

/** 停留的動作的幅度從 0 加到全幅的時間（秒） */
const IDLE_RAMP = 0.3;
const smoothstep = (x: number) => x * x * (3 - 2 * x);

/**
 * 停留時的動作（u：這個泡泡登場完之後過了幾秒；phase：每個泡泡錯開的相位 0～1）。
 * 登場、退場時也照算，跟登場、退場的姿勢疊在一起。
 */
export function idlePose(
  kind: IdleId,
  u: number,
  ctx: { fs: number; seed: number; phase: number },
): Pose {
  if (kind === 'none' || u < 0) return REST;
  const pose: Pose = { ...REST };
  const TAU = Math.PI * 2;
  /* 錯開的相位讓第 2 個以後的泡泡登場完時不在原位：幅度在 IDLE_RAMP 秒內從 0 加上去，那一格才不會跳 */
  const ramp = u >= IDLE_RAMP ? 1 : smoothstep(u / IDLE_RAMP);
  switch (kind) {
    case 'float':
      /* 登場完先往上：-sin */
      pose.dy = -Math.sin(TAU * (u / FLOAT_PERIOD + ctx.phase)) * FLOAT_EM * ctx.fs * ramp;
      break;
    case 'breathe':
      pose.scale = 1 + 0.025 * Math.sin(TAU * (u / 1.6 + ctx.phase)) * ramp;
      break;
    case 'sway':
      pose.rotate = 1.5 * Math.sin(TAU * (u / 2 + ctx.phase)) * ramp;
      break;
    case 'shake': {
      const s = timeSlot(u, 20);
      pose.dx = hashSigned(ctx.seed, s, 1) * ctx.fs * 0.07;
      pose.dy = hashSigned(ctx.seed, s, 2) * ctx.fs * 0.07;
      break;
    }
    case 'shine': {
      const c = (u + ctx.phase * SHINE_PERIOD) % SHINE_PERIOD;
      pose.shine = c < SHINE_SWEEP ? c / SHINE_SWEEP : null;
      break;
    }
    case 'scan':
      pose.scan = (((u / SCAN_PERIOD + ctx.phase) % 1) + 1) % 1;
      break;
    case 'flicker': {
      const r = hashUnit(ctx.seed, timeSlot(u, 12), 11);
      pose.alpha = r < 0.1 ? 0.45 : r < 0.16 ? 0.75 : 1;
      break;
    }
    case 'glitch': {
      const s = timeSlot(u, 10);
      const r = hashUnit(ctx.seed, s, 13);
      if (r < 0.12) {
        pose.glitch = 0.35 + 0.4 * hashUnit(ctx.seed, s, 17);
        pose.dx = hashSigned(ctx.seed, s, 19) * ctx.fs * 0.12;
      }
      break;
    }
  }
  return pose;
}

/** 疊加兩個姿勢（透明度、縮放相乘；旋轉、位移相加；裁切取交集；故障取大的） */
export function combine(a: Pose, b: Pose): Pose {
  const clip = (x: [number, number] | null, y: [number, number] | null): [number, number] | null =>
    !x ? y : !y ? x : [Math.max(x[0], y[0]), Math.min(x[1], y[1])];
  return {
    alpha: a.alpha * b.alpha,
    scale: a.scale * b.scale,
    rotate: a.rotate + b.rotate,
    dx: a.dx + b.dx,
    dy: a.dy + b.dy,
    clipX: clip(a.clipX, b.clipX),
    clipY: clip(a.clipY, b.clipY),
    glitch: Math.max(a.glitch, b.glitch),
    shine: a.shine ?? b.shine,
    scan: a.scan ?? b.scan,
  };
}
