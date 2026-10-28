/**
 * 角色配色條產生器：併入色票櫃之後的角色清單（規格 1.1、1.3）——舊存檔的轉換、部位與「無」、
 * 標「無」的段不畫在配色條上、雙色與異色瞳、色系、色票櫃的排序與分組、複製的文字、新增部位的位置、
 * 自動取色（頭像的主色）、滴管的平均、專案檔的往返。
 */
import { describe, expect, it } from 'vitest';
import { parseProject, serializeProject } from '@/core/storage';
import {
  addPart,
  autoFamily,
  copyTextOf,
  createCharacter,
  dominantInCircle,
  familiesFor,
  familyOf,
  groupCharacters,
  isMultiColor,
  keyColorOf,
  partGroups,
  roleColors,
  roomLeft,
  sampleAverage,
  sortCharacters,
} from '@/tools/color-palette/characters';
import {
  type Bar,
  barOf,
  DEFAULT_CARD,
  DEFAULT_SETTINGS,
  DEFAULT_SHELF,
  imageIds,
  layoutPalette,
  MAX_BARS,
  type PartRole,
  type Segment,
  type Settings,
  sanitizeSettings,
  segmentOf,
} from '@/tools/color-palette/logic';
import {
  CHART_PNG,
  chartContent,
  partLabel,
  planChart,
  planShelf,
} from '@/tools/color-palette/shelfRender';

let n = 0;
const seg = (color: string, role: PartRole | null = null, extra: Partial<Segment> = {}): Segment =>
  segmentOf(`s${++n}`, color, 1, { role, ...extra });
const char = (name: string, segments: Segment[], extra: Partial<Bar> = {}): Bar =>
  barOf(`c${++n}`, 160, segments, { name, ...extra });

describe('舊存檔（版本 1，只有色條）的轉換', () => {
  const v1 = {
    background: '#f3f4f6',
    thickness: 12,
    baseLength: 300,
    baseScale: 160,
    autoSize: true,
    width: 400,
    height: 500,
    padding: 80,
    bars: [
      {
        id: 'a',
        scale: 172,
        segments: [
          { id: 's1', color: '#112233', ratio: 2 },
          { id: 's2', color: '#445566', ratio: 1 },
        ],
      },
    ],
  };

  it('每一條變成一位角色：名字空白、沒有立繪與代表色；每一段變成沒有部位的段，顏色與比例不變', () => {
    const s = sanitizeSettings(v1);
    expect(s.bars).toHaveLength(1);
    expect(s.bars[0]).toMatchObject({
      id: 'a',
      scale: 172,
      name: '',
      image: null,
      avatar: null,
      theme: null,
      hairFamily: null,
      eyeFamily: null,
    });
    expect(s.bars[0].segments).toEqual([
      { id: 's1', color: '#112233', ratio: 2, role: null, memo: '', none: false },
      { id: 's2', color: '#445566', ratio: 1, role: null, memo: '', none: false },
    ]);
    /* 色票櫃、配色卡的設定補預設值 */
    expect(s.shelf).toEqual(DEFAULT_SHELF);
    expect(s.card).toEqual(DEFAULT_CARD);
  });

  it('轉換前後配色條的排版完全相同', () => {
    const before = layoutPalette(v1 as Settings);
    const after = layoutPalette(sanitizeSettings(v1));
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
    expect(after.bars.map((b) => [b.x, b.top, b.bottom, b.boundaries])).toEqual(
      before.bars.map((b) => [b.x, b.top, b.bottom, b.boundaries]),
    );
  });

  it('整理是冪等的；預設內容整理後不變', () => {
    const s = sanitizeSettings(v1);
    expect(sanitizeSettings(s)).toEqual(s);
    expect(sanitizeSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });

  it('新欄位的檢查：名字 80 字、備註 40 字、部位與色系只認得的值、代表色整理成小寫、頭像範圍只在有立繪時留著', () => {
    const s = sanitizeSettings({
      bars: [
        {
          id: 'x',
          scale: 160,
          name: '名'.repeat(100),
          theme: '#ABC',
          image: { id: 'img1', width: 300, height: 400 },
          avatar: { zoom: 2, x: 0.1, y: -0.2, turns: 1 },
          hairFamily: 'oddeye',
          eyeFamily: 'twotone',
          segments: [
            { id: 'p', color: '#fff', ratio: 1, role: 'hair', memo: '備'.repeat(50), none: true },
            { id: 'q', color: '#000', ratio: 1, role: 'wing', none: 'yes' },
          ],
        },
        { id: 'y', scale: 160, segments: [], avatar: { zoom: 3, x: 0, y: 0, turns: 0 } },
      ],
    });
    const [x, y] = s.bars;
    expect(x.name).toHaveLength(80);
    expect(x.theme).toBe('#aabbcc');
    expect(x.image).toEqual({ id: 'img1', width: 300, height: 400 });
    expect(x.avatar).toEqual({ zoom: 2, x: 0.1, y: -0.2, turns: 1 });
    /* 髮色沒有「異色瞳」、瞳色沒有「雙色」：換成對應的那一個 */
    expect([x.hairFamily, x.eyeFamily]).toEqual(['twotone', 'oddeye']);
    expect(x.segments[0]).toMatchObject({ role: 'hair', none: true });
    expect(x.segments[0].memo).toHaveLength(40);
    expect(x.segments[1]).toMatchObject({ role: null, none: false });
    expect(y.avatar).toBeNull();
    expect(imageIds(s)).toEqual(['img1']);
  });

  it('髮色、瞳色各最多 5 個：讀入時多出來的段改成「其他」部位（段留著；其他部位與沒有標部位的段不動）', () => {
    const segs = [
      ...Array.from({ length: 7 }, (_, i) => ({
        id: `h${i}`,
        color: '#111111',
        ratio: 1,
        role: 'hair',
      })),
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `e${i}`,
        color: '#222222',
        ratio: 1,
        role: 'eye',
      })),
      ...Array.from({ length: 8 }, (_, i) => ({ id: `o${i}`, color: '#333333', ratio: 1 })),
    ];
    const [bar] = sanitizeSettings({ bars: [{ id: 'x', scale: 160, segments: segs }] }).bars;
    const g = partGroups(bar.segments);
    expect(g.hair.map((s) => s.id)).toEqual(['h0', 'h1', 'h2', 'h3', 'h4']);
    expect(g.eye).toHaveLength(5);
    expect(g.other).toHaveLength(8 + 3);
    expect(bar.segments.map((s) => s.id)).toEqual(segs.map((s) => s.id));
    expect(bar.segments.find((s) => s.id === 'h5')?.role).toBe('other');
    expect(bar.segments.find((s) => s.id === 'e5')?.role).toBe('other');
  });

  it('角色清單最多 24 位（配色條的上限）', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `b${i}`, scale: 160, segments: [] }));
    expect(sanitizeSettings({ bars: many }).bars).toHaveLength(MAX_BARS);
    expect(roomLeft(many.slice(0, 20))).toBe(4);
    expect(roomLeft(many)).toBe(0);
  });
});

describe('標「無」的段：配色條不畫、不占比例；畫布把手跳過它', () => {
  it('中間一段標「無」：其他兩段平分色條，交界只有一個、上下兩段是第 1、3 段', () => {
    const base = {
      ...DEFAULT_SETTINGS,
      bars: [char('', [seg('#ff0000'), seg('#00ff00', 'eye', { none: true }), seg('#0000ff')])],
    };
    const l = layoutPalette(base).bars[0];
    expect(l.total).toBe(2);
    expect(l.segments.map((s) => [s.color, s.y1 - s.y0, s.index])).toEqual([
      ['#ff0000', 150, 0],
      ['#0000ff', 150, 2],
    ]);
    expect(l.boundaries).toEqual([230]);
    expect(l.pairs).toEqual([[0, 2]]);
  });

  it('全部標「無」：整條畫成淺灰（和沒有段相同）', () => {
    const l = layoutPalette({
      ...DEFAULT_SETTINGS,
      bars: [char('', [seg('#ff0000', 'hair', { none: true })])],
    }).bars[0];
    expect([l.total, l.segments, l.boundaries]).toEqual([0, [], []]);
  });

  it('沒有標「無」時交界的索引就是 [k, k＋1]', () => {
    expect(layoutPalette(DEFAULT_SETTINGS).bars[0].pairs).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });
});

describe('部位、雙色與異色瞳、色系', () => {
  const twoTone = char('甲', [
    seg('#1d1e22', 'hair'),
    seg('#b8303f', 'hair'),
    seg('#8f7fc0', 'eye'),
  ]);
  const noneHair = char('乙', [seg('#000000', 'hair', { none: true }), seg('#30a46c', 'eye')]);
  const odd = char('丙', [seg('#6a4231', 'hair'), seg('#2e4a90', 'eye'), seg('#d9952e', 'eye')]);
  const noneOnly = char('丁', [
    seg('#e9c04a', 'hair'),
    seg('#000', 'eye', { none: true }),
    seg('#000', 'eye', { none: true }),
  ]);

  it('雙色判斷：真的有顏色的髮色（瞳色）兩個以上；「無」不算', () => {
    expect(isMultiColor(twoTone, 'hair')).toBe(true);
    expect(isMultiColor(twoTone, 'eye')).toBe(false);
    expect(isMultiColor(odd, 'eye')).toBe(true);
    expect(isMultiColor(noneOnly, 'eye')).toBe(false);
  });

  it('自動的色系：沒有部位 null、只有「無」是「其他」、兩色以上雙色／異色瞳、一色依顏色', () => {
    expect(autoFamily([], 'hair')).toBeNull();
    expect(familyOf(twoTone, 'hair')).toBe('twotone');
    expect(familyOf(odd, 'eye')).toBe('oddeye');
    expect(familyOf(noneHair, 'hair')).toBe('other');
    expect(familyOf(noneOnly, 'eye')).toBe('other');
    expect(familyOf(odd, 'hair')).toBe('brown');
    expect(familyOf(noneHair, 'eye')).toBe('green');
    expect(familyOf(char('', [seg('#123456')]), 'hair')).toBeNull();
  });

  it('手動指定的色系優先；不屬於這個部位的值不用', () => {
    expect(familyOf({ ...odd, hairFamily: 'yellow' }, 'hair')).toBe('yellow');
    expect(familyOf({ ...odd, hairFamily: 'oddeye' }, 'hair')).toBe('brown');
    expect(familiesFor('hair')).toContain('twotone');
    expect(familiesFor('eye')).toContain('oddeye');
    expect(familiesFor('hair')).not.toContain('oddeye');
  });

  it('代表色的退路：代表色 → 第一個髮色 → 第一個有顏色的部位', () => {
    expect(keyColorOf({ ...twoTone, theme: '#ffcc00' })).toBe('#ffcc00');
    expect(keyColorOf(twoTone)).toBe('#1d1e22');
    expect(keyColorOf(noneHair)).toBe('#30a46c');
    expect(keyColorOf(char('', []))).toBeNull();
  });

  it('複製的文字：大寫色碼以「, 」分隔，「無」不算；全部是「無」時 null', () => {
    expect(copyTextOf(roleColors(twoTone, 'hair'))).toBe('#1D1E22, #B8303F');
    expect(copyTextOf(roleColors(noneOnly, 'eye'))).toBeNull();
    expect(copyTextOf([])).toBeNull();
  });
});

describe('色票櫃的排序與分組', () => {
  const red = char('Ｃ角色', [seg('#d42a2a', 'hair'), seg('#2b55c4', 'eye')]);
  const blonde = char('a2', [seg('#f5e04a', 'hair'), seg('#3aa38a', 'eye')]);
  const black = char('a10', [seg('#111214', 'hair'), seg('#d42a2a', 'eye')], { theme: '#fbfbf8' });
  const twoTone = char('', [seg('#1d1e22', 'hair'), seg('#b8303f', 'hair')]);
  const noHair = char('乙', [seg('#888888')]);
  const lightRed = char('甲', [seg('#ef5d6c', 'hair')]);
  const list = [red, blonde, black, twoTone, noHair, lightRed];
  const names = (bars: Bar[]) => bars.map((b) => b.name || '(無名)');

  it('自己拖曳＝清單的順序', () => {
    expect(sortCharacters(list, 'manual')).toEqual(list);
  });

  it('髮色：色系的順序（紅 → 黃 → 黑 → 雙色），同一色系由亮到暗；沒有髮色的放最後', () => {
    expect(names(sortCharacters(list, 'hair'))).toEqual([
      '甲',
      'Ｃ角色',
      'a2',
      'a10',
      '(無名)',
      '乙',
    ]);
  });

  it('瞳色：沒有瞳色的放最後（保持清單的順序）', () => {
    expect(names(sortCharacters(list, 'eye'))).toEqual([
      'a10',
      'a2',
      'Ｃ角色',
      '(無名)',
      '乙',
      '甲',
    ]);
  });

  it('亮度：代表色（沒有時用髮色、再沒有時用第一個部位）由亮到暗', () => {
    expect(names(sortCharacters(list, 'light'))).toEqual([
      'a10',
      'a2',
      '甲',
      '乙',
      'Ｃ角色',
      '(無名)',
    ]);
  });

  it('名字：數字依大小（a2 在 a10 前），沒有名字的放最後', () => {
    const sorted = names(sortCharacters(list, 'name'));
    expect(sorted.indexOf('a2')).toBeLessThan(sorted.indexOf('a10'));
    expect(sorted.at(-1)).toBe('(無名)');
  });

  it('依髮色分組：每個色系一組（連續），沒有髮色的一組 null；不依髮色、瞳色排序時不分組', () => {
    const g = groupCharacters(sortCharacters(list, 'hair'), 'hair', true);
    expect(g.map((x) => [x.family, x.bars.length])).toEqual([
      ['red', 2],
      ['yellow', 1],
      ['black', 1],
      ['twotone', 1],
      [null, 1],
    ]);
    expect(groupCharacters(list, 'name', true)).toHaveLength(1);
    expect(groupCharacters(list, 'hair', false)).toHaveLength(1);
  });
});

describe('新增角色、部位的位置', () => {
  it('新角色：髮色在上、瞳色在下，比例 1；名字去頭尾空白；各最多 5 色', () => {
    const c = createCharacter(
      {
        name: '  林予安 ',
        image: { id: 'i', width: 10, height: 10 },
        avatar: { zoom: 2, x: 0, y: 0, turns: 0 },
        hair: Array.from({ length: 7 }, () => ({ color: '#222222', none: false })),
        eye: [{ color: '#000000', none: true }],
      },
      158,
    );
    expect(c.name).toBe('林予安');
    expect(c.scale).toBe(158);
    expect(c.segments.map((s) => [s.role, s.ratio, s.none])).toEqual([
      ...Array.from({ length: 5 }, () => ['hair', 1, false]),
      ['eye', 1, true],
    ]);
  });

  it('髮色加在髮色最後、瞳色加在瞳色最後（沒有時接在髮色後面）、其他加在最後', () => {
    let s: Segment[] = [seg('#111111', 'hair'), seg('#eeeeee', 'skin')];
    s = addPart(s, 'eye', '#2222aa');
    s = addPart(s, 'hair', '#333333');
    s = addPart(s, 'eye', '#4444bb');
    s = addPart(s, 'other', '#555555', { memo: '緞帶' });
    expect(s.map((x) => [x.role, x.color])).toEqual([
      ['hair', '#111111'],
      ['hair', '#333333'],
      ['eye', '#2222aa'],
      ['eye', '#4444bb'],
      ['skin', '#eeeeee'],
      ['other', '#555555'],
    ]);
    expect(s.at(-1)?.memo).toBe('緞帶');
    /* 髮色滿 5 色時不再加 */
    let full: Segment[] = [];
    for (let i = 0; i < 7; i++) full = addPart(full, 'hair', '#000000');
    expect(full).toHaveLength(5);
    const g = partGroups(s);
    expect([g.hair.length, g.eye.length, g.other.length]).toEqual([2, 2, 2]);
  });
});

describe('取色', () => {
  /** w × h 的像素（以函式決定每一點） */
  const px = (w: number, h: number, at: (x: number, y: number) => number[]) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(at(x, y), (y * w + x) * 4);
    return { data, width: w, height: h };
  };

  it('自動取色：圓的內側（半徑 0.45 倍邊長）分 4 群，取占得最多的那一群的平均色；圓外與透明的不算', () => {
    /* 圓外一大片綠；圓裡上面多半是紅、下面藍 */
    const img = px(64, 64, (x, y) => {
      const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 32);
      if (d > 28.8) return [0, 200, 0, 255];
      return y < 40 ? [224, 48, 48, 255] : [48, 80, 224, 255];
    });
    expect(dominantInCircle(img)).toBe('#e03030');
    expect(dominantInCircle(px(64, 64, () => [255, 0, 0, 100]))).toBe('#888888');
  });

  it('滴管：3 × 3 的平均（透明度 200 以上的才算）；圖外或全透明 null', () => {
    const img = px(4, 4, (x) => (x < 2 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    expect(sampleAverage(img, 1.5, 1.5)).toBe('#555555');
    expect(sampleAverage(img, 0, 0)).toBe('#000000');
    expect(sampleAverage(img, -1, 0)).toBeNull();
    expect(
      sampleAverage(
        px(3, 3, () => [255, 0, 0, 150]),
        1,
        1,
      ),
    ).toBeNull();
  });
});

describe('專案檔的往返、色碼表與色票櫃 PNG 的大小', () => {
  it('存成專案檔再讀回、整理後與原本相同（含部位、「無」、代表色、色票櫃與配色卡的設定）', () => {
    const s = sanitizeSettings({
      ...DEFAULT_SETTINGS,
      bars: [
        char('甲', [seg('#111111', 'hair'), seg('#000000', 'eye', { none: true })], {
          theme: '#123456',
          image: { id: 'img', width: 600, height: 800 },
          avatar: { zoom: 1.5, x: 0, y: 0.2, turns: 0 },
        }),
      ],
      shelf: { ...DEFAULT_SHELF, sort: 'name', columns: 4 },
      card: {
        ...DEFAULT_CARD,
        title: '標題',
        count: 6,
        columns: [
          {
            ...DEFAULT_CARD.columns[0],
            source: 'photo',
            name: 'photo-1',
            autoName: true,
            image: { id: 'p', width: 10, height: 10 },
          },
        ],
      },
    });
    const text = serializeProject('color-palette', 2, s, new Date(0));
    const back = parseProject<Settings>(text, 'color-palette');
    expect(back.version).toBe(2);
    expect(sanitizeSettings(back.data)).toEqual(s);
  });

  it('色碼表：有髮色、瞳色、代表色時上面三欄，其他部位列在下面（名稱→部位→第幾段）', () => {
    const c = char(
      '甲',
      [
        seg('#111111', 'hair'),
        seg('#222222', 'eye'),
        seg('#333333', 'skin'),
        seg('#444444', 'other', { memo: '緞帶' }),
        seg('#555555'),
      ],
      { theme: '#666666' },
    );
    const { main, others } = chartContent(c);
    expect(main.map((r) => r.label)).toEqual(['髮色', '瞳色', '代表色']);
    /* 「第 n 段」是整條裡的第幾段（和編輯視窗相同） */
    expect(others.map((o) => o.label)).toEqual(['膚色', '緞帶', '第 5 段']);
    expect(partLabel(c, c.segments[4])).toBe('第 5 段');
    const plan = planChart(c);
    expect(plan.width).toBe(CHART_PNG.width);
    expect(plan.height).toBeGreaterThanOrEqual(CHART_PNG.minHeight);
    expect(plan.rows.map((r) => r.spots.length)).toEqual([1, 1, 1]);
    expect(plan.others.map((o) => o.note)).toEqual(['膚色', '緞帶', '第 5 段']);
  });

  it('色碼表：一列放不下的顏色換行；其他部位兩欄；內容多時圖變高', () => {
    const many = char('乙', [
      ...Array.from({ length: 5 }, (_, i) => seg(`#1${i}1111`, 'hair')),
      ...Array.from({ length: 12 }, (_, i) => seg(`#3${i.toString(16)}3333`, 'other')),
    ]);
    const plan = planChart(many);
    const hair = plan.rows[0].spots;
    expect(hair).toHaveLength(5);
    const perLine = new Set(hair.map((s) => s.y)).size;
    expect(perLine).toBe(2);
    expect(new Set(plan.others.map((o) => o.x)).size).toBe(2);
    expect(plan.height).toBeGreaterThan(CHART_PNG.minHeight);
  });

  it('色票櫃 PNG：每列幾位（自動是最多 6 位）決定寬度；分組時每組多一個小標', () => {
    const bars = Array.from({ length: 8 }, (_, i) =>
      char(`c${i}`, [seg(i % 2 ? '#d42a2a' : '#2b55c4', 'hair')]),
    );
    const auto = planShelf(bars, { ...DEFAULT_SHELF, sort: 'manual' });
    expect(auto.columns).toBe(6);
    const four = planShelf(bars, { ...DEFAULT_SHELF, sort: 'manual', columns: 4 });
    expect(four.columns).toBe(4);
    expect(four.width).toBeLessThan(auto.width);
    const grouped = planShelf(bars, { ...DEFAULT_SHELF, sort: 'hair', group: true, columns: 4 });
    expect(grouped.height).toBeGreaterThan(four.height);
  });
});
