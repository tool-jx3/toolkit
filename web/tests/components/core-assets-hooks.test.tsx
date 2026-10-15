// @vitest-environment jsdom
/**
 * core/assets 的讀回 hook（char-chart、review-grid 的 useImageBitmaps，polaroid、lock-screen、ai-fail 的單張讀回合併成共用）：
 * - useAssetBitmaps：一張張讀好就一張張出現（pending 減少）、讀不到的列在 missing、已經解碼過的立刻拿到；
 * - useAssetImage：none／loading／ready／missing；id 剛換的那一次不回傳上一張圖。
 * jsdom 沒有 createImageBitmap 與 IndexedDB：解碼換成假的（內容「img:寬x高」，其他解不了），圖片只放在記憶體。
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAssetStore, useAssetBitmaps, useAssetImage } from '@/core/assets';

/** 解碼要等 release(內容) 才完成（看得到讀取中） */
const gates = new Map<string, () => void>();
const decode = vi.fn(async (b: Blob) => {
  const text = await b.text();
  await new Promise<void>((r) => gates.set(text, r));
  const m = /^img:(\d+)x(\d+)/.exec(text);
  if (!m) throw new Error('decode failed');
  return { width: Number(m[1]), height: Number(m[2]), close() {} };
});
const release = (text: string) =>
  act(async () => {
    await waitFor(() => expect(gates.has(text)).toBe(true));
    gates.get(text)?.();
  });

let seq = 0;
/** createImageBitmap 解不了時 loadImage 改走 <img>：jsdom 的 <img> 不會載入，換成馬上失敗的 */
class FailingImage {
  onerror: (() => void) | null = null;
  set src(_v: string) {
    queueMicrotask(() => this.onerror?.());
  }
}

beforeEach(() => {
  gates.clear();
  vi.stubGlobal('createImageBitmap', decode);
  vi.stubGlobal('Image', FailingImage);
});
afterEach(() => vi.unstubAllGlobals());

async function storeWith(...contents: string[]) {
  const assets = createAssetStore(`assets-hooks-${++seq}`);
  for (const [i, c] of contents.entries()) await assets.put(`a${i + 1}`, new Blob([c]));
  return assets;
}

describe('useAssetBitmaps', () => {
  it('一張張讀好就出現；讀不到的列在 missing；pending 是還在讀的張數', async () => {
    const assets = await storeWith('img:10x10', 'img:20x5', 'broken');
    const { result } = renderHook(() => useAssetBitmaps(assets, ['a2', 'a1', 'a3', 'a1', 'gone']));
    expect(result.current.pending).toBe(4);
    expect(result.current.bitmaps.size).toBe(0);
    await release('img:10x10');
    await waitFor(() => expect(result.current.bitmaps.get('a1')).toMatchObject({ width: 10 }));
    expect(result.current.pending).toBe(2);
    await waitFor(() => expect(result.current.missing).toEqual(['gone']));
    await release('broken');
    await waitFor(() => expect(result.current.missing).toEqual(['a3', 'gone']));
    await release('img:20x5');
    await waitFor(() => expect(result.current.pending).toBe(0));
    expect([...result.current.bitmaps.keys()]).toEqual(['a1', 'a2']);
  });

  it('已經解碼過的圖：第一次 render 就拿到', async () => {
    const assets = await storeWith('img:7x7');
    const p = assets.bitmap('a1');
    await release('img:7x7');
    await p;
    const { result } = renderHook(() => useAssetBitmaps(assets, ['a1']));
    expect(result.current.bitmaps.get('a1')).toMatchObject({ width: 7 });
    expect(result.current.pending).toBe(0);
  });
});

describe('useAssetImage', () => {
  it('沒有 id：none；讀取中：loading；讀好：ready；讀不到：missing', async () => {
    const assets = await storeWith('img:3x4', 'broken');
    const { result, rerender } = renderHook(({ id }) => useAssetImage(assets, id), {
      initialProps: { id: null as string | null },
    });
    expect(result.current).toEqual({ bitmap: null, status: 'none' });
    rerender({ id: 'a1' });
    expect(result.current).toEqual({ bitmap: null, status: 'loading' });
    await release('img:3x4');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.bitmap).toMatchObject({ width: 3, height: 4 });
    /* 換成讀不了的圖：換的那一次就不回傳上一張 */
    rerender({ id: 'a2' });
    expect(result.current).toEqual({ bitmap: null, status: 'loading' });
    await release('broken');
    await waitFor(() => expect(result.current.status).toBe('missing'));
    rerender({ id: 'nothing' });
    await waitFor(() => expect(result.current.status).toBe('missing'));
    /* 換回解碼過的圖：立刻 ready */
    rerender({ id: 'a1' });
    expect(result.current.status).toBe('ready');
  });
});
