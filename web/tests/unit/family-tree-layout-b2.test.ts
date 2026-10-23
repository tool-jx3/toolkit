/**
 * 家系圖第二批的排版（規格 3.1、F80～F84）：過繼的人與「出」字小卡、母系外孫的開關、跨家系的婚姻連線、
 * 女兒寫成「女（適 丈夫）」時不畫配偶卡片——和原作逐張卡片比對。
 * 期待值是把同一份自己編的資料（原作的備份檔格式，人物都是虛構的）放進原作的網頁，在各種顯示設定下從 DOM 讀出的
 * 座標、連線與卡片上的字（scratchpad 的 parity/orig-extract.mjs → make-fixtures.mjs）。
 */
import { describe, expect, it } from 'vitest';
import {
  chipX,
  edgePath,
  guides,
  layoutTree,
  linkPaths,
  rowLineY,
  viewDims,
} from '@/tools/family-tree/model/layout';
import { boardsFromLegacy } from '@/tools/family-tree/model/legacy';
import type { Align, Board } from '@/tools/family-tree/model/types';

interface Variant {
  align: Align;
  compact: boolean;
  memo: boolean;
  spouses: boolean;
  maternal: boolean;
  stubs: boolean;
  daughterName: boolean;
  links: boolean;
  collapse: boolean;
  nodes: (string | number)[][];
  texts?: (string | null)[][];
  chipTexts?: (string | number)[][];
  gens: [string, number, number][];
  lines: [number, number, number][];
  paths: [string, string][];
}
interface Fixture {
  dataset: string;
  collapse: string[];
  data: unknown;
  variants: Record<string, Variant>;
}

const fixtures: Fixture[] = Object.values(
  import.meta.glob<Fixture>('./fixtures/family-tree-b2/*.json', { eager: true, import: 'default' }),
);

const boardOf = (fx: Fixture): Board => boardsFromLegacy(fx.data, '測試')[0];

describe('第二批的排版和原作逐張相同', () => {
  it('有四份資料', () => {
    expect(fixtures.map((f) => f.dataset).sort()).toEqual(['adopt', 'dname', 'links', 'mixed']);
  });
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
          stubs: v.stubs,
          daughterName: v.daughterName,
        });
        /* 卡片（含「出」字小卡）：畫的先後、座標、折疊鈕 */
        expect(L.nodes.map((n) => [n.id, n.stub ? 1 : 0, n.x, n.y])).toEqual(
          v.nodes.map((n) => n.slice(0, 4)),
        );
        expect(
          L.nodes.map((n) =>
            !n.stub && (n.hasKids || (v.collapse && fx.collapse.includes(n.id))) ? 1 : 0,
          ),
        ).toEqual(v.nodes.map((n) => n[4]));
        /* 配偶卡片：簡易卡片時原作的 DOM 間距固定 6 px（排版 5），以排版的位置為準 */
        for (const [i, n] of L.nodes.entries()) {
          const dom = v.nodes[i].slice(5) as number[];
          const ours = n.chips.map((_, k) => chipX(n, k, dims) - n.x);
          if (v.compact) expect(ours).toEqual(dom.map((d, k) => d - (k + 1)));
          else expect(ours).toEqual(dom);
        }
        const G = guides(L);
        expect(G.rows.map((r) => [`${r.gen}세`, G.labelX, r.y + dims.H / 2 - 10])).toEqual(v.gens);
        expect(G.rows.slice(0, -1).map((r) => [G.lineX, rowLineY(r, dims), G.lineWidth])).toEqual(
          v.lines,
        );
        /* 親子連線（「出」字小卡的是另一種）、婚姻連線（打開而且顯示配偶時） */
        const edges = L.nodes
          .filter((n) => n.parent)
          .map((n) => [n.stub ? 'o' : 'e', edgePath(n, dims) ?? '']);
        const links =
          v.links && v.spouses ? linkPaths(board.people, L, v.spouses).map((l) => ['l', l.d]) : [];
        expect([...edges, ...links]).toEqual(v.paths);
      });
    }
  }
});
