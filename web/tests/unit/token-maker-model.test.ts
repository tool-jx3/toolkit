/**
 * VTT 棋子產生器：外框的幾何（外半徑、開口半徑、邊距）、擺放的座標換算、自動邊距、尺寸與檔名、讀檔時的整理、
 * 遮罩的計算（魔術棒、反轉、擴大縮小、讀入遮罩圖、自動選出主體、邊界）。規格 docs/refactor/specs/token-maker.md。
 */
import { describe, expect, it } from 'vitest';
import { FRAMES, frameDefaults } from '../../src/tools/token-maker/frames';
import {
  applyRegion,
  autoSubject,
  emptyMask,
  hasTransparency,
  invertMask,
  maskBoundary,
  maskFromAlpha,
  maskFromImage,
  maskSizeFor,
  morphMask,
  type Rgba,
  resampleMask,
  selectedRatio,
  wandRegion,
} from '../../src/tools/token-maker/mask';
import {
  autoPad,
  DEFAULT_LOOK,
  FRAME_IDS,
  flipView,
  geom,
  imageToToken,
  imageTransform,
  type Look,
  normalizeState,
  SIZE_PRESETS,
  sharpSize,
  tokenBaseName,
  tokenFileName,
  tokenToImage,
  zoomViewAt,
} from '../../src/tools/token-maker/model';
import { bandWidth, cutoutRadius } from '../../src/tools/token-maker/render';

const look = (patch: Partial<Look> = {}): Look => ({ ...DEFAULT_LOOK, ...patch });
const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('外框的幾何', () => {
  it('外半徑＝N ×（0.5 − 邊距），邊距夾在 0～0.45', () => {
    expect(geom(512, 0).R).toBe(256);
    expect(geom(512, 0.08).R).toBeCloseTo(512 * 0.42);
    expect(geom(400, 0.9).R).toBeCloseTo(400 * 0.05);
    expect(geom(400, -1).R).toBe(200);
  });

  it('外框寬＝R × 寬度 %；開口半徑：浮雕環在內緣往外 0.3 個外框寬、霓虹在外框中間、雙環偏外、無外框就是外緣', () => {
    const g = geom(1000, 0);
    const w = bandWidth(look({ width: 10 }), g.R);
    expect(w).toBe(50);
    close(cutoutRadius(look({ frame: 'plain', width: 10 }), g), 500 - 0.7 * 50);
    close(cutoutRadius(look({ frame: 'gear', width: 10 }), g), 500 - 35);
    close(cutoutRadius(look({ frame: 'ring', width: 10 }), g), 500 - 25);
    close(cutoutRadius(look({ frame: 'double', width: 10 }), g), 500 - 7.5);
    close(cutoutRadius(look({ frame: 'none', width: 10 }), g), 500);
  });

  it('28 種外框：浮雕環 16、霓虹與幾何 12；換外框時參數回到那個樣式的預設', () => {
    expect(FRAME_IDS.length).toBe(28);
    expect(FRAME_IDS.filter((id) => FRAMES[id].group === 'relief').length).toBe(16);
    expect(frameDefaults('gear')).toEqual({ count: 24, depth: 55, lineW: 10 });
    expect(frameDefaults('moire')).toEqual({ count: 9, depth: 50, lineW: 6 });
    expect(frameDefaults('tally')).toEqual({ count: 40, depth: 70, lineW: 10 });
    expect(frameDefaults('plain').count).toBe(1);
    for (const id of FRAME_IDS) {
      const f = FRAMES[id];
      if (f.count) expect(f.count.def).toBeGreaterThanOrEqual(f.count.min);
      if (f.count) expect(f.count.def).toBeLessThanOrEqual(f.count.max);
    }
  });
});

describe('擺放', () => {
  const size = { width: 600, height: 800 };
  it('縮放 1：圖片的短邊＝外框直徑；位移以 R 為單位', () => {
    const g = geom(1000, 0.1);
    const t = imageTransform(g, size, { x: 0.5, y: -0.25, zoom: 1, rotate: 0, flip: false });
    close(t.scale * 600, 2 * g.R);
    close(t.tx, 500 + 0.5 * g.R);
    close(t.ty, 500 - 0.25 * g.R);
  });

  it('棋子 ↔ 圖片的座標換算互為反函式（含旋轉、鏡像）', () => {
    const g = geom(512, 0.05);
    for (const flip of [false, true]) {
      const t = imageTransform(g, size, { x: 0.2, y: 0.1, zoom: 1.7, rotate: 33, flip });
      const p = imageToToken(t, size, 123, 456);
      const back = tokenToImage(t, size, p.x, p.y);
      close(back.u, 123, 1e-6);
      close(back.v, 456, 1e-6);
    }
  });

  it('以一點為中心縮放：那一點下的圖片不動', () => {
    const g = geom(1000, 0);
    const v = { x: 0.1, y: -0.2, zoom: 1, rotate: 0, flip: false };
    const ax = 0.4;
    const ay = 0.3;
    const before = tokenToImage(imageTransform(g, size, v), size, 500 + ax * g.R, 500 + ay * g.R);
    const z = zoomViewAt(v, 2.5, ax, ay);
    const after = tokenToImage(imageTransform(g, size, z), size, 500 + ax * g.R, 500 + ay * g.R);
    close(before.u, after.u, 1e-6);
    close(before.v, after.v, 1e-6);
    expect(zoomViewAt(v, 100, 0, 0).zoom).toBe(8);
    expect(zoomViewAt(v, 0.01, 0, 0).zoom).toBe(0.1);
  });

  it('鏡像以棋子的中線翻：位移 x 與旋轉反過來', () => {
    expect(flipView({ x: 0.3, y: 0.2, zoom: 1.2, rotate: 20, flip: false })).toEqual({
      x: -0.3,
      y: 0.2,
      zoom: 1.2,
      rotate: -20,
      flip: true,
    });
  });
});

describe('自動邊距', () => {
  const size = { width: 200, height: 200 };
  const v = { x: 0, y: 0, zoom: 1, rotate: 0, flip: false };
  it('沒有出框：0（外框撐滿）；外光暈留一點', () => {
    expect(autoPad(null, size, v, look())).toBe(0);
    close(autoPad(null, size, v, look({ glow: 'outer' })), 0.5 - 0.5 / 1.06);
    expect(autoPad(null, size, v, look({ glow: 'inner' }))).toBe(0);
  });

  it('出框的最遠點在 1.5 R：邊距剛好讓它不被切掉（＋0.5% 的餘裕）', () => {
    /* 圖片 200 px、縮放 1：100 px＝1 R；最遠的點在中心上方 150 px＝1.5 R */
    const b = Float32Array.from([0, -150, 0, 50]);
    const pad = autoPad(b, size, v, look({ feather: 0 }));
    close(pad, 0.5 - 0.5 / (1.5 * 1.005));
    /* 外框的 R＝N(0.5 − pad)；最遠點離中心 1.5R ≤ N／2 */
    const N = 1000;
    expect(1.5 * geom(N, pad).R).toBeLessThanOrEqual(N / 2);
    /* 柔邊、陰影再多留一點 */
    expect(autoPad(b, size, v, look({ feather: 4 }))).toBeGreaterThan(pad);
    expect(autoPad(b, size, v, look({ feather: 0, shadow: 100 }))).toBeGreaterThan(pad);
    /* 跟著擺放：往下移 0.5 R，最遠點變成 1.0 R → 不必留邊 */
    expect(autoPad(b, size, { ...v, y: 0.5 }, look({ feather: 0 }))).toBe(0);
    /* 最多 45% */
    expect(autoPad(Float32Array.from([0, -100000]), size, v, look())).toBe(0.45);
  });
});

describe('匯出的尺寸與檔名', () => {
  it('尺寸預設照原作：256、280（Roll20）、400（Foundry）、512、1024、2048', () => {
    expect([...SIZE_PRESETS]).toEqual([256, 280, 400, 512, 1024, 2048]);
  });

  it('清楚的上限：圖片短邊 ÷ 縮放 ÷ 外框直徑佔整張的比例', () => {
    expect(sharpSize({ width: 600, height: 800 }, 1, 0)).toBe(600);
    expect(sharpSize({ width: 600, height: 800 }, 2, 0)).toBe(300);
    expect(sharpSize({ width: 600, height: 800 }, 1, 0.25)).toBe(1200);
  });

  it('檔名：名稱 → 圖片檔名 → 「棋子」，接尺寸；不能用的字元拿掉', () => {
    const img = { id: 'a', name: 'hero.final.png', width: 1, height: 1 };
    expect(tokenBaseName({ name: '', image: img })).toBe('hero.final');
    expect(tokenBaseName({ name: ' 哥布林 ', image: img })).toBe('哥布林');
    expect(tokenBaseName({ name: '', image: null })).toBe('棋子');
    expect(tokenFileName({ name: '哥布林', image: img }, 280, 'png')).toBe('哥布林_280.png');
    expect(tokenFileName({ name: 'a/b:c', image: img }, 400, 'webp')).toBe('a_b_c_400.webp');
    expect(tokenFileName({ name: '', image: null }, 512, 'png')).toBe('棋子_512.png');
  });
});

describe('讀檔時的整理', () => {
  it('壞掉的欄位補成預設、夾在範圍內；沒有圖片的棋子不留遮罩；目前的棋子要存在', () => {
    const s = normalizeState({
      look: { frame: 'nope', width: 999, color: 'F00', glow: 'outer', texture: 'wood' },
      tokens: [
        {
          id: 't1',
          image: { id: 'x', name: 'a.png', width: 10, height: 20 },
          mask: { id: 'm', width: 5, height: 10 },
          view: { zoom: 99 },
        },
        { id: 't1', image: null, mask: { id: 'm', width: 5, height: 10 } },
        'junk',
      ],
      current: 'zzz',
    });
    expect(s.look.frame).toBe('plain');
    expect(s.look.width).toBe(30);
    expect(s.look.color).toBe('#ff0000');
    expect(s.look.glow).toBe('outer');
    expect(s.look.texture).toBe('wood');
    expect(s.tokens.length).toBe(2);
    expect(s.tokens[0].view.zoom).toBe(8);
    expect(s.tokens[1].id).not.toBe('t1');
    expect(s.tokens[1].mask).toBeNull();
    expect(s.current).toBe('t1');
    expect(normalizeState(null).tokens).toEqual([]);
  });
});

/* ---------- 遮罩 ---------- */

/** w × h 的 RGBA：fn(x, y) 回傳 [r, g, b, a] */
function rgba(w: number, h: number, fn: (x: number, y: number) => number[]): Rgba {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(fn(x, y), (y * w + x) * 4);
  return { width: w, height: h, data };
}

describe('遮罩', () => {
  it('遮罩的大小：同比例、長邊最多 1024', () => {
    expect(maskSizeFor({ width: 2048, height: 1024 })).toEqual({ width: 1024, height: 512 });
    expect(maskSizeFor({ width: 300, height: 500 })).toEqual({ width: 300, height: 500 });
  });

  it('魔術棒：點一下選同色相連的範圍；不相連時整張同色的都選；加入／去掉', () => {
    /* 左半紅、右半藍，右下角一塊紅（不相連） */
    const img = rgba(20, 10, (x, y) =>
      x < 10 || (x >= 17 && y >= 7) ? [220, 20, 20, 255] : [20, 20, 220, 255],
    );
    const r1 = wandRegion(img, 2, 2, 18, true);
    expect(r1.count).toBe(100);
    const r2 = wandRegion(img, 2, 2, 18, false);
    expect(r2.count).toBe(109);
    const base = emptyMask(20, 10);
    const { mask, changed } = applyRegion(base, r1.region, 'add');
    expect(changed).toBe(100);
    expect(selectedRatio(mask)).toBeCloseTo(0.5);
    const sub = applyRegion(mask, wandRegion(img, 1, 1, 18, true).region, 'sub');
    expect(selectedRatio(sub.mask)).toBe(0);
    /* 已經選了的再加一次：沒有改到 */
    expect(applyRegion(mask, r1.region, 'add').changed).toBe(0);
  });

  it('反轉只選圖片看得到的地方；擴大、縮小 2 px', () => {
    const img = rgba(10, 10, (x) => (x < 5 ? [0, 0, 0, 255] : [0, 0, 0, 0]));
    const m = emptyMask(10, 10);
    m.data[0] = 255;
    const inv = invertMask(m, img);
    expect(inv.data[0]).toBe(0);
    expect(inv.data[1]).toBe(255);
    expect(inv.data[9]).toBe(0);
    const dot = emptyMask(11, 11);
    dot.data[5 * 11 + 5] = 255;
    const grown = morphMask(dot, true);
    expect(selectedRatio(grown) * 121).toBeGreaterThan(9);
    expect(selectedRatio(morphMask(grown, false))).toBeLessThan(selectedRatio(grown));
  });

  it('讀入遮罩圖：有透明的用透明度，否則用亮度（白＝出框）', () => {
    const alpha = rgba(2, 1, (x) => (x ? [0, 0, 0, 200] : [255, 255, 255, 0]));
    expect(Array.from(maskFromImage(alpha).data)).toEqual([0, 200]);
    const gray = rgba(2, 1, (x) => (x ? [255, 255, 255, 255] : [0, 0, 0, 255]));
    expect(Array.from(maskFromImage(gray).data)).toEqual([0, 255]);
  });

  it('自動：透明背景用透明度；不透明的圖找出背景以外的主體；全是背景時找不到', () => {
    const cut = rgba(40, 40, (x, y) =>
      (x - 20) ** 2 + (y - 20) ** 2 < 100 ? [200, 50, 50, 255] : [0, 0, 0, 0],
    );
    expect(hasTransparency(cut)).toBe(true);
    expect(maskFromAlpha(cut).data[20 * 40 + 20]).toBe(255);
    const photo = rgba(80, 80, (x, y) =>
      (x - 40) ** 2 + (y - 45) ** 2 < 400 ? [220, 60, 40, 255] : [200, 220, 240, 255],
    );
    expect(hasTransparency(photo)).toBe(false);
    const m = autoSubject(photo);
    expect(m).not.toBeNull();
    expect(m?.data[45 * 80 + 40]).toBe(255);
    expect(m?.data[2 * 80 + 2]).toBe(0);
    const ratio = selectedRatio(m);
    expect(ratio).toBeGreaterThan(0.15);
    expect(ratio).toBeLessThan(0.25);
    expect(autoSubject(rgba(50, 50, () => [100, 100, 100, 255]))).toBeNull();
  });

  it('邊界點：選取中、看得到、旁邊有不是的像素；換成圖片 px、以圖片中心為原點', () => {
    const m = emptyMask(4, 4);
    for (const i of [5, 6, 9, 10]) m.data[i] = 255;
    const b = maskBoundary(m, null, { width: 8, height: 8 });
    expect(b.length).toBe(8);
    expect(Array.from(b.slice(0, 2))).toEqual([-1, -1]);
    expect(resampleMask(m, 8, 8).data[2 * 8 + 2]).toBe(255);
  });
});
