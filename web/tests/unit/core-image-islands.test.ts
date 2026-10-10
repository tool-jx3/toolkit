/**
 * core/image 的孤島（islands.ts）：遮罩裡「夠不透明」的像素以八連通分塊；只留要的塊與連到它們的淡邊。
 * - 去掉孤島：留比最大一塊的某個比例大的塊（兩個角色、分開的道具留得住）；
 * - 淡霧（低於連通門檻的值）不會把碎塊連在一起；
 * - 塊裡有沒有「種子」像素（AI＋背景色：只加回和 AI 認定的角色相連的部分）。
 */
import { describe, expect, it } from 'vitest';
import { keepPieces, maskPieces, piecesTouching, removeIslands } from '@/core/image';

/** 用字元畫遮罩：'#'＝255、'+'＝200、'.'＝0、'~'＝3（淡霧）、'o'＝100（淡邊） */
function draw(rows: string[]) {
  const h = rows.length;
  const w = rows[0].length;
  const m = new Uint8Array(w * h);
  const v: Record<string, number> = { '#': 255, '+': 200, '.': 0, '~': 3, o: 100 };
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) m[y * w + x] = v[row[x]];
  });
  return { m, w, h };
}

const show = (m: Uint8Array, w: number) => {
  const rows: string[] = [];
  for (let y = 0; y < m.length / w; y++) {
    let s = '';
    for (let x = 0; x < w; x++) {
      const v = m[y * w + x];
      s +=
        v === 255 ? '#' : v === 200 ? '+' : v === 0 ? '.' : v === 3 ? '~' : v === 100 ? 'o' : '?';
    }
    rows.push(s);
  }
  return rows;
};

describe('core/image：分塊', () => {
  it('≥ 門檻的像素以八連通分塊（斜的也算相連），每塊的像素數', () => {
    const { m, w, h } = draw([
      '##....', //
      '##..#.',
      '...#..',
      '......',
      '+....#',
    ]);
    const p = maskPieces(m, w, h, 128);
    expect(p.count).toBe(4);
    expect([...p.sizes].sort((a, b) => a - b)).toEqual([1, 1, 2, 4]);
    /* 門檻 > 200：左下的 + 不算 */
    expect(maskPieces(m, w, h, 201).count).toBe(3);
  });

  it('塊裡有沒有種子像素', () => {
    const { m, w, h } = draw([
      '##....', //
      '##..#.',
      '....#.',
    ]);
    const p = maskPieces(m, w, h, 128);
    const seed = new Uint8Array(w * h);
    seed[1 * w + 4] = 1;
    const hit = piecesTouching(p, seed);
    const sizes = [...p.sizes];
    expect(hit[sizes.indexOf(2)]).toBe(1);
    expect(hit[sizes.indexOf(4)]).toBe(0);
  });

  it('只留要的塊：塊裡照原值；連到它的淡邊（經過淡像素）照原值；其餘一律 0', () => {
    const { m, w, h } = draw([
      'o##o....', //
      'o##o..#o',
      '.oo...o.',
    ]);
    const p = maskPieces(m, w, h, 128);
    const keep = new Uint8Array(p.count);
    keep[[...p.sizes].indexOf(4)] = 1;
    expect(show(keepPieces(m, w, h, p, keep), w)).toEqual([
      'o##o....', //
      'o##o....',
      '.oo.....',
    ]);
  });
});

describe('core/image：去掉孤島', () => {
  it('留比最大一塊的 minRatio 倍大的塊；小的變 0', () => {
    const rows = [
      '##########..........', //
      '##########......###.',
      '##########......###.',
      '##########..........',
      '##########.#........',
    ];
    const { m, w, h } = draw(rows);
    /* 最大 50、右邊 6、小點 1 */
    expect(show(removeIslands(m, w, h, { minRatio: 0.15 }), w)).toEqual([
      '##########..........',
      '##########..........',
      '##########..........',
      '##########..........',
      '##########..........',
    ]);
    const keep6 = show(removeIslands(m, w, h, { minRatio: 0.1 }), w);
    expect(keep6[1]).toBe('##########......###.');
    expect(keep6[4]).toBe('##########..........');
    const keepAll = show(removeIslands(m, w, h, { minRatio: 0.02 }), w);
    expect(keepAll).toEqual(rows);
    /* 0：塊都留著 */
    expect(show(removeIslands(m, w, h, { minRatio: 0 }), w)).toEqual(rows);
  });

  it('淡霧（低於門檻）不會把碎塊連在一起：碎塊照樣去掉，連到大塊的淡霧留著', () => {
    const { m, w, h } = draw([
      '#####~~~~~##', //
      '#####.....##',
      '#####.......',
    ]);
    const out = removeIslands(m, w, h, { minRatio: 0.5 });
    expect(show(out, w)).toEqual([
      '#####~~~~~..', //
      '#####.......',
      '#####.......',
    ]);
  });

  it('沒有連到任何保留的塊的淡像素也去掉；整片都淡（沒有塊）時全部 0', () => {
    const { m, w, h } = draw([
      '###..oo', //
      '###..oo',
    ]);
    expect(show(removeIslands(m, w, h, { minRatio: 0 }), w)).toEqual(['###....', '###....']);
    const faint = draw(['oo~', '~oo']);
    expect(Array.from(removeIslands(faint.m, faint.w, faint.h, { minRatio: 0 }))).toEqual([
      0, 0, 0, 0, 0, 0,
    ]);
  });

  it('門檻可以改；回傳新的遮罩（原本的不動）', () => {
    const { m, w, h } = draw([
      '###.+', //
      '###..',
    ]);
    const copy = Uint8Array.from(m);
    expect(show(removeIslands(m, w, h, { minRatio: 0.5, threshold: 128 }), w)).toEqual([
      '###..',
      '###..',
    ]);
    expect(show(removeIslands(m, w, h, { minRatio: 0.5, threshold: 250 }), w)).toEqual([
      '###..',
      '###..',
    ]);
    expect(m).toEqual(copy);
  });

  it('大圖（2000 × 2000）不會遞迴溢位，結果正確', () => {
    const w = 2000;
    const h = 2000;
    const m = new Uint8Array(w * h);
    /* 一條蛇形的大塊＋很多小點 */
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x++) m[y * w + x] = 255;
      const x = (y / 4) % 2 ? 0 : w - 1;
      for (let k = 1; k < 4 && y + k < h; k++) m[(y + k) * w + x] = 255;
    }
    for (let y = 2; y < h; y += 4) for (let x = 5; x < w - 5; x += 7) m[y * w + x] = 255;
    const p = maskPieces(m, w, h, 128);
    expect(p.sizes.reduce((a, b) => Math.max(a, b), 0)).toBeGreaterThan(w * 400);
    const out = removeIslands(m, w, h, { minRatio: 0.01 });
    expect(out[2 * w + 5]).toBe(0);
    expect(out[0]).toBe(255);
    expect(out[(h - 4) * w + 10]).toBe(255);
  });
});
