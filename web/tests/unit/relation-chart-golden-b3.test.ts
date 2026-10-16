/**
 * @vitest-environment jsdom
 */
/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見 web/src/tools/relation-chart/UPSTREAM_LICENSE。
 *
 * 角色關係圖產生器：沒用到第四批（畫布、檢視與分享）的功能時，第三批（角色與關係的資料）的輸出逐位元組不變。
 *
 * 做法同 relation-chart-golden-b2.test.ts：加第四批之前，先用當時的程式把下面的資料畫一次，記下每種輸出的 SHA-256
 * （`fixtures/relation-chart-v3-golden.json`）。之後用新程式讀同一份資料（經過整理與 migrate）再畫，必須完全相同。
 * - 第三批和原作對照用的兩組（`fixtures/relation-chart-b3-library.zip`、`relation-chart-b3-assets.json`），經過讀原作專案檔的轉換；
 * - 自己產生的一份：變體、統一顏色、頭像框（變體指定、跟隨標籤、分頁預設、不使用）、匯入字型（文件字型與角色字型）、
 *   看法、角色資訊（含圖片）、數值（兩份範本、多狀態）、方形頭像、淺色。
 * 每張分頁的輸出：編輯畫面（沒有選取、選取兩位、點擊聚焦時的看法氣泡）、PNG 用的 SVG（不去背、去背；含內嵌字型）、
 * 互動網頁的 SVG、分層 SVG、互動網頁 HTML（檢視程式、第三批的程式與畫圖程式換成固定字串）。
 *
 * 重新產生基準（只在加第四批之前的程式上做過一次）：`RC_GOLDEN=write npx vitest run tests/unit/relation-chart-golden-b3.test.ts`
 */
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { bytesToHex, sha256Sync } from '../../src/core/files';
import { editorSvg, exportSvg, viewerSvg } from '../../src/tools/relation-chart/engine/chart';
import { rcCharts } from '../../src/tools/relation-chart/engine/charts';
import { fontFaceCss, usedFontIds } from '../../src/tools/relation-chart/export/fonts';
import { sheetLayeredSvg } from '../../src/tools/relation-chart/export/outputs';
import {
  stripLod,
  viewerExtSource,
  viewerHtml,
  viewerSource,
} from '../../src/tools/relation-chart/export/viewer';
import { convertLegacy } from '../../src/tools/relation-chart/logic/legacy';
import {
  makeChar,
  makeLabel,
  makeRel,
  makeType,
} from '../../src/tools/relation-chart/model/factory';
import {
  emptySheet,
  initialProject,
  normalizeProject,
} from '../../src/tools/relation-chart/model/normalize';
import type { Project } from '../../src/tools/relation-chart/model/types';
import { applyLegacy, remapLegacyRefs } from '../../src/tools/relation-chart/state/project';
import { useProject } from '../../src/tools/relation-chart/state/store';

const FS = 'node:fs';
const { readFileSync, writeFileSync } = (await import(/* @vite-ignore */ FS)) as {
  readFileSync: (p: string, enc?: 'utf8') => string & Uint8Array;
  writeFileSync: (p: string, data: string) => void;
};
const DIR = `${(globalThis as { process?: { cwd: () => string } }).process?.cwd()}/tests/unit/fixtures/`;
const GOLDEN = `${DIR}relation-chart-v3-golden.json`;
const WRITE =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
    .RC_GOLDEN === 'write';

const sha = (s: string) => bytesToHex(sha256Sync(new TextEncoder().encode(s))).slice(0, 24);

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FR_A = 'fa'.repeat(32);
const FR_B = 'fb'.repeat(32);
const FR_C = 'fc'.repeat(32);
const FONT_A = 'f0'.repeat(32);
const FONT_B = 'f1'.repeat(32);
const IMG = 'a1'.repeat(32);
/** 假的檔案內容（只要穩定） */
const URIS = new Map<string, string>([
  [FR_A, 'data:image/png;base64,RlJB'],
  [FR_B, 'data:image/png;base64,RlJC'],
  [FR_C, 'data:image/png;base64,RlJD'],
  [FONT_A, 'data:font/ttf;base64,Rk9OVEE='],
  [FONT_B, 'data:font/woff2;base64,Rk9OVEI='],
  [IMG, 'data:image/png;base64,SU1H'],
]);

/** 自己產生：第三批的各種組合 */
function generated(): Project {
  const labels = [
    makeLabel(901, '王國', { zone: true, color: '#e74c3c', frame: FR_B }),
    makeLabel(902, '商會', { color: '#2ecc71' }),
  ];
  const make = (seed: number, n: number, W: number, H: number) => {
    const r = rng(seed);
    const s = emptySheet(seed, 1, { W, H });
    s.name = `第三批${seed}`;
    for (let i = 0; i < 3; i++)
      s.types.push(makeType(100 + i, `類型${i}`, { color: i % 2 ? '#58b368' : 'auto' }));
    for (let i = 0; i < n; i++)
      s.chars.push(
        makeChar(i + 1, `角色${i + 1}`, 120 + r() * (W - 240), 120 + r() * (H - 240), {
          defNo: i + 1,
          labels: i % 3 === 0 ? [901] : i % 4 === 1 ? [902] : [],
          shape: i % 5 === 0 ? 'square' : '',
          font: i % 4 === 2 ? `f:${FONT_B}` : i % 7 === 3 ? 'kai' : '',
          frame: i % 6 === 1 ? FR_A : i % 6 === 4 ? '' : null,
          icon: i % 3 === 2 ? 'star' : null,
          level: i % 5,
        }),
      );
    let id = 500;
    for (let i = 0; i < n * 1.2; i++) {
      const a = 1 + Math.floor(r() * n);
      const b = 1 + Math.floor(r() * n);
      if (a === b) continue;
      s.rels.push(makeRel(id++, a, b, 100 + Math.floor(r() * 3), { both: r() < 0.3 }));
    }
    return s;
  };
  const a = make(41, 18, 1400, 1000);
  a.settings.defFrame = FR_C;
  a.views = { 1: { 2: '可靠的夥伴', 3: '<不信任>' }, 2: { 1: '恩人' }, 5: { 1: '……' } };
  const b = make(43, 12, 1200, 900);
  b.settings.palette = 'light';
  b.settings.shapeSquare = true;
  b.views = { 3: { 4: '情敵' } };
  const raw = {
    sheets: [a, b],
    labels,
    active: 0,
    nextId: 100000,
    font: `f:${FONT_A}`,
    frames: [
      { id: FR_A, name: '金框' },
      { id: FR_B, name: '王國框' },
      { id: FR_C, name: '預設框' },
    ],
    fonts: [
      { id: FONT_A, name: '文件字型', fmt: 'ttf' },
      { id: FONT_B, name: '角色字型', fmt: 'woff2' },
    ],
    radarTpls: [
      {
        id: 90001,
        name: '能力值',
        chart: 'radar',
        shape: 'poly',
        rings: 4,
        valMode: 'raw',
        shared: false,
        axes: [
          { id: 90011, label: '力', max: 100, unit: '' },
          { id: 90012, label: '速', max: 100, unit: '' },
          { id: 90013, label: '智', max: 50, unit: '點' },
        ],
      },
      {
        id: 90002,
        name: '好感',
        chart: 'bar',
        shape: 'poly',
        rings: 3,
        valMode: 'pct',
        shared: true,
        axes: [
          { id: 90021, label: '甲', max: 10, unit: '' },
          { id: 90022, label: '乙', max: 10, unit: '' },
          { id: 90023, label: '丙', max: 10, unit: '' },
        ],
      },
    ],
  };
  const p = normalizeProject(raw) as Project;
  /* 條目層：角色資訊、統一顏色；變體層：第二件變體、數值 */
  const e1 = p.library.find((e) => e.id === p.sheets[0].chars[0].lib);
  if (e1) {
    e1.info = `<h2>背景</h2><p><b>主角</b>的故事。</p><img src="rcimg:${IMG}">`;
    e1.variants[0].radars.push(
      { tpl: 90001, state: '', vals: { 90011: 80, 90012: 40, 90013: 30 } },
      { tpl: 90002, state: '平常', vals: { 90021: 7 } },
      { tpl: 90002, state: '戰鬥', vals: { 90021: 3, 90022: 9 } },
    );
    e1.variants.push({ ...JSON.parse(JSON.stringify(e1.variants[0])), id: 99001, name: '冬裝' });
  }
  const e2 = p.library.find((e) => e.id === p.sheets[0].chars[1].lib);
  if (e2) {
    e2.unified = true;
    e2.variants[0].color = '#d35400';
    e2.variants[0].radars.push({ tpl: 90001, state: '', vals: { 90011: 20 } });
  }
  return normalizeProject(JSON.parse(JSON.stringify(p))) as Project;
}

/** 讀原作的檔 → 換參照 → 加進一份空專案（取代） */
function legacy(data: Record<string, unknown>): Project {
  const conv = convertLegacy(data);
  /* 第四批起讀得進便利貼（b3-assets 的圖表節點）：比對「沒用到第四批的功能」時拿掉 */
  for (const s of conv.sheets) s.notes = [];
  const refs = remapLegacyRefs(conv, new Map(), new Map(), new Map());
  useProject.getState().replace(initialProject());
  applyLegacy(conv, 'replace', refs.font, [], []);
  return JSON.parse(JSON.stringify(useProject.getState().data)) as Project;
}

const fromZip = (name: string) => {
  const files = unzipSync(readFileSync(`${DIR}${name}`) as Uint8Array);
  const path = Object.keys(files).find((k) => k.endsWith('project.json')) as string;
  return JSON.parse(strFromU8(files[path])) as Record<string, unknown>;
};

interface Dataset {
  name: string;
  raw: Project;
}

function datasets(): Dataset[] {
  return [
    { name: 'b3:library', raw: legacy(fromZip('relation-chart-b3-library.zip')) },
    {
      name: 'b3:assets',
      raw: legacy(
        JSON.parse(readFileSync(`${DIR}relation-chart-b3-assets.json`, 'utf8')) as Record<
          string,
          unknown
        >,
      ),
    },
    { name: 'generated', raw: generated() },
  ];
}

function capture(d: Dataset): Record<string, string> {
  const p = normalizeProject(JSON.parse(JSON.stringify(d.raw)));
  if (!p) throw new Error(`normalize failed: ${d.name}`);
  const out: Record<string, string> = {};
  const href = (id: string) => URIS.get(id) ?? null;
  const input = {
    font: p.font,
    labels: p.labels,
    uris: URIS,
    library: p.library,
    radarTpls: p.radarTpls,
    fonts: p.fonts,
    frames: p.frames,
  };
  p.sheets.forEach((s, i) => {
    const k = `${i}`;
    const opts = { href, font: p.font, labels: p.labels, fonts: p.fonts, frames: p.frames };
    out[`${k}:edit`] = sha(editorSvg(s, opts).svg);
    out[`${k}:edit-sel`] = sha(
      editorSvg(s, {
        ...opts,
        ui: { selected: new Set(s.chars.slice(0, 2).map((c) => c.id)), linkFrom: null },
      }).svg,
    );
    const target = s.chars[0];
    const bubbles = new Map<number, string>();
    if (target)
      for (const [a, row] of Object.entries(s.views))
        if (row[target.id] && Number(a) !== target.id) bubbles.set(Number(a), row[target.id]);
    out[`${k}:edit-bubble`] = sha(editorSvg(s, { ...opts, ui: { bubbles } }).svg);
    const faces = usedFontIds([s], input);
    const faceCss = faces.length ? fontFaceCss(faces, URIS) : undefined;
    out[`${k}:png`] = sha(exportSvg(s, { ...opts, transparent: false, fontFaceCss: faceCss }));
    out[`${k}:png-t`] = sha(exportSvg(s, { ...opts, transparent: true, fontFaceCss: faceCss }));
    out[`${k}:viewer-svg`] = sha(viewerSvg(s, opts));
    out[`${k}:layered`] = sha(sheetLayeredSvg(s, { ...input, sheets: [s], transparent: false }));
  });
  out.html = sha(
    stripLod(
      viewerHtml(p.sheets, input)
        .replace(viewerSource(), '/*rcViewer*/')
        .replace(viewerExtSource(), '/*rcViewerExt*/')
        .replace(rcCharts.toString(), '/*rcCharts*/'),
    ),
  );
  return out;
}

describe('沒用到第四批的功能時，第三批的輸出不變（角色與關係的資料）', () => {
  const all = datasets();
  if (WRITE) {
    it('寫入基準', () => {
      const golden = Object.fromEntries(all.map((d) => [d.name, capture(d)]));
      writeFileSync(GOLDEN, `${JSON.stringify(golden, null, 1)}\n`);
    });
    return;
  }
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Record<string, Record<string, string>>;
  it('自己產生的資料真的用到第三批的畫法', () => {
    const g = all.find((d) => d.name === 'generated') as Dataset;
    const p = normalizeProject(JSON.parse(JSON.stringify(g.raw))) as Project;
    const href = (id: string) => URIS.get(id) ?? null;
    const svg = p.sheets
      .map(
        (s) =>
          editorSvg(s, {
            href,
            font: p.font,
            labels: p.labels,
            fonts: p.fonts,
            frames: p.frames,
            ui: { bubbles: new Map([[s.chars[1].id, '測試']]) },
          }).svg,
      )
      .join('');
    for (const mark of ['node-frame', 'view-bubble', 'crf-', 'font-family:'])
      expect(svg, mark).toContain(mark);
    const html = viewerHtml(p.sheets, {
      font: p.font,
      labels: p.labels,
      uris: URIS,
      library: p.library,
      radarTpls: p.radarTpls,
      fonts: p.fonts,
      frames: p.frames,
    });
    for (const mark of ['id="loreV"', 'radarDocV', '@font-face', '"views":'])
      expect(html, mark).toContain(mark);
    expect(p.library.some((e) => e.variants.length > 1)).toBe(true);
  });
  for (const d of all)
    it(d.name, () => {
      expect(Object.keys(golden)).toContain(d.name);
      expect(capture(d)).toEqual(golden[d.name]);
    });
});
