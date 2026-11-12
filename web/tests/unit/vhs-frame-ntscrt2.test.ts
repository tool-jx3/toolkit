/**
 * 錄影帶畫面產生器 2026-11-12 跟進 NTSCRT `352b4dc`（MIT；規格 1.18～1.21、3.18～3.20，F99～F110）：
 * 方塊色（Microsoft Video 1）的方塊編碼與解碼器、CCD 的反應、彩虹鋸齒、低光雜訊、銳利化的寬度、單場的掃描線、
 * Screen Loop 的亮度鍵反過來、新的樣子的值、資料版本 4（第 3 版照讀）。
 * NTSCRT 的演算法：期望值由它的 Swift 原始碼（Video1Codec.swift、DigitalVideoRenderer.swift 的 CCDResponse、DigitalCodec.swift 的畫質刻度）推出來，寫在各測試裡。
 * 「沒用新功能時輸出不變」由 vhs-frame-golden.test.ts 守住（基準檔 vhs-frame-golden.json、vhs-frame-golden-2611.json 都是改版前的程式產生的）。
 */
import { describe, expect, it } from 'vitest';
import {
  type BlockMode,
  blockLimit,
  ColorBlockCodec,
  codeColorBlock,
  to555,
  twoColors,
} from '@/tools/vhs-frame/colorblock';
import {
  CCD,
  cameraBase,
  cameraSample,
  cameraTone,
  ccdKnee,
  ccdResponse,
  codecSettings,
  fromPlanes,
  LOW_LIGHT,
  lowLightNoise,
  medianLuma,
  type Planes,
  sensorGain,
  toPlanes,
} from '@/tools/vhs-frame/digital';
import {
  DIGITAL_FORMATS,
  DIGITAL_PRESETS,
  type Digital,
  defaultDigital,
  defaultLoop,
  effectiveDigital,
  fieldScanOn,
} from '@/tools/vhs-frame/look';
import { fieldScanRows, initialState, normalizeState } from '@/tools/vhs-frame/model';
import {
  applyLookPreset,
  LOOK_PRESET_IDS,
  LOOK_PRESETS,
  matchingPreset,
} from '@/tools/vhs-frame/presets';
import { DATA_VERSION, upgradeState } from '@/tools/vhs-frame/store';
import { nodeCanvas } from '../helpers/nodeCanvas';

const nc = await nodeCanvas();

/* ---------- 方塊色（Video 1） ---------- */

/** 16 個像素（每個 [r, g, b]）→ 方塊 */
const block = (px: readonly (readonly number[])[]) => Float32Array.from(px.flat());

describe('方塊色：一個 4 × 4 的方塊', () => {
  it('15 位元色：每色 31 階（Swift：(v × 31 ÷ 255).rounded() × 255 ÷ 31）', () => {
    expect(to555(0)).toBe(0);
    expect(to555(255)).toBe(255);
    expect(to555(100)).toBeCloseTo((12 * 255) / 31, 9);
    expect(to555(-20)).toBe(0);
    expect(to555(300)).toBe(255);
  });

  it('畫質的上限：(50 − 49q)² × 48（q＝畫質 ÷ 100；0＝每個值均方誤差 2500、100＝1）', () => {
    expect(blockLimit(0)).toBe(2500 * 48);
    expect(blockLimit(100)).toBe(48);
    /* CD-ROM 的格式（NTSCRT 0.57）：r＝50 − 49 × 0.57＝22.07 */
    expect(blockLimit(57)).toBeCloseTo(22.07 ** 2 * 48, 6);
  });

  it('平的方塊 → 一色（平均的 15 位元色）', () => {
    const src = block(Array.from({ length: 16 }, () => [100, 150, 200]));
    const out = new Float32Array(48);
    expect(codeColorBlock(src, null, blockLimit(100), out)).toBe('fill');
    expect(Array.from(out.slice(0, 3))).toEqual(
      [to555(100), to555(150), to555(200)].map(Math.fround),
    );
  });

  it('左黑右白 → 兩色（0 與 255 在 15 位元裡是準的，沒有誤差）', () => {
    const src = block(
      Array.from({ length: 16 }, (_, i) => (i % 4 < 2 ? [0, 0, 0] : [255, 255, 255])),
    );
    const out = new Float32Array(48);
    expect(codeColorBlock(src, null, blockLimit(100), out)).toBe('two');
    expect(Array.from(out)).toEqual(Array.from(src));
  });

  it('四個 2 × 2 各自不同的兩色 → 八色', () => {
    const pairs = [
      [
        [255, 0, 0],
        [0, 0, 0],
      ],
      [
        [0, 255, 0],
        [255, 255, 255],
      ],
      [
        [0, 0, 255],
        [255, 255, 0],
      ],
      [
        [255, 0, 255],
        [0, 255, 255],
      ],
    ];
    const quarter = (i: number) =>
      (Math.floor(i / 8) * 2 + Math.floor((i % 4) / 2)) as 0 | 1 | 2 | 3;
    const src = block(
      Array.from({ length: 16 }, (_, i) => pairs[quarter(i)][(i + Math.floor(i / 4)) % 2]),
    );
    const out = new Float32Array(48);
    const mode: BlockMode = codeColorBlock(src, null, blockLimit(100), out);
    expect(mode).toBe('eight');
    expect(Array.from(out)).toEqual(Array.from(src));
  });

  it('兩色的分法（Swift 的 twoColors）：以平均亮度分組、再換到比較近的那一色，兩色量化成 15 位元', () => {
    /* 8 個 10、4 個 200、4 個 220：平均亮度 110 → 暗組 10、亮組 210 → 15 位元 1 × 255/31 與 26 × 255/31 */
    const src = block([
      ...Array.from({ length: 8 }, () => [10, 10, 10]),
      ...Array.from({ length: 4 }, () => [200, 200, 200]),
      ...Array.from({ length: 4 }, () => [220, 220, 220]),
    ]);
    const out = new Float32Array(48);
    const err = twoColors(
      src,
      Array.from({ length: 16 }, (_, i) => i),
      out,
    );
    const lo = (1 * 255) / 31;
    const hi = (26 * 255) / 31;
    expect(out[0]).toBeCloseTo(lo, 4);
    expect(out[8 * 3]).toBeCloseTo(hi, 4);
    expect(out[15 * 3]).toBeCloseTo(hi, 4);
    expect(err).toBeCloseTo(
      3 * (8 * (10 - lo) ** 2 + 4 * (200 - hi) ** 2 + 4 * (220 - hi) ** 2),
      2,
    );
  });

  it('預測影格：和上一張的差在上限以內就跳過（沿用上一張）', () => {
    const ref = block(Array.from({ length: 16 }, () => [100, 100, 100]));
    const src = block(Array.from({ length: 16 }, () => [101, 100, 99]));
    const out = new Float32Array(48);
    expect(codeColorBlock(src, ref, blockLimit(50), out)).toBe('skip');
    expect(Array.from(out)).toEqual(Array.from(ref));
    expect(codeColorBlock(src, ref, 1, out)).not.toBe('skip');
  });
});

/** 64 × 48 的測試畫面：漸層＋一塊亮的方塊＋細的直條紋 */
function testRgb(w = 64, h = 48): Float32Array {
  const rgb = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      const box = x > 30 && x < 50 && y > 10 && y < 30;
      const stripe = y > 34 && x % 2 === 0;
      rgb[o] = box ? 0.95 : stripe ? 0.8 : x / w;
      rgb[o + 1] = box ? 0.9 : stripe ? 0.8 : y / h;
      rgb[o + 2] = box ? 0.2 : stripe ? 0.8 : 0.5;
    }
  return rgb;
}
const digital = (patch: Partial<Digital>): Digital => ({
  ...defaultDigital(),
  ...DIGITAL_PRESETS.cdrom,
  on: true,
  ...patch,
});
const maxDiff = (a: Float32Array, b: Float32Array) => {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
};
const codec = (d: Digital, base: Planes = toPlanes(testRgb(), 64, 48, 0)) =>
  new ColorBlockCodec(base, codecSettings(effectiveDigital(d)), d.quality);

describe('方塊色：解碼器', () => {
  it('平面一律 4:4:4；輸出的每一色都在 15 位元的階上（±1）', () => {
    expect(
      () => new ColorBlockCodec(toPlanes(testRgb(), 64, 48, 2), codecSettings(digital({})), 57),
    ).toThrow();
    const p = codec(digital({ keyframe: 0 })).decode(0);
    const out = new Uint8ClampedArray(64 * 48 * 4);
    fromPlanes(p, 64, 48, out);
    for (let i = 0; i < out.length; i += 4)
      for (let c = 0; c < 3; c++)
        expect(Math.abs(out[i + c] - to555(out[i + c]))).toBeLessThanOrEqual(1);
  });

  it('畫質越低誤差越大', () => {
    const base = toPlanes(testRgb(), 64, 48, 0);
    const err = (q: number) => {
      const y = codec(digital({ quality: q, keyframe: 0 }), base).decode(0).y;
      return y.reduce((s, v, i) => s + Math.abs(v - base.y[i]), 0) / y.length;
    };
    expect(err(90)).toBeLessThan(err(30));
    expect(err(30)).toBeLessThan(err(2));
  });

  it('靜態照片沒有雜訊：關鍵影格之後每一格都跳過（和關鍵影格相同）；依序算與跳著算相同', () => {
    const c = codec(digital({ keyframe: 10, fps: 10, noise: 0 }));
    const k = c.decode(0);
    expect(maxDiff(c.decode(5).y, k.y)).toBe(0);
    const fresh = codec(digital({ keyframe: 10, fps: 10, noise: 40 })).decode(7);
    const seq = codec(digital({ keyframe: 10, fps: 10, noise: 40 }));
    seq.decode(3);
    expect(maxDiff(seq.decode(7).y, fresh.y)).toBe(0);
    expect(maxDiff(seq.decode(7).cr, fresh.cr)).toBe(0);
  });

  it('資料遺失：關鍵影格掉的方塊（錯位的內容）在跳過的方塊裡一直留到下一個關鍵影格', () => {
    const d = digital({ keyframe: 10, fps: 10, noise: 0, quality: 60 });
    const clean = codec(d);
    const lossy = codec({ ...d, loss: 100 });
    const at = (n: number) => maxDiff(clean.decode(n).y, lossy.decode(n).y);
    expect(at(0)).toBeGreaterThan(1);
    /* 沒有雜訊：預測影格全部跳過，錯位的方塊照留著 */
    expect(maxDiff(lossy.decode(6).y, lossy.decode(0).y)).toBe(0);
    /* 每一格各自編碼：只閃那一格 */
    const intra = codec({ ...d, loss: 100, keyframe: 0 });
    expect(maxDiff(intra.decode(1).y, intra.decode(2).y)).toBeGreaterThan(1);
  });

  it('實際用的值：方塊色沒有色彩取樣、柔化方塊的邊、datamosh（存的值不改）', () => {
    const d = digital({ codec: 'video1', chroma: 3, blockSmooth: 40, mosh: 70 });
    expect(effectiveDigital(d)).toMatchObject({ chroma: 0, blockSmooth: 0, mosh: 0 });
    expect(d).toMatchObject({ chroma: 3, blockSmooth: 40, mosh: 70 });
    const dct = { ...d, codec: 'dct' as const };
    expect(effectiveDigital(dct)).toBe(dct);
  });
});

/* ---------- 相機 ---------- */

describe('CCD 的反應（Swift 的 CCDResponse）', () => {
  it('自動曝光：平均拉到 0.40（增益 0.5～4 倍、取強度次方）；眩光；膝點；黑位', () => {
    expect(ccdResponse(1, 0.1)).toEqual({
      gain: 4,
      flare: 0.03 * 0.1 * 4,
      slope: 0.38,
      setup: 0.065,
    });
    expect(ccdResponse(0.5, 0.1).gain).toBeCloseTo(2, 12);
    expect(ccdResponse(1, 2).gain).toBe(0.5);
    expect(ccdResponse(0, 0.1).gain).toBe(1);
    /* Swift：kneePoint 0.72 × 255＝183.6；229.5 → 183.6 ＋ 45.9 × 0.38＝201.042 */
    expect(ccdKnee(0.9, 0.38) * 255).toBeCloseTo(201.042, 3);
    expect(ccdKnee(2, 0.38)).toBe(1);
    expect(ccdKnee(0.5, 0.38)).toBe(0.5);
    expect(CCD.knee).toBe(0.72);
  });

  it('暗的畫面拍得亮、黑色浮起來；0 時和沒有這一步相同', () => {
    const w = 32;
    const h = 24;
    const dark = new Float32Array(w * h * 3).map((_, i) => ((i % 7) / 7) * 0.25);
    const plain = {
      exposure: 0,
      warmth: 0,
      tint: 0,
      saturation: 100,
      black: 0,
      sharpen: 0,
      halo: 1,
      denoise: 0,
    };
    const off = cameraTone(dark.slice(), w, h, { ...plain, ccd: 0 });
    const on = cameraTone(dark.slice(), w, h, { ...plain, ccd: 100 });
    const mean = (a: Float32Array) => a.reduce((s, v) => s + v, 0) / a.length;
    expect(Array.from(off)).toEqual(Array.from(dark));
    expect(mean(on)).toBeGreaterThan(mean(off) * 1.5);
    expect(Math.min(...on)).toBeGreaterThan(0.03);
  });
});

describe('彩虹鋸齒（Swift 的 scale：紅綠藍各差三分之一格）', () => {
  const w = 4;
  const h = 2;
  /** 3 × 3 倍的最近點畫面：第 c 欄只有第 c mod 3 色是 255 */
  const thirds = () => {
    const d = new Uint8ClampedArray(w * 3 * h * 3 * 4);
    for (let y = 0; y < h * 3; y++)
      for (let x = 0; x < w * 3; x++) {
        const o = (y * w * 3 + x) * 4;
        d[o + (x % 3)] = 255;
        d[o + 3] = 255;
      }
    return d;
  };
  const gray = new Uint8ClampedArray(w * h * 4).fill(128);
  const sample = (rainbow: number) =>
    cameraSample(gray, null, w, h, { alias: 0, rainbow, lens: 0, interlace: false }, thirds());

  it('50% 以上整個換成三個點的取樣：紅在左三分之一、綠在中間、藍在右三分之一 → 白', () => {
    expect(Array.from(sample(50))).toEqual(new Array(w * h * 3).fill(1));
  });
  it('25%：往點的取樣靠一半', () => {
    for (const v of sample(25)) expect(v).toBeCloseTo((128 / 255 + 1) / 2, 6);
  });
  it('0：不用 3 × 3 倍的畫面', () => {
    for (const v of sample(0)) expect(v).toBeCloseTo(128 / 255, 6);
  });
  it('超過 50% 加強細節：v ＋ 1.5(2a − 1)(v − 周圍 3 × 3 的平均)，夾在 0～255', () => {
    /* a＝0.75：boost 0.75；紅的點 255、周圍 3 欄 (0, 255, 0) × 3 列 → 平均 85 → 255 ＋ 0.75 × 170 → 夾成 255 */
    expect(Array.from(sample(75))).toEqual(new Array(w * h * 3).fill(1));
    const flat = new Uint8ClampedArray(w * 3 * h * 3 * 4).fill(100);
    const s = cameraSample(
      gray,
      null,
      w,
      h,
      { alias: 0, rainbow: 100, lens: 0, interlace: false },
      flat,
    );
    for (const v of s) expect(v).toBeCloseTo(100 / 255, 6);
  });
});

describe('低光雜訊（Swift 的 sensorGain、medianLuma）', () => {
  const flat = (v: number, w = 16, h = 12) => new Float32Array(w * h * 3).fill(v);
  it('中位數在 sRGB 100 以上時 1 倍、越暗越高、最多 8 倍', () => {
    expect(sensorGain(medianLuma(flat(100 / 255), 16, 12))).toBeCloseTo(1, 9);
    expect(sensorGain(medianLuma(flat(1), 16, 12))).toBe(1);
    expect(sensorGain(medianLuma(flat(10 / 255), 16, 12))).toBe(8);
    /* sRGB 50：線性 0.0319 → 0.1274 ÷ 0.0319 ≈ 3.99 */
    expect(sensorGain(medianLuma(flat(50 / 255), 16, 12))).toBeCloseTo(
      LOW_LIGHT.knee / 0.031896,
      2,
    );
  });
  it('雜訊乘上 1 ＋ 低光雜訊 × (增益 − 1)；低光雜訊 0 或沒有雜訊時 1', () => {
    const dark = flat(10 / 255);
    expect(lowLightNoise(dark, 16, 12, { lowLight: 50, noise: 40 })).toBeCloseTo(4.5, 9);
    expect(lowLightNoise(dark, 16, 12, { lowLight: 0, noise: 40 })).toBe(1);
    expect(lowLightNoise(dark, 16, 12, { lowLight: 50, noise: 0 })).toBe(1);
    const d = digital({ codec: 'dct', noise: 40, denoise: 0 });
    expect(codecSettings(d, 4.5).noise).toBeCloseTo(codecSettings(d).noise * 4.5, 9);
  });
});

describe('銳利化的寬度', () => {
  /** 一列的階梯：左 0.2、右 0.8 */
  const w = 24;
  const h = 4;
  const step = () => {
    const a = new Float32Array(w * h * 3);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        a.fill(x < w / 2 ? 0.2 : 0.8, (y * w + x) * 3, (y * w + x) * 3 + 3);
    return a;
  };
  const tone = (halo: number) =>
    cameraTone(step(), w, h, {
      exposure: 0,
      warmth: 0,
      tint: 0,
      saturation: 100,
      black: 0,
      sharpen: 50,
      halo,
      denoise: 0,
      ccd: 0,
    });
  /** 階梯旁邊有多少 px 被推過頭（暗的那邊低於 0.2） */
  const reach = (a: Float32Array) => {
    let n = 0;
    for (let x = 0; x < w / 2; x++) if (a[(w + x) * 3] < 0.2 - 1e-4) n++;
    return n;
  };
  it('1 px＝原本的 1-2-1（只有邊旁邊一格）；越寬白邊伸得越遠', () => {
    expect(reach(tone(1))).toBe(1);
    expect(reach(tone(3))).toBe(3);
    expect(reach(tone(4))).toBe(4);
  });
  it('cameraBase（2026-11-10 的寫法）＝cameraSample → cameraTone', () => {
    const smooth = new Uint8ClampedArray(16 * 12 * 4).map((_, i) => (i * 37) & 255);
    const d = { ...DIGITAL_PRESETS.minidv, rainbow: 0 };
    expect(Array.from(cameraBase(smooth, smooth, 16, 12, d))).toEqual(
      Array.from(cameraTone(cameraSample(smooth, smooth, 16, 12, d), 16, 12, d)),
    );
  });
});

describe('單場的掃描線', () => {
  it('行數＝擷取的高 ÷ 2（無條件進位）；只在數位攝影、單場、一行一條都開著時', () => {
    expect(fieldScanRows({ digital: { width: 320 }, aspect: '4:3' })).toBe(120);
    expect(fieldScanRows({ digital: { width: 720 }, aspect: '4:3' })).toBe(270);
    expect(fieldScanRows({ digital: { width: 250 }, aspect: '16:9' })).toBe(71);
    const d = digital({ interlace: true, fieldScan: true });
    expect(fieldScanOn(d)).toBe(true);
    expect(fieldScanOn({ ...d, interlace: false })).toBe(false);
    expect(fieldScanOn({ ...d, on: false })).toBe(false);
    expect(fieldScanOn({ ...d, fieldScan: false })).toBe(false);
  });
});

/* ---------- 格式、樣子 ---------- */

/** NTSCRT 第 1 版的畫質（JPEG 的畫質 2 ＋ 93u）→ 本站的 JPEG 畫質 */
const qualityV1 = (u: number) => Math.round(2 + 93 * u);
/** NTSCRT 第 2 版的畫質（DigitalCodec.tableScale：(5 ＋ (√0.1 − 5)u)² 倍的量化表）→ 本站的 JPEG 畫質（IJG：倍數 < 1 時 (200 − 100 × 倍數) ÷ 2，否則 50 ÷ 倍數） */
const qualityV2 = (u: number) => {
  const s = (5 + (Math.sqrt(0.1) - 5) * u) ** 2;
  return Math.round(s >= 1 ? 50 / s : (200 - 100 * s) / 2);
};

describe('格式與樣子', () => {
  it('六種格式；CD-ROM 是方塊色（照 NTSCRT 的 DigitalFormat：240 寬、每秒 12 格、畫質 0.57）；前五種的新設定都是「和以前一樣」', () => {
    expect(DIGITAL_FORMATS).toEqual(['webcam', 'call', 'minidv', 'web', 'mosh', 'cdrom']);
    expect(DIGITAL_PRESETS.cdrom).toMatchObject({
      codec: 'video1',
      width: 240,
      fps: 12,
      quality: 57,
      keyframe: 12,
      interlace: false,
    });
    for (const f of ['webcam', 'call', 'minidv', 'web', 'mosh'] as const)
      expect(DIGITAL_PRESETS[f]).toMatchObject({
        codec: 'dct',
        rainbow: 0,
        lowLight: 0,
        ccd: 0,
        halo: 1,
        fieldScan: false,
      });
  });

  it('新的六組樣子的值（NTSCRT 的 presets 換算）', () => {
    expect(qualityV1(0.18591515344074017)).toBe(19);
    expect(qualityV2(0.749)).toBe(22);
    expect(LOOK_PRESETS.chunky.digital).toMatchObject({
      width: 256,
      fps: 30,
      interlace: true,
      rainbow: 100,
      ccd: 100,
      sharpen: 74,
      noise: 12,
      chroma: 2,
      quality: qualityV1(0.18591515344074017),
      keyframe: 5,
      loss: 34,
    });
    expect(LOOK_PRESETS.cdrom.digital).toMatchObject({
      codec: 'video1',
      width: 240,
      fps: 12,
      rainbow: 65,
      ccd: 48,
      saturation: 151,
      sharpen: 97,
      noise: 36,
      quality: 64,
      keyframe: 37,
      loss: 59,
    });
    expect(LOOK_PRESETS.camcorder.digital).toMatchObject({
      width: 480,
      fps: 30,
      rainbow: 38,
      ccd: 68,
      lowLight: 64,
      noise: 40,
      halo: 4,
      quality: qualityV2(0.749),
      keyframe: 0,
    });
    /* NTSC：拖影 ×100、訊號雜訊 ×500（上限 100）、邊緣波動 ×20、色彩脫落 100√(v ÷ 0.05) */
    expect(LOOK_PRESETS.mild.ntsc).toMatchObject({
      tape: 'sp',
      smear: 0,
      noise: Math.round(0.06406734913793102 * 500),
      wave: 0,
    });
    expect(LOOK_PRESETS.static.ntsc).toMatchObject({
      tape: 'ep',
      smear: Math.round(0.5759752598824326 * 100),
      bleed: Math.round(2.667),
      noise: 100,
      wave: Math.round(2.290922619047619 * 20),
      loss: Math.round(100 * Math.sqrt(0.0019197382478632478 / 0.05)),
      ringing: false,
    });
    expect(LOOK_PRESETS.corner.loop).toMatchObject({
      depth: 10,
      zoom: 73,
      cx: -45,
      cy: 45,
      soft: 20,
      color: -30,
      shake: 40,
      seamless: false,
    });
  });

  it('每一組套用後都認得出來；只有數位攝影的樣子把錄影帶的效果全關', () => {
    expect(LOOK_PRESET_IDS).toHaveLength(12);
    for (const id of LOOK_PRESET_IDS) {
      const d = initialState();
      applyLookPreset(d, id);
      expect(matchingPreset(d)).toBe(id);
    }
    const d = initialState();
    applyLookPreset(d, 'cdrom');
    expect(d.digital.on).toBe(true);
    expect(Object.entries(d.effects).filter(([, v]) => v)).toEqual([]);
    expect(d.wear).toBe(0);
  });

  it('既有的六組樣子的值不變', () => {
    expect(LOOK_PRESETS.webcam).toEqual({
      wear: 30,
      effects: { chroma: false },
      digital: { on: true, format: 'webcam', ...DIGITAL_PRESETS.webcam },
      ntsc: { on: true, tape: 'sp', smear: 40, noise: 20 },
    });
    expect(LOOK_PRESETS.loop).toEqual({
      wear: 25,
      effects: { tear: false },
      loop: { on: true, key: 50, gain: 112 },
      crt: { glow: 25 },
    });
  });
});

/* ---------- 資料 ---------- */

describe('資料版本 4', () => {
  it('第 3 版（沒有新的欄位）讀成「和以前一樣」的值', () => {
    expect(DATA_VERSION).toBe(4);
    const v3 = JSON.parse(JSON.stringify(initialState())) as Record<string, unknown> & {
      digital: Record<string, unknown>;
      loop: Record<string, unknown>;
    };
    for (const k of ['codec', 'fieldScan', 'rainbow', 'lowLight', 'ccd', 'halo'])
      delete v3.digital[k];
    delete v3.loop.keyInvert;
    v3.digital = { ...v3.digital, on: true, format: 'minidv', interlace: true, quality: 90 };
    const s = upgradeState(v3, 3);
    expect(s.digital).toMatchObject({
      codec: 'dct',
      fieldScan: false,
      rainbow: 0,
      lowLight: 0,
      ccd: 0,
      halo: 1,
      quality: 90,
    });
    expect(s.loop.keyInvert).toBe(false);
  });

  it('存了再讀回來逐欄位相同；亂填的整理成合法值', () => {
    const d = initialState();
    applyLookPreset(d, 'cdrom');
    d.digital = { ...d.digital, fieldScan: true, lowLight: 33, halo: 3 };
    d.loop = { ...defaultLoop(), on: true, key: 40, keyInvert: true };
    expect(normalizeState(JSON.parse(JSON.stringify(d)))).toEqual(d);
    const bad = normalizeState({
      ...initialState(),
      digital: {
        codec: 'mpeg',
        format: 'cdrom',
        halo: 9.4,
        ccd: -3,
        rainbow: 50.6,
        fieldScan: 'yes',
      },
      loop: { keyInvert: 1 },
    });
    expect(bad.digital).toMatchObject({
      codec: 'dct',
      format: 'cdrom',
      halo: 4,
      ccd: 0,
      rainbow: 51,
      fieldScan: false,
    });
    expect(bad.loop.keyInvert).toBe(false);
  });
});

/* ---------- 像素（node-canvas） ---------- */

describe.runIf(!!nc)('畫出來的像素（node-canvas）', async () => {
  const { frameSource, renderInto } = await import('@/tools/vhs-frame/exporter');
  const { VhsRenderer } = await import('@/tools/vhs-frame/render');
  type C = OffscreenCanvas;
  const photo = () => {
    const c = nc?.createCanvas(400, 300) as C;
    const g = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
    g.fillStyle = '#808080';
    g.fillRect(0, 0, 400, 300);
    g.fillStyle = '#ffffff';
    g.fillRect(260, 60, 80, 60);
    return c;
  };
  const stateWith = (patch: (d: ReturnType<typeof initialState>) => void) => {
    const d = { ...initialState(), photo: { id: 'p', name: 'p.png', width: 400, height: 300 } };
    d.effects = {
      ...d.effects,
      chroma: false,
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
  const draw = (s: ReturnType<typeof initialState>, w = 640, h = 480, t = 1) => {
    const r = new VhsRenderer();
    const out = nc?.createCanvas(w, h) as C;
    renderInto(r, out as never, s, frameSource(r, s, photo() as never, w), t);
    return (out.getContext('2d') as OffscreenCanvasRenderingContext2D).getImageData(0, 0, w, h)
      .data;
  };
  const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) =>
    a.length === b.length && a.every((v, i) => v === b[i]);

  it('方塊色：和 DCT 不同、同樣的時間兩次相同', () => {
    const v1 = stateWith((d) => {
      d.digital = { ...d.digital, ...DIGITAL_PRESETS.cdrom, on: true, format: 'cdrom' };
    });
    const dct = stateWith((d) => {
      d.digital = {
        ...d.digital,
        ...DIGITAL_PRESETS.cdrom,
        on: true,
        format: 'cdrom',
        codec: 'dct',
      };
    });
    expect(same(draw(v1), draw(v1))).toBe(true);
    expect(same(draw(v1), draw(dct))).toBe(false);
  });

  it('單場的掃描線：640 × 480、擷取 320 寬 → 120 行，每 4 px 一組、上面 2 px 暗（原本每 3 px 一組）', () => {
    const s = stateWith((d) => {
      d.digital = {
        ...d.digital,
        ...DIGITAL_PRESETS.webcam,
        on: true,
        noise: 0,
        interlace: true,
        fieldScan: true,
      };
    });
    const px = draw(s);
    const row = (y: number) => px[(y * 640 + 100) * 4 + 1];
    const rows = Array.from({ length: 12 }, (_, y) => row(y + 40));
    /* 第 40、41 列暗、42、43 亮（40 是 4 的倍數） */
    for (let k = 0; k < 12; k += 4) {
      expect(rows[k]).toBeLessThan(rows[k + 2]);
      expect(rows[k + 1]).toBeLessThan(rows[k + 3]);
    }
    const off = draw({ ...s, digital: { ...s.digital, fieldScan: false } });
    expect(same(px, off)).toBe(false);
  });

  it('Screen Loop 的亮度鍵反過來：和不反過來不同；鍵 0 時沒有作用', () => {
    const loop = (invert: boolean, key = 60) =>
      stateWith((d) => {
        d.loop = {
          ...d.loop,
          on: true,
          depth: 2,
          shake: 0,
          cx: 0,
          cy: 0,
          soft: 0,
          color: 0,
          key,
          keyInvert: invert,
        };
      });
    expect(same(draw(loop(true), 320, 240), draw(loop(false), 320, 240))).toBe(false);
    expect(same(draw(loop(true, 0), 320, 240), draw(loop(false, 0), 320, 240))).toBe(true);
  });
});
