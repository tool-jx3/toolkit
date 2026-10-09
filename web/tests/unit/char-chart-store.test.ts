/**
 * 角色分析圖產生器（char-chart）的動作與復原：
 * - 加入角色（四象限時放在目前這一頁的中央、關係圖時不放）、一次加入多張圖片、上限；
 * - 放到這一頁、從這一頁拿掉、刪除角色（選取、點了第一個人跟著清掉）、拿出關係圖（連線一起刪）；
 * - 頁面：新增（切過去）、刪除（至少一頁、停在同一個位置）、改字（截字）；座標碼套到目前的頁；
 * - 關係圖：點兩個人連線／同一對刪線／點同一人取消、目前的線、新增與刪除線的種類、隨機連線、清除；
 * - 復原：一次動作一步；方向鍵連按算一步、馬上復原只復原方向鍵那一步；拖曳手勢放開才算一步。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState, LIMITS, PALETTE } from '@/tools/char-chart/model';
import {
  addCharacter,
  addImageCharacters,
  addLegend,
  addPage,
  applyShare,
  chartNow,
  clearCharacters,
  clearLinks,
  clickNode,
  currentPageIndex,
  deletePage,
  flushNudge,
  gesture,
  goPage,
  historyStep,
  nudgeSelected,
  patchCharacter,
  patchLegend,
  placeCharacter,
  randomConnect,
  removeCharacter,
  removeLegend,
  replaceAll,
  select,
  setActiveLegend,
  setPageText,
  setPosition,
  unplaceCharacter,
  useChart,
  usePrefs,
  useUi,
} from '@/tools/char-chart/store';

const steps = () => useChart.temporal.getState().pastStates.length;
const IMG = { id: 'aimg1', name: 'a.png', width: 100, height: 200 };

beforeEach(() => {
  let t = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => {
    t += 10;
    return t;
  });
  flushNudge();
  replaceAll(initialState());
  useChart.temporal.getState().clear();
  usePrefs.getState().replace(usePrefs.initial);
});

describe('角色', () => {
  it('加入：四象限放在目前這一頁的中央並選取；關係圖時不放；名字截到 40 字', () => {
    goPage(1);
    const a = addCharacter({ name: '艾琳' }, currentPageIndex());
    expect(a).toBe('c1');
    expect(useUi.getState().selectedId).toBe('c1');
    expect(chartNow().pages[1].positions).toEqual({ c1: { x: 0, y: 0 } });
    expect(chartNow().pages[0].positions).toEqual({});
    addCharacter({ name: '長'.repeat(50), color: '#123456' }, null);
    const b = chartNow().characters[1];
    expect(b.name).toHaveLength(LIMITS.name);
    expect(b.color).toBe('#123456');
    expect(chartNow().pages[1].positions.c2).toBeUndefined();
    expect(steps()).toBe(2);
  });

  it('一次加入多張圖片：每張一個角色（圖片標記、顏色依序）、最後一個選取；到上限就停', () => {
    const ids = addImageCharacters(
      [
        { name: 'a', image: IMG },
        { name: 'b', image: { ...IMG, id: 'aimg2' } },
      ],
      0,
    );
    expect(ids).toEqual(['c1', 'c2']);
    expect(chartNow().characters.map((c) => [c.marker, c.color])).toEqual([
      ['image', PALETTE[0]],
      ['image', PALETTE[1]],
    ]);
    expect(useUi.getState().selectedId).toBe('c2');
    expect(steps()).toBe(1);
    const many = Array.from({ length: LIMITS.characters }, (_, i) => ({
      name: `x${i}`,
      image: IMG,
    }));
    expect(addImageCharacters(many, null)).toHaveLength(LIMITS.characters - 2);
    expect(addCharacter({ name: '多' }, null)).toBeNull();
  });

  it('放到這一頁／拿掉；拖曳位置夾在畫布裡；刪除角色清掉選取與連線', () => {
    addCharacter({ name: 'a' }, null);
    addCharacter({ name: 'b' }, null);
    placeCharacter('c1', 2, { x: 50, y: -20 });
    expect(chartNow().pages[2].positions.c1).toEqual({ x: 50, y: -20 });
    setPosition('c1', 2, { x: 900, y: 0 });
    expect(chartNow().pages[2].positions.c1).toEqual({ x: 400, y: 0 });
    unplaceCharacter('c1', 2);
    expect(chartNow().pages[2].positions).toEqual({});
    clickNode('c1');
    clickNode('c2');
    expect(chartNow().relation.links).toHaveLength(1);
    select('c1');
    clickNode('c1');
    removeCharacter('c1');
    expect(useUi.getState()).toMatchObject({ selectedId: null, linkFrom: null });
    expect(chartNow().relation.links).toEqual([]);
  });

  it('拿出關係圖：這個人的連線一起刪（可以復原）；沒有圖片時標記一律圓點', () => {
    addCharacter({ name: 'a' }, null);
    addCharacter({ name: 'b', image: IMG }, null);
    clickNode('c1');
    clickNode('c2');
    patchCharacter('c2', { inMap: false });
    expect(chartNow().relation.links).toEqual([]);
    historyStep('undo');
    expect(chartNow().relation.links).toHaveLength(1);
    patchCharacter('c1', { marker: 'image' });
    expect(chartNow().characters[0].marker).toBe('dot');
    patchCharacter('c2', { marker: 'dot' });
    expect(chartNow().characters[1].marker).toBe('dot');
  });

  it('刪除所有角色：位置與連線清掉，頁面與線留著', () => {
    addCharacter({ name: 'a' }, 0);
    addCharacter({ name: 'b' }, 0);
    clickNode('c1');
    clickNode('c2');
    clearCharacters();
    const d = chartNow();
    expect(d.characters).toEqual([]);
    expect(d.pages.map((p) => p.positions)).toEqual([{}, {}, {}]);
    expect(d.relation.links).toEqual([]);
    expect(d.relation.legends).toHaveLength(5);
  });
});

describe('頁面', () => {
  it('新增：加在最後並切過去；刪除：至少一頁、停在同一個位置（最後一頁時往前）', () => {
    expect(addPage()).toBe(true);
    expect(chartNow().pages.map((p) => p.title)).toEqual([
      '角色性格分布',
      '調查員的行動風格',
      '面對神話的態度',
      '新頁面 4',
    ]);
    expect(chartNow().pages[3].labels).toEqual({
      top: '上',
      bottom: '下',
      left: '左',
      right: '右',
    });
    expect(currentPageIndex()).toBe(3);
    deletePage(3);
    expect(currentPageIndex()).toBe(2);
    goPage(0);
    deletePage(0);
    expect(currentPageIndex()).toBe(0);
    expect(chartNow().pages[0].title).toBe('調查員的行動風格');
    deletePage(0);
    expect(deletePage(0)).toBe(false);
    expect(chartNow().pages).toHaveLength(1);
  });

  it('改標題與軸名（截字）；座標碼套到目前的頁', () => {
    setPageText(0, 'title', 'T'.repeat(70));
    setPageText(0, 'left', '左'.repeat(40));
    expect(chartNow().pages[0].title).toHaveLength(LIMITS.title);
    expect(chartNow().pages[0].labels.left).toHaveLength(LIMITS.axis);
    addCharacter({ name: '艾琳' }, null);
    goPage(2);
    expect(applyShare([{ name: '艾琳', color: '', x: 5, y: 6 }])).toEqual({
      added: 0,
      updated: 1,
      skipped: 0,
    });
    expect(chartNow().pages[2].positions).toEqual({ c1: { x: 5, y: 6 } });
  });
});

describe('關係圖', () => {
  beforeEach(() => {
    for (const n of ['a', 'b', 'c']) addCharacter({ name: n }, null);
  });

  it('依序點兩個人：用目前的線連 from → to；同一對再連一次刪掉；點同一人取消', () => {
    setActiveLegend('l2');
    expect(clickNode('c1')).toBe('start');
    expect(useUi.getState().linkFrom).toBe('c1');
    expect(clickNode('c2')).toBe('added');
    expect(chartNow().relation.links).toEqual([{ from: 'c1', to: 'c2', legend: 'l2' }]);
    expect(useUi.getState().linkFrom).toBeNull();
    clickNode('c2');
    expect(clickNode('c1')).toBe('removed');
    expect(chartNow().relation.links).toEqual([]);
    clickNode('c3');
    expect(clickNode('c3')).toBe('cancel');
    expect(useUi.getState().linkFrom).toBeNull();
    /* 目前的線不存在時用第一種 */
    setActiveLegend('l99');
    clickNode('c1');
    clickNode('c3');
    expect(chartNow().relation.links[0].legend).toBe('l1');
  });

  it('線的種類：新增（切過去、顏色用沒用過的）、改、刪除（目前的換成第一種；最後一種不刪）', () => {
    const id = addLegend();
    expect(id).toBe('l6');
    expect(usePrefs.getState().data.legend).toBe('l6');
    expect(chartNow().relation.legends[5]).toMatchObject({ label: '關係 6', style: 'solid' });
    patchLegend('l6', { label: '這是一個超過二十個字的線的種類名稱所以會被截掉', style: 'dash' });
    expect(chartNow().relation.legends[5].label).toHaveLength(LIMITS.legend);
    clickNode('c1');
    clickNode('c2');
    expect(removeLegend('l6')).toBe(true);
    expect(chartNow().relation.links).toEqual([]);
    expect(usePrefs.getState().data.legend).toBe('l1');
    for (const l of ['l1', 'l2', 'l3', 'l4']) removeLegend(l);
    expect(removeLegend('l5')).toBe(false);
  });

  it('隨機連線：人數 − 1 條；不到兩人時 -1；清除', () => {
    const seq = [0.1, 0.5, 0, 0.5, 0.9, 0];
    let i = 0;
    expect(randomConnect(() => seq[i++ % seq.length])).toBe(2);
    expect(chartNow().relation.links).toHaveLength(2);
    clearLinks();
    expect(chartNow().relation.links).toEqual([]);
    patchCharacter('c2', { inMap: false });
    patchCharacter('c3', { inMap: false });
    expect(randomConnect()).toBe(-1);
  });
});

describe('復原', () => {
  it('方向鍵連按算一步；馬上復原只復原方向鍵那一步，可以重做', () => {
    addCharacter({ name: 'a' }, 0);
    setPosition('c1', 0, { x: 10, y: 10 });
    const before = steps();
    nudgeSelected(1, 0);
    nudgeSelected(1, 0);
    nudgeSelected(0, 10);
    expect(chartNow().pages[0].positions.c1).toEqual({ x: 12, y: 20 });
    historyStep('undo');
    expect(chartNow().pages[0].positions.c1).toEqual({ x: 10, y: 10 });
    expect(steps()).toBe(before);
    historyStep('redo');
    expect(chartNow().pages[0].positions.c1).toEqual({ x: 12, y: 20 });
  });

  it('拖曳（手勢）放開才算一步；手勢中復原不做事', () => {
    addCharacter({ name: 'a' }, 0);
    const before = steps();
    gesture.begin();
    setPosition('c1', 0, { x: 5, y: 0 });
    setPosition('c1', 0, { x: 50, y: 0 });
    historyStep('undo');
    expect(chartNow().pages[0].positions.c1).toEqual({ x: 50, y: 0 });
    useChart.endGesture();
    expect(steps()).toBe(before + 1);
    historyStep('undo');
    expect(chartNow().pages[0].positions.c1).toEqual({ x: 0, y: 0 });
  });
});
