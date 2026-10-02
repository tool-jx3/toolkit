/**
 * psd-studio 的處理執行者（client.ts）：進度回呼的閘門（F89）。
 * Worker 的進度與結果走不同的訊息通道，最後幾則進度可能比結果晚到；工作結束後到的進度要丟掉，
 * 才不會蓋掉結束時的清理（清空壓縮狀態文字）。實際的 Worker 情境由 e2e 測（psd-studio.spec.ts 的 F89）。
 */
import { describe, expect, it } from 'vitest';
import { defaultGlobalAdjust } from '@/tools/psd-studio/adjust';
import { createStudioRunner, gateProgress } from '@/tools/psd-studio/client';
import { ballApng } from '../helpers/psdStudio';

describe('進度回呼的閘門（F89）', () => {
  it('關上之前照常轉給回呼，關上之後的一律丟掉', () => {
    const got: number[] = [];
    const g = gateProgress((n: number) => got.push(n));
    g.fn?.(1);
    g.fn?.(2);
    g.close();
    g.fn?.(3);
    expect(got).toEqual([1, 2]);
    expect(gateProgress(undefined).fn).toBeUndefined();
  });

  it('執行者（主執行緒版）：工作中照常回報進度', async () => {
    const runner = createStudioRunner('測試', { worker: false });
    const seen: string[] = [];
    const r = await runner.processImage(
      await ballApng(),
      { global: defaultGlobalAdjust(), asset: null },
      { compress: true, targetBytes: 4.8 * 1048576, skip: true, compressStatic: false, plays: 0 },
      (p) => seen.push(p.type === 'try' ? `try ${p.colors ?? '無損'}` : p.type),
    );
    expect(r.info.compressed).toBe(true);
    expect(seen.filter((s) => s !== 'frame')).toEqual(['try 無損']);
    runner.dispose();
  });
});
