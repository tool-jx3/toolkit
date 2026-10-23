/**
 * 家系圖的排版（規格 3.1）：和原作逐張卡片比對。
 * 期待值是把同一份資料（原作的備份檔格式，人物都是虛構的）放進原作的網頁，在各種顯示設定下從 DOM 讀出的座標
 * （.impl-tmp/parity/orig-extract.mjs → make-fixtures.mjs）。
 */
import { describe, expect, it } from 'vitest';
import {
  chipX,
  DIMS,
  edgePath,
  guides,
  layoutTree,
  rowLineY,
  viewDims,
} from '@/tools/family-tree/model/layout';
import { boardsFromLegacy } from '@/tools/family-tree/model/legacy';
import type { Align, Board, Member, People } from '@/tools/family-tree/model/types';

interface Variant {
  align: Align;
  compact: boolean;
  memo: boolean;
  spouses: boolean;
  maternal: boolean;
  collapse: boolean;
  nodes: (string | number)[][];
  gens: [string, number, number][];
  lines: [number, number, number][];
  paths?: string[];
}
interface Fixture {
  dataset: string;
  collapse: string[];
  data: unknown;
  variants: Record<string, Variant>;
}

const fixtures: Fixture[] = Object.values(
  import.meta.glob<Fixture>('../fixtures/family-tree/*.json', { eager: true, import: 'default' }),
);

function boardOf(fx: Fixture): Board {
  const [b] = boardsFromLegacy(fx.data, '測試');
  return b;
}

describe('排版和原作逐張相同', () => {
  for (const fx of fixtures) {
    const board = boardOf(fx);
    for (const [name, v] of Object.entries(fx.variants)) {
      it(`${fx.dataset}／${name}`, () => {
        const dims = viewDims(v.compact ? 'compact' : 'full', v.memo);
        const L = layoutTree(board.people, {
          dims,
          spouses: v.spouses,
          align: v.align,
          collapsed: v.collapse ? fx.collapse : [],
          maternal: v.maternal,
        });
        /* 卡片：順序（畫的先後）、座標、折疊鈕 */
        expect(L.nodes.map((n) => [n.id, n.x, n.y])).toEqual(v.nodes.map((n) => n.slice(0, 3)));
        expect(L.nodes.map((n) => n.hasKids || (v.collapse && fx.collapse.includes(n.id)))).toEqual(
          v.nodes.map((n) => n[3] === 1),
        );
        /* 配偶卡片：詳細卡片時等於原作 DOM 的位置；簡易卡片時原作的 DOM 間距固定 6 px（排版用 5），以排版的位置為準 */
        for (const [i, n] of L.nodes.entries()) {
          const dom = v.nodes[i].slice(4) as number[];
          const ours = n.chips.map((_, k) => chipX(n, k, dims) - n.x);
          if (v.compact) expect(ours).toEqual(dom.map((d, k) => d - (k + 1)));
          else expect(ours).toEqual(dom);
        }
        /* 世代標籤、虛線 */
        const G = guides(L);
        expect(G.rows.map((r) => [`${r.gen}세`, G.labelX, r.y + dims.H / 2 - 10])).toEqual(v.gens);
        expect(G.rows.slice(0, -1).map((r) => [G.lineX, rowLineY(r, dims), G.lineWidth])).toEqual(
          v.lines,
        );
        /* 親子連線 */
        if (v.paths) expect(L.nodes.map((n) => edgePath(n, dims)).filter(Boolean)).toEqual(v.paths);
      });
    }
  }
});

/* ---------- 規則本身（不靠原作的期待值） ---------- */

function member(id: string, extra: Partial<Member> = {}): Member {
  return { id, kind: 'member', name: id, gender: 'M', order: 1, ...extra };
}
function people(list: Member[]): People {
  return Object.fromEntries(list.map((p) => [p.id, p]));
}
const base = { dims: DIMS.full, spouses: true, align: 'center' as Align };

describe('排版的規則', () => {
  it('一代一列、y＝(代數 − 最小代數) × (H ＋ VG)', () => {
    const L = layoutTree(
      people([
        member('a', { gen: 3 }),
        member('b', { fatherId: 'a' }),
        member('c', { fatherId: 'b' }),
      ]),
      base,
    );
    expect(L.nodes.map((n) => [n.id, n.gen, n.y])).toEqual([
      ['a', 3, 0],
      ['b', 4, 168],
      ['c', 5, 336],
    ]);
  });

  it('父母置中在第一個與最後一個孩子的中間；兄弟姊妹相隔 HG', () => {
    const L = layoutTree(
      people([
        member('a'),
        member('b', { fatherId: 'a', order: 1 }),
        member('c', { fatherId: 'a', order: 2 }),
        member('d', { fatherId: 'a', order: 3 }),
      ]),
      base,
    );
    const x = Object.fromEntries(L.nodes.map((n) => [n.id, n.x]));
    expect(x.c - x.b).toBe(140 + 24);
    expect(x.d - x.c).toBe(140 + 24);
    expect(x.a).toBe((x.b + x.d) / 2);
  });

  it('對齊長子：父母在排序最前的非女性孩子正上方', () => {
    const P = people([
      member('a'),
      member('b', { fatherId: 'a', order: 1, gender: 'F' }),
      member('c', { fatherId: 'a', order: 2 }),
      member('d', { fatherId: 'a', order: 3 }),
    ]);
    const L = layoutTree(P, { ...base, align: 'eldest' });
    const x = Object.fromEntries(L.nodes.map((n) => [n.id, n.x]));
    expect(x.a).toBe(x.c);
    /* 全是女兒時對齊第一個 */
    const P2 = people([
      member('a'),
      member('b', { fatherId: 'a', order: 1, gender: 'F' }),
      member('c', { fatherId: 'a', order: 2, gender: 'F' }),
    ]);
    const L2 = layoutTree(P2, { ...base, align: 'eldest' });
    expect(L2.byId.get('a')?.x).toBe(L2.byId.get('b')?.x);
  });

  it('手動：置中再加上手動偏移；置中模式不看偏移', () => {
    const P = people([
      member('a', { shift: 33 }),
      member('b', { fatherId: 'a', order: 1 }),
      member('c', { fatherId: 'a', order: 2 }),
    ]);
    const c = layoutTree(P, base);
    const m = layoutTree(P, { ...base, align: 'manual' });
    const rel = (L: typeof c) => (L.byId.get('a')?.x ?? 0) - (L.byId.get('b')?.x ?? 0);
    expect(rel(m) - rel(c)).toBe(33);
  });

  it('唯一的孩子的間距把整家往右推；第一個孩子的間距只推孩子', () => {
    const solo = layoutTree(
      people([
        member('r'),
        member('a', { fatherId: 'r', order: 1 }),
        member('a1', { fatherId: 'a' }),
        member('b', { fatherId: 'r', order: 2 }),
        member('b1', { fatherId: 'b', gap: 50 }),
      ]),
      base,
    );
    const noGap = layoutTree(
      people([
        member('r'),
        member('a', { fatherId: 'r', order: 1 }),
        member('a1', { fatherId: 'a' }),
        member('b', { fatherId: 'r', order: 2 }),
        member('b1', { fatherId: 'b' }),
      ]),
      base,
    );
    const bx = (L: typeof solo) => L.byId.get('b')?.x ?? 0;
    const ax = (L: typeof solo) => L.byId.get('a')?.x ?? 0;
    expect(bx(solo) - ax(solo) - (bx(noGap) - ax(noGap))).toBe(50);
    expect(solo.byId.get('b1')?.x).toBe(bx(solo));

    const lead = layoutTree(
      people([
        member('r'),
        member('a', { fatherId: 'r', order: 1, gap: 40 }),
        member('b', { fatherId: 'r', order: 2 }),
      ]),
      base,
    );
    const plain = layoutTree(
      people([
        member('r'),
        member('a', { fatherId: 'r', order: 1 }),
        member('b', { fatherId: 'r', order: 2 }),
      ]),
      base,
    );
    const rel = (L: typeof lead, id: string) =>
      (L.byId.get(id)?.x ?? 0) - (L.byId.get('r')?.x ?? 0);
    expect(rel(lead, 'a') - rel(plain, 'a')).toBe(40);
    expect(rel(lead, 'b') - rel(plain, 'b')).toBe(40);
  });

  it('矮的子樹塞進高的子樹旁邊（每一代各自的輪廓）', () => {
    /* a 底下：b（很寬的孫輩）、c（沒有孩子）：c 只要和 b 這一列相隔 HG */
    const list = [
      member('a'),
      member('b', { fatherId: 'a', order: 1 }),
      member('c', { fatherId: 'a', order: 2 }),
    ];
    for (let i = 0; i < 5; i++) list.push(member(`g${i}`, { fatherId: 'b', order: i + 1 }));
    const L = layoutTree(people(list), base);
    const x = Object.fromEntries(L.nodes.map((n) => [n.id, n.x]));
    expect(x.c - x.b).toBe(140 + 24);
    /* 再往下一層才有的寬度會把 c 推開 */
    const deep = [...list, member('d', { fatherId: 'c' })];
    for (let i = 0; i < 2; i++) deep.push(member(`d${i}`, { fatherId: 'd', order: i + 1 }));
    const L2 = layoutTree(people(deep), base);
    const g4 = L2.byId.get('g4')?.x ?? 0;
    const d0 = L2.byId.get('d')?.x ?? 0;
    expect(d0 - g4).toBeGreaterThanOrEqual(140 + 24);
  });

  it('家系之間相隔 3 × HG；沒有共同世代時接在最右邊之後', () => {
    const L = layoutTree(
      people([
        member('a', { order: 1 }),
        member('b', { order: 2 }),
        member('c', { order: 3, gen: 5 }),
      ]),
      base,
    );
    const x = Object.fromEntries(L.nodes.map((n) => [n.id, n.x]));
    expect(x.b - x.a).toBe(140 + 72);
    expect(x.c - x.b).toBe(140 + 72);
  });

  it('配偶加寬區塊；不顯示配偶時變窄', () => {
    const P: People = {
      ...people([
        member('a'),
        member('b', { fatherId: 'a', order: 1 }),
        member('c', { fatherId: 'a', order: 2 }),
      ]),
      s1: { id: 's1', kind: 'spouse', spouseOf: 'b', name: 's1', order: 1 },
      s2: { id: 's2', kind: 'spouse', spouseOf: 'b', name: 's2', order: 2 },
    };
    const on = layoutTree(P, base);
    const off = layoutTree(P, { ...base, spouses: false });
    const d = (L: typeof on) => (L.byId.get('c')?.x ?? 0) - (L.byId.get('b')?.x ?? 0);
    expect(d(on)).toBe(140 + 2 * (108 + 6) + 24);
    expect(d(off)).toBe(140 + 24);
    expect(on.byId.get('b')?.chips.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('折疊的人當作沒有孩子', () => {
    const P = people([
      member('a'),
      member('b', { fatherId: 'a', order: 1 }),
      member('c', { fatherId: 'a', order: 2 }),
    ]);
    const L = layoutTree(P, { ...base, collapsed: ['a'] });
    expect(L.nodes.map((n) => n.id)).toEqual(['a']);
    expect(L.nodes[0].hasKids).toBe(true);
  });

  it('母系外孫：顯示時掛在女兒底下，不顯示時隱藏', () => {
    const P: People = {
      ...people([member('a'), member('d', { fatherId: 'a', gender: 'F' })]),
      h: { id: 'h', kind: 'spouse', spouseOf: 'd', name: 'h', order: 1 },
      k: {
        id: 'k',
        kind: 'member',
        name: 'k',
        gender: 'M',
        order: 1,
        fatherId: 'h',
        motherId: 'd',
      },
    };
    expect(layoutTree(P, base).byId.get('k')?.parent?.id).toBe('d');
    expect(layoutTree(P, { ...base, maternal: false }).byId.has('k')).toBe(false);
  });

  it('資料有環時不會無限遞迴', () => {
    const P = people([member('a', { fatherId: 'b' }), member('b', { fatherId: 'a' }), member('r')]);
    const L = layoutTree(P, base);
    expect(L.nodes.map((n) => n.id)).toEqual(['r']);
  });

  it('深的樹（200 代）', () => {
    const list = [member('m0')];
    for (let i = 1; i < 200; i++) list.push(member(`m${i}`, { fatherId: `m${i - 1}` }));
    const L = layoutTree(people(list), base);
    expect(L.maxGen).toBe(200);
    expect(L.nodes.every((n) => n.x === 0)).toBe(true);
  });
});
