/**
 * core/assets 的解碼快取：找不到、解碼失敗的結果不快取（之後 put／add／importAssetFiles 進來的圖讀得到），
 * 解碼成功的照舊只解碼一次。Node 沒有 createImageBitmap，換成假的（記下解碼了哪個 Blob）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAssetStore, importAssetFiles } from '@/core/assets';

interface FakeBitmap {
  width: number;
  height: number;
  source: string;
  close: () => void;
}

const decode = vi.fn(async (b: Blob): Promise<FakeBitmap> => {
  const source = await b.text();
  if (source === 'broken') throw new Error('decode failed');
  return { width: 1, height: 1, source, close: () => {} };
});

const blob = (s: string) => new Blob([s], { type: 'image/png' });
const src = (b: unknown) => (b as FakeBitmap | undefined)?.source;

beforeEach(() => {
  decode.mockClear();
  vi.stubGlobal('createImageBitmap', decode);
});
afterEach(() => vi.unstubAllGlobals());

describe('core/assets：bitmap 的快取', () => {
  it('找不到的 id 不快取：之後 put 進來就讀得到', async () => {
    const assets = createAssetStore('assets-miss-put');
    expect(await assets.bitmap('a1')).toBeUndefined();
    expect(await assets.bitmap('a1')).toBeUndefined();
    await assets.put('a1', blob('first'));
    expect(src(await assets.bitmap('a1'))).toBe('first');
    expect(src(assets.peekBitmap('a1'))).toBe('first');
  });

  it('缺圖的專案檔讀取失敗後，完整的專案檔（importAssetFiles）讀得進來', async () => {
    const assets = createAssetStore('assets-miss-import');
    /* 第一次：ZIP 裡沒有 a2 這張 → 找不到 */
    await importAssetFiles(assets, [['files/other.png', new TextEncoder().encode('other')]]);
    expect(await assets.bitmap('a2')).toBeUndefined();
    /* 第二次：完整的 ZIP */
    const r = await importAssetFiles(assets, [['files/a2.png', new TextEncoder().encode('full')]]);
    expect(r.ids).toEqual(['a2']);
    expect(src(await assets.bitmap('a2'))).toBe('full');
  });

  it('查詢進行中 put：下一次 bitmap 讀新放進來的圖', async () => {
    const assets = createAssetStore('assets-miss-race');
    const pending = assets.bitmap('a3');
    await assets.put('a3', blob('late'));
    await pending;
    expect(src(await assets.bitmap('a3'))).toBe('late');
  });

  it('add 進來的圖：先前查不到也不影響', async () => {
    const assets = createAssetStore('assets-miss-add');
    const { id } = await assets.add(blob('added'));
    await assets.remove(id);
    expect(await assets.bitmap(id)).toBeUndefined();
    await assets.add(blob('added'));
    expect(src(await assets.bitmap(id))).toBe('added');
  });

  it('解碼失敗不快取（丟錯）；換成好的圖之後讀得到', async () => {
    const assets = createAssetStore('assets-broken');
    await assets.put('a4', blob('broken'));
    await expect(assets.bitmap('a4')).rejects.toThrow();
    await assets.put('a4', blob('fixed'));
    expect(src(await assets.bitmap('a4'))).toBe('fixed');
  });

  it('解碼成功的結果照舊快取：同一個 id 只解碼一次；再 put 同一個 id 也不重新解碼', async () => {
    const assets = createAssetStore('assets-hit');
    await assets.put('a5', blob('once'));
    const [a, b] = await Promise.all([assets.bitmap('a5'), assets.bitmap('a5')]);
    expect(a).toBe(b);
    expect(await assets.bitmap('a5')).toBe(a);
    await assets.put('a5', blob('once'));
    expect(await assets.bitmap('a5')).toBe(a);
    expect(decode).toHaveBeenCalledTimes(1);
  });
});
