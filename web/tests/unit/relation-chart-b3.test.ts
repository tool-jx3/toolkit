/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見 web/src/tools/relation-chart/UPSTREAM_LICENSE。
 *
 * 角色關係圖產生器第三批（角色與關係的資料）：三層的角色（實例／變體／條目）與同步、資料版本 3 的整理、
 * 角色庫與關係庫的動作（復原涵蓋全專案）、看法、頭像框的三層與畫法、角色字型、數值、交換位置、連線總表。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { editorSvg, exportSvg } from '@/tools/relation-chart/engine/chart';
import {
  charFontCss,
  effectiveFrame,
  frameSource,
  nameBoxExitDist,
  sheetCtx,
} from '@/tools/relation-chart/engine/geom';
import { makeChar, makeLabel, makeRel, makeType } from '@/tools/relation-chart/model/factory';
import { emptySheet, normalizeProject } from '@/tools/relation-chart/model/normalize';
import type { Project, Sheet } from '@/tools/relation-chart/model/types';
import {
  addSheet,
  copyChars,
  copyType,
  deleteChars,
  deleteLabels,
  switchSheet,
  toggleLabel,
  updateChar,
  updateType,
} from '@/tools/relation-chart/state/actions';
import {
  addEntryToSheet,
  addFrames,
  addRadarAxis,
  addRadarState,
  addRadarTpl,
  addRelation,
  addRelVariantToSheet,
  copyEntry,
  deleteEntries,
  deleteFont,
  deleteFrame,
  deleteRadarAxis,
  deleteRadarTpl,
  deleteRelEntries,
  deleteRelVariant,
  deleteVariant,
  newVariantFromChar,
  renameRelVariant,
  renameVariant,
  retagRels,
  setCharInfo,
  setRadarVal,
  setUnified,
  setView,
  swapChars,
  switchVariant,
} from '@/tools/relation-chart/state/libActions';
import { useProject, useUi } from '@/tools/relation-chart/state/store';

type Raw = Omit<Project, 'library' | 'relLibrary' | 'radarTpls' | 'frames' | 'fonts' | 'noteBin' | 'settingsLib'> &
  Partial<Project>;

function seed(p: Raw) {
  useProject.getState().replace(normalizeProject(p) as Project);
  useProject.temporal.getState().clear();
  useUi.setState({ sel: [], focus: null, hover: null, link: null, panel: null });
}
const data = () => useProject.getState().data;
const undo = () => useProject.temporal.getState().undo();
const sheetAt = (i: number) => data().sheets[i];
const entryOf = (charId: number, i = 0) => {
  const c = sheetAt(i).chars.find((x) => x.id === charId);
  return data().library.find((e) => e.id === c?.lib);
};

/** 兩位角色、一種關係 */
function base(): Raw {
  const s = emptySheet(1, 1, { W: 1000, H: 800 });
  s.types.push(makeType(10, '朋友', { color: '#58b368' }));
  s.chars.push(
    makeChar(1, '艾莉絲', 300, 300, { defNo: 1, labels: [500] }),
    makeChar(2, '雷恩', 600, 400, { defNo: 2 }),
  );
  s.rels.push(makeRel(20, 1, 2, 10));
  return {
    sheets: [s],
    active: 0,
    labels: [makeLabel(500, '學生')],
    nextId: 1000,
    font: 'sans',
  };
}

describe('三層的角色：整理與 migrate（資料版本 2 → 3）', () => {
  it('每位角色一筆條目、一件變體；外觀與標籤在變體上；關係類型收錄進關係庫', () => {
    const p = normalizeProject(base()) as Project;
    expect(p.library).toHaveLength(2);
    const [a, b] = p.sheets[0].chars;
    const ea = p.library.find((e) => e.id === a.lib);
    expect(ea?.variants).toHaveLength(1);
    expect(ea?.variants[0]).toMatchObject({
      id: a.vari,
      name: '艾莉絲',
      labels: [500],
      radars: [],
    });
    expect(b.lib).not.toBe(a.lib);
    expect(p.relLibrary).toHaveLength(1);
    const t = p.sheets[0].types[0];
    expect(p.relLibrary[0]).toMatchObject({ id: t.lib });
    expect(p.relLibrary[0].variants[0]).toMatchObject({
      id: t.vari,
      label: '朋友',
      color: '#58b368',
    });
  });
  it('第三批的資料：實例上的外觀以變體為準；指到不存在的變體＝穿第一件', () => {
    const raw = base();
    raw.library = [
      {
        id: 50,
        unified: false,
        info: '',
        font: '',
        variants: [
          { ...makeChar(0, '正本', 0, 0), id: 51, radars: [] } as never,
          { ...makeChar(0, '第二件', 0, 0), id: 52, radars: [] } as never,
        ],
      },
    ];
    raw.sheets[0].chars[0] = { ...raw.sheets[0].chars[0], lib: 50, vari: 52, name: '舊副本' };
    raw.sheets[0].chars[1] = { ...raw.sheets[0].chars[1], lib: 50, vari: 999 };
    const p = normalizeProject(raw) as Project;
    expect(p.sheets[0].chars.map((c) => [c.vari, c.name])).toEqual([
      [52, '第二件'],
      [51, '正本'],
    ]);
  });
  it('看法：只留兩位都是數字、不是對自己、非空的；換行壓成空白、最多 120 字', () => {
    const raw = base();
    raw.sheets[0].views = {
      1: { 2: '可靠的\n夥伴', 1: '自己', 3: '   ' },
      x: { 1: 'bad' },
      2: { 1: 'a'.repeat(200) },
    } as never;
    const p = normalizeProject(raw) as Project;
    expect(p.sheets[0].views).toEqual({ 1: { 2: '可靠的 夥伴' }, 2: { 1: 'a'.repeat(120) } });
  });
});

describe('同步：變體是正本', () => {
  beforeEach(() => seed(base()));
  it('改名＝改這件變體：同一批人的其他分頁一起變；一步復原', () => {
    addSheet('same');
    expect(data().sheets).toHaveLength(2);
    const twin = sheetAt(1).chars[0];
    expect(twin.lib).toBe(sheetAt(0).chars[0].lib);
    expect(twin.id).not.toBe(1);
    updateChar(twin.id, (c) => {
      c.name = '艾莉絲（覺醒）';
    });
    expect(sheetAt(0).chars[0].name).toBe('艾莉絲（覺醒）');
    expect(entryOf(1)?.variants[0].name).toBe('艾莉絲（覺醒）');
    undo();
    expect(sheetAt(0).chars[0].name).toBe('艾莉絲');
    expect(sheetAt(1).chars[0].name).toBe('艾莉絲');
  });
  it('複製分頁的看法跟著複製（角色 id 換新的）', () => {
    setView(1, 2, '可靠的夥伴');
    addSheet(true);
    const [a, b] = sheetAt(1).chars;
    expect(sheetAt(1).views).toEqual({ [a.id]: { [b.id]: '可靠的夥伴' } });
  });
  it('複製成獨立的新角色：新的條目，改名不影響原分頁', () => {
    addSheet('fork');
    const c = sheetAt(1).chars[0];
    expect(c.lib).not.toBe(sheetAt(0).chars[0].lib);
    updateChar(c.id, (d) => {
      d.name = '別人';
    });
    expect(sheetAt(0).chars[0].name).toBe('艾莉絲');
  });
  it('標籤在變體上：掛標籤＝穿同一件的其他分頁也有；刪標籤時沒人穿的變體也拿掉', () => {
    addSheet('same');
    /* 新分頁是目前的分頁：在它上面掛，原分頁的同一個人也有 */
    toggleLabel([sheetAt(1).chars[1].id], 500, true);
    expect(sheetAt(0).chars[1].labels).toEqual([500]);
    expect(entryOf(2)?.variants[0].labels).toEqual([500]);
    deleteEntries([]);
    deleteLabels([500]);
    expect(data().library.every((e) => e.variants.every((v) => v.labels.length === 0))).toBe(true);
  });
  it('換穿變體、新增變體（複製目前外觀，立刻換穿）', () => {
    const vid = newVariantFromChar(1);
    expect(sheetAt(0).chars[0]).toMatchObject({ vari: vid, name: '艾莉絲（變體）' });
    updateChar(1, (c) => {
      c.color = '#ff0000';
    });
    const e = entryOf(1);
    expect(e?.variants.map((v) => v.color)).toEqual(['auto', '#ff0000']);
    switchVariant(1, e?.variants[0].id as number);
    expect(sheetAt(0).chars[0]).toMatchObject({ name: '艾莉絲', color: 'auto' });
  });
  it('統一顏色：打開時蓋過所有變體；之後改一件＝全部；關掉之後各改各的', () => {
    newVariantFromChar(1);
    updateChar(1, (c) => {
      c.color = '#123456';
    });
    setUnified(1, true);
    expect(entryOf(1)?.variants.map((v) => v.color)).toEqual(['#123456', '#123456']);
    updateChar(1, (c) => {
      c.nameColor = '#abcdef';
    });
    expect(entryOf(1)?.variants.map((v) => v.nameColor)).toEqual(['#abcdef', '#abcdef']);
    setUnified(1, false);
    updateChar(1, (c) => {
      c.color = '#000000';
    });
    expect(entryOf(1)?.variants.map((v) => v.color)).toEqual(['#123456', '#000000']);
  });
  it('複製角色＝新的人：只帶目前這件、角色資訊與角色字型也帶過去', () => {
    newVariantFromChar(1);
    const e = entryOf(1);
    setCharInfo(e?.id as number, '<p>背景</p>');
    updateChar(1, (c) => {
      c.font = 'kai';
    });
    const [nid] = copyChars([1]);
    const ne = entryOf(nid);
    expect(ne?.id).not.toBe(e?.id);
    expect(ne?.variants).toHaveLength(1);
    /* 名字數字＋1 寫在新條目的變體上（第一批 F053） */
    const copy = sheetAt(0).chars.find((c) => c.id === nid);
    expect(copy?.name).toBe(ne?.variants[0].name);
    expect(copy?.name).toMatch(/2$/);
    expect(ne).toMatchObject({ info: '<p>背景</p>', font: 'kai' });
    expect(sheetAt(0).chars.find((c) => c.id === nid)?.font).toBe('kai');
  });
  it('空角色回收：刪掉沒有內容的角色，條目一起刪；有名字的留在庫裡', () => {
    addEntryToSheet(entryOf(2)?.id as number);
    const blank = sheetAt(0).chars.length;
    seed(base());
    const n0 = data().library.length;
    const s = data().sheets[0];
    void blank;
    void s;
    deleteChars([2]);
    expect(data().library).toHaveLength(n0);
    updateChar(1, (c) => {
      c.name = '';
      c.labels = [];
    });
    deleteChars([1]);
    expect(data().library).toHaveLength(n0 - 1);
  });
});

describe('角色庫（F057）', () => {
  beforeEach(() => {
    seed(base());
    addSheet('same');
    switchSheet(0);
    useProject.temporal.getState().clear();
  });
  it('刪除條目：所有分頁的角色與關係一起刪；一步復原全部回來（原作只回來目前分頁）', () => {
    const e = entryOf(1);
    deleteEntries([e?.id as number]);
    expect(data().sheets.map((s) => [s.chars.length, s.rels.length])).toEqual([
      [1, 0],
      [1, 0],
    ]);
    undo();
    expect(data().sheets.map((s) => [s.chars.length, s.rels.length])).toEqual([
      [2, 1],
      [2, 1],
    ]);
  });
  it('刪除變體：只剩一件時不動；穿這件的改穿第一件', () => {
    const e = entryOf(1);
    deleteVariant(e?.id as number, e?.variants[0].id as number);
    expect(entryOf(1)?.variants).toHaveLength(1);
    const v2 = newVariantFromChar(1);
    renameVariant(entryOf(1)?.id as number, v2, '魔女');
    expect(sheetAt(0).chars[0].name).toBe('魔女');
    deleteVariant(entryOf(1)?.id as number, v2);
    expect(sheetAt(0).chars[0].name).toBe('艾莉絲');
  });
  it('複製條目＝照抄（角色資訊、字型、統一顏色都帶；原作的複製模式會丟資訊與字型）', () => {
    const e = entryOf(1);
    setCharInfo(e?.id as number, '<p>資訊</p>');
    updateChar(1, (c) => {
      c.font = 'serif';
    });
    const nid = copyEntry(e?.id as number);
    const ne = data().library.find((x) => x.id === nid);
    expect(ne).toMatchObject({ info: '<p>資訊</p>', font: 'serif' });
    expect(ne?.variants[0].name).toBe('艾莉絲（變體）');
    expect(data().library.indexOf(ne as never)).toBe(
      data().library.indexOf(entryOf(1) as never) + 1,
    );
  });
  it('加入本分頁：新的實例（重要度 0、新的預設編號），同一個人可以出現兩次', () => {
    const e = entryOf(2);
    const id = addEntryToSheet(e?.id as number);
    const c = sheetAt(0).chars.find((x) => x.id === id);
    expect(c).toMatchObject({ lib: e?.id, name: '雷恩', level: 0, defNo: 3 });
    expect(sheetAt(0).chars.filter((x) => x.lib === e?.id)).toHaveLength(2);
  });
});

describe('關係庫（F092）', () => {
  beforeEach(() => {
    seed(base());
    addSheet('same');
    /* 同一毫秒裡的兩個動作會合成一步：準備好之後清掉復原紀錄 */
    useProject.temporal.getState().clear();
  });
  it('改關係類型＝同步到其他分頁穿同一件的（名稱與樣式；顯示與捆綁忽略不同步）；一步復原兩邊', () => {
    const t1 = sheetAt(1).types[0];
    updateType(t1.id, (t) => {
      t.color = '#00aa00';
      t.hidden = true;
    });
    expect(sheetAt(0).types[0]).toMatchObject({ color: '#00aa00', hidden: false });
    undo();
    expect(sheetAt(0).types[0].color).toBe('#58b368');
    expect(sheetAt(1).types[0].color).toBe('#58b368');
    expect(data().relLibrary[0].variants[0].color).toBe('#58b368');
  });
  it('加入本分頁：同一件不重複；變體改名＝所有分頁一起改（空白不改）', () => {
    const e = data().relLibrary[0];
    expect(addRelVariantToSheet(e.id, e.variants[0].id)).toBe(0);
    renameRelVariant(e.id, e.variants[0].id, '摯友');
    expect(data().sheets.map((s) => s.types[0].label)).toEqual(['摯友', '摯友']);
    renameRelVariant(e.id, e.variants[0].id, '  ');
    expect(sheetAt(0).types[0].label).toBe('摯友');
  });
  it('複製關係類型＝新的一筆；刪除變體＝解除綁定（樣式留著）；刪除條目＝所有分頁的類型與線一起刪', () => {
    const nid = copyType(sheetAt(1).types[0].id);
    const nt = sheetAt(1).types.find((t) => t.id === nid);
    expect(nt?.lib).not.toBe(sheetAt(1).types[0].lib);
    expect(data().relLibrary).toHaveLength(2);
    const e = data().relLibrary[0];
    const extra = { ...e.variants[0] };
    void extra;
    deleteRelVariant(e.id, e.variants[0].id);
    expect(sheetAt(0).types[0].lib).not.toBe(0);
    deleteRelEntries([e.id]);
    expect(data().sheets.map((s) => [s.types.length, s.rels.length])).toEqual([
      [0, 0],
      [1, 0],
    ]);
  });
});

describe('頭像框（F058）', () => {
  const F1 = 'aframe000001';
  const F2 = 'aframe000002';
  const F3 = 'aframe000003';
  function framed(): Sheet {
    const p = normalizeProject({
      ...base(),
      labels: [makeLabel(500, '學生', { frame: F2 }), makeLabel(501, '騎士', { frame: F3 })],
      frames: [
        { id: F1, name: '金' },
        { id: F2, name: '紅' },
        { id: F3, name: '藍' },
      ],
    }) as Project;
    return p.sheets[0];
  }
  it('三層：自己指定 → 跟隨標籤（標籤庫的順序）→ 分頁預設；空字串＝不使用；指定的框不在庫裡＝沒有框', () => {
    const s = framed();
    const labels = [makeLabel(501, '騎士', { frame: F3 }), makeLabel(500, '學生', { frame: F2 })];
    const frames = [
      { id: F1, name: '金' },
      { id: F2, name: '紅' },
      { id: F3, name: '藍' },
    ];
    const ctx = sheetCtx(s, labels, { frames });
    const [a, b] = s.chars;
    a.labels = [500, 501];
    expect(frameSource(ctx, a)).toMatchObject({ id: F3, from: 'label' });
    a.frame = F1;
    expect(frameSource(ctx, a)).toMatchObject({ id: F1, from: 'own' });
    a.frame = '';
    expect(effectiveFrame(ctx, a)).toBeNull();
    a.frame = 'agone0000001';
    expect(effectiveFrame(ctx, a)).toBeNull();
    expect(effectiveFrame(ctx, b)).toBeNull();
    s.settings.defFrame = F1;
    expect(frameSource(sheetCtx(s, labels, { frames }), b)).toMatchObject({
      id: F1,
      from: 'sheet',
    });
    b.noAvatar = true;
    expect(effectiveFrame(sheetCtx(s, labels, { frames }), b)).toBeNull();
  });
  it('畫法：框疊在頭像上（直徑 × 1.6）、名字往下讓 r × 0.6、名字讓位跟著、畫面外擴；沒有框＝輸出不變', () => {
    const s = framed();
    const opts = { href: (id: string) => `u:${id}`, font: 'sans' as const };
    const plain = editorSvg(s, opts);
    const labels = [makeLabel(500, '學生', { frame: F2 })];
    const frames = [{ id: F2, name: '紅' }];
    const out = editorSvg(s, { ...opts, labels, frames });
    expect(out.svg).toContain(
      '<g class="node-frame"><image class="av-frame" href="u:aframe000002" x="226.4" y="226.4" width="147.2" height="147.2"/></g>',
    );
    expect(plain.svg).not.toContain('node-frame');
    expect(out.pad - plain.pad).toBe(28);
    const ctx = sheetCtx(s, labels, { frames });
    const c = s.chars[0];
    expect(nameBoxExitDist(ctx, c, 0, 1) - nameBoxExitDist(sheetCtx(s), c, 0, 1)).toBeCloseTo(
      46 * 0.6,
      6,
    );
    expect(exportSvg(s, { ...opts, labels, frames })).toContain('class="av-frame"');
  });
  it('刪除框：指定它的變體改回跟隨標籤、標籤的框拿掉、分頁預設清掉（原作漏了）', () => {
    seed({ ...base(), labels: [makeLabel(500, '學生', { frame: F2 })] });
    addFrames([
      { id: F1, name: '金' },
      { id: F2, name: '紅' },
    ]);
    expect(addFrames([{ id: F1, name: '又一次' }])).toEqual({ added: 0, dup: 1 });
    updateChar(1, (c) => {
      c.frame = F1;
    });
    useProject.getState().update((p) => {
      p.sheets[0].settings.defFrame = F2;
    });
    deleteFrame(F2);
    deleteFrame(F1);
    expect(sheetAt(0).chars[0].frame).toBeNull();
    expect(data().labels[0].frame).toBe('');
    expect(sheetAt(0).settings.defFrame).toBe('');
  });
});

describe('角色字型（F059）', () => {
  it('匯入的字型接文件字型；內建的照字型組；沒設或字型不在庫裡＝跟隨文件字型', () => {
    const s = normalizeProject(base())?.sheets[0] as Sheet;
    const fonts = [{ id: 'afont0000001', name: 'A', fmt: 'ttf' as const }];
    const ctx = sheetCtx(s, [], { font: 'serif', fonts });
    const c = s.chars[0];
    expect(charFontCss(ctx, c)).toBe('');
    c.font = 'f:afont0000001';
    expect(charFontCss(ctx, c)).toMatch(/^"crf-afont0000001","Noto Serif TC"/);
    c.font = 'f:agone0000001';
    expect(charFontCss(ctx, c)).toBe('');
    c.font = 'kai';
    expect(charFontCss(ctx, c)).toMatch(/^"Kaiti TC"/);
    const svg = editorSvg(s, { href: () => null, font: 'f:afont0000001', fonts }).svg;
    expect(svg).toContain('font-family="&quot;crf-afont0000001&quot;,&quot;Noto Sans TC&quot;');
    expect(svg).toContain('<text style="font-family:&quot;Kaiti TC&quot;');
  });
  it('刪除字型：文件字型回到黑體、角色字型改回跟隨', () => {
    seed({
      ...base(),
      font: 'f:afont0000001',
      fonts: [{ id: 'afont0000001', name: 'A', fmt: 'ttf' }],
    });
    updateChar(1, (c) => {
      c.font = 'f:afont0000001';
    });
    deleteFont('afont0000001');
    expect(data().font).toBe('sans');
    expect(entryOf(1)?.font).toBe('');
    expect(sheetAt(0).chars[0].font).toBe('');
  });
});

describe('數值（F192 的資料）', () => {
  beforeEach(() => seed(base()));
  it('範本、狀態、數值（在變體上）；刪軸、刪範本會清掉各變體的值', () => {
    const tpl = addRadarTpl();
    const t = data().radarTpls[0];
    expect(t).toMatchObject({ id: tpl, chart: 'radar', rings: 4, valMode: 'raw', shared: false });
    expect(t.axes.map((a) => a.max)).toEqual([100, 100, 100, 100, 100]);
    setRadarVal(1, tpl, 0, t.axes[0].id, 70);
    const i = addRadarState(1, tpl);
    setRadarVal(1, tpl, i, t.axes[1].id, -5);
    expect(entryOf(1)?.variants[0].radars).toEqual([
      { tpl, state: '', vals: { [t.axes[0].id]: 70 } },
      { tpl, state: '', vals: { [t.axes[1].id]: -5 } },
    ]);
    deleteRadarAxis(tpl, t.axes[0].id);
    expect(entryOf(1)?.variants[0].radars[0].vals).toEqual({});
    expect(addRadarAxis(tpl)).toBeGreaterThan(0);
    deleteRadarTpl(tpl);
    expect(entryOf(1)?.variants[0].radars).toEqual([]);
  });
});

describe('交換位置（F061）與連線總表（F094）', () => {
  beforeEach(() => seed(base()));
  it('交換座標與清單順序（釘選的也換）；一步復原', () => {
    updateChar(1, (c) => {
      c.locked = true;
    });
    swapChars(1, 2);
    const [a, b] = sheetAt(0).chars;
    expect([a.id, a.x, a.y, b.id, b.x, b.y]).toEqual([2, 300, 300, 1, 600, 400]);
    undo();
    expect(sheetAt(0).chars.map((c) => c.id)).toEqual([1, 2]);
  });
  it('新增關係：重複＝dup；自我關係雙向一律關；批次換類型：已經是＝已套用、會重複＝略過', () => {
    expect(addRelation(1, 2, 10, false)).toBe('dup');
    expect(addRelation(2, 1, 10, true)).toBe('dup');
    const self = addRelation(1, 1, 10, true) as number;
    expect(sheetAt(0).rels.find((r) => r.id === self)?.both).toBe(false);
    useProject.getState().update((p) => {
      p.sheets[0].types.push(makeType(11, '敵對'));
      p.sheets[0].rels.push(makeRel(21, 1, 2, 11));
    });
    const r = retagRels([20, 21, self], 11);
    expect(r).toEqual({ applied: 2, skipped: 1 });
  });
  it('看法：清空＝刪除；不能對自己寫；刪角色時一起清', () => {
    setView(1, 2, '  可靠  ');
    setView(1, 1, '自己');
    expect(sheetAt(0).views).toEqual({ 1: { 2: '可靠' } });
    setView(1, 2, '');
    expect(sheetAt(0).views).toEqual({});
    setView(2, 1, '哼');
    deleteChars([1]);
    expect(sheetAt(0).views).toEqual({});
  });
});
