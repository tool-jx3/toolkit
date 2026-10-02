/**
 * 從字型檔讀出字型名稱（TTF／OTF／TTC／WOFF 的 name 表）。WOFF2 需要 Brotli，不解析（回傳 null）。
 */
import { unzlibSync } from 'fflate';

export interface FontNames {
  /** 字型家族名稱（優先：繁中名稱 → 英文名稱） */
  family: string;
  /** 英文家族名稱 */
  familyEn?: string;
}

const LANG_PRIORITY = [0x0404, 0x0c04, 0x1404, 0x0409]; // zh-TW、zh-HK、zh-MO、en-US

function decodeUtf16be(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i + 1 < bytes.length; i += 2)
    s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
  return s;
}

function readNameTable(table: Uint8Array): FontNames | null {
  const dv = new DataView(table.buffer, table.byteOffset, table.byteLength);
  if (table.length < 6) return null;
  const count = dv.getUint16(2);
  const strOffset = dv.getUint16(4);
  const found = new Map<string, string>(); // `${nameId}:${lang}` → 名稱
  for (let i = 0; i < count; i++) {
    const r = 6 + i * 12;
    if (r + 12 > table.length) break;
    const platform = dv.getUint16(r);
    const lang = dv.getUint16(r + 4);
    const nameId = dv.getUint16(r + 6);
    const len = dv.getUint16(r + 8);
    const off = dv.getUint16(r + 10);
    if (nameId !== 1 && nameId !== 16) continue;
    const raw = table.subarray(strOffset + off, strOffset + off + len);
    if (platform === 3 || platform === 0)
      found.set(`${nameId}:${platform === 3 ? lang : 0x0409}`, decodeUtf16be(raw));
    else if (platform === 1 && lang === 0) found.set(`${nameId}:mac`, String.fromCharCode(...raw));
  }
  const pick = (langs: (number | string)[]) => {
    for (const id of [16, 1])
      for (const l of langs) {
        const v = found.get(`${id}:${l}`);
        if (v?.trim()) return v.trim();
      }
    return undefined;
  };
  const familyEn = pick([0x0409, 'mac']);
  const family = pick(LANG_PRIORITY) ?? familyEn;
  return family ? { family, familyEn } : null;
}

const tag = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

function readSfnt(bytes: Uint8Array, start: number): FontNames | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numTables = dv.getUint16(start + 4);
  for (let i = 0; i < numTables; i++) {
    const r = start + 12 + i * 16;
    if (tag(bytes, r) === 'name') {
      const off = dv.getUint32(r + 8);
      const len = dv.getUint32(r + 12);
      return readNameTable(bytes.subarray(off, off + len));
    }
  }
  return null;
}

function readWoff(bytes: Uint8Array): FontNames | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numTables = dv.getUint16(12);
  for (let i = 0; i < numTables; i++) {
    const r = 44 + i * 20;
    if (tag(bytes, r) === 'name') {
      const off = dv.getUint32(r + 4);
      const compLen = dv.getUint32(r + 8);
      const origLen = dv.getUint32(r + 12);
      const data = bytes.subarray(off, off + compLen);
      return readNameTable(compLen < origLen ? unzlibSync(data) : data);
    }
  }
  return null;
}

/** 讀出字型名稱；讀不出來時回傳 null */
export function readFontNames(bytes: Uint8Array): FontNames | null {
  try {
    if (bytes.length < 12) return null;
    const sig = tag(bytes, 0);
    if (sig === 'wOFF') return readWoff(bytes);
    if (sig === 'wOF2') return null;
    if (sig === 'ttcf') {
      const first = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(12);
      return readSfnt(bytes, first);
    }
    if (
      sig === 'OTTO' ||
      sig === 'true' ||
      (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0)
    ) {
      return readSfnt(bytes, 0);
    }
    return null;
  } catch {
    return null;
  }
}

/* ---------- TTC（字型集合）與嵌入權限（scenario-editor 移植時新增） ---------- */

/** TTC／OTC 裡每個字體的起始位置；不是集合時 null */
export function ttcFaceOffsets(bytes: Uint8Array): number[] | null {
  try {
    if (bytes.length < 12 || tag(bytes, 0) !== 'ttcf') return null;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const n = dv.getUint32(8);
    if (!n || n > 500) return null;
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(dv.getUint32(12 + i * 4));
    return out;
  } catch {
    return null;
  }
}

/** 把集合裡的一個字體（從 offset 開始）重組成單獨的字型檔 */
export function extractTtcFace(bytes: Uint8Array, offset: number): Uint8Array {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = dv.getUint16(offset + 4);
  const recs: { tag: number; sum: number; off: number; len: number }[] = [];
  for (let i = 0; i < n; i++) {
    const p = offset + 12 + i * 16;
    recs.push({
      tag: dv.getUint32(p),
      sum: dv.getUint32(p + 4),
      off: dv.getUint32(p + 8),
      len: dv.getUint32(p + 12),
    });
  }
  const pad = (v: number) => (v + 3) & ~3;
  let total = 12 + n * 16;
  for (const r of recs) total += pad(r.len);
  const out = new Uint8Array(total);
  const ov = new DataView(out.buffer);
  ov.setUint32(0, dv.getUint32(offset));
  ov.setUint16(4, n);
  let es = 0;
  while (1 << (es + 1) <= n) es++;
  ov.setUint16(6, (1 << es) * 16);
  ov.setUint16(8, es);
  ov.setUint16(10, n * 16 - (1 << es) * 16);
  let cur = 12 + n * 16;
  recs.forEach((r, i) => {
    const p = 12 + i * 16;
    ov.setUint32(p, r.tag);
    ov.setUint32(p + 4, r.sum);
    ov.setUint32(p + 8, cur);
    ov.setUint32(p + 12, r.len);
    out.set(bytes.subarray(r.off, r.off + r.len), cur);
    cur += pad(r.len);
  });
  return out;
}

/** 集合裡某個字體（offset）的名稱 */
export function readFontNamesAt(bytes: Uint8Array, offset: number): FontNames | null {
  try {
    return readSfnt(bytes, offset);
  } catch {
    return null;
  }
}

/** OS/2 表的 fsType（字型能不能嵌入發布物）；讀不到時 null。offset 是字體的起始位置（單一字型為 0） */
export function readFsType(bytes: Uint8Array, offset = 0): number | null {
  try {
    if (bytes.length < 12) return null;
    const sig = tag(bytes, offset);
    if (sig === 'wOFF' || sig === 'wOF2' || sig === 'ttcf') return null;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const numTables = dv.getUint16(offset + 4);
    for (let i = 0; i < numTables; i++) {
      const r = offset + 12 + i * 16;
      if (tag(bytes, r) === 'OS/2') return dv.getUint16(dv.getUint32(r + 8) + 8);
    }
    return null;
  } catch {
    return null;
  }
}

/** fsType 的限制：不可嵌入（0x0002）、只能預覽與列印（0x0004）、只能嵌入點陣（0x0200）；沒有限制時 null */
export function fsTypeRestriction(v: number | null): 'restricted' | 'preview' | 'bitmap' | null {
  if (v == null) return null;
  if (v & 0x0002) return 'restricted';
  if (v & 0x0004) return 'preview';
  if (v & 0x0200) return 'bitmap';
  return null;
}
