/**
 * 家系圖的資料參照不能懸空（規格第 5 節「刪除」「指到不存在的人要清掉」；第二批驗證後的裁定 7.4）：
 * - 改連結、「不連結」時，對方自動建立的配偶一起刪——孩子的 motherId／fatherId、另一位配偶的 link.pairId 要在這一步清乾淨；
 * - 隨機操作（加人、連結、刪除、換父母、過繼…）每一步之後，所有 id 參照都指到存在的人（PL 版也一樣）。
 */
import { describe, expect, it } from 'vitest';
import { plPeople } from '@/tools/family-tree/model/gm';
import {
  addChild,
  addParent,
  addSibling,
  addSpouse,
  adoptChoices,
  autoArrange,
  fatherChoices,
  linkChoices,
  motherChoices,
  pairOf,
  removePerson,
  reparent,
  setAdoptFather,
  setAdoptKind,
  setBirthParent,
  setFather,
  setGmOnly,
  setLink,
  setMother,
} from '@/tools/family-tree/model/ops';
import { cleanPeople } from '@/tools/family-tree/model/sanitize';
import { membersOf, spousesOf } from '@/tools/family-tree/model/tree';
import { isSpouse, type Member, type People, type Spouse } from '@/tools/family-tree/model/types';
import { refProblems } from '../helpers/familyTreeInvariants';

const m = (id: string, extra: Partial<Member> = {}): Member => ({
  id,
  kind: 'member',
  name: id,
  gender: 'M',
  order: 1,
  ...extra,
});
const sp = (id: string, of: string, extra: Partial<Spouse> = {}): Spouse => ({
  id,
  kind: 'spouse',
  spouseOf: of,
  name: id,
  order: 1,
  ...extra,
});
const P = (...list: (Member | Spouse)[]): People => Object.fromEntries(list.map((p) => [p.id, p]));

/** 兩個家系：c1（驗證者的重現：C1 的配偶連到 a5）；a5 底下加孩子時母親自動填成 a5 的唯一配偶 */
function twoFamilies(): People {
  return P(
    m('c1', { gen: 1 }),
    m('a5', { gen: 1, order: 2 }),
    m('k1', { fatherId: 'c1', order: 1 }),
    m('z', { gen: 1, order: 3 }),
  );
}

describe('改連結、不連結：自動建立的配偶刪掉後，指到它的參照一起清掉', () => {
  it('孩子的母親是對方自動建立的配偶：「不連結」之後孩子的 motherId 清掉', () => {
    const p = twoFamilies();
    p.cs = sp('cs', 'c1', { name: '' });
    setLink(p, 'cs', 'a5', 'auto1');
    const auto = p.auto1 as Spouse;
    expect(auto.link?.auto).toBe(true);
    /* 替 a5 加兒子：只有一位配偶（自動建立的）時母親自動填 */
    const kid = addChild(p, 'a5', 'M', 'kid');
    expect(kid?.motherId).toBe('auto1');
    setLink(p, 'cs', null);
    expect(p.auto1).toBeUndefined();
    expect((p.kid as Member).motherId).toBeUndefined();
    expect((p.kid as Member).fatherId).toBe('a5');
    expect(refProblems(p)).toEqual([]);
  });

  it('改連到別人：舊的自動配偶刪掉、孩子的 motherId 清掉，新的那一邊照常建立', () => {
    const p = twoFamilies();
    p.cs = sp('cs', 'c1', { name: '' });
    setLink(p, 'cs', 'a5', 'auto1');
    addChild(p, 'a5', 'M', 'kid');
    setLink(p, 'cs', 'z', 'auto2');
    expect(p.auto1).toBeUndefined();
    expect((p.kid as Member).motherId).toBeUndefined();
    expect((p.cs as Spouse).link).toEqual({ personId: 'z', pairId: 'auto2' });
    expect((p.auto2 as Spouse).link).toEqual({ personId: 'c1', pairId: 'cs', auto: true });
    expect(refProblems(p)).toEqual([]);
  });

  it('孩子的父親是自動建立的配偶（女兒的孩子）：不連結之後 fatherId 也清掉', () => {
    const p = P(
      m('c1', { gen: 1 }),
      m('d', { gender: 'F', gen: 1, order: 2 }),
      sp('hs', 'c1', { name: '' }),
    );
    setLink(p, 'hs', 'd', 'auto1');
    /* d 是女性：加孩子時母親 d、父親＝她唯一的丈夫（自動建立的配偶） */
    const kid = addChild(p, 'd', 'M', 'kid');
    expect(kid?.fatherId).toBe('auto1');
    setLink(p, 'hs', null);
    expect(p.auto1).toBeUndefined();
    expect((p.kid as Member).fatherId).toBeUndefined();
    expect((p.kid as Member).motherId).toBe('d');
    expect(refProblems(p)).toEqual([]);
  });

  it('同一位成員的兩位配偶連到同一位成員：其中一位不連結，另一位的 pairId 不能指到已刪的人', () => {
    const p = twoFamilies();
    p.s1 = sp('s1', 'c1', { name: '' });
    p.s2 = sp('s2', 'c1', { name: '', order: 2 });
    setLink(p, 's1', 'a5', 'auto1');
    setLink(p, 's2', 'a5', 'auto2');
    expect(refProblems(p)).toEqual([]);
    setLink(p, 's2', null);
    expect(refProblems(p)).toEqual([]);
    const s1 = p.s1 as Spouse;
    expect(s1.link?.personId).toBe('a5');
    const pid = s1.link?.pairId;
    expect(!pid || !!p[pid]).toBe(true);
    /* pairOf 找得到的對方都是真的配偶 */
    const pair = pairOf(p, s1);
    expect(pair === null || isSpouse(pair)).toBe(true);
  });

  it('對方有名字的配偶只拿掉連結：另一位配偶的 pairId 不指到「已經沒有連回來」的人', () => {
    const p = twoFamilies();
    p.s1 = sp('s1', 'c1', { name: '' });
    p.s2 = sp('s2', 'c1', { name: '', order: 2 });
    p.named = sp('named', 'a5', { name: 'c1' });
    setLink(p, 's1', 'a5');
    setLink(p, 's2', 'a5');
    setLink(p, 's1', null);
    for (const s of spousesOf(p, 'c1')) {
      const pid = s.link?.pairId;
      if (!pid) continue;
      expect(isSpouse(p[pid])).toBe(true);
      expect((p[pid] as Spouse).link).toBeDefined();
    }
    expect(refProblems(p)).toEqual([]);
  });

  it('刪掉配偶或成員（removePerson）也一樣乾淨', () => {
    const p = twoFamilies();
    p.cs = sp('cs', 'c1', { name: '' });
    setLink(p, 'cs', 'a5', 'auto1');
    addChild(p, 'a5', 'M', 'kid');
    removePerson(p, 'cs');
    expect(p.auto1).toBeUndefined();
    expect((p.kid as Member).motherId).toBeUndefined();
    expect(refProblems(p)).toEqual([]);
  });
});

/* ---------- 隨機操作 ---------- */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function base(): People {
  return P(
    m('r1', { gen: 1 }),
    sp('r1w', 'r1'),
    m('a', { fatherId: 'r1', motherId: 'r1w', order: 1 }),
    m('b', { fatherId: 'r1', motherId: 'r1w', order: 2, gender: 'F' }),
    sp('bh', 'b'),
    m('r2', { gen: 1, order: 2 }),
    m('x', { fatherId: 'r2', order: 1 }),
    m('y', { fatherId: 'r2', order: 2, gender: 'F' }),
    m('r3', { gen: 1, order: 3 }),
  );
}

type Op = (people: People, pick: <T>(list: T[]) => T | undefined, id: string) => void;

const OPS: [number, Op][] = [
  [
    6,
    (p, pick, id) =>
      void addChild(p, pick(membersOf(p))?.id ?? '', pick(['M', 'F'] as const) ?? 'M', id),
  ],
  [3, (p, pick, id) => void addSibling(p, pick(membersOf(p))?.id ?? '', id)],
  [6, (p, pick, id) => void addSpouse(p, pick(membersOf(p))?.id ?? '', id)],
  [1, (p, pick, id) => void addParent(p, pick(membersOf(p))?.id ?? '', id)],
  [
    10,
    (p, pick, id) => {
      const s = pick(Object.values(p).filter(isSpouse));
      if (!s) return;
      const to = pick<string | null>([null, ...linkChoices(p, s).map((x) => x.id)]);
      setLink(p, s.id, to ?? null, id);
    },
  ],
  [
    4,
    (p, pick) => {
      const x = pick(Object.values(p));
      if (x) removePerson(p, x.id);
    },
  ],
  [
    3,
    (p, pick) => {
      const x = pick(membersOf(p));
      const t = pick(Object.values(p));
      if (x && t) reparent(p, x.id, t.id);
    },
  ],
  [
    3,
    (p, pick) => {
      const x = pick(membersOf(p));
      if (!x) return;
      const f = pick<string | null>([null, ...fatherChoices(p, x).map((c) => c.id)]);
      setFather(p, x.id, f ?? null);
    },
  ],
  [
    3,
    (p, pick) => {
      const x = pick(membersOf(p));
      if (!x) return;
      const mo = pick<string | null>([null, ...motherChoices(p, x).map((c) => c.id)]);
      setMother(p, x.id, mo ?? null);
    },
  ],
  [
    2,
    (p, pick) => {
      const x = pick(membersOf(p));
      if (x) setAdoptKind(p, x.id, pick(['heir', 'adopted', null] as const) ?? null);
    },
  ],
  [
    2,
    (p, pick) => {
      const x = pick(membersOf(p).filter((c) => c.adopt));
      if (!x) return;
      const f = pick<string | null>([null, ...adoptChoices(p, x).map((c) => c.id)]);
      setAdoptFather(p, x.id, f ?? null);
    },
  ],
  [
    2,
    (p, pick) => {
      const x = pick(membersOf(p).filter((c) => c.adopt?.fatherId));
      const t = pick(Object.values(p));
      if (x && t) setBirthParent(p, x.id, t.id);
    },
  ],
  [1, (p) => autoArrange(p)],
  [1, (p, pick) => setGmOnly(p, pick(Object.values(p))?.id ?? '', true)],
];
const TOTAL = OPS.reduce((n, [w]) => n + w, 0);
/** 依權重挑一個操作（x 在 0～TOTAL） */
function weighted(x: number): Op {
  let left = x;
  for (const [w, op] of OPS) {
    if (left < w) return op;
    left -= w;
  }
  return OPS[0][1];
}

describe('隨機操作之後資料參照都指到存在的人', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`種子 ${seed}：400 步，每一步之後檢查（含 PL 版與讀檔整理後相同）`, () => {
      const rand = rng(seed);
      const pick = <T>(list: T[]): T | undefined => list[Math.floor(rand() * list.length)];
      const people = base();
      for (let i = 0; i < 400; i++) {
        const op = weighted(rand() * TOTAL);
        op(people, pick, `n${seed}_${i}`);
        const bad = refProblems(people);
        expect(bad, `步驟 ${i}`).toEqual([]);
        if (i % 20 === 0) {
          expect(refProblems(plPeople(people)), `步驟 ${i} 的 PL 版`).toEqual([]);
          /* 讀檔整理（fixRefs）不該再清掉任何東西 */
          const json = JSON.parse(JSON.stringify(people));
          expect(cleanPeople(json), `步驟 ${i} 讀檔整理`).toEqual(json);
        }
        /* 不讓圖板無限長大 */
        if (Object.keys(people).length > 60) {
          const x = pick(Object.values(people));
          if (x) removePerson(people, x.id);
        }
      }
    });
  }
});
