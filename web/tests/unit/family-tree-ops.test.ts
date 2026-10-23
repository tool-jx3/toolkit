/**
 * 家系圖的編輯（規格 1.2、1.6、1.7）：加人、刪除、換父母、換順序、調間距、只移動父母、自動整列、搜尋。
 * 規則照原作（가계도 편집기）的行為。
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { DIMS, type LayoutOptions, layoutTree } from '@/tools/family-tree/model/layout';
import {
  addChild,
  addParent,
  addRoot,
  addSibling,
  addSpouse,
  applyGap,
  applyMove,
  autoArrange,
  canAddParent,
  checkReparent,
  fatherChoices,
  motherChoices,
  moveParentOnly,
  moveSibling,
  newCategory,
  nextHit,
  removeCategory,
  removePerson,
  reparent,
  searchPeople,
  setFather,
  setMother,
  usedCategories,
} from '@/tools/family-tree/model/ops';
import { descendants, genOf, nextOrder, rootOf } from '@/tools/family-tree/model/tree';
import type { Board, Member, People, Spouse } from '@/tools/family-tree/model/types';

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
const opts: LayoutOptions = { dims: DIMS.full, spouses: true, align: 'center' };

/** a（妻 aw）→ b、c；b → d */
function family(): People {
  return P(
    m('a', { gen: 1 }),
    sp('aw', 'a'),
    m('b', { fatherId: 'a', motherId: 'aw', order: 1 }),
    m('c', { fatherId: 'a', motherId: 'aw', order: 2, gender: 'F' }),
    m('d', { fatherId: 'b', order: 1 }),
  );
}

describe('加人', () => {
  it('始祖：男性、第 1 代、排在始祖的最後', () => {
    const p = family();
    const r = addRoot(p, 'r');
    expect(r).toMatchObject({ gender: 'M', gen: 1, order: 2, name: '' });
  });

  it('加兒子：父親＝他、只有一位妻子時母親＝她、排在最後', () => {
    const p = family();
    const k = addChild(p, 'a', 'M', 'k');
    expect(k).toMatchObject({ fatherId: 'a', motherId: 'aw', order: 3, gender: 'M' });
  });

  it('兩位妻子時母親不自動填', () => {
    const p = family();
    p.aw2 = sp('aw2', 'a', { order: 2 });
    expect(addChild(p, 'a', 'F', 'k')?.motherId).toBeUndefined();
  });

  it('女兒加孩子：母親＝她、父親＝她唯一的丈夫；排版掛在她底下', () => {
    const p = family();
    p.ch = sp('ch', 'c');
    const k = addChild(p, 'c', 'M', 'k');
    expect(k).toMatchObject({ motherId: 'c', fatherId: 'ch' });
    expect(layoutTree(p, opts).byId.get('k')?.parent?.id).toBe('c');
  });

  it('加兄弟姊妹＝對父母加兒子；始祖沒有', () => {
    const p = family();
    expect(addSibling(p, 'd', 'e')).toMatchObject({ fatherId: 'b', gender: 'M', order: 2 });
    expect(addSibling(p, 'a', 'x')).toBeNull();
  });

  it('加配偶：排序值＝目前的數目 ＋ 1', () => {
    const p = family();
    expect(addSpouse(p, 'a', 's2')?.order).toBe(2);
    expect(addSpouse(p, 'aw', 's3')).toBeNull();
  });

  it('加上一代：新的始祖代數 − 1、沿用排序與間距；原本的人變成他的孩子', () => {
    const p = P(m('x', { gen: 3, order: 4, gap: 30 }));
    expect(canAddParent(p, p.x as Member)).toBe(true);
    const f = addParent(p, 'x', 'f');
    expect(f).toMatchObject({ gen: 2, order: 4, gap: 30, gender: 'M' });
    expect(p.x).toMatchObject({ fatherId: 'f', order: 1 });
    expect((p.x as Member).gen).toBeUndefined();
    expect((p.x as Member).gap).toBeUndefined();
    expect(genOf(p, p.x as Member)).toBe(3);
    /* 第 1 代的上一代還是第 1 代（最小 1） */
    const q = P(m('y', { gen: 1 }));
    expect(addParent(q, 'y', 'g')?.gen).toBe(1);
    /* 不是始祖時不行 */
    expect(addParent(family(), 'b', 'z')).toBeNull();
  });
});

describe('刪除', () => {
  it('有子孫時不能刪', () => {
    const p = family();
    expect(removePerson(p, 'b')).toEqual({ ok: false, reason: 'has-kids' });
  });

  it('刪成員：配偶一起刪、別人指到他的父母清掉', () => {
    const p = family();
    p.dw = sp('dw', 'd');
    const r = removePerson(p, 'd');
    expect(r).toEqual({ ok: true, name: 'd' });
    expect(p.d).toBeUndefined();
    expect(p.dw).toBeUndefined();
  });

  it('刪配偶：孩子留著、母親的記錄清空', () => {
    const p = family();
    removePerson(p, 'aw');
    expect(p.b).toBeDefined();
    expect((p.b as Member).motherId).toBeUndefined();
  });

  it('跨家系的配偶（第二批的資料）：自動建立的那一邊一起刪', () => {
    const p = family();
    p.x = m('x', { gen: 1, order: 2, gender: 'F' });
    p.l1 = sp('l1', 'd', { name: '', link: { personId: 'x', pairId: 'l2' } });
    p.l2 = sp('l2', 'x', { name: '', link: { personId: 'd', pairId: 'l1', auto: true } });
    removePerson(p, 'l1');
    expect(p.l2).toBeUndefined();
  });
});

describe('換父母（拖到別人卡片上）', () => {
  it('不能移到自己或自己的子孫底下', () => {
    const p = family();
    expect(checkReparent(p, 'b', 'd')).toBe('descendant');
    expect(checkReparent(p, 'b', 'b')).toBe('self');
    expect(checkReparent(p, 'd', 'c')).toBe('ok');
  });

  it('放到男性：父親＝他、母親＝他唯一的妻子；排在最後、間距歸零', () => {
    const p = family();
    (p.d as Member).gap = 40;
    (p.d as Member).shift = 12;
    const host = reparent(p, 'd', 'a');
    expect(host?.id).toBe('a');
    expect(p.d).toMatchObject({ fatherId: 'a', motherId: 'aw', order: 3 });
    expect((p.d as Member).gap).toBeUndefined();
    expect((p.d as Member).shift).toBeUndefined();
  });

  it('放到配偶卡片：母親＝那位配偶', () => {
    const p = family();
    p.aw2 = sp('aw2', 'a', { order: 2 });
    reparent(p, 'd', 'aw2');
    expect(p.d).toMatchObject({ fatherId: 'a', motherId: 'aw2' });
  });

  it('放到女性：母親＝她、父親＝她唯一的丈夫（沒有時清空）', () => {
    const p = family();
    reparent(p, 'd', 'c');
    expect((p.d as Member).motherId).toBe('c');
    expect((p.d as Member).fatherId).toBeUndefined();
    expect(layoutTree(p, opts).byId.get('d')?.parent?.id).toBe('c');
  });

  it('始祖換父母後不再是始祖（起始代數取消）', () => {
    const p = family();
    p.r = m('r', { gen: 5, order: 2 });
    reparent(p, 'r', 'd');
    expect((p.r as Member).gen).toBeUndefined();
    expect(genOf(p, p.r as Member)).toBe(4);
  });
});

describe('父母的下拉（F39）', () => {
  it('父親：所有男性成員，不含自己與子孫', () => {
    const p = family();
    expect(fatherChoices(p, p.b as Member).map((x) => x.id)).toEqual(['a']);
    expect(fatherChoices(p, p.d as Member).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('換父親：母親是別人的配偶就清掉；新父親只有一位配偶時自動填；排在最後', () => {
    const p = family();
    p.bw = sp('bw', 'b');
    setFather(p, 'c', 'b');
    /* 原作在改了父親之後才算排序值（自己也算在新的兄弟姊妹裡） */
    expect(p.c).toMatchObject({ fatherId: 'b', motherId: 'bw', order: 3 });
    setFather(p, 'c', null);
    expect((p.c as Member).fatherId).toBeUndefined();
    expect((p.c as Member).motherId).toBeUndefined();
  });

  it('母親：父親的配偶＋（她是成員時）原本的母親', () => {
    const p = family();
    expect(motherChoices(p, p.b as Member)).toEqual([{ id: 'aw', daughterSide: false }]);
    reparent(p, 'd', 'c');
    expect(motherChoices(p, p.d as Member)).toEqual([{ id: 'c', daughterSide: true }]);
    setMother(p, 'd', null);
    expect((p.d as Member).motherId).toBeUndefined();
  });
});

describe('位置', () => {
  it('和左邊／右邊交換；到頭時不動', () => {
    const p = family();
    expect(moveSibling(p, 'b', -1)).toBe(false);
    expect(moveSibling(p, 'b', 1)).toBe(true);
    expect([(p.b as Member).order, (p.c as Member).order]).toEqual([2, 1]);
  });

  it('自動整列：清掉所有人的間距與偏移', () => {
    const p = family();
    (p.b as Member).gap = 20;
    (p.a as Member).shift = 30;
    autoArrange(p);
    expect((p.b as Member).gap).toBeUndefined();
    expect((p.a as Member).shift).toBeUndefined();
  });
});

describe('拖曳（每一格都從拖曳開始時的資料算）', () => {
  it('換順序：依卡片中心落在哪兩個兄弟姊妹的中心之間', () => {
    const p = P(
      m('a'),
      m('b', { fatherId: 'a', order: 1 }),
      m('c', { fatherId: 'a', order: 2 }),
      m('d', { fatherId: 'a', order: 3 }),
    );
    const L = layoutTree(p, opts);
    const bx = L.byId.get('b')?.x ?? 0;
    /* d 的卡片左邊放在 b 的左邊再往左 10：排到最前 */
    const q = produce(p, (draft) => applyMove(draft, 'd', bx - 10, opts));
    expect(['b', 'c', 'd'].map((id) => (q[id] as Member).order)).toEqual([2, 3, 1]);
    /* 原本的資料不變 */
    expect((p.d as Member).order).toBe(3);
    /* 中心剛好在 b 與 c 的中心之間 */
    const cx = L.byId.get('c')?.x ?? 0;
    const q2 = produce(p, (draft) => applyMove(draft, 'd', (bx + cx) / 2, opts));
    expect(['b', 'c', 'd'].map((id) => (q2[id] as Member).order)).toEqual([1, 3, 2]);
  });

  it('換順序：折疊（看不到）的兄弟姊妹排在最後', () => {
    const p = P(
      m('a'),
      m('b', { fatherId: 'a', order: 1 }),
      m('c', { fatherId: 'a', order: 2 }),
      m('r2', { order: 2 }),
    );
    const o = { ...opts, collapsed: ['a'] };
    const q = produce(p, (draft) => applyMove(draft, 'r2', -500, o));
    expect([(q.a as Member).order, (q.r2 as Member).order]).toEqual([2, 1]);
  });

  it('調間距：加上拖曳距離、取整數、小於 4 當 0、不小於 0', () => {
    const p = family();
    expect(applyGap(p, 'c', 37.4)).toBe(37);
    expect(applyGap(p, 'c', -35)).toBe(0);
    expect(applyGap(p, 'c', 3)).toBe(0);
    expect(applyGap(p, 'c', -100)).toBe(0);
  });

  it('手動模式只移動父母：孩子留在原地（用自己的間距抵消）', () => {
    const p = P(
      m('r'),
      m('x', { fatherId: 'r', order: 1 }),
      m('a', { fatherId: 'r', order: 2 }),
      m('b', { fatherId: 'a', order: 1 }),
      m('c', { fatherId: 'a', order: 2 }),
    );
    const o = { ...opts, align: 'manual' as const };
    const L0 = layoutTree(p, o);
    const q = produce(p, (draft) => moveParentOnly(draft, 'a', 60, o));
    const L1 = layoutTree(q, o);
    expect((q.a as Member).shift).toBe(60);
    expect(Math.abs((L1.byId.get('b')?.x ?? 0) - (L0.byId.get('b')?.x ?? 0))).toBeLessThan(2);
    expect((L1.byId.get('a')?.x ?? 0) - (L0.byId.get('a')?.x ?? 0)).toBeGreaterThan(50);
    /* 很小的移動當 0 */
    const q2 = produce(p, (draft) => moveParentOnly(draft, 'a', 3, o));
    expect((q2.a as Member).shift).toBeUndefined();
  });
});

describe('查詢', () => {
  it('子孫、始祖、代數、排序值', () => {
    const p = family();
    expect([...descendants(p, 'a')].sort()).toEqual(['b', 'c', 'd']);
    expect(rootOf(p, p.d as Member).id).toBe('a');
    expect(genOf(p, p.d as Member)).toBe(3);
    expect(nextOrder(p, 'a')).toBe(3);
    expect(nextOrder(p, null)).toBe(2);
  });

  it('搜尋：名字或讀音包含；從目前選取的下一個開始輪流', () => {
    const p = family();
    (p.c as Member).reading = 'あき';
    (p.aw as Spouse).name = '秋子';
    (p.aw as Spouse).reading = 'aki';
    expect(searchPeople(p, 'あ').map((x) => x.id)).toEqual(['c']);
    expect(searchPeople(p, '  ')).toEqual([]);
    const hits = searchPeople(p, 'a');
    expect(hits.map((x) => x.id)).toEqual(['a', 'aw']);
    expect(nextHit(hits, null)).toBe(0);
    expect(nextHit(hits, 'a')).toBe(1);
    expect(nextHit(hits, 'aw')).toBe(0);
  });
});

describe('色分類', () => {
  it('新分類「分類 N」依序取預設色；刪除時清掉用到的人；圖例只列用到的', () => {
    const board: Board = {
      id: 'b',
      title: 't',
      createdAt: '',
      align: 'center',
      cats: [],
      people: family(),
    };
    const c1 = newCategory(board, 'c1');
    board.cats.push(c1);
    const c2 = newCategory(board, 'c2');
    board.cats.push(c2);
    expect([c1.name, c2.name]).toEqual(['分類 1', '分類 2']);
    expect(c1.color).not.toBe(c2.color);
    board.people.b.cat = 'c2';
    expect(usedCategories(board).map((c) => c.id)).toEqual(['c2']);
    removeCategory(board, 'c2');
    expect(board.people.b.cat).toBeUndefined();
    expect(board.cats.map((c) => c.id)).toEqual(['c1']);
  });
});
