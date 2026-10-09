/**
 * 劇本心得九宮格（review-grid）的版面（規格第 3 節）：用假的字寬（每字 0.6 倍字級）排卡片與比較圖，檢查尺寸、位置、
 * 空白欄位不畫、標籤換行、規則截短、清單同一列等高、依原圖比例；比較圖的分組。
 */
import { describe, expect, it } from 'vitest';
import type { SceneNode, TextFont, TextNode } from '@/core/scene';
import { groupByTitle, layoutCompare, titleKey } from '@/tools/review-grid/compare';
import {
  CARD,
  CARD_CHIP,
  chipsBlock,
  ellipsize,
  gridColumns,
  hasProfile,
  imageBoxHeight,
  type LayoutEnv,
  layoutCard,
  wrapLines,
} from '@/tools/review-grid/layout';
import { emptyCell, initialState, type ReviewState } from '@/tools/review-grid/model';

const measure = (f: TextFont, t: string) => Array.from(t).length * f.size * 0.6;
const env: LayoutEnv = { measure, image: () => null };

const texts = (nodes: readonly SceneNode[]): TextNode[] =>
  nodes.filter((n): n is TextNode => n.kind === 'text');

const textOf = (nodes: readonly SceneNode[], s: string) => texts(nodes).find((n) => n.text === s);

function state(patch: (d: ReviewState) => void): ReviewState {
  const d = initialState();
  patch(d);
  return d;
}

describe('文字', () => {
  it('wrapLines：依寬度斷行、保留原本的換行、空白時沒有行', () => {
    const f = { family: 'x', size: 10 };
    expect(wrapLines(env, f, '一二三四五六', 30)).toEqual(['一二三四五', '六']);
    expect(wrapLines(env, f, 'a\nb', 100)).toEqual(['a', 'b']);
    expect(wrapLines(env, f, '', 100)).toEqual([]);
  });

  it('ellipsize：放不下時截短加「…」', () => {
    const f = { family: 'x', size: 10 };
    expect(ellipsize(env, f, '短', 100)).toBe('短');
    expect(ellipsize(env, f, '一二三四五六七八', 30)).toBe('一二三四…');
  });

  it('chipsBlock：放不下時換到下一排，比整排寬的標籤自己斷行', () => {
    const b = chipsBlock(env, ['一二三', '四五六', '七'], CARD_CHIP, 90);
    expect(b).not.toBeNull();
    const rects = b!.nodes(0, 0).filter((n) => n.kind === 'rect') as {
      x: number;
      y: number;
      w: number;
      h: number;
    }[];
    /* 一二三：3 × 7.2 + 20 = 41.6；四五六接在後面（41.6 + 6 + 41.6 = 89.2 ≤ 90）；七換行 */
    expect(rects.map((r) => [Math.round(r.x * 10) / 10, r.y])).toEqual([
      [0, 0],
      [47.6, 0],
      [0, 34],
    ]);
    expect(b!.height).toBe(28 + 6 + 28);
    const long = chipsBlock(env, ['一二三四五六七八九十'], CARD_CHIP, 60);
    /* 內寬 40：每行 5 個字（36）→ 2 行 */
    expect(long!.height).toBe(16 * 2 + 12);
    expect(chipsBlock(env, [], CARD_CHIP, 60)).toBeNull();
  });
});

describe('心得卡片', () => {
  it('預設：沒有個人資料列，9 個正方形的圖片框，900 × 900', () => {
    const lay = layoutCard(initialState(), env);
    expect(lay.width).toBe(900);
    expect(lay.height).toBe(900);
    expect(lay.profile).toBeNull();
    const { width } = gridColumns('grid');
    expect(width).toBeCloseTo((800 - 60) / 3);
    expect(lay.cells[0].box).toEqual({ x: 50, y: 50, width, height: width });
    expect(lay.cells[4].box.x).toBeCloseTo(50 + width + 30);
    expect(lay.cells[4].box.y).toBeCloseTo(50 + width + 30);
    expect(texts(lay.nodes)).toHaveLength(0);
  });

  it('個人資料：頭像 100、文字在右邊垂直置中；只有暱稱時不畫頭像框', () => {
    const d = state((x) => {
      x.profile = {
        image: { id: 'p', name: '', width: 10, height: 10 },
        name: '阿草',
        handle: '@kusa',
      };
    });
    expect(hasProfile(d)).toBe(true);
    const lay = layoutCard(d, env);
    expect(lay.profile).toEqual({ x: 50, y: 50, width: 800, height: 100 });
    const name = textOf(lay.nodes, '阿草')!;
    expect(name.x).toBe(174);
    /* 資訊高 36 + 6 + 20 = 62，置中在 100 裡 */
    expect(name.y).toBe(50 + 19);
    expect(textOf(lay.nodes, '@kusa')!.y).toBe(50 + 19 + 42);
    expect(lay.cells[0].box.y).toBe(50 + 100 + 40);
    const textOnly = layoutCard(
      state((x) => {
        x.profile.name = '阿草';
      }),
      env,
    );
    expect(textOf(textOnly.nodes, '阿草')!.x).toBe(50);
    expect(textOnly.profile!.height).toBe(36);
  });

  it('九宮格的一格：圖片框 → 劇本名稱 → 作者 → 標籤；規則疊在圖片左上角', () => {
    const d = state((x) => {
      x.cells[0] = { ...emptyCell('c1'), rule: 'CoC', title: '雨夜', writer: 'K', tags: ['好玩'] };
    });
    const lay = layoutCard(d, env);
    const w = gridColumns('grid').width;
    const title = textOf(lay.nodes, '雨夜')!;
    expect(title.x).toBe(54);
    expect(title.y).toBeCloseTo(50 + w + 12);
    expect(textOf(lay.nodes, 'K')!.y).toBeCloseTo(50 + w + 12 + 23.4 + 6);
    expect(textOf(lay.nodes, '好玩')!.y).toBeCloseTo(50 + w + 12 + 23.4 + 6 + 18 + 6 + 4 + 6);
    const rule = textOf(lay.nodes, 'CoC')!;
    expect([rule.x, rule.y]).toEqual([50 + 12 + 10, 50 + 12 + 6]);
    /* 同一列的格子一樣高（最高的那格） */
    expect(lay.cells[1].box.height).toBeCloseTo(w + 12 + 23.4 + 6 + 18 + 6 + 4 + 28);
  });

  it('規則太長時截短；空白的欄位不畫', () => {
    const d = state((x) => {
      x.cells[0].rule = '很長很長很長很長很長很長很長很長很長很長';
    });
    /* 中文字寬＝字級 */
    const wide = (f: TextFont, t: string) => Array.from(t).length * f.size;
    const lay = layoutCard(d, { ...env, measure: wide });
    const rule = texts(lay.nodes)[0];
    expect(rule.text.endsWith('…')).toBe(true);
    expect(wide(rule.font, rule.text)).toBeLessThanOrEqual(gridColumns('grid').width - 44);
    expect(texts(lay.nodes)).toHaveLength(1);
  });

  it('依原圖：圖片框的高度依圖片比例，沒有圖片時 150', () => {
    const w = gridColumns('grid').width;
    expect(
      imageBoxHeight({ image: { id: 'a', name: '', width: 200, height: 300 } }, 'original', w),
    ).toBeCloseTo(w * 1.5);
    expect(imageBoxHeight({ image: null }, 'original', w)).toBe(CARD.emptyOriginalHeight);
    expect(imageBoxHeight({ image: null }, 'square', w)).toBe(w);
    const d = state((x) => {
      x.ratio = 'original';
      x.cells = [{ ...emptyCell('c1'), image: { id: 'a', name: '', width: 100, height: 50 } }];
    });
    expect(layoutCard(d, env).height).toBe(Math.ceil(50 + w / 2 + 50));
  });

  it('清單：一列 2 格、灰底卡片等高；規則、劇本名稱、作者、標籤、感想；九宮格不畫感想', () => {
    const d = state((x) => {
      x.view = 'list';
      x.cells = [
        {
          ...emptyCell('c1'),
          rule: 'DX3',
          title: '標題',
          writer: 'W',
          tags: ['好玩'],
          comment: '一\n二',
        },
        { ...emptyCell('c2'), title: '短' },
      ];
    });
    const lay = layoutCard(d, env);
    const { width } = gridColumns('list');
    expect(width).toBe(390);
    const x0 = 50 + 28;
    expect(textOf(lay.nodes, 'DX3')!.x).toBe(x0 + 10);
    const title = textOf(lay.nodes, '標題')!;
    expect([title.x, title.y]).toEqual([x0, 50 + 24 + 22 + 2 + 8]);
    const comment = textOf(lay.nodes, '一\n二')!;
    /* 規則 24 + 8 + 標題 26 + 8 + 作者 18 + 8 + 6 + 標籤 28 + 8 + 10 */
    expect(comment.y).toBe(50 + 24 + 24 + 8 + 26 + 8 + 18 + 8 + 6 + 28 + 8 + 10 + 1 + 14);
    const h = 24 + (24 + 8 + 26 + 8 + 18 + 8 + 6 + 28 + 8 + 10 + Math.max(48, 42 + 28 + 2)) + 24;
    expect(lay.cells[0].box.height).toBe(h);
    expect(lay.cells[1].box.height).toBe(h);
    const cards = lay.nodes.filter((n) => n.kind === 'rect' && n.fill === '#f1f3f5');
    expect(cards).toHaveLength(2);
    expect(
      layoutCard({ ...d, view: 'grid' }, env).nodes.some(
        (n) => n.kind === 'text' && n.text.includes('一\n二'),
      ),
    ).toBe(false);
  });
});

describe('比較圖', () => {
  const person = (
    name: string,
    cells: { title: string; rule?: string; tags?: string[]; comment?: string }[],
  ) => ({
    file: `${name}.zip`,
    name,
    handle: '',
    avatar: null,
    cells: cells.map((c) => ({
      rule: c.rule ?? '',
      title: c.title,
      writer: '',
      tags: c.tags ?? [],
      comment: c.comment ?? '',
    })),
  });

  it('titleKey：全形半形、空白、大小寫視為相同', () => {
    expect(titleKey('  ＡＢＣ　 def ')).toBe(titleKey('abc def'));
  });

  it('依劇本名稱分組：第一次出現的順序、第一個有填的規則、沒有劇本名稱的不算', () => {
    const groups = groupByTitle([
      person('甲', [{ title: '雨夜' }, { title: '' }, { title: 'Moon', rule: 'CoC' }]),
      person('乙', [
        { title: 'moon', rule: 'DX3', tags: ['好玩'], comment: ' 讚 ' },
        { title: '雨夜', rule: 'CoC 7版' },
      ]),
    ]);
    expect(groups.map((g) => [g.title, g.rule, g.entries.map((e) => e.person)])).toEqual([
      ['雨夜', 'CoC 7版', [0, 1]],
      ['Moon', 'CoC', [0, 1]],
    ]);
    expect(groups[1].entries[1]).toEqual({ person: 1, tags: ['好玩'], comment: '讚' });
  });

  it('版面：寬 1000、標題與人數置中、每個劇本一段、每個人一列', () => {
    const people = [
      person('甲', [{ title: '雨夜', comment: '好' }]),
      person('', [{ title: '雨夜' }]),
    ];
    const groups = groupByTitle(people);
    const lay = layoutCompare(people, groups, env, {
      title: '劇本心得比較',
      people: (n) => `${n} 人的心得`,
      anonymous: '匿名',
    });
    expect(lay.width).toBe(1000);
    expect(textOf(lay.nodes, '劇本心得比較')!.align).toBe('center');
    expect(textOf(lay.nodes, '2 人的心得')).toBeTruthy();
    expect(textOf(lay.nodes, '匿名')).toBeTruthy();
    const rows = lay.nodes.filter((n) => n.kind === 'rect' && n.fill === '#f1f3f5');
    expect(rows).toHaveLength(2);
    const first = rows[0] as { y: number; h: number };
    const second = rows[1] as { y: number };
    expect(second.y - (first.y + first.h)).toBe(20);
    expect(lay.height).toBe(
      Math.ceil((second.y as number) + (rows[1] as { h: number }).h + 40 + 50),
    );
  });
});
