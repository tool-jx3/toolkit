/**
 * ui/pointerGesture：一指拖曳、兩指捏合的追蹤（color-palette 的配色卡照片加雙指縮放時新增，2026-10）。
 */
import { describe, expect, it } from 'vitest';
import { createPointerGesture } from '@/ui/pointerGesture';

describe('createPointerGesture', () => {
  it('一指：從起點算的位移；不是追蹤中的指標不理', () => {
    const g = createPointerGesture();
    expect(g.down(1, 100, 100)).toBe(true);
    expect(g.move(1, 130, 90)).toEqual({ kind: 'pan', dx: 30, dy: -10 });
    expect(g.move(9, 0, 0)).toBeNull();
    expect(g.up(1)).toBe(false);
    expect(g.active()).toBe(false);
  });

  it('第二指按下改成捏合：倍率＝兩指距離的比、中點的位移；第三指不理', () => {
    const g = createPointerGesture();
    g.down(1, 100, 100);
    expect(g.down(2, 200, 100)).toBe(true);
    expect(g.down(3, 0, 0)).toBe(false);
    expect(g.count()).toBe(2);
    /* 兩指往外拉到 200 px、整體往下 10 px */
    const s = g.move(2, 300, 110);
    expect(s).toMatchObject({ kind: 'pinch', originX: 150, originY: 100 });
    if (s?.kind !== 'pinch') throw new Error('應該是捏合');
    expect(s.scale).toBeCloseTo(Math.hypot(200, 10) / 100, 9);
    expect(s.dx).toBe(50);
    expect(s.dy).toBe(5);
  });

  it('放開一指：剩下的那一指從目前的位置接著拖（起點換了）', () => {
    const g = createPointerGesture();
    g.down(1, 100, 100);
    g.down(2, 200, 100);
    g.move(1, 90, 100);
    expect(g.up(2)).toBe(true);
    expect(g.move(1, 100, 120)).toEqual({ kind: 'pan', dx: 10, dy: 20 });
    expect(g.up(1)).toBe(false);
    expect(g.active()).toBe(false);
  });

  it('reset 清掉全部', () => {
    const g = createPointerGesture();
    g.down(1, 0, 0);
    g.reset();
    expect(g.active()).toBe(false);
    expect(g.move(1, 5, 5)).toBeNull();
  });
});
