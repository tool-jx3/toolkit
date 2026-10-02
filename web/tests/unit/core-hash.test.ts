/**
 * G5 共用層：完整的 SHA-256（core/files/hash.ts）、ZIP 的資料夾項目、core/assets 的 id 不變。
 */
import { strToU8 } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { assetIdFor } from '@/core/assets';
import { bytesToHex, sha256, sha256Hex, sha256Sync, unzipFiles, zipFiles } from '@/core/files';

/** 對照：WebCrypto（Node 內建）的結果 */
const webHex = async (b: Uint8Array) =>
  bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', b as Uint8Array<ArrayBuffer>)));

describe('SHA-256', () => {
  it('標準測試向量（FIPS 180-4）', async () => {
    expect(await sha256Hex(strToU8(''))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(await sha256Hex(strToU8('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    const long = strToU8('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq');
    expect(bytesToHex(sha256Sync(long))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
    expect(bytesToHex(sha256Sync(new Uint8Array(1_000_000).fill(0x61)))).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    );
  });

  it('純 JavaScript 版與 WebCrypto 的結果相同（各種長度，含補位的邊界 55／56／63／64）', async () => {
    let seed = 7;
    for (let len = 0; len <= 300; len++) {
      const b = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        seed = (seed * 1103515245 + 12345) >>> 0;
        b[i] = seed >>> 24;
      }
      expect(bytesToHex(sha256Sync(b))).toBe(await webHex(b));
    }
  });

  it('接受 Uint8Array、ArrayBuffer、Blob；子陣列只算自己的範圍', async () => {
    const all = strToU8('xxhelloxx');
    const part = all.subarray(2, 7);
    const want = await webHex(strToU8('hello'));
    expect(await sha256Hex(part)).toBe(want);
    expect(bytesToHex(sha256Sync(part))).toBe(want);
    expect(await sha256Hex(strToU8('hello').buffer as ArrayBuffer)).toBe(want);
    expect(await sha256Hex(new Blob(['hello']))).toBe(want);
  });

  it('沒有 crypto.subtle 時改用純 JavaScript，結果相同', async () => {
    const spy = vi.spyOn(globalThis.crypto.subtle, 'digest').mockRejectedValue(new Error('no'));
    const b = strToU8('非安全環境');
    expect(bytesToHex(await sha256(b))).toBe(bytesToHex(sha256Sync(b)));
    expect(spy).toHaveBeenCalled();
  });

  it('assetIdFor 的規則不變：a＋SHA-256 前 24 位', async () => {
    const b = strToU8('aaa');
    expect(await assetIdFor(b)).toBe(`a${(await webHex(b)).slice(0, 24)}`);
  });
});

describe('ZIP 的資料夾項目', () => {
  it('unzipFiles 預設略過資料夾，directories: true 時列出；zipFiles 可以寫資料夾項目', () => {
    const zip = zipFiles(
      [
        { name: 'a.txt', data: 'A' },
        { name: 'sub/', data: new Uint8Array(0) },
        { name: 'sub/b.txt', data: 'B' },
      ],
      { mtime: new Date(2020, 0, 1) },
    );
    expect(unzipFiles(zip).map((e) => e.name)).toEqual(['a.txt', 'sub/b.txt']);
    expect(unzipFiles(zip, { directories: true }).map((e) => e.name)).toEqual([
      'a.txt',
      'sub/',
      'sub/b.txt',
    ]);
  });

  it('檔名剛好是 Object 原型上的名稱也不會被當成重複', () => {
    const zip = zipFiles([{ name: 'constructor', data: 'x' }]);
    expect(unzipFiles(zip).map((e) => e.name)).toEqual(['constructor']);
  });
});
