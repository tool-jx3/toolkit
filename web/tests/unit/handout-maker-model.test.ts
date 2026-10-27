/**
 * 線索道具產生器（handout-maker）的資料規則（規格 3.1、3.4、3.8）：
 * 寬高的範圍與 24 px 對齊、換主題時的配色、主題預設的字型、存檔的整理（缺欄位、超出範圍、壞資料、重複的 id、張數上限）、
 * 存讀往返、範例、清單上的名稱、要下載的字、終端機的標頭、背景圖的色調矩陣。
 */
import { describe, expect, it } from 'vitest';
import {
  applyExample,
  EXAMPLE_LIST,
  EXAMPLES,
  exampleHandout,
} from '@/tools/handout-maker/examples';
import {
  blankHandout,
  colorsForTheme,
  DEFAULT_EXTRAS,
  GRID_PX,
  gridCells,
  HANDOUT_MAX,
  type HandoutState,
  handoutName,
  normalizeColor,
  normalizeHandout,
  normalizeSize,
  normalizeState,
  resolveFontId,
  SIZE_RANGE,
  snapSize,
  stateAssetIds,
  stepSize,
  THEME_DEFAULTS,
  THEME_FIELDS,
  THEME_IDS,
} from '@/tools/handout-maker/model';
import { fontNeeds, terminalHeader } from '@/tools/handout-maker/render';
import { filterOps, hueRotateMatrix } from '@/tools/handout-maker/render/images';

describe('尺寸與 24 px 對齊（F23、F24）', () => {
  it('預設 384 × 528（都是 24 的倍數：16 × 22 格）', () => {
    const h = blankHandout();
    expect([h.width, h.height]).toEqual([384, 528]);
    expect([gridCells(h.width), gridCells(h.height)]).toEqual([16, 22]);
  });

  it('對齊：四捨五入到 24 的倍數、夾在範圍內', () => {
    expect(snapSize(400)).toBe(408);
    expect(snapSize(395)).toBe(384);
    expect(snapSize(396)).toBe(408);
    expect(snapSize(10)).toBe(SIZE_RANGE.min);
    expect(snapSize(99_999)).toBe(SIZE_RANGE.max);
    expect(SIZE_RANGE.min % GRID_PX).toBe(0);
    expect(SIZE_RANGE.max % GRID_PX).toBe(0);
  });

  it('不對齊時取整數、夾在範圍內', () => {
    expect(normalizeSize(400.4, false)).toBe(400);
    expect(normalizeSize(50, false)).toBe(SIZE_RANGE.min);
    expect(normalizeSize(Number.NaN, false)).toBe(384);
    expect(normalizeSize(401, true)).toBe(408);
  });

  it('一格：對齊時先對齊再 ±24，否則 ±10（同原作的滾輪）', () => {
    expect(stepSize(384, 1, true)).toBe(408);
    expect(stepSize(400, -1, true)).toBe(384);
    expect(stepSize(400, 1, false)).toBe(410);
    expect(stepSize(SIZE_RANGE.min, -1, false)).toBe(SIZE_RANGE.min);
  });
});

describe('配色（F20、F21）', () => {
  it('兩個顏色都是某個主題的預設時，換主題一起換成新主題的預設', () => {
    expect(colorsForTheme({ bgColor: '#ffffff', textColor: '#333333' }, 'status')).toEqual({
      bgColor: '#0f1928',
      textColor: '#44ddff',
    });
    /* 背景、文字分別是不同主題的預設也算（同原作） */
    expect(colorsForTheme({ bgColor: '#000000', textColor: '#3b2a1a' }, 'sticky')).toEqual({
      bgColor: '#fdfd96',
      textColor: '#333333',
    });
  });

  it('改過任何一個就不動', () => {
    expect(colorsForTheme({ bgColor: '#ffeedd', textColor: '#333333' }, 'terminal')).toEqual({
      bgColor: '#ffeedd',
      textColor: '#333333',
    });
    expect(colorsForTheme({ bgColor: '#ffffff', textColor: '#123456' }, 'terminal')).toEqual({
      bgColor: '#ffffff',
      textColor: '#123456',
    });
  });

  it('原作有的主題配色照原作', () => {
    expect(THEME_DEFAULTS.status).toMatchObject({ bg: '#0f1928', text: '#44ddff' });
    expect(THEME_DEFAULTS.terminal).toMatchObject({ bg: '#000000', text: '#00ff00' });
    expect(THEME_DEFAULTS.wanted).toMatchObject({ bg: '#e8dcc6', text: '#3b2a1a' });
    expect(THEME_DEFAULTS.sticky).toMatchObject({ bg: '#fdfd96', text: '#333333' });
    expect(THEME_DEFAULTS.basic).toMatchObject({ bg: '#ffffff', text: '#333333' });
  });

  it('顏色整理：#rgb 展開、轉小寫；背景可以有透明度（ff 結尾的去掉）', () => {
    expect(normalizeColor('#ABC', '#000000')).toBe('#aabbcc');
    expect(normalizeColor('#11223380', '#000000', true)).toBe('#11223380');
    expect(normalizeColor('#112233ff', '#000000', true)).toBe('#112233');
    expect(normalizeColor('#11223380', '#000000')).toBe('#000000');
    expect(normalizeColor('red', '#000000')).toBe('#000000');
  });
});

describe('字型（F05）', () => {
  it('「主題預設」換成主題的字型；選了字型就用選的', () => {
    expect(resolveFontId({ font: 'theme', theme: 'status' })).toBe('cubic');
    expect(resolveFontId({ font: 'theme', theme: 'newspaper' })).toBe('noto-serif');
    expect(resolveFontId({ font: 'huninn', theme: 'newspaper' })).toBe('huninn');
  });
});

describe('存檔的整理', () => {
  it('缺欄位補預設；超出範圍夾回；看不懂的換預設', () => {
    const h = normalizeHandout({
      id: 'x1',
      theme: 'wanted',
      fontSize: 999,
      imageSize: 3,
      align: 'diagonal',
      stamp: 'boom',
      texture: 'wood',
      bg: { fit: 'stretch', blur: 50, hue: -5, opacity: 0 },
      width: 5,
      height: 10_000,
      bgColor: 'not a color',
      extra: { heading: '通緝\n要犯', masthead: 42 },
    });
    expect(h.theme).toBe('wanted');
    expect(h.fontSize).toBe(72);
    expect(h.imageSize).toBe(10);
    expect(h.align).toBe('left');
    expect(h.stamp).toBe('none');
    expect(h.texture).toBe('none');
    expect(h.bg).toEqual({ image: null, fit: 'cover', blur: 20, hue: 0, opacity: 10 });
    expect([h.width, h.height]).toEqual([SIZE_RANGE.min, SIZE_RANGE.max]);
    expect(h.bgColor).toBe(THEME_DEFAULTS.wanted.bg);
    expect(h.extra.heading).toBe('通緝 要犯');
    expect(h.extra.masthead).toBe(DEFAULT_EXTRAS.masthead);
  });

  it('對齊 24 px 的存檔讀回時寬高也對齊', () => {
    const h = normalizeHandout({ snap: true, width: 400, height: 500 });
    expect([h.width, h.height]).toEqual([408, 504]);
  });

  it('圖片參照缺 id 或大小時拿掉', () => {
    expect(normalizeHandout({ image: { id: '', width: 1, height: 1 } }).image).toBeNull();
    expect(normalizeHandout({ image: { id: 'a', width: 0, height: 1 } }).image).toBeNull();
    expect(
      normalizeHandout({ image: { id: 'a', name: 'p.png', width: 10, height: 20 } }).image,
    ).toEqual({
      id: 'a',
      name: 'p.png',
      width: 10,
      height: 20,
    });
  });

  it('整份：至少一張、最多 60 張、id 不重複', () => {
    const fb = (): HandoutState => ({ items: [blankHandout('memo', 'fallback')] });
    expect(normalizeState(null, fb).items.map((h) => h.id)).toEqual(['fallback']);
    expect(normalizeState({ items: [] }, fb).items).toHaveLength(1);
    const many = normalizeState({ items: Array.from({ length: 80 }, () => ({ id: 'dup' })) }, fb);
    expect(many.items).toHaveLength(HANDOUT_MAX);
    expect(new Set(many.items.map((h) => h.id)).size).toBe(HANDOUT_MAX);
    expect(many.items[0].id).toBe('dup');
  });

  it('存讀往返：整理過的資料經過 JSON 再整理一次完全相同', () => {
    const state: HandoutState = {
      items: EXAMPLE_LIST.map((ex, i) => ({
        ...exampleHandout(ex, `h${i}`),
        image: i % 2 ? { id: `img${i}`, name: 'a.png', width: 300, height: 200 } : null,
        bgColor: i === 3 ? '#ffffff80' : exampleHandout(ex).bgColor,
      })),
    };
    const once = normalizeState(state, () => state);
    expect(once).toEqual(state);
    expect(normalizeState(JSON.parse(JSON.stringify(once)), () => state)).toEqual(once);
    expect(stateAssetIds(once)).toEqual(['img1', 'img3', 'img5', 'img7', 'img9']);
  });
});

describe('範例（F03）', () => {
  it('每個主題一個範例，主題與鍵相同', () => {
    for (const t of THEME_IDS) expect(EXAMPLES[t].theme).toBe(t);
    expect(EXAMPLE_LIST.map((e) => e.theme)).toEqual([...THEME_IDS]);
  });

  it('範例的大小都在範圍內；勾了對齊的都是 24 的倍數', () => {
    for (const ex of EXAMPLE_LIST) {
      const h = exampleHandout(ex);
      expect(normalizeHandout(h, h.id)).toEqual(h);
      if (h.snap) expect([h.width % 24, h.height % 24]).toEqual([0, 0]);
    }
  });

  it('套到一張上：id 與圖片保留，其他照範例', () => {
    const base = {
      ...blankHandout('basic', 'keep'),
      image: { id: 'p', name: 'p.png', width: 10, height: 10 },
      imageFilter: 'sepia' as const,
      title: '舊的',
    };
    const h = applyExample(base, EXAMPLES.newspaper);
    expect(h.id).toBe('keep');
    expect(h.image).toEqual(base.image);
    expect(h.imageFilter).toBe('sepia');
    expect(h.theme).toBe('newspaper');
    expect(h.title).toBe(EXAMPLES.newspaper.title);
    expect(h.extra.masthead).toBe('霧港日報');
    expect(h.bgColor).toBe(THEME_DEFAULTS.newspaper.bg);
  });
});

describe('名稱、字、標頭', () => {
  it('清單上的名稱：標題（簡訊是對話對象）→ 本文第一行（拿掉標記）', () => {
    expect(handoutName({ ...blankHandout(), title: '  標題 ' })).toBe('標題');
    expect(handoutName({ ...blankHandout(), body: '\n||祕密||開頭\n第二行' })).toBe('祕密開頭');
    expect(
      handoutName({
        ...blankHandout('sms'),
        title: '不會用到',
        extra: { ...DEFAULT_EXTRAS, contact: '阿凱' },
      }),
    ).toBe('阿凱');
    expect(handoutName(blankHandout())).toBe('');
  });

  it('主題用得到的欄位：簡訊沒有標題、印章、對齊；拍立得、通緝令的本文固定置中', () => {
    expect(THEME_FIELDS.sms).toMatchObject({
      title: false,
      stamp: false,
      align: false,
      marker: 'sent',
    });
    expect(THEME_FIELDS.polaroid.align).toBe(false);
    expect(THEME_FIELDS.wanted.align).toBe(false);
    expect(THEME_FIELDS.polaroid.imageSize).toBe(false);
    expect(THEME_FIELDS.newspaper.extras).toEqual(['masthead', 'dateline']);
  });

  it('要下載的字：標題用粗體，本文用一般字重；狀態視窗與通緝令的本文是粗體', () => {
    const basic = fontNeeds({ ...blankHandout('basic'), title: '標題', body: '本||文||' });
    expect(basic).toEqual([
      { family: 'Noto Sans TC', weight: 400, text: '本文' },
      { family: 'Noto Sans TC', weight: 700, text: '標題' },
    ]);
    const status = fontNeeds({ ...blankHandout('status'), title: 'T', body: '粗' });
    expect(status.find((n) => n.weight === 700)?.text).toBe('T粗');
    expect(status[0].family).toBe('Cubic 11');
  });

  it('終端機的標頭：「使用者與主機:~/標題」，缺一邊時照規則省略', () => {
    expect(terminalHeader('kp@archive', 'logs/1.txt')).toBe('kp@archive:~/logs/1.txt');
    expect(terminalHeader('kp@archive', '')).toBe('kp@archive:~$');
    expect(terminalHeader(' ', 'a')).toBe('~/a');
    expect(terminalHeader('', '')).toBe('');
  });
});

describe('濾鏡', () => {
  it('色調 0° 是單位矩陣；180° 把紅色轉成青色系', () => {
    const m = hueRotateMatrix(0);
    expect(m.map((v) => Math.round(v * 1000) / 1000)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
    const r = hueRotateMatrix(180);
    const red = [255, 0, 0];
    const out = [0, 4, 8].map((o) => r[o] * red[0] + r[o + 1] * red[1] + r[o + 2] * red[2]);
    expect(out[0]).toBeLessThan(out[1]);
    expect(out[0]).toBeLessThan(out[2]);
  });

  it('附圖的濾鏡：原圖沒有步驟；反相是 255 − 值', () => {
    expect(filterOps('none')).toEqual([]);
    expect(filterOps('invert')).toEqual([
      { op: 'matrix', m: [-1, 0, 0, 255, 0, -1, 0, 255, 0, 0, -1, 255] },
    ]);
    expect(filterOps('sepia')).toEqual([{ op: 'sepia', amount: 0.8 }]);
  });
});
