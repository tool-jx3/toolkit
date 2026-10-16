/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見 web/src/tools/relation-chart/UPSTREAM_LICENSE。
 *
 * 角色關係圖產生器：沒用到第三批（角色與關係的資料）的功能時，第二批（標籤與群體）的輸出逐位元組不變。
 *
 * 做法同 relation-chart-golden.test.ts：加第三批之前，先用當時的程式把下面的資料畫一次，記下每種輸出的 SHA-256
 * （`fixtures/relation-chart-v2-golden.json`）。之後用新程式讀同一份資料（經過整理與 migrate）再畫，必須完全相同。
 * - 第二批和原作對照用的 6 組情境（`fixtures/relation-chart-b2-orig.json.gz` 裡原作的「匯出專案」，經過讀原作專案檔的轉換）；
 * - 自己產生的一份：陣營框（混色／依標籤順序、外框線、分層、名稱角度）、收合、群體關係（含例外與算到每位成員）、
 *   標籤網（含游離標籤、手動位置）、標籤圖例、淺色。
 * 每張分頁的輸出：編輯畫面（沒有選取、選取兩位、建立關係模式中）、PNG 用的 SVG（不去背、去背）、互動網頁的 SVG、
 * 分層 SVG、互動網頁 HTML（檢視程式本身換成固定字串）。
 *
 * 重新產生基準（只在加第三批之前的程式上做過一次）：`RC_GOLDEN=write npx vitest run tests/unit/relation-chart-golden-b2.test.ts`
 */
import { gunzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { bytesToHex, sha256Sync } from '../../src/core/files';
import { editorSvg, exportSvg, viewerSvg } from '../../src/tools/relation-chart/engine/chart';
import { sheetLayeredSvg } from '../../src/tools/relation-chart/export/outputs';
import { stripLod, viewerHtml, viewerSource } from '../../src/tools/relation-chart/export/viewer';
import { convertLegacy } from '../../src/tools/relation-chart/logic/legacy';
import {
  makeChar,
  makeLabel,
  makeRel,
  makeType,
} from '../../src/tools/relation-chart/model/factory';
import { emptySheet, normalizeProject } from '../../src/tools/relation-chart/model/normalize';
import type { FontKey, Project, Sheet } from '../../src/tools/relation-chart/model/types';

const FS = 'node:fs';
const { readFileSync, writeFileSync } = (await import(/* @vite-ignore */ FS)) as {
  readFileSync: (p: string, enc?: 'utf8') => string & Uint8Array;
  writeFileSync: (p: string, data: string) => void;
};
const GOLDEN = new URL('./fixtures/relation-chart-v2-golden.json', import.meta.url).pathname;
const B2 = new URL('./fixtures/relation-chart-b2-orig.json.gz', import.meta.url).pathname;
const WRITE =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
    .RC_GOLDEN === 'write';

const sha = (s: string) => bytesToHex(sha256Sync(new TextEncoder().encode(s))).slice(0, 24);
const noImg = () => null;

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

/** 自己產生：標籤與群體的各種組合 */
function generated(): { sheets: Sheet[]; labels: Project['labels'] } {
  const labels = [
    makeLabel(901, '王國', { zone: true, color: '#e74c3c' }),
    makeLabel(902, '叛軍', { zone: true, color: '#3498db' }),
    makeLabel(903, '商會', { color: '#2ecc71' }),
    makeLabel(904, '暗部', { zone: true, hidden: true }),
    makeLabel(905, '游離', { color: '#9b59b6' }),
    makeLabel(906, '學院', { zone: true, noPull: true, color: '#f1c40f' }),
  ];
  const make = (seed: number, n: number, W: number, H: number) => {
    const r = rng(seed);
    const s = emptySheet(seed, 1, { W, H });
    s.name = `標籤${seed}`;
    for (let i = 0; i < 4; i++)
      s.types.push(makeType(100 + i, `類型${i}`, { color: i % 2 ? '#58b368' : 'auto' }));
    for (let i = 0; i < n; i++) {
      const ls: number[] = [];
      if (i % 3 === 0) ls.push(901);
      if (i % 4 === 1) ls.push(902);
      if (i % 5 === 2) ls.push(903);
      if (i % 7 === 3) ls.push(904);
      if (i % 6 === 5) ls.push(906, 901);
      s.chars.push(
        makeChar(i + 1, `角色${i + 1}`, 120 + r() * (W - 240), 120 + r() * (H - 240), {
          defNo: i + 1,
          labels: ls,
          shape: i % 5 === 0 ? 'square' : '',
        }),
      );
    }
    let id = 500;
    for (let i = 0; i < n * 1.2; i++) {
      const a = 1 + Math.floor(r() * n);
      const b = 1 + Math.floor(r() * n);
      if (a === b) continue;
      s.rels.push(makeRel(id++, a, b, 100 + Math.floor(r() * 4), { both: r() < 0.3 }));
    }
    return s;
  };
  const a = make(21, 30, 1600, 1200);
  a.grels.push(
    {
      id: 801,
      from: 'L901',
      to: 'L902',
      type: 100,
      both: true,
      inherit: false,
      note: '',
      except: [],
    },
    {
      id: 802,
      from: 'C2',
      to: 'L903',
      type: 101,
      both: false,
      inherit: true,
      note: '',
      except: [3],
    },
    {
      id: 803,
      from: 'L906',
      to: 'C5',
      type: 102,
      both: false,
      inherit: true,
      note: '',
      except: [],
    },
  );
  a.settings.zoneNameAng = { 901: 0.7, 902: -2.2 };
  a.settings.showLblLegend = true;
  a.settings.lblLegendPos = 'leftOut';
  const b = make(33, 26, 1400, 1000);
  b.collapsed = [902];
  b.settings.zoneBlend = false;
  b.settings.zoneOutline = false;
  b.settings.zoneLayerStep = 9;
  b.settings.showLabelNodes = true;
  b.settings.showFreeLbls = true;
  b.settings.labelPos = { 903: { x: 300, y: 260 } };
  b.settings.palette = 'light';
  b.settings.showRelName = true;
  b.grels.push({
    id: 811,
    from: 'L903',
    to: 'L901',
    type: 103,
    both: false,
    inherit: false,
    note: '',
    except: [],
  });
  return { sheets: [a, b], labels };
}

interface Dataset {
  name: string;
  /** 存檔的資料（經過 normalizeProject） */
  raw: Record<string, unknown>;
}

function datasets(): Dataset[] {
  const out: Dataset[] = [];
  const fx = JSON.parse(strFromU8(gunzipSync(readFileSync(B2) as Uint8Array))) as Record<
    string,
    { project: Record<string, unknown> }
  >;
  for (const [name, { project }] of Object.entries(fx)) {
    const conv = convertLegacy(project);
    out.push({
      name: `b2:${name}`,
      raw: {
        ...conv,
        sheets: conv.sheets,
        labels: conv.labels,
        active: 0,
        nextId: 100000,
        font: 'sans' as FontKey,
      },
    });
  }
  const g = generated();
  out.push({
    name: 'generated',
    raw: { sheets: g.sheets, labels: g.labels, active: 0, nextId: 100000, font: 'round' },
  });
  return out;
}

function capture(d: Dataset): Record<string, string> {
  const p = normalizeProject(JSON.parse(JSON.stringify(d.raw)));
  if (!p) throw new Error(`normalize failed: ${d.name}`);
  const out: Record<string, string> = {};
  p.sheets.forEach((s, i) => {
    const k = `${i}`;
    const opts = { href: noImg, font: p.font, labels: p.labels };
    out[`${k}:edit`] = sha(editorSvg(s, opts).svg);
    out[`${k}:edit-sel`] = sha(
      editorSvg(s, {
        ...opts,
        ui: { selected: new Set(s.chars.slice(0, 2).map((c) => c.id)), linkFrom: null },
      }).svg,
    );
    out[`${k}:edit-link`] = sha(
      editorSvg(s, { ...opts, ui: { linkFrom: s.chars[0]?.id ?? null, linking: true } }).svg,
    );
    out[`${k}:png`] = sha(exportSvg(s, { ...opts, transparent: false }));
    out[`${k}:png-t`] = sha(exportSvg(s, { ...opts, transparent: true }));
    out[`${k}:viewer-svg`] = sha(viewerSvg(s, opts));
    out[`${k}:layered`] = sha(
      sheetLayeredSvg(s, {
        sheets: [s],
        font: p.font,
        labels: p.labels,
        uris: new Map(),
        transparent: false,
      }),
    );
  });
  /* 第四批：60 位以上的分頁多了遠近簡化的標記與樣式（F116），去掉之後和以前相同 */
  out.html = sha(
    stripLod(
      viewerHtml(p.sheets, { font: p.font, labels: p.labels, uris: new Map() }).replace(
        viewerSource(),
        '/*rcViewer*/',
      ),
    ),
  );
  return out;
}

describe('沒用到第三批的功能時，第二批的輸出不變（標籤與群體）', () => {
  const all = datasets();
  if (WRITE) {
    it('寫入基準', () => {
      const golden = Object.fromEntries(all.map((d) => [d.name, capture(d)]));
      writeFileSync(GOLDEN, `${JSON.stringify(golden, null, 1)}\n`);
    });
    return;
  }
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Record<string, Record<string, string>>;
  it('自己產生的資料真的用到第二批的畫法', () => {
    const g = all.find((d) => d.name === 'generated') as Dataset;
    const p = normalizeProject(JSON.parse(JSON.stringify(g.raw))) as Project;
    const svg = p.sheets
      .map((s) => editorSvg(s, { href: noImg, font: p.font, labels: p.labels }).svg)
      .join('');
    for (const cls of ['zone-g', 'colnode', 'col-edge', 'grel-edge', 'lbl-net', 'lbl-legend'])
      expect(svg, cls).toContain(cls);
  });
  for (const d of all)
    it(d.name, () => {
      expect(Object.keys(golden)).toContain(d.name);
      expect(capture(d)).toEqual(golden[d.name]);
    });
});
