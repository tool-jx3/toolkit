/**
 * 刮刮卡產生器（scratch-card）：抽籤（種子＝同一張，和原作的 mulberry32 與取亂數的順序相同）、
 * 結果的位置（flex 換行置中）、刮開區、個別塗層、卡片（進階設定開關）。規格 3.2～3.4、3.6。
 */
import { describe, expect, it } from 'vitest';
import {
  buildCard,
  cardImages,
  coverPieces,
  drawResult,
  effectiveZone,
  flexItems,
  iconSize,
  specOf,
} from '@/tools/scratch-card/card';
import { ICON_COUNT, iconSvg, SCRATCH_ICONS } from '@/tools/scratch-card/icons';
import { type ImageRef, initialState, type ScratchState } from '@/tools/scratch-card/model';

/** 原作 script.js 的亂數（照原作的寫法，用來對照） */
function upstreamMulberry32(a: number) {
  return () => {
    // biome-ignore lint/suspicious/noAssignInExpressions: 照原作的寫法
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const state = (patch: Partial<ScratchState> = {}): ScratchState => ({
  ...initialState(12345),
  ...patch,
});

const url = (n: number): ImageRef => ({
  kind: 'url',
  url: `https://example.com/${n}.png`,
  name: `${n}.png`,
});

describe('抽籤（3.6）', () => {
  it('圖示：和原作同樣的種子抽到同樣的位置', () => {
    for (const seed of [0, 1, 12345, 999999, 424242, -7, 3_000_000_000]) {
      for (const count of [1, 3, 10]) {
        const r = upstreamMulberry32(seed);
        const expected = Array.from({ length: count }, () => Math.floor(r() * 8));
        const got = drawResult(state({ kind: 'icons', count }), seed);
        expect(got).toEqual({ kind: 'icons', icons: expected });
      }
    }
  });

  it('句子：空白行不算、照原樣（不去頭尾空白）、全部空白時「沒有結果」', () => {
    const sentences = '一\n\n  二  \n   \n三';
    for (const seed of [5, 77, 123456]) {
      const r = upstreamMulberry32(seed);
      const list = ['一', '  二  ', '三'];
      expect(drawResult(state({ kind: 'sentence', sentences }), seed)).toEqual({
        kind: 'sentence',
        text: list[Math.floor(r() * 3)],
      });
    }
    expect(drawResult(state({ kind: 'sentence', sentences: ' \n\n' }), 1)).toEqual({
      kind: 'sentence',
      text: '沒有結果',
    });
  });

  it('圖片（小圖）：數量次、可以重複；圖片（蓋滿）：一次；沒有圖片時 no-images', () => {
    const images = [url(1), url(2), url(3), url(4), url(5)];
    const r = upstreamMulberry32(99);
    const expected = Array.from({ length: 4 }, () => images[Math.floor(r() * 5)]);
    expect(drawResult(state({ kind: 'image-icon', count: 4, images }), 99)).toEqual({
      kind: 'image-icon',
      images: expected,
    });
    const r2 = upstreamMulberry32(99);
    expect(drawResult(state({ kind: 'image-full', images }), 99)).toEqual({
      kind: 'image-full',
      image: images[Math.floor(r2() * 5)],
    });
    expect(drawResult(state({ kind: 'image-icon', images: [] }), 1)).toEqual({
      kind: 'no-images',
    });
    expect(drawResult(state({ kind: 'image-full', images: [] }), 1)).toEqual({
      kind: 'no-images',
    });
  });

  it('同一個種子、同樣的設定一定是同一張', () => {
    const s = state({ kind: 'icons', count: 7 });
    expect(drawResult(s, 31337)).toEqual(drawResult(s, 31337));
    expect(drawResult(s, 31337)).not.toEqual(drawResult(s, 31338));
  });
});

describe('結果的位置（3.2）', () => {
  it('預設 350 × 180、3 個 48 px 圖示：一列置中、上下置中', () => {
    const boxes = flexItems(3, 48, { x: 0, y: 0, w: 350, h: 180 });
    expect(boxes).toEqual([
      { x: 77, y: 66, w: 48, h: 48 },
      { x: 151, y: 66, w: 48, h: 48 },
      { x: 225, y: 66, w: 48, h: 48 },
    ]);
  });

  it('放不下時換行；多的高度平均分給每一列', () => {
    /* 內容框 310 × 140：一列最多 5 個 30 px（5 × 46 + 4 × 10 = 270） */
    const boxes = flexItems(7, 30, { x: 0, y: 0, w: 350, h: 180 });
    const rows = [...new Set(boxes.map((b) => b.y))];
    expect(rows.length).toBe(2);
    /* 兩列總高 70，多 70，每列多 35 → 列高 65：第一列 y＝20 + (65 − 30) ÷ 2 */
    expect(rows[0]).toBeCloseTo(37.5);
    expect(rows[1]).toBeCloseTo(20 + 65 + 10 + 17.5);
    expect(boxes.slice(0, 5).map((b) => b.x)).toEqual([48, 104, 160, 216, 272]);
    /* 第二列 2 個置中：寬 2 × 46 + 10 = 102 → 左 20 + (310 − 102) ÷ 2 = 124 */
    expect(boxes.slice(5).map((b) => b.x)).toEqual([132, 188]);
  });

  it('列比內容框寬時兩邊一樣多超出；總高超過時從上緣往下排', () => {
    const [b] = flexItems(1, 300, { x: 10, y: 10, w: 200, h: 100 });
    /* 內容框 (30, 30, 160, 60)；一個寬 316 → 左 30 + (160 − 316) ÷ 2 = −48 → 圖 −40 */
    expect(b.x).toBe(-40);
    expect(b.y).toBe(30);
  });

  it('刮開區：進階關閉時整張卡；打開時和卡片的交集；空的時候整張卡', () => {
    const base = { width: 350, height: 180, zone: { x: 20, y: 20, w: 310, h: 140 } };
    expect(effectiveZone({ ...base, expert: false })).toEqual({ x: 0, y: 0, w: 350, h: 180 });
    expect(effectiveZone({ ...base, expert: true })).toEqual({ x: 20, y: 20, w: 310, h: 140 });
    expect(
      effectiveZone({ ...base, expert: true, zone: { x: 300, y: 100, w: 500, h: 500 } }),
    ).toEqual({ x: 300, y: 100, w: 50, h: 80 });
    expect(effectiveZone({ ...base, expert: true, zone: { x: 400, y: 0, w: 10, h: 10 } })).toEqual({
      x: 0,
      y: 0,
      w: 350,
      h: 180,
    });
  });

  it('個別塗層：往外擴 15，圓的半徑＝(邊長＋30) ÷ 2', () => {
    const items = [{ x: 77, y: 66, w: 48, h: 48 }];
    expect(coverPieces(items, 'circle')).toEqual([{ x: 62, y: 51, w: 78, h: 78, round: true }]);
    expect(coverPieces(items, 'rect')).toEqual([{ x: 62, y: 51, w: 78, h: 78, round: false }]);
  });

  it('圖示大小：數量 > 5 時 30', () => {
    expect(iconSize(5)).toBe(48);
    expect(iconSize(6)).toBe(30);
  });
});

describe('卡片', () => {
  it('進階設定關閉：白底、條紋、沒有標題、句子預設色、整區塗層、整片圖片圓角 12', () => {
    const s = state({
      expert: false,
      bgColor: '#ff0000',
      titleText: '標題',
      sentenceColor: '#00ff00',
      coverShape: 'circle',
      kind: 'sentence',
    });
    const card = buildCard(specOf(s));
    expect(card.background).toEqual({ color: '#ffffff', image: null, fit: 'cover' });
    expect(card.stripes).toBe(true);
    expect(card.title).toBeNull();
    expect(card.result).toMatchObject({ kind: 'sentence', color: '#1f2937', size: 28 });
    expect(card.cover.pieces).toEqual([]);
    const full = buildCard(specOf(state({ kind: 'image-full', images: [url(1)] })));
    expect(full.result).toMatchObject({ kind: 'full', radius: 12 });
  });

  it('進階設定打開：底色、標題、刮開區、個別塗層、句子顏色、整片圖片沒有圓角', () => {
    const s = state({
      expert: true,
      bgColor: '#ff0000',
      titleText: '酒館抽獎',
      titlePos: 'bl',
      coverShape: 'rect',
      kind: 'icons',
      count: 2,
    });
    const card = buildCard(specOf(s));
    expect(card.background.color).toBe('#ff0000');
    expect(card.stripes).toBe(false);
    expect(card.title).toEqual({ text: '酒館抽獎', color: '#1f2937', size: 18, pos: 'bl' });
    expect(card.zone).toEqual({ x: 20, y: 20, w: 310, h: 140 });
    expect(card.cover.pieces).toHaveLength(2);
    expect(card.cover.pieces[0].round).toBe(false);
    const full = buildCard(specOf(state({ expert: true, kind: 'image-full', images: [url(1)] })));
    expect(full.result).toMatchObject({ kind: 'full', radius: 0 });
  });

  it('個別塗層只在圖示與小圖片、有結果時作用', () => {
    const sentence = buildCard(
      specOf(state({ expert: true, coverShape: 'circle', kind: 'sentence' })),
    );
    expect(sentence.cover.pieces).toEqual([]);
    const empty = buildCard(
      specOf(state({ expert: true, coverShape: 'circle', kind: 'image-icon', images: [] })),
    );
    expect(empty.result).toEqual({ kind: 'empty', text: '還沒有圖片。' });
    expect(empty.cover.pieces).toEqual([]);
  });

  it('標題空白（或只有空白）時不畫', () => {
    expect(buildCard(specOf(state({ expert: true, titleText: '   ' }))).title).toBeNull();
  });

  it('用到的圖片：背景（進階）＋結果；小圖帶「去掉透明留白」', () => {
    const bg: ImageRef = { kind: 'asset', id: 'abc', name: 'bg.png', width: 10, height: 10 };
    const card = buildCard(
      specOf(
        state({
          expert: true,
          bgImage: bg,
          kind: 'image-icon',
          trim: true,
          count: 2,
          images: [url(1)],
        }),
      ),
    );
    expect(cardImages(card)).toEqual([
      { image: bg, trim: false, role: 'bg' },
      { image: url(1), trim: true, role: 'result' },
      { image: url(1), trim: true, role: 'result' },
    ]);
  });
});

describe('圖示', () => {
  it('8 個、各有名稱與顏色；SVG 是 24 × 24', () => {
    expect(ICON_COUNT).toBe(8);
    expect(SCRATCH_ICONS.map((i) => i.name)).toEqual([
      '寶石',
      '金幣',
      '皇冠',
      '禮物',
      '星星',
      '炸彈',
      '骰子',
      '愛心',
    ]);
    for (let i = 0; i < 8; i++) {
      expect(iconSvg(i)).toMatch(/^<svg viewBox="0 0 24 24"[^>]*aria-hidden="true"/);
      expect(SCRATCH_ICONS[i].color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
