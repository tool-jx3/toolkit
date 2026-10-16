/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見 web/src/tools/relation-chart/UPSTREAM_LICENSE。
 *
 * 角色關係圖產生器：沒用到第二批（標籤與群體）的功能時，既有的輸出逐位元組不變。
 *
 * 做法（同 speech-bubble-compat 的 golden）：加第二批之前，先用當時的程式把下面的資料畫一次，記下每種輸出的 SHA-256
 * （`fixtures/relation-chart-v1-golden.json`）。之後用新程式讀同一份資料（存檔的資料經過整理與 migrate）再畫，必須完全相同。
 * - 原作「匯出專案」的 10 組資料（第一批畫法對照用的 12～120 人：圖例與名冊的 8 種位置、跳線、圖片、淺色、明體與楷體…；
 *   `fixtures/relation-chart-legacy-datasets.json.gz`），經過讀原作專案檔的轉換；
 * - 4 個範例；兩組自己產生的資料（標籤、自我關係、捆綁、各種線型與端點、跳線、名冊）。
 * 每張分頁的輸出：編輯畫面（沒有選取、選取兩位）、PNG 用的 SVG（不去背、去背）、互動網頁的 SVG、分層 SVG、互動網頁 HTML。
 *
 * 重新產生基準（只在加第二批之前的程式上做過一次）：`RC_GOLDEN=write npx vitest run tests/unit/relation-chart-golden.test.ts`
 */
import { gunzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { bytesToHex, sha256Sync } from '../../src/core/files';
import { editorSvg, exportSvg, viewerSvg } from '../../src/tools/relation-chart/engine/chart';
import { sheetLayeredSvg } from '../../src/tools/relation-chart/export/outputs';
import { viewerHtml } from '../../src/tools/relation-chart/export/viewer';
import { convertLegacy } from '../../src/tools/relation-chart/logic/legacy';
import { buildSample, SAMPLES } from '../../src/tools/relation-chart/logic/samples';
import { makeChar, makeRel, makeType } from '../../src/tools/relation-chart/model/factory';
import { emptySheet, normalizeProject } from '../../src/tools/relation-chart/model/normalize';
import type {
  CapStyle,
  FontKey,
  LineStyle,
  Project,
  Sheet,
} from '../../src/tools/relation-chart/model/types';

const FS = 'node:fs';
const { readFileSync, writeFileSync } = (await import(/* @vite-ignore */ FS)) as {
  readFileSync: (p: string, enc?: 'utf8') => string & Uint8Array;
  writeFileSync: (p: string, data: string) => void;
};
const GOLDEN = new URL('./fixtures/relation-chart-v1-golden.json', import.meta.url).pathname;
const DATASETS = new URL('./fixtures/relation-chart-legacy-datasets.json.gz', import.meta.url)
  .pathname;
const WRITE =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
    .RC_GOLDEN === 'write';

const sha = (s: string) => bytesToHex(sha256Sync(new TextEncoder().encode(s))).slice(0, 24);
const noImg = () => null;

/* ---------- 資料 ---------- */

/** 固定種子的亂數（mulberry32） */
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

const LINES: LineStyle[] = [
  'solid',
  'dashed',
  'dotted',
  'wavy',
  'zigzag',
  'square',
  'lace',
  'hearts',
  'stars',
  'melody',
];
const CAPS: CapStyle[] = [
  'arrow',
  'harrow',
  'dot',
  'hdot',
  'diamond',
  'hdiamond',
  'block',
  'bar',
  'heart',
  'star',
  'none',
];

/** 自己產生的一張分頁：n 位角色、各種關係類型、標籤（沒有標籤庫的設定）、自我關係、雙向 */
function generated(seed: number, n: number, W: number, H: number): Sheet {
  const r = rng(seed);
  const s = emptySheet(seed, 1, { W, H });
  s.name = `產生${seed}`;
  for (let i = 0; i < 6; i++)
    s.types.push(
      makeType(100 + i, `類型${i}`, {
        lineStyle: LINES[(i * 3 + seed) % LINES.length],
        capStyle: CAPS[(i * 5 + seed) % CAPS.length],
        color: i % 2 ? '#58b368' : 'auto',
      }),
    );
  for (let i = 0; i < n; i++)
    s.chars.push(
      makeChar(
        i + 1,
        i % 7 === 3 ? '' : `角色${i + 1}`,
        80 + r() * (W - 160),
        80 + r() * (H - 160),
        {
          defNo: i + 1,
          level: Math.floor(r() * 3),
          labels: i % 3 === 0 ? [901] : i % 4 === 0 ? [901, 902] : [],
          shape: i % 5 === 0 ? 'square' : '',
          noAvatar: i % 9 === 4,
          icon: i % 6 === 2 ? 'star' : null,
        },
      ),
    );
  let id = 500;
  for (let i = 0; i < n * 1.5; i++) {
    const a = 1 + Math.floor(r() * n);
    const b = r() < 0.06 ? a : 1 + Math.floor(r() * n);
    s.rels.push(
      makeRel(id++, a, b, 100 + Math.floor(r() * 6), {
        both: r() < 0.3,
        note: r() < 0.2 ? '備註' : '',
      }),
    );
  }
  return s;
}

interface Dataset {
  name: string;
  project: Project;
}

function datasets(): Dataset[] {
  const out: Dataset[] = [];
  const raw = JSON.parse(strFromU8(gunzipSync(readFileSync(DATASETS) as Uint8Array))) as Record<
    string,
    Record<string, unknown>
  >;
  for (const [key, data] of Object.entries(raw)) {
    const conv = convertLegacy(data);
    const font = (typeof data.docFont === 'string' ? data.docFont : 'sans') as FontKey;
    out.push({
      name: `legacy:${key}`,
      project: {
        sheets: conv.sheets,
        active: 0,
        labels: conv.labels,
        nextId: 100000,
        font,
      },
    });
  }
  for (const { key } of SAMPLES) {
    const s = buildSample(key);
    s.id = 1;
    s.defNo = 1;
    out.push({
      name: `sample:${key}`,
      project: { sheets: [s], active: 0, labels: [], nextId: 100000, font: 'sans' },
    });
  }
  const g1 = generated(7, 40, 1400, 1000);
  const g2 = generated(11, 24, 1000, 900);
  g2.settings.bridgeMode = true;
  g2.settings.showRelName = true;
  g2.settings.showCharLegend = true;
  g2.settings.legendPos = 'leftOut';
  g2.settings.palette = 'light';
  out.push({
    name: 'generated',
    project: {
      sheets: [g1, g2],
      active: 0,
      labels: [
        { id: 901, text: '甲班' },
        { id: 902, text: '社團' },
      ],
      nextId: 100000,
      font: 'serif',
    } as Project,
  });
  return out;
}

/** 存檔讀回（整理＋migrate）後，每張分頁的各種輸出 */
function capture(d: Dataset): Record<string, string> {
  const p = normalizeProject(JSON.parse(JSON.stringify(d.project)));
  if (!p) throw new Error(`normalize failed: ${d.name}`);
  const out: Record<string, string> = {};
  p.sheets.forEach((s, i) => {
    const k = `${i}`;
    const opts = { href: noImg, font: p.font };
    out[`${k}:edit`] = sha(editorSvg(s, opts).svg);
    out[`${k}:edit-sel`] = sha(
      editorSvg(s, {
        ...opts,
        ui: { selected: new Set(s.chars.slice(0, 2).map((c) => c.id)), linkFrom: null },
      }).svg,
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
  out.html = sha(viewerHtml(p.sheets, { font: p.font, labels: p.labels, uris: new Map() }));
  return out;
}

describe('沒用到第二批的功能時，既有的輸出不變（第一批的畫法）', () => {
  const all = datasets();
  if (WRITE) {
    it('寫入基準', () => {
      const golden = Object.fromEntries(all.map((d) => [d.name, capture(d)]));
      writeFileSync(GOLDEN, `${JSON.stringify(golden, null, 1)}\n`);
    });
    return;
  }
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Record<string, Record<string, string>>;
  for (const d of all)
    it(d.name, () => {
      expect(Object.keys(golden)).toContain(d.name);
      expect(capture(d)).toEqual(golden[d.name]);
    });
});
