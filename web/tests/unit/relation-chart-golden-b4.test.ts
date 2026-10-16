/**
 * @vitest-environment jsdom
 */
/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見 web/src/tools/relation-chart/UPSTREAM_LICENSE。
 *
 * 角色關係圖產生器：沒用到第五批（版本與動畫）的功能時，第四批（畫布、檢視與分享）的輸出逐位元組不變。
 *
 * 做法同第二、三批的 golden：加第五批之前，先用當時的程式把下面的資料畫一次，記下每種輸出的 SHA-256
 * （`fixtures/relation-chart-v4-golden.json`）。之後用新程式讀同一份資料（經過整理與 migrate）再畫，必須完全相同。
 * - 第四批和原作對照用的兩組（`fixtures/relation-chart-b4-notes-lore.json`：便利貼、世界觀、沿用、備忘錄；
 *   `relation-chart-b4-lod-stats.json`：80 位、遠近簡化），經過讀原作專案檔的轉換；
 * - 自己產生的一份：便利貼（一般、隱藏紙面、釘選、畫布外、指定字級）、圖表節點、世界觀（含圖片、沿用）、淺色。
 * 每張分頁的輸出：編輯畫面（遠近簡化的標記開著）、PNG 用的 SVG、互動網頁的 SVG、分層 SVG；
 * 互動網頁 HTML（一般、嵌入模式；檢視程式、第三批的程式、數值窗格與畫圖程式換成固定字串）。
 *
 * 重新產生基準（只在加第五批之前的程式上做過一次）：`RC_GOLDEN=write npx vitest run tests/unit/relation-chart-golden-b4.test.ts`
 */
import { describe, expect, it } from 'vitest';
import { bytesToHex, sha256Sync } from '../../src/core/files';
import { editorSvg, exportSvg, viewerSvg } from '../../src/tools/relation-chart/engine/chart';
import { rcCharts } from '../../src/tools/relation-chart/engine/charts';
import { sheetLayeredSvg } from '../../src/tools/relation-chart/export/outputs';
import {
  viewerExtSource,
  viewerHtml,
  viewerSource,
} from '../../src/tools/relation-chart/export/viewer';
import { rcViewerRadar } from '../../src/tools/relation-chart/export/viewerExt';
import { convertLegacy } from '../../src/tools/relation-chart/logic/legacy';
import { makeChar, makeRel, makeType } from '../../src/tools/relation-chart/model/factory';
import {
  emptySheet,
  initialProject,
  normalizeProject,
} from '../../src/tools/relation-chart/model/normalize';
import type { Note, Project } from '../../src/tools/relation-chart/model/types';
import { applyLegacy, remapLegacyRefs } from '../../src/tools/relation-chart/state/project';
import { useProject } from '../../src/tools/relation-chart/state/store';

const FS = 'node:fs';
const { readFileSync, writeFileSync } = (await import(/* @vite-ignore */ FS)) as {
  readFileSync: (p: string, enc: string) => string;
  writeFileSync: (p: string, data: string) => void;
};
const DIR = `${(globalThis as { process?: { cwd: () => string } }).process?.cwd()}/tests/unit/fixtures/`;
const GOLDEN = `${DIR}relation-chart-v4-golden.json`;
const WRITE =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
    .RC_GOLDEN === 'write';

const sha = (s: string) => bytesToHex(sha256Sync(new TextEncoder().encode(s))).slice(0, 24);

const IMG = 'a1'.repeat(32);
const URIS = new Map<string, string>([[IMG, 'data:image/png;base64,SU1H']]);

const note = (id: number, o: Partial<Note>): Note => ({
  id,
  text: '',
  x: 300,
  y: 300,
  w: 200,
  h: 200,
  size: null,
  locked: false,
  bare: false,
  chart: null,
  ...o,
});

/** 自己產生：第四批的各種組合 */
function generated(): Project {
  const make = (seed: number, n: number) => {
    const s = emptySheet(seed, 1, { W: 1200, H: 900 });
    s.name = `第四批${seed}`;
    s.types.push(makeType(100, '友情'), makeType(101, '敵對', { lineStyle: 'dashed' }));
    for (let i = 0; i < n; i++)
      s.chars.push(
        makeChar(i + 1, `角色${i + 1}`, 150 + (i % 5) * 200, 150 + Math.floor(i / 5) * 180, {
          defNo: i + 1,
          level: i % 4,
          icon: i % 3 === 0 ? 'star' : null,
        }),
      );
    for (let i = 1; i < n; i++) s.rels.push(makeRel(500 + i, i, i + 1, 100 + (i % 2)));
    return s;
  };
  const a = make(51, 12);
  a.notes.push(
    note(801, { text: '第一行\n第二行比較長一點的文字，看看自動字級', x: 900, y: 200 }),
    note(802, { text: '標題', bare: true, size: 30, x: 600, y: 80, w: 300, h: 100 }),
    note(803, { text: '釘選', locked: true, x: 200, y: 750, w: 150, h: 150 }),
    note(804, { text: '畫布外的旁註', x: 1350, y: 400 }),
    note(805, {
      text: '能力比較',
      x: 600,
      y: 600,
      w: 400,
      h: 400,
      chart: { tpl: 90001, a: 1, b: 2, stA: 0, stB: 0, legend: true },
    }),
  );
  a.lore = `<h2>王國</h2><p><b>北境</b>的故事。</p><img src="rcimg:${IMG}">`;
  a.memo = '只給自己看';
  a.settings.defStickySize = 18;
  const b = make(53, 8);
  b.settings.palette = 'light';
  b.loreFrom = a.id;
  b.notes.push(note(811, { text: '淺色的便利貼', x: 300, y: 600 }));
  const raw = {
    sheets: [a, b],
    labels: [],
    active: 0,
    nextId: 100000,
    font: 'sans',
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
          { id: 90013, label: '智', max: 100, unit: '' },
        ],
      },
    ],
  };
  const p = normalizeProject(raw) as Project;
  const e1 = p.library.find((e) => e.id === p.sheets[0].chars[0].lib);
  const e2 = p.library.find((e) => e.id === p.sheets[0].chars[1].lib);
  e1?.variants[0].radars.push({ tpl: 90001, state: '', vals: { 90011: 80, 90012: 40, 90013: 60 } });
  e2?.variants[0].radars.push({ tpl: 90001, state: '', vals: { 90011: 30, 90012: 90, 90013: 50 } });
  return normalizeProject(JSON.parse(JSON.stringify(p))) as Project;
}

/** 讀原作的檔 → 換參照 → 加進一份空專案（取代） */
function legacy(data: Record<string, unknown>): Project {
  const conv = convertLegacy(data);
  const refs = remapLegacyRefs(conv, new Map(), new Map(), new Map());
  useProject.getState().replace(initialProject());
  applyLegacy(conv, 'replace', refs.font, [], []);
  return JSON.parse(JSON.stringify(useProject.getState().data)) as Project;
}

interface Dataset {
  name: string;
  raw: Project;
}

function datasets(): Dataset[] {
  const fixture = (name: string) =>
    JSON.parse(readFileSync(`${DIR}${name}`, 'utf8')) as Record<string, unknown>;
  return [
    { name: 'b4:notes-lore', raw: legacy(fixture('relation-chart-b4-notes-lore.json')) },
    { name: 'b4:lod-stats', raw: legacy(fixture('relation-chart-b4-lod-stats.json')) },
    { name: 'generated', raw: generated() },
  ];
}

const mask = (html: string) =>
  html
    .replace(viewerSource(), '/*rcViewer*/')
    .replace(viewerExtSource(), '/*rcViewerExt*/')
    .replace(rcViewerRadar.toString(), '/*rcViewerRadar*/')
    .replace(rcCharts.toString(), '/*rcCharts*/');

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
    allSheets: p.sheets,
  };
  p.sheets.forEach((s, i) => {
    const k = `${i}`;
    const opts = {
      href,
      font: p.font,
      labels: p.labels,
      fonts: p.fonts,
      frames: p.frames,
      radarTpls: p.radarTpls,
      library: p.library,
    };
    out[`${k}:edit`] = sha(editorSvg(s, { ...opts, lod: true }).svg);
    out[`${k}:png`] = sha(exportSvg(s, { ...opts, transparent: false }));
    out[`${k}:png-t`] = sha(exportSvg(s, { ...opts, transparent: true }));
    out[`${k}:viewer-svg`] = sha(viewerSvg(s, { ...opts, lod: true }));
    out[`${k}:layered`] = sha(sheetLayeredSvg(s, { ...input, sheets: [s], transparent: false }));
  });
  out.html = sha(mask(viewerHtml(p.sheets, input)));
  out['html-embed'] = sha(mask(viewerHtml(p.sheets, input, { embed: true })));
  return out;
}

describe('沒用到第五批的功能時，第四批的輸出不變（畫布、檢視與分享）', () => {
  const all = datasets();
  if (WRITE) {
    it('寫入基準', () => {
      const golden = Object.fromEntries(all.map((d) => [d.name, capture(d)]));
      writeFileSync(GOLDEN, `${JSON.stringify(golden, null, 1)}\n`);
    });
    return;
  }
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Record<string, Record<string, string>>;
  it('資料真的用到第四批的畫法', () => {
    const g = all.find((d) => d.name === 'generated') as Dataset;
    const p = normalizeProject(JSON.parse(JSON.stringify(g.raw))) as Project;
    const svg = editorSvg(p.sheets[0], {
      href: () => null,
      font: p.font,
      radarTpls: p.radarTpls,
    }).svg;
    for (const mark of ['layer-notes', 'note-bare', 'chart-node', 'note-out-hint'])
      expect(svg, mark).toContain(mark);
    const lod = all.find((d) => d.name === 'b4:lod-stats') as Dataset;
    const q = normalizeProject(JSON.parse(JSON.stringify(lod.raw))) as Project;
    const dense = q.sheets.find((s) => s.chars.length >= 60);
    expect(dense).toBeTruthy();
    expect(editorSvg(dense as never, { href: () => null, font: q.font, lod: true }).svg).toContain(
      'lod-dot',
    );
  });
  for (const d of all)
    it(d.name, () => {
      expect(Object.keys(golden)).toContain(d.name);
      expect(capture(d)).toEqual(golden[d.name]);
    });
});
