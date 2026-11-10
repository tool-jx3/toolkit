/**
 * 魔法脈繪製工具的草稿與畫布的操作（規格 3.3、3.5）：點一下、完成一筆、退一點、決定、刪除、會刪掉的東西。
 */
import { describe, expect, it } from 'vitest';
import { addFill, addLines, newCanvas } from '@/tools/floria-veins/model/canvas';
import {
  addCell,
  canShift,
  canTurn,
  clickPoint,
  commitDraft,
  doomedBy,
  emptyDraft,
  isReady,
  mirrorDraft,
  pendingFigures,
  rotateDraft,
  shiftDraft,
  stepBack,
} from '@/tools/floria-veins/model/draft';
import type { Segment } from '@/tools/floria-veins/model/geometry';
import type { Draft, Kind, Pt, VeinCanvas } from '@/tools/floria-veins/model/types';
import { UNIT } from '@/tools/floria-veins/model/types';

const U = UNIT;
const P = (x: number, y: number): Pt => [x * U, y * U];
const seg = (x1: number, y1: number, x2: number, y2: number): Segment => [P(x1, y1), P(x2, y2)];

/** 依序點下去（不作用的點略過，和畫面上相同） */
function clicks(d: Draft, pts: Pt[]): Draft {
  return pts.reduce((acc, p) => clickPoint(acc, p) ?? acc, d);
}
const draft = (kind: Kind, erase = false) => emptyDraft('c', kind, erase);
const canvas = (): VeinCanvas => newCanvas('c', 'PC', 11);

describe('直線', () => {
  it('兩點一條；可以連續畫好幾條；第二點和第一點相同時不作用', () => {
    let d = clicks(draft('line'), [P(1, 1)]);
    expect(clickPoint(d, P(1, 1))).toBeNull();
    d = clicks(d, [P(4, 2), P(2, 2), P(2, 5)]);
    expect(d.figures).toEqual([
      { pts: [P(1, 1), P(4, 2)], closed: false },
      { pts: [P(2, 2), P(2, 5)], closed: false },
    ]);
    expect(d.current).toEqual([]);
    expect(isReady(d)).toBe(true);
    /* 開始第三條（只點了一點）時不能決定 */
    expect(isReady(clicks(d, [P(0, 0)]))).toBe(false);
  });
});

describe('多角形', () => {
  it('點回起點（3 點以上）＝封閉', () => {
    const d = clicks(draft('shape'), [P(1, 1), P(5, 1), P(3, 4), P(1, 1)]);
    expect(d.figures).toEqual([{ pts: [P(1, 1), P(5, 1), P(3, 4)], closed: true }]);
    expect(pendingFigures(d)).toHaveLength(1);
  });

  it('再點一次最後一點（2 點以上）＝到此為止的折線', () => {
    const d = clicks(draft('shape'), [P(1, 1), P(5, 1), P(5, 1)]);
    expect(d.figures).toEqual([{ pts: [P(1, 1), P(5, 1)], closed: false }]);
  });

  it('1 點時再點同一點、2 點時點回起點不作用（不畫重疊的線）', () => {
    const one = clicks(draft('shape'), [P(1, 1)]);
    expect(clickPoint(one, P(1, 1))).toBeNull();
    const two = clicks(one, [P(3, 1)]);
    expect(clickPoint(two, P(1, 1))).toBeNull();
  });

  it('畫到一半也可以決定（2 點以上當成折線）；1 點時不行', () => {
    const d = clicks(draft('shape'), [P(1, 1), P(5, 1), P(3, 4)]);
    expect(isReady(d)).toBe(true);
    expect(pendingFigures(d)).toEqual([{ pts: [P(1, 1), P(5, 1), P(3, 4)], closed: false }]);
    expect(isReady(clicks(draft('shape'), [P(1, 1)]))).toBe(false);
  });
});

describe('塗色', () => {
  it('點回起點或再點最後一點（3 點以上）都是封閉；一次只能一個範圍', () => {
    const a = clicks(draft('fill'), [P(0, 0), P(5, 0), P(0, 5), P(0, 0)]);
    expect(a.figures).toEqual([{ pts: [P(0, 0), P(5, 0), P(0, 5)], closed: true }]);
    expect(clickPoint(a, P(2, 2))).toBeNull();
    const b = clicks(draft('fill'), [P(0, 0), P(5, 0), P(0, 5), P(0, 5)]);
    expect(b.figures[0].closed).toBe(true);
    /* 2 點時點回起點或最後一點不作用 */
    expect(clickPoint(clicks(draft('fill'), [P(0, 0), P(5, 0)]), P(0, 0))).toBeNull();
    expect(clickPoint(clicks(draft('fill'), [P(0, 0), P(5, 0)]), P(5, 0))).toBeNull();
  });

  it('決定：塗上目前的顏色；同樣的頂點再塗一次換成新的顏色（不疊兩層）', () => {
    const d = clicks(draft('fill'), [P(0, 0), P(5, 0), P(0, 5), P(0, 0)]);
    let c = commitDraft(canvas(), d, '#00a000');
    expect(c.fills).toEqual([{ pts: [P(0, 0), P(5, 0), P(0, 5)], color: '#00a000' }]);
    c = commitDraft(c, clicks(draft('fill'), [P(5, 0), P(0, 5), P(0, 0), P(5, 0)]), '#c00000');
    expect(c.fills).toEqual([{ pts: [P(5, 0), P(0, 5), P(0, 0)], color: '#c00000' }]);
  });

  it('3 點以上、還沒封閉時也可以決定', () => {
    const d = clicks(draft('fill'), [P(0, 0), P(5, 0), P(0, 5)]);
    expect(isReady(d)).toBe(true);
    expect(commitDraft(canvas(), d, '#0000ff').fills).toHaveLength(1);
  });
});

describe('傷害格', () => {
  it('加格子（這次的草稿裡不重複）；決定時已經標過的不重複', () => {
    let d = draft('damage');
    d = addCell(d, [3, 3]) ?? d;
    expect(addCell(d, [3, 3])).toBeNull();
    d = addCell(d, [4, 3]) ?? d;
    expect(isReady(d)).toBe(true);
    let c = commitDraft(canvas(), d, '#0000ff');
    expect(c.damage).toEqual([
      [3, 3],
      [4, 3],
    ]);
    c = commitDraft(c, addCell(draft('damage'), [3, 3]) as Draft, '#0000ff');
    expect(c.damage).toHaveLength(2);
    expect(isReady(draft('damage'))).toBe(false);
  });

  it('取消傷害格：選到的格子拿掉、沒標過的略過', () => {
    const c = {
      ...canvas(),
      damage: [
        [1, 1],
        [2, 2],
      ] as [number, number][],
    };
    const d = {
      ...draft('damage', true),
      cells: [
        [2, 2],
        [5, 5],
      ] as [number, number][],
    };
    expect(doomedBy(c, d).cells).toEqual([[2, 2]]);
    expect(commitDraft(c, d, '').damage).toEqual([[1, 1]]);
  });
});

describe('退一點（原作的右鍵）', () => {
  it('正在畫的少一點；空的時候打開上一筆（封閉的回到沒封閉、折線與直線少最後一點）', () => {
    const closed = clicks(draft('shape'), [P(1, 1), P(5, 1), P(3, 4), P(1, 1)]);
    const reopened = stepBack(closed) as Draft;
    expect(reopened.figures).toEqual([]);
    expect(reopened.current).toEqual([P(1, 1), P(5, 1), P(3, 4)]);
    const open = clicks(draft('shape'), [P(1, 1), P(5, 1), P(5, 1)]);
    expect((stepBack(open) as Draft).current).toEqual([P(1, 1)]);
    const line = clicks(draft('line'), [P(1, 1), P(4, 2)]);
    expect((stepBack(line) as Draft).current).toEqual([P(1, 1)]);
    expect(stepBack(draft('line'))).toBeNull();
    const cells = {
      ...draft('damage'),
      cells: [
        [1, 1],
        [2, 1],
      ] as [number, number][],
    };
    expect((stepBack(cells) as Draft).cells).toEqual([[1, 1]]);
  });
});

describe('決定（直線、多角形）', () => {
  it('每一段各一條線；同一條線再畫一次換成新的顏色、移到最上面', () => {
    const d = clicks(draft('shape'), [P(1, 1), P(5, 1), P(3, 4), P(1, 1)]);
    let c = commitDraft(canvas(), d, '#0000ff');
    expect(c.lines.map((l) => [l.a, l.b])).toEqual([
      [P(1, 1), P(5, 1)],
      [P(5, 1), P(3, 4)],
      [P(3, 4), P(1, 1)],
    ]);
    c = commitDraft(c, clicks(draft('line'), [P(5, 1), P(1, 1)]), '#c00000');
    expect(c.lines).toHaveLength(3);
    expect(c.lines[2]).toEqual({ a: P(5, 1), b: P(1, 1), color: '#c00000' });
  });

  it('還不能決定時不改畫布', () => {
    const c = canvas();
    expect(commitDraft(c, clicks(draft('line'), [P(1, 1)]), '#0000ff')).toBe(c);
  });
});

describe('刪除', () => {
  const base = addLines(canvas(), [seg(1, 1, 5, 1), seg(5, 1, 3, 4), seg(3, 4, 1, 1)], '#0000ff');

  it('刪除直線：兩端相同（不分方向）的線；會刪掉的先標出來', () => {
    const d = clicks(draft('line', true), [P(5, 1), P(1, 1)]);
    expect(doomedBy(base, d).lines).toEqual([base.lines[0]]);
    expect(commitDraft(base, d, '').lines).toEqual(base.lines.slice(1));
  });

  it('刪除多角形：沿著線點過去的每一段；正在畫的也標出來', () => {
    const half = clicks(draft('shape', true), [P(1, 1), P(5, 1), P(3, 4)]);
    expect(doomedBy(base, half).lines).toHaveLength(2);
    const d = clicks(half, [P(1, 1)]);
    expect(commitDraft(base, d, '').lines).toEqual([]);
  });

  it('沒有符合的線時畫布不變', () => {
    const d = clicks(draft('line', true), [P(0, 5), P(5, 5)]);
    expect(commitDraft(base, d, '')).toBe(base);
  });

  it('刪除塗色：頂點完全相同的優先；沒有時刪頂點全部在選取裡的最後一個（一次一個）', () => {
    let c = addFill(canvas(), [P(0, 0), P(4, 0), P(0, 4)], '#0000ff');
    c = addFill(c, [P(0, 0), P(4, 0), P(4, 4), P(0, 4)], '#00a000');
    c = addFill(c, [P(4, 0), P(4, 4), P(0, 4)], '#c00000');
    const quad = clicks(draft('fill', true), [P(0, 0), P(4, 0), P(4, 4), P(0, 4), P(0, 0)]);
    expect(doomedBy(c, quad).fill?.color).toBe('#00a000');
    c = commitDraft(c, quad, '');
    expect(c.fills.map((f) => f.color)).toEqual(['#0000ff', '#c00000']);
    /* 沒有完全相同的：刪最後一個子集合 */
    expect(doomedBy(c, quad).fill?.color).toBe('#c00000');
  });
});

describe('移動、反轉、旋轉', () => {
  it('移動：直線、多角形、傷害格的畫才能；刪除與塗色不能', () => {
    const d = clicks(draft('shape'), [P(1, 1), P(3, 1), P(3, 1), P(4, 4)]);
    expect(canShift(d)).toBe(true);
    expect(shiftDraft(d, 1, 0, 11)).toEqual({
      ...d,
      figures: [{ pts: [P(2, 1), P(4, 1)], closed: false }],
      current: [P(5, 4)],
    });
    expect(shiftDraft(d, 0, -2, 11)).toBeNull();
    expect(canShift(clicks(draft('line', true), [P(1, 1)]))).toBe(false);
    expect(canShift(clicks(draft('fill'), [P(0, 0)]))).toBe(false);
    const cells = { ...draft('damage'), cells: [[0, 0]] as [number, number][] };
    expect(shiftDraft(cells, 1, 1, 11)?.cells).toEqual([[1, 1]]);
  });

  it('反轉、旋轉：直線與多角形的畫才能（傷害格不能）', () => {
    const d = clicks(draft('line'), [P(1, 1), P(4, 1)]);
    expect(canTurn(d)).toBe(true);
    expect(rotateDraft(d, 11)?.figures[0].pts).toEqual([P(3, 0), P(3, 3)]);
    expect(mirrorDraft(d, 11)?.figures[0].pts).toEqual([P(4, 1), P(1, 1)]);
    expect(canTurn({ ...draft('damage'), cells: [[1, 1]] })).toBe(false);
  });
});
