/**
 * 新的斷面圖：空白（1F 與 B1F、中間一座電梯）；新的橫向車廂（第二批）。
 */
import { S } from '../strings';
import { applyUse, settle, uid } from './ops';
import { blankTrain } from './trainOps';
import type { Floor, RoomUse, SectionDoc, Train } from './types';

export function emptyDoc(): SectionDoc {
  return {
    mode: 'building',
    title: S.defaults.title,
    subtitle: S.defaults.subtitle,
    style: 'color',
    env: 'day',
    sky: 'clear',
    flood: false,
    floodLevel: 0,
    wear: 18,
    seed: 20261127,
    grid: true,
    labels: true,
    elevation: true,
    frame: true,
    building: { width: 36, storey: 6, roof: 'flat', rooftop: true, floors: [], shafts: [] },
    items: [],
    notes: [],
  };
}

/** 樓層：rooms＝[名字, 用途, 右端的格, 祕密?] */
export function floorOf(
  level: number,
  name: string,
  rooms: readonly (readonly [string, RoomUse, number, boolean?])[],
): Floor {
  let x = 0;
  return {
    id: uid('fl'),
    level,
    name,
    rooms: rooms.map(([n, use, x1, secret]) => {
      const r = {
        id: uid('rm'),
        name: n,
        use,
        wall: 'plaster' as const,
        secret: !!secret,
        hideName: !!secret,
        x0: x,
        x1,
      };
      x = x1;
      return r;
    }),
  };
}

/** 整理一次、每間照用途擺設備（名字留著） */
export function furnishAll(doc: SectionDoc): SectionDoc {
  settle(doc);
  for (const f of doc.building.floors)
    for (const r of f.rooms) {
      const name = r.name;
      applyUse(doc, r, r.use);
      r.name = name;
    }
  return doc;
}

export function blankDoc(): SectionDoc {
  const d = emptyDoc();
  d.building.floors = [
    floorOf(1, S.floor.aboveName, [
      [S.uses.lobby, 'lobby', 16],
      [S.uses.office, 'office', 36],
    ]),
    floorOf(-1, S.floor.belowName, [
      [S.uses.storage, 'storage', 16],
      [S.uses.machine, 'machine', 36],
    ]),
  ];
  d.building.shafts = [
    {
      id: uid('sh'),
      kind: 'elevator',
      x: 16,
      top: 1,
      bottom: -1,
      cab: 1,
      cabState: 'normal',
      secret: false,
    },
  ];
  return furnishAll(d);
}

/** 新的橫向車廂：空白的建築＋新的列車（機關車、普通客車、行李・貨物車），畫面是橫向 */
export function blankTrainDoc(): SectionDoc {
  const d = blankDoc();
  d.mode = 'train';
  d.title = S.train.newTitle;
  d.subtitle = S.train.subtitle;
  d.train = blankTrain();
  return d;
}

/** 這份作品的列車（還沒有時建一列新的） */
export function ensureTrain(d: SectionDoc): Train {
  d.train ??= blankTrain();
  return d.train;
}
