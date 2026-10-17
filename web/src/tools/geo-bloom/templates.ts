/**
 * 範本（規格 F50、5. D6，新版新增）：本站自己調的幾組設定。套用時換掉種子與「固定種子」以外的所有設定（含畫布大小）。
 */
import { DEFAULT_SETTINGS, type Settings, type ShapeKind } from './settings';

export type TemplateSettings = Omit<Settings, 'seed' | 'lockSeed'>;

export interface BloomTemplate {
  id: string;
  name: string;
  description: string;
  /** 縮圖用的種子 */
  sampleSeed: string;
  settings: TemplateSettings;
}

const shapes = (...on: ShapeKind[]): Settings['shapes'] => ({
  circle: on.includes('circle'),
  rings: on.includes('rings'),
  semi: on.includes('semi'),
  mix: on.includes('mix'),
  square: on.includes('square'),
  doubleSquare: on.includes('doubleSquare'),
});

const { seed: _seed, lockSeed: _lock, ...BASE } = DEFAULT_SETTINGS;

export const TEMPLATES: readonly BloomTemplate[] = [
  {
    id: 'default',
    name: '基本',
    description: '預設的設定：六種圖形、深色底、金色點綴。',
    sampleSeed: 's1',
    settings: BASE,
  },
  {
    id: 'constellation',
    name: '星座',
    description: '細線連起大小不一的星星，深藍的夜空。',
    sampleSeed: 'orion',
    settings: {
      ...BASE,
      width: 1920,
      height: 1080,
      maxShapes: 90,
      maxLines: 160,
      branchMin: 2,
      branchMax: 4,
      maxDepth: 7,
      maxRings: 2,
      rootMin: 10,
      rootMax: 18,
      childMin: 3,
      childMax: 9,
      shrink: 90,
      lineMin: 100,
      lineMax: 300,
      pShape: 70,
      pBranch: 90,
      pDot: 60,
      regularity: 15,
      shapes: shapes('circle', 'rings'),
      gap: 30,
      background: '#0b1026',
      lineColor: '#c9d6ff',
      accentColor: '#ffe08a',
      pAccent: 25,
      lineWidth: 1.25,
      pFill: 70,
    },
  },
  {
    id: 'magic-circle',
    name: '魔法陣',
    description: '大大的同心圓與弧，線平均分在一圈，金色的線。',
    sampleSeed: 'arcana',
    settings: {
      ...BASE,
      maxShapes: 90,
      maxLines: 140,
      branchMin: 6,
      branchMax: 8,
      maxDepth: 2,
      maxRings: 8,
      rootMin: 220,
      rootMax: 260,
      childMin: 34,
      childMax: 58,
      shrink: 55,
      lineMin: 50,
      lineMax: 90,
      pShape: 100,
      pBranch: 100,
      pDot: 60,
      regularity: 100,
      shapes: shapes('rings', 'mix', 'semi', 'circle'),
      overlapMode: 'skip',
      gap: 6,
      background: '#140b1f',
      lineColor: '#f2d59b',
      accentColor: '#ff7a59',
      pAccent: 12,
      lineWidth: 2.5,
      pFill: 4,
    },
  },
  {
    id: 'sci-fi',
    name: '科幻介面',
    description: '正方形與雙正方形、青色的線，像儀表板的背景。',
    sampleSeed: 'hud-07',
    settings: {
      ...BASE,
      width: 1920,
      height: 1080,
      maxShapes: 150,
      maxLines: 280,
      branchMin: 3,
      branchMax: 5,
      maxDepth: 4,
      maxRings: 4,
      rootMin: 80,
      rootMax: 120,
      childMin: 14,
      childMax: 40,
      shrink: 80,
      lineMin: 80,
      lineMax: 200,
      pShape: 65,
      pBranch: 75,
      pDot: 60,
      regularity: 75,
      shapes: shapes('square', 'doubleSquare', 'rings'),
      gap: 12,
      lineAvoid: true,
      background: '#06141b',
      lineColor: '#5ee6ff',
      accentColor: '#ff4f7b',
      pAccent: 10,
      lineWidth: 1.5,
      pFill: 5,
    },
  },
  {
    id: 'rose-window',
    name: '花窗',
    description: '層層的圓與半圓、塗滿較多，暖色的玻璃花窗。',
    sampleSeed: 'rose',
    settings: {
      ...BASE,
      maxShapes: 200,
      maxLines: 320,
      branchMin: 5,
      branchMax: 8,
      maxDepth: 3,
      maxRings: 6,
      rootMin: 140,
      rootMax: 160,
      childMin: 30,
      childMax: 55,
      shrink: 70,
      lineMin: 30,
      lineMax: 80,
      pShape: 85,
      pBranch: 90,
      pDot: 50,
      regularity: 90,
      shapes: shapes('rings', 'mix', 'circle', 'semi'),
      gap: 4,
      background: '#1a0f0a',
      lineColor: '#ffd27a',
      accentColor: '#e2553f',
      pAccent: 30,
      lineWidth: 3,
      pFill: 35,
    },
  },
  {
    id: 'minimal',
    name: '極簡',
    description: '線與圖形都少，米白底、深灰的線。',
    sampleSeed: 'quiet',
    settings: {
      ...BASE,
      maxShapes: 24,
      maxLines: 40,
      branchMin: 2,
      branchMax: 4,
      maxDepth: 4,
      maxRings: 3,
      rootMin: 50,
      rootMax: 70,
      childMin: 8,
      childMax: 30,
      shrink: 75,
      lineMin: 100,
      lineMax: 300,
      pShape: 70,
      pBranch: 85,
      pDot: 50,
      regularity: 40,
      shapes: shapes('circle', 'semi', 'square'),
      gap: 20,
      background: '#f6f4ef',
      lineColor: '#22262b',
      accentColor: '#c8553d',
      pAccent: 8,
      lineWidth: 2,
      pFill: 20,
    },
  },
];

/** 套用範本：種子與「固定種子」不變 */
export function withTemplate(current: Settings, t: BloomTemplate): Settings {
  return {
    ...t.settings,
    shapes: { ...t.settings.shapes },
    seed: current.seed,
    lockSeed: current.lockSeed,
  };
}

const sameSettings = (a: TemplateSettings, b: TemplateSettings) =>
  (Object.keys(b) as (keyof TemplateSettings)[]).every((k) =>
    k === 'shapes'
      ? (Object.keys(b.shapes) as ShapeKind[]).every((s) => a.shapes[s] === b.shapes[s])
      : a[k] === b[k],
  );

/** 目前的設定剛好是哪個範本（種子不算） */
export function matchTemplate(current: Settings): string | null {
  return TEMPLATES.find((t) => sameSettings(current, t.settings))?.id ?? null;
}
