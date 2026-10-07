/** 錯誤轉成文字（不 import 其他模組，Worker 也可以用） */

/** 錯誤 → 「名稱: 訊息」（Error、DOMException、Worker 傳回來的錯誤物件、字串都可以） */
export function errorText(e: unknown): string {
  if (e == null) return String(e);
  if (typeof e === 'string') return e;
  if (typeof e === 'object') {
    const { name, message } = e as { name?: unknown; message?: unknown };
    const n = typeof name === 'string' ? name : '';
    const m = typeof message === 'string' ? message : '';
    if (n || m) return n && m ? `${n}: ${m}` : n || m;
  }
  try {
    return JSON.stringify(e) ?? String(e);
  } catch {
    return String(e);
  }
}
