/**
 * 「轉場與動態」分頁（G2 共用層）的展示狀態：可復原的設定＋不列入復原的預覽狀態。不存檔（展示用）。
 */
import type { FilterPresetId } from '@/core/image';
import type { VanishKind } from '@/core/motion';
import { createPreviewStore, createToolStore } from '@/core/storage';
import type { CurveName, Keyframe } from '@/core/timeline';
import type { TransitionMode, TransitionShape } from '@/core/transition';

export type MotionDemo = 'shake' | 'push' | 'wave' | 'crossfade' | 'wipe' | 'cut';

export interface G2Settings {
  /** 轉場 */
  shape: TransitionShape;
  mode: TransitionMode;
  curve: CurveName;
  softness: number;
  reach: number;
  reverseOrder: boolean;
  glow: boolean;
  glowColor: string;
  color: string;
  duration: number;
  hold: number;
  roundTrip: boolean;
  reversePlay: boolean;
  loop: boolean;
  fps: number;
  /** 圖片動態 */
  motion: MotionDemo | null;
  filter: FilterPresetId | null;
  vanish: VanishKind;
  intensity: number;
  /** 節點表 */
  schedule: Keyframe[];
}

export const DEFAULT_SCHEDULE: Keyframe[] = [
  { time: 0, value: 0, curve: 'linear' },
  { time: 1, value: 30, curve: 'cubicOut' },
  { time: 2, value: 70, curve: 'smoothstep' },
  { time: 3, value: 100, curve: 'cubicInOut' },
];

export const G2_DEFAULTS: G2Settings = {
  shape: 'circle',
  mode: 'cover',
  curve: 'smoothstep',
  softness: 24,
  reach: 100,
  reverseOrder: true,
  glow: false,
  glowColor: '#ffb347',
  color: '#120a24',
  duration: 0.8,
  hold: 0.5,
  roundTrip: false,
  reversePlay: false,
  loop: false,
  fps: 24,
  motion: 'push',
  filter: null,
  vanish: 'sparkle',
  intensity: 1,
  schedule: DEFAULT_SCHEDULE,
};

export const useG2 = createToolStore<G2Settings>('_gallery-g2', G2_DEFAULTS, {
  persist: false,
  historyLimit: 60,
});

export type G2View = 'transition' | 'motion' | 'snap';

export interface G2Preview {
  view: G2View;
  /** 版面吸附的三個物件（px，640 × 360 的畫布） */
  boxes: Record<
    'character' | 'bar' | 'title',
    { x: number; y: number; width: number; height: number }
  >;
  selected: string | null;
  snapCanvas: boolean;
  snapItems: boolean;
}

export const useG2Preview = createPreviewStore<G2Preview>(
  '_gallery-g2',
  {
    view: 'transition',
    boxes: {
      character: { x: 268, y: 92, width: 104, height: 120 },
      bar: { x: 134, y: 250, width: 372, height: 26 },
      title: { x: 200, y: 30, width: 240, height: 40 },
    },
    selected: 'bar',
    snapCanvas: true,
    snapItems: true,
  },
  { persist: false },
);
