/**
 * 執照卡的 12 種執照：圖示（100 × 100 的方格裡的幾何形狀）、卡上印的名稱（英文，可以改）、設定欄的中文名稱。
 * 圖示的形狀照 CyberDelaai/sinforge-ui（MIT，`67d459a`）的 js/licenses.js。
 *
 * 形狀：`p` 填滿的多邊形、`c` 填滿的圓、`ring` 描邊的圓（線寬 w）、`l` 描邊的線（線寬 w）；`cut` 從已經畫的部分挖掉。
 */
import type { Pt } from './geom';

export type LicenseShape =
  | { p: Pt[]; cut?: boolean }
  | { c: [number, number, number]; cut?: boolean }
  | { ring: [number, number, number]; w: number; cut?: boolean }
  | { l: Pt[]; w: number; cut?: boolean };

export interface LicenseDef {
  key: string;
  /** 卡上印的名稱 */
  cap: string;
  /** 設定欄的名稱 */
  label: string;
  shapes: () => LicenseShape[];
}

const rot = (pts: Pt[], deg: number): Pt[] => {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return pts.map(([x, y]) => [50 + (x - 50) * c - (y - 50) * s, 50 + (x - 50) * s + (y - 50) * c]);
};
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
const star = (cx: number, cy: number, n: number, ro: number, ri: number): Pt[] =>
  Array.from({ length: n * 2 }, (_, i) => {
    const a = (Math.PI / n) * i - Math.PI / 2;
    const r = i % 2 ? ri : ro;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Pt;
  });

export const LICENSES: readonly LicenseDef[] = [
  {
    key: 'firearms',
    cap: 'FIREARMS',
    label: '槍械',
    shapes: () => [
      {
        p: [
          [10, 24],
          [90, 24],
          [90, 42],
          [48, 42],
          [44, 54],
          [34, 54],
          [30, 84],
          [8, 84],
          [14, 48],
          [10, 42],
        ],
      },
      { p: rect(80, 17, 88, 24) },
      {
        l: [
          [46, 42],
          [50, 58],
          [36, 58],
          [36, 54],
        ],
        w: 5,
      },
    ],
  },
  {
    key: 'blades',
    cap: 'BLADES',
    label: '刀械',
    shapes: () => [
      {
        p: rot(
          [
            [8, 44],
            [32, 44],
            [32, 56],
            [8, 56],
          ],
          -45,
        ),
      },
      { p: rot(rect(32, 34, 39, 66), -45) },
      {
        p: rot(
          [
            [39, 42],
            [80, 42],
            [96, 50],
            [84, 57],
            [39, 57],
          ],
          -45,
        ),
      },
      {
        l: rot(
          [
            [44, 46.5],
            [76, 46.5],
          ],
          -45,
        ),
        w: 3,
        cut: true,
      },
    ],
  },
  {
    key: 'explosives',
    cap: 'EXPLOSIVES',
    label: '爆裂物',
    shapes: () => [
      { c: [44, 60, 30] },
      {
        p: [
          [58, 30],
          [66, 22],
          [76, 32],
          [68, 40],
        ],
      },
      { ring: [34, 52, 12], w: 4, cut: true },
      {
        l: [
          [71, 27],
          [75, 19],
          [80, 16],
        ],
        w: 4,
      },
      { p: star(84, 14, 5, 10, 4) },
    ],
  },
  {
    key: 'driver',
    cap: 'DRIVER',
    label: '駕駛',
    shapes: () => [
      { ring: [50, 50, 38], w: 10 },
      { c: [50, 52, 11] },
      {
        p: [
          [14, 46],
          [40, 46],
          [40, 57],
          [16, 60],
        ],
      },
      {
        p: [
          [86, 46],
          [60, 46],
          [60, 57],
          [84, 60],
        ],
      },
      {
        p: [
          [45, 60],
          [55, 60],
          [57, 87],
          [43, 87],
        ],
      },
    ],
  },
  {
    key: 'pilot',
    cap: 'PILOT',
    label: '飛行',
    shapes: () => [
      {
        p: [
          [50, 5],
          [56, 14],
          [56, 38],
          [94, 58],
          [94, 67],
          [56, 57],
          [56, 77],
          [69, 87],
          [69, 94],
          [50, 89],
          [31, 94],
          [31, 87],
          [44, 77],
          [44, 57],
          [6, 67],
          [6, 58],
          [44, 38],
          [44, 14],
        ],
      },
    ],
  },
  {
    key: 'medic',
    cap: 'MEDICAL',
    label: '醫療',
    shapes: () => [
      {
        p: [
          [37, 8],
          [63, 8],
          [63, 37],
          [92, 37],
          [92, 63],
          [63, 63],
          [63, 92],
          [37, 92],
          [37, 63],
          [8, 63],
          [8, 37],
          [37, 37],
        ],
      },
    ],
  },
  {
    key: 'detective',
    cap: 'DETECTIVE',
    label: '偵探',
    shapes: () => [
      { ring: [40, 40, 26], w: 10 },
      {
        l: [
          [60, 60],
          [88, 88],
        ],
        w: 15,
      },
      {
        l: [
          [27, 34],
          [33, 26],
        ],
        w: 4,
      },
    ],
  },
  {
    key: 'security',
    cap: 'SECURITY',
    label: '保全',
    shapes: () => [
      {
        p: [
          [50, 6],
          [88, 18],
          [86, 54],
          [50, 94],
          [14, 54],
          [12, 18],
        ],
      },
      { c: [50, 40, 10], cut: true },
      {
        p: [
          [45, 44],
          [55, 44],
          [59, 70],
          [41, 70],
        ],
        cut: true,
      },
    ],
  },
  {
    key: 'bounty',
    cap: 'BOUNTY',
    label: '賞金獵人',
    shapes: () => [
      { ring: [50, 50, 32], w: 7 },
      {
        l: [
          [50, 6],
          [50, 36],
        ],
        w: 7,
      },
      {
        l: [
          [50, 64],
          [50, 94],
        ],
        w: 7,
      },
      {
        l: [
          [6, 50],
          [36, 50],
        ],
        w: 7,
      },
      {
        l: [
          [64, 50],
          [94, 50],
        ],
        w: 7,
      },
      { c: [50, 50, 6] },
    ],
  },
  {
    key: 'decker',
    cap: 'DECKER',
    label: '駭客',
    shapes: () => [
      { p: rect(8, 12, 92, 76) },
      { p: rect(16, 20, 84, 68), cut: true },
      {
        p: [
          [24, 30],
          [42, 44],
          [24, 58],
          [24, 50],
          [32, 44],
          [24, 38],
        ],
      },
      { p: rect(46, 52, 66, 58) },
      {
        p: [
          [40, 76],
          [60, 76],
          [64, 86],
          [36, 86],
        ],
      },
      { p: rect(24, 86, 76, 93) },
    ],
  },
  {
    key: 'magic',
    cap: 'MAGIC',
    label: '魔法',
    shapes: () => {
      const pt = (i: number): Pt => [
        50 + 36 * Math.cos(-Math.PI / 2 + (i * 4 * Math.PI) / 5),
        52 + 36 * Math.sin(-Math.PI / 2 + (i * 4 * Math.PI) / 5),
      ];
      return [
        { ring: [50, 52, 41], w: 6 },
        { l: [0, 1, 2, 3, 4, 0, 1].map(pt), w: 5 },
      ];
    },
  },
  {
    key: 'cyberware',
    cap: 'CYBERWARE',
    label: '義體',
    shapes: () => {
      const top: Pt[] = [];
      const bot: Pt[] = [];
      for (let i = 0; i <= 16; i++) {
        const x = 6 + (88 * i) / 16;
        const h = 30 * Math.sin((Math.PI * i) / 16);
        top.push([x, 50 - h]);
        bot.unshift([x, 50 + h]);
      }
      return [
        { p: top.concat(bot) },
        { c: [50, 50, 22], cut: true },
        { c: [50, 50, 12] },
        { c: [55, 45, 4], cut: true },
        {
          l: [
            [50, 80],
            [50, 92],
            [72, 92],
          ],
          w: 4,
        },
        {
          l: [
            [50, 20],
            [50, 8],
            [28, 8],
          ],
          w: 4,
        },
      ];
    },
  },
];

export const LICENSE_KEYS: readonly string[] = LICENSES.map((l) => l.key);
export const licenseDef = (key: string): LicenseDef | undefined =>
  LICENSES.find((l) => l.key === key);
/** 卡上印的名稱的字數上限 */
export const LICENSE_CAP_MAX = 14;
