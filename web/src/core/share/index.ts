/**
 * core/share：把設定放進網址「#」後面分享（不經過伺服器），以及讀回時的結構檢查與範圍夾值。
 *
 * 格式：`#s=<base64url>`，內容是 deflate 壓縮的 JSON `{ v: 版本, d: 設定 }`。
 * 網址是任何人都能編的輸入，所以讀回時一律用 schema 整理：數值夾在範圍內、未知的選項換成預設、
 * 字串與陣列限制長度、多餘的欄位丟掉。內容損壞、版本不符或太長時回傳 null（照一般開頁）。
 *
 * ```ts
 * const schema = sh.object({ text: sh.string({ maxLength: 800, default: '' }), fps: sh.number({ min: 5, max: 30, int: true, default: 20 }) });
 * location.hash = encodeShareHash(settings, { version: 1 });
 * const back = decodeShareHash(location.hash, schema, { version: 1 }); // 型別＝schema 的型別，或 null
 * ```
 */
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';

/* ---------- base64url ---------- */

export function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ---------- schema（整理不可信的輸入） ---------- */

export interface Schema<T> {
  /** 把任何值整理成 T（不會丟錯） */
  parse(value: unknown): T;
  readonly fallback: T;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const clampNum = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** schema 建構函式 */
export const sh = {
  /** 數字：非數字時用 default；超出範圍時夾回；int 時四捨五入 */
  number(o: { min: number; max: number; default: number; int?: boolean }): Schema<number> {
    return {
      fallback: o.default,
      parse(v) {
        const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
        if (!Number.isFinite(n)) return o.default;
        const x = clampNum(n, o.min, o.max);
        return o.int ? Math.round(x) : x;
      },
    };
  },
  /** 字串：非字串時用 default；超過 maxLength 字（碼位）截斷；maxLines 限制行數 */
  string(o: { default: string; maxLength?: number; maxLines?: number }): Schema<string> {
    return {
      fallback: o.default,
      parse(v) {
        if (typeof v !== 'string') return o.default;
        let s = v;
        if (o.maxLines !== undefined) s = s.split('\n').slice(0, o.maxLines).join('\n');
        if (o.maxLength !== undefined) {
          const chars = Array.from(s);
          if (chars.length > o.maxLength) s = chars.slice(0, o.maxLength).join('');
        }
        return s;
      },
    };
  },
  /** 列舉：不在清單裡時用 default（不給時用第一個） */
  oneOf<const V extends string | number>(values: readonly V[], fallback?: V): Schema<V> {
    const def = fallback ?? values[0];
    return {
      fallback: def,
      parse: (v) => (values.includes(v as V) ? (v as V) : def),
    };
  },
  boolean(fallback: boolean): Schema<boolean> {
    return { fallback, parse: (v) => (typeof v === 'boolean' ? v : fallback) };
  },
  /** 顏色：#rgb、#rrggbb、#rrggbbaa（轉小寫），不合格時用 default */
  color(fallback: string): Schema<string> {
    return {
      fallback,
      parse(v) {
        if (typeof v !== 'string') return fallback;
        const s = v.trim().toLowerCase();
        return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(s) ? s : fallback;
      },
    };
  },
  /** 陣列：非陣列時用 default；超過 maxItems 截斷；每一項用 item 整理 */
  array<T>(item: Schema<T>, o: { default: T[]; maxItems: number }): Schema<T[]> {
    return {
      fallback: o.default,
      parse(v) {
        if (!Array.isArray(v)) return o.default.slice();
        return v.slice(0, o.maxItems).map((x) => item.parse(x));
      },
    };
  },
  /** 物件：只留 shape 列出的欄位，缺的補預設 */
  object<S extends Record<string, Schema<unknown>>>(
    shape: S,
  ): Schema<{ [K in keyof S]: S[K] extends Schema<infer T> ? T : never }> {
    type Out = { [K in keyof S]: S[K] extends Schema<infer T> ? T : never };
    const fallback = Object.fromEntries(
      Object.entries(shape).map(([k, s]) => [k, s.fallback]),
    ) as Out;
    return {
      fallback,
      parse(v) {
        const src = isObj(v) ? v : {};
        return Object.fromEntries(
          Object.entries(shape).map(([k, s]) => [k, s.parse(src[k])]),
        ) as Out;
      },
    };
  },
  /** 可為 null：null 原樣保留，其他值交給 inner */
  nullable<T>(inner: Schema<T>, fallback: T | null = null): Schema<T | null> {
    return {
      fallback,
      parse: (v) => (v === null ? null : v === undefined ? fallback : inner.parse(v)),
    };
  },
};

/** 套用 schema（等同 schema.parse） */
export const sanitize = <T>(schema: Schema<T>, value: unknown): T => schema.parse(value);

/* ---------- 網址 ---------- */

export interface ShareOptions {
  /** 設定格式的版本（讀回時不符就忽略） */
  version: number;
  /** # 後面的鍵名（預設 s） */
  key?: string;
}

/** 設定 → `#s=…`（含 #） */
export function encodeShareHash(data: unknown, { version, key = 's' }: ShareOptions): string {
  const json = JSON.stringify({ v: version, d: data });
  return `#${key}=${toBase64Url(deflateSync(strToU8(json), { level: 9 }))}`;
}

/** 網址的 # 部分裡的分享內容（原始 JSON；沒有、損壞、版本不符、太長時 null） */
export function readShareHash(
  hash: string,
  { version, key = 's', maxLength = 8000 }: ShareOptions & { maxLength?: number },
): unknown | null {
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!h || h.length > maxLength) return null;
  const params = new URLSearchParams(h);
  const raw = params.get(key);
  if (!raw) return null;
  try {
    const json = JSON.parse(strFromU8(inflateSync(fromBase64Url(raw))));
    if (!isObj(json) || json.v !== version) return null;
    return json.d ?? null;
  } catch {
    return null;
  }
}

/** 讀回並整理（版本、長度、結構都不對時 null） */
export function decodeShareHash<T>(
  hash: string,
  schema: Schema<T>,
  options: ShareOptions & { maxLength?: number },
): T | null {
  const raw = readShareHash(hash, options);
  return raw === null ? null : schema.parse(raw);
}

/** 完整的分享網址（目前頁面的網址換掉 #） */
export function shareUrl(data: unknown, options: ShareOptions, base?: string): string {
  const href =
    base ?? (typeof location !== 'undefined' ? location.href : 'https://example.invalid/');
  const u = new URL(href);
  u.hash = encodeShareHash(data, options).slice(1);
  return u.toString();
}

/** 清掉網址的 #（不重新載入、不留歷史紀錄）；例如「從頭來過」 */
export function clearShareHash(): void {
  if (typeof history === 'undefined' || typeof location === 'undefined') return;
  history.replaceState(history.state, '', location.pathname + location.search);
}
