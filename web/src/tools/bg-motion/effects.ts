/**
 * 動態背景的 24 種動態效果（規格 3.5～3.7）：每個效果在進度 t（0～1）時的位移、縮放、旋轉、疊色，
 * 以及淡化、轉場的狀態。純函式（不碰畫布），單元測試以 bg-motion 附件逐點比對。
 *
 * - 位移以「輸出像素」計（與輸出尺寸無關）；名稱標示「不放大」的效果圖片剛好蓋滿，位移時露出黑邊。
 * - 其他效果先把底圖蓋滿「比畫面大 2 × bleed 的框」（固定像素的額外放大，輸出越小相對越大），再乘上效果的縮放。
 * - 「S 形加速」＝二次 S 形（quadInOut）；淡化與轉場的段內進度＝平緩 S 形（smootherstep）。
 */
import {
  crossfadeScales,
  fadeLayers,
  overlayAmount,
  sequencePosition,
  waveOffset,
} from '@/core/motion';
import { CURVES, smootherstep } from '@/core/timeline';

export const EFFECT_IDS = [
  'shakeY',
  'shakeX',
  'shakeAll',
  'drift',
  'breathe',
  'pan',
  'spinFall',
  'spinWhite',
  'spinBlack',
  'wave',
  'rise',
  'sink',
  'pushIn',
  'pushInWhite',
  'pushInBlack',
  'pullOut',
  'pullOutWhite',
  'pullOutBlack',
  'fadeBlack',
  'fadeWhite',
  'fadeClear',
  'crossfade',
  'cut',
  'wipe',
] as const;

export type EffectId = (typeof EFFECT_IDS)[number];

export type EffectKind = 'image' | 'wave' | 'fade' | 'switch';

export interface EffectSpec {
  /** 規格代號（E01～E24） */
  code: string;
  kind: EffectKind;
  /** 預設秒數 */
  seconds: number;
  /** 預設循環 */
  loop: boolean;
  /** 週期性（t＝0 與 t＝1 的畫面相同）：循環匯出時無縫取樣 */
  periodic: boolean;
  /** 不放大：圖片剛好蓋滿，位移時露出黑邊 */
  noZoom: boolean;
  /** 額外放大（輸出 px）：底圖先蓋滿「寬 + 2 × x、高 + 2 × y」的框 */
  bleed: readonly [number, number];
  /** 結尾疊上的顏色 */
  overlay: '#000000' | '#ffffff' | null;
}

const spec = (code: string, kind: EffectKind, seconds: number, o: Partial<EffectSpec> = {}) =>
  ({
    code,
    kind,
    seconds,
    loop: false,
    periodic: false,
    noZoom: false,
    bleed: [0, 0],
    overlay: null,
    ...o,
  }) satisfies EffectSpec;

const SHAKE = { loop: true, periodic: true, noZoom: true } as const;
const BLACK = { overlay: '#000000' } as const;
const WHITE = { overlay: '#ffffff' } as const;

export const EFFECTS: Readonly<Record<EffectId, EffectSpec>> = {
  shakeY: spec('E01', 'image', 2.5, SHAKE),
  shakeX: spec('E02', 'image', 2.5, SHAKE),
  shakeAll: spec('E03', 'image', 2.5, SHAKE),
  drift: spec('E04', 'image', 3, SHAKE),
  breathe: spec('E05', 'image', 3, { loop: true, periodic: true, bleed: [0, 2] }),
  pan: spec('E06', 'image', 4, SHAKE),
  spinFall: spec('E07', 'image', 2, { ...BLACK, bleed: [0, 54] }),
  spinWhite: spec('E08', 'image', 3, WHITE),
  spinBlack: spec('E09', 'image', 3, BLACK),
  wave: spec('E10', 'wave', 3, { loop: true, bleed: [18, 0] }),
  rise: spec('E11', 'image', 1.5, { ...BLACK, noZoom: true }),
  sink: spec('E12', 'image', 1.5, { ...BLACK, noZoom: true }),
  pushIn: spec('E13', 'image', 3),
  pushInWhite: spec('E14', 'image', 3, WHITE),
  pushInBlack: spec('E15', 'image', 3, BLACK),
  pullOut: spec('E16', 'image', 3),
  pullOutWhite: spec('E17', 'image', 3, WHITE),
  pullOutBlack: spec('E18', 'image', 3, BLACK),
  fadeBlack: spec('E19', 'fade', 2),
  fadeWhite: spec('E20', 'fade', 2),
  fadeClear: spec('E21', 'fade', 2),
  crossfade: spec('E22', 'switch', 3, { loop: true }),
  cut: spec('E23', 'switch', 3, { loop: true }),
  wipe: spec('E24', 'switch', 3, { loop: true }),
};

/** 沒有選效果（無動態）時的秒數預設 */
export const NO_EFFECT_SECONDS = 3;

export const isFade = (e: EffectId | null): e is 'fadeBlack' | 'fadeWhite' | 'fadeClear' =>
  !!e && EFFECTS[e].kind === 'fade';
export const isSwitch = (e: EffectId | null): e is 'crossfade' | 'cut' | 'wipe' =>
  !!e && EFFECTS[e].kind === 'switch';
export const isClearFade = (e: EffectId | null): boolean => e === 'fadeClear';

/** 淡化的顏色層（透明淡化沒有顏色層） */
export const fadeColor = (e: EffectId): string | null =>
  e === 'fadeBlack' ? '#000000' : e === 'fadeWhite' ? '#ffffff' : null;

/** 某一刻的動態（位移 px、相對倍率、旋轉度、疊色） */
export interface Motion {
  dx: number;
  dy: number;
  /** 乘在底圖（蓋滿＋額外放大）上的倍率 */
  scale: number;
  /** 度，順時針 */
  rotate: number;
  /** 疊色的不透明度 0～1 */
  overlay: number;
}

const DEG = 180 / Math.PI;

/** 規格 3.5：各效果在進度 p 的動態 */
export function motionAt(effect: EffectId | null, p: number): Motion {
  const m: Motion = { dx: 0, dy: 0, scale: 1, rotate: 0, overlay: 0 };
  if (!effect) return m;
  const s = CURVES.quadInOut(p);
  const a = p * Math.PI * 2;
  const breath = (1 - Math.cos(a)) / 2;
  switch (effect) {
    case 'shakeY':
      m.dy = Math.sin(a) * 14 + Math.sin(p * Math.PI * 18) * 4;
      break;
    case 'shakeX':
      m.dx = Math.sin(a) * 16 + Math.sin(p * Math.PI * 20) * 5;
      break;
    case 'shakeAll':
      m.dx = Math.sin(a * 4) * 10 + Math.sin(a * 9) * 4;
      m.dy = Math.cos(a * 3) * 8 + Math.sin(a * 7) * 3;
      m.rotate = Math.sin(a * 3) * 0.012 * DEG;
      break;
    case 'drift':
      m.dx = Math.sin(a) * 7 + Math.sin(a * 2 + 0.6) * 2.5;
      m.dy = Math.cos(a - 0.4) * 5 + Math.sin(a * 3) * 1.8;
      m.rotate = Math.sin(a - 0.8) * 0.018 * DEG;
      break;
    case 'breathe':
      m.scale = 1 + breath * 0.04;
      m.dy = -breath * 2;
      break;
    case 'pan':
      m.dx = Math.sin(a) * 54;
      break;
    case 'spinFall':
      m.scale = 1.02 * (1 - s * 0.78);
      m.rotate = s * 1.18 * DEG;
      m.dy = s * 52;
      break;
    case 'spinWhite':
    case 'spinBlack':
      m.scale = 1 + s * 0.52;
      m.rotate = s * 0.2 * DEG;
      break;
    case 'wave':
      m.scale = 1.05;
      break;
    case 'rise':
      m.dy = -s * 130;
      break;
    case 'sink':
      m.dy = s * 130;
      break;
    case 'pushIn':
      m.scale = 1 + s * 0.3;
      break;
    case 'pushInWhite':
    case 'pushInBlack':
      m.scale = 1 + s * 0.34;
      break;
    case 'pullOut':
      m.scale = 1.34 - s * 0.34;
      break;
    case 'pullOutWhite':
    case 'pullOutBlack':
      m.scale = 1.36 - s * 0.36;
      break;
    case 'crossfade':
    case 'cut':
    case 'wipe':
      /* 轉場的圖略為放大約 3%（1.01 × 1.02） */
      m.scale = 1.0302;
      break;
    default:
      break;
  }
  if (EFFECTS[effect].overlay) m.overlay = overlayAmount(p);
  return m;
}

/**
 * 底圖的倍率（圖片 px → 輸出 px）：不放大的效果剛好蓋滿畫面；其他效果蓋滿「寬 + 2 × bleedX、高 + 2 × bleedY」。
 */
export function baseScale(
  effect: EffectId | null,
  imgW: number,
  imgH: number,
  W: number,
  H: number,
): number {
  const e = effect ? EFFECTS[effect] : null;
  const [bx, by] = e && !e.noZoom ? e.bleed : [0, 0];
  return Math.max((W + 2 * bx) / Math.max(1, imgW), (H + 2 * by) / Math.max(1, imgH));
}

/** 畫面上的圖片擺法：倍率（圖片 px → 輸出 px）、位移、旋轉 */
export interface Placement {
  /** 圖片的實際倍率 */
  scale: number;
  /** 相對「剛好蓋滿畫面」的倍率（附件的「縮放」） */
  relative: number;
  dx: number;
  dy: number;
  rotate: number;
  overlay: number;
}

export function placementAt(
  effect: EffectId | null,
  p: number,
  imgW: number,
  imgH: number,
  W: number,
  H: number,
): Placement {
  const m = motionAt(effect, p);
  const scale = baseScale(effect, imgW, imgH, W, H) * m.scale;
  const cover = Math.max(W / Math.max(1, imgW), H / Math.max(1, imgH));
  return {
    scale,
    relative: scale / cover,
    dx: m.dx,
    dy: m.dy,
    rotate: m.rotate,
    overlay: m.overlay,
  };
}

/* ---------- 水波（E10） ---------- */

/** 水波把底圖切成幾條水平細帶 */
export const WAVE_STRIPS = 72;

/**
 * 第 i 條細帶（共 72 條，從底圖上緣起算）的水平偏移：主波由上到下 3 個、振幅＝底圖顯示寬 × 1.8%，
 * 再疊一個兩倍波數、振幅 35% 的次波；主波隨進度往前流動一圈，次波以 −1.2 倍的速度反向流動。
 */
export function waveStripOffset(i: number, p: number, drawW: number): number {
  /* 次波的相位：core/motion 的次波預設隨主波 2 倍速前進，這裡改成 −1.2 倍（−3.2p ＋ 2p） */
  return waveOffset(i / (WAVE_STRIPS - 1), 1, {
    amplitude: drawW * 0.018,
    waves: 3,
    phase: p,
    harmonic: { ratio: 2, amplitude: 0.35, phase: -3.2 * p },
  });
}

/**
 * 輸出畫面第 y 列的水平偏移（px）：底圖（倍率 scale、高 imgH）置中，第 y 列落在哪一條細帶。
 * 細帶各多畫 1.5 px 互相重疊，後畫的蓋住前面的，所以交界處屬於下面那一條。
 */
export function waveRowOffset(y: number, p: number, drawW: number, drawH: number, H: number) {
  const top = H / 2 - drawH / 2;
  const i = Math.max(0, Math.min(WAVE_STRIPS - 1, Math.floor((y - top) / (drawH / WAVE_STRIPS))));
  return waveStripOffset(i, p, drawW);
}

/* ---------- 淡化（E19～E21） ---------- */

/** 圖片層與顏色層的可見度；淡入（順序「顏色 → 圖片」）＝淡出的時間倒轉 */
export const fadeAt = (p: number, fadeIn: boolean) => fadeLayers(p, fadeIn);

/* ---------- 轉場（E22～E24） ---------- */

export interface SwitchState {
  /** 前一張、後一張（索引） */
  from: number;
  to: number;
  /** 段內進度（已套平緩 S 形） */
  k: number;
  /** 單張＋濾鏡：後一張是「套濾鏡的同一張」 */
  filtered: boolean;
}

/**
 * 轉場的狀態：2 張以上依目前順序單向走完（A→B→C…，每段平均分配）；
 * 只有 1 張時，有濾鏡就從原圖過渡到套濾鏡的圖，沒有濾鏡就完全靜止（k＝0）。
 */
export function switchAt(p: number, count: number, hasFilter: boolean): SwitchState {
  if (count <= 1) {
    return hasFilter
      ? { from: 0, to: 0, k: smootherstep(p), filtered: true }
      : { from: 0, to: 0, k: 0, filtered: false };
  }
  const pos = sequencePosition(p, count);
  return { from: pos.from, to: pos.to, k: smootherstep(pos.local), filtered: false };
}

/** 交叉溶接時兩張圖的倍率：舊圖從再大 1.2% 慢慢縮回、新圖慢慢放大 1.2%（乘在約 3% 的放大上） */
export const crossfadeScale = (k: number) =>
  crossfadeScales(k, { base: 0.0302, drift: 1.0302 * 0.012 });
