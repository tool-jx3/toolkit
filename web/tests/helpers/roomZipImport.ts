/**
 * room-zip「讀入房間 ZIP」（F287～F299）測試用的房間 ZIP：結構照 CCFOLIA 匯出（平面的 `__data.json`、`.token`、
 * 以 SHA-256 命名的圖片），內容全部現做。涵蓋：
 * - 房間設定（聊天分頁、BGM、變數、套用中的場景…）、奇數寬的標記（左上 x＝0，整數中心換不回來）、小數位置的標記、沒有圖的標記；
 * - 螢幕面板、牌堆的卡片、沒有圖的面板；牌堆、劇本文字、存檔、快照、不認得的類別；
 * - 場景（四種背景模式、與房間標記同 ID 的面板有差異／沒有差異／無法表示的差異、場景專屬的面板、空白面板、BGM）；
 * - 角色（狀態、參數、位置、差分）、切入（帶音效）、沒有名稱也沒有圖的切入。
 */

import { zipFiles } from '../../src/core/files';
import { ballApng, sha, solidPng } from './psdStudio';

// biome-ignore lint/suspicious/noExplicitAny: 測試用的鬆散 JSON（房間資料的欄位很多，逐一寫型別沒有意義）
export type Json = Record<string, any>;

export interface RoomFixture {
  zip: Uint8Array<ArrayBuffer>;
  /** 圖片代稱 → ZIP 裡的檔名 */
  names: Record<string, string>;
  /** 圖片代稱 → 位元組 */
  bytes: Record<string, Uint8Array>;
  /** 寫進 `__data.json` 的內容 */
  json: Json;
}

/** 1×1 的 GIF（GIF 一律算動態圖） */
export const TINY_GIF = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00,
  0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
]);

export interface RoomFixtureOptions {
  /** 在寫成 JSON 前改內容 */
  mutate?: (json: Json, names: Record<string, string>) => void;
  /** ZIP 裡額外的檔案 */
  extraFiles?: { name: string; data: Uint8Array | string }[];
  /** 圖片代稱 → 要拿掉的（不放進 ZIP） */
  without?: string[];
  /** 沒有會少掉的東西：不放不是圖片的檔案、最上層的多餘欄位、非 Url 欄位引用的圖（讀入時不必確認） */
  clean?: boolean;
}

export async function roomFixture(opt: RoomFixtureOptions = {}): Promise<RoomFixture> {
  const png = (w: number, h: number, c: [number, number, number]) => solidPng(w, h, [...c, 255]);
  const imgs: Record<string, { data: Uint8Array; ext: string; type: string }> = {};
  const add = (key: string, data: Uint8Array, ext = 'png', type = 'image/png') => {
    imgs[key] = { data, ext, type };
  };
  add('bg', await png(96, 72, [40, 60, 90]));
  add('fg', await png(96, 72, [250, 250, 250]));
  add('fg2', await png(80, 60, [250, 200, 200]));
  add('sceneBg', await png(64, 48, [30, 30, 30]));
  add('markerA', await png(48, 48, [200, 40, 40]));
  add('markerB', await png(48, 24, [200, 120, 40]));
  add('item', await png(48, 48, [40, 160, 60]));
  add('cover', await png(48, 48, [60, 60, 160]));
  add('apng', new Uint8Array(await ballApng()));
  add('icon', await png(40, 40, [220, 180, 40]));
  add('face', await png(40, 40, [180, 80, 200]));
  add('effect', await png(64, 32, [255, 255, 255]));
  add('noteIcon', await png(32, 32, [1, 2, 3]));
  add('deepIcon', await png(32, 32, [4, 5, 6]));
  add('gif', TINY_GIF, 'gif', 'image/gif');
  /* resources に載らず、欄位名稱も Url ではない場所で参照される画像 */
  add('linkless', await png(16, 16, [9, 9, 9]));
  if (opt.clean) delete imgs.linkless;
  for (const k of opt.without ?? []) delete imgs[k];
  const names: Record<string, string> = {};
  const bytes: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(imgs)) {
    names[k] = `${sha(v.data)}.${v.ext}`;
    bytes[k] = v.data;
  }
  const n = (k: string) => names[k] ?? `${'0'.repeat(63)}1.png`;

  const marker = (over: Json): Json => ({
    x: 0,
    y: 0,
    z: 2,
    width: 4,
    height: 4,
    angle: 0,
    locked: true,
    freezed: false,
    text: '',
    imageUrl: null,
    clickAction: null,
    ...over,
  });
  const m1 = marker({
    x: -10,
    y: -6,
    z: 3,
    width: 3,
    height: 3,
    text: '標記',
    imageUrl: n('markerA'),
  });
  const m2 = marker({ x: 0, y: 0, z: 4, width: 3, height: 3, angle: 45, imageUrl: n('markerA') });
  const m3 = marker({ x: 2.5, y: 1, z: 5, width: 2, height: 2.5, imageUrl: n('markerB') });
  const m4 = marker({ x: 1, y: 1, z: 6, width: 2, height: 2, text: '只有文字' });

  const scene = (over: Json): Json => ({
    name: '',
    order: 1,
    backgroundUrl: null,
    foregroundUrl: null,
    fieldObjectFit: 'cover',
    fieldWidth: 20,
    fieldHeight: 12,
    displayGrid: false,
    gridSize: 1,
    markers: {},
    text: '',
    locked: false,
    mediaName: '',
    mediaRef: null,
    mediaType: 'file',
    mediaRepeat: true,
    mediaVolume: 1,
    soundName: '',
    soundRef: null,
    soundRepeat: false,
    soundVolume: 1,
    ...over,
  });

  const item = (over: Json): Json => ({
    x: 0,
    y: 0,
    z: 2,
    angle: 0,
    width: 4,
    height: 4,
    deckId: null,
    locked: true,
    visible: true,
    closed: false,
    withoutOwner: false,
    freezed: false,
    type: 'object',
    active: true,
    memo: '',
    imageUrl: null,
    coverImageUrl: null,
    clickAction: null,
    order: 1,
    ...over,
  });

  const json: Json = {
    meta: { version: '1.1.0' },
    foo: 1,
    entities: {
      room: {
        name: '整合測試房',
        defaultAnonymousRole: 'player',
        backgroundUrl: n('bg'),
        foregroundUrl: n('fg'),
        embedUrl: null,
        thumbnailUrl: 'https://example.com/thumb.png',
        mapType: 'image',
        fieldWidth: 20,
        fieldHeight: 12,
        fieldObjectFit: 'fill',
        alignWithGrid: false,
        messageChannels: ['メイン', '情報', '雑談', 'GM'],
        messageGroups: [{ name: '密談', members: ['a', 'b'] }],
        markers: { m1, m2, m3, m4 },
        mediaName: 'BGM',
        mediaRef: 'bgm-1',
        mediaType: 'file',
        mediaRepeat: true,
        mediaVolume: 0.6,
        monitored: true,
        soundRef: null,
        sceneId: 's2',
        archived: false,
        backgroundColor: '#112233',
        variables: [{ key: 'HO1', value: '艾琳' }],
        underConstruction: false,
        hidden3dDice: true,
        initialSavedata: null,
        displayGrid: true,
        gridSize: 2,
        enableCrossfade: true,
        crossfadeDuration: 2,
      },
      items: {
        i1: item({
          x: 1,
          y: 1,
          z: 5,
          width: 3,
          height: 3,
          angle: 30,
          imageUrl: n('item'),
          coverImageUrl: n('cover'),
          memo: '寶箱',
          order: 2,
          locked: false,
        }),
        i2: item({ x: -2, y: 2, z: 6, width: 4, height: 3, imageUrl: n('apng'), order: 1 }),
        i3: item({ type: 'card', deckId: 'd1', imageUrl: n('item'), order: 3 }),
        i4: item({ memo: '沒有圖的面板', order: 4 }),
      },
      decks: { d1: { name: '牌堆', cards: ['i3'], backImageUrl: n('deepIcon') } },
      notes: {
        n1: { name: '劇本一', text: '內容', order: 2, iconUrl: n('noteIcon') },
        n2: { name: '劇本零', text: '更多', order: 1, iconUrl: '' },
      },
      characters: {
        c1: {
          name: '艾琳',
          playerName: 'PL',
          memo: '備忘',
          initiative: 3,
          externalUrl: 'https://example.com/sheet',
          status: [
            { label: 'HP', value: 7, max: 12 },
            { label: 'SAN', value: 50, max: 99 },
            { label: 'MP', value: 4, max: 4 },
          ],
          params: [{ label: 'STR', value: '13' }],
          iconUrl: n('icon'),
          faces: [{ label: '笑', iconUrl: n('face') }],
          x: 3,
          y: -3,
          z: 7,
          angle: 0,
          width: 2,
          height: 2,
          active: true,
          secret: false,
          invisible: false,
          hideStatus: false,
          color: '#ff0000',
          roomId: null,
          commands: '2d6\nCCB<=50 【偵查】',
          speaking: false,
          diceSkin: null,
          order: 1,
        },
        c2: {
          name: 'ゴブリン',
          playerName: '',
          memo: '',
          initiative: 0,
          externalUrl: '',
          status: [],
          params: [],
          iconUrl: n('gif'),
          faces: [],
          x: 490,
          y: 791,
          z: 1,
          angle: 0,
          width: 4,
          height: 4,
          active: false,
          secret: true,
          invisible: false,
          hideStatus: false,
          color: '#888888',
          roomId: null,
          commands: '',
          speaking: false,
          diceSkin: null,
          order: 2,
        },
      },
      effects: {
        e1: {
          name: '閃光',
          order: 1,
          active: false,
          imageUrl: n('effect'),
          playTime: 123,
          soundRef: 'snd-1',
          soundName: '爆音',
          soundVolume: 0.5,
        },
        e2: {
          name: '',
          order: 2,
          active: false,
          imageUrl: null,
          playTime: 0,
          soundRef: 'snd-2',
          soundName: '只有音效',
          soundVolume: 1,
        },
      },
      scenes: {
        s1: scene({
          name: '序章',
          order: 1,
          backgroundUrl: n('bg'),
          text: '@閃光\n開場白',
          mediaName: '序章 BGM',
          mediaRef: 'bgm-2',
          markers: {
            m1: { ...m1, x: -8 },
            m2,
            m3: { ...m3, imageUrl: n('markerA') },
            x1: marker({
              x: -5,
              y: -3,
              z: 9,
              width: 10,
              height: 6,
              angle: 15,
              imageUrl: n('effect'),
              text: '',
            }),
            x2: marker({ x: 3, y: 3, z: 10, width: 5, height: 5 }),
          },
        }),
        s2: scene({
          name: '第一幕',
          order: 2,
          backgroundUrl: n('sceneBg'),
          foregroundUrl: n('fg2'),
          fieldObjectFit: 'fill',
          fieldWidth: 30,
          fieldHeight: 20,
          displayGrid: true,
          text: '@不存在\n沒有這個切入',
          soundRef: 'snd-3',
        }),
        s3: scene({
          name: '無背景',
          order: 3,
          markers: { m2: { ...m2, y: 5 } },
        }),
        s4: scene({
          name: '前景同背景',
          order: 4,
          foregroundUrl: n('fg2'),
          backgroundUrl: n('fg2'),
          text: '一般的文字',
        }),
      },
      savedatas: { sd1: { name: '存檔', preview: n('linkless') } },
      snapshots: { sn1: { name: '快照' } },
      extraKind: { z1: { iconUrl: n('deepIcon'), label: '不認得的類別' } },
    },
    resources: {} as Json,
  };
  if (opt.clean) {
    delete json.foo;
    delete json.entities.savedatas.sd1.preview;
  }
  opt.mutate?.(json, names);
  /* resources：ZIP 裡的圖片，除了只在不是 Url 欄位被引用的那張 */
  for (const [k, v] of Object.entries(imgs))
    if (k !== 'linkless') json.resources[names[k]] = { type: v.type };
  const token = `0.${'ab'.repeat(32)}`;
  const zip = zipFiles(
    [
      { name: '__data.json', data: JSON.stringify(json) },
      { name: '.token', data: token },
      ...Object.entries(imgs).map(([k, v]) => ({ name: names[k], data: v.data })),
      ...(opt.clean ? [] : [{ name: 'README.txt', data: '不是圖片' }]),
      ...(opt.extraFiles ?? []),
    ],
    { mtime: new Date(2026, 0, 1) },
  );
  return { zip, names, bytes, json };
}
