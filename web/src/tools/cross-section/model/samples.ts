/**
 * 範例（本站自己做的題材與配置）：縱向的霧丘洋館、白樺療養院、舊環線廢站、渡鴉鐘塔；
 * 橫向（第二批）的赤狐馬戲團專列、鐵鴉護送列車。都可以自由改；開範例是一步復原。
 */
import { S } from '../strings';
import { blankDoc, emptyDoc, floorOf, furnishAll } from './factory';
import { layoutOf } from './layout';
import { makeNote, newFixture, placeNote, uid } from './ops';
import { trainLayoutOf, underId } from './trainLayout';
import { makeCar, placeTrainNote, settleTrain } from './trainOps';
import type { Car, CarType, Fixture, Room, SectionDoc, Shaft, ShaftKind, Train } from './types';

/** 縱向的範例 */
export const SAMPLE_IDS = ['manor', 'sanatorium', 'station', 'tower'] as const;
/** 橫向的範例（第二批） */
export const TRAIN_SAMPLE_IDS = ['circus', 'raven'] as const;
export type SampleId = (typeof SAMPLE_IDS)[number] | (typeof TRAIN_SAMPLE_IDS)[number];

const shaft = (
  kind: ShaftKind,
  x: number,
  top: number,
  bottom: number,
  more: Partial<Shaft> = {},
): Shaft => ({
  id: uid('sh'),
  kind,
  x,
  top,
  bottom,
  cab: top,
  cabState: 'normal',
  secret: kind === 'duct',
  ...more,
});

function roomNamed(doc: SectionDoc, name: string): Room {
  for (const f of doc.building.floors) {
    const r = f.rooms.find((v) => v.name === name);
    if (r) return r;
  }
  throw new Error(`sample room ${name}`);
}

type Extra = [room: string, kind: string, rx: number, more?: Partial<Fixture>];

function addItems(doc: SectionDoc, list: readonly Extra[]): void {
  for (const [name, kind, rx, more] of list) {
    const it = newFixture(roomNamed(doc, name).id, kind, { rx, ry: more?.ry });
    Object.assign(it, more);
    /* { only: undefined }＝兩種狀態都有（事件・異變的種類預設只在事件後） */
    if (more && 'only' in more && more.only === undefined) delete it.only;
    doc.items.push(it);
  }
}

function addNote(
  doc: SectionDoc,
  room: string,
  text: string,
  rx: number,
  ry: number,
  more: Partial<ReturnType<typeof makeNote>> = {},
) {
  const r = roomNamed(doc, room);
  const L = layoutOf(doc);
  const box = L.rooms.find((v) => v.room.id === r.id);
  if (!box) return;
  const n = makeNote(text);
  placeNote(doc, n, box.x + rx * box.w, box.y + ry * box.h);
  Object.assign(n, more);
  doc.notes.push(n);
}

/** 換掉某件設備的設定（例如窗在事件後破損） */
function patchFirst(doc: SectionDoc, room: string, kind: string, patch: Partial<Fixture>): void {
  const id = roomNamed(doc, room).id;
  const it = doc.items.find((v) => v.room === id && v.kind === kind);
  if (it) Object.assign(it, patch);
}

function manor(): SectionDoc {
  const N = S.samples.manor.rooms;
  const d = emptyDoc();
  Object.assign(d, {
    title: S.samples.manor.name,
    subtitle: S.samples.manor.subtitle,
    sky: 'dusk',
    wear: 30,
    seed: 3127,
  });
  d.building.roof = 'gable';
  d.building.floors = [
    floorOf(2, S.samples.manor.floors[0], [
      [N.master, 'ward', 15],
      [N.study, 'library', 36],
    ]),
    floorOf(1, S.samples.manor.floors[1], [
      [N.hall, 'lobby', 15],
      [N.dining, 'kitchen', 36],
    ]),
    floorOf(-1, S.samples.manor.floors[2], [
      [N.cellar, 'storage', 15],
      [N.boiler, 'machine', 36],
    ]),
    floorOf(-2, S.samples.manor.floors[3], [
      [N.well, 'empty', 15],
      [N.chapel, 'ritual', 36, true],
    ]),
  ];
  d.building.shafts = [shaft('switchback', 15, 2, -1), shaft('ladder', 0, -1, -2)];
  furnishAll(d);
  addItems(d, [
    [N.dining, 'desk', 0.6],
    [N.dining, 'lamp', 0.62],
    [N.study, 'upset', 0.4, { only: 'after' }],
    [N.master, 'bloodwall', 0.45, { ry: 0.5 }],
    [N.hall, 'chalk', 0.45],
    [N.cellar, 'shelf', 0.62],
    [N.chapel, 'bloodpool', 0.5],
    [N.well, 'crates', 0.75],
  ]);
  patchFirst(d, N.master, 'window', { smashed: true });
  patchFirst(d, N.study, 'shelf', { upset: true });
  roomNamed(d, N.hall).open = true;
  addNote(d, N.cellar, S.samples.manor.notes[0], 0.45, 0.4, { secret: true });
  addNote(d, N.chapel, '1', 0.3, 0.45, { style: 'badge' });
  return d;
}

function sanatorium(): SectionDoc {
  const N = S.samples.sanatorium.rooms;
  const d = emptyDoc();
  Object.assign(d, {
    title: S.samples.sanatorium.name,
    subtitle: S.samples.sanatorium.subtitle,
    style: 'parchment',
    env: 'night',
    sky: 'rain',
    wear: 46,
    seed: 811,
  });
  d.building.width = 40;
  d.building.floors = [
    floorOf(3, S.samples.sanatorium.floors[0], [
      [N.wardA, 'ward', 12],
      [N.wardB, 'ward', 26],
      [N.director, 'office', 40],
    ]),
    floorOf(2, S.samples.sanatorium.floors[1], [
      [N.surgery, 'surgery', 14],
      [N.station, 'control', 26],
      [N.records, 'library', 40],
    ]),
    floorOf(1, S.samples.sanatorium.floors[2], [
      [N.lobby, 'lobby', 16],
      [N.pharmacy, 'storage', 40],
    ]),
    floorOf(-1, S.samples.sanatorium.floors[3], [
      [N.morgue, 'cell', 16],
      [N.isolation, 'cell', 28, true],
      [N.boiler, 'machine', 40],
    ]),
  ];
  d.building.shafts = [
    shaft('elevator', 14, 3, -1, { cab: 2, cabState: 'fallsAfter' }),
    shaft('stairs', 37, 3, 1),
  ];
  furnishAll(d);
  addItems(d, [
    [N.wardA, 'bloodpool', 0.4],
    [N.wardB, 'boards', 0.15],
    [N.surgery, 'bloodwall', 0.7, { ry: 0.45 }],
    [N.surgery, 'glass', 0.25],
    [N.station, 'spark', 0.5],
    [N.records, 'upset', 0.55],
    [N.isolation, 'talisman', 0.75, { ry: 0.4 }],
    [N.morgue, 'chalk', 0.6],
    [N.boiler, 'rubble', 0.7],
  ]);
  patchFirst(d, N.director, 'window', { smashed: true });
  patchFirst(d, N.morgue, 'bars', { smashed: true });
  roomNamed(d, N.lobby).open = true;
  addNote(d, N.isolation, S.samples.sanatorium.notes[0], 0.45, 0.5, { secret: true });
  addNote(d, N.wardA, 'A', 0.7, 0.5, { style: 'badge' });
  addNote(d, N.director, 'B', 0.3, 0.5, { style: 'badge' });
  return d;
}

function station(): SectionDoc {
  const N = S.samples.station.rooms;
  const d = emptyDoc();
  Object.assign(d, {
    title: S.samples.station.name,
    subtitle: S.samples.station.subtitle,
    style: 'blueprint',
    sky: 'storm',
    flood: true,
    floodLevel: 30,
    wear: 12,
    seed: 909,
  });
  d.building.width = 44;
  d.building.roof = 'sawtooth';
  d.building.floors = [
    floorOf(1, S.samples.station.floors[0], [
      [N.entrance, 'lobby', 18],
      [N.kiosk, 'storage', 44],
    ]),
    floorOf(-1, S.samples.station.floors[1], [
      [N.gates, 'lobby', 18],
      [N.master, 'office', 44],
    ]),
    floorOf(-2, S.samples.station.floors[2], [
      [N.platform, 'empty', 18],
      [N.bunks, 'ward', 44],
    ]),
    floorOf(-3, S.samples.station.floors[3], [
      [N.infirmary, 'surgery', 18],
      [N.galley, 'kitchen', 44],
    ]),
    floorOf(-4, S.samples.station.floors[4], [
      [N.terminus, 'empty', 18],
      [N.shrine, 'ritual', 44, true],
    ]),
  ];
  d.building.shafts = [
    shaft('elevator', 18, 1, -3, { cab: -1 }),
    shaft('ladder', 0, -3, -4),
    shaft('duct', 42, -1, -4),
  ];
  furnishAll(d);
  addItems(d, [
    [N.platform, 'lamp', 0.3, { only: undefined }],
    [N.platform, 'exit', 0.7, { only: undefined }],
    [N.infirmary, 'glass', 0.3],
    [N.infirmary, 'bloodwall', 0.65, { ry: 0.5 }],
    [N.bunks, 'boards', 0.82],
    [N.galley, 'spark', 0.7],
    [N.terminus, 'pipes', 0.5, { only: undefined }],
    [N.terminus, 'crates', 0.7, { only: undefined }],
    [N.gates, 'upset', 0.55],
  ]);
  addNote(d, N.shrine, S.samples.station.notes[0], 0.5, 0.45, { secret: true });
  roomNamed(d, N.entrance).open = true;
  return d;
}

function tower(): SectionDoc {
  const N = S.samples.tower.rooms;
  const d = emptyDoc();
  Object.assign(d, {
    title: S.samples.tower.name,
    subtitle: S.samples.tower.subtitle,
    style: 'noir',
    sky: 'clear',
    wear: 22,
    seed: 4471,
  });
  d.building.width = 30;
  d.building.storey = 5;
  d.building.roof = 'gable';
  const F = S.samples.tower.floors;
  d.building.floors = [
    floorOf(6, F[0], [[N.bells, 'empty', 30]]),
    floorOf(5, F[1], [[N.observatory, 'library', 30]]),
    floorOf(4, F[2], [
      [N.archive, 'library', 16],
      [N.vault, 'storage', 30, true],
    ]),
    floorOf(3, F[3], [[N.workshop, 'lab', 30]]),
    floorOf(2, F[4], [[N.quarters, 'ward', 30]]),
    floorOf(1, F[5], [[N.entrance, 'lobby', 30]]),
    floorOf(-1, F[6], [[N.dungeon, 'cell', 30]]),
  ];
  d.building.shafts = [shaft('stairs', 27, 6, -1)];
  furnishAll(d);
  addItems(d, [
    [N.bells, 'pipes', 0.3, { only: undefined }],
    [N.bells, 'altar', 0.75, { only: undefined }],
    [N.workshop, 'rubble', 0.75],
    [N.quarters, 'bloodpool', 0.7],
    [N.dungeon, 'talisman', 0.8, { ry: 0.45 }],
    [N.vault, 'locker', 0.4, { only: undefined, secret: true }],
  ]);
  addNote(d, N.vault, S.samples.tower.notes[0], 0.5, 0.55, { secret: true });
  roomNamed(d, N.entrance).open = true;
  return d;
}

/* ---------- 橫向的範例 ---------- */

/** 一節：[種類, 名字, 每一間的名字（照預設的分法；空字串＝照預設）] */
type CarSpec = readonly [CarType, string, readonly string[]];

function trainOf(specs: readonly CarSpec[], base: Omit<Train, 'cars' | 'items' | 'notes'>): Train {
  const t: Train = { ...base, cars: [], items: [], notes: [] };
  for (const [type, name, rooms] of specs) {
    const car = makeCar(t, type);
    car.name = name;
    car.rooms.forEach((r, i) => {
      if (rooms[i]) r.name = rooms[i];
    });
    t.cars.push(car);
  }
  settleTrain(t);
  return t;
}

function carNamed(t: Train, name: string): Car {
  const car = t.cars.find((c) => c.name === name);
  if (!car) throw new Error(`sample car ${name}`);
  return car;
}

function carRoom(t: Train, name: string) {
  for (const c of t.cars) {
    const r = c.rooms.find((v) => v.name === name);
    if (r) return r;
  }
  throw new Error(`sample car room ${name}`);
}

function addTrainItems(t: Train, list: readonly Extra[]): void {
  for (const [name, kind, rx, more] of list) {
    const it = newFixture(carRoom(t, name).id, kind, { rx, ry: more?.ry });
    Object.assign(it, more);
    if (more && 'only' in more && more.only === undefined) delete it.only;
    t.items.push(it);
  }
}

/** 備註：在某一間（或床下的祕密空間：room 寫成 under:車廂名）的比例位置 */
function addTrainNote(
  t: Train,
  room: string,
  text: string,
  rx: number,
  ry: number,
  more: Partial<ReturnType<typeof makeNote>> = {},
) {
  const T = trainLayoutOf(t);
  const id = room.startsWith('under:')
    ? underId(carNamed(t, room.slice(6)).id)
    : carRoom(t, room).id;
  const b = [...T.rooms, ...T.unders].find((v) => v.room.id === id);
  if (!b) return;
  const n = makeNote(text);
  placeTrainNote(t, n, b.x + rx * b.w, b.y + ry * b.h);
  Object.assign(n, more);
  t.notes.push(n);
}

function circus(): SectionDoc {
  const C = S.samples.circus;
  const N = C.rooms;
  const d = blankDoc();
  Object.assign(d, {
    mode: 'train',
    title: C.name,
    subtitle: C.subtitle,
    wear: 20,
    seed: 5170,
  });
  const t = trainOf(
    [
      ['loco', C.cars[0], []],
      ['baggage', C.cars[1], [N.props, N.tamer]],
      ['escort', C.cars[2], [N.keeper, N.cage]],
      ['berth', C.cars[3], ['', '', '', '']],
      ['dining', C.cars[4], []],
      ['lounge', C.cars[5], [N.office, N.salon]],
      ['observation', C.cars[6], []],
    ],
    { arrange: 'auto', loco: 'steam', scenery: 'meadow', roofRoute: true },
  );
  carNamed(t, C.cars[2]).coupler = 'locked';
  const office = carRoom(t, N.office);
  office.secret = true;
  office.hideName = true;
  const berth = carNamed(t, C.cars[3]);
  berth.under = true;
  berth.underName = N.stowaway;
  carRoom(t, S.carRooms.washroom).open = true;
  addTrainItems(t, [
    [N.cage, 'bloodpool', 0.55],
    [N.cage, 'boards', 0.85],
    [N.props, 'upset', 0.75],
    [S.carRooms.diningHall, 'glass', 0.5],
    [S.carRooms.diningHall, 'upset', 0.62],
    [N.salon, 'bloodwall', 0.5, { ry: 0.45 }],
    [N.office, 'freight', 0.5, { only: undefined }],
  ]);
  addTrainNote(t, `under:${C.cars[3]}`, C.notes[0], 0.5, 0.5, { secret: true });
  addTrainNote(t, N.cage, '1', 0.25, 0.45, { style: 'badge' });
  addTrainNote(t, N.salon, '2', 0.5, 0.4, { style: 'badge' });
  settleTrain(t);
  d.train = t;
  return d;
}

function raven(): SectionDoc {
  const R = S.samples.raven;
  const N = R.rooms;
  const d = blankDoc();
  Object.assign(d, {
    mode: 'train',
    title: R.name,
    subtitle: R.subtitle,
    style: 'noir',
    env: 'night',
    wear: 26,
    seed: 6203,
  });
  const t = trainOf(
    [
      ['loco', R.cars[0], []],
      ['coach', R.cars[1], [N.guards, '']],
      ['escort', R.cars[2], [N.warden, N.prisoner]],
      ['baggage', R.cars[3], [N.evidence, N.clerk]],
    ],
    { arrange: 'single', loco: 'electric', scenery: 'viaduct', roofRoute: true },
  );
  carNamed(t, R.cars[2]).coupler = 'bars';
  const prison = carNamed(t, R.cars[2]);
  prison.under = true;
  prison.underName = N.hatch;
  const ev = carRoom(t, N.evidence);
  ev.secret = true;
  ev.hideName = true;
  addTrainItems(t, [
    [N.prisoner, 'talisman', 0.82, { ry: 0.4 }],
    [N.prisoner, 'chalk', 0.5],
    [N.guards, 'spark', 0.5],
    [N.clerk, 'bloodwall', 0.6, { ry: 0.5 }],
  ]);
  addTrainNote(t, N.evidence, R.notes[0], 0.5, 0.5, { secret: true });
  addTrainNote(t, `under:${R.cars[2]}`, R.notes[1], 0.5, 0.5, { secret: true });
  addTrainNote(t, N.prisoner, 'A', 0.3, 0.45, { style: 'badge' });
  settleTrain(t);
  d.train = t;
  return d;
}

const BUILD: Record<SampleId, () => SectionDoc> = {
  manor,
  sanatorium,
  station,
  tower,
  circus,
  raven,
};

export function sampleDoc(id: SampleId): SectionDoc {
  return BUILD[id]();
}

export const isSampleId = (v: unknown): v is SampleId => typeof v === 'string' && v in BUILD;
