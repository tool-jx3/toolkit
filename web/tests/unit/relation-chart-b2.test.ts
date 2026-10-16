/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見 web/src/tools/relation-chart/UPSTREAM_LICENSE。
 *
 * 角色關係圖產生器第二批（標籤與群體）的資料、規則與動作：資料版本 2 的整理、讀原作的專案檔、群體關係的規則、
 * 收合、聚焦、標籤與磁鐵／排列、標籤庫與群體關係的動作（復原、連動刪除）。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { sheetCtx } from '@/tools/relation-chart/engine/geom';
import {
  colAggregate,
  focusSets,
  grelCount,
  grelEntriesFor,
  labelInfo,
  labelNetLayout,
} from '@/tools/relation-chart/engine/labels';
import { forceStep } from '@/tools/relation-chart/logic/force';
import {
  applyLayout,
  fitCanvasToContent,
  layoutTargets,
  pushAwayFrom,
  resizeCanvas,
  separateAll,
} from '@/tools/relation-chart/logic/layout';
import { convertLegacy } from '@/tools/relation-chart/logic/legacy';
import {
  makeChar,
  makeLabel,
  makeRel,
  makeType,
  unnamedLabelText,
} from '@/tools/relation-chart/model/factory';
import {
  emptySheet,
  initialProject,
  normalizeProject,
  normalizeSettings,
} from '@/tools/relation-chart/model/normalize';
import type { Label, Project, Sheet } from '@/tools/relation-chart/model/types';
import {
  addSheet,
  createLabel,
  deleteChars,
  deleteGrel,
  deleteLabel,
  deleteLabels,
  deleteType,
  insertSheet,
  linkClick,
  moveLabel,
  renameLabel,
  setCollapsed,
  startLink,
  toggleGrelExcept,
  updateGrel,
  updateLabel,
} from '@/tools/relation-chart/state/actions';
import { useProject, useUi } from '@/tools/relation-chart/state/store';

/** 一張測試用分頁：6 位、兩種關係、標籤 1（甲：1～3）、2（乙：3～5） */
function sheet6(): { s: Sheet; labels: Label[] } {
  const s = emptySheet(1, 1, { W: 1000, H: 1000 });
  s.types.push(makeType(10, '朋友'), makeType(11, '敵人'));
  const pos = [
    [200, 200],
    [320, 220],
    [260, 330],
    [520, 300],
    [640, 360],
    [800, 800],
  ];
  pos.forEach(([x, y], i) => {
    s.chars.push(
      makeChar(i + 1, `角色${i + 1}`, x, y, {
        defNo: i + 1,
        labels: i < 2 ? [1] : i === 2 ? [1, 2] : i < 5 ? [2] : [],
      }),
    );
  });
  s.rels.push(
    makeRel(100, 1, 2, 10),
    makeRel(101, 1, 4, 10),
    makeRel(102, 2, 5, 10, { both: true }),
    makeRel(103, 3, 6, 11),
    makeRel(104, 4, 5, 11),
  );
  return { s, labels: [makeLabel(1, '甲', { zone: true }), makeLabel(2, '乙')] };
}

describe('資料版本 2 的整理（3.8）', () => {
  it('版本 1 的存檔：標籤、分頁補上預設', () => {
    const p = normalizeProject({
      sheets: [{ id: 1, chars: [], rels: [], types: [], settings: {} }],
      labels: [{ id: 5, text: '主角群' }],
      nextId: 10,
    }) as Project;
    expect(p.labels).toEqual([makeLabel(5, '主角群')]);
    expect(p.sheets[0].grels).toEqual([]);
    expect(p.sheets[0].collapsed).toEqual([]);
    const s = p.sheets[0].settings;
    expect([s.showZones, s.zoneOutline, s.zoneBlend, s.viewerHiddenLbls]).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect([s.showLabelNodes, s.showFreeLbls, s.showLblLegend]).toEqual([false, false, false]);
    expect([s.zoneEdgeW, s.zoneFillOp, s.zoneLink, s.zoneThick, s.zoneLayerStep]).toEqual([
      1.5, 0.13, 5, 5, 5,
    ]);
    expect([s.lblNodeScale, s.lblLegendPos]).toEqual([1, 'right']);
    expect([s.labelPos, s.zoneNameAng]).toEqual([{}, {}]);
  });
  it('設定的範圍與刻度（超出範圍＝預設，原作的 sanitizeSettings）', () => {
    const s = normalizeSettings({
      zoneEdgeW: 2.3,
      zoneFillOp: 0.255,
      zoneLink: 3.6,
      zoneThick: 11,
      zoneLayerStep: -1,
      lblNodeScale: 1.52,
      lblLegendPos: 'online',
      labelPos: { 3: { x: 10.04, y: 20.06 }, bad: { x: 1, y: 2 }, 4: { x: 'a', y: 1 } },
      zoneNameAng: { 3: 1.5, 4: 'x' },
    });
    expect(s.zoneEdgeW).toBe(2.5);
    expect(s.zoneFillOp).toBe(0.26);
    expect(s.zoneLink).toBe(4);
    expect(s.zoneThick).toBe(5);
    expect(s.zoneLayerStep).toBe(5);
    expect(s.lblNodeScale).toBe(1.5);
    expect(s.lblLegendPos).toBe('right');
    expect(s.labelPos).toEqual({ 3: { x: 10, y: 20.1 } });
    expect(s.zoneNameAng).toEqual({ 3: 1.5 });
  });
  it('群體關係只驗形狀；收合名單只留陣營框標籤；標籤的顏色與開關', () => {
    const p = normalizeProject({
      sheets: [
        {
          id: 1,
          chars: [{ id: 2, x: 1, y: 1, labels: [7, 8] }],
          rels: [],
          types: [{ id: 3, label: 'x' }],
          grels: [
            { id: 20, from: 'L7', to: 'C2', type: 3, inherit: true, except: [2, 2, 'x'] },
            { id: 21, from: 'L7', to: 'L7', type: 3 },
            { id: 22, from: 'X7', to: 'C2', type: 3 },
            { id: 23, from: 'C9', to: 'L8', tagId: 3, both: 1 },
            { id: 24, from: 'C2', to: 'L8', relTypeId: 3, note: 'n' },
          ],
          collapsed: [7, 8, 99],
        },
      ],
      labels: [
        { id: 7, text: '甲', zone: true, color: '#F00' },
        { id: 8, text: '乙', hidden: true, noPull: true },
      ],
      nextId: 30,
    }) as Project;
    const s = p.sheets[0];
    expect(s.grels.map((g) => g.id)).toEqual([20, 23, 24]);
    expect(s.grels[0]).toEqual({
      id: 20,
      from: 'L7',
      to: 'C2',
      type: 3,
      both: false,
      inherit: true,
      note: '',
      except: [2],
    });
    expect(s.grels[1].both).toBe(false);
    expect(s.grels[2]).toMatchObject({ type: 3, note: 'n' });
    expect(s.collapsed).toEqual([7]);
    expect(p.labels[0]).toEqual(makeLabel(7, '甲', { zone: true, color: '#ff0000' }));
    expect(p.labels[1]).toEqual(makeLabel(8, '乙', { hidden: true, noPull: true }));
  });
  it('未命名標籤的編號', () => {
    expect(unnamedLabelText([])).toBe('未命名標籤1');
    expect(
      unnamedLabelText([
        makeLabel(1, '未命名標籤2'),
        makeLabel(2, '未命名標籤x'),
        makeLabel(3, '甲'),
      ]),
    ).toBe('未命名標籤3');
  });
});

describe('讀原作的專案檔：標籤與群體（3.9）', () => {
  const raw = () => ({
    app: 'CharRelDiagram',
    format: 7,
    lblLegendPos: 'leftOut',
    labels: [
      { id: 50, text: '王國', color: '#123456', zone: true },
      { id: 51, text: '騎士', hidden: true, noPull: true, frame: 'abc' },
    ],
    library: [
      { id: 900, variants: [{ id: 901, name: '甲', labels: [50, 51] }] },
      { id: 902, variants: [{ id: 903, name: '乙', labels: [50] }] },
    ],
    sheets: [
      {
        id: 1,
        W: 1000,
        H: 800,
        relTypes: [{ id: 30, label: '敵對' }],
        settings: { showLabelNodes: true, zoneThick: 8, labelPos: { 51: { x: 10, y: 20 } } },
        chars: [
          { id: 1, libId: 900, varId: 901, x: 100, y: 100 },
          { id: 2, libId: 902, varId: 903, x: 300, y: 100 },
        ],
        rels: [],
        collapsedLbls: [50],
        groupRels: [
          { id: 60, from: 'L50', to: 'C2', relTypeId: 30, inherit: true, except: [1] },
          { id: 61, from: 'L51', to: 'L50', tagId: 30, both: true },
          { id: 62, from: 'L51', to: 'L51', relTypeId: 30 },
        ],
      },
    ],
  });
  it('標籤的顏色與開關、分頁設定、收合、群體關係', () => {
    const conv = convertLegacy(raw());
    expect(conv.labels).toEqual([
      makeLabel(50, '王國', { color: '#123456', zone: true }),
      makeLabel(51, '騎士', { hidden: true, noPull: true }),
    ]);
    const s = conv.sheets[0];
    expect(s.settings.showLabelNodes).toBe(true);
    expect(s.settings.zoneThick).toBe(8);
    expect(s.settings.labelPos).toEqual({ 51: { x: 10, y: 20 } });
    expect(s.settings.lblLegendPos).toBe('leftOut');
    expect(s.collapsed).toEqual([50]);
    expect(s.grels.map((g) => [g.id, g.from, g.to, g.type, g.both, g.inherit, g.except])).toEqual([
      [60, 'L50', 'C2', 30, false, true, [1]],
      [61, 'L51', 'L50', 30, true, false, []],
    ]);
    expect(conv.skipped).toContain('頭像框');
    expect(conv.skipped.join()).not.toMatch(/群體關係|陣營框|引力/);
  });
  it('加入為新分頁：id 換成專案的，端點、例外、收合、標籤節點位置、名稱角度跟著換', () => {
    const conv = convertLegacy(raw());
    const p = initialProject() as Project;
    p.nextId = 1000;
    p.labels = [makeLabel(7, '騎士')];
    const s = conv.sheets[0];
    s.settings.zoneNameAng = { 50: 1 };
    const labelMap = new Map([
      [50, 2000],
      [51, 7],
    ]);
    const mapChar = new Map<number, number>();
    const idx = insertSheet(p, s, { labelMap, mapChar });
    const out = p.sheets[idx];
    const c1 = mapChar.get(1);
    const c2 = mapChar.get(2);
    expect(out.chars.map((c) => c.labels)).toEqual([[2000, 7], [2000]]);
    expect(out.grels.map((g) => [g.from, g.to, g.except])).toEqual([
      ['L2000', `C${c2}`, [c1]],
      ['L7', 'L2000', []],
    ]);
    expect(out.grels.every((g) => g.id >= 1000 && g.type === out.types[0].id)).toBe(true);
    expect(out.collapsed).toEqual([2000]);
    expect(out.settings.labelPos).toEqual({ 7: { x: 10, y: 20 } });
    expect(out.settings.zoneNameAng).toEqual({ 2000: 1 });
  });
});

describe('群體關係的規則（F093、3.11）', () => {
  const setup = () => {
    const { s, labels } = sheet6();
    s.grels.push(
      {
        id: 200,
        from: 'L1',
        to: 'C6',
        type: 11,
        both: false,
        inherit: true,
        note: '',
        except: [2],
      },
      {
        id: 201,
        from: 'C4',
        to: 'L1',
        type: 10,
        both: false,
        inherit: false,
        note: '',
        except: [],
      },
      { id: 202, from: 'L1', to: 'L2', type: 10, both: true, inherit: true, note: '', except: [] },
      { id: 203, from: 'L9', to: 'C1', type: 10, both: false, inherit: true, note: '', except: [] },
    );
    return { ctx: sheetCtx(s, labels), s };
  };
  it('×N＝標籤端的有效成員（扣掉例外、兩端都在的；兩端都是標籤＝不標）', () => {
    const { ctx, s } = setup();
    expect(grelCount(ctx, s.grels[0])).toBe(2);
    expect(grelCount(ctx, s.grels[1])).toBe(3);
    expect(grelCount(ctx, s.grels[2])).toBeNull();
  });
  it('角色面板：自己是端點的一定列、成員身分只有算到每位成員才列、兩端都在的跳過、端點不在的不列', () => {
    const { ctx } = setup();
    const ids = (id: number) =>
      grelEntriesFor(ctx, id).map((e) => [e.g.id, e.own, e.dirOut, e.via?.id ?? null, e.ex]);
    expect(ids(1)).toEqual([
      [200, false, true, 1, false],
      [202, false, true, 1, false],
    ]);
    expect(ids(2)).toEqual([
      [200, false, true, 1, true],
      [202, false, true, 1, false],
    ]);
    /* 3 同時在甲、乙兩端＝202 跳過；201 沒有算到每位成員 */
    expect(ids(3)).toEqual([[200, false, true, 1, false]]);
    expect(ids(4)).toEqual([
      [201, true, true, null, false],
      [202, false, false, 2, false],
    ]);
    expect(ids(6)).toEqual([[200, true, false, null, false]]);
  });
});

describe('收合（F182i）', () => {
  it('成員歸角色身上排最前的收合中陣營；同組的線不畫、與外面的線聚合', () => {
    const { s, labels } = sheet6();
    labels[1].zone = true;
    s.collapsed = [1, 2];
    const ctx = sheetCtx(s, labels);
    const info = labelInfo(ctx);
    expect([...info.colHidden]).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 2],
      [5, 2],
    ]);
    expect(info.colGroups.get(1)?.members.map((c) => c.id)).toEqual([1, 2, 3]);
    const agg = colAggregate(ctx);
    expect([...agg.keys()]).toEqual(['L1|L2|10', 'C6|L1|11']);
    expect([...(agg.get('L1|L2|10')?.dirs ?? [])]).toEqual(['ab', 'both']);
    expect(agg.get('L1|L2|10')?.rels.map((r) => r.id)).toEqual([101, 102]);
    expect([...(agg.get('C6|L1|11')?.dirs ?? [])]).toEqual(['ba']);
  });
  it('不是陣營框的標籤收合不了；隱藏的成員不推擠、不排列', () => {
    const { s, labels } = sheet6();
    s.collapsed = [1, 2];
    const ctx = sheetCtx(s, labels);
    expect(labelInfo(ctx).colGroups.size).toBe(1);
    expect(layoutTargets(ctx).map((c) => c.id)).toEqual([4, 5, 6]);
    s.chars[0].x = s.chars[3].x;
    s.chars[0].y = s.chars[3].y;
    const before = { x: s.chars[0].x, y: s.chars[0].y };
    separateAll(sheetCtx(s, labels));
    expect({ x: s.chars[0].x, y: s.chars[0].y }).toEqual(before);
    pushAwayFrom(sheetCtx(s, labels), s.chars[3]);
    expect({ x: s.chars[0].x, y: s.chars[0].y }).toEqual(before);
  });
});

describe('聚焦（F182e、F182h）', () => {
  it('角色＝一度關係＋他的陣營框／標籤網的標籤；標籤＝成員＋成員之間的線', () => {
    const { s, labels } = sheet6();
    const ctx = sheetCtx(s, labels);
    const f = focusSets(ctx, { kind: 'node', id: 3 });
    expect([...f.nodes].sort()).toEqual([3, 6]);
    expect([...f.lbls]).toEqual([1]);
    s.settings.showLabelNodes = true;
    expect([...focusSets(sheetCtx(s, labels), { kind: 'node', id: 3 }).lbls]).toEqual([1, 2]);
    const l = focusSets(sheetCtx(s, labels), { kind: 'label', id: 2 });
    expect([...l.nodes]).toEqual([3, 4, 5]);
    expect([...l.edges]).toEqual([104]);
  });
});

describe('標籤節點的位置（F182f、F182k、F182l）', () => {
  it('存過的位置優先，否則成員質心＋螺旋避讓、夾在畫布內；游離標籤在外圈', () => {
    const { s, labels } = sheet6();
    labels.push(makeLabel(3, '游離'));
    s.settings.labelPos = { 2: { x: 900, y: 100 } };
    const lay = labelNetLayout(sheetCtx(s, labels));
    expect(lay.map((l) => l.id)).toEqual([1, 2, 3]);
    expect(lay[1]).toMatchObject({ x: 900, y: 100 });
    const near = lay[0];
    expect(near.x).toBeGreaterThan(0);
    for (const c of s.chars) expect(Math.hypot(c.x - near.x, c.y - near.y)).toBeGreaterThan(40);
    expect(Math.hypot(lay[2].x - 500, lay[2].y - 500)).toBeGreaterThan(300);
  });
  it('磁鐵：標籤網開著時標籤動、位置存進設定（0.1 px）；拖著的標籤不動；沒有引力的不拉成員', () => {
    const { s, labels } = sheet6();
    s.settings.showLabelNodes = true;
    const vel = new Map();
    forceStep(sheetCtx(s, labels), vel, 1, new Set(), 2);
    expect(Object.keys(s.settings.labelPos).sort()).toEqual(['1']);
    const p = s.settings.labelPos['1'];
    expect(Math.round(p.x * 10) / 10).toBe(p.x);
    /* 沒有引力：成員不被拉（和完全沒有標籤時一樣） */
    const a = sheet6();
    a.labels.forEach((l) => {
      l.noPull = true;
    });
    a.s.settings.showLabelNodes = true;
    const b = sheet6();
    b.labels.length = 0;
    forceStep(sheetCtx(a.s, a.labels), new Map(), 1, new Set(), null);
    forceStep(sheetCtx(b.s, []), new Map(), 1, new Set(), null);
    /* 標籤圓點會推人，所以只比沒有圓點互斥的那位（6 號離得遠） */
    expect(a.s.chars[5].x).toBeCloseTo(b.s.chars[5].x, 0);
  });
  it('套用陣型清掉標籤位置；改畫布、貼合內容時標籤位置跟著平移', () => {
    const { s, labels } = sheet6();
    s.settings.labelPos = { 1: { x: 100, y: 100 } };
    applyLayout(sheetCtx(s, labels), 'circle');
    expect(s.settings.labelPos).toEqual({});
    s.settings.labelPos = { 1: { x: 100, y: 100 } };
    resizeCanvas(s, { x: 50, y: -20, w: 900, h: 900 });
    expect(s.settings.labelPos).toEqual({ 1: { x: 50, y: 120 } });
    const minX = Math.min(...s.chars.map((c) => c.x));
    fitCanvasToContent(sheetCtx(s, labels));
    const dx = Math.min(...s.chars.map((c) => c.x)) - minX;
    expect(s.settings.labelPos[1].x).toBeCloseTo(50 + dx, 6);
  });
});

/* ---------- 動作（store） ---------- */

function seed(p: Omit<Project, 'library' | 'relLibrary' | 'radarTpls' | 'frames' | 'fonts'>) {
  useProject.getState().replace(normalizeProject(p) as Project);
  useProject.temporal.getState().clear();
  useUi.setState({ sel: [], focus: null, hover: null, link: null, panel: null });
}
const data = () => useProject.getState().data;
const undo = () => useProject.temporal.getState().undo();

describe('標籤庫的動作（F181）', () => {
  beforeEach(() => {
    const { s, labels } = sheet6();
    const s2 = emptySheet(2, 2);
    s2.chars.push(makeChar(50, '別人', 100, 100, { labels: [2] }));
    s2.settings.labelPos = { 2: { x: 1, y: 2 } };
    s.grels.push({
      id: 300,
      from: 'L2',
      to: 'C1',
      type: 10,
      both: false,
      inherit: false,
      note: '',
      except: [],
    });
    s.collapsed = [1];
    s.settings.zoneNameAng = { 2: 1 };
    seed({ sheets: [s, s2], active: 0, labels, nextId: 1000, font: 'sans' });
  });
  it('新增：同名沿用；空白＝未命名標籤 N；加在最後', () => {
    expect(createLabel('甲')).toBe(1);
    /* 新的 id 照專案的 nextId（第三批起整理時角色庫也會用掉幾個 id） */
    const next = data().nextId;
    const id = createLabel('丙');
    expect(data().labels.map((l) => l.text)).toEqual(['甲', '乙', '丙']);
    expect(id).toBe(next);
    createLabel();
    expect(data().labels[3].text).toBe('未命名標籤1');
  });
  it('改名（空白不改）、顏色與開關、排序；每個都可以復原', () => {
    renameLabel(1, '  王國 ');
    expect(data().labels[0].text).toBe('王國');
    renameLabel(1, '  ');
    expect(data().labels[0].text).toBe('王國');
    updateLabel(2, { color: '#ff0000', hidden: true });
    expect(data().labels[1]).toMatchObject({ color: '#ff0000', hidden: true });
    moveLabel(1, 0);
    expect(data().labels.map((l) => l.id)).toEqual([2, 1]);
    undo();
    expect(data().labels.map((l) => l.id)).toEqual([1, 2]);
  });
  it('關掉陣營框＝收合自動解除', () => {
    updateLabel(1, { zone: false });
    expect(data().sheets[0].collapsed).toEqual([]);
  });
  it('刪除：角色身上、標籤節點位置、名稱角度、收合、群體關係一起清（全部分頁）', () => {
    deleteLabel(2);
    const [a, b] = data().sheets;
    expect(data().labels.map((l) => l.id)).toEqual([1]);
    expect(a.chars.flatMap((c) => c.labels)).toEqual([1, 1, 1]);
    expect(b.chars[0].labels).toEqual([]);
    expect(b.settings.labelPos).toEqual({});
    expect(a.settings.zoneNameAng).toEqual({});
    expect(a.grels).toEqual([]);
    deleteLabel(1);
    expect(data().sheets[0].collapsed).toEqual([]);
    undo();
    undo();
    expect(data().labels.length).toBe(2);
    deleteLabels([1, 2]);
    expect(data().labels).toEqual([]);
  });
  it('收合／展開（只有陣營框標籤）', () => {
    setCollapsed(1, false);
    expect(data().sheets[0].collapsed).toEqual([]);
    setCollapsed(2, true);
    expect(data().sheets[0].collapsed).toEqual([]);
    setCollapsed(1, true);
    expect(data().sheets[0].collapsed).toEqual([1]);
  });
});

describe('群體關係的動作（F093）', () => {
  beforeEach(() => {
    const { s, labels } = sheet6();
    seed({ sheets: [s], active: 0, labels, nextId: 1000, font: 'sans' });
  });
  it('建立關係模式：標籤當端點＝群體關係；同類同向再點（本輪）＝取消、反向＝合併成雙向', () => {
    startLink(10);
    linkClick('L1');
    expect(useUi.getState().link?.from).toBe('L1');
    linkClick('C6');
    expect(data().sheets[0].grels).toMatchObject([{ from: 'L1', to: 'C6', type: 10, both: false }]);
    expect(data().sheets[0].rels.length).toBe(5);
    linkClick('C6');
    expect(data().sheets[0].grels).toEqual([]);
    /* 起點釘住：再點一次 C6＝又建一條；點起點＝取消起點；換 C6 當起點點甲＝反向，合併成雙向 */
    linkClick('C6');
    linkClick('L1');
    expect(useUi.getState().link?.from).toBeNull();
    linkClick('C6');
    linkClick('L1');
    expect(data().sheets[0].grels).toMatchObject([{ from: 'L1', to: 'C6', both: true }]);
    expect(useUi.getState().link?.flash?.ok).toBe(true);
  });
  it('算到每位成員、例外、刪除；刪除角色或關係類型時一起刪', () => {
    startLink(10);
    linkClick('L1');
    linkClick('C6');
    useUi.setState({ link: null });
    const gid = data().sheets[0].grels[0].id;
    updateGrel(gid, { inherit: true });
    toggleGrelExcept(gid, 2);
    expect(data().sheets[0].grels[0]).toMatchObject({ inherit: true, except: [2] });
    toggleGrelExcept(gid, 2);
    expect(data().sheets[0].grels[0].except).toEqual([]);
    deleteGrel(gid);
    expect(data().sheets[0].grels).toEqual([]);
    undo();
    deleteChars([6]);
    expect(data().sheets[0].grels).toEqual([]);
    undo();
    deleteType(10);
    expect(data().sheets[0].grels).toEqual([]);
  });
  it('複製分頁：群體關係一起複製（角色端換成複製出來的角色）', () => {
    data();
    startLink(10);
    linkClick('C4');
    linkClick('L2');
    useUi.setState({ link: null });
    addSheet(true);
    const [a, b] = data().sheets;
    expect(b.grels.length).toBe(1);
    const c4 = b.chars[a.chars.findIndex((c) => c.id === 4)].id;
    expect(b.grels[0]).toMatchObject({ from: `C${c4}`, to: 'L2' });
    expect(b.grels[0].id).not.toBe(a.grels[0].id);
    expect(b.grels[0].type).toBe(b.types[0].id);
  });
});
