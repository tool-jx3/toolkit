/**
 * 前景框產生器：沿框裝飾的導引線、配置與延伸量（規格 3.7）、決定性的亂數（F29、3.8）、窗內效果的粒子數、
 * 檔名與 ZIP 的檔名（3.12、第 7 節裁定）、字型（3.10、第 7 節裁定）、顆粒（3.3）。
 */
import { describe, expect, it } from 'vitest';
import { createRandom } from '@/core/timeline';
import { decoSeed } from '@/tools/foreground-frame/deco';
import { effectSeed, lightTint, particleCount } from '@/tools/foreground-frame/effects';
import { baseName, exportName, zipName } from '@/tools/foreground-frame/exporting';
import {
  canvasFontFamily,
  FALLBACK_GOTHIC,
  fontRequests,
  LOCAL_PRESETS,
} from '@/tools/foreground-frame/fonts';
import { openingRect } from '@/tools/foreground-frame/geometry';
import { decoCorners, guideRuns, sampleGuide } from '@/tools/foreground-frame/guide';
import { defaultState, type FrameState, textLayer } from '@/tools/foreground-frame/model';
import {
  contrastText,
  GRAIN_GAIN,
  grainValues,
  resolveSlot,
} from '@/tools/foreground-frame/render';
import { sceneryFor } from '@/tools/foreground-frame/scenery';

const shape = (margin = 120, patch: Partial<FrameState['opening']> = {}) => {
  const s = defaultState();
  s.opening = { ...s.opening, margin: { t: margin, r: margin, b: margin, l: margin }, ...patch };
  return s;
};
const runLength = (run: { u: number }[]) => run[run.length - 1].u;
const total = (runs: { u: number }[][]) => runs.reduce((n, r) => n + runLength(r), 0);

describe('導引線（3.7）', () => {
  it('窗的輪廓往框外推「離窗距離」單位；圓角照弧線', () => {
    const s = shape(120);
    const r = openingRect(s);
    const g = sampleGuide(s, 20, 6);
    const rad = 28 + 20;
    const perimeter = 2 * (r.w - 56 + r.h - 56) + 2 * Math.PI * rad;
    expect(g.L).toBeGreaterThan(perimeter * 0.99);
    expect(g.L).toBeLessThan(perimeter * 1.01);
    const top = g.pts.filter((p) => p.side === 't' && p.corner < 0);
    expect(new Set(top.map((p) => p.y))).toEqual(new Set([r.y0 - 20]));
    expect(top.every((p) => p.ny === -1)).toBe(true);
  });
  it('負的距離往窗內；其他角形當直角處理', () => {
    const s = shape(120, {
      corners: [0, 1, 2, 3].map(() => ({ type: 'notch' as const, size: 60 })),
    });
    const g = sampleGuide(s, -30, 6);
    const r = openingRect(s);
    const left = g.pts.filter((p) => p.corner < 0 && p.side === 'l');
    expect(new Set(left.map((p) => p.x))).toEqual(new Set([r.x0 + 30]));
    expect(g.pts.every((p) => p.corner < 0 || [0, 1, 2, 3].includes(p.corner))).toBe(true);
  });
  it('橢圓窗：放大的橢圓', () => {
    const s = shape(120, { shape: 'ellipse' });
    const g = sampleGuide(s, 10, 6);
    const r = openingRect(s);
    expect(Math.max(...g.pts.map((p) => p.x))).toBeCloseTo(r.x1 + 10, 0);
  });
});

describe('配置與延伸量（3.7）', () => {
  const s = shape(120);
  const base = { coverage: 1, offset: 0 };
  it('窗的四周、延伸 100% 是整圈（一段、首尾相接）', () => {
    const runs = guideRuns(s, { ...base, placement: 'all' });
    expect(runs).toHaveLength(1);
    const g = sampleGuide(s, 0, 6);
    expect(runLength(runs[0])).toBeCloseTo(g.L, 6);
  });
  it('上／下／上下／左右只在那幾條邊（以輪廓的朝向分）', () => {
    for (const [placement, sides] of [
      ['top', 't'],
      ['bottom', 'b'],
      ['topbottom', 'tb'],
      ['sides', 'lr'],
    ] as const) {
      const runs = guideRuns(s, { ...base, placement });
      expect(runs.length, placement).toBe(sides.length);
      for (const run of runs) for (const p of run) expect(sides.includes(p.side)).toBe(true);
    }
  });
  it('延伸量：每條邊從兩端的角往中間長，5% 只在兩端各一小段，越高越長，100% 整條', () => {
    const lens = [0.05, 0.3, 0.6, 1].map((c) =>
      guideRuns(s, { ...base, placement: 'top', coverage: c }),
    );
    expect(lens[0]).toHaveLength(2);
    expect(lens[1]).toHaveLength(2);
    expect(lens[3]).toHaveLength(1);
    const totals = lens.map(total);
    expect(totals[0]).toBeLessThan(totals[1]);
    expect(totals[1]).toBeLessThan(totals[2]);
    expect(totals[2]).toBeLessThan(totals[3]);
    /* 長度＝延伸量 ×（窗長邊的一半＋|距離|）：5% → 每段約 0.05 × 840 ≈ 42 單位（含角的弧） */
    const r = openingRect(s);
    const reach = 0.05 * (Math.max(r.w, r.h) / 2);
    for (const run of lens[0]) expect(runLength(run)).toBeLessThan(reach + 12);
  });
  it('角的配置：從角往兩邊長「延伸量 × 窗短邊的一半」', () => {
    const corners = guideRuns(s, { ...base, placement: 'corners', coverage: 0.5 });
    expect(corners).toHaveLength(4);
    const r = openingRect(s);
    for (const run of corners) {
      expect(runLength(run)).toBeGreaterThan(r.h * 0.5 * 0.5 * 2 - 12);
      expect(runLength(run)).toBeLessThan(r.h * 0.5 * 0.5 * 2 + 12);
    }
    const top = guideRuns(s, { ...base, placement: 'topcorners', coverage: 0.3 });
    expect(top).toHaveLength(2);
    for (const run of top) for (const p of run) expect(p.y).toBeLessThan(540);
    const bottom = guideRuns(s, { ...base, placement: 'bottomcorners', coverage: 0.3 });
    for (const run of bottom) for (const p of run) expect(p.y).toBeGreaterThan(540);
  });
  it('角落類的配置對應：上、上方兩角 → 上面兩角；下、下方兩角 → 下面兩角；其他 → 四個角', () => {
    const r = openingRect(s);
    const ids = (p: Parameters<typeof decoCorners>[1]) => decoCorners(r, p, 0).map((k) => k.i);
    expect(ids('top')).toEqual([0, 1]);
    expect(ids('topcorners')).toEqual([0, 1]);
    expect(ids('bottom')).toEqual([2, 3]);
    expect(ids('bottomcorners')).toEqual([2, 3]);
    expect(ids('sides')).toEqual([0, 1, 2, 3]);
    expect(ids('all')).toEqual([0, 1, 2, 3]);
    const [tl] = decoCorners(r, 'corners', 40);
    expect([tl.x, tl.y]).toEqual([r.x0 - 40, r.y0 - 40]);
  });
});

describe('決定性（F29、3.8）', () => {
  /* 原作的做法：FNV-1a 雜湊 XOR（圖樣＋1）× 2654435761，再用 mulberry32 */
  function fnv(text: string) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  function mulberry32(seed: number) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  it('裝飾的亂數：種類＋圖樣編號決定，與原作的序列相同', () => {
    for (const [type, seed] of [
      ['ivy', 1],
      ['chain', 8],
      ['gears', 2],
    ] as const) {
      const ours = createRandom(decoSeed(type, seed));
      const theirs = mulberry32(fnv(type) ^ Math.imul(seed + 1, 2654435761));
      for (let i = 0; i < 20; i++) expect(ours.next()).toBe(theirs());
    }
    expect(decoSeed('ivy', 1)).not.toBe(decoSeed('ivy', 2));
  });
  it('窗內效果的亂數：效果＋差分 id，不同差分的圖樣不同', () => {
    expect(effectSeed('rain', 'a')).toBe(effectSeed('rain', 'a'));
    expect(effectSeed('rain', 'a')).not.toBe(effectSeed('rain', 'b'));
    const ours = createRandom(effectSeed('snow', 'night'));
    const theirs = mulberry32(fnv('snow:night'));
    for (let i = 0; i < 10; i++) expect(ours.next()).toBe(theirs());
  });
  it('粒子數隨窗面積與強度增加', () => {
    const r = { w: 1848, h: 1008 };
    expect(particleCount(r, 9000, 0)).toBe(Math.round(((1848 * 1008) / 9000) * 0.25));
    expect(particleCount(r, 9000, 1)).toBe(Math.round(((1848 * 1008) / 9000) * 2));
    expect(particleCount({ w: 100, h: 100 }, 9000, 0.5)).toBeLessThan(particleCount(r, 9000, 0.5));
  });
  it('星光：暗的強調色往白提亮', () => {
    expect(lightTint('#ffffff')).toBe('rgb(255,255,255)');
    expect(lightTint('#000000')).toBe('rgb(204,204,204)');
  });
  it('顆粒：灰階雜點，平均約 128、範圍約 13～243；以「覆蓋」疊上，強度＝顆粒感 × 不透明度 × 0.6', () => {
    const v = grainValues();
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    expect(mean).toBeGreaterThan(126);
    expect(mean).toBeLessThan(130);
    expect(Math.min(...v)).toBeGreaterThanOrEqual(13);
    expect(Math.max(...v)).toBeLessThanOrEqual(243);
    expect(grainValues()).toEqual(v);
    expect(GRAIN_GAIN).toBe(0.6);
  });
});

describe('生效的配色（F55、F61）與標籤文字色（3.9）', () => {
  it('沒開差分時是整體配色，不畫覆蓋色與效果', () => {
    const s = defaultState();
    s.variants.items[3].effect = 'rain';
    const slot = resolveSlot(s, 'night');
    expect([slot.id, slot.name, slot.effect, slot.tintAlpha]).toEqual(['base', '', 'none', 0]);
    expect(slot.frame1).toBe(s.palette.frame1);
  });
  it('開了差分：差分的顏色（有勾自己的顏色時）、覆蓋色、效果', () => {
    const s = defaultState();
    s.variants.enabled = true;
    s.variants.items[3].effect = 'rain';
    const slot = resolveSlot(s, 'night');
    expect([slot.id, slot.name, slot.sub, slot.effect]).toEqual(['night', '夜晚', 'NIGHT', 'rain']);
    expect(slot.frame1).toBe('#262d4f');
    s.variants.items[3].useColors = false;
    expect(resolveSlot(s, 'night').frame1).toBe(s.palette.frame1);
    expect(resolveSlot(s, 'unknown').id).toBe('morning');
  });
  it('徽章的文字自動近黑或白', () => {
    expect(contrastText('#ffffff')).toBe('#1b1b1f');
    expect(contrastText('#3a8fcb')).toBe('#ffffff');
    expect(contrastText('#ffd66b')).toBe('#1b1b1f');
  });
  it('範例風景依差分換成對應的時段或天氣；沒開差分或對應不到時用白天', () => {
    expect(sceneryFor(true, 'night')).toBe('night');
    expect(sceneryFor(true, 'rain')).toBe('overcast');
    expect(sceneryFor(true, 'winter')).toBe('snowy');
    expect(sceneryFor(true, 'v123')).toBe('day');
    expect(sceneryFor(false, 'night')).toBe('day');
  });
});

describe('檔名（F74、3.12）', () => {
  it('Windows 不能用的字元換成底線、去頭尾空白；空白時用預設值', () => {
    expect(baseName('  my:frame?  ')).toBe('my_frame_');
    expect(baseName('a\\b/c*d"e<f>g|h')).toBe('a_b_c_d_e_f_g_h');
    expect(baseName('   ')).toBe('前景框');
    expect(baseName('')).toBe('前景框');
  });
  it('沒開差分：主體.png；開了差分：主體_序號_名稱.png（序號依整個清單，含不匯出的）', () => {
    const s = defaultState();
    s.fileBase = 'frame';
    expect(exportName(s, null)).toBe('frame.png');
    s.variants.items[0].name = 'a b/c:d';
    expect(exportName(s, s.variants.items[0])).toBe('frame_1_a_b_c_d.png');
    expect(zipName(s)).toBe('frame.zip');
  });
  it('時間帶四個、第 3 個不匯出 → frame_1_早晨、frame_2_白天、frame_4_夜晚（跳號，第 7 節裁定保留）', () => {
    const s = defaultState();
    s.fileBase = 'frame';
    expect(s.variants.items.filter((i) => i.on).map((i) => exportName(s, i))).toEqual([
      'frame_1_早晨.png',
      'frame_2_白天.png',
      'frame_4_夜晚.png',
    ]);
  });
  it('名稱：連續空白與不能用的字元換成一個底線、去頭尾底線、最多 40 字；空白時「差分N」', () => {
    const s = defaultState();
    s.fileBase = 'frame';
    const item = s.variants.items[2];
    item.name = '  ?? ';
    expect(exportName(s, item)).toBe('frame_3_差分3.png');
    item.name = '雨　夜\t第二幕';
    expect(exportName(s, item)).toBe('frame_3_雨_夜_第二幕.png');
    item.name = 'x'.repeat(45);
    expect(exportName(s, item)).toBe(`frame_3_${'x'.repeat(40)}.png`);
  });
});

describe('字型（3.10、F73、第 7 節裁定）', () => {
  it('8 組電腦內建字型組', () => {
    expect(LOCAL_PRESETS.map((p) => p.label)).toEqual([
      '黑體類',
      '明體類',
      '教科書體',
      '西文襯線',
      '西文無襯線',
      '繁中黑體',
      '繁中明體',
      '繁中楷書',
    ]);
    expect(canvasFontFamily({ source: 'local', family: 'Yu Mincho', weight: 700 })).toBe(
      '"Yu Mincho", "YuMincho", "Hiragino Mincho ProN", "BIZ UDPMincho", "MS PMincho", serif',
    );
    expect(canvasFontFamily({ source: 'local', family: 'DFKai-SB', weight: 400 })).toContain(
      '"標楷體"',
    );
  });
  it('網頁字型、上傳字型、依名稱指定的電腦字型都以黑體類為後備；名稱空白時就是後備', () => {
    expect(canvasFontFamily({ source: 'google', family: 'Noto Serif TC', weight: 700 })).toBe(
      `"Noto Serif TC", ${FALLBACK_GOTHIC}`,
    );
    expect(canvasFontFamily({ source: 'upload', family: 'My"Font', weight: 400 })).toBe(
      `"MyFont", ${FALLBACK_GOTHIC}`,
    );
    expect(canvasFontFamily({ source: 'local', family: '  ', weight: 400 })).toBe(FALLBACK_GOTHIC);
    expect(FALLBACK_GOTHIC).toContain('"Yu Gothic UI"');
    expect(FALLBACK_GOTHIC.endsWith('sans-serif')).toBe(true);
  });
  it('要先載入的字型：顯示中的文字圖層（粗體 700）與差分標籤（開了差分時）；電腦字型不載', () => {
    const s = defaultState();
    const t = textLayer();
    t.text = '{差分}的燈塔';
    s.layers = [t];
    expect(fontRequests(s)).toEqual([{ family: 'Noto Serif TC', weight: 700, text: '的燈塔' }]);
    s.variants.enabled = true;
    const req = fontRequests(s);
    expect(req.map((r) => r.family)).toEqual(['Noto Serif TC', 'Noto Sans TC']);
    expect(req[0].text).toContain('早晨的燈塔');
    s.layers[0] = { ...t, font: { source: 'local', family: 'Yu Mincho', weight: 700 } };
    expect(fontRequests(s).map((r) => r.family)).toEqual(['Noto Sans TC']);
  });
});
