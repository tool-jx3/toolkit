/**
 * 切入素材產生器：分享連結的來回與範圍檢查（規格 F61、F62、3.13），存檔的整理。
 */
import { describe, expect, it } from 'vitest';
import { encodeShareHash } from '@/core/share';
import { applyTemplate, type CutinSettings, FONT_IDS, isModified } from '@/tools/cutin/model';
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  SHARE_VERSION,
  settingsFromHash,
  shareData,
} from '@/tools/cutin/settings';
import { TEMPLATES } from '@/tools/cutin/templates';

const hashOf = (data: unknown, version = SHARE_VERSION) => encodeShareHash(data, { version });

describe('分享連結', () => {
  it('全部設定來回不變；範本＝自訂；尺寸、格數、fps、格式、GIF 底色都算手動改過', () => {
    const s: CutinSettings = {
      ...applyTemplate(DEFAULT_SETTINGS, TEMPLATES[9]),
      text: '第一行\n第二行 😀',
      target: 'discord-attachment',
      textColor: '#ff0080',
      outlineColor: '#102030',
      background: 'solid',
      bgColor: '#202020',
      textScale: 0.8,
      leading: 1.25,
      tracking: -0.05,
      fxParams: {
        ...TEMPLATES[9].fxParams,
        count: 20,
        color: 'rainbow',
        stretch: false,
        minLength: 0.1,
        maxLength: 0.3,
        width: 0.012,
        gap: 0.02,
        groups: 3,
        jitter: 0.3,
      },
      motion: 'wave',
      motionAmount: 0.12,
      seed: 4242,
      width: 640,
      height: 360,
      frames: 24,
      fps: 24,
      contentScale: 0.6,
      colors: 128,
      format: 'gif',
      gifMatte: '#313338',
    };
    const back = settingsFromHash(hashOf(shareData(s)));
    expect(back).not.toBeNull();
    expect(back).toEqual({
      ...s,
      touched: { size: true, frames: true, fps: true, format: true, gifMatte: true },
      templateId: null,
      baseline: null,
    });
    expect(back && isModified(back)).toBe(false);
  });

  it('數值超出範圍時夾回；未知的代號換成第一個', () => {
    const raw = {
      ...shareData(DEFAULT_SETTINGS),
      x: Array.from({ length: 12 }, (_, i) => `${i}${'字'.repeat(150)}`).join('\n'),
      u: 'nowhere',
      f: 'Comic Sans',
      st: 'boom',
      pl: 'rainbow-x',
      bg: 'video',
      ts: 9,
      ld: 0.1,
      tr: -2,
      fx: 'speedLines',
      fp: { count: 500, minLength: -3, color: 'javascript:alert(1)', stretch: 'yes', bogus: 1 },
      mo: 'rotate',
      ma: 2.6,
      sd: 0,
      w: 5000,
      h: 10,
      fr: 99,
      fps: 120,
      cs: 3,
      co: 999,
      fm: 'webp',
      gm: 'red',
    };
    const s = settingsFromHash(hashOf(raw));
    expect(s).not.toBeNull();
    if (!s) return;
    const lines = s.text.split('\n');
    expect(lines).toHaveLength(8);
    expect(lines.every((l) => Array.from(l).length <= 100)).toBe(true);
    expect(s.target).toBe('ccfolia-cutin');
    expect(s.font).toBe(FONT_IDS[0]);
    expect(s.style).toBe('double');
    expect(s.palette).toBe('rainbow-gold');
    expect(s.background).toBe('transparent');
    expect([s.textScale, s.leading, s.tracking]).toEqual([1.5, 0.8, -0.3]);
    expect(s.fxParams.count).toBe(96);
    expect(s.fxParams.minLength).toBe(0.02);
    expect(s.fxParams.color).toBe('rainbow');
    expect(s.fxParams.stretch).toBe(true);
    expect('bogus' in s.fxParams).toBe(false);
    expect(s.motionAmount).toBe(3);
    expect(s.seed).toBe(1);
    expect([s.width, s.height]).toEqual([1600, 64]);
    expect(s.frames).toBe(60);
    expect(s.fps).toBe(30);
    expect(s.contentScale).toBe(1);
    expect(s.colors).toBe(256);
    expect(s.format).toBe('apng');
    expect(s.gifMatte).toBe('#313338');
  });

  it('寬 × 高 × 格數不超過約 4,000 萬像素', () => {
    const s = settingsFromHash(
      hashOf({ ...shareData(DEFAULT_SETTINGS), w: 1600, h: 1600, fr: 60 }),
    );
    expect(s?.frames).toBe(15);
    expect((s?.width ?? 0) * (s?.height ?? 0) * (s?.frames ?? 0)).toBeLessThanOrEqual(40_000_000);
  });

  it('沒有、損壞、版本不符、過長時忽略', () => {
    expect(settingsFromHash('')).toBeNull();
    expect(settingsFromHash('#s=%%%')).toBeNull();
    expect(settingsFromHash('#s=AAAA')).toBeNull();
    expect(settingsFromHash(hashOf(shareData(DEFAULT_SETTINGS), 99))).toBeNull();
    const long = hashOf({
      ...shareData(DEFAULT_SETTINGS),
      x: Array.from({ length: 9000 }, (_, i) =>
        String.fromCodePoint(0x4e00 + ((i * 7919) % 20000)),
      ).join(''),
    });
    expect(long.length).toBeGreaterThan(8000);
    expect(settingsFromHash(long)).toBeNull();
  });
});

describe('存檔與專案檔的整理', () => {
  it('壞掉的內容回到預設；保留範本、基準外觀與手動改過', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('垃圾')).toEqual(DEFAULT_SETTINGS);
    const s = applyTemplate(
      { ...DEFAULT_SETTINGS, touched: { ...DEFAULT_SETTINGS.touched, fps: true }, fps: 12 },
      TEMPLATES[3],
    );
    expect(normalizeSettings(JSON.parse(JSON.stringify(s)))).toEqual(s);
    const bad = normalizeSettings({ ...s, templateId: 'nope', width: -5, style: 'zzz' });
    expect(bad.templateId).toBe(DEFAULT_SETTINGS.templateId);
    expect(bad.width).toBe(64);
    expect(bad.style).toBe('double');
    expect(normalizeSettings({ ...s, templateId: null }).templateId).toBeNull();
    /* 自己的存檔不套像素上限（介面上允許，只在檢查清單提醒） */
    const big = normalizeSettings({ ...s, width: 1600, height: 1600, frames: 60 });
    expect([big.width, big.height, big.frames]).toEqual([1600, 1600, 60]);
  });
});
