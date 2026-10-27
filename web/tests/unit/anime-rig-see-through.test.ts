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
import { clonePsd, ellipse, rect, rigTestPsdBytes, type TestPsd } from '../helpers/animeRig';
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
    expect(swaps.map((w) => w.args)).toEqual(
      ['handwear', 'ears', 'eyewhite', 'irides', 'eyelash', 'eyebrow'].map((s) => [s, 'pair']),
    );
    expect(warningText(swaps[0])).toBe('「handwear」的左右名稱和兩層的位置相反，已依位置對調。');
  });

  it('臉偏一邊、名稱一左一右：依兩層的位置（不看臉中心）', () => {
    /* 臉往右偏：兩隻眼睛都在臉中心的左邊 */
    const parts = seeThroughParts({ split: true }).map((p) =>
      p.tag === 'face'
        ? { ...p, paint: ellipse(170, 100, 46, 56, [250, 220, 200] as [number, number, number]) }
        : p,
    );
    const rig = bind(seeThroughColorPsd(parts));
    expect(rig.anchors.face.cx).toBeGreaterThan(150);
    for (const bn of ['eyewhite', 'irides', 'eyelash', 'eyebrow']) {
      expect(part(rig, `${bn}_l`).source).toBe(`${bn}-r`);
      expect(part(rig, `${bn}_r`).source).toBe(`${bn}-l`);
    }
    expect(rig.anchors.eyeL!.icx).toBeLessThan(rig.anchors.eyeR!.icx);
    expect(rig.warnings.some((w) => w.code === 'sideSwapped')).toBe(false);
    expect(rig.warnings.some((w) => w.code === 'eyeAnchor')).toBe(false);
  });

  const irides = (rig: Rig) =>
    rig.layers.filter((l) => l.name.startsWith('irides')).map((l) => [l.name, l.source]);

  it('只有一邊、名稱與位置一致：沒有警告', () => {
    const parts = seeThroughParts({ split: true }).filter((p) => p.tag !== 'irides-r');
    const rig = bind(seeThroughColorPsd(parts));
    expect(irides(rig)).toEqual([['irides_r', 'irides-l']]);
    expect(rig.warnings.some((w) => w.code === 'sideSwapped')).toBe(false);
  });

  it('只有一邊、名稱與位置相反（手做的 PSD 用底線 _l＝畫面左邊）：依位置並警告', () => {
    const parts = seeThroughParts({ split: true })
      .filter((p) => p.tag !== 'irides-l')
      .map((p) => (p.tag === 'irides-r' ? { ...p, tag: 'irides_l' } : p));
    const rig = bind(seeThroughColorPsd(parts));
    /* 名稱依 see-through 的方向是右，但圖在臉中心的左邊 → 左 */
    expect(irides(rig)).toEqual([['irides_l', 'irides_l']]);
    const swaps = rig.warnings.filter((w) => w.code === 'sideSwapped');
    expect(swaps.map((w) => w.args)).toEqual([['irides', 'L']]);
    expect(warningText(swaps[0])).toBe('「irides」的名稱是右邊，但在臉中心的左邊，已依位置判斷。');
    expect(rig.anchors.eyeL!.icx).toBeCloseTo(bind(split()).anchors.eyeL!.icx, 6);
  });

  it('沒有臉時：單層照名稱（不警告），成對的照樣依兩層的位置', () => {
    const noFace = seeThroughParts({ split: true }).filter((p) => p.tag !== 'face');
    /* 單層：畫面左邊的瞳孔取名 irides-l（see-through 的方向＝右） */
    const single = noFace
      .filter((p) => p.tag !== 'irides-l')
      .map((p) => (p.tag === 'irides-r' ? { ...p, tag: 'irides-l' } : p));
    const rig = bind(seeThroughColorPsd(single));
    expect(rig.warnings.map((w) => w.code)).toContain('noFace');
    expect(rig.warnings.some((w) => w.code === 'sideSwapped')).toBe(false);
    const r = part(rig, 'irides_r');
    expect(r.source).toBe('irides-l');
    expect(centroidX(r)).toBeLessThan(128);
    /* 成對而且名稱相反：依兩層的位置對調 */
    const swapped = noFace.map((p) => ({
      ...p,
      tag: p.tag.replace(/-(l|r)$/, (_, s) => (s === 'l' ? '-r' : '-l')),
    }));
    const rig2 = bind(seeThroughColorPsd(swapped));
    expect(part(rig2, 'irides_l').source).toBe('irides-l');
    expect(centroidX(part(rig2, 'irides_l'))).toBeLessThan(128);
    expect(rig2.warnings.filter((w) => w.code === 'sideSwapped')).toHaveLength(6);
  });

  it('重心在臉中心附近（臉寬 × 0.05 以內）時照名稱', () => {
    const parts: StPart[] = [
      ...seeThroughParts({ split: false }),
      /* 臉的中心約 x 127.5、臉寬 92 → 4.6 px 以內 */
      { tag: 'eyebrow-l', paint: rect(120, 60, 137, 63, [80, 40, 60]), depth: 96 },
    ];
    const rig = bind(seeThroughColorPsd(parts));
    const p = rig.layers.find((l) => l.source === 'eyebrow-l')!;
    expect(Math.abs(centroidX(p) - rig.anchors.face.cx)).toBeLessThan(4.6);
    expect(p.name).toBe('eyebrow_r');
    expect(rig.warnings.some((w) => w.code === 'sideSwapped')).toBe(false);
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

  it('沒有可用的深度（heuristic_partseg 的 0／1）：有 json 時改用 json、沒有時不用', async () => {
    const { psd, rects } = await colorTree();
    const binary = seeThroughDepthLayers().map((l) => ({
      ...l,
      gray: l.gray.map((v) => (v === 255 ? 1 : 0)),
    }));
    const depth = await readTree(writeGrayPsd(256, 256, binary));
    const alone = measureDepth(psd, rects, depth, null);
    expect(alone).toMatchObject({ matched: 0, issues: [{ code: 'degenerate', args: [''] }] });
    expect(alone.values.every((v) => v === null)).toBe(true);
    const withJson = measureDepth(psd, rects, depth, seeThroughJson());
    expect(withJson.values).toEqual(want);
    expect(withJson.used).toEqual({ psd: false, json: true });
    expect(withJson.issues).toEqual([{ code: 'degenerate', args: ['json'] }]);
    /* 全部同一個值也算 */
    const flat = seeThroughDepthLayers().map((l) => ({ ...l, gray: l.gray.map(() => 120) }));
    expect(
      measureDepth(psd, rects, await readTree(writeGrayPsd(256, 256, flat)), null).issues,
    ).toEqual([{ code: 'degenerate', args: [''] }]);
  });

  it('一個圖層名稱都對不上：noMatch（不是「多出 N 個」）', async () => {
    const { psd, rects } = await colorTree();
    const renamed = seeThroughDepthLayers().map((l) => ({ ...l, name: `x ${l.name}` }));
    const m = measureDepth(psd, rects, await readTree(writeGrayPsd(256, 256, renamed)), null);
    expect(m).toMatchObject({ matched: 0, issues: [{ code: 'noMatch', args: [] }] });
    const json = { parts: { nothing: { depth_median: 0.5 } }, frame_size: [256, 256] };
    expect(measureDepth(psd, rects, null, json).issues).toEqual([{ code: 'noMatch', args: [] }]);
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
    const m2 = mapSeeThroughDepth(ps2, v2);
    expect(m2.mapped['99:front hair_2']).toBe(1);
    expect(m2.limit).toBeNull();
    expect(m2.clamped).toEqual([{ id: '99:front hair_2', from: expect.any(Number), to: 1 }]);
    expect(m2.clamped[0].from).toBeLessThan(1);
    /* 頭髮與臉只差一點點 → 倍率夾在 20，後面的手（畫面左邊）夾到 0 */
    const tiny = { ...values, [id('front hair')]: 100 / 255, [id('back hair')]: 104 / 255 };
    const m = mapSeeThroughDepth(ps, tiny);
    expect(m.scale).toBe(20);
    expect(m.limit).toBe('max');
    expect(m.mapped[id('handwear_l')]).toBe(0);
    expect(m.clamped.map((c) => c.id)).toContain(id('handwear_l'));
    expect(mapSeeThroughDepth(ps, values).limit).toBeNull();
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
