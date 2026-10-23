/**
 * 家系圖的資料（規格 2.、3.5）：讀原作的備份檔、整理讀進來的資料、範例圖板、畫布的平移縮放計算。
 */
import { describe, expect, it } from 'vitest';
import {
  centerView,
  fitView,
  isMouseWheel,
  isOffscreen,
  toCanvas,
  zoomAt,
} from '@/tools/family-tree/editor/view';
import { exampleBoard } from '@/tools/family-tree/model/example';
import { DIMS, layoutTree } from '@/tools/family-tree/model/layout';
import { boardsFromLegacy, isLegacyBackup } from '@/tools/family-tree/model/legacy';
import { cleanBoard, cleanPeople, cleanTreeData, clip } from '@/tools/family-tree/model/sanitize';
import { genOf, indexTree } from '@/tools/family-tree/model/tree';
import { isMember, LIMITS, type Member, type Spouse } from '@/tools/family-tree/model/types';

const legacyOne = {
  format: 'family-tree/v1',
  title: '測試家',
  meta: {
    title: '測試家',
    align: 'eldest',
    cats: [{ id: 'k1', name: '當家', color: '#22C55E' }],
  },
  people: {
    a: {
      id: 'a',
      kind: 'member',
      name: '甲',
      hanja: 'こう',
      alias: '字 子甲\n號 甲軒',
      gender: 'M',
      gen: 2,
      order: 1,
      birth: '1900',
      death: '1970',
      note: '備註',
      cat: 'k1',
      gx: 30,
      nx: -12,
    },
    s: {
      id: 's',
      kind: 'spouse',
      spouseOf: 'a',
      name: '乙',
      clan: '某地 某氏',
      parentNote: '父 丙',
      order: 1,
    },
    b: { id: 'b', kind: 'member', name: '丁', gender: 'F', order: 1, fatherId: 'a', motherId: 's' },
    c: {
      id: 'c',
      kind: 'member',
      name: '戊',
      gender: 'M',
      order: 2,
      fatherId: 'a',
      adoptType: '입양',
      adoptFatherId: 'b',
      stubOrder: 3,
      sgx: 10,
    },
    l: {
      id: 'l',
      kind: 'spouse',
      spouseOf: 'b',
      name: '',
      linkId: 'a',
      pairId: 'x',
      auto: true,
      order: 1,
    },
  },
};

describe('讀原作的備份檔', () => {
  it('認得兩種格式', () => {
    expect(isLegacyBackup(legacyOne)).toBe(true);
    expect(isLegacyBackup({ format: 'family-tree-all/v1', boards: [] })).toBe(true);
    expect(isLegacyBackup({ format: 'trpg-toolkit-project' })).toBe(false);
    expect(isLegacyBackup(null)).toBe(false);
    expect(() => boardsFromLegacy({ hello: 1 }, 'x')).toThrow();
  });

  it('欄位的對應：漢字 → 讀音、別名、本貫 → 出身、父親 → 父母、間距、偏移；色分類、父親的位置', () => {
    const [b] = boardsFromLegacy(legacyOne, '讀進來的家系圖');
    expect(b.title).toBe('測試家');
    expect(b.align).toBe('eldest');
    expect(b.cats).toEqual([{ id: 'k1', name: '當家', color: '#22c55e' }]);
    expect(b.people.a).toMatchObject({
      kind: 'member',
      name: '甲',
      reading: 'こう',
      alias: '字 子甲\n號 甲軒',
      gen: 2,
      gap: 30,
      shift: -12,
      birth: '1900',
      death: '1970',
      note: '備註',
      cat: 'k1',
    });
    expect(b.people.s).toMatchObject({
      kind: 'spouse',
      spouseOf: 'a',
      origin: '某地 某氏',
      parents: '父 丙',
    });
    expect(b.people.b).toMatchObject({ fatherId: 'a', motherId: 's', gender: 'F' });
  });

  it('第二批的資料放進預留的欄位（過繼、婚姻連結）', () => {
    const [b] = boardsFromLegacy(legacyOne, 'x');
    expect((b.people.c as Member).adopt).toEqual({
      fatherId: 'b',
      kind: 'adopted',
      order: 3,
      gap: 10,
    });
    /* pair 指到不存在的人：只留連結 */
    expect((b.people.l as Spouse).link).toEqual({ personId: 'a', auto: true });
    /* 第二批：過繼的人掛在繼父底下，生父底下留「出」字小卡（第一批暫時顯示在生父底下） */
    const L = layoutTree(b.people, { dims: DIMS.full, spouses: true, align: 'center' });
    expect(L.byId.get('c')?.parent?.id).toBe('b');
    expect(L.stubs.get('c')?.parent?.id).toBe('a');
  });

  it('只有類別、沒有繼父的過繼也留著（原作的面板會顯示類別）', () => {
    const [b] = boardsFromLegacy(
      {
        format: 'family-tree/v1',
        people: {
          a: { id: 'a', kind: 'member', name: '甲', gender: 'M', order: 1 },
          c: {
            id: 'c',
            kind: 'member',
            name: '乙',
            gender: 'M',
            order: 1,
            fatherId: 'a',
            adoptType: '출계',
          },
        },
      },
      'x',
    );
    expect((b.people.c as Member).adopt).toEqual({ fatherId: null, kind: 'heir' });
  });

  it('所有圖板的備份：每張都是新的圖板；沒有名稱時用 meta 或預設', () => {
    const all = {
      format: 'family-tree-all/v1',
      boards: [
        { title: '一', createdAt: '2026-01-01T00:00:00.000Z', meta: {}, people: {} },
        { meta: { title: '二' }, people: {} },
        { meta: {}, people: {} },
      ],
    };
    const list = boardsFromLegacy(all, '讀進來的家系圖');
    expect(list.map((b) => b.title)).toEqual(['一', '二', '讀進來的家系圖']);
    expect(new Set(list.map((b) => b.id)).size).toBe(3);
    expect(list[0].createdAt).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('整理資料', () => {
  it('文字截到上限（以字元計，emoji 不切開）', () => {
    expect(clip('😀'.repeat(50), 40)).toBe('😀'.repeat(40));
    expect(clip(123, 10)).toBe('123');
    expect(clip({}, 10)).toBe('');
  });

  it('性別不認得當男性；排序值不是數字時依出現順序；沒有成員的配偶丟掉；指到不存在的人清掉', () => {
    const people = cleanPeople({
      a: { kind: 'member', name: 'a', gender: 'X' },
      b: { kind: 'member', name: 'b', fatherId: 'zz', motherId: 'a', order: 'x' },
      s: { kind: 'spouse', name: 's', spouseOf: 'nobody' },
      t: { kind: 'spouse', name: 't' },
      n: 'nonsense',
    });
    expect(Object.keys(people)).toEqual(['a', 'b']);
    expect(people.a).toMatchObject({ gender: 'M', order: 1 });
    expect(people.b).toMatchObject({ order: 2, motherId: 'a' });
    expect((people.b as Member).fatherId).toBeUndefined();
  });

  it('自己當自己的父母時清掉；起始代數夾在 1～999', () => {
    const people = cleanPeople({
      a: { kind: 'member', name: 'a', fatherId: 'a', gen: 5000 },
      b: { kind: 'member', name: 'b', gen: 0 },
    });
    expect((people.a as Member).fatherId).toBeUndefined();
    expect((people.a as Member).gen).toBe(LIMITS.gen);
    expect((people.b as Member).gen).toBeUndefined();
  });

  it('圖板：父親的位置不認得時置中；顏色不是色碼時用預設色；名稱空白時「家系圖」', () => {
    const b = cleanBoard({
      align: 'zigzag',
      cats: [{ id: 'c', name: 'x', color: 'red' }],
      people: {},
    });
    expect(b?.align).toBe('center');
    expect(b?.cats[0].color).toMatch(/^#[0-9a-f]{6}$/);
    expect(b?.title).toBe('家系圖');
  });

  it('整份資料：圖板 id 重複時換新的；最多 50 張', () => {
    const d = cleanTreeData({
      boards: [
        { id: 'x', title: '1', people: {} },
        { id: 'x', title: '2', people: {} },
      ],
    });
    expect(d.boards.length).toBe(2);
    expect(d.boards[0].id).not.toBe(d.boards[1].id);
    const many = cleanTreeData({
      boards: Array.from({ length: 60 }, (_, i) => ({ id: `b${i}`, people: {} })),
    });
    expect(many.boards.length).toBe(LIMITS.boards);
    expect(cleanTreeData('garbage').boards).toEqual([]);
  });

  it('id 以字母開頭（不會被當成數字鍵排到最前面）時保留加入的順序', () => {
    const people = cleanPeople({
      p2: { kind: 'member', name: 'x' },
      p1: { kind: 'member', name: 'y' },
    });
    expect(Object.keys(people)).toEqual(['p2', 'p1']);
  });
});

describe('範例圖板（虛構的綾瀬家）', () => {
  it('四代 13 人＋配偶 6 人、3 個色分類；資料是乾淨的', () => {
    const b = exampleBoard('b1', '2026-01-01T00:00:00.000Z');
    const list = Object.values(b.people);
    expect(list.filter(isMember).length).toBe(13);
    expect(list.filter((p) => p.kind === 'spouse').length).toBe(6);
    expect(b.cats.length).toBe(3);
    expect(cleanBoard(b)).toEqual(b);
    const idx = indexTree(b.people);
    expect(idx.roots.map((r) => r.id)).toEqual(['ex-soichiro']);
    expect(Math.max(...idx.members.map((m) => genOf(b.people, m)))).toBe(4);
  });
});

describe('畫布的平移縮放', () => {
  it('以指標為中心縮放（那一點不動），夾在 12%～250%', () => {
    const v = { s: 1, tx: 10, ty: 20 };
    const z = zoomAt(v, 2, 110, 120);
    expect(toCanvas(z, 110, 120)).toEqual(toCanvas(v, 110, 120));
    expect(zoomAt({ s: 2.4, tx: 0, ty: 0 }, 2, 0, 0).s).toBe(2.5);
    expect(zoomAt({ s: 0.13, tx: 0, ty: 0 }, 0.5, 0, 0).s).toBe(0.12);
  });

  it('全覽：最大 115%、左右置中、上方 40', () => {
    const v = fitView({ x0: -100, y0: 0, x1: 100, y1: 100 }, 1000, 800);
    expect(v.s).toBe(1.15);
    expect(v.tx + -100 * v.s).toBeCloseTo((1000 - 200 * v.s) / 2);
    expect(v.ty).toBe(40);
    const wide = fitView({ x0: 0, y0: 0, x1: 4000, y1: 300 }, 1000, 800);
    expect(wide.s).toBeCloseTo((1000 - 48) / 4000);
    /* 最小 12% */
    expect(fitView({ x0: 0, y0: 0, x1: 100000, y1: 300 }, 1000, 800).s).toBe(0.12);
  });

  it('置中、在不在畫面裡', () => {
    const v = centerView({ s: 2, tx: 0, ty: 0 }, 50, 50, 400, 300);
    expect(v).toEqual({ s: 2, tx: 100, ty: 50 });
    expect(
      isOffscreen({ s: 1, tx: 0, ty: 0 }, { x0: 20, y0: 20, x1: 100, y1: 100 }, 400, 300),
    ).toBe(false);
    expect(isOffscreen({ s: 1, tx: 0, ty: 0 }, { x0: 5, y0: 20, x1: 100, y1: 100 }, 400, 300)).toBe(
      true,
    );
    expect(
      isOffscreen({ s: 1, tx: 0, ty: 0 }, { x0: 350, y0: 20, x1: 395, y1: 100 }, 400, 300),
    ).toBe(true);
  });

  it('滑鼠滾輪與觸控板：以行計或一次 ≥ 50 px 的直向滾動是滑鼠', () => {
    expect(isMouseWheel({ deltaMode: 1, deltaX: 0, deltaY: 3, shiftKey: false })).toBe(true);
    expect(isMouseWheel({ deltaMode: 0, deltaX: 0, deltaY: 100, shiftKey: false })).toBe(true);
    expect(isMouseWheel({ deltaMode: 0, deltaX: 0, deltaY: 100, shiftKey: true })).toBe(false);
    expect(isMouseWheel({ deltaMode: 0, deltaX: 2, deltaY: 30, shiftKey: false })).toBe(false);
  });
});
