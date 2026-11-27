/**
 * 車廂的種類（9 種）與每種的預設配置：車廂裡的區域（名字、左右、內牆）與一組設備（本站自己的分法與配置）。
 * 機關車的區域照蒸氣／電氣換：蒸氣是前面（左）鍋爐室（鍋爐與工具櫃）、後面駕駛室（5 格）；電氣是前面駕駛室（5 格）、後面機器室。
 * 餐車是前面的廚房（流理台與食物架）、後面的用餐區。
 */
import { S } from '../strings';
import type { CarRoom, CarType, LocoKind, WallTone } from './types';

/** 一間：[名字, 右端的格, 內牆, 設備[[種類, 左右, 牆上的高度?, 反轉?, 樣式?, 大小?]], 角色?, 一開始公開?] */
type Slot = readonly [
  name: string,
  x1: number,
  wall: WallTone,
  items: readonly (readonly [string, number, number?, boolean?, string?, number?])[],
  role?: CarRoom['role'],
  open?: boolean,
];

const R = S.carRooms;

export const CAR_FITOUT: Record<Exclude<CarType, 'loco'>, readonly Slot[]> = {
  suite: [
    [
      R.suiteA,
      5,
      'wood',
      [
        ['lamp', 0.5],
        ['bunk', 0.5],
      ],
    ],
    [
      R.suiteB,
      10,
      'wood',
      [
        ['lamp', 0.5],
        ['bunk', 0.5, undefined, true],
      ],
    ],
    [
      R.steward,
      14,
      'plaster',
      [
        ['lamp', 0.5],
        ['desk', 0.5, undefined, false, undefined, 0.85],
      ],
    ],
  ],
  berth: [
    [R.berth1, 4, 'wood', [['bunk', 0.5]]],
    [R.berth2, 8, 'wood', [['bunk', 0.5]]],
    [R.berth3, 11, 'wood', [['bunk', 0.5]]],
    [
      R.washroom,
      14,
      'tile',
      [
        ['lamp', 0.5],
        ['door', 0.5],
      ],
      undefined,
      true,
    ],
  ],
  dining: [
    [
      R.galley,
      5,
      'tile',
      [
        ['bench', 0.34, undefined, false, 'kitchen', 0.8],
        ['shelf', 0.84, undefined, false, undefined, 0.6],
      ],
    ],
    [
      R.diningHall,
      14,
      'wood',
      [
        ['lamp', 0.25],
        ['lamp', 0.75],
        ['diner', 0.24],
        ['diner', 0.76],
      ],
    ],
  ],
  lounge: [
    [
      R.bar,
      5,
      'wood',
      [
        ['lamp', 0.5],
        ['counter', 0.5, undefined, false, undefined, 0.85],
      ],
    ],
    [
      R.salon,
      14,
      'wood',
      [
        ['lamp', 0.5],
        ['settee', 0.26],
        ['settee', 0.76, undefined, true],
      ],
    ],
  ],
  coach: [
    [
      R.cabin,
      10,
      'plaster',
      [
        ['lamp', 0.25],
        ['lamp', 0.75],
        ['diner', 0.25, undefined, false, 'coach'],
        ['diner', 0.75, undefined, false, 'coach'],
      ],
    ],
    [
      R.vestibule,
      14,
      'plaster',
      [
        ['lamp', 0.5],
        ['door', 0.5],
      ],
      undefined,
      true,
    ],
  ],
  baggage: [
    [
      R.hold,
      9,
      'metal',
      [
        ['lamp', 0.5],
        ['freight', 0.3],
        ['crates', 0.76],
      ],
    ],
    [
      R.porter,
      14,
      'wood',
      [
        ['lamp', 0.5],
        ['luggage', 0.5],
      ],
    ],
  ],
  observation: [
    [
      R.reading,
      9,
      'wood',
      [
        ['lamp', 0.5],
        ['settee', 0.3],
        ['shelf', 0.82, undefined, false, undefined, 0.9],
      ],
    ],
    [R.deck, 14, 'wood', [['lamp', 0.4]], 'deck'],
  ],
  escort: [
    [
      R.officer,
      6,
      'metal',
      [
        ['lamp', 0.5],
        ['camera', 0.1],
        ['desk', 0.55, undefined, false, undefined, 0.9],
      ],
    ],
    [
      R.cell,
      14,
      'concrete',
      [
        ['camera', 0.9, undefined, true],
        ['bars', 0.18],
        ['bed', 0.66],
      ],
    ],
  ],
};

export const LOCO_FITOUT: Record<LocoKind, readonly Slot[]> = {
  steam: [
    [
      R.boilerRoom,
      9,
      'metal',
      [
        ['boiler', 0.42, undefined, false, 'steam'],
        ['locker', 0.86, undefined, false, undefined, 0.8],
      ],
      'engine',
    ],
    [
      R.cab,
      14,
      'metal',
      [
        ['lamp', 0.5],
        ['cabdesk', 0.55, undefined, false, 'steam'],
      ],
      'cab',
      true,
    ],
  ],
  electric: [
    [
      R.cab,
      5,
      'metal',
      [
        ['lamp', 0.5],
        ['cabdesk', 0.45, undefined, true, 'electric'],
      ],
      'cab',
      true,
    ],
    [
      R.machineRoom,
      14,
      'metal',
      [
        ['pipes', 0.5],
        ['boiler', 0.5, undefined, false, 'electric'],
      ],
      'engine',
    ],
  ],
};

export const fitoutOf = (type: CarType, loco: LocoKind): readonly Slot[] =>
  type === 'loco' ? LOCO_FITOUT[loco] : CAR_FITOUT[type];

/** 機關車的區域預設的名字（換蒸氣／電氣時，沒改過的名字跟著換） */
export const LOCO_ROOM_NAMES = new Set([R.boilerRoom, R.cab, R.machineRoom]);
