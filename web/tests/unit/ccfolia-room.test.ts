/**
 * G5 共用層：CCFOLIA 房間 ZIP（ccfolia/room.ts、roomZip.ts）。
 * 對照 room-zip 規格 3.1（欄位、預設值、順序；附件 room-zip.examples.json 的 Z01、Z03、Z06、Z07）、
 * F281 的自我檢查，以及 psd-studio 規格 2.3（讀取）、3.4（改名重寫；附件「房間ZIP」的結構）與第 7 節裁定。
 */
import { strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  buildRoomZip,
  type CcfoliaRoomData,
  checkRoomZip,
  collectRoomImageNames,
  createEffect,
  createItem,
  createMarker,
  createRoom,
  createRoomCharacter,
  createRoomData,
  createScene,
  crossfadeFlag,
  crossfadeFromFlag,
  DEFAULT_MESSAGE_CHANNELS,
  findRoomDataFile,
  isRoomImageName,
  isRoomJson,
  listRoomImageRefs,
  matchRoomImage,
  newRoomEntityId,
  newRoomToken,
  packRoomImage,
  ROOM_ENTITY_KINDS,
  ROOM_TOKEN_RE,
  type RoomImageFile,
  readRoomZip,
  renameInRoomJson,
  resolveRoomData,
  rewriteRoomZip,
  roomImageExt,
  roomRenamePairs,
  sniffImageMime,
} from '@/ccfolia';
import { bytesToHex, sha256Sync, unzipFiles, zipFiles } from '@/core/files';
import RZ from '../../../docs/refactor/specs/room-zip.examples.json';

/** SHA-256 的十六進位（core/files 的純 JavaScript 版；本身由 core-hash.test.ts 以標準向量驗證） */
const sha = (b: Uint8Array) => bytesToHex(sha256Sync(b));
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

type Json = Record<string, unknown>;
const scenario = (id: string) =>
  (RZ as unknown as { scenarios: Record<string, { data: { entities: Record<string, Json> } }> })
    .scenarios[id].data;

/** 假的圖片位元組（只要檔頭對、內容不同；這裡不解碼） */
function fakeImage(kind: 'png' | 'jpeg' | 'gif' | 'webp', seed: number): Uint8Array {
  const head = {
    png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    jpeg: [0xff, 0xd8, 0xff, 0xe0],
    gif: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
    webp: [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
  }[kind];
  const out = new Uint8Array(head.length + 32);
  out.set(head);
  for (let i = head.length; i < out.length; i++) out[i] = (seed * 31 + i * 7) & 0xff;
  return out;
}

describe('房間資料的欄位與預設值（room-zip 3.1）', () => {
  it('room：與附件 Z01 相同（欄位順序也相同）', () => {
    const want = scenario('Z01').entities.room;
    const got = createRoom({
      backgroundUrl: want.backgroundUrl as string,
      sceneId: want.sceneId as string,
    });
    expect(Object.keys(got)).toEqual(Object.keys(want));
    expect(got).toEqual(want);
    expect(got.messageChannels).toEqual(['メイン', '情報', '雑談']);
    expect(DEFAULT_MESSAGE_CHANNELS).toEqual(got.messageChannels);
  });

  it('enableCrossfade 與畫面上的開關相反', () => {
    expect(crossfadeFlag(true)).toBe(false);
    expect(crossfadeFlag(false)).toBe(true);
    expect(crossfadeFromFlag(false)).toBe(true);
    expect(createRoom().enableCrossfade).toBe(false);
  });

  it('scene：與附件 Z01 相同', () => {
    const want = Object.values(scenario('Z01').entities.scenes)[0] as Json;
    const got = createScene({
      name: want.name as string,
      backgroundUrl: want.backgroundUrl as string,
      foregroundUrl: want.foregroundUrl as string,
    });
    expect(Object.keys(got)).toEqual(Object.keys(want));
    expect(got).toEqual(want);
  });

  it('marker、item：與附件 Z03 相同', () => {
    const z3 = scenario('Z03').entities;
    const marker = Object.values(z3.room.markers as Json)[0] as Json;
    const got = createMarker({ x: -3, y: -6, z: 20, width: 12, height: 4, imageUrl: 'img' });
    expect(Object.keys(got)).toEqual(Object.keys(marker));
    expect(got).toEqual({ ...marker, imageUrl: 'img' });
    const item = Object.values(z3.items)[0] as Json;
    const gotItem = createItem({
      x: -19,
      y: -28,
      z: 40,
      width: 37,
      height: 56,
      memo: '備註',
      imageUrl: item.imageUrl as string,
    });
    expect(Object.keys(gotItem)).toEqual(Object.keys(item));
    expect(gotItem).toEqual(item);
  });

  it('character：與附件 Z07 相同（盤面外待機、不在盤面上）', () => {
    const c = Object.values(scenario('Z07').entities.characters)[0] as Json;
    const got = createRoomCharacter({ name: c.name as string, commands: c.commands as string });
    expect(Object.keys(got)).toEqual(Object.keys(c));
    expect(got).toEqual(c);
  });

  it('effect：與附件 Z06 相同（playTime 是匯出時刻）', () => {
    const e = Object.values(scenario('Z06').entities.effects)[0] as Json;
    const got = createEffect({
      name: e.name as string,
      imageUrl: e.imageUrl as string,
      playTime: 1,
    });
    expect(Object.keys(got)).toEqual(Object.keys(e));
    expect({ ...got, playTime: e.playTime }).toEqual(e);
  });

  it('__data.json：meta、九類 entities 的順序、resources', () => {
    const d = createRoomData();
    expect(Object.keys(d)).toEqual(['meta', 'entities', 'resources']);
    expect(d.meta).toEqual({ version: '1.1.0' });
    expect(Object.keys(d.entities)).toEqual([...ROOM_ENTITY_KINDS]);
    expect(Object.keys(d.entities)).toEqual(Object.keys(scenario('Z01').entities));
  });

  it('ID 遞增不重複；.token 是「0.」＋64 個小寫十六進位', () => {
    const ids = Array.from({ length: 50 }, () => newRoomEntityId());
    expect(new Set(ids).size).toBe(50);
    expect(ROOM_TOKEN_RE.test(newRoomToken())).toBe(true);
    expect(newRoomToken()).not.toBe(newRoomToken());
  });
});

describe('圖片檔名（room-zip 3.1.1）', () => {
  it('MIME → 副檔名：jpeg 不是 jpg；不收的格式回傳 null', () => {
    expect(roomImageExt('image/jpeg')).toBe('jpeg');
    expect(roomImageExt('image/png')).toBe('png');
    expect(roomImageExt('image/webp')).toBe('webp');
    expect(roomImageExt('image/gif')).toBe('gif');
    expect(roomImageExt('image/bmp')).toBeNull();
    expect(roomImageExt('image/avif')).toBeNull();
  });

  it('檔名＝內容的 SHA-256＋副檔名；沒給 MIME 時看檔頭', async () => {
    const jpg = fakeImage('jpeg', 1);
    const f = await packRoomImage(jpg);
    expect(f.name).toBe(`${sha(jpg)}.jpeg`);
    expect(f.type).toBe('image/jpeg');
    expect(isRoomImageName(f.name)).toBe(true);
    const fromBlob = await packRoomImage(
      new Blob([fakeImage('webp', 2) as Uint8Array<ArrayBuffer>], { type: 'image/webp' }),
    );
    expect(fromBlob.name.endsWith('.webp')).toBe(true);
    expect(sniffImageMime(fakeImage('gif', 3))).toBe('image/gif');
    await expect(packRoomImage(strToU8('BM....'), 'image/bmp')).rejects.toThrow();
  });
});

async function sampleRoom() {
  const imgs: RoomImageFile[] = await Promise.all([
    packRoomImage(fakeImage('png', 1)),
    packRoomImage(fakeImage('webp', 2)),
    packRoomImage(fakeImage('jpeg', 3)),
    packRoomImage(fakeImage('gif', 4)),
  ]);
  const [bg, fg, icon, cut] = imgs;
  const unused = await packRoomImage(fakeImage('png', 9));
  const data = createRoomData({
    room: createRoom({
      backgroundUrl: bg.name,
      foregroundUrl: fg.name,
      sceneId: 's1',
      markers: { m1: createMarker({ imageUrl: fg.name }) },
    }),
    scenes: { s1: createScene({ name: '一', foregroundUrl: fg.name }) },
    characters: {
      c1: createRoomCharacter({
        name: '甲',
        iconUrl: icon.name,
        faces: [{ label: '@笑', iconUrl: icon.name }],
      }),
    },
    effects: { e1: createEffect({ name: '切入', imageUrl: cut.name, playTime: 0 }) },
  });
  return { data, imgs, unused };
}

describe('寫入與自我檢查（room-zip 3.1.1、3.2.12、F281）', () => {
  it('平坦、__data.json（不縮排）＋.token＋引用到的圖；resources 一一對應；自我檢查通過', async () => {
    const { data, imgs, unused } = await sampleRoom();
    const built = buildRoomZip(data, [...imgs, unused, imgs[0]], { mtime: new Date(2020, 0, 1) });
    expect(built.missing).toEqual([]);
    const entries = unzipFiles(built.bytes, { directories: true });
    const names = entries.map((e) => e.name);
    expect(names.slice(0, 2)).toEqual(['__data.json', '.token']);
    expect(names.slice(2).sort()).toEqual(imgs.map((i) => i.name).sort());
    expect(names).not.toContain(unused.name);
    const json = dec(entries[0].data);
    expect(json).not.toContain('\n');
    const parsed = JSON.parse(json) as CcfoliaRoomData;
    expect(Object.keys(parsed.resources)).toEqual(collectRoomImageNames(parsed));
    expect(parsed.resources[imgs[2].name]).toEqual({ type: 'image/jpeg' });
    expect(ROOM_TOKEN_RE.test(dec(entries[1].data))).toBe(true);
    const check = await checkRoomZip(built.bytes);
    expect(check).toEqual({
      ok: true,
      problems: [],
      imageCount: 4,
      sceneCount: 1,
      characterCount: 1,
    });
  });

  it('引用了沒有的圖：buildRoomZip 回報 missing，自我檢查報 dangling-ref', async () => {
    const { data, imgs } = await sampleRoom();
    const built = buildRoomZip(data, imgs.slice(1));
    expect(built.missing).toEqual([imgs[0].name]);
    const check = await checkRoomZip(built.bytes);
    expect(check.ok).toBe(false);
    expect(check.problems).toEqual([{ code: 'dangling-ref', names: [imgs[0].name] }]);
  });

  it('自我檢查的每一種問題', async () => {
    const png = fakeImage('png', 5);
    const name = `${sha(png)}.png`;
    const okData = JSON.stringify(
      createRoomData(
        { room: createRoom({ backgroundUrl: name }) },
        { [name]: { type: 'image/png' } },
      ),
    );
    const zip = (entries: { name: string; data: Uint8Array | string }[]) => zipFiles(entries);

    expect(
      (
        await checkRoomZip(
          zip([
            { name: '__data.json', data: okData },
            { name, data: png },
          ]),
        )
      ).problems,
    ).toEqual([{ code: 'no-token' }]);
    const noData = await checkRoomZip(zip([{ name: '.token', data: '0.' }]));
    expect(noData).toMatchObject({ ok: false, problems: [{ code: 'no-data' }], imageCount: 0 });
    expect(
      (
        await checkRoomZip(
          zip([
            { name: '.token', data: '0.' },
            { name: '__data.json', data: '{' },
          ]),
        )
      ).problems,
    ).toEqual([{ code: 'bad-json' }]);
    const folder = await checkRoomZip(
      zip([
        { name: '.token', data: '0.' },
        { name: '__data.json', data: okData },
        { name, data: png },
        { name: 'sub/', data: new Uint8Array(0) },
      ]),
    );
    expect(folder.problems).toEqual([{ code: 'folder', names: ['sub/'] }]);
    const wrongName = `${'0'.repeat(64)}.png`;
    const other = fakeImage('png', 6);
    const mixed = await checkRoomZip(
      zip([
        { name: '.token', data: '0.' },
        {
          name: '__data.json',
          data: JSON.stringify(
            createRoomData(
              { room: createRoom({ backgroundUrl: name, foregroundUrl: wrongName }) },
              { [name]: { type: 'image/png' }, [`${'1'.repeat(64)}.png`]: { type: 'image/png' } },
            ),
          ),
        },
        { name, data: png },
        { name: wrongName, data: other },
      ]),
    );
    expect(mixed.problems).toEqual([
      { code: 'missing-image', names: [`${'1'.repeat(64)}.png`] },
      { code: 'orphan-image', names: [wrongName] },
      { code: 'hash-mismatch', names: [wrongName] },
    ]);
  });
});

describe('讀取（psd-studio 2.3、F09）', () => {
  it('找資料檔的順序', () => {
    expect(findRoomDataFile(['x.json', 'sub/room.json', '__data.json', 'data.json'])).toBe(
      'data.json',
    );
    expect(findRoomDataFile(['x.json', 'sub/room.json', '__data.json'])).toBe('__data.json');
    expect(findRoomDataFile(['x.json', 'sub/ROOM.json', 'a/data.json'])).toBe('sub/ROOM.json');
    expect(findRoomDataFile(['a.png', 'b/x.JSON'])).toBe('b/x.JSON');
    expect(findRoomDataFile(['a.png', 'dir/'])).toBeNull();
  });

  it('房間資料的位置：entities、包在 data 底下、放在頂層', () => {
    const std = {
      meta: {},
      entities: { room: { backgroundUrl: 'a' }, items: {} },
      resources: { a: { type: 'x' } },
    };
    expect(resolveRoomData(std).room).toBe(std.entities.room);
    expect(resolveRoomData(std).resources).toBe(std.resources);
    const wrapped = { data: { entities: { room: { foregroundUrl: 'b' } } } };
    expect(resolveRoomData(wrapped).room).toBe(wrapped.data.entities.room);
    const flat = { backgroundUrl: 'c', items: [{ imageUrl: 'd' }] };
    expect(resolveRoomData(flat)).toMatchObject({ entities: flat, room: flat });
    expect(resolveRoomData('x')).toEqual({ entities: null, room: null, resources: null });
  });

  it('引用清單：各種位置、配置檢視要畫的、其他位置的雜湊檔名', async () => {
    const { data } = await sampleRoom();
    const hidden = `${'a'.repeat(64)}.png`;
    (data.entities.decks as Json).d1 = { someImage: hidden };
    const refs = listRoomImageRefs(data);
    const summary = refs.map((r) => [r.kind, r.layout, r.path.join('.')]);
    expect(summary).toEqual([
      ['background', true, 'entities.room.backgroundUrl'],
      ['foreground', true, 'entities.room.foregroundUrl'],
      ['marker', true, 'entities.room.markers.m1.imageUrl'],
      ['character', true, 'entities.characters.c1.iconUrl'],
      ['face', false, 'entities.characters.c1.faces.0.iconUrl'],
      ['scene-foreground', false, 'entities.scenes.s1.foregroundUrl'],
      ['effect', false, 'entities.effects.e1.imageUrl'],
      ['other', false, 'entities.decks.d1.someImage'],
    ]);
    expect(refs[2]).toMatchObject({ id: 'm1', object: data.entities.room.markers.m1 });
    expect(isRoomJson(data)).toBe(true);
    expect(isRoomJson({ items: [{ imageUrl: 'x.png' }] })).toBe(true);
    expect(isRoomJson({ foo: 1 })).toBe(false);
    expect(isRoomJson({ data: {} })).toBe(true);
  });

  it('引用對應到 ZIP 的圖：完全相同 → 檔名相同 → 不分大小寫', () => {
    const paths = ['sub/ABC.png', 'x/abc.png', 'abc.PNG'];
    expect(matchRoomImage('abc.PNG', paths)).toBe('abc.PNG');
    expect(matchRoomImage('abc.png', paths)).toBe('x/abc.png');
    expect(matchRoomImage('ABC.PNG', ['sub/abc.png'])).toBe('sub/abc.png');
    expect(matchRoomImage('none.png', paths)).toBeNull();
  });

  it('readRoomZip：資料檔、解析、圖片清單；壞掉的 JSON 當成沒有', async () => {
    const { data, imgs } = await sampleRoom();
    const built = buildRoomZip(data, imgs);
    const r = readRoomZip(built.bytes);
    expect(r.dataPath).toBe('__data.json');
    expect(r.isRoom).toBe(true);
    expect((r.json as CcfoliaRoomData).meta.version).toBe('1.1.0');
    expect(r.images.map((i) => i.path).sort()).toEqual(imgs.map((i) => i.name).sort());
    const broken = readRoomZip(
      zipFiles([
        { name: 'data.json', data: '{x' },
        { name: 'a.png', data: 'x' },
      ]),
    );
    expect(broken).toMatchObject({ dataPath: 'data.json', json: null, isRoom: false });
    expect(broken.images.map((i) => i.path)).toEqual(['a.png']);
  });
});

/** psd-studio 附件「房間ZIP」同結構的測試檔（一張 JPEG、一張沒被引用、一張不換） */
async function psdRoomZip(prefix = '', dataName = '__data.json') {
  const kinds = ['jpeg', 'png', 'png', 'png', 'png', 'png', 'png', 'png', 'png', 'png'] as const;
  const files = kinds.map((k, i) => {
    const data = fakeImage(k, 100 + i);
    return { name: `${sha(data)}.${k}`, data };
  });
  const [bg, fg, marker, item, icon, face, scene, effect, unused, keep] = files.map((f) => f.name);
  const stem = (n: string) => n.split('.')[0];
  const json = {
    meta: { version: '1.1.0' },
    entities: {
      room: { backgroundUrl: bg, foregroundUrl: fg, markers: { m: { imageUrl: marker, x: 1 } } },
      items: { i: { imageUrl: item }, k: { imageUrl: keep } },
      characters: { c: { iconUrl: icon, faces: [{ label: '@a', iconUrl: face }] } },
      scenes: { s: { backgroundUrl: scene, text: `看 ${stem(bg)} 與 ${prefix}${fg}` } },
      effects: { e: { imageUrl: effect } },
      [`k_${stem(item)}`]: { note: 'key contains hash' },
    },
    resources: Object.fromEntries(
      files
        .filter((f) => f.name !== unused)
        .map((f) => [f.name, { type: f.name.endsWith('.jpeg') ? 'image/jpeg' : 'image/png' }]),
    ),
  };
  const token = '0.0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const entries = [
    { name: '.token', data: token },
    ...(prefix ? [{ name: prefix, data: new Uint8Array(0) }] : []),
    ...files.map((f) => ({ name: prefix + f.name, data: f.data })),
    { name: prefix + dataName, data: JSON.stringify(json) },
    { name: 'readme.txt', data: '原封不動' },
  ];
  return { bytes: zipFiles(entries), files, json, token, keep, unused };
}

describe('改名重寫（psd-studio 3.4）', () => {
  it('renameInRoomJson：字串值與鍵都換、長的先換、鍵順序不變、不改原物件', () => {
    const src = {
      b: 'xx.png',
      'xx.png': { t: 'image/png' },
      a: ['see xx', 'xx.png!'],
      __proto__x: 1,
    };
    const out = renameInRoomJson(src, [
      ['xx', 'yy'],
      ['xx.png', 'zz.webp'],
    ]);
    expect(out).toEqual({
      b: 'zz.webp',
      'zz.webp': { t: 'image/png' },
      a: ['see yy', 'zz.webp!'],
      __proto__x: 1,
    });
    expect(Object.keys(out)).toEqual(['b', 'zz.webp', 'a', '__proto__x']);
    expect(src.b).toBe('xx.png');
    const proto = renameInRoomJson(JSON.parse('{"__proto__":{"a":"xx"}}'), [['xx', 'yy']]);
    expect(Object.keys(proto)).toEqual(['__proto__']);
    expect(Object.getPrototypeOf(proto)).toBe(Object.prototype);
  });

  it('roomRenamePairs：主檔名、檔名、含路徑名三層', () => {
    expect(roomRenamePairs('sub/aa.jpeg', 'bb')).toEqual([
      ['aa', 'bb'],
      ['aa.jpeg', 'bb.jpeg'],
      ['sub/aa.jpeg', 'sub/bb.jpeg'],
    ]);
    expect(roomRenamePairs('aa.jpeg', 'bb', 'png')).toEqual([
      ['aa', 'bb'],
      ['aa.jpeg', 'bb.png'],
      ['aa.jpeg', 'bb.png'],
    ]);
  });

  for (const [prefix, dataName] of [
    ['', '__data.json'],
    ['sub/', 'room.json'],
  ] as const) {
    it(`看得見的圖重新命名，JSON 跟著改；.token 與其他檔案原封不動（${prefix || '平面'}）`, async () => {
      const src = await psdRoomZip(prefix, dataName);
      const read = readRoomZip(src.bytes);
      expect(read.dataPath).toBe(prefix + dataName);
      expect(read.isRoom).toBe(true);
      const replaced = src.files.filter((f) => f.name !== src.keep);
      const out = await rewriteRoomZip(
        read,
        replaced.map((f, i) => ({ path: prefix + f.name, data: fakeImage('png', 500 + i) })),
      );
      expect(out.jsonPath).toBe(prefix + dataName);
      const entries = unzipFiles(out.bytes, { directories: true });
      const byName = new Map(entries.map((e) => [e.name, e.data]));
      expect(dec(byName.get('.token')!)).toBe(src.token);
      expect(dec(byName.get('readme.txt')!)).toBe('原封不動');
      if (prefix) expect(byName.has(prefix)).toBe(true);
      /* 每張新圖的檔名＝內容的 SHA-256；副檔名沿用原檔（JPEG 來源仍是 .jpeg） */
      for (const r of out.renamed) {
        const data = byName.get(r.to)!;
        const base = r.to.slice(prefix.length);
        expect(base.split('.')[0]).toBe(sha(data));
        expect(base.split('.')[1]).toBe(r.from.split('.').pop());
        expect(byName.has(r.from)).toBe(false);
      }
      /* 不換的圖保留原名與內容 */
      expect(byName.get(prefix + src.keep)).toBeDefined();
      /* JSON：2 格縮排；等於「原 JSON 依舊→新對照替換」；type 不改；鍵順序不變 */
      const text = dec(byName.get(prefix + dataName)!);
      expect(text.startsWith('{\n  "meta"')).toBe(true);
      let expected = JSON.stringify(src.json);
      const pairs = out.renamed.flatMap((r) => {
        const from = r.from.slice(prefix.length);
        const to = r.to.slice(prefix.length);
        return [
          [from, to],
          [from.split('.')[0], to.split('.')[0]],
        ];
      });
      for (const [from, to] of pairs) expected = expected.split(from).join(to);
      expect(JSON.parse(text)).toEqual(JSON.parse(expected));
      expect(text).toBe(JSON.stringify(JSON.parse(expected), null, 2));
      const resources = (JSON.parse(text) as CcfoliaRoomData).resources;
      expect(Object.values(resources).filter((r) => r.type === 'image/jpeg')).toHaveLength(1);
      expect(resources[src.unused]).toBeUndefined();
      expect(Object.keys(resources).some((k) => out.renamed.some((r) => r.to.endsWith(k)))).toBe(
        true,
      );
    });
  }

  it('第 7 節裁定：重新編碼成 PNG 時副檔名改 .png、resources 的 type 一併改正', async () => {
    const src = await psdRoomZip();
    const read = readRoomZip(src.bytes);
    const jpeg = src.files[0];
    const png = fakeImage('png', 999);
    const out = await rewriteRoomZip(read, [{ path: jpeg.name, data: png, mime: 'image/png' }]);
    const newName = `${sha(png)}.png`;
    expect(out.renamed).toEqual([{ from: jpeg.name, to: newName }]);
    const json = out.json as CcfoliaRoomData & { entities: { room: Json } };
    expect(json.entities.room.backgroundUrl).toBe(newName);
    expect(json.resources[newName]).toEqual({ type: 'image/png' });
    expect(json.resources[jpeg.name]).toBeUndefined();
    /* 不帶副檔名的雜湊也換成新雜湊 */
    const text = (json.entities.scenes as Record<string, { text: string }>).s.text;
    expect(text.startsWith(`看 ${sha(png)} 與`)).toBe(true);
  });
});

describe('collectRoomImageNames', () => {
  it('只掃 entities；依第一次出現的順序、不重複', () => {
    const a = `${'a'.repeat(64)}.png`;
    const b = `${'b'.repeat(64)}.jpeg`;
    const d = createRoomData(
      {
        room: createRoom({ backgroundUrl: b, foregroundUrl: a }),
        items: { x: createItem({ imageUrl: a }) },
      },
      { [`${'c'.repeat(64)}.png`]: { type: 'image/png' } },
    );
    expect(collectRoomImageNames(d)).toEqual([b, a]);
    expect(isRoomImageName('ABC.png')).toBe(false);
  });

  it('只認 …Url 欄位：文字（劇本文字的內文、名稱、備註）剛好是圖片檔名的樣子時不算引用；差分的 iconUrl 算', () => {
    const a = `${'a'.repeat(64)}.png`;
    const t = `${'d'.repeat(64)}.png`;
    const data = {
      entities: {
        notes: { n1: { name: t, text: t, iconUrl: a, order: 1 } },
        characters: { c1: { memo: t, faces: [{ label: '笑', iconUrl: a }] } },
      },
    };
    expect(collectRoomImageNames(data)).toEqual([a]);
  });
});
