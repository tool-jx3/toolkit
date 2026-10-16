/**
 * @vitest-environment jsdom
 */
/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見 web/src/tools/relation-chart/UPSTREAM_LICENSE。
 *
 * 讀原作的專案檔（第三批，規格 3.9）：和原作讀同一份檔算出來的值逐項比對。
 * 範例（研究員用原作的函式做、用原作的「匯出專案」存、再交給原作自己的開檔讀回，記下的預期值）：
 * - `fixtures/relation-chart-b3-library.zip`：角色庫與變體（兩件變體、統一顏色、變體層的標籤）、關係庫（變體、跨分頁同步）、
 *   看法、角色資訊（標題、粗體、紅字、清單、表格、圖片、連結）、角色字型（楷體）、文件字型（明體）。
 * - `fixtures/relation-chart-b3-assets.json`：只有 project.json 的那一份（頭像框、匯入字型的參照都在，但沒有檔案）：
 *   數值範本五種圖型、多狀態、變體各自的數值、角色卡。
 * 比對：每位角色的顯示名稱、條目與變體（同一個人／同一件）、重要度、座標、標籤、角色卡全文、實際戴的框與來源、
 * 名字的字型；每張分頁的關係類型與綁定、看法、連線總表的列；角色庫、關係庫（每一筆、每一件、用在幾張分頁）。
 * 和原作刻意不同的（規格第 5 節）：角色卡的表格儲存格之間加「｜」（原作黏在一起）。
 */
import { strFromU8, unzipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  charFontAttr,
  displayName,
  frameSource,
  sheetCtx,
} from '../../src/tools/relation-chart/engine/geom';
import { charCardText } from '../../src/tools/relation-chart/logic/card';
import { convertLegacy, snapHash } from '../../src/tools/relation-chart/logic/legacy';
import { DEFAULT_REL_QUERY, relTableRows } from '../../src/tools/relation-chart/logic/relTable';
import {
  charLibUsage,
  relLibUsage,
  variantName,
  variantOf,
} from '../../src/tools/relation-chart/model/library';
import { initialProject } from '../../src/tools/relation-chart/model/normalize';
import type { Project } from '../../src/tools/relation-chart/model/types';
import { applyLegacy, remapLegacyRefs } from '../../src/tools/relation-chart/state/project';
import { useProject } from '../../src/tools/relation-chart/state/store';

const FS = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS)) as {
  readFileSync: (p: string, enc?: 'utf8') => string & Uint8Array;
};
const DIR = `${(globalThis as { process?: { cwd: () => string } }).process?.cwd()}/tests/unit/fixtures/`;

interface ExpChar {
  id: number;
  libId: number;
  varId: number;
  display: string;
  level: number;
  x: number;
  y: number;
  frame: string | null;
  frameSrcLayer: string;
  nameFontStyle: string | null;
  labels: string[];
  card: string;
  radar: { tpl: string; state: string; vals: Record<string, number> }[];
}
interface Expected {
  docFont: string;
  sheets: {
    name: string;
    W: number;
    H: number;
    defFrame: string | null;
    chars: ExpChar[];
    relTable: string[];
    types: {
      id: number;
      label: string;
      color: string;
      lineStyle: string;
      capStyle: string;
      relLibId: number;
      relVarId: number;
    }[];
    views: Record<string, Record<string, string>>;
  }[];
  library: {
    id: number;
    unifiedColor: boolean;
    font: string | null;
    info: string | null;
    usage: number;
    variants: {
      id: number;
      display: string;
      sheets: number;
      hasImg: boolean;
      icon: string | null;
    }[];
  }[];
  relLibrary: {
    id: number;
    usage: number;
    variants: {
      id: number;
      label: string;
      color: string;
      lineStyle: string;
      capStyle: string;
      sheets: number;
    }[];
  }[];
  labels: { id: number; text: string; frame: string | null }[];
  radarLib: {
    name: string;
    chart: string;
    shape: string;
    rings: number;
    valMode: string;
    shared: boolean;
    axes: { id: number; label: string; max: number; unit: string }[];
  }[];
}

/** 讀原作的檔 → 換參照 → 加進一份空專案（取代） */
let avatars = new Set<number>();
function load(data: Record<string, unknown>, rich: Map<string, string> = new Map()): Project {
  const conv = convertLegacy(data);
  /* 頭像在這裡不放進資產庫（測試環境沒有畫布）：記下原作的哪些變體有 */
  avatars = new Set(conv.avatars.keys());
  const refs = remapLegacyRefs(conv, new Map(), new Map(), rich);
  useProject.getState().replace(initialProject());
  applyLegacy(conv, 'replace', refs.font, [], []);
  return useProject.getState().data;
}

const fromZip = (name: string) => {
  const files = unzipSync(readFileSync(`${DIR}${name}`) as Uint8Array);
  const path = Object.keys(files).find((k) => k.endsWith('project.json')) as string;
  return JSON.parse(strFromU8(files[path])) as Record<string, unknown>;
};

/** 原作的角色卡把表格的儲存格接在一起；新版用「｜」分開（D 項）：把預期值換成新版的寫法 */
const fixTable = (card: string) => card.replace('屬性光\n武器法杖', '屬性｜光\n武器｜法杖');

/** 同一個人＝同一個條目、同一件＝同一件：原作的 id 和新版的 id 一對一 */
function sameBinding(pairs: [number, number][]) {
  const a = new Map<number, number>();
  const b = new Map<number, number>();
  for (const [x, y] of pairs) {
    expect(a.get(x) ?? y).toBe(y);
    expect(b.get(y) ?? x).toBe(x);
    a.set(x, y);
    b.set(y, x);
  }
}

function compare(p: Project, exp: Expected) {
  expect(p.sheets.map((s) => [s.name, s.W, s.H])).toEqual(
    exp.sheets.map((s) => [s.name, s.W, s.H]),
  );
  const libPairs: [number, number][] = [];
  const varPairs: [number, number][] = [];
  const relLibPairs: [number, number][] = [];
  const relVarPairs: [number, number][] = [];
  p.sheets.forEach((s, si) => {
    const es = exp.sheets[si];
    const ctx = sheetCtx(s, p.labels, { font: p.font, fonts: p.fonts, frames: p.frames });
    expect(s.chars).toHaveLength(es.chars.length);
    s.chars.forEach((c, ci) => {
      const ec = es.chars[ci];
      expect(displayName(c), `${s.name} ${ec.display}`).toBe(ec.display);
      expect([c.level, c.x, c.y]).toEqual([ec.level, ec.x, ec.y]);
      expect(c.labels.map((id) => p.labels.find((l) => l.id === id)?.text)).toEqual(ec.labels);
      libPairs.push([ec.libId, c.lib]);
      varPairs.push([ec.varId, c.vari]);
      expect(charCardText(p, s, c), `${s.name} ${ec.display} 的角色卡`).toBe(fixTable(ec.card));
      const fs = frameSource(ctx, c);
      expect(fs ? p.frames.find((f) => f.id === fs.id)?.name : null).toBe(ec.frame);
      const attr = charFontAttr(ctx, c);
      expect(attr || null).toBe(ec.nameFontStyle);
      /* 數值（目前這件變體）：範本名、狀態名、每條軸的值（照軸的順序） */
      const v = variantOf(p, c).variant;
      const mine = (v?.radars ?? []).map((r) => {
        const t = p.radarTpls.find((x) => x.id === r.tpl);
        return [t?.name, r.state, (t?.axes ?? []).map((a) => r.vals[a.id] ?? null)];
      });
      const want = (ec.radar ?? []).map((r) => {
        const t = exp.radarLib?.find((x) => x.name === r.tpl);
        return [r.tpl, r.state, (t?.axes ?? []).map((a) => r.vals[a.id] ?? null)];
      });
      expect(mine, `${ec.display} 的數值`).toEqual(want);
    });
    expect(s.types.map((t) => [t.label, t.color, t.lineStyle, t.capStyle])).toEqual(
      es.types.map((t) => [t.label, t.color, t.lineStyle, t.capStyle]),
    );
    s.types.forEach((t, ti) => {
      relLibPairs.push([es.types[ti].relLibId, t.lib]);
      relVarPairs.push([es.types[ti].relVarId, t.vari]);
    });
    /* 看法：原作的角色 id → 名字 */
    const nameOfExp = (id: string) => es.chars.find((c) => String(c.id) === id)?.display;
    const nameOf = (id: string) => {
      const c = s.chars.find((x) => String(x.id) === id);
      return c ? displayName(c) : undefined;
    };
    const flat = (
      v: Record<string, Record<string, string>>,
      nm: (id: string) => string | undefined,
    ) =>
      Object.entries(v)
        .flatMap(([a, row]) => Object.entries(row).map(([b, t]) => `${nm(a)}→${nm(b)}：${t}`))
        .sort();
    expect(flat(s.views, nameOf)).toEqual(flat(es.views ?? {}, nameOfExp));
    /* 連線總表（預設排序：來源 ▲） */
    const rows = relTableRows(s, DEFAULT_REL_QUERY).map((r) => {
      const t = s.types.find((x) => x.id === r.type)?.label ?? '?';
      const a = displayName(s.chars.find((c) => c.id === r.from) as never);
      const b = displayName(s.chars.find((c) => c.id === r.to) as never);
      const arrow = r.both ? '⇄' : '→';
      return `${a} ${arrow} ${t} ${arrow} ${b}${r.note ? `｜${r.note}` : ''}`;
    });
    expect(rows, `${s.name} 的連線總表`).toEqual(es.relTable);
  });
  sameBinding(libPairs);
  sameBinding(varPairs);
  sameBinding(relLibPairs);
  sameBinding(relVarPairs);
  /* 角色庫：每一筆、每一件、用在幾張分頁 */
  const use = charLibUsage(p.sheets);
  expect(p.library).toHaveLength(exp.library.length);
  p.library.forEach((e, i) => {
    const ee = exp.library[i];
    expect(ee.variants.map((v) => avatars.has(v.id))).toEqual(ee.variants.map((v) => v.hasImg));
    expect(e.unified).toBe(ee.unifiedColor);
    expect(e.font || null).toBe(ee.font);
    expect(use.entry.get(e.id) ?? 0).toBe(ee.usage);
    expect(e.variants.map((v) => [variantName(e, v), use.variant.get(v.id) ?? 0, v.icon])).toEqual(
      ee.variants.map((v) => [v.display.replace(/\s*\n+\s*/g, ' '), v.sheets, v.icon]),
    );
  });
  const ruse = relLibUsage(p.sheets);
  expect(p.relLibrary).toHaveLength(exp.relLibrary.length);
  p.relLibrary.forEach((e, i) => {
    const ee = exp.relLibrary[i];
    expect(ruse.entry.get(e.id) ?? 0).toBe(ee.usage);
    expect(
      e.variants.map((v) => [
        v.label,
        v.color,
        v.lineStyle,
        v.capStyle,
        ruse.variant.get(v.id) ?? 0,
      ]),
    ).toEqual(ee.variants.map((v) => [v.label, v.color, v.lineStyle, v.capStyle, v.sheets]));
  });
}

describe('讀原作的專案檔：角色庫、關係庫、看法、角色資訊、角色卡（b3-library.zip）', () => {
  const exp = JSON.parse(
    readFileSync(`${DIR}relation-chart-b3-library.expected.json`, 'utf8'),
  ) as Expected;
  let p: Project;
  beforeEach(() => {
    p = load(
      fromZip('relation-chart-b3-library.zip'),
      new Map([['cqmk04-we7lku-2za', 'arichimage01']]),
    );
  });
  it('逐項和原作相同', () => compare(p, exp));
  it('文件字型、角色字型（內建）、角色資訊（淨化過；圖片換成資產的參照）', () => {
    expect(p.font).toBe(exp.docFont);
    const e = p.library[0];
    const ee = exp.library[0];
    expect(e.info).toBe((ee.info ?? '').replace('rcimg:cqmk04-we7lku-2za', 'rcimg:arichimage01'));
    expect(p.library.map((x) => x.info.length > 0)).toEqual(exp.library.map((x) => !!x.info));
  });
});

describe('只有 project.json（b3-assets）：框與字型的參照對不上檔案＝不畫框、文件字型退回黑體；數值與角色卡', () => {
  const exp = JSON.parse(
    readFileSync(`${DIR}relation-chart-b3-assets.expected.json`, 'utf8'),
  ) as Expected;
  it('角色、數值、角色卡、角色庫與關係庫逐項相同（框、匯入字型除外）', () => {
    const p = load(
      JSON.parse(readFileSync(`${DIR}relation-chart-b3-assets.json`, 'utf8')) as Record<
        string,
        unknown
      >,
    );
    expect(p.font).toBe('sans');
    expect(p.frames).toEqual([]);
    /* 沒有檔案：預期值改成沒有框、沒有匯入的字型（原作讀紀錄檔時也一樣畫不出來） */
    const noAssets: Expected = {
      ...exp,
      sheets: exp.sheets.map((s) => ({
        ...s,
        chars: s.chars.map((c) => ({
          ...c,
          frame: null,
          nameFontStyle: c.nameFontStyle?.includes('crf-') ? null : c.nameFontStyle,
        })),
      })),
      library: exp.library.map((e) => ({ ...e, font: e.font?.startsWith('f:') ? null : e.font })),
    };
    compare(p, noAssets);
    /* 數值範本：名稱、圖型、格線、環數、數值呈現、共用刻度、每條軸（名稱、上限、單位） */
    const strip = (t: (typeof exp.radarLib)[number]) => [
      t.name,
      t.chart,
      t.shape,
      t.rings,
      t.valMode,
      t.shared,
      t.axes.map((x) => [x.label, x.max, x.unit]),
    ];
    expect(p.radarTpls.map(strip)).toEqual(exp.radarLib.map(strip));
  });
});

describe('原作的內容雜湊（snapHash＋副檔名 → MIME）', () => {
  it('ZIP 裡的 frames/frame-red.png 重算出原作專案裡的參照', () => {
    const bytes = readFileSync(`${DIR}relation-chart-b3-frame-red.png`) as Uint8Array;
    let bin = '';
    for (const x of bytes) bin += String.fromCharCode(x);
    const b64 = btoa(bin);
    expect(snapHash(`data:image/png;base64,${b64}`)).toBe('yoszaz-94894l-7f2');
  });
});
