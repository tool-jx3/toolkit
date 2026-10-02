/**
 * 表情產生器（emotion-maker）的規則：F02 內建素材的數量、F04～F08 點選與圖層順序、F13～F17 儲存／編輯／複製／隨機、
 * F19 自訂部件的命名、F20 移除引用（只清同一類，主控裁定）、F22 摘要、F30 預設組、F42／F43 匯出入格式、檔名。
 */
import { describe, expect, it } from 'vitest';
import {
  buildExportData,
  CATEGORY_ORDER,
  type CustomPart,
  decorationRows,
  draftOf,
  duplicateExpression,
  EMPTY_DRAFT,
  type Expression,
  exportFileName,
  ImportError,
  isEmptySelection,
  layerIds,
  mergeImport,
  moveDecorationRow,
  parseExportData,
  partBaseName,
  randomSelection,
  referencedPartIds,
  removePartRefs,
  saveDraft,
  sheetFileName,
  summaryText,
  timestamp,
  toggleDecoration,
  toggleSingle,
  uniqueName,
} from '@/tools/emotion-maker/logic';
import { BUILTIN_PARTS, builtinPart, HEAD_LAYERS } from '@/tools/emotion-maker/parts';
import { PRESETS } from '@/tools/emotion-maker/presets';

const expr = (over: Partial<Expression> = {}): Expression => ({
  id: 'x',
  label: '',
  showText: true,
  checked: true,
  eyes: null,
  brows: null,
  mouth: null,
  decorations: [],
  ...over,
});

let seq = 0;
const nextId = () => `n${++seq}`;

describe('F01／F02 內建素材', () => {
  it('每類的數量：眼 10、眉 4、嘴 10、裝飾 13；頭部底圖兩層', () => {
    expect(BUILTIN_PARTS.eyes).toHaveLength(10);
    expect(BUILTIN_PARTS.brows).toHaveLength(4);
    expect(BUILTIN_PARTS.mouth).toHaveLength(10);
    expect(BUILTIN_PARTS.deco).toHaveLength(13);
    expect(HEAD_LAYERS.map((p) => p.id)).toEqual(['head-fill', 'head-line']);
  });

  it('id 全部不重複、類別正確；同一類的名稱不重複', () => {
    const all = [...HEAD_LAYERS, ...CATEGORY_ORDER.flatMap((c) => BUILTIN_PARTS[c])];
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
    for (const c of CATEGORY_ORDER) {
      for (const p of BUILTIN_PARTS[c]) {
        expect(p.category).toBe(c);
        expect(builtinPart(p.id)).toBe(p);
      }
      const names = BUILTIN_PARTS[c].map((p) => p.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('裝飾涵蓋四種整臉色調與規格 3.1 的其他題材', () => {
    const names = BUILTIN_PARTS.deco.map((p) => p.name);
    for (const n of [
      '陰沉黑',
      '噁心紫',
      '生氣紅',
      '蒼白藍',
      '眼淚',
      '冒汗',
      '一滴汗',
      '眉間皺紋',
      '怒筋',
      '陰影',
      '絕望直線',
      '鼻下陰影',
      '臉紅',
    ])
      expect(names).toContain(n);
  });
});

describe('F04～F08 點選與疊放順序', () => {
  it('單選：點一個選取、點同一個取消、點別的取代', () => {
    expect(toggleSingle(null, 'a')).toBe('a');
    expect(toggleSingle('a', 'a')).toBeNull();
    expect(toggleSingle('a', 'b')).toBe('b');
  });

  it('裝飾：新加入的放最上層（陣列最後）、再點一次移除', () => {
    let d: string[] = [];
    d = toggleDecoration(d, 'blush');
    d = toggleDecoration(d, 'sweat');
    expect(d).toEqual(['blush', 'sweat']);
    expect(toggleDecoration(d, 'blush')).toEqual(['sweat']);
  });

  it('F06：填色、輪廓、眉、眼、嘴，最上面是裝飾', () => {
    expect(layerIds({ eyes: 'E', brows: 'B', mouth: 'M', decorations: ['d1', 'd2'] })).toEqual([
      'head-fill',
      'head-line',
      'B',
      'E',
      'M',
      'd1',
      'd2',
    ]);
    expect(layerIds({ eyes: null, brows: null, mouth: 'M', decorations: [] })).toEqual([
      'head-fill',
      'head-line',
      'M',
    ]);
  });

  it('F07：圖層清單上面＝前面，序號 1 是最前', () => {
    expect(decorationRows(['a', 'b', 'c'])).toEqual([
      { id: 'c', order: 1 },
      { id: 'b', order: 2 },
      { id: 'a', order: 3 },
    ]);
  });

  it('F08：往前一層／往後一層（清單的列號）', () => {
    /* 列：c(1) b(2) a(3)；把 a 往前一層 → c a b → 陣列（由下而上）b a c */
    expect(moveDecorationRow(['a', 'b', 'c'], 2, 1)).toEqual(['b', 'a', 'c']);
    /* 把 c 往後一層 → b c a → 陣列 a c b */
    expect(moveDecorationRow(['a', 'b', 'c'], 0, 1)).toEqual(['a', 'c', 'b']);
    /* 超出範圍不動 */
    expect(moveDecorationRow(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveDecorationRow(['a', 'b'], 1, 2)).toEqual(['a', 'b']);
  });
});

describe('F13～F17 儲存、編輯、複製、隨機', () => {
  it('四類全空時不儲存', () => {
    expect(isEmptySelection(EMPTY_DRAFT)).toBe(true);
    expect(saveDraft([], { ...EMPTY_DRAFT, label: '有標籤' }, null, nextId)).toEqual({ ok: false });
  });

  it('新的一筆加在最後、預設勾選、標籤去掉頭尾空白', () => {
    const list = [expr({ id: 'a', checked: false })];
    const r = saveDraft(
      list,
      { ...EMPTY_DRAFT, eyes: 'eyes-normal', label: '  哈囉\n第二行 \n', showText: false },
      null,
      () => 'new',
    );
    expect(r.ok && r.mode).toBe('added');
    if (!r.ok) return;
    expect(r.expressions.map((e) => e.id)).toEqual(['a', 'new']);
    expect(r.expressions[1]).toMatchObject({
      label: '哈囉\n第二行',
      showText: false,
      checked: true,
      eyes: 'eyes-normal',
    });
  });

  it('編輯中儲存＝原地更新（位置與勾選不變）', () => {
    const list = [
      expr({ id: 'a' }),
      expr({ id: 'b', checked: false, label: '舊' }),
      expr({ id: 'c' }),
    ];
    const r = saveDraft(list, { ...EMPTY_DRAFT, mouth: 'mouth-smile', label: '新' }, 'b', nextId);
    expect(r.ok && r.mode).toBe('updated');
    if (!r.ok) return;
    expect(r.expressions.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(r.expressions[1]).toMatchObject({ label: '新', checked: false, mouth: 'mouth-smile' });
  });

  it('載入編輯區的草稿與原本的資料分開（改草稿不會改到清單）', () => {
    const e = expr({ decorations: ['d1'] });
    const d = draftOf(e);
    d.decorations.push('d2');
    expect(e.decorations).toEqual(['d1']);
  });

  it('F23：複本插在正後方，標籤加「（複製）」，勾選與部件相同', () => {
    const list = [
      expr({ id: 'a', label: '開心', checked: false, eyes: 'E', decorations: ['d'] }),
      expr({ id: 'b' }),
    ];
    const out = duplicateExpression(list, 'a', () => 'copy');
    expect(out.map((e) => e.id)).toEqual(['a', 'copy', 'b']);
    expect(out[1]).toMatchObject({
      label: '開心（複製）',
      checked: false,
      eyes: 'E',
      decorations: ['d'],
    });
    expect(out[1].decorations).not.toBe(list[0].decorations);
  });

  it('F16：眼眉嘴各一個，裝飾只抽一個；候選包含自訂部件', () => {
    const candidates = {
      eyes: ['e1', 'e2', 'c-eye'],
      brows: ['b1'],
      mouth: ['m1', 'm2'],
      deco: ['d1', 'd2', 'c-deco'],
    };
    let state = 7;
    const rng = () => {
      state = (state * 16807) % 2147483647;
      return state / 2147483647;
    };
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const s = randomSelection(candidates, rng);
      expect(s.decorations).toHaveLength(1);
      expect(candidates.eyes).toContain(s.eyes);
      expect(s.brows).toBe('b1');
      expect(candidates.mouth).toContain(s.mouth);
      seen.add(s.eyes as string).add(s.decorations[0]);
    }
    expect(seen.has('c-eye')).toBe(true);
    expect(seen.has('c-deco')).toBe(true);
    /* rng 回傳接近 1 時不越界 */
    expect(randomSelection(candidates, () => 0.9999999).eyes).toBe('c-eye');
  });
});

describe('F19／F20 自訂部件', () => {
  it('名稱＝檔名去掉最後一個副檔名、去頭尾空白；空白時用「部件」', () => {
    expect(partBaseName('smile.png')).toBe('smile');
    expect(partBaseName('my.face.v2.webp')).toBe('my.face.v2');
    expect(partBaseName('  大笑 .png')).toBe('大笑');
    expect(partBaseName('.png')).toBe('部件');
    expect(partBaseName('沒有副檔名')).toBe('沒有副檔名');
  });

  it('重名時加上「 (2)」「 (3)」…', () => {
    expect(uniqueName('A', [])).toBe('A');
    expect(uniqueName('A', ['A'])).toBe('A (2)');
    expect(uniqueName('A', ['A', 'A (2)'])).toBe('A (3)');
    expect(uniqueName('A', ['A (2)'])).toBe('A');
  });

  it('移除引用只清同一類（主控裁定：不誤刪其他類別同名部件）', () => {
    const e = expr({ eyes: 'c1', decorations: ['c1', 'c2'] });
    expect(removePartRefs(e, 'eyes', 'c1')).toMatchObject({
      eyes: null,
      decorations: ['c1', 'c2'],
    });
    expect(removePartRefs(e, 'deco', 'c1')).toMatchObject({ eyes: 'c1', decorations: ['c2'] });
    /* 沒有引用時原封不動 */
    expect(removePartRefs(e, 'mouth', 'c1')).toBe(e);
  });
});

describe('F22 摘要', () => {
  const names: Record<string, string> = { B: '困擾', E: '閉眼', M: '微笑', d: '臉紅' };
  const nameOf = (id: string) => names[id];

  it('「眉毛 · 眼睛 · 嘴巴」的順序＋裝飾數', () => {
    expect(
      summaryText(expr({ eyes: 'E', brows: 'B', mouth: 'M', decorations: ['d', 'd'] }), nameOf),
    ).toBe('困擾 · 閉眼 · 微笑 · 裝飾×2');
    expect(summaryText(expr({ mouth: 'M' }), nameOf)).toBe('微笑');
  });

  it('不顯示文字的加註；什麼都沒選是「空白表情」', () => {
    expect(summaryText(expr({ eyes: 'E', showText: false }), nameOf)).toBe('閉眼 · 不顯示文字');
    expect(summaryText(expr(), nameOf)).toBe('空白表情');
    expect(summaryText(expr({ showText: false }), nameOf)).toBe('空白表情 · 不顯示文字');
  });
});

describe('F30 預設表情組', () => {
  it('20 組，每組都有標籤，部件都是對的類別', () => {
    expect(PRESETS).toHaveLength(20);
    for (const p of PRESETS) {
      expect(p.label.trim()).not.toBe('');
      expect(builtinPart(p.eyes as string)?.category).toBe('eyes');
      expect(builtinPart(p.brows as string)?.category).toBe('brows');
      expect(builtinPart(p.mouth as string)?.category).toBe('mouth');
      for (const d of p.decorations) expect(builtinPart(d)?.category).toBe('deco');
    }
  });

  it('標籤都不超過一行（300 px 格子、26 px 字：最多 10 個全形字）', () => {
    for (const p of PRESETS) expect(Array.from(p.label).length).toBeLessThanOrEqual(10);
  });
});

describe('檔名（本機時間）', () => {
  const d = new Date(2026, 0, 5, 9, 7);
  it('YYYYMMDD_HHMM', () => {
    expect(timestamp(d)).toBe('20260105_0907');
    expect(sheetFileName(d)).toBe('emotion-grid_20260105_0907.png');
    expect(exportFileName(d)).toBe('emotion-expressions_20260105_0907.zip');
  });
});

describe('F42／F43 匯出與匯入', () => {
  const parts: CustomPart[] = [
    { id: 'c-eye', category: 'eyes', name: '我的眼睛', assetId: 'aaa' },
    { id: 'c-deco', category: 'deco', name: '星星', assetId: 'bbb' },
    { id: 'c-unused', category: 'mouth', name: '沒用到', assetId: 'ccc' },
  ];
  const list = [
    expr({
      id: '1',
      label: '甲',
      eyes: 'c-eye',
      mouth: 'mouth-smile',
      decorations: ['deco-blush', 'c-deco'],
    }),
    expr({ id: '2', label: '乙', checked: false, showText: false, brows: 'brows-flat' }),
  ];

  it('匯出：全部表情（不含 id）＋用到的自訂部件與圖檔名', () => {
    const data = buildExportData(list, parts, (a) => (a === 'aaa' ? 'aaa.png' : null));
    expect(data.expressions).toEqual([
      {
        label: '甲',
        showText: true,
        checked: true,
        eyes: 'c-eye',
        brows: null,
        mouth: 'mouth-smile',
        decorations: ['deco-blush', 'c-deco'],
      },
      {
        label: '乙',
        showText: false,
        checked: false,
        eyes: null,
        brows: 'brows-flat',
        mouth: null,
        decorations: [],
      },
    ]);
    expect(data.customParts).toEqual([
      { id: 'c-eye', category: 'eyes', name: '我的眼睛', file: 'aaa.png' },
      { id: 'c-deco', category: 'deco', name: '星星', file: null },
    ]);
    expect([...referencedPartIds(list)]).toContain('c-deco');
  });

  it('格式不對時丟出 ImportError', () => {
    expect(() => parseExportData(null)).toThrow(ImportError);
    expect(() => parseExportData({ expressions: 'x' })).toThrow(ImportError);
    expect(() => parseExportData({ expressions: [1] })).toThrow(ImportError);
    /* 欄位缺漏時補預設值 */
    expect(parseExportData({ expressions: [{}] }).expressions[0]).toEqual({
      label: '',
      showText: true,
      checked: true,
      eyes: null,
      brows: null,
      mouth: null,
      decorations: [],
    });
  });

  const ctx = (assets: Record<string, string>) => ({
    builtinCategory: (id: string) => {
      const c = builtinPart(id)?.category;
      return c && c !== 'base' ? c : undefined;
    },
    builtinNames: (c: 'eyes' | 'brows' | 'mouth' | 'deco') => BUILTIN_PARTS[c].map((p) => p.name),
    assetIdOfFile: (f: string) => assets[f] ?? null,
    newPartId: nextId,
    newExpressionId: nextId,
  });

  it('同一張圖沿用本機的部件；新的圖加成自訂部件（重名加序號）；沒附圖的照樣加入名稱', () => {
    const incoming = parseExportData(
      buildExportData(list, parts, (a) =>
        a === 'aaa' ? 'aaa.png' : a === 'bbb' ? 'bbb.png' : null,
      ),
    );
    /* 本機：同一張眼睛（aaa）；裝飾沒有 bbb，但有一個同名的「星星」 */
    const local: CustomPart[] = [
      { id: 'L-eye', category: 'eyes', name: '另一個名字', assetId: 'aaa' },
      { id: 'L-star', category: 'deco', name: '星星', assetId: 'zzz' },
    ];
    const r = mergeImport(local, incoming, ctx({ 'aaa.png': 'aaa', 'bbb.png': 'bbb' }));
    expect(r.expressions).toHaveLength(2);
    expect(r.expressions[0].eyes).toBe('L-eye');
    expect(r.added).toHaveLength(1);
    expect(r.added[0]).toMatchObject({ category: 'deco', name: '星星 (2)', assetId: 'bbb' });
    expect(r.expressions[0].decorations).toEqual(['deco-blush', r.added[0].id]);
    expect(r.customParts).toHaveLength(3);
    /* 每筆都是新的 id，勾選與顯示文字照檔案 */
    expect(r.expressions[1]).toMatchObject({
      checked: false,
      showText: false,
      brows: 'brows-flat',
    });
    expect(r.expressions[0].id).not.toBe('1');
  });

  it('檔案裡沒有附圖：同類同名就沿用；否則加入沒有圖的部件（摘要照樣顯示名稱）', () => {
    const incoming = parseExportData(buildExportData(list, parts, () => null));
    const sameName = mergeImport(
      [{ id: 'L', category: 'eyes', name: '我的眼睛', assetId: 'qqq' }],
      incoming,
      ctx({}),
    );
    expect(sameName.expressions[0].eyes).toBe('L');
    const none = mergeImport([], incoming, ctx({}));
    const eye = none.added.find((p) => p.category === 'eyes');
    expect(eye).toMatchObject({ name: '我的眼睛', assetId: null });
    expect(none.expressions[0].eyes).toBe(eye?.id);
  });

  it('引用不到的部件（未知 id、類別不符）略過', () => {
    const r = mergeImport(
      [],
      parseExportData({
        expressions: [
          { eyes: 'mouth-smile', mouth: 'nope', decorations: ['deco-blush', 'x', 'deco-blush'] },
        ],
      }),
      ctx({}),
    );
    expect(r.expressions[0]).toMatchObject({
      eyes: null,
      mouth: null,
      decorations: ['deco-blush'],
    });
  });
});
