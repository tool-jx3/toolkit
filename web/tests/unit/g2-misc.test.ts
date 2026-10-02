/**
 * G2 共用層的小模組：圖形路徑、吸附對齊、畫質決定的輸出尺寸、漸層角度與流動、圖片動態與結尾消失演出（純函式）、
 * 編碼選項（WebP 取較小者、GIF 透明判定換算、播放次數上限）、資料量顯示。
 */
import { describe, expect, it } from 'vitest';
import {
  assembleAnimatedWebp,
  GifEncoder,
  gifAlphaThresholdInclusive,
  MAX_PLAYS,
  parseWebp,
  WebpEncoder,
} from '@/core/encode';
import { formatDataSize } from '@/core/files';
import { cssAngleFromRightward, rightwardAngleFromCss, shiftStops } from '@/core/gradient';
import { nearestAspect, qualityOutputSize } from '@/core/image';
import { snapBox, snapTargets } from '@/core/layout';
import {
  bleedScale,
  coverPlacement,
  crossfadeScales,
  fadeLayers,
  overlayAmount,
  sequencePosition,
  vanishLayout,
  vanishState,
  waveOffset,
} from '@/core/motion';
import { pointInPolygon, profileAt, shapePolygon, shapeRadialProfile } from '@/core/shapes';
import { smootherstep } from '@/core/timeline';

import BG_JSON from '../../../docs/refactor/specs/bg-motion.examples.json';
import LM_JSON from '../../../docs/refactor/specs/loading-maker.examples.json';

// biome-ignore lint/suspicious/noExplicitAny: 附件 JSON
const BG = BG_JSON as any;
// biome-ignore lint/suspicious/noExplicitAny: 附件 JSON
const LM = LM_JSON as any;

describe('core/shapes', () => {
  it('星：五角一角朝上、內凹點在外角半徑的 42%', () => {
    const pts = shapePolygon('star', 0, 0, 10);
    expect(pts).toHaveLength(10);
    expect(pts[0].x).toBeCloseTo(0, 9);
    expect(pts[0].y).toBeCloseTo(-10, 9);
    expect(Math.hypot(pts[1].x, pts[1].y)).toBeCloseTo(4.2, 9);
  });
  it('六角形：預設尖角朝上，flatTop 平頂；菱形四角在上下左右', () => {
    expect(shapePolygon('hexagon', 0, 0, 1)[0].y).toBeCloseTo(-1, 9);
    expect(shapePolygon('hexagon', 0, 0, 1, { flatTop: true })[0]).toEqual({ x: 1, y: 0 });
    const d = shapePolygon('diamond', 0, 0, 2);
    expect(d.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([
      [0, -2],
      [2, 0],
      [0, 2],
      [-2, 0],
    ]);
  });
  it('愛心：凹口朝上、外接框半寬＝size、中心在框內', () => {
    const pts = shapePolygon('heart', 0, 0, 1, { segments: 200 });
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(-Math.max(...xs), 6);
    expect(
      Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)),
    ).toBeCloseTo(2, 6);
    expect(pointInPolygon(pts, 0, 0)).toBe(true);
    /* 尖端朝下：最下面的點在中間 */
    const bottom = pts.reduce((m, p) => (p.y > m.y ? p : m));
    expect(Math.abs(bottom.x)).toBeLessThan(0.05);
    /* 凹口朝上：正上方的邊界比兩側的最高點低 */
    expect(profileAt(shapeRadialProfile('heart'), -Math.PI / 2)).toBeLessThan(
      Math.max(...ys.map((y) => -y)),
    );
  });
  it('放射狀輪廓：方形的對角是 √2、星的凹點是 0.42', () => {
    const sq = shapeRadialProfile('square');
    expect(profileAt(sq, 0)).toBeCloseTo(1, 3);
    expect(profileAt(sq, Math.PI / 4)).toBeCloseTo(Math.SQRT2, 3);
    const star = shapeRadialProfile('star');
    expect(profileAt(star, -Math.PI / 2)).toBeCloseTo(1, 3);
    expect(profileAt(star, -Math.PI / 2 + Math.PI / 5)).toBeCloseTo(0.42, 3);
  });
});

describe('吸附對齊（core/layout）', () => {
  const frame = { x: 0, y: 0, width: 640, height: 360 };
  const other = { x: 400, y: 100, width: 100, height: 50 };
  const targets = snapTargets(frame, [other]);
  it('8 px 以內對齊畫布中心或其他物件的邊', () => {
    const r = snapBox({ x: 314, y: 20, width: 20, height: 20 }, targets, 8);
    expect(r.box.x).toBe(310);
    expect(r.guide.x).toBe(320);
    const r2 = snapBox({ x: 505, y: 200, width: 30, height: 30 }, targets, 8);
    expect(r2.box.x).toBe(500);
    expect(r2.guide.x).toBe(500);
    const r3 = snapBox({ x: 100, y: 200, width: 30, height: 30 }, targets, 8);
    expect(r3.guide).toEqual({ x: null, y: null });
  });
  it('吸住後要拉開 release 以上才脫離', () => {
    const held = { x: 320, y: null };
    /* 左緣離 320 有 11 px：沒吸住時不吸（> 8），吸住時不放（< 12） */
    expect(snapBox({ x: 331, y: 200, width: 20, height: 20 }, targets, 8).guide.x).toBeNull();
    expect(snapBox({ x: 331, y: 200, width: 20, height: 20 }, targets, 8, held, 12).guide.x).toBe(
      320,
    );
    expect(
      snapBox({ x: 333, y: 200, width: 20, height: 20 }, targets, 8, held, 12).guide.x,
    ).toBeNull();
  });
});

describe('畫質決定的輸出尺寸（bg-motion 3.2）', () => {
  it('原始尺寸：長寬比最接近的外框、等比縮小不放大；最高畫質不設上限', () => {
    const cases: [number, number, string, number, number][] = [
      [1280, 720, 'minimum', 768, 432],
      [1280, 720, 'high', 1280, 720],
      [640, 360, 'standard', 640, 360],
      [1600, 1200, 'minimum', 640, 480],
      [1600, 1200, 'light', 800, 600],
      [1600, 1200, 'standard', 1024, 768],
      [720, 1280, 'minimum', 360, 640],
      [720, 1280, 'light', 450, 800],
      [720, 1280, 'standard', 576, 1024],
      [2560, 1440, 'standard', 1280, 720],
      [2560, 1440, 'high', 2560, 1440],
    ];
    for (const [w, h, q, ow, oh] of cases) {
      expect(qualityOutputSize(q as 'standard', 'original', { width: w, height: h })).toEqual({
        width: ow,
        height: oh,
      });
    }
    expect(nearestAspect(1240, 900)).toBe('4:3');
    expect(qualityOutputSize('light', '3:2', { width: 10, height: 10 })).toEqual({
      width: 900,
      height: 600,
    });
  });
});

describe('漸層角度與流動（core/gradient）', () => {
  it('「0° 由左到右」與 CSS 角度互換', () => {
    expect(cssAngleFromRightward(0)).toBe(90);
    expect(cssAngleFromRightward(90)).toBe(180);
    expect(cssAngleFromRightward(-90)).toBe(0);
    expect(rightwardAngleFromCss(90)).toBe(0);
    expect(rightwardAngleFromCss(270)).toBe(180);
    expect(rightwardAngleFromCss(0)).toBe(-90);
  });
  it('流動：色標往終點移動、首尾相接處是硬接縫', () => {
    const stops = [
      { offset: 0, color: '#ff0000' },
      { offset: 1, color: '#0000ff' },
    ];
    const s = shiftStops(stops, 0.25);
    expect(s[0].offset).toBe(0);
    const seam = s.filter((x) => x.offset === 0.25);
    expect(seam.map((x) => x.color)).toEqual(['#0000ff', '#ff0000']);
    expect(s.at(-1)?.offset).toBe(1);
    expect(shiftStops(stops, 1)).toEqual(stops);
  });
});

describe('圖片動態（bg-motion 3.4～3.7）', () => {
  it('蓋滿：等比放大到剛好蓋滿、置中（1280 × 720 → 1:1 1024，約 1.42 倍、左右各裁 398）', () => {
    const c = coverPlacement(1280, 720, 1024, 1024);
    expect(c.scale).toBeCloseTo(1024 / 720, 6);
    expect(Math.round(-c.x)).toBe(398);
  });
  it('額外放大是固定像素：輸出越小相對越大', () => {
    expect(bleedScale(1280, 720, 3)).toBeLessThan(bleedScale(640, 360, 3));
    expect(bleedScale(1280, 720, 0)).toBe(1);
  });
  it('疊色從 0.68 起等速（0.75 約 0.22、0.8 約 0.37、0.9 約 0.69）', () => {
    expect(overlayAmount(0.68)).toBe(0);
    expect(overlayAmount(0.75)).toBeCloseTo(0.22, 2);
    expect(overlayAmount(0.8)).toBeCloseTo(0.375, 3);
    expect(overlayAmount(0.9)).toBeCloseTo(0.69, 2);
    expect(overlayAmount(1)).toBe(1);
  });
  it('淡化：附件的圖片／顏色可見度（±0.02），淡入＝時間倒轉', () => {
    for (const row of BG.淡化.E20) {
      const l = fadeLayers(row.t);
      expect(Math.abs(l.image - row.圖片可見度)).toBeLessThanOrEqual(0.02);
    }
    expect(fadeLayers(0.3, true).image).toBeCloseTo(fadeLayers(0.7).image, 9);
  });
  it('轉場：交叉溶接的中央色、擦除前緣、硬切時間（兩張、三張）', () => {
    const A = [200, 60, 60];
    const B = [60, 60, 200];
    const C = [60, 200, 60];
    const imgs = [A, B, C];
    for (const [key, n] of [
      ['兩張', 2],
      ['三張', 3],
    ] as const) {
      for (const row of BG.轉場[key]) {
        const pos = sequencePosition(row.t, n);
        const k = smootherstep(pos.local);
        const from = imgs[pos.from];
        const to = imgs[pos.to];
        /* 黑底：舊圖可見度 1 − k，再疊新圖 k */
        const mix = from.map((v, c) => to[c] * k + v * (1 - k) * (1 - k));
        const want = row.交叉溶接中央色.split(',').map(Number);
        mix.forEach((v, c) => {
          expect(Math.abs(v - want[c]), `${key} t=${row.t}`).toBeLessThanOrEqual(4);
        });
        /* 段的交界（段內 0 或 1）量不到前緣，略過 */
        if (pos.local > 0.02 && pos.local < 0.98)
          expect(Math.abs(k - row.擦除前緣), `${key} t=${row.t}`).toBeLessThanOrEqual(0.012);
        const cut = (k < 0.5 ? from : to).join(',');
        if (Math.abs(pos.local - 0.5) > 0.03) expect(cut).toBe(row.硬切中央色);
      }
    }
    expect(crossfadeScales(0)).toEqual({ from: 1.042, to: 1.03 });
  });
  it('水波：主波＋兩倍波數、三分之一振幅的次波，隨相位流動', () => {
    const o = { amplitude: 20, waves: 3, phase: 0 };
    expect(waveOffset(0, 720, { ...o, harmonic: null })).toBeCloseTo(0, 9);
    expect(waveOffset(60, 720, { ...o, harmonic: null })).toBeCloseTo(20, 6);
    expect(waveOffset(60, 720, o)).not.toBe(waveOffset(60, 720, { ...o, phase: 0.1 }));
  });
});

describe('結尾消失演出（loading-maker 附件「結尾動作」）', () => {
  /** 不透明量＝透明度 × 面積（縮放的平方）；閃光時加上整個畫布 */
  const opacity = (kind: Parameters<typeof vanishState>[0], p: number, I: number) => {
    const s = vanishState(kind, p, 360, { intensity: I });
    return s.alpha * s.scale * s.scale;
  };
  const rows = (key: string) => LM.結尾動作[key] as { p: number; 不透明量: number }[];
  it('平順淡出、旋轉縮小、往上飄走、彈一下後縮小（不透明量 ±0.03）', () => {
    for (const r of rows('平順淡出@1'))
      if (r.p < 0.9)
        expect(Math.abs(opacity('fade', r.p, 1) - r.不透明量)).toBeLessThanOrEqual(0.03);
    for (const r of rows('旋轉縮小@1'))
      expect(Math.abs(opacity('spin', r.p, 1) - r.不透明量)).toBeLessThanOrEqual(0.03);
    for (const r of rows('往上飄走@1'))
      if (r.p < 0.9)
        expect(Math.abs(opacity('float', r.p, 1) - r.不透明量)).toBeLessThanOrEqual(0.03);
    for (const key of ['彈一下後縮小@1', '彈一下後縮小@2'])
      for (const r of rows(key))
        expect(
          Math.abs(opacity('pop', r.p, key.endsWith('2') ? 2 : 1) - r.不透明量),
          `${key} ${r.p}`,
        ).toBeLessThanOrEqual(0.04);
  });
  it('往上飄走：移動約畫布高的 42% × 強度', () => {
    expect(vanishState('float', 0.5, 360).dy).toBeCloseTo(-0.42 * 360 * 0.5, 6);
    expect(vanishState('float', 0.5, 360, { intensity: 2 }).dy).toBeCloseTo(-0.42 * 360, 6);
  });
  it('往上飄走：模糊固定 7 px × S 形 × 強度，不隨畫布大小縮放', () => {
    expect(vanishState('float', 0.5, 360).blur).toBeCloseTo(3.5, 6);
    expect(vanishState('float', 0.5, 720).blur).toBeCloseTo(3.5, 6);
    expect(vanishState('float', 1 - 1e-9, 1080, { intensity: 2 }).blur).toBeCloseTo(14, 4);
  });
  it('閃光爆開：前 30% 閃白光（最亮 0.62）', () => {
    expect(vanishState('burst', 0.15, 360).flash).toBeCloseTo(0.62, 6);
    expect(vanishState('burst', 0.1, 360).flash).toBeCloseTo(0.551, 2);
    expect(vanishState('burst', 0.3, 360).flash).toBe(0);
    /* 整個畫布閃白光時的不透明量（附件 p＝0.1：約 5.07） */
    const s = vanishState('burst', 0.1, 360);
    const canvasRatio = (640 * 360) / (384 * 72);
    const total = s.alpha * s.scale ** 2 * (1 - s.flash) + s.flash * canvasRatio;
    expect(Math.abs(total - 5.078)).toBeLessThan(0.35);
  });
  it('往中央收起：可見寬度＝1 − smoothstep(p)，兩條發光的直線', () => {
    expect(vanishState('close', 0.5, 360).strip).toBeCloseTo(0.5, 6);
    const lay = vanishLayout('close', 0.5, 640, 360);
    expect(lay.particles.map((p) => (p.type === 'glowLine' ? Math.round(p.x) : -1))).toEqual([
      160, 480,
    ]);
  });
  it('碎片飛散：6 × 4 格、每格兩個三角形，越後面越快；同種子相同', () => {
    const a = vanishLayout('shatter', 0.5, 640, 360, { seed: 3 });
    const b = vanishLayout('shatter', 0.5, 640, 360, { seed: 3 });
    expect(a.pieces).toHaveLength(48);
    expect(a.pieces).toEqual(b.pieces);
    const dist = (p: number) => {
      const l = vanishLayout('shatter', p, 640, 360, { seed: 3 });
      return Math.hypot(l.pieces?.[0].dx ?? 0, l.pieces?.[0].dy ?? 0);
    };
    expect(dist(0.8) / dist(0.4)).toBeCloseTo(4, 6);
  });
  it('方塊消融：方塊約短邊的 1/29（至少 7 px），強度越大方塊越小', () => {
    const size = (I: number) => {
      const l = vanishLayout('dissolve', 0, 640, 360, { intensity: I });
      const p = l.pieces?.[0].poly;
      return p ? p[1][0] - p[0][0] : 0;
    };
    expect(size(1)).toBeCloseTo(360 / 29, 6);
    expect(size(2)).toBe(7);
    expect(size(0.5)).toBeCloseTo((360 / 29) * 2, 6);
  });
  it('p ≥ 1 時全空', () => {
    for (const kind of ['fade', 'pop', 'spin', 'burst'] as const)
      expect(vanishState(kind, 1, 360).alpha).toBe(0);
  });
});

describe('編碼選項', () => {
  it('GIF 透明判定：「小於等於 v」換成 alphaThreshold v ＋ 1', async () => {
    expect(gifAlphaThresholdInclusive(96)).toBe(97);
    expect(gifAlphaThresholdInclusive(0)).toBe(1);
    expect(gifAlphaThresholdInclusive(254)).toBe(255);
    const enc = new GifEncoder({
      width: 2,
      height: 1,
      fps: 10,
      alphaThreshold: gifAlphaThresholdInclusive(96),
    });
    await enc.addFrame(new Uint8ClampedArray([10, 10, 10, 96, 10, 10, 10, 97]));
    const { bytes } = await enc.finish();
    const { decodeGif } = await import('@/core/decode');
    const px = decodeGif(bytes).frames[0].rgba;
    expect(px[3]).toBe(0);
    expect(px[7]).toBe(255);
  });

  it('播放次數可到 65535（WebP 的循環欄位、GIF 的 NETSCAPE）', async () => {
    expect(MAX_PLAYS).toBe(65535);
    const webp = assembleAnimatedWebp({
      width: 2,
      height: 2,
      loops: MAX_PLAYS,
      hasAlpha: false,
      frames: [
        {
          x: 0,
          y: 0,
          w: 2,
          h: 2,
          durationMs: 100,
          bitstream: new Uint8Array([0x56, 0x50, 0x38, 0x4c, 1, 0, 0, 0, 0, 0]),
        },
      ],
    });
    const anim = parseWebp(webp).find((c) => c.fourcc === 'ANIM');
    expect(anim ? anim.data[4] | (anim.data[5] << 8) : -1).toBe(65535);
    const enc = new GifEncoder({ width: 1, height: 1, fps: 10, plays: MAX_PLAYS });
    await enc.addFrame(new Uint8ClampedArray([1, 2, 3, 255]));
    const { decodeGif } = await import('@/core/decode');
    expect(decodeGif((await enc.finish()).bytes).loops).toBe(65535);
  });

  it('WebP pickSmaller：每格比較無損與有損，取較小者', async () => {
    const sizes: number[] = [];
    /* 假的編碼器：品質 1 回傳 5 位元組、其他回傳 9 位元組的 VP8L（無損較小） */
    const encodeImage = async (_px: Uint8ClampedArray, _w: number, _h: number, q: number) => {
      const n = q === 1 ? 5 : 9;
      sizes.push(n);
      const body = new Uint8Array(n);
      const chunk = new Uint8Array(8 + n + (n & 1));
      chunk.set([0x56, 0x50, 0x38, 0x4c]);
      new DataView(chunk.buffer).setUint32(4, n, true);
      chunk.set(body, 8);
      const out = new Uint8Array(12 + chunk.length);
      out.set([0x52, 0x49, 0x46, 0x46]);
      new DataView(out.buffer).setUint32(4, 4 + chunk.length, true);
      out.set([0x57, 0x45, 0x42, 0x50], 8);
      out.set(chunk, 12);
      return out;
    };
    const run = async (pickSmaller: boolean) => {
      const enc = new WebpEncoder({
        width: 2,
        height: 2,
        fps: 10,
        quality: 0.9,
        pickSmaller,
        encodeImage,
      });
      await enc.addFrame(new Uint8ClampedArray(16).fill(200));
      return (await enc.finish()).bytes.length;
    };
    const plain = await run(false);
    const picked = await run(true);
    expect(picked).toBeLessThan(plain);
    expect(sizes).toEqual([9, 9, 5]);
  });

  it('資料量顯示', () => {
    expect(formatDataSize(512)).toBe('512 B');
    expect(formatDataSize(43_000_000)).toBe('41.0 MB');
    expect(formatDataSize(3 * 1024 ** 3)).toBe('3.00 GB');
  });
});
