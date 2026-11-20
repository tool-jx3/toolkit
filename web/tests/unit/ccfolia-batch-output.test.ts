/**
 * CCFOLIA 角色批次產生器：圖片的對應（規格 3.6）、房間 ZIP（3.7，用共用層讀回來比）、素材 ZIP（3.8）、
 * 角色剪貼簿 JSON（3.9）、整理與專案檔（3.10、2.4）。
 */
import { describe, expect, it } from 'vitest';
import { checkRoomZip, parseCharacterClipboard, ROOM_TOKEN_RE, readRoomZip } from '@/ccfolia';
import { sha256Hex, unzipFiles } from '@/core/files';
import { parseProjectBytes, serializeProjectZip } from '@/core/storage';
import { viewOf } from '@/tools/ccfolia-batch/derived';
import { dataUrlBytes, readLegacyProject } from '@/tools/ccfolia-batch/legacy';
import { facesOf, matchImages, portraitOf } from '@/tools/ccfolia-batch/match';
import {
  cleanDoc,
  cleanPiece,
  defaultDoc,
  defaultOpts,
  newPiece,
  type ShelfImage,
} from '@/tools/ccfolia-batch/model';
import {
  boardPositions,
  buildAssetsZip,
  buildPiecesZip,
  CLIPBOARD_FIELDS,
  type OutImage,
  type OutPiece,
  pieceClipboard,
} from '@/tools/ccfolia-batch/output';
import { OUT } from '@/tools/ccfolia-batch/strings';

const img = (name: string, id = name): ShelfImage => ({
  id,
  name,
  asset: `a-${id}`,
  type: 'image/png',
  size: 10,
});

describe('圖片的對應', () => {
  it('同名＝立繪、「名稱_差分」＝差分、最長的名稱優先、×N 的複本共用', () => {
    const pieces = [
      newPiece({ name: 'アリス' }),
      newPiece({ name: 'アリス_幼少' }),
      newPiece({ name: '黒い影A', imageName: '黒い影' }),
      newPiece({ name: '黒い影B', imageName: '黒い影' }),
    ];
    const images = [
      img('アリス'),
      img('アリス_笑顔'),
      img('アリス_幼少_笑顔'),
      img('ＡＲＩＳＵ'),
      img('黒い影'),
      img('黒い影(怒り)'),
      img('アリス-泣き'),
      img('アリス@照れ'),
      img('アリスト'),
    ];
    const m = matchImages(pieces, images);
    expect(m[0].byName?.name).toBe('アリス');
    expect(m[0].faces.map((f) => f.label)).toEqual(['笑顔', '泣き', '照れ']);
    expect(m[1].faces.map((f) => f.label)).toEqual(['笑顔']);
    expect(m[2].byImageName?.name).toBe('黒い影');
    expect(m[2].faces.map((f) => f.label)).toEqual(['怒り']);
    expect(m[3].faces.map((f) => f.label)).toEqual(['怒り']);
    expect(portraitOf(pieces[3], m[3], images)?.name).toBe('黒い影');
  });

  it('角色差分管理器的編號（名稱01_笑）也是差分；全形與大小寫照樣對得上', () => {
    const pieces = [newPiece({ name: '艾莉絲' }), newPiece({ name: 'Bob' })];
    const images = [
      img('艾莉絲01_笑'),
      img('艾莉絲02_哭'),
      img('艾莉絲1_怒'),
      img('ｂｏｂ'),
      img('BOB（笑）'),
    ];
    const m = matchImages(pieces, images);
    expect(m[0].faces.map((f) => f.label)).toEqual(['笑', '哭']);
    expect(m[1].byName?.name).toBe('ｂｏｂ');
    expect(m[1].faces.map((f) => f.label)).toEqual(['笑']);
  });

  it('立繪：指定、沒有圖；差分：手動的在前、同名的自動差分不重複、關掉自動差分', () => {
    const images = [img('A'), img('A_笑'), img('A_哭'), img('other')];
    const p = newPiece({
      name: 'A',
      image: 'other',
      faces: [{ label: '笑', imageId: 'other', imageName: '' }],
    });
    const [m] = matchImages([p], images);
    expect(portraitOf(p, m, images)?.name).toBe('other');
    expect(portraitOf({ ...p, image: 'none' }, m, images)).toBeNull();
    expect(facesOf(p, m, images).map((f) => [f.label, f.image?.name, f.auto])).toEqual([
      ['笑', 'other', false],
      ['哭', 'A_哭', true],
    ]);
    expect(facesOf({ ...p, autoFaces: false }, m, images)).toHaveLength(1);
    /* 表格的「差分：」欄只寫了圖片名稱 */
    const q = newPiece({ name: 'B', faces: [{ label: '怒', imageId: null, imageName: 'a_哭' }] });
    expect(facesOf(q, undefined, images)[0].image?.name).toBe('A_哭');
  });

  it('實際值：全體設定、共用的聊天面板、差分的 @ 名稱', () => {
    const images = [img('A'), img('A_笑')];
    const p = newPiece({ name: 'A', commands: 'CC<=50 閃避', size: null, secret: true });
    const [m] = matchImages([p], images);
    const opts = { ...defaultOpts(), size: 6, commonCommands: '1d100 骰子', faceCommands: true };
    const v = viewOf(p, m, images, opts);
    expect([v.size, v.active, v.secret, v.hideStatus]).toEqual([6, false, true, false]);
    expect(v.commands).toBe('CC<=50 閃避\n1d100 骰子\n@笑');
  });
});

const png = (n: number): OutImage => ({
  key: `k${n}`,
  bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, n]),
  type: 'image/png',
});
const piece = (over: Partial<OutPiece>): OutPiece => ({
  name: '',
  memo: '',
  initiative: 0,
  externalUrl: '',
  status: [],
  params: [],
  commands: '',
  color: '#888888',
  size: 4,
  active: false,
  secret: false,
  invisible: false,
  hideStatus: false,
  image: null,
  faces: [],
  ...over,
});

describe('房間 ZIP', () => {
  it('檔名＝雜湊、同一張只放一次、只追加、棋子的欄位', async () => {
    let id = 0;
    const list = [
      piece({
        name: 'A',
        memo: 'm',
        initiative: 3,
        status: [{ label: 'HP', value: 1, max: 2 }],
        params: [
          { label: 'DEX', value: '60' },
          { label: '', value: '' },
        ],
        commands: 'x',
        color: '#123456',
        size: 6,
        active: true,
        image: png(1),
        faces: [{ label: '笑顔', image: png(2) }],
      }),
      piece({
        name: 'B',
        active: true,
        image: png(2),
        faces: [{ label: 'j', image: { ...png(3), type: 'image/jpeg' } }],
      }),
      piece({
        name: 'C',
        size: 500,
        color: 'red',
        secret: true,
        hideStatus: true,
        invisible: true,
      }),
    ];
    const built = await buildPiecesZip(list, {
      now: 1_700_000_000_000,
      newId: () => `id${++id}`,
      mtime: new Date(2026, 0, 1),
    });
    const check = await checkRoomZip(built.bytes);
    expect(check).toMatchObject({ ok: true, characterCount: 3, imageCount: 3, sceneCount: 0 });
    const names = unzipFiles(built.bytes).map((e) => e.name);
    expect(names.slice(0, 2)).toEqual(['__data.json', '.token']);
    expect(names).toHaveLength(5);
    const token = new TextDecoder().decode(unzipFiles(built.bytes)[1].data);
    expect(token).toMatch(ROOM_TOKEN_RE);
    const read = readRoomZip(built.bytes);
    const data = read.json as typeof built.data;
    expect(data.meta).toEqual({ version: '1.1.0' });
    /* 只追加：room 是 {}，其他類別空的 */
    expect(data.entities.room).toEqual({});
    for (const k of ['items', 'decks', 'notes', 'effects', 'scenes', 'savedatas', 'snapshots']) {
      expect(data.entities[k as 'items']).toEqual({});
    }
    expect(Object.keys(data.entities.characters)).toEqual(['id1', 'id2', 'id3']);
    const [a, b, c] = Object.values(data.entities.characters);
    expect(a.iconUrl).toBe(`${await sha256Hex(png(1).bytes)}.png`);
    expect(a.faces).toEqual([{ label: '笑顔', iconUrl: b.iconUrl }]);
    expect(b.faces[0].iconUrl).toMatch(/^[0-9a-f]{64}\.jpeg$/);
    expect(a.params).toEqual([{ label: 'DEX', value: '60' }]);
    expect(a.status).toEqual([{ label: 'HP', value: 1, max: 2 }]);
    expect([a.name, a.memo, a.initiative, a.commands, a.color, a.width, a.height]).toEqual([
      'A',
      'm',
      3,
      'x',
      '#123456',
      6,
      6,
    ]);
    /* 放到盤面的橫向排開（px）；只放進角色清單的在共用層的待機位置 */
    expect([a.x, a.y, a.active, b.x, b.y, b.active]).toEqual([0, 0, true, 144, 0, true]);
    expect([c.x, c.y, c.active, c.iconUrl, c.width, c.color]).toEqual([
      490,
      791,
      false,
      null,
      100,
      '#888888',
    ]);
    expect([c.secret, c.hideStatus, c.invisible]).toEqual([true, true, true]);
    /* order＝匯出當下的秒數＋序號 */
    expect([a.order, b.order, c.order]).toEqual([1_700_000_000, 1_700_000_001, 1_700_000_002]);
    expect(Object.keys(data.resources).sort()).toEqual([...built.files].sort());
  });

  it('盤面的排法：8 個一列，下一列從上一列最高的下面開始', () => {
    const at = boardPositions(
      Array.from({ length: 10 }, (_, i) => ({ active: i !== 1, size: i === 0 ? 3 : 2 })),
    );
    expect(at[1]).toBeNull();
    expect(at.slice(0, 9).filter(Boolean)).toHaveLength(8);
    expect([at[8], at[9]]).toEqual([
      { x: 360, y: 0 },
      { x: 0, y: 72 },
    ]);
    /* 原作的案例：大小 2 的 10 個 */
    const up = boardPositions(Array.from({ length: 10 }, () => ({ active: true, size: 2 })));
    expect([up[7], up[8], up[9]]).toEqual([
      { x: 336, y: 0 },
      { x: 0, y: 48 },
      { x: 48, y: 48 },
    ]);
  });

  it('超過 500 個時不做', async () => {
    await expect(
      buildPiecesZip(Array.from({ length: 501 }, () => piece({ name: 'x' }))),
    ).rejects.toThrow();
    const ok = await buildPiecesZip(Array.from({ length: 500 }, () => piece({ name: 'x' })));
    expect((await checkRoomZip(ok.bytes)).characterCount).toBe(500);
  });
});

describe('素材 ZIP', () => {
  it('立繪／差分／其他的資料夾、棋子的名稱、同一張只放一次、重名加 _2、JPEG 是 jpg', () => {
    const jpg = { ...png(9), type: 'image/jpeg' };
    const built = buildAssetsZip(
      {
        pieces: [
          { base: '艾莉絲', portrait: png(1), faces: [{ label: '笑', image: png(2) }] },
          { base: '艾莉絲', portrait: png(3), faces: [{ label: '', image: jpg }] },
          { base: 'a/b', portrait: png(1), faces: [] },
          { base: '', portrait: png(4), faces: [] },
        ],
        shelf: [
          { ...png(1), name: '艾莉絲' },
          { ...png(5), name: 'map' },
        ],
      },
      OUT,
      { mtime: new Date(2026, 0, 1) },
    );
    expect(built.count).toBe(6);
    expect(unzipFiles(built.bytes).map((e) => e.name)).toEqual([
      '立繪/艾莉絲.png',
      '差分/艾莉絲_笑.png',
      '立繪/艾莉絲_2.png',
      '差分/艾莉絲_差分.jpg',
      '立繪/沒有名稱.png',
      '其他/map.png',
    ]);
  });
});

describe('角色剪貼簿 JSON', () => {
  it('14 個欄位、2 格縮排、CCFOLIA 讀得懂', () => {
    const text = pieceClipboard(
      piece({
        name: '黑影A',
        status: [{ label: 'HP', value: 20, max: 20 }],
        params: [
          { label: 'DEX', value: '80' },
          { label: '', value: '' },
        ],
        commands: 'CCB<=70 爪擊',
        size: 0,
      }),
    );
    const r = parseCharacterClipboard(text);
    expect(r.ok).toBe(true);
    const data = JSON.parse(text).data;
    expect(Object.keys(data)).toEqual([...CLIPBOARD_FIELDS]);
    expect([data.width, data.height, data.params]).toEqual([1, 1, [{ label: 'DEX', value: '80' }]]);
    expect(text.split('\n')[1]).toBe('  "kind": "character",');
  });
});

describe('整理與專案檔', () => {
  it('壞掉的存檔回到預設、格式不對的項目丟掉', () => {
    expect(cleanDoc(null)).toEqual(defaultDoc());
    const d = cleanDoc({
      mode: 'x',
      images: [{ id: 'i1', name: 'a', asset: 'h', type: 'image/png', size: '12' }, { id: 'i2' }, 3],
      columns: { HP: 'status', MP: 'nope', __proto__: 'x' },
      labels: { k: 'param', j: 'bad' },
      kept: [{ name: 'A', size: 999, color: 'red', image: '', line: -1 }, 'x'],
      opts: { size: '0', roll: 'zz', active: 'yes', faceCommands: true },
      edited: 'no',
    });
    expect(d.mode).toBe('memo');
    expect(d.images).toEqual([{ id: 'i1', name: 'a', asset: 'h', type: 'image/png', size: 12 }]);
    expect(d.columns).toEqual({ HP: 'status' });
    expect(d.labels).toEqual({ k: 'param' });
    expect(d.kept).toHaveLength(1);
    expect([d.kept[0].size, d.kept[0].color, d.kept[0].image, d.kept[0].line]).toEqual([
      100,
      '#888888',
      'auto',
      null,
    ]);
    expect([d.opts.size, d.opts.roll, d.opts.active, d.opts.faceCommands]).toEqual([
      1,
      'auto',
      false,
      true,
    ]);
    expect(d.edited).toBeNull();
    expect(cleanPiece({ invisible: 'yes', secret: true }).invisible).toBe(false);
  });

  it('專案檔往返（ZIP：project.json＋圖片）', () => {
    const doc = {
      ...defaultDoc(),
      memo: '艾莉絲\nHP 12',
      images: [{ id: 'i1', name: '艾莉絲', asset: 'abc', type: 'image/png', size: 9 }],
      kept: [newPiece({ name: 'B', from: 'kept' })],
    };
    const bytes = serializeProjectZip('ccfolia-batch', 1, doc, [
      { name: 'abc.png', data: png(1).bytes },
    ]);
    const back = parseProjectBytes(bytes, 'ccfolia-batch');
    expect(back.version).toBe(1);
    expect(cleanDoc(back.data)).toEqual(doc);
    expect([...back.files.keys()]).toEqual(['abc.png']);
    expect(() => parseProjectBytes(new TextEncoder().encode('{"x":1}'), 'ccfolia-batch')).toThrow();
  });

  it('原作的專案檔', () => {
    const b64 = btoa(String.fromCharCode(...png(7).bytes));
    const legacy = readLegacyProject({
      app: 'ccf-character-batch-maker',
      version: 1,
      state: {
        images: [
          {
            id: 'ia',
            kind: 'file',
            name: 'アリス',
            type: 'image/png',
            size: 9,
            dataUrl: `data:image/png;base64,${b64}`,
          },
          { id: 'ib', kind: 'file', name: 'broken', dataUrl: 'nope' },
        ],
        table: '名前\tHP\nA\t1',
        labels: { 警戒値: 'param' },
        kept: [{ line: '✓', name: 'K', image: 'ia', faces: [{ label: '笑', imageId: 'ia' }] }],
        pasted: [{ line: '⧉', name: 'P' }],
        edited: [
          { line: 3, name: 'E' },
          { line: '', name: 'H' },
        ],
        opts: { roll: 'cc', size: 6, suffix: 'number' },
      },
    });
    expect(legacy).not.toBeNull();
    const { doc, files } = legacy!;
    expect(files.map((f) => [f.id, f.type, f.bytes.length])).toEqual([['ia', 'image/png', 9]]);
    expect(doc.images).toEqual([
      { id: 'ia', name: 'アリス', asset: 'ia', type: 'image/png', size: 9 },
    ]);
    /* 沒有 mode、有表格的舊存檔是表格 */
    expect(doc.mode).toBe('table');
    expect(doc.labels).toEqual({ 警戒値: 'param' });
    expect(doc.kept.map((c) => [c.name, c.from, c.image, c.faces[0]?.imageId])).toEqual([
      ['K', 'kept', 'ia', 'ia'],
    ]);
    expect(doc.pasted.map((c) => c.from)).toEqual(['paste']);
    expect(doc.edited?.map((c) => [c.name, c.from, c.line])).toEqual([
      ['E', 'text', 3],
      ['H', 'hand', null],
    ]);
    expect([doc.opts.roll, doc.opts.size, doc.opts.suffix]).toEqual(['cc', 6, 'number']);
    expect(readLegacyProject({ app: 'other' })).toBeNull();
    expect(dataUrlBytes('data:text/plain,a%20b')?.bytes).toEqual(new Uint8Array([97, 32, 98]));
  });
});
