/**
 * VTT 棋子產生器的繪製（node-canvas 真的畫出來量像素）：四角透明、開口裡的背景、外框的位置、
 * 出框合成（遮罩裡、外框外面的圖片蓋在最上面；遮罩裡被外框蓋住的部分還原成圖片；遮罩外的照舊被外框蓋住）、
 * 光暈、28 種外框與 6 種質感都畫得出來、匯出尺寸。
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { makeCanvas } from '../../src/core/image';
import {
  type Adjust,
  DEFAULT_FX,
  DEFAULT_LOOK,
  defaultAdjust,
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
    customFrame?: ReturnType<typeof canvasOf> | null;
    customMask?: ReturnType<typeof canvasOf> | null;
    name?: string;
    badge?: string;
    adjust?: Adjust;
    override?: string | null;
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
      token: {
        id: 't1',
        view: { x: 0, y: 0, zoom: 1, rotate: 0, flip: false },
        popOn: opts.popOn ?? true,
        name: opts.name ?? '',
        badge: opts.badge ?? '',
        adjust: opts.adjust ?? defaultAdjust(),
      },
      cacheFrame: false,
      badge: opts.override,
    },
    {
      image,
      size: image ? { width: image.width, height: image.height } : null,
      popMask: opts.mask ?? null,
      texture: opts.texture ?? null,
      customFrame: opts.customFrame ?? null,
      customFrameId: opts.customFrame ? 'cf' : null,
      customMask: opts.customMask ?? null,
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

  /* ---------- 第二批 ---------- */

  it('自訂外框：依主色上色（白 × 主色），開口半徑照設定', () => {
    /* 白色的環（外框圖的 0.8～1 倍半徑），其他透明 */
    const frame = canvasOf(100, 100, (x, y) => {
      const d = Math.hypot(x + 0.5 - 50, y + 0.5 - 50);
      return d > 40 && d < 50 ? [255, 255, 255, 255] : [0, 0, 0, 0];
    });
    const l = look({ frame: 'custom', color: '#00ff00', customInner: 80 });
    const img = draw(200, 0.2, l, { image: red(), customFrame: frame, popOn: false });
    /* 環上（離中心 0.9 R）：綠色 */
    const ring = px(img, 100, 100 - 54);
    expect(ring[1]).toBeGreaterThan(200);
    expect(ring[0]).toBeLessThan(40);
    /* 開口在 0.8 R 以內：圖片；0.85 R 的地方被切掉（環的圖在那裡也有，但會被外框蓋住） */
    expect(isRed(px(img, 100, 100 - 40))).toBe(true);
    expect(cutoutRadius(l, geom(200, 0.2))).toBeCloseTo(48);
  });

  it('自訂遮罩：開口變成遮罩的形狀（白＝留下）', () => {
    /* 左半白、右半黑（已經轉成不透明度的遮罩：左半不透明） */
    const mask = canvasOf(100, 100, (x) => (x < 50 ? [0, 0, 0, 255] : [0, 0, 0, 0]));
    const img = draw(200, 0.2, look({ frame: 'none', bg: 'none' }), {
      image: red(),
      customMask: mask,
      popOn: false,
    });
    expect(isRed(px(img, 80, 100))).toBe(true);
    expect(px(img, 120, 100)[3]).toBe(0);
  });

  it('名字牌與徽章：打開時畫在設定的位置；編號組的徽章不管開關', () => {
    const base = draw(200, 0.2, look({ labelOn: false, badgeOn: false }), {
      image: red(),
      name: 'ORC',
      badge: '7',
    });
    /* 徽章在 (0.74, 0.74) R＝(144.4, 144.4) */
    const withBadge = draw(
      200,
      0.2,
      look({ badgeOn: true, badgeFrom: 'custom', badgeColor: '#0000ff' }),
      {
        image: red(),
        badge: '7',
      },
    );
    const b = px(withBadge, 144 - 8, 144);
    expect(b[2]).toBeGreaterThan(200);
    expect(px(base, 136, 144)).not.toEqual(b);
    /* 編號組：徽章關掉也畫 */
    const forced = draw(
      200,
      0.2,
      look({ badgeOn: false, badgeFrom: 'custom', badgeColor: '#0000ff' }),
      {
        image: red(),
        override: '3',
      },
    );
    expect(px(forced, 136, 144)[2]).toBeGreaterThan(200);
    /* 名字牌在 (0, 0.8) R＝(100, 148)，底色是外框色（金） */
    const named = draw(200, 0.2, look({ labelOn: true }), { image: red(), name: 'ORC' });
    expect(isRed(px(named, 100, 148))).toBe(false);
    expect(isRed(px(base, 100, 148))).toBe(true);
  });

  it('色彩調整只動圖片；暗角讓開口的邊緣變暗', () => {
    const dim = draw(200, 0.2, look({ bg: 'none' }), {
      image: red(),
      popOn: false,
      adjust: { ...defaultAdjust(), bright: 50 },
    });
    expect(px(dim, 100, 100)[0]).toBeLessThan(130);
    expect(isGoldish(px(dim, 100, 43))).toBe(true);
    const vig = draw(
      200,
      0.2,
      look({ bg: 'none', fx: { ...DEFAULT_FX, on: true, vig: true, vigAmt: 100 } }),
      {
        image: red(),
        popOn: false,
      },
    );
    /* 總開關關掉：沒有暗角 */
    const off = draw(
      200,
      0.2,
      look({ bg: 'none', fx: { ...DEFAULT_FX, on: false, vig: true, vigAmt: 100 } }),
      {
        image: red(),
        popOn: false,
      },
    );
    expect(px(vig, 100, 52)[0]).toBeLessThan(px(off, 100, 52)[0] - 20);
    expect(Math.abs(px(vig, 100, 100)[0] - px(off, 100, 100)[0])).toBeLessThan(15);
  });

  it('自訂外框不套質感（光照也不套）', () => {
    const frame = canvasOf(100, 100, (x, y) => {
      const d = Math.hypot(x + 0.5 - 50, y + 0.5 - 50);
      return d > 40 && d < 50 ? [255, 255, 255, 255] : [0, 0, 0, 0];
    });
    const tex = canvasOf(64, 64, (x) => (x % 8 < 4 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    const base = look({ frame: 'custom', color: '#d9a521', customInner: 80 });
    const plain = draw(200, 0.2, base, { customFrame: frame, popOn: false });
    const textured = draw(
      200,
      0.2,
      { ...base, texture: 'stone', texAmount: 100 },
      {
        customFrame: frame,
        popOn: false,
        texture: tex,
      },
    );
    for (const [x, y] of [
      [100, 46],
      [154, 100],
      [62, 62],
    ])
      expect(px(textured, x, y)).toEqual(px(plain, x, y));
  });

  it('霓虹色調一律用第二色（配色細節關掉也一樣）', () => {
    const fx = { ...DEFAULT_FX, on: true, tone: 'neon' as const, toneMix: 100 };
    const white = () => canvasOf(200, 200, () => [255, 255, 255, 255]);
    const on = draw(
      200,
      0.2,
      look({ frame: 'ring', accentOn: true, accent: '#ff0000', color: '#0000ff', fx }),
      {
        image: white(),
        popOn: false,
      },
    );
    const off = draw(
      200,
      0.2,
      look({ frame: 'ring', accentOn: false, accent: '#ff0000', color: '#0000ff', fx }),
      {
        image: white(),
        popOn: false,
      },
    );
    /* 白色＝最亮 → 第二色（紅） */
    expect(px(on, 100, 100)[0]).toBeGreaterThan(200);
    expect(px(off, 100, 100)).toEqual(px(on, 100, 100));
  });
});
