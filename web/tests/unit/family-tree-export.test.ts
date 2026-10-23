/**
 * 家系圖的匯出（規格 3.3）：畫布大小、卡片位置、倍率的上限；檔名。
 * 畫布大小的期待值是同一份資料、同樣的匯出設定在原作匯出的 PNG 大小（.impl-tmp/parity/export-compare.mjs）。
 */
import { describe, expect, it } from 'vitest';
import {
  type ExportCard,
  type ExportOptions,
  MAX_PIXELS,
  MAX_SIDE,
  planExport,
} from '@/tools/family-tree/export/render';
import { boardsFromLegacy } from '@/tools/family-tree/model/legacy';
import type { Board, Member } from '@/tools/family-tree/model/types';
import { pngFileName } from '@/tools/family-tree/panels/ExportTab';
import sizes from './fixtures/family-tree-export-sizes.json';

const datasets = import.meta.glob<{ data: unknown }>('./fixtures/family-tree/*.json', {
  eager: true,
  import: 'default',
});
const board = (name: string): Board =>
  boardsFromLegacy(datasets[`./fixtures/family-tree/${name}.json`].data, '測試')[0];

interface Case {
  orient: 'v' | 'h';
  card: ExportCard;
  compact?: boolean;
  memo?: boolean;
  title?: boolean;
  gens?: boolean;
  spouses?: boolean;
  sub?: boolean;
}
const CASES: Record<string, Case> = {
  'v-full': { orient: 'v', card: 'view' },
  'h-full': { orient: 'h', card: 'view' },
  'v-name': { orient: 'v', card: 'name' },
  'h-name': { orient: 'h', card: 'name' },
  'v-reading': { orient: 'v', card: 'reading' },
  'h-reading': { orient: 'h', card: 'reading' },
  'v-compact': { orient: 'v', card: 'view', compact: true },
  'h-compact': { orient: 'h', card: 'view', compact: true },
  'v-memo': { orient: 'v', card: 'view', memo: true },
  'v-plain': { orient: 'v', card: 'view', title: false, gens: false },
  'h-plain': { orient: 'h', card: 'view', title: false, gens: false },
  'v-nosp': { orient: 'v', card: 'view', spouses: false },
  'v-sub': { orient: 'v', card: 'view', sub: true },
};

/** 「選取的人以下」選的人：第一個有父親、也有孩子的成員（和對照腳本相同） */
function subject(b: Board): string {
  const list = Object.values(b.people);
  const p = list.find(
    (x): x is Member =>
      x.kind === 'member' &&
      !!x.fatherId &&
      list.some((k) => k.kind === 'member' && k.fatherId === x.id),
  );
  return p?.id ?? '';
}

function plan(b: Board, c: Case, scale = 2) {
  const options: ExportOptions = {
    range: c.sub ? 'sub' : 'all',
    orient: c.orient,
    card: c.card,
    title: c.title !== false,
    gens: c.gens !== false,
    spouses: c.spouses !== false,
  };
  return planExport({
    board: b,
    view: { cardMode: c.compact ? 'compact' : 'full', memo: !!c.memo, colors: true, collapsed: [] },
    options,
    selectedId: c.sub ? subject(b) : null,
    scale,
  });
}

describe('畫布大小和原作匯出的 PNG 相同', () => {
  for (const [ds, name, size] of sizes.cases as [string, string, string][]) {
    it(`${ds}／${name}：${size}`, () => {
      const p = plan(board(ds), CASES[name]);
      expect(p && `${p.canvasWidth}x${p.canvasHeight}`).toBe(size);
    });
  }
});

describe('版面', () => {
  it('縱向：左邊 96（世代標籤）、上方 80（標題）；不畫世代標籤時左邊 40', () => {
    const b = board('basic');
    const p = plan(b, CASES['v-full']);
    expect(p).toMatchObject({ left: 96, top: 80, pad: 40 });
    const q = plan(b, CASES['v-plain']);
    expect(q).toMatchObject({ left: 40, top: 80 });
    /* 有用到的色分類時，沒有標題也留標題列 */
    expect(q?.legend.length).toBeGreaterThan(0);
  });

  it('橫向：x、y 對調，世代由左到右、上方多 30', () => {
    const b = board('basic');
    const p = plan(b, CASES['h-full']);
    expect(p).toMatchObject({ top: 110, left: 40, orient: 'h', DG: 64 });
    const gens = new Map<number, number>();
    for (const n of p?.nodes ?? []) gens.set(n.node.gen, n.x);
    expect([...gens.entries()].sort((a, c) => a[0] - c[0]).map(([, x]) => x)).toEqual([
      0,
      140 + 64,
      2 * (140 + 64),
      3 * (140 + 64),
    ]);
  });

  it('選取的人以下：只有他與子孫；沒有選取時不能匯出', () => {
    const b = board('basic');
    const p = plan(b, CASES['v-sub']);
    const id = subject(b);
    expect(p?.nodes[0].node.id).toBe(id);
    expect(planExport({ ...planArgs(b), selectedId: null })).toBeNull();
  });

  it('沒有人時不能匯出', () => {
    const empty: Board = {
      id: 'e',
      title: '',
      createdAt: '',
      align: 'center',
      cats: [],
      people: {},
    };
    expect(plan(empty, CASES['v-full'])).toBeNull();
  });

  it('倍率的上限：寬高 16,000 px、總像素 6,400 萬', () => {
    const b = board('big');
    const p = plan(b, CASES['v-full']);
    expect(p).not.toBeNull();
    if (!p) return;
    expect(p.canvasWidth).toBeLessThanOrEqual(MAX_SIDE + 1);
    expect(p.canvasWidth * p.canvasHeight).toBeLessThanOrEqual(MAX_PIXELS * 1.001);
    expect(p.scale).toBeLessThan(2);
  });
});

function planArgs(b: Board) {
  return {
    board: b,
    view: { cardMode: 'full' as const, memo: false, colors: true, collapsed: [] },
    options: {
      range: 'sub' as const,
      orient: 'v' as const,
      card: 'view' as const,
      title: true,
      gens: true,
      spouses: true,
    },
    scale: 2,
  };
}

describe('檔名', () => {
  it('檔名欄 → 圖板名稱 → 家系圖；不能用的字換成底線（共用的檔名清理）、結尾的 .png 不重複', () => {
    expect(pngFileName('綾瀬家', '範例')).toBe('綾瀬家.png');
    expect(pngFileName('  ', '範例：綾瀬家')).toBe('範例：綾瀬家.png');
    expect(pngFileName(null, '')).toBe('家系圖.png');
    expect(pngFileName('a/b:c?.PNG', 'x')).toBe('a_b_c_.png');
    expect(pngFileName('家系圖.png', 'x')).toBe('家系圖.png');
  });
});
