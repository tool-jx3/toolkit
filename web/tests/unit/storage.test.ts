// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createToolStore,
  getSaveTime,
  ProjectFileError,
  parseProject,
  serializeProject,
} from '@/core/storage';

describe('createToolStore', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('自動存到 localStorage，重新建立時讀回來', () => {
    const a = createToolStore('t1', { fps: 30, name: '艾琳' });
    a.getState().update((d) => {
      d.fps = 12;
    });
    expect(JSON.parse(localStorage.getItem('trpg-toolkit:t1')!).state.data.fps).toBe(12);
    expect(getSaveTime('t1')).toBe(Date.now());
    const b = createToolStore('t1', { fps: 30, name: '艾琳', extra: true });
    expect(b.getState().data).toEqual({ fps: 12, name: '艾琳', extra: true });
  });

  it('復原／重做；連續快速變更合併成一步', () => {
    const s = createToolStore('t2', { v: 0 });
    s.getState().patch({ v: 1 });
    vi.advanceTimersByTime(100);
    s.getState().patch({ v: 2 });
    vi.advanceTimersByTime(100);
    s.getState().patch({ v: 3 });
    vi.advanceTimersByTime(1000);
    s.getState().patch({ v: 10 });
    expect(s.temporal.getState().pastStates.length).toBe(2);
    s.temporal.getState().undo();
    expect(s.getState().data.v).toBe(3);
    s.temporal.getState().undo();
    expect(s.getState().data.v).toBe(0);
    s.temporal.getState().redo();
    expect(s.getState().data.v).toBe(3);
    /* 復原的結果也會存檔 */
    expect(JSON.parse(localStorage.getItem('trpg-toolkit:t2')!).state.data.v).toBe(3);
  });

  it('沒有變化的 update 不記錄歷史；reset 回到初始值', () => {
    const s = createToolStore('t3', { v: 1 });
    s.getState().update(() => {});
    expect(s.temporal.getState().pastStates.length).toBe(0);
    s.getState().patch({ v: 5 });
    s.getState().reset();
    expect(s.getState().data.v).toBe(1);
  });

  it('版本升級時呼叫 migrate', () => {
    localStorage.setItem(
      'trpg-toolkit:t4',
      JSON.stringify({ state: { data: { size: 3 } }, version: 1 }),
    );
    const s = createToolStore(
      't4',
      { width: 1 },
      { version: 2, migrate: (old) => ({ width: (old as { size: number }).size * 10 }) },
    );
    expect(s.getState().data.width).toBe(30);
  });
});

describe('專案檔', () => {
  it('存成 JSON 再讀回來', () => {
    const text = serializeProject('demo', 2, { a: 1 }, new Date('2026-10-01T00:00:00Z'));
    const p = parseProject<{ a: number }>(text, 'demo');
    expect(p).toMatchObject({
      tool: 'demo',
      version: 2,
      savedAt: '2026-10-01T00:00:00.000Z',
      data: { a: 1 },
    });
  });

  it('格式錯誤或其他工具的檔案給清楚的訊息', () => {
    expect(() => parseProject('不是 JSON', 'demo')).toThrow(ProjectFileError);
    expect(() => parseProject('{"x":1}', 'demo')).toThrow(/不是 TRPG Toolkit/);
    expect(() => parseProject(serializeProject('other', 1, {}), 'demo')).toThrow(
      /其他工具（other）/,
    );
  });
});
