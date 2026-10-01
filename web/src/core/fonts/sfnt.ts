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
