/**
 * 動態：加速曲線、每個複本在 t 秒時的狀態、自動排列與反轉、樣式與動態的預設集（規格 3.2、3.5）。
 * 純函式，單元測試在 Node 跑。
 */
import { clamp, copySequenceRank, dist, type Point, round } from './geometry';
import type { EasingName, McAnimation, McElement, McProject, McStyle } from './model';

export function easeValue(type: EasingName, t: number): number {
  const x = clamp(t, 0, 1);
  switch (type) {
    case 'easeIn':
      return x * x * x;
    case 'easeOut':
      return 1 - (1 - x) ** 3;
    case 'easeInOut':
      return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
    case 'overshoot': {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
    }
    default:
      return x;
  }
}

export interface CopyState {
  visible: boolean;
  /** 不透明度（可能超過 1，畫的時候夾） */
  alpha: number;
  /** 繪製進度 */
  draw: number;
  /** 擴散半徑比例 */
  clip: number;
  scale: number;
  rotation: number;
  /** 發光倍率 */
  glow: number;
}

const SHOWN: CopyState = {
  visible: true,
  alpha: 1,
  draw: 1,
  clip: 1,
  scale: 1,
  rotation: 0,
  glow: 1,
};

/** 元素的第 copyIndex 個複本（共 count 個）在 time 秒時的狀態 */
export function animationState(
  el: Pick<McElement, 'id' | 'animation'>,
  time: number,
  copyIndex: number,
  count: number,
): CopyState {
  const a: McAnimation = el.animation;
  if (a.mode === 'none') return SHOWN;
  const rank = copySequenceRank(copyIndex, count, a.copyOrder, el.id);
  const localStart = Number(a.start) + rank * Number(a.copyStagger || 0);
  const duration = Math.max(0.001, Number(a.duration) || 1);
  const raw = (time - localStart) / duration;

  if (a.mode === 'fadeOut') {
    if (raw < 0) return SHOWN;
    if (raw >= 1) return { ...SHOWN, visible: false, alpha: 0, glow: 0 };
    const p = easeValue(a.easing, raw);
    return { ...SHOWN, alpha: 1 - p, glow: 1 - p * 0.5 };
  }

  if (raw < 0)
    return { visible: false, alpha: 0, draw: 0, clip: 0, scale: 0, rotation: 0, glow: 0 };
  if (raw >= 1 && a.mode !== 'pulse') {
    if (!a.holdAfter) return { ...SHOWN, visible: false, alpha: 0, glow: 0 };
    return SHOWN;
  }

  if (a.mode === 'pulse') {
    if (raw >= 1 && !a.holdAfter) return { ...SHOWN, visible: false, alpha: 0, glow: 0 };
    const phase = ((time - localStart) / duration) * Math.PI * 2;
    const q = 0.5 + 0.5 * Math.sin(phase - Math.PI / 2);
    return { ...SHOWN, alpha: 0.72 + q * 0.28, scale: 0.98 + q * 0.04, glow: 0.75 + q * 1.15 };
  }

  const p = easeValue(a.easing, raw);
  switch (a.mode) {
    case 'draw':
      return { ...SHOWN, draw: p };
    case 'drawGlow':
      return { ...SHOWN, draw: p, glow: 0.7 + (1 - Math.abs(0.5 - p) * 2) * 1.4 };
    case 'fadeIn':
      return { ...SHOWN, alpha: p, glow: p };
    case 'centerSpread':
      return { ...SHOWN, alpha: clamp(p * 1.35, 0, 1), clip: p, glow: 0.8 + p * 0.5 };
    case 'scaleIn':
      return {
        ...SHOWN,
        alpha: clamp(p * 1.5, 0, 1),
        scale: Math.max(0.001, p),
        glow: 1 + (1 - p) * 0.8,
      };
    case 'spinIn':
      return {
        ...SHOWN,
        alpha: clamp(p * 1.4, 0, 1),
        scale: 0.45 + p * 0.55,
        rotation: (1 - p) * -Math.PI * 1.3,
        glow: 0.8 + p * 0.4,
      };
    default:
      return SHOWN;
  }
}

/* ---------- 自動排列、反轉（規格 F106、F107） ---------- */

export interface SequenceChange {
  id: string;
  start: number;
  duration: number;
  mode?: McAnimation['mode'];
}

/**
 * 依圖層（'layers'）或中心→外圍（'center'）重新排顯示中元素的開始與持續時間。
 * center(el)：元素中心（圓與文字是原點、路徑是外接框中心）。
 */
export function autoSequence(
  project: McProject,
  mode: 'layers' | 'center',
  center: (el: McElement) => Point,
): SequenceChange[] {
  const visible = project.elements.filter((el) => el.visible);
  if (!visible.length) return [];
  const D = project.animation.duration;
  let ordered = visible.slice();
  if (mode === 'center') {
    const c = { x: project.symmetry.centerX, y: project.symmetry.centerY };
    const d = new Map(ordered.map((el) => [el.id, dist(center(el), c)]));
    ordered = ordered.sort((a, b) => (d.get(a.id) ?? 0) - (d.get(b.id) ?? 0));
  }
  const step = D / Math.max(ordered.length + 0.5, 1);
  const effect = clamp(step * 1.65, 0.25, Math.max(0.3, D * 0.55));
  return ordered.map((el, i) => {
    const start = round(i * step, 3);
    const change: SequenceChange = {
      id: el.id,
      start,
      duration: round(Math.min(effect, D - start + 0.05), 3),
    };
    if (el.animation.mode === 'none') change.mode = el.type === 'text' ? 'fadeIn' : 'drawGlow';
    return change;
  });
}

/** 反轉順序：開始＝長度 −（開始＋持續），夾在 0～長度；「一直顯示」略過 */
export function reverseSequence(project: McProject): SequenceChange[] {
  const D = project.animation.duration;
  return project.elements
    .filter((el) => el.animation.mode !== 'none')
    .map((el) => ({
      id: el.id,
      start: round(clamp(D - (el.animation.start + el.animation.duration), 0, D), 3),
      duration: el.animation.duration,
    }));
}

/* ---------- 預設集（規格 3.5） ---------- */

export type StylePresetId = 'arcane-blue' | 'holy-gold' | 'blood-red' | 'ink';
export const STYLE_PRESET_IDS: readonly StylePresetId[] = [
  'arcane-blue',
  'holy-gold',
  'blood-red',
  'ink',
];

export const STYLE_PRESETS: Record<StylePresetId, Partial<McStyle>> = {
  'arcane-blue': {
    stroke: '#7be8ff',
    strokeWidth: 5,
    fillEnabled: false,
    fill: '#665cff22',
    opacity: 1,
    shadowColor: '#2457ff',
    shadowBlur: 7,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    glowEnabled: true,
    glowColor: '#58dfff',
    glowBlur: 28,
    glowStrength: 1.4,
    blendMode: 'screen',
  },
  'holy-gold': {
    stroke: '#ffe59a',
    strokeWidth: 5,
    fillEnabled: false,
    fill: '#ffd45a22',
    opacity: 1,
    shadowColor: '#c97b19',
    shadowBlur: 8,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    glowEnabled: true,
    glowColor: '#ffd35b',
    glowBlur: 32,
    glowStrength: 1.55,
    blendMode: 'screen',
  },
  'blood-red': {
    stroke: '#ff8a92',
    strokeWidth: 6,
    fillEnabled: false,
    fill: '#b70f3524',
    opacity: 1,
    shadowColor: '#71071f',
    shadowBlur: 10,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    glowEnabled: true,
    glowColor: '#ff315f',
    glowBlur: 30,
    glowStrength: 1.55,
    blendMode: 'screen',
  },
  ink: {
    stroke: '#161821',
    strokeWidth: 7,
    fillEnabled: false,
    fill: '#16182118',
    opacity: 1,
    lineCap: 'round',
    lineJoin: 'round',
    shadowColor: '#000000',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    glowEnabled: false,
    glowColor: '#000000',
    glowBlur: 0,
    glowStrength: 0,
    blendMode: 'source-over',
  },
};

export type MotionPresetId = 'trace' | 'burst' | 'summon' | 'vanish';
export const MOTION_PRESET_IDS: readonly MotionPresetId[] = ['trace', 'burst', 'summon', 'vanish'];

export const MOTION_PRESETS: Record<MotionPresetId, Partial<McAnimation>> = {
  trace: {
    mode: 'drawGlow',
    duration: 1.4,
    easing: 'easeInOut',
    direction: 'forward',
    copyStagger: 0.045,
    copyOrder: 'clockwise',
    holdAfter: true,
  },
  burst: {
    mode: 'centerSpread',
    duration: 0.8,
    easing: 'overshoot',
    direction: 'forward',
    copyStagger: 0.025,
    copyOrder: 'alternate',
    holdAfter: true,
  },
  summon: {
    mode: 'spinIn',
    duration: 1.05,
    easing: 'easeOut',
    direction: 'forward',
    copyStagger: 0.06,
    copyOrder: 'clockwise',
    holdAfter: true,
  },
  vanish: {
    mode: 'fadeOut',
    duration: 0.85,
    easing: 'easeIn',
    direction: 'forward',
    copyStagger: 0.025,
    copyOrder: 'counter',
    holdAfter: false,
  },
};

/** 套用動態預設：持續時間不超過「長度 − 開始」（至少 0.05） */
export function withMotionPreset(
  animation: McAnimation,
  id: MotionPresetId,
  timelineDuration: number,
): McAnimation {
  const next = { ...animation, ...MOTION_PRESETS[id] };
  next.duration = Math.min(next.duration, Math.max(0.05, timelineDuration - next.start));
  return next;
}
