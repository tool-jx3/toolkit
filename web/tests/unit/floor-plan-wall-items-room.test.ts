/**
 * 室內平面圖：貼牆素材跟著房間走（2026-10-22，規格 7.16、3.11.5、F224、F233）。
 * 在房間邊上的貼牆素材（中心在房間的邊界上或裡面）和邊上的門窗一樣當成房間的東西：
 * 移動、旋轉、複製（withContents）、刪除房間（deletionExtras、對話框的件數）都帶著；
 * 一般的家具中心在邊上不算（照舊）。
 */
import { describe, expect, it } from 'vitest';
import { ASSET } from '@/tools/floor-plan/model/assets';
import { emptyFloor } from '@/tools/floor-plan/model/geometry';
import {
  countContents,
  countRefs,
  deletionExtras,
  getObj,
  movable,
  roomContents,
  rotateRoomsCW,
  translateObj,
  withContents,
} from '@/tools/floor-plan/model/ops';
import type { Floor, Item, Room, SelRef } from '@/tools/floor-plan/model/types';

const room = (id: string, x: number, y: number, w: number, h: number, extra: Partial<Room> = {}) =>
  ({ id, x, y, w, h, name: id, cat: 'living', ...extra }) as Room;
const keys = (refs: readonly SelRef[]) => refs.map((r) => `${r.type}:${r.id}`).sort();

/** 貼牆素材：中心線在牆線上（0° 時 y＝牆線 − h/2；90° 時 x＝牆線 − w/2，w、h 已經對調） */
const wallItem = (id: string, t: string, cx: number, cy: number, rot: 0 | 90): Item => {
  const a = ASSET[t];
  const w = rot === 90 ? a.h : a.w;
  const h = rot === 90 ? a.w : a.h;
  return { id, t, x: cx - w / 2, y: cy - h / 2, w, h, rot };
};

/** 房間 A (0,0,10,8)、旁邊的房間 B (10,0,6,8)；A 的邊上有各種貼牆素材 */
function sample(): Floor {
  return {
    ...emptyFloor('1F'),
    rooms: [room('A', 0, 0, 10, 8), room('B', 10, 0, 6, 8)],
    items: [
      /* A 的上緣（y＝0）、左緣（x＝0，轉 90°） */
      wallItem('top', 'crack_wall', 4, 0, 0),
      wallItem('left', 'bullet_holes', 0, 5, 90),
      /* A 與 B 共用的牆（x＝10） */
      wallItem('shared', 'wall_blood', 10, 3, 90),
      /* B 的右緣（x＝16）：A 的外面 */
      wallItem('far', 'tendrils', 16, 5, 90),
      /* A 裡面的手畫牆上（中心在 A 裡面） */
      wallItem('inner', 'wall_mold', 5, 4, 0),
      /* 一般的家具中心剛好在 A 的邊上：照舊不算 */
      { id: 'sofa', t: 'sofa2', x: 4.2, y: -0.9, w: 3.2, h: 1.8, rot: 0 },
    ],
    walls: [{ id: 'w', x1: 2, y1: 4, x2: 8, y2: 4, kind: 'int' }],
  };
}

describe('roomContents：邊上的貼牆素材算房間的東西（7.16）', () => {
  it('中心在邊界上或裡面的貼牆素材算；外面的、中心在邊上的一般家具不算', () => {
    const f = sample();
    const a = f.rooms[0];
    expect(keys(roomContents(f, a))).toEqual(
      ['item:top', 'item:left', 'item:shared', 'item:inner', 'wall:w'].sort(),
    );
  });

  it('共用的牆上的：兩間房間都算（和共用的牆上的門一樣）', () => {
    const f = sample();
    const b = f.rooms[1];
    expect(keys(roomContents(f, b))).toEqual(['item:shared', 'item:far'].sort());
  });

  it('房間的角落上也算', () => {
    const f = { ...emptyFloor('1F'), rooms: [room('A', 0, 0, 10, 8)] };
    f.items = [wallItem('corner', 'crack_wall', 10, 8, 0)];
    expect(keys(roomContents(f, f.rooms[0]))).toEqual(['item:corner']);
  });

  it('一般的家具：中心在裡面才算（照舊）', () => {
    const f = { ...emptyFloor('1F'), rooms: [room('A', 0, 0, 10, 8)] };
    f.items = [
      { id: 'in', t: 'sofa2', x: 3, y: 3, w: 3, h: 1.5, rot: 0 },
      { id: 'edge', t: 'sofa2', x: 8.5, y: 3, w: 3, h: 1.5, rot: 0 } /* 中心 x＝10 */,
    ];
    expect(keys(roomContents(f, f.rooms[0]))).toEqual(['item:in']);
  });
});

describe('移動、旋轉、複製、刪除都帶著（7.16）', () => {
  it('移動房間：貼牆素材跟著動（movable）；Alt（只動房間）不帶', () => {
    const f = sample();
    const far0 = { ...(f.items.find((i) => i.id === 'far') as Item) };
    const sel: SelRef[] = [{ type: 'room', id: 'A' }];
    expect(keys(movable(f, sel))).toEqual(
      ['room:A', 'item:top', 'item:left', 'item:shared', 'item:inner', 'wall:w'].sort(),
    );
    expect(keys(movable(f, sel, true))).toEqual(['room:A']);
    for (const r of movable(f, sel)) {
      const o = getObj(f, r.type, r.id);
      if (o) translateObj(r.type, o, 2, 3);
    }
    const top = f.items.find((i) => i.id === 'top');
    /* 上緣的裂痕（寬 3、深 0.8，中心 (4, 0)）：整格移動 (2, 3) → 中心 (6, 3) */
    expect([top?.x, top?.y]).toEqual([4.5, 2.6]);
    /* 外面的（B 的右緣）不動 */
    expect(f.items.find((i) => i.id === 'far')).toEqual(far0);
  });

  it('旋轉房間：上緣的裂痕轉到右緣、方向 90°，中心還在房間的邊上', () => {
    const f = sample();
    const refs = movable(f, [{ type: 'room', id: 'A' }]);
    rotateRoomsCW(f, [f.rooms[0]], refs);
    const a = f.rooms[0];
    const top = f.items.find((i) => i.id === 'top');
    const left = f.items.find((i) => i.id === 'left');
    if (!top || !left) throw new Error('missing');
    /* A (0,0,10,8) 順時針轉成 (1,-1,8,10)：上緣 → 右緣（x＝9），左緣 → 上緣（y＝-1） */
    expect([a.x, a.y, a.w, a.h]).toEqual([1, -1, 8, 10]);
    expect(top.rot).toBe(90);
    expect(top.x + top.w / 2).toBeCloseTo(a.x + a.w, 6);
    expect(left.rot).toBe(180);
    expect(left.y + left.h / 2).toBeCloseTo(a.y, 6);
    /* 轉完仍算 A 的東西 */
    const k = keys(roomContents(f, a));
    expect(k).toContain('item:top');
    expect(k).toContain('item:left');
  });

  it('複製、剪貼簿（withContents）：帶著；單獨選貼牆素材不帶別的', () => {
    const f = sample();
    const k = keys(withContents(f, [{ type: 'room', id: 'A' }]));
    expect(k).toContain('item:top');
    expect(k).toContain('item:shared');
    expect(keys(withContents(f, [{ type: 'item', id: 'top' }]))).toEqual(['item:top']);
  });

  it('刪除房間：deletionExtras 列出貼牆素材；已經選取的不重複；鎖定的巢狀房間裡的不算', () => {
    const f = sample();
    const extras = keys(deletionExtras(f, [{ type: 'room', id: 'A' }]));
    expect(extras).toEqual(['item:top', 'item:left', 'item:shared', 'item:inner', 'wall:w'].sort());
    expect(
      keys(
        deletionExtras(f, [
          { type: 'room', id: 'A' },
          { type: 'item', id: 'top' },
        ]),
      ),
    ).not.toContain('item:top');
    /* 鎖定的 B：共用的牆上的那件算 B 的東西，刪 A 時不帶（B 鎖著、而且 B 比 A 小也不是「一起刪」） */
    f.rooms[1].locked = true;
    expect(keys(deletionExtras(f, [{ type: 'room', id: 'A' }]))).not.toContain('item:shared');
  });

  it('對話框的件數：貼牆素材另外算（N 個貼牆素材），家具只算一般的；countRefs 照舊', () => {
    const f = sample();
    const extras = deletionExtras(f, [{ type: 'room', id: 'A' }]);
    expect(countContents(f, extras)).toEqual({
      item: 0,
      mounted: 4,
      text: 0,
      opening: 0,
      wall: 1,
      room: 0,
    });
    /* 一般的家具與貼牆素材混在一起 */
    f.items.push({ id: 'chair', t: 'sofa2', x: 4, y: 4, w: 3, h: 1.5, rot: 0 });
    const c = countContents(f, deletionExtras(f, [{ type: 'room', id: 'A' }]));
    expect([c.item, c.mounted]).toEqual([1, 4]);
    /* 舊的 countRefs 不拆（兩種都是 item） */
    expect(countRefs(deletionExtras(f, [{ type: 'room', id: 'A' }])).item).toBe(5);
  });
});
