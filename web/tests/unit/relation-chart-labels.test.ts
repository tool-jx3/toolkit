/**
 * @vitest-environment jsdom
 */
/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見 web/src/tools/relation-chart/UPSTREAM_LICENSE。
 *
 * 角色關係圖產生器第二批（標籤與群體）：和原作的輸出逐一比對。
 * 基準是在原作裡照同一份情境做出來的專案（標籤、陣營框、收合、群體關係、標籤網、標籤圖例、顯示設定），畫一次記下的 SVG
 * 與它的「匯出專案」資料（`fixtures/relation-chart-b2-orig.json.gz`；產生方式見規格 3.10 的對照說明）。
 * 新版讀同一份專案檔（讀原作的專案檔的轉換）、畫編輯畫面，比對每個圖元（元素、屬性、文字；數字容許 0.05 的四捨五入差）。
 */
import { gunzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { editorSvg } from '../../src/tools/relation-chart/engine/chart';
import { sheetCtx } from '../../src/tools/relation-chart/engine/geom';
import { forceStep, type Velocities } from '../../src/tools/relation-chart/logic/force';
import { convertLegacy } from '../../src/tools/relation-chart/logic/legacy';
import { normalizeProject } from '../../src/tools/relation-chart/model/normalize';
import type { FontKey, Project } from '../../src/tools/relation-chart/model/types';

const FS = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS)) as {
  readFileSync: (p: string) => Uint8Array;
};
/* jsdom 環境的 import.meta.url 不是檔案的實際位置：用工作目錄（web/） */
const FIX = `${(globalThis as { process?: { cwd: () => string } }).process?.cwd()}/tests/unit/fixtures/relation-chart-b2-orig.json.gz`;

interface Frag {
  zones: string;
  grels: string;
  netLines: string;
  netNodes: string;
  colNodes: string;
  colEdges: string;
  lblLegend: string;
  relLegend: number[];
  charLegend: number[];
  nodes: number[];
  edges: number[];
  bleed: number;
}
const fixture = JSON.parse(strFromU8(gunzipSync(readFileSync(FIX)))) as Record<
  string,
  {
    frag: Frag;
    project: Record<string, unknown>;
    /** 原作從同一個狀態走 12 步磁鐵（α＝1）之後的角色位置、標籤節點位置 */
    force: {
      chars: [number, number, number][];
      labelPos: Record<string, { x: number; y: number }>;
    };
  }
>;

const SVG_NS = 'http://www.w3.org/2000/svg';
const parse = (inner: string): Element => {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="${SVG_NS}">${inner}</svg>`,
    'image/svg+xml',
  );
  const err = doc.querySelector('parsererror');
  if (err) throw new Error(err.textContent ?? 'parse error');
  return doc.documentElement;
};

/** 編輯畫面才有、文字和原作不同的提示（原作匯出時也剝掉） */
const DROP_TITLE = new Set(['zone-colhot', 'colnode', 'col-edge']);
const IGNORE_ATTR = new Set(['style']);

const numRe = /-?\d+(?:\.\d+)?(?:e-?\d+)?/g;
function sameValue(a: string, b: string, tol: number): boolean {
  const na = a.replace(/crzm\d+/g, 'crzm#');
  const nb = b.replace(/crzm\d+/g, 'crzm#');
  if (na === nb) return true;
  const sa = na.split(numRe);
  const sb = nb.split(numRe);
  if (sa.join('|') !== sb.join('|')) return false;
  const xa = na.match(numRe) ?? [];
  const xb = nb.match(numRe) ?? [];
  if (xa.length !== xb.length) return false;
  return xa.every((v, i) => Math.abs(Number(v) - Number(xb[i])) <= tol);
}

/** 兩棵樹逐一比，回傳第一個不同的地方（相同＝null） */
function diff(a: Element, b: Element, path = '', tol = 1e-9): string | null {
  const here = `${path}/${a.tagName}${a.getAttribute('class') ? `.${a.getAttribute('class')}` : ''}`;
  if (a.tagName !== b.tagName) return `${here}: tag ${a.tagName} ≠ ${b.tagName}`;
  const attrs = (e: Element) =>
    [...e.attributes]
      .filter((x) => !IGNORE_ATTR.has(x.name) && !x.name.startsWith('xmlns'))
      .map((x) => x.name);
  const an = attrs(a).sort();
  const bn = attrs(b).sort();
  if (an.join() !== bn.join()) return `${here}: attrs [${an}] ≠ [${bn}]`;
  for (const n of an) {
    const va = a.getAttribute(n) ?? '';
    const vb = b.getAttribute(n) ?? '';
    if (!sameValue(va, vb, tol)) return `${here}@${n}: ${va.slice(0, 120)} ≠ ${vb.slice(0, 120)}`;
  }
  const kids = (e: Element) => {
    const drop = DROP_TITLE.has(e.getAttribute('class') ?? '');
    return [...e.childNodes].filter(
      (k) =>
        (k.nodeType === 1 && !(drop && (k as Element).tagName === 'title')) ||
        (k.nodeType === 3 && (k.textContent ?? '').trim()),
    );
  };
  const ka = kids(a);
  const kb = kids(b);
  if (ka.length !== kb.length) return `${here}: ${ka.length} children ≠ ${kb.length}`;
  for (let i = 0; i < ka.length; i++) {
    const x = ka[i];
    const y = kb[i];
    if (x.nodeType !== y.nodeType) return `${here}[${i}]: node type`;
    if (x.nodeType === 3) {
      if ((x.textContent ?? '').trim() !== (y.textContent ?? '').trim())
        return `${here}[${i}]: text ${x.textContent} ≠ ${y.textContent}`;
      continue;
    }
    const d = diff(x as Element, y as Element, `${here}[${i}]`, tol);
    if (d) return d;
  }
  return null;
}

function project(raw: Record<string, unknown>): Project {
  const conv = convertLegacy(raw);
  const p = normalizeProject({
    sheets: conv.sheets,
    active: 0,
    labels: conv.labels,
    nextId: 100000,
    font: 'sans' as FontKey,
  });
  if (!p) throw new Error('normalize failed');
  return p;
}

/** 新版的編輯畫面（同原作：沒有選取） */
function mine(raw: Record<string, unknown>) {
  const p = project(raw);
  const s = p.sheets[p.sheets.length - 1];
  const r = editorSvg(s, { href: () => null, font: p.font, labels: p.labels });
  const doc = new DOMParser().parseFromString(r.svg, 'image/svg+xml');
  return { p, s, r, root: doc.documentElement };
}

const outer = (els: Iterable<Element>) => [...els].map((e) => e.outerHTML).join('');

describe('和原作的輸出相同（第二批：標籤與群體）', () => {
  for (const [name, { frag, project: raw, force }] of Object.entries(fixture)) {
    describe(name, () => {
      const { root, r } = mine(raw);
      const q = (sel: string) => root.querySelector(sel);
      const all = (sel: string) => [...root.querySelectorAll(sel)];
      const cmp = (orig: string, ours: string) => {
        expect(!!ours, '有沒有這一部分').toBe(!!orig);
        if (!orig) return;
        expect(diff(parse(orig), parse(ours))).toBeNull();
      };
      it('陣營框（形狀、填色、外框線、名稱、分層）', () => {
        cmp(frag.zones, q('.layer-zones')?.innerHTML ?? '');
      });
      it('群體關係線', () => {
        cmp(frag.grels, q('.grel-layer')?.outerHTML ?? '');
      });
      it('標籤網（虛線、圓點）', () => {
        cmp(frag.netLines, q('.layer-edges > .lbl-net')?.outerHTML ?? '');
        cmp(frag.netNodes, q('.layer-nodes > .lbl-net')?.outerHTML ?? '');
      });
      it('收合節點與聚合線', () => {
        cmp(frag.colNodes, outer(all('.colnode')));
        cmp(frag.colEdges, outer(all('.col-edge')));
      });
      it('畫出來的角色、關係線、圖例與名冊的項目', () => {
        expect(
          all('.layer-nodes .node[data-id]').map((e) => Number(e.getAttribute('data-id'))),
        ).toEqual(frag.nodes);
        expect(
          [
            ...new Set(
              all('.layer-edges .edge[data-relid]').map((e) =>
                Number(e.getAttribute('data-relid')),
              ),
            ),
          ].sort((a, b) => a - b),
        ).toEqual([...frag.edges].sort((a, b) => a - b));
        expect(
          all('.legend .legend-item[data-legend-type]').map((e) =>
            Number(e.getAttribute('data-legend-type')),
          ),
        ).toEqual(frag.relLegend);
        expect(
          all('.char-legend .legend-item[data-legend-char]').map((e) =>
            Number(e.getAttribute('data-legend-char')),
          ),
        ).toEqual(frag.charLegend);
        expect(r.pad).toBe(frag.bleed);
      });
      it('磁鐵：標籤的引力與互斥、收合中的成員不動（12 步之後的位置）', () => {
        const p = project(raw);
        const s = p.sheets[p.sheets.length - 1];
        const vel: Velocities = new Map();
        for (let i = 0; i < 12; i++) forceStep(sheetCtx(s, p.labels), vel, 1, new Set(), null);
        const mine = new Map(s.chars.map((c) => [c.id, c]));
        for (const [id, x, y] of force.chars) {
          const c = mine.get(id);
          expect(c, `角色 ${id}`).toBeTruthy();
          expect(Math.abs((c?.x ?? 0) - x) + Math.abs((c?.y ?? 0) - y), `角色 ${id}`).toBeLessThan(
            1e-6,
          );
        }
        expect(s.settings.labelPos).toEqual(force.labelPos);
      });
      it('標籤圖例（項目、樣本、名稱、面板位置）', () => {
        const o = frag.lblLegend ? parse(frag.lblLegend) : null;
        const m = q('.lbl-legend');
        expect(!!m).toBe(!!o);
        if (!o || !m) return;
        const items = (e: Element) => [...e.querySelectorAll('[data-legend-lbl]')];
        expect(items(m).map((x) => x.getAttribute('data-legend-lbl'))).toEqual(
          items(o).map((x) => x.getAttribute('data-legend-lbl')),
        );
        items(o).forEach((oi, i) => {
          const mi = items(m)[i];
          const tail = (e: Element) => [...e.children].slice(-2);
          tail(oi).forEach((x, k) => {
            const y = tail(mi)[k];
            expect(diff(x, y, '', 0.051)).toBeNull();
          });
        });
        const box = (e: Element) => {
          const b = e.querySelector('rect') as Element;
          return ['x', 'y', 'width', 'height'].map((k) => Number(b.getAttribute(k)));
        };
        box(o).forEach((v, i) => {
          expect(Math.abs(v - box(m)[i])).toBeLessThan(0.06);
        });
      });
    });
  }
});
