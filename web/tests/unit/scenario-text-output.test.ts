/**
 * 劇本文字產生器的輸出：房間 ZIP（規格 3.1；實作時與原作 roomdata.v1.js 的 build 對照，notes 的值、resources、
 * 圖片檔都相同，只有 ID 與 .token 不同〔5. D4〕）、打包圖片（3.7）。
 */
import { describe, expect, it } from 'vitest';
import { checkRoomZip, ROOM_IMAGE_NAME_RE, readRoomZip } from '@/ccfolia';
import { sha256Hex, unzipFiles } from '@/core/files';
import {
  type BundleImage,
  buildImageBundle,
  buildScenarioZip,
  bundleFileName,
  usedText,
} from '@/tools/scenario-text/output';
import { BUNDLE_TEXT } from '@/tools/scenario-text/strings';

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const PNG = b64(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
);
const GIF = b64('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
const NOW = Date.UTC(2026, 9, 9, 6, 30, 15, 789);

describe('房間 ZIP（3.1）', () => {
  it('只追加：room 是 {}、notes 一則一筆（order＝秒數＋序號、沒有圖是空字串）', async () => {
    let n = 0;
    const built = await buildScenarioZip(
      [
        {
          title: '艾莉絲',
          text: '「你好」',
          image: { kind: 'file', key: 'i1', bytes: PNG, type: 'image/png' },
        },
        { title: '', text: '旁白', image: null },
        { title: '鮑伯', text: '嗨', image: { kind: 'url', url: 'https://example.com/b.png' } },
        {
          title: '艾莉絲',
          text: '「再見」',
          image: { kind: 'file', key: 'i1', bytes: PNG, type: 'image/png' },
        },
        {
          title: 'HO',
          text: '秘密',
          image: { kind: 'file', key: 'i2', bytes: GIF, type: 'image/gif' },
        },
      ],
      { now: NOW, newId: () => `n${n++}` },
    );
    const png = `${await sha256Hex(PNG)}.png`;
    const gif = `${await sha256Hex(GIF)}.gif`;
    const base = Math.floor(NOW / 1000);
    expect(built.data).toEqual({
      meta: { version: '1.1.0' },
      entities: {
        room: {},
        items: {},
        decks: {},
        notes: {
          n0: { name: '艾莉絲', text: '「你好」', order: base, iconUrl: png },
          n1: { name: '', text: '旁白', order: base + 1, iconUrl: '' },
          n2: { name: '鮑伯', text: '嗨', order: base + 2, iconUrl: 'https://example.com/b.png' },
          n3: { name: '艾莉絲', text: '「再見」', order: base + 3, iconUrl: png },
          n4: { name: 'HO', text: '秘密', order: base + 4, iconUrl: gif },
        },
        characters: {},
        effects: {},
        scenes: {},
        savedatas: {},
        snapshots: {},
      },
      resources: { [png]: { type: 'image/png' }, [gif]: { type: 'image/gif' } },
    });
    expect(built.files).toEqual([png, gif]);
    const check = await checkRoomZip(built.bytes);
    expect(check).toMatchObject({ ok: true, imageCount: 2 });
    const read = readRoomZip(built.bytes);
    expect(read.entries.map((e) => e.name)).toEqual(['__data.json', '.token', png, gif]);
    expect(new TextDecoder().decode(read.entries[1].data)).toMatch(/^0\.[0-9a-f]{64}$/);
    expect(ROOM_IMAGE_NAME_RE.test(png)).toBe(true);
  });

  it('預設的 ID 不重複；不是四種格式的圖丟錯', async () => {
    const built = await buildScenarioZip(
      Array.from({ length: 30 }, (_, i) => ({ title: `${i}`, text: 'x', image: null })),
    );
    expect(Object.keys(built.data.entities.notes)).toHaveLength(30);
    await expect(
      buildScenarioZip([
        {
          title: 'a',
          text: 'b',
          image: { kind: 'file', key: 'x', bytes: new Uint8Array([1, 2, 3]), type: 'image/avif' },
        },
      ]),
    ).rejects.toThrow();
  });
});

describe('打包圖片（3.7）', () => {
  it('檔名清理', () => {
    expect(bundleFileName(' a/b:c*?"<>|\u0001 ', '圖片')).toBe('a_b_c_______');
    expect(bundleFileName('   ', '圖片')).toBe('圖片');
  });

  it('用在：最多 8 種，超過加「、還有 n 種」；沒用到', () => {
    const m = new Map(Array.from({ length: 10 }, (_, i) => [`t${i}`, i + 1] as [string, number]));
    expect(usedText(m, BUNDLE_TEXT)).toBe(
      't0 ×1、t1 ×2、t2 ×3、t3 ×4、t4 ×5、t5 ×6、t6 ×7、t7 ×8、還有 2 種',
    );
    expect(usedText(undefined, BUNDLE_TEXT)).toBe('（沒有用到）');
  });

  it('ZIP 的內容與清單文字（CRLF、同名加（2）、網址、找不到內容）', () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    const list: BundleImage[] = [
      {
        name: '艾莉絲',
        credit: '畫師 A',
        use: new Map([
          ['艾莉絲', 2],
          ['艾莉絲（笑臉）', 1],
        ]),
        file: { bytes: PNG, type: 'image/png', size: PNG.length, hash: 'h1' },
      },
      {
        name: '艾莉絲',
        credit: '',
        use: undefined,
        file: { bytes: big, type: 'image/png', size: big.length, hash: 'h2' },
      },
      {
        name: '艾莉絲',
        credit: '',
        use: undefined,
        file: { bytes: GIF, type: 'image/gif', size: GIF.length, hash: 'h3' },
      },
      { name: '地圖', credit: '', use: new Map([['地圖', 1]]), url: 'https://example.com/m.png' },
      { name: '遺失', credit: 'C', use: undefined, file: null },
    ];
    const built = buildImageBundle(list, {
      all: true,
      date: '2026/10/9 下午2:30:15',
      T: BUNDLE_TEXT,
      mtime: new Date(Date.UTC(2026, 0, 1)),
    });
    expect(built).toMatchObject({ files: 3, urls: 1, lost: 1 });
    expect(built.text.split('\r\n')).toEqual([
      '劇本文字產生器 圖片清單',
      '建立時間：2026/10/9 下午2:30:15',
      '圖片 5 張（圖片庫的所有圖片）',
      '圖片檔在 images 資料夾裡。',
      '「房間 ZIP 裡的檔名」是這張圖片在匯出的房間 ZIP 裡的檔名。',
      '',
      '[1] images/艾莉絲.png',
      '    大小：1 KB（image/png）',
      '    房間 ZIP 裡的檔名：h1.png',
      '    出處／作者：畫師 A',
      '    用在：艾莉絲 ×2、艾莉絲（笑臉） ×1',
      '',
      '[2] images/艾莉絲（2）.png',
      '    大小：5.0 MB（image/png） ※ 超過 5 MB',
      '    房間 ZIP 裡的檔名：h2.png',
      '    出處／作者：（未填）',
      '    用在：（沒有用到）',
      '',
      /* 副檔名不同就不算同名 */
      '[3] images/艾莉絲.gif',
      '    大小：1 KB（image/gif）',
      '    房間 ZIP 裡的檔名：h3.gif',
      '    出處／作者：（未填）',
      '    用在：（沒有用到）',
      '',
      '[4] 地圖（網址的圖片，ZIP 裡沒有內容）',
      '    網址：https://example.com/m.png',
      '    出處／作者：（未填）',
      '    用在：地圖 ×1',
      '',
      '[5] 遺失（找不到內容，ZIP 裡沒有）',
      '    出處／作者：C',
      '    用在：（沒有用到）',
      '',
    ]);
    const entries = unzipFiles(built.bytes);
    expect(entries.map((e) => e.name)).toEqual([
      'images/艾莉絲.png',
      'images/艾莉絲（2）.png',
      'images/艾莉絲.gif',
      '圖片清單.txt',
    ]);
    expect(new TextDecoder().decode(entries[3].data)).toBe(built.text);
  });

  it('只放用到的圖時的說明', () => {
    const built = buildImageBundle([], { all: false, date: 'd', T: BUNDLE_TEXT });
    expect(built.text.split('\r\n')[2]).toBe('圖片 0 張（劇本文字用到的圖片）');
  });
});
