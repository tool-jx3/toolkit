/**
 * 戰鬥地圖產生器 2026-10-30 改版（生成法、尺寸）的相容性（規格 F40）：
 * 預設設定（房間＋走道、22 × 16 格、每格 70 px）、同一個種子時，格局、畫面像素與匯出的 PNG 和改版前逐位元組相同。
 *
 * 下面的數字是改版前的程式（commit 0292848）算出來的 32 位元 FNV-1a 雜湊，不是用改版後的程式重算的；
 * 改了繪圖規則、讓這裡失敗時，代表預設的地圖變了，要先確認是不是刻意的。
 */
import { describe, expect, it } from 'vitest';
import { encodePngColors } from '@/core/encode';
import { generateLayout, MAP_HEIGHT, MAP_WIDTH } from '@/tools/battlemap/layout';
import {
  applyOverlays,
  mapFileName,
  renderBase,
  TERRAIN_IDS,
  type TerrainId,
} from '@/tools/battlemap/render';
import { DEFAULT_SETTINGS } from '@/tools/battlemap/settings';

const fnv = (bytes: ArrayLike<number>) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 16777619);
  return h >>> 0;
};

/** 每個種子、每種地形的像素雜湊：[全關, 只開格線, 只開火光, 全開] */
const PIXELS: Record<number, Record<TerrainId, [number, number, number, number]>> = {
  0: {
    dungeon: [4052969835, 2119960678, 122367978, 2281407970],
    cave: [3474893561, 2952738268, 3548377056, 3175470933],
    crypt: [95866676, 3194749027, 3122901430, 3948158449],
  },
  42: {
    dungeon: [1054922008, 724333384, 4107946375, 398786136],
    cave: [2751340994, 2061443285, 1674038949, 4224130699],
    crypt: [3802731296, 2183137884, 4194206285, 371641966],
  },
  2024: {
    dungeon: [1029560917, 3323319574, 3309521765, 664130845],
    cave: [2985615733, 4087519867, 1316624965, 1901360190],
    crypt: [3804368708, 2097181107, 3943024031, 1926331657],
  },
  123456789: {
    dungeon: [347656345, 3714156781, 1471587927, 2822147993],
    cave: [3462480862, 544375201, 3310154458, 1524809447],
    crypt: [2285298182, 1306496611, 1807191418, 2391194787],
  },
  999999999: {
    dungeon: [21305213, 756693415, 2484533284, 3434484456],
    cave: [3492070711, 3369715108, 987291087, 1946565373],
    crypt: [4201515981, 3374370622, 25800602, 4129380431],
  },
};

/** 匯出的 PNG 檔（整個檔案的位元組）的雜湊：種子 42 全開、種子 2024 全關 */
const PNG_FILES: Record<string, number> = {
  '42:dungeon': 126806948,
  '42:cave': 3945985388,
  '42:crypt': 1544596658,
  '2024:dungeon': 3534612640,
  '2024:cave': 883435569,
  '2024:crypt': 2006925261,
};

/** 400 個種子（s × 2,499,997 + 3）的格局雜湊串起來再雜湊一次 */
const LAYOUTS_400 = 2282717080;

const COMBOS = [
  { grid: false, light: false },
  { grid: true, light: false },
  { grid: false, light: true },
  { grid: true, light: true },
] as const;

describe('預設設定與改版前逐位元組相同', () => {
  it('400 個種子的格局（不給設定、給預設設定都一樣）', () => {
    const hashes: number[] = [];
    for (let s = 0; s < 400; s++) {
      const seed = s * 2_499_997 + 3;
      const l = generateLayout(seed);
      if (s % 40 === 0) expect(generateLayout(seed, DEFAULT_SETTINGS).cells).toEqual(l.cells);
      hashes.push(fnv(l.cells));
    }
    const bytes = hashes.flatMap((h) => [h & 255, (h >>> 8) & 255, (h >>> 16) & 255, h >>> 24]);
    expect(fnv(bytes)).toBe(LAYOUTS_400);
  });

  for (const seed of Object.keys(PIXELS).map(Number)) {
    it(`種子 ${seed}：三種地形 × 格線／火光開關的像素`, () => {
      const layout = generateLayout(seed, DEFAULT_SETTINGS);
      for (const terrain of TERRAIN_IDS) {
        const base = renderBase(layout, terrain, DEFAULT_SETTINGS.cellPx);
        const got = COMBOS.map((o) => fnv(applyOverlays(base, layout, o, 70)));
        expect(got, terrain).toEqual(PIXELS[seed][terrain]);
      }
    });
  }

  for (const [seed, combo] of [
    [42, COMBOS[3]],
    [2024, COMBOS[0]],
  ] as const) {
    it(`種子 ${seed}：匯出的 PNG 檔與檔名`, async () => {
      const layout = generateLayout(seed);
      for (const terrain of TERRAIN_IDS) {
        const px = applyOverlays(renderBase(layout, terrain), layout, combo);
        const { bytes } = await encodePngColors(px, MAP_WIDTH, MAP_HEIGHT, 0);
        expect(fnv(bytes), terrain).toBe(PNG_FILES[`${seed}:${terrain}`]);
        expect(mapFileName(terrain, seed, DEFAULT_SETTINGS)).toBe(
          `battlemap_${terrain}_${seed}.png`,
        );
      }
    });
  }
});
