// @vitest-environment jsdom
/**
 * useUndoRedo：手勢（滑桿聚焦到離開算一步）還開著時按復原，要先把手勢裡的變更記成一步、再退那一步；
 * 不然退掉的是手勢之前的一步，手勢裡的變更沒有記下來（floor-plan 不透明度滑桿，7.10）。
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createToolStore, historyGesture, useUndoRedo } from '@/core/storage';

describe('useUndoRedo 與手勢', () => {
  beforeEach(() => localStorage.clear());

  it('手勢開著時 undo：只退手勢裡的變更（手勢之前的一步還在）', () => {
    const s = createToolStore('ur1', { size: 0, alpha: 40 }, { coalesceMs: 0 });
    s.getState().patch({ size: 2 });
    const { result } = renderHook(() => useUndoRedo(s));
    const g = historyGesture(s);
    /* 滑桿聚焦（手勢開始）、調了兩次，還沒離開 */
    g.begin();
    s.getState().patch({ alpha: 60 });
    s.getState().patch({ alpha: 100 });
    expect(s.inGesture()).toBe(true);
    act(() => result.current.undo());
    expect(s.getState().data).toEqual({ size: 2, alpha: 40 });
    expect(s.inGesture()).toBe(false);
    /* 再復原一次回到手勢之前的那一步 */
    act(() => result.current.undo());
    expect(s.getState().data).toEqual({ size: 0, alpha: 40 });
    expect(s.temporal.getState().pastStates).toHaveLength(0);
    /* 重做依序回來 */
    act(() => result.current.redo());
    expect(s.getState().data).toEqual({ size: 2, alpha: 40 });
    act(() => result.current.redo());
    expect(s.getState().data).toEqual({ size: 2, alpha: 100 });
  });

  it('手勢開著、沒有變更時 undo：只結束手勢，照常退上一步', () => {
    const s = createToolStore('ur2', { v: 0 }, { coalesceMs: 0 });
    s.getState().patch({ v: 1 });
    const { result } = renderHook(() => useUndoRedo(s));
    s.beginGesture();
    act(() => result.current.undo());
    expect(s.getState().data).toEqual({ v: 0 });
    expect(s.inGesture()).toBe(false);
  });

  it('沒有手勢時 redo／undo 照舊；離開欄位（commit）之後才跑的微任務不會多記一步', async () => {
    const s = createToolStore('ur3', { v: 0 }, { coalesceMs: 0 });
    const { result } = renderHook(() => useUndoRedo(s));
    const g = historyGesture(s);
    g.begin();
    s.getState().patch({ v: 5 });
    /* 復原先結束手勢；接著 blur 的 commit 才在微任務裡執行：什麼都不做 */
    act(() => result.current.undo());
    g.commit();
    await Promise.resolve();
    expect(s.getState().data).toEqual({ v: 0 });
    expect(s.temporal.getState().pastStates).toHaveLength(0);
    expect(s.temporal.getState().futureStates).toHaveLength(1);
    act(() => result.current.redo());
    expect(s.getState().data).toEqual({ v: 5 });
    /* 之後的新手勢照常記一步 */
    g.begin();
    s.getState().patch({ v: 6 });
    g.commit();
    await Promise.resolve();
    expect(s.temporal.getState().pastStates).toHaveLength(2);
  });
});
