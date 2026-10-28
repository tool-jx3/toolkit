/**
 * core/pdf 的執行環境：pdf.js 資源的快取（L7）、瀏覽器功能的檢查（一開頁就說不支援）、「使用的程式庫」清單（L10、L11）。
 */
import { describe, expect, it } from 'vitest';
import { ENGINE_LIBRARIES, NPM_LIBRARIES } from '@/core/pdf/libraries';
import { missingPdfFeatures } from '@/core/pdf/limits';
import { bundledDataFactory } from '@/core/pdf/pdfjs';
import { nodeModulePath } from '../helpers/pdfQpdf';

/** 單元測試的型別沒有 Node：模組名稱放在變數裡動態載入 */
const NODE_FS = 'node:fs';

describe('pdf.js 的資源（CMap、標準字型）', () => {
  it('同一個 Worker 裡只下載一次；每次給複本', async () => {
    const urls: string[] = [];
    const Factory = bundledDataFactory({ 'a.bcmap': '/a.bcmap' }, async (url) => {
      urls.push(url);
      return new Response(new Uint8Array([1, 2, 3]));
    });
    const f1 = new Factory();
    const f2 = new Factory();
    const a = await f1.fetch({ kind: 'cMap', filename: 'a.bcmap' });
    const b = await f2.fetch({ kind: 'cMap', filename: 'a.bcmap' });
    expect(urls).toEqual(['/a.bcmap']);
    expect(Array.from(a)).toEqual([1, 2, 3]);
    expect(a).not.toBe(b);
    a[0] = 9;
    expect((await f1.fetch({ kind: 'cMap', filename: 'a.bcmap' }))[0]).toBe(1);
  });

  it('下載失敗的不留著（下次再試）；表裡沒有的檔名丟錯', async () => {
    let n = 0;
    const Factory = bundledDataFactory({ 'f.ttf': '/f.ttf' }, async () => {
      n++;
      return n === 1 ? new Response(null, { status: 503 }) : new Response(new Uint8Array([7]));
    });
    const f = new Factory();
    await expect(f.fetch({ kind: 'font', filename: 'f.ttf' })).rejects.toThrow(/503/);
    expect(Array.from(await f.fetch({ kind: 'font', filename: 'f.ttf' }))).toEqual([7]);
    await expect(f.fetch({ kind: 'font', filename: 'x.ttf' })).rejects.toThrow(/missing/);
  });
});

describe('瀏覽器的功能', () => {
  it('Worker、WebAssembly、OffscreenCanvas、createImageBitmap 缺哪些', () => {
    const all = {
      Worker: class {},
      WebAssembly: {},
      OffscreenCanvas: class {},
      createImageBitmap: () => {},
    };
    expect(missingPdfFeatures(all)).toEqual([]);
    const { OffscreenCanvas: _o, Worker: _w, ...rest } = all;
    expect(missingPdfFeatures(rest)).toEqual(['Web Worker', 'OffscreenCanvas']);
  });
});

describe('使用的程式庫', () => {
  it('包含 pdf-lib、jSquash 與 WebAssembly 裡的執行環境；版本和 node_modules 一致', async () => {
    const text = ENGINE_LIBRARIES.join('\n');
    for (const name of ['qpdf', 'pdf-lib', 'jSquash', 'MozJPEG', 'Emscripten', 'libc++', 'musl']) {
      expect(text).toContain(name);
    }
    const fs = (await import(/* @vite-ignore */ NODE_FS)) as {
      readFileSync(p: string, enc: string): string;
    };
    for (const [pkg, { version, license }] of Object.entries(NPM_LIBRARIES)) {
      const json = JSON.parse(fs.readFileSync(nodeModulePath(`${pkg}/package.json`), 'utf8'));
      expect(json.version).toBe(version);
      expect(json.license).toBe(license);
    }
  });
});
