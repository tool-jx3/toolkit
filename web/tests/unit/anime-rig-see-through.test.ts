/**
 * 2.5D 動態立繪（anime-rig）：see-through 的輸出（規格 1.15、3.7）。
 * - 左右分割的名稱（`<標籤>-r`＝畫面左邊 → 本站的 `_l`）、編號、大小寫、`hairf`／`hairb`；
 * - 名稱已分好左右的圖層不再自動分，結果和自動分左右的相同；名稱和位置相反時依位置；
 * - 深度 PSD／`.psd.json` 的讀取與對應、對不上時的提示；see-through 的深度 → 轉頭的深度；設定 JSON 的 seeThrough；
 * - `tests/unit/fixtures/anime-rig/` 的合成 PSD 和產生它的程式（tests/helpers/animeRigSeeThrough.ts）相同
 *   （`UPDATE_FIXTURES=1 npx vitest run tests/unit/anime-rig-see-through.test.ts` 重新產生）。
 */
import { describe, expect, it } from 'vitest';
import { loadAgPsd } from '../../src/core/decode';
import { genericParts } from '../../src/tools/anime-rig/genericParts';
import { defaultParams } from '../../src/tools/anime-rig/params';
import {
  buildRig,
  cleanPsdLayers,
  imageLayersOf,
  normName,
  type PsdRoot,
  type Rig,
} from '../../src/tools/anime-rig/rigger';
import { warningText } from '../../src/tools/anime-rig/rigText';
import { parseSettings } from '../../src/tools/anime-rig/runtime';
import {
  blendDepth,
  type DepthPart,
  isGrayPsdHeader,
  isSeeThroughJson,
  type LayerRect,
  mapSeeThroughDepth,
  measureDepth,
  rebaseDepth,
  validateDepthHeader,
} from '../../src/tools/anime-rig/seeThrough';
import { clonePsd, rigTestPsdBytes, type TestPsd } from '../helpers/animeRig';
import {
  ST_SIZE,
  type StPart,
  seeThroughColorBytes,
  seeThroughColorPsd,
  seeThroughDepthBytes,
  seeThroughDepthLayers,
  seeThroughJson,
  seeThroughParts,
  writeGrayPsd,
} from '../helpers/animeRigSeeThrough';

interface NodeFs {
  readFileSync(p: string): Uint8Array;
  writeFileSync(p: string, data: Uint8Array | string): void;
  existsSync(p: string): boolean;
  mkdirSync(p: string, o: { recursive: boolean }): void;
}
const dyn = <T>(name: string): Promise<T> => import(/* @vite-ignore */ name) as Promise<T>;
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
const FIXTURES = new URL('./fixtures/anime-rig/', import.meta.url).pathname;

const bind = (psd: TestPsd): Rig => {
  const tree = clonePsd(psd) as unknown as PsdRoot;
  cleanPsdLayers(tree);
  return buildRig(tree, { generic: genericParts() });
};

const part = (rig: Rig, name: string) => {
  const p = rig.layers.find((l) => l.name === name);
  if (!p) throw new Error(`no part ${name}: ${rig.layers.map((l) => l.name).join(',')}`);
  return p;
};

/** 部件的重心 x（透明度加權，畫布座標） */
const centroidX = (p: Rig['layers'][number]) => {
  let s = 0;
  let sx = 0;
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const a = p.img.data[(y * p.w + x) * 4 + 3];
      s += a;
      sx += (x + p.x) * a;
    }
  return sx / s;
};

describe('左右分割的名稱（F98）', () => {
  it.each([
    ['irides-r', 'irides_l'],
    ['irides-l', 'irides_r'],
    ['eyewhite-r', 'eyewhite_l'],
    ['eyelash-l', 'eyelash_r'],
    ['eyebrow-r', 'eyebrow_l'],
    ['handwear-r', 'handwear_l'],
    ['ears-l', 'ears_r'],
    ['Eyebrow_L', 'eyebrow_r'],
    ['IRIDES R', 'irides_l'],
    ['Irides－Ｌ', 'irides_r'],
    ['瞳-r', 'irides_l'],
    ['ear_R', 'ears_l'],
    ['eye_close-l', 'eye_close_r'],
    ['eye_close2-r', 'eye_close2_l'],
    ['handwear-1-r', 'handwear_1_l'],
    ['handwear-r-0', 'handwear_0_l'],
    ['handwear_2_l', 'handwear_2_r'],
    ['handwear-1', 'handwear_1'],
    ['hairf', 'front hair'],
    ['hairb', 'back hair'],
    ['hairf_2', 'front hair_2'],
    /* 不分左右的部位、沒有分隔符號的寫法照舊 */
    ['hair-l', 'hair-l'],
    ['tail-r', 'tail-r'],
    ['eyel', 'eyel'],
    ['browr', 'browr'],
    ['eyewhite', 'eyewhite'],
  ])('%s → %s', (raw, want) => {
    expect(normName(raw)).toBe(want);
  });
});

describe('名稱已分好左右的圖層（F99、F100）', () => {
  const split = () => seeThroughColorPsd(seeThroughParts({ split: true }));
  const unsplit = () => seeThroughColorPsd(seeThroughParts({ split: false }));

  it('see-through 的 -r（畫面左邊）→ 左、-l → 右；不再自動分左右、沒有警告', () => {
    const rig = bind(split());
    const face = rig.anchors.face.cx;
    for (const bn of ['eyewhite', 'irides', 'eyelash', 'eyebrow', 'handwear', 'ears']) {
      const l = part(rig, `${bn}_l`);
      const r = part(rig, `${bn}_r`);
      expect(l.side).toBe('L');
      expect(r.side).toBe('R');
      expect(l.source).toBe(`${bn}-r`);
      expect(r.source).toBe(`${bn}-l`);
      expect(centroidX(l)).toBeLessThan(face);
      expect(centroidX(r)).toBeGreaterThan(face);
    }
    expect(rig.presplit).toBe(12);
    expect(rig.warnings.map((w) => w.code)).toEqual(['synthEye', 'synthMouth']);
    /* 左眼的錨點在畫面左邊；內建的閉眼也放在兩邊 */
    expect(rig.anchors.eyeL!.icx).toBeLessThan(face);
    expect(rig.anchors.eyeR!.icx).toBeGreaterThan(face);
    expect(part(rig, 'eye_close_l').side).toBe('L');
    expect(part(rig, 'eye_close_r').side).toBe('R');
    /* 部件的來源（深度 PSD 的對應用） */
    expect(rig.sources).toHaveLength(rig.layers.length);
    const names = imageLayersOf(split() as unknown as PsdRoot).map((l) => l.name);
    rig.layers.forEach((p, i) => {
      if (p.synthetic) expect(rig.sources[i]).toBe(-1);
      else expect(names[rig.sources[i]]).toBe(p.source);
    });
  });

  it('和不分左右的同一張圖自動分左右的結果相同（部件、像素、錨點）', () => {
    const a = bind(split());
    const b = bind(unsplit());
    for (const bn of ['eyewhite', 'irides', 'eyelash', 'eyebrow', 'eye_close'])
      for (const s of ['l', 'r']) {
        const pa = part(a, `${bn}_${s}`);
        const pb = part(b, `${bn}_${s}`);
        const { img: ia, z: _za, source: _sa, ...ma } = pa;
        const { img: ib, z: _zb, source: _sb, ...mb } = pb;
        expect(ma).toEqual(mb);
        expect(Array.from(ia.data)).toEqual(Array.from(ib.data));
      }
    expect(a.anchors).toEqual(b.anchors);
  });

  it('名稱已分好左右的圖層裡有兩塊時也不再分', () => {
    const parts = seeThroughParts({ split: false }).map((p) =>
      p.tag === 'irides' ? { ...p, tag: 'irides-r' } : p,
    );
    const rig = bind(seeThroughColorPsd(parts));
    const irides = rig.layers.filter((l) => l.name.startsWith('irides'));
    expect(irides.map((l) => l.name)).toEqual(['irides_l']);
    expect(irides[0].w).toBeGreaterThan(40); /* 兩隻眼睛都在這一個部件裡 */
  });

  it('名稱的左右和位置相反（另一種命名方式）：依位置對調並警告', () => {
    const swapped = seeThroughParts({ split: true }).map((p) => ({
      ...p,
      tag: p.tag.replace(/-(l|r)$/, (_, s) => (s === 'l' ? '-r' : '-l')),
    }));
    const rig = bind(seeThroughColorPsd(swapped));
    const ok = bind(split());
    for (const bn of ['eyewhite', 'irides', 'eyelash', 'eyebrow', 'handwear', 'ears']) {
      expect(centroidX(part(rig, `${bn}_l`))).toBeLessThan(rig.anchors.face.cx);
      expect(part(rig, `${bn}_l`).source).toBe(`${bn}-l`);
    }
    expect(rig.anchors).toEqual(ok.anchors);
    const swaps = rig.warnings.filter((w) => w.code === 'sideSwapped');
    expect(swaps.map((w) => w.args[0])).toEqual([
      'handwear',
      'ears',
      'eyewhite',
      'irides',
      'eyelash',
      'eyebrow',
    ]);
    expect(warningText(swaps[0])).toBe('「handwear」的左右名稱和位置相反，已依實際位置判斷左右。');
  });

  it('只有一邊時依名稱', () => {
    const parts = seeThroughParts({ split: true }).filter((p) => p.tag !== 'irides-r');
    const rig = bind(seeThroughColorPsd(parts));
    expect(rig.layers.filter((l) => l.name.startsWith('irides')).map((l) => l.name)).toEqual([
      'irides_r',
    ]);
  });
});

/* ---------- 深度 ---------- */

async function readTree(bytes: Uint8Array): Promise<PsdRoot> {
  const { readPsd } = await loadAgPsd();
  return readPsd(bytes, {
    useImageData: true,
    skipThumbnail: true,
    skipCompositeImageData: true,
  }) as PsdRoot;
}

const rectsOf = (psd: PsdRoot): LayerRect[] =>
  imageLayersOf(psd).map((l) => ({
    left: l.left ?? 0,
    top: l.top ?? 0,
    right: l.right ?? 0,
    bottom: l.bottom ?? 0,
  }));

/** 和 Worker 一樣：讀彩色 PSD → 範圍 → 去雜點 */
async function colorTree(parts: StPart[] = seeThroughParts()) {
  const psd = await readTree(seeThroughColorBytes(parts));
  const rects = rectsOf(psd);
  cleanPsdLayers(psd);
  return { psd, rects };
}

describe('深度 PSD 與 .psd.json（F101、F102）', () => {
  const parts = seeThroughParts();
  const want = parts.map((p) => Math.round((p.depth / 255) * 1e4) / 1e4);

  it('檔頭：灰階或 RGB 的 8 位元', () => {
    const gray = seeThroughDepthBytes();
    expect(validateDepthHeader(gray.slice().buffer)).toEqual({ w: 256, h: 256, gray: true });
    expect(validateDepthHeader(rigTestPsdBytes().slice().buffer).gray).toBe(false);
    expect(isGrayPsdHeader(gray)).toBe(true);
    expect(isGrayPsdHeader(rigTestPsdBytes())).toBe(false);
    expect(() => validateDepthHeader(new ArrayBuffer(10))).toThrow('太短');
    const bad = gray.slice();
    bad[23] = 16;
    expect(() => validateDepthHeader(bad.buffer)).toThrow('8 位元');
  });

  it('深度 PSD：每個圖層的深度＝部件像素底下的中位數 ÷ 255', async () => {
    const { psd, rects } = await colorTree();
    const depth = await readTree(seeThroughDepthBytes());
    const m = measureDepth(psd, rects, depth, null);
    expect(m.values).toEqual(want);
    expect(m.matched).toBe(parts.length);
    expect(m.total).toBe(parts.length);
    expect(m.used).toEqual({ psd: true, json: false });
    expect(m.issues).toEqual([]);
  });

  it('.psd.json：depth_median', async () => {
    const { psd, rects } = await colorTree();
    const json = seeThroughJson();
    expect(isSeeThroughJson(json)).toBe(true);
    expect(isSeeThroughJson({ format: 'anime25d-settings', parts: {} })).toBe(false);
    const m = measureDepth(psd, rects, null, json);
    expect(m.values).toEqual(want);
    expect(m.used).toEqual({ psd: false, json: true });
  });

  it('對不上：尺寸、少了圖層、多了圖層、位置不同、不是灰階、json 的尺寸', async () => {
    const { psd, rects } = await colorTree();
    /* 尺寸不同：整個不用 */
    const small = await readTree(writeGrayPsd(128, 128, []));
    expect(measureDepth(psd, rects, small, null)).toMatchObject({
      matched: 0,
      issues: [{ code: 'size', args: ['128 × 128', '256 × 256'] }],
    });
    /* 少了一個、改了名字的一個（＝少一個＋多一個）、移動了的一個 */
    const layers = seeThroughDepthLayers()
      .filter((l) => l.name !== 'nose')
      .map((l) =>
        l.name === 'headwear'
          ? { ...l, name: 'hat' }
          : l.name === 'front hair'
            ? { ...l, left: l.left + 2 }
            : l,
      );
    const m = measureDepth(psd, rects, await readTree(writeGrayPsd(256, 256, layers)), null);
    expect(m.matched).toBe(parts.length - 2);
    expect(m.values[parts.findIndex((p) => p.tag === 'nose')]).toBeNull();
    expect(m.issues).toEqual([
      { code: 'offset', args: ['front hair'] },
      { code: 'extra', args: ['1'] },
      { code: 'missing', args: ['nose', 'headwear'] },
    ]);
    /* 給錯了彩色的 PSD */
    const colorful = await readTree(seeThroughColorBytes(parts));
    expect(measureDepth(psd, rects, colorful, null).issues).toEqual([
      { code: 'notGray', args: [] },
    ]);
    /* json 的尺寸不同 */
    const json = { ...seeThroughJson(), frame_size: [300, 256] };
    expect(measureDepth(psd, rects, null, json)).toMatchObject({
      matched: 0,
      issues: [{ code: 'jsonSize', args: ['256 × 300', '256 × 256'] }],
    });
  });

  it('深度 PSD 沒給到的圖層用 .psd.json 補', async () => {
    const { psd, rects } = await colorTree();
    const layers = seeThroughDepthLayers().filter((l) => l.name !== 'nose');
    const m = measureDepth(psd, rects, await readTree(writeGrayPsd(256, 256, layers)), {
      ...seeThroughJson(),
    });
    expect(m.values).toEqual(want);
    expect(m.used).toEqual({ psd: true, json: true });
    expect(m.issues).toEqual([]);
  });
});

describe('see-through 的深度 → 轉頭的深度（規格 3.7）', () => {
  /** 合成 PSD 綁定後的部件＋深度 */
  const fixture = () => {
    const rig = bind(seeThroughColorPsd());
    const parts = seeThroughParts();
    const ps: DepthPart[] = rig.layers.map((p) => ({
      id: `${p.z}:${p.name}`,
      bn: p.name === 'eye_close2' ? p.name : p.name.replace(/_(l|r)$/, '').replace(/_\d+$/, ''),
      unknown: !!p.unknown,
      synthetic: !!p.synthetic,
      table: p.depth,
    }));
    const values: Record<string, number> = {};
    rig.layers.forEach((p, i) => {
      const src = rig.sources[i];
      if (src >= 0) values[`${p.z}:${p.name}`] = parts[src].depth / 255;
    });
    const id = (name: string) => ps.find((p) => p.id.endsWith(`:${name}`))!.id;
    return { ps, values, id };
  };

  it('倍率以頭髮配合部位表、臉＝1；臉的表面與身體維持部位表', () => {
    const { ps, values, id } = fixture();
    const map = mapSeeThroughDepth(ps, values);
    expect(map.reason).toBeNull();
    /* K＝Σxy÷Σx²：x＝(102 − 84)／255、(102 − 158)／255，y＝0.28、−0.45 */
    const xf = 18 / 255;
    const xb = -56 / 255;
    const K = (xf * 0.28 + xb * -0.45) / (xf * xf + xb * xb);
    expect(map.scale).toBeCloseTo(K, 2);
    expect(map.face).toBeCloseTo(102 / 255, 4);
    const d = (name: string) => map.mapped[id(name)];
    expect(d('front hair')).toBeCloseTo(1 + K * xf, 2);
    expect(d('back hair')).toBeCloseTo(1 + K * xb, 2);
    expect(d('headwear')).toBeCloseTo(1 + (K * 12) / 255, 2);
    /* 畫面左邊的手（see-through 的 handwear-r）在身體後面、右邊的在前面 */
    expect(d('handwear_l')).toBeCloseTo(1 - (K * 31) / 255, 2);
    expect(d('handwear_r')).toBeCloseTo(1 + (K * 10) / 255, 2);
    expect(d('ears_l')).toBeCloseTo(1 - (K * 8) / 255, 2);
    /* 前後：瀏海 ＞ 頭飾 ＞ 臉（1）＞ 耳朵 ＞ 後髮 */
    expect(d('front hair')).toBeGreaterThan(d('headwear'));
    expect(d('headwear')).toBeGreaterThan(1);
    expect(d('ears_l')).toBeLessThan(1);
    expect(d('back hair')).toBeLessThan(d('ears_l'));
    for (const n of ['face', 'eyewhite_l', 'irides_r', 'nose', 'mouth_open', 'topwear', 'neck'])
      expect(map.mapped[id(n)]).toBeUndefined();
    expect(Object.keys(map.mapped)).toHaveLength(7);
  });

  it('換算不了：沒有臉、沒有頭髮、太平、前後相反', () => {
    const { ps, values, id } = fixture();
    const without = (...names: string[]) =>
      Object.fromEntries(
        Object.entries(values).filter(([k]) => !names.some((n) => k.endsWith(`:${n}`))),
      );
    expect(mapSeeThroughDepth(ps, without('face')).reason).toBe('noFace');
    expect(mapSeeThroughDepth(ps, without('front hair', 'back hair')).reason).toBe('noHair');
    const flat = { ...values, [id('front hair')]: 102 / 255, [id('back hair')]: 102.5 / 255 };
    expect(mapSeeThroughDepth(ps, flat).reason).toBe('flat');
    const reversed = { ...values, [id('front hair')]: 150 / 255, [id('back hair')]: 60 / 255 };
    expect(mapSeeThroughDepth(ps, reversed)).toMatchObject({ reason: 'reversed', mapped: {} });
  });

  it('瀏海至少 1.0、後髮最多 1.0、倍率 0.5～20、深度 0～2', () => {
    const { ps, values, id } = fixture();
    /* 第二個瀏海（編號）比臉遠：夾到 1.0 */
    const ps2 = [
      ...ps,
      { id: '99:front hair_2', bn: 'front hair', unknown: false, synthetic: false, table: 1.28 },
    ];
    const v2 = { ...values, '99:front hair_2': 120 / 255 };
    expect(mapSeeThroughDepth(ps2, v2).mapped['99:front hair_2']).toBe(1);
    /* 頭髮與臉只差一點點 → 倍率夾在 20，後面的手（畫面左邊）夾到 0 */
    const tiny = { ...values, [id('front hair')]: 100 / 255, [id('back hair')]: 104 / 255 };
    const m = mapSeeThroughDepth(ps, tiny);
    expect(m.scale).toBe(20);
    expect(m.mapped[id('handwear_l')]).toBe(0);
    expect(m.mapped[id('back hair')]).toBeLessThanOrEqual(1);
  });

  it('開關、強度、手動的差距', () => {
    expect(blendDepth(1.28, 1.157, true, 1)).toBe(1.157);
    expect(blendDepth(1.28, 1.157, true, 0)).toBe(1.28);
    expect(blendDepth(1.28, 1.16, true, 0.5)).toBe(1.22);
    expect(blendDepth(1.28, 1.157, false, 1)).toBe(1.28);
    expect(blendDepth(0.96, undefined, true, 1)).toBe(0.96);
    /* 手動改過（1.28 → 1.4）：換算後保留 +0.12 */
    expect(rebaseDepth(1.4, 1.28, 1.157)).toBe(1.277);
    expect(rebaseDepth(1.277, 1.157, 1.28)).toBe(1.4);
    expect(rebaseDepth(1.9, 1, 1.5)).toBe(2);
    expect(rebaseDepth(0.7, 0.86, 0.86)).toBe(0.7);
  });
});

describe('設定 JSON 的 seeThrough（規格 3.3）', () => {
  const ids = ['0:back hair', '1:face', '2:front hair'];
  const base = {
    format: 'anime25d-settings',
    version: 2,
    modelId: 'm',
    params: {},
    preset: null,
    auto: {},
    background: 'checker',
    layers: [],
  };

  it('讀得到、夾範圍、只留這個模型有的圖層；沒有時不寫', () => {
    const r = parseSettings(
      {
        ...base,
        seeThrough: {
          on: false,
          strength: 3,
          file: 'a_depth.psd',
          values: { '0:back hair': 0.62, '2:front hair': -1, '9:gone': 0.5 },
        },
      },
      'm',
      ids,
      defaultParams(),
    );
    expect(r.seeThrough).toEqual({
      on: false,
      strength: 1,
      file: 'a_depth.psd',
      values: { '0:back hair': 0.62, '2:front hair': 0 },
    });
    expect('seeThrough' in parseSettings(base, 'm', ids, defaultParams())).toBe(false);
    const none = parseSettings(
      { ...base, seeThrough: { on: true, strength: 1, values: { '9:gone': 0.5 } } },
      'm',
      ids,
      defaultParams(),
    );
    expect('seeThrough' in none).toBe(false);
  });

  it('結構不對時是錯誤', () => {
    for (const bad of [
      { on: 'yes', strength: 1, values: {} },
      { on: true, values: {} },
      { on: true, strength: 1, values: [] },
      { on: true, strength: 1, values: { '1:face': 'x' } },
    ])
      expect(() => parseSettings({ ...base, seeThrough: bad }, 'm', ids, defaultParams())).toThrow(
        '深度的設定不正確',
      );
  });
});

describe('測試用的合成 PSD（tests/unit/fixtures/anime-rig/）', async () => {
  const fs = await dyn<NodeFs>('node:fs');
  const files: Record<string, Uint8Array> = {
    'see-through.psd': seeThroughColorBytes(),
    'see-through_depth.psd': seeThroughDepthBytes(),
    'see-through.psd.json': new TextEncoder().encode(`${JSON.stringify(seeThroughJson())}\n`),
  };
  if (env?.UPDATE_FIXTURES || !fs.existsSync(`${FIXTURES}see-through.psd`)) {
    fs.mkdirSync(FIXTURES, { recursive: true });
    for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(FIXTURES + name, bytes);
  }

  it.each(Object.keys(files))('%s 和產生的程式相同', (name) => {
    expect(Array.from(fs.readFileSync(FIXTURES + name))).toEqual(Array.from(files[name]));
  });

  it('尺寸', () => {
    expect(ST_SIZE).toBe(256);
  });
});
