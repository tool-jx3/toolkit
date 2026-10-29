/**
 * PL 自介卡與地雷表的資料（model.ts、topics.ts）：內建主題、整理（壞資料、上限、標籤、頭像範圍、自訂主題與分類）、
 * 地雷表的檢視（分類順序、成人向、已填幾個、填了的主題）。
 */
import { describe, expect, it } from 'vitest';
import {
  filledTopics,
  initialData,
  jiraiCategories,
  jiraiProgress,
  LIMITS,
  labelKey,
  normalizeAvatarPlacement,
  normalizeData,
  TAG_PRESETS,
  tagLabels,
} from '@/tools/pl-profile/model';
import { OUT } from '@/tools/pl-profile/strings';
import { CATEGORIES, TOPIC_INDEX } from '@/tools/pl-profile/topics';

describe('內建主題', () => {
  it('key 不重複、分類 key 不重複；成人向只有一個分類', () => {
    const keys = CATEGORIES.flatMap((c) => c.topics.map((t) => t.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(TOPIC_INDEX.size).toBe(keys.length);
    expect(new Set(CATEGORIES.map((c) => c.key)).size).toBe(CATEGORIES.length);
    expect(CATEGORIES.filter((c) => c.adult).map((c) => c.key)).toEqual(['adult']);
    /* 8 個分類（內容 6 類＋跑團方式＋成人向）、64 個主題（成人向 5 個） */
    expect(CATEGORIES).toHaveLength(8);
    expect(keys).toHaveLength(64);
    expect(CATEGORIES.filter((c) => c.adult).flatMap((c) => c.topics)).toHaveLength(5);
  });

  it('每個預設標籤都有名稱', () => {
    for (const [group, ids] of Object.entries(TAG_PRESETS))
      for (const id of ids)
        expect((OUT.tags as Record<string, Record<string, string>>)[group][id]).toBeTruthy();
  });
});

describe('normalizeData', () => {
  it('任何輸入都不丟錯，看不懂的回到初始值', () => {
    for (const raw of [null, 1, 'x', [], { profile: 3, show: 'a', jirai: [], look: null }])
      expect(normalizeData(raw)).toEqual(initialData());
  });

  it('初始值：年齡不顯示、其他欄位都顯示；外觀預設', () => {
    const d = initialData();
    expect(d.show.age).toBe(false);
    expect(Object.entries(d.show).filter(([, v]) => !v)).toEqual([['age', false]]);
    expect(d.look).toEqual({
      theme: 'paper',
      accent: '#4b6bd6',
      images: 'combined',
      group: 'level',
      notes: true,
      scale: 2,
    });
  });

  it('文字：截到上限、單行欄位的換行換成空白、控制字元拿掉', () => {
    const d = normalizeData({
      profile: {
        nickname: 'あ'.repeat(40),
        tagline: '第一行\n第二行\u0007',
        memo: `${'字'.repeat(400)}`,
      },
    });
    expect(Array.from(d.profile.nickname)).toHaveLength(LIMITS.nickname);
    expect(d.profile.tagline).toBe('第一行 第二行');
    expect(Array.from(d.profile.memo)).toHaveLength(LIMITS.memo);
    expect(normalizeData({ profile: { memo: 'a\r\nb' } }).profile.memo).toBe('a\nb');
  });

  it('標籤：預設選項照預設的順序、不認得的丟掉；自己加的去重（全形半形、大小寫）、最多 10 個', () => {
    const d = normalizeData({
      profile: {
        styles: {
          picked: ['horror', 'nope', 'story'],
          extra: ['Ｒｐ', 'rp', '  ', ...Array.from({ length: 12 }, (_, i) => `x${i}`)],
        },
      },
    });
    expect(d.profile.styles.picked).toEqual(['story', 'horror']);
    expect(d.profile.styles.extra[0]).toBe('Ｒｐ');
    expect(d.profile.styles.extra).toHaveLength(LIMITS.tagExtra);
    expect(d.profile.styles.extra).not.toContain('rp');
    expect(tagLabels(d.profile.styles, 'styles', OUT.tags.styles).slice(0, 3)).toEqual([
      '劇情',
      '恐怖',
      'Ｒｐ',
    ]);
    expect(labelKey(' Ａ  B ')).toBe('a b');
  });

  it('系統與聯絡方式：上限、程度不認得時 played、id 重複時換新的', () => {
    const d = normalizeData({
      profile: {
        systems: [
          { id: 'a', name: 'CoC', level: 'main', kp: true },
          { id: 'a', name: 'DX3', level: '??' },
          ...Array.from({ length: 20 }, () => ({ name: 'x' })),
        ],
        contacts: Array.from({ length: 9 }, (_, i) => ({ kind: 'Discord', value: `v${i}` })),
      },
    });
    expect(d.profile.systems).toHaveLength(LIMITS.systems);
    expect(d.profile.systems[0]).toMatchObject({ id: 'a', name: 'CoC', level: 'main', kp: true });
    expect(d.profile.systems[1].level).toBe('played');
    expect(d.profile.systems[1].id).not.toBe('a');
    expect(d.profile.contacts).toHaveLength(LIMITS.contacts);
  });

  it('頭像：沒有圖片時範圍是 null；範圍夾在蓋滿的範圍、置中時 null', () => {
    expect(
      normalizeData({ profile: { avatarPlacement: { zoom: 2 } } }).profile.avatarPlacement,
    ).toBe(null);
    const img = { width: 400, height: 200 };
    expect(normalizeAvatarPlacement({ zoom: 1, x: 0, y: 0, turns: 0 }, img)).toBe(null);
    /* 寬圖：縮放 1 時左右可以移 (2 − 1) ÷ 2 = 0.5，上下不能移 */
    expect(normalizeAvatarPlacement({ zoom: 1, x: 3, y: 1, turns: 0 }, img)).toEqual({
      zoom: 1,
      x: 0.5,
      y: 0,
      turns: 0,
    });
    expect(normalizeAvatarPlacement({ zoom: 99, x: 0, y: 0, turns: 0 }, img)?.zoom).toBe(4);
    const d = normalizeData({
      profile: {
        avatar: { id: 'abcd1234', name: 'a.png', width: 400, height: 200 },
        avatarPlacement: { zoom: 2, x: 0.1, y: 0, turns: 1 },
      },
    });
    expect(d.profile.avatar?.id).toBe('abcd1234');
    expect(d.profile.avatarPlacement).toEqual({ zoom: 2, x: 0.1, y: 0, turns: 1 });
    expect(
      normalizeData({ profile: { avatar: { id: '../x', width: 1, height: 1 } } }).profile.avatar,
    ).toBe(null);
  });

  it('地雷表：不認得的主題、程度丟掉；自訂主題的分類不存在時放到第一個自訂分類（沒有時第一個內建分類）', () => {
    const d = normalizeData({
      jirai: {
        levels: { 'swarming-bugs': 'ng', 'pc-death': 'ask', nope: 'ng', 'blood-wounds': 'bad' },
        notes: { 'swarming-bugs': '圖也不行', nope: 'x', 'blood-wounds': '   ' },
        cats: [
          { id: 'k1', name: '其他' },
          { id: 'body', name: '撞名' },
        ],
        custom: [
          { id: 't1', cat: 'k1', label: '時事', level: 'like' },
          { id: 't2', cat: 'gone', label: '???', level: 'zz' },
        ],
        adult: 'yes',
      },
    });
    expect(d.jirai.levels).toEqual({ 'swarming-bugs': 'ng', 'pc-death': 'ask' });
    expect(d.jirai.notes).toEqual({ 'swarming-bugs': '圖也不行' });
    expect(d.jirai.cats).toEqual([{ id: 'k1', name: '其他' }]);
    expect(d.jirai.custom[1]).toMatchObject({ cat: 'k1', level: null });
    expect(d.jirai.adult).toBe(false);
    const none = normalizeData({ jirai: { custom: [{ cat: 'gone', label: 'a' }] } });
    expect(none.jirai.custom[0].cat).toBe(CATEGORIES[0].key);
  });

  it('外觀：不認得的值用預設；主色只收 #rrggbb（轉小寫）；倍率 1 或 2', () => {
    const d = normalizeData({
      look: {
        theme: 'night',
        accent: '#ABCDEF',
        images: 'split',
        group: 'category',
        notes: false,
        scale: 1,
      },
    });
    expect(d.look).toEqual({
      theme: 'night',
      accent: '#abcdef',
      images: 'split',
      group: 'category',
      notes: false,
      scale: 1,
    });
    expect(normalizeData({ look: { theme: 'x', accent: 'red', scale: 3 } }).look).toMatchObject({
      theme: 'paper',
      accent: '#4b6bd6',
      scale: 2,
    });
  });

  it('整理兩次結果相同', () => {
    const once = normalizeData({
      profile: { nickname: '阿明', systems: [{ name: 'CoC' }], styles: { picked: ['rp'] } },
      jirai: { levels: { 'swarming-bugs': 'ng' }, custom: [{ cat: 'body', label: 'x' }] },
    });
    expect(normalizeData(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });
});

describe('地雷表的檢視', () => {
  const d = normalizeData({
    jirai: {
      levels: { 'swarming-bugs': 'ng', 'flirting-innuendo': 'ask' },
      cats: [{ id: 'k1', name: '其他' }],
      custom: [
        { id: 't1', cat: 'k1', label: '時事', level: 'like' },
        { id: 't2', cat: 'body', label: '斷指', level: 'ng' },
        { id: 't3', cat: 'body', label: '  ', level: 'ng' },
      ],
    },
  });

  it('分類順序：內建（自訂主題接在後面）→ 自訂分類；成人向依開關', () => {
    const cats = jiraiCategories(d.jirai);
    expect(cats.map((c) => c.id)).toEqual([
      'scares',
      'body',
      'death',
      'mind',
      'real-world',
      'relationships',
      'play',
      'k1',
    ]);
    const body = cats[1];
    expect(body.topics.slice(-2).map((t) => t.id)).toEqual(['t2', 't3']);
    expect(jiraiCategories({ ...d.jirai, adult: true }).map((c) => c.id)).toContain('adult');
  });

  it('已填／全部：成人向關掉時不算；沒有名稱的自訂主題不算', () => {
    expect(jiraiProgress(d.jirai)).toEqual({ filled: 3, total: 59 + 2 });
    expect(jiraiProgress({ ...d.jirai, adult: true })).toEqual({ filled: 4, total: 64 + 2 });
  });

  it('填了的主題：名稱空白的不列、看不到的成人向不列', () => {
    expect(filledTopics(d.jirai).map((f) => f.topic.id)).toEqual(['swarming-bugs', 't2', 't1']);
  });
});
