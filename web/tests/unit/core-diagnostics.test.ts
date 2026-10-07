/**
 * core/diagnostics：錯誤轉文字、檔案欄位、整理成「複製錯誤資訊」的文字（環境資訊放最後）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { diagnosticText, environmentFields, errorText, fileFields } from '@/core/diagnostics';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('errorText', () => {
  it('Error、DOMException、Worker 傳回來的錯誤物件、字串', () => {
    expect(errorText(new TypeError('x is not a function'))).toBe('TypeError: x is not a function');
    expect(
      errorText(new DOMException('The source image could not be decoded.', 'InvalidStateError')),
    ).toBe('InvalidStateError: The source image could not be decoded.');
    expect(errorText({ name: 'RangeError', message: 'Array buffer allocation failed' })).toBe(
      'RangeError: Array buffer allocation failed',
    );
    expect(errorText({ message: '只有訊息' })).toBe('只有訊息');
    expect(errorText('decode')).toBe('decode');
    expect(errorText(undefined)).toBe('undefined');
    expect(errorText({ code: 3 })).toBe('{"code":3}');
  });
});

describe('fileFields', () => {
  it('大小（易讀＋位元組）與類型；沒有類型時「未提供」', () => {
    expect(fileFields(new File([new Uint8Array(2048)], 'a.jpg', { type: 'image/jpeg' }))).toEqual([
      ['大小', '2.0 KB（2,048 位元組）'],
      ['類型', 'image/jpeg'],
    ]);
    expect(fileFields(new Blob([new Uint8Array(3)]))[1]).toEqual(['類型', '未提供']);
  });
});

describe('environmentFields', () => {
  it('瀏覽器、手機型號與系統（userAgentData）、記憶體、CPU、螢幕', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 10; K) Chrome/141.0.0.0 Mobile',
      hardwareConcurrency: 8,
      deviceMemory: 4,
      userAgentData: {
        getHighEntropyValues: async () => ({
          platform: 'Android',
          platformVersion: '14.0.0',
          model: 'SM-A546E',
          fullVersionList: [
            { brand: 'Not)A;Brand', version: '8.0.0.0' },
            { brand: 'Chromium', version: '141.0.7390.70' },
            { brand: 'Google Chrome', version: '141.0.7390.70' },
          ],
        }),
      },
    });
    vi.stubGlobal('location', {
      origin: 'https://example.github.io',
      pathname: '/tools/bg-remover/',
    });
    vi.stubGlobal('screen', { width: 412, height: 915 });
    vi.stubGlobal('devicePixelRatio', 2.625);
    const f = Object.fromEntries(await environmentFields());
    expect(f.網址).toBe('https://example.github.io/tools/bg-remover/');
    expect(f.瀏覽器).toContain('Android 10; K');
    expect(f.裝置型號).toBe('SM-A546E');
    expect(f.系統).toBe('Android 14.0.0');
    expect(f.瀏覽器版本).toBe('Chromium 141.0.7390.70、Google Chrome 141.0.7390.70');
    expect(f.裝置記憶體).toBe('約 4 GB（瀏覽器回報的概數）');
    expect(f['CPU 核心']).toBe('8');
    expect(f.螢幕).toBe('412 × 915，縮放 2.625');
    expect(f.時間).toMatch(/^\d{4}-\d\d-\d\dT/);
  });

  it('瀏覽器不提供的項目寫「未提供」，問 userAgentData 失敗也照常產生', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)',
      hardwareConcurrency: 0,
      userAgentData: {
        getHighEntropyValues: async () => {
          throw new Error('denied');
        },
      },
    });
    const f = Object.fromEntries(await environmentFields());
    expect(f.裝置記憶體).toBe('未提供');
    expect(f['CPU 核心']).toBe('未提供');
    expect(f.裝置型號).toBeUndefined();
  });
});

describe('diagnosticText', () => {
  it('標題、訊息、整體欄位、每個對象一段，環境資訊在最後', async () => {
    vi.stubGlobal('navigator', { userAgent: 'UA', hardwareConcurrency: 4 });
    const t = await diagnosticText({
      tool: '立繪去背工具',
      summary: '無法讀取：a.jpg、b.png',
      fields: [['處理方式', 'Worker']],
      items: [
        {
          title: 'a.jpg',
          fields: [
            ['步驟', '解碼圖片（createImageBitmap）'],
            ['錯誤', 'InvalidStateError: x'],
          ],
        },
        { title: 'b.png', fields: [['步驟', '存進瀏覽器']] },
      ],
    });
    const lines = t.split('\n');
    expect(lines.slice(0, 3)).toEqual([
      '【立繪去背工具】錯誤資訊',
      '訊息：無法讀取：a.jpg、b.png',
      '處理方式：Worker',
    ]);
    expect(t).toContain(
      '— a.jpg —\n步驟：解碼圖片（createImageBitmap）\n錯誤：InvalidStateError: x',
    );
    expect(t).toContain('— b.png —\n步驟：存進瀏覽器');
    expect(t.indexOf('— 瀏覽器與裝置 —')).toBeGreaterThan(t.indexOf('— b.png —'));
    expect(t).toContain('瀏覽器：UA');
  });
});
