/**
 * 切入素材產生器：設定模型（規格 F04～F09、F11、F13～F15、F18、F22～F24、F28、F46、F60、3.1.4、3.2、3.8、3.11、3.12）。
 */
import { describe, expect, it } from 'vitest';
import { DISCORD_DARK_BG } from '@/ccfolia';
import { fileNameWithExt } from '@/core/files';
import { gifDelaysCs, uniformFrames } from '@/core/timeline';
import { apngFrames, loopProgressAt } from '@/tools/cutin/exporter';
import {
  outlineSumPerSize,
  PALETTES,
  paletteOf,
  STYLE_IDS,
  styleLayers,
} from '@/tools/cutin/looks';
import {
  apngDelayMs,
  applySizePreset,
  applyTemplate,
  type CutinSettings,
  charCount,
  FONT_IDS,
  FONTS,
  fileBaseName,
  fxDefaults,
  isModified,
  lookWarnings,
  MOTION_DEFAULTS,
  restoreTemplateLook,
  SIZE_PRESETS,
  selectFx,
  selectMotion,
  selectPalette,
  selectStyle,
  shrinkOnce,
  suggestedCharCount,
  switchTarget,
  TARGET_TUNING,
  tunedLineCount,
  tunedMotionAmount,
} from '@/tools/cutin/model';
import { DEFAULT_SETTINGS } from '@/tools/cutin/settings';
import { TEMPLATES, templateOf } from '@/tools/cutin/templates';

const tpl = (id: string) => {
  const t = templateOf(id);
  if (!t) throw new Error(id);
  return t;
};

describe('預設值與範本（F03、4.）', () => {
  it('預設＝第一個範本：CCFOLIA、480 × 480、15 格、20 fps、APNG、256 色、種子 12,345', () => {
    const s = DEFAULT_SETTINGS;
    expect(s.templateId).toBe(TEMPLATES[0].id);
    expect(s.target).toBe('ccfolia-cutin');
    expect([s.width, s.height, s.frames, s.fps]).toEqual([480, 480, 15, 20]);
    expect(s.format).toBe('apng');
    expect(s.colors).toBe(256);
    expect(s.seed).toBe(12345);
    expect([s.textScale, s.leading, s.tracking, s.contentScale]).toEqual([1, 1.1, 0.02, 1]);
    expect(s.gifMatte).toBeNull();
    expect(isModified(s)).toBe(false);
  });

  it('14 張範本，依序克蘇魯 6、通用 3、外觀風格 5；代號都有效', () => {
    expect(TEMPLATES).toHaveLength(14);
    expect(TEMPLATES.map((t) => t.category)).toEqual([
      ...Array(6).fill('coc'),
      ...Array(3).fill('general'),
      ...Array(5).fill('style'),
    ]);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(14);
    expect(new Set(TEMPLATES.map((t) => t.name)).size).toBe(14);
    for (const t of TEMPLATES) {
      expect(FONT_IDS).toContain(t.font);
      expect(PALETTES.map((p) => p.id)).toContain(t.palette);
      expect(STYLE_IDS).toContain(t.style);
      expect(t.text.trim()).not.toBe('');
      expect(charCount(t.text)).toBeLessThanOrEqual(
        suggestedCharCount({ target: 'ccfolia-cutin', font: t.font }),
      );
    }
  });

  it('11 套字型，外框倍率 0.8～1.4', () => {
    expect(FONTS).toHaveLength(11);
    for (const f of FONTS) {
      expect(f.data.outline).toBeGreaterThanOrEqual(0.8);
      expect(f.data.outline).toBeLessThanOrEqual(1.4);
    }
    const families = FONTS.map((f) => f.font.family);
    for (const fam of [
      'Noto Sans TC',
      'Noto Serif TC',
      'LXGW WenKai TC',
      'Noto Sans JP',
      'M PLUS Rounded 1c',
      'Reggae One',
      'Shippori Mincho B1',
      'DotGothic16',
    ])
      expect(families).toContain(fam);
    expect(FONTS.find((f) => f.font.family === 'Shippori Mincho B1')?.font.weight).toBe(800);
    expect(FONTS.find((f) => f.font.family === 'M PLUS Rounded 1c')?.font.weight).toBe(800);
  });
});

describe('套用範本（F04）與已修改（F06、F07）', () => {
  const custom: CutinSettings = {
    ...DEFAULT_SETTINGS,
    text: '自己的字',
    seed: 777,
    textScale: 0.8,
    leading: 1.3,
    tracking: 0.1,
    contentScale: 0.7,
    colors: 64,
    frames: 22,
    touched: { ...DEFAULT_SETTINGS.touched, frames: true },
  };

  it('換掉文字與外觀，保留種子、排版微調、內容縮放、色數；沒手動改過的跟著用途預設', () => {
    const s = applyTemplate({ ...custom, fps: 12 }, tpl('victory'));
    expect(s.text).toBe(tpl('victory').text);
    expect([s.font, s.style, s.palette, s.fx, s.motion]).toEqual([
      'noto-sans-tc',
      'extrude',
      'gold',
      'confetti',
      'bounce',
    ]);
    expect(s.fxParams).toEqual(fxDefaults('confetti'));
    expect(s.motionAmount).toBe(MOTION_DEFAULTS.bounce);
    expect([s.seed, s.textScale, s.leading, s.tracking, s.contentScale, s.colors]).toEqual([
      777, 0.8, 1.3, 0.1, 0.7, 64,
    ]);
    expect(s.frames).toBe(22);
    expect(s.fps).toBe(20);
    expect(s.templateId).toBe('victory');
    expect(isModified(s)).toBe(false);
  });

  it('只改文字或匯出設定不算修改；改外觀、排版微調、種子才算；恢復外觀保留文字與尺寸', () => {
    const s = applyTemplate(DEFAULT_SETTINGS, tpl('critical'));
    const exportOnly: CutinSettings = {
      ...s,
      text: '換字',
      width: 640,
      height: 360,
      frames: 30,
      fps: 25,
      colors: 0,
      contentScale: 0.5,
      format: 'gif',
      gifMatte: '#000000',
    };
    expect(isModified(exportOnly)).toBe(false);
    for (const patch of [
      { font: 'wenkai' },
      { style: 'neon' as const },
      { palette: 'mono' as const },
      { background: 'rainbow' as const },
      { fxParams: { ...s.fxParams, count: 20 } },
      { motionAmount: 0.1 },
      { textScale: 0.9 },
      { tracking: 0 },
      { seed: 1 },
      { textColor: '#ff0000' },
    ])
      expect(isModified({ ...exportOnly, ...patch })).toBe(true);
    const restored = restoreTemplateLook(
      { ...exportOnly, font: 'wenkai', palette: 'mono', seed: 9, textScale: 0.9 },
      tpl('critical'),
    );
    expect(isModified(restored)).toBe(false);
    expect(restored.font).toBe('noto-sans-tc');
    expect(restored.palette).toBe('rainbow-gold');
    expect([
      restored.text,
      restored.width,
      restored.frames,
      restored.seed,
      restored.textScale,
    ]).toEqual(['換字', 640, 30, 9, 0.9]);
    /* 分享連結開啟（沒有範本）：沒有已修改 */
    expect(isModified({ ...exportOnly, templateId: null, baseline: null, font: 'reggae' })).toBe(
      false,
    );
  });
});

describe('用途（F08、3.1.4）', () => {
  it('固定尺寸一律強制；沒改過的換成預設；格式不收時一律換成第一個', () => {
    const touched = {
      ...DEFAULT_SETTINGS,
      width: 640,
      height: 640,
      format: 'gif' as const,
      touched: { size: true, frames: false, fps: false, format: true, gifMatte: false },
    };
    const sticker = switchTarget(touched, 'discord-sticker');
    expect([sticker.width, sticker.height, sticker.frames, sticker.fps]).toEqual([
      320, 320, 12, 20,
    ]);
    expect(sticker.format).toBe('apng');
    const attach = switchTarget(DEFAULT_SETTINGS, 'discord-attachment');
    expect([attach.width, attach.height, attach.frames, attach.fps]).toEqual([720, 720, 30, 30]);
    expect(attach.format).toBe('gif');
    expect(attach.gifMatte).toBe(DISCORD_DARK_BG);
    const back = switchTarget(attach, 'ccfolia-cutin');
    expect([back.width, back.frames, back.fps, back.format, back.gifMatte]).toEqual([
      480,
      15,
      20,
      'apng',
      null,
    ]);
    /* 改過的保留（固定尺寸以外） */
    const kept = switchTarget(
      {
        ...attach,
        width: 500,
        fps: 10,
        gifMatte: null,
        touched: { size: true, frames: false, fps: true, format: true, gifMatte: true },
      },
      'ccfolia-cutin',
    );
    expect([kept.width, kept.fps, kept.format, kept.gifMatte]).toEqual([500, 10, 'gif', null]);
  });

  it('依用途自動調整（3.8）：貼圖 48 → 16 條、附件 48 → 40 條；旋轉圈數不縮減', () => {
    expect(tunedLineCount(48, TARGET_TUNING['discord-sticker'])).toBe(16);
    expect(tunedLineCount(48, TARGET_TUNING['discord-attachment'])).toBe(40);
    expect(tunedLineCount(48, TARGET_TUNING['ccfolia-cutin'])).toBe(48);
    expect(tunedLineCount(12, TARGET_TUNING['discord-sticker'])).toBe(8);
    expect(tunedLineCount(4, TARGET_TUNING['discord-sticker'])).toBe(4);
    expect(TARGET_TUNING['discord-sticker'].outline).toBeCloseTo(1.4);
    expect(TARGET_TUNING['discord-attachment'].outline).toBeCloseTo(1.1);
    expect(tunedMotionAmount('pulse', 0.05, TARGET_TUNING['discord-sticker'])).toBeCloseTo(0.0365);
    expect(tunedMotionAmount('wave', 0.08, TARGET_TUNING['discord-attachment'])).toBeCloseTo(
      0.0744,
    );
    expect(tunedMotionAmount('rotate', 2, TARGET_TUNING['discord-sticker'])).toBe(2);
    expect(tunedMotionAmount('rotate', 3, TARGET_TUNING['discord-sticker'])).toBe(3);
  });

  it('尺寸按鈕（F28）：同時設定尺寸、格數、fps、內容縮放，算手動改過', () => {
    expect(SIZE_PRESETS.map((p) => [p.width, p.height, p.frames, p.fps, p.contentScale])).toEqual([
      [480, 480, 15, 20, 1],
      [600, 600, 18, 20, 0.72],
      [800, 450, 15, 20, 1],
      [320, 320, 10, 15, 1],
    ]);
    const s = applySizePreset({ ...DEFAULT_SETTINGS, contentScale: 0.5 }, SIZE_PRESETS[2]);
    expect([s.width, s.height, s.frames, s.fps, s.contentScale]).toEqual([800, 450, 15, 20, 1]);
    expect(s.touched).toMatchObject({ size: true, frames: true, fps: true });
    expect(switchTarget(s, 'discord-attachment').width).toBe(800);
  });
});

describe('外觀的連動（F13～F15、F18、F22、F23）', () => {
  it('選樣式只換加工、背景改回預設；挖空時背景換成配色的填色', () => {
    const s = { ...DEFAULT_SETTINGS, background: 'rainbow' as const, textColor: '#123456' };
    const k = selectStyle(s, 'knockout');
    expect(k.background).toBe('palette');
    expect(k.palette).toBe(s.palette);
    expect(k.textColor).toBe('#123456');
    expect(selectStyle(k, 'single').background).toBe('transparent');
  });

  it('選配色還原文字與外框顏色的覆寫，背景同上', () => {
    const s = selectPalette(
      { ...DEFAULT_SETTINGS, style: 'knockout', textColor: '#ff0000', outlineColor: '#00ff00' },
      'mono',
    );
    expect([s.palette, s.textColor, s.outlineColor, s.background]).toEqual([
      'mono',
      null,
      null,
      'palette',
    ]);
  });

  it('搭配警告：霓虹、色差配透明背景；挖空配透明背景', () => {
    expect(lookWarnings({ ...DEFAULT_SETTINGS, style: 'neon' })).toEqual(['dark-style']);
    expect(lookWarnings({ ...DEFAULT_SETTINGS, style: 'glitch', background: 'solid' })).toEqual([]);
    expect(lookWarnings({ ...DEFAULT_SETTINGS, style: 'knockout' })).toEqual([
      'knockout-transparent',
    ]);
    expect(lookWarnings(selectStyle(DEFAULT_SETTINGS, 'knockout'))).toEqual([]);
  });

  it('選特效換成該特效的預設參數；選動態換成預設幅度，再選同一種不變', () => {
    const s = selectFx({ ...DEFAULT_SETTINGS, fxParams: { count: 3 } }, 'speedLines');
    expect(s.fxParams).toMatchObject({ count: 48, minLength: 0.1, maxLength: 0.3, width: 0.012 });
    expect(selectFx(s, 'none').fxParams).toEqual({});
    expect(fxDefaults('rings')).toMatchObject({ count: 3, speed: 1, width: 0.012 });
    const m = selectMotion({ ...DEFAULT_SETTINGS, motion: 'pulse', motionAmount: 0.1 }, 'pulse');
    expect(m.motionAmount).toBe(0.1);
    expect(MOTION_DEFAULTS).toMatchObject({
      pulse: 0.05,
      bounce: 0.04,
      jitter: 0.02,
      rotate: 1,
      wave: 0.08,
    });
    expect(selectMotion(m, 'rotate').motionAmount).toBe(1);
    expect(selectMotion(m, 'wave').motionAmount).toBe(0.08);
  });
});

describe('文字樣式（3.5）', () => {
  it('外框厚度總和（字級的倍數）：雙層 0.14、單層 0.09、擠出 0.05、霓虹 0.025、硬陰影 0.07、貼紙 0.19、色差 0.06、斜紋 0.14、挖空 0', () => {
    const sums = Object.fromEntries(STYLE_IDS.map((s) => [s, outlineSumPerSize(s, 1)]));
    expect(sums.double).toBeCloseTo(0.14);
    expect(sums.single).toBeCloseTo(0.09);
    expect(sums.extrude).toBeCloseTo(0.05);
    expect(sums.neon).toBeCloseTo(0.025);
    expect(sums.hard).toBeCloseTo(0.07);
    expect(sums.sticker).toBeCloseTo(0.19);
    expect(sums.glitch).toBeCloseTo(0.06);
    expect(sums.stripes).toBeCloseTo(0.14);
    expect(sums.knockout).toBe(0);
    expect(outlineSumPerSize('single', 1.4)).toBeCloseTo(0.126);
  });

  it('文字與外框顏色的覆寫：填色、所有外框換成單色；擠出厚度、光暈、硬陰影不受影響', () => {
    const base = {
      palette: PALETTES[0],
      textColor: '#112233',
      outlineColor: '#445566',
      size: 100,
      outlineScale: 1,
      seed: 1,
    };
    const sticker = styleLayers({ ...base, style: 'sticker' });
    const outlines = sticker.filter((l) => l.kind === 'outline');
    expect(outlines).toHaveLength(2);
    for (const l of outlines)
      expect(l.kind === 'outline' && l.paint).toEqual({ kind: 'solid', color: '#445566' });
    const fill = sticker.find((l) => l.kind === 'fill');
    expect(fill?.kind === 'fill' && fill.paint).toEqual({ kind: 'solid', color: '#112233' });
    const extrude = styleLayers({ ...base, style: 'extrude' }).find((l) => l.kind === 'extrude');
    expect(extrude?.kind === 'extrude' && extrude.paint).toEqual(PALETTES[0].outline1);
    if (extrude?.kind === 'extrude') {
      expect(Math.hypot(extrude.dx, extrude.dy)).toBeCloseTo(9);
      expect(extrude.dy).toBeGreaterThan(extrude.dx);
    }
    const hard = styleLayers({ ...base, style: 'hard' }).find((l) => l.kind === 'shadow');
    expect(hard?.kind === 'shadow' && hard.color).toBe(PALETTES[0].accent);
    const stripes = styleLayers({ ...base, style: 'stripes' }).find((l) => l.kind === 'fill');
    expect(stripes?.kind === 'fill' && stripes.paint.kind).toBe('stripes');
    /* 色差的小位移由種子決定（同種子相同） */
    const g1 = styleLayers({ ...base, style: 'glitch', seed: 5 });
    const g2 = styleLayers({ ...base, style: 'glitch', seed: 5 });
    const g3 = styleLayers({ ...base, style: 'glitch', seed: 6 });
    expect(g1).toEqual(g2);
    expect(g1).not.toEqual(g3);
    const ab = g1.find((l) => l.kind === 'aberration');
    if (ab?.kind === 'aberration')
      for (const j of ab.jitter ?? []) {
        expect(Math.abs(j.x)).toBeLessThanOrEqual(1.2);
        expect(Math.abs(j.y)).toBeLessThanOrEqual(1.2);
      }
  });

  it('色差故障：紅、青副本就是字形本身（不往外擴），外框照樣露出', () => {
    const layers = styleLayers({
      style: 'glitch',
      palette: paletteOf('mono'),
      textColor: null,
      outlineColor: null,
      size: 100,
      outlineScale: 1,
      seed: 12345,
    });
    expect(layers.map((l) => l.kind)).toEqual(['outline', 'aberration', 'fill']);
    const ab = layers[1];
    expect(ab.kind === 'aberration' && (ab.spread ?? 0)).toBe(0);
    expect(ab.kind === 'aberration' && ab.dx).toBeCloseTo(3);
  });

  it('霓虹發光：三層光暈用配色的填色（彩虹時跟著分色）、各 50%，模糊 σ＝0.22／0.147／0.073 字級（blur＝2σ）', () => {
    for (const id of ['rainbow-ink', 'ice', 'mono'] as const) {
      const p = paletteOf(id);
      const layers = styleLayers({
        style: 'neon',
        palette: p,
        textColor: '#123456',
        outlineColor: null,
        size: 300,
        outlineScale: 1,
        seed: 1,
      });
      const glows = layers.filter((l) => l.kind === 'glow');
      expect(glows).toHaveLength(3);
      glows.forEach((l, i) => {
        if (l.kind !== 'glow') return;
        expect(l.paint).toEqual(p.fill);
        expect(l.alpha).toBe(0.5);
        expect(l.composite ?? 'lighter').toBe('lighter');
        expect(l.blur).toBeCloseTo(300 * 2 * 0.22 * ((3 - i) / 3), 6);
      });
    }
  });
});

describe('字數（F11）', () => {
  it('所有行相加、不含換行；表情符號算 1 個字（字素）', () => {
    expect(charCount('大\n成功')).toBe(3);
    expect(charCount('👍🏽好\r\n👨‍👩‍👧')).toBe(3);
    expect(suggestedCharCount({ target: 'discord-sticker', font: 'noto-sans-tc' })).toBe(8);
    expect(suggestedCharCount({ target: 'ccfolia-cutin', font: 'dotgothic' })).toBe(12);
    expect(suggestedCharCount({ target: 'ccfolia-cutin', font: 'noto-sans-tc' })).toBe(20);
  });
});

describe('影格時間軸（3.2）', () => {
  it('APNG 每格延遲＝1000 ÷ fps 四捨五入', () => {
    const table: Record<number, number> = {
      5: 200,
      6: 167,
      7: 143,
      8: 125,
      9: 111,
      10: 100,
      11: 91,
      12: 83,
      13: 77,
      14: 71,
      15: 67,
      16: 63,
      17: 59,
      18: 56,
      19: 53,
      20: 50,
      21: 48,
      22: 45,
      23: 43,
      24: 42,
      25: 40,
      26: 38,
      27: 37,
      28: 36,
      29: 34,
      30: 33,
    };
    for (const [fps, ms] of Object.entries(table)) expect(apngDelayMs(Number(fps))).toBe(ms);
    const f = apngFrames(15, 15);
    expect(f).toHaveLength(15);
    expect(f.every((x) => x.ms === 67)).toBe(true);
    expect(f.reduce((a, x) => a + x.ms, 0)).toBe(1005);
  });

  it('第 i 格畫 t＝i ÷ N（最後一格不重複第一格）', () => {
    for (const N of [2, 12, 15, 60]) {
      const sec = 1 / 20;
      const ts = Array.from({ length: N }, (_, i) => loopProgressAt(i * sec, sec, N));
      expect(ts).toEqual(Array.from({ length: N }, (_, i) => i / N));
    }
    const apng = apngFrames(15, 15);
    expect(apng.map((x) => loopProgressAt(x.t ?? 0, 0.067, 15))).toEqual(
      Array.from({ length: 15 }, (_, i) => i / 15),
    );
  });

  it('GIF 以 1/100 秒累計（總長＝格數 ÷ fps）', () => {
    const cs = gifDelaysCs(uniformFrames(15, 15));
    expect(cs.reduce((a, b) => a + b, 0)).toBe(100);
    expect(gifDelaysCs(uniformFrames(15, 20)).every((d) => d === 5)).toBe(true);
    expect(gifDelaysCs(uniformFrames(10, 5)).every((d) => d === 20)).toBe(true);
  });
});

describe('自動縮小檔案（F46、3.11）', () => {
  it('1000 × 1000、30 格、無損：色數 → 格數 → 放射線 → 尺寸，最後無可再降', () => {
    let s: CutinSettings = {
      ...selectFx({ ...DEFAULT_SETTINGS, colors: 0, frames: 30 }, 'speedLines'),
      width: 1000,
      height: 1000,
    };
    const log: string[] = [];
    for (let i = 0; i < 30; i++) {
      const step = shrinkOnce(s, 'apng');
      if (!step) break;
      log.push(step.description);
      s = step.next;
    }
    expect(log).toEqual([
      '色數 無損 → 256 色',
      '色數 256 → 128 色',
      '色數 128 → 64 色',
      '影格數 30 → 27 格',
      '影格數 27 → 24 格',
      '影格數 24 → 21 格',
      '影格數 21 → 18 格',
      '影格數 18 → 15 格',
      '影格數 15 → 12 格',
      '影格數 12 → 10 格',
      '放射速度線 48 → 34 條',
      '放射速度線 34 → 24 條',
      '放射速度線 24 → 17 條',
      '放射速度線 17 → 16 條',
      '尺寸 1000 × 1000 → 800 × 800',
      '尺寸 800 × 800 → 640 × 640',
      '尺寸 640 × 640 → 512 × 512',
      '尺寸 512 × 512 → 410 × 410',
      '尺寸 410 × 410 → 328 × 328',
      '尺寸 328 × 328 → 262 × 262',
      '尺寸 262 × 262 → 210 × 210',
    ]);
    expect(s.fxParams.count).toBe(16);
    expect(shrinkOnce(s, 'apng')).toBeNull();
  });

  it('GIF 跳過色數；貼圖（固定尺寸）不縮尺寸', () => {
    const gif = shrinkOnce({ ...DEFAULT_SETTINGS, colors: 0, frames: 15 }, 'gif');
    expect(gif?.description).toBe('影格數 15 → 12 格');
    const sticker = shrinkOnce(
      {
        ...DEFAULT_SETTINGS,
        target: 'discord-sticker',
        width: 320,
        height: 320,
        frames: 10,
        colors: 64,
      },
      'apng',
    );
    expect(sticker).toBeNull();
  });
});

describe('檔名（F60、3.12）', () => {
  it('各行以底線相連＋_寬x高；文字全空時用 cutin；特殊字元用共用的清理', () => {
    expect(fileBaseName({ text: '大\n成功', width: 480, height: 480 })).toBe('大_成功_480x480');
    expect(
      fileNameWithExt(fileBaseName({ text: '大\n成功', width: 480, height: 480 }), 'gif'),
    ).toBe('大_成功_480x480.gif');
    expect(fileBaseName({ text: '  \n ', width: 320, height: 320 })).toBe('cutin_320x320');
    expect(fileNameWithExt(fileBaseName({ text: 'a/b:c?', width: 480, height: 480 }), 'png')).toBe(
      'a_b_c__480x480.png',
    );
  });
});
