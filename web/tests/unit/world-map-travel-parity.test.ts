/**
 * 世界地圖產生器的旅程概算（規格 F76～F81、3.16）和原作並排比對：
 * 原作的 `model.js`、`render.js`（使用者上傳的 KIIN ワールドマップ制作スタジオ v1.0）只當資料讀進來，在 Node 裡呼叫它的純函式
 * （曲線的取樣、旅程的計算），和本站的結果逐項比。原作的程式不在 repo 裡（不能再散布）：
 * 預設讀 `/home/user/upstream/KIIN_world-atelier-v1.0/`（環境變數 WORLD_MAP_UPSTREAM 可以換），沒有時整組略過。
 */
import { describe, expect, it } from 'vitest';
import { createRandom } from '@/core/timeline/random';
import { newObject, newPath } from '@/tools/world-map/model/factory';
import { sampleCurve } from '@/tools/world-map/model/geometry';
import { sampleDoc } from '@/tools/world-map/model/samples';
import { gridOf } from '@/tools/world-map/model/terrain';
import { type TravelResult, travelMetrics } from '@/tools/world-map/model/travel';
import type { MapObject, MapPath, Pt, WorldDoc } from '@/tools/world-map/model/types';

interface NodeFs {
  existsSync(p: string): boolean;
  readFileSync(p: string, enc: 'utf8'): string;
}
const dyn = <T>(name: string): Promise<T> => import(/* @vite-ignore */ name) as Promise<T>;
const fs = await dyn<NodeFs>('node:fs');
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
const DIR = env?.WORLD_MAP_UPSTREAM ?? '/home/user/upstream/KIIN_world-atelier-v1.0';
const HAVE = fs.existsSync(`${DIR}/model.js`) && fs.existsSync(`${DIR}/render.js`);

type OriginalPt = { x: number; y: number };
interface OriginalApi {
  model: {
    travelMetrics: (
      d: unknown,
      p: unknown,
      pts: OriginalPt[],
      rivers: { width: number; points: OriginalPt[] }[],
    ) => {
      km: number;
      days: number | null;
      pureDays: number | null;
      warning: string;
      hazardCount: number;
      infraCount: number;
      bridged: boolean;
      portUsed: boolean;
      mode: string;
      speed: number;
      difficulty: number;
      reason: string;
      manual: boolean;
      factor: number;
      terrain: number[];
    };
  };
  render: { sampleCurve: (pts: OriginalPt[], smooth: boolean) => OriginalPt[] };
}

function loadOriginal(): OriginalApi {
  const root: Record<string, unknown> = {};
  for (const f of ['model.js', 'render.js'])
    new Function('window', 'module', fs.readFileSync(`${DIR}/${f}`, 'utf8'))(root, undefined);
  return {
    model: root.WorldModel as OriginalApi['model'],
    render: root.WorldRender as OriginalApi['render'],
  };
}

/** 原作的訊息 → 本站的理由代碼 */
function reasonCode(msg: string): string | null {
  if (!msg) return null;
  if (msg.includes('通行不可の指定')) return 'blocked';
  if (msg.includes('海・湖を横切る')) return 'water';
  if (msg.includes('航行可否')) return 'ship';
  if (msg.includes('橋のない川')) return 'river';
  if (msg.includes('経路の長さがない')) return 'length';
  return `?${msg}`;
}

function toOriginalDoc(doc: WorldDoc) {
  return {
    terrain: [...doc.terrain].map(Number),
    ground: [...doc.ground].map(Number),
    objects: doc.objects.map((o) => ({
      id: o.id,
      key: o.kind,
      x: o.x,
      y: o.y,
      size: o.size,
      rotation: o.rotation,
    })),
    settings: { kmPer100: doc.settings.kmPer100 },
  };
}

function toOriginalPath(p: MapPath) {
  return {
    id: p.id,
    kind: p.kind,
    points: p.points,
    smooth: p.smooth,
    width: p.width,
    simpleCalc: p.simpleCalc,
    travelMode: p.travelMode,
    travelDifficulty: p.difficulty,
    travelAccess: p.access,
    ...(p.dailyKm !== undefined ? { dailyKm: p.dailyKm } : {}),
  };
}

function ours(doc: WorldDoc, p: MapPath): TravelResult {
  const rivers = p.simpleCalc
    ? []
    : doc.paths
        .filter((q) => q.kind === 'river' && q.id !== p.id)
        .map((q) => ({ id: q.id, width: q.width, points: sampleCurve(q.points, q.smooth) }));
  return travelMetrics(
    gridOf(doc),
    doc.objects,
    doc.settings.kmPer100,
    p,
    sampleCurve(p.points, p.kind === 'wall' ? false : p.smooth),
    rivers,
  );
}

function theirs(api: OriginalApi, doc: WorldDoc, p: MapPath) {
  const R = api.render;
  const rivers = p.simpleCalc
    ? []
    : doc.paths
        .filter((q) => q.kind === 'river' && q.id !== p.id)
        .map((q) => ({ width: q.width, points: R.sampleCurve(q.points, q.smooth) }));
  return api.model.travelMetrics(
    toOriginalDoc(doc),
    toOriginalPath(p),
    R.sampleCurve(p.points, p.kind === 'wall' ? false : p.smooth),
    rivers,
  );
}

const close = (a: number | null, b: number | null) =>
  a === null || b === null ? a === b : Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

function compare(api: OriginalApi, doc: WorldDoc, p: MapPath, label: string) {
  const o = ours(doc, p);
  const t = theirs(api, doc, p);
  const where = `${label}（${p.kind}・${o.mode}${p.simpleCalc ? '・只用距離' : ''}・${p.access}）`;
  expect(close(o.km, t.km), `${where} km ${o.km} / ${t.km}`).toBe(true);
  expect(close(o.days, t.days), `${where} 日數 ${o.days} / ${t.days}`).toBe(true);
  expect(close(o.pureDays, t.pureDays), `${where} 單純距離 ${o.pureDays} / ${t.pureDays}`).toBe(
    true,
  );
  expect(close(o.factor, t.factor), `${where} 係數 ${o.factor} / ${t.factor}`).toBe(true);
  expect(o.reason, `${where} 理由`).toBe(reasonCode(t.reason));
  expect(o.cliffKm > 0, `${where} 險峻的提醒`).toBe(!!t.warning);
  expect(
    [o.hazards.length, o.infra.length, o.bridged, o.portUsed],
    `${where} 素材・橋・港`,
  ).toEqual([t.hazardCount, t.infraCount, t.bridged, t.portUsed]);
  expect([o.mode, o.speed, o.difficulty, o.manual], `${where} 方式`).toEqual([
    t.mode,
    t.speed,
    t.difficulty,
    t.manual,
  ]);
  o.terrain.forEach((v, i) => {
    expect(close(v, t.terrain[i]), `${where} 地形 ${i}`).toBe(true);
  });
  return { o, t };
}

const P = (list: [number, number][]): Pt[] => list.map(([x, y]) => ({ x, y }));
function obj(kind: string, x: number, y: number, patch: Partial<MapObject> = {}): MapObject {
  return { ...newObject(kind, x, y), ...patch };
}
function path(
  kind: MapPath['kind'],
  pts: [number, number][],
  patch: Partial<MapPath> = {},
): MapPath {
  return { ...newPath(kind, P(pts)), ...patch };
}

describe.runIf(HAVE)('旅程概算：和原作並排比對（F76～F81）', () => {
  const api = HAVE ? loadOriginal() : (null as unknown as OriginalApi);

  it('曲線的取樣和原作一致（平滑、折線）', () => {
    const doc = sampleDoc('continent');
    for (const p of doc.paths)
      for (const smooth of [true, false]) {
        const a = sampleCurve(p.points, smooth);
        const b = api.render.sampleCurve(p.points, smooth);
        expect(a.length).toBe(b.length);
        a.forEach((q, i) => {
          expect(q.x).toBeCloseTo(b[i].x, 9);
          expect(q.y).toBeCloseTo(b[i].y, 9);
        });
      }
  });

  it('範本的路線（越嶺的街道、川、海岸的街道）：徒步、騎乘、船、只用距離、可以通行、不能通行、難度、自訂日距', () => {
    const doc = sampleDoc('continent');
    let n = 0;
    for (const p of doc.paths)
      for (const travelMode of [undefined, 'walk', 'horse', 'ship'] as const)
        for (const access of ['auto', 'passable', 'blocked'] as const)
          for (const simpleCalc of [false, true]) {
            compare(api, doc, { ...p, travelMode, access, simpleCalc, difficulty: 'hard' }, '範本');
            n++;
          }
    compare(api, doc, { ...doc.paths[1], dailyKm: 42, difficulty: 'easy' }, '自訂日距');
    expect(n).toBe(96);
  });

  it('山地的深度、難所素材的密集、街道的據點、險峻的提醒', () => {
    const doc = sampleDoc('continent');
    /* 越嶺古道旁邊擺一群山、火山、森林，路上的據點 */
    doc.objects = [
      ...doc.objects,
      obj('mountain', 700, 410, { size: 60 }),
      obj('range', 730, 395),
      obj('volcano', 760, 420),
      obj('mountain', 690, 440),
      obj('forest', 640, 425),
      obj('marsh', 820, 380),
      obj('inn', 620, 425),
      obj('cave', 860, 360, { size: 20 }),
    ];
    const road = doc.paths[1];
    for (const travelMode of ['walk', 'horse'] as const) {
      const { o } = compare(api, doc, { ...road, travelMode }, '難所');
      expect(o.hazards.length).toBeGreaterThan(3);
      expect(o.infra.length).toBeGreaterThan(0);
      expect(o.cliffKm).toBeGreaterThan(0);
    }
    /* 同樣的線當成川以外的種類（據點補正只有街道） */
    compare(api, doc, { ...road, kind: 'border' }, '難所・國界線');
  });

  it('橋：蓋住的渡河可以通行；沒有橋的川不能算；一座橋不能讓另一條川通行', () => {
    const doc = sampleDoc('continent');
    /* 赤砂河（780,560）→（1110,812）；一條橫越它的街道 */
    const across = path('road', [
      [760, 720],
      [900, 640],
      [1000, 600],
    ]);
    doc.paths = [...doc.paths, across];
    let r = compare(api, doc, across, '沒有橋');
    expect(r.o.reason).toBe('river');
    /* 在交叉的地方放一座橋（各種角度）：渡得過去；放在遠處的橋沒用 */
    for (const rotation of [0, 30, 60, 90]) {
      doc.objects = [...sampleDoc('continent').objects, obj('bridge', 885, 648, { rotation })];
      r = compare(api, doc, across, `橋 ${rotation}°`);
      expect([r.o.reason, r.o.bridged]).toEqual([null, true]);
    }
    doc.objects = [...sampleDoc('continent').objects, obj('bridge', 1060, 790)];
    r = compare(api, doc, across, '遠處的橋');
    expect(r.o.reason).toBe('river');
    doc.objects = [...sampleDoc('continent').objects, obj('bridge', 885, 648)];
    /* 第二條川也橫越：一座橋不夠 */
    const second = path('river', [
      [960, 560],
      [940, 640],
      [930, 700],
    ]);
    doc.paths = [...doc.paths, second];
    compare(api, doc, across, '兩條川');
    /* 指定可以通行時照算 */
    compare(api, doc, { ...across, access: 'passable' }, '可以通行');
  });

  it('航路與港口：沿岸的港口上下岸、經過陸地不能算', () => {
    const doc = sampleDoc('islands');
    const sea = doc.paths.filter((p) => p.kind === 'sea');
    expect(sea.length).toBe(2);
    for (const p of sea) {
      compare(api, doc, p, '航路');
      compare(api, doc, { ...p, travelMode: 'walk' }, '航路・徒步');
    }
    /* 港口改到航路的起點附近：可以上下岸 */
    const ports = doc.objects.filter((o) => o.kind === 'port');
    for (const port of ports) {
      const p = path('sea', [
        [port.x, port.y],
        [port.x + 160, port.y + 40],
        [port.x + 300, port.y],
      ]);
      compare(api, doc, p, `港口 ${port.name}`);
    }
    for (const river of doc.paths.filter((p) => p.kind === 'road'))
      compare(api, doc, { ...river, travelMode: 'ship' }, '街道當船');
  });

  it('自動產生的世界：每條道路、隨機的路線與素材（120 組）', () => {
    let n = 0;
    for (const id of ['continent', 'islands', 'sketch'] as const) {
      const doc = sampleDoc(id);
      const r = createRandom(`travel-${id}`);
      const kinds = [
        'mountain',
        'range',
        'volcano',
        'forest',
        'pine',
        'hill',
        'marsh',
        'ruins',
        'cave',
        'mine',
        'dungeon',
        'cactus',
        'bridge',
        'port',
        'town',
        'inn',
        'fort',
        'castle',
      ];
      for (let i = 0; i < 60; i++)
        doc.objects.push(
          obj(r.pick(kinds), r.range(80, 1450), r.range(80, 880), {
            size: r.int(16, 110),
            rotation: r.int(-180, 180),
          }),
        );
      doc.paths.push(
        path(
          'river',
          [
            [r.range(200, 1300), r.range(150, 800)],
            [r.range(200, 1300), r.range(150, 800)],
            [r.range(200, 1300), r.range(150, 800)],
          ],
          { width: r.int(2, 14) },
        ),
      );
      for (let k = 0; k < 40; k++) {
        const kind = r.pick(['road', 'sea', 'river', 'border'] as const);
        const pts: [number, number][] = Array.from({ length: r.int(2, 6) }, () => [
          r.range(60, 1480),
          r.range(60, 900),
        ]);
        compare(
          api,
          doc,
          path(kind, pts, {
            smooth: r.next() < 0.7,
            travelMode: r.pick([undefined, 'walk', 'horse', 'ship'] as const),
            difficulty: r.pick(['easy', 'normal', 'hard', 'extreme'] as const),
            access: r.pick(['auto', 'auto', 'passable', 'blocked'] as const),
            simpleCalc: r.next() < 0.2,
            width: r.int(1, 16),
          }),
          `${id} 隨機 ${k}`,
        );
        n++;
      }
    }
    expect(n).toBe(120);
  });

  it('長度是 0 的路線', () => {
    const doc = sampleDoc('continent');
    compare(
      api,
      doc,
      path('road', [
        [500, 500],
        [500, 500],
      ]),
      '長度 0',
    );
  });
});

describe('旅程概算：本站的數值（不需要原作）', () => {
  it('平原上的徒步：距離 ÷ 30，係數 1', () => {
    const doc = sampleDoc('sketch');
    const p = path('road', [
      [1000, 380],
      [1200, 380],
    ]);
    const r = ours(doc, p);
    expect(r.km).toBeCloseTo(100);
    expect(r.days).toBeCloseTo(100 / 30);
    expect(r.factor).toBeCloseTo(1);
    expect(r.terrain[1]).toBeCloseTo(100);
  });
  it('只用距離計算：不看地形與不能通行', () => {
    const doc = sampleDoc('continent');
    const r = ours(doc, {
      ...doc.paths[1],
      simpleCalc: true,
      access: 'blocked',
      difficulty: 'extreme',
    });
    expect(r.reason).toBeNull();
    expect(r.days).toBeCloseTo((r.km / 30) * 2);
  });
});
