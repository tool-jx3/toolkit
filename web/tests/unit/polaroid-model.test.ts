/**
 * 拍立得相框產生器（polaroid）的純計算（規格 docs/refactor/specs/polaroid.md）：
 * - 相框尺寸與輸出尺寸（3.1）、照片範圍、文字白邊；
 * - 照片鋪滿、放大不改位移、拖曳取景的夾值、滾輪倍率（F08～F11）；
 * - 文字自動縮小（F19）、40 字（以字元計）；
 * - 筆畫的壓力與線寬（F24）、點夾回相框（F26）；
 * - 貼紙的初始大小與位置、白邊寬度、中心夾在相框內（F34、F35、F37）；
 * - 讀檔時的整理（3.4）。
 */
import { describe, expect, it } from 'vitest';
import {
  captionArea,
  cardSize,
  clampStickerCenter,
  clampToCard,
  clampView,
  clipCaption,
  coverSize,
  exportSize,
  fitCaptionSize,
  initialState,
  layerNumber,
  listToDraw,
  moveItem,
  nextStickerId,
  normalizeState,
  normalizeStroke,
  panView,
  photoArea,
  photoDrawRect,
  photoHeight,
  pointerPressure,
  stickerBaseSize,
  stickerOutline,
  stickerStart,
  strokeWidth,
  wheelZoom,
  zoomView,
} from '@/tools/polaroid/model';

const PHOTO = { width: 400, height: 300 };

describe('相框尺寸（3.1）', () => {
  it('三種尺寸的相框與輸出', () => {
    expect(cardSize('square')).toEqual({ width: 688, height: 844 });
    expect(cardSize('landscape')).toEqual({ width: 688, height: 689 });
    expect(cardSize('portrait').width).toBe(688);
    expect(cardSize('portrait').height).toBeCloseTo(1050.667, 3);
    expect(exportSize('square')).toEqual({ width: 2064, height: 2532 });
    expect(exportSize('landscape')).toEqual({ width: 2064, height: 2067 });
    expect(exportSize('portrait')).toEqual({ width: 2064, height: 3152 });
    expect(exportSize('square', 2)).toEqual({ width: 1376, height: 1688 });
  });

  it('照片範圍與文字白邊', () => {
    expect(photoArea('square')).toEqual({ x: 34, y: 34, width: 620, height: 620 });
    expect(photoArea('landscape')).toEqual({ x: 34, y: 34, width: 620, height: 465 });
    expect(photoHeight('portrait')).toBeCloseTo(826.667, 3);
    expect(captionArea('square')).toEqual({ x: 0, y: 654, width: 688, height: 190 });
    expect(captionArea('landscape')).toEqual({ x: 0, y: 499, width: 688, height: 190 });
  });
});

describe('照片（F08～F11）', () => {
  const area = photoArea('square');

  it('鋪滿：取兩個比值中較大的 × 放大倍率，置中', () => {
    const c = coverSize(area, PHOTO, 1);
    expect(c.width).toBeCloseTo(826.667, 3);
    expect(c.height).toBeCloseTo(620, 9);
    const r = photoDrawRect(area, PHOTO, { zoom: 1, ox: 0, oy: 0 });
    expect(r.x).toBeCloseTo(-69.333, 3);
    expect(r.y).toBeCloseTo(34, 6);
    expect(r.width).toBeCloseTo(826.667, 3);
    expect(r.height).toBeCloseTo(620, 6);
  });

  it('位移夾在蓋滿的範圍內', () => {
    const a = clampView(area, PHOTO, { zoom: 1, ox: 500, oy: 50 });
    expect(a.zoom).toBe(1);
    expect(a.ox).toBeCloseTo(103.333, 3);
    expect(a.oy).toBeCloseTo(0, 9);
    const b = clampView(area, PHOTO, { zoom: 2, ox: -9999, oy: 9999 });
    expect(b.ox).toBeCloseTo(-516.667, 3);
    expect(b.oy).toBeCloseTo(310, 9);
    /* 倍率夾在 1～4；沒有照片時位移歸零 */
    expect(clampView(area, PHOTO, { zoom: 9, ox: 0, oy: 0 }).zoom).toBe(4);
    expect(clampView(area, PHOTO, { zoom: 0.2, ox: 0, oy: 0 }).zoom).toBe(1);
    expect(clampView(area, null, { zoom: 2, ox: 30, oy: 30 })).toEqual({ zoom: 2, ox: 0, oy: 0 });
  });

  it('放大時位移不變，再夾值（不是以畫面中央為準）', () => {
    const v = zoomView(area, PHOTO, { zoom: 2, ox: 200, oy: -100 }, 3);
    expect(v).toEqual({ zoom: 3, ox: 200, oy: -100 });
    /* 縮小回 1：夾成 ±103.33／0（永久） */
    const back = zoomView(area, PHOTO, v, 1);
    expect(back.ox).toBeCloseTo(103.333, 3);
    expect(back.oy).toBeCloseTo(0, 9);
    expect(zoomView(area, PHOTO, back, 3).ox).toBeCloseTo(103.333, 3);
  });

  it('拖曳取景：從按下時的位移加上移動量', () => {
    const start = { zoom: 2, ox: 10, oy: 10 };
    expect(panView(area, PHOTO, start, 50, -20)).toEqual({ zoom: 2, ox: 60, oy: -10 });
    expect(panView(area, PHOTO, start, 9999, 0).ox).toBeCloseTo(516.667, 3);
  });

  it('滾輪：倍率 × e^(−deltaY × 0.0015)，夾在 1～4', () => {
    expect(wheelZoom(2, -100)).toBeCloseTo(2 * Math.exp(0.15), 10);
    expect(wheelZoom(2, 100)).toBeCloseTo(2 * Math.exp(-0.15), 10);
    expect(wheelZoom(1, 100)).toBe(1);
    expect(wheelZoom(3.9, -1000)).toBe(4);
  });
});

describe('文字（F14、F19）', () => {
  it('放得下就用設定的字級；放不下每次減 1，最小 10', () => {
    const width = (k: number) => (size: number) => size * k;
    expect(fitCaptionSize(width(10), 40, 628)).toBe(40);
    expect(fitCaptionSize(width(20), 40, 628)).toBe(31);
    expect(fitCaptionSize(width(1000), 40, 628)).toBe(10);
    expect(fitCaptionSize(width(1000), 8, 628)).toBe(8);
  });

  it('最多 40 字（emoji 算一個）', () => {
    expect(Array.from(clipCaption('😀'.repeat(45)))).toHaveLength(40);
    expect(clipCaption('拍立得')).toBe('拍立得');
  });
});

describe('筆畫（F24、F26）', () => {
  it('壓力：滑鼠 0.55、手指 0.6、觸控筆＝筆壓（0 時 0.5）', () => {
    expect(pointerPressure('mouse', 0.5)).toBe(0.55);
    expect(pointerPressure('touch', 1)).toBe(0.6);
    expect(pointerPressure('pen', 0.8)).toBe(0.8);
    expect(pointerPressure('pen', 0)).toBe(0.5);
  });

  it('線寬＝粗細 ×（0.55 ＋ 壓力 × 0.9）', () => {
    expect(strokeWidth(14, 0.55)).toBeCloseTo(14.63, 10);
    expect(strokeWidth(10, 1)).toBeCloseTo(14.5, 10);
    expect(strokeWidth(10, 0)).toBeCloseTo(5.5, 10);
    expect(strokeWidth(10, 5)).toBeCloseTo(14.5, 10);
  });

  it('點夾回相框', () => {
    expect(clampToCard({ x: -5, y: 900 }, cardSize('square'))).toEqual({ x: 0, y: 844 });
    expect(clampToCard({ x: 700, y: 10 }, cardSize('landscape'))).toEqual({ x: 688, y: 10 });
  });
});

describe('貼紙（F34、F35、F37）', () => {
  it('新貼紙等比縮到放得進 180 × 180，小圖不放大', () => {
    expect(stickerBaseSize({ width: 600, height: 300 })).toEqual({ width: 180, height: 90 });
    expect(stickerBaseSize({ width: 100, height: 400 })).toEqual({ width: 45, height: 180 });
    expect(stickerBaseSize({ width: 120, height: 80 })).toEqual({ width: 120, height: 80 });
  });

  it('新貼紙的中心：相框寬的一半、相框高 − 104.5', () => {
    expect(stickerStart('square')).toEqual({ x: 344, y: 739.5 });
    expect(stickerStart('landscape')).toEqual({ x: 344, y: 584.5 });
  });

  it('白邊：寬高較小者 × 0.07，夾在 5～10', () => {
    expect(stickerOutline({ width: 120, height: 80 })).toBeCloseTo(5.6, 10);
    expect(stickerOutline({ width: 50, height: 50 })).toBe(5);
    expect(stickerOutline({ width: 300, height: 200 })).toBe(10);
  });

  it('中心夾在相框內', () => {
    const s = { cx: -40, cy: 900 };
    expect(clampStickerCenter(s, cardSize('square'))).toEqual({ cx: 0, cy: 844 });
    const inside = { cx: 10, cy: 10 };
    expect(clampStickerCenter(inside, cardSize('square'))).toBe(inside);
  });

  it('id、順序', () => {
    expect(nextStickerId([{ id: 's1' }, { id: 's7' }, { id: 'x' }])).toBe('s8');
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, 9)).toEqual(['a', 'b', 'c']);
    expect(listToDraw(3, 0)).toBe(2);
  });
});

describe('圖層', () => {
  it('名稱依位置（圖層 1 在最下面）', () => {
    const layers = initialState().layers;
    expect(layerNumber(layers, 'l1')).toBe(1);
    expect(layerNumber([layers[2], layers[0], layers[1]], 'l1')).toBe(2);
  });
});

describe('讀檔時的整理（3.4）', () => {
  it('壞掉、缺欄位的資料回到預設', () => {
    expect(normalizeState(null)).toEqual(initialState());
    expect(normalizeState({ aspect: 'huge', cardBg: 'red', caption: { size: 'x' } })).toEqual(
      initialState(),
    );
  });

  it('數值夾值、顏色、文字截斷、位移夾回', () => {
    const d = normalizeState({
      aspect: 'landscape',
      photo: { id: 'aphoto', name: 'a.png', width: 400, height: 300 },
      view: { zoom: 9, ox: 9999, oy: -9999 },
      cardBg: '#ABC',
      caption: { text: 'x'.repeat(60), font: 'cursive', color: '#FF000080', size: 900 },
    });
    expect(d.aspect).toBe('landscape');
    expect(d.view.zoom).toBe(4);
    expect(d.view.ox).toBeCloseTo(930, 3);
    expect(d.view.oy).toBeCloseTo(-697.5, 3);
    expect(d.cardBg).toBe('#aabbcc');
    expect(d.caption).toEqual({
      text: 'x'.repeat(40),
      font: 'cursive',
      color: '#ff0000',
      size: 400,
    });
  });

  it('筆畫：壞的丟掉、點四捨五入到 0.1、壓力夾在 0～1', () => {
    expect(normalizeStroke({ points: [1, 'a'] })).toBeNull();
    expect(normalizeStroke({ points: [] })).toBeNull();
    expect(
      normalizeStroke({
        color: '#000',
        size: 10,
        pressure: 3,
        eraser: 1,
        points: [1.234, 5.678, 9],
      }),
    ).toEqual({ color: '#000000', size: 10, pressure: 1, eraser: false, points: [1.2, 5.7] });
  });

  it('圖層一律三個；id 重複時重編；多的丟掉', () => {
    const d = normalizeState({
      layers: [
        { id: 'l2', visible: false, strokes: [{ points: [1, 2], color: '#ffffff' }] },
        { id: 'l2', strokes: 'bad' },
      ],
    });
    expect(d.layers.map((l) => l.id)).toEqual(['l2', 'l1', 'l3']);
    expect(d.layers[0].visible).toBe(false);
    expect(d.layers[0].strokes).toHaveLength(1);
    const many = normalizeState({ layers: [{}, {}, {}, {}, {}] });
    expect(many.layers.map((l) => l.id)).toEqual(['l1', 'l2', 'l3']);
  });

  it('貼紙：壞的丟掉、最多 5 張、中心夾回相框、角度正規化', () => {
    const one = { asset: 'aimg', name: 'a.png', cx: 9999, cy: 10, width: 100, height: 50 };
    const d = normalizeState({
      stickers: [
        { ...one, id: 's1', rotation: 270 },
        { ...one, asset: '../bad' },
        { ...one, width: -1 },
        ...Array.from({ length: 6 }, () => one),
      ],
    });
    expect(d.stickers).toHaveLength(5);
    expect(d.stickers[0]).toMatchObject({ id: 's1', cx: 688, cy: 10, rotation: -90 });
    expect(new Set(d.stickers.map((s) => s.id)).size).toBe(5);
  });
});
