/**
 * 立繪裁切器的規則（規格 docs/refactor/specs/ccfolia-cropper.md 第 3 節＋第 7 節裁定）：
 * 角色範圍與高度（修正少算的 1 px）、頭部 35%／上半身 55% 的深度、五種基準的裁切框位置與尺寸、
 * 夾在圖內、一比一複製像素、每張的基準與位移、全部套用、檔名、輸入類型、存檔設定的整理。
 */
import { describe, expect, it } from 'vitest';
import type { PixelBuffer } from '@/core/image';
import {
  type Anchor,
  type Aspect,
  BAND,
  bandEnd,
  chooseAnchor,
  clampRange,
  clipboardFileName,
  cropGeometry,
  cropPixels,
  DEFAULT_SETTINGS,
  figureFromPixels,
  measureFigure,
  offsetFor,
  outputFileName,
  resetOffset,
  type Slot,
  sanitizeSettings,
  sourceKind,
  syncAnchors,
} from '@/tools/ccfolia-cropper/logic';

type Rgb = [number, number, number];

function blank(w: number, h: number): PixelBuffer & { data: Uint8ClampedArray } {
  return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
}
function fill(img: PixelBuffer, x0: number, y0: number, x1: number, y1: number, c: Rgb, a = 255) {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) img.data.set([...c, a], (y * img.width + x) * 4);
}

/**
 * 規格 3.2 的測試圖 A：700 × 1200 透明底；頭 x 220～379、y 70～229 的圓，身體 x 230～369、y 230～799，
 * 裙襬 x 100～399、y 800～1149。
 */
function figureA(): PixelBuffer {
  const img = blank(700, 1200);
  for (let y = 70; y <= 229; y++)
    for (let x = 220; x <= 379; x++)
      if ((x - 299.5) ** 2 + (y - 149.5) ** 2 <= 80 * 80)
        img.data.set([240, 200, 170, 255], (y * 700 + x) * 4);
  fill(img, 230, 230, 369, 799, [60, 90, 200]);
  fill(img, 100, 800, 399, 1149, [200, 50, 60]);
  return img;
}

describe('角色範圍（3.1）', () => {
  it('測試圖 A：範圍 x 100～399、y 70～1149，角色高度 1080（修正舊版的 1079）', () => {
    const f = figureFromPixels(figureA());
    expect(f.bounds).toEqual({ x: 100, y: 70, width: 300, height: 1080 });
    expect(f.headX).toBe(299.5);
    /* 上方 55% 只有頭與身體 */
    expect(f.upperX).toBe(299.5);
    expect([f.width, f.height]).toEqual([700, 1200]);
  });

  it('透明度 1/255 也算角色；整張透明時以整張圖為範圍', () => {
    const img = blank(50, 40);
    fill(img, 10, 5, 10, 5, [0, 0, 0], 1);
    fill(img, 30, 20, 30, 20, [0, 0, 0], 1);
    expect(figureFromPixels(img).bounds).toEqual({ x: 10, y: 5, width: 21, height: 16 });
    const empty = figureFromPixels(blank(300, 300));
    expect(empty.bounds).toEqual({ x: 0, y: 0, width: 300, height: 300 });
    expect(empty.headX).toBe(149.5);
  });

  it('頭部看最上方 35%（至少 20 列）、上半身看 55%（主控裁定）', () => {
    /* 寬 800、角色高度 1000：x 100～119 的細柱；細條在第 345 列時算進頭部，第 355 列時不算 */
    const make = (barRow: number) => {
      const img = blank(800, 1000);
      fill(img, 100, 0, 119, 999, [10, 10, 10]);
      fill(img, 100, barRow, 699, barRow, [10, 10, 10]);
      return figureFromPixels(img);
    };
    expect(make(345).headX).toBe(399.5);
    expect(make(355).headX).toBe(109.5);
    /* 上半身到第 549 列 */
    expect(make(355).upperX).toBe(399.5);
    expect(make(549).upperX).toBe(399.5);
    expect(make(551).upperX).toBe(109.5);
    /* 角色高度 40：至少看 20 列（第 17 列算、第 22 列不算） */
    const small = (barRow: number) => {
      const img = blank(200, 60);
      fill(img, 50, 10, 59, 49, [10, 10, 10]);
      fill(img, 0, 10 + barRow, 199, 10 + barRow, [10, 10, 10]);
      return figureFromPixels(img).headX;
    };
    expect(small(17)).toBe(99.5);
    expect(small(22)).toBe(54.5);
    expect(bandEnd({ x: 0, y: 10, width: 5, height: 40 }, BAND.head)).toBe(30);
  });

  it('手臂伸進上方 55% 時，上半身中心偏向手臂，頭部不受影響', () => {
    const img = figureA();
    /* 第 500～520 列（頭部那段之外、上半身那段之內）往右伸到 x＝500 */
    fill(img, 370, 500, 500, 520, [60, 90, 200]);
    const f = figureFromPixels(img);
    expect(f.headX).toBe(299.5);
    expect(f.upperX).toBe((220 + 500) / 2);
  });

  it('measureFigure 用給定的讀取函式（瀏覽器裡直接讀影像的那幾列）', () => {
    const calls: [number, number][] = [];
    const f = measureFigure(100, 100, { x: 10, y: 0, width: 50, height: 100 }, (y0, y1) => {
      calls.push([y0, y1]);
      return { left: 20, right: 40 };
    });
    expect(f.headX).toBe(30);
    expect(calls).toEqual([
      [0, 35],
      [0, 55],
    ]);
  });
});

describe('裁切框（3.2）', () => {
  const A = figureFromPixels(figureA());
  const at = (aspect: Aspect, range: number, anchor: Anchor, offset = 0) => {
    const g = cropGeometry(A, { aspect, range, anchor, offset });
    return [g.width, g.height, g.x, g.y];
  };

  /* 規格 3.2 的量測表，角色高度改以 1080 計（主控裁定：修正少算的 1 px）：
     框高差 1 px 以內，位置與舊版相同（3:4・100% 的整張圖中心上緣 61 → 60） */
  it.each([
    ['3:4', 60, [486, 648], [57, 70], [7, 286], [107, 276]],
    ['3:4', 35, [284, 378], [158, 70], [108, 421], [208, 411]],
    ['3:4', 10, [81, 108], [259, 70], [209, 556], [310, 546]],
    ['3:4', 100, [810, 1080], [0, 70], [0, 70], [0, 60]],
    ['1:1', 60, [648, 648], [0, 70], [0, 286], [26, 276]],
    ['1:1', 35, [378, 378], [111, 70], [61, 421], [161, 411]],
    ['1:1', 10, [108, 108], [246, 70], [196, 556], [296, 546]],
  ] as const)('%s・%i%%', (aspect, range, size, head, figure, image) => {
    for (const anchor of ['head', 'upper', 'manual'] as const)
      expect(at(aspect, range, anchor), anchor).toEqual([...size, ...head]);
    expect(at(aspect, range, 'figure')).toEqual([...size, ...figure]);
    expect(at(aspect, range, 'image')).toEqual([...size, ...image]);
  });

  it('其他例：比框窄的圖、全不透明、全透明', () => {
    const tall = figureFromPixels(
      (() => {
        const img = blank(100, 1000);
        fill(img, 0, 0, 99, 999, [1, 2, 3]);
        return img;
      })(),
    );
    expect(
      cropGeometry(tall, { aspect: '3:4', range: 60, anchor: 'head', offset: 0 }),
    ).toMatchObject({ x: 0, y: 0, width: 450, height: 600 });
    const full = figureFromPixels(
      (() => {
        const img = blank(300, 400);
        fill(img, 0, 0, 299, 399, [1, 2, 3]);
        return img;
      })(),
    );
    expect(
      cropGeometry(full, { aspect: '3:4', range: 100, anchor: 'head', offset: 0 }),
    ).toMatchObject({ x: 0, y: 0, width: 300, height: 400 });
    const empty = figureFromPixels(blank(300, 300));
    expect(
      cropGeometry(empty, { aspect: '3:4', range: 60, anchor: 'head', offset: 0 }),
    ).toMatchObject({ width: 135, height: 180 });
  });

  it('位移以原圖 px 記住、夾在左右邊界內；框比圖寬時固定在最左', () => {
    const g = (offset: number, range = 60) =>
      cropGeometry(A, { aspect: '3:4', range, anchor: 'head', offset });
    expect(g(40).x).toBe(97);
    expect(g(-40).x).toBe(17);
    expect(g(10_000).x).toBe(700 - 486);
    expect(g(-10_000).x).toBe(0);
    /* 改範圍：位移不變，只重新夾住（10% 時 259 ＋ 40） */
    expect(g(40, 10).x).toBe(299);
    expect(g(10_000, 10).x).toBe(700 - 81);
    /* 框比圖寬：不論位移都在 0 */
    expect(g(300, 100).x).toBe(0);
    /* 垂直位置不受位移影響 */
    expect(g(40).y).toBe(70);
    /* 所有基準都可以左右位移 */
    expect(cropGeometry(A, { aspect: '3:4', range: 35, anchor: 'image', offset: -8 }).x).toBe(200);
  });

  it('拖曳換算：框左緣 → 位移（不四捨五入，放回原位不會跳半格）', () => {
    const g = cropGeometry(A, { aspect: '3:4', range: 60, anchor: 'head', offset: 0 });
    expect(g.baseLeft).toBe(56.5);
    expect(offsetFor(g, 100)).toBe(43.5);
    const moved = cropGeometry(A, {
      aspect: '3:4',
      range: 60,
      anchor: 'head',
      offset: offsetFor(g, 100),
    });
    expect(moved.x).toBe(100);
  });

  it('裁切範圍夾在 10～100 的整數；太矮的角色輸出至少 1 px', () => {
    expect([clampRange(5), clampRange(100.4), clampRange(130), clampRange(57.6)]).toEqual([
      10, 100, 100, 58,
    ]);
    const tiny = figureFromPixels(
      (() => {
        const img = blank(10, 10);
        fill(img, 4, 4, 5, 5, [1, 2, 3]);
        return img;
      })(),
    );
    expect(
      cropGeometry(tiny, { aspect: '3:4', range: 10, anchor: 'head', offset: 0 }),
    ).toMatchObject({ width: 1, height: 1 });
  });

  it('一比一複製像素（含半透明），圖片外是透明', () => {
    const src = blank(6, 4);
    for (let i = 0; i < 24; i++) src.data.set([i, 255 - i, i * 2, i * 10], i * 4);
    const out = cropPixels(src, { x: 3, y: 1, width: 5, height: 2 });
    expect([out.width, out.height]).toEqual([5, 2]);
    const p = (x: number, y: number) =>
      Array.from(out.data.slice((y * 5 + x) * 4, (y * 5 + x) * 4 + 4));
    expect(p(0, 0)).toEqual([9, 246, 18, 90]);
    expect(p(2, 1)).toEqual([17, 238, 34, 170]);
    expect(p(3, 0)).toEqual([0, 0, 0, 0]);
    expect(p(4, 1)).toEqual([0, 0, 0, 0]);
  });
});

describe('每張的基準與位移（F08、F11、F16～F18、F20）', () => {
  const list: (Slot & { id: string })[] = [
    { id: 'a', anchor: 'head', offset: 12 },
    { id: 'b', anchor: 'manual', offset: -5 },
    { id: 'c', anchor: 'figure', offset: 7 },
  ];

  it('不勾全部套用：只改目前這張；非手動時位移歸零、手動保留', () => {
    expect(chooseAnchor(list, 0, 'image', false)).toEqual([
      { id: 'a', anchor: 'image', offset: 0 },
      list[1],
      list[2],
    ]);
    expect(chooseAnchor(list, 0, 'manual', false)[0]).toEqual({
      id: 'a',
      anchor: 'manual',
      offset: 12,
    });
  });

  it('勾選全部套用：改基準套用到所有圖片', () => {
    expect(chooseAnchor(list, 1, 'upper', true)).toEqual([
      { id: 'a', anchor: 'upper', offset: 0 },
      { id: 'b', anchor: 'upper', offset: 0 },
      { id: 'c', anchor: 'upper', offset: 0 },
    ]);
    expect(chooseAnchor(list, 1, 'manual', true).map((x) => [x.anchor, x.offset])).toEqual([
      ['manual', 12],
      ['manual', -5],
      ['manual', 7],
    ]);
  });

  it('勾選的當下統一成選單上的基準：相同基準的保留位移', () => {
    expect(syncAnchors(list, 'head')).toEqual([
      list[0],
      { id: 'b', anchor: 'head', offset: 0 },
      { id: 'c', anchor: 'head', offset: 0 },
    ]);
    expect(syncAnchors(list, 'manual').map((x) => x.offset)).toEqual([12, -5, 7]);
  });

  it('回到基準位置、切換比例：只有目前這張的位移歸零', () => {
    expect(resetOffset(list, 2).map((x) => x.offset)).toEqual([12, -5, 0]);
    const same = resetOffset([{ anchor: 'head', offset: 0 }], 0);
    expect(same[0].offset).toBe(0);
  });
});

describe('輸入與檔名（2、3.4）', () => {
  it('只收 PNG 與 WebP（依檔頭；檔頭認不得時看瀏覽器回報的類型）', () => {
    expect(sourceKind('png', '')).toBe('png');
    expect(sourceKind('apng', 'image/png')).toBe('png');
    expect(sourceKind('webp', 'application/octet-stream')).toBe('webp');
    expect(sourceKind(null, 'image/png')).toBe('png');
    expect(sourceKind(null, 'IMAGE/WEBP')).toBe('webp');
    expect(sourceKind('jpeg', 'image/png')).toBeNull();
    expect(sourceKind('gif', 'image/gif')).toBeNull();
    expect(sourceKind(null, 'image/jpeg')).toBeNull();
    expect(sourceKind(null, '')).toBeNull();
  });

  it.each([
    ['立繪 01.png', '立繪 01_crop.png'],
    ['Alice.PNG', 'Alice_crop.png'],
    ['a.b.png', 'a.b_crop.png'],
    ['x.png.png', 'x.png_crop.png'],
    ['clipboard_20261001155722.png', 'clipboard_20261001155722_crop.png'],
    ['角色.webp', '角色_crop.png'],
    ['noext', 'noext.png'],
  ])('%s → %s', (name, want) => {
    expect(outputFileName(name)).toBe(want);
  });

  it('貼上的檔名用本地時間（主控裁定）', () => {
    expect(clipboardFileName(new Date(2026, 9, 1, 15, 57, 22))).toBe(
      'clipboard_20261001155722.png',
    );
    expect(clipboardFileName(new Date(2027, 0, 2, 3, 4, 5))).toBe('clipboard_20270102030405.png');
  });
});

describe('自動存檔的設定', () => {
  it('預設值', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      aspect: '3:4',
      range: 60,
      anchor: 'head',
      effectOn: false,
      effectStyle: 'stroke',
      effectColor: '#ffffff',
      effectWidth: 5,
      effectBlur: 12,
      effectOffset: 8,
      effectOpacity: 100,
    });
  });

  it('被改壞的值換成預設、數值夾在範圍內', () => {
    expect(
      sanitizeSettings({
        aspect: '16:9' as Aspect,
        range: 250,
        anchor: 'feet' as Anchor,
        effectOn: 'yes' as unknown as boolean,
        effectStyle: 'glow-soft',
        effectColor: '#FF8800',
        effectWidth: 0,
        effectBlur: 99,
        effectOffset: -3,
        effectOpacity: 55.4,
      }),
    ).toEqual({
      aspect: '3:4',
      range: 100,
      anchor: 'head',
      effectOn: false,
      effectStyle: 'glow-soft',
      effectColor: '#ff8800',
      effectWidth: 1,
      effectBlur: 40,
      effectOffset: 0,
      effectOpacity: 55,
    });
    expect(sanitizeSettings({ effectColor: 'red' }).effectColor).toBe('#ffffff');
  });
});
