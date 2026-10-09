// @vitest-environment jsdom
/**
 * 開頁時整理存檔（第一次開頁寫入隨機種子）不能吃掉使用者的第一個變更：整理在 0.4 秒內接著的變更原本會併進已經清掉的那一步，
 * 開頁後馬上按「抽新的一張」就不能復原（對等驗證後的 E2E 偶發失敗發現）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

describe('scratch-card 開頁後的第一個變更', () => {
  it('第一次開頁（還沒有存檔）後馬上抽新的一張：可以復原', async () => {
    const store = await import('@/tools/scratch-card/store');
    const s0 = store.scratchNow().seed;
    store.newTicket();
    expect(store.scratchNow().seed).not.toBe(s0);
    expect(store.useScratch.temporal.getState().pastStates.length).toBe(1);
    store.historyStep('undo');
    expect(store.scratchNow().seed).toBe(s0);
  });
});
