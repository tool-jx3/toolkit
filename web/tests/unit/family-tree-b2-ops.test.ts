/**
 * 家系圖第二批的資料操作（規格 F80～F87）：過繼、換生家、「出」字小卡的順序與間距、婚姻連結、
 * 狀態、GM 專用與 PL 版、頭像、讀檔整理。規則照原作（過繼、連結）與規格 3.8（PL 版）。
 */
import { describe, expect, it } from 'vitest';
import { hasSecrets, hiddenIds, plPeople } from '@/tools/family-tree/model/gm';
import { DIMS, type LayoutOptions, layoutTree } from '@/tools/family-tree/model/layout';
import {
  adoptChoices,
  applyStubGap,
  applyStubMove,
  autoArrange,
  avatarIds,
  checkBirthParent,
  linkChoices,
  pairOf,
  removePerson,
  reparent,
  setAdoptFather,
  setAdoptKind,
  setAvatar,
  setBirthParent,
  setGmField,
  setGmOnly,
  setLink,
  setStatus,
} from '@/tools/family-tree/model/ops';
import { cleanPeople } from '@/tools/family-tree/model/sanitize';
import {
  daughterHusband,
  descendants,
  genOf,
  lineParent,
  linkedBy,
  marriedTo,
  maternalMother,
  shownOf,
} from '@/tools/family-tree/model/tree';
import type { Member, People, Spouse } from '@/tools/family-tree/model/types';

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

/** 兩個家系：r（妻 rw）→ a、b、c；q → x、y */
function twoFamilies(): People {
  return P(
    m('r', { gen: 1 }),
    sp('rw', 'r'),
    m('a', { fatherId: 'r', motherId: 'rw', order: 1 }),
    m('b', { fatherId: 'r', motherId: 'rw', order: 2 }),
    m('c', { fatherId: 'r', motherId: 'rw', order: 3 }),
    m('q', { order: 2, gen: 1 }),
    m('x', { fatherId: 'q', order: 1 }),
    m('y', { fatherId: 'q', order: 2, gender: 'F' }),
  );
}

describe('出系／入系（F80）', () => {
  it('類別與繼父：掛到繼父底下排在最後、間距與偏移歸零；生父底下留「出」字小卡', () => {
    const p = twoFamilies();
    (p.b as Member).gap = 30;
    (p.b as Member).shift = 12;
    setAdoptKind(p, 'b', 'heir');
    expect((p.b as Member).adopt).toEqual({ fatherId: null, kind: 'heir' });
    expect(lineParent(p, p.b as Member)).toBe('r');
    expect(adoptChoices(p, p.b as Member).map((x) => x.id)).toEqual(['a', 'c', 'q', 'x']);
    setAdoptFather(p, 'b', 'q');
    const b = p.b as Member;
    expect(b.adopt?.fatherId).toBe('q');
    expect(b.order).toBe(3);
    expect(b.gap).toBeUndefined();
    expect(b.shift).toBeUndefined();
    expect(lineParent(p, b)).toBe('q');
    expect(genOf(p, b)).toBe(2);
    expect(descendants(p, 'q').has('b')).toBe(true);
    expect(descendants(p, 'r').has('b')).toBe(false);
    const L = layoutTree(p, opts);
    expect(L.byId.get('b')?.parent?.id).toBe('q');
    expect(L.stubs.get('b')?.parent?.id).toBe('r');
    expect(L.byId.get('r')?.hasKids).toBe(true);
    /* 不顯示「出」字小卡 */
    expect(layoutTree(p, { ...opts, stubs: false }).stubs.size).toBe(0);
    /* 類別改成不適用：回到生父底下 */
    setAdoptKind(p, 'b', null);
    expect(b.adopt).toBeUndefined();
    expect(lineParent(p, b)).toBe('r');
  });

  it('拖到別人卡片上：男性＝換繼父（生家不變）；女性＝變成她的孩子、過繼取消', () => {
    const p = twoFamilies();
    setAdoptKind(p, 'b', 'adopted');
    setAdoptFather(p, 'b', 'q');
    reparent(p, 'b', 'x');
    const b = p.b as Member;
    expect(b.adopt?.fatherId).toBe('x');
    expect(b.fatherId).toBe('r');
    reparent(p, 'b', 'y');
    expect(b.adopt).toBeUndefined();
    expect(b.motherId).toBe('y');
    expect(b.fatherId).toBeUndefined();
  });

  it('換生家：生父、生母照放上去的人；不能是自己的子孫或繼父；小卡的排序值與間距取消', () => {
    const p = twoFamilies();
    setAdoptKind(p, 'b', 'heir');
    setAdoptFather(p, 'b', 'q');
    const b = p.b as Member;
    (b.adopt as NonNullable<Member['adopt']>).order = 2;
    (b.adopt as NonNullable<Member['adopt']>).gap = 20;
    p.bk = m('bk', { fatherId: 'b' });
    expect(checkBirthParent(p, 'b', 'q')).toBe('adoptive');
    expect(checkBirthParent(p, 'b', 'bk')).toBe('descendant');
    expect(checkBirthParent(p, 'b', 'b')).toBe('self');
    expect(checkBirthParent(p, 'b', 'a')).toBe('ok');
    expect(setBirthParent(p, 'b', 'a')?.id).toBe('a');
    expect(b.fatherId).toBe('a');
    expect(b.motherId).toBeUndefined();
    expect(b.adopt).toEqual({ fatherId: 'q', kind: 'heir' });
    /* 放在配偶卡片上：父親＝那位成員、母親＝那位配偶 */
    p.aw = sp('aw', 'a');
    p.aw2 = sp('aw2', 'a', { order: 2 });
    setBirthParent(p, 'b', 'aw2');
    expect([b.fatherId, b.motherId]).toEqual(['a', 'aw2']);
  });

  it('「出」字小卡的順序：在生父的孩子之間依卡片中心重排，記在小卡自己的排序值', () => {
    const p = twoFamilies();
    setAdoptKind(p, 'b', 'heir');
    setAdoptFather(p, 'b', 'q');
    const L = layoutTree(p, opts);
    const ax = L.byId.get('a')?.x ?? 0;
    /* 放到 a 的左邊 */
    applyStubMove(p, 'b', ax - 60, opts);
    expect((p.b as Member).adopt?.order).toBe(1);
    expect((p.a as Member).order).toBe(2);
    expect((p.c as Member).order).toBe(3);
    const L2 = layoutTree(p, opts);
    expect((L2.stubs.get('b')?.x ?? 0) < (L2.byId.get('a')?.x ?? 0)).toBe(true);
    /* 間距：小於 4 當 0 */
    expect(applyStubGap(p, 'b', 25.4)).toBe(25);
    expect((p.b as Member).adopt?.gap).toBe(25);
    expect(applyStubGap(p, 'b', -23)).toBe(0);
    expect((p.b as Member).adopt?.gap).toBeUndefined();
    /* 自動整列清掉小卡的間距 */
    applyStubGap(p, 'b', 40);
    autoArrange(p);
    expect((p.b as Member).adopt?.gap).toBeUndefined();
  });

  it('繼父有過繼來的孩子時不能刪；繼父不在了（讀檔整理）：過繼取消、回到生父底下', () => {
    const p = twoFamilies();
    setAdoptKind(p, 'a', 'heir');
    setAdoptFather(p, 'a', 'x');
    expect(removePerson(p, 'x')).toEqual({ ok: false, reason: 'has-kids' });
    delete p.x;
    const fixed = cleanPeople(p);
    expect((fixed.a as Member).adopt).toBeUndefined();
    expect(lineParent(fixed, fixed.a as Member)).toBe('r');
  });
});

describe('母系外孫與女兒的寫法（F81、F84）', () => {
  it('外孫：母親是成員、父親不是（過繼的人不算）', () => {
    const p = P(
      m('r'),
      m('d', { fatherId: 'r', gender: 'F' }),
      sp('h', 'd'),
      m('k', { fatherId: 'h', motherId: 'd' }),
    );
    expect(maternalMother(p, p.k as Member)?.id).toBe('d');
    expect(maternalMother(p, p.d as Member)).toBeNull();
    expect(layoutTree(p, { ...opts, maternal: false }).byId.has('k')).toBe(false);
  });

  it('女兒的丈夫：第一位配偶；女兒寫成「女（適 丈夫）」時不畫配偶卡片', () => {
    const p = P(
      m('r'),
      m('d', { fatherId: 'r', gender: 'F' }),
      sp('h2', 'd', { order: 2 }),
      sp('h1', 'd', { order: 1 }),
      m('s', { fatherId: 'r', order: 2 }),
      sp('w', 's'),
    );
    expect(daughterHusband(p, p.d as Member)?.id).toBe('h1');
    expect(daughterHusband(p, p.s as Member)).toBeNull();
    const L = layoutTree(p, { ...opts, daughterName: true });
    expect(L.byId.get('d')?.chips).toEqual([]);
    expect(L.byId.get('d')?.width).toBe(140);
    expect(L.byId.get('s')?.chips.map((c) => c.id)).toEqual(['w']);
  });
});

describe('跨家系的婚姻連結（F82）', () => {
  it('連到別的家系的成員：對方那邊自動建立配偶（名字空白、顯示這邊的資料），兩邊互相記住', () => {
    const p = twoFamilies();
    p.as = sp('as', 'a', { name: '' });
    expect(linkChoices(p, p.as as Spouse).map((x) => x.id)).not.toContain('a');
    const r = setLink(p, 'as', 'y', 'ya');
    expect(r?.id).toBe('ya');
    expect((p.as as Spouse).link).toEqual({ personId: 'y', pairId: 'ya' });
    expect((p.ya as Spouse).link).toEqual({ personId: 'a', pairId: 'as', auto: true });
    expect((p.ya as Spouse).spouseOf).toBe('y');
    expect(shownOf(p, p.ya as Spouse).id).toBe('a');
    expect(shownOf(p, p.as as Spouse).id).toBe('y');
    expect(pairOf(p, p.as as Spouse)?.id).toBe('ya');
    /* 拿掉連結：自動建立的那一邊一起刪 */
    setLink(p, 'as', null);
    expect(p.ya).toBeUndefined();
    expect((p.as as Spouse).link).toBeUndefined();
  });

  it('對方那邊已經有連回來的配偶，或名字和這邊的成員一樣、還沒連結的配偶：用那一張', () => {
    const p = twoFamilies();
    p.as = sp('as', 'a', { name: '' });
    p.yh = sp('yh', 'y', { name: 'a' });
    setLink(p, 'as', 'y');
    expect((p.yh as Spouse).link).toEqual({ personId: 'a', pairId: 'as' });
    expect(Object.values(p).filter((x) => x.kind === 'spouse' && x.spouseOf === 'y')).toHaveLength(
      1,
    );
    /* 換成連到別人：有名字的那一邊只拿掉連結 */
    setLink(p, 'as', 'x');
    expect((p.yh as Spouse).link).toBeUndefined();
    expect(p.yh).toBeDefined();
  });

  it('單向的連結：對方的卡片寫「婚姻 · ○○」（自己有連回去的配偶卡片時不寫）', () => {
    const p = twoFamilies();
    p.as = sp('as', 'a', { link: { personId: 'y' } });
    const lb = linkedBy(p);
    expect(lb.get('y')?.map((h) => h.id)).toEqual(['a']);
    expect(marriedTo(p, p.y as Member, lb).map((h) => h.id)).toEqual(['a']);
    p.ya = sp('ya', 'y', { link: { personId: 'a' } });
    expect(marriedTo(p, p.y as Member, linkedBy(p))).toEqual([]);
  });

  it('刪掉成員：連到他的配偶拿掉連結、自動建立的配偶一起刪', () => {
    const p = twoFamilies();
    p.as = sp('as', 'a', { name: 'A 的妻' });
    setLink(p, 'as', 'y', 'ya');
    removePerson(p, 'y');
    expect(p.ya).toBeUndefined();
    expect((p.as as Spouse).link).toBeUndefined();
    /* 刪掉配偶：對方那邊自動建立的一起刪 */
    setLink(p, 'as', 'x', 'xa');
    expect(p.xa).toBeDefined();
    removePerson(p, 'as');
    expect(p.xa).toBeUndefined();
  });
});

describe('狀態、頭像（F85、F87）', () => {
  it('狀態：存活＝不寫', () => {
    const p = twoFamilies();
    setStatus(p, 'a', 'dead');
    expect(p.a.status).toBe('dead');
    setStatus(p, 'a', 'alive');
    expect(p.a.status).toBeUndefined();
  });

  it('頭像：換圖時位置回到置中；用到的資產 id 不重複', () => {
    const p = twoFamilies();
    setAvatar(p, 'a', 'img1');
    p.a.avatarPos = { zoom: 2, x: 0.1, y: 0, turns: 0 };
    setAvatar(p, 'a', 'img2');
    expect(p.a.avatar).toBe('img2');
    expect(p.a.avatarPos).toBeUndefined();
    setAvatar(p, 'b', 'img2');
    setAvatar(p, 'rw', 'img3');
    expect(avatarIds(p).sort()).toEqual(['img2', 'img3']);
    setAvatar(p, 'a', null);
    expect(p.a.avatar).toBeUndefined();
  });
});

describe('GM 專用與 PL 版（F86）', () => {
  it('沒有秘密時 PL 版就是原本的資料', () => {
    const p = twoFamilies();
    expect(hasSecrets(p)).toBe(false);
    expect(plPeople(p)).toBe(p);
  });

  it('只有 GM 看得到的成員：連同子孫、他們的配偶、生家的「出」字小卡一起拿掉；原本的資料不變', () => {
    const p = twoFamilies();
    p.aw = sp('aw', 'a');
    p.a1 = m('a1', { fatherId: 'a', motherId: 'aw' });
    p.a1w = sp('a1w', 'a1');
    /* x 過繼到 a：是 a 的子孫，也拿掉；生父 q 底下沒有小卡 */
    setAdoptKind(p, 'x', 'heir');
    setAdoptFather(p, 'x', 'a');
    setGmOnly(p, 'a', true);
    const pl = plPeople(p);
    expect(Object.keys(pl).sort()).toEqual(['b', 'c', 'q', 'r', 'rw', 'y']);
    expect(p.a.gm).toBe(true);
    expect(pl.r.gm).toBeUndefined();
    expect(layoutTree(pl, opts).stubs.size).toBe(0);
    expect(hiddenIds(p).has('a1w')).toBe(true);
  });

  it('只有 GM 看得到的配偶：拿掉配偶卡片，孩子留著（母親欄清掉）；成對的婚姻連結兩邊都拿掉', () => {
    const p = twoFamilies();
    setGmOnly(p, 'rw', true);
    let pl = plPeople(p);
    expect(pl.rw).toBeUndefined();
    expect((pl.a as Member).motherId).toBeUndefined();
    expect((pl.a as Member).fatherId).toBe('r');
    const p2 = twoFamilies();
    p2.as = sp('as', 'a', { name: '' });
    setLink(p2, 'as', 'y', 'ya');
    setGmOnly(p2, 'as', true);
    pl = plPeople(p2);
    expect(pl.as).toBeUndefined();
    expect(pl.ya).toBeUndefined();
    /* 連到 GM 專用的成員的配偶也拿掉 */
    const p3 = twoFamilies();
    p3.as = sp('as', 'a', { name: '' });
    setLink(p3, 'as', 'y', 'ya');
    setGmOnly(p3, 'y', true);
    pl = plPeople(p3);
    expect(pl.as).toBeUndefined();
    expect(pl.y).toBeUndefined();
  });

  it('只有 GM 看得到的欄位與 GM 筆記：拿掉；過繼是秘密時 PL 看到繼父的親生孩子', () => {
    const p = twoFamilies();
    Object.assign(p.a, {
      reading: 'よみ',
      birth: '1900',
      death: '1950',
      note: '備註',
      secret: '秘密',
      cat: 'k',
    });
    setStatus(p, 'a', 'dead');
    setAvatar(p, 'a', 'img');
    for (const f of ['death', 'status', 'avatar', 'cat'] as const) setGmField(p, 'a', f, true);
    setGmField(p, 'a', 'reading', true);
    setGmField(p, 'a', 'reading', false);
    expect(p.a.gmFields).toEqual(['death', 'status', 'cat', 'avatar']);
    setAdoptKind(p, 'b', 'heir');
    setAdoptFather(p, 'b', 'x');
    setGmField(p, 'b', 'adopt', true);
    expect(hasSecrets(p)).toBe(true);
    const pl = plPeople(p);
    expect(pl.a).toMatchObject({ reading: 'よみ', birth: '1900', note: '備註' });
    for (const k of ['death', 'status', 'avatar', 'cat', 'secret', 'gmFields'])
      expect(k in pl.a).toBe(false);
    const b = pl.b as Member;
    expect(b.adopt).toBeUndefined();
    expect(b.fatherId).toBe('x');
    expect(b.motherId).toBeUndefined();
    const L = layoutTree(pl, opts);
    expect(L.byId.get('b')?.parent?.id).toBe('x');
    expect(L.stubs.size).toBe(0);
    /* GM 版照舊 */
    expect(layoutTree(p, opts).stubs.has('b')).toBe(true);
  });
});

describe('讀檔整理（第二批的欄位）', () => {
  it('狀態、GM 專用、只有 GM 看得到的欄位（認得的、這種人物有的）、頭像的位置', () => {
    const p = cleanPeople({
      a: {
        id: 'a',
        kind: 'member',
        name: '甲',
        gender: 'M',
        order: 1,
        status: 'missing',
        gm: true,
        gmFields: ['death', 'origin', 'adopt', 'x', 'death'],
        secret: 'x'.repeat(3000),
        avatar: 'img',
        avatarPos: { zoom: 9, x: 5, y: -0.2, turns: 5 },
      },
      s: {
        id: 's',
        kind: 'spouse',
        spouseOf: 'a',
        name: '乙',
        order: 1,
        status: 'zombie',
        gm: 'yes',
        gmFields: ['origin', 'adopt'],
        avatarPos: { zoom: 2 },
      },
      c: {
        id: 'c',
        kind: 'member',
        name: '丙',
        gender: 'M',
        order: 2,
        adopt: { fatherId: 'c', kind: 'heir' },
      },
    });
    expect(p.a).toMatchObject({
      status: 'missing',
      gm: true,
      gmFields: ['death', 'adopt'],
      avatar: 'img',
      avatarPos: { zoom: 4, x: 2, y: -0.2, turns: 1 },
    });
    expect(Array.from(p.a.secret ?? '')).toHaveLength(2000);
    expect(p.s.status).toBeUndefined();
    expect(p.s.gm).toBeUndefined();
    expect(p.s.gmFields).toEqual(['origin']);
    expect(p.s.avatarPos).toBeUndefined();
    /* 過繼給自己：拿掉 */
    expect((p.c as Member).adopt).toBeUndefined();
  });
});
