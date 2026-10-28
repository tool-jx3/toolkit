/**
 * 圖片網址（F99、D7）：Google 雲端硬碟、Dropbox 的分享連結換成圖片網址；檢查網址；下載成 Blob（CORS）。
 * 新版把網址的圖片下載下來放進瀏覽器（和選檔一樣），canvas 才畫得進 PNG；讀不到時依原因說明。
 */

const DRIVE = /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{10,})/;

/**
 * 分享連結 → 圖片網址（其他網址去頭尾空白後原樣）。Google 雲端硬碟換成 `lh3.googleusercontent.com/d/<id>=w2000`
 * （原作 2ade338 從 `drive.google.com/thumbnail?id=…&sz=w2000` 改過來；F99 修訂）。
 */
export function normalizeImageUrl(raw: string): string {
  const u = raw.trim();
  const m = u.match(DRIVE);
  if (m) return `https://lh3.googleusercontent.com/d/${m[1]}=w2000`;
  if (/dropbox\.com\//.test(u)) {
    try {
      const x = new URL(u);
      x.searchParams.delete('dl');
      x.searchParams.set('raw', '1');
      return x.toString();
    } catch {
      return u;
    }
  }
  return u;
}

/** 對話框的文字 → 網址（multi＝一行一個；空白也算分隔）；不是 http(s) 開頭的列在 bad */
export function parseImageUrls(text: string, multi: boolean): { urls: string[]; bad: string[] } {
  let list = text.split(/\s+/).filter(Boolean).map(normalizeImageUrl);
  if (!multi) list = list.slice(0, 1);
  const ok = (u: string) => /^https?:\/\/\S+$/i.test(u);
  return { urls: list.filter(ok), bad: list.filter((u) => !ok(u)) };
}

export type UrlImageErrorKind = 'cors' | 'http' | 'type' | 'timeout';

export class UrlImageError extends Error {
  constructor(
    readonly kind: UrlImageErrorKind,
    readonly url: string,
    readonly status?: number,
  ) {
    super(`${kind}: ${url}`);
  }
}

export const URL_TIMEOUT_MS = 15_000;

/**
 * 下載圖片（CORS）：伺服器不允許跨網域讀取（fetch 丟 TypeError）→ 'cors'；HTTP 錯誤 → 'http'；
 * 回應的類型明確不是圖片 → 'type'；逾時 → 'timeout'。類型空白或 octet-stream 時交給之後的解碼判斷。
 */
export async function fetchImageUrl(
  url: string,
  {
    fetcher = (u: string, init?: RequestInit) => fetch(u, init),
    timeoutMs = URL_TIMEOUT_MS,
    signal,
  }: {
    fetcher?: (u: string, init?: RequestInit) => Promise<Response>;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<Blob> {
  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctl.abort();
  }, timeoutMs);
  const onAbort = () => ctl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    let res: Response;
    try {
      res = await fetcher(url, {
        mode: 'cors',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: ctl.signal,
      });
    } catch (e) {
      if (timedOut) throw new UrlImageError('timeout', url);
      if (signal?.aborted) throw e;
      throw new UrlImageError('cors', url);
    }
    if (!res.ok) throw new UrlImageError('http', url, res.status);
    const type = (res.headers.get('content-type') ?? '').toLowerCase();
    if (type && !type.startsWith('image/') && !type.includes('octet-stream'))
      throw new UrlImageError('type', url);
    try {
      return await res.blob();
    } catch {
      throw new UrlImageError(timedOut ? 'timeout' : 'cors', url);
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
