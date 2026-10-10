/**
 * 立繪去背工具（bg-remover）2026-10 的擴充：
 * - AI 的遮罩套色階（存著的 8 位元遮罩照原作無條件捨去；用的時候 ≤ 5 → 0、≥ 204 → 255，舊遮罩同一套規則）；
 * - 純色背景可以有多個背景色、混色也算背景；只有一個背景色時輸出不變；
 * - 新的去背方式「AI＋背景色」的合併規則；
 * - 去掉孤島（邊緣調整的第一步）；
 * - 新設定的修正與舊存檔、專案檔（版本 1）的 migrate。
 */
import { describe, expect, it } from 'vitest';
import { decodePng } from '@/core/decode/png';
import { encodePng } from '@/core/encode/png';
import {
  applyMask,
  colorKeyMask,
  decontaminate,
  growMask,
  type Mask,
  removeIslands,
} from '@/core/image';
import {
  defaultSettings,
  migrateSettings,
  normalizeSettings,
  PROJECT_VERSION,
} from '@/tools/bg-remover/model';
import {
  AI_LEVELS,
  aiBase,
  colorBase,
  comboBase,
  comboMask,
  cutoutColors,
  decodeMaskPng,
  encodeMaskPng,
  type KeyParams,
  keyParamsOf,
  refineMask,
  type SourceImage,
} from '@/tools/bg-remover/pipeline';
import { createPixelApi } from '@/tools/bg-remover/pixelApi';

const WHITE = [255, 255, 255];
const PURPLE = [144, 120, 153];
const ORANGE = [230, 130, 50];
const DARK = [30, 20, 40];

/**
 * 60 × 40：左白右紫（x ≥ 30）。角色（橘）在中間；左邊連著一塊白荷葉邊（和白底同色）；右邊連著深色的翅膀；
 * 右上角一塊和角色同色的橘色方塊（背景的花紋）。
 */
function scene(): SourceImage {
  const w = 60;
  const h = 40;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let c = x < 30 ? WHITE : PURPLE;
      if (x >= 20 && x < 40 && y >= 10 && y < 35) c = ORANGE;
      if (x >= 14 && x < 20 && y >= 10 && y < 30) c = [252, 252, 250];
      if (x >= 40 && x < 52 && y >= 14 && y < 20) c = DARK;
      if (x >= 54 && x < 58 && y >= 2 && y < 6) c = ORANGE;
      rgba.set([...c, 255], (y * w + x) * 4);
    }
  }
  return { width: w, height: h, rgba };
}

/**
 * 「AI」存著的遮罩（照原作的 8 位元）：角色與荷葉邊 254（模型輸出到不了 1.0）、翅膀 100（AI 沒認出來）、
 * 荷葉邊外一圈 60（AI 的半透明邊，底下是白底）、其他 3（看不到的淡霧）
 */
function storedAi(src: SourceImage): Mask {
  const { width: w, height: h } = src;
  const m = new Uint8Array(w * h) as Mask;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 3;
      if (x >= 10 && x < 14 && y >= 10 && y < 30) v = 60;
      if (x >= 14 && x < 40 && y >= 10 && y < 35) v = 254;
      if (x >= 14 && x < 20 && y >= 30) v = 3;
      if (x >= 40 && x < 52 && y >= 14 && y < 20) v = 100;
      m[y * w + x] = v;
    }
  }
  return m;
}

const at = (m: Uint8Array, x: number, y: number, w = 60) => m[y * w + x];

const keyParams = (over: Partial<KeyParams> = {}): KeyParams => ({
  color: null,
  extra: [[144, 120, 153]],
  blend: true,
  tolerance: 6,
  softness: 6,
  connected: true,
  ...over,
});

describe('bg-remover：AI 的遮罩套色階', () => {
  it('色階：≤ 5 → 0、≥ 204 → 255、中間線性；存著的 8 位元遮罩（舊版捨去的也一樣）讀回時套用', async () => {
    expect(AI_LEVELS).toEqual({ lo: 5, hi: 204 });
    const stored = Uint8Array.from([0, 3, 5, 6, 60, 100, 203, 204, 254, 255]) as Mask;
    const want = [
      0,
      0,
      0,
      1,
      Math.round((55 * 255) / 199),
      Math.round((95 * 255) / 199),
      254,
      255,
      255,
      255,
    ];
    expect(Array.from(aiBase(stored))).toEqual(want);
    /* 存成 PNG（舊版存的就是這種）再讀回 */
    const png = await encodeMaskPng(stored, 10, 1);
    expect(Array.from(decodeMaskPng(png).mask)).toEqual(Array.from(stored));
    expect(Array.from(aiBase(decodeMaskPng(png).mask))).toEqual(want);
  });
});

describe('bg-remover：AI＋背景色的合併', () => {
  const src = scene();
  const ai = aiBase(storedAi(src));

  it('AI 認定是角色（色階後 255）的地方留下：和白底同色、連到圖外的荷葉邊也留著', () => {
    const r = comboBase(src, ai, keyParams());
    expect(at(r.mask, 16, 20)).toBe(255);
    expect(at(r.mask, 30, 20)).toBe(255);
  });

  it('AI 沒認出來、和角色相連的深色翅膀：照背景色的結果補回（完全不透明）', () => {
    expect(at(ai, 45, 16)).toBeLessThan(255);
    const r = comboBase(src, ai, keyParams());
    expect(at(r.mask, 45, 16)).toBe(255);
  });

  it('AI 的半透明邊、淡霧蓋在背景色上：去掉', () => {
    const r = comboBase(src, ai, keyParams());
    expect(at(ai, 11, 20)).toBeGreaterThan(0);
    expect(at(r.mask, 11, 20)).toBe(0);
    expect(at(r.mask, 2, 2)).toBe(0);
    expect(at(r.mask, 50, 30)).toBe(0);
  });

  it('和角色分開的方塊（不是背景色、AI 也沒選）：不會被背景色加回來', () => {
    const r = comboBase(src, ai, keyParams());
    const key = colorBase(src, keyParams());
    expect(at(key.mask, 55, 3)).toBe(255);
    expect(at(r.mask, 55, 3)).toBe(0);
  });

  it('規則：AI 255 → 255；否則背景色 0 → 0；否則 max(AI, 背景色裡連到 AI 角色的部分)', () => {
    const w = 8;
    const h = 1;
    /* 背景色結果：0 0 | 255 255（連到 AI 的塊）| 0 | 200（孤立）| 100 255 */
    const key = Uint8Array.from([0, 0, 255, 255, 0, 200, 100, 255]) as Mask;
    const aiM = Uint8Array.from([255, 90, 255, 30, 40, 50, 60, 0]) as Mask;
    expect(Array.from(comboMask(aiM, key, w, h))).toEqual([255, 0, 255, 255, 0, 50, 60, 0]);
  });

  it('只有一個背景色、沒有角色時：AI 沒有 255 的地方，背景色一律不加回', () => {
    const r = comboMask(
      Uint8Array.from([0, 100, 0]) as Mask,
      Uint8Array.from([255, 255, 0]) as Mask,
      3,
      1,
    );
    expect(Array.from(r)).toEqual([0, 100, 0]);
  });
});

describe('bg-remover：多個背景色', () => {
  const src = scene();

  it('自動偵測只用四邊最多的一色；另外列出四邊其他常見的顏色（≥ 10%）當建議', () => {
    const r = colorBase(src, keyParams({ extra: [] }));
    expect(r.bg).toEqual([255, 255, 255]);
    expect(r.suggest.map((c) => c.color)).toEqual([[255, 255, 255], PURPLE]);
    expect(r.suggest[1].ratio).toBeGreaterThan(0.1);
  });

  it('白＋紫：兩邊的背景都去掉，角色、翅膀、方塊留著（純色背景照樣只看顏色）', () => {
    const r = colorBase(src, keyParams({ tolerance: 12, softness: 8 }));
    expect(at(r.mask, 2, 2)).toBe(0);
    expect(at(r.mask, 50, 30)).toBe(0);
    expect(at(r.mask, 30, 20)).toBe(255);
    expect(at(r.mask, 45, 16)).toBe(255);
    expect(at(r.mask, 55, 3)).toBe(255);
    expect(r.keys).toEqual({ colors: [[255, 255, 255], PURPLE], blend: true });
  });

  it('只有一個背景色：基礎遮罩、去色邊的顏色和單色的做法逐位元組相同（混色開關不影響）', () => {
    for (const blend of [true, false]) {
      const p = keyParams({ extra: [], blend, tolerance: 12, softness: 8 });
      const r = colorBase(src, p);
      const want = colorKeyMask(src.rgba, 60, 40, {
        color: [255, 255, 255],
        tolerance: 12,
        softness: 8,
        connected: true,
      });
      expect(r.mask).toEqual(want);
      const colors = cutoutColors(src, { base: r.mask, keys: r.keys });
      expect(colors).toEqual(
        decontaminate(src.rgba, want, [255, 255, 255], { width: 60, height: 40, edge: 2 }),
      );
    }
  });

  it('設定轉成色鍵的參數：第一色自動或指定；其他背景色；只有一色時混色當成關（不必重算）；AI＋背景色用自己的容許度／柔邊', () => {
    const s = {
      ...defaultSettings(),
      keyAuto: false,
      keyColor: '#ffffff',
      keyExtra: ['#907899'],
      tolerance: 12,
      softness: 8,
    };
    expect(keyParamsOf({ ...s, mode: 'color' })).toEqual({
      color: [255, 255, 255],
      extra: [[0x90, 0x78, 0x99]],
      blend: true,
      tolerance: 12,
      softness: 8,
      connected: true,
    });
    expect(keyParamsOf({ ...s, mode: 'combo' })).toMatchObject({ tolerance: 6, softness: 6 });
    expect(keyParamsOf({ ...s, keyExtra: [], keyAuto: true, mode: 'color' })).toMatchObject({
      color: null,
      extra: [],
      blend: false,
    });
  });
});

describe('bg-remover：去掉孤島（邊緣調整）', () => {
  it('在收縮／擴張、羽化之前；關著（null）時和原本相同', () => {
    const src = scene();
    const key = colorBase(src, keyParams({ tolerance: 12, softness: 8 })).mask;
    expect(refineMask(key, 60, 40, -1, 0, null)).toEqual(refineMask(key, 60, 40, -1, 0));
    const out = refineMask(key, 60, 40, -1, 0, 0.1);
    expect(out).toEqual(growMask(removeIslands(key, 60, 40, { minRatio: 0.1 }), 60, 40, -1));
    expect(at(out, 55, 3)).toBe(0);
    expect(at(out, 30, 20)).toBe(255);
  });
});

describe('bg-remover：匯出（Worker 的同一套函式）', () => {
  const src = scene();
  const pngBlob = async (img: SourceImage) =>
    new Blob([(await encodePng(img.rgba, img.width, img.height)) as Uint8Array<ArrayBuffer>], {
      type: 'image/png',
    });
  const maskBlob = async (m: Mask) =>
    new Blob([(await encodeMaskPng(m, 60, 40)) as Uint8Array<ArrayBuffer>], { type: 'image/png' });
  const output = {
    content: 'mask' as const,
    background: 'transparent' as const,
    bgColor: '#ffffff',
    format: 'png' as const,
    trim: false,
    trimPad: 0,
  };

  it('AI：匯出的遮罩是色階後的（內部 255、淡霧 0）', async () => {
    const api = createPixelApi();
    const r = await api.render({
      key: 'a',
      blob: await pngBlob(src),
      mode: 'ai',
      keyParams: keyParams(),
      aiMask: await maskBlob(storedAi(src)),
      grow: 0,
      feather: 0,
      islands: null,
      despill: true,
      strokes: [],
      output,
    });
    const m = decodePng(r.bytes);
    expect(m.rgba[(20 * 60 + 30) * 4]).toBe(255);
    expect(m.rgba[0]).toBe(0);
  });

  it('AI＋背景色：遮罩照合併規則；去掉孤島開著時也照做', async () => {
    const api = createPixelApi();
    const job = {
      key: 'b',
      blob: await pngBlob(src),
      mode: 'combo' as const,
      keyParams: keyParams(),
      aiMask: await maskBlob(storedAi(src)),
      grow: 0,
      feather: 0,
      islands: null,
      despill: false,
      strokes: [],
      output,
    };
    const want = comboBase(src, aiBase(storedAi(src)), keyParams()).mask;
    const got = decodePng((await api.render(job)).bytes);
    for (let i = 0; i < want.length; i++) expect(got.rgba[i * 4]).toBe(want[i]);
    /* 還沒 AI 去背：和 AI 模式一樣說明 */
    await expect(api.render({ ...job, aiMask: null })).rejects.toThrow('needs-ai');
  });

  it('純色背景只有一個背景色：去背圖和單色的做法逐位元組相同', async () => {
    const api = createPixelApi();
    const p = keyParams({ extra: [], tolerance: 12, softness: 8 });
    const r = await api.render({
      key: 'c',
      blob: await pngBlob(src),
      mode: 'color',
      keyParams: p,
      aiMask: null,
      grow: 0,
      feather: 0,
      islands: null,
      despill: true,
      strokes: [],
      output: { ...output, content: 'cutout' },
    });
    const mask = colorKeyMask(src.rgba, 60, 40, {
      color: [255, 255, 255],
      tolerance: 12,
      softness: 8,
      connected: true,
    });
    const colors = decontaminate(src.rgba, mask, [255, 255, 255], {
      width: 60,
      height: 40,
      edge: 2,
    });
    expect(decodePng(r.bytes).rgba).toEqual(applyMask(colors, mask, { clearTransparent: true }));
  });
});

describe('bg-remover：新設定與舊存檔', () => {
  it('專案檔版本 2', () => {
    expect(PROJECT_VERSION).toBe(2);
  });

  it('預設：其他背景色沒有、混色開、AI＋背景色 6／6、去掉孤島關（保留 1%）', () => {
    const d = defaultSettings();
    expect(d.keyExtra).toEqual([]);
    expect(d.keyBlend).toBe(true);
    expect(d.comboTolerance).toBe(6);
    expect(d.comboSoftness).toBe(6);
    expect(d.islands).toBe(false);
    expect(d.islandKeep).toBe(1);
  });

  it('修正：其他背景色只留合法的色碼（小寫、不重複、最多 3 個＝連第一色共 4 個）；範圍外夾回', () => {
    const s = normalizeSettings({
      mode: 'combo',
      keyExtra: ['#ABCDEF', 'bad', 7, '#123456', '#abcdef', '#111111', '#222222'],
      keyBlend: 'yes',
      comboTolerance: 500,
      comboSoftness: -1,
      islands: true,
      islandKeep: 99,
    });
    expect(s.mode).toBe('combo');
    expect(s.keyExtra).toEqual(['#abcdef', '#123456', '#111111']);
    expect(s.keyBlend).toBe(true);
    expect(s.comboTolerance).toBe(100);
    expect(s.comboSoftness).toBe(0);
    expect(s.islands).toBe(true);
    expect(s.islandKeep).toBe(50);
  });

  it('舊存檔（版本 1：只有一個背景色）：單色設定變成清單的第一個，其他用預設', () => {
    const v1 = {
      mode: 'color',
      backend: 'wasm',
      keyAuto: false,
      keyColor: '#A9DCBB',
      tolerance: 20,
      softness: 3,
      connected: false,
      despill: false,
      grow: -2,
      feather: 1.5,
      content: 'mask',
      background: 'white',
      bgColor: '#123456',
      format: 'webp',
      scope: 'all',
      trim: true,
      trimPad: 4,
      images: [{ id: 'a', name: 'a.png', asset: 'x', width: 10, height: 20, strokes: [] }],
    };
    const s = migrateSettings(v1, 1);
    expect(s).toEqual({
      ...defaultSettings(),
      ...v1,
      keyColor: '#a9dcbb',
      keyExtra: [],
      keyBlend: true,
      comboTolerance: 6,
      comboSoftness: 6,
      islands: false,
      islandKeep: 1,
    });
    expect(keyParamsOf(s)).toEqual({
      color: [0xa9, 0xdc, 0xbb],
      extra: [],
      blend: false,
      tolerance: 20,
      softness: 3,
      connected: false,
    });
  });
});
