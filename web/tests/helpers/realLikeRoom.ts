/**
 * 照 CCFOLIA 真實匯出的結構自己組的房間 ZIP（合成資料，圖片與文字都是程式產生的；沒有任何使用者資料）。
 * 結構特徵（讀入再匯出要逐欄相同）：
 * - room 是單一物件、沒有 name、沒有 mediaName／mediaType／mediaRepeat／mediaVolume（只有 mediaRef）、有 allowDuplicate、
 *   markers 是空物件、沒有場景（sceneId 是 null）；
 * - items 每筆 19 個欄位、order 不連續、z 有 −1、奇數寬高、y＝0 且高是奇數；
 * - characters 有 diceSkin（空物件 {}）、status、params、faces；
 * - decks、notes、effects、scenes、savedatas、snapshots 都是空物件；
 * - ZIP 平坦：__data.json、.token、以 SHA-256 命名的圖片；resources 只列有引用的圖。
 */

import { zipFiles } from '../../src/core/files';
import { sha, solidPng } from './psdStudio';
import type { Json } from './roomZipImport';

export interface RealLikeRoom {
  zip: Uint8Array<ArrayBuffer>;
  json: Json;
  names: Record<string, string>;
}

const ITEM_KEYS = [
  'active',
  'angle',
  'clickAction',
  'closed',
  'coverImageUrl',
  'deckId',
  'freezed',
  'height',
  'imageUrl',
  'locked',
  'memo',
  'order',
  'type',
  'visible',
  'width',
  'withoutOwner',
  'x',
  'y',
  'z',
];

export async function realLikeRoom(): Promise<RealLikeRoom> {
  const imgs: Record<string, Uint8Array> = {};
  const colors: [string, number, number, [number, number, number]][] = [
    ['bg', 96, 54, [30, 40, 60]],
    ['fg', 96, 54, [200, 200, 200]],
    ['a', 24, 24, [200, 30, 30]],
    ['b', 24, 48, [30, 200, 30]],
    ['c', 48, 24, [30, 30, 200]],
    ['icon', 20, 20, [220, 200, 40]],
    ['face', 20, 20, [200, 40, 220]],
  ];
  for (const [k, w, h, c] of colors) imgs[k] = await solidPng(w, h, [...c, 255]);
  const names: Record<string, string> = {};
  for (const [k, v] of Object.entries(imgs)) names[k] = `${sha(v)}.png`;

  const item = (over: Json): Json => {
    const base: Json = {
      active: true,
      angle: 0,
      clickAction: null,
      closed: false,
      coverImageUrl: null,
      deckId: null,
      freezed: false,
      height: 4,
      imageUrl: names.a,
      locked: false,
      memo: '',
      order: 1,
      type: 'object',
      visible: true,
      width: 4,
      withoutOwner: false,
      x: 0,
      y: 0,
      z: 0,
    };
    const out = { ...base, ...over };
    for (const k of ITEM_KEYS) if (!(k in out)) throw new Error(`missing ${k}`);
    return out;
  };
  const orders = [1, 2, 4, 5, 9, 10, 14, 16, 17, 18, 20, 21];
  const items: Json = {};
  orders.forEach((o, i) => {
    items[`it${String(i).padStart(2, '0')}Zq${o}`] = item({
      order: o,
      x: [-12, -7, 0, 3, 5, -3, 8, 11, -1, 2, 6, -9][i],
      y: [0, 0, -4, 3, -6, 2, 0, 5, -2, 7, 1, -5][i],
      width: [3, 5, 4, 6, 3, 7, 9, 2, 5, 4, 3, 8][i],
      height: [3, 5, 4, 3, 5, 7, 3, 2, 5, 4, 3, 8][i],
      z: [-1, 0, 1, 2, -1, 3, 4, 0, 5, 6, 7, 8][i],
      imageUrl: [names.a, names.b, names.c][i % 3],
      memo: i % 4 === 0 ? `備註${i}` : '',
      angle: i === 3 ? 90 : 0,
      coverImageUrl: i === 5 ? names.c : null,
    });
  });

  const json: Json = {
    meta: { version: '1.1.0' },
    entities: {
      room: {
        alignWithGrid: true,
        allowDuplicate: false,
        archived: false,
        backgroundColor: '#000000',
        backgroundUrl: names.bg,
        crossfadeDuration: 1,
        defaultAnonymousRole: 'player',
        displayGrid: false,
        embedUrl: null,
        enableCrossfade: false,
        fieldHeight: 17,
        fieldObjectFit: 'cover',
        fieldWidth: 37,
        foregroundUrl: names.fg,
        gridSize: 1,
        hidden3dDice: false,
        initialSavedata: null,
        mapType: 'image',
        markers: {},
        mediaRef: null,
        messageChannels: ['メイン', '情報', '雑談'],
        messageGroups: [],
        monitored: false,
        sceneId: null,
        soundRef: null,
        thumbnailUrl: null,
        underConstruction: false,
        variables: [],
      },
      items,
      decks: {},
      notes: {},
      characters: {
        ch0AbCdEf: {
          active: false,
          angle: 0,
          color: '#888888',
          commands: '2d6 ダメージ\nCCB<=50 【技能】',
          diceSkin: {},
          externalUrl: '',
          faces: [{ iconUrl: names.face, label: '通常' }],
          height: 4,
          hideStatus: false,
          iconUrl: names.icon,
          initiative: 0,
          invisible: false,
          memo: '合成資料',
          name: 'テスト',
          order: 3,
          params: [{ label: 'STR', value: '10' }],
          playerName: '',
          roomId: null,
          secret: false,
          speaking: false,
          status: [{ label: 'HP', max: 10, value: 7 }],
          width: 4,
          x: 490,
          y: 791,
          z: 1,
        },
      },
      effects: {},
      scenes: {},
      savedatas: {},
      snapshots: {},
    },
    resources: Object.fromEntries(Object.values(names).map((n) => [n, { type: 'image/png' }])),
  };
  const zip = zipFiles(
    [
      { name: '__data.json', data: JSON.stringify(json) },
      { name: '.token', data: `0.${'cd'.repeat(32)}` },
      ...Object.entries(imgs).map(([k, v]) => ({ name: names[k], data: v })),
    ],
    { mtime: new Date(2026, 0, 1) },
  );
  return { zip, json, names };
}
