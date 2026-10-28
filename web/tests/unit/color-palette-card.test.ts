/**
 * 角色配色條產生器的配色卡（規格 1.2）：每一欄的色票與代表色、混色帶、綜合色、版面、色名不重複、
 * 複製的文字、檔名、GIF 的影格與大小。
 */
import { describe, expect, it } from 'vitest';
import type { PaletteColor } from '@/core/image';
import {
  blendOf,
  CARD,
  cardCopyText,
  cardFileBase,
  cardNames,
  columnColorsMode,
  layoutCard,
  mixPairs,
  partsSwatches,
  type ResolvedColumn,
  ratioValue,
  resolveColumn,
} from '@/tools/color-palette/card';
import { GIF_TIMING, gifFrames, gifSize } from '@/tools/color-palette/cardRender';
import {
  barOf,
  type CardColumn,
  DEFAULT_CARD,
  DEFAULT_PLACEMENT_VALUE,
  segmentOf,
} from '@/tools/color-palette/logic';

const pc = (hex: string, share = 0.2): PaletteColor => ({
  color: hex,
  rgb: [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number],
  share,
});

const col = (patch: Partial<CardColumn> = {}): CardColumn => ({
  id: `col-${Math.random()}`,
  source: 'character',
  characterId: null,
  image: null,
  name: '',
  placement: DEFAULT_PLACEMENT_VALUE,
  key: null,
  colors: 'auto',
  ...patch,
});

const withImage = barOf(
  'a',
  160,
  [
    segmentOf('s1', '#2a2a32', 1, { role: 'hair' }),
    segmentOf('s2', '#8a5a3c', 1, { role: 'eye' }),
    segmentOf('s3', '#000000', 1, { role: 'eye', none: true }),
    segmentOf('s4', '#2a2a32', 1, { role: 'outfit' }),
  ],
  { name: '林予安', image: { id: 'img', width: 600, height: 800 } },
);
const noImage = barOf('b', 160, [segmentOf('t1', '#ecebe6', 1, { role: 'hair' })], {
  name: '白澄',
  theme: '#c43a3a',
});

describe('每一欄的色票與代表色', () => {
  const auto = [pc('#101010', 0.3), pc('#c83c3c', 0.3), pc('#f0f0f0', 0.4)];

  it('角色有立繪：預設自動取色（k-means 的結果）；代表色沒有時自動選', () => {
    const r = resolveColumn(col({ characterId: 'a' }), [withImage, noImage], auto);
    expect(r.colors).toBe('auto');
    expect(r.swatches).toBe(auto);
    expect(r.name).toBe('林予安');
    expect(r.key).toEqual([200, 60, 60]);
    expect(r.keyChosen).toBe(false);
  });

  it('「用角色的顏色」或沒有立繪：部位的顏色（「無」不算、重複的只留一個）；角色的代表色就是卡上的代表色', () => {
    expect(columnColorsMode(col({ characterId: 'b' }), noImage)).toBe('parts');
    const r = resolveColumn(col({ characterId: 'a', colors: 'parts' }), [withImage], auto);
    expect(r.swatches.map((s) => s.color)).toEqual(['#2a2a32', '#8a5a3c']);
    expect(partsSwatches(withImage).map((s) => s.share)).toEqual([0.5, 0.5]);
    const b = resolveColumn(col({ characterId: 'b' }), [noImage], null);
    expect(b.key).toEqual([196, 58, 58]);
    expect(b.keyChosen).toBe(true);
  });

  it('照片：代表色換成色票裡最接近的那一個；名字用欄的名字', () => {
    const r = resolveColumn(
      col({
        source: 'photo',
        image: { id: 'p', width: 10, height: 10 },
        name: '照片',
        key: '#d04040',
      }),
      [],
      auto,
    );
    expect(r.key).toEqual([200, 60, 60]);
    expect(r.keyChosen).toBe(true);
    expect(r.name).toBe('照片');
  });
});

const resolved = (keys: (string | null)[], swatches: string[][]): ResolvedColumn[] =>
  keys.map((k, i) => ({
    id: `c${i}`,
    name: `第${i}`,
    bar: null,
    image: null,
    swatches: swatches[i].map((h) => pc(h)),
    key: k ? pc(k).rgb : null,
    keyChosen: false,
    colors: 'auto',
  }));

describe('混色帶、綜合色', () => {
  it('兩欄以上：相鄰兩欄的代表色各一條（最多 3 條）；綜合色是代表色的平均', () => {
    const r = resolved(['#ff0000', '#0000ff', '#00ff00'], [['#ff0000'], ['#0000ff'], ['#00ff00']]);
    expect(mixPairs(r)).toEqual([
      [
        [255, 0, 0],
        [0, 0, 255],
      ],
      [
        [0, 0, 255],
        [0, 255, 0],
      ],
    ]);
    expect(blendOf(r)).toEqual([85, 85, 85]);
  });

  it('只有一欄：最暗＋最亮、第二暗＋第二亮（4 色以上才有第二條）；沒有綜合色', () => {
    const r = resolved(['#202020'], [['#000000', '#404040', '#808080', '#c0c0c0', '#ffffff']]);
    expect(mixPairs(r)).toEqual([
      [
        [0, 0, 0],
        [255, 255, 255],
      ],
      [
        [64, 64, 64],
        [192, 192, 192],
      ],
    ]);
    expect(blendOf(r)).toBeNull();
    expect(mixPairs(resolved([null], [[]]))).toEqual([]);
  });
});

describe('版面', () => {
  it('欄寬依欄數；照片高＝欄寬 × 比例；色票的列數是最多的那一欄', () => {
    const one = layoutCard(
      DEFAULT_CARD,
      resolved(['#ff0000'], [['#000000', '#ff0000', '#ffffff']]),
    );
    expect(one.colW).toBe(CARD.colW[0]);
    expect(one.width).toBe(CARD.pad * 2 + CARD.colW[0]);
    expect(one.photoH).toBe(CARD.colW[0]);
    expect(one.rows).toBe(3);
    const tall = layoutCard(
      { ...DEFAULT_CARD, ratio: '3:4', title: '標題' },
      resolved(['#ff0000', '#0000ff'], [['#ff0000'], ['#0000ff', '#ffffff']]),
    );
    expect(tall.colW).toBe(CARD.colW[1]);
    expect(tall.photoH).toBe(Math.round(CARD.colW[1] * ratioValue('3:4')));
    expect(tall.title).toBe(true);
    expect(tall.rows).toBe(2);
    /* GIF 的步驟：每一列色票、每條混色帶、綜合色 */
    expect(tall.steps).toHaveLength(2 + 1 + 1);
    expect(tall.height).toBeGreaterThan(tall.blendY + CARD.blendH);
  });

  it('還沒有顏色：列數＝自動取幾色（空的格子）', () => {
    expect(layoutCard(DEFAULT_CARD, resolved([null], [[]])).rows).toBe(DEFAULT_CARD.count);
  });
});

describe('色名、複製、檔名', () => {
  it('同一張卡的色名不重複（由左到右、由上到下）；綜合色最後', () => {
    const r = resolved(['#d42a2a', '#d42a2a'], [['#d42a2a'], ['#d42a2a']]);
    const n = cardNames(r, blendOf(r));
    expect(n.swatch[0][0]).toBe('正紅');
    expect(n.swatch[1][0]).not.toBe('正紅');
    expect(n.blend).not.toBe(n.swatch[0][0]);
  });

  it('複製的文字：名字一行、每色「#HEX 色名」、空一行；最後是綜合色', () => {
    const r = resolved(['#ff0000', '#0000ff'], [['#ff0000'], ['#0000ff']]);
    const b = blendOf(r);
    const names = { swatch: [['紅'], ['藍']], blend: '紫' };
    expect(cardCopyText(r, names, b, '綜合色')).toBe(
      ['第0', '#FF0000 紅', '', '第1', '#0000FF 藍', '', '綜合色 #800080 紫'].join('\n'),
    );
  });

  it('檔名：標題 → 各欄的名字 → 預設', () => {
    const r = resolved(['#ff0000', '#0000ff'], [['#ff0000'], ['#0000ff']]);
    expect(cardFileBase({ ...DEFAULT_CARD, title: ' 白與墨 ' }, r, '配色卡')).toBe('白與墨');
    expect(cardFileBase(DEFAULT_CARD, r, '配色卡')).toBe('第0-第1');
    expect(cardFileBase(DEFAULT_CARD, [], '配色卡')).toBe('配色卡');
  });
});

describe('GIF', () => {
  it('影格：第一格什麼都沒出現，每一步 4 格（淡入），最後一格停留最久', () => {
    const f = gifFrames(3);
    expect(f).toHaveLength(1 + 3 * GIF_TIMING.subFrames);
    expect(f[0]).toEqual({ anim: { step: 0, p: 0 }, ms: GIF_TIMING.first });
    expect(f[GIF_TIMING.subFrames].anim).toEqual({ step: 1, p: 0 });
    expect(f.at(-1)).toEqual({ anim: { step: 3, p: 0 }, ms: GIF_TIMING.last });
    expect(gifFrames(0)).toEqual([{ anim: null, ms: GIF_TIMING.last }]);
  });

  it('大小：寬不超過畫質、高不超過畫質 × 1.75，不放大', () => {
    expect(gifSize({ width: 784, height: 1156 }, 1150)).toEqual({
      scale: 1,
      width: 784,
      height: 1156,
    });
    const s = gifSize({ width: 1824, height: 1400 }, 900);
    expect(s.width).toBe(900);
    expect(s.height).toBe(Math.round(1400 * (900 / 1824)));
  });
});
