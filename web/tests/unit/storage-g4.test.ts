// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyTemplate,
  createPreviewStore,
  createToolStore,
  historyGesture,
  resetToolStore,
} from '@/core/storage';

describe('手勢：滑桿放開才記一步復原', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('拖曳中的多次變更（間隔再久）都算一步；放開後的下一個變更是新的一步', async () => {
    const s = createToolStore('g1', { size: 10, on: false }, { coalesceMs: 0 });
    const g = historyGesture(s);
    const drag = g.live((v: number) => s.getState().patch({ size: v }));
    drag(11);
    vi.advanceTimersByTime(1000);
    drag(12);
    vi.advanceTimersByTime(1000);
    drag(20);
    expect(s.temporal.getState().pastStates).toHaveLength(0);
    g.commit();
    await Promise.resolve();
    expect(s.temporal.getState().pastStates).toHaveLength(1);
    s.getState().patch({ on: true });
    expect(s.temporal.getState().pastStates).toHaveLength(2);
    s.temporal.getState().undo();
    expect(s.getState().data).toEqual({ size: 20, on: false });
    s.temporal.getState().undo();
    expect(s.getState().data).toEqual({ size: 10, on: false });
  });

  it('鍵盤操作滑桿是「先 commit 再 change」：每按一次仍是一步', async () => {
    const s = createToolStore('g4', { size: 10 }, { coalesceMs: 0 });
    const g = historyGesture(s);
    const change = g.live((v: number) => s.getState().patch({ size: v }));
    for (const v of [11, 12, 13]) {
      g.commit();
      change(v);
      await Promise.resolve();
    }
    expect(s.temporal.getState().pastStates).toHaveLength(3);
  });

  it('沒有變更的手勢不記錄；begin 重複呼叫沒有作用', () => {
    const s = createToolStore('g2', { v: 1 });
    s.beginGesture();
    s.beginGesture();
    expect(s.inGesture()).toBe(true);
    s.endGesture();
    expect(s.inGesture()).toBe(false);
    expect(s.temporal.getState().pastStates).toHaveLength(0);
    /* 改了又改回原值（同一個物件）也不記 */
    s.beginGesture();
    s.endGesture();
    expect(s.temporal.getState().pastStates).toHaveLength(0);
  });

  it('resetToolStore 回到初始值並清空復原紀錄', () => {
    const s = createToolStore('g3', { v: 1 }, { coalesceMs: 0 });
    s.getState().patch({ v: 2 });
    s.getState().patch({ v: 3 });
    resetToolStore(s);
    expect(s.getState().data).toEqual({ v: 1 });
    expect(s.temporal.getState().pastStates).toHaveLength(0);
  });
});

describe('預覽狀態（不列入復原）', () => {
  beforeEach(() => localStorage.clear());

  it('自動存檔在另一個鍵、復原設定時不受影響', () => {
    const settings = createToolStore('p1', { color: '#fff' }, { coalesceMs: 0 });
    const preview = createPreviewStore('p1', { background: 'checker', hp: 10 });
    settings.getState().patch({ color: '#000' });
    preview.getState().patch({ hp: 3 });
    settings.temporal.getState().undo();
    expect(settings.getState().data.color).toBe('#fff');
    expect(preview.getState().data.hp).toBe(3);
    expect(JSON.parse(localStorage.getItem('trpg-toolkit:p1:preview')!).state.data).toEqual({
      background: 'checker',
      hp: 3,
    });
    /* 重新建立時讀回（新欄位補預設值） */
    const again = createPreviewStore('p1', { background: 'checker', hp: 10, before: false });
    expect(again.getState().data).toEqual({ background: 'checker', hp: 3, before: false });
    again.getState().update((d) => {
      d.before = true;
    });
    expect(again.getState().data.before).toBe(true);
    again.getState().reset();
    expect(again.getState().data).toEqual({ background: 'checker', hp: 10, before: false });
    expect(createPreviewStore('p2', { a: 1 }, { persist: false }).storageKey).toBe(
      'trpg-toolkit:p2:preview',
    );
  });
});

describe('套用範本：換掉一部分、保留一部分', () => {
  const current = {
    barCount: 3,
    shape: 'round',
    text: { size: 17, color: '#fff' },
    bars: [
      { name: '理智', critical: false, color1: '#f00', symbol: 'heart' },
      { name: '', critical: true, color1: '#0f0', symbol: 'star' },
    ],
    characters: [{ id: 'a', name: '艾琳' }],
    roomUrl: 'https://ccfolia.com/rooms/abcd',
  };

  it('範本的欄位換掉、keep 的路徑（含 * 萬用字元）保留', () => {
    const next = applyTemplate(
      current,
      {
        barCount: 8,
        shape: 'capsule',
        text: { size: 20 },
        bars: [
          { name: 'X', critical: true, color1: '#111', symbol: 'none' },
          { name: 'Y', critical: false, color1: '#222', symbol: 'none' },
        ],
        characters: [],
      },
      { keep: ['barCount', 'bars.*.name', 'bars.*.critical', 'characters', 'roomUrl'] },
    );
    expect(next.barCount).toBe(3);
    expect(next.shape).toBe('capsule');
    expect(next.text).toEqual({ size: 20, color: '#fff' });
    expect(next.bars).toEqual([
      { name: '理智', critical: false, color1: '#111', symbol: 'none' },
      { name: '', critical: true, color1: '#222', symbol: 'none' },
    ]);
    expect(next.characters).toEqual([{ id: 'a', name: '艾琳' }]);
    expect(next.roomUrl).toBe(current.roomUrl);
    /* 不改動傳入的值 */
    expect(current.shape).toBe('round');
    expect(next.characters).not.toBe(current.characters);
  });

  it('範本陣列比較短時，keep 路徑上缺的項目整項保留', () => {
    const next = applyTemplate(
      current,
      { bars: [{ name: 'X', critical: true, color1: '#111', symbol: 'none' }] },
      { keep: ['bars.*.name'] },
    );
    expect(next.bars).toHaveLength(2);
    expect(next.bars[0]).toEqual({ name: '理智', critical: true, color1: '#111', symbol: 'none' });
    expect(next.bars[1]).toEqual(current.bars[1]);
  });
});
