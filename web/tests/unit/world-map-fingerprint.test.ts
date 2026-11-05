/**
 * 世界地圖產生器：計算結果的指紋（規格 D16）。地形與町的產生、山與森林的排法、氣候、港口的方向、曲線的取樣、
 * 內側的城牆、城牆的畫法、旅程概算——改寫內部的寫法時，同樣的輸入一定得到同樣的結果。
 *
 * 指紋是把結果（小數取 9 位有效數字）串起來的 FNV-1a 雜湊；數值真的要改時，同時改這裡並在規格寫明。
 */
import { describe, expect, it } from 'vitest';
import { createRandom } from '@/core/timeline/random';
import { drawWall } from '@/tools/world-map/draw/walls';
import { climateAt, snowSampler } from '@/tools/world-map/model/climate';
import { blankDoc, newObject, newPath } from '@/tools/world-map/model/factory';
import { generateTerrain, generateWorld, populateWorld } from '@/tools/world-map/model/generate';
import {
  centroid,
  innerWallPoints,
  pointInPolygon,
  riverRadii,
  sampleCurve,
} from '@/tools/world-map/model/geometry';
import { coastSide } from '@/tools/world-map/model/ports';
import { layoutMarks, mountainScale, treeScale } from '@/tools/world-map/model/relief';
import { SAMPLE_IDS, sampleDoc } from '@/tools/world-map/model/samples';
import { gridOf, outlineInto, traceOutlines } from '@/tools/world-map/model/terrain';
import { mountainDepth, travelForPath } from '@/tools/world-map/model/travel';
import {
  CELL,
  FOREST,
  MAP_SIZE_IDS,
  MAP_SIZES,
  type MapPath,
  MOUNTAIN,
  type Pt,
  type WorldDoc,
} from '@/tools/world-map/model/types';

const SEEDS = [702, 2402, 6006, 1206, 1, 5, 99991, 123457, 3, 4];

function canon(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toPrecision(9);
  if (v === null || v === undefined) return String(v);
  if (typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v);
  if (ArrayBuffer.isView(v)) return canon(Array.from(v as unknown as ArrayLike<number>));
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v instanceof Set) return canon([...v]);
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${k}:${canon(o[k])}`)
    .join(',')}}`;
}

function fp(v: unknown): string {
  const s = canon(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16).padStart(8, '0')}:${s.length}`;
}

const idSeq = () => {
  let n = 0;
  return () => `id${n++}`;
};

const worlds = (): WorldDoc[] => {
  const out: WorldDoc[] = [];
  for (const size of MAP_SIZE_IDS)
    for (const seed of SEEDS.slice(0, 4)) {
      const { cols, rows } = MAP_SIZES[size];
      out.push(generateWorld(blankDoc(cols, rows), seed, null, idSeq()));
    }
  return out;
};

describe('計算結果的指紋（D16）', () => {
  it('地形的產生（10 個種子 × 4 種尺寸）', () => {
    const all = MAP_SIZE_IDS.flatMap((size) =>
      SEEDS.map((seed) => {
        const { cols, rows } = MAP_SIZES[size];
        const t = generateTerrain(seed, cols, rows);
        return [t.family, t.terrain, t.ground];
      }),
    );
    expect(fp(all)).toBe('761be9ed:1556801');
  });

  it('町與道路（10 個種子 × 4 種尺寸）', () => {
    const all = MAP_SIZE_IDS.flatMap((size) =>
      SEEDS.map((seed) => {
        const { cols, rows } = MAP_SIZES[size];
        const t = generateTerrain(seed, cols, rows);
        const p = populateWorld(t.terrain, t.ground, cols, rows, seed, idSeq());
        return [
          p.objects.map((o) => [o.kind, o.name, o.x, o.y]),
          p.paths.map((q) => [q.kind, q.name, q.smooth, q.points]),
        ];
      }),
    );
    expect(fp(all)).toBe('e3fff0e7:32968');
  });

  it('山與森林的排法、大小', () => {
    const all = worlds().map((d) => {
      const g = gridOf(d);
      return ([FOREST, MOUNTAIN] as const).map((v) =>
        layoutMarks(g.terrain, g.cols, g.rows, v, d.seed).map((m, k) => [
          [m.x, m.y, m.edge, m.n, m.depth, m.extra, m.wood, m.mixed, m.scale],
          v === FOREST ? treeScale(m, (k % 7) / 7) : mountainScale(m, (k % 5) / 5),
        ]),
      );
    });
    expect(fp(all)).toBe('609c8777:283864');
  });

  it('氣候與積雪、港口的方向、山地的深度', () => {
    const all = worlds().map((d) => {
      const g = gridOf(d);
      const snow = snowSampler(g);
      const r = createRandom(d.seed);
      const pts = Array.from({ length: 160 }, () => ({
        x: r.next() * g.cols * CELL,
        y: r.next() * g.rows * CELL,
      }));
      return [
        pts.map((p) => [climateAt(g, p.x, p.y), snow(p.x, p.y), coastSide(g, p.x, p.y)]),
        mountainDepth(g.terrain, g.cols, g.rows),
      ];
    });
    expect(fp(all)).toBe('224dfab1:406510');
  });

  it('曲線的取樣、川的粗細、面積重心、內側的城牆', () => {
    const r = createRandom(4242);
    const out: unknown[] = [];
    for (let k = 0; k < 120; k++) {
      const n = 2 + Math.floor(r.next() * 9);
      const cx = 200 + r.next() * 800;
      const cy = 200 + r.next() * 500;
      const star = k % 3 === 0;
      const pts: Pt[] = Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + r.next() * 0.3;
        const rad = (star && i % 2 ? 40 : 120) + r.next() * 140;
        return k % 2
          ? { x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad }
          : { x: r.next() * 1500, y: r.next() * 900 };
      });
      const smooth = sampleCurve(pts, true);
      out.push([
        smooth,
        sampleCurve(pts, false),
        riverRadii(smooth, 1 + (k % 9)),
        centroid(pts),
        innerWallPoints(pts),
        pointInPolygon({ x: cx, y: cy }, pts),
      ]);
    }
    for (const id of SAMPLE_IDS)
      for (const reg of sampleDoc(id).regions) out.push(innerWallPoints(reg.points));
    expect(fp(out)).toBe('fd8565ca:1477775');
  });

  it('旅程概算（產生的道路、範例的路線、隨機的路線與素材）', () => {
    const out: unknown[] = [];
    const run = (d: WorldDoc, extra: MapPath[]) => {
      const g = gridOf(d);
      const index = (id: string) => d.objects.findIndex((o) => o.id === id);
      for (const p of [...d.paths, ...extra]) {
        for (const variant of [
          {},
          { travelMode: 'horse' as const },
          { travelMode: 'ship' as const },
          { simpleCalc: true },
          { access: 'passable' as const, difficulty: 'hard' as const },
        ]) {
          const q = { ...p, ...variant };
          const t = travelForPath(d, g, q);
          out.push({ ...t, hazards: t.hazards.map(index), infra: t.infra.map(index) });
        }
      }
    };
    for (const d of worlds().slice(0, 8)) run(d, []);
    for (const id of SAMPLE_IDS) run(sampleDoc(id), []);
    const r = createRandom(777);
    const ids = idSeq();
    for (const d of worlds().slice(8)) {
      const W = d.cols * CELL;
      const H = d.rows * CELL;
      const kinds = [
        'bridge',
        'port',
        'town',
        'inn',
        'volcano',
        'range',
        'mountain',
        'marsh',
        'forest',
        'ruins',
        'cave',
        'hill',
        'cactus',
      ];
      for (let k = 0; k < 40; k++) {
        const o = newObject(kinds[k % kinds.length], r.next() * W, r.next() * H, ids);
        o.size = 20 + r.next() * 60;
        o.rotation = Math.round(r.next() * 360 - 180);
        d.objects.push(o);
      }
      for (let k = 0; k < 3; k++) {
        const pts = Array.from({ length: 3 + Math.floor(r.next() * 5) }, () => ({
          x: r.next() * W,
          y: r.next() * H,
        }));
        const river = newPath('river', pts, ids);
        river.width = 2 + Math.floor(r.next() * 10);
        d.paths.push(river);
      }
      const extra = Array.from({ length: 6 }, (_, k) =>
        newPath(
          k % 3 === 0 ? 'sea' : 'road',
          Array.from({ length: 2 + Math.floor(r.next() * 5) }, () => ({
            x: r.next() * W,
            y: r.next() * H,
          })),
          ids,
        ),
      );
      run(d, extra);
    }
    expect(fp(out)).toBe('128782d6:178091');
  });

  it('海岸線與地形的外框（方格・圓角、自由筆刷）', () => {
    const out: unknown[] = [];
    const rec: unknown[] = [];
    const sink = {
      moveTo: (x: number, y: number) => rec.push(['M', x, y]),
      lineTo: (x: number, y: number) => rec.push(['L', x, y]),
      quadraticCurveTo: (a: number, b: number, x: number, y: number) => rec.push(['Q', a, b, x, y]),
      arcTo: (a: number, b: number, c: number, d: number, r: number) =>
        rec.push(['A', a, b, c, d, r]),
      closePath: () => rec.push(['Z']),
    };
    for (const d of worlds()) {
      const g = gridOf(d);
      for (const test of [
        (v: number) => v > 0,
        (v: number) => v === FOREST,
        (v: number) => v === MOUNTAIN,
      ]) {
        const loops = traceOutlines(g.terrain, g.cols, g.rows, test);
        out.push(loops);
        outlineInto(loops, 'grid', sink);
        outlineInto(loops, 'free', sink);
      }
    }
    out.push(rec);
    expect(fp(out)).toBe('f4ca3ceb:944413');
  });

  it('城牆的畫法（畫布的呼叫順序與參數）', () => {
    const calls: unknown[] = [];
    const ctx = new Proxy(
      {},
      {
        get(_t, key) {
          return (...args: unknown[]) => calls.push([String(key), ...args]);
        },
        set(_t, key, value) {
          calls.push([`=${String(key)}`, value]);
          return true;
        },
      },
    ) as unknown as CanvasRenderingContext2D;
    const d = generateWorld(blankDoc(128, 80), 5, null, idSeq());
    const snow = snowSampler(gridOf(d));
    const r = createRandom(99);
    for (let k = 0; k < 12; k++) {
      const pts = Array.from({ length: 2 + (k % 5) }, () => ({
        x: r.next() * 1500,
        y: r.next() * 900,
      }));
      drawWall(
        ctx,
        pts,
        k % 3 === 0,
        2 + (k % 6),
        k % 2 ? 'night' : 'parchment',
        k % 4 === 1,
        k % 2 ? snow : null,
      );
    }
    expect(fp(calls)).toBe('e19d5e6f:1500084');
  });
});
