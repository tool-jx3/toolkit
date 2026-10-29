/**
 * KP 對照表（compare.ts）：列的判定、內建主題與自訂主題的合併（名稱比對）、成人向、沒有人填的列不列、篩選、摘要、
 * 成員清單的整理與指紋。
 */
import { describe, expect, it } from 'vitest';
import {
  compareGroups,
  compareSummary,
  countStatus,
  filterGroups,
  type Member,
  memberFrom,
  normalizeMembers,
  rowStatus,
} from '@/tools/pl-profile/compare';
import { normalizeData } from '@/tools/pl-profile/model';

const person = (nickname: string, jirai: Record<string, unknown>) =>
  memberFrom(normalizeData({ profile: { nickname }, jirai }), 'link', '無名');

describe('rowStatus', () => {
  it('有人填 ng → ng（就算有人沒填）；有人填 ask → ask；有人沒填 → missing；全員 like 以上 → good；其他 → neutral', () => {
    expect(rowStatus(['ng', null, 'love'])).toBe('ng');
    expect(rowStatus(['ask', 'like', null])).toBe('ask');
    expect(rowStatus(['ng', 'ask'])).toBe('ng');
    expect(rowStatus(['love', null])).toBe('missing');
    expect(rowStatus(['love', 'like'])).toBe('good');
    expect(rowStatus(['love', 'ok'])).toBe('neutral');
  });
});

describe('compareGroups', () => {
  const a = person('阿明', {
    levels: { 'swarming-bugs': 'ng', 'pc-death': 'ask', combat: 'love' },
    notes: { 'swarming-bugs': '圖也不行' },
    cats: [{ id: 'k1', name: '其他議題' }],
    custom: [
      { cat: 'k1', label: '時事 ', level: 'ask', note: '先說' },
      { cat: 'death', label: '時間迴圈', level: 'love' },
    ],
  });
  const b = person('小華', {
    levels: { 'swarming-bugs': 'like', combat: 'like', 'flirting-innuendo': 'ng' },
    adult: true,
    cats: [{ id: 'zz', name: '其他議題' }],
    custom: [{ cat: 'zz', label: '時事', level: 'ok' }],
  });

  it('內建主題依分類；沒有人填的列不列；格子是每個人的程度與補充', () => {
    const groups = compareGroups([a, b]);
    const play = groups.find((g) => g.key === 'b:play');
    expect(play?.rows.map((r) => r.label)).toEqual(['戰鬥']);
    expect(play?.rows[0].status).toBe('good');
    const scares = groups.find((g) => g.key === 'b:scares');
    expect(scares?.rows[0]).toMatchObject({ label: '成群的蟲', status: 'ng', mixed: true });
    expect(scares?.rows[0].cells).toEqual([
      { level: 'ng', note: '圖也不行' },
      { level: 'like', note: '' },
    ]);
  });

  it('自訂主題：主題名稱（全形半形、空白、大小寫當成一樣）一樣就合成一列，分類不同也一樣；只有一個人的另一個人算沒填', () => {
    const c = person('阿傑', { custom: [{ cat: 'mind', label: 'ｔｅｓｔ', level: 'ng' }] });
    const d = person('小美', {
      cats: [{ id: 'q', name: '其他' }],
      custom: [{ cat: 'q', label: 'Test', level: 'like' }],
    });
    const merged = compareGroups([c, d]);
    expect(merged.map((g) => g.key)).toEqual(['b:mind']);
    expect(merged[0].rows[0].cells.map((x) => x.level)).toEqual(['ng', 'like']);
    const groups = compareGroups([a, b]);
    const real = groups.find((g) => g.name === '其他議題');
    expect(real?.rows).toHaveLength(1);
    expect(real?.rows[0].cells.map((c) => c.level)).toEqual(['ask', 'ok']);
    expect(real?.rows[0].builtin).toBe(false);
    const death = groups.find((g) => g.key === 'b:death');
    const loop = death?.rows.find((r) => r.label === '時間迴圈');
    expect(loop?.cells.map((c) => c.level)).toEqual(['love', null]);
    expect(loop?.status).toBe('missing');
  });

  it('成人向：有人打開才列；沒打開的人算沒填', () => {
    const groups = compareGroups([a, b]);
    const adult = groups.find((g) => g.key === 'b:adult');
    expect(adult?.rows[0].cells.map((c) => c.level)).toEqual([null, 'ng']);
    expect(compareGroups([a]).some((g) => g.key === 'b:adult')).toBe(false);
  });

  it('篩選與計數', () => {
    const groups = compareGroups([a, b]);
    const counts = countStatus(groups);
    expect(counts.ng).toBe(2);
    expect(counts.ask).toBe(2);
    const issues = filterGroups(groups, 'issues').flatMap((g) => g.rows.map((r) => r.status));
    expect(new Set(issues)).toEqual(new Set(['ng', 'ask']));
    const mixed = filterGroups(groups, 'mixed').flatMap((g) => g.rows);
    expect(mixed.every((r) => r.mixed)).toBe(true);
    expect(filterGroups(groups, 'all')).toEqual(groups);
  });

  it('摘要：有地雷、要先問的主題，後面寫是誰（與補充）', () => {
    const text = compareSummary([a, b], compareGroups([a, b]), {
      title: 'KP 對照表',
      ng: '有地雷',
      ask: '要先問',
      none: '沒有',
    });
    expect(text.split('\n')).toEqual([
      '【KP 對照表】阿明、小華',
      '✕ 有地雷：成群的蟲（阿明：圖也不行）、曖昧與性暗示（小華）',
      '？ 要先問：PC 死亡（阿明）、時事（阿明：先說）',
    ]);
    const calm = person('阿傑', { levels: { combat: 'love' } });
    expect(
      compareSummary([calm], compareGroups([calm]), {
        title: 'T',
        ng: 'n',
        ask: 'a',
        none: '沒有',
      }),
    ).toBe('【T】阿傑\n沒有');
  });
});

describe('成員', () => {
  it('memberFrom：暱稱空白時用預設名稱；同樣的內容指紋相同', () => {
    const d = normalizeData({ jirai: { levels: { 'swarming-bugs': 'ng' } } });
    const m1 = memberFrom(d, 'link', 'PL 1');
    const m2 = memberFrom(d, 'file', 'PL 2');
    expect(m1.name).toBe('PL 1');
    expect(m1.sig).toBe(m2.sig);
    expect(
      memberFrom(normalizeData({ jirai: { levels: { 'swarming-bugs': 'ask' } } }), 'link', 'x').sig,
    ).not.toBe(m1.sig);
  });

  it('normalizeMembers：壞掉的丟掉、id 重複換新的、最多 12 人、地雷表照樣整理', () => {
    const good: Member = person('阿明', { levels: { 'swarming-bugs': 'ng' } });
    const list = normalizeMembers([
      good,
      { ...good },
      'x',
      { id: 'a b', name: 3, source: '??', jirai: { levels: { 'swarming-bugs': 'zz' } } },
      ...Array.from({ length: 20 }, () => good),
    ]);
    expect(list).toHaveLength(12);
    expect(new Set(list.map((m) => m.id)).size).toBe(list.length);
    const odd = list[2];
    expect(odd.name).toBe('');
    expect(odd.source).toBe('link');
    expect(odd.jirai.levels).toEqual({});
    expect(normalizeMembers('x')).toEqual([]);
  });
});
