/**
 * 室內平面圖：刪除房間時問要不要連裡面的東西一起刪（2026-10，原作 v1.10；規格 F224）。
 * 純函式的部分：房間裡「還沒被選到」的東西有哪些（deletionExtras）、各種類的個數（countRefs）。
 * 三種選擇（只刪房間／連裡面的東西一起刪／取消）與復原在 e2e 測。
 */
import { describe, expect, it } from 'vitest';
import { emptyFloor } from '@/tools/floor-plan/model/geometry';
import { countRefs, deletionExtras } from '@/tools/floor-plan/model/ops';
import type { Floor, Room, SelRef } from '@/tools/floor-plan/model/types';

const room = (id: string, x: number, y: number, w: number, h: number, extra: Partial<Room> = {}) =>
  ({ id, x, y, w, h, name: id, cat: 'living', ...extra }) as Room;

const keys = (refs: SelRef[]) => refs.map((r) => `${r.type}:${r.id}`).sort();

/** 大房間 big (0,0,12,8)，裡面有小房間 closet (1,1,3,3) 與各種東西；旁邊的房間 side (12,0,6,8) */
function sample(): Floor {
  return {
    ...emptyFloor('1F'),
    rooms: [room('big', 0, 0, 12, 8), room('closet', 1, 1, 3, 3), room('side', 12, 0, 6, 8)],
    items: [
      { id: 'in1', t: 'sofa2', x: 6, y: 4, w: 3, h: 1.5, rot: 0 },
      { id: 'in2', t: 'sofa2', x: 2, y: 2, w: 1, h: 1, rot: 0 },
      { id: 'out1', t: 'sofa2', x: 13, y: 4, w: 3, h: 1.5, rot: 0 },
      /* 中心在房間的邊上不算裡面（和移動房間的判斷相同） */
      { id: 'edge', t: 'sofa2', x: 11.5, y: 3, w: 1, h: 1, rot: 0 },
    ],
    texts: [
      { id: 'tIn', x: 6, y: 2, text: '說明' },
      { id: 'tOut', x: 15, y: 2, text: '外面' },
    ],
    openings: [
      /* 在房間邊上的門（中點在邊界上）算裡面 */
      { id: 'door', kind: 'door', o: 'h', x: 4, y: 0, len: 1.5, side: 1, hinge: 0 },
      /* 兩個房間共用的牆上的門：兩邊的房間都算 */
      { id: 'shared', kind: 'door', o: 'v', x: 12, y: 2, len: 1.5, side: 1, hinge: 0 },
      { id: 'far', kind: 'window', o: 'h', x: 14, y: 8, len: 2, side: 1, hinge: 0 },
    ],
    walls: [
      { id: 'wIn', x1: 5, y1: 5, x2: 9, y2: 5, kind: 'int' },
      { id: 'wHalf', x1: 10, y1: 5, x2: 14, y2: 5, kind: 'int' },
    ],
  };
}

describe('deletionExtras：刪除房間時裡面「還沒被選到」的東西', () => {
  it('家具（中心在裡面）、文字、邊上與裡面的門窗、兩端都在裡面的手畫牆、巢狀的房間；不含外面的', () => {
    const f = sample();
    const extras = deletionExtras(f, [{ type: 'room', id: 'big' }]);
    expect(keys(extras)).toEqual(
      [
        'item:in1',
        'item:in2',
        'text:tIn',
        'opening:door',
        'opening:shared',
        'wall:wIn',
        'room:closet',
      ].sort(),
    );
  });

  it('已經一起選取的不重複算；沒選房間時沒有（只刪選到的東西）', () => {
    const f = sample();
    const sel: SelRef[] = [
      { type: 'room', id: 'big' },
      { type: 'item', id: 'in1' },
      { type: 'room', id: 'closet' },
    ];
    expect(keys(deletionExtras(f, sel))).toEqual(
      ['item:in2', 'text:tIn', 'opening:door', 'opening:shared', 'wall:wIn'].sort(),
    );
    expect(deletionExtras(f, [{ type: 'item', id: 'in1' }])).toEqual([]);
    expect(deletionExtras(f, [{ type: 'text', id: 'tIn' }])).toEqual([]);
  });

  it('好幾間房間：各自的東西合起來，同一件只算一次', () => {
    const f = sample();
    const extras = deletionExtras(f, [
      { type: 'room', id: 'big' },
      { type: 'room', id: 'side' },
    ]);
    const k = keys(extras);
    expect(k).toContain('item:out1');
    expect(k).toContain('text:tOut');
    expect(k).toContain('opening:far');
    expect(new Set(k).size).toBe(k.length);
    expect(k.filter((x) => x === 'opening:shared')).toHaveLength(1);
  });

  it('鎖定的巢狀房間和它裡面的東西不會被一起刪', () => {
    const f = sample();
    f.rooms.find((r) => r.id === 'closet')!.locked = true;
    const k = keys(deletionExtras(f, [{ type: 'room', id: 'big' }]));
    expect(k).not.toContain('room:closet');
    /* in2 在鎖定的 closet 裡面 */
    expect(k).not.toContain('item:in2');
    expect(k).toContain('item:in1');
  });

  it('房間裡什麼都沒有時是空的', () => {
    const f = { ...emptyFloor('1F'), rooms: [room('a', 0, 0, 4, 4)] };
    expect(deletionExtras(f, [{ type: 'room', id: 'a' }])).toEqual([]);
  });
});

describe('countRefs：各種類的個數（對話框的說明用）', () => {
  it('家具、文字、門窗、牆、房間', () => {
    const f = sample();
    const extras = deletionExtras(f, [{ type: 'room', id: 'big' }]);
    expect(countRefs(extras)).toEqual({ item: 2, text: 1, opening: 2, wall: 1, room: 1 });
    expect(countRefs([])).toEqual({ item: 0, text: 0, opening: 0, wall: 0, room: 0 });
  });
});
