/**
 * 劇本心得九宮格（review-grid）的資料規則：預設狀態、整理存檔、心得標籤（選、新增、改字、刪除）、一次放入多張圖片的分配；
 * 原作的資料備份（示範字當成空白、標籤上限、超過格數）。
 */
import { describe, expect, it } from 'vitest';
import { fromLegacyBackup, isLegacyBackup, ORIGINAL_DEFAULTS } from '@/tools/review-grid/legacy';
import {
  addTagTo,
  cellIsEmpty,
  DEFAULT_TAGS,
  deleteTagIn,
  emptyCell,
  imageIds,
  initialState,
  LIMITS,
  nameFromFile,
  nextId,
  normalizeState,
  planImageFill,
  renameTagIn,
  toggleTag,
} from '@/tools/review-grid/model';
import originalText from './fixtures/review-grid-original.json?raw';

const IMG = { id: 'abc123', name: 'a.png', width: 300, height: 200 };

describe('預設狀態', () => {
  it('9 格、九宮格、正方形、20 個自寫的標籤、沒有個人資料', () => {
    const d = initialState();
    expect(d.cells.map((c) => c.id)).toEqual([
      'c1',
      'c2',
      'c3',
      'c4',
      'c5',
      'c6',
      'c7',
      'c8',
      'c9',
    ]);
    expect(d.view).toBe('grid');
    expect(d.ratio).toBe('square');
    expect(d.tags).toEqual(DEFAULT_TAGS);
    expect(d.tags).toHaveLength(20);
    expect(new Set(d.tags).size).toBe(20);
    for (const t of d.tags) expect(Array.from(t).length).toBeLessThanOrEqual(LIMITS.tag);
    expect(d.profile).toEqual({ image: null, name: '', handle: '' });
    expect(d.cells.every(cellIsEmpty)).toBe(true);
  });

  it('nextId 跳過已用的號碼', () => {
    expect(nextId('c', [{ id: 'c1' }, { id: 'c7' }, { id: 'x9' }])).toBe('c8');
    expect(nextId('c', [])).toBe('c1');
  });

  it('nameFromFile 去掉最後的副檔名', () => {
    expect(nameFromFile('my.cover.png')).toBe('my.cover');
    expect(nameFromFile('C:\\x\\封面.jpg')).toBe('封面');
    expect(nameFromFile('.hidden')).toBe('.hidden');
  });

  it('imageIds 收集頭像與格子的圖片', () => {
    const d = initialState();
    d.profile.image = { ...IMG, id: 'p1' };
    d.cells[2].image = IMG;
    expect(imageIds(d)).toEqual(['p1', 'abc123']);
  });
});

describe('整理存檔（normalizeState）', () => {
  it('壞掉的內容回到預設', () => {
    expect(normalizeState(null)).toEqual(initialState());
    expect(normalizeState({ cells: 'x', tags: 3, view: 'zzz' })).toEqual(initialState());
  });

  it('截字、單行欄位的換行換成空白、id 重複時重編、圖片壞掉時拿掉', () => {
    const d = normalizeState({
      view: 'list',
      ratio: 'original',
      profile: {
        name: 'a\nb',
        handle: 'x'.repeat(99),
        image: { id: 'bad id', width: 1, height: 1 },
      },
      cells: [
        {
          id: 'c1',
          title: 't'.repeat(100),
          rule: 'r\r\nr',
          tags: ['甲', '甲', '乙', '丙', '丁'],
          comment: 'a\r\nb',
          image: IMG,
        },
        { id: 'c1', writer: 'w' },
        'junk',
      ],
      tags: ['  好玩  ', '好玩', '', 5],
    });
    expect(d.view).toBe('list');
    expect(d.ratio).toBe('original');
    expect(d.profile.name).toBe('a b');
    expect(Array.from(d.profile.handle)).toHaveLength(LIMITS.handle);
    expect(d.profile.image).toBeNull();
    expect(d.cells.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    expect(Array.from(d.cells[0].title)).toHaveLength(LIMITS.title);
    expect(d.cells[0].rule).toBe('r r');
    expect(d.cells[0].tags).toEqual(['甲', '乙', '丙']);
    expect(d.cells[0].comment).toBe('a\nb');
    expect(d.cells[0].image).toEqual(IMG);
    expect(d.cells[1].writer).toBe('w');
    expect(d.tags).toEqual(['好玩']);
  });

  it('最多 30 格；沒有格子時回到預設的 9 格', () => {
    const many = normalizeState({ cells: Array.from({ length: 40 }, () => ({})) });
    expect(many.cells).toHaveLength(LIMITS.cells);
    expect(normalizeState({ cells: [] }).cells).toHaveLength(9);
  });
});

describe('心得標籤', () => {
  it('toggleTag：加在最後、再按取消、滿 3 個時不變', () => {
    let r = toggleTag([], 'A');
    expect(r).toEqual({ tags: ['A'], result: 'added' });
    r = toggleTag(['A', 'B', 'C'], 'D');
    expect(r).toEqual({ tags: ['A', 'B', 'C'], result: 'full' });
    r = toggleTag(['A', 'B', 'C'], 'B');
    expect(r).toEqual({ tags: ['A', 'C'], result: 'removed' });
  });

  it('addTagTo：去頭尾空白、空白、重複、上限', () => {
    expect(addTagTo(['甲'], '  乙 ')).toEqual(['甲', '乙']);
    expect(addTagTo(['甲'], '   ')).toBe('empty');
    expect(addTagTo(['甲'], '甲')).toBe('duplicate');
    expect(
      addTagTo(
        Array.from({ length: LIMITS.tagList }, (_, i) => `t${i}`),
        '新',
      ),
    ).toBe('full');
    expect(addTagTo([], 'x'.repeat(30))).toEqual(['x'.repeat(LIMITS.tag)]);
  });

  it('renameTagIn：清單與用到它的格子一起改；重複、空白不改', () => {
    const cells = [
      { ...emptyCell('c1'), tags: ['甲', '乙'] },
      { ...emptyCell('c2'), tags: ['乙'] },
    ];
    const r = renameTagIn({ tags: ['甲', '乙', '丙'], cells }, 1, '好玩');
    expect(r).toEqual({
      tags: ['甲', '好玩', '丙'],
      cells: [
        { ...cells[0], tags: ['甲', '好玩'] },
        { ...cells[1], tags: ['好玩'] },
      ],
    });
    expect(renameTagIn({ tags: ['甲', '乙'], cells }, 1, '甲')).toBe('duplicate');
    expect(renameTagIn({ tags: ['甲', '乙'], cells }, 1, ' ')).toBe('empty');
    expect(cells[0].tags).toEqual(['甲', '乙']);
  });

  it('deleteTagIn：清單刪掉、格子裡一起拿掉', () => {
    const cells = [{ ...emptyCell('c1'), tags: ['甲', '乙'] }];
    expect(deleteTagIn({ tags: ['甲', '乙'], cells }, 0)).toEqual({
      tags: ['乙'],
      cells: [{ ...cells[0], tags: ['乙'] }],
    });
  });
});

describe('一次放入多張圖片（planImageFill）', () => {
  const cells = (pattern: string) =>
    Array.from(pattern, (ch) => ({ image: ch === 'x' ? IMG : null }));

  it('沒有指定格子：從頭放進沒有圖片的格子', () => {
    expect(planImageFill(cells('x.x..'), 2, null)).toEqual({
      targets: [1, 3],
      added: 0,
      dropped: 0,
    });
  });

  it('指定格子：第一張放那一格（有圖片也換掉），其餘放進後面沒有圖片的格子', () => {
    expect(planImageFill(cells('..x.x.'), 3, 2)).toEqual({
      targets: [2, 3, 5],
      added: 0,
      dropped: 0,
    });
  });

  it('不夠時加格子，到上限為止', () => {
    expect(planImageFill(cells('x.'), 4, null, 4)).toEqual({ targets: [1], added: 2, dropped: 1 });
  });
});

describe('原作的資料備份', () => {
  const backup = {
    profile: { img: 'data:image/png;base64,AAAA', nickname: '닉네임', handle: ' @me ' },
    scenarios: [
      {
        img: null,
        rule: '룰 이름',
        title: '시나리오 제목',
        writer: '라이터 이름',
        comment: ORIGINAL_DEFAULTS.comment,
        chips: ['완성도가 높아요', '웃음이 나와요', '감동이 있어요', '상흔이 남아요'],
      },
      {
        img: 'https://example.com/x.png',
        rule: 'CoC',
        title: ' 雨夜 ',
        writer: 'K',
        comment: '好玩\n再一次',
        chips: 'x',
      },
    ],
  };

  it('辨認：有 scenarios 陣列', () => {
    expect(isLegacyBackup(backup)).toBe(true);
    expect(isLegacyBackup({ scenarios: [] })).toBe(true);
    expect(isLegacyBackup({ format: 'trpg-toolkit-project' })).toBe(false);
    expect(isLegacyBackup({ scenarios: [], profile: 'x' })).toBe(false);
    expect(isLegacyBackup([])).toBe(false);
  });

  it('原作的示範字、感想的提示字當成空白；標籤最多 3 個；圖片只認 data:image', () => {
    const b = fromLegacyBackup(backup);
    expect(b.profile).toEqual({ name: '', handle: '@me', image: 'data:image/png;base64,AAAA' });
    expect(b.cells[0]).toMatchObject({ id: 'c1', rule: '', title: '', writer: '', comment: '' });
    expect(b.cells[0].tags).toEqual(['완성도가 높아요', '웃음이 나와요', '감동이 있어요']);
    expect(b.cells[1]).toMatchObject({
      id: 'c2',
      rule: 'CoC',
      title: '雨夜',
      writer: 'K',
      comment: '好玩\n再一次',
      tags: [],
    });
    expect(b.images).toEqual([null, null]);
    expect(b.dropped).toBe(0);
  });

  it('超過 30 格的不讀；沒有格子時留一格', () => {
    const many = fromLegacyBackup({
      scenarios: Array.from({ length: 33 }, () => ({ title: 'x' })),
    });
    expect(many.cells).toHaveLength(30);
    expect(many.dropped).toBe(3);
    expect(fromLegacyBackup({ scenarios: [] }).cells).toHaveLength(1);
  });

  it('原作的頁面存的檔（fixtures/review-grid-original.json）', () => {
    const raw = JSON.parse(originalText);
    expect(isLegacyBackup(raw)).toBe(true);
    const b = fromLegacyBackup(raw);
    expect(b.profile.name).toBe('Tester');
    expect(b.profile.handle).toBe('@tester');
    expect(b.profile.image).toMatch(/^data:image\/png;base64,/);
    expect(b.cells).toHaveLength(9);
    expect(b.cells[0]).toMatchObject({
      rule: 'CoC 7th',
      title: 'Rainy Night',
      writer: 'Someone',
      tags: ['완성도가 높아요', '웃음이 나와요'],
    });
    expect(b.images[0]).toMatch(/^data:image\/png;base64,/);
    expect(b.cells[1]).toMatchObject({ rule: '', title: 'Moon Gate', writer: '' });
    expect(b.cells.slice(2).every((c) => !c.title && !c.rule && !c.writer)).toBe(true);
    expect(b.images.slice(1).every((x) => x === null)).toBe(true);
  });
});
