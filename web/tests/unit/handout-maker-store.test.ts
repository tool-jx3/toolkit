/**
 * 線索道具產生器（handout-maker）的動作與復原（規格 F01、F04、F21、F23、F24）：
 * 清單（新增、副本、刪除、排序、至少一張、最多 60 張）、目前編輯的那一張、換主題的配色、對齊 24 px、寬高的確定、
 * 套用範例、專案檔的讀入（資料不對時丟錯）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyExample, EXAMPLES } from '@/tools/handout-maker/examples';
import { blankHandout, HANDOUT_MAX } from '@/tools/handout-maker/model';
import { importProject, isProjectData } from '@/tools/handout-maker/project';
import {
  activeNow,
  addBlank,
  docNow,
  duplicateActive,
  editActive,
  historyStep,
  moveHandout,
  prefsNow,
  removeHandout,
  replaceActive,
  resetAll,
  select,
  setSize,
  setSnap,
  setTheme,
  useDoc,
} from '@/tools/handout-maker/store';

const steps = () => useDoc.temporal.getState().pastStates.length;
const ids = () => docNow().items.map((h) => h.id);

beforeEach(() => {
  /* 復原紀錄以時間判斷連續變更：每次讀時間往後 10 ms */
  let t = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => {
    t += 10;
    return t;
  });
  resetAll({ items: [blankHandout('basic', 'a')] });
  useDoc.temporal.getState().clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('清單', () => {
  it('新增一張：放在目前這張後面並選取；主題與大小跟目前這張相同、內容空白', () => {
    editActive((h) => {
      h.theme = 'memo';
      h.width = 480;
      h.title = '有字';
    });
    const id = addBlank();
    expect(ids()).toEqual(['a', id]);
    expect(prefsNow().active).toBe(id);
    const h = activeNow();
    expect([h.theme, h.width, h.title]).toEqual(['memo', 480, '']);
  });

  it('建立副本：內容相同、id 不同，加在目前這張後面', () => {
    editActive((h) => {
      h.title = '原本';
    });
    addBlank();
    select('a');
    const dup = duplicateActive();
    expect(ids()[1]).toBe(dup);
    expect(activeNow().title).toBe('原本');
    expect(activeNow().id).not.toBe('a');
  });

  it('刪除：至少留一張；刪掉目前這張時改選同一個位置的那張；可以復原', () => {
    expect(removeHandout('a')).toBeNull();
    const b = addBlank() as string;
    const c = addBlank() as string;
    select(b);
    const before = steps();
    expect(removeHandout(b)?.id).toBe(b);
    expect(ids()).toEqual(['a', c]);
    expect(prefsNow().active).toBe(c);
    expect(steps()).toBe(before + 1);
    historyStep('undo');
    expect(ids()).toEqual(['a', b, c]);
  });

  it('排序（一步復原）；超出範圍不做事', () => {
    const b = addBlank() as string;
    const c = addBlank() as string;
    moveHandout(2, 0);
    expect(ids()).toEqual([c, 'a', b]);
    moveHandout(0, 5);
    expect(ids()).toEqual([c, 'a', b]);
    historyStep('undo');
    expect(ids()).toEqual(['a', b, c]);
  });

  it(`最多 ${HANDOUT_MAX} 張`, () => {
    resetAll({
      items: Array.from({ length: HANDOUT_MAX }, (_, i) => blankHandout('basic', `x${i}`)),
    });
    expect(addBlank()).toBeNull();
    expect(duplicateActive()).toBeNull();
    expect(docNow().items).toHaveLength(HANDOUT_MAX);
  });

  it('目前這張的 id 找不到時用第一張', () => {
    select('nope');
    expect(activeNow().id).toBe('a');
  });
});

describe('設定', () => {
  it('換主題：預設配色跟著換（一步）；改過顏色就不換', () => {
    setTheme('terminal');
    expect([activeNow().bgColor, activeNow().textColor]).toEqual(['#000000', '#00ff00']);
    editActive((h) => {
      h.textColor = '#ff8800';
    });
    setTheme('basic');
    expect([activeNow().bgColor, activeNow().textColor]).toEqual(['#000000', '#ff8800']);
    historyStep('undo');
    expect(activeNow().theme).toBe('terminal');
  });

  it('打開對齊 24 px：寬高馬上對齊；關掉時不動', () => {
    setSize('width', 400, true);
    setSize('height', 500, true);
    setSnap(true);
    expect([activeNow().width, activeNow().height]).toEqual([408, 504]);
    setSnap(false);
    expect([activeNow().width, activeNow().height]).toEqual([408, 504]);
  });

  it('寬高打字中照打的值，確定時才對齊並夾在範圍內', () => {
    setSnap(true);
    setSize('width', 401);
    expect(activeNow().width).toBe(401);
    setSize('width', 401, true);
    expect(activeNow().width).toBe(408);
    setSize('height', 10, true);
    expect(activeNow().height).toBe(96);
  });

  it('套用範例（取代目前這張）：id 不變、一步復原', () => {
    replaceActive(applyExample(activeNow(), EXAMPLES.wanted));
    expect(activeNow()).toMatchObject({ id: 'a', theme: 'wanted', title: EXAMPLES.wanted.title });
    historyStep('undo');
    expect(activeNow().theme).toBe('basic');
  });
});

describe('專案檔', () => {
  it('不是線索道具的資料時丟錯', async () => {
    expect(isProjectData({ items: [] })).toBe(true);
    expect(isProjectData({ messages: [] })).toBe(false);
    await expect(importProject({ foo: 1 }, new Map())).rejects.toThrow(
      '檔案裡沒有線索道具的資料。',
    );
  });

  it('沒有圖片的專案檔讀得進來（整理過）', async () => {
    const r = await importProject({ items: [{ id: 'p1', theme: 'sms', body: 'hi' }] }, new Map());
    expect(r.state.items[0]).toMatchObject({ id: 'p1', theme: 'sms', body: 'hi' });
  });
});
