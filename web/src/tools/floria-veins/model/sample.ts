/**
 * 範例（規格 F07）：原作內建的範例資料（「全員」分頁裡 PC2～PC4、BOSS、Mob1、Mob2 的魔法脈；MIT，
 * `UPSTREAM_LICENSE`），換成本站的格式，名字的 Mob 改成「隨從」；最前面加一張空白的 PC1（原作是自己的畫布）。
 * 線的端點以格為單位（[x1, y1, x2, y2]），塗色的頂點以單位（1 格＝1200）。原作的範例沒有指定顏色，
 * 線與塗色用原作的預設色。
 */
import {
  COLORS,
  type Doc,
  type Pt,
  SIZE_CHARACTER,
  SIZE_MINION,
  UNIT,
  type VeinCanvas,
} from './types';

type Raw = {
  name: string;
  size: number;
  lines: readonly (readonly [number, number, number, number])[];
  fills: readonly (readonly (readonly [number, number])[])[];
  damage: readonly (readonly [number, number])[];
};

const RAW: readonly Raw[] = [
  { name: 'PC1', size: SIZE_CHARACTER, lines: [], fills: [], damage: [] },
  {
    name: 'PC2',
    size: SIZE_CHARACTER,
    lines: [
      [0, 0, 1, 11],
      [1, 11, 2, 10],
      [2, 10, 0, 0],
      [0, 10, 10, 10],
      [10, 10, 9, 11],
      [9, 11, 0, 10],
      [0, 1, 1, 1],
      [1, 1, 11, 2],
      [11, 2, 0, 1],
      [10, 0, 11, 11],
    ],
    fills: [],
    damage: [
      [7, 4],
      [8, 4],
      [8, 3],
      [8, 5],
      [9, 4],
    ],
  },
  {
    name: 'PC3',
    size: SIZE_CHARACTER,
    lines: [
      [1, 2, 5, 2],
      [5, 2, 2, 5],
      [2, 5, 3, 1],
      [3, 1, 4, 5],
      [4, 5, 1, 2],
      [5, 10, 10, 6],
      [10, 6, 11, 9],
      [11, 9, 8, 11],
      [8, 11, 5, 10],
      [3, 9, 11, 7],
      [11, 7, 1, 6],
      [1, 6, 3, 9],
      [9, 1, 0, 9],
      [0, 9, 11, 5],
      [11, 5, 9, 1],
    ],
    fills: [
      [
        [3300, 2400],
        [3600, 1200],
        [3900, 2400],
        [6000, 2400],
        [4320, 4080],
        [4800, 6000],
        [3600, 4800],
        [2400, 6000],
        [2880, 4080],
        [1200, 2400],
      ],
      [
        [10800, 8160],
        [12000, 7200],
        [12372, 8317],
      ],
      [
        [2898, 9746],
        [2260, 8791],
        [0, 10800],
      ],
    ],
    damage: [],
  },
  {
    name: 'PC4',
    size: SIZE_CHARACTER,
    lines: [
      [0, 3, 11, 1],
      [11, 1, 3, 5],
      [3, 5, 0, 3],
      [7, 0, 3, 10],
      [3, 10, 6, 11],
      [6, 11, 7, 0],
      [0, 7, 11, 5],
      [11, 5, 5, 9],
      [5, 9, 0, 7],
    ],
    fills: [
      [
        [8208, 2108],
        [7506, 2235],
        [8400, 0],
      ],
    ],
    damage: [
      [4, 4],
      [5, 4],
      [6, 4],
      [5, 3],
      [5, 5],
    ],
  },
  {
    name: 'BOSS',
    size: SIZE_CHARACTER,
    lines: [
      [11, 0, 0, 11],
      [0, 3, 3, 0],
      [3, 0, 11, 8],
      [11, 8, 8, 11],
      [8, 11, 0, 3],
      [0, 8, 8, 0],
      [8, 0, 11, 3],
      [11, 3, 3, 11],
      [3, 11, 0, 8],
      [3, 3, 8, 3],
      [8, 3, 8, 8],
      [8, 8, 3, 8],
      [3, 8, 3, 3],
    ],
    fills: [
      [
        [6600, 10200],
        [6000, 9600],
        [7200, 9600],
      ],
      [
        [7200, 3600],
        [8400, 4800],
        [9600, 3600],
      ],
    ],
    damage: [
      [2, 5],
      [9, 1],
    ],
  },
  {
    name: '隨從1',
    size: SIZE_MINION,
    lines: [
      [0, 3, 6, 3],
      [3, 0, 0, 5],
      [0, 5, 6, 5],
      [6, 5, 3, 0],
      [6, 0, 0, 6],
    ],
    fills: [],
    damage: [],
  },
  {
    name: '隨從2',
    size: SIZE_MINION,
    lines: [
      [0, 3, 6, 3],
      [3, 0, 0, 5],
      [0, 5, 6, 5],
      [6, 5, 3, 0],
      [6, 0, 0, 6],
    ],
    fills: [
      [
        [5760, 3600],
        [4950, 2250],
        [3600, 3600],
      ],
    ],
    damage: [
      [1, 1],
      [5, 4],
    ],
  },
];

/** 範例的整份資料（畫布 7 張：PC1～PC4、BOSS、隨從1、隨從2） */
export function sampleDoc(): Doc {
  const canvases: VeinCanvas[] = RAW.map((r, i) => ({
    id: `sample-${i + 1}`,
    name: r.name,
    size: r.size,
    lines: r.lines.map(([x1, y1, x2, y2]) => ({
      a: [x1 * UNIT, y1 * UNIT] as Pt,
      b: [x2 * UNIT, y2 * UNIT] as Pt,
      color: COLORS.line,
    })),
    fills: r.fills.map((pts) => ({
      pts: pts.map(([x, y]): Pt => [x, y]),
      color: COLORS.fill,
    })),
    damage: r.damage.map(([x, y]): [number, number] => [x, y]),
  }));
  return { canvases, stamps: [], draft: null };
}
