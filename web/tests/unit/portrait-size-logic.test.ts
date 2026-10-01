/**
 * 立繪尺寸統一器的規則（規格 docs/refactor/specs/portrait-size.md 第 3 節）：
 * 去除透明留白、寬度對齊的四種組合、置中取整、透明門檻、輸出格式與檔名。
 */
import { describe, expect, it } from 'vitest';
import type { PixelBuffer, Rect } from '@/core/image';
import {
  composePixels,
  contentRect,
  outputName,
  outputSpec,
  type Placement,
  placeAll,
  sourceKind,
} from '@/tools/portrait-size/logic';

/** 透明畫布上畫一塊不透明的內容 */
function image(width: number, height: number, content?: Rect, alpha = 255): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  if (content) {
    for (let y = content.y; y < content.y + content.height; y++) {
      for (let x = content.x; x < content.x + content.width; x++) {
        const i = (y * width + x) * 4;
        data[i] = 200;
        data[i + 1] = (x * 7) & 255;
        data[i + 2] = (y * 3) & 255;
        data[i + 3] = alpha;
      }
    }
  }
  return { data, width, height };
}

const px = (b: PixelBuffer, x: number, y: number) => {
  const i = (y * b.width + x) * 4;
  return Array.from(b.data.slice(i, i + 4));
};

/** 處理一批圖：去留白 → 對齊 → 合成，回傳每張的配置與輸出 */
function run(images: PixelBuffer[], trim: boolean, align: boolean) {
  const crops = images.map((im) => contentRect(im, trim));
  const placements = placeAll(crops, align);
  return placements.map((p, i) => ({ p, out: composePixels(images[i], p) }));
}

describe('規格 3.2 的四種組合（A、B、C 三張合成圖）', () => {
  /* A：200×300 內含 130×240；B：400×250 內含 300×230；C：120×120 內含 60×70 */
  const A = image(200, 300, { x: 30, y: 20, width: 130, height: 240 });
  const B = image(400, 250, { x: 50, y: 10, width: 300, height: 230 });
  const C = image(120, 120, { x: 20, y: 25, width: 60, height: 70 });
  const size = (r: { p: Placement }) => `${r.p.width}×${r.p.height}`;

  it('去留白開、對齊開（預設）：300×240（從 x＝85）、300×230、300×70（從 x＝120）', () => {
    const [a, b, c] = run([A, B, C], true, true);
    expect([size(a), size(b), size(c)]).toEqual(['300×240', '300×230', '300×70']);
    expect(a.p.offsetX).toBe(85);
    expect(c.p.offsetX).toBe(120);
    /* 內容的第一欄在 x＝85，前一欄是透明的 */
    expect(px(a.out, 84, 0)[3]).toBe(0);
    expect(px(a.out, 85, 0)).toEqual(px(A, 30, 20));
    expect(px(a.out, 85 + 129, 239)).toEqual(px(A, 30 + 129, 20 + 239));
    expect(px(a.out, 85 + 130, 0)[3]).toBe(0);
    expect(px(c.out, 120, 0)).toEqual(px(C, 20, 25));
    expect(px(c.out, 119, 0)[3]).toBe(0);
    /* 本來就是最寬的那張不變 */
    expect(b.p.offsetX).toBe(0);
    expect(px(b.out, 0, 0)).toEqual(px(B, 50, 10));
  });

  it('去留白開、對齊關：130×240、300×230、60×70', () => {
    const [a, b, c] = run([A, B, C], true, false);
    expect([size(a), size(b), size(c)]).toEqual(['130×240', '300×230', '60×70']);
    expect(px(a.out, 0, 0)).toEqual(px(A, 30, 20));
  });

  it('去留白關、對齊開：400×300、400×250、400×120', () => {
    const [a, b, c] = run([A, B, C], false, true);
    expect([size(a), size(b), size(c)]).toEqual(['400×300', '400×250', '400×120']);
    expect(a.p.offsetX).toBe(100);
    expect(c.p.offsetX).toBe(140);
    /* 原圖整張搬過去：A 的內容在 (100+30, 20) */
    expect(px(a.out, 130, 20)).toEqual(px(A, 30, 20));
    expect(px(b.out, 50, 10)).toEqual(px(B, 50, 10));
  });

  it('去留白關、對齊關：200×300、400×250、120×120（原尺寸）', () => {
    const [a, b, c] = run([A, B, C], false, false);
    expect([size(a), size(b), size(c)]).toEqual(['200×300', '400×250', '120×120']);
    expect(Array.from(a.out.data)).toEqual(Array.from(A.data));
  });

  it('永遠不縮放、不改高度：輸出高度＝去留白後的高度', () => {
    for (const [trim, align] of [
      [true, true],
      [true, false],
      [false, true],
      [false, false],
    ] as const) {
      const out = run([A, B, C], trim, align);
      const crops = [A, B, C].map((im) => contentRect(im, trim));
      out.forEach((r, i) => {
        expect(r.p.height).toBe(crops[i].height);
        expect(r.p.crop.width).toBe(crops[i].width);
      });
    }
  });
});

describe('置中取整', () => {
  it('51 px 寬統一到 300 px：左邊留 124 px、右邊留 125 px', () => {
    const narrow = image(51, 10, { x: 0, y: 0, width: 51, height: 10 });
    const wide = image(300, 10, { x: 0, y: 0, width: 300, height: 10 });
    const [n] = run([narrow, wide], true, true);
    expect(n.p.offsetX).toBe(124);
    expect(px(n.out, 123, 5)[3]).toBe(0);
    expect(px(n.out, 124, 5)[3]).toBe(255);
    expect(px(n.out, 174, 5)[3]).toBe(255);
    expect(px(n.out, 175, 5)[3]).toBe(0);
    /* 右邊留白 300 − 124 − 51 = 125 */
    expect(n.p.width - n.p.offsetX - 51).toBe(125);
  });
});

describe('去除透明留白（3.1）', () => {
  it('透明度 1/255 的孤立像素也算內容', () => {
    const im = image(100, 80, { x: 40, y: 30, width: 10, height: 10 });
    const i = (5 * 100 + 90) * 4;
    im.data[i + 3] = 1;
    expect(contentRect(im, true)).toEqual({ x: 40, y: 5, width: 51, height: 35 });
  });

  it('整張完全透明：不裁，維持原尺寸', () => {
    const im = image(64, 48);
    expect(contentRect(im, true)).toEqual({ x: 0, y: 0, width: 64, height: 48 });
    const [r] = run([im], true, true);
    expect([r.p.width, r.p.height]).toEqual([64, 48]);
  });

  it('四周沒有透明邊：維持原尺寸', () => {
    const im = image(30, 20, { x: 0, y: 0, width: 30, height: 20 });
    expect(contentRect(im, true)).toEqual({ x: 0, y: 0, width: 30, height: 20 });
  });

  it('關閉時一律整張', () => {
    const im = image(30, 20, { x: 5, y: 5, width: 3, height: 3 });
    expect(contentRect(im, false)).toEqual({ x: 0, y: 0, width: 30, height: 20 });
  });
});

describe('像素內容（3.3）', () => {
  it('不透明與半透明的像素原值不變；完全透明的像素輸出 (0, 0, 0, 0)', () => {
    const im = image(4, 1, { x: 0, y: 0, width: 4, height: 1 });
    im.data.set([40, 80, 220, 128], 4);
    im.data.set([9, 9, 9, 0], 8);
    const [r] = run([im], false, false);
    expect(px(r.out, 0, 0)).toEqual(px(im, 0, 0));
    expect(px(r.out, 1, 0)).toEqual([40, 80, 220, 128]);
    expect(px(r.out, 2, 0)).toEqual([0, 0, 0, 0]);
  });
});

describe('收檔（F03）', () => {
  it('依檔頭收 PNG（含 APNG）與 WebP，沒有副檔名也能收', () => {
    expect(sourceKind('png', '')).toBe('png');
    expect(sourceKind('apng', '')).toBe('png');
    expect(sourceKind('webp', '')).toBe('webp');
    expect(sourceKind('png', 'image/webp')).toBe('png');
  });
  it('檔頭認不得、但瀏覽器回報 PNG／WebP：照收（處理時才報讀檔失敗）', () => {
    expect(sourceKind(null, 'image/png')).toBe('png');
    expect(sourceKind(null, 'image/webp')).toBe('webp');
  });
  it('其他類型拒收', () => {
    expect(sourceKind('jpeg', 'image/jpeg')).toBeNull();
    expect(sourceKind('gif', 'image/gif')).toBeNull();
    expect(sourceKind('jpeg', 'image/png')).toBeNull();
    expect(sourceKind(null, 'text/plain')).toBeNull();
    expect(sourceKind(null, '')).toBeNull();
  });
});

describe('輸出格式（3.4）', () => {
  const lossless = { webp: true, quality: 'lossless' as const };
  it('轉 WebP＋無損、品質 100%：無損 WebP', () => {
    for (const kind of ['png', 'webp'] as const) {
      expect(outputSpec(kind, lossless)).toEqual({
        mime: 'image/webp',
        quality: 1,
        ext: 'webp',
        lossless: true,
      });
      expect(outputSpec(kind, { webp: true, quality: 100 })).toEqual(outputSpec(kind, lossless));
    }
  });
  it('轉 WebP＋品質 50～99%：有損 WebP', () => {
    expect(outputSpec('png', { webp: true, quality: 90 })).toEqual({
      mime: 'image/webp',
      quality: 0.9,
      ext: 'webp',
      lossless: false,
    });
    expect(outputSpec('webp', { webp: true, quality: 50 }).quality).toBe(0.5);
  });
  it('不轉 WebP：PNG 輸出 PNG，WebP 輸出無損 WebP（不看品質）', () => {
    expect(outputSpec('png', { webp: false, quality: 60 })).toEqual({
      mime: 'image/png',
      ext: 'png',
      lossless: true,
    });
    expect(outputSpec('webp', { webp: false, quality: 60 })).toEqual({
      mime: 'image/webp',
      quality: 1,
      ext: 'webp',
      lossless: true,
    });
  });
  it('瀏覽器不能編碼 WebP 時改成 PNG', () => {
    expect(outputSpec('webp', lossless, false).ext).toBe('png');
  });
});

describe('檔名（3.5）', () => {
  it('去掉最後一個副檔名再接上輸出格式', () => {
    expect(outputName('立繪.v2.final.png', 'webp')).toBe('立繪.v2.final.webp');
    expect(outputName('立繪.webp', 'webp')).toBe('立繪.webp');
    expect(outputName('立繪.PNG', 'png')).toBe('立繪.png');
  });
  it('檔名沒有「.」時整個保留', () => {
    expect(outputName('立繪', 'webp')).toBe('立繪.webp');
  });
  it('只有副檔名（.png）時保留原名', () => {
    expect(outputName('.png', 'webp')).toBe('.png.webp');
  });
});
