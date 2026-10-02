/**
 * 前景框產生器：設定的預設值（規格 1.）、範本套用（F02）、時間帶的自動配色（F65）、差分種類（F56）、
 * 新增圖片的擺放（F30）、文字佔位符（F37）、讀回時的整理（F86）。
 */
import { describe, expect, it } from 'vitest';
import {
  applyDesign,
  autoPlaceImage,
  clone,
  colorsTarget,
  currentItem,
  DARK_TEXT,
  defaultState,
  imageLayer,
  LIGHT_TEXT,
  lumaOf,
  mixHex,
  newDecoration,
  normalizeState,
  stateAssetIds,
  stateUploadFonts,
  textLayer,
  timePalette,
  variantItems,
} from '@/tools/foreground-frame/model';
import {
  BASE_TIMES,
  DECO_TYPE_IDS,
  DECO_TYPES,
  DESIGNS,
  LAYOUTS,
  SIZE_PRESETS,
  VARIANT_KIND_IDS,
} from '@/tools/foreground-frame/presets';
import { layerText } from '@/tools/foreground-frame/render';

describe('預設值（規格 1.）', () => {
  const s = defaultState();
  it('輸出尺寸、範本、檔名', () => {
    expect(s.size).toEqual({ w: 1920, h: 1080 });
    expect(s.design).toBe('simple');
    expect(s.fileBase).toBe('前景框');
  });
  it('窗：矩形、邊距 36、四邊共用、四角共用的圓角 28、外側圓角 0', () => {
    expect(s.opening.shape).toBe('rect');
    expect(s.opening.margin).toEqual({ t: 36, r: 36, b: 36, l: 36 });
    expect(s.opening.linkMargin).toBe(true);
    expect(s.opening.linkCorners).toBe(true);
    expect(s.opening.corners).toEqual([0, 1, 2, 3].map(() => ({ type: 'round', size: 28 })));
    expect(s.opening.outerRadius).toBe(0);
  });
  it('填色、線條、陰影、角飾（F16～F24）', () => {
    const f = s.frame;
    expect([f.fill, f.angle, f.opacity, f.grain]).toEqual(['linear', 180, 1, 0]);
    expect(f.innerLine).toEqual({ on: true, width: 3, gap: 10, double: false, color: 'accent' });
    expect(f.outerLine).toEqual({ on: false, width: 3, gap: 12, double: false, color: 'accent' });
    expect(f.shadow).toEqual({ on: true, size: 28, opacity: 0.35, color: '#000000' });
    expect(f.ornament).toEqual({ type: 'none', size: 44, gap: 12, width: 3, color: 'accent' });
  });
  it('差分：關閉、時間帶 4 個（傍晚預設不匯出）、標籤徽章左上、大小 1、背景濃度 92%、顯示英文標示', () => {
    expect(s.variants.enabled).toBe(false);
    expect(s.variants.kind).toBe('time');
    expect(s.variants.items.map((i) => [i.id, i.on])).toEqual([
      ['morning', true],
      ['day', true],
      ['evening', false],
      ['night', true],
    ]);
    expect(s.variants.items.map((i) => i.name)).toEqual(['早晨', '白天', '傍晚', '夜晚']);
    const l = s.variants.label;
    expect([l.style, l.pos, l.scale, l.bgAlpha, l.showSub]).toEqual(['badge', 'tl', 1, 0.92, true]);
    expect(l.font).toEqual({ source: 'google', family: 'Noto Sans TC', weight: 700 });
  });
  it('沒有圖層與裝飾', () => {
    expect(s.layers).toEqual([]);
    expect(s.decorations).toEqual([]);
  });
});

describe('範本與預設集', () => {
  it('11 個範本，涵蓋規格 F01 的類別', () => {
    expect(DESIGNS.map((d) => d.id)).toEqual([
      'simple',
      'mansion',
      'forest',
      'horror',
      'steampunk',
      'winter',
      'sakura',
      'cinema',
      'novel',
      'cyber',
      'wa',
    ]);
  });
  it('邊距快速設定的 6 組數值（F08）', () => {
    expect(LAYOUTS.map((l) => [l.id, l.margin])).toEqual([
      ['thin', { t: 20, r: 20, b: 20, l: 20 }],
      ['normal', { t: 40, r: 40, b: 40, l: 40 }],
      ['thick', { t: 80, r: 80, b: 80, l: 80 }],
      ['cinema', { t: 120, r: 0, b: 120, l: 0 }],
      ['novel', { t: 28, r: 28, b: 250, l: 28 }],
      ['side', { t: 28, r: 260, b: 28, l: 260 }],
    ]);
  });
  it('輸出尺寸選單（F03）', () => {
    expect(SIZE_PRESETS.map((p) => `${p.w}x${p.h}`)).toEqual([
      '1920x1080',
      '1280x720',
      '1152x648',
      '1440x1080',
      '960x720',
      '1080x1080',
    ]);
  });
  it('12 種沿框裝飾：沿邊類有延伸量、角落類（蜘蛛網、齒輪）沒有', () => {
    expect(DECO_TYPE_IDS).toHaveLength(12);
    expect(DECO_TYPE_IDS.filter((t) => DECO_TYPES[t].kind === 'corner')).toEqual([
      'cobweb',
      'gears',
    ]);
  });
  it('新增裝飾的預設值：顯示、圖樣 1、不裁切、各差分都顯示', () => {
    const d = newDecoration('ivy');
    expect(d).toMatchObject({
      type: 'ivy',
      on: true,
      seed: 1,
      clipFrame: false,
      hideIn: {},
      placement: 'all',
      size: 1,
      density: 0.6,
      coverage: 0.75,
      offset: 0,
    });
    expect(newDecoration('chain').placement).toBe('top');
    expect(newDecoration('sakura').placement).toBe('topcorners');
  });
});

describe('差分種類（F56）', () => {
  const s = defaultState();
  const table: Record<string, [number, number]> = {
    time: [4, 1],
    weather: [6, 2],
    season: [4, 0],
    scene: [5, 1],
    sanity: [3, 0],
    chapter: [5, 1],
    custom: [2, 0],
  };
  it.each(VARIANT_KIND_IDS)('%s：項目數與預設不匯出的數量', (kind) => {
    const items = variantItems(kind, s);
    expect([items.length, items.filter((i) => !i.on).length]).toEqual(table[kind]);
  });
  it('天氣：雨帶覆蓋色與效果；季節：各自的配色', () => {
    const rain = variantItems('weather', s).find((i) => i.id === 'rain');
    expect(rain).toMatchObject({
      tint: '#5c6f86',
      tintAlpha: 0.18,
      effect: 'rain',
      effectAmount: 0.6,
    });
    const spring = variantItems('season', s)[0];
    expect(spring).toMatchObject({ useColors: true, frame1: '#fbeef1', effect: 'petals' });
  });
  it('章節只換名稱（沒有效果、用整體配色）', () => {
    for (const i of variantItems('chapter', s)) {
      expect(i.effect).toBe('none');
      expect(i.useColors).toBe(false);
    }
  });
});

describe('時間帶的自動配色（F65）', () => {
  it('範本附有時段配色、整體配色沒改過時用範本的', () => {
    const s = defaultState();
    expect(timePalette(s, 'night')).toEqual({
      frame1: '#262d4f',
      frame2: '#0d1126',
      accent: '#d6bf72',
      text: '#e8eaf6',
      tint: '#10205a',
      tintAlpha: 0.28,
    });
    const items = variantItems('time', s);
    expect(items[0]).toMatchObject({ useColors: true, frame1: BASE_TIMES.morning[0] });
  });
  it('整體配色改過時：往時段的色調混合（夜晚混最多），白天不變', () => {
    const s = defaultState();
    s.palette = { frame1: '#808080', frame2: '#404040', accent: '#ff0000', text: '#ffffff' };
    const day = timePalette(s, 'day');
    expect([day.frame1, day.frame2, day.accent, day.text, day.tintAlpha]).toEqual([
      '#808080',
      '#404040',
      '#ff0000',
      '#ffffff',
      0,
    ]);
    const night = timePalette(s, 'night');
    expect(night.frame1).toBe(mixHex('#808080', '#101634', 0.68));
    expect(night.accent).toBe(mixHex('#ff0000', '#101634', 0.2));
    expect([night.tint, night.tintAlpha]).toEqual(['#10205a', 0.28]);
    expect(timePalette(s, 'evening').tintAlpha).toBe(0.12);
    expect(timePalette(s, 'morning').tintAlpha).toBe(0.06);
  });
  it('文字色與框的平均亮度差不到 0.35 時換成近黑或近白', () => {
    const s = defaultState();
    s.palette = { frame1: '#f0f0f0', frame2: '#e0e0e0', accent: '#3366cc', text: '#dddddd' };
    expect(timePalette(s, 'day').text).toBe(DARK_TEXT);
    s.palette = { frame1: '#202020', frame2: '#101010', accent: '#3366cc', text: '#303030' };
    expect(timePalette(s, 'night').text).toBe(LIGHT_TEXT);
    s.palette = { frame1: '#202020', frame2: '#101010', accent: '#3366cc', text: '#ffffff' };
    expect(timePalette(s, 'night').text).toBe('#ffffff');
    expect(lumaOf('#ffffff')).toBeCloseTo(1, 6);
  });
});

describe('套用範本（F02）', () => {
  it('換掉窗、框、四色、裝飾與標籤樣式；保留尺寸、圖層、差分清單、檔名', () => {
    const s = defaultState();
    s.size = { w: 1280, h: 720 };
    s.fileBase = 'mine';
    s.layers = [textLayer()];
    s.variants.items[0].name = '黎明';
    s.variants.label.bgAlpha = 0.3;
    applyDesign(s, 'horror');
    expect(s.design).toBe('horror');
    expect(s.opening.corners[0]).toEqual({ type: 'notch', size: 18 });
    expect(s.palette).toEqual({
      frame1: '#2b1719',
      frame2: '#0b0607',
      accent: '#9b1c1c',
      text: '#e9dcd2',
    });
    expect(s.decorations.map((d) => [d.type, d.placement])).toEqual([
      ['drips', 'top'],
      ['cobweb', 'corners'],
    ]);
    expect(s.decorations[1].size).toBe(1.2);
    expect(s.variants.label).toMatchObject({ style: 'label', pos: 'tc', bgAlpha: 0 });
    expect(s.variants.label.font.family).toBe('Noto Serif TC');
    expect(s.size).toEqual({ w: 1280, h: 720 });
    expect(s.fileBase).toBe('mine');
    expect(s.layers).toHaveLength(1);
    expect(s.variants.items[0].name).toBe('黎明');
  });
  it('背景濃度先回到 92% 再套範本的值', () => {
    const s = defaultState();
    s.variants.label.bgAlpha = 0.2;
    applyDesign(s, 'forest');
    expect(s.variants.label.bgAlpha).toBe(0.92);
  });
  it('時間帶的內建時段依新範本重新推導（新增的差分不動）', () => {
    const s = defaultState();
    s.variants.items.push({ ...clone(s.variants.items[1]), id: 'extra', frame1: '#123456' });
    applyDesign(s, 'mansion');
    const night = s.variants.items.find((i) => i.id === 'night');
    expect(night?.frame1).toBe('#2e2436');
    expect(s.variants.items.find((i) => i.id === 'extra')?.frame1).toBe('#123456');
  });
  it('不認得的範本不做事', () => {
    const s = defaultState();
    expect(applyDesign(s, 'nope')).toBe(false);
    expect(s.design).toBe('simple');
  });
});

describe('新增圖片的擺放（F30）', () => {
  it('比例相差不到 0.02、寬至少為輸出寬的一半 → 拉伸鋪滿', () => {
    expect(autoPlaceImage({ width: 1920, height: 1080 }, { w: 1920, h: 1080 })).toEqual({
      fit: 'stretch',
    });
    expect(autoPlaceImage({ width: 960, height: 540 }, { w: 1920, h: 1080 })).toEqual({
      fit: 'stretch',
    });
    expect(autoPlaceImage({ width: 1600, height: 900 }, { w: 1280, h: 720 })).toEqual({
      fit: 'stretch',
    });
  });
  it('其他：縮到不超過畫布高與寬的 40%（不放大，兩位小數）', () => {
    expect(autoPlaceImage({ width: 900, height: 540 }, { w: 1920, h: 1080 })).toEqual({
      fit: 'free',
      scale: 0.8,
    });
    expect(autoPlaceImage({ width: 200, height: 100 }, { w: 1920, h: 1080 })).toEqual({
      fit: 'free',
      scale: 1,
    });
    expect(autoPlaceImage({ width: 400, height: 2000 }, { w: 1920, h: 1080 })).toEqual({
      fit: 'free',
      scale: 0.22,
    });
    expect(autoPlaceImage({ width: 100000, height: 10 }, { w: 1920, h: 1080 })).toEqual({
      fit: 'free',
      scale: 0.02,
    });
    /* 比例一樣但太小：不鋪滿 */
    expect(autoPlaceImage({ width: 640, height: 360 }, { w: 1920, h: 1080 })).toEqual({
      fit: 'free',
      scale: 1,
    });
  });
});

describe('文字圖層（F32、F37）', () => {
  it('預設：水平置中、垂直 88%、字級 44、粗體、橫書、置中、字距 0.1、文字色、明體類', () => {
    const t = textLayer();
    expect(t).toMatchObject({
      x: 0.5,
      y: 0.88,
      size: 44,
      bold: true,
      vertical: false,
      align: 'center',
      spacing: 0.1,
      color: 'text',
      strokeWidth: 0,
      shadow: 0,
      name: '文字',
    });
    expect(t.font).toEqual({ source: 'google', family: 'Noto Serif TC', weight: 700 });
  });
  it('佔位符：{差分}→名稱、{英文}→英文標示（另接受舊版的 {時間帯}、{英語}）', () => {
    const slot = { name: '夜晚', sub: 'NIGHT' };
    expect(layerText('{差分}・{英文}', slot)).toBe('夜晚・NIGHT');
    expect(layerText('{時間帯}/{英語}', slot)).toBe('夜晚/NIGHT');
    expect(layerText('{差分}{差分}', { name: '$&', sub: '' })).toBe('$&$&');
    expect(layerText('第一章 {差分}', { name: '', sub: '' })).toBe('第一章 ');
  });
});

describe('目前的配色（F14、F61）', () => {
  it('開了差分且目前差分有自己的顏色時改那個差分，否則改整體配色', () => {
    const s = defaultState();
    const cur = currentItem(s, 'night');
    expect(colorsTarget(s, cur)).toBe('palette');
    s.variants.enabled = true;
    expect(colorsTarget(s, cur)).toBe('variant');
    expect(colorsTarget(s, { ...cur!, useColors: false })).toBe('palette');
  });
  it('目前差分：指定的 → 第一個要匯出的 → 第一個', () => {
    const s = defaultState();
    expect(currentItem(s, 'evening')?.id).toBe('evening');
    expect(currentItem(s, 'zzz')?.id).toBe('morning');
    s.variants.items[0].on = false;
    expect(currentItem(s, null)?.id).toBe('day');
  });
});

describe('讀回時的整理（F86）', () => {
  it('缺少的欄位以預設值補齊', () => {
    const s = normalizeState({ size: { w: 1280, h: 720 }, opening: { margin: { t: 50 } } });
    expect(s.size).toEqual({ w: 1280, h: 720 });
    expect(s.opening.margin).toEqual({ t: 50, r: 36, b: 36, l: 36 });
    expect(s.frame.innerLine.width).toBe(3);
    expect(s.variants.items).toHaveLength(4);
  });
  it('不是物件時是預設值', () => {
    expect(normalizeState(null)).toEqual({ ...defaultState() });
    expect(normalizeState('x').size).toEqual({ w: 1920, h: 1080 });
  });
  it('認不得的裝飾種類、圖層種類略過', () => {
    const s = normalizeState({
      decorations: [{ type: 'ivy', density: 0.2 }, { type: 'dragon' }, null],
      layers: [
        { kind: 'text', text: 'hi' },
        { kind: 'video' },
        { kind: 'image', asset: 'a1' },
        { kind: 'image' },
      ],
    });
    expect(s.decorations.map((d) => [d.type, d.density])).toEqual([['ivy', 0.2]]);
    expect(s.layers.map((l) => l.kind)).toEqual(['text', 'image']);
    expect(stateAssetIds(s)).toEqual(['a1']);
  });
  it('差分清單空的時候用預設清單；沒有要匯出的差分時把第一個設為要匯出；認不得的種類當成自由', () => {
    expect(normalizeState({ variants: { items: [] } }).variants.items).toHaveLength(4);
    const s = normalizeState({
      variants: {
        kind: 'weird',
        items: [
          { id: 'a', on: false, name: '一' },
          { id: 'b', on: false, name: '二' },
        ],
      },
    });
    expect(s.variants.kind).toBe('custom');
    expect(s.variants.items.map((i) => [i.id, i.on])).toEqual([
      ['a', true],
      ['b', false],
    ]);
  });
  it('尺寸限制在 64～4096 的整數；名稱最多 20 字、英文標示最多 30 字', () => {
    const s = normalizeState({
      size: { w: 30, h: 5000.6 },
      variants: { items: [{ id: 'a', name: 'x'.repeat(30), sub: 'y'.repeat(40) }] },
    });
    expect(s.size).toEqual({ w: 64, h: 4096 });
    expect(s.variants.items[0].name).toHaveLength(20);
    expect(s.variants.items[0].sub).toHaveLength(30);
  });
  it('各差分是否顯示只留 true；字型值整理', () => {
    const s = normalizeState({
      layers: [
        {
          kind: 'text',
          hideIn: { a: true, b: false, c: 1 },
          font: { source: 'upload', family: 'My"Font' },
        },
      ],
    });
    const t = s.layers[0];
    expect(t.hideIn).toEqual({ a: true });
    expect(t.kind === 'text' && t.font).toEqual({
      source: 'upload',
      family: 'MyFont',
      weight: 400,
    });
    expect(stateUploadFonts(s)).toEqual(['MyFont']);
  });
  it('存了再讀回不變', () => {
    const s = defaultState();
    applyDesign(s, 'steampunk');
    s.layers = [textLayer(), imageLayer('abc', '框')];
    s.variants.enabled = true;
    expect(normalizeState(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});
