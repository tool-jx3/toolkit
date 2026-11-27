/**
 * 斷面圖產生器（規格 docs/refactor/specs/cross-section.md）：樓層與區域的模型、上限、隔間、通道的貫穿與佔位、
 * 合併時祕密區域的東西改成 GM 專用、備註跟著區域。
 */
import { describe, expect, it } from 'vitest';
import { blankDoc } from '@/tools/cross-section/model/factory';
import { layoutOf, spacesOf } from '@/tools/cross-section/model/layout';
import {
  addFloor,
  addShaft,
  freeShaftX,
  makeFixture,
  makeNote,
  mergeFloor,
  moveDivider,
  placeNote,
  removeFloor,
  setRoomWidth,
  settle,
  splitFloor,
} from '@/tools/cross-section/model/ops';
import { SAMPLE_IDS, sampleDoc } from '@/tools/cross-section/model/samples';
import { MAX_FLOORS, MIN_ROOM, type SectionDoc } from '@/tools/cross-section/model/types';

const floor = (d: SectionDoc, level: number) => {
  const f = d.building.floors.find((v) => v.level === level);
  if (!f) throw new Error(`no ${level}`);
  return f;
};

/** 每層的區域排滿每一段空間、整數格、至少 4 格、不和公開通道重疊 */
function expectTiled(d: SectionDoc) {
  for (const f of d.building.floors) {
    const { bays, slots } = spacesOf(d.building, f.level);
    const rooms = [...f.rooms].sort((a, b) => a.x0 - b.x0);
    for (const r of rooms) {
      expect(Number.isInteger(r.x0) && Number.isInteger(r.x1)).toBe(true);
      expect(r.x1 - r.x0).toBeGreaterThanOrEqual(MIN_ROOM);
      for (const s of slots) expect(r.x1 <= s.x0 || r.x0 >= s.x1).toBe(true);
    }
    for (const b of bays) {
      const inBay = rooms.filter((r) => r.x0 >= b.x0 && r.x1 <= b.x1);
      expect(inBay[0]?.x0).toBe(b.x0);
      expect(inBay[inBay.length - 1]?.x1).toBe(b.x1);
      for (let i = 1; i < inBay.length; i++) expect(inBay[i].x0).toBe(inBay[i - 1].x1);
    }
  }
}

describe('幾何', () => {
  it('空白：1F 與 B1F、中間的電梯佔 16～19 格，兩邊各一間', () => {
    const d = blankDoc();
    const L = layoutOf(d);
    expect(L.floors.map((f) => f.floor.level)).toEqual([1, -1]);
    expect(L.floors[0].slots.map((s) => [s.x0, s.x1])).toEqual([[16, 19]]);
    expect(L.floors[0].bays).toEqual([
      { x0: 0, x1: 16 },
      { x0: 19, x1: 36 },
    ]);
    expect(floor(d, 1).rooms.map((r) => [r.x0, r.x1])).toEqual([
      [0, 16],
      [19, 36],
    ]);
    /* 世界：左 4、右 2、屋頂 3＋天空 2、地層 3 */
    expect(L.world).toEqual({ x: -4, y: -5, w: 42, h: 12 + 5 + 3 });
    expect(L.glY).toBe(6);
    expect(L.storey).toBe(6);
    expectTiled(d);
  });

  it('RF 不顯示時屋頂 1 格；樓層高 5 格', () => {
    const d = blankDoc();
    d.building.rooftop = false;
    d.building.storey = 5;
    const L = layoutOf(d);
    expect(L.roofH).toBe(1);
    expect(L.world.y).toBe(-3);
    expect(L.totalH).toBe(10);
    expect(L.glY).toBe(5);
  });

  it('沒有 1F 時地面在最下面的地上樓層；全是地下時在最上面', () => {
    const d = blankDoc();
    floor(d, 1).level = 2;
    settle(d);
    expect(layoutOf(d).glY).toBe(6);
    d.building.floors = d.building.floors.filter((f) => f.level < 0);
    settle(d);
    expect(layoutOf(d).glY).toBe(0);
  });

  it('範例都排得整齊', () => {
    for (const id of SAMPLE_IDS) {
      const d = sampleDoc(id);
      expectTiled(d);
      const ids = new Set(d.building.floors.flatMap((f) => f.rooms.map((r) => r.id)));
      expect(d.items.every((it) => ids.has(it.room))).toBe(true);
      expect(d.notes.every((n) => n.room === null || ids.has(n.room))).toBe(true);
    }
  });
});

describe('樓層', () => {
  it('加地上層：最上面再往上；加地下層：最下面再往下（沒有 0 樓）；最多 12 層', () => {
    const d = blankDoc();
    expect(addFloor(d, 'above')?.level).toBe(2);
    expect(addFloor(d, 'below')?.level).toBe(-2);
    d.building.floors = d.building.floors.filter((f) => f.level > 0);
    settle(d);
    expect(addFloor(d, 'below')?.level).toBe(-1);
    while (d.building.floors.length < MAX_FLOORS) addFloor(d, 'above');
    expect(addFloor(d, 'above')).toBeNull();
    expect(addFloor(d, 'below')).toBeNull();
    expect(d.building.floors).toHaveLength(12);
  });

  it('新的地上層是辦公室、地下層是倉庫（擺好設備）；通道不經過的新樓層是一整間', () => {
    const d = blankDoc();
    const up = addFloor(d, 'above');
    const down = addFloor(d, 'below');
    expect(up?.rooms.map((r) => [r.use, r.x0, r.x1])).toEqual([['office', 0, 36]]);
    expect(down?.rooms.map((r) => r.use)).toEqual(['storage']);
    expect(d.items.some((it) => it.room === up?.rooms[0].id)).toBe(true);
  });

  it('刪掉一層：裡面的設備與備註一起刪；至少留一層；通道的上下端夾回現有的樓層', () => {
    const d = blankDoc();
    const b1 = floor(d, -1);
    const n = makeNote('x');
    placeNote(d, n, 3, 9);
    d.notes.push(n);
    expect(n.room).toBe(b1.rooms[0].id);
    expect(removeFloor(d, b1.id)).toBe(true);
    expect(d.notes).toHaveLength(0);
    expect(d.items.every((it) => floor(d, 1).rooms.some((r) => r.id === it.room))).toBe(true);
    expect(d.building.shafts[0]).toMatchObject({ top: 1, bottom: 1 });
    expect(removeFloor(d, floor(d, 1).id)).toBe(false);
  });
});

describe('區域', () => {
  it('多一間：分開最寬的那間（中間取整數）；最多 5 間；不到 8 格不分', () => {
    const d = blankDoc();
    const f = floor(d, 1);
    expect(splitFloor(d, f.id)).toBe('ok');
    expect(f.rooms.map((r) => [r.x0, r.x1])).toEqual([
      [0, 16],
      [19, 27],
      [27, 36],
    ]);
    expect(splitFloor(d, f.id)).toBe('ok');
    expect(splitFloor(d, f.id)).toBe('ok');
    expect(f.rooms).toHaveLength(5);
    expect(splitFloor(d, f.id)).toBe('max');
    expectTiled(d);
    /* 每段空間只有 7 格：分不開 */
    const narrow = blankDoc();
    narrow.building.width = 30;
    narrow.building.shafts = [
      { ...narrow.building.shafts[0], id: 'a', x: 7 },
      { ...narrow.building.shafts[0], id: 'b', x: 17 },
      { ...narrow.building.shafts[0], id: 'c', x: 27, kind: 'ladder' },
    ];
    settle(narrow);
    const nf = floor(narrow, 1);
    expect(layoutOf(narrow).floors[0].gaps).toEqual([{ x0: 29, x1: 30 }]);
    expect(nf.rooms.map((r) => r.x1 - r.x0)).toEqual([7, 7, 7]);
    expect(splitFloor(narrow, nf.id)).toBe('narrow');
  });

  it('分開時右半邊的設備跟著搬到新的區域', () => {
    const d = blankDoc();
    const f = floor(d, 1);
    const right = f.rooms[1];
    d.items = d.items.filter((it) => it.room !== right.id);
    d.items.push(
      makeFixture(right.id, 'crates', { rx: 0.1 }),
      makeFixture(right.id, 'crates', { rx: 0.9 }),
    );
    splitFloor(d, f.id);
    const added = f.rooms.find((r) => r.x0 === 27);
    expect(d.items.filter((it) => it.room === right.id)).toHaveLength(1);
    expect(d.items.filter((it) => it.kind === 'crates' && it.room === added?.id)).toHaveLength(1);
  });

  it('少一間：最右邊相鄰的兩間合併；祕密區域併進一般區域時搬過去的東西改成 GM 專用', () => {
    const d = blankDoc();
    const f = floor(d, 1);
    splitFloor(d, f.id);
    const victim = f.rooms.find((r) => r.x0 === 27);
    const survivor = f.rooms.find((r) => r.x1 === 27);
    if (!victim || !survivor) throw new Error('rooms');
    victim.secret = true;
    d.items.push(makeFixture(victim.id, 'altar', { rx: 0.5 }));
    const n = makeNote('秘');
    placeNote(d, n, 31, 3);
    d.notes.push(n);
    const r = mergeFloor(d, f.id);
    expect(r).toEqual({ ok: true, leaked: true });
    expect(f.rooms.map((v) => [v.x0, v.x1])).toEqual([
      [0, 16],
      [19, 36],
    ]);
    const moved = d.items.find((it) => it.kind === 'altar');
    expect(moved).toMatchObject({ room: survivor.id, secret: true });
    expect(d.notes[0]).toMatchObject({ room: survivor.id, secret: true });
    /* 位置照建築裡的位置換算：原本在 27～36 的中間 → 合併後的右邊 */
    expect(moved?.rx).toBeGreaterThan(0.6);
    expect(mergeFloor(d, f.id).ok).toBe(false);
  });

  it('隔間：整數格、兩邊都至少 4 格；寬的輸入動右邊的隔間（最右一間動左邊的）', () => {
    const d = blankDoc();
    const f = floor(d, 1);
    splitFloor(d, f.id);
    const [, l, r] = [...f.rooms].sort((a, b) => a.x0 - b.x0);
    expect(moveDivider(l, r, 21.6)).toBe(true);
    expect([l.x1, r.x0]).toEqual([23, 23]);
    moveDivider(l, r, 0);
    expect(l.x1).toBe(23);
    moveDivider(l, r, 100);
    expect(l.x1).toBe(32);
    expect(setRoomWidth(d, l.id, 6)).toBe(true);
    expect(l.x1 - l.x0).toBe(6);
    expect(setRoomWidth(d, r.id, 8)).toBe(true);
    expect(r.x1 - r.x0).toBe(8);
    expectTiled(d);
  });
});

describe('通道', () => {
  it('加通道：經過所有樓層、放在中間附近空的位置；放不下時 -1；祕密通風管在右邊、GM 專用、不佔位置', () => {
    const d = blankDoc();
    const s = addShaft(d, 'switchback');
    expect(s).toMatchObject({ top: 1, bottom: -1, secret: false });
    expect(s?.x).not.toBe(16);
    const L = layoutOf(d);
    const xs = L.floors[0].slots.map((v) => [v.x0, v.x1]);
    for (let i = 1; i < xs.length; i++) expect(xs[i][0]).toBeGreaterThanOrEqual(xs[i - 1][1]);
    const duct = addShaft(d, 'duct');
    expect(duct).toMatchObject({ x: 34, secret: true });
    expect(layoutOf(d).floors[0].slots).toHaveLength(2);
    expectTiled(d);
    /* 寬 30 塞滿之後放不下 */
    const full = blankDoc();
    full.building.width = 30;
    settle(full);
    let n = 0;
    while (addShaft(full, 'switchback')) n++;
    expect(n).toBeGreaterThan(0);
    expect(freeShaftX(full.building, 4, 1, -1)).toBe(-1);
    expect(layoutOf(full).floors[0].bays.some((b) => b.x1 - b.x0 >= MIN_ROOM)).toBe(true);
  });

  it('兩條公開通道撞在一起時後面那條挪開；GM 專用的通道畫在區域上（不佔）', () => {
    const d = blankDoc();
    d.building.shafts.push({ ...d.building.shafts[0], id: 'b', x: 17, kind: 'ladder' });
    settle(d);
    const [a, b] = d.building.shafts;
    expect(b.x >= a.x + 3 || b.x + 2 <= a.x).toBe(true);
    b.secret = true;
    b.x = 2;
    settle(d);
    expect(layoutOf(d).floors[0].slots.map((s) => s.shaft.id)).toEqual([a.id]);
    expect(layoutOf(d).shafts.find((s) => s.shaft.id === 'b')?.x).toBe(2);
  });

  it('太窄的縫畫成牆（gaps）；電梯車廂夾在經過的樓層', () => {
    const d = blankDoc();
    d.building.shafts[0].x = 2;
    d.building.shafts[0].cab = 5;
    settle(d);
    const L = layoutOf(d);
    expect(L.floors[0].gaps).toEqual([{ x0: 0, x1: 2 }]);
    expect(L.floors[0].bays).toEqual([{ x0: 5, x1: 36 }]);
    expect([1, -1]).toContain(d.building.shafts[0].cab);
    expectTiled(d);
  });
});

describe('備註', () => {
  it('放在區域裡的備註跟著區域；區域外記世界座標', () => {
    const d = blankDoc();
    const n = makeNote('調查的重點');
    expect(n.style).toBe('box');
    expect(makeNote('A1').style).toBe('badge');
    placeNote(d, n, 8, 3);
    expect(n.room).toBe(floor(d, 1).rooms[0].id);
    expect([n.rx, n.ry]).toEqual([0.5, 0.5]);
    placeNote(d, n, -2, -4);
    expect(n).toMatchObject({ room: null, x: -2, y: -4 });
  });
});
