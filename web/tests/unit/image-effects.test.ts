/**
 * 剪影效果的像素規則（ccfolia-cropper 規格 3.3 與第 7 節裁定）：
 * 描邊圓形向外擴張、光暈柔和與強烈有區別、整個剪影的偏移陰影；
 * 效果畫在角色後面、不改變半透明像素、線條透明度等於設定值、不擴大輸出尺寸。
 */
import { describe, expect, it } from 'vitest';
import {
  applySilhouetteEffects,
  blurMask,
  distanceField,
  FILTER_GLOW,
  gaussianBlurMask,
  limitResolution,
  limitScale,
  opaqueSpanInRows,
  outlineLayers,
  type PixelBuffer,
} from '@/core/image';

/** 300 × 300 透明底，中間 200 × 200 的不透明方塊（x、y 50～249），外圍一圈 1 px、透明度 128 的邊 */
function square(): PixelBuffer {
  const w = 300;
  const data = new Uint8ClampedArray(w * w * 4);
  for (let y = 50; y <= 249; y++)
    for (let x = 50; x <= 249; x++) {
      const edge = x === 50 || x === 249 || y === 50 || y === 249;
      data.set([40, 80, 220, edge ? 128 : 255], (y * w + x) * 4);
    }
  return { data, width: w, height: w };
}

const alphaAt = (b: PixelBuffer, x: number, y: number) => b.data[(y * b.width + x) * 4 + 3];
const rgbAt = (b: PixelBuffer, x: number, y: number) =>
  Array.from(b.data.slice((y * b.width + x) * 4, (y * b.width + x) * 4 + 3));
/** 從輪廓（x＝249）往右量：d＝1 是 x＝250 */
const rightProfile = (b: PixelBuffer, y = 150, n = 45) =>
  Array.from({ length: n }, (_, i) => alphaAt(b, 250 + i, y));

describe('distanceField', () => {
  it('到最近 inside 像素中心的歐氏距離', () => {
    const inside = new Uint8Array(25);
    inside[12] = 1; /* 5 × 5 的正中央 */
    const d = distanceField(inside, 5, 5);
    expect(d[12]).toBe(0);
    expect(d[13]).toBe(1);
    expect(d[18]).toBeCloseTo(Math.SQRT2);
    expect(d[0]).toBeCloseTo(Math.sqrt(8));
    expect(distanceField(new Uint8Array(4), 2, 2)[0]).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('applySilhouetteEffects', () => {
  const src = square();

  it('實線描邊：粗細 N 剛好 N px（d 1～N 全實、N＋1 起透明），顏色正確', () => {
    for (const n of [1, 5, 10, 30]) {
      const out = applySilhouetteEffects(
        src,
        outlineLayers('stroke', { color: '#ff0000', width: n }),
      );
      const p = rightProfile(out, 150, n + 3);
      expect(p.slice(0, n).every((a) => a === 255)).toBe(true);
      expect(p[n]).toBe(0);
      expect(rgbAt(out, 250, 150)).toEqual([255, 0, 0]);
    }
  });

  it('轉角是圓弧（對角方向的距離用歐氏距離）並有反鋸齒', () => {
    const out = applySilhouetteEffects(
      src,
      outlineLayers('stroke', { color: '#ff0000', width: 5 }),
    );
    /* 右下角 (249, 249) 往外斜 45°：距離 √2·k */
    expect(alphaAt(out, 252, 252)).toBe(255); /* √18 ≈ 4.24 */
    expect(alphaAt(out, 253, 253)).toBeGreaterThan(0); /* √32 ≈ 5.66 → 覆蓋約 0.34 */
    expect(alphaAt(out, 253, 253)).toBeLessThan(255);
    expect(alphaAt(out, 254, 254)).toBe(0);
  });

  it('角色本身與半透明的邊原封不動；輸出尺寸不變', () => {
    for (const style of ['stroke', 'glow-soft', 'glow-strong', 'shadow'] as const) {
      const out = applySilhouetteEffects(
        src,
        outlineLayers(style, { color: '#ffffff', width: 5, blur: 12, offset: 8 }),
      );
      expect([out.width, out.height]).toEqual([300, 300]);
      for (let y = 50; y <= 249; y += 7)
        for (let x = 50; x <= 249; x += 7) {
          const i = (y * 300 + x) * 4;
          expect(Array.from(out.data.slice(i, i + 4))).toEqual(
            Array.from(src.data.slice(i, i + 4)),
          );
        }
      expect(alphaAt(out, 249, 150)).toBe(128);
      expect(alphaAt(out, 150, 50)).toBe(128);
    }
  });

  it('不透明度就是線條的透明度（不會變濃）', () => {
    for (const [o, a] of [
      [0, 0],
      [0.25, 64],
      [0.5, 128],
      [0.75, 191],
      [1, 255],
    ] as const) {
      const out = applySilhouetteEffects(
        src,
        outlineLayers('stroke', { color: '#ff0000', width: 5, opacity: o }),
      );
      expect(Math.abs(alphaAt(out, 252, 150) - a)).toBeLessThanOrEqual(1);
    }
  });

  it('光暈：實線外有漸淡的光；強烈比柔和濃、柔和的實線較細', () => {
    const soft = applySilhouetteEffects(
      src,
      outlineLayers('glow-soft', { color: '#ffffff', width: 6, blur: 12 }),
    );
    const strong = applySilhouetteEffects(
      src,
      outlineLayers('glow-strong', { color: '#ffffff', width: 6, blur: 12 }),
    );
    const s = rightProfile(soft);
    const t = rightProfile(strong);
    /* 強烈：6 px 實線；柔和：3 px 實線 */
    expect(t.slice(0, 6).every((a) => a === 255)).toBe(true);
    expect(s.slice(0, 3).every((a) => a === 255)).toBe(true);
    expect(s[4]).toBeLessThan(255);
    /* 實線外漸淡、最後歸零；強烈比柔和濃 */
    for (let i = 6; i < 16; i++) {
      expect(t[i]).toBeGreaterThan(s[i]);
      expect(t[i + 1]).toBeLessThanOrEqual(t[i]);
    }
    expect(s[8]).toBeGreaterThan(0);
    expect(t[14]).toBeGreaterThan(0);
    expect(t[40]).toBe(0);
  });

  it('光暈的模糊 0 至少當 1 px', () => {
    const out = applySilhouetteEffects(
      src,
      outlineLayers('glow-strong', { color: '#ffffff', width: 5, blur: 0 }),
    );
    expect(rightProfile(out)[5]).toBeGreaterThan(0);
  });

  it('陰影：整個剪影（不是中空的線）往右下偏移，和角色之間沒有空隙；左上方沒有', () => {
    const out = applySilhouetteEffects(
      src,
      outlineLayers('shadow', { color: '#000000', width: 5, blur: 0, offset: 8 }),
    );
    /* 右側：剪影擴張 5 再右移 8 → 到 x＝262 都是實的 */
    const p = rightProfile(out, 150, 16);
    expect(p.slice(0, 13).every((a) => a === 255)).toBe(true);
    expect(p[13]).toBe(0);
    /* 左側與上方（剪影右移 8、擴張 5 → 左緣 53）沒有陰影 */
    expect(alphaAt(out, 49, 150)).toBe(0);
    expect(alphaAt(out, 150, 49)).toBe(0);
    /* 右下角外也有（整個剪影的影子） */
    expect(alphaAt(out, 255, 255)).toBe(255);
  });

  it('陰影有模糊時右側較長、左側較短', () => {
    const out = applySilhouetteEffects(
      src,
      outlineLayers('shadow', { color: '#000000', width: 5, blur: 12, offset: 8 }),
    );
    const right = rightProfile(out, 150, 60).filter((a) => a > 0).length;
    const left = Array.from({ length: 50 }, (_, i) => alphaAt(out, 49 - i, 150)).filter(
      (a) => a > 0,
    ).length;
    expect(right).toBeGreaterThan(left);
  });

  it('keepPartial: false 時角色疊在效果上面（半透明的邊會變濃）', () => {
    const out = applySilhouetteEffects(
      src,
      outlineLayers('stroke', { color: '#ff0000', width: 5 }),
      {
        keepPartial: false,
      },
    );
    expect(alphaAt(out, 249, 150)).toBe(255);
    expect(alphaAt(out, 150, 150)).toBe(255);
  });
});

describe('模糊值的換算（blurMode）與新的效果層選項', () => {
  const src = square();
  const reach = (p: number[]) => p.findLastIndex((a) => a > 0) + 1;

  it('不給 blurMode 時和以前完全相同（σ ＝ 模糊 ÷ 2、整個剪影的光暈）', () => {
    const color = '#ffffff';
    expect(outlineLayers('glow-strong', { color, width: 5, blur: 12 })).toEqual([
      { color, spread: 5, blur: 12, gain: 1.8, opacity: 1 },
      { color, spread: 5, opacity: 1 },
    ]);
    expect(outlineLayers('glow-soft', { color, width: 5, blur: 0, opacity: 0.5 })).toEqual([
      { color, spread: 3, blur: 1, opacity: 0.3 },
      { color, spread: 3, opacity: 0.5 },
    ]);
    expect(outlineLayers('shadow', { color, width: 5, blur: 12, offset: 8 })).toEqual([
      { color, spread: 5, blur: 12, offsetX: 8, offsetY: 8, opacity: 1 },
    ]);
    expect(outlineLayers('glow-strong', { color, width: 5, blur: 12, blurMode: 'shadow' })).toEqual(
      outlineLayers('glow-strong', { color, width: 5, blur: 12 }),
    );
    /* blurMask 仍是 σ ＝ blur ÷ 2 */
    const m = new Float32Array(41 * 41);
    m[20 * 41 + 20] = 1;
    expect(Array.from(blurMask(m, 41, 41, 8))).toEqual(Array.from(gaussianBlurMask(m, 41, 41, 4)));
  });

  it("blurMode 'filter'：σ ＝ 模糊值（陰影延伸約兩倍長）", () => {
    const shadow = (blurMode?: 'filter') =>
      rightProfile(
        applySilhouetteEffects(
          src,
          outlineLayers('shadow', { color: '#000000', width: 5, blur: 8, offset: 0, blurMode }),
        ),
        150,
        48,
      );
    const half = reach(shadow());
    const full = reach(shadow('filter'));
    /* σ 4 → 約 5 ＋ 3σ；σ 8 → 約 5 ＋ 3σ */
    expect(half).toBeGreaterThan(12);
    expect(half).toBeLessThan(20);
    expect(full).toBeGreaterThan(24);
    expect(full).toBeLessThan(34);
    /* sigma 直接指定時不看 blur */
    const viaSigma = applySilhouetteEffects(src, [
      { color: '#000000', spread: 5, sigma: 8, blur: 2 },
    ]);
    expect(rightProfile(viaSigma, 150, 48)).toEqual(shadow('filter'));
  });

  it("blurMode 'filter' 的光暈：線條本身的模糊，總量幾乎不隨模糊值改變；柔和每個距離都比強烈淡", () => {
    const glow = (style: 'glow-strong' | 'glow-soft', blur: number) =>
      rightProfile(
        applySilhouetteEffects(
          src,
          outlineLayers(style, { color: '#ffffff', width: 5, blur, blurMode: 'filter' }),
        ),
        150,
        49,
      );
    const sum = (p: number[]) => p.slice(5).reduce((s, a) => s + a, 0);
    const t8 = sum(glow('glow-strong', 8));
    const t14 = sum(glow('glow-strong', 14));
    expect(Math.abs(t14 - t8) / t8).toBeLessThan(0.25);
    for (const blur of [0, 4, 12]) {
      const strong = glow('glow-strong', blur);
      const soft = glow('glow-soft', blur);
      expect(strong.slice(0, 5)).toEqual([255, 255, 255, 255, 255]);
      expect(soft.slice(0, 3)).toEqual([255, 255, 255]);
      expect(soft[3], `模糊 ${blur}`).toBeLessThan(255);
      for (let i = 3; i < 49; i++)
        expect(soft[i], `模糊 ${blur} d ${i + 1}`).toBeLessThanOrEqual(strong[i]);
    }
    expect(FILTER_GLOW.softOpacity).toBeLessThan(1);
  });

  it('hollow：只取擴張出來的那一圈（剪影本身不算）', () => {
    const one: PixelBuffer = { data: new Uint8ClampedArray(9 * 9 * 4), width: 9, height: 9 };
    one.data[(4 * 9 + 4) * 4 + 3] = 255;
    const out = applySilhouetteEffects(one, [{ color: '#ff0000', spread: 2, hollow: true }], {
      keepPartial: false,
    });
    /* 中心是角色本身（疊在上面、透明度 255 但顏色是原圖的黑）；一圈 2 px 是線 */
    expect(rgbAt(out, 4, 4)).toEqual([0, 0, 0]);
    expect(alphaAt(out, 6, 4)).toBe(255);
    expect(alphaAt(out, 7, 4)).toBe(0);
    /* 沒有擴張時沒有東西 */
    const none = applySilhouetteEffects(one, [{ color: '#ff0000', hollow: true }]);
    expect(alphaAt(none, 5, 4)).toBe(0);
  });
});

describe('opaqueSpanInRows', () => {
  it('某幾列的不透明左右界（y1 不含）', () => {
    const w = 10;
    const data = new Uint8ClampedArray(w * 4 * 4);
    data[(1 * w + 3) * 4 + 3] = 1;
    data[(2 * w + 7) * 4 + 3] = 200;
    const b = { data, width: w, height: 4 };
    expect(opaqueSpanInRows(b, 0, 4)).toEqual({ left: 3, right: 7 });
    expect(opaqueSpanInRows(b, 0, 2)).toEqual({ left: 3, right: 3 });
    expect(opaqueSpanInRows(b, 3, 4)).toBeNull();
    expect(opaqueSpanInRows(b, 0, 4, 16)).toEqual({ left: 7, right: 7 });
  });
});

describe('大圖匯出的解析度上限', () => {
  it('總面積與邊長超過上限時等比降低', () => {
    expect(limitResolution(10, { width: 100, height: 100 })).toBe(10);
    /* 40 cm × 180 cm、想要 100 px/cm → 受 4,000 萬像素限制 */
    expect(limitResolution(100, { width: 40, height: 180 })).toBeCloseTo(Math.sqrt(40e6 / 7200), 5);
    expect(limitResolution(100, { width: 10, height: 1000 }, { maxSide: 16000 })).toBe(16);
    expect(limitScale(20000, 1000)).toBeCloseTo(0.8);
    expect(limitScale(100, 100)).toBe(1);
  });
});
