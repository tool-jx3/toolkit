/**
 * 室內平面圖：沿著牆拖曳放門窗（2026-10，原作 v1.05；規格 F223）。
 * 在牆上按下的位置是起點，拖曳到哪裡長度就到哪裡（對齊 0.25 格、至少 0.5 格），不超出牆段、不壓到同一條線上的其他門窗。
 */
import { describe, expect, it } from 'vitest';
import { emptyFloor } from '@/tools/floor-plan/model/geometry';
import { dragOpeningSpan, snapOpening, spansOnLine } from '@/tools/floor-plan/model/snap';
import type { Floor, Opening, Room } from '@/tools/floor-plan/model/types';
import { wallLines } from '@/tools/floor-plan/model/walls';

const run = { a: 0, b: 12 };

describe('dragOpeningSpan：拖曳決定門窗的範圍', () => {
  it('向右、向左拖：起點（按下的位置）到現在的位置，對齊 0.25 格', () => {
    expect(dragOpeningSpan(run, 5, 8.1, [])).toEqual({ a: 5, b: 8 });
    expect(dragOpeningSpan(run, 5, 8.13, [])).toEqual({ a: 5, b: 8.25 });
    expect(dragOpeningSpan(run, 5, 2, [])).toEqual({ a: 2, b: 5 });
    expect(dragOpeningSpan(run, 5.1, 7, [])).toEqual({ a: 5, b: 7 });
  });

  it('太短時延伸成 0.5 格（往拖曳的方向）', () => {
    expect(dragOpeningSpan(run, 5, 5.1, [])).toEqual({ a: 5, b: 5.5 });
    expect(dragOpeningSpan(run, 5, 4.9, [])).toEqual({ a: 4.5, b: 5 });
    expect(dragOpeningSpan(run, 5, 5, [])).toEqual({ a: 5, b: 5.5 });
    expect(dragOpeningSpan(run, 5, 5.4, [])).toEqual({ a: 5, b: 5.5 });
  });

  it('不超出牆段；在牆段的盡頭仍至少 0.5 格', () => {
    expect(dragOpeningSpan(run, 5, 99, [])).toEqual({ a: 5, b: 12 });
    expect(dragOpeningSpan(run, 5, -9, [])).toEqual({ a: 0, b: 5 });
    expect(dragOpeningSpan(run, 12, 12, [])).toEqual({ a: 11.5, b: 12 });
    expect(dragOpeningSpan(run, 0, 0, [])).toEqual({ a: 0, b: 0.5 });
    expect(dragOpeningSpan(run, 11.9, 12, [])).toEqual({ a: 11.5, b: 12 });
  });

  it('碰到同一條線上的其他門窗就停在它旁邊（滑鼠拖過頭也不會壓到）', () => {
    const others = [
      { a: 8, b: 9.5 },
      { a: 1, b: 2 },
    ];
    expect(dragOpeningSpan(run, 5, 12, others)).toEqual({ a: 5, b: 8 });
    expect(dragOpeningSpan(run, 5, 0, others)).toEqual({ a: 2, b: 5 });
    expect(dragOpeningSpan(run, 10, 11, others)).toEqual({ a: 10, b: 11 });
    /* 緊貼著別人的邊開始 */
    expect(dragOpeningSpan(run, 9.5, 12, others)).toEqual({ a: 9.5, b: 12 });
    expect(dragOpeningSpan(run, 8, 3, others)).toEqual({ a: 3, b: 8 });
    expect(dragOpeningSpan(run, 8, 0, others)).toEqual({ a: 2, b: 8 });
  });

  it('夾在兩個門窗之間、空隙不到 0.5 格時沒有地方放（null）', () => {
    expect(
      dragOpeningSpan(run, 5.1, 6, [
        { a: 2, b: 5 },
        { a: 5.25, b: 8 },
      ]),
    ).toBeNull();
    /* 剛好 0.5 格放得下（起點在中間時往旁邊補到 0.5 格） */
    expect(
      dragOpeningSpan(run, 5.25, 6, [
        { a: 2, b: 5 },
        { a: 5.5, b: 8 },
      ]),
    ).toEqual({
      a: 5,
      b: 5.5,
    });
    expect(
      dragOpeningSpan(run, 5.1, 6, [
        { a: 2, b: 5 },
        { a: 5.5, b: 8 },
      ]),
    ).toEqual({
      a: 5,
      b: 5.5,
    });
    /* 起點在別人的裡面 */
    expect(dragOpeningSpan(run, 3, 6, [{ a: 2, b: 5 }])).toBeNull();
  });

  it('每次結果都是 0.25 的倍數、長度 ≥ 0.5、在牆段內', () => {
    const others = [{ a: 3.25, b: 4.75 }];
    for (let anchor = 0; anchor <= 12; anchor += 0.37)
      for (let at = -2; at <= 14; at += 0.41) {
        const r = dragOpeningSpan(run, anchor, at, others);
        if (!r) continue;
        expect(r.b - r.a).toBeGreaterThanOrEqual(0.5 - 1e-9);
        expect(r.a).toBeGreaterThanOrEqual(0);
        expect(r.b).toBeLessThanOrEqual(12);
        expect((r.a * 4) % 1).toBeCloseTo(0, 9);
        expect((r.b * 4) % 1).toBeCloseTo(0, 9);
        expect(r.b <= 3.25 + 1e-9 || r.a >= 4.75 - 1e-9).toBe(true);
      }
  });
});

describe('沿牆拖曳放門窗：吸附點（snapOpening）給拖曳用的牆段與起點', () => {
  const room = (): Room => ({ id: 'a', x: 0, y: 0, w: 8, h: 6, name: 'a', cat: 'living' });
  const floor: Floor = { ...emptyFloor('1F'), rooms: [room()] };
  const lines = wallLines(floor);

  it('回傳牆段（run）與按下的位置（along，對齊 0.25 並夾在牆段內）', () => {
    const g = snapOpening(lines, [], 3.13, -0.2, 'window');
    expect(g).toMatchObject({ o: 'h', y: 0, run: { a: 0, b: 8 }, along: 3.25 });
    const v = snapOpening(lines, [], 8.3, 3.1, 'door');
    expect(v).toMatchObject({ o: 'v', x: 8, run: { a: 0, b: 6 }, along: 3 });
    /* 牆段的盡頭外一點點按下：夾在牆段內 */
    expect(snapOpening(lines, [], 7.9, 6.3, 'door')).toMatchObject({ o: 'v', x: 8, along: 6 });
  });

  it('spansOnLine：同一條線上的其他門窗（不含自己）', () => {
    const ops: Opening[] = [
      { id: 'x', kind: 'door', o: 'h', x: 1, y: 0, len: 1.5, side: 1, hinge: 0 },
      { id: 'y', kind: 'window', o: 'h', x: 4, y: 0, len: 2, side: 1, hinge: 0 },
      { id: 'z', kind: 'window', o: 'h', x: 4, y: 6, len: 2, side: 1, hinge: 0 },
      { id: 'w', kind: 'window', o: 'v', x: 0, y: 2, len: 2, side: 1, hinge: 0 },
    ];
    expect(spansOnLine(ops, 'h', 0)).toEqual([
      { a: 1, b: 2.5 },
      { a: 4, b: 6 },
    ]);
    expect(spansOnLine(ops, 'h', 0, 'x')).toEqual([{ a: 4, b: 6 }]);
    expect(spansOnLine(ops, 'v', 0)).toEqual([{ a: 2, b: 4 }]);
  });
});
