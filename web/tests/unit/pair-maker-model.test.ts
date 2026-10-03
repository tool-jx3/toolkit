/**
 * 角色介紹圖產生器（pair-maker）的資料規則：
 * - 版型清單（9 種、分類、畫布尺寸，規格 3.1）；
 * - F24 預設文字自動清空的條件、F33 條件顯示、F35 圖片的縮小比例與格式；
 * - 3.6 讀入資料的檢查（型別、範圍、圖片格、出處、貼紙、多人與頁數結構）；
 * - 3.2 多人資料框的大小與卡片位置、F71～F74 新增／刪除／左右移、身高的 cm 規則；
 * - F43～F52 貼紙的加入（大小、位置、上限、最前面）與順序；
 * - 3.8 橫幅圖片的位置；3.9 檔名。
 */
import { describe, expect, it } from 'vitest';
import { plainDoc } from '@/core/richtext';
import {
  condMet,
  type Draft,
  DraftError,
  downscaleRatio,
  imageTypeOk,
  MAX_STICKERS,
  type Sticker,
  shouldClear,
  validateDraft,
} from '@/tools/pair-maker/model';
import { outputName, stamp } from '@/tools/pair-maker/render';
import { addSticker, moveSticker, removeSticker, stepSticker } from '@/tools/pair-maker/stickers';
import { TEMPLATES, templateById } from '@/tools/pair-maker/templates';
import { imageCenter } from '@/tools/pair-maker/templates/banner';
import {
  addMember,
  cardOrigin,
  heightText,
  moveMember,
  removeMember,
  rosterSize,
} from '@/tools/pair-maker/templates/roster';

const def = (id: string) => {
  const d = templateById(id);
  if (!d) throw new Error(id);
  return d;
};

describe('版型清單', () => {
  it('9 種版型、分類與畫布尺寸（規格 3.1）', () => {
    expect(TEMPLATES.map((t) => [t.id, t.tag, t.size(t.initial())])).toEqual([
      ['duo-sheet', '資料整理', { width: 1920, height: 1080 }],
      ['duo-theme', '資料整理', { width: 1920, height: 1080 }],
      ['pattern-banner', '橫幅', { width: 1500, height: 500 }],
      ['roster', '資料整理', { width: 615, height: 694 }],
      ['pinned-post', '置頂推文', { width: 1920, height: 1080 }],
      ['log-plain', '文字', { width: 780, height: 1080 }],
      ['log-band', '文字', { width: 780, height: 1080 }],
      ['log-side', '文字', { width: 780, height: 1080 }],
      ['log-duo', '文字', { width: 780, height: 1080 }],
    ]);
  });

  it('每個版型的初始內容都通過讀入檢查（自動保存、專案檔的格式一致）', () => {
    for (const t of TEMPLATES) {
      const d = t.initial();
      expect(validateDraft(t, JSON.parse(JSON.stringify(d)))).toEqual(d);
    }
  });

  it('圖片格的數量與形狀（與舊版相同種類）', () => {
    const slots = (id: string) =>
      def(id)
        .sides(def(id).initial())
        .flatMap((s) => s.groups.flatMap((g) => g.slots ?? []))
        .map((s) => `${s.shape ?? 'rect'}${s.free ? '/free' : ''}`);
    /* 兩人資料：每人 全身、頭像（圓）、Q 版、追加 3 張 */
    expect(slots('duo-sheet')).toEqual(
      ['circle', 'rect', 'round', 'round', 'round', 'round']
        .flatMap((x) => [x])
        .concat(['circle', 'rect', 'round', 'round', 'round', 'round']),
    );
    /* 兩人配對：背景、主要、參考 3（圓）＋每人頭像（圓）、萌化 */
    expect(slots('duo-theme')).toEqual([
      'rect',
      'rect',
      'circle',
      'circle',
      'circle',
      'circle',
      'rect',
      'circle',
      'rect',
    ]);
    expect(slots('pattern-banner')).toEqual(['rect/free']);
    expect(slots('roster')).toEqual(['round', 'circle']);
    expect(slots('pinned-post')).toEqual(['rect']);
    expect(slots('log-plain')).toEqual(['rect']);
    expect(slots('log-band')).toEqual(['rect', 'rect']);
    expect(slots('log-duo')).toEqual(['rect', 'rect', 'rect']);
  });
});

describe('欄位規則', () => {
  it('F33 條件顯示：勾選框、某值、不是某值', () => {
    const v = { a: true, b: 'x' };
    expect(condMet('a', v)).toBe(true);
    expect(condMet('c', v)).toBe(false);
    expect(condMet({ id: 'b', is: 'x' }, v)).toBe(true);
    expect(condMet({ id: 'b', not: 'x' }, v)).toBe(false);
    expect(condMet(undefined, v)).toBe(true);
  });

  it('F24 預設文字：沒改過、還是預設值、不是空的才清；keep 的欄位不清；格式化文字要 clear', () => {
    const t = def('duo-sheet');
    const d = t.initial();
    const dv = t.defaults(d);
    const name = { id: 'left.name', label: '', type: 'text' as const };
    expect(shouldClear(name, d, dv)).toBe(true);
    expect(shouldClear(name, { ...d, touched: { 'left.name': true } }, dv)).toBe(false);
    expect(shouldClear(name, { ...d, v: { ...d.v, 'left.name': '別的' } }, dv)).toBe(false);
    expect(shouldClear({ ...name, id: 'left.height' }, d, dv)).toBe(false);
    expect(shouldClear({ ...name, keep: true }, d, dv)).toBe(false);
    const post = def('pinned-post');
    const pd = post.initial();
    expect(
      shouldClear({ id: 'p.char', label: '', type: 'rich', clear: true }, pd, post.defaults(pd)),
    ).toBe(true);
    expect(shouldClear({ id: 'p.char', label: '', type: 'rich' }, pd, post.defaults(pd))).toBe(
      false,
    );
  });

  it('F35 圖片：只收 PNG、JPEG、WebP；長邊超過 2048 等比縮小', () => {
    expect(['image/png', 'image/jpeg', 'image/webp', 'image/gif'].map(imageTypeOk)).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(downscaleRatio(4096, 1000)).toBe(0.5);
    expect(downscaleRatio(2048, 2048)).toBe(1);
  });
});

describe('讀入資料的檢查（規格 3.6）', () => {
  const t = def('pattern-banner');
  const base = () => JSON.parse(JSON.stringify(t.initial())) as Draft;

  it('型別與範圍不對時拒絕', () => {
    const cases: [string, unknown][] = [
      ['c.scale', 201],
      ['c.scale', '100'],
      ['c.blur', 'yes'],
      ['c.kind', 'stripes'],
      ['c.back', 'white'],
    ];
    for (const [id, value] of cases) {
      const d = base();
      (d.v as Record<string, unknown>)[id] = value;
      expect(() => validateDraft(t, d), id).toThrow(DraftError);
    }
    expect(() => validateDraft(t, null)).toThrow(DraftError);
  });

  it('缺的欄位用預設值；色碼轉小寫；不屬於這個版型的圖片格丟掉；出處上限 100 字', () => {
    const d = base();
    delete (d.v as Record<string, unknown>)['c.rotate'];
    d.v['c.back'] = '#ABCDEF';
    d.images = { 'c.img': 'abc123', zzz: 'def456' };
    const r = validateDraft(t, d);
    expect(r.v['c.rotate']).toBe(45);
    expect(r.v['c.back']).toBe('#abcdef');
    expect(r.images).toEqual({ 'c.img': 'abc123' });
    d.v['cite:c.img'] = 'x'.repeat(101);
    expect(() => validateDraft(t, d)).toThrow(DraftError);
  });

  it('文字超過上限、格式化文字不正確時拒絕', () => {
    const s = def('duo-sheet');
    const d = JSON.parse(JSON.stringify(s.initial())) as Draft;
    d.v['left.name'] = 'x'.repeat(101);
    expect(() => validateDraft(s, d)).toThrow(DraftError);
    const p = def('pinned-post');
    const pd = JSON.parse(JSON.stringify(p.initial())) as Draft;
    pd.v['p.char'] = { lines: [{ runs: [{ text: 'a', bold: 'x', color: '#000000' }] }] } as never;
    expect(() => validateDraft(p, pd)).toThrow(DraftError);
  });

  it('貼紙：id 不重複、座標是數字、寬高 8～長邊 2 倍、位置在長邊 3 倍內、最多 30 張', () => {
    const sticker = (id: string, more: Partial<Sticker> = {}): Sticker => ({
      id,
      asset: 'a1',
      name: 'n',
      cx: 10,
      cy: 10,
      width: 50,
      height: 50,
      rotation: 0,
      shadow: true,
      outline: false,
      cite: 'c',
      ...more,
    });
    const ok = base();
    ok.stickers = [sticker('s1')];
    expect(validateDraft(t, ok).stickers[0]).toEqual(sticker('s1'));
    for (const bad of [
      [sticker('s1'), sticker('s1')],
      [sticker('s1', { width: 7 })],
      [sticker('s1', { width: 3001 })],
      [sticker('s1', { cx: 4501 })],
      [sticker('s1', { rotation: Number.NaN })],
      Array.from({ length: MAX_STICKERS + 1 }, (_, i) => sticker(`s${i}`)),
    ]) {
      const d = base();
      d.stickers = bad;
      expect(() => validateDraft(t, d)).toThrow(DraftError);
    }
  });

  it('多人資料框與文字記錄的結構', () => {
    const r = def('roster');
    const d = JSON.parse(JSON.stringify(r.initial())) as Draft;
    for (const members of [[], [1, 1], [31], Array.from({ length: 31 }, (_, i) => i + 1)]) {
      expect(() => validateDraft(r, { ...d, members })).toThrow(DraftError);
    }
    const l = def('log-plain');
    const ld = JSON.parse(JSON.stringify(l.initial())) as Draft;
    expect(() => validateDraft(l, { ...ld, pages: [0] })).toThrow(DraftError);
    /* 貼紙要在存在的頁上 */
    expect(() =>
      validateDraft(l, {
        ...ld,
        stickers: [
          {
            id: 's',
            asset: 'a',
            name: '',
            cx: 1,
            cy: 1,
            width: 10,
            height: 10,
            rotation: 0,
            shadow: false,
            outline: false,
            cite: '',
            page: 2,
          },
        ],
      }),
    ).toThrow(DraftError);
  });
});

describe('多人資料框（規格 3.2、F71～F74）', () => {
  it('畫布大小與卡片位置：一列 3 張，兩列以上多 2 px', () => {
    expect([1, 3, 4, 7, 30].map((n) => rosterSize(n))).toEqual([
      { width: 615, height: 694 },
      { width: 1845, height: 694 },
      { width: 1845, height: 1390 },
      { width: 1845, height: 2084 },
      { width: 1845, height: 6942 },
    ]);
    expect([0, 2, 3, 5].map(cardOrigin)).toEqual([
      { x: 0, y: 0 },
      { x: 1230, y: 0 },
      { x: 0, y: 696 },
      { x: 1230, y: 696 },
    ]);
  });

  it('新增：取 1～30 沒用過的最小號；分頁名稱的號碼另外遞增；30 人時停止', () => {
    const t = def('roster');
    let d = t.initial();
    const a = addMember(d);
    expect(a?.side).toBe('m2');
    d = a?.draft ?? d;
    d = addMember(d)?.draft ?? d;
    expect(d.members).toEqual([1, 2, 3]);
    d = removeMember(d, 'm2') ?? d;
    expect(d.members).toEqual([1, 3]);
    const b = addMember(d);
    expect(b?.side).toBe('m2');
    expect(b?.draft.v['m2.tab']).toBe('角色 4');
    let full = d;
    while (full.members && full.members.length < 30) full = addMember(full)?.draft ?? full;
    expect(addMember(full)).toBeNull();
  });

  it('刪除：連同輸入與圖片；只剩一人時不行。左右移：與相鄰交換，到頭時不行', () => {
    const t = def('roster');
    let d = addMember(t.initial())?.draft ?? t.initial();
    d = { ...d, images: { 'm2.main': 'x' }, v: { ...d.v, 'cite:m2.main': 'c' } };
    const r = removeMember(d, 'm2');
    expect(r?.members).toEqual([1]);
    expect(r?.images).toEqual({});
    expect(Object.keys(r?.v ?? {}).some((k) => k.includes('m2.'))).toBe(false);
    expect(removeMember(r ?? d, 'm1')).toBeNull();
    expect(moveMember(d, 'm1', 1)?.members).toEqual([2, 1]);
    expect(moveMember(d, 'm1', -1)).toBeNull();
  });

  it('身高：只寫數字（含小數）時加 cm，否則只顯示 cm', () => {
    expect(['170', ' 165.5 ', '一七〇', '', '170cm'].map(heightText)).toEqual([
      '170cm',
      '165.5cm',
      'cm',
      'cm',
      'cm',
    ]);
  });
});

describe('貼紙（F43～F52）', () => {
  const t = def('duo-sheet');
  it('加入：長邊 300、畫布中央、放在最前面；30 張時不行', () => {
    const r = addSticker(t, t.initial(), 'a1', 'a.png', { width: 600, height: 300 }, 's1');
    expect(r?.draft.stickers[0]).toMatchObject({
      id: 's1',
      cx: 960,
      cy: 540,
      width: 300,
      height: 150,
      rotation: 0,
    });
    const r2 = addSticker(
      t,
      r?.draft ?? t.initial(),
      'a2',
      'b.png',
      { width: 10, height: 10 },
      's2',
    );
    expect(r2?.draft.stickers.map((s) => s.id)).toEqual(['s2', 's1']);
    let d = t.initial();
    for (let i = 0; i < MAX_STICKERS; i++)
      d = addSticker(t, d, 'a', 'x', { width: 1, height: 1 }, `k${i}`)?.draft ?? d;
    expect(addSticker(t, d, 'a', 'x', { width: 1, height: 1 })).toBeNull();
  });

  it('順序：往前一層＝往清單上方；到頭不變；刪除', () => {
    let d = t.initial();
    for (const id of ['a', 'b', 'c'])
      d = addSticker(t, d, 'x', id, { width: 1, height: 1 }, id)?.draft ?? d;
    expect(d.stickers.map((s) => s.id)).toEqual(['c', 'b', 'a']);
    expect(stepSticker(d, 'b', 'front').stickers.map((s) => s.id)).toEqual(['b', 'c', 'a']);
    expect(stepSticker(d, 'c', 'front')).toBe(d);
    expect(moveSticker(d, 0, 2).stickers.map((s) => s.id)).toEqual(['b', 'a', 'c']);
    expect(removeSticker(d, 'b').stickers.map((s) => s.id)).toEqual(['c', 'a']);
  });

  it('文字記錄：貼紙記在目前頁、用頁面座標', () => {
    const l = def('log-plain');
    const r = addSticker(
      l,
      { ...l.initial(), active: 1 },
      'a',
      'x',
      { width: 300, height: 300 },
      's',
    );
    expect(r?.draft.stickers[0]).toMatchObject({ page: 1, cx: 390, cy: 540 });
  });
});

describe('橫幅與檔名', () => {
  it('3.8 圖片的位置：50 是中央，每差 1 移動畫布寬（高）的 1/50', () => {
    expect(imageCenter(50, 50)).toEqual({ x: 750, y: 250 });
    expect(imageCenter(51, 0)).toEqual({ x: 780, y: -250 });
  });

  it('3.9 檔名：版型名稱＋時間；不能用的字換成 _', () => {
    const at = new Date(2026, 9, 2, 15, 4);
    expect(stamp(at)).toBe('20261002-1504');
    expect(outputName(def('duo-sheet'), 'png', at)).toBe('雙人資料卡_20261002-1504.png');
    expect(outputName({ ...def('duo-sheet'), name: 'a/b:c' }, 'zip', at)).toBe(
      'a_b_c_20261002-1504.zip',
    );
  });

  it('格式化文字的預設內容是一般的資料', () => {
    expect(def('pinned-post').initial().v['p.char']).toEqual(
      plainDoc('－ 寫下角色的性向與設定。', '#363636'),
    );
  });
});
