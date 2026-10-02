/**
 * 魔法陣製作器：動態（規格 3.2、3.5）——加速曲線、每種效果的狀態、複本延遲、自動排列與反轉、動態預設。
 */
import { describe, expect, it } from 'vitest';
import {
  classicTemplate,
  createCircle,
  createPath,
  createText,
  defaultAnimation,
  type McAnimation,
  type McElement,
  pathPoint,
} from '../../src/tools/magic-circle/model';
import {
  animationState,
  autoSequence,
  easeValue,
  reverseSequence,
  STYLE_PRESETS,
  withMotionPreset,
} from '../../src/tools/magic-circle/motion';

const el = (a: Partial<McAnimation>): Pick<McElement, 'id' | 'animation'> => ({
  id: 'el-1',
  animation: defaultAnimation({ easing: 'linear', start: 1, duration: 2, ...a }),
});

describe('加速曲線', () => {
  it('取樣值', () => {
    expect(easeValue('linear', 0.3)).toBeCloseTo(0.3);
    expect(easeValue('easeIn', 0.5)).toBeCloseTo(0.125);
    expect(easeValue('easeOut', 0.5)).toBeCloseTo(0.875);
    expect(easeValue('easeInOut', 0.25)).toBeCloseTo(0.0625);
    expect(easeValue('easeInOut', 0.75)).toBeCloseTo(0.9375);
    expect(easeValue('overshoot', 0.6)).toBeCloseTo(1 + 2.70158 * -0.064 + 1.70158 * 0.16);
    expect(easeValue('overshoot', 0.8)).toBeGreaterThan(1);
    expect(easeValue('easeIn', -1)).toBe(0);
    expect(easeValue('easeIn', 2)).toBe(1);
  });
});

describe('每種效果的狀態', () => {
  it('一直顯示', () => {
    expect(animationState(el({ mode: 'none' }), 0, 0, 1)).toMatchObject({
      visible: true,
      alpha: 1,
    });
  });

  it('開始前不可見、結束後保持或消失', () => {
    expect(animationState(el({ mode: 'draw' }), 0.5, 0, 1).visible).toBe(false);
    expect(animationState(el({ mode: 'draw' }), 3, 0, 1)).toMatchObject({ visible: true, draw: 1 });
    expect(animationState(el({ mode: 'draw', holdAfter: false }), 3, 0, 1).visible).toBe(false);
  });

  it('繪製、邊繪製邊發光、淡入', () => {
    expect(animationState(el({ mode: 'draw' }), 1.5, 0, 1).draw).toBeCloseTo(0.25);
    const g = animationState(el({ mode: 'drawGlow' }), 2, 0, 1);
    expect(g.draw).toBeCloseTo(0.5);
    expect(g.glow).toBeCloseTo(2.1);
    expect(animationState(el({ mode: 'drawGlow' }), 1, 0, 1).glow).toBeCloseTo(0.7);
    const f = animationState(el({ mode: 'fadeIn' }), 1.5, 0, 1);
    expect(f.alpha).toBeCloseTo(0.25);
    expect(f.glow).toBeCloseTo(0.25);
  });

  it('淡出：開始前完全可見、結束後一律消失', () => {
    expect(animationState(el({ mode: 'fadeOut' }), 0, 0, 1)).toMatchObject({
      visible: true,
      alpha: 1,
    });
    const m = animationState(el({ mode: 'fadeOut' }), 1.5, 0, 1);
    expect(m.alpha).toBeCloseTo(0.75);
    expect(m.glow).toBeCloseTo(0.875);
    expect(animationState(el({ mode: 'fadeOut', holdAfter: true }), 3, 0, 1).visible).toBe(false);
  });

  it('擴散、放大、旋轉出現', () => {
    const c = animationState(el({ mode: 'centerSpread' }), 2, 0, 1);
    expect(c).toMatchObject({ clip: 0.5 });
    expect(c.alpha).toBeCloseTo(0.675);
    expect(c.glow).toBeCloseTo(1.05);
    const s = animationState(el({ mode: 'scaleIn' }), 1.5, 0, 1);
    expect(s.scale).toBeCloseTo(0.25);
    expect(s.alpha).toBeCloseTo(0.375);
    expect(s.glow).toBeCloseTo(1.6);
    expect(animationState(el({ mode: 'scaleIn' }), 1, 0, 1).scale).toBeCloseTo(0.001);
    const r = animationState(el({ mode: 'spinIn' }), 2, 0, 1);
    expect(r.scale).toBeCloseTo(0.725);
    expect(r.rotation).toBeCloseTo(-0.65 * Math.PI);
    expect(r.alpha).toBeCloseTo(0.7);
  });

  it('脈動：不經過曲線、保持顯示時結束後繼續', () => {
    const at = (t: number, hold = true) =>
      animationState(el({ mode: 'pulse', easing: 'easeIn', holdAfter: hold }), t, 0, 1);
    expect(at(1).alpha).toBeCloseTo(0.72);
    expect(at(2).alpha).toBeCloseTo(1);
    expect(at(2).scale).toBeCloseTo(1.02);
    expect(at(2).glow).toBeCloseTo(1.9);
    expect(at(3.5).visible).toBe(true);
    expect(at(3.5).alpha).toBeCloseTo(at(1.5).alpha);
    expect(at(3.5, false).visible).toBe(false);
  });

  it('複本延遲：第 k 個出場的複本晚 k × 延遲', () => {
    const e = el({ mode: 'draw', copyStagger: 0.5, copyOrder: 'counter' });
    expect(animationState(e, 1.5, 0, 4).draw).toBeCloseTo(0.25);
    /* 逆時針：複本 3 的名次是 1 */
    expect(animationState(e, 1.5, 3, 4).draw).toBeCloseTo(0);
    expect(animationState(e, 2, 3, 4).draw).toBeCloseTo(0.25);
    expect(animationState(e, 1.4, 1, 4).visible).toBe(false);
  });
});

describe('自動排列、反轉', () => {
  const project = () => {
    const p = classicTemplate().project;
    p.animation.duration = 4;
    return p;
  };

  it('依圖層：間隔＝長度 ÷ (n＋0.5)，效果長度夾在 0.25～max(0.3, 0.55 × 長度)', () => {
    const p = project();
    const r = autoSequence(p, 'layers', () => ({ x: 0, y: 0 }));
    const step = 4 / 7.5;
    expect(r).toHaveLength(7);
    expect(r[0]).toMatchObject({ id: p.elements[0].id, start: 0 });
    expect(r[3].start).toBeCloseTo(Math.round(3 * step * 1000) / 1000);
    expect(r[3].duration).toBeCloseTo(Math.round(step * 1.65 * 1000) / 1000);
    expect(r[6].duration).toBeCloseTo(Math.min(step * 1.65, 4 - r[6].start + 0.05), 3);
  });

  it('中心→外圍、隱藏的不排、「一直顯示」改成發光繪製或淡入', () => {
    const p = project();
    p.elements = [
      createCircle(500, 500, 300, 300, { animation: { mode: 'none' } }),
      createPath([pathPoint(500, 100), pathPoint(510, 100)], { animation: { mode: 'none' } }),
      createText(500, 520, 'ᚱ', { animation: { mode: 'none' } }),
      { ...createCircle(0, 0, 1), visible: false },
    ];
    const centers = new Map(
      p.elements.map((e) => [e.id, e.type === 'path' ? { x: 505, y: 100 } : { x: e.x, y: e.y }]),
    );
    const r = autoSequence(p, 'center', (e) => centers.get(e.id)!);
    expect(r.map((c) => c.id)).toEqual([p.elements[0].id, p.elements[2].id, p.elements[1].id]);
    expect(r.map((c) => c.mode)).toEqual(['drawGlow', 'fadeIn', 'drawGlow']);
  });

  it('反轉：開始＝長度 −（開始＋持續），夾在 0～長度；略過一直顯示', () => {
    const p = project();
    p.elements = [
      createCircle(0, 0, 1, 1, { animation: { start: 0.5, duration: 1 } }),
      createCircle(0, 0, 1, 1, { animation: { start: 3.5, duration: 2 } }),
      createCircle(0, 0, 1, 1, { animation: { mode: 'none' } }),
    ];
    expect(reverseSequence(p)).toEqual([
      { id: p.elements[0].id, start: 2.5, duration: 1 },
      { id: p.elements[1].id, start: 0, duration: 2 },
    ]);
  });
});

describe('預設集', () => {
  it('動態預設的持續不超過「長度 − 開始」', () => {
    const a = withMotionPreset(defaultAnimation({ start: 3.5 }), 'trace', 4);
    expect(a).toMatchObject({ mode: 'drawGlow', duration: 0.5, copyStagger: 0.045, start: 3.5 });
    expect(withMotionPreset(defaultAnimation({ start: 4 }), 'burst', 4).duration).toBe(0.05);
    expect(withMotionPreset(defaultAnimation(), 'vanish', 4)).toMatchObject({
      mode: 'fadeOut',
      duration: 0.85,
      easing: 'easeIn',
      copyOrder: 'counter',
      holdAfter: false,
    });
  });

  it('樣式預設的數值', () => {
    expect(STYLE_PRESETS['holy-gold']).toMatchObject({
      stroke: '#ffe59a',
      glowBlur: 32,
      glowStrength: 1.55,
    });
    expect(STYLE_PRESETS.ink).toMatchObject({
      glowEnabled: false,
      blendMode: 'source-over',
      strokeWidth: 7,
    });
  });
});
