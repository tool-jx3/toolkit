/**
 * @vitest-environment jsdom
 */
/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見 web/src/tools/relation-chart/UPSTREAM_LICENSE。
 *
 * 第四批「畫布、檢視與分享」：讀原作的專案檔（便利貼、世界觀、備忘錄、便利貼庫、設定集）、統計與尋路、遠近簡化、設定集的動作、
 * 世界觀的沿用、資料版本 3 → 4。
 * 範例是研究員用原作做、用原作「匯出專案」存、再用原作讀回確認的（研究筆記附錄 B）：
 * - `fixtures/relation-chart-b4-notes-lore.json`（b45-notes-lore 的 project.json，拿掉第五批的分頁庫內容）：7 張便利貼、世界觀、
 *   沿用、備忘錄、便利貼庫 2 筆、設定集 2 筆；
 * - `fixtures/relation-chart-b4-lod-stats.json`（b45-lod-stats）：80 位、隱藏的關係類型、12 步的長鏈、23 位孤立。
 *   統計與尋路的預期值是原作算出來的（samples-log.json 的 C）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bindView, fitView, lodScale, nextLod, zoomBy } from '@/tools/relation-chart/editor/view';
import { editorSvg, lodDense, viewerSvg } from '@/tools/relation-chart/engine/chart';
import { displayName, sheetCtx } from '@/tools/relation-chart/engine/geom';
import { convertLegacy } from '@/tools/relation-chart/logic/legacy';
import { buildSample } from '@/tools/relation-chart/logic/samples';
import {
  degrees,
  isolated,
  nDegree,
  ranking,
  shortestChain,
  statEdges,
} from '@/tools/relation-chart/logic/stats';
import { makeChar } from '@/tools/relation-chart/model/factory';
import { loreOf, loreSources } from '@/tools/relation-chart/model/lore';
import {
  emptySheet,
  initialProject,
  normalizeProject,
  projectAssetIds,
  SETTINGS_DEFAULTS,
} from '@/tools/relation-chart/model/normalize';
import { nextPresetName, PRESET_KEYS, sortedPresets } from '@/tools/relation-chart/model/presets';
import type { Project, Sheet } from '@/tools/relation-chart/model/types';
import { addSheet, deleteSheet } from '@/tools/relation-chart/state/actions';
import {
  applyPreset,
  deletePreset,
  factoryReset,
  overwritePreset,
  reorderPresets,
  savePreset,
  toggleFavPreset,
} from '@/tools/relation-chart/state/presetActions';
import { applyLegacy, remapLegacyRefs } from '@/tools/relation-chart/state/project';
import { setUi, updateProject, useProject, useUi } from '@/tools/relation-chart/state/store';

const FS = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS)) as {
  readFileSync: (p: string, enc: 'utf8') => string;
};
const DIR = `${(globalThis as { process?: { cwd: () => string } }).process?.cwd()}/tests/unit/fixtures/`;
const fixture = (name: string) =>
  JSON.parse(readFileSync(`${DIR}${name}`, 'utf8')) as Record<string, unknown>;

function load(data: Record<string, unknown>, mode: 'replace' | 'append' = 'replace'): Project {
  const conv = convertLegacy(data);
  const refs = remapLegacyRefs(conv, new Map(), new Map(), new Map());
  if (mode === 'replace') useProject.getState().replace(initialProject());
  applyLegacy(conv, mode, refs.font, [], []);
  return useProject.getState().data;
}

beforeEach(() => {
  let t = 1e12;
  vi.spyOn(Date, 'now').mockImplementation(() => (t += 10));
  setUi({ sel: [], panel: null, focus: null, libPreset: null });
});

describe('讀原作的專案檔（第四批）', () => {
  it('便利貼：7 張的位置、尺寸、字級、隱藏紙面、釘選照原作；畫布外的照樣在', () => {
    const p = load(fixture('relation-chart-b4-notes-lore.json'));
    const main = p.sheets[1];
    expect(main.name).toBe('主線');
    expect(
      main.notes.map((n) => [n.text, n.x, n.y, n.w, n.h, n.size, n.bare, n.locked, !!n.chart]),
    ).toEqual([
      ['2×2', 100, 100, 100, 100, null, false, false, false],
      [
        '預設 4×4，自動字級。這段文字比較長，看看會不會自動縮小字級並且換行。',
        950,
        150,
        200,
        200,
        null,
        false,
        false,
        false,
      ],
      ['指定字級 22', 950, 700, 300, 150, 22, false, false, false],
      ['隱藏紙面的標題', 550, 60, 400, 150, 30, true, false, false],
      ['釘選的便利貼', 150, 780, 200, 200, null, false, true, false],
      ['在畫布外的旁註', 1300, 450, 200, 200, null, false, false, false],
      ['', 550, 860, 150, 100, null, false, false, false],
    ]);
    /* id 是專案的（全專案唯一） */
    expect(new Set(main.notes.map((n) => n.id)).size).toBe(7);
  });

  it('世界觀（淨化過，標題、粗體、紅字、清單、表格、引用、圖片、連結都在）、沿用（換成新的分頁 id）、備忘錄', () => {
    const p = load(fixture('relation-chart-b4-notes-lore.json'));
    const [, main, side] = p.sheets;
    for (const tag of ['<h1>', '<b>', 'color:', '<ul>', '<table>', '<blockquote>', '<img', '<a '])
      expect(main.lore, tag).toContain(tag);
    expect(main.lore).toContain('rel="noopener noreferrer nofollow"');
    expect(main.memo).toBe('色票：主角 #e5b84b\n待辦：補頭像');
    expect(side.loreFrom).toBe(main.id);
    expect(side.memo).toBe('支線自己的備忘錄');
    expect(loreOf(p.sheets, side)).toMatchObject({ html: main.lore, gone: false });
    expect(loreSources(p.sheets, side).map((s) => s.name)).toEqual(['主線']);
  });

  it('便利貼庫、設定集（最愛、設定值）；不再列在略過的內容（第五批起分頁庫也讀進來，見 relation-chart-b5）', () => {
    const data = fixture('relation-chart-b4-notes-lore.json');
    const conv = convertLegacy(data);
    expect(conv.skipped).toEqual([]);
    const p = load(data);
    expect(p.noteBin.map((n) => [n.text, n.w, n.h, n.size, n.bare])).toEqual([
      ['關掉的隱藏紙面', 200, 200, 18, true],
      ['關掉的 6×6', 300, 300, null, false],
    ]);
    expect(p.settingsLib.map((g) => [g.name, g.fav])).toEqual([
      ['名稱＋粗線', false],
      ['跳線＋格線', true],
    ]);
    expect(p.settingsLib[0].values).toMatchObject({
      showRelName: true,
      defLineW: 4,
      bridgeMode: false,
      spacingPct: 130,
    });
    expect(p.settingsLib[1].values).toMatchObject({ bridgeMode: true, bgMode: 'grid' });
    /* 原作的設定集沒有畫布配色：不放＝套用時不動 */
    expect('palette' in p.settingsLib[0].values).toBe(false);
  });

  it('加入為新分頁：便利貼、沿用、便利貼庫、設定集的 id 都換成專案的，沿用跟著換', () => {
    load(fixture('relation-chart-b4-notes-lore.json'));
    const p = load(fixture('relation-chart-b4-notes-lore.json'), 'append');
    expect(p.sheets).toHaveLength(6);
    const ids = p.sheets.flatMap((s) => s.notes.map((n) => n.id));
    expect(new Set(ids).size).toBe(14);
    expect(p.sheets[5].loreFrom).toBe(p.sheets[4].id);
    expect(p.noteBin).toHaveLength(4);
    expect(new Set(p.settingsLib.map((g) => g.id)).size).toBe(4);
  });

  it('舊檔：混在 chars 裡的 sticky 角色搬成便利貼（不當角色）', () => {
    const conv = convertLegacy({
      format: 6,
      sheets: [
        {
          id: 1,
          chars: [
            { id: 1, name: '甲', x: 100, y: 100 },
            { id: 9, sticky: true, name: '舊便利貼', x: 300, y: 300, noteW: 150, noteH: 150 },
          ],
          rels: [],
        },
      ],
    });
    expect(conv.sheets[0].chars.map((c) => c.name)).toEqual(['甲']);
    expect(conv.sheets[0].notes.map((n) => [n.id, n.text, n.w])).toEqual([[9, '舊便利貼', 150]]);
  });
});

describe('統計與尋路（和原作算出來的相同；b45-lod-stats）', () => {
  const p = (() => {
    useProject.getState().replace(initialProject());
    return load(fixture('relation-chart-b4-lod-stats.json'));
  })();
  const s = p.sheets[0];
  const name = (id: number) => displayName(s.chars.find((c) => c.id === id) as Sheet['chars'][0]);
  const byName = (n: string) => (s.chars.find((c) => c.name === n) as Sheet['chars'][0]).id;
  const edges = statEdges(s, p.labels);
  const deg = degrees(s, edges);

  it('中心度前 10（度數＝端點數；隱藏的關係類型、自我關係不算）', () => {
    expect(ranking(s, deg).map((r) => `${name(r.id)}:${r.n}`)).toEqual([
      '村民28:8',
      '村民47:8',
      '村民46:7',
      '村民17:6',
      '村民21:6',
      '村民38:6',
      '村民40:6',
      '國王:5',
      '村民12:5',
      '村民33:5',
    ]);
  });

  it('孤立角色 23 位（清單順序）', () => {
    const iso = isolated(s, deg);
    expect(iso).toHaveLength(23);
    expect(iso.slice(0, 5).map(name)).toEqual(['魔法師', '商人', '吟遊詩人', '村民51', '村民52']);
  });

  it('最短關係鏈：公主 → 村民11 是 12 步（不經過隱藏的「秘密」）', () => {
    const r = shortestChain(s, edges, byName('公主'), byName('村民11'));
    expect(r?.chars.map(name)).toEqual([
      '公主',
      '王子',
      '村民1',
      '村民2',
      '村民3',
      '村民4',
      '村民5',
      '村民6',
      '村民7',
      '村民8',
      '村民9',
      '村民10',
      '村民11',
    ]);
    expect(r?.rels).toHaveLength(12);
    expect(shortestChain(s, edges, byName('公主'), byName('魔法師'))).toBeNull();
  });

  it('N 度聚焦：國王 2 度以內＝8 人、8 條線', () => {
    const r = nDegree(s, edges, byName('國王'), 2);
    expect(r.nodes.map(name).sort()).toEqual(
      ['國王', '王后', '王子', '騎士長', '宰相', '刺客', '公主', '村民1'].sort(),
    );
    expect(r.edges).toHaveLength(8);
  });

  it('遠近簡化：80 位＝密度閘成立；拉遠的大名字只留前 20（重要度高、同級編號小）', () => {
    const ctx = sheetCtx(s, p.labels);
    expect(lodDense(ctx)).toBe(true);
    const svg = editorSvg(s, { href: () => null, font: p.font, labels: p.labels, lod: true }).svg;
    expect(svg.match(/class="lod-dot"/g)).toHaveLength(80);
    const far = [...svg.matchAll(/<g class="lod-farname"><text[^>]*>([^<]*)<\/text>/g)].map(
      (m) => m[1],
    );
    expect(new Set(far)).toEqual(
      new Set([
        '國王',
        '王后',
        '王子',
        '公主',
        '騎士長',
        '宰相',
        '魔法師',
        '商人',
        '刺客',
        '吟遊詩人',
        '村民1',
        '村民2',
        '村民3',
        '村民4',
        '村民5',
        '村民6',
        '村民7',
        '村民8',
        '村民9',
        '村民10',
      ]),
    );
    /* 近＝沒有標記（輸出和以前相同）；匯出永遠不標 */
    expect(editorSvg(s, { href: () => null, font: p.font, labels: p.labels }).svg).not.toContain(
      'lod-',
    );
  });
});

describe('遠近簡化：三檔與遲滯、標記（原作 view1 的 80 位情境）', () => {
  it('三檔：≥ 1＝近、0.5～1＝中、< 0.5＝遠；換檔要多跨 0.03（原作實測的序列）', () => {
    const seq = [1, 0.98, 0.96, 0.9, 0.6, 0.5, 0.48, 0.46, 0.4, 0.5, 0.52, 0.54, 0.9, 1.02, 1.04];
    let lv: 'near' | 'mid' | 'far' = 'mid';
    const out = seq.map((s) => {
      lv = nextLod(lv, s);
      return lv;
    });
    expect(out).toEqual([
      'mid',
      'mid',
      'mid',
      'mid',
      'mid',
      'mid',
      'mid',
      'far',
      'far',
      'far',
      'far',
      'mid',
      'mid',
      'mid',
      'near',
    ]);
    expect(nextLod('near', 0.98)).toBe('near');
    expect(nextLod('near', 0.96)).toBe('mid');
    expect(nextLod('near', 0.3)).toBe('far');
    expect(nextLod('far', 1.2)).toBe('near');
  });

  it('大畫布也縮得到「遠」：最小倍率＝min(10%, 符合畫面的 1/10)（原作的下限是相對於符合畫面的 0.1）', () => {
    const el = document.createElement('div');
    el.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 1024, height: 824, right: 1024, bottom: 824 }) as DOMRect;
    bindView({ el, content: () => ({ viewW: 10000, viewH: 8000, pad: 0 }) });
    fitView();
    const fit = useUi.getState().view.zoom;
    expect(fit).toBeCloseTo(0.1, 5);
    expect(lodScale(fit, 1024, 824)).toBeCloseTo(1, 5);
    for (let i = 0; i < 6; i++) zoomBy(1 / 1.25);
    const z = useUi.getState().view.zoom;
    expect(z).toBeCloseTo(fit * 0.8 ** 6, 6);
    expect(lodScale(z, 1024, 824)).toBeLessThan(0.47);
    for (let i = 0; i < 30; i++) zoomBy(1 / 1.25);
    expect(useUi.getState().view.zoom).toBeCloseTo(fit * 0.1, 6);
    /* 一般大小的畫布：下限照舊 10% */
    bindView({ el, content: () => ({ viewW: 1000, viewH: 800, pad: 0 }) });
    for (let i = 0; i < 30; i++) zoomBy(1 / 1.25);
    expect(useUi.getState().view.zoom).toBeCloseTo(0.1, 6);
    bindView(null);
  });

  function view1(): Sheet {
    const s = buildSample('story');
    s.id = 1;
    s.defNo = 1;
    for (let i = 0; i < 74; i++)
      s.chars.push(
        makeChar(1000 + i, `路人${i}`, 100 + (i % 10) * 90, 100 + Math.floor(i / 10) * 90, {
          defNo: 100 + i,
          level: i < 25 ? i % 4 : 0,
        }),
      );
    return (
      normalizeProject({
        sheets: [s],
        active: 0,
        labels: [],
        nextId: 5000,
        font: 'sans',
      }) as Project
    ).sheets[0];
  }

  it('80 位：80 個圓點、19 個大名字、61 個次要名字、4 條單向線（和原作相同）；大名字與圓點的畫法', () => {
    const s = view1();
    const svg = editorSvg(s, { href: () => null, font: 'sans', lod: true }).svg;
    expect(svg.match(/class="lod-dot"/g)).toHaveLength(80);
    expect(svg.match(/class="lod-farname"/g)).toHaveLength(19);
    expect(svg.match(/lod-minorname/g)).toHaveLength(61);
    expect(svg.match(/class="edge[^"]* lod-minor"/g)).toHaveLength(4);
    expect(svg).toMatch(
      /<g class="lod-farname"><text x="[\d.]+" y="[\d.]+" text-anchor="middle" font-size="64" font-weight="900" fill="#ffffff" paint-order="stroke" stroke="#121212" stroke-width="12" stroke-linejoin="round">主角<\/text><\/g>/,
    );
    expect(svg).toMatch(
      /<g class="lod-dot"><circle cx="[\d.]+" cy="[\d.]+" r="25.3" fill="#ffffff"\/><\/g>/,
    );
  });

  it('不到 60 位：怎麼拉都不標；互動網頁照樣只標密的分頁', () => {
    const s = buildSample('story');
    expect(editorSvg(s, { href: () => null, font: 'sans', lod: true }).svg).not.toContain('lod-');
    expect(viewerSvg(view1(), { href: () => null, font: 'sans', lod: true })).toContain('lod-dot');
  });
});

describe('設定集', () => {
  function seed() {
    const s = emptySheet(1, 1, { W: 1000, H: 800 });
    for (let i = 0; i < 6; i++)
      s.chars.push(makeChar(i + 1, `角${i}`, 100 + i * 50, 100, { defNo: i + 1 }));
    useProject.getState().replace(
      normalizeProject({
        sheets: [s],
        active: 0,
        labels: [],
        nextId: 100,
        font: 'sans',
      }) as Project,
    );
    useProject.temporal.getState().clear();
  }
  const data = () => useProject.getState().data;
  beforeEach(seed);

  it('涵蓋原作的 43 個鍵＋畫布配色；存成新的一筆＝「未命名設定集 N」並選取', () => {
    expect(PRESET_KEYS).toHaveLength(44);
    const id = savePreset();
    expect(data().settingsLib[0]).toMatchObject({ id, name: '未命名設定集1', fav: false });
    expect(Object.keys(data().settingsLib[0].values)).toHaveLength(44);
    savePreset();
    expect(data().settingsLib.map((g) => g.name)).toEqual(['未命名設定集1', '未命名設定集2']);
    expect(
      nextPresetName([{ id: 1, name: '未命名設定集 7', fav: false, values: {} }], '未命名設定集'),
    ).toBe('未命名設定集8');
  });

  it('套用：值複製到目前分頁；間距不同時依目前陣型重排；覆寫＝用目前的值蓋掉；都一步復原', () => {
    updateProject((p) => {
      p.sheets[0].settings.spacingPct = 150;
      p.sheets[0].settings.showRelName = true;
      p.sheets[0].settings.palette = 'light';
    });
    const id = savePreset();
    factoryReset();
    expect(data().sheets[0].settings).toMatchObject({
      spacingPct: 100,
      showRelName: false,
      bridgeMode: false,
      palette: 'dark',
    });
    const before = data().sheets[0].chars.map((c) => [c.x, c.y]);
    applyPreset(id);
    expect(data().sheets[0].settings).toMatchObject({
      spacingPct: 150,
      showRelName: true,
      palette: 'light',
    });
    /* 間距變了：重排（位置變了） */
    expect(data().sheets[0].chars.map((c) => [c.x, c.y])).not.toEqual(before);
    useProject.temporal.getState().undo();
    expect(data().sheets[0].settings.spacingPct).toBe(100);
    updateProject((p) => {
      p.sheets[0].settings.gridStep = 80;
    });
    overwritePreset(id);
    expect(data().settingsLib[0].values.gridStep).toBe(80);
  });

  it('恢復出廠預設＝新分頁的預設（關係名稱、備註、跳線都是關；原作會打開）', () => {
    updateProject((p) => {
      p.sheets[0].settings.showRelNote = true;
      p.sheets[0].settings.bridgeMode = true;
      p.sheets[0].settings.defNameSize = 30;
    });
    factoryReset();
    for (const k of PRESET_KEYS)
      expect(data().sheets[0].settings[k], k).toEqual(SETTINGS_DEFAULTS[k]);
  });

  it('最愛排最前面、不能刪；拖曳排序照畫面上的順序', () => {
    const a = savePreset();
    const b = savePreset();
    const c = savePreset();
    toggleFavPreset(c);
    expect(sortedPresets(data().settingsLib).map((g) => g.id)).toEqual([c, a, b]);
    expect(deletePreset(c)).toBe(false);
    expect(deletePreset(a)).toBe(true);
    expect(data().settingsLib.map((g) => g.id)).toEqual([b, c]);
    reorderPresets([c, b], 1, 0);
    expect(data().settingsLib.map((g) => g.id)).toEqual([b, c]);
  });
});

describe('資料版本 3 → 4、複製與刪除分頁、資產回收', () => {
  it('版本 3 的資料：補上便利貼、世界觀、備忘錄、便利貼庫、設定集的預設', () => {
    const p = normalizeProject({
      sheets: [{ id: 1, name: '', W: 500, H: 500, chars: [], rels: [], types: [], settings: {} }],
      active: 0,
      labels: [],
      nextId: 2,
      font: 'sans',
    }) as Project;
    expect(p.sheets[0]).toMatchObject({ notes: [], lore: '', loreFrom: null, memo: '' });
    expect(p.sheets[0].settings.defStickySize).toBe(0);
    expect(p).toMatchObject({ noteBin: [], settingsLib: [] });
  });

  it('沿用指到不存在的分頁或自己＝丟掉', () => {
    const p = normalizeProject({
      sheets: [
        { id: 1, chars: [], rels: [], types: [], loreFrom: 1 },
        { id: 2, chars: [], rels: [], types: [], loreFrom: 99 },
        { id: 3, chars: [], rels: [], types: [], loreFrom: 1, lore: '' },
      ],
      active: 0,
      labels: [],
      nextId: 10,
      font: 'sans',
    }) as Project;
    expect(p.sheets.map((s) => s.loreFrom)).toEqual([null, null, 1]);
  });

  it('複製分頁：便利貼（新 id、圖表節點的 A 換成新角色）、世界觀、沿用、備忘錄一起複製；刪掉來源分頁＝顯示自己的', () => {
    const s = emptySheet(1, 1);
    s.chars.push(makeChar(5, '甲', 100, 100, { defNo: 1 }));
    s.notes.push({
      id: 7,
      text: '便條',
      x: 10,
      y: 10,
      w: 200,
      h: 200,
      size: null,
      locked: false,
      bare: false,
      chart: { tpl: 1, a: 5, b: 0, stA: 0, stB: 0, legend: true },
    });
    s.lore = '<p>世界</p>';
    s.memo = '筆記';
    useProject.getState().replace(
      normalizeProject({
        sheets: [s],
        active: 0,
        labels: [],
        nextId: 100,
        font: 'sans',
      }) as Project,
    );
    addSheet('same');
    const [a, b] = useProject.getState().data.sheets;
    expect(b.notes[0].id).not.toBe(a.notes[0].id);
    expect(b.notes[0].chart?.a).toBe(b.chars[0].id);
    expect([b.lore, b.memo]).toEqual(['<p>世界</p>', '筆記']);
    updateProject((p) => {
      p.sheets[1].loreFrom = p.sheets[0].id;
      p.sheets[1].lore = '<p>自己的</p>';
    });
    deleteSheet(0);
    const left = useProject.getState().data.sheets;
    expect(loreOf(left, left[0])).toMatchObject({ html: '<p>自己的</p>', gone: true });
  });

  it('資產回收的保留集合：世界觀裡的圖、設定集的預設頭像框', () => {
    const p = normalizeProject({
      sheets: [
        { id: 1, chars: [], rels: [], types: [], lore: `<img src="rcimg:${'a'.repeat(64)}">` },
      ],
      settingsLib: [{ id: 5, name: 'x', values: { defFrame: 'b'.repeat(64) } }],
      active: 0,
      labels: [],
      nextId: 10,
      font: 'sans',
    }) as Project;
    expect(projectAssetIds(p)).toEqual(expect.arrayContaining(['a'.repeat(64), 'b'.repeat(64)]));
  });
});
