/**
 * 角色介紹圖產生器：2026-10 跟進原作的更新（規格 1.8、3.2、3.6、3.11）。
 * - F86 雙人資料卡的背景（單色／圖片、模糊時邊緣延伸、出處在下緣中央、背景是點選區）；
 * - F87 全身圖本身往內淡出（範圍與以前蓋底色的漸層相同），空格子的深色底同樣淡出；
 * - F88 段落標題可以改（預設文字、靠右、縮小、空白不畫）；
 * - F89 多人資料卡的每列張數 2～5（畫布大小、卡片位置、分隔線、讀入檢查）；
 * - F90 文字記錄的繪製範圍左右多 3 px；
 * - F91 資料版本 1 → 2（缺的設定補預設值）。
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ImageNode, LinearPaint, RectNode, SceneNode, TextNode } from '@/core/scene';
import {
  DRAFT_VERSION,
  type Draft,
  DraftError,
  migrateDraft,
  type SceneEnv,
  type Sticker,
  validateDraft,
} from '@/tools/pair-maker/model';
import { templateById } from '@/tools/pair-maker/templates';
import {
  addMember,
  cardOrigin,
  colsOf,
  removeMember,
  rosterSize,
  setCols,
} from '@/tools/pair-maker/templates/roster';

const def = (id: string) => {
  const d = templateById(id);
  if (!d) throw new Error(id);
  return d;
};

/** 假的圖（場景只看得到物件本身）：id → 圖 */
const fakeImages = new Map<string, CanvasImageSource>();
const fake = (id: string): CanvasImageSource => {
  let img = fakeImages.get(id);
  if (!img) {
    img = { width: 10, height: 10, id } as unknown as CanvasImageSource;
    fakeImages.set(id, img);
  }
  return img;
};

/** 場景的環境：有放圖的格子回傳假的圖 */
const env = (d: Draft): SceneEnv => ({
  image: (slot) => (d.images[slot] ? fake(d.images[slot]) : null),
  measure: null as unknown as SceneEnv['measure'],
});

const clone = (d: Draft): Draft => JSON.parse(JSON.stringify(d)) as Draft;

describe('雙人資料卡：背景（F86、3.11）', () => {
  const t = def('duo-sheet');

  it('編輯對象：共用（背景）排第一個；預設單色 #f3f1ec、模糊關', () => {
    const d = t.initial();
    expect(t.sides(d).map((s) => s.id)).toEqual(['common', 'left', 'right']);
    const common = t.sides(d)[0];
    expect(common.label).toBe('共用');
    expect(common.groups.map((g) => [g.id, g.label])).toEqual([['backdrop', '背景']]);
    const g = common.groups[0];
    expect(g.fields.map((f) => [f.id, f.type])).toEqual([
      ['c.bgMode', 'radio'],
      ['c.bgColor', 'color'],
      ['c.bgBlur', 'checkbox'],
    ]);
    expect(g.slots).toEqual([
      expect.objectContaining({ id: 'c.bg', width: 1920, height: 1080, after: true }),
    ]);
    expect(d.v['c.bgMode']).toBe('color');
    expect(d.v['c.bgColor']).toBe('#f3f1ec');
    expect(d.v['c.bgBlur']).toBe(false);
  });

  it('條件顯示：單色時只有背景色；圖片時有模糊與背景圖片格', () => {
    const g = t.sides(t.initial())[0].groups[0];
    const when = Object.fromEntries(g.fields.map((f) => [f.id, f.when]));
    expect(when['c.bgColor']).toEqual({ id: 'c.bgMode', is: 'color' });
    expect(when['c.bgBlur']).toEqual({ id: 'c.bgMode', is: 'image' });
    expect(g.slots?.[0].when).toEqual({ id: 'c.bgMode', is: 'image' });
  });

  it('單色：最下層是背景色的矩形（整張、點選區開啟共用 背景）', () => {
    const d = clone(t.initial());
    d.v['c.bgColor'] = '#204060';
    const first = t.scene(d, env(d))[0] as RectNode;
    expect(first).toMatchObject({ kind: 'rect', x: 0, y: 0, w: 1920, h: 1080, fill: '#204060' });
    expect(first.hit?.key).toBe('common/backdrop');
    /* 預設的底色與以前相同 */
    expect((t.scene(t.initial(), env(t.initial()))[0] as RectNode).fill).toBe('#f3f1ec');
  });

  it('圖片：底色固定 #f3f1ec＋蓋滿的背景圖；模糊時標準差 5、邊緣延伸；沒有圖時只有底色', () => {
    const d = clone(t.initial());
    d.v['c.bgMode'] = 'image';
    d.v['c.bgColor'] = '#204060';
    let nodes = t.scene(d, env(d));
    expect((nodes[0] as RectNode).fill).toBe('#f3f1ec');
    expect(nodes.some((n) => n.kind === 'image' && n.w === 1920)).toBe(false);
    d.images['c.bg'] = 'bg1';
    nodes = t.scene(d, env(d));
    const bg = nodes[1] as ImageNode;
    expect(bg).toMatchObject({ kind: 'image', x: 0, y: 0, w: 1920, h: 1080, image: fake('bg1') });
    expect(bg.blur).toBeUndefined();
    d.v['c.bgBlur'] = true;
    nodes = t.scene(d, env(d));
    expect(nodes[1]).toMatchObject({ kind: 'image', blur: 5, blurEdge: 'clamp' });
    /* 單色模式時就算有圖也不畫 */
    d.v['c.bgMode'] = 'color';
    expect(t.scene(d, env(d)).some((n) => n.kind === 'image' && n.w === 1920)).toBe(false);
  });

  it('背景圖的出處：有圖、而且是圖片模式時畫在畫布下緣中央', () => {
    const d = clone(t.initial());
    d.v['cite:c.bg'] = '某某攝';
    const cites = (x: Draft) =>
      t.scene(x, env(x)).filter((n): n is TextNode => n.kind === 'text' && n.text === 'ⓒ 某某攝');
    expect(cites(d)).toEqual([]);
    d.v['c.bgMode'] = 'image';
    expect(cites(d)).toEqual([]);
    d.images['c.bg'] = 'bg1';
    const [c] = cites(d);
    expect(c).toBeDefined();
    expect(c.align).toBe('center');
    expect((c.x + (c.x + (c.w ?? 0))) / 2).toBe(960);
    expect(c.y).toBe(1080 - 20);
  });

  it('讀入檢查：背景的值型別不對時拒絕；色碼轉小寫', () => {
    for (const [id, value] of [
      ['c.bgMode', 'pattern'],
      ['c.bgColor', 'blue'],
      ['c.bgBlur', 'yes'],
    ] as const) {
      const d = clone(t.initial());
      (d.v as Record<string, unknown>)[id] = value;
      expect(() => validateDraft(t, d), id).toThrow(DraftError);
    }
    const d = clone(t.initial());
    d.v['c.bgColor'] = '#ABCDEF';
    d.images = { 'c.bg': 'bg1' };
    const r = validateDraft(t, d);
    expect(r.v['c.bgColor']).toBe('#abcdef');
    expect(r.images).toEqual({ 'c.bg': 'bg1' });
  });
});

describe('雙人資料卡：全身圖往內淡出（F87、3.11）', () => {
  const t = def('duo-sheet');
  const fullNodes = (d: Draft, side: 'left' | 'right') =>
    t
      .scene(d, env(d))
      .filter(
        (n): n is RectNode | ImageNode =>
          (n.kind === 'rect' || n.kind === 'image') &&
          n.y === 0 &&
          n.h === 1080 &&
          n.w === 340 &&
          n.x === (side === 'left' ? 0 : 1580),
      );

  it('有圖：圖片本身淡出，到格子內緣剛好透明（左 x 252 → 340、右 x 1668 → 1580；7.2 修正），不再蓋底色的漸層', () => {
    const d = clone(t.initial());
    d.images = { 'left.full': 'L', 'right.full': 'R' };
    const left = fullNodes(d, 'left').find((n): n is ImageNode => n.kind === 'image');
    const right = fullNodes(d, 'right').find((n): n is ImageNode => n.kind === 'image');
    expect(left?.fade).toEqual({ axis: 'x', from: 252 / 340, to: 1 });
    expect(right?.fade).toEqual({ axis: 'x', from: 0, to: 88 / 340, reverse: true });
    /* 沒有寬 360 的底色漸層 */
    expect(t.scene(d, env(d)).some((n) => n.kind === 'rect' && n.w === 360)).toBe(false);
  });

  it('空格子：深色底的漸層維持以前的範圍（x 252 → 360；預設畫面逐像素不變）', () => {
    const d = t.initial();
    const [rect] = fullNodes(d, 'left');
    const fill = (rect as RectNode).fill as LinearPaint;
    expect(fill.linear).toEqual({
      x0: 252,
      y0: 0,
      x1: 360,
      y1: 0,
      stops: [
        [0, '#3a3a40'],
        [1, 'rgba(58,58,64,0)'],
      ],
    });
    const [r2] = fullNodes(d, 'right');
    expect(((r2 as RectNode).fill as LinearPaint).linear).toEqual({
      x0: 1560,
      y0: 0,
      x1: 1668,
      y1: 0,
      stops: [
        [0, 'rgba(58,58,64,0)'],
        [1, '#3a3a40'],
      ],
    });
  });

  it('出處畫在淡出的圖之後（不跟著變淡）', () => {
    const d = clone(t.initial());
    d.images = { 'left.full': 'L' };
    d.v['cite:left.full'] = '繪師';
    const nodes = t.scene(d, env(d));
    const img = nodes.findIndex((n) => n.kind === 'image' && n.image === fake('L'));
    const cite = nodes.findIndex((n) => n.kind === 'text' && n.text === 'ⓒ 繪師');
    expect(img).toBeGreaterThanOrEqual(0);
    expect(cite).toBeGreaterThan(img);
  });
});

describe('雙人資料卡：段落標題（F88）', () => {
  const t = def('duo-sheet');
  const titleNodes = (d: Draft) =>
    t
      .scene(d, env(d))
      .filter(
        (n): n is TextNode =>
          n.kind === 'text' && n.font.size === 20 && n.font.weight === 700 && n.h === 28,
      );

  it('外觀說明的欄位：標題排在各自的內容前面；預設是原本的字', () => {
    const d = t.initial();
    const looks = t.sides(d)[1].groups.find((g) => g.id === 'looks');
    expect(looks?.fields.map((f) => [f.id, f.label])).toEqual([
      ['left.outfitTitle', '平常服裝：標題'],
      ['left.outfit', '平常服裝：內容'],
      ['left.featuresTitle', '外觀特徵：標題'],
      ['left.features', '外觀特徵：內容'],
      ['left.height', '身高（cm）'],
      ['left.moe', '萌化'],
    ]);
    for (const side of ['left', 'right']) {
      expect(d.v[`${side}.outfitTitle`]).toBe('平常服裝');
      expect(d.v[`${side}.featuresTitle`]).toBe('外觀特徵');
    }
    expect(titleNodes(d).map((n) => n.text)).toEqual([
      '平常服裝',
      '外觀特徵',
      '平常服裝',
      '外觀特徵',
    ]);
  });

  it('改過的標題畫在原位置；右邊的角色靠右；放不下時縮小到 50%；空白不畫', () => {
    const d = clone(t.initial());
    d.v['left.outfitTitle'] = '日常穿搭';
    d.v['right.featuresTitle'] = '';
    const nodes = titleNodes(d);
    expect(nodes.map((n) => [n.text, n.align, n.shrink])).toEqual([
      ['日常穿搭', 'left', 0.5],
      ['外觀特徵', 'left', 0.5],
      ['平常服裝', 'right', 0.5],
      ['', 'right', 0.5],
    ]);
  });

  it('讀入檢查：標題超過 100 字拒絕', () => {
    const d = clone(t.initial());
    d.v['right.outfitTitle'] = 'x'.repeat(101);
    expect(() => validateDraft(t, d)).toThrow(DraftError);
  });
});

describe('多人資料卡：每列張數（F89、3.2）', () => {
  const t = def('roster');

  it('畫布大小與卡片位置依每列張數（預設 3，同以前）', () => {
    expect(rosterSize(4, 2)).toEqual({ width: 1230, height: 1390 });
    expect(rosterSize(4, 4)).toEqual({ width: 2460, height: 694 });
    expect(rosterSize(7, 5)).toEqual({ width: 3075, height: 1390 });
    expect(rosterSize(30, 5)).toEqual({ width: 3075, height: 4166 });
    expect(rosterSize(30, 2)).toEqual({ width: 1230, height: 10412 });
    expect(rosterSize(7)).toEqual({ width: 1845, height: 2084 });
    expect([0, 1, 2, 5].map((i) => cardOrigin(i, 2))).toEqual([
      { x: 0, y: 0 },
      { x: 615, y: 0 },
      { x: 0, y: 696 },
      { x: 615, y: 1390 },
    ]);
    expect(cardOrigin(4, 5)).toEqual({ x: 2460, y: 0 });
    expect(cardOrigin(5, 5)).toEqual({ x: 0, y: 696 });
  });

  it('初始內容每列 3 張；setCols 只收 2～5、同值不變', () => {
    const d = t.initial();
    expect(d.cols).toBe(3);
    expect(colsOf(d)).toBe(3);
    expect(colsOf({ ...d, cols: undefined })).toBe(3);
    const d2 = setCols(d, 2);
    expect(d2?.cols).toBe(2);
    expect(setCols(d, 3)).toBeNull();
    expect(setCols(d, 1)).toBeNull();
    expect(setCols(d, 6)).toBeNull();
  });

  it('版型的畫布大小、貼紙範圍、分隔線跟著每列張數', () => {
    let d: Draft = { ...t.initial(), members: [1, 2, 3, 4, 5], nextNo: 6, cols: 2 };
    d = validateDraft(t, clone(d));
    expect(t.size(d)).toEqual({ width: 1230, height: 2084 });
    expect(t.stickerArea(d)).toEqual({ x: 0, y: 0, width: 1230, height: 2084 });
    const lines = t
      .scene(d, env(d))
      .filter((n): n is Extract<SceneNode, { kind: 'line' }> => n.kind === 'line');
    /* 列內的直線：第 1、2 列各 1 條（第 3 列只有 1 人）；列間的橫線 2 條 */
    expect(lines.map((l) => l.points)).toEqual([
      [615, 41, 615, 674],
      [615, 696 + 41, 615, 696 + 674],
      [20, 693, 1210, 693],
      [20, 1390 - 3, 1210, 1390 - 3],
    ]);
  });

  it('讀入檢查：每列張數是 2～5 的整數；沒有時當 3', () => {
    const base = clone(t.initial());
    for (const cols of [1, 6, 2.5, '3', null]) {
      expect(() => validateDraft(t, { ...base, cols } as unknown), String(cols)).toThrow(
        DraftError,
      );
    }
    expect(validateDraft(t, { ...base, cols: 5 }).cols).toBe(5);
    const old = clone(t.initial());
    delete old.cols;
    expect(validateDraft(t, old).cols).toBe(3);
  });
});

describe('多人資料卡：畫布變小時貼紙拉回範圍內（F89、F73，7.2）', () => {
  const t = def('roster');
  const sticker = (id: string, more: Partial<Sticker> = {}): Sticker => ({
    id,
    asset: 'a1',
    name: id,
    cx: 615,
    cy: 5206,
    width: 300,
    height: 150,
    rotation: 0,
    shadow: false,
    outline: false,
    cite: '',
    ...more,
  });
  const withMembers = (n: number, cols: number, stickers: Sticker[]): Draft => {
    let d = t.initial();
    while ((d.members ?? []).length < n) d = addMember(d)?.draft ?? d;
    return { ...d, cols, stickers };
  };

  it('每列 2 → 5（30 人：1230 × 10412 → 3075 × 4166）：畫布外的貼紙拉回到至少 16 px 重疊', () => {
    const d = withMembers(30, 2, [sticker('s1'), sticker('s2', { cx: 300, cy: 200 })]);
    expect(t.size(d)).toEqual({ width: 1230, height: 10412 });
    const next = setCols(d, 5);
    expect(t.size(next as Draft)).toEqual({ width: 3075, height: 4166 });
    /* 貼紙上緣 5131 → 4166 − 16 */
    expect(next?.stickers[0]).toMatchObject({ cx: 615, cy: 4166 - 16 + 75, width: 300 });
    /* 本來就在範圍內的不動（同一個物件） */
    expect(next?.stickers[1]).toBe(d.stickers[1]);
  });

  it('刪除角色讓畫布變小時也拉回；旋轉後用外接範圍', () => {
    const d = withMembers(4, 3, [sticker('s1', { cx: 1500, cy: 1200, rotation: 90 })]);
    expect(t.size(d)).toEqual({ width: 1845, height: 1390 });
    const next = removeMember(d, 'm4') as Draft;
    expect(t.size(next)).toEqual({ width: 1845, height: 694 });
    /* 轉 90° 後高 300：上緣 1050 → 694 − 16 */
    expect(next.stickers[0].cy).toBe(694 - 16 + 150);
    expect(next.stickers[0].cx).toBe(1500);
  });

  it('寬高超過新畫布長邊 2 倍時等比縮到上限（否則讀入檢查會拒絕整份內容）', () => {
    const d = withMembers(30, 2, [sticker('big', { cx: 600, cy: 300, width: 9000, height: 100 })]);
    const next = setCols(d, 5) as Draft;
    const s = next.stickers[0];
    expect(s.width).toBe(4166 * 2);
    expect(s.height).toBeCloseTo((100 * 8332) / 9000, 6);
    expect(() => validateDraft(t, JSON.parse(JSON.stringify(next)))).not.toThrow();
  });

  it('畫布變大或不變時貼紙不動', () => {
    const d = withMembers(4, 3, [sticker('s1', { cx: 100, cy: 100 })]);
    expect(setCols(d, 4)?.stickers).toBe(d.stickers);
    expect(addMember(d)?.draft.stickers).toBe(d.stickers);
  });
});

describe('資料版本 1 → 2（F91、3.6）', () => {
  it('版本是 2', () => {
    expect(DRAFT_VERSION).toBe(2);
  });

  it('雙人資料卡：沒有背景與段落標題的舊資料補上預設值，其他內容不變', () => {
    const t = def('duo-sheet');
    const old = clone(t.initial());
    old.v['left.name'] = '甲';
    for (const k of [
      'c.bgMode',
      'c.bgColor',
      'c.bgBlur',
      'left.outfitTitle',
      'left.featuresTitle',
      'right.outfitTitle',
      'right.featuresTitle',
    ])
      delete old.v[k];
    const m = migrateDraft(t, old, 1) as Draft;
    expect(m.v).toMatchObject({
      'c.bgMode': 'color',
      'c.bgColor': '#f3f1ec',
      'c.bgBlur': false,
      'left.outfitTitle': '平常服裝',
      'right.featuresTitle': '外觀特徵',
      'left.name': '甲',
    });
    expect(validateDraft(t, m)).toEqual({
      ...t.initial(),
      v: { ...t.initial().v, 'left.name': '甲' },
    });
    /* 已經是版本 2 的不動；不是物件的原樣交給檢查 */
    const now = clone(t.initial());
    expect(migrateDraft(t, now, 2)).toBe(now);
    expect(migrateDraft(t, null, 1)).toBeNull();
  });

  it('多人資料卡：沒有每列張數的舊資料當 3；已經有的不動', () => {
    const t = def('roster');
    const old = clone(t.initial());
    delete old.cols;
    expect((migrateDraft(t, old, 1) as Draft).cols).toBe(3);
    expect((migrateDraft(t, { ...old, cols: 4 }, 1) as Draft).cols).toBe(4);
  });

  it('其他版型：舊資料原樣', () => {
    const t = def('pattern-banner');
    const old = clone(t.initial());
    expect(migrateDraft(t, old, 1)).toEqual(old);
  });
});

describe('文字記錄：繪製範圍左右多 3 px（F90）', () => {
  /* 場景會先畫背景的小畫布：測試環境沒有 canvas，換成什麼都不做的 */
  beforeAll(() => {
    const noop: unknown = new Proxy(() => {}, {
      get: () => noop,
      apply: () => noop,
      set: () => true,
    });
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        constructor(
          public width: number,
          public height: number,
        ) {}
        getContext() {
          return noop;
        }
      },
    );
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('標題、副標題、本文的格式化文字節點都有 bleed 3；換行寬度（w）不變', () => {
    for (const id of ['log-plain', 'log-band', 'log-side', 'log-duo']) {
      const t = def(id);
      const d = t.initial();
      const rich = t
        .scene(d, { ...env(d), measure: fakeMeasure() })
        .filter((n) => n.kind === 'rich');
      expect(rich.length, id).toBeGreaterThan(0);
      for (const n of rich) expect(n.kind === 'rich' && n.bleed, id).toBe(3);
    }
  });
});

/** 量字寬的假 context（每字 10 px） */
function fakeMeasure(): SceneEnv['measure'] {
  return {
    font: '',
    measureText: (s: string) =>
      ({
        width: Array.from(s).length * 10,
        actualBoundingBoxAscent: 8,
        actualBoundingBoxDescent: 2,
        fontBoundingBoxAscent: 8,
        fontBoundingBoxDescent: 2,
      }) as TextMetrics,
  } as unknown as SceneEnv['measure'];
}
