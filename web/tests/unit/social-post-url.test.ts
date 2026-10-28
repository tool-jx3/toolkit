/**
 * 社群貼文產生器的圖片網址（規格 F99）：Google 雲端硬碟、Dropbox 分享連結的轉換、網址的檢查、下載失敗的分類。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  fetchImageUrl,
  normalizeImageUrl,
  parseImageUrls,
  UrlImageError,
} from '../../src/tools/social-post/url';

describe('分享連結的轉換', () => {
  it('Google 雲端硬碟：file/d、open?id、uc?id、uc?export=view&id → lh3.googleusercontent.com/d/<id>=w2000（原作 2ade338）', () => {
    const id = '1AbCdEfGhIjK_lmn-OPq';
    for (const u of [
      `https://drive.google.com/file/d/${id}/view?usp=sharing`,
      `https://drive.google.com/open?id=${id}`,
      `https://drive.google.com/uc?id=${id}`,
      `https://drive.google.com/uc?export=view&id=${id}`,
    ])
      expect(normalizeImageUrl(u)).toBe(`https://lh3.googleusercontent.com/d/${id}=w2000`);
  });

  it('Dropbox：拿掉 dl、加 raw=1', () => {
    expect(normalizeImageUrl('https://www.dropbox.com/s/abc/photo.jpg?dl=0')).toBe(
      'https://www.dropbox.com/s/abc/photo.jpg?raw=1',
    );
    expect(normalizeImageUrl('https://www.dropbox.com/scl/fi/x/p.png?rlkey=k&dl=0')).toBe(
      'https://www.dropbox.com/scl/fi/x/p.png?rlkey=k&raw=1',
    );
  });

  it('其他網址去頭尾空白後原樣', () => {
    expect(normalizeImageUrl('  https://example.com/a.png ')).toBe('https://example.com/a.png');
  });
});

describe('網址的檢查', () => {
  it('一個：只取第一個', () => {
    expect(parseImageUrls('https://a.example/1.png https://a.example/2.png', false)).toEqual({
      urls: ['https://a.example/1.png'],
      bad: [],
    });
  });

  it('多個：一行一個（空白也算分隔）；不是 http(s) 的列在 bad', () => {
    expect(
      parseImageUrls('https://a.example/1.png\n\nftp://x/2.png\nhttp://b.example/3.jpg', true),
    ).toEqual({
      urls: ['https://a.example/1.png', 'http://b.example/3.jpg'],
      bad: ['ftp://x/2.png'],
    });
  });
});

describe('下載', () => {
  it('成功：回傳圖片的 Blob', async () => {
    const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
    const fetcher = vi.fn(
      async () => new Response(blob, { status: 200, headers: { 'content-type': 'image/png' } }),
    );
    const out = await fetchImageUrl('https://a.example/1.png', { fetcher });
    expect(out.type).toBe('image/png');
    expect(fetcher).toHaveBeenCalledWith(
      'https://a.example/1.png',
      expect.objectContaining({ mode: 'cors' }),
    );
  });

  it('跨網域讀不到（fetch 丟 TypeError）→ cors', async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(fetchImageUrl('https://a.example/1.png', { fetcher })).rejects.toMatchObject({
      kind: 'cors',
    });
  });

  it('HTTP 錯誤 → http；不是圖片 → type', async () => {
    const f404 = vi.fn(async () => new Response('x', { status: 404 }));
    await expect(fetchImageUrl('https://a.example/1.png', { fetcher: f404 })).rejects.toMatchObject(
      { kind: 'http' },
    );
    const fHtml = vi.fn(
      async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    );
    await expect(
      fetchImageUrl('https://a.example/1.png', { fetcher: fHtml }),
    ).rejects.toBeInstanceOf(UrlImageError);
    await expect(
      fetchImageUrl('https://a.example/1.png', { fetcher: fHtml }),
    ).rejects.toMatchObject({ kind: 'type' });
  });

  it('逾時 → timeout', async () => {
    const fetcher = vi.fn(
      (_u: string, init?: RequestInit) =>
        new Promise<Response>((_res, rej) => {
          init?.signal?.addEventListener('abort', () =>
            rej(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    await expect(
      fetchImageUrl('https://a.example/1.png', { fetcher, timeoutMs: 20 }),
    ).rejects.toMatchObject({
      kind: 'timeout',
    });
  });
});
