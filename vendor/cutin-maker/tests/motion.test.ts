import { describe, expect, it } from 'vitest';
import { motionAt } from '../src/core/render';
import { loopNoise } from '../src/core/random';
import type { MotionSpec } from '../src/core/types';

describe('motion / random のループ保証', () => {
  const motions: MotionSpec[] = [
    { type: 'pulse', amount: 0.1 },
    { type: 'bounce', amount: 0.1 },
    { type: 'shake', amount: 0.05 },
    { type: 'rotate', amount: 1 },
    { type: 'none', amount: 0 },
  ];
  for (const m of motions) {
    it(`${m.type} は t=0 と t=1 で一致する`, () => {
      const a = motionAt(m, 0, 480, 42);
      const b = motionAt(m, 1, 480, 42);
      expect(b.dx).toBeCloseTo(a.dx, 6);
      expect(b.dy).toBeCloseTo(a.dy, 6);
      expect(b.scale).toBeCloseTo(a.scale, 6);
      // 回転は 2π の整数倍ぶん違うだけ（見た目は一致）
      expect((b.rot - a.rot) % (Math.PI * 2)).toBeCloseTo(0, 6);
    });
  }

  it('loopNoise は周期1', () => {
    for (let i = 0; i < 5; i++) {
      expect(loopNoise(1, 1234 + i)).toBeCloseTo(loopNoise(0, 1234 + i), 10);
    }
  });
});
