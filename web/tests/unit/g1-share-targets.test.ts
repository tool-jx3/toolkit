/**
 * core/share（網址 # 分享的來回與範圍檢查）、ccfolia/targets（用途的檢查與自動縮小）、
 * core/html（跳脫）、core/fonts（新字型與字型清單的附加資料）、core/fxlayers（取樣表）。
 */
import { describe, expect, it } from 'vitest';
import {
  checkTarget,
  DISCORD_DARK_BG,
  EXPORT_TARGETS,
  formatLimitBytes,
  nextShrinkStep,
  type ShrinkState,
  usagePercent,
} from '@/ccfolia';
import { defineFontChoices, findGoogleFont, pickFontChoice } from '@/core/fonts';
import {
  confettiState,
  ringsState,
  speedLinePulse,
  speedLinesState,
  starsState,
} from '@/core/fxlayers';
import { escapeHtml, escapeHtmlAttr } from '@/core/html';
import {
  decodeShareHash,
  encodeShareHash,
  fromBase64Url,
  readShareHash,
  sh,
  shareUrl,
  toBase64Url,
} from '@/core/share';
import { rainbowHue, rainbowStops } from '@/core/textfx';

describe('分享連結', () => {
  const schema = sh.object({
    text: sh.string({ default: '', maxLength: 10, maxLines: 2 }),
    fps: sh.number({ min: 5, max: 30, int: true, default: 20 }),
    scale: sh.number({ min: 0.4, max: 1, default: 1 }),
    font: sh.oneOf(['a', 'b', 'c'] as const),
    loop: sh.boolean(true),
    color: sh.color('#ffffff'),
    layers: sh.array(sh.number({ min: 0, max: 1, default: 0 }), { default: [], maxItems: 3 }),
  });

  it('base64url 來回', () => {
    const bytes = new Uint8Array([0, 255, 62, 63, 250, 251]);
    const s = toBase64Url(bytes);
    expect(s).not.toMatch(/[+/=]/);
    expect([...fromBase64Url(s)]).toEqual([...bytes]);
  });

  it('來回後相同（含中文與換行）', () => {
    const data = {
      text: '大成功\n！',
      fps: 24,
      scale: 0.5,
      font: 'b',
      loop: false,
      color: '#ff0033',
      layers: [0.5, 1],
    };
    const hash = encodeShareHash(data, { version: 1 });
    expect(hash.startsWith('#s=')).toBe(true);
    expect(decodeShareHash(hash, schema, { version: 1 })).toEqual(data);
    const url = shareUrl(data, { version: 1 }, 'https://example.com/tools/cutin/?x=1#old');
    expect(url.startsWith('https://example.com/tools/cutin/?x=1#s=')).toBe(true);
  });

  it('範圍夾值、未知選項換成預設、字串與陣列截斷、多餘欄位丟掉', () => {
    const hash = encodeShareHash(
      {
        text: '一\n二\n三四五六七八九十十一十二',
        fps: 999.6,
        scale: -3,
        font: 'zzz',
        loop: 'yes',
        color: 'red',
        layers: [2, -1, 0.5, 0.7],
        evil: '<script>',
      },
      { version: 1 },
    );
    expect(decodeShareHash(hash, schema, { version: 1 })).toEqual({
      text: '一\n二',
      fps: 30,
      scale: 0.4,
      font: 'a',
      loop: true,
      color: '#ffffff',
      layers: [1, 0, 0.5],
    });
  });

  it('版本不符、損壞、太長、沒有分享內容時回傳 null', () => {
    const hash = encodeShareHash({ fps: 10 }, { version: 2 });
    expect(decodeShareHash(hash, schema, { version: 1 })).toBeNull();
    expect(readShareHash('#s=@@@', { version: 1 })).toBeNull();
    expect(readShareHash('#s=AAAA', { version: 1 })).toBeNull();
    expect(readShareHash(`#s=${'a'.repeat(9000)}`, { version: 1 })).toBeNull();
    expect(readShareHash('', { version: 1 })).toBeNull();
    expect(readShareHash('#other=1', { version: 1 })).toBeNull();
  });
});

describe('配布目標', () => {
  const cutin = EXPORT_TARGETS['ccfolia-cutin'];
  const sticker = EXPORT_TARGETS['discord-sticker'];
  const attach = EXPORT_TARGETS['discord-attachment'];

  it('容量上限、格式、固定尺寸、預設底色', () => {
    expect(cutin.maxBytes).toBe(1_000_000);
    expect(sticker).toMatchObject({ maxBytes: 512_000, formats: ['apng', 'png'] });
    expect(sticker.fixedSize).toEqual({ width: 320, height: 320 });
    expect(attach).toMatchObject({ maxBytes: 8_000_000, formats: ['gif', 'png'] });
    expect(attach.gifMatte).toBe(DISCORD_DARK_BG);
  });

  it('容量顯示（規格 3.1.5）與百分比', () => {
    expect(formatLimitBytes(1_000_000)).toBe('976.6 KB');
    expect(formatLimitBytes(512_000)).toBe('500.0 KB');
    expect(formatLimitBytes(8_000_000)).toBe('7.63 MB');
    expect(formatLimitBytes(900)).toBe('900 B');
    expect(usagePercent(274_000, 1_000_000)).toBe(27);
  });

  it('檢查清單的每個條件', () => {
    const base = { width: 480, height: 480, frames: 15 };
    const codes = (t = cutin, s = {}) =>
      checkTarget(t, { format: 'apng', ...base, ...s }).map((i) => `${i.level}:${i.code}`);
    expect(codes()).toEqual([]);
    expect(codes(sticker, { format: 'gif' })).toEqual(['error:format', 'error:size']);
    expect(codes(attach, { format: 'gif', gifMatte: null })).toEqual(['warning:gif-binary-alpha']);
    expect(codes(attach, { format: 'gif', gifMatte: DISCORD_DARK_BG })).toEqual([]);
    expect(codes(cutin, { format: 'gif', gifMatte: '#000000' })).toEqual(['info:gif-matte-opaque']);
    expect(codes(cutin, { width: 1600, height: 1600, frames: 16 })).toEqual(['error:pixels-error']);
    expect(codes(cutin, { width: 1000, height: 1000, frames: 30 })).toEqual([
      'warning:pixels-warning',
    ]);
    expect(
      codes(sticker, { width: 320, height: 320, charCount: 9, fontSuggestedChars: 12 }),
    ).toEqual(['warning:chars-target']);
    expect(codes(cutin, { charCount: 15, fontSuggestedChars: 12 })).toEqual(['warning:chars-font']);
    expect(codes(cutin, { lastBytes: 1_200_000 })).toEqual(['error:too-large']);
  });

  it('自動縮小：每次一步並說明（規格 3.11 的例子＋裁定：無損先改 256 色）', () => {
    let s: ShrinkState = {
      format: 'apng',
      colors: 0,
      frames: 30,
      width: 1000,
      height: 1000,
      lines: 48,
    };
    const seen: string[] = [];
    for (let i = 0; i < 30; i++) {
      const step = nextShrinkStep(cutin, s);
      if (!step) break;
      seen.push(step.description);
      s = { ...s, ...step.patch };
    }
    expect(seen.slice(0, 4)).toEqual([
      '色數 無損 → 256 色',
      '色數 256 → 128 色',
      '色數 128 → 64 色',
      '影格數 30 → 27 格',
    ]);
    expect(seen).toContain('影格數 12 → 10 格');
    expect(seen).toContain('放射速度線 48 → 34 條');
    expect(seen).toContain('放射速度線 17 → 16 條');
    expect(seen).toContain('尺寸 1000 × 1000 → 800 × 800');
    expect(Math.min(s.width, s.height)).toBeLessThanOrEqual(240);
    /* GIF 跳過色數；固定尺寸的用途不縮尺寸 */
    expect(
      nextShrinkStep(attach, { format: 'gif', colors: 256, frames: 10, width: 720, height: 720 })
        ?.description,
    ).toBe('尺寸 720 × 720 → 576 × 576');
    expect(
      nextShrinkStep(sticker, { format: 'apng', colors: 64, frames: 10, width: 320, height: 320 }),
    ).toBeNull();
  });
});

describe('HTML 跳脫', () => {
  it('& < > " \' 都跳脫；屬性裡的換行', () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;',
    );
    expect(escapeHtmlAttr('一\n二')).toBe('一&#10;二');
  });
});

describe('字型', () => {
  it('新字型都在目錄裡（字重已驗證）', () => {
    expect(findGoogleFont('Shippori Mincho B1')?.weights).toContain(800);
    expect(findGoogleFont('Permanent Marker')?.weights).toEqual([400]);
    expect(findGoogleFont('Rampart One')?.weights).toEqual([400]);
    expect(findGoogleFont('Nanum Gothic')?.weights).toEqual([400, 700, 800]);
    for (const f of ['Gothic A1', 'Sunflower', 'Gamja Flower', 'Gaegu'])
      expect(findGoogleFont(f)?.scripts).toContain('kr');
  });

  it('字型清單可以附加資料；字重取最接近的；找不到時第一個', () => {
    const list = defineFontChoices([
      { family: 'Noto Sans TC', weight: 900, data: { strokeScale: 1, maxChars: 20 } },
      {
        family: 'Reggae One',
        weight: 700,
        id: 'reggae',
        data: { strokeScale: 0.85, maxChars: 12 },
      },
    ]);
    expect(list[1].font).toEqual({ source: 'google', family: 'Reggae One', weight: 400 });
    expect(pickFontChoice(list, 'reggae').data.maxChars).toBe(12);
    expect(pickFontChoice(list, 'Noto Sans TC').id).toBe('Noto Sans TC');
    expect(pickFontChoice(list, '不存在').id).toBe('Noto Sans TC');
    expect(() => defineFontChoices([{ family: '沒有這套', data: 0 }])).toThrow();
  });
});

describe('循環特效層', () => {
  const env = { width: 480, height: 480, textRadius: 128.6, seed: 12345 };

  it('放射速度線兩組的明滅與伸縮（規格 3.7.1 取樣表）', () => {
    const a = (t: number) => speedLinePulse(0, 2, t);
    const b = (t: number) => speedLinePulse(1, 2, t);
    expect(a(0).alpha).toBeCloseTo(1, 6);
    expect(a(0.25).alpha).toBeCloseTo(0.575, 3);
    expect(a(0.5).alpha).toBeCloseTo(0.15, 6);
    expect(b(0).alpha).toBeCloseTo(0.15, 6);
    expect(b(0.5).alpha).toBeCloseTo(1, 6);
    expect(
      [a(0).scale, a(0.25).scale, a(0.5).scale, a(0.75).scale].map((v) => +v.toFixed(3)),
    ).toEqual([1, 1.25, 1, 0.75]);
    expect(b(0.25).scale).toBeCloseTo(0.75, 6);
    expect(speedLinePulse(0, 1, 0.5).alpha).toBe(1);
    const lines = speedLinesState(env, {}, 0);
    expect(lines).toHaveLength(48);
    for (const l of lines) {
      expect(l.length).toBeGreaterThanOrEqual(480 * 0.1 - 1e-9);
      expect(l.length).toBeLessThanOrEqual(480 * 0.3 + 1e-9);
      expect(l.inner).toBeCloseTo(128.6 * 1.02, 6);
    }
  });

  it('擴散圓環：半徑與不透明度（規格 3.7.4 量測，12 格）', () => {
    const e = { ...env, textRadius: 135 / 1.05 };
    const r0 = ringsState(e, {}, 0);
    expect(r0[0].radius).toBeCloseTo(135, 6);
    expect(Math.round(r0[0].alpha * 255)).toBe(255);
    expect(r0[1].radius).toBeCloseTo(203, 0);
    expect(Math.round(r0[1].alpha * 255)).toBe(170);
    const r1 = ringsState(e, {}, 1 / 12);
    expect(r1[0].radius).toBeCloseTo(152, 0);
    expect(Math.round(r1[0].alpha * 255)).toBe(234);
  });

  it('無縫循環：t＝0 與 t＝1 相同；隨機量由種子決定', () => {
    const near = (a: unknown, b: unknown) =>
      expect(JSON.stringify(a, (_, v) => (typeof v === 'number' ? +v.toFixed(6) : v))).toBe(
        JSON.stringify(b, (_, v) => (typeof v === 'number' ? +v.toFixed(6) : v)),
      );
    near(confettiState(env, {}, 0), confettiState(env, {}, 1));
    near(starsState(env, {}, 0), starsState(env, {}, 1));
    near(speedLinesState(env, {}, 0), speedLinesState(env, {}, 1));
    expect(starsState(env, {}, 0.3)).toEqual(starsState(env, {}, 0.3));
    expect(starsState({ ...env, seed: 1 }, {}, 0.3)[0].x).not.toBe(starsState(env, {}, 0.3)[0].x);
    expect(confettiState(env, {}, 0)).toHaveLength(28);
  });
});

describe('彩虹', () => {
  it('色相由左而右繞一圈，往左流動；色標涵蓋 0～1', () => {
    expect(rainbowHue(0, 0)).toBe(0);
    expect(rainbowHue(0.5, 0)).toBe(180);
    expect(rainbowHue(0, 0.25)).toBe(90);
    const stops = rainbowStops(0.3);
    expect(stops[0].offset).toBe(0);
    expect(stops.at(-1)?.offset).toBe(1);
    for (let i = 1; i < stops.length; i++)
      expect(stops[i].offset).toBeGreaterThan(stops[i - 1].offset);
  });
});
