/**
 * 證件與票券產生器打字時不卡（規格 F02、5 節；對等驗證後改的）：
 * - 量字寬記起來（同一個字型與字只量一次；字型載好後清掉重量）；
 * - 字型只在用到新字時要求，輸入停下 400 ms 後一次載入（第一次馬上載）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/core/fonts', async (orig) => ({
  ...(await orig<typeof import('@/core/fonts')>()),
  ensureFont: vi.fn(async () => true),
}));

import { ensureFont } from '@/core/fonts';
import { FONT_IDLE_MS, requestFonts, resetRequestedFonts } from '@/tools/id-ticket/fonts';
import { type Ctx, clearTextWidths, measure } from '@/tools/id-ticket/kit';

describe('量字寬', () => {
  it('同樣的字型與字只量一次；字距逐字量也記得；換字型重量；clearTextWidths 之後重量', () => {
    let n = 0;
    const ctx = {
      font: '400 12px X',
      measureText: (t: string) => {
        n++;
        return { width: [...t].length * 6 };
      },
    } as unknown as Ctx;
    clearTextWidths();
    expect(measure(ctx, '林若晴')).toBe(18);
    expect(measure(ctx, '林若晴')).toBe(18);
    expect(n).toBe(1);
    /* 有字距：逐字量（3 個字各一次），之後不再量 */
    expect(measure(ctx, '林若晴', 1)).toBe(20);
    expect(n).toBe(4);
    expect(measure(ctx, '晴若林', 1)).toBe(20);
    expect(n).toBe(4);
    ctx.font = '700 12px X';
    measure(ctx, '林若晴');
    expect(n).toBe(5);
    clearTextWidths();
    ctx.font = '400 12px X';
    measure(ctx, '林若晴');
    expect(n).toBe(6);
  });
});

describe('字型', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetRequestedFonts();
    vi.mocked(ensureFont).mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('第一次馬上載；之後只要求新字，輸入停下 400 ms 後一次載入；沒有新字不載', async () => {
    expect(FONT_IDLE_MS).toBe(400);
    requestFonts([{ family: 'Noto Sans TC', weight: 400, text: '林若' }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.mocked(ensureFont).mock.calls).toEqual([['Noto Sans TC', 400, '林若']]);
    /* 打字：每打一個字都有新字，計時重來 */
    requestFonts([{ family: 'Noto Sans TC', weight: 400, text: '林若晴' }]);
    await vi.advanceTimersByTimeAsync(200);
    requestFonts([
      { family: 'Noto Sans TC', weight: 400, text: '林若晴同' },
      { family: 'Roboto Mono', weight: 500, text: 'AB' },
    ]);
    await vi.advanceTimersByTimeAsync(399);
    expect(vi.mocked(ensureFont)).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(vi.mocked(ensureFont).mock.calls.slice(1)).toEqual([
      ['Noto Sans TC', 400, '晴同'],
      ['Roboto Mono', 500, 'AB'],
    ]);
    /* 都是要求過的字：不載 */
    requestFonts([{ family: 'Noto Sans TC', weight: 400, text: '同晴若林' }]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(vi.mocked(ensureFont)).toHaveBeenCalledTimes(3);
  });
});
