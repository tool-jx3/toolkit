/**
 * VTT 棋子產生器的繪製（node-canvas 真的畫出來量像素）：四角透明、開口裡的背景、外框的位置、
 * 出框合成（遮罩裡、外框外面的圖片蓋在最上面；遮罩裡被外框蓋住的部分還原成圖片；遮罩外的照舊被外框蓋住）、
 * 光暈、28 種外框與 6 種質感都畫得出來、匯出尺寸。
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { makeCanvas } from '../../src/core/image';
import {
  DEFAULT_LOOK,
  FRAME_IDS,
  geom,
  type Look,
  TEXTURE_IDS,
} from '../../src/tools/token-maker/model';
import { cutoutRadius, renderToken, renderTokenCanvas } from '../../src/tools/token-maker/render';
import { ensureTexture, texturePixels } from '../../src/tools/token-maker/textures';
import { nodeCanvas } from '../helpers/nodeCanvas';

const canvasLib = await nodeCanvas();

type Ctx = CanvasRenderingContext2D;
type Img = { data: Uint8ClampedArray; width: number };

const look = (patch: Partial<Look> = {}): Look => ({ ...DEFAULT_LOOK, ...patch });

/** w × h 的畫布，fn(x, y) → [r, g, b, a] */
function canvasOf(w: number, h: number, fn: (x: number, y: number) => number[]) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d') as Ctx;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) img.data.set(fn(x, y), (y * w + x) * 4);
  ctx.putImageData(img, 0, 0);
  return c;
}

function draw(
  N: number,
  pad: number,
  l: Look,
  opts: {
    image?: ReturnType<typeof canvasOf> | null;
    mask?: ReturnType<typeof canvasOf> | null;
    popOn?: boolean;
    texture?: ReturnType<typeof canvasOf> | null;
  } = {},
): Img {
  const c = makeCanvas(N, N);
  const ctx = c.getContext('2d') as Ctx;
  const image = opts.image ?? null;
  renderToken(
    ctx,
    {
      N,
      pad,
      look: l,
      token: { view: { x: 0, y: 0, zoom: 1, rotate: 0, flip: false }, popOn: opts.popOn ?? true },
      cacheFrame: false,
    },
    {
      image,
      size: image ? { width: image.width, height: image.height } : null,
      popMask: opts.mask ?? null,
      texture: opts.texture ?? null,
    },
  );
  return { data: ctx.getImageData(0, 0, N, N).data, width: N };
}

const px = (img: Img, x: number, y: number) => {
  const i = (Math.round(y) * img.width + Math.round(x)) * 4;
  return Array.from(img.data.subarray(i, i + 4));
};
const isRed = ([r, g, b, a]: number[]) => a > 240 && r > 200 && g < 40 && b < 40;
const isGoldish = ([r, g, b, a]: number[]) =>
  a > 200 && r > 60 && g > 30 && r >= b && g > b - 10 && !(r > 200 && g < 40);

describe.runIf(!!canvasLib)('棋子的繪製（node-canvas）', () => {
  beforeAll(() => {
    expect(canvasLib).not.toBeNull();
  });

  /*
   * N 200、邊距 0.2：R＝60、中心 100；外框寬 6.6（11%），內緣 53.4，開口半徑 55.38。
   * 圖片 200 × 200 的紅色，縮放 1 → 畫在 40～160；遮罩是圖片上面 30%（棋子的 y 40～76）。
   */
  const red = () => canvasOf(200, 200, () => [230, 10, 10, 255]);
  const topMask = () =>
    canvasOf(200, 200, (_x, y) => (y < 60 ? [255, 255, 255, 255] : [255, 255, 255, 0]));

  it('開口半徑與外框的位置', () => {
    const g = geom(200, 0.2);
    expect(g.R).toBeCloseTo(60);
    expect(cutoutRadius(look(), g)).toBeCloseTo(60 - 0.7 * 6.6);
  });

  it('沒有出框：四角透明；開口裡是圖片；外框上是外框的顏色；外框外面透明', () => {
    const img = draw(200, 0.2, look(), { image: red(), popOn: false });
    for (const [x, y] of [
      [0, 0],
      [199, 0],
      [0, 199],
      [199, 199],
    ])
      expect(px(img, x, y)[3]).toBe(0);
    expect(isRed(px(img, 100, 100))).toBe(true);
    expect(isGoldish(px(img, 100, 43))).toBe(true);
    expect(isGoldish(px(img, 100, 157))).toBe(true);
    expect(px(img, 60, 45)[3]).toBe(0);
  });

  it('出框：遮罩裡、外框外面的圖片在最上面；遮罩裡被外框蓋住的部分還原成圖片；遮罩外的照舊', () => {
    const img = draw(200, 0.2, look(), { image: red(), mask: topMask() });
    /* (60, 45)：離中心 68 > R，在圖片與遮罩裡 → 圖片 */
    expect(isRed(px(img, 60, 45))).toBe(true);
    /* (100, 43)：離中心 57，在外框上、遮罩裡 → 圖片（蓋在外框上面） */
    expect(isRed(px(img, 100, 43))).toBe(true);
    /* (100, 157)：外框上、遮罩外 → 外框 */
    expect(isGoldish(px(img, 100, 157))).toBe(true);
    /* (60, 150)：外框外面、遮罩外 → 透明 */
    expect(px(img, 60, 150)[3]).toBe(0);
    /* 關掉「顯示出框」：和沒有遮罩一樣 */
    const off = draw(200, 0.2, look(), { image: red(), mask: topMask(), popOn: false });
    expect(px(off, 60, 45)[3]).toBe(0);
    expect(isGoldish(px(off, 100, 43))).toBe(true);
  });

  it('出框的陰影只落在外框上（圖片、空白的地方不變暗）', () => {
    const plain = draw(200, 0.2, look({ shadow: 0 }), { image: red(), mask: topMask() });
    const shade = draw(200, 0.2, look({ shadow: 100 }), { image: red(), mask: topMask() });
    /* 遮罩下緣（棋子 y 76）下面一點的外框：變暗 */
    const lum = (p: number[]) => p[0] + p[1] + p[2];
    expect(lum(px(shade, 47, 78))).toBeLessThan(lum(px(plain, 47, 78)));
    /* 開口裡、外框外面不受影響 */
    expect(px(shade, 100, 100)).toEqual(px(plain, 100, 100));
    expect(px(shade, 20, 150)).toEqual(px(plain, 20, 150));
  });

  it('背景：單色填在開口裡（透明的圖片後面）、透明時留空、延伸時填滿', () => {
    const clear = canvasOf(200, 200, (x) =>
      x > 90 && x < 110 ? [230, 10, 10, 255] : [0, 0, 0, 0],
    );
    const color = draw(200, 0.2, look({ bg: 'color', bgColor: '#00ff00' }), {
      image: clear,
      popOn: false,
    });
    expect(px(color, 80, 100)).toEqual([0, 255, 0, 255]);
    const none = draw(200, 0.2, look({ bg: 'none' }), { image: clear, popOn: false });
    expect(px(none, 80, 100)[3]).toBe(0);
    const edge = canvasOf(100, 100, (x, y) =>
      x > 30 && x < 70 && y > 30 && y < 70 ? [0, 0, 255, 255] : [230, 10, 10, 255],
    );
    const ext = draw(200, 0.2, look({ bg: 'extend' }), { image: edge, popOn: false });
    expect(px(ext, 100, 100)[3]).toBe(255);
    expect(px(ext, 95, 60)[3]).toBe(255);
    /* 沒有圖片：外框照畫、背景照填 */
    const empty = draw(200, 0.2, look({ bgColor: '#123456' }));
    expect(px(empty, 100, 100)).toEqual([0x12, 0x34, 0x56, 255]);
  });

  it('外光暈畫在外框外面；內光暈與關掉時沒有', () => {
    const at = (l: Look) => px(draw(200, 0.2, l), 100, 100 - 63)[3];
    expect(at(look({ glow: 'outer' }))).toBeGreaterThan(0);
    expect(at(look({ glow: 'all' }))).toBeGreaterThan(0);
    expect(at(look({ glow: 'inner' }))).toBe(0);
    expect(at(look({ glow: 'off' }))).toBe(0);
  });

  it('28 種外框都畫得出來，外框的範圍裡有不透明的像素', () => {
    for (const frame of FRAME_IDS) {
      const img = draw(160, 0, look({ frame, bg: 'none', accentOn: true, width: 14 }));
      let opaque = 0;
      for (let a = 0; a < 360; a += 6) {
        const r = 80 - 0.5;
        const t = (a * Math.PI) / 180;
        for (let k = 0; k <= 11; k++)
          if (px(img, 80 + Math.cos(t) * (r - k), 80 + Math.sin(t) * (r - k))[3] > 128) opaque++;
      }
      if (frame === 'none') expect(opaque).toBe(0);
      else expect(opaque, frame).toBeGreaterThan(10);
    }
  });

  it('質感：每種都產生得出來、同樣的種子相同；疊在外框上', async () => {
    for (const t of TEXTURE_IDS) {
      if (t === 'none') continue;
      const a = texturePixels(t, 3, 32);
      expect(Array.from(a)).toEqual(Array.from(texturePixels(t, 3, 32)));
      expect(Array.from(a)).not.toEqual(Array.from(texturePixels(t, 4, 32)));
    }
    const tex = await ensureTexture('stone', 1);
    expect(tex?.width).toBe(512);
    const withTex = draw(200, 0.2, look({ texture: 'stone', texAmount: 100 }), {
      texture: tex as never,
    });
    const without = draw(200, 0.2, look());
    expect(px(withTex, 100, 43)).not.toEqual(px(without, 100, 43));
    expect(px(withTex, 100, 100)).toEqual(px(without, 100, 100));
  });

  it('匯出的畫布就是選的尺寸', () => {
    for (const N of [256, 280, 400]) {
      const c = renderTokenCanvas(
        { N, pad: 0, look: look(), token: null },
        { image: null, size: null, popMask: null, texture: null },
      );
      expect([c.width, c.height]).toEqual([N, N]);
    }
  });
});
