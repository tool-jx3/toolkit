/**
 * qpdf 的 JSON 物件表（`--json-key=qpdf --json-stream-data=none`：所有物件的字典，不含串流的內容）。
 * 大檔流程用它看缺字、數位簽章、有沒有可以重新壓縮的影像，不必把整份攤開讀進 pdf-lib（攤開＋讀檔要好幾倍檔案大小的記憶體）。
 * 規則和 pdf-lib 版（`fonts.ts` 的 nonEmbeddedCjkFonts、`recompress.ts` 的 hasSignature）相同。
 */
import { CJK_ORDERINGS } from './fonts';
import { FLATE_MIN_PIXELS } from './images';

/** qpdf `--json-key=qpdf --json-stream-data=none` 的參數 */
export const OBJECTS_JSON_ARGS = [
  '--json=latest',
  '--json-key=qpdf',
  '--json-stream-data=none',
] as const;

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
type JsonObj = { value?: JsonValue; stream?: { dict?: JsonValue } };

/** PDF 名稱（qpdf 寫成 "/Name"，特殊字元是 #xx） */
const pdfName = (v: unknown): string | null =>
  typeof v === 'string' && v.startsWith('/')
    ? v
        .slice(1)
        .replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(Number.parseInt(h, 16)))
    : null;

/** qpdf JSON 的字串："u:文字" 或 "b:十六進位" */
const pdfString = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  if (v.startsWith('u:')) return v.slice(2);
  if (v.startsWith('b:')) {
    const hex = v.slice(2);
    let s = '';
    for (let i = 0; i + 1 < hex.length; i += 2)
      s += String.fromCharCode(Number.parseInt(hex.slice(i, i + 2), 16));
    return s;
  }
  return null;
};

const isRef = (v: unknown): v is string => typeof v === 'string' && /^\d+ \d+ R$/.test(v);

/** 讀 qpdf 的 JSON（物件表）；讀不出來時 null */
export function parseObjectsJson(text: string): Map<string, JsonObj> | null {
  try {
    const start = text.indexOf('{');
    if (start < 0) return null;
    const j = JSON.parse(text.slice(start)) as { qpdf?: [unknown, Record<string, JsonObj>] };
    const table = j.qpdf?.[1];
    if (!table || typeof table !== 'object') return null;
    const map = new Map<string, JsonObj>();
    for (const [k, v] of Object.entries(table)) {
      if (k.startsWith('obj:')) map.set(k.slice(4), v);
    }
    return map;
  } catch {
    return null;
  }
}

function lookup(map: Map<string, JsonObj>, v: unknown): JsonValue | undefined {
  if (isRef(v)) {
    const o = map.get(v);
    return o?.value ?? o?.stream?.dict;
  }
  return v as JsonValue | undefined;
}

const asDict = (v: JsonValue | undefined): Record<string, JsonValue> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? v : null;

/** nonEmbeddedCjkFonts 的 qpdf JSON 版（同樣的規則） */
export function nonEmbeddedCjkFontsJson(map: Map<string, JsonObj>): string[] {
  const names = new Set<string>();
  for (const o of map.values()) {
    const font = asDict(o.value ?? null);
    if (!font || pdfName(font['/Type']) !== 'Font' || pdfName(font['/Subtype']) !== 'Type0')
      continue;
    const desc = lookup(map, font['/DescendantFonts']);
    const cid = Array.isArray(desc) && desc.length ? asDict(lookup(map, desc[0]) ?? null) : null;
    if (!cid) continue;
    const info = asDict(lookup(map, cid['/CIDSystemInfo']) ?? null);
    const ordering = info ? pdfString(lookup(map, info['/Ordering'])) : null;
    if (!ordering || !CJK_ORDERINGS.has(ordering)) continue;
    const fd = asDict(lookup(map, cid['/FontDescriptor']) ?? null);
    const embedded =
      !!fd &&
      ['/FontFile', '/FontFile2', '/FontFile3'].some((k) => {
        const v = fd[k];
        return isRef(v) && !!map.get(v)?.stream;
      });
    if (!embedded) names.add(pdfName(font['/BaseFont']) ?? ordering);
  }
  return [...names];
}

/** hasSignature 的 qpdf JSON 版 */
export function hasSignatureJson(map: Map<string, JsonObj>): boolean {
  for (const o of map.values()) {
    const d = asDict(o.value ?? null);
    if (!d) continue;
    if (pdfName(d['/FT']) === 'Sig' && d['/V'] !== undefined) return true;
    if (pdfName(d['/Type']) === 'Sig' && d['/ByteRange'] !== undefined) return true;
  }
  return false;
}

const filtersOfJson = (map: Map<string, JsonObj>, v: unknown): string[] => {
  const f = lookup(map, v);
  if (Array.isArray(f)) return f.map((x) => pdfName(lookup(map, x)) ?? '');
  const one = pdfName(f);
  return one ? [one] : [];
};

const numberOfJson = (map: Map<string, JsonObj>, v: unknown): number | null => {
  const n = lookup(map, v);
  return typeof n === 'number' ? n : null;
};

/**
 * 有沒有可能重新壓縮的影像（寬鬆：有就要攤開讀進 pdf-lib 細看）。JPEG（DCTDecode）都算；
 * convertFlate 時，沒有壓縮或 Flate 壓縮、8 位元、夠大（FLATE_MIN_PIXELS）的也算。
 */
export function mayHaveImagesJson(map: Map<string, JsonObj>, convertFlate: boolean): boolean {
  for (const o of map.values()) {
    const d = asDict(o.stream?.dict ?? null);
    if (!d || pdfName(lookup(map, d['/Subtype'])) !== 'Image') continue;
    const filters = filtersOfJson(map, d['/Filter']);
    if (filters.includes('DCTDecode')) return true;
    if (!convertFlate) continue;
    if (filters.length > 1 || (filters.length === 1 && filters[0] !== 'FlateDecode')) continue;
    if ((numberOfJson(map, d['/BitsPerComponent']) ?? 8) !== 8) continue;
    const w = numberOfJson(map, d['/Width']) ?? 0;
    const h = numberOfJson(map, d['/Height']) ?? 0;
    if (w * h >= FLATE_MIN_PIXELS) return true;
  }
  return false;
}
