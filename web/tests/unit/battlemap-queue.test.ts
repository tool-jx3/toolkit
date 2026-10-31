/**
 * 戰鬥地圖產生器：大地圖的繪製排程（renderQueue.ts；規格 F42，2026-10-30 驗證後修訂）。
 * Worker 一次只畫一張；畫的途中又換了設定時只保留最新的一筆，過期的結果丟掉。用假的 Worker 控制回來的時機。
 */
import { describe, expect, it } from 'vitest';
import type { MapPixels, MapRequest, RenderedMap } from '@/tools/battlemap/mapRenderer';
import { type DrawWorker, type Job, RenderQueue } from '@/tools/battlemap/renderQueue';
import { DEFAULT_SETTINGS } from '@/tools/battlemap/settings';

const req = (seed: number): MapRequest => ({
  seed,
  terrain: 'dungeon',
  settings: { ...DEFAULT_SETTINGS, cols: 58, rows: 58 },
  grid: true,
  light: true,
});
const job = (k: string, seed = 1): Job => ({ key: k, request: req(seed) });
const fakePixels = (key: string): MapPixels =>
  ({ key, layout: {}, width: 1, height: 1, pixels: new Uint8ClampedArray(4) }) as MapPixels;

/** 假的 Worker：每次 draw 記下來，由測試決定什麼時候回來 */
function fakeWorker() {
  const calls: { seed: number; resolve: (v: MapPixels) => void; reject: (e: unknown) => void }[] =
    [];
  let terminated = 0;
  const worker: DrawWorker = {
    draw: (r) =>
      new Promise<MapPixels>((resolve, reject) => {
        calls.push({ seed: r.seed, resolve, reject });
      }),
    terminate: () => {
      terminated++;
    },
  };
  return { worker, calls, terminatedCount: () => terminated };
}

function setup(spawnWorker: () => DrawWorker | null) {
  let wanted: string | null = null;
  const results: { key: string; ok: boolean; error: string | null }[] = [];
  const later: (() => void)[] = [];
  const drawnHere: number[] = [];
  const q = new RenderQueue({
    spawn: spawnWorker,
    drawHere: (r) => {
      drawnHere.push(r.seed);
      return { ...fakePixels(`here-${r.seed}`), request: r } as RenderedMap;
    },
    later: (fn) => later.push(fn),
    wanted: () => wanted,
    onResult: (key, map, error) => results.push({ key, ok: map !== null, error }),
  });
  /** 換設定：目前要的變成 k，並要求畫它（和 useRenderedMap 的 effect 相同） */
  const want = (k: string, seed = 1) => {
    wanted = k;
    q.request(job(k, seed));
  };
  return { q, want, results, later, drawnHere, setWanted: (k: string | null) => (wanted = k) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('只保留最新的一筆', () => {
  it('畫的途中連換 12 次：正在畫的那一張回來（過期，丟掉）後只送最新的一筆', async () => {
    const f = fakeWorker();
    const { q, want, results } = setup(() => f.worker);
    want('k0', 0);
    for (let i = 1; i <= 12; i++) want(`k${i}`, i);
    expect(f.calls.map((c) => c.seed)).toEqual([0]);
    f.calls[0].resolve(fakePixels('k0'));
    await flush();
    expect(results).toEqual([]);
    expect(q.stats).toEqual({ sent: 2, dropped: 1 });
    expect(f.calls.map((c) => c.seed)).toEqual([0, 12]);
    f.calls[1].resolve(fakePixels('k12'));
    await flush();
    expect(results).toEqual([{ key: 'k12', ok: true, error: null }]);
  });

  it('換回正在畫的那一張：回來就用，不再畫第二次', async () => {
    const f = fakeWorker();
    const { q, want, results } = setup(() => f.worker);
    want('a', 1);
    want('b', 2);
    want('a', 1);
    f.calls[0].resolve(fakePixels('a'));
    await flush();
    expect(results).toEqual([{ key: 'a', ok: true, error: null }]);
    expect(q.stats.sent).toBe(1);
    /* 已經畫好、正在顯示的再要求也不畫 */
    want('a', 1);
    expect(q.stats.sent).toBe(1);
  });

  it('換回正在顯示的那一張：等著送的那一筆也不送了', async () => {
    const f = fakeWorker();
    const { q, want, results } = setup(() => f.worker);
    want('a', 1);
    f.calls[0].resolve(fakePixels('a'));
    await flush();
    want('b', 2);
    want('c', 3);
    want('a', 1);
    f.calls[1].resolve(fakePixels('b'));
    await flush();
    expect(q.stats).toEqual({ sent: 2, dropped: 1 });
    expect(results.map((r) => r.key)).toEqual(['a']);
  });

  it('待送的那一筆不是目前要的（例如改回同步畫的小地圖）就不送', async () => {
    const f = fakeWorker();
    const { q, want, results, setWanted } = setup(() => f.worker);
    want('big1', 1);
    want('big2', 2);
    setWanted(null);
    f.calls[0].resolve(fakePixels('big1'));
    await flush();
    expect(results).toEqual([]);
    expect(q.stats).toEqual({ sent: 1, dropped: 1 });
  });

  it('畫不出來（例如記憶體不足）：回報錯誤；之後同一個 key 可以再要求', async () => {
    const f = fakeWorker();
    const { q, want, results } = setup(() => f.worker);
    want('x', 1);
    f.calls[0].reject(new RangeError('Array buffer allocation failed'));
    await flush();
    expect(results).toEqual([{ key: 'x', ok: false, error: 'Array buffer allocation failed' }]);
    want('x', 1);
    expect(q.stats.sent).toBe(2);
  });

  it('Worker 壞掉（WorkerFailedError）：改在主執行緒畫，之後也都在主執行緒', async () => {
    const f = fakeWorker();
    const { want, results, later, drawnHere } = setup(() => f.worker);
    want('w', 1);
    const err = new Error('背景處理無法執行');
    err.name = 'WorkerFailedError';
    f.calls[0].reject(err);
    await flush();
    expect(later).toHaveLength(1);
    later.shift()?.();
    expect(drawnHere).toEqual([1]);
    expect(results).toEqual([{ key: 'w', ok: true, error: null }]);
    want('v', 2);
    expect(f.calls).toHaveLength(1);
    later.shift()?.();
    expect(drawnHere).toEqual([1, 2]);
  });

  it('開不了 Worker：在主執行緒畫，等的途中又換了設定時只畫最新的', () => {
    const { want, results, later, drawnHere } = setup(() => null);
    want('p', 1);
    want('q', 2);
    want('r', 3);
    for (const fn of later.splice(0)) fn();
    expect(drawnHere).toEqual([3]);
    expect(results).toEqual([{ key: 'r', ok: true, error: null }]);
  });

  it('close（元件卸載）之後舊 Worker 回來的東西不理；再要求時開新的 Worker', async () => {
    const workers: ReturnType<typeof fakeWorker>[] = [];
    const { q, want, results } = setup(() => {
      const f = fakeWorker();
      workers.push(f);
      return f.worker;
    });
    want('m', 1);
    q.close();
    expect(workers[0].terminatedCount()).toBe(1);
    workers[0].calls[0].resolve(fakePixels('m'));
    await flush();
    expect(results).toEqual([]);
    want('m', 1);
    expect(workers).toHaveLength(2);
    workers[1].calls[0].resolve(fakePixels('m'));
    await flush();
    expect(results).toEqual([{ key: 'm', ok: true, error: null }]);
  });
});
