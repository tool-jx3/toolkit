/**
 * 狀態條產生器：幾何與來源大小（規格 3.3.2、3.3.3、3.6 的量測值）。
 */
import { describe, expect, it } from 'vitest';
import { applyTemplate, type DeepPartial } from '@/core/storage';
import {
  barGeometry,
  estimateSourceSize,
  frameExtent,
  groupBox,
  itemsWidth,
  nameBoxHeight,
  rootMargin,
  segmentWidth,
  shapePath,
  shapePolygon,
  shapeRadius,
} from '@/tools/status-bar/geometry';
import { DEFAULT_SETTINGS, EXAMPLE_NAME, type Settings } from '@/tools/status-bar/settings';

const make = (patch: DeepPartial<Settings> = {}): Settings =>
  applyTemplate(DEFAULT_SETTINGS, patch);
const size = (patch: DeepPartial<Settings> = {}, name = EXAMPLE_NAME) =>
  estimateSourceSize(make(patch), { name });

describe('一條之內的配置（規格 3.3.2）', () => {
  it('預設：條本體 320 × 34，整列寬 320', () => {
    const g = barGeometry(DEFAULT_SETTINGS);
    expect(g.bodyLen).toBe(320);
    expect(g.bodyH).toBe(34);
    expect(g.rowW).toBe(320);
    expect(g.rowH).toBe(34);
  });

  it('三欄：條本體長 174（320 − 52 − 86 − 2 × 4）；兩欄：264（320 − 52 − 4）', () => {
    expect(barGeometry(make({ textPos: 'three' })).bodyLen).toBe(174);
    expect(barGeometry(make({ textPos: 'two' })).bodyLen).toBe(264);
    expect(barGeometry(make({ textPos: 'three' })).rowW).toBe(320);
  });

  it('上方一行：整列高 56（文字列 18＋間距 4＋34）', () => {
    expect(barGeometry(make({ textPos: 'top' })).rowH).toBe(56);
    expect(barGeometry(make({ textPos: 'bottom' })).rowH).toBe(56);
  });

  it('三欄／兩欄的整列高＝max(條本體高, 較大字級 × 1.15 無條件進位)', () => {
    const g = barGeometry(make({ textPos: 'three', barHeight: 10 }));
    expect(g.colLineH).toBe(Math.ceil(18 * 1.15));
    expect(g.rowH).toBe(21);
  });

  it('符號欄佔用單條寬度（條本體變短）；道具加寬整列（條本體長度不變）', () => {
    const sym = barGeometry(make({ symbols: { show: true, size: 20, gap: 6 } }));
    expect(sym.bodyLen).toBe(294);
    expect(sym.rowW).toBe(320);
    const it3 = barGeometry(make({ items: { on: true, count: 3, size: 26, gap: 3, distance: 8 } }));
    expect(it3.bodyLen).toBe(320);
    expect(it3.itemsW).toBe(84);
    expect(it3.rowW).toBe(320 + 84 + 8);
    /* 開了道具時不顯示符號 */
    const both = barGeometry(make({ symbols: { show: true }, items: { on: true } }));
    expect(both.symCol).toBe(0);
  });

  it('有道具時整列高度至少是道具大小', () => {
    expect(barGeometry(make({ items: { on: true, size: 50 } })).rowH).toBe(50);
  });

  it('條本體最短 16 px', () => {
    expect(barGeometry(make({ barWidth: 80, textPos: 'three' })).bodyLen).toBe(16);
  });

  it('道具總寬：n × 大小＋(n − 1) × 間距（可為負）', () => {
    expect(itemsWidth(12, 18, -2)).toBe(12 * 18 - 22);
    expect(itemsWidth(1, 26, 16)).toBe(26);
  });
});

describe('條群與整體排列', () => {
  it('橫向：一行；多欄：實際欄數＝min(欄數, 條數)', () => {
    expect(groupBox(make({ direction: 'horizontal' }))).toEqual({ width: 972, height: 34 });
    expect(groupBox(make({ direction: 'grid', barCount: 5 }))).toEqual({ width: 646, height: 114 });
    expect(groupBox(make({ direction: 'grid', columns: 4, barCount: 2 })).width).toBe(646);
  });

  it('名稱底板高約 37.7 px（17 px 字）', () => {
    expect(nameBoxHeight(DEFAULT_SETTINGS)).toBeCloseTo(37.7, 1);
  });
});

describe('來源大小（規格 3.6 的量測值）', () => {
  it.each<[string, DeepPartial<Settings>, string, [number, number]]>([
    ['預設', {}, EXAMPLE_NAME, [340, 178]],
    ['無名稱', {}, '', [340, 134]],
    ['外側留白 0 且無名稱', { margin: 0 }, '', [320, 114]],
    ['橫向排列', { direction: 'horizontal' }, EXAMPLE_NAME, [992, 98]],
    ['多欄 2 欄 5 條', { direction: 'grid', columns: 2, barCount: 5 }, EXAMPLE_NAME, [666, 178]],
    ['上方一行', { textPos: 'top' }, EXAMPLE_NAME, [340, 244]],
    ['頭像在左', { avatar: { show: true } }, EXAMPLE_NAME, [436, 178]],
    ['頭像在上', { avatar: { show: true, pos: 'top' } }, EXAMPLE_NAME, [340, 274]],
    ['道具 3 個', { items: { on: true, count: 3 } }, EXAMPLE_NAME, [432, 178]],
    [
      '頭像＋先攻＋名稱在條群上方＋整體外框',
      {
        avatar: { show: true },
        initiative: { show: true },
        name: { pos: 'group' },
        frame: { on: true },
      },
      EXAMPLE_NAME,
      [452, 194],
    ],
  ])('%s', (_label, patch, name, [w, h]) => {
    expect(size(patch, name)).toEqual({ width: w, height: h });
  });

  it('外框伸出的量：間距＋線寬（雙線 ≥ 3 × 粗細、發光線 6 × 粗細、細框加四角 2 × 粗細）', () => {
    const f = (kind: Settings['frame']['kind'], width = 2, gap = 6) =>
      frameExtent(make({ frame: { on: true, kind, width, gap } }));
    expect(f('single')).toBe(8);
    expect(f('dashed')).toBe(8);
    expect(f('double', 1)).toBe(9);
    expect(f('double', 2)).toBe(12);
    expect(f('glow')).toBe(18);
    expect(f('thin')).toBe(10);
    expect(f('corners')).toBe(8);
    /* 負的間距往內縮：外距不會小於外側留白 */
    expect(rootMargin(make({ frame: { on: true, gap: -12, width: 2 } }))).toBe(10);
    expect(frameExtent(make({ frame: { on: false } }))).toBe(0);
  });

  it('名稱位置「不顯示」、名稱空白、壓在頭像底部但頭像沒開：都不佔位', () => {
    expect(size({ name: { pos: 'none' } })).toEqual({ width: 340, height: 134 });
    expect(size({}, '   ')).toEqual({ width: 340, height: 134 });
    expect(size({ name: { pos: 'avatar' } })).toEqual({ width: 340, height: 134 });
  });

  it('背景面板：內距與外框加在外面，左側色線多 4 px', () => {
    expect(size({ panel: { on: true, padding: 10, borderWidth: 1, strip: true } }, '')).toEqual({
      width: 340 + 20 + 4 + 2,
      height: 134 + 22,
    });
  });
});

describe('條本體的輪廓（規格 3.3.3）', () => {
  const p = { radius: 6, cut: 10, skew: 12 };

  it('圓角不超過 h/2、w/2；膠囊形＝h/2', () => {
    expect(shapeRadius('round', 300, 10, 40)).toBe(5);
    expect(shapeRadius('pill', 300, 34, 0)).toBe(17);
    expect(shapeRadius('slant', 300, 34, 6)).toBe(0);
  });

  it('平行四邊形：上緣從左端內縮 s、下緣到右端內縮 s（s ≤ w/3）', () => {
    expect(shapePolygon('slant', 300, 34, p)).toEqual([
      [12, 0],
      [300, 0],
      [288, 34],
      [0, 34],
    ]);
    expect(shapePolygon('slant', 30, 34, { cut: 0, skew: 40 })?.[0][0]).toBe(10);
  });

  it('四角切斜角（c ≤ h/2、w/4）、箭形（c ≤ w/4）、兩角切斜角（c ≤ h、w/4）', () => {
    expect(shapePolygon('chamfer', 300, 10, { cut: 40, skew: 0 })?.[0]).toEqual([5, 0]);
    expect(shapePolygon('arrow', 300, 34, p)).toContainEqual([300, 17]);
    expect(shapePolygon('arrow', 20, 34, { cut: 40, skew: 0 })?.[0]).toEqual([5, 0]);
    const notch = shapePolygon('notch', 300, 34, p);
    expect(notch).toContainEqual([290, 0]);
    expect(notch).toContainEqual([300, 10]);
    expect(notch).toContainEqual([0, 24]);
  });

  it('輪廓路徑以 px 座標寫成（填充與條本體共用同一個輪廓）', () => {
    expect(shapePath('round', 320, 34, p)).toBe(
      'M6 0H314A6 6 0 0 1 320 6V28A6 6 0 0 1 314 34H6A6 6 0 0 1 0 28V6A6 6 0 0 1 6 0Z',
    );
    expect(shapePath('round', 320, 34, { ...p, radius: 0 })).toBe('M0 0H320V34H0Z');
    expect(shapePath('slant', 300, 34, p)).toBe('M12 0L300 0L288 34L0 34Z');
  });

  it('分段：段寬＝(w＋空隙) ÷ 段數 − 空隙；≤ 1 段不分段', () => {
    expect(segmentWidth(300, 5, 4)).toBeCloseTo(56.8, 5);
    expect(segmentWidth(300, 1, 4)).toBeNull();
    expect(segmentWidth(300, 0, 4)).toBeNull();
  });
});
