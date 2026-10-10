// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyTemplate,
  createPreviewStore,
  createToolStore,
  historyGesture,
  resetToolStore,
  safeStorage,
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

  it('手勢中改了又改回原樣（內容相同、不同的物件）：不記一步（lock-screen 對等驗證 F61）', async () => {
    const s = createToolStore('g5', { text: 'abc', list: [{ a: 1 }], n: 1 }, { coalesceMs: 0 });
    s.getState().patch({ n: 2 });
    expect(s.temporal.getState().pastStates).toHaveLength(1);
    const g = historyGesture(s);
    /* 在文字欄打字，再用瀏覽器原生的復原改回原樣後離開 */
    g.begin();
    s.getState().update((d) => {
      d.text = 'abcd';
      d.list[0].a = 2;
    });
    s.getState().update((d) => {
      d.text = 'abc';
      d.list[0].a = 1;
    });
    g.commit();
    await Promise.resolve();
    expect(s.temporal.getState().pastStates).toHaveLength(1);
    /* 第一次復原就回到 n: 1（不會有一步沒有變化的復原） */
    s.temporal.getState().undo();
    expect(s.getState().data).toEqual({ text: 'abc', list: [{ a: 1 }], n: 1 });
    /* 真的有改的手勢照常記一步 */
    s.temporal.getState().redo();
    g.begin();
    s.getState().update((d) => {
      d.text = 'xyz';
    });
    g.commit();
    await Promise.resolve();
    expect(s.temporal.getState().pastStates).toHaveLength(2);
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

describe('localStorage 讀寫失敗時不丟例外（chat-window F96）', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('寫入被擋（setItem 丟錯）：預覽 store 照常更新、不丟例外，並通知 onPersistError', () => {
    const blocked = new DOMException('blocked', 'QuotaExceededError');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw blocked;
    });
    const errors: unknown[] = [];
    const preview = createPreviewStore(
      'blocked1',
      { tab: 'main', hp: 10 },
      { onPersistError: (e) => errors.push(e) },
    );
    expect(() => preview.getState().patch({ hp: 3 })).not.toThrow();
    expect(() =>
      preview.getState().update((d) => {
        d.tab = 'secret';
      }),
    ).not.toThrow();
    expect(() => preview.getState().reset()).not.toThrow();
    expect(preview.getState().data).toEqual({ tab: 'main', hp: 10 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toBe(blocked);
    /* 不給 onPersistError 也一樣不丟 */
    const quiet = createPreviewStore('blocked2', { a: 1 });
    expect(() => quiet.getState().patch({ a: 2 })).not.toThrow();
    expect(quiet.getState().data.a).toBe(2);
    /* 設定 store 也照常（既有行為） */
    const settings = createToolStore('blocked3', { v: 1 }, { coalesceMs: 0 });
    expect(() => settings.getState().patch({ v: 2 })).not.toThrow();
    expect(settings.getState().data.v).toBe(2);
  });

  it('讀取被擋（getItem 丟錯）：用初始值開始，之後照常寫入', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const preview = createPreviewStore('blocked4', { bg: 'checker' });
    const settings = createToolStore('blocked4', { size: 5 });
    expect(preview.getState().data).toEqual({ bg: 'checker' });
    expect(settings.getState().data).toEqual({ size: 5 });
    get.mockRestore();
    preview.getState().patch({ bg: 'dark' });
    expect(JSON.parse(localStorage.getItem('trpg-toolkit:blocked4:preview')!).state.data).toEqual({
      bg: 'dark',
    });
  });

  it('safeStorage：自訂儲存位置丟錯時也攔下（removeItem 一樣）', () => {
    const bad = {
      getItem: () => {
        throw new Error('get');
      },
      setItem: () => {
        throw new Error('set');
      },
      removeItem: () => {
        throw new Error('remove');
      },
    };
    const errors: unknown[] = [];
    const s = safeStorage(bad, (e) => errors.push(e));
    expect(s.getItem('x')).toBeNull();
    expect(() => s.setItem('x', '1')).not.toThrow();
    expect(() => s.removeItem('x')).not.toThrow();
    expect(errors).toHaveLength(1);
    const p = createPreviewStore('blocked5', { n: 0 }, { storage: bad });
    expect(() => p.getState().patch({ n: 1 })).not.toThrow();
    expect(p.getState().data.n).toBe(1);
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

describe('清空復原紀錄後的第一個變更', () => {
  it('取代內容並清空復原紀錄後馬上改：記成一步（不併進清掉的那一步）', () => {
    const s = createToolStore('clear-coalesce', { v: 1 }, { persist: false });
    /* 開頁整理、開專案檔：取代內容再清空復原紀錄 */
    s.getState().replace({ v: 2 });
    s.temporal.getState().clear();
    /* 0.4 秒內接著改 */
    s.getState().update((d) => {
      d.v = 3;
    });
    expect(s.temporal.getState().pastStates.length).toBe(1);
    s.temporal.getState().undo();
    expect(s.getState().data.v).toBe(2);
  });
});
