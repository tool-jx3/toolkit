/**
 * 幾何花紋產生器：預覽的排程（規格 F54）。只畫最新的一組設定；正在畫的那一組超過 1 秒、又有待畫的設定時，
 * 結束 Worker 重開——不論新設定是在 1 秒前還是 1 秒後送來的（對等驗證 7.1：剛開始不到 1 秒就又改設定、之後不再改時，
 * 原本要等舊的畫完，實測等了 274 秒）。用假時鐘測。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLatestRunner } from '@/tools/geo-bloom/schedule';

interface Job {
  value: string;
  resolve: (r: string) => void;
  reject: (e: unknown) => void;
}

function setup(staleMs = 1000) {
  const jobs: Job[] = [];
  const results: string[] = [];
  const errors: unknown[] = [];
  const cancel = vi.fn();
  const runner = createLatestRunner<string, string>({
    run: (value) =>
      new Promise<string>((resolve, reject) => {
        jobs.push({ value, resolve, reject });
      }),
    cancel,
    onResult: (r, s) => results.push(`${s}=${r}`),
    onError: (e) => errors.push(e),
    staleMs,
    now: () => Date.now(),
  });
  return { runner, jobs, results, errors, cancel };
}

/** 讓 promise 的 then／finally 跑完 */
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('預覽的排程', () => {
  it('畫得快：依序畫完，中間送來的只畫最新的一組，不重開', async () => {
    const { runner, jobs, results, cancel } = setup();
    runner.request('a');
    expect(jobs.map((j) => j.value)).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(100);
    runner.request('b');
    runner.request('c');
    await vi.advanceTimersByTimeAsync(100);
    jobs[0].resolve('A');
    await flush();
    expect(results).toEqual(['a=A']);
    expect(jobs.map((j) => j.value)).toEqual(['a', 'c']);
    jobs[1].resolve('C');
    await flush();
    expect(results).toEqual(['a=A', 'c=C']);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('慢的那組剛開始（0.4 秒）就又改設定、之後不再改：滿 1 秒時重開，直接畫新的', async () => {
    const { runner, jobs, results, cancel } = setup();
    runner.request('slow');
    await vi.advanceTimersByTimeAsync(400);
    runner.request('next');
    await vi.advanceTimersByTimeAsync(500);
    expect(cancel).not.toHaveBeenCalled();
    expect(jobs.map((j) => j.value)).toEqual(['slow']);
    await vi.advanceTimersByTimeAsync(150);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(jobs.map((j) => j.value)).toEqual(['slow', 'next']);
    /* 舊的結果晚到也不理 */
    jobs[0].resolve('OLD');
    jobs[1].resolve('NEW');
    await flush();
    expect(results).toEqual(['next=NEW']);
  });

  it('新設定送來時舊的已經畫超過 1 秒：立刻重開', async () => {
    const { runner, jobs, cancel } = setup();
    runner.request('slow');
    await vi.advanceTimersByTimeAsync(1500);
    expect(cancel).not.toHaveBeenCalled();
    runner.request('next');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(jobs.map((j) => j.value)).toEqual(['slow', 'next']);
  });

  it('沒有待畫的設定時，慢的那組畫多久都不重開', async () => {
    const { runner, jobs, results, cancel } = setup();
    runner.request('slow');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(cancel).not.toHaveBeenCalled();
    jobs[0].resolve('S');
    await flush();
    expect(results).toEqual(['slow=S']);
  });

  it('畫完的那一刻計時器取消：接著畫的那組重新計時', async () => {
    const { runner, jobs, cancel } = setup();
    runner.request('a');
    await vi.advanceTimersByTimeAsync(300);
    runner.request('b');
    await vi.advanceTimersByTimeAsync(600);
    jobs[0].resolve('A');
    await flush();
    expect(jobs.map((j) => j.value)).toEqual(['a', 'b']);
    /* b 從現在起算：0.2 秒後（原本 a 的 1 秒到期）不會被重開 */
    await vi.advanceTimersByTimeAsync(200);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('錯誤交給 onError；結束後不再畫、不再重開', async () => {
    const { runner, jobs, errors, cancel } = setup();
    runner.request('a');
    jobs[0].reject(new Error('壞了'));
    await flush();
    expect(errors).toHaveLength(1);
    runner.request('b');
    runner.dispose();
    expect(cancel).toHaveBeenCalledTimes(1);
    runner.request('c');
    await vi.advanceTimersByTimeAsync(5000);
    expect(jobs.map((j) => j.value)).toEqual(['a', 'b']);
  });
});
