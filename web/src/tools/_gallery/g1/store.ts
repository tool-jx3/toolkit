/**
 * 「文字演出」分頁（G1 共用層）的展示狀態。不存檔（展示用）。
 */
import type { TargetId } from '@/ccfolia';
import type { LoopFxKind } from '@/core/fxlayers';
import type { Point } from '@/core/path';
import { createPreviewStore } from '@/core/storage';
import type { ColorPairItem, FontPoolItem } from '@/ui';

export type G1Mode = 'typing' | 'loop' | 'karaoke';

export type StyleId =
  | 'double'
  | 'extrude'
  | 'neon'
  | 'hard'
  | 'sticker'
  | 'glitch'
  | 'stripes'
  | 'knockout';

export interface G1DemoState {
  mode: G1Mode;
  /** 打字（影格表） */
  typingText: string;
  typingFps: number;
  holdMs: number;
  underline: boolean;
  strike: boolean;
  scaleX: number;
  /** 片尾分段：一次匯出兩個檔案 */
  split: boolean;
  /** 循環（文字加工＋特效） */
  loopText: string;
  style: StyleId;
  fx: 'none' | LoopFxKind;
  pulse: boolean;
  target: TargetId;
  size: number;
  frames: number;
  fps: number;
  colors: number;
  lines: number;
  gifMatte: string | null;
  lastBytes: number | null;
  /** 卡拉 OK */
  lyrics: string;
  softness: number;
  glow: boolean;
  /** 軌跡 */
  pathText: string;
  shape: 'circle' | 'spiral' | 'heart' | 'free';
  path: Point[];
  overlay: boolean;
  /** 配色與字型池 */
  pairs: ColorPairItem[];
  fonts: FontPoolItem[];
}

export const G1_DEFAULTS: G1DemoState = {
  mode: 'typing',
  typingText: '早安，\n冒險者。한글',
  typingFps: 12,
  holdMs: 1500,
  underline: false,
  strike: false,
  scaleX: 1,
  split: false,
  loopText: '大成功',
  style: 'double',
  fx: 'speedLines',
  pulse: true,
  target: 'ccfolia-cutin',
  size: 480,
  frames: 15,
  fps: 20,
  colors: 256,
  lines: 48,
  gifMatte: null,
  lastBytes: null,
  lyrics: '星光落在旅店的窗台\n骰子滾過命運的長桌\n大成功',
  softness: 14,
  glow: true,
  pathText: '沿著軌跡排列的文字',
  shape: 'circle',
  path: [],
  overlay: true,
  pairs: [
    { id: 'ink', name: '墨與紙', a: '#f4ecd8', b: '#1e1a16', enabled: true },
    { id: 'alarm', name: '警報紅', a: '#d7263d', b: '#fff7f0', enabled: true },
    { id: 'night', name: '夜色', a: '#1b2140', b: '#ffd166', enabled: false },
  ],
  fonts: [
    {
      id: 'sans',
      font: { source: 'google', family: 'Noto Sans TC', weight: 900 },
      label: '思源黑體',
      enabled: true,
    },
    {
      id: 'kai',
      font: { source: 'google', family: 'LXGW WenKai TC', weight: 700 },
      label: '霞鶩文楷',
      enabled: true,
    },
    {
      id: 'marker',
      font: { source: 'google', family: 'Permanent Marker', weight: 400 },
      enabled: false,
    },
  ],
};

export const useG1 = createPreviewStore<G1DemoState>('_gallery_g1', G1_DEFAULTS, {
  persist: false,
});
