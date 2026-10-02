/**
 * 切入素材產生器：自動字級與置中（規格 3.3、3.5 的字級量測、3.7 的文字半徑）、文字動態（3.9）。
 * 字寬用假的量測（中文字寬＝字級），所以字級可以直接用規格的公式算。
 */
import { describe, expect, it } from 'vitest';
import type { MeasureFn } from '@/core/typeset';
import type { CutinSettings } from '@/tools/cutin/model';
import { motionAt, waveOffset } from '@/tools/cutin/motion';
import { layoutText, textRadius } from '@/tools/cutin/scene';
import { DEFAULT_SETTINGS } from '@/tools/cutin/settings';

/** 假的量測：中日韓字寬＝字級，其他 0.6 字級；墨跡上緣 0.88、下緣 0.12 字級 */
const measure: MeasureFn = (font, ch) => {
  const px = Number(/([\d.]+)px/.exec(font)?.[1] ?? 16);
  const wide = /[　-鿿＀-￯]/.test(ch);
  const w = (wide ? 1 : 0.6) * px;
  return { w, l: 0, r: w, a: 0.88 * px, d: 0.12 * px };
};

const base: CutinSettings = { ...DEFAULT_SETTINGS, font: 'noto-sans-tc', style: 'single' };
const lay = (patch: Partial<CutinSettings>, outlineScale = 1) =>
  layoutText({ ...base, ...patch }, outlineScale, measure);

describe('自動字級（3.3）', () => {
  it('寬受限：「測試」單層外框 → (2 ＋ 0.02 ＋ 2 × 0.09) × 字級 ≤ 480 × 92%', () => {
    const L = lay({ text: '測試' });
    expect(L.size).toBeGreaterThan(441.6 / 2.2 - 0.15);
    expect(L.size).toBeLessThanOrEqual(441.6 / 2.2 + 1e-6);
  });

  it('高受限：單字「一」單層 345、雙層 320、貼紙 298（規格 3.5 的量測）', () => {
    expect(lay({ text: '一' }).size).toBeCloseTo(345, 0);
    expect(lay({ text: '一', style: 'double' }).size).toBeCloseTo(320, 0);
    expect(lay({ text: '一', style: 'sticker' }).size).toBeCloseTo(298, 0);
  });

  it('多行：行數 × 字級 × 行距；空行也佔一行；字型的外框倍率算進去', () => {
    expect(lay({ text: '甲\n乙' }).size).toBeCloseTo(441.6 / 2.38, 0);
    const blank = lay({ text: '大\n\n成功' });
    expect(blank.lines).toBe(3);
    expect(blank.size).toBeCloseTo(441.6 / (3 * 1.1 + 0.18), 0);
    expect(lay({ text: '一' }, 1.4).size).toBeCloseTo(441.6 / (1.1 + 0.18 * 1.4), 0);
  });

  it('行距、字距會改變自動字級；文字縮放乘在自動字級上', () => {
    expect(lay({ text: '甲\n乙', leading: 1.4 }).size).toBeCloseTo(441.6 / (2.8 + 0.18), 0);
    const tr = lay({ text: '測試', tracking: 0.3 });
    expect(tr.size).toBeCloseTo(441.6 / (2.3 + 0.18), 0);
    const half = lay({ text: '大\n成功', textScale: 0.5 });
    const full = lay({ text: '大\n成功' });
    expect(half.size).toBeCloseTo(full.size * 0.5, 5);
    expect(half.autoSize).toBeCloseTo(full.size, 5);
  });

  it('字級上限＝長邊 × 1.2，下限 8 px', () => {
    expect(lay({ text: '一', width: 64, height: 64, style: 'knockout' }).size).toBeLessThanOrEqual(
      76.8,
    );
    expect(lay({ text: '測'.repeat(200) }).size).toBe(8);
  });

  it('整塊以畫布中心置中；每行水平置中；行的中線間隔＝字級 × 行距', () => {
    for (const [w, h] of [
      [480, 480],
      [800, 450],
    ]) {
      const L = lay({ text: '一二\n三四五\n六', width: w, height: h });
      expect(L.box.x + L.box.w / 2).toBeCloseTo(w / 2, 6);
      expect(L.box.y + L.box.h / 2).toBeCloseTo(h / 2, 6);
      expect(L.box.h).toBeCloseTo(3 * L.size * 1.1, 6);
      const ys = [...new Set(L.shape.glyphs.map((g) => Math.round(g.y * 1000) / 1000))];
      expect(ys).toHaveLength(3);
      expect(ys[1] - ys[0]).toBeCloseTo(L.size * 1.1, 3);
      expect((ys[0] + ys[2]) / 2).toBeCloseTo(h / 2, 3);
      /* 每行水平置中 */
      const line = (y: number) => L.shape.glyphs.filter((g) => Math.abs(g.y - y) < 0.01);
      for (const y of ys) {
        const g = line(y);
        const left = g[0].x - g[0].adv / 2;
        const right = g[g.length - 1].x + g[g.length - 1].adv / 2;
        expect((left + right) / 2).toBeCloseTo(w / 2, 3);
      }
    }
  });

  it('文字半徑＝文字塊對角線的一半：「測」倍率 0.5 → 圓環從約 135 px、放射線從約 130 px 開始', () => {
    const L = lay({ text: '測', textScale: 0.5 });
    const r = textRadius(L.box);
    expect(r * 1.05).toBeCloseTo(135, -0.5);
    expect(r * 1.02).toBeCloseTo(130.5, -0.5);
  });
});

describe('文字動態（3.9）', () => {
  const m = (motion: Parameters<typeof motionAt>[0]['motion'], amount: number) => ({
    motion,
    amount,
    width: 480,
    height: 480,
    fontSize: 200,
    glyphCount: 2,
    seed: 12345,
  });

  it('脈動縮放：原大 → 1＋幅度 → 原大 → 1－幅度', () => {
    const at = (t: number) => motionAt(m('pulse', 0.05), t).transform?.scale ?? 1;
    expect(at(0)).toBeCloseTo(1);
    expect(at(0.25)).toBeCloseTo(1.05);
    expect(at(0.5)).toBeCloseTo(1);
    expect(at(0.75)).toBeCloseTo(0.95);
  });

  it('上下彈跳：上移 0.71 × 幅度 × 短邊 → 幅度 × 短邊 → 0.71 ×；落地時是尖的', () => {
    const at = (t: number) => -(motionAt(m('bounce', 0.04), t).transform?.dy ?? 0);
    expect(at(0)).toBeCloseTo(0);
    expect(at(0.25)).toBeCloseTo(0.04 * 480 * Math.SQRT1_2);
    expect(at(0.5)).toBeCloseTo(19.2);
    expect(at(0.75)).toBeCloseTo(0.04 * 480 * Math.SQRT1_2);
    /* 落地前後對稱、斜率不為 0（尖的） */
    expect(at(0.01)).toBeCloseTo(at(0.99));
    expect(at(0.01)).toBeGreaterThan(0.5);
  });

  it('整體旋轉：圈數 × 360° × t，順時針', () => {
    const at = (t: number, turns: number) => motionAt(m('rotate', turns), t).transform?.rotate ?? 0;
    expect(at(0.25, 1)).toBeCloseTo(Math.PI / 2);
    expect(at(0.5, 1)).toBeCloseTo(Math.PI);
    expect(at(0.25, 2)).toBeCloseTo(Math.PI);
    expect(at(0.75, 3)).toBeCloseTo(4.5 * Math.PI);
  });

  it('逐字波浪：第一個字在 t＝0 原位；相位依字序落後 k ÷ n 個循環；往下為正', () => {
    expect(waveOffset(0.08, 200, 0, 2, 0)).toBeCloseTo(0);
    expect(waveOffset(0.08, 200, 1, 2, 0)).toBeCloseTo(0);
    expect(waveOffset(0.08, 200, 0, 2, 0.25)).toBeCloseTo(16);
    expect(waveOffset(0.08, 200, 1, 2, 0.25)).toBeCloseTo(-16);
    const o = motionAt(m('wave', 0.08), 0.25).offset;
    expect(o?.(0, { ch: '測', x: 0, y: 0, adv: 1 }).dy).toBeCloseTo(16);
    expect(o?.(1, { ch: '試', x: 0, y: 0, adv: 1 }).dy).toBeCloseTo(-16);
  });

  it('隨機抖動：每軸不超過 幅度 × 短邊，依種子決定，t＝1 接回 t＝0', () => {
    const A = 0.02;
    let maxX = 0;
    let maxY = 0;
    for (let i = 0; i <= 200; i++) {
      const tr = motionAt(m('jitter', A), i / 200).transform;
      maxX = Math.max(maxX, Math.abs(tr?.dx ?? 0));
      maxY = Math.max(maxY, Math.abs(tr?.dy ?? 0));
    }
    expect(maxX).toBeLessThanOrEqual(A * 480);
    expect(maxY).toBeLessThanOrEqual(A * 480);
    expect(maxX).toBeGreaterThan(A * 480 * 0.3);
    const t0 = motionAt(m('jitter', A), 0).transform;
    const t1 = motionAt(m('jitter', A), 1).transform;
    expect(t1?.dx).toBeCloseTo(t0?.dx ?? 0, 9);
    expect(t1?.dy).toBeCloseTo(t0?.dy ?? 0, 9);
    const other = motionAt({ ...m('jitter', A), seed: 1 }, 0.3).transform;
    expect(other?.dx).not.toBeCloseTo(motionAt(m('jitter', A), 0.3).transform?.dx ?? 0, 3);
  });

  it('所有動態在 t＝1 回到 t＝0（無縫循環）', () => {
    for (const kind of ['pulse', 'bounce', 'rotate', 'wave'] as const) {
      const a = motionAt(m(kind, kind === 'rotate' ? 2 : 0.05), 0);
      const b = motionAt(m(kind, kind === 'rotate' ? 2 : 0.05), 1);
      expect(b.transform?.scale ?? 1).toBeCloseTo(a.transform?.scale ?? 1);
      expect(b.transform?.dy ?? 0).toBeCloseTo(a.transform?.dy ?? 0);
      expect(((b.transform?.rotate ?? 0) % (2 * Math.PI)) + 0).toBeCloseTo(
        (a.transform?.rotate ?? 0) % (2 * Math.PI),
      );
      expect(b.offset?.(1, { ch: 'a', x: 0, y: 0, adv: 1 }).dy ?? 0).toBeCloseTo(
        a.offset?.(1, { ch: 'a', x: 0, y: 0, adv: 1 }).dy ?? 0,
      );
    }
  });
});
