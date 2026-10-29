/**
 * 幾何花紋產生器的對照資料（單元測試與 e2e 共用）：種子與設定、從原作（al1scut/tkmizGeo edb6828）在 Chromium 141 量到的
 * 圖形／線／點的數量與產生資料序列化後的 SHA-256（規格 3.10）。序列化和對照腳本相同：每個數字是 JSON 的最短表示，
 * 欄位照原作的資料（圖形的種類用原作的名稱、雙正方形是「dsq」），E 是畫的順序（n＝圖形、l＝線、d＝點）。
 */
import type { BloomScene } from '../../src/tools/geo-bloom/generate';
import {
  DEFAULT_SETTINGS,
  type Settings,
  SHAPE_TOGGLES,
  type ShapeToggle,
} from '../../src/tools/geo-bloom/settings';

export type Overrides = Partial<Omit<Settings, 'shapes'>> & {
  shapes?: Partial<Record<ShapeToggle, boolean>>;
};

/** 只勾這些種類（其他都不勾） */
export const only = (...keys: ShapeToggle[]): Record<ShapeToggle, boolean> =>
  Object.fromEntries(SHAPE_TOGGLES.map((k) => [k, keys.includes(k)])) as Record<
    ShapeToggle,
    boolean
  >;

export function settingsWith(o: Overrides): Settings {
  return { ...DEFAULT_SETTINGS, ...o, shapes: { ...DEFAULT_SETTINGS.shapes, ...o.shapes } };
}

/** 和對照腳本相同的序列化（每個數字都是 JSON 的最短表示，逐值相同才會雜湊相同） */
export function canon(scene: BloomScene): string {
  return JSON.stringify({
    N: scene.shapes.map((s) => [
      s.x,
      s.y,
      s.r,
      s.depth,
      s.kind === 'doubleSquare' ? 'dsq' : s.kind,
      s.rotation,
      s.accent ? 1 : 0,
      s.fill ? 1 : 0,
      s.rings
        ? s.rings.map((r) => [
            r.r,
            r.a0,
            r.span,
            r.hidden ? 1 : 0,
            0,
            r.segs
              ? r.segs.map((g) => [g.a0, g.a1, g.dot ? 1 : 0, g.dash ? 1 : 0, g.letter, 0])
              : null,
          ])
        : null,
      s.kind === 'semi' ? (s.closed ? 1 : 0) : null,
      s.tri ? [s.tri.mode, s.tri.rot, s.tri.R, s.tri.fill ? 1 : 0] : null,
      s.bridges?.length ? s.bridges.map((b) => [b.a, b.r0, b.r1]) : null,
      s.core ?? null,
      s.attached ? 1 : 0,
    ]),
    L: scene.lines.map((l) => [l.x1, l.y1, l.x2, l.y2, l.accent ? 1 : 0, l.dropped ? 1 : 0]),
    D: scene.dots.map((d) => [d.x, d.y, d.r, d.accent ? 1 : 0]),
    E: scene.order.replace(/s/g, 'n'),
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
    counts: [14, 20, 1],
    hash: 'ec33d981917f01a181cccf9a2472851699480e63debf57f345bcf8b134fb4592',
  },
  {
    name: '預設（另一個種子）',
    o: { seed: 'tkmiz-01' },
    counts: [25, 44, 10],
    hash: '00dd6f8b0d7d30c5fd3070de07fb9af4659540d88eb725bc2436494d988973dc',
  },
  {
    name: '透明背景、塗滿',
    o: { seed: 'glass', transparent: true, pFill: 40 },
    counts: [51, 75, 10],
    hash: 'c0cac20e008d2d0c5a1c2091cdf65b640ac4f751b20887cc05dec85f7319f1bc',
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
    counts: [21, 41, 5],
    hash: '19e617f894a2b82f9ff8e80250b0100926498811ce502abd4edbe1b8c5a3e29c',
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
    counts: [106, 219, 49],
    hash: '2d56949c653e5248ed95c87029d2039964677606587539ca200b1cfe1de93f47',
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
    counts: [300, 416, 46],
    hash: '4ba81bbeca5bfb0414ebebe2e31c032abce3d3ea93a32e106a81e84b9a0b7788',
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
    counts: [286, 600, 129],
    hash: '1f57ae9f09415de20f5d75cbe8f66d7b639cd47f5b7a6e7483a04308e6f0dacf',
  },
  {
    name: '中文種子、從中心出發、完全等間隔',
    o: {
      seed: '星座の夜',
      fromEdge: false,
      startRing: 'center',
      regularity: 100,
      branchMin: 6,
      branchMax: 6,
      pDot: 90,
    },
    counts: [58, 99, 37],
    hash: 'a5c54f258cd62964577714b3b2c1c51fbf84bdb209ef50c2c86b27a78f54b85c',
  },
  {
    name: '只有正方形與雙正方形',
    o: {
      seed: 'sq-a',
      shapes: { circle: false, rings: false, semi: false, mix: false },
      pFill: 60,
      pAccent: 50,
      lineWidth: 4.5,
      maxShapes: 150,
      maxLines: 300,
    },
    counts: [59, 86, 9],
    hash: 'e468dc890c68c50b781bb350d0de5776ef45e3db254e364e8691be638a056f14',
  },
  {
    name: '空白種子、最小大於最大、一般的種類都沒勾',
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
      shapes: {
        circle: false,
        rings: false,
        semi: false,
        mix: false,
        square: false,
        doubleSquare: false,
      },
    },
    counts: [31, 52, 12],
    hash: '8676061a5cadca6228773bb3f2518ba8d7b477cdaa0f3b800295c6a41dffe98f',
  },
  {
    name: '三角心與三角環',
    o: {
      seed: 'tri',
      shapes: { triCore: true, triRing: true },
      triRing: 'random',
      pTri: 60,
      pFill: 30,
      maxShapes: 200,
      maxLines: 400,
      maxDepth: 6,
    },
    counts: [32, 58, 10],
    hash: '4e45bfb6071e386ae254399df8f91fc2203d4e8758b43b3b82eff063e60b236b',
  },
  {
    name: '摩斯電碼的文字、圓點、不圓的線頭',
    o: {
      seed: 'sos',
      morseText: 'SOS TRPG',
      morseRound: true,
      morseCap: false,
      morseDot: 8,
      lineWidth: 3,
      maxShapes: 100,
    },
    counts: [82, 120, 14],
    hash: 'c32f0d35419122e9c36b296c895a281f7c3e4d2e0b6406850cbd21bf832c16ee',
  },
  {
    name: '摩斯橋',
    o: {
      seed: 'br-a',
      bridges: true,
      pBridge: 80,
      solidFollow: false,
      solidInner: 1,
      maxRings: 7,
      maxShapes: 120,
      pBranch: 90,
      maxDepth: 6,
    },
    counts: [75, 120, 17],
    hash: '9a8b5ee7efd72e2fbd15f236e2bd53d11527238cd5aa42a6d0a8edea263202e2',
  },
  {
    name: '每條線隨機的起點、圓＋半圓',
    o: {
      seed: 'any',
      startRing: 'any',
      shapes: { circle: false, semi: false, square: false, doubleSquare: false },
      maxShapes: 150,
      maxLines: 300,
    },
    counts: [39, 55, 5],
    hash: 'e8aa70d745a255f6821a6b10b8d783f5c32577a0a52f66993aa1d47624375c65',
  },
  {
    name: '不畫線貼著放、線的丟失',
    o: { seed: 'at-b', pAttach: 40, attachDepth: 30, pDrop: 40, maxShapes: 150, maxLines: 300 },
    counts: [47, 55, 11],
    hash: '7aae70f11207387ad031ebc2aa331c3c2a39e22e91576bc8d73aa9106fd55224',
  },
  {
    name: '線不跨過既有的線',
    o: { seed: 'cross', noCross: true, maxShapes: 300, maxLines: 600, branchMax: 12, maxDepth: 8 },
    counts: [263, 600, 134],
    hash: '512514599dfdcc06ed2a7357a8b1a68e2ada8689765c6c8c326285bcb5e6db37',
  },
  {
    name: '中央不一定是同心圓、第一圈出發',
    o: { seed: 'b3', rootRings: false, startRing: 'ring1', endAtRing: false },
    counts: [54, 80, 11],
    hash: '001be7e4791c41d626b9888717eb4367a32de14c2d0a7568ffa9683b81ac4301',
  },
  {
    name: '舊版的值（資料版本 1 的轉換）',
    o: { seed: 'legacy-a', rootRings: false, minRings: 2, startRing: 'edge', morse: false },
    counts: [28, 55, 10],
    hash: 'fe55acced35f1b362bae810579f796a403dbc13b621e3cd7239c86fd6fe919fc',
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
    counts: [500, 652, 65],
    hash: 'cedc37ef48955279149a3a8b2d8d4e92fcf5f99f22ca953e03367955e578c4bf',
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
      bridges: true,
      pDrop: 20,
      pAttach: 10,
      shapes: { triCore: true, triRing: true },
    },
    counts: [1519, 4000, 1169],
    hash: '79a2e39309b345fc08d5ea16b472c5fc3028fe1d36cd7e3a4ac22f9fedf2bdde',
  },
];

/** 原作要算約 26 秒的大畫布（[5000, 5027, 13]） */
export const HUGE_HASH = '1703b139374c41a091b6ef224b1e66804a883ff54da09a69622b6795a1b8f903';
export const HUGE_COUNTS: [number, number, number] = [5000, 5027, 13];
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
