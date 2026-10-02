/**
 * 角色配色條產生器（color-palette）的純邏輯：規格 3.1 的排版、3.2 的量測表、3.3 的裁邊範圍、
 * F08／F13／F17／F36 的清單操作、F18 的畫布把手換算、讀回存檔時的範圍檢查（主控裁定）。
 * 3.4 的 9 組取色測試圖在 image-vivid.test.ts；這裡測「取色結果 → 取代整條分段 → 排版」的流程。
 */
import { describe, expect, it } from 'vitest';
import { evenSplits, type PixelBuffer, vividColorsBySplits } from '@/core/image';
import {
  addBar,
  addSegment,
  BAR_GAP,
  type Bar,
  canvasSize,
  DEFAULT_SETTINGS,
  FILE_CROP,
  FILE_FULL,
  handleWidth,
  INITIAL_COLORS,
  layoutPalette,
  MAX_BARS,
  moveBoundary,
  moveSegment,
  NEW_BAR_COLOR,
  NEW_SEGMENT_COLOR,
  picksFromPoints,
  pxToRatio,
  removeBar,
  removeSegment,
  replaceSegments,
  type Settings,
  sanitizeSettings,
  tooLarge,
  updateSegment,
} from '@/tools/color-palette/logic';

let n = 0;
const bar = (scale: number, ratios: number[] = [1, 1, 1]): Bar => ({
  id: `b${++n}`,
  scale,
  segments: ratios.map((ratio, i) => ({ id: `s${n}-${i}`, color: '#123456', ratio })),
});

const settings = (patch: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...patch });

/** 所有色條的外接範圍 */
function extent(s: Settings) {
  const l = layoutPalette(s);
  return {
    x0: Math.min(...l.bars.map((b) => b.x)),
    x1: Math.max(...l.bars.map((b) => b.x + b.width)),
    y0: Math.min(...l.bars.map((b) => b.top)),
    y1: Math.max(...l.bars.map((b) => b.bottom)),
  };
}

describe('預設值與初始內容（F01～F09）', () => {
  it('背景淺灰、粗 10、基準 300／160、自動調整、手動 400 × 500、留白 80；1 條、倍率 160、3 段等比例', () => {
    const d = DEFAULT_SETTINGS;
    expect([d.background, d.thickness, d.baseLength, d.baseScale]).toEqual([
      '#f3f4f6',
      10,
      300,
      160,
    ]);
    expect([d.autoSize, d.width, d.height, d.padding]).toEqual([true, 400, 500, 80]);
    expect(d.bars).toHaveLength(1);
    expect(d.bars[0].scale).toBe(160);
    expect(d.bars[0].segments.map((s) => s.ratio)).toEqual([1, 1, 1]);
    expect(d.bars[0].segments.map((s) => s.color)).toEqual([...INITIAL_COLORS]);
    expect(new Set(INITIAL_COLORS).size).toBe(3);
  });

  it('輸出檔名固定', () => {
    expect([FILE_FULL, FILE_CROP]).toEqual(['palette_full.png', 'palette_crop.png']);
  });
});

describe('畫布尺寸與色條位置（規格 3.1、3.2 的量測表）', () => {
  it('預設：170 × 460，色條 x 80～90、y 80～380', () => {
    const l = layoutPalette(DEFAULT_SETTINGS);
    expect([l.width, l.height]).toEqual([170, 460]);
    const b = l.bars[0];
    expect([b.x, b.x + b.width, b.top, b.bottom]).toEqual([80, 90, 80, 380]);
  });

  it('2 條（倍率 160、120）：240 × 460，第 2 條長 225 px、底部對齊', () => {
    const l = layoutPalette(settings({ bars: [bar(160), bar(120)] }));
    expect([l.width, l.height]).toEqual([240, 460]);
    expect(l.bars[1].length).toBe(225);
    expect(l.bars[0].bottom).toBe(l.bars[1].bottom);
    /* 相鄰兩條邊緣相距 60 px */
    expect(l.bars[1].x - (l.bars[0].x + l.bars[0].width)).toBe(BAR_GAP);
  });

  it.each([
    ['2 條、粗 20', { thickness: 20 }, [260, 460]],
    ['2 條、粗 20、留白 10', { thickness: 20, padding: 10 }, [120, 320]],
    ['2 條、粗 20、留白 0', { thickness: 20, padding: 0 }, [100, 300]],
    [
      '2 條、粗 20、留白 0、基準倍率 100',
      { thickness: 20, padding: 0, baseScale: 100 },
      [100, 480],
    ],
  ] as const)('%s', (_name, patch, size) => {
    const s = settings({ ...patch, bars: [bar(160), bar(120)] });
    expect(canvasSize(s)).toEqual({ width: size[0], height: size[1] });
  });

  it('24 條、粗 20、留白 80：2020 × 460', () => {
    const s = settings({ thickness: 20, bars: Array.from({ length: 24 }, () => bar(160)) });
    expect(canvasSize(s)).toEqual({ width: 2020, height: 460 });
  });

  it('手動 600 × 700、3 條（粗 20，倍率 160／120／160）：外接範圍 x 210～390、y 200～500；裁邊 340 × 460', () => {
    const s = settings({
      autoSize: false,
      width: 600,
      height: 700,
      thickness: 20,
      bars: [bar(160), bar(120), bar(160)],
    });
    const l = layoutPalette(s);
    expect([l.width, l.height]).toEqual([600, 700]);
    expect(extent(s)).toEqual({ x0: 210, x1: 390, y0: 200, y1: 500 });
    expect(l.crop).toEqual({ x: 130, y: 120, width: 340, height: 460 });
  });

  it('底部對齊＋最長那條垂直置中：下端 y＝(畫布高＋最長色條長) ÷ 2', () => {
    const s = settings({ autoSize: false, width: 500, height: 900, bars: [bar(100), bar(200)] });
    const l = layoutPalette(s);
    const longest = Math.max(...l.bars.map((b) => b.length));
    for (const b of l.bars) expect(b.bottom).toBe((900 + longest) / 2);
  });

  it('預設時裁邊與整張相同（170 × 460）；裁邊不套用 100 px 最小值', () => {
    expect(layoutPalette(DEFAULT_SETTINGS).crop).toEqual({ x: 0, y: 0, width: 170, height: 460 });
    /* 粗 1、留白 0、基準長度 10：自動畫布至少 100，裁邊 1 × 10 */
    const s = settings({ thickness: 1, padding: 0, baseLength: 10, bars: [bar(160)] });
    const l = layoutPalette(s);
    expect([l.width, l.height]).toEqual([100, 100]);
    expect(l.crop).toMatchObject({ width: 1, height: 10 });
  });

  it('沒有色條：畫布只剩底色（160 × 160），沒有裁邊範圍', () => {
    const l = layoutPalette(settings({ bars: [] }));
    expect([l.width, l.height, l.bars.length, l.crop]).toEqual([160, 160, 0, null]);
  });

  it('改基準倍率時所有色條一起變長或變短', () => {
    const a = layoutPalette(settings({ bars: [bar(160), bar(80)] }));
    const b = layoutPalette(settings({ baseScale: 80, bars: [bar(160), bar(80)] }));
    expect(a.bars.map((x) => x.length)).toEqual([300, 150]);
    expect(b.bars.map((x) => x.length)).toEqual([600, 300]);
  });
});

describe('分段（規格 3.1）', () => {
  it('三段等分：交界在 1／3、2／3（y 180、280），最後一段到下端', () => {
    const b = layoutPalette(DEFAULT_SETTINGS).bars[0];
    expect(b.boundaries).toEqual([180, 280]);
    expect(b.segments.map((s) => [s.y0, s.y1])).toEqual([
      [80, 180],
      [180, 280],
      [280, 380],
    ]);
  });

  it('各段長度＝總長 × 比例 ÷ 比例和', () => {
    const b = layoutPalette(settings({ bars: [bar(160, [1, 2, 3])] })).bars[0];
    expect(b.segments.map((s) => s.y1 - s.y0)).toEqual([50, 100, 150]);
  });

  it('沒有段：比例和 0、沒有交界（整條畫成淺灰）', () => {
    const b = layoutPalette(settings({ bars: [bar(160, [])] })).bars[0];
    expect([b.total, b.boundaries, b.segments]).toEqual([0, [], []]);
  });
});

describe('清單操作', () => {
  it('新增一條（F08）：倍率＝當下的基準倍率，一段黑色、比例 1；最多 24 條', () => {
    const next = addBar([bar(160)], 172.5);
    expect(next).toHaveLength(2);
    expect(next[1].scale).toBe(172.5);
    expect(next[1].segments).toMatchObject([{ color: NEW_BAR_COLOR, ratio: 1 }]);
    expect(NEW_BAR_COLOR).toBe('#000000');
    const full = Array.from({ length: MAX_BARS }, () => bar(160));
    expect(addBar(full, 160)).toHaveLength(MAX_BARS);
  });

  it('刪除一條、刪除一段（F10、F16）', () => {
    const a = bar(160);
    const b = bar(150);
    expect(removeBar([a, b], a.id).map((x) => x.id)).toEqual([b.id]);
    const r = removeSegment([a], a.id, a.segments[1].id)[0].segments.map((s) => s.id);
    expect(r).toEqual([a.segments[0].id, a.segments[2].id]);
  });

  it('新增一段（F13）：最下面加一段深灰、比例 1', () => {
    const a = bar(160, [2]);
    const segs = addSegment([a], a.id)[0].segments;
    expect(segs).toHaveLength(2);
    expect(segs[1]).toMatchObject({ color: NEW_SEGMENT_COLOR, ratio: 1 });
    expect(NEW_SEGMENT_COLOR).toBe('#333333');
  });

  it('段的顏色、比例（F14、F15）只改那一段', () => {
    const a = bar(160);
    const next = updateSegment([a], a.id, a.segments[1].id, { color: '#abcdef', ratio: 0.5 });
    expect(next[0].segments.map((s) => [s.color, s.ratio])).toEqual([
      ['#123456', 1],
      ['#abcdef', 0.5],
      ['#123456', 1],
    ]);
  });

  it('段的排序（F17）：往下落在目標後、往上落在目標前；只動那一條；範圍外不動', () => {
    const a = bar(160, [1, 2, 3, 4]);
    const b = bar(160);
    const ids = (list: Bar[], i = 0) => list[i].segments.map((s) => s.ratio);
    expect(ids(moveSegment([a, b], a.id, 0, 2))).toEqual([2, 3, 1, 4]);
    expect(ids(moveSegment([a, b], a.id, 3, 1))).toEqual([1, 4, 2, 3]);
    expect(ids(moveSegment([a, b], a.id, 3, 1), 1)).toEqual([1, 1, 1]);
    expect(ids(moveSegment([a], a.id, 0, 9))).toEqual([1, 2, 3, 4]);
  });

  it('取色結果取代整條的分段（F36）：手動依點選順序、比例都是 1', () => {
    const a = bar(160);
    const picks = picksFromPoints([{ color: '#111111' }, { color: '#222222' }]);
    const next = replaceSegments([a], a.id, picks)[0].segments;
    expect(next.map((s) => [s.color, s.ratio])).toEqual([
      ['#111111', 1],
      ['#222222', 1],
    ]);
  });
});

describe('自動取色 → 取代分段 → 排版（F35、F36）', () => {
  const px = (w: number, h: number, at: (y: number) => [number, number, number]): PixelBuffer => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) data.set([...at(y), 255], (y * w + x) * 4);
    return { data, width: w, height: h };
  };
  const rgb3 = px(100, 300, (y) =>
    y < 100 ? [224, 48, 48] : y < 200 ? [48, 192, 48] : [48, 80, 224],
  );

  it('三等分 × 5 段：紅、紅、綠、藍、藍，比例各 0.2，長度相等', () => {
    const a = bar(160);
    const next = replaceSegments([a], a.id, vividColorsBySplits(rgb3, evenSplits(5)));
    expect(next[0].segments.map((s) => [s.color, s.ratio])).toEqual([
      ['#e03030', 0.2],
      ['#e03030', 0.2],
      ['#30c030', 0.2],
      ['#3050e0', 0.2],
      ['#3050e0', 0.2],
    ]);
    const l = layoutPalette(settings({ bars: next }));
    expect(l.bars[0].segments.map((s) => Math.round(s.y1 - s.y0))).toEqual([60, 60, 60, 60, 60]);
  });

  it('分割線在 2% 處：紅 0.02、藍 0.98', () => {
    expect(vividColorsBySplits(rgb3, [0.02])).toEqual([
      { color: '#e03030', ratio: 0.02 },
      { color: '#3050e0', ratio: 0.98 },
    ]);
  });
});

describe('畫布把手（F18）', () => {
  it('把手寬＝粗細＋12、至少 20', () => {
    expect([handleWidth(10), handleWidth(5), handleWidth(40)]).toEqual([22, 20, 52]);
  });

  it('預設 300 px、三段比例 1：往下拖 30 px → 1.3／0.7（兩段比例和不變）', () => {
    const d = pxToRatio(30, 3, 300);
    expect(d).toBeCloseTo(0.3, 10);
    expect(moveBoundary(1, 1, d)).toEqual([1.3, 0.7]);
    expect(moveBoundary(1, 1, pxToRatio(-30, 3, 300))).toEqual([0.7, 1.3]);
  });

  it('每段不小於 0.05；比例四捨五入到小數 3 位', () => {
    expect(moveBoundary(1, 1, 5)).toEqual([1.95, 0.05]);
    expect(moveBoundary(1, 1, -5)).toEqual([0.05, 1.95]);
    expect(moveBoundary(1, 1, 0.12345)).toEqual([1.123, 0.877]);
    expect(moveBoundary(0.333, 0.333, 0.1)).toEqual([0.433, 0.233]);
  });

  it('兩段比例和不到 0.1 時不動', () => {
    expect(moveBoundary(0.04, 0.05, 0.01)).toBeNull();
  });

  it('色條長 0 時換算為 0', () => {
    expect(pxToRatio(30, 3, 0)).toBe(0);
  });
});

describe('讀回存檔、專案檔（數值欄依標示範圍檢查：主控裁定）', () => {
  it('垃圾資料回到預設值', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('x')).toEqual(DEFAULT_SETTINGS);
  });

  it('各欄位夾在範圍內；顏色整理成小寫 #rrggbb；倍率與段比例有下限', () => {
    const s = sanitizeSettings({
      background: '#ABC',
      thickness: 0,
      baseLength: 99999,
      baseScale: 0,
      autoSize: 'yes',
      width: 50,
      height: 9000,
      padding: -5,
      bars: [{ id: 'a', scale: 0, segments: [{ id: 's', color: 'nope', ratio: -1 }] }],
    });
    expect(s).toMatchObject({
      background: '#aabbcc',
      thickness: 1,
      baseLength: 4000,
      baseScale: 1,
      autoSize: true,
      width: 100,
      height: 5000,
      padding: 0,
    });
    expect(s.bars[0]).toMatchObject({ id: 'a', scale: 1 });
    expect(s.bars[0].segments[0]).toMatchObject({ id: 's', color: '#333333', ratio: 0.01 });
  });

  it('最多 24 條；重複的 id 換新的；合法的資料原樣保留', () => {
    const many = Array.from({ length: 30 }, () => ({ id: 'dup', scale: 160, segments: [] }));
    const s = sanitizeSettings({ ...DEFAULT_SETTINGS, bars: many });
    expect(s.bars).toHaveLength(24);
    expect(new Set(s.bars.map((b) => b.id)).size).toBe(24);
    expect(sanitizeSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });

  it('畫布太大時提示（新版的保護）', () => {
    expect(tooLarge({ width: 2020, height: 460 })).toBe(false);
    expect(tooLarge({ width: 100, height: 20000 })).toBe(true);
    expect(tooLarge({ width: 8000, height: 8000 })).toBe(true);
    expect(tooLarge(null)).toBe(false);
  });
});
