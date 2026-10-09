/**
 * 劇本文字產生器：標題與圖片的規則（規格 3.3）、從圖片庫建立差分（3.4）、圖片的使用情形與刪除。
 */
import { describe, expect, it } from 'vitest';
import {
  type Doc,
  defaultOpts,
  type Entry,
  type ShelfImage,
  type Speaker,
} from '@/tools/scenario-text/model';
import {
  createLookup,
  detachImage,
  faceMissing,
  facesFromNames,
  imageOf,
  missingFaces,
  titleOf,
  usageMap,
  usesOf,
} from '@/tools/scenario-text/resolve';

const file = (id: string, name: string): ShelfImage => ({
  id,
  kind: 'file',
  name,
  credit: '',
  asset: `a-${id}`,
  type: 'image/png',
  size: 10,
});

const images: ShelfImage[] = [
  file('p', '艾莉絲'),
  file('s', '艾莉絲（笑臉）'),
  file('k', '鑰匙'),
  file('k2', ' 鑰匙 '),
  { id: 'u', kind: 'url', name: '地圖', credit: '', url: 'https://example.com/map.png' },
];

const alice: Speaker = {
  id: 'a',
  name: '艾莉絲',
  aliases: '小艾',
  imageId: 'p',
  faces: [
    { id: 'f1', label: '笑臉', imageId: 's' },
    { id: 'f2', label: '哭', imageId: null },
  ],
};
const bob: Speaker = { id: 'b', name: '鮑伯', aliases: '', imageId: null, faces: [] };

const entry = (patch: Partial<Entry>): Entry => ({
  kind: 'speaker',
  title: '艾莉絲',
  text: 't',
  speakerId: 'a',
  face: '',
  line: 1,
  titleCustom: false,
  image: 'auto',
  ...patch,
});

const doc = (patch: Partial<Doc> = {}): Doc => ({
  images,
  speakers: [alice, bob],
  script: '',
  opts: defaultOpts(),
  edited: null,
  confirmed: [],
  ...patch,
});

describe('標題（3.3）', () => {
  it('差分名稱加進標題：開時「名（差分）」、手動標題不變', () => {
    const off = createLookup(doc());
    const on = createLookup(doc({ opts: { ...defaultOpts(), faceInTitle: true } }));
    const e = entry({ face: '笑臉' });
    expect(titleOf(e, off)).toBe('艾莉絲');
    expect(titleOf(e, on)).toBe('艾莉絲（笑臉）');
    expect(titleOf({ ...e, titleCustom: true, title: '自訂' }, on)).toBe('自訂');
    expect(titleOf({ ...e, speakerId: null }, on)).toBe('艾莉絲');
  });
});

describe('圖片（3.3）', () => {
  const L = createLookup(doc());
  it('順序：沒有圖 → 指定的圖 → 差分 → 立繪 → 同名的圖', () => {
    expect(imageOf(entry({ image: 'none' }), L)).toBeNull();
    expect(imageOf(entry({ image: 'k' }), L)?.id).toBe('k');
    expect(imageOf(entry({ image: 'gone' }), L)).toBeNull();
    expect(imageOf(entry({ face: '笑臉' }), L)?.id).toBe('s');
    expect(imageOf(entry({ face: '哭' }), L)?.id).toBe('p');
    expect(imageOf(entry({ face: '沒登錄' }), L)?.id).toBe('p');
  });

  it('同名的圖：key 比對、同名時第一張；先比畫面上的標題再比原本的標題', () => {
    const e = entry({ kind: 'heading', title: '鑰匙', speakerId: null });
    expect(imageOf(e, L)?.id).toBe('k');
    expect(imageOf(entry({ title: '地圖', speakerId: null }), L)?.id).toBe('u');
    /* 鮑伯沒有圖 → 找名為「鮑伯」的圖（沒有） */
    expect(imageOf(entry({ title: '鮑伯', speakerId: 'b' }), L)).toBeNull();
    /* 差分加進標題時，「艾莉絲（笑臉）」這個名字的圖優先 */
    const on = createLookup(
      doc({
        speakers: [{ ...alice, imageId: null, faces: [] }],
        opts: { ...defaultOpts(), faceInTitle: true },
      }),
    );
    expect(imageOf(entry({ face: '笑臉' }), on)?.id).toBe('s');
    expect(imageOf(entry({ face: '哭' }), on)?.id).toBe('p');
  });

  it('沒有這個差分、未登錄的差分清單（同一位＋同一個差分只列一次）', () => {
    const list = [
      entry({ face: '怒' }),
      entry({ face: '怒' }),
      entry({ face: '笑臉' }),
      entry({ face: '驚', speakerId: 'b' }),
      entry({ face: 'x', speakerId: 'nobody' }),
    ];
    expect(list.map((e) => faceMissing(e, L))).toEqual([true, true, false, true, false]);
    expect(missingFaces(list, L).map((m) => [m.speaker.id, m.face])).toEqual([
      ['a', '怒'],
      ['b', '驚'],
    ]);
  });
});

describe('圖片的使用情形與刪除', () => {
  it('用到的地方：說話者、差分、個別指定這張的劇本文字（手動修改中的與已確定的）', () => {
    const d = doc({
      edited: [entry({ image: 's' }), entry({ image: 'k' })],
      confirmed: [
        {
          id: 'b1',
          mode: 'script',
          label: '',
          script: '',
          opts: defaultOpts(),
          entries: [entry({ image: 's' })],
          edited: false,
        },
      ],
    });
    expect(usesOf(d, 's', { noName: '（沒有名稱）', face: '差分' })).toEqual({
      names: ['艾莉絲（笑臉）'],
      count: 2,
    });
    expect(usesOf(d, 'p', { noName: '（沒有名稱）', face: '差分' })).toEqual({
      names: ['艾莉絲'],
      count: 0,
    });
    const copy = structuredClone(d);
    detachImage(copy, 's');
    expect(copy.images.map((im) => im.id)).not.toContain('s');
    expect(copy.speakers[0].faces[0].imageId).toBeNull();
    expect(copy.edited?.[0].image).toBe('none');
    expect(copy.confirmed[0].entries[0].image).toBe('none');
    expect(copy.edited?.[1].image).toBe('k');
  });

  it('使用情形：圖片 → 標題 × 次數（標題空白時用替代文字）', () => {
    const L = createLookup(doc());
    const use = usageMap(
      [
        entry({}),
        entry({}),
        entry({ face: '笑臉' }),
        entry({ title: '', speakerId: null, image: 'k' }),
        entry({ title: '旁白', speakerId: null }),
      ],
      L,
      '（空白）',
    );
    expect([...use].map(([id, m]) => [id, [...m]])).toEqual([
      ['p', [['艾莉絲', 2]]],
      ['s', [['艾莉絲', 1]]],
      ['k', [['（空白）', 1]]],
    ]);
  });
});

describe('從圖片庫建立差分（3.4）', () => {
  const shelf = (...names: string[]) => names.map((n, i) => file(`i${i}`, n));

  it('名_差分、名（差分）、名@差分、其他寫法；長的寫法先比', () => {
    const sp: Speaker = { id: 'x', name: '艾莉絲', aliases: '艾莉絲貓', imageId: null, faces: [] };
    const r = facesFromNames(
      sp,
      shelf('艾莉絲_笑臉', '艾莉絲（哭）', '艾莉絲@怒', '艾莉絲 驚', '艾莉絲貓-睡', '艾莉絲-'),
    );
    expect(r.made.map((f) => [f.label, f.imageId])).toEqual([
      ['笑臉', 'i0'],
      ['哭', 'i1'],
      ['怒', 'i2'],
      ['驚', 'i3'],
      ['睡', 'i4'],
    ]);
    expect(r.found).toBe(5);
    expect(r.portrait).toBeNull();
  });

  it('只有名字的圖在沒有立繪時設成立繪；別的名字（艾莉絲的家）不算；已經有的不重複', () => {
    const sp: Speaker = {
      id: 'x',
      name: '艾莉絲',
      aliases: '',
      imageId: null,
      faces: [{ id: 'f', label: '笑臉', imageId: null }],
    };
    const r = facesFromNames(
      sp,
      shelf('艾莉絲的家', '艾莉絲', 'ａｂ', '艾莉絲_笑臉', '艾莉絲_哭', '艾莉絲（哭）'),
    );
    expect(r.portrait).toBe('i1');
    expect(r.made.map((f) => f.label)).toEqual(['哭']);
    expect(r.found).toBe(4);
    expect(facesFromNames({ ...sp, imageId: 'p' }, shelf('艾莉絲')).portrait).toBeNull();
  });

  it('全形會先正規化（key）：全形括號、全形＠', () => {
    const sp: Speaker = { id: 'x', name: 'ＡＢ', aliases: '', imageId: null, faces: [] };
    const r = facesFromNames(sp, shelf('AB（笑）', 'ＡＢ＠怒'));
    expect(r.made.map((f) => f.label)).toEqual(['笑', '怒']);
  });
});
