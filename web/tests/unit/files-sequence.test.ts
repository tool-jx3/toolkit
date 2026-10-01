/**
 * core/files：downloadSequentially（逐張下載、固定間隔、可取消）。
 */
import { describe, expect, it } from 'vitest';
import { downloadSequentially } from '@/core/files';

describe('downloadSequentially', () => {
  it('依順序下載，兩次下載之間至少間隔 intervalMs；內容可以在輪到時才產生', async () => {
    const log: { name: string; at: number; text: string }[] = [];
    const progress: string[] = [];
    const started = performance.now();
    const out = await downloadSequentially(
      [
        { name: 'a.png', blob: new Blob(['A']) },
        { name: 'b.png', blob: async () => new Blob(['B']) },
        { name: 'c.png', blob: () => new Promise((r) => setTimeout(() => r(new Blob(['C'])), 10)) },
      ],
      {
        intervalMs: 80,
        onProgress: (i, n, item) => progress.push(`${i + 1}/${n} ${item.name}`),
        download: (blob, name) => {
          log.push({ name, at: performance.now() - started, text: '' });
          void blob.text().then((t) => {
            log.find((x) => x.name === name)!.text = t;
          });
        },
      },
    );
    await Promise.resolve();
    expect(log.map((x) => x.name)).toEqual(['a.png', 'b.png', 'c.png']);
    expect(out.map((x) => x.name)).toEqual(['a.png', 'b.png', 'c.png']);
    expect(progress).toEqual(['1/3 a.png', '2/3 b.png', '3/3 c.png']);
    expect(log[0].at).toBeLessThan(40);
    expect(log[1].at - log[0].at).toBeGreaterThanOrEqual(75);
    expect(log[2].at - log[1].at).toBeGreaterThanOrEqual(75);
    /* 準備內容的時間包含在間隔裡，不會拉長 */
    expect(log[2].at - log[1].at).toBeLessThan(160);
    expect(await out[2].blob.text()).toBe('C');
  });

  it('取消後不再下載，並丟出錯誤', async () => {
    const ac = new AbortController();
    const names: string[] = [];
    const p = downloadSequentially(
      [
        { name: '1', blob: new Blob(['1']) },
        { name: '2', blob: new Blob(['2']) },
      ],
      { intervalMs: 200, signal: ac.signal, download: (_b, n) => names.push(n) },
    );
    setTimeout(() => ac.abort(), 30);
    await expect(p).rejects.toBeTruthy();
    expect(names).toEqual(['1']);
  });
});
