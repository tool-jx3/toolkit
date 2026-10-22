/**
 * 室內平面圖產生器：有方向的新家具，rot 0 時的方向要和原作一致（規格 7.16、D47、3.11.7）。
 * - 有前後之分的（車輛、機具、飛機、火車頭…）：前端朝上；讀原作的檔，rot 90 的卡車車頭朝右；
 * - 其他有方向的（往下的樓梯往下走、手電筒的光往右、閘門的箭頭往上…）也照原作。
 *
 * 判斷方法：用記錄「填色」的假 canvas，每種顏色用角色名當顏色值（`<water>`＝玻璃、`<shade>`＝深色…），
 * 取某個角色的某一塊（最大的／第一塊／最後一塊）看它在外框的哪一邊。
 */
import { describe, expect, it } from 'vitest';
import { FURNITURE_DRAW } from '@/tools/floor-plan/draw/furniture';
import { drawItem } from '@/tools/floor-plan/draw/render';
import { type FloorTheme, THEMES } from '@/tools/floor-plan/draw/themes';
import { ASSET, isAsset } from '@/tools/floor-plan/model/assets';
import { normalizeProject } from '@/tools/floor-plan/model/normalize';
import type { Item } from '@/tools/floor-plan/model/types';

interface Fill {
  style: string;
  pts: [number, number][];
}

/** 假 canvas：記錄每一次填色（顏色值、路徑上的點，世界座標） */
function fillRecorder() {
  const fills: Fill[] = [];
  type M = [number, number, number, number, number, number];
  let m: M = [1, 0, 0, 1, 0, 0];
  let fillStyle = '';
  const stack: { m: M; fillStyle: string }[] = [];
  let path: [number, number][] = [];
  const add = (x: number, y: number) =>
    path.push([m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  const ell = (cx: number, cy: number, rx: number, ry: number, rot = 0) => {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const ex = rx * Math.cos(a);
      const ey = ry * Math.sin(a);
      add(
        cx + ex * Math.cos(rot) - ey * Math.sin(rot),
        cy + ex * Math.sin(rot) + ey * Math.cos(rot),
      );
    }
  };
  const impl: Record<string, (...a: number[]) => void> = {
    save: () => stack.push({ m: [...m] as M, fillStyle }),
    restore: () => {
      const s = stack.pop();
      if (s) {
        m = s.m;
        fillStyle = s.fillStyle;
      }
    },
    translate: (x, y) => {
      m = [m[0], m[1], m[2], m[3], m[4] + m[0] * x + m[2] * y, m[5] + m[1] * x + m[3] * y];
    },
    rotate: (a) => {
      const c = Math.cos(a);
      const s = Math.sin(a);
      m = [
        m[0] * c + m[2] * s,
        m[1] * c + m[3] * s,
        -m[0] * s + m[2] * c,
        -m[1] * s + m[3] * c,
        m[4],
        m[5],
      ];
    },
    scale: (x, y) => {
      m = [m[0] * x, m[1] * x, m[2] * y, m[3] * y, m[4], m[5]];
    },
    beginPath: () => {
      path = [];
    },
    moveTo: (x, y) => add(x, y),
    lineTo: (x, y) => add(x, y),
    quadraticCurveTo: (a, b, x, y) => {
      add(a, b);
      add(x, y);
    },
    bezierCurveTo: (_a, _b, _c, _d, x, y) => add(x, y),
    arcTo: (a, b, x, y) => {
      add(a, b);
      add(x, y);
    },
    rect: (x, y, w, h) => {
      add(x, y);
      add(x + w, y + h);
    },
    arc: (x, y, r) => ell(x, y, r, r),
    ellipse: (x, y, rx, ry, rot) => ell(x, y, rx, ry, rot),
    fill: () => {
      fills.push({ style: fillStyle, pts: [...path] });
    },
    fillRect: (x, y, w, h) => {
      const keep = path;
      path = [];
      add(x, y);
      add(x + w, y + h);
      fills.push({ style: fillStyle, pts: path });
      path = keep;
    },
  };
  const ctx = new Proxy(
    {},
    {
      get(_t, k: string) {
        if (k in impl) return impl[k];
        if (k === 'measureText') return () => ({ width: 1 });
        return () => undefined;
      },
      set(_t, k, v) {
        if (k === 'fillStyle') fillStyle = String(v);
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, fills };
}

/** 每個顏色角色的值＝`<角色名>` 的樣式 */
const ROLE_THEME: FloorTheme = {
  ...THEMES.clean,
  furn: Object.fromEntries(Object.keys(THEMES.clean.furn).map((k) => [k, `<${k}>`])) as never,
};

const bbox = (f: Fill) => {
  const xs = f.pts.map((p) => p[0]);
  const ys = f.pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  return { x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, area: (x1 - x0) * (y1 - y0) };
};

/** 畫一件家具（轉向照 drawItem），回傳填色的紀錄與外框中心 */
function drawIt(t: string, rot: 0 | 90 | 180 | 270 = 0) {
  const a = ASSET[t];
  const swap = rot === 90 || rot === 270;
  const item: Item = {
    id: 'x',
    t,
    x: 10,
    y: 20,
    w: swap ? a.h : a.w,
    h: swap ? a.w : a.h,
    rot,
  };
  const { ctx, fills } = fillRecorder();
  drawItem(ctx, item, ROLE_THEME, 0.05, { editor: false });
  return { fills, cx: item.x + item.w / 2, cy: item.y + item.h / 2, item };
}

type Pick = 'largest' | 'first' | 'last';
const pick = (fills: Fill[], role: string, how: Pick): Fill => {
  const list = fills.filter((f) => f.style === `<${role}>`);
  expect(list.length, `<${role}> 的填色`).toBeGreaterThan(0);
  if (how === 'first') return list[0];
  if (how === 'last') return list[list.length - 1];
  return list.reduce((p, q) => (bbox(q).area > bbox(p).area ? q : p));
};

/**
 * 有前後之分的家具：rot 0 時前端朝上。前端的標記：擋風玻璃（`water` 最大的一塊）、
 * 挖斗與鏟刀（最後一塊 `shade`）、貨叉（第一塊 `shade`）、砲管（`leafInk`）。
 */
const FRONT_UP: readonly { id: string; role: string; how: Pick }[] = [
  { id: 'suv', role: 'water', how: 'largest' },
  { id: 'van', role: 'water', how: 'largest' },
  { id: 'truck', role: 'water', how: 'largest' },
  { id: 'police_car', role: 'water', how: 'largest' },
  { id: 'ambulance', role: 'water', how: 'largest' },
  { id: 'fire_truck', role: 'water', how: 'largest' },
  { id: 'crane_truck', role: 'water', how: 'largest' },
  { id: 'locomotive', role: 'water', how: 'largest' },
  { id: 'airplane', role: 'water', how: 'largest' },
  { id: 'helicopter', role: 'water', how: 'largest' },
  { id: 'excavator', role: 'shade', how: 'last' },
  { id: 'bulldozer', role: 'shade', how: 'last' },
  { id: 'forklift', role: 'shade', how: 'first' },
  { id: 'tank_mil', role: 'leafInk', how: 'first' },
];

describe('有前後之分的新家具：rot 0 時前端朝上（7.16、3.11.7）', () => {
  for (const r of FRONT_UP)
    it(`${r.id}：前端在上半部`, () => {
      const { fills, cy } = drawIt(r.id);
      expect(bbox(pick(fills, r.role, r.how)).cy, r.id).toBeLessThan(cy);
    });

  it('尺寸不變：畫的點都在外框裡（翻轉不會改大小）', () => {
    for (const r of FRONT_UP) {
      const a = ASSET[r.id];
      const { fills } = drawIt(r.id);
      const pts = fills.flatMap((f) => f.pts);
      const ys = pts.map((p) => p[1] - 20);
      expect(Math.min(...ys), r.id).toBeGreaterThanOrEqual(-0.45);
      expect(Math.max(...ys), r.id).toBeLessThanOrEqual(a.h + 0.45);
    }
  });

  it('讀原作的檔：rot 90 的卡車車頭朝右、rot 270 朝左、rot 180 朝下、rot 0 朝上', () => {
    const raw = {
      app: 'indoor-map-maker',
      v: 1,
      tool: 'v1.14',
      name: '卡車',
      floors: [
        {
          id: 'f1',
          name: '1F',
          rooms: [],
          walls: [],
          openings: [],
          texts: [],
          items: [
            { id: 'a', t: 'truck', x: 2, y: 2, w: 5, h: 16, rot: 0 },
            { id: 'b', t: 'truck', x: 2, y: 2, w: 16, h: 5, rot: 90 },
            { id: 'c', t: 'truck', x: 2, y: 2, w: 5, h: 16, rot: 180 },
            { id: 'd', t: 'truck', x: 2, y: 2, w: 16, h: 5, rot: 270 },
          ],
        },
      ],
    };
    const p = normalizeProject(raw, isAsset);
    expect(p).not.toBeNull();
    const items = p?.floors[0].items ?? [];
    expect(items.map((i) => [i.t, i.rot])).toEqual([
      ['truck', 0],
      ['truck', 90],
      ['truck', 180],
      ['truck', 270],
    ]);
    const head = (it: Item) => {
      const { ctx, fills } = fillRecorder();
      drawItem(ctx, it, ROLE_THEME, 0.05, { editor: false });
      const b = bbox(pick(fills, 'water', 'largest'));
      return { dx: b.cx - (it.x + it.w / 2), dy: b.cy - (it.y + it.h / 2) };
    };
    const [a, b, c, d] = items.map(head);
    expect(a.dy).toBeLessThan(0);
    expect(b.dx).toBeGreaterThan(0);
    expect(c.dy).toBeGreaterThan(0);
    expect(d.dx).toBeLessThan(0);
    /* 轉向的方向和 boat（既有、船頭朝上）一樣：同一個 rot，兩者的前端在同一邊 */
    expect(Math.abs(b.dy)).toBeLessThan(1);
    expect(Math.abs(a.dx)).toBeLessThan(1);
  });
});

describe('其他有方向的新家具：rot 0 時的方向和原作一致（7.16、3.11.7）', () => {
  it('往地下的樓梯：往下走的箭頭指向下面', () => {
    const { fills, cy } = drawIt('stairs_down');
    expect(bbox(pick(fills, 'chalk', 'first')).cy).toBeGreaterThan(cy);
  });

  it('戶外逃生梯：左邊的一跑往下、右邊的一跑往上（箭頭左低右高）', () => {
    const { fills } = drawIt('fire_escape');
    const heads = fills.filter((f) => f.style === '<chalk>').map(bbox);
    expect(heads.length).toBe(2);
    const [l, r] = heads.sort((p, q) => p.cx - q.cx);
    expect(l.cy).toBeGreaterThan(r.cy);
  });

  it('驗票閘門：通行的箭頭指向上面', () => {
    const { fills } = drawIt('ticket_gate');
    const arrows = fills.filter((f) => f.style === '<leaf>');
    expect(arrows.length).toBeGreaterThan(0);
    for (const f of arrows) {
      const ys = f.pts.map((p) => p[1]);
      const apex = f.pts.find((p) => p[1] === Math.min(...ys));
      const base = ys.filter((y) => y === Math.max(...ys));
      expect(base.length).toBe(2);
      expect(apex?.[1]).toBeLessThan(base[0]);
    }
  });

  it('手電筒：光往右（光束在右半部）；鐵砧：尖角在右邊（砧面的洞在左邊）', () => {
    const f = drawIt('flashlight');
    expect(bbox(pick(f.fills, 'gold', 'first')).cx).toBeGreaterThan(f.cx);
    const a = drawIt('anvil');
    expect(bbox(pick(a.fills, 'ink', 'last')).cx).toBeLessThan(a.cx);
  });

  it('護欄：立柱在上面（背面）、欄板在下面（朝向道路的一面）', () => {
    const { fills, cy } = drawIt('guardrail');
    expect(bbox(pick(fills, 'shade', 'first')).cy).toBeLessThan(cy);
  });

  it('拖行的痕跡：起點細、終點粗，粗的一頭在下面', () => {
    const { fills } = drawIt('drag_marks');
    for (const f of fills.filter((x) => x.style === '<blood>')) {
      const ys = f.pts.map((p) => p[1]);
      const lo = Math.min(...ys);
      const hi = Math.max(...ys);
      const spread = (y: number) => {
        const xs = f.pts.filter((p) => Math.abs(p[1] - y) < 1e-6).map((p) => p[0]);
        return Math.max(...xs) - Math.min(...xs);
      };
      expect(spread(hi)).toBeGreaterThan(spread(lo));
    }
  });

  it('斑馬線：條紋沿著 x（和原作一樣，路在橫向時條紋和車流同向）', () => {
    const { fills } = drawIt('crosswalk');
    const bars = fills.filter((f) => f.style === '<paper>').map(bbox);
    expect(bars.length).toBeGreaterThanOrEqual(3);
    for (const b of bars) expect(b.x1 - b.x0).toBeGreaterThan(b.y1 - b.y0);
    /* 條紋都在外框裡 */
    const a = ASSET.crosswalk;
    const { item } = drawIt('crosswalk');
    for (const b of bars) {
      expect(b.y0).toBeGreaterThanOrEqual(item.y);
      expect(b.y1).toBeLessThanOrEqual(item.y + a.h);
    }
  });

  it('每一種新家具都有畫法（沒有因為包一層而漏掉）', () => {
    for (const r of FRONT_UP) expect(typeof FURNITURE_DRAW[r.id]).toBe('function');
  });
});
