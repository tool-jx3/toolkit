/**
 * 2.5D 動態立繪（anime-rig）的自動綁定（規格 1.2）：
 * - 名稱正規化與別名、部位、左右、錨點、髮束、內建差分、雜點清除；
 * - 舊版還在 repo 時（`tools/anime-rig/lib/rigger.js`），同一個圖層樹在舊版與新版綁定的結果逐值相同。
 */
import { describe, expect, it } from 'vitest';
import { genericParts } from '../../src/tools/anime-rig/genericParts';
import {
  buildRig,
  cleanPsdLayers,
  detectStrands,
  findPeaks,
  normName,
  type PsdRoot,
  RigError,
  validatePsd,
} from '../../src/tools/anime-rig/rigger';
import { warningText } from '../../src/tools/anime-rig/rigText';
import { clonePsd, rigTestPsd } from '../helpers/animeRig';
import { legacyEnv, sameBytes } from '../helpers/animeRigLegacy';

const legacyFiles = await legacyEnv();
const hasLegacy = legacyFiles.has;

interface LegacyRigger {
  buildRig(
    psd: unknown,
    opts?: unknown,
  ): {
    canvas: { w: number; h: number };
    layers: Record<string, unknown>[];
    anchors: Record<string, unknown>;
    warnings: { key: string; args: unknown[] }[];
    synth: { eye: boolean; mouth: boolean };
  };
  cleanPsdLayers(psd: unknown): { noisy: number; layers: number };
  normName(n: string): string;
}
interface LegacyGeneric {
  get(k: string): { width: number; height: number; data: Uint8ClampedArray };
}

const prepared = () => {
  const psd = clonePsd(rigTestPsd()) as unknown as PsdRoot;
  const noise = cleanPsdLayers(psd);
  return { psd, noise };
};

describe('名稱正規化（F13、F14）', () => {
  it.each([
    ['Face', 'face'],
    ['顔', 'face'],
    ['輪郭', 'face'],
    ['白目', 'eyewhite'],
    ['Front_Hair', 'front hair'],
    ['front-hair', 'front hair'],
    ['前髪', 'front hair'],
    ['bangs', 'front hair'],
    ['前髪2', 'front hair_2'],
    ['front hair_1', 'front hair_1'],
    ['iris', 'irides'],
    ['瞳', 'irides'],
    ['mouth', 'mouth_open'],
    ['mouth_3', 'mouth_open'],
    ['mouth_c', 'mouth_close'],
    ['eyelash_c', 'eye_close'],
    ['eye_close2', 'eye_close2'],
    ['eyeclose2', 'eye_close2'],
    ['閉じ目2', 'eye_close2'],
    ['eye_close_2', 'eye_close_2'],
    ['レイヤー 1', 'facedetail'],
    ['face のコピー 2', 'face'],
    ['face copy 3', 'face'],
    ['ＦＡＣＥ', 'face'],
    ['  Something   Else ', 'something else'],
    ['hair', 'hair'],
    ['髪', 'hair'],
  ])('%s → %s', (raw, want) => {
    expect(normName(raw)).toBe(want);
  });
});

describe('綁定（F12～F32）', () => {
  it('部件、左右、深度、物理、內建差分', () => {
    const { psd, noise } = prepared();
    expect(noise.layers).toBe(14);
    expect(noise.noisy).toBe(1); /* 臉上的雜點 */
    const rig = buildRig(psd, { generic: genericParts() });
    const names = rig.layers.map((l) => l.name);
    expect(names).toEqual([
      'back hair',
      'neck',
      'topwear',
      'handwear',
      'face',
      'earwear',
      'eyewhite_l',
      'eyewhite_r',
      'irides_l',
      'irides_r',
      'eyelash_l',
      'eyelash_r',
      'eye_close_l',
      'eye_close_r',
      'eyebrow_l',
      'eyebrow_r',
      'mouth_open',
      'mouth_close',
      'front hair',
      'ribbon',
    ]);
    expect(rig.layers.map((l) => l.z)).toEqual(names.map((_, i) => i));
    const by = (n: string) => rig.layers.find((l) => l.name === n)!;
    expect(by('eyewhite_l')).toMatchObject({
      side: 'L',
      fade: 'eyeOpen',
      depth: 1.06,
      group: 'head',
    });
    expect(by('eyewhite_r').side).toBe('R');
    expect(by('eyewhite_l').source).toBe('白目');
    expect(by('eye_close_l')).toMatchObject({ synthetic: true, side: 'L', fade: 'eyeClose' });
    expect(by('mouth_close')).toMatchObject({ synthetic: true, fade: 'mouthClose' });
    expect(by('mouth_open').source).toBe('mouth');
    expect(by('front hair')).toMatchObject({ phys: 'hair', depth: 1.28 });
    expect(by('front hair').strands?.length).toBe(5);
    expect(by('earwear')).toMatchObject({ phys: 'sway' });
    expect(by('earwear').strands?.length).toBe(1);
    expect(by('ribbon')).toMatchObject({ unknown: true, group: 'head', depth: 1 });
    expect(rig.synth).toEqual({ eye: true, mouth: true });
    /* 部件的範圍：不透明（> 8）的外接框＋2 px */
    expect(by('neck')).toMatchObject({ x: 234, y: 288, w: 44, h: 74 });
    const codes = rig.warnings.map((w) => w.code);
    expect(codes).toEqual(['emptyLayer', 'unknownLayer', 'synthEye', 'synthMouth']);
    expect(warningText(rig.warnings[1])).toBe('不認得的圖層名稱「ribbon」，讓它跟著頭部動。');
  });

  it('錨點（F23～F26）', () => {
    const { psd } = prepared();
    const { anchors: a } = buildRig(psd, { generic: genericParts() });
    /* 像素的中心是 x＋0.5：畫在 256 的圓，重心在 255.5 */
    expect(a.face.cx).toBeCloseTo(255.5, 1);
    expect(a.face.cy).toBeCloseTo(199.5, 0);
    expect(a.eyeL?.icx).toBeCloseTo(223.5, 0);
    expect(a.eyeR?.icx).toBeCloseTo(287.5, 0);
    expect(a.eyeL?.closeY).toBeCloseTo(a.eyeL!.y0 + (a.eyeL!.y1 - a.eyeL!.y0) * 0.62, 6);
    expect(a.mouth.cx).toBeCloseTo(255.5, 0);
    expect(a.neckPivot.cy).toBeCloseTo(290 + 69 * 0.85, 6);
    expect(a.bodyPivot).toEqual({ cx: a.neckPivot.cx, cy: 512 });
    expect(a.faceScale).toBeCloseTo((a.face.x1 - a.face.x0) / 333, 9);
    expect(a.hairRootY).toBe(a.face.y0 + 60);
  });

  it('PSD 的檢查（F08）', () => {
    expect(() => validatePsd({ width: 1, height: 100 })).toThrow(RigError);
    expect(() => validatePsd({ width: 6000, height: 5000 })).toThrow('畫布太大');
    const many = { width: 10, height: 10, children: Array.from({ length: 1001 }, () => ({})) };
    expect(() => validatePsd(many)).toThrow('圖層太多');
    let deep: { children?: unknown[] } = {};
    const root = { width: 10, height: 10, children: [deep] };
    for (let i = 0; i < 66; i++) {
      const next = {};
      deep.children = [next];
      deep = next;
    }
    expect(() => validatePsd(root as PsdRoot)).toThrow('層數太深');
    expect(() => buildRig({ width: 10, height: 10, children: [] })).toThrow(
      '找不到看得到的圖像圖層',
    );
  });

  it('髮束：峰值與補足', () => {
    expect(findPeaks([0, 1, 5, 1, 0, 0, 20, 0], 1, 3).map((p) => p.x)).toEqual([6, 2]);
    /* 一欄 1 px 的長條，沒有峰值時從等距候選補 */
    const W = 200;
    const H = 20;
    const a = new Uint8Array(W * H);
    for (let y = 2; y < 15; y++) for (let x = 20; x < 180; x++) a[y * W + x] = 255;
    const s = detectStrands(a, W, H, 30, 3);
    expect(s).toHaveLength(3);
    expect(s.every((v) => v.rootY === 2 && v.tipY === 14)).toBe(true);
  });
});

describe.skipIf(!hasLegacy)('與舊版的綁定逐值相同（同一個圖層樹）', () => {
  const legacy = () => {
    const rigger = legacyFiles.load<LegacyRigger>('rigger.js');
    const generic = legacyFiles.load<LegacyGeneric>('genericparts.js');
    return { rigger, generic };
  };

  it('內建差分的像素相同', () => {
    const { generic } = legacy();
    const mine = genericParts();
    for (const k of ['eyeL', 'eyeR', 'mouth'] as const) {
      const g = generic.get(k);
      expect(mine[k]?.width).toBe(g.width);
      expect(mine[k]?.height).toBe(g.height);
      expect(sameBytes(mine[k]!.data, g.data)).toBe(true);
    }
  });

  it('名稱正規化相同', () => {
    const { rigger } = legacy();
    for (const n of [
      'Face',
      '前髪2',
      'mouth_3',
      'eye_close_2',
      'face のコピー 2',
      'Ribbon 3',
      'hair_2',
      '後ろ髪',
      'XYZ',
    ])
      expect(normName(n)).toBe(rigger.normName(n));
  });

  it('雜點清除、部件、錨點、警告相同', () => {
    const { rigger, generic } = legacy();
    const a = clonePsd(rigTestPsd());
    const b = clonePsd(rigTestPsd());
    expect(cleanPsdLayers(a as unknown as PsdRoot)).toEqual(rigger.cleanPsdLayers(b));
    const mine = buildRig(a as unknown as PsdRoot, { generic: genericParts() });
    const old = rigger.buildRig(b, {
      generic: {
        eyeL: generic.get('eyeL'),
        eyeR: generic.get('eyeR'),
        mouth: generic.get('mouth'),
      },
    });
    expect(mine.canvas).toEqual(old.canvas);
    expect(mine.synth).toEqual(old.synth);
    expect(JSON.parse(JSON.stringify(mine.anchors))).toEqual(
      JSON.parse(JSON.stringify(old.anchors)),
    );
    expect(mine.warnings.map((w) => w.code)).toEqual(
      old.warnings.map((w) => w.key.replace('rig.warn.', '')),
    );
    expect(mine.layers).toHaveLength(old.layers.length);
    mine.layers.forEach((p, i) => {
      const o = old.layers[i] as Record<string, unknown> & {
        img: { data: Uint8ClampedArray };
      };
      const { img, ...meta } = p;
      const { img: oimg, ...ometa } = o;
      expect({ ...meta }).toEqual(
        Object.fromEntries(Object.entries(ometa).filter(([, v]) => v !== undefined)),
      );
      expect(sameBytes(img.data, oimg.data)).toBe(true);
    });
  });
});
