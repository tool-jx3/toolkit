// @vitest-environment jsdom
/**
 * 室內平面圖：刪除房間的流程（F224、7.10）——三種選擇，以及詢問期間地圖變了的邊角：
 * 選了之後重新算，什麼都沒刪就不通知、不記復原。
 */
import { describe, expect, it, vi } from 'vitest';
import * as act from '@/tools/floor-plan/editor/actions';
import { setEditor, useEditor, useProject } from '@/tools/floor-plan/editor/store';
import { emptyFloor } from '@/tools/floor-plan/model/geometry';
import type { Project, Room } from '@/tools/floor-plan/model/types';

const room = (id: string, x: number, w = 10): Room => ({
  id,
  x,
  y: 0,
  w,
  h: 8,
  name: id,
  cat: 'living',
});

const project = (): Project => ({
  name: '測試',
  theme: 'clean',
  showSize: 'none',
  showNames: true,
  active: 0,
  floors: [
    {
      ...emptyFloor('1F'),
      rooms: [room('a', 0), room('b', 12)],
      items: [
        { id: 'i1', t: 'sofa2', x: 2, y: 4, w: 3.2, h: 1.8, rot: 0 },
        { id: 'i2', t: 'sofa2', x: 14, y: 4, w: 3.2, h: 1.8, rot: 0 },
      ],
      texts: [{ id: 't1', x: 6, y: 2, text: '說明' }],
    },
  ],
});

type Toast = { title?: string };
const toasts: Toast[] = [];

/** 開一張有 a、b 兩間房的地圖，選取 a；choose＝詢問時的回答 */
function setup(choose: () => Promise<string | null>) {
  toasts.length = 0;
  useProject.getState().replace(project());
  useProject.temporal.getState().clear();
  setEditor({ sel: [{ type: 'room', id: 'a' }], tool: 'select' });
  act.bindUi((t) => toasts.push(t as Toast), null, choose as never);
}
const floor = () => useProject.getState().data.floors[0];
const ids = () => [
  floor().rooms.map((r) => r.id),
  floor().items.map((i) => i.id),
  floor().texts.map((t) => t.id),
];
const steps = () => useProject.temporal.getState().pastStates.length;
/** 詢問期間，別的操作改了地圖（不算這次刪除的復原紀錄） */
const changeMeanwhile = (fn: (f: Project['floors'][number]) => void) => {
  useProject.getState().update((p) => fn(p.floors[0]));
  useProject.temporal.getState().clear();
};

describe('deleteSelection：三種選擇', () => {
  it('只刪房間：東西留著，一步復原、通知「已刪除 1 個」', async () => {
    const asked = vi.fn(async () => 'room');
    setup(asked);
    await act.deleteSelection();
    expect(asked).toHaveBeenCalledTimes(1);
    expect(ids()).toEqual([['b'], ['i1', 'i2'], ['t1']]);
    expect(steps()).toBe(1);
    expect(toasts.map((t) => t.title)).toEqual(['已刪除 1 個']);
    expect(useEditor.getState().sel).toEqual([]);
  });

  it('連裡面的東西一起刪：房間＋家具＋文字，一步復原', async () => {
    setup(async () => 'all');
    await act.deleteSelection();
    expect(ids()).toEqual([['b'], ['i2'], []]);
    expect(steps()).toBe(1);
    expect(toasts.map((t) => t.title)).toEqual(['已刪除 3 個']);
    useProject.temporal.getState().undo();
    expect(ids()).toEqual([['a', 'b'], ['i1', 'i2'], ['t1']]);
  });

  it('取消：什麼都不動、不通知、不記復原', async () => {
    setup(async () => null);
    await act.deleteSelection();
    expect(ids()).toEqual([['a', 'b'], ['i1', 'i2'], ['t1']]);
    expect(steps()).toBe(0);
    expect(toasts).toEqual([]);
    expect(useEditor.getState().sel).toEqual([{ type: 'room', id: 'a' }]);
  });
});

describe('deleteSelection：詢問期間地圖變了（7.10）', () => {
  it('房間被刪掉、再選「只刪房間」：什麼都沒刪，不通知、不記復原', async () => {
    setup(async () => {
      changeMeanwhile((f) => {
        f.rooms = f.rooms.filter((r) => r.id !== 'a');
      });
      return 'room';
    });
    await act.deleteSelection();
    expect(ids()).toEqual([['b'], ['i1', 'i2'], ['t1']]);
    expect(steps()).toBe(0);
    expect(toasts).toEqual([]);
  });

  it('房間被刪掉、再選「連裡面的東西一起刪」：沒有房間就沒有「裡面」，什麼都沒刪', async () => {
    setup(async () => {
      changeMeanwhile((f) => {
        f.rooms = f.rooms.filter((r) => r.id !== 'a');
      });
      return 'all';
    });
    await act.deleteSelection();
    expect(ids()).toEqual([['b'], ['i1', 'i2'], ['t1']]);
    expect(steps()).toBe(0);
    expect(toasts).toEqual([]);
  });

  it('裡面的家具先被刪掉、再選「只刪房間」：只刪房間，照常通知與一步復原', async () => {
    setup(async () => {
      changeMeanwhile((f) => {
        f.items = f.items.filter((i) => i.id !== 'i1');
      });
      return 'room';
    });
    await act.deleteSelection();
    expect(ids()).toEqual([['b'], ['i2'], ['t1']]);
    expect(steps()).toBe(1);
    expect(toasts.map((t) => t.title)).toEqual(['已刪除 1 個']);
  });
});
