// @vitest-environment jsdom
/**
 * 室內平面圖：外觀層「顯示內部」的兩個操作邊角（F230、F219、D41、7.13）：
 * - 替這一層的房間編號：只算外觀層自己留下來、看得到的房間（和點選、框選一樣），不連疊上來的房間一起編；
 * - 刪除樓層：「實際疊上來的那一層」被刪掉就關掉開關（`inside` 沒寫時疊的是第一個別的樓層），不突然換成疊別層。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import * as act from '@/tools/floor-plan/editor/actions';
import { setEditor, useEditor, useProject } from '@/tools/floor-plan/editor/store';
import { emptyFloor } from '@/tools/floor-plan/model/geometry';
import { interiorFloor } from '@/tools/floor-plan/model/interior';
import { isRoomNumber } from '@/tools/floor-plan/model/numbering';
import type { Floor, Project, Room, TextLabel } from '@/tools/floor-plan/model/types';

const room = (id: string, x: number, y: number, w: number, h: number, extra: Partial<Room> = {}) =>
  ({ id, x, y, w, h, name: id, cat: 'living', ...extra }) as Room;
const badge = (id: string, x: number, y: number, text: string): TextLabel => ({
  id,
  x,
  y,
  text,
  size: 0.6,
  badge: true,
});

const toasts: { title?: string }[] = [];
const bind = (confirm = true) => {
  toasts.length = 0;
  act.bindUi(
    (t) => toasts.push(t as { title?: string }),
    async () => confirm,
    null,
  );
};
const load = (p: Project) => {
  useProject.getState().replace(p);
  useProject.temporal.getState().clear();
  setEditor({ sel: [], tool: 'select', playerView: false });
};
const data = () => useProject.getState().data;
const steps = () => useProject.temporal.getState().pastStates.length;

/** 室內層 1F：大廳、客房、廚房。外觀層：庭院、池（戶外）、屋頂 2 個，庭院上有舊的編號、屋頂上有舊的編號與一般文字 */
function siteMap(): Project {
  const f1: Floor = {
    ...emptyFloor('1F'),
    id: 'f1',
    rooms: [
      room('hall', 4, 4, 6, 8, { name: '大廳' }),
      room('guest', 10, 4, 6, 8, { name: '客房' }),
      room('kitchen', 16, 4, 4, 8, { name: '廚房' }),
    ],
  };
  const site: Floor = {
    ...emptyFloor('外觀'),
    id: 'site',
    rooms: [
      room('yard', 0, 0, 30, 20, { name: '庭院', cat: 'garden' }),
      room('bldg', 4, 4, 16, 8, { name: '主屋', cat: 'roof' }),
      room('shed', 24, 14, 4, 4, { name: '倉庫', cat: 'roof' }),
      room('pond', 22, 2, 6, 6, { name: '池', cat: 'garden' }),
    ],
    texts: [
      badge('oldYard', 0.7, 0.7, '9'),
      badge('oldRoof', 4.7, 4.7, '8'),
      { id: 'roofNote', x: 12, y: 8, text: '瓦屋頂' },
    ],
    showInside: true,
    inside: 'f1',
  };
  return {
    name: '測試',
    theme: 'clean',
    showSize: 'none',
    showNames: true,
    floors: [f1, site],
    active: 1,
  };
}

describe('替這一層的房間編號：外觀層打開「顯示內部」（F219、F230、7.13）', () => {
  beforeEach(() => bind());

  it('只編外觀層自己留下來的房間（庭院、池、倉庫）；疊上來的室內房間與拿掉的屋頂不編', () => {
    load(siteMap());
    act.numberRoomsOnFloor();
    /* 屋頂（主屋、倉庫）和疊上來的大廳、客房、廚房都不算：庭院 1、池 2 */
    expect(toasts.map((t) => t.title)).toEqual(['已替 2 間房間編號']);
    const f = data().floors[1];
    const badges = f.texts.filter(isRoomNumber);
    expect(badges.map((t) => [t.text, t.x, t.y])).toEqual([
      ['1', 0.7, 0.7],
      ['2', 22.7, 2.7],
    ]);
    /* 疊上來的那一層沒有被動到 */
    expect(data().floors[0].texts).toEqual([]);
  });

  it('看不到的東西不亂動：屋頂上的一般文字留著；舊的編號（含屋頂上看不到的）整批換成新的', () => {
    load(siteMap());
    act.numberRoomsOnFloor();
    const f = data().floors[1];
    expect(f.texts.find((t) => t.id === 'roofNote')).toMatchObject({ text: '瓦屋頂' });
    /* 舊的 9、8 都換掉了，沒有留下重複的編號 */
    expect(f.texts.some((t) => t.id === 'oldYard' || t.id === 'oldRoof')).toBe(false);
    expect(f.texts.filter(isRoomNumber)).toHaveLength(2);
    /* 房間沒有被動到 */
    expect(f.rooms.map((r) => r.id)).toEqual(['yard', 'bldg', 'shed', 'pond']);
  });

  it('一步復原；再編一次不會多出一份', () => {
    load(siteMap());
    act.numberRoomsOnFloor();
    expect(steps()).toBe(1);
    act.numberRoomsOnFloor();
    expect(data().floors[1].texts.filter(isRoomNumber)).toHaveLength(2);
    act.undo();
    act.undo();
    expect(data().floors[1].texts.map((t) => t.id)).toEqual(['oldYard', 'oldRoof', 'roofNote']);
  });

  it('選取中的文字：被換掉的編號從選取裡拿掉，其他留著', () => {
    load(siteMap());
    setEditor({
      sel: [
        { type: 'text', id: 'roofNote' },
        { type: 'text', id: 'oldYard' },
      ],
    });
    act.numberRoomsOnFloor();
    expect(useEditor.getState().sel).toEqual([{ type: 'text', id: 'roofNote' }]);
  });

  it('外觀層自己沒有留下房間（全被拿掉）：「沒有可以編號的房間」、不改資料', () => {
    const p = siteMap();
    p.floors[1].rooms = [p.floors[1].rooms[1], p.floors[1].rooms[2]];
    load(p);
    act.numberRoomsOnFloor();
    expect(toasts.map((t) => t.title)).toEqual(['這一層沒有可以編號的房間。']);
    expect(steps()).toBe(0);
    expect(data().floors[1].texts).toHaveLength(3);
  });

  it('沒打開「顯示內部」時和以前一樣：這一層所有的房間都編（含屋頂）', () => {
    const p = siteMap();
    delete p.floors[1].showInside;
    load(p);
    act.numberRoomsOnFloor();
    expect(toasts.map((t) => t.title)).toEqual(['已替 4 間房間編號']);
  });

  it('GM 專用的房間照舊排最後、圓標也是 GM 專用（只算留下來的房間）', () => {
    const p = siteMap();
    p.floors[1].rooms[3].gm = true;
    load(p);
    act.numberRoomsOnFloor();
    expect(toasts.map((t) => t.title)).toEqual(['已替 2 間房間編號（其中 1 間只有 GM 看得到）']);
    const b = data().floors[1].texts.filter(isRoomNumber);
    expect(b.map((t) => [t.text, !!t.gm])).toEqual([
      ['1', false],
      ['2', true],
    ]);
  });
});

/** 三層：1F、敷地（打開顯示內部，沒有 inside）、2F */
function threeFloors(extra: Partial<Floor> = {}): Project {
  const floors = ['1F', '敷地', '2F'].map(
    (name, i): Floor => ({
      ...emptyFloor(name),
      id: `f${i}`,
      rooms: [room(`r${i}`, 0, 0, 6, 6)],
    }),
  );
  floors[1] = { ...floors[1], showInside: true, ...extra };
  return {
    name: '測試',
    theme: 'clean',
    showSize: 'none',
    showNames: true,
    floors,
    active: 0,
  };
}
const names = () => data().floors.map((f) => f.name);
const site = () => data().floors.find((f) => f.name === '敷地') as Floor;
const removeAt = async (index: number) => {
  useProject.getState().update((p) => {
    p.active = index;
  });
  useProject.temporal.getState().clear();
  await act.removeFloor();
};

describe('刪除樓層：「顯示內部」實際疊的那一層被刪掉就關掉（F230、D41、7.13）', () => {
  beforeEach(() => bind());

  it('沒有 inside 時疊的是第一個別的樓層：刪掉它（1F）就關掉，不換成疊 2F', async () => {
    load(threeFloors());
    expect(interiorFloor(site(), data().floors)?.name).toBe('1F');
    await removeAt(0);
    expect(names()).toEqual(['敷地', '2F']);
    expect(site().showInside).toBeUndefined();
    expect(site().inside).toBeUndefined();
    expect(interiorFloor(site(), data().floors)).toBeNull();
    expect(steps()).toBe(1);
  });

  it('沒有 inside、刪掉的不是疊上來的那一層（2F）：開關照舊、仍然疊 1F', async () => {
    load(threeFloors());
    await removeAt(2);
    expect(names()).toEqual(['1F', '敷地']);
    expect(site().showInside).toBe(true);
    expect(interiorFloor(site(), data().floors)?.name).toBe('1F');
  });

  it('inside 指到 2F：刪 2F 關掉；刪 1F 不影響（仍然疊 2F）', async () => {
    load(threeFloors({ inside: 'f2' }));
    await removeAt(0);
    expect(site().showInside).toBe(true);
    expect(site().inside).toBe('f2');
    expect(interiorFloor(site(), data().floors)?.name).toBe('2F');
    load(threeFloors({ inside: 'f2' }));
    await removeAt(2);
    expect(site().showInside).toBeUndefined();
    expect(site().inside).toBeUndefined();
  });

  it('inside 指到 1F（照舊）：刪 1F 關掉', async () => {
    load(threeFloors({ inside: 'f0' }));
    await removeAt(0);
    expect(site().showInside).toBeUndefined();
    expect(site().inside).toBeUndefined();
  });

  it('inside 找不到（壞掉的）時等於疊第一個別的樓層：刪掉它就關掉', async () => {
    load(threeFloors({ inside: 'gone' }));
    await removeAt(0);
    expect(site().showInside).toBeUndefined();
  });

  it('敷地排在最前面：第一個別的樓層是 1F，刪 1F 關掉、刪 2F 不影響', async () => {
    const p = threeFloors();
    p.floors = [p.floors[1], p.floors[0], p.floors[2]];
    load(p);
    await removeAt(2);
    expect(site().showInside).toBe(true);
    load(p);
    await removeAt(1);
    expect(site().showInside).toBeUndefined();
  });

  it('刪完只剩一層：開關關掉（沒有可以疊的樓層）', async () => {
    const p = threeFloors();
    p.floors.splice(2, 1);
    load(p);
    await removeAt(0);
    expect(names()).toEqual(['敷地']);
    expect(site().showInside).toBeUndefined();
  });

  it('沒有打開開關、但 inside 指到被刪的樓層：inside 一起拿掉（不留指到不存在樓層的資料）', async () => {
    load(threeFloors({ showInside: undefined, inside: 'f0' }));
    await removeAt(0);
    expect(site().showInside).toBeUndefined();
    expect(site().inside).toBeUndefined();
  });

  it('取消刪除：什麼都不變', async () => {
    load(threeFloors());
    bind(false);
    await removeAt(0);
    expect(names()).toEqual(['1F', '敷地', '2F']);
    expect(site().showInside).toBe(true);
  });

  it('一步復原：樓層與開關一起回來', async () => {
    load(threeFloors());
    await removeAt(0);
    act.undo();
    expect(names()).toEqual(['1F', '敷地', '2F']);
    expect(site().showInside).toBe(true);
  });
});
