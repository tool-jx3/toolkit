/**
 * 打字機動畫產生器：版面位置（規格 3.3、3.8、3.9.5）、依文字裁切的公式（3.12）、音效（3.10、3.11）、
 * 檔名（3.12）、設定的預設值與讀檔檢查（第 1、2 節），以及四個模式的來源（影格表、格數、空白文字）。
 * 量測用假的字寬（全形＝字級、半形＝0.3 字級），不需要瀏覽器。
 */
import { describe, expect, it } from 'vitest';
import { pcmLength } from '@/core/audio';
import { frameTableDuration } from '@/core/timeline';
import { isWide, type MeasureFn } from '@/core/typeset';
import {
  mixTypingSound,
  SKIP_FADE_SECONDS,
  silencePlan,
  typingSoundPlan,
} from '@/tools/typewriter/audio';
import {
  animationBaseName,
  segmentBaseName,
  segmentSummary,
  silenceFileName,
  soundFileName,
} from '@/tools/typewriter/filename';
import {
  horizontalBlockX,
  horizontalBlockY,
  karaokeFitSize,
  karaokeRowBand,
  verticalBlockX,
} from '@/tools/typewriter/layout';
import {
  buildCreditsSource,
  buildGlitchSource,
  buildKaraokeSource,
  buildTypingSource,
  glitchSeed,
  linearLayout,
} from '@/tools/typewriter/render';
import {
  DEFAULT_CREDITS,
  DEFAULT_DATA,
  DEFAULT_GLITCH,
  DEFAULT_KARAOKE,
  DEFAULT_TYPING,
  KARAOKE_PALETTES,
  normalizeData,
} from '@/tools/typewriter/settings';
import { creditSegments, toUnits, typingUnitCount } from '@/tools/typewriter/timeline';

const pxOf = (font: string) => Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16);
const fakeMeasure: MeasureFn = (font, ch) => {
  const S = pxOf(font);
  const w = isWide(ch) ? S : S * 0.3;
  return { w, l: 0, r: w, a: S * 0.8, d: S * 0.2 };
};
const font = (px: number) => `400 ${px.toFixed(2)}px sans-serif`;

describe('版面位置（規格 3.3）', () => {
  it('水平縮放 50%：靠左的字從 x＝5 開始、靠右的字收在 x＝595（畫布寬 600）', () => {
    const s = { ...DEFAULT_TYPING, text: 'II', scaleX: 50, width: 600 };
    const left = linearLayout({ ...s, align: 'left' }, toUnits(s.text), font, fakeMeasure);
    const a = left.slots[0]!;
    expect(a.x - (a.adv * 0.5) / 2).toBeCloseTo(5, 6);
    const right = linearLayout({ ...s, align: 'right' }, toUnits(s.text), font, fakeMeasure);
    const b = right.slots[1]!;
    expect(b.x + (b.adv * 0.5) / 2).toBeCloseTo(595, 6);
    const center = linearLayout({ ...s, align: 'center' }, toUnits(s.text), font, fakeMeasure);
    const c0 = center.slots[0]!;
    const c1 = center.slots[1]!;
    expect((c0.x - (c0.adv * 0.5) / 2 + c1.x + (c1.adv * 0.5) / 2) / 2).toBeCloseTo(300, 6);
  });

  it('字距照設定值（一倍）：兩字起點相距＝字寬＋字距；置中不偏移（主控裁定）', () => {
    const s = { ...DEFAULT_TYPING, text: 'II', tracking: 40, size: 48, align: 'center' as const };
    const L = linearLayout(s, toUnits(s.text), font, fakeMeasure);
    const [a, b] = [L.slots[0]!, L.slots[1]!];
    expect(b.x - a.x).toBeCloseTo(14.4 + 40, 6);
    const left = a.x - a.adv / 2;
    const right = b.x + b.adv / 2;
    expect((left + right) / 2).toBeCloseTo(300, 6);
  });

  it('橫書的垂直對齊：靠上 y＝10、置中、靠下時最後一行下方留白＝10＋（行距 − 字級）', () => {
    expect(horizontalBlockY('top', 300, 2, 48, 1.2)).toBe(10);
    /* 置中：(畫布高 − 整塊高) ÷ 2 ＋ (行距 − 字級) ÷ 2，整塊高＝行數 × 行距 */
    expect(horizontalBlockY('middle', 300, 2, 48, 1.2)).toBeCloseTo(
      (300 - 2 * 57.6) / 2 + (57.6 - 48) / 2,
      9,
    );
    const top = horizontalBlockY('bottom', 300, 2, 48, 1.2);
    const lastBottom = top + 57.6 + 48;
    expect(300 - lastBottom).toBeCloseTo(10 + 57.6 - 48, 9);
    expect(horizontalBlockX('left', 600, 100)).toBe(10);
    expect(horizontalBlockX('right', 600, 100)).toBe(490);
    expect(horizontalBlockX('center', 600, 100)).toBe(250);
    expect(horizontalBlockX('left', 200, 50, 1, 20)).toBe(20);
  });

  it('直書（48 px、行距 1.2、600 × 300、靠右靠上）：欄中心 x＝566、508.4，字身框上緣 y＝10、58', () => {
    const s = {
      ...DEFAULT_TYPING,
      text: '甲甲\n甲',
      vertical: true,
      size: 48,
      leading: 1.2,
      align: 'right' as const,
      valign: 'top' as const,
    };
    const L = linearLayout(s, toUnits(s.text), font, fakeMeasure);
    const [a, b, , c] = L.slots;
    expect(a!.x).toBeCloseTo(566, 6);
    expect(c!.x).toBeCloseTo(508.4, 6);
    expect(a!.y - 24).toBeCloseTo(10, 6);
    expect(b!.y - 24).toBeCloseTo(58, 6);
    /* 靠左：第一欄中心＝10＋整組寬 − 字級 ÷ 2；置中：(畫布寬＋整組寬) ÷ 2 − 字級 ÷ 2 */
    const G = 2 * 57.6;
    const bw = 57.6 + 48;
    expect(verticalBlockX('left', 600, 2, 48, 1.2) + bw - 24).toBeCloseTo(10 + G - 24, 9);
    expect(verticalBlockX('center', 600, 2, 48, 1.2) + bw - 24).toBeCloseTo((600 + G) / 2 - 24, 9);
  });

  it('直書每欄各自垂直置中（長短不一的欄上下都不齊）', () => {
    const s = {
      ...DEFAULT_TYPING,
      text: '甲甲甲\n乙',
      vertical: true,
      valign: 'middle' as const,
    };
    const L = linearLayout(s, toUnits(s.text), font, fakeMeasure);
    const col1Center = (L.slots[0]!.y + L.slots[2]!.y) / 2;
    expect(col1Center).toBeCloseTo(150, 6);
    expect(L.slots[4]!.y).toBeCloseTo(150, 6);
  });

  it('卡拉 OK 的遮罩範圍：第一行到畫布頂、最後一行到畫布底、中間到行與行的中線', () => {
    expect(karaokeRowBand(0, 3, 50, 300, 48, 1.5)).toEqual({ top: 0, bottom: 50 + 48 + 12 });
    expect(karaokeRowBand(1, 3, 122, 300, 48, 1.5)).toEqual({ top: 110, bottom: 182 });
    expect(karaokeRowBand(2, 3, 194, 300, 48, 1.5)).toEqual({ top: 182, bottom: 300 });
  });
});

describe('依文字裁切（卡拉 OK 公式）', () => {
  it('最寬一句 480 px、外框 6、陰影模糊 6：3 行 → 544 × 280；固定 2 行 → 544 × 208', () => {
    const base = {
      maxLineWidth: 480,
      scaleX: 1,
      size: 48,
      leading: 1.5,
      strokeWidth: 6,
      shadowBlur: 6,
    };
    expect(karaokeFitSize({ ...base, rows: 3 })).toEqual({ width: 544, height: 280 });
    expect(karaokeFitSize({ ...base, rows: 2 })).toEqual({ width: 544, height: 208 });
  });
  it('至少 50', () => {
    expect(
      karaokeFitSize({
        maxLineWidth: 0,
        scaleX: 1,
        rows: 0,
        size: 8,
        leading: 1,
        strokeWidth: 0,
        shadowBlur: 0,
      }),
    ).toEqual({ width: 50, height: 50 });
  });
});

describe('音效（規格 3.10、3.11）', () => {
  it('「AB 한」6 單位、10 FPS、停留 1 秒、0.25 秒的音效：兩種方式都是 1.6 秒', () => {
    expect(typingUnitCount('AB 한')).toBe(6);
    const each = typingSoundPlan({
      units: 6,
      fps: 10,
      holdMs: 1000,
      clipSeconds: 0.25,
      mode: 'each',
    });
    expect(each.duration).toBeCloseTo(1.6, 9);
    expect(each.times.map((t) => +t.toFixed(3))).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5]);
    expect(each.fade).toBeNull();
    const skip = typingSoundPlan({
      units: 6,
      fps: 10,
      holdMs: 1000,
      clipSeconds: 0.25,
      mode: 'skip',
    });
    expect(skip.duration).toBeCloseTo(1.6, 9);
    expect(skip.times.map((t) => +t.toFixed(3))).toEqual([0, 0.3]);
    expect(skip.fade).toEqual({ start: 0.6, end: 0.6 + SKIP_FADE_SECONDS });
  });

  it('每格都播：音效比停留長時長度＝打字時間＋音效長度', () => {
    const p = typingSoundPlan({ units: 2, fps: 10, holdMs: 100, clipSeconds: 1, mode: 'each' });
    expect(p.duration).toBeCloseTo(1.2, 9);
  });

  it('合成的音訊：取樣率、聲道數同音效，長度＝計畫長度', () => {
    const clip = { sampleRate: 1000, channels: [new Float32Array(250).fill(0.5)] };
    const plan = typingSoundPlan({
      units: 6,
      fps: 10,
      holdMs: 1000,
      clipSeconds: 0.25,
      mode: 'each',
    });
    const mixed = mixTypingSound(clip, plan);
    expect(mixed.sampleRate).toBe(1000);
    expect(mixed.channels).toHaveLength(1);
    expect(pcmLength(mixed)).toBe(1600);
    /* 0.2～0.25 秒有 3 聲疊加（夾到 1） */
    expect(mixed.channels[0][220]).toBe(1);
    expect(mixed.channels[0][100]).toBe(1);
    expect(mixed.channels[0][50]).toBeCloseTo(0.5, 6);
  });

  it('靜音 WAV：一個檔案＝總時間＋延長；分段＝各段長度＋延長', () => {
    const segs = creditSegments('A\n\nBB', 3, 10);
    expect(silencePlan({ split: false, duration: 20, extra: 1.5, segments: segs })).toEqual([
      { segment: null, seconds: 21.5 },
    ]);
    const parts = silencePlan({ split: true, duration: 3, extra: 0.5, segments: segs });
    expect(parts.map((p) => +p.seconds.toFixed(6))).toEqual([1.5, 2.5]);
  });
});

describe('檔名（規格 3.12）', () => {
  it('動畫、音效、靜音', () => {
    expect(animationBaseName('typing', 123)).toBe('typing_123');
    expect(animationBaseName('glitch', 123)).toBe('glitch_123');
    expect(animationBaseName('credits', 123)).toBe('credit_123');
    expect(animationBaseName('karaoke', 123)).toBe('karaoke_123');
    expect(soundFileName(9)).toBe('sound_9.wav');
    expect(silenceFileName(9)).toBe('silent_9.wav');
  });
  it('分段摘要：第一行前 10 個字，保留中日韓文字，去掉不能用在檔名的字元', () => {
    expect(segmentSummary('中文段落\n第二行')).toBe('中文段落');
    expect(segmentSummary('一二三四五六七八九十十一')).toBe('一二三四五六七八九十');
    expect(segmentSummary('a/b:c?')).toBe('abc');
    expect(segmentBaseName(5, '???', 1)).toBe('5_1');
  });
});

describe('設定', () => {
  it('預設值照規格第 1 節', () => {
    expect(DEFAULT_TYPING).toMatchObject({
      size: 48,
      scaleX: 100,
      tracking: 0,
      leading: 1.2,
      bold: false,
      fill: '#ffffff',
      strokeColor: '#000000',
      strokeWidth: 4,
      shadowColor: '#000000',
      shadowBlur: 4,
      shadowX: 2,
      shadowY: 2,
      fps: 12,
      holdMs: 2000,
      width: 600,
      height: 300,
      quantize: true,
      font: 'Noto Sans TC',
      fade: 'none',
      fadeMs: 1000,
      shapeSize: 100,
      rotate: 0,
    });
    expect(DEFAULT_GLITCH).toMatchObject({
      bold: true,
      fill: '#ff0033',
      strokeWidth: 2,
      shadowColor: '#ff0033',
      shadowBlur: 8,
      shadowX: 0,
      shadowY: 0,
      fps: 15,
      intensity: 3,
      together: false,
    });
    expect(DEFAULT_CREDITS).toMatchObject({
      size: 32,
      leading: 1.5,
      bold: false,
      strokeWidth: 2,
      fps: 12,
      width: 720,
      height: 400,
      duration: 20,
      silenceExtra: 0,
    });
    expect(DEFAULT_KARAOKE).toMatchObject({
      leading: 1.5,
      bold: true,
      strokeWidth: 6,
      shadowBlur: 6,
      fps: 20,
      holdMs: 1500,
      width: 720,
      height: 300,
      duration: 8,
      intro: 0.5,
      beforeFill: '#ffffff',
      beforeStroke: '#333333',
      afterFill: '#ffe66d',
      afterStroke: '#ff2e63',
      softness: 14,
      glowOn: true,
      glowColor: '#ffffff',
      glowWidth: 26,
      rows: 2,
      swapFade: 0.25,
    });
    expect(DEFAULT_DATA.webp).toEqual({ lossless: true, quality: 92 });
  });

  it('範例文字：打字有換行、故障中英混合、片尾有空白行、卡拉 OK 至少三句且有時間標記', () => {
    expect(DEFAULT_TYPING.text).toContain('\n');
    expect(DEFAULT_GLITCH.text).toMatch(/[A-Za-z]/);
    expect(DEFAULT_GLITCH.text).toMatch(/[一-鿿]/);
    expect(DEFAULT_CREDITS.text).toMatch(/\n\s*\n/);
    const lines = DEFAULT_KARAOKE.text.split('\n').filter((l) => l.trim());
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(DEFAULT_KARAOKE.text).toMatch(/\|\s*\d/);
  });

  it('卡拉 OK 的 4 組配色預設，其中一組等於預設顏色', () => {
    expect(KARAOKE_PALETTES).toHaveLength(4);
    expect(
      KARAOKE_PALETTES.some(
        (p) =>
          p.beforeFill === DEFAULT_KARAOKE.beforeFill &&
          p.beforeStroke === DEFAULT_KARAOKE.beforeStroke &&
          p.afterFill === DEFAULT_KARAOKE.afterFill &&
          p.afterStroke === DEFAULT_KARAOKE.afterStroke,
      ),
    ).toBe(true);
  });

  it('讀檔：不是物件回傳 null；缺的欄位補預設值；數值夾到範圍；色碼與選項不合法時用預設', () => {
    expect(normalizeData(null)).toBeNull();
    expect(normalizeData('x')).toBeNull();
    const d = normalizeData({
      typing: { fps: 0, size: 9999, fill: 'red', fade: 'nope', text: '你好' },
      karaoke: { rows: 99, show: 'page' },
      webp: { quality: 0 },
    })!;
    expect(d.typing.fps).toBe(1);
    expect(d.typing.size).toBe(400);
    expect(d.typing.fill).toBe('#ffffff');
    expect(d.typing.fade).toBe('none');
    expect(d.typing.text).toBe('你好');
    expect(d.glitch).toEqual(DEFAULT_GLITCH);
    expect(d.karaoke.rows).toBe(20);
    expect(d.karaoke.show).toBe('page');
    expect(d.webp.quality).toBe(1);
  });
});

describe('四個模式的來源', () => {
  const o = { measure: fakeMeasure };
  it('打字：影格表的總長＝各格延遲總和；空文字沒有動畫', () => {
    const src = buildTypingSource({ ...DEFAULT_TYPING, text: '早安，\n冒險者' }, o);
    expect(src.frames).toHaveLength(7);
    expect(src.duration).toBeCloseTo(frameTableDuration(src.frames), 9);
    expect(src.empty).toBe(false);
    expect(buildTypingSource({ ...DEFAULT_TYPING, text: '' }, o)).toMatchObject({
      empty: true,
      duration: 0,
    });
  });

  it('打字：依文字裁切量「字最多的第一格」（旋轉時是打完的那一格）', () => {
    const src = buildTypingSource(
      { ...DEFAULT_TYPING, text: 'ABCD', shape: 'circle', rotate: 15, holdMs: 500, fps: 10 },
      o,
    );
    expect(src.frames).toHaveLength(8);
    expect(src.fitFrame).toBe(3);
  });

  it('打字：韓文的拆字步驟也算進要載入的字', () => {
    const src = buildTypingSource({ ...DEFAULT_TYPING, text: '한' }, o);
    const main = src.fontLoads[0];
    expect(main.family).toBe('Noto Sans TC');
    expect(src.fontLoads.some((f) => f.family === 'Noto Sans KR' && f.text.includes('ㅎ'))).toBe(
      true,
    );
  });

  it('故障：亂碼的種子只看時間軸相關的設定（同設定可重現）', () => {
    const a = glitchSeed(DEFAULT_GLITCH);
    expect(glitchSeed({ ...DEFAULT_GLITCH, fill: '#00ff00' })).toBe(a);
    expect(glitchSeed({ ...DEFAULT_GLITCH, text: 'X' })).not.toBe(a);
    const src = buildGlitchSource(DEFAULT_GLITCH, o);
    const again = buildGlitchSource(DEFAULT_GLITCH, o);
    expect(src.fontKey).toBe(again.fontKey);
    expect(src.frames.at(-1)!.ms).toBe(2000);
  });

  it('片尾名單：格數＝總時間 × FPS 捨去；沒有停留格', () => {
    const src = buildCreditsSource({ ...DEFAULT_CREDITS, duration: 2, fps: 10 }, o);
    expect(src.frames).toHaveLength(20);
    expect(src.frames.every((f) => Math.abs(f.ms - 100) < 1e-9)).toBe(true);
  });

  it('卡拉 OK：格數＝結束時間 × FPS 進位＋1 停留格；只有空白時沒有動畫', () => {
    const src = buildKaraokeSource(DEFAULT_KARAOKE, o);
    expect(src.frames).toHaveLength(171);
    expect(src.frames.at(-1)!.ms).toBe(1500);
    expect(buildKaraokeSource({ ...DEFAULT_KARAOKE, text: '   \n ' }, o).empty).toBe(true);
  });
});
