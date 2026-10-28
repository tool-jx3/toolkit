/**
 * 立繪身高比較板：跟進原作 2026-10 更新（規格 1.2 節，F57 起）的純邏輯——
 * 兩條線拖到圖外的範圍與身高換算、滑桿的顯示、名稱的 NFC／NFKC、拖進來的檔案分類、重畫變慢的條件、
 * 原作 .hboard 的讀取（格式、順序、錯誤）。
 */
import { describe, expect, it } from 'vitest';
import {
  HBOARD_VERSION,
  HboardError,
  isHboard,
  parseHboard,
} from '../../src/tools/height-board/hboard';
import {
  BOTTOM_SLIDER,
  boardRange,
  type Character,
  clampBottomLine,
  clampTopLine,
  exportLayout,
  foldName,
  geometry,
  isSlowRender,
  LINE_LIMIT,
  listRows,
  nameFromFile,
  sanitizeBoard,
  sliderValue,
  sortDropped,
  TOP_SLIDER,
} from '../../src/tools/height-board/logic';

/** 規格 3.1 的 A：200 × 400，內容 100 × 300 */
const A = { x: 50, y: 60, width: 100, height: 300 };

const char = (patch: Partial<Character>): Character => ({
  id: 'a',
  name: 'A',
  height: 160,
  x: 5,
  top: 0,
  bottom: 100,
  visible: true,
  imageId: 'img-a',
  crop: A,
  ...patch,
});

describe('兩條線拖到圖外（F57）', () => {
  it('盤面上：頭頂線到 −100%（圖的上方一張圖高）、腳底線到 400%（圖的下方三張圖高）', () => {
    expect(clampTopLine(-30, 100, LINE_LIMIT.top)).toBe(-30);
    expect(clampTopLine(-150, 100, LINE_LIMIT.top)).toBe(-100);
    expect(clampBottomLine(250, 0, LINE_LIMIT.bottom)).toBe(250);
    expect(clampBottomLine(450, 0, LINE_LIMIT.bottom)).toBe(400);
  });
  it('兩線至少相隔 5%；頭頂線不低於 95%、腳底線不高於 5%（和以前的內側界限相同）', () => {
    expect(clampTopLine(98, 300, LINE_LIMIT.top)).toBe(95);
    expect(clampTopLine(10, 5, LINE_LIMIT.top)).toBe(0);
    expect(clampBottomLine(3, -100, LINE_LIMIT.bottom)).toBe(5);
    expect(clampBottomLine(-50, -30, LINE_LIMIT.bottom)).toBe(5);
    expect(clampBottomLine(10, 30, LINE_LIMIT.bottom)).toBe(35);
  });
  it('滑桿（預設範圍）照舊 0～100', () => {
    expect(clampTopLine(-3, 100)).toBe(0);
    expect(clampBottomLine(120, 0)).toBe(100);
  });
  it('滑桿的位置停在端點，數值另外照實顯示', () => {
    expect(sliderValue(-25, TOP_SLIDER)).toBe(0);
    expect(sliderValue(12.3, TOP_SLIDER)).toBe(12.3);
    expect(sliderValue(250, BOTTOM_SLIDER)).toBe(100);
  });
  it('蹲姿：頭頂線在圖的上方 25%（A、160 cm）→ 圖高 128 cm、寬約 42.67 cm，頭頂線在 160 cm', () => {
    const g = geometry(char({ top: -25 }));
    expect(g.imageTop).toBeCloseTo(128, 6);
    expect(g.imageBottom).toBeCloseTo(0, 6);
    expect(g.width).toBeCloseTo((100 * 160) / 375, 6);
    expect(g.box.height).toBeCloseTo(128, 6);
    /* 頭頂線（−25%）的高度＝圖的上緣＋圖高的 25% ＝ 身高 */
    expect(g.imageTop + 0.25 * g.box.height).toBeCloseTo(160, 6);
  });
  it('半身：腳底線在 300%（A、150 cm）→ 圖浮在 100～150 cm，寬約 16.67 cm；盤面下緣仍是地面', () => {
    const c = char({ height: 150, bottom: 300 });
    const g = geometry(c);
    expect(g.imageTop).toBeCloseTo(150, 6);
    expect(g.imageBottom).toBeCloseTo(100, 6);
    expect(g.width).toBeCloseTo(100 / 6, 6);
    expect(boardRange([c])).toMatchObject({ top: 180, bottom: 0 });
    const l = exportLayout([c]);
    expect(l?.top).toBe(180);
    expect(l?.bottom).toBe(0);
  });
  it('專案資料：圖外的線照樣讀回；超出範圍的夾到 −100／400', () => {
    const a = char({ top: -50, bottom: 250 });
    expect(sanitizeBoard({ characters: [a] })?.characters[0]).toMatchObject({
      top: -50,
      bottom: 250,
    });
    const odd = char({ top: -300, bottom: 900 });
    expect(sanitizeBoard({ characters: [odd] })?.characters[0]).toMatchObject({
      top: -100,
      bottom: 400,
    });
  });
});

describe('名稱的正規化（F05、F41 修訂）', () => {
  it('檔名合成成 NFC（Mac 拆開的濁點）', () => {
    expect(nameFromFile('ビーナス.png')).toBe('ビーナス');
    expect(nameFromFile('ビーナス.png').length).toBe(4);
  });
  it('篩選：NFKC＋不分大小寫（半形片假名、全形英數、拆開的濁點都算同一個字）', () => {
    expect(foldName('ﾋﾞｰﾅｽ')).toBe(foldName('ビーナス'));
    expect(foldName('ＡＢＣ')).toBe('abc');
    const list = [
      char({ id: '1', name: 'ビーナス' }),
      char({ id: '2', name: 'ＡＢＣ' }),
      char({ id: '3', name: 'ビト' }),
    ];
    const names = (q: string) => listRows(list, { query: q, visibleOnly: false }).map((c) => c.id);
    expect(names('ﾋﾞ')).toEqual(['3', '1']);
    expect(names('abc')).toEqual(['2']);
  });
});

describe('拖進來的檔案（F01、F02 修訂、F62）', () => {
  const f = (name: string, type = '') => ({ name, type });
  it('有專案檔（.hboard、.zip、.json）時開啟第一個，不加入圖片', () => {
    const r = sortDropped([
      f('a.png', 'image/png'),
      f('盤面.HBOARD'),
      f('b.zip', 'application/zip'),
    ]);
    expect(r.board?.name).toBe('盤面.HBOARD');
    expect(r.images).toEqual([]);
    expect(r.rejected).toEqual([]);
  });
  it('沒有專案檔：圖片加入、其他的提示', () => {
    const r = sortDropped([
      f('a.png', 'image/png'),
      f('說明.txt', 'text/plain'),
      f('b.webp', 'image/webp'),
    ]);
    expect(r.board).toBeNull();
    expect(r.images.map((x) => x.name)).toEqual(['a.png', 'b.webp']);
    expect(r.rejected.map((x) => x.name)).toEqual(['說明.txt']);
  });
});

describe('重畫變慢的提示（F72）', () => {
  it('一次重畫 150 ms 以上、而且顯示中至少 20 位', () => {
    expect(isSlowRender(150, 20)).toBe(true);
    expect(isSlowRender(149, 50)).toBe(false);
    expect(isSlowRender(400, 19)).toBe(false);
  });
});

/* ---------- 原作的 .hboard ---------- */

interface Rec {
  id: string;
  name: string;
  heightCm: number;
  x: number;
  z: number;
  topRatio: number;
  bottomRatio: number;
  hidden: boolean;
  blobType?: string;
  bytes: Uint8Array;
}

/** 照原作的格式組一個 .hboard（"THB1"＋長度＋JSON＋圖片） */
function hboard(recs: Rec[], { version = HBOARD_VERSION, magic = 'THB1' } = {}): Uint8Array {
  const meta = {
    version,
    chars: recs.map(({ bytes, ...r }) => ({
      ...r,
      bbox: { x: 0, y: 0, w: 1, h: 1 },
      srcW: 1,
      srcH: 1,
      blobSize: bytes.length,
    })),
  };
  const json = new TextEncoder().encode(JSON.stringify(meta));
  const total = 8 + json.length + recs.reduce((n, r) => n + r.bytes.length, 0);
  const out = new Uint8Array(total);
  for (let i = 0; i < 4; i++) out[i] = magic.charCodeAt(i);
  new DataView(out.buffer).setUint32(4, json.length, true);
  out.set(json, 8);
  let o = 8 + json.length;
  for (const r of recs) {
    out.set(r.bytes, o);
    o += r.bytes.length;
  }
  return out;
}

const rec = (patch: Partial<Rec>): Rec => ({
  id: 'c1',
  name: 'A',
  heightCm: 160,
  x: 5,
  z: 0,
  topRatio: 0,
  bottomRatio: 1,
  hidden: false,
  blobType: 'image/png',
  bytes: new Uint8Array([1, 2, 3]),
  ...patch,
});

describe('原作的 .hboard（F62）', () => {
  it('開頭是 THB1 才算', () => {
    expect(isHboard(hboard([rec({})]))).toBe(true);
    expect(isHboard(new TextEncoder().encode('PK\u0003\u0004 not hboard'))).toBe(false);
    expect(isHboard(new Uint8Array([84, 72, 66]))).toBe(false);
  });
  it('讀出名稱、身高、位置、兩條線（比例 → %）、顯示、圖片；依 z 由後往前排', () => {
    const bytes = hboard([
      rec({ id: 'front', name: '前', z: 2, bytes: new Uint8Array([9]), hidden: true }),
      rec({ id: 'back', name: '後', z: 0, x: 60, heightCm: 158, topRatio: -0.2, bottomRatio: 1.5 }),
      rec({ id: 'mid', name: '中', z: 1, blobType: '', bytes: new Uint8Array([7, 7]) }),
    ]);
    const list = parseHboard(bytes);
    expect(list.map((c) => c.name)).toEqual(['後', '中', '前']);
    expect(list[0]).toMatchObject({ height: 158, x: 60, visible: true, type: 'image/png' });
    expect(list[0].top).toBeCloseTo(-20, 9);
    expect(list[0].bottom).toBeCloseTo(150, 9);
    expect([...list[0].bytes]).toEqual([1, 2, 3]);
    expect(list[1].type).toBe('image/png');
    expect([...list[1].bytes]).toEqual([7, 7]);
    expect(list[2].visible).toBe(false);
    expect([...list[2].bytes]).toEqual([9]);
  });
  it('沒有角色的盤面', () => {
    expect(parseHboard(hboard([]))).toEqual([]);
  });
  it('損壞：開頭不對、長度超過、JSON 壞掉、chars 不是陣列、圖片超出檔尾、缺身高', () => {
    const problem = (b: Uint8Array) => {
      try {
        parseHboard(b);
      } catch (e) {
        return e instanceof HboardError ? e.problem : 'other';
      }
      return null;
    };
    expect(problem(hboard([rec({})], { magic: 'XXXX' }))).toBe('broken');
    const long = hboard([rec({})]);
    new DataView(long.buffer).setUint32(4, long.length, true);
    expect(problem(long)).toBe('broken');
    const badJson = hboard([rec({})]);
    badJson[8] = 0x7b;
    badJson[9] = 0x7b;
    expect(problem(badJson)).toBe('broken');
    const noChars = new TextEncoder().encode('{"version":1}');
    const nc = new Uint8Array(8 + noChars.length);
    nc.set([84, 72, 66, 49]);
    new DataView(nc.buffer).setUint32(4, noChars.length, true);
    nc.set(noChars, 8);
    expect(problem(nc)).toBe('broken');
    const cut = hboard([rec({ bytes: new Uint8Array(10) })]);
    expect(problem(cut.slice(0, cut.length - 1))).toBe('broken');
    expect(problem(hboard([rec({ heightCm: Number.NaN })]))).toBe('broken');
  });
  it('版本不支援：problem＝version，帶出檔案的版本', () => {
    try {
      parseHboard(hboard([rec({})], { version: 2 }));
      throw new Error('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(HboardError);
      expect((e as HboardError).problem).toBe('version');
      expect((e as HboardError).version).toBe(2);
    }
  });
});
