/**
 * core/scene 的 loadSceneFonts：同一個字還在下載時，後來的呼叫（例如匯出）也要等它載好或失敗。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: { family: string; weight: number; text: string; done: (ok: boolean) => void }[] = [];

vi.mock('@/core/fonts', () => ({
  ensureFont: vi.fn(
    (family: string, weight: number, text: string) =>
      new Promise<boolean>((resolve) => calls.push({ family, weight, text, done: resolve })),
  ),
}));

const { loadSceneFonts } = await import('@/core/scene');

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  calls.length = 0;
});

describe('loadSceneFonts', () => {
  it('只請求還沒請求過的字；載完回傳 true，之後同樣的字不再請求', async () => {
    const first = loadSceneFonts([{ family: 'Test A', weight: 400, text: '甲乙' }]);
    await flush();
    expect(calls.map((c) => c.text)).toEqual(['甲乙']);
    calls[0].done(true);
    expect(await first).toBe(true);
    expect(await loadSceneFonts([{ family: 'Test A', weight: 400, text: '乙甲' }])).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it('同一個字還在下載：後來的呼叫不重複請求，但要等那次載入結束', async () => {
    const preview = loadSceneFonts([{ family: 'Test B', weight: 700, text: '丙丁' }]);
    await flush();
    expect(calls).toHaveLength(1);
    let exported = false;
    const exporting = loadSceneFonts([{ family: 'Test B', weight: 700, text: '丁戊' }]).then(
      (r) => {
        exported = true;
        return r;
      },
    );
    await flush();
    /* 只多請求「戊」 */
    expect(calls.map((c) => c.text)).toEqual(['丙丁', '戊']);
    calls[1].done(true);
    await flush();
    await flush();
    expect(exported).toBe(false);
    calls[0].done(true);
    expect(await exporting).toBe(true);
    expect(await preview).toBe(true);
  });

  it('全部的字都在別的呼叫裡下載中：也等到載完（失敗也算結束）', async () => {
    const preview = loadSceneFonts([{ family: 'Test C', weight: 400, text: '己' }]);
    await flush();
    let done = false;
    const exporting = loadSceneFonts([{ family: 'Test C', weight: 400, text: '己' }]).then((r) => {
      done = true;
      return r;
    });
    await flush();
    await flush();
    expect(calls).toHaveLength(1);
    expect(done).toBe(false);
    calls[0].done(false);
    expect(await exporting).toBe(true);
    expect(await preview).toBe(true);
    /* 結束之後不再等，也不再請求 */
    expect(await loadSceneFonts([{ family: 'Test C', weight: 400, text: '己' }])).toBe(false);
    expect(calls).toHaveLength(1);
  });
});
