/**
 * 家系圖第二批的匯出（規格 3.3、F80～F88）：畫布大小和原作匯出的 PNG 相同（過繼的「出」字小卡、母系外孫的開關、
 * 婚姻連結、女兒的寫法、選取的人以下、框選範圍）；PL 用／GM 用；SVG 記錄器。
 * 期待值是同一份資料、同樣的匯出設定在原作匯出的 PNG 大小（scratchpad 的 parity/export-compare.mjs）。
 */
import { describe, expect, it } from 'vitest';
import {
  type ExportCard,
  type ExportOptions,
  planExport,
  type ViewSettings,
} from '@/tools/family-tree/export/render';
import { parseFont, SvgContext } from '@/tools/family-tree/export/svgctx';
import { layoutTree, viewDims } from '@/tools/family-tree/model/layout';
import { boardsFromLegacy } from '@/tools/family-tree/model/legacy';
import type { Board } from '@/tools/family-tree/model/types';
import sizes from './fixtures/family-tree-export-sizes-b2.json';

const datasets = import.meta.glob<{ data: unknown }>('./fixtures/family-tree-b2/*.json', {
  eager: true,
  import: 'default',
});
const board = (name: string): Board =>
  boardsFromLegacy(datasets[`./fixtures/family-tree-b2/${name}.json`].data, '測試')[0];

interface Case {
  orient: 'v' | 'h';
  card: ExportCard;
  compact?: boolean;
  memo?: boolean;
  sp?: boolean;
  dname?: boolean;
  mat?: boolean;
  stub?: boolean;
  link?: boolean;
  title?: boolean;
  gen?: boolean;
  sub?: boolean;
  area?: boolean;
}
/* 和對照腳本相同的設定（card：view＝原作的「照顯示設定」） */
const CASES: Record<string, Case> = {
  'v-full': { orient: 'v', card: 'view' },
  'h-full': { orient: 'h', card: 'view' },
  'v-compact': { orient: 'v', card: 'view', compact: true },
  'h-compact': { orient: 'h', card: 'view', compact: true },
  'v-name': { orient: 'v', card: 'name' },
  'h-reading': { orient: 'h', card: 'reading' },
  'v-memo': { orient: 'v', card: 'view', memo: true },
  'v-nosp': { orient: 'v', card: 'view', sp: false },
  'v-dname': { orient: 'v', card: 'view', dname: true },
  'h-dname-compact': { orient: 'h', card: 'view', dname: true, compact: true },
  'v-nomat': { orient: 'v', card: 'view', mat: false },
  'v-nostub': { orient: 'v', card: 'view', stub: false },
  'h-nolink': { orient: 'h', card: 'view', link: false },
  'v-plain': { orient: 'v', card: 'view', title: false, gen: false },
  'v-sub': { orient: 'v', card: 'view', sub: true },
  'h-sub': { orient: 'h', card: 'name', sub: true },
  'v-area': { orient: 'v', card: 'view', area: true },
  'h-area-compact': { orient: 'h', card: 'view', area: true, compact: true },
};
const SUB: Record<string, string> = { adopt: 'm001', links: 'm007', dname: 'm001', mixed: 'm00a' };
/** 框選的框（排版座標；畫面上的排版，和對照腳本相同） */
const AREA: Record<string, [number, number, number, number]> = {
  adopt: [-700, 150, 300, 420],
  links: [-200, 100, 700, 300],
  dname: [-300, 100, 400, 200],
  mixed: [3950, 150, 5250, 520],
};

function viewOf(c: Case): ViewSettings {
  return {
    cardMode: c.compact ? 'compact' : 'full',
    memo: !!c.memo,
    colors: true,
    collapsed: [],
    maternal: c.mat !== false,
    stubs: c.stub !== false,
    links: c.link !== false,
    daughterName: !!c.dname,
  };
}

/** 框到的卡片：畫面上的排版（配偶照顯示），卡片範圍和框有重疊的（成員 m:id、小卡 s:id） */
function areaKeys(b: Board, ds: string, c: Case): string[] {
  const v = viewOf(c);
  const L = layoutTree(b.people, {
    dims: viewDims(v.cardMode, v.memo),
    spouses: true,
    align: b.align,
    maternal: v.maternal,
    stubs: v.stubs,
    daughterName: v.daughterName,
  });
  const [x0, y0, x1, y1] = AREA[ds];
  return L.nodes
    .filter((n) => n.x < x1 && n.x + n.width > x0 && n.y < y1 && n.y + L.dims.H > y0)
    .map((n) => `${n.stub ? 's' : 'm'}:${n.id}`);
}

function plan(b: Board, ds: string, c: Case, scale = 2) {
  const options: ExportOptions = {
    range: c.sub ? 'sub' : c.area ? 'area' : 'all',
    orient: c.orient,
    card: c.card,
    title: c.title !== false,
    gens: c.gen !== false,
    spouses: c.sp !== false,
  };
  return planExport({
    board: b,
    view: viewOf(c),
    options,
    selectedId: c.sub ? SUB[ds] : null,
    areaKeys: c.area ? areaKeys(b, ds, c) : null,
    scale,
  });
}

describe('第二批：畫布大小和原作匯出的 PNG 相同', () => {
  for (const [ds, name, size] of sizes.cases as [string, string, string][]) {
    it(`${ds}／${name}：${size}`, () => {
      const p = plan(board(ds), ds, CASES[name]);
      expect(p && `${p.canvasWidth}x${p.canvasHeight}`).toBe(size);
    });
  }
});

describe('第二批的版面', () => {
  it('「出」字小卡：畫在生父的孩子之間、沒有配偶卡片；選取的人以下包含生父底下的小卡', () => {
    const b = board('adopt');
    const p = plan(b, 'adopt', CASES['v-sub']);
    const stubs = p?.nodes.filter((n) => n.node.stub).map((n) => n.node.id) ?? [];
    expect(stubs.sort()).toEqual(['m004', 'm009']);
    /* 過繼出去的人本身不在白石 源 以下（掛在繼父底下） */
    expect(p?.nodes.some((n) => !n.node.stub && n.node.id === 'm004')).toBe(false);
  });

  it('婚姻連線：顯示配偶時才畫；橫向時以卡片的右邊相連', () => {
    const b = board('links');
    const v = plan(b, 'links', CASES['v-full']);
    expect(v?.links.length).toBe(5);
    expect(plan(b, 'links', CASES['v-nosp'])?.links).toEqual([]);
    expect(plan(b, 'links', CASES['h-nolink'])?.links).toEqual([]);
    const h = plan(b, 'links', CASES['h-full']);
    expect(h?.links.length).toBe(5);
  });

  it('PL 用：拿掉 GM 專用的人（連同子孫）；GM 用：標題列寫「GM 用」、範圍照舊', () => {
    const b = board('adopt');
    const gmOnly: Board = {
      ...b,
      people: { ...b.people, m00a: { ...b.people.m00a, gm: true } },
    };
    const base: ExportOptions = {
      range: 'all',
      orient: 'v',
      card: 'view',
      title: false,
      gens: true,
      spouses: true,
    };
    const view = viewOf(CASES['v-full']);
    const pl = planExport({ board: gmOnly, view, options: base, scale: 1 });
    const gm = planExport({ board: gmOnly, view, options: { ...base, audience: 'gm' }, scale: 1 });
    expect(pl?.gmMarks).toBe(false);
    expect(gm?.gmMarks).toBe(true);
    /* 氷室 誠（m00a）的家系整個不見；沒有標題時 PL 用沒有標題列、GM 用有（寫「GM 用」） */
    expect(pl?.nodes.some((n) => n.node.id === 'm00a')).toBe(false);
    expect(gm?.nodes.some((n) => n.node.id === 'm00a')).toBe(true);
    expect(gm?.gmScope.has('m00c')).toBe(true);
    expect(pl && gm && pl.width < gm.width).toBe(true);
    expect(gm?.top).toBe(80);
  });
});

describe('SVG 記錄器', () => {
  const measure = {
    font: '',
    measureText: (t: string) => ({ width: t.length * 10 }) as TextMetrics,
  };

  it('字型字串', () => {
    expect(parseFont('600 14px "Noto Sans TC", sans-serif')).toEqual({
      weight: '600',
      size: 14,
      family: '"Noto Sans TC", sans-serif',
    });
    expect(parseFont('12px sans-serif')).toMatchObject({ weight: '400', size: 12 });
  });

  it('平移、圓角矩形（arcTo）、虛線、透明度、文字、剪裁', () => {
    const c = new SvgContext(measure as unknown as CanvasRenderingContext2D);
    c.translate(10, 20);
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 5, 5);
    c.beginPath();
    c.moveTo(4, 0);
    c.lineTo(16, 0);
    c.arcTo(20, 0, 20, 4, 4);
    c.closePath();
    c.strokeStyle = '#000';
    c.setLineDash([4, 3]);
    c.globalAlpha = 0.5;
    c.stroke();
    c.globalAlpha = 1;
    c.setLineDash([]);
    c.save();
    c.beginPath();
    c.arc(0, 0, 3, 0, Math.PI * 2);
    c.clip();
    c.font = '700 22px "Noto Sans TC"';
    c.textAlign = 'center';
    c.fillStyle = '#123456';
    c.fillText('綾瀬 <家>', 1, 2);
    c.restore();
    c.fillText('外', 0, 0);
    const svg = c.toSvg(100, 50, '', '標題');
    expect(svg).toContain('viewBox="0 0 100 50"');
    expect(svg).toContain('<rect x="10" y="20" width="5" height="5" fill="#ffffff"/>');
    expect(svg).toContain('d="M14 20L26 20A4 4 0 0 1 30 24Z"');
    expect(svg).toContain('stroke-dasharray="4 3"');
    expect(svg).toContain('stroke-opacity="0.5"');
    expect(svg).toMatch(/<clipPath id="c1"><path d="M13 20A3 3 0 1 1 7 20A3 3 0 1 1 13 20"\/><\/clipPath>/);
    expect(svg).toContain(
      '<text x="11" y="22" font-family="&quot;Noto Sans TC&quot;" font-size="22" font-weight="700" fill="#123456" text-anchor="middle" clip-path="url(#c1)">綾瀬 &lt;家&gt;</text>',
    );
    /* restore 之後不再剪裁 */
    expect(svg).toMatch(/<text x="10" y="20"[^>]*>外<\/text>/);
    expect(c.chars.get('700')?.has('綾')).toBe(true);
    expect(c.measureText('abc').width).toBe(30);
  });
});
