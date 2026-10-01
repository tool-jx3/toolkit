/**
 * 立繪工作台（G3）的純計算模組：core/ruler、core/sheet、core/compose、core/layout。
 */
import { describe, expect, it } from 'vitest';
import { layerRect, moveItem, toggleOrdered } from '@/core/compose';
import {
  arrowDelta,
  boxGuides,
  boxToPercent,
  clampBoxPosition,
  clampSpan,
  clientToLocal,
  hitTest,
  percentToBox,
  resizeBox,
  scaleBoxAt,
} from '@/core/layout';
import { ceilTo, labelInterval, rulerTicks } from '@/core/ruler';
import { autoColumns, layoutSheet, wrapCaption } from '@/core/sheet';

describe('core/ruler', () => {
  it('0～210 每 10 一條；0 是地面、50 的倍數是主刻度', () => {
    const t = rulerTicks({ min: 0, max: 210, step: 10, majorEvery: 50, scale: 3, fontPx: 11 });
    expect(t).toHaveLength(22);
    expect(t[0]).toEqual({ value: 0, kind: 'zero', label: '0' });
    expect(t[5]).toMatchObject({ value: 50, kind: 'major' });
    expect(t[1]).toMatchObject({ value: 10, kind: 'minor' });
  });

  it('依間距抽稀數字：10 cm 不到 1.7 倍字高時改每 50、再不夠改每 100', () => {
    expect(labelInterval(2, { step: 10, fontPx: 11 })).toBe(10); /* 20 px ≥ 18.7 */
    expect(labelInterval(1.8, { step: 10, fontPx: 11 })).toBe(50);
    expect(labelInterval(0.3, { step: 10, fontPx: 11 })).toBe(100);
    const t = rulerTicks({ min: 0, max: 200, step: 10, scale: 1, fontPx: 11 });
    expect(t.filter((x) => x.label !== null).map((x) => x.value)).toEqual([0, 50, 100, 150, 200]);
  });

  it('floor：地面以下不畫；範圍不是 step 的倍數；沒有浮點誤差', () => {
    const t = rulerTicks({ min: -42, max: 23, step: 10, scale: 5, floor: 0 });
    expect(t.map((x) => x.value)).toEqual([0, 10, 20]);
    const u = rulerTicks({ min: 0, max: 0.31, step: 0.1, majorEvery: 0.5, scale: 1000 });
    expect(u.map((x) => x.value)).toEqual([0, 0.1, 0.2, 0.3]);
    expect(ceilTo(202.5, 10)).toBe(210);
    expect(ceilTo(190 * 1.06, 10)).toBe(210);
  });
});

describe('core/sheet（emotion-maker 規格 3.3 的量測）', () => {
  const measure = (s: string) => Array.from(s).length * 26;
  const one = (n: number) => Array.from({ length: n }, (_, i) => (i < 20 ? '開心' : ''));

  it('22 個、預設選項（文字 26 px、最多 1 行）→ 5 × 5、1584 × 1879、文字區 59', () => {
    const l = layoutSheet({
      count: 22,
      cellSize: 300,
      gap: 14,
      fontSize: 26,
      captions: one(22),
      measure,
    });
    expect([l.columns, l.rows, l.width, l.height, l.captionHeight]).toEqual([5, 5, 1584, 1879, 59]);
  });

  it('全域文字關閉 → 1584 × 1584', () => {
    const l = layoutSheet({ count: 22, cellSize: 300, gap: 14, fontSize: 26 });
    expect([l.width, l.height, l.captionHeight]).toEqual([1584, 1584, 0]);
  });

  it('欄數 5、格子 100、間距 0、文字 12 → 500 × 635（文字區 27）；欄數 50 → 22 × 1、2200 × 127', () => {
    const m = (s: string) => Array.from(s).length * 12;
    const a = layoutSheet({
      count: 22,
      columns: 5,
      cellSize: 100,
      gap: 0,
      fontSize: 12,
      captions: one(22),
      measure: m,
    });
    expect([a.width, a.height, a.captionHeight]).toEqual([500, 635, 27]);
    const b = layoutSheet({
      count: 22,
      columns: 50,
      cellSize: 100,
      gap: 0,
      fontSize: 12,
      captions: one(22),
      measure: m,
    });
    expect([b.columns, b.rows, b.width, b.height]).toEqual([22, 1, 2200, 127]);
  });

  it('4 個、欄數 2；30 字換成 3 行、「第一行＋空白行＋第三行」也是 3 行 → 642 × 892（文字區 125）', () => {
    const caps = [
      '一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十',
      '甲\n\n丙',
      '好',
      '',
    ];
    const l = layoutSheet({
      count: 4,
      columns: 2,
      cellSize: 300,
      gap: 14,
      fontSize: 26,
      captions: caps,
      measure,
    });
    expect(l.cells[0].lines).toHaveLength(3);
    expect(l.cells[1].lines).toEqual(['甲', '', '丙']);
    expect([l.width, l.height, l.captionHeight]).toEqual([642, 892, 125]);
    expect(l.cells[0].image).toEqual({ x: 14, y: 14, width: 300, height: 300 });
    expect(l.cells[3].image).toEqual({ x: 328, y: 453, width: 300, height: 300 });
  });

  it('自動欄數 ⌈√n⌉；逐字換行（不避頭尾、英文也逐字）', () => {
    expect([1, 2, 4, 5, 22].map(autoColumns)).toEqual([1, 2, 2, 3, 5]);
    expect(wrapCaption('abcdef', 30, (s) => s.length * 10)).toEqual(['abc', 'def']);
    expect(wrapCaption('好。。', 20, (s) => Array.from(s).length * 10)).toEqual(['好。', '。']);
    expect(wrapCaption('', 20, (s) => s.length)).toEqual(['']);
  });
});

describe('core/compose', () => {
  it('layerRect：等比置中、填滿、拉伸', () => {
    const dst = { x: 0, y: 0, width: 300, height: 300 };
    expect(layerRect({ width: 200, height: 400 }, dst, 'contain')).toEqual({
      x: 75,
      y: 0,
      width: 150,
      height: 300,
    });
    expect(layerRect({ width: 200, height: 400 }, dst, 'stretch')).toEqual(dst);
    expect(layerRect({ width: 200, height: 400 }, dst, 'cover')).toEqual({
      x: 0,
      y: -150,
      width: 300,
      height: 600,
    });
  });

  it('toggleOrdered：新加入的在最上層、再點一次移除；moveItem：往下落在目標後、往上落在目標前', () => {
    expect(toggleOrdered(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
    expect(toggleOrdered(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });
});

describe('core/layout', () => {
  const b = { x: 10, y: 20, width: 30, height: 40 };

  it('resizeBox：右下角控點左上角不動、夾在大小範圍內；左上角控點右下角不動', () => {
    expect(
      resizeBox(b, 'se', 100, -100, { minWidth: 8, minHeight: 6, maxWidth: 80, maxHeight: 80 }),
    ).toEqual({
      x: 10,
      y: 20,
      width: 80,
      height: 6,
    });
    expect(resizeBox(b, 'nw', 5, 5)).toEqual({ x: 15, y: 25, width: 25, height: 35 });
    expect(resizeBox(b, 'se', 30, 0, { keepAspect: true })).toEqual({
      x: 10,
      y: 20,
      width: 60,
      height: 80,
    });
  });

  it('clampBoxPosition：左上角或中心點夾在範圍內', () => {
    expect(clampBoxPosition(b, { minX: -10, maxX: 110 - b.width, minY: 0, maxY: 10 })).toEqual({
      ...b,
      y: 10,
    });
    expect(clampBoxPosition(b, { maxX: 20 }, 'center')).toEqual({ ...b, x: 5 });
  });

  it('參考線：中心十字、四邊、與上下左右的距離', () => {
    expect(boxGuides(b, { x: 0, y: 0, width: 100, height: 100 })).toEqual({
      center: { x: 50, y: 50 },
      edges: { left: 10, right: 40, top: 20, bottom: 60 },
      distance: { left: 10, right: 60, top: 20, bottom: 40 },
    });
  });

  it('百分比換算、指標座標換算（元素被縮放也正確）、方向鍵、縮放、點選測試、水平夾住', () => {
    const frame = { x: 31, y: 31, width: 962, height: 962 };
    const p = { x: 78, y: 8, width: 11, height: 48 };
    const back = boxToPercent(percentToBox(p, frame), frame);
    expect(back.x).toBeCloseTo(78);
    expect(back.height).toBeCloseTo(48);
    expect(
      clientToLocal(
        150,
        60,
        { left: 100, top: 50, width: 256, height: 256 },
        { width: 1024, height: 1024 },
      ),
    ).toEqual({
      x: 200,
      y: 40,
    });
    expect(arrowDelta('ArrowUp', 2)).toEqual({ dx: 0, dy: -2 });
    expect(arrowDelta('a', 2)).toBeNull();
    expect(scaleBoxAt({ x: 0, y: 0, width: 10, height: 10 }, 2)).toEqual({
      x: -5,
      y: -5,
      width: 20,
      height: 20,
    });
    const items = [
      { id: 'back', box: { x: 0, y: 0, width: 50, height: 50 } },
      { id: 'front', box: { x: 25, y: 25, width: 50, height: 50 } },
      { id: 'hidden', box: { x: 0, y: 0, width: 100, height: 100 }, hidden: true },
    ];
    expect(hitTest(items, 30, 30)?.id).toBe('front');
    expect(hitTest(items, 10, 10)?.id).toBe('back');
    expect(hitTest(items, 90, 10)).toBeNull();
    expect(clampSpan(-5, 40, 100)).toBe(0);
    expect(clampSpan(90, 40, 100)).toBe(60);
    expect(clampSpan(30, 120, 100)).toBe(0);
  });
});
