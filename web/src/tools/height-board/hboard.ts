/**
 * 原作（character-height-board）存的盤面檔 `.hboard` 的讀取（原作 2026-10 更新後的格式；與 2026-08 版相同）。
 * 本站只讀不寫：存檔一律用本站的專案檔（ZIP）。
 *
 * 格式（外部資料格式，照原作）：
 *   位元組 0～3   "THB1"（ASCII）
 *   位元組 4～7   中繼資料的長度 n（uint32，little-endian）
 *   位元組 8～    中繼資料（UTF-8 JSON，n 位元組）：
 *                 { version: 1, chars: [{ id, name, heightCm, x, z, bbox: { x, y, w, h }, topRatio, bottomRatio,
 *                   hidden, srcW, srcH, blobType, blobSize }] }
 *   之後          每位角色的原始圖片依 chars 的順序接在一起（各 blobSize 位元組）
 *
 * 座標：x 是圖的左緣（cm）；z 越大越前面；topRatio／bottomRatio 是去除透明留白後的範圍的比例（0～1，可以超出）。
 */

export const HBOARD_MAGIC = 'THB1';
export const HBOARD_VERSION = 1;
export const HBOARD_EXT = '.hboard';

/** 讀不了的原因（訊息由呼叫端換成介面文字） */
export type HboardProblem = 'broken' | 'version';

export class HboardError extends Error {
  constructor(
    readonly problem: HboardProblem,
    /** problem 是 version 時，檔案裡的版本 */
    readonly version?: unknown,
  ) {
    super(
      problem === 'version' ? `unsupported .hboard version: ${String(version)}` : 'broken .hboard',
    );
    this.name = 'HboardError';
  }
}

/** 讀出的一位角色（本站的單位：身高 cm、兩條線 %；依前後順序由後往前排好） */
export interface HboardCharacter {
  name: string;
  height: number;
  x: number;
  /** 頭頂線、腳底線（%，未夾範圍） */
  top: number;
  bottom: number;
  visible: boolean;
  /** 圖片的 MIME 類型與內容 */
  type: string;
  bytes: Uint8Array;
}

/** 開頭是不是 "THB1" */
export function isHboard(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  for (let i = 0; i < 4; i++) if (bytes[i] !== HBOARD_MAGIC.charCodeAt(i)) return false;
  return true;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** 解析 .hboard；不是 .hboard、損壞、版本不支援時丟 HboardError */
export function parseHboard(bytes: Uint8Array): HboardCharacter[] {
  if (!isHboard(bytes)) throw new HboardError('broken');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const metaLen = view.getUint32(4, true);
  if (metaLen <= 0 || 8 + metaLen > bytes.length) throw new HboardError('broken');
  let meta: unknown;
  try {
    meta = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(8, 8 + metaLen)),
    );
  } catch {
    throw new HboardError('broken');
  }
  if (!meta || typeof meta !== 'object') throw new HboardError('broken');
  const { version, chars } = meta as { version?: unknown; chars?: unknown };
  if (!Array.isArray(chars)) throw new HboardError('broken');
  if (version !== HBOARD_VERSION) throw new HboardError('version', version);

  let offset = 8 + metaLen;
  const out: (HboardCharacter & { z: number; order: number })[] = [];
  chars.forEach((raw, order) => {
    if (!raw || typeof raw !== 'object') throw new HboardError('broken');
    const r = raw as Record<string, unknown>;
    const size = num(r.blobSize);
    const height = num(r.heightCm);
    const topRatio = num(r.topRatio);
    const bottomRatio = num(r.bottomRatio);
    if (size === null || size < 0 || !Number.isInteger(size) || offset + size > bytes.length)
      throw new HboardError('broken');
    if (height === null || topRatio === null || bottomRatio === null)
      throw new HboardError('broken');
    const data = bytes.slice(offset, offset + size);
    offset += size;
    out.push({
      name: typeof r.name === 'string' ? r.name : '',
      height,
      x: num(r.x) ?? 0,
      top: topRatio * 100,
      bottom: bottomRatio * 100,
      visible: r.hidden !== true,
      type: typeof r.blobType === 'string' && r.blobType ? r.blobType : 'image/png',
      bytes: data,
      z: num(r.z) ?? order,
      order,
    });
  });
  /* 本站的陣列是由後往前：依 z 由小到大（相同時依檔案裡的順序） */
  out.sort((a, b) => a.z - b.z || a.order - b.order);
  return out.map(({ z: _z, order: _o, ...c }) => c);
}
