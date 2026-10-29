/**
 * 幾何花紋產生器：把種子刻進圖形與從圖片讀回（規格 1.12、3.15、3.16）。
 * - 封包與檢查碼（CRC-16／CRC-8 的標準檢查值；從原作量到的封包位元）；設定的差異文字（從原作量到的）與讀回；
 * - 刻進去：新方式、舊方式都全部刻得進去；用測試用的點陣畫布（tests/helpers/raster.ts）畫出來再讀，讀回同一個種子與設定；
 *   放大後照樣讀得出來、縮到一半讀不出來（和原作相同的容忍度；瀏覽器裡的縮放、JPEG、WebP 在 e2e 與對照腳本）。
 */
import { describe, expect, it } from 'vitest';
import { createRandom } from '@/core/timeline/random';
import {
  codeLayout,
  crc8bits,
  crc16,
  encodeRing,
  fromBits,
  makePacket,
  parsePacket,
  toBits,
} from '@/tools/geo-bloom/code';
import { decodeImage, decodeSize } from '@/tools/geo-bloom/decode';
import { generateBloom } from '@/tools/geo-bloom/generate';
import { drawBloom } from '@/tools/geo-bloom/render';
import {
  applySettingsDiff,
  DEFAULT_SETTINGS,
  resolveConfig,
  type Settings,
  settingsDiff,
} from '@/tools/geo-bloom/settings';
import { type Overrides, settingsWith } from '../helpers/geoBloomCases';
import { rasterCanvas, resample } from '../helpers/raster';

const bytesToBits = (s: string) => [...new TextEncoder().encode(s)].flatMap((b) => toBits(b, 8));

describe('封包與檢查碼', () => {
  it('CRC-16（CCITT，初始 0xFFFF）與 CRC-8（多項式 0x07）的標準檢查值', () => {
    expect(crc16([...new TextEncoder().encode('123456789')])).toBe(0x29b1);
    expect(fromBits(crc8bits(bytesToBits('123456789')))).toBe(0xf4);
  });

  it('封包的位元和原作相同：[0xA5][旗標][長度][UTF-8][CRC-16]', () => {
    expect(makePacket('abc', '').join('')).toBe(
      '1010010100000000000000110110000101100010011000111010101000110011',
    );
    const p = makePacket('星座の夜', '0=1200');
    expect(p.length).toBe((5 + 12 + 1 + 6) * 8);
    expect(fromBits(p.slice(8, 16))).toBe(1);
  });

  it('讀回：開頭沒對齊也找得到；錯一個位元就不算；資料最多 255 位元組', () => {
    expect(parsePacket(makePacket('seed-1', ''))).toEqual({
      seed: 'seed-1',
      settings: '',
      bits: 88,
    });
    const withSettings = parsePacket([1, 0, 1, ...makePacket('x', 'a=1;b=2'), 0, 1]);
    expect(withSettings).toMatchObject({ seed: 'x', settings: 'a=1;b=2' });
    const broken = makePacket('seed-1', '');
    broken[30] ^= 1;
    expect(parsePacket(broken)).toBeNull();
    const long = makePacket('x'.repeat(300), '');
    expect(parsePacket(long)?.seed).toBe('x'.repeat(255));
  });
});

describe('設定的差異文字（和原作相同）', () => {
  it('和預設不同的才寫：「第幾個欄位（36 進位）＝值」，用「;」接起來（從原作量到的）', () => {
    expect(settingsDiff(DEFAULT_SETTINGS)).toBe('');
    const s: Settings = {
      ...settingsWith({
        lineWidth: 2.25,
        morseText: 'SOS',
        background: '#102030',
        code: true,
        codeSettings: true,
        startRing: 'any',
        shapes: { triCore: true, square: false },
        codeScale: 2.5,
        attachDepth: -20,
        width: 1200,
        triRing: 'random',
      }),
    };
    expect(settingsDiff(s)).toBe(
      '0=1200;j=-20;q=0;s=1;v=r;12=#102030;17=2.25;1a=all;1t=SOS;1u=1;1z=2.5',
    );
  });

  it('讀回：預設值＋差異；看不懂的欄位略過；「設定也一起刻」打開；隨機的設定讀回來相同', () => {
    expect(applySettingsDiff('0=1200;17=2.25;zz=9;;1a=all', 'k')).toEqual({
      ...DEFAULT_SETTINGS,
      seed: 'k',
      codeSettings: true,
      width: 1200,
      lineWidth: 2.25,
      startRing: 'any',
    });
    const rng = createRandom('diff-roundtrip');
    for (let i = 0; i < 30; i++) {
      const s = settingsWith({
        seed: `s${i}`,
        width: rng.int(64, 3000),
        maxShapes: rng.int(1, 400),
        lineWidth: rng.int(1, 160) / 4,
        morseDot: rng.int(2, 160) / 2,
        codeScale: rng.int(10, 40) / 10,
        attachDepth: rng.int(-50, 80),
        overlapMode: rng.pick(['retry', 'line', 'skip'] as const),
        triRing: rng.pick(['first', 'second', 'random'] as const),
        startRing: rng.pick(['ring1', 'ring2', 'ring12', 'edge', 'center', 'any'] as const),
        codeVersion: rng.pick(['v1', 'v2'] as const),
        transparent: rng.next() < 0.5,
        lineColor: '#123abc',
        shapes: { semi: rng.next() < 0.5, triRing: rng.next() < 0.5 },
      });
      expect(applySettingsDiff(settingsDiff(s), s.seed)).toEqual({
        ...s,
        lockSeed: false,
        codeSettings: true,
      });
    }
  });
});

describe('舊方式的排法', () => {
  it('圈：同步弧 7 個單位，之後每個位元「間隔 1＋弧 1 或 3」，留 4 個單位', () => {
    const r = 100;
    const { segs, next } = encodeRing(r, 5, [1, 0, 1, 1], 0);
    expect(next).toBe(4);
    expect(segs[0]).toMatchObject({ a0: 0, a1: 35 / r, sync: true });
    expect(segs.slice(1).map((s) => Math.round((s.a1 - s.a0) * r))).toEqual([15, 5, 15, 15]);
    /* 放不下就停：半徑 10 的圈只放得下同步弧 */
    expect(encodeRing(10, 5, [1, 1], 0).next).toBe(0);
  });

  it('能刻幾圈、放幾個位元', () => {
    const ly = codeLayout(100, { lineWidth: 2, codeUnit: 5, codeWidth: 1 });
    expect([ly.u, ly.sp, ly.f1, ly.f2]).toEqual([5, 8, 6, 14]);
    expect(ly.radii[0]).toBeCloseTo(23.6, 6);
    expect(ly.radii.at(-1)).toBeLessThanOrEqual(100);
    expect(ly.cap).toBeGreaterThan(100);
  });
});

/** 產生＋點陣畫布畫出來 */
function render(o: Overrides, k = 1) {
  const s = settingsWith(o);
  const cfg = resolveConfig(s);
  const scene = generateBloom(cfg, s.seed);
  const { ctx, image } = rasterCanvas(cfg.width, cfg.height);
  drawBloom(ctx, cfg, scene);
  return { scene, image: k === 1 ? image() : resample(image(), k) };
}

describe('刻進去再讀回來', () => {
  const small = { width: 900, height: 900 };

  it('新方式：全部刻得進去，畫出來讀回同一個種子（自動、只用新方式）；只用舊方式讀不出來', () => {
    const { scene, image } = render({ ...small, seed: 'round-trip', code: true });
    expect(scene.code).toMatchObject({ version: 'v2', missing: 0 });
    const auto = decodeImage(image, 'auto');
    expect(auto).toMatchObject({ ok: true, seed: 'round-trip', settings: '' });
    expect(auto.attempts.map((a) => a.version)).toEqual(['v2']);
    expect(decodeImage(image, 'v2').seed).toBe('round-trip');
    expect(decodeImage(image, 'v1').ok).toBe(false);
  });

  it('新方式＋設定：讀回種子與設定，換回去就是同一組設定', () => {
    const o: Overrides = {
      seed: 'with-settings',
      code: true,
      codeSettings: true,
      maxShapes: 300,
      maxLines: 600,
      lineWidth: 2.5,
      background: '#203040',
    };
    const { scene, image } = render(o);
    expect(scene.code?.missing).toBe(0);
    const r = decodeImage(image, 'auto');
    expect(r.ok).toBe(true);
    const back = applySettingsDiff(r.settings ?? '', r.seed ?? '');
    expect(back).toEqual({ ...settingsWith(o), lockSeed: false });
  });

  it('舊方式：全部刻到（每個位元至少一次），自動先試新方式、再用舊方式讀出', () => {
    const { scene, image } = render({ ...small, seed: 'old-way', code: true, codeVersion: 'v1' });
    expect(scene.code).toMatchObject({ version: 'v1', missing: 0 });
    expect(scene.code?.minCover).toBeGreaterThanOrEqual(1);
    const r = decodeImage(image, 'auto');
    expect(r).toMatchObject({ ok: true, seed: 'old-way' });
    expect(r.attempts.map((a) => a.version)).toEqual(['v2', 'v1']);
  });

  it('透明背景：用不透明度找墨跡', () => {
    const { image } = render({ ...small, seed: 'clear', code: true, transparent: true });
    expect(decodeImage(image, 'auto').seed).toBe('clear');
  });

  it('沒刻種子的圖：讀不出來', () => {
    const { image } = render({ ...small, seed: 'plain' });
    expect(decodeImage(image, 'auto').ok).toBe(false);
  });

  it('縮放：放大 1.5 倍照樣讀得出來；縮到一半讀不出來（線太細、圈太密，同原作）', () => {
    expect(
      decodeImage(render({ ...small, seed: 'zoom', code: true }, 1.5).image, 'auto').seed,
    ).toBe('zoom');
    expect(decodeImage(render({ ...small, seed: 'zoom', code: true }, 0.5).image, 'auto').ok).toBe(
      false,
    );
  });

  it('長邊超過 4000 px 的圖先縮到 4000 px 再讀', () => {
    expect(decodeSize(8000, 6000)).toEqual({ width: 4000, height: 3000 });
    expect(decodeSize(1600, 900)).toEqual({ width: 1600, height: 900 });
  });
});
