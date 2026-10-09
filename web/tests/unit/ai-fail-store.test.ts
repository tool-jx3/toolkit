/**
 * AI 誤判梗圖產生器（ai-fail）的動作與復原：
 * - 放進照片清掉所有框與選取、依比例重算畫布、照片置中；
 * - 換比例：框跟著縮放、照片回到置中；選目前的比例不做事（D7）；
 * - 畫框：太小不建立、建立後選取並回到選取模式；刪除、上下層（選取跟著同一個框）；
 * - 放大、平移、重設位置；
 * - 復原：一次動作一步；方向鍵連按算一步；拖曳手勢放開才算一步。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState } from '@/tools/ai-fail/model';
import {
  addBox,
  applyPhoto,
  flushNudge,
  gesture,
  memeNow,
  moveBoxLayer,
  nudgeSelected,
  panPhoto,
  patchBox,
  removeBox,
  resetView,
  select,
  setAspect,
  setMode,
  setZoom,
  stepLayer,
  useMeme,
  useUi,
} from '@/tools/ai-fail/store';

const PHOTO = { id: 'aphoto1', name: 'cat.jpg', width: 400, height: 300 };
const undo = () => useMeme.temporal.getState().undo();
const steps = () => useMeme.temporal.getState().pastStates.length;

beforeEach(() => {
  /*
   * 復原紀錄以時間判斷「連續變更」：同一毫秒內的兩次變更會併成一步（實際操作不會這麼快）。
   * 測試裡一口氣做好幾個動作，所以讓每次讀時間都往後 10 ms。
   */
  let t = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => {
    t += 10;
    return t;
  });
  flushNudge();
  useMeme.getState().replace(initialState());
  useMeme.temporal.getState().clear();
  useUi.setState({ selectedId: null, mode: 'select', drawing: null });
});

describe('照片', () => {
  it('放進照片：清掉框與選取、照片置中；原圖比例依照片', () => {
    applyPhoto(PHOTO);
    addBox({ x: 10, y: 10, width: 50, height: 50 });
    expect(memeNow().boxes).toHaveLength(1);
    applyPhoto({ ...PHOTO, id: 'aphoto2', width: 300, height: 500 });
    expect(memeNow().boxes).toEqual([]);
    expect(useUi.getState().selectedId).toBeNull();
    /* 原圖 720 × 1200，照片剛好鋪滿 */
    expect(memeNow().view).toEqual({ zoom: 1, x: 0, y: 0 });
    undo();
    expect(memeNow().boxes).toHaveLength(1);
  });

  it('放大、平移、重設位置', () => {
    setAspect('1:1');
    applyPhoto(PHOTO);
    setZoom(2);
    expect(memeNow().view.zoom).toBe(2);
    panPhoto(memeNow().view, 99999, 99999);
    expect(memeNow().view).toMatchObject({ x: 0, y: 0 });
    resetView();
    expect(memeNow().view.zoom).toBe(1);
    expect(memeNow().view.x).toBeCloseTo(-166.667, 2);
  });
});

describe('比例', () => {
  it('換比例：框跟著縮放、照片回到置中；選目前的比例不做事', () => {
    applyPhoto(PHOTO);
    addBox({ x: 120, y: 90, width: 300, height: 150 });
    setZoom(3);
    const before = steps();
    setAspect('native');
    expect(steps()).toBe(before);
    setAspect('3:4');
    expect(memeNow().boxes[0]).toMatchObject({
      x: 90,
      y: 120,
      width: 225,
      height: 200,
      fontSize: 30,
      lineWidth: 3,
    });
    expect(memeNow().view.zoom).toBe(1);
    undo();
    expect(memeNow().aspect).toBe('native');
    expect(memeNow().boxes[0]).toMatchObject({ x: 120, y: 90 });
  });
});

describe('框', () => {
  it('太小不建立（維持新增框模式）；建立後選取、回到選取模式', () => {
    applyPhoto(PHOTO);
    setMode('draw');
    expect(addBox({ x: 0, y: 0, width: 12, height: 300 })).toBe(false);
    expect(useUi.getState().mode).toBe('draw');
    expect(addBox({ x: 0, y: 0, width: 13, height: 13 })).toBe(true);
    expect(useUi.getState()).toMatchObject({ mode: 'select', selectedId: 'b1' });
    expect(memeNow().boxes[0]).toMatchObject({
      label: 'object',
      color: '#59b64c',
      lineWidth: 4,
      fontSize: 40,
    });
  });

  it('沒有照片時不能畫', () => {
    expect(addBox({ x: 0, y: 0, width: 100, height: 100 })).toBe(false);
  });

  it('上下層：同一個框保持選取；刪除選取的框之後沒有選取', () => {
    applyPhoto(PHOTO);
    for (let i = 0; i < 3; i++) addBox({ x: i * 10, y: 0, width: 50, height: 50 });
    select('b1');
    stepLayer(1);
    expect(memeNow().boxes.map((b) => b.id)).toEqual(['b2', 'b1', 'b3']);
    expect(useUi.getState().selectedId).toBe('b1');
    stepLayer(1);
    stepLayer(1);
    expect(memeNow().boxes.map((b) => b.id)).toEqual(['b2', 'b3', 'b1']);
    moveBoxLayer(2, 0);
    expect(memeNow().boxes.map((b) => b.id)).toEqual(['b1', 'b2', 'b3']);
    stepLayer(-1);
    expect(memeNow().boxes.map((b) => b.id)).toEqual(['b1', 'b2', 'b3']);
    removeBox('b1');
    expect(useUi.getState().selectedId).toBeNull();
    expect(memeNow().boxes.map((b) => b.id)).toEqual(['b2', 'b3']);
  });
});

describe('復原', () => {
  it('方向鍵連按算一步；停頓之後是新的一步', () => {
    vi.useFakeTimers();
    try {
      applyPhoto(PHOTO);
      addBox({ x: 100, y: 100, width: 50, height: 50 });
      const before = steps();
      nudgeSelected(1, 0);
      nudgeSelected(1, 0);
      nudgeSelected(0, 10);
      vi.advanceTimersByTime(600);
      expect(steps()).toBe(before + 1);
      expect(memeNow().boxes[0]).toMatchObject({ x: 102, y: 110 });
      nudgeSelected(-1, 0);
      vi.advanceTimersByTime(600);
      expect(steps()).toBe(before + 2);
      undo();
      undo();
      expect(memeNow().boxes[0]).toMatchObject({ x: 100, y: 100 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('拖曳手勢放開才算一步；沒有變更時不記', async () => {
    applyPhoto(PHOTO);
    addBox({ x: 100, y: 100, width: 50, height: 50 });
    const before = steps();
    gesture.begin();
    for (let i = 1; i <= 5; i++) patchBox('b1', { x: 100 + i * 10 });
    gesture.commit();
    await Promise.resolve();
    expect(steps()).toBe(before + 1);
    gesture.begin();
    gesture.commit();
    await Promise.resolve();
    expect(steps()).toBe(before + 1);
    undo();
    expect(memeNow().boxes[0].x).toBe(100);
  });
});
