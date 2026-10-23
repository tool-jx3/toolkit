/**
 * 家系圖第二批對等驗證後的修正（規格 7.4）的單元測試：
 * - SVG 的文字垂直位置照 canvas 實際的基準算（alphabetic 加上量出來的位移），不用 dominant-baseline；
 * - GM 檢視與 GM 用的匯出：PL 版會拿掉的人（含連到 GM 專用的人的配偶卡片）都畫 GM 專用的斜線；
 * - PL 檢視的色分類只列看得到的人用到的。
 * （參照不懸空見 family-tree-refs.test.ts；畫面與匯出的像素在 e2e。）
 */
import { describe, expect, it } from 'vitest';
import { layoutOptionsOf, redo, undo, viewOptions } from '@/tools/family-tree/actions';
import { planExport } from '@/tools/family-tree/export/render';
import { SvgContext } from '@/tools/family-tree/export/svgctx';
import { hiddenIds, plPeople } from '@/tools/family-tree/model/gm';
import { setGmOnly, setLink, usedCategories } from '@/tools/family-tree/model/ops';
import { memberText } from '@/tools/family-tree/model/present';
import { linkedBy, membersOf } from '@/tools/family-tree/model/tree';
import type { Board, Member, People, Spouse } from '@/tools/family-tree/model/types';
import { boardNow, setPrefs, updateBoard, updatePeople, useTree } from '@/tools/family-tree/store';

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

describe('SVG 的文字垂直位置照 canvas 的基準', () => {
  /** 量得到 alphabeticBaseline 的量測用 canvas：textBaseline middle 時 −4.5（alphabetic 基準線在 y 下面 4.5 px） */
  const measurer = () => {
    const ctx = {
      font: '',
      textBaseline: 'alphabetic' as CanvasTextBaseline,
      calls: 0,
      measureText(t: string) {
        ctx.calls++;
        const ab = {
          alphabetic: 0,
          middle: -4.5,
          top: -12,
          hanging: -9,
          bottom: 3,
          ideographic: 4,
        }[ctx.textBaseline];
        return { width: t.length * 10, alphabeticBaseline: ab } as TextMetrics;
      },
    };
    return ctx;
  };

  it('middle：alphabetic 的 y 加上位移（不寫 dominant-baseline）；倍率與平移照乘', () => {
    const c = new SvgContext(measurer() as unknown as CanvasRenderingContext2D);
    c.font = '700 17px "Noto Sans TC"';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('名', 50, 20);
    c.translate(10, 100);
    c.scale(2, 2);
    c.fillText('名', 5, 3);
    const svg = c.toSvg(200, 200);
    expect(svg).toContain('<text x="50" y="24.5"');
    expect(svg).toContain('<text x="20" y="115"');
    expect(svg).not.toContain('dominant-baseline');
  });

  it('top：同樣用位移；alphabetic 不動；量過的字型不重複量', () => {
    const mm = measurer();
    const c = new SvgContext(mm as unknown as CanvasRenderingContext2D);
    c.font = '400 12px sans-serif';
    c.textBaseline = 'top';
    c.fillText('a', 0, 10);
    c.fillText('b', 0, 20);
    c.textBaseline = 'alphabetic';
    c.fillText('c', 0, 30);
    const svg = c.toSvg(100, 100);
    expect(svg).toContain('y="22"');
    expect(svg).toContain('y="32"');
    expect(svg).toContain('y="30"');
    expect(mm.calls).toBe(1);
    expect(mm.textBaseline).toBe('alphabetic');
  });

  it('前後有空白的文字（「1976 – 」）：SVG 不吃掉空白，位置才和 canvas 一樣', () => {
    const c = new SvgContext(measurer() as unknown as CanvasRenderingContext2D);
    c.textAlign = 'center';
    c.fillText('1976 – ', 0, 0);
    c.fillText(' – 1999', 0, 0);
    c.fillText('1976 – 1999', 0, 0);
    const svg = c.toSvg(10, 10);
    expect(svg.match(/white-space:pre/g)).toHaveLength(2);
    expect(svg).toMatch(/<text [^>]*style="white-space:pre"[^>]*>1976 – <\/text>/);
    expect(svg).toMatch(/<text (?![^>]*white-space)[^>]*>1976 – 1999<\/text>/);
  });

  it('量不到 alphabeticBaseline 的環境：退回 dominant-baseline', () => {
    const c = new SvgContext({
      font: '',
      textBaseline: 'alphabetic',
      measureText: (t: string) => ({ width: t.length * 10 }) as TextMetrics,
    } as unknown as CanvasRenderingContext2D);
    c.textBaseline = 'middle';
    c.fillText('名', 1, 2);
    c.textBaseline = 'top';
    c.fillText('名', 1, 2);
    const svg = c.toSvg(10, 10);
    expect(svg).toContain('y="2" font-family');
    expect(svg).toContain('dominant-baseline="central"');
    expect(svg).toContain('dominant-baseline="hanging"');
  });
});

/** r（妻 rw）→ a、b；q → x；g 只有 GM 看得到（連同孩子 g1）；a 的配偶 as 連到 g；rw 的配偶卡片 */
function board(): Board {
  const people = P(
    m('r', { gen: 1 }),
    sp('rw', 'r'),
    m('a', { fatherId: 'r', motherId: 'rw', order: 1 }),
    m('b', { fatherId: 'r', motherId: 'rw', order: 2, gender: 'F', cat: 'c1' }),
    sp('as', 'a', { name: '' }),
    m('g', { gen: 1, order: 2, cat: 'c2' }),
    m('g1', { fatherId: 'g', order: 1, cat: 'c3' }),
    sp('bs', 'b', { name: '' }),
    m('x', { gen: 1, order: 3 }),
  );
  setLink(people, 'as', 'g', 'gs');
  setGmOnly(people, 'g', true);
  return {
    id: 'b1',
    title: '測試',
    createdAt: '2026-01-01T00:00:00.000Z',
    align: 'center',
    cats: [
      { id: 'c1', name: 'cat-visible', color: '#336699' },
      { id: 'c2', name: 'cat-gm-root', color: '#993366' },
      { id: 'c3', name: 'cat-gm-kid', color: '#669933' },
      { id: 'c4', name: 'cat-unused', color: '#996633' },
    ],
    people,
  };
}

describe('GM 專用的斜線：PL 版會拿掉的人都畫（含連到 GM 專用的人的配偶卡片）', () => {
  it('hiddenIds＝PL 版沒有的人', () => {
    const b = board();
    const hidden = hiddenIds(b.people);
    expect([...hidden].sort()).toEqual(['as', 'g', 'g1', 'gs'].sort());
    const pl = new Set(Object.keys(plPeople(b.people)));
    const missing = Object.keys(b.people).filter((id) => !pl.has(id));
    expect(missing.sort()).toEqual([...hidden].sort());
    /* a 是看得到的成員，但 a 的配偶卡片 as 連到 GM 專用的 g */
    expect(hidden.has('a')).toBe(false);
    expect(hidden.has('as')).toBe(true);
  });

  it('沒有人只有 GM 看得到：什麼都不算（不整理整棵樹）', () => {
    const b = board();
    setGmOnly(b.people, 'g', false);
    expect(hiddenIds(b.people).size).toBe(0);
  });

  it('GM 用的匯出：連到 GM 專用的人的配偶卡片也在斜線的範圍；PL 用沒有標記', () => {
    const b = board();
    const base = {
      board: b,
      view: {
        cardMode: 'full' as const,
        memo: false,
        colors: true,
        collapsed: [],
        maternal: true,
        stubs: true,
        links: true,
        daughterName: false,
      },
      options: {
        range: 'all' as const,
        orient: 'v' as const,
        card: 'view' as const,
        title: true,
        gens: true,
        spouses: true,
      },
      scale: 1,
    };
    const gm = planExport({ ...base, options: { ...base.options, audience: 'gm' } });
    expect(gm?.gmMarks).toBe(true);
    expect([...(gm?.gmScope ?? [])].sort()).toEqual(['as', 'g', 'g1', 'gs'].sort());
    const pl = planExport({ ...base, options: { ...base.options, audience: 'pl' } });
    expect(pl?.gmMarks).toBe(false);
    expect(pl?.gmScope.size).toBe(0);
  });
});

describe('PL 檢視的色分類：只列 PL 看得到的人用到的', () => {
  it('只有 GM 專用的人用到的、沒人用的分類都不列；欄位是秘密的人用到的也不列', () => {
    const b = board();
    const names = (people: People) => usedCategories({ ...b, people }).map((c) => c.name);
    expect(names(b.people)).toEqual(['cat-visible', 'cat-gm-root', 'cat-gm-kid']);
    expect(names(plPeople(b.people))).toEqual(['cat-visible']);
    /* b 的色分類設成「PL 看不到的欄位」：PL 版沒有 */
    (b.people.b as Member).gmFields = ['cat'];
    expect(names(plPeople(b.people))).toEqual([]);
  });
});

describe('特大圖板（約 2,000 人）的效能：不為每張卡片掃整張圖板', () => {
  /** n 位成員（一條直系，每人一位配偶）；Proxy 數 Object.values／keys 掃了幾次 */
  function big(n: number) {
    const list: (Member | Spouse)[] = [];
    for (let i = 0; i < n; i++) {
      list.push(m(`p${i}`, i ? { fatherId: `p${i - 1}` } : { gen: 1 }));
      list.push(sp(`s${i}`, `p${i}`));
    }
    const people = P(...list);
    const scans = { n: 0 };
    const proxy = new Proxy(people, {
      ownKeys(t) {
        scans.n++;
        return Reflect.ownKeys(t);
      },
    });
    return { people: proxy, scans };
  }

  it('memberText：沒有人連過來的成員不用找他的配偶（原本每張卡片掃一遍，人數²）', () => {
    const { people, scans } = big(300);
    const lb = linkedBy(people);
    const members = membersOf(people);
    const before = scans.n;
    for (const p of members) memberText(people, p, lb, false);
    expect(scans.n).toBe(before);
  });

  it('有人連過來的成員才掃（結果同原本：自己有連回去的配偶卡片時不寫「婚姻 · ○○」）', () => {
    const { people, scans } = big(30);
    (people.s0 as Spouse).link = { personId: 'p5' };
    const lb = linkedBy(people);
    const before = scans.n;
    const t5 = memberText(people, people.p5 as Member, lb, false);
    expect(t5.meta).toBe('婚姻 · p0');
    expect(scans.n).toBe(before + 1);
    /* p5 自己有連回 p0 的配偶卡片：不寫 */
    (people.s5 as Spouse).link = { personId: 'p0' };
    expect(memberText(people, people.p5 as Member, linkedBy(people), false).meta).toBeNull();
  });

  it('排版設定只看顯示設定：layoutOptionsOf 和整份設定算出來的一樣', () => {
    const board: Board = {
      id: 'b',
      title: 't',
      createdAt: '',
      align: 'eldest',
      cats: [],
      people: P(m('a', { gen: 1, avatar: 'img' })),
    };
    const prefs = {
      cardMode: 'compact',
      memo: true,
      spouses: false,
      maternal: false,
      stubs: false,
      daughterName: true,
      avatars: true,
      collapsed: { b: ['a'] },
    } as unknown as Parameters<typeof viewOptions>[0];
    expect(viewOptions(prefs, board, board.people)).toEqual(
      layoutOptionsOf({
        cardMode: 'compact',
        memo: true,
        avatar: true,
        spouses: false,
        maternal: false,
        stubs: false,
        daughterName: true,
        align: 'eldest',
        collapsed: ['a'],
      }),
    );
  });
});

describe('PL 檢視不能改資料（D29）：改資料、復原、重做都不作用', () => {
  it('updateBoard、updatePeople、復原、重做在 PL 檢視時什麼都不做；切回 GM 檢視照常', () => {
    const b = board();
    useTree.setState({ data: { boards: [b] } });
    useTree.temporal.getState().clear();
    setPrefs({ current: b.id, viewMode: 'gm' });
    updatePeople((d) => {
      d.a.name = '改一';
    });
    expect(boardNow().people.a.name).toBe('改一');
    setPrefs({ viewMode: 'pl' });
    updatePeople((d) => {
      d.a.name = '不該改到';
    });
    updateBoard((x) => {
      x.title = '不該改到';
    });
    expect(boardNow().people.a.name).toBe('改一');
    expect(boardNow().title).toBe('測試');
    undo();
    expect(boardNow().people.a.name).toBe('改一');
    setPrefs({ viewMode: 'gm' });
    undo();
    expect(boardNow().people.a.name).toBe('a');
    setPrefs({ viewMode: 'pl' });
    redo();
    expect(boardNow().people.a.name).toBe('a');
    setPrefs({ viewMode: 'gm' });
    redo();
    expect(boardNow().people.a.name).toBe('改一');
  });
});
