/**
 * 斷面圖產生器（第二批）：橫向的連結車廂——排法、上限、車廂裡的區域（整數格、每間至少 3 格）、機關車的蒸氣／電氣、
 * 換種類、床下的祕密空間、外景、PL 用的偽裝（記錄畫布的指令雜湊）、專案檔往返、原作的橫向作業 JSON。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { parseProject, serializeProject } from '@/core/storage';
import { exportSize } from '@/tools/cross-section/draw/export';
import { drawDoc } from '@/tools/cross-section/draw/scene';
import { blankTrainDoc, ensureTrain } from '@/tools/cross-section/model/factory';
import { fromOriginal, normalizeDoc } from '@/tools/cross-section/model/normalize';
import { makeNote, newFixture } from '@/tools/cross-section/model/ops';
import { sampleDoc, TRAIN_SAMPLE_IDS } from '@/tools/cross-section/model/samples';
import { ROW_H, trainLayoutOf, twoRows, underId } from '@/tools/cross-section/model/trainLayout';
import {
  blankTrain,
  coupleCar,
  detachCar,
  mergeCarRoom,
  moveCar,
  moveCarDivider,
  placeTrainNote,
  setCarType,
  setLocoKind,
  settleTrain,
  setUnder,
  splitCarRoom,
} from '@/tools/cross-section/model/trainOps';
import {
  type Audience,
  CAR_TYPES,
  type EnvId,
  MAX_CAR_ROOMS,
  MAX_CARS,
  MIN_CAR_ROOM,
  SCENERIES,
  type SectionDoc,
  type Train,
} from '@/tools/cross-section/model/types';
import {
  installRecordingDocument,
  recordingCanvas,
  resetRecordingIds,
} from '../helpers/recordingCanvas';

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

function hash(doc: SectionDoc, audience: Audience, env: EnvId = 'day', flood = 0): string {
  restore ??= installRecordingDocument();
  resetRecordingIds();
  const c = recordingCanvas(800, 600);
  const ctx = c.getContext('2d');
  ctx.setTransform(10, 0, 0, 10, 60, 60);
  drawDoc(ctx, doc, { audience, env, flood, crop: 'sheet' });
  return c.hash;
}

/** 每節的區域：排滿 0～14、整數格、每間至少 3 格、最多 4 間 */
function expectTidy(t: Train) {
  for (const car of t.cars) {
    const row = [...car.rooms].sort((a, b) => a.x0 - b.x0);
    expect(row.length).toBeGreaterThan(0);
    expect(row.length).toBeLessThanOrEqual(MAX_CAR_ROOMS);
    expect(row[0].x0).toBe(0);
    expect(row[row.length - 1].x1).toBe(14);
    row.forEach((r, i) => {
      expect(Number.isInteger(r.x0) && Number.isInteger(r.x1)).toBe(true);
      expect(r.x1 - r.x0).toBeGreaterThanOrEqual(MIN_CAR_ROOM);
      if (i) expect(r.x0).toBe(row[i - 1].x1);
    });
  }
}

describe('排法與幾何', () => {
  it('自動：4 節以上折成兩排（多的一節在上排）；兩段折返 2 節以上就折；一列不折', () => {
    expect([1, 2, 3, 4, 7, 10].map((n) => twoRows('auto', n))).toEqual([
      false,
      false,
      false,
      true,
      true,
      true,
    ]);
    expect([1, 2, 3].map((n) => twoRows('folded', n))).toEqual([false, true, true]);
    expect(twoRows('single', 10)).toBe(false);
    const t = blankTrain();
    for (const type of ['coach', 'dining', 'lounge', 'observation'] as const) coupleCar(t, type);
    const T = trainLayoutOf(t);
    expect(T.folded).toBe(true);
    expect(T.rows.map((r) => r.cars.map((c) => c.index + 1))).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7],
    ]);
  });

  it('每節 14 × 6 格、隔 1 格；一排 12 格（車頂 2＋車廂 6＋床下 2＋軌道 2）、兩排之間 2 格；世界左右 3、上下 2', () => {
    const t = blankTrain();
    const T = trainLayoutOf(t);
    expect(ROW_H).toBe(12);
    expect(T.cars.map((c) => [c.x, c.y, c.w, c.h])).toEqual([
      [0, 2, 14, 6],
      [15, 2, 14, 6],
      [30, 2, 14, 6],
    ]);
    expect(T.world).toEqual({ x: -3, y: -2, w: 50, h: 16 });
    expect(T.couplers.map((c) => [c.x, c.w])).toEqual([
      [14, 1],
      [29, 1],
    ]);
    for (let i = 0; i < 3; i++) coupleCar(t, 'coach');
    const F = trainLayoutOf(t);
    expect(F.rows.map((r) => [r.y, r.cabin, r.floor, r.rail])).toEqual([
      [0, 2, 8, 10],
      [14, 16, 22, 24],
    ]);
    expect(F.world).toEqual({ x: -3, y: -2, w: 50, h: 30 });
    /* 匯出的尺寸：VTT 的格子是地圖本體的整數格 */
    const d = blankTrainDoc();
    d.train = t;
    expect(exportSize(d, 'vtt', 2400, 48)).toEqual({
      width: 50 * 48,
      height: 30 * 48,
      cols: 50,
      rows: 30,
    });
    expect(exportSize(d, 'sheet', 2400, 48).width).toBe(2400);
  });

  it('床下的祕密空間：前後轉向架之間 8 × 2 格；機關車沒有', () => {
    const t = blankTrain();
    t.cars[1].under = true;
    t.cars[0].under = true;
    settleTrain(t);
    expect(t.cars[0].under).toBe(false);
    const T = trainLayoutOf(t);
    expect(T.unders.map((u) => [u.room.id, u.x, u.y, u.w, u.h])).toEqual([
      [underId(t.cars[1].id), 18, 8, 8, 2],
    ]);
  });
});

describe('車廂的增減與區域', () => {
  it('最多 10 節、至少 1 節；挪位置；拿掉時設備與備註一起拿掉', () => {
    const t = blankTrain();
    while (t.cars.length < MAX_CARS) expect(coupleCar(t, 'berth')).not.toBeNull();
    expect(coupleCar(t, 'berth')).toBeNull();
    const victim = t.cars[2];
    const n = makeNote('x');
    placeTrainNote(t, n, trainLayoutOf(t).cars[2].x + 3, 5);
    t.notes.push(n);
    expect(n.room).toBe(victim.rooms[0].id);
    expect(detachCar(t, victim.id)).toBe(true);
    expect(t.items.some((it) => victim.rooms.some((r) => r.id === it.room))).toBe(false);
    expect(t.notes).toHaveLength(0);
    while (t.cars.length > 1) detachCar(t, t.cars[0].id);
    expect(detachCar(t, t.cars[0].id)).toBe(false);
    const u = blankTrain();
    const [a, b] = u.cars;
    expect(moveCar(u, b.id, -1)).toBe(true);
    expect(u.cars[0]).toBe(b);
    expect(u.cars[1]).toBe(a);
    expect(moveCar(u, b.id, -1)).toBe(false);
  });

  it('9 種車廂的預設都排得滿；換種類時區域與設備換掉', () => {
    const t = blankTrain();
    for (const type of CAR_TYPES) setCarType(t, t.cars[1].id, type);
    for (const type of CAR_TYPES) coupleCar(t, type);
    expectTidy(t);
    const car = t.cars[1];
    setCarType(t, car.id, 'dining');
    expect(car.rooms.map((r) => r.name)).toEqual(['廚房', '用餐區']);
    expect(
      t.items.filter((it) => car.rooms.some((r) => r.id === it.room)).map((it) => it.kind),
    ).toContain('diner');
  });

  it('多分一間（最寬的那間從中間分開，要 6 格以上）／少一間（右邊兩間合併）；最多 4 間；祕密區域的東西合併時改成 GM 專用', () => {
    const t = blankTrain();
    const car = t.cars[1];
    expect(car.rooms.map((r) => r.x1 - r.x0)).toEqual([10, 4]);
    expect(splitCarRoom(t, car.id)).toBe('ok');
    expect(car.rooms.map((r) => r.x1 - r.x0)).toEqual([5, 5, 4]);
    expect(splitCarRoom(t, car.id)).toBe('narrow');
    while (car.rooms.length > 1) mergeCarRoom(t, car.id);
    for (let i = 0; i < 3; i++) expect(splitCarRoom(t, car.id)).toBe('ok');
    expect(car.rooms).toHaveLength(4);
    expect(splitCarRoom(t, car.id)).toBe('max');
    expectTidy(t);
    while (car.rooms.length > 1) expect(mergeCarRoom(t, car.id).ok).toBe(true);
    expect(mergeCarRoom(t, car.id).ok).toBe(false);
    const u = blankTrain();
    const c = u.cars[2];
    const [left, right] = [...c.rooms].sort((a, b) => a.x0 - b.x0);
    right.secret = true;
    const moved = newFixture(right.id, 'freight', { rx: 0.5 });
    u.items.push(moved);
    const res = mergeCarRoom(u, c.id);
    expect(res).toEqual({ ok: true, leaked: true });
    const after = u.items.find((it) => it.id === moved.id);
    expect(after).toMatchObject({ room: left.id, secret: true });
  });

  it('拖曳隔間：整數格、兩邊都至少 3 格；超過 4 間的舊資料併進左鄰', () => {
    const t = blankTrain();
    const car = t.cars[1];
    const [l, r] = [...car.rooms].sort((a, b) => a.x0 - b.x0);
    expect(moveCarDivider(t, car.id, l.id, r.id, 13.4)).toBe(true);
    expect([l.x1, r.x0]).toEqual([11, 11]);
    expect(moveCarDivider(t, car.id, l.id, r.id, 1)).toBe(true);
    expect(l.x1).toBe(3);
    car.rooms = Array.from({ length: 6 }, (_, i) => ({
      id: `r${i}`,
      name: `${i}`,
      wall: 'wood' as const,
      secret: false,
      hideName: false,
      x0: i * 2,
      x1: i * 2 + 2,
    }));
    settleTrain(t);
    expectTidy(t);
    expect(car.rooms).toHaveLength(4);
  });

  it('機關車：蒸氣（後面是駕駛室）↔ 電氣（前面是駕駛室）；寬度照舊、運轉台與鍋爐的樣式跟著換', () => {
    const t = blankTrain();
    const loco = t.cars[0];
    const cab = loco.rooms.find((r) => r.role === 'cab');
    if (!cab) throw new Error('cab');
    expect([cab.x0, cab.x1]).toEqual([9, 14]);
    setLocoKind(t, 'electric');
    expect([cab.x0, cab.x1]).toEqual([0, 5]);
    const desk = t.items.find((it) => it.room === cab.id && it.kind === 'cabdesk');
    expect(desk).toMatchObject({ variant: 'electric', flip: true });
    const engine = loco.rooms.find((r) => r.role === 'engine');
    expect(engine?.name).toBe('機器室');
    expect(t.items.find((it) => it.room === engine?.id && it.kind === 'boiler')?.variant).toBe(
      'electric',
    );
    setLocoKind(t, 'steam');
    expect([cab.x0, cab.x1]).toEqual([9, 14]);
    expect(engine?.name).toBe('鍋爐室');
    expect(desk?.variant).toBeUndefined();
  });

  it('床下的祕密空間關掉時，裡面的備註留在原地改成區域外的', () => {
    const t = blankTrain();
    const car = t.cars[1];
    setUnder(t, car.id, true);
    const box = trainLayoutOf(t).unders[0];
    const n = makeNote('藏身處');
    placeTrainNote(t, n, box.x + 2, box.y + 1);
    t.notes.push(n);
    expect(n.room).toBe(underId(car.id));
    setUnder(t, car.id, false);
    expect(n.room).toBeNull();
    expect([n.x, n.y]).toEqual([box.x + 2, box.y + 1]);
  });
});

describe('畫法', () => {
  it('5 種外景、4 種環境、淹水都畫得出來，而且互相不同', () => {
    const d = blankTrainDoc();
    const t = ensureTrain(d);
    const seen = new Set<string>();
    for (const s of SCENERIES) {
      t.scenery = s;
      seen.add(hash(d, 'gm'));
    }
    expect(seen.size).toBe(5);
    const envs = new Set(
      (['day', 'night', 'blackout', 'after'] as const).map((e) => hash(d, 'gm', e)),
    );
    expect(envs.size).toBe(4);
    expect(hash(d, 'gm', 'day', 40)).not.toBe(hash(d, 'gm'));
  });

  it('PL 用：祕密區域的內容、GM 專用的設備與備註、床下的祕密空間都不影響 PL 用的圖', () => {
    const d = blankTrainDoc();
    const t = ensureTrain(d);
    const room = t.cars[2].rooms[0];
    room.secret = true;
    setUnder(t, t.cars[1].id, true);
    const base = hash(d, 'player');
    const variants: ((x: Train) => void)[] = [
      (x) => {
        x.cars[2].rooms[0].name = '改過的祕密名字';
      },
      (x) => {
        x.cars[2].rooms[0].wall = 'brick';
      },
      (x) => {
        x.items.push(newFixture(x.cars[2].rooms[0].id, 'bunk'));
      },
      (x) => {
        x.items.push({ ...newFixture(x.cars[1].rooms[0].id, 'settee'), secret: true });
      },
      (x) => {
        const n = { ...makeNote('GM 的'), secret: true };
        placeTrainNote(x, n, 20, 5);
        x.notes.push(n);
      },
      (x) => {
        const n = makeNote('床下的');
        const u = trainLayoutOf(x).unders[0];
        placeTrainNote(x, n, u.x + 1, u.y + 1);
        x.notes.push(n);
      },
      (x) => {
        x.cars[1].underName = '別的名字';
      },
    ];
    for (const fn of variants) {
      const e = JSON.parse(JSON.stringify(d)) as SectionDoc;
      if (e.train) fn(e.train);
      expect(hash(e, 'player')).toBe(base);
      expect(hash(e, 'gm')).not.toBe(hash(d, 'gm'));
    }
  });
});

describe('專案檔與原作的檔', () => {
  it('列車的作品存了再開回來逐欄位相同（範例 2 個）；縱向的作品沒有 train 欄位', () => {
    for (const id of TRAIN_SAMPLE_IDS) {
      const d = sampleDoc(id);
      expect(d.mode).toBe('train');
      const back = parseProject(serializeProject('cross-section', 1, d), 'cross-section');
      expect(normalizeDoc(back.data)).toEqual(d);
    }
    const plain = normalizeDoc(JSON.parse(JSON.stringify(sampleDoc('manor'))));
    expect(plain?.train).toBeUndefined();
    expect(plain?.mode).toBe('building');
  });

  it('壞掉的列車資料：範圍外夾回、不認得的換預設、超過 10 節不讀、指到不在的區域的設備拿掉', () => {
    const d = blankTrainDoc();
    const raw = JSON.parse(JSON.stringify(d));
    raw.train.arrange = 'zigzag';
    raw.train.scenery = 'moon';
    raw.train.cars[1].coupler = 'glue';
    raw.train.cars[1].type = 'spaceship';
    raw.train.cars[1].rooms[0].x1 = 99;
    raw.train.items.push({ id: 'zz', room: 'nowhere', kind: 'bunk', rx: 0.5 });
    for (let i = 0; i < 12; i++) raw.train.cars.push({ id: `c${i}`, type: 'coach', rooms: [] });
    const n = normalizeDoc(raw);
    expect(n?.mode).toBe('train');
    const t = n?.train;
    if (!t) throw new Error('train');
    expect(t.arrange).toBe('auto');
    expect(t.scenery).toBe('starlit');
    expect(t.cars).toHaveLength(10);
    expect(t.cars[1]).toMatchObject({ coupler: 'normal', type: 'coach' });
    expect(t.items.some((it) => it.id === 'zz')).toBe(false);
    expectTidy(t);
    /* 沒有列車的資料時 mode 'train' 讀成縱向 */
    const lone = JSON.parse(JSON.stringify(d));
    delete lone.train;
    expect(normalizeDoc(lone)?.mode).toBe('building');
  });

  it('原作的橫向作業 JSON：車廂、區域、連結器、床下、外景、列車專用的設備與樣式、車廂裡的備註', () => {
    const raw = {
      format: 'kiin-cross-section-studio',
      mode: 'horizontal',
      title: '測試列車',
      style: 'color',
      environment: 'night',
      sceneryTheme: 'fog-viaduct',
      building: { widthCells: 36, floors: [] },
      train: {
        carWidthCells: 14,
        layout: 'folded',
        rooftopRoute: false,
        locoStyle: 'electric',
        cars: [
          {
            id: 'L',
            type: 'locomotive',
            name: '1号車 · 機関車',
            couplerAfter: 'locked',
            rooms: [
              {
                id: 'L1',
                name: '運転室',
                wallTone: 'metal',
                isCab: true,
                startOpen: true,
                x0: 0,
                x1: 7,
              },
              { id: 'L2', name: '機械', wallTone: 'metal', x0: 7, x1: 14 },
            ],
          },
          {
            id: 'C',
            type: 'guard',
            name: 'Car 2 · 護送',
            couplerAfter: 'decoupled',
            underfloorSecret: true,
            underfloorName: '隠し',
            rooms: [
              {
                id: 'C1',
                name: '詰所',
                wallTone: 'metal',
                secret: true,
                labelPrivate: true,
                x0: 0,
                x1: 7,
              },
              { id: 'C2', name: '独房', wallTone: 'concrete', x0: 7, x1: 14 },
            ],
          },
        ],
      },
      items: [
        {
          id: 'i1',
          mode: 'horizontal',
          roomId: 'L1',
          asset: 'loco-console',
          variant: 'electric',
          rx: 0.4,
          flip: true,
        },
        {
          id: 'i2',
          mode: 'horizontal',
          roomId: 'C2',
          asset: 'dining-table',
          variant: 'coach',
          rx: 0.5,
        },
        { id: 'i3', mode: 'horizontal', roomId: 'C2', asset: 'ufo', rx: 0.5 },
      ],
      annotations: [
        {
          id: 'a1',
          mode: 'horizontal',
          underfloorCarId: 'C',
          rx: 0.5,
          ry: 0.5,
          x: 0,
          y: 0,
          text: '床下',
        },
        { id: 'a2', mode: 'horizontal', roomId: 'C1', rx: 0.3, ry: 0.4, x: 0, y: 0, text: '詰所' },
      ],
    };
    const { doc, skipped } = fromOriginal(raw);
    expect(doc.mode).toBe('train');
    expect(doc.building.floors.length).toBeGreaterThan(0);
    const t = doc.train;
    if (!t) throw new Error('train');
    expect(t).toMatchObject({
      arrange: 'folded',
      loco: 'electric',
      scenery: 'viaduct',
      roofRoute: false,
    });
    expect(t.cars.map((c) => [c.type, c.name, c.coupler, c.under])).toEqual([
      ['loco', '機関車', 'locked', false],
      ['escort', '護送', 'split', true],
    ]);
    expect(t.cars[0].rooms.map((r) => [r.name, r.role, !!r.open])).toEqual([
      ['運転室', 'cab', true],
      ['機械', 'engine', false],
    ]);
    expect(t.cars[1].rooms[0]).toMatchObject({ secret: true, hideName: true });
    expect(t.items.map((it) => [it.kind, it.variant])).toEqual([
      ['cabdesk', 'electric'],
      ['diner', 'coach'],
    ]);
    expect(skipped.items).toBe(1);
    expect(t.notes.map((n) => [n.text, n.room])).toEqual([
      ['床下', underId(t.cars[1].id)],
      ['詰所', t.cars[1].rooms[0].id],
    ]);
    /* 車廂寬 20 格的檔照比例換算成 14 格 */
    const wide = JSON.parse(JSON.stringify(raw));
    wide.train.carWidthCells = 20;
    wide.train.cars[0].rooms[0].x1 = 10;
    wide.train.cars[0].rooms[1].x0 = 10;
    wide.train.cars[0].rooms[1].x1 = 20;
    expect(fromOriginal(wide).doc.train?.cars[0].rooms.map((r) => r.x1)).toEqual([7, 14]);
  });
});
