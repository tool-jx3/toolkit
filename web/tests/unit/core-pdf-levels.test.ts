/**
 * core/pdf：等級的參數（照兩個原作：QC＝qcompress、WP＝wise-pdf）、進階設定、DPI 的換算。
 */
import { describe, expect, it } from 'vitest';
import {
  DPI_TOLERANCE,
  effectiveDpi,
  nextRasterDpi,
  pageRasterDpi,
  RASTER_MAX_PIXELS,
  targetSize,
} from '@/core/pdf/dpi';
import { A4_LONG_EDGE_IN, LEVELS, PDF_LEVELS, resolveSettings } from '@/core/pdf/levels';

describe('等級的參數', () => {
  it('五個等級，順序固定', () => {
    expect(PDF_LEVELS).toEqual(['lossless', 'high', 'balanced', 'smallest', 'raster']);
  });

  it('無損：不動影像、不轉圖（QC 的 lossless）', () => {
    expect(LEVELS.lossless).toEqual({ lossy: false, images: [], raster: null });
  });

  it('高畫質＝WP 的 low：200 DPI、品質 82、長邊 200 × 11.7 ＝ 2340', () => {
    expect(LEVELS.high.images).toEqual([{ quality: 82, dpi: 200, longEdge: 2340 }]);
    expect(Math.round(200 * A4_LONG_EDGE_IN)).toBe(2340);
  });

  it('平衡＝WP 的 recommended（150 DPI、品質 72），量不到大小的影像另外試 QC 的 balanced（品質 78、長邊 2480）', () => {
    expect(LEVELS.balanced.images).toEqual([
      { quality: 72, dpi: 150, longEdge: 1755 },
      { quality: 78, dpi: 0, longEdge: 2480, unmeasuredOnly: true },
    ]);
  });

  it('最小＝QC 的 maximum（品質 55、長邊 1700）＋DPI 上限 120，另外試平衡的全部設定', () => {
    expect(LEVELS.smallest.images).toEqual([
      { quality: 55, dpi: 120, longEdge: 1700 },
      { quality: 72, dpi: 150, longEdge: 1755 },
      { quality: 78, dpi: 0, longEdge: 2480, unmeasuredOnly: true },
    ]);
    expect(LEVELS.smallest.images.slice(1)).toEqual(LEVELS.balanced.images);
  });

  it('另外試的設定都比等級本身輕（品質不低、解析度不低）', () => {
    for (const id of PDF_LEVELS) {
      const [main, ...rest] = LEVELS[id].images;
      for (const a of rest) {
        expect(a.quality).toBeGreaterThanOrEqual(main.quality);
        expect(a.dpi === 0 || a.dpi >= main.dpi).toBe(true);
        expect(a.longEdge).toBeGreaterThanOrEqual(main.longEdge);
      }
    }
  });

  it('整頁轉圖＝WP 的 maximum：120 DPI、品質 60，最低 50 DPI、目標 0.8 倍、最多 4 輪', () => {
    expect(LEVELS.raster.raster).toEqual({
      dpi: 120,
      quality: 60,
      minDpi: 50,
      ratio: 0.8,
      passes: 4,
    });
    expect(LEVELS.raster.images).toEqual([]);
  });
});

describe('進階設定', () => {
  it('沒改時照等級；無損與整頁轉圖不轉換 Flate 影像', () => {
    const s = resolveSettings('balanced');
    expect(s.images).toBe(LEVELS.balanced.images);
    expect(s.convertFlate).toBe(true);
    expect(s.verify).toBe(true);
    expect(resolveSettings('lossless').convertFlate).toBe(false);
    expect(resolveSettings('raster').convertFlate).toBe(false);
  });

  it('改品質或 DPI 時只試那一組；只改 DPI 時長邊上限 ＝ DPI × 11.7', () => {
    expect(resolveSettings('balanced', { quality: 60 }).images).toEqual([
      { quality: 60, dpi: 150, longEdge: 1755 },
    ]);
    expect(resolveSettings('smallest', { dpi: 96 }).images).toEqual([
      { quality: 55, dpi: 96, longEdge: Math.round(96 * 11.7) },
    ]);
  });

  it('超出範圍時夾到 30～95、72～600', () => {
    expect(resolveSettings('high', { quality: 5, dpi: 2000 }).images[0]).toMatchObject({
      quality: 30,
      dpi: 600,
    });
  });

  it('整頁轉圖：品質、DPI 套到轉圖；最低 DPI 不高於起始 DPI', () => {
    const r = resolveSettings('raster', { quality: 70, dpi: 72 });
    expect(r.raster).toMatchObject({ quality: 70, dpi: 72, minDpi: 50 });
    expect(resolveSettings('raster', { dpi: 72 }).raster?.minDpi).toBe(50);
  });

  it('無損的等級改品質也不會動影像', () => {
    expect(resolveSettings('lossless', { quality: 50 }).images).toEqual([]);
  });

  it('關掉 Flate 轉 JPEG、關掉比對', () => {
    const s = resolveSettings('high', { convertFlate: false, verify: false });
    expect(s.convertFlate).toBe(false);
    expect(s.verify).toBe(false);
  });
});

describe('有效 DPI 與縮小的尺寸', () => {
  it('有效 DPI ＝ 像素 ÷ 英吋，取兩個方向中較低的', () => {
    expect(effectiveDpi(2000, 1500, { widthIn: 4, heightIn: 3 })).toBe(500);
    expect(effectiveDpi(2000, 1000, { widthIn: 4, heightIn: 4 })).toBe(250);
    expect(effectiveDpi(100, 100, null)).toBeNull();
  });

  it('量得到大小：縮到 DPI 上限（兩個方向都至少留 DPI × 英吋）', () => {
    expect(
      targetSize(2000, 1500, { widthIn: 4, heightIn: 3 }, { dpi: 150, longEdge: 1755 }),
    ).toEqual({
      width: 600,
      height: 450,
      by: 'dpi',
    });
    /* 長寬比和顯示的不同（被拉長）：取需要較多像素的方向 */
    expect(targetSize(1000, 1000, { widthIn: 2, heightIn: 4 }, { dpi: 100, longEdge: 0 })).toEqual({
      width: 400,
      height: 400,
      by: 'dpi',
    });
  });

  it('只超過上限一點（≤ 10%）不縮；不放大', () => {
    expect(DPI_TOLERANCE).toBe(1.1);
    expect(targetSize(650, 488, { widthIn: 4, heightIn: 3 }, { dpi: 150, longEdge: 0 }).by).toBe(
      'none',
    );
    expect(targetSize(700, 525, { widthIn: 4, heightIn: 3 }, { dpi: 150, longEdge: 0 }).by).toBe(
      'dpi',
    );
    expect(targetSize(300, 200, { widthIn: 4, heightIn: 3 }, { dpi: 150, longEdge: 0 })).toEqual({
      width: 300,
      height: 200,
      by: 'none',
    });
  });

  it('量不到大小或設定不看 DPI：用長邊上限', () => {
    expect(targetSize(4000, 3000, null, { dpi: 150, longEdge: 1755 })).toEqual({
      width: 1755,
      height: 1316,
      by: 'long-edge',
    });
    expect(targetSize(4000, 3000, { widthIn: 1, heightIn: 1 }, { dpi: 0, longEdge: 2480 })).toEqual(
      {
        width: 2480,
        height: 1860,
        by: 'long-edge',
      },
    );
    expect(targetSize(1000, 800, null, { dpi: 150, longEdge: 1755 }).by).toBe('none');
    expect(targetSize(9000, 800, null, { dpi: 150, longEdge: 0 }).by).toBe('none');
  });
});

describe('整頁轉圖的 DPI', () => {
  it('比原檔大時：DPI × √(0.8 × 原檔 ÷ 這一輪)，一定變低、最低 50（WP 的 targetRasterDpi）', () => {
    expect(nextRasterDpi(120, 200_000, 100_000)).toBe(Math.floor(120 * Math.sqrt(0.4)));
    expect(nextRasterDpi(120, 101_000, 100_000)).toBe(106);
    expect(nextRasterDpi(60, 10_000_000, 100_000)).toBe(50);
    /* 目標比這一輪大（不該發生）時也至少降 1 */
    expect(nextRasterDpi(120, 50_000, 100_000)).toBe(119);
  });

  it('太大的頁面降低那一頁的 DPI（一頁最多 2,500 萬像素）', () => {
    expect(RASTER_MAX_PIXELS).toBe(25_000_000);
    expect(pageRasterDpi(612, 792, 120)).toBe(120);
    const d = pageRasterDpi(72 * 100, 72 * 100, 120);
    expect(d * 100 * d * 100).toBeLessThanOrEqual(25_000_000);
    expect(d).toBeGreaterThanOrEqual(49);
  });
});
