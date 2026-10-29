/**
 * core/share 的解壓縮上限（pl-profile 驗證後新增）：inflateLimited 解出來和 inflateSync 相同；超過上限丟錯；
 * readShareHash 給 maxBytes 時超過上限回傳 null，不給時和以前相同。
 */
import { deflateSync, inflateSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { encodeShareHash, inflateLimited, readShareHash, toBase64Url } from '@/core/share';

describe('inflateLimited', () => {
  it('結果和 inflateSync 相同（短的、長的、空的）', () => {
    for (const text of [
      '',
      'a',
      '中文與 emoji 😀'.repeat(50),
      JSON.stringify({ x: 'y'.repeat(100_000) }),
    ]) {
      const z = deflateSync(strToU8(text), { level: 9 });
      expect(inflateLimited(z, 10_000_000)).toEqual(inflateSync(z));
    }
  });

  it('解開後超過上限就丟錯（壓縮率很高的資料不會整份解開）', () => {
    const bomb = deflateSync(new Uint8Array(5_000_000), { level: 9 });
    expect(bomb.length).toBeLessThan(8000);
    expect(() => inflateLimited(bomb, 256 * 1024)).toThrow();
    expect(inflateLimited(bomb, 5_000_000).length).toBe(5_000_000);
  });

  it('壞掉的資料丟錯', () => {
    expect(() => inflateLimited(new Uint8Array([1, 2, 3, 4, 5]), 1000)).toThrow();
  });
});

describe('readShareHash 的 maxBytes', () => {
  it('超過上限回傳 null；不給 maxBytes 時照舊讀得出來', () => {
    const big = { v: 1, d: { pad: 'x'.repeat(400_000) } };
    const hash = `#s=${toBase64Url(deflateSync(strToU8(JSON.stringify(big)), { level: 9 }))}`;
    expect(hash.length).toBeLessThan(8000);
    expect(readShareHash(hash, { version: 1, maxBytes: 256 * 1024 })).toBe(null);
    expect(readShareHash(hash, { version: 1 })).toEqual(big.d);
    const small = encodeShareHash({ a: 1 }, { version: 1 });
    expect(readShareHash(small, { version: 1, maxBytes: 256 * 1024 })).toEqual({ a: 1 });
  });
});
