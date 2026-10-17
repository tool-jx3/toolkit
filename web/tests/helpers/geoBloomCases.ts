/**
 * 幾何花紋產生器的對照資料（單元測試與 e2e 共用）：種子與設定、從原作（al1scut/tkmizGeo 3097b39）在 Chromium 141 量到的
 * 圖形／線／點的數量與產生資料序列化後的 SHA-256（規格 3.10）。序列化和對照腳本相同：每個數字是 JSON 的最短表示。
 */
import type { BloomScene } from '../../src/tools/geo-bloom/generate';
import {
  DEFAULT_SETTINGS,
  type Settings,
  SHAPE_KINDS,
  type ShapeKind,
} from '../../src/tools/geo-bloom/settings';

export type Overrides = Partial<Omit<Settings, 'shapes'>> & {
  shapes?: Partial<Record<ShapeKind, boolean>>;
};

export const only = (...keys: ShapeKind[]): Record<ShapeKind, boolean> =>
  Object.fromEntries(SHAPE_KINDS.map((k) => [k, keys.includes(k)])) as Record<ShapeKind, boolean>;

export function settingsWith(o: Overrides): Settings {
  return { ...DEFAULT_SETTINGS, ...o, shapes: { ...DEFAULT_SETTINGS.shapes, ...o.shapes } };
}

/** 原作的種類名稱（序列化用） */
const ORIGINAL_KIND: Record<ShapeKind, string> = {
  circle: 'circle',
  rings: 'rings',
  semi: 'semi',
  mix: 'mix',
  square: 'square',
  doubleSquare: 'dsq',
};

/** 和對照腳本相同的序列化（每個數字都是 JSON 的最短表示，逐值相同才會雜湊相同） */
export function canon(scene: BloomScene): string {
  return JSON.stringify({
    n: scene.shapes.map((s) => [
      s.x,
      s.y,
      s.r,
      s.depth,
      ORIGINAL_KIND[s.kind],
      s.rotation,
      s.accent ? 1 : 0,
      s.fill ? 1 : 0,
      s.rings ?? null,
      s.arcs ? s.arcs.map((a) => (a ? [a.start, a.span] : null)) : null,
      s.kind === 'semi' ? s.closed : null,
    ]),
    l: scene.lines.map((l) => [l.x1, l.y1, l.x2, l.y2, l.accent ? 1 : 0]),
    d: scene.dots.map((d) => [d.x, d.y, d.r, d.accent ? 1 : 0]),
  });
}

/** 從原作量到的：名稱、設定、[圖形, 線, 點]、序列化的 SHA-256（Chromium 裡的值） */
export const GOLDEN: {
  name: string;
  o: Overrides;
  counts: [number, number, number];
  hash: string;
}[] = [
  {
    name: '預設',
    o: { seed: 'abc' },
    counts: [57, 94, 18],
    hash: '6dadd67d46164165f7dbd7f004b06e1a19cb1bbe5e77e3a72a762078da897d84',
  },
  {
    name: '透明背景',
    o: { seed: 'tkmiz-01', transparent: true },
    counts: [20, 30, 4],
    hash: 'd685007cabb2589fc668048f5caf993d711923c8f0a762fb73a2bedfc33a3b9d',
  },
  {
    name: '重疊時只畫線',
    o: {
      seed: 'line-mode',
      overlapMode: 'line',
      gap: 30,
      maxShapes: 200,
      maxLines: 400,
      maxDepth: 6,
    },
    counts: [21, 39, 5],
    hash: '063aeab475ccc97762dd06a89807026b652b70d4343c3c99c9e97f82a44d46c2',
  },
  {
    name: '重疊時整條取消',
    o: {
      seed: 'skip-mode',
      overlapMode: 'skip',
      gap: 20,
      maxShapes: 200,
      maxLines: 400,
      maxDepth: 6,
      branchMax: 12,
    },
    counts: [99, 185, 36],
    hash: '1ac47b80b20875f83deac79cc29dd52cd192bc0c7587d90f7acb425377f27bdd',
  },
  {
    name: '可以重疊、不收在畫布內',
    o: {
      seed: 'free-7',
      avoidOverlap: false,
      inBounds: false,
      maxShapes: 300,
      maxLines: 600,
      maxDepth: 8,
    },
    counts: [300, 434, 47],
    hash: 'f93912f97cf508cb292d0af2662321ae18e8cd5674c508227aae634921766922',
  },
  {
    name: '線不穿過既有圖形',
    o: {
      seed: 'avoid-3',
      lineAvoid: true,
      maxShapes: 300,
      maxLines: 600,
      maxDepth: 8,
      branchMax: 10,
    },
    counts: [300, 589, 116],
    hash: '2d4bd4edce13aef092f98a12bb249cf28e1e6f82461286928224b6ba0b107421',
  },
  {
    name: '中文種子、從中心出發、完全等間隔',
    o: { seed: '星座の夜', fromEdge: false, regularity: 100, branchMin: 6, branchMax: 6, pDot: 90 },
    counts: [60, 96, 33],
    hash: 'e406aa51270ee1c5aaa3da1b5a4120048f0464d423e8de388c798f544e80c7d5',
  },
  {
    name: '只有正方形與雙正方形',
    o: {
      seed: 'squares',
      shapes: only('square', 'doubleSquare'),
      pFill: 60,
      pAccent: 50,
      lineWidth: 4.5,
    },
    counts: [18, 30, 6],
    hash: '6d1c9726df778d540278ef3771b5fe1bca50c68eb45de8f37920342261eb0bf2',
  },
  {
    name: '只有同心圓與圓＋半圓',
    o: {
      seed: 'rings',
      shapes: only('rings', 'mix'),
      maxRings: 12,
      pFill: 50,
      rootMin: 200,
      rootMax: 300,
    },
    counts: [60, 99, 13],
    hash: 'c51e3be36e7506a80584cf86f92d1f5b49c335241eb0153fce85523c54d3710a',
  },
  {
    name: '空白種子、最小大於最大、一個種類都沒勾',
    o: {
      seed: '',
      branchMin: 9,
      branchMax: 3,
      rootMin: 300,
      rootMax: 100,
      childMin: 80,
      childMax: 20,
      lineMin: 400,
      lineMax: 100,
      shapes: only(),
    },
    counts: [60, 95, 11],
    hash: '79144b0a593520b236ee9de33a731d93919ceb3485322a9900a4d18a19d0dd41',
  },
  {
    name: '半圓、最細的線、全部塗滿',
    o: {
      seed: 'semi',
      shapes: only('semi', 'circle'),
      lineWidth: 0.25,
      pFill: 100,
      regularity: 0,
      maxDepth: 10,
      shrink: 30,
    },
    counts: [20, 77, 23],
    hash: '25b680f5cccad1f59f03f715584ecb1eea3da9ddeca4a08100f5a336b7b9b8b7',
  },
  {
    name: '深度 40、不縮小',
    o: {
      seed: 'deep',
      maxDepth: 40,
      shrink: 100,
      pBranch: 100,
      branchMin: 2,
      branchMax: 3,
      pShape: 90,
      maxShapes: 500,
      maxLines: 1000,
      inBounds: false,
      lineMax: 400,
    },
    counts: [500, 625, 50],
    hash: '92a97b2e8fa6674c183590b3c315cc57282e9128667d21c7e1bed25803ff1b6b',
  },
  {
    name: '4000 × 3000',
    o: {
      seed: 'big',
      width: 4000,
      height: 3000,
      maxShapes: 2000,
      maxLines: 4000,
      maxDepth: 12,
      branchMax: 10,
      pBranch: 85,
      shrink: 85,
      lineWidth: 3,
    },
    counts: [1162, 4000, 1129],
    hash: '060d94c06fbf0e380507b1322e212505c60b3b9498a063fb41e0acaf430de2e0',
  },
];

/** 原作要算約 60 秒的大畫布（[5000, 5021, 7]） */
export const HUGE_HASH = 'e1ae653b1403e562ef23a21df48343865da90a877638f48e32e5d5437532d3c5';
export const HUGE: Overrides = {
  seed: 'huge',
  width: 8000,
  height: 8000,
  maxShapes: 5000,
  maxLines: 10000,
  maxDepth: 40,
  branchMin: 10,
  branchMax: 30,
  pBranch: 100,
  pShape: 100,
};
