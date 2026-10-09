/**
 * 劇本心得九宮格（review-grid）的動作與復原：格子（加、刪、排序、改字、圖片）、心得標籤（選、上限、清單的增刪改、回到預設）、
 * 一次放入多張圖片、排列與比例、讀檔取代；一次動作一步復原、文字欄的手勢算一步。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TAGS, initialState, LIMITS } from '@/tools/review-grid/model';
import {
  addCell,
  addTag,
  fillImages,
  gesture,
  historyStep,
  moveCell,
  moveTag,
  patchProfile,
  removeCell,
  removeTag,
  renameTag,
  replaceAll,
  resetTags,
  reviewNow,
  select,
  selectedCellOf,
  setCellImage,
  setCellText,
  setRatio,
  setView,
  toggleCellTag,
  useReview,
  useUi,
} from '@/tools/review-grid/store';

const steps = () => useReview.temporal.getState().pastStates.length;
const img = (id: string) => ({ id, name: `${id}.png`, width: 100, height: 100 });

beforeEach(() => {
  let t = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => {
    t += 10;
    return t;
  });
  replaceAll(initialState());
  useReview.temporal.getState().clear();
});

describe('格子', () => {
  it('加一格：加在最後並選取；到上限時不加', () => {
    const id = addCell();
    expect(id).toBe('c10');
    expect(reviewNow().cells.at(-1)?.id).toBe('c10');
    expect(useUi.getState().selectedId).toBe('c10');
    for (let i = reviewNow().cells.length; i < LIMITS.cells; i++) addCell();
    expect(reviewNow().cells).toHaveLength(LIMITS.cells);
    expect(addCell()).toBeNull();
  });

  it('刪除：至少留一格；刪掉選取的格子時改選同一個位置的', () => {
    select('c3');
    expect(removeCell('c3')).toBe(true);
    expect(reviewNow().cells.map((c) => c.id)).not.toContain('c3');
    expect(useUi.getState().selectedId).toBe('c4');
    replaceAll({ ...initialState(), cells: [initialState().cells[0]] });
    expect(removeCell('c1')).toBe(false);
    expect(reviewNow().cells).toHaveLength(1);
  });

  it('沒有選取時是第一格', () => {
    select(null);
    expect(selectedCellOf(reviewNow(), null).id).toBe('c1');
    expect(selectedCellOf(reviewNow(), 'zzz').id).toBe('c1');
  });

  it('排序', () => {
    moveCell(0, 2);
    expect(
      reviewNow()
        .cells.slice(0, 3)
        .map((c) => c.id),
    ).toEqual(['c2', 'c3', 'c1']);
  });

  it('改字：單行欄位截字、換行換成空白；感想保留換行', () => {
    setCellText('c1', 'title', `${'雨'.repeat(70)}`);
    setCellText('c1', 'rule', 'CoC\n7版');
    setCellText('c1', 'comment', '一\r\n二');
    const c = reviewNow().cells[0];
    expect(Array.from(c.title)).toHaveLength(LIMITS.title);
    expect(c.rule).toBe('CoC 7版');
    expect(c.comment).toBe('一\n二');
  });

  it('個人資料與圖片', () => {
    patchProfile({ name: '阿草', handle: '@kusa' });
    setCellImage('c2', img('a'));
    expect(reviewNow().profile).toMatchObject({ name: '阿草', handle: '@kusa' });
    expect(reviewNow().cells[1].image).toEqual(img('a'));
    setCellImage('c2', null);
    expect(reviewNow().cells[1].image).toBeNull();
  });

  it('排列、比例', () => {
    setView('list');
    setRatio('original');
    expect(reviewNow()).toMatchObject({ view: 'list', ratio: 'original' });
  });
});

describe('一次放入多張圖片', () => {
  it('從指定的格子開始，其餘放進後面沒有圖片的格子；選取第一格；一步復原', () => {
    setCellImage('c3', img('old'));
    const before = steps();
    const r = fillImages([img('a'), img('b'), img('c')], 'c2');
    expect(r).toEqual({ ids: ['c2', 'c4', 'c5'], dropped: 0 });
    expect(reviewNow().cells[2].image?.id).toBe('old');
    expect(useUi.getState().selectedId).toBe('c2');
    expect(steps()).toBe(before + 1);
  });

  it('不夠時加格子，到上限的放不下', () => {
    replaceAll({ ...initialState(), cells: initialState().cells.slice(0, 1) });
    const many = Array.from({ length: LIMITS.cells + 2 }, (_, i) => img(`i${i}`));
    const r = fillImages(many, null);
    expect(reviewNow().cells).toHaveLength(LIMITS.cells);
    expect(r.ids).toHaveLength(LIMITS.cells);
    expect(r.dropped).toBe(2);
  });
});

describe('心得標籤', () => {
  it('選：加在最後、再按取消、滿 3 個時回傳 full', () => {
    const [a, b, c, d] = DEFAULT_TAGS;
    expect(toggleCellTag('c1', a)).toBe('added');
    toggleCellTag('c1', b);
    toggleCellTag('c1', c);
    expect(toggleCellTag('c1', d)).toBe('full');
    expect(reviewNow().cells[0].tags).toEqual([a, b, c]);
    expect(toggleCellTag('c1', b)).toBe('removed');
    expect(reviewNow().cells[0].tags).toEqual([a, c]);
  });

  it('清單：新增、改字（格子跟著改）、刪除（格子一起拿掉）、排序、回到預設（格子留著）', () => {
    expect(addTag('KP 帶得超好')).toBeNull();
    expect(addTag('KP 帶得超好')).toBe('duplicate');
    const i = reviewNow().tags.length - 1;
    toggleCellTag('c1', 'KP 帶得超好');
    expect(renameTag(i, 'KP 超神')).toBeNull();
    expect(reviewNow().tags[i]).toBe('KP 超神');
    expect(reviewNow().cells[0].tags).toEqual(['KP 超神']);
    expect(renameTag(i, DEFAULT_TAGS[0])).toBe('duplicate');
    moveTag(i, 0);
    expect(reviewNow().tags[0]).toBe('KP 超神');
    removeTag(0);
    expect(reviewNow().tags).not.toContain('KP 超神');
    expect(reviewNow().cells[0].tags).toEqual([]);
    toggleCellTag('c2', DEFAULT_TAGS[1]);
    removeTag(1);
    resetTags();
    expect(reviewNow().tags).toEqual(DEFAULT_TAGS);
    expect(reviewNow().cells[1].tags).toEqual([]);
  });
});

describe('復原', () => {
  it('一次動作一步；文字欄從聚焦到離開算一步', () => {
    addCell();
    setView('list');
    expect(steps()).toBe(2);
    historyStep('undo');
    expect(reviewNow().view).toBe('grid');
    historyStep('redo');
    expect(reviewNow().view).toBe('list');
    useReview.temporal.getState().clear();
    gesture.begin();
    setCellText('c1', 'title', '雨');
    setCellText('c1', 'title', '雨夜');
    /* 手勢中按復原不做事 */
    historyStep('undo');
    expect(reviewNow().cells[0].title).toBe('雨夜');
    useReview.endGesture();
    expect(steps()).toBe(1);
    historyStep('undo');
    expect(reviewNow().cells[0].title).toBe('');
  });

  it('讀檔取代全部內容（一步復原）並選第一格', () => {
    select('c5');
    const next = initialState();
    next.profile.name = '別人';
    replaceAll(next);
    expect(reviewNow().profile.name).toBe('別人');
    expect(useUi.getState().selectedId).toBe('c1');
    historyStep('undo');
    expect(reviewNow().profile.name).toBe('');
  });
});
