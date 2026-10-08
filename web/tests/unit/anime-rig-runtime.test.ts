/**
 * 2.5D 動態立繪（anime-rig）：PSD 檔頭、指紋、網格、彈簧、設定 JSON（v1／v2）、偏好設定、臉部特徵點與 One Euro。
 * 舊版還在 repo 時（`tools/anime-rig/lib/`），runtime.js、face-features.js 拿同樣的輸入比對結果。
 */
import { describe, expect, it } from 'vitest';
import {
  calibrate,
  DEFAULT_NEUTRAL,
  eyeOpen,
  type Landmark,
  measure,
  OneEuro,
  Tracker,
  toParams,
} from '../../src/tools/anime-rig/faceFeatures';
import {
  defaultParams,
  defaultPrefs,
  normalizePrefs,
  PARAM_DEFS,
} from '../../src/tools/anime-rig/params';
import {
  fingerprint,
  mergeLayerOrder,
  meshSize,
  parseSettings,
  safeFileName,
  sanitizeAnchors,
  spring,
  validateHeader,
} from '../../src/tools/anime-rig/runtime';
import { rigTestPsdBytes } from '../helpers/animeRig';
import { legacyEnv } from '../helpers/animeRigLegacy';

const legacyFiles = await legacyEnv();
const hasLegacy = legacyFiles.has;
// biome-ignore lint/suspicious/noExplicitAny: 舊版的 CommonJS 模組沒有型別
const legacy = (file: string) => legacyFiles.load<any>(file);

const psdHeader = (w: number, h: number, depth = 8, mode = 3) => {
  const b = new ArrayBuffer(40);
  const v = new DataView(b);
  v.setUint32(0, 0x38425053);
  v.setUint16(4, 1);
  v.setUint32(14, h);
  v.setUint32(18, w);
  v.setUint16(22, depth);
  v.setUint16(24, mode);
  return b;
};

describe('PSD 檔頭（F04）', () => {
  it('合格的檔頭回傳尺寸', () => {
    expect(validateHeader(psdHeader(768, 512))).toEqual({ w: 768, h: 512 });
    const real = rigTestPsdBytes();
    expect(
      validateHeader(
        real.buffer.slice(real.byteOffset, real.byteOffset + real.length) as ArrayBuffer,
      ),
    ).toEqual({ w: 512, h: 512 });
  });
  it('錯誤訊息', () => {
    expect(() => validateHeader(new ArrayBuffer(10))).toThrow('PSD 檔案太短。');
    const psb = psdHeader(10, 10);
    new DataView(psb).setUint16(4, 2);
    expect(() => validateHeader(psb)).toThrow('不支援 PSB');
    expect(() => validateHeader(psdHeader(20000, 10))).toThrow('單邊 16,384 px');
    expect(() => validateHeader(psdHeader(100, 100, 16))).toThrow('8 位元');
    expect(() => validateHeader(psdHeader(100, 100, 8, 4))).toThrow('RGB');
  });
});

describe('指紋、網格、彈簧', () => {
  it('指紋：大小-FNV-1a-DJB2', () => {
    expect(fingerprint(new Uint8Array([1, 2, 3]))).toBe('3-56cf37ab-b86aee5');
    expect(fingerprint(new Uint8Array(0))).toBe('0-811c9dc5-1505');
  });
  it('網格的頂點不超過 65,000 個', () => {
    expect(meshSize(100, 100, 42)).toEqual({ nx: 2, ny: 2 });
    expect(meshSize(840, 420, 42)).toEqual({ nx: 20, ny: 10 });
    const big = meshSize(16000, 16000, 2);
    expect((big.nx + 1) * (big.ny + 1)).toBeLessThanOrEqual(65000);
  });
  it('彈簧收斂到目標', () => {
    const s = { x: 0, v: 0 };
    for (let i = 0; i < 300; i++) spring(s, 10, 70, 9, 1 / 60);
    expect(s.x).toBeCloseTo(10, 3);
  });
});

describe('錨點位移與設定 JSON（F50、F77、F78）', () => {
  it('錨點：只留認得的、夾範圍、取到 0.01、0 拿掉', () => {
    expect(
      sanitizeAnchors({ face: { dx: 1.234, dy: 0 }, eyeLClose: { dx: 5, dy: -2 }, foo: { dx: 1 } }),
    ).toEqual({ face: { dx: 1.23 }, eyeLClose: { dy: -2 } });
    expect(sanitizeAnchors({ mouth: { dx: 99999 } }, 512)).toEqual({ mouth: { dx: 512 } });
    expect(() => sanitizeAnchors([])).toThrow('錨點設定不正確');
    expect(() => sanitizeAnchors({ neck: { dx: 'a' } })).toThrow('錨點設定不正確：neck');
  });

  const ids = ['0:back hair', '1:face', '2:eyewhite_l'];
  const file = {
    format: 'anime25d-settings',
    version: 2,
    modelId: 'abc',
    params: { angleX: 5, brow: -0.5 },
    preset: 'smile',
    auto: { idle: false, cam: true },
    background: 'green',
    layers: [
      { id: '1:face', visible: false, opacity: 2, depth: 0.5 },
      { id: '9:gone', visible: true, opacity: 1, depth: 1 },
    ],
    anchors: { face: { dx: 3 } },
  };

  it('讀設定：夾範圍、預設值、圖層差異', () => {
    const r = parseSettings(file, 'abc', ids, defaultParams(), { anchorLimit: 512 });
    expect(r.params.angleX).toBe(1);
    expect(r.params.brow).toBe(-0.5);
    expect(r.params.mouthEase).toBe(0.72);
    expect(Object.keys(r.params)).toHaveLength(PARAM_DEFS.length);
    expect(r.preset).toBe('smile');
    expect(r.auto).toEqual({ idle: false });
    expect(r.background).toBe('green');
    expect(r.layers).toEqual([{ id: '1:face', visible: false, opacity: 1, depth: 0.5 }]);
    expect(r.unknownLayers).toBe(1);
    expect(r.missingLayers).toBe(2);
    expect(r.anchors).toEqual({ face: { dx: 3 } });
  });

  it('讀設定的錯誤', () => {
    expect(() => parseSettings({ ...file, version: 3 }, 'abc', ids, defaultParams())).toThrow(
      '不是支援的設定檔',
    );
    expect(() => parseSettings(file, 'xyz', ids, defaultParams())).toThrow('其他 PSD');
    expect(parseSettings(file, 'xyz', ids, defaultParams(), { anyModel: true }).preset).toBe(
      'smile',
    );
    expect(() => parseSettings({ ...file, layers: {} }, 'abc', ids, defaultParams())).toThrow(
      '結構',
    );
    expect(() =>
      parseSettings({ ...file, params: { brow: 'x' } }, 'abc', ids, defaultParams()),
    ).toThrow('數值設定不正確：brow');
    expect(() =>
      parseSettings({ ...file, auto: { idle: 1 } }, 'abc', ids, defaultParams()),
    ).toThrow('自動動作');
    expect(() =>
      parseSettings({ ...file, layers: [{ id: 'a' }] }, 'abc', ids, defaultParams()),
    ).toThrow('圖層設定');
  });

  it('v1 也讀得到（沒有錨點）', () => {
    const { anchors, ...v1 } = { ...file, version: 1 };
    void anchors;
    expect(parseSettings(v1, 'abc', ids, defaultParams()).anchors).toEqual({});
  });

  it('圖層順序：存檔沒提到的留在原本的鄰居後面', () => {
    expect(mergeLayerOrder(['a', 'b', 'c', 'd'], ['c', 'a'])).toEqual(['c', 'd', 'a', 'b']);
    expect(mergeLayerOrder(['a', 'b', 'c'], ['x', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('檔名', () => {
    expect(safeFileName('my model.psd')).toBe('my model');
    expect(safeFileName('a<b>:c.psd')).toBe('a_b_c');
    expect(safeFileName('', 'avatar')).toBe('avatar');
  });

  it('偏好設定：夾範圍、預設值、校正要完整', () => {
    const p = normalizePrefs({
      headGain: 9,
      linkEyes: false,
      recSeconds: 7,
      recFps: 60,
      exportBg: 'green',
      calibration: { yaw: 1 },
    });
    expect(p.headGain).toBe(2);
    expect(p.linkEyes).toBe(false);
    expect(p.recSeconds).toBe(5);
    expect(p.recFps).toBe(60);
    expect(p.exportBg).toBe('green');
    expect(p.calibration).toBeNull();
    expect(normalizePrefs(null)).toEqual(defaultPrefs());
  });
});

/* ---------- 臉部特徵點 ---------- */

/** 決定性的假臉：478 點，依參數擺出頭部角度、眨眼、張嘴 */
function fakeFace({
  yaw = 0,
  eye = 0.3,
  mouth = 0.02,
  iris = 0,
}: {
  yaw?: number;
  eye?: number;
  mouth?: number;
  iris?: number;
} = {}): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 478 }, (_, i) => ({
    x: 0.5 + 0.1 * Math.sin(i),
    y: 0.5 + 0.1 * Math.cos(i * 1.3),
  }));
  const set = (i: number, x: number, y: number) => {
    lm[i] = { x, y };
  };
  set(234, 0.35, 0.5);
  set(454, 0.65, 0.5);
  set(1, 0.5 + yaw * 0.3 * 0.75, 0.52);
  set(10, 0.5, 0.3);
  set(152, 0.5, 0.75);
  for (const [o, n, t, b, cx] of [
    [33, 133, 159, 145, 0.43],
    [263, 362, 386, 374, 0.57],
  ]) {
    set(o, cx - 0.03, 0.45);
    set(n, cx + 0.03, 0.45);
    set(t, cx, 0.45 - (eye * 0.06 * 0.75) / 2);
    set(b, cx, 0.45 + (eye * 0.06 * 0.75) / 2);
  }
  for (const i of [70, 63, 105, 66, 107, 300, 293, 334, 296, 336]) set(i, 0.45, 0.4);
  set(61, 0.45, 0.62);
  set(291, 0.55, 0.62);
  set(13, 0.5, 0.62 - (mouth * 0.1 * 0.75) / 2);
  set(14, 0.5, 0.62 + (mouth * 0.1 * 0.75) / 2);
  set(468, 0.43 + iris * 0.01, 0.45);
  set(473, 0.57 + iris * 0.01, 0.45);
  return lm;
}

describe('臉部特徵點 → 參數（F55、F58、規格 3.5）', () => {
  it('量測：正面、張嘴、眨眼', () => {
    const m = measure(fakeFace(), 4 / 3)!;
    expect(m.yaw).toBeCloseTo(0, 6);
    expect(m.hasIris).toBe(true);
    expect(measure(fakeFace({ mouth: 0.5 }), 4 / 3)!.mouthOpen).toBeGreaterThan(m.mouthOpen);
    expect(measure(fakeFace().slice(0, 400), 4 / 3)).toBeNull();
  });

  it('眼睛張開度：閉＝基準 × 0.30、開＝基準 × 0.85', () => {
    expect(eyeOpen(0.09, 0.3, 1)).toBe(0);
    expect(eyeOpen(0.255, 0.3, 1)).toBeCloseTo(1, 9);
    expect(eyeOpen(0.3 * 0.575, 0.3, 1)).toBeCloseTo(0.5, 9);
  });

  it('參數：頭部、眼睛連動、眉毛與笑臉可以關', () => {
    const m = measure(fakeFace({ yaw: 0.1, eye: 0.05 }), 4 / 3)!;
    const p = toParams(m, DEFAULT_NEUTRAL, { headGain: 1, linkEyes: true });
    expect(p.ax).toBeLessThan(0);
    expect(p.eL).toBe(p.eR);
    const off = toParams(m, DEFAULT_NEUTRAL, { trackBrow: false, trackSmile: false });
    expect(off.br).toBe(0);
    expect(off.mf).toBe(0);
  });

  it('校正：平均、眼睛至少 0.12', () => {
    const c = calibrate([measure(fakeFace({ eye: 0.1 }), 4 / 3), null])!;
    expect(c.eyeL).toBe(0.12);
    expect(calibrate([])).toBeNull();
  });

  it('One Euro：第一次直接採用、之後平滑', () => {
    const f = new OneEuro(1, 0);
    expect(f.filter(10, 0)).toBe(10);
    const v = f.filter(20, 1 / 30);
    expect(v).toBeGreaterThan(10);
    expect(v).toBeLessThan(20);
    expect(f.filter(5, 1 / 30)).toBe(5); /* 時間沒有往前：直接採用 */
  });

  it('追蹤器：眨眼要閉到底', () => {
    const t = new Tracker();
    for (let i = 0; i < 10; i++) t.update(fakeFace(), i / 30, 4 / 3);
    const out = t.update(fakeFace({ eye: 0 }), 10 / 30, 4 / 3)!;
    expect(out.eL).toBeLessThanOrEqual(0.1);
    t.startCalibration();
    t.update(fakeFace(), 11 / 30, 4 / 3);
    expect(t.finishCalibration()).not.toBeNull();
  });
});

describe.skipIf(!hasLegacy)('與舊版的 runtime.js、face-features.js 結果相同', () => {
  it('指紋、網格、彈簧、圖層順序、錨點', () => {
    const RT = legacy('runtime.js');
    const bytes = rigTestPsdBytes();
    expect(fingerprint(bytes)).toBe(RT.fingerprint(bytes));
    for (const [w, h, c] of [
      [100, 100, 42],
      [2048, 300, 25.2],
      [9000, 9000, 1],
    ])
      expect(meshSize(w, h, c)).toEqual(RT.meshSize(w, h, c));
    const a = { x: 0, v: 0 };
    const b = { x: 0, v: 0 };
    for (const dt of [0.016, 0.05, 0.001, 0.033]) {
      spring(a, 3, 140, 4.2, dt);
      RT.spring(b, 3, 140, 4.2, dt);
    }
    expect(a).toEqual(b);
    expect(mergeLayerOrder(['a', 'b', 'c', 'd', 'e'], ['d', 'b'])).toEqual(
      RT.mergeLayerOrder(['a', 'b', 'c', 'd', 'e'], ['d', 'b']),
    );
    const anchors = { face: { dx: 1.234, dy: -0.001 }, chest: { dy: 40000 }, eyeRClose: { dy: 3 } };
    expect(sanitizeAnchors(anchors, 512)).toEqual(RT.anchors(anchors, 512));
  });

  it('設定 JSON 的解讀', () => {
    const RT = legacy('runtime.js');
    const ranges = Object.fromEntries(PARAM_DEFS.map((d) => [d.key, [d.min, d.max]]));
    const ids = ['0:back hair', '1:face'];
    const value = {
      format: 'anime25d-settings',
      version: 2,
      modelId: 'm',
      params: { angleX: 3, mouthForm: -0.25 },
      preset: 'jito',
      auto: { talk: false },
      background: 'dark',
      layers: [{ id: '1:face', visible: true, opacity: 0.5, depth: 3 }],
      anchors: { mouth: { dx: 2, dy: -1 } },
    };
    const mine = parseSettings(value, 'm', ids, defaultParams(), { anchorLimit: 512 });
    const old = RT.settings(value, 'm', ranges, ids, defaultParams(), { anchorLimit: 512 });
    expect(mine).toEqual(old);
  });

  it('特徵點量測、參數、追蹤器', () => {
    const FF = legacy('face-features.js');
    const faces = [
      fakeFace(),
      fakeFace({ yaw: 0.2, eye: 0.1, mouth: 0.4, iris: 1 }),
      fakeFace({ yaw: -0.1, eye: 0.35, mouth: 0, iris: -2 }),
    ];
    const opts = { headGain: 1.4, eyeGain: 0.7, linkEyes: false, smoothing: 0.2 };
    for (const f of faces) {
      const a = measure(f, 16 / 9);
      expect(a).toEqual(FF.measure(f, 16 / 9));
      expect(toParams(a!, null, opts)).toEqual(FF.toParams(a, null, opts));
    }
    const mine = new Tracker(opts);
    const old = new FF.Tracker(opts);
    faces.forEach((f, i) => {
      expect(mine.update(f, i * 0.04, 4 / 3)).toEqual(old.update(f, i * 0.04, 4 / 3));
    });
    mine.setOptions({ smoothing: 0.9 });
    old.setOptions({ smoothing: 0.9 });
    expect(mine.update(faces[0], 0.2, 4 / 3)).toEqual(old.update(faces[0], 0.2, 4 / 3));
  });
});
