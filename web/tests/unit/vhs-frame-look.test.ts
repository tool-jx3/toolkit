/**
 * 錄影帶畫面產生器 2026-11-10 加的功能（規格 1.11～1.17、3.13～3.17）：
 * 映像管的螢光粉遮罩與光暈（圖樣、亮度補償、像素）、數位攝影（DCT 量化、色度次取樣、關鍵影格、資料遺失、datamosh）、
 * Screen Loop（姿勢、無縫循環、層數）、樣子（預設集）、資料版本 3（第 2 版照讀、整理）。
 * 「沒用新功能時輸出不變」由 vhs-frame-golden.test.ts 守住（它的 initialState() 已經含新的欄位〔預設全關〕）；
 * NTSC 訊號和 ntsc-rs 的對照在 vhs-frame-ntsc.test.ts。像素的測試用 node-canvas（沒有時跳過）。
 */
import { describe, expect, it, vi } from 'vitest';
import { boostOf, maskMean, maskPitch, maskTile } from '@/tools/vhs-frame/crt';
import {
  codecSettings,
  DigitalCodec,
  digitalFrameAt,
  fromPlanes,
  keyframeKept,
  type Planes,
  quantTable,
  toPlanes,
} from '@/tools/vhs-frame/digital';
import {
  DIGITAL_PRESETS,
  type Digital,
  defaultDigital,
  defaultLook2611,
  defaultNtsc,
  look2611Active,
  ntscParams,
} from '@/tools/vhs-frame/look';
import { driftTint, loopPose } from '@/tools/vhs-frame/loop';
import { initialState, normalizeState, type VhsState } from '@/tools/vhs-frame/model';
import { applyLookPreset, LOOK_PRESET_IDS, matchingPreset } from '@/tools/vhs-frame/presets';
import { nodeCanvas } from '../helpers/nodeCanvas';

const nc = await nodeCanvas();

/* ---------- 資料 ---------- */

describe('資料版本 3', () => {
  it('預設全關；第 2 版的資料（沒有新的欄位）讀成預設', () => {
    const d = initialState();
    expect({ crt: d.crt, digital: d.digital, ntsc: d.ntsc, loop: d.loop }).toEqual(
      defaultLook2611(),
    );
    expect(look2611Active(d)).toBe(false);
    const { crt: _c, digital: _d, ntsc: _n, loop: _l, ...v2 } = { ...d, wear: 70 };
    const s = normalizeState(v2);
    expect(s.wear).toBe(70);
    expect(look2611Active(s)).toBe(false);
    expect(s.crt).toEqual(d.crt);
  });

  it('整理：超出範圍的夾回並取整、不認得的用預設', () => {
    const s = normalizeState({
      ...initialState(),
      crt: { mask: 'laser', maskStrength: 500, maskSize: 2.6, maskBoost: 'yes', glow: -3 },
      digital: { on: true, format: 'vhs', width: 99999, quality: 0, keyframe: 7.4, mosh: 'x' },
      ntsc: { on: true, tape: 'ep', bleed: -99, snow: 50.5, tracking: false },
      loop: { on: true, depth: 99, zoom: 10, cx: 80, seamless: 0 },
    });
    expect(s.crt).toMatchObject({
      mask: 'none',
      maskStrength: 100,
      maskSize: 3,
      maskBoost: true,
      glow: 0,
    });
    expect(s.digital).toMatchObject({
      on: true,
      format: 'webcam',
      width: 720,
      quality: 1,
      keyframe: 7,
      mosh: 0,
    });
    expect(s.ntsc).toMatchObject({ on: true, tape: 'ep', bleed: -20, snow: 51, tracking: false });
    expect(s.loop).toMatchObject({ on: true, depth: 10, zoom: 40, cx: 45, seamless: true });
  });

  it('存了再讀回來逐欄位相同', () => {
    const d = initialState();
    applyLookPreset(d, 'webcam');
    d.loop = { ...d.loop, on: true, cx: 7, cy: -3, roll: 12 };
    expect(normalizeState(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });

  it('介面的 NTSC 值 → ntsc-rs 的設定（預設＝ntsc-rs 的預設；關掉的那一步是 null）', () => {
    const p = ntscParams(defaultNtsc());
    expect(p.lumaSmear).toBe(0.5);
    expect(p.compositeNoise?.intensity).toBe(0.05);
    expect(p.vhs?.tape).toBe('lp');
    expect(p.vhs?.edgeWave?.intensity).toBe(0.5);
    const off = ntscParams({
      ...defaultNtsc(),
      noise: 0,
      wave: 0,
      headSwitch: false,
      tracking: false,
      ringing: false,
    });
    expect([
      off.compositeNoise,
      off.vhs?.edgeWave,
      off.headSwitching,
      off.trackingNoise,
      off.ringing,
    ]).toEqual([null, null, null, null, null]);
  });
});

describe('樣子', () => {
  it('套用後認得出來；「原本的錄影帶」＝新功能全關', () => {
    for (const id of LOOK_PRESET_IDS) {
      const d = initialState();
      applyLookPreset(d, id);
      expect(matchingPreset(d)).toBe(id);
    }
    const d = initialState();
    expect(matchingPreset(d)).toBe('plain');
    applyLookPreset(d, 'loop');
    applyLookPreset(d, 'plain');
    expect(look2611Active(d)).toBe(false);
    expect(d.wear).toBe(initialState().wear);
  });

  it('樣子不改照片、文字、色調與動畫', () => {
    const d: VhsState = { ...initialState(), caption: '字幕', osd: 'CAM 01' };
    d.picture.tone = 'night';
    applyLookPreset(d, 'ntsc');
    expect([d.caption, d.osd, d.picture.tone, d.anim]).toEqual([
      '字幕',
      'CAM 01',
      'night',
      initialState().anim,
    ]);
  });
});

/* ---------- 映像管 ---------- */

describe('螢光粉遮罩', () => {
  it('光柵：每一欄亮紅、綠、藍其中一色，其他暗 strength；平均與補償', () => {
    const t = maskTile('aperture', 3, 0.5);
    expect([t.w, t.h]).toEqual([3, 1]);
    expect(Array.from(t.rgb)).toEqual([1, 0.5, 0.5, 0.5, 1, 0.5, 0.5, 0.5, 1]);
    expect(maskMean(t)).toBeCloseTo(2 / 3, 6);
    expect(boostOf(t)).toBeCloseTo(0.5, 6);
  });

  it('槽孔：兩組一個圖樣，第二組的縫錯開半格；點狀：下半段錯開半組', () => {
    const t = maskTile('slot', 4, 1);
    const c = Math.max(3, Math.round(4 * 1.5));
    expect([t.w, t.h]).toEqual([8, c * 2]);
    const lit = (x: number, y: number) =>
      Math.max(...t.rgb.slice((y * t.w + x) * 3, (y * t.w + x) * 3 + 3));
    expect(lit(0, c - 1)).toBe(0);
    expect(lit(4, c - 1)).toBe(1);
    expect(lit(4, c - 1 - Math.floor(c / 2))).toBe(0);
    const s = maskTile('shadow', 3, 1);
    const ch = (x: number, y: number) =>
      [0, 1, 2].findIndex((k) => s.rgb[(y * s.w + x) * 3 + k] === 1);
    expect([ch(0, 0), ch(1, 0), ch(2, 0)]).toEqual([0, 1, 2]);
    expect([ch(0, 1), ch(1, 1), ch(2, 1)]).toEqual([2, 0, 1]);
  });

  it('一組的寬依輸出的大小、至少 3 px', () => {
    expect(maskPitch(3, 1)).toBe(3);
    expect(maskPitch(3, 360 / 1280)).toBe(3);
    expect(maskPitch(4, 1.5)).toBe(6);
  });
});

/* ---------- 數位攝影 ---------- */

/** 測試圖：左右的漸層＋一塊紅色＋細的直條紋（64 × 48） */
function testRgb(w = 64, h = 48): Float32Array {
  const rgb = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      const red = x >= 8 && x < 24 && y >= 8 && y < 24;
      const stripe = y >= 32 && x % 2 === 0;
      rgb[o] = red ? 0.9 : stripe ? 0.95 : x / w;
      rgb[o + 1] = red ? 0.1 : stripe ? 0.95 : 0.4;
      rgb[o + 2] = red ? 0.1 : stripe ? 0.95 : y / h;
    }
  return rgb;
}

const maxDiff = (a: Float32Array, b: Float32Array) => {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
};
const meanDiff = (a: Float32Array, b: Float32Array) => {
  let m = 0;
  for (let i = 0; i < a.length; i++) m += Math.abs(a[i] - b[i]);
  return m / a.length;
};

const digital = (patch: Partial<Digital>): Digital => ({
  ...defaultDigital(),
  ...DIGITAL_PRESETS.web,
  on: true,
  ...patch,
});

describe('數位攝影：區塊壓縮', () => {
  it('量化表：品質 50＝JPEG 標準表，100＝全部 1，越低越粗', () => {
    const base = [16, 11, 10, 16];
    expect(Array.from(quantTable(base, 50))).toEqual(base);
    expect(Array.from(quantTable(base, 100))).toEqual([1, 1, 1, 1]);
    expect(quantTable(base, 10)[0]).toBe(80);
  });

  it('色度次取樣：平面的大小、4:4:4 往返幾乎不變', () => {
    const rgb = testRgb();
    expect([toPlanes(rgb, 64, 48, 2).cw, toPlanes(rgb, 64, 48, 2).ch]).toEqual([32, 24]);
    expect([toPlanes(rgb, 64, 48, 3).cw, toPlanes(rgb, 64, 48, 3).ch]).toEqual([16, 48]);
    const p = toPlanes(rgb, 64, 48, 0);
    const out = new Uint8ClampedArray(64 * 48 * 4);
    fromPlanes(p, 64, 48, out);
    let max = 0;
    for (let i = 0; i < 64 * 48; i++)
      for (let c = 0; c < 3; c++)
        max = Math.max(max, Math.abs(out[i * 4 + c] - rgb[i * 3 + c] * 255));
    expect(max).toBeLessThanOrEqual(1);
  });

  it('畫質越低誤差越大；8 × 8 的方塊（品質很低時區塊裡幾乎是平的）', () => {
    const base = toPlanes(testRgb(), 64, 48, 0);
    const err = (q: number) =>
      meanDiff(
        new DigitalCodec(base, codecSettings(digital({ quality: q, keyframe: 0 }))).decode(0).y,
        base.y,
      );
    expect(err(95)).toBeLessThan(err(40));
    expect(err(40)).toBeLessThan(err(5));
    /* 品質 1：每個 8 × 8 只剩直流（區塊裡的值都一樣） */
    const y = new DigitalCodec(base, codecSettings(digital({ quality: 1, keyframe: 0 }))).decode(
      0,
    ).y;
    const block = (bx: number, by: number) =>
      Array.from({ length: 64 }, (_, k) => y[(by + Math.floor(k / 8)) * base.w + bx + (k % 8)]);
    const b = block(0, 0);
    expect(Math.max(...b) - Math.min(...b)).toBeLessThan(1e-3);
  });

  it('關鍵影格之間越來越細，下一個關鍵影格又變粗；依序算與跳著算結果相同', () => {
    const base = toPlanes(testRgb(), 64, 48, 2);
    const d = digital({ quality: 20, keyframe: 10, fps: 10 });
    const c = new DigitalCodec(base, codecSettings(d));
    expect(codecSettings(d).gop).toBe(10);
    const e0 = meanDiff(c.decode(0).y, base.y);
    const e5 = meanDiff(c.decode(5).y, base.y);
    const e10 = meanDiff(c.decode(10).y, base.y);
    expect(e5).toBeLessThan(e0);
    expect(e10).toBeCloseTo(e0, 6);
    const fresh = new DigitalCodec(base, codecSettings(d)).decode(7);
    const seq = new DigitalCodec(base, codecSettings(d));
    seq.decode(3);
    expect(maxDiff(seq.decode(7).y, fresh.y)).toBe(0);
  });

  it('資料遺失：預測影格掉的方塊一直錯到下一個關鍵影格；每一格各自壓縮時閃一下就消失', () => {
    const base = toPlanes(testRgb(), 64, 48, 2);
    const clean = new DigitalCodec(
      base,
      codecSettings(digital({ quality: 50, keyframe: 20, fps: 10 })),
    );
    const lossy = new DigitalCodec(
      base,
      codecSettings(digital({ quality: 50, keyframe: 20, fps: 10, loss: 100 })),
    );
    const diffs = [3, 9, 15, 19, 20].map((n) => maxDiff(clean.decode(n).y, lossy.decode(n).y));
    expect(diffs[0]).toBeGreaterThan(1);
    /* 第 20 格是關鍵影格：遺失只在那一格自己的方塊 */
    expect(diffs[3]).toBeGreaterThan(1);
  });

  it('datamosh：每 3 個關鍵影格一定留一個；丟掉之後畫面被拖著越糊越多', () => {
    expect([1, 2, 3, 4].map((g) => keyframeKept(g, 1))).toEqual([false, false, true, false]);
    expect([1, 2, 4, 5].every((g) => keyframeKept(g, 0))).toBe(true);
    const base = toPlanes(testRgb(), 64, 48, 2);
    const d = digital({ quality: 60, keyframe: 10, fps: 10, mosh: 100 });
    const mosh = new DigitalCodec(base, codecSettings(d));
    const clean = new DigitalCodec(base, codecSettings({ ...d, mosh: 0 }));
    const at = (n: number) => meanDiff(mosh.decode(n).y, clean.decode(n).y);
    expect(at(9)).toBe(0);
    expect(at(12)).toBeGreaterThan(0);
    expect(at(19)).toBeGreaterThan(at(12));
    /* 第 30 格（第 3 個關鍵影格）一定留下來：又是乾淨的 */
    expect(at(30)).toBe(0);
  });

  it('時間 → 第幾格', () => {
    expect([0, 1 / 15, 0.99].map((t) => digitalFrameAt(t, 15))).toEqual([0, 1, 14]);
  });

  it('同樣的設定與格數，兩台各自算的結果相同（決定性）', () => {
    const base: Planes = toPlanes(testRgb(), 64, 48, 2);
    const d = digital({ noise: 80, loss: 50, keyframe: 0 });
    const a = new DigitalCodec(base, codecSettings(d)).decode(4);
    const b = new DigitalCodec(base, codecSettings(d)).decode(4);
    expect(maxDiff(a.y, b.y)).toBe(0);
    expect(maxDiff(a.cb, b.cb)).toBe(0);
  });
});

/* ---------- Screen Loop ---------- */

describe('Screen Loop：姿勢', () => {
  const l = { ...defaultLook2611().loop, on: true, push: 20, spin: 90, shake: 60 };
  it('無縫循環：動作出去再回來、晃動照長度重複（第 0 秒＝最後）', () => {
    const L = 2.16;
    for (const t of [0, 0.3, 1.1]) {
      const a = loopPose(l, t, L);
      const b = loopPose(l, t + L, L);
      expect(a.zoom).toBeCloseTo(b.zoom, 9);
      expect(a.roll).toBeCloseTo(b.roll, 6);
      expect(a.vx).toBeCloseTo(b.vx, 6);
    }
    /* 推進、旋轉在一半的時候最多 */
    const mid = loopPose({ ...l, shake: 0 }, L / 2, L);
    expect(mid.zoom).toBeCloseTo(0.78 * 1.2, 6);
    expect(mid.roll).toBeCloseTo(90, 6);
  });

  it('不循環：動作從頭做到尾', () => {
    const p = { ...l, seamless: false, shake: 0 };
    expect(loopPose(p, 0, 2).roll).toBeCloseTo(0, 9);
    expect(loopPose(p, 1, 2).roll).toBeCloseTo(45, 9);
  });

  it('消失點在畫面的比例，色彩的偏色', () => {
    const p = loopPose({ ...l, shake: 0, cx: -12, cy: 10 }, 0, 2);
    expect([p.vx, p.vy]).toEqual([0.38, 0.6]);
    expect(driftTint(0)).toBeNull();
    expect(driftTint(100)).toBe('rgb(255,233,195)');
    expect(driftTint(-100)).toBe('rgb(195,237,255)');
  });
});

/* ---------- 像素（node-canvas） ---------- */

describe.runIf(!!nc)('畫出來的像素（node-canvas）', async () => {
  const { frameSource, renderInto } = await import('@/tools/vhs-frame/exporter');
  const { VhsRenderer } = await import('@/tools/vhs-frame/render');
  type C = OffscreenCanvas;

  /** 照片：左半灰、右半上方一塊白（400 × 300） */
  const photo = () => {
    const c = nc?.createCanvas(400, 300) as C;
    const g = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
    g.fillStyle = '#808080';
    g.fillRect(0, 0, 400, 300);
    g.fillStyle = '#ffffff';
    g.fillRect(260, 60, 80, 60);
    return c;
  };
  const stateWith = (patch: (d: VhsState) => void): VhsState => {
    const d = { ...initialState(), photo: { id: 'p', name: 'p.png', width: 400, height: 300 } };
    d.effects = {
      ...d.effects,
      tear: false,
      dropout: false,
      tracking: false,
      noise: false,
      hum: false,
    };
    d.picture = { ...d.picture, curve: 0, vignette: 0, corners: false };
    patch(d);
    return d;
  };
  const draw = (s: VhsState, w = 640, h = 480, t = 1, frame?: number) => {
    const r = new VhsRenderer();
    const out = nc?.createCanvas(w, h) as C;
    const img = photo();
    renderInto(r, out as never, s, frameSource(r, s, img as never, w), t, frame);
    return (out.getContext('2d') as OffscreenCanvasRenderingContext2D).getImageData(0, 0, w, h)
      .data;
  };
  const sameBytes = (a: Uint8ClampedArray, b: Uint8ClampedArray) =>
    a.length === b.length && a.every((v, i) => v === b[i]);
  const px = (d: Uint8ClampedArray, w: number, x: number, y: number) =>
    Array.from(d.slice((y * w + x) * 4, (y * w + x) * 4 + 3));

  it('光柵遮罩：640 寬時一組 3 px（maskSize 6 × 0.5），紅綠藍輪流；亮度補償讓平均和沒有遮罩時差不多', () => {
    const off = draw(stateWith(() => {}));
    const on = draw(
      stateWith((d) => {
        d.crt = { ...d.crt, mask: 'aperture', maskSize: 6, maskStrength: 60, maskBoost: false };
      }),
    );
    /* 左半的灰：第 0、1、2 欄分別是紅、綠、藍最亮（掃描線以外的列） */
    const row = 3;
    const cols = [0, 1, 2].map((x) => px(on, 640, 30 + x, row));
    const brightest = cols.map((c) => c.indexOf(Math.max(...c)));
    expect(new Set(brightest).size).toBe(3);
    expect(px(on, 640, 30, row)).toEqual(px(on, 640, 33, row));
    const mean = (d: Uint8ClampedArray) => {
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
      return s / (d.length * 0.75);
    };
    const boosted = draw(
      stateWith((d) => {
        d.crt = { ...d.crt, mask: 'aperture', maskSize: 6, maskStrength: 60, maskBoost: true };
      }),
    );
    expect(mean(on)).toBeLessThan(mean(off) * 0.75);
    expect(Math.abs(mean(boosted) - mean(off)) / mean(off)).toBeLessThan(0.12);
  });

  it('光暈：亮塊旁邊變亮、暗的地方幾乎不變', () => {
    const off = draw(stateWith(() => {}));
    const on = draw(
      stateWith((d) => {
        d.crt = { ...d.crt, glow: 100, glowSize: 30 };
      }),
    );
    /* 白塊（畫面 x 416～544、y 96～192）旁邊 */
    const near = (d: Uint8ClampedArray) => px(d, 640, 400, 144)[1];
    expect(near(on)).toBeGreaterThan(near(off) + 3);
  });

  it('NTSC 訊號：有作用、同樣的時間結果相同、不同的格雜訊不同', () => {
    const s = stateWith((d) => {
      d.ntsc = { ...d.ntsc, on: true, snow: 60 };
    });
    const a = draw(s, 360, 270, 0.5);
    const b = draw(s, 360, 270, 0.5);
    const c = draw(s, 360, 270, 0.6);
    const base = draw(
      stateWith(() => {}),
      360,
      270,
      0.5,
    );
    expect(sameBytes(a, b)).toBe(true);
    expect(sameBytes(a, c)).toBe(false);
    expect(sameBytes(a, base)).toBe(false);
  });

  it('數位攝影：照片層換成拍好的那一格（低畫質時和原本不同）', () => {
    const s = stateWith((d) => {
      d.digital = { ...d.digital, on: true, ...DIGITAL_PRESETS.web, quality: 5 };
    });
    expect(sameBytes(draw(s), draw(stateWith(() => {})))).toBe(false);
  });

  it('Screen Loop：畫 層數 ＋ 1 次；消失點附近是縮小的畫面（和沒有 Screen Loop 不同）；沒有照片時照常畫', async () => {
    const s = stateWith((d) => {
      d.loop = { ...d.loop, on: true, depth: 4, shake: 0, cx: 0, cy: 0, key: 0, soft: 0, color: 0 };
    });
    const r = new VhsRenderer();
    const spy = vi.spyOn(r, 'frame');
    const out = nc?.createCanvas(320, 240) as C;
    renderInto(r, out as never, s, frameSource(r, s, photo() as never, 720), 0.5, 3);
    expect(spy).toHaveBeenCalledTimes(5);
    const loop = draw(s, 320, 240, 0.5, 3);
    const flat = draw(
      stateWith(() => {}),
      320,
      240,
      0.5,
      3,
    );
    expect(sameBytes(loop, flat)).toBe(false);
    /* 沒有照片：Screen Loop 不作用 */
    const none = { ...s, photo: null };
    const r2 = new VhsRenderer();
    const spy2 = vi.spyOn(r2, 'frame');
    renderInto(
      r2,
      nc?.createCanvas(320, 240) as never,
      none,
      frameSource(r2, none, null, 720),
      0.5,
    );
    expect(spy2).toHaveBeenCalledTimes(1);
  });
});
