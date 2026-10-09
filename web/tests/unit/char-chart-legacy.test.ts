/**
 * 角色分析圖產生器（char-chart）讀原作的檔案（規格 3.9）：
 * - 原作 R 的專案 JSON（tests/unit/fixtures/char-chart-original-relation.json，用原作 cdb093b 的頁面存的）：
 *   人、圖片、線的種類（id 換掉、順序不變）、連線（索引換成角色）、標題、顯示名字；壞資料、上限；
 * - 原作 Q 的全部備份碼（char-chart-original-backup.txt，用原作 d8d19d5 的頁面複製的）：頁、角色、每頁的位置、圖片、目前的頁；
 *   舊版格式（沒有 positions、沒有 pages）；不是備份碼的文字；
 * - data URL → Blob。
 */
import { describe, expect, it } from 'vitest';
import {
  dataUrlToBlob,
  decodeBackupCode,
  fromBackupCode,
  fromRelationFile,
  isRelationFile,
  LegacyFileError,
} from '@/tools/char-chart/legacy';
import { initialState, LIMITS, PALETTE } from '@/tools/char-chart/model';
import backupCode from './fixtures/char-chart-original-backup.txt?raw';
import relationText from './fixtures/char-chart-original-relation.json?raw';

const relationFile = JSON.parse(relationText);

/** 跟原作一樣把 JSON 轉成備份碼（UTF-8 → Base64） */
const encode = (v: unknown) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(v))));

describe('原作 R：關係圖的專案 JSON', () => {
  it('原作存的檔：人（名字、圖片）、線的種類、連線、標題、顯示名字；四象限回到預設、沒有人放在上面', () => {
    expect(isRelationFile(relationFile)).toBe(true);
    const r = fromRelationFile(relationFile);
    expect(r.kind).toBe('relation');
    expect(r.dropped).toBe(0);
    const d = r.state;
    expect(d.characters.map((c) => [c.id, c.name, c.color, c.inMap, c.image])).toEqual([
      ['c1', '紅色', PALETTE[0], true, null],
      ['c2', '藍色', PALETTE[1], true, null],
      ['c3', '綠色', PALETTE[2], true, null],
    ]);
    expect([...r.images.keys()]).toEqual([0, 1, 2]);
    for (const url of r.images.values()) expect(url).toMatch(/^data:image\/png;base64,/);
    expect(d.relation).toEqual({
      title: '測試關係圖',
      showNames: false,
      legends: [
        { id: 'l1', label: '同伴', color: '#22aa88', style: 'solid' },
        { id: 'l2', label: '敵視', color: '#555555', style: 'dash' },
        { id: 'l3', label: '在意', color: '#ff00ae', style: 'arrow' },
      ],
      links: [
        { from: 'c1', to: 'c2', legend: 'l1' },
        { from: 'c3', to: 'c1', legend: 'l3' },
        { from: 'c2', to: 'c3', legend: 'l2' },
      ],
    });
    expect(d.pages).toEqual(initialState().pages);
    expect(r.page).toBe(0);
  });

  it('壞資料：看不懂的圖片（沒有圖片的人）、樣式、線、索引、重複的對；沒有標題、沒有線的種類時用預設', () => {
    const r = fromRelationFile({
      images: [
        { name: '甲', src: 'data:image/png;base64,AAAA' },
        { name: 5, src: 'https://example.com/x.png' },
        'junk',
        { name: ' 丁 ' },
      ],
      legends: [{ id: 1, label: '線', color: 'red', style: 'zigzag' }, 7],
      connections: [
        { fromIndex: 0, toIndex: 1, legendId: 1 },
        { fromIndex: 1, toIndex: 0, legendId: 1 },
        { fromIndex: 0, toIndex: 0, legendId: 1 },
        { fromIndex: 0, toIndex: 9, legendId: 1 },
        { fromIndex: 2, toIndex: 3, legendId: 99 },
        { fromIndex: '0', toIndex: 3, legendId: 1 },
        { fromIndex: 3, toIndex: 2, legendId: 1 },
      ],
    });
    expect(r.state.characters.map((c) => c.name)).toEqual(['甲', '', '', '丁']);
    expect([...r.images.keys()]).toEqual([0]);
    expect(r.state.relation.title).toBe('角色關係圖');
    expect(r.state.relation.showNames).toBe(true);
    expect(r.state.relation.legends).toEqual([
      { id: 'l1', label: '線', color: PALETTE[0], style: 'solid' },
    ]);
    expect(r.state.relation.links).toEqual([
      { from: 'c1', to: 'c2', legend: 'l1' },
      { from: 'c4', to: 'c3', legend: 'l1' },
    ]);
    const empty = fromRelationFile({ images: [], legends: [], connections: [] });
    expect(empty.state.characters).toEqual([]);
    expect(empty.state.relation.legends).toHaveLength(5);
  });

  it('超過 50 人只讀前 50 個（後面的連線丟掉）；不是原作的檔不認', () => {
    const images = Array.from({ length: 53 }, (_, i) => ({ name: `p${i}` }));
    const r = fromRelationFile({
      images,
      legends: [{ id: 1, label: 'x', color: '#000000', style: 'solid' }],
      connections: [
        { fromIndex: 0, toIndex: 49, legendId: 1 },
        { fromIndex: 0, toIndex: 52, legendId: 1 },
      ],
    });
    expect(r.state.characters).toHaveLength(LIMITS.characters);
    expect(r.dropped).toBe(3);
    expect(r.state.relation.links).toEqual([{ from: 'c1', to: 'c50', legend: 'l1' }]);
    expect(isRelationFile({ images: [] })).toBe(false);
    expect(isRelationFile({ format: 'trpg-toolkit-project', images: [], legends: [] })).toBe(false);
    expect(isRelationFile([1])).toBe(false);
    expect(() => fromRelationFile({ title: 'x' })).toThrow(LegacyFileError);
  });
});

describe('原作 Q：全部備份碼', () => {
  it('原作複製的碼：頁（標題、軸名）、角色（名字、顏色、圖片）、每頁的位置、目前的頁；關係圖的設定留著、連線清掉', () => {
    const cur = initialState();
    cur.relation.title = '我的關係圖';
    cur.relation.links = [{ from: 'c1', to: 'c2', legend: 'l1' }];
    const r = fromBackupCode(backupCode, cur);
    expect(r.kind).toBe('quadrant');
    expect(r.page).toBe(1);
    const d = r.state;
    expect(d.pages.map((p) => [p.id, p.title, p.labels])).toEqual([
      ['p1', '冒險者的性格', { top: '樂觀', bottom: '悲觀', left: '感性', right: '理性' }],
      ['p2', '戰鬥風格', { top: '前衛', bottom: '後衛', left: '魔法', right: '物理' }],
    ]);
    expect(d.characters.map((c) => [c.id, c.name, c.color])).toEqual([
      ['c1', '艾琳', '#ef4444'],
      ['c2', '布魯斯', '#3b82f6'],
      ['c3', '凱特', '#ef4444'],
    ]);
    expect([...r.images.keys()]).toEqual([2]);
    expect(d.pages[0].positions).toEqual({
      c1: { x: -120, y: -80 },
      c2: { x: 150, y: 90 },
      c3: { x: 0, y: 200 },
    });
    expect(d.pages[1].positions).toEqual({ c1: { x: 40.5, y: 60 }, c3: { x: -200, y: -100 } });
    expect(d.relation.title).toBe('我的關係圖');
    expect(d.relation.legends).toEqual(cur.relation.legends);
    expect(d.relation.links).toEqual([]);
  });

  it('舊版格式：角色只有 x、y（第 1 頁）、只有 title 與 labels（一頁）；位置夾在畫布、超出的頁不算', () => {
    const code = encode({
      title: '舊的圖',
      labels: { top: '上', bottom: '下' },
      characters: [
        { name: '甲', color: '#abc', x: 10, y: 999 },
        { name: '乙', color: 'blue', positions: { 0: { x: 1, y: 2 }, 3: { x: 5, y: 5 } } },
        { name: '丙', type: 'image', imageSrc: 'data:image/png;base64,iVBORw0KGgo=' },
      ],
      currentPage: 7,
    });
    const r = fromBackupCode(code, initialState());
    expect(r.state.pages).toEqual([
      {
        id: 'p1',
        title: '舊的圖',
        labels: { top: '上', bottom: '下', left: '', right: '' },
        /* 丙沒有 positions 也沒有 x、y：第 1 頁的中央 */
        positions: { c1: { x: 10, y: 400 }, c2: { x: 1, y: 2 }, c3: { x: 0, y: 0 } },
      },
    ]);
    expect(r.state.characters.map((c) => c.color)).toEqual(['#aabbcc', PALETTE[1], PALETTE[2]]);
    expect([...r.images.keys()]).toEqual([2]);
    expect(r.page).toBe(0);
    /* 沒有頁面時沿用目前的頁（位置清掉） */
    const noPages = fromBackupCode(
      encode({ characters: [{ name: '甲', positions: {} }] }),
      initialState(),
    );
    expect(noPages.state.pages.map((p) => p.title)).toEqual(
      initialState().pages.map((p) => p.title),
    );
  });

  it('不是備份碼：不是 Base64、不是 UTF-8 的 JSON、不是物件、沒有角色也沒有頁', () => {
    for (const bad of [
      '',
      '   ',
      'hello world!',
      '[{"n":"a","x":1,"y":2}]',
      'abcde',
      encode([1, 2]),
      encode({ a: 1 }),
    ])
      expect(() => decodeBackupCode(bad), bad).toThrow(LegacyFileError);
    expect(() => decodeBackupCode(btoa('\xff\xfe{'))).toThrow(LegacyFileError);
    /* 換行、空白忽略（從聊天室複製時常常斷行） */
    const wrapped = backupCode.trim().replace(/(.{60})/g, '$1\n');
    expect(decodeBackupCode(wrapped).currentPage).toBe(1);
  });
});

describe('對等驗證後（7.1）', () => {
  it('圖片不是 data URL（例如網址）的人算進讀不了的圖片；沒有圖片欄位的不算', () => {
    const r = fromRelationFile({
      images: [
        { name: '網址', src: 'https://example.com/a.png' },
        { name: '沒有' },
        { name: '空白', src: '' },
        { name: '好的', src: 'data:image/png;base64,iVBORw0KGgo=' },
      ],
      legends: [],
    });
    expect(r.invalid).toBe(1);
    expect([...r.images.keys()]).toEqual([3]);
    const q = fromBackupCode(
      encode({
        characters: [
          { name: '甲', type: 'image', imageSrc: 'http://example.com/x.png' },
          { name: '乙', type: 'dot' },
          { name: '丙', type: 'image', imageSrc: 'data:image/png;base64,iVBORw0KGgo=' },
        ],
      }),
      initialState(),
    );
    expect(q.invalid).toBe(1);
    expect([...q.images.keys()]).toEqual([2]);
  });
});

describe('data URL', () => {
  it('Base64 與文字的 data URL → Blob（類型保留）；看不懂時 null', async () => {
    const b = dataUrlToBlob('data:image/png;base64,iVBORw0KGgo=');
    expect(b?.type).toBe('image/png');
    expect([...new Uint8Array(await (b as Blob).arrayBuffer())]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const t = dataUrlToBlob('data:image/svg+xml,%3Csvg%2F%3E');
    expect(await t?.text()).toBe('<svg/>');
    expect(dataUrlToBlob('nope')).toBeNull();
    expect(dataUrlToBlob('data:image/png;base64,@@@')).toBeNull();
  });
});
