/**
 * 外觀預設（本站設計）：跑團常用的幾種氣氛。只換外觀（整體形狀、點、角、背景），
 * 內容、大小、QR code 設定與中間的圖不動。每一組的點與背景都是深色點、淺色底，對比 4.5:1 以上。
 */
import type { Gradient } from '@/core/gradient';
import { sameData } from '@/core/storage';
import { type DocState, initialDoc } from './model';

export type LookPatch = Pick<
  DocState,
  'shape' | 'dots' | 'cornerSquare' | 'cornerDot' | 'background'
>;

export interface LookPreset {
  id: string;
  name: string;
  description: string;
  look: LookPatch;
}

const lin = (a: string, b: string, angle = 90): Gradient => ({
  kind: 'linear',
  angle,
  stops: [
    { offset: 0, color: a },
    { offset: 1, color: b },
  ],
});
const rad = (a: string, b: string): Gradient => ({
  kind: 'radial',
  angle: 90,
  stops: [
    { offset: 0, color: a },
    { offset: 1, color: b },
  ],
});

const solid = (color: string, gradient = lin(color, color)) => ({
  mode: 'solid' as const,
  color,
  gradient,
});
const gradientPaint = (g: Gradient) => ({
  mode: 'gradient' as const,
  color: g.stops[0].color,
  gradient: g,
});

export const LOOK_PRESETS: readonly LookPreset[] = [
  {
    id: 'plain',
    name: '標準',
    description: '黑點白底、方形的點，最好掃。',
    /* 和預設值（原作的預設）相同 */
    look: pickLook(initialDoc()),
  },
  {
    id: 'parchment',
    name: '古文書',
    description: '羊皮紙底、深褐色的圓角點，角是暗紅色。',
    look: {
      shape: 'square',
      dots: { type: 'classy-rounded', paint: solid('#3b2414'), roundSize: true },
      cornerSquare: { type: 'extra-rounded', paint: solid('#5a1e0e') },
      cornerDot: { type: 'dot', paint: solid('#7d1616') },
      background: {
        mode: 'gradient',
        color: '#f4e9d0',
        gradient: rad('#fbf4e2', '#ead9b5'),
        round: 0.08,
      },
    },
  },
  {
    id: 'deep-sea',
    name: '深海',
    description: '克蘇魯風：墨綠到深藍的漸層點，淡青色的底。',
    look: {
      shape: 'square',
      dots: {
        type: 'rounded',
        paint: gradientPaint(lin('#0b3d3a', '#1b1f4b', 135)),
        roundSize: true,
      },
      cornerSquare: { type: 'extra-rounded', paint: solid('#0b3d3a') },
      cornerDot: { type: 'dot', paint: solid('#1b1f4b') },
      background: {
        mode: 'solid',
        color: '#e6f2ef',
        gradient: lin('#e6f2ef', '#d3e6e2'),
        round: 0,
      },
    },
  },
  {
    id: 'blood',
    name: '血書',
    description: '恐怖劇本的線索：暗紅色的大圓角點、米白的底。',
    look: {
      shape: 'square',
      dots: { type: 'extra-rounded', paint: solid('#6b0f12'), roundSize: true },
      cornerSquare: { type: 'dot', paint: solid('#3d0507') },
      cornerDot: { type: 'dot', paint: solid('#8f1418') },
      background: {
        mode: 'solid',
        color: '#f6efe6',
        gradient: lin('#f6efe6', '#eadbc8'),
        round: 0,
      },
    },
  },
  {
    id: 'neon',
    name: '賽博',
    description: '紫到藍的漸層圓點、方形的角，淡紫色的底。',
    look: {
      shape: 'square',
      dots: { type: 'dots', paint: gradientPaint(lin('#5a189a', '#0a4f7a', 90)), roundSize: true },
      cornerSquare: { type: 'square', paint: solid('#240046') },
      cornerDot: { type: 'square', paint: solid('#b5174a') },
      background: {
        mode: 'solid',
        color: '#f3f0ff',
        gradient: lin('#f3f0ff', '#e3ddff'),
        round: 0,
      },
    },
  },
  {
    id: 'sakura',
    name: '和風',
    description: '梅紫色的點、櫻色的角，淡粉色的底。',
    look: {
      shape: 'square',
      dots: { type: 'classy', paint: solid('#4a1c35'), roundSize: true },
      cornerSquare: { type: 'extra-rounded', paint: solid('#7b2d4e') },
      cornerDot: { type: 'dot', paint: solid('#a8294f') },
      background: {
        mode: 'solid',
        color: '#fff5f7',
        gradient: lin('#fff5f7', '#fbe3ea'),
        round: 0.12,
      },
    },
  },
  {
    id: 'emblem',
    name: '圓形徽章',
    description: '整個做成圓形：外圍補上裝飾的點，背景也是圓的。',
    look: {
      shape: 'circle',
      dots: { type: 'rounded', paint: solid('#1f2a44'), roundSize: true },
      cornerSquare: { type: 'dot', paint: solid('#1f2a44') },
      cornerDot: { type: 'dot', paint: solid('#8a5a00') },
      background: {
        mode: 'solid',
        color: '#fbf7ec',
        gradient: lin('#fbf7ec', '#efe6cf'),
        round: 1,
      },
    },
  },
  {
    id: 'forest',
    name: '森林',
    description: '奇幻風：深綠的放射漸層點、圓角的角。',
    look: {
      shape: 'square',
      dots: { type: 'dots', paint: gradientPaint(rad('#2d6a4f', '#14301f')), roundSize: true },
      cornerSquare: { type: 'rounded', paint: solid('#14301f') },
      cornerDot: { type: 'dots', paint: solid('#2d6a4f') },
      background: {
        mode: 'solid',
        color: '#f1f7ee',
        gradient: lin('#f1f7ee', '#dcebd5'),
        round: 0.06,
      },
    },
  },
];

export function applyLook(d: DocState, look: LookPatch): void {
  const copy = structuredClone(look);
  d.shape = copy.shape;
  d.dots = { ...copy.dots, roundSize: d.dots.roundSize };
  d.cornerSquare = copy.cornerSquare;
  d.cornerDot = copy.cornerDot;
  d.background = copy.background;
}

/** 目前的外觀和哪一組預設相同（點的大小取整數不算） */
export function activeLook(d: DocState): string | null {
  const cur = { ...pickLook(d), dots: { ...d.dots, roundSize: true } };
  for (const p of LOOK_PRESETS)
    if (sameData({ ...p.look, dots: { ...p.look.dots, roundSize: true } }, cur)) return p.id;
  return null;
}

export function pickLook(d: DocState): LookPatch {
  return {
    shape: d.shape,
    dots: d.dots,
    cornerSquare: d.cornerSquare,
    cornerDot: d.cornerDot,
    background: d.background,
  };
}
