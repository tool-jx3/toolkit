/**
 * 魔法脈繪製工具的幾何（規格 3.2～3.4）：格點與格子的吸附、交點、塗色可以吸附的點、移動／反轉／旋轉。
 */
import { describe, expect, it } from 'vitest';
import {
  cellAt,
  damageEdges,
  fitInside,
  intersect,
  mirrorPoints,
  nearestPoint,
  rotatePoints,
  type Segment,
  shiftCells,
  shiftPoints,
  snapGrid,
  snapPoints,
} from '@/tools/floria-veins/model/geometry';
import { labelOf, type Pt, UNIT } from '@/tools/floria-veins/model/types';

const U = UNIT;
const P = (x: number, y: number): Pt => [x * U, y * U];
const seg = (x1: number, y1: number, x2: number, y2: number): Segment => [P(x1, y1), P(x2, y2)];
const empty = (size: number) => ({ size, lines: [], damage: [] as [number, number][] });

describe('吸附', () => {
  it('格點：四捨五入到最近的格點，超出畫布時夾在邊上（單位 1200）', () => {
    expect(snapGrid(2.4, 3.6, 11)).toEqual([2 * U, 4 * U]);
    expect(snapGrid(2.5, 0.5, 11)).toEqual([3 * U, 1 * U]);
    expect(snapGrid(-0.4, 11.4, 11)).toEqual([0, 11 * U]);
    expect(snapGrid(-3, 20, 6)).toEqual([0, 6 * U]);
  });

  it('格子：無條件捨去；畫布外是 null', () => {
    expect(cellAt(0.01, 10.99, 11)).toEqual([0, 10]);
    expect(cellAt(11, 3, 11)).toBeNull();
    expect(cellAt(-0.01, 3, 11)).toBeNull();
    expect(cellAt(5.99, 5.99, 6)).toEqual([5, 5]);
    expect(cellAt(6, 0, 6)).toBeNull();
  });

  it('座標：大於 6 格時標 2 起（2d6），否則 1 起', () => {
    expect([0, 10].map((i) => labelOf(11, i))).toEqual([2, 12]);
    expect([0, 5].map((i) => labelOf(6, i))).toEqual([1, 6]);
  });
});

describe('交點', () => {
  it('交叉、端點相碰都算；四捨五入到整數單位', () => {
    expect(intersect(seg(0, 0, 11, 11), seg(0, 11, 11, 0))).toEqual([5.5 * U, 5.5 * U]);
    expect(intersect(seg(0, 0, 2, 2), seg(2, 2, 5, 0))).toEqual(P(2, 2));
    expect(intersect(seg(0, 0, 3, 1), seg(0, 1, 3, 0))).toEqual([1800, 600]);
    /* 非整數：2400·(1/3) → 四捨五入 */
    expect(intersect(seg(0, 0, 3, 3), seg(0, 2, 2, 0))).toEqual(P(1, 1));
    /* x＝70/29 格 */
    expect(intersect([P(0, 0), P(7, 3)], [P(0, 2), P(5, 0)])).toEqual([2897, 1241]);
  });

  it('平行、在同一直線上重疊、沒碰到時沒有交點', () => {
    expect(intersect(seg(0, 0, 4, 0), seg(0, 1, 4, 1))).toBeNull();
    expect(intersect(seg(0, 0, 4, 0), seg(2, 0, 6, 0))).toBeNull();
    expect(intersect(seg(0, 0, 2, 0), seg(2, 0, 4, 0))).toBeNull();
    expect(intersect(seg(0, 0, 1, 1), seg(3, 0, 2, 1))).toBeNull();
  });

  it('空白的畫布：四個角（四邊與對角線的交點）', () => {
    expect(snapPoints(empty(11))).toEqual([P(0, 0), P(11, 0), P(0, 11), P(11, 11)]);
  });

  it('畫上去的線與四邊、對角線的交點；不重複，依 y、x 排', () => {
    const c = {
      size: 11,
      lines: [{ a: P(0, 11), b: P(11, 0), color: '#0000ff' }],
      damage: [] as [number, number][],
    };
    expect(snapPoints(c)).toEqual([P(0, 0), P(11, 0), [5.5 * U, 5.5 * U], P(0, 11), P(11, 11)]);
  });

  it('傷害格的邊也是線（原作的看不見的線）：格子的角與邊上的交點都可以吸附', () => {
    const pts = snapPoints({ size: 11, lines: [], damage: [[4, 4]] });
    /* 格子 (4,4) 的四個角，加上對角線穿過的 (4,4)、(5,5)（已經是角） */
    for (const p of [P(4, 4), P(5, 4), P(5, 5), P(4, 5)]) expect(pts).toContainEqual(p);
    expect(pts).toHaveLength(8);
    /* 相鄰的格子共用的邊只算一次 */
    expect(
      damageEdges([
        [1, 1],
        [2, 1],
      ]),
    ).toHaveLength(7);
  });

  it('最近的點：距離相同取排在前面的', () => {
    const pts: Pt[] = [P(0, 0), P(2, 0), P(1, 3)];
    expect(nearestPoint(pts, 1.2 * U, 0)).toEqual(P(2, 0));
    expect(nearestPoint(pts, 1 * U, 0)).toEqual(P(0, 0));
    expect(nearestPoint([], 0, 0)).toBeNull();
  });
});

describe('移動、反轉、旋轉（以格為單位，和原作相同）', () => {
  it('移動：有任何一點超出畫布就不動', () => {
    expect(shiftPoints([P(1, 1), P(3, 2)], 1, -1, 11)).toEqual([P(2, 0), P(4, 1)]);
    expect(shiftPoints([P(1, 0), P(3, 2)], 0, -1, 11)).toBeNull();
    expect(shiftPoints([P(11, 4)], 1, 0, 11)).toBeNull();
    expect(shiftCells([[0, 5]], -1, 0, 6)).toBeNull();
    expect(shiftCells([[4, 5]], 1, 0, 6)).toEqual([[5, 5]]);
    expect(shiftCells([[5, 5]], 1, 0, 6)).toBeNull();
  });

  it('左右反轉：翻過去之後左緣不變', () => {
    expect(mirrorPoints([P(1, 1), P(4, 2)], 11)).toEqual([P(4, 1), P(1, 2)]);
    expect(mirrorPoints([P(0, 0), P(11, 3)], 11)).toEqual([P(11, 0), P(0, 3)]);
  });

  it('旋轉：順時針 90°，外框的中心移回原處（往 0 取整、夾在畫布裡）', () => {
    /* 原作：(x, y) → (格數 − y, x)；dx = trunc(中心差) */
    expect(rotatePoints([P(1, 1), P(4, 1)], 11)).toEqual([P(3, 0), P(3, 3)]);
    expect(rotatePoints([P(2, 2), P(4, 2), P(4, 3)], 11)).toEqual([P(4, 2), P(4, 4), P(3, 4)]);
    /* 轉四次回到原處（對稱的正方形） */
    let sq: Pt[] = [P(2, 2), P(5, 2), P(5, 5), P(2, 5)];
    for (let i = 0; i < 4; i++) sq = rotatePoints(sq, 11);
    expect(new Set(sq.map(String))).toEqual(
      new Set([P(2, 2), P(5, 2), P(5, 5), P(2, 5)].map(String)),
    );
    /* 貼著邊的長線：夾在畫布裡 */
    const r = rotatePoints([P(0, 0), P(11, 0)], 11);
    expect(r).toEqual([P(6, 0), P(6, 11)]);
  });

  it('移進畫布：最小的位移；比畫布大時 null', () => {
    expect(fitInside([P(9, 2), P(14, 3)], 11)).toEqual([P(6, 2), P(11, 3)]);
    expect(fitInside([P(0, 0), P(3, 3)], 6)).toEqual([P(0, 0), P(3, 3)]);
    expect(fitInside([P(0, 0), P(8, 0)], 6)).toBeNull();
  });
});
