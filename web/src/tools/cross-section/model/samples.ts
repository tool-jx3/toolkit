/**
 * 範例（本站自己做的題材與配置）：霧丘洋館、白樺療養院、第九地下觀測所、渡鴉鐘塔。
 * 都可以自由改；開範例是一步復原。
 */
import { S } from '../strings';
import { baseDoc, floorOf, furnishAll } from './factory';
import { layoutOf } from './layout';
import { makeFixture, makeNote, placeNote, uid } from './ops';
import type { Fixture, Room, SectionDoc, Shaft, ShaftKind } from './types';

export const SAMPLE_IDS = ['manor', 'sanatorium', 'station', 'tower'] as const;
export type SampleId = (typeof SAMPLE_IDS)[number];

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
    const it = makeFixture(roomNamed(doc, name).id, kind, { rx, ry: more?.ry });
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
  const d = baseDoc();
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
  addNote(d, N.cellar, S.samples.manor.notes[0], 0.45, 0.4, { secret: true });
  addNote(d, N.chapel, '1', 0.3, 0.45);
  return d;
}

function sanatorium(): SectionDoc {
  const N = S.samples.sanatorium.rooms;
  const d = baseDoc();
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
  addNote(d, N.isolation, S.samples.sanatorium.notes[0], 0.45, 0.5, { secret: true });
  addNote(d, N.wardA, 'A', 0.7, 0.5);
  addNote(d, N.director, 'B', 0.3, 0.5);
  return d;
}

function station(): SectionDoc {
  const N = S.samples.station.rooms;
  const d = baseDoc();
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
      [N.gate, 'lobby', 18],
      [N.guard, 'control', 44],
    ]),
    floorOf(-1, S.samples.station.floors[1], [
      [N.office, 'office', 18],
      [N.monitor, 'control', 44],
    ]),
    floorOf(-2, S.samples.station.floors[2], [
      [N.culture, 'lab', 18],
      [N.holding, 'cell', 44],
    ]),
    floorOf(-3, S.samples.station.floors[3], [
      [N.power, 'machine', 18],
      [N.store, 'storage', 44],
    ]),
    floorOf(-4, S.samples.station.floors[4], [
      [N.sump, 'empty', 18],
      [N.core, 'ritual', 44, true],
    ]),
  ];
  d.building.shafts = [
    shaft('elevator', 18, 1, -3, { cab: -1 }),
    shaft('ladder', 0, -3, -4),
    shaft('duct', 42, -1, -4),
  ];
  furnishAll(d);
  addItems(d, [
    [N.culture, 'glass', 0.3],
    [N.culture, 'bloodwall', 0.65, { ry: 0.5 }],
    [N.holding, 'boards', 0.18],
    [N.power, 'spark', 0.7],
    [N.sump, 'pipes', 0.5, { only: undefined }],
    [N.sump, 'crates', 0.7, { only: undefined }],
    [N.monitor, 'upset', 0.55],
  ]);
  patchFirst(d, N.power, 'boiler', { variant: 'electric' });
  addNote(d, N.core, S.samples.station.notes[0], 0.5, 0.45, { secret: true });
  return d;
}

function tower(): SectionDoc {
  const N = S.samples.tower.rooms;
  const d = baseDoc();
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
  return d;
}

const BUILD: Record<SampleId, () => SectionDoc> = { manor, sanatorium, station, tower };

export function sampleDoc(id: SampleId): SectionDoc {
  return BUILD[id]();
}

export const isSampleId = (v: unknown): v is SampleId => SAMPLE_IDS.includes(v as SampleId);
