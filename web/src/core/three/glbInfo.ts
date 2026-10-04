/**
 * GLB 檔的結構（glTF 2.0 二進位容器）：12 位元組檔頭（magic「glTF」、版本 2、總長），
 * 接著 JSON 區塊（長度、「JSON」、內容，以空白補齊到 4 的倍數）與選擇性的 BIN 區塊（長度、「BIN\0」、資料）。
 * 純函式，不依賴 three.js（Node 測試、對等驗證用）。
 */

/** 「glTF」（小端序） */
export const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

export interface GlbJson {
  asset?: { version?: string; generator?: string };
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: {
    name?: string;
    mesh?: number;
    children?: number[];
    translation?: number[];
    rotation?: number[];
    scale?: number[];
  }[];
  meshes?: { primitives: { attributes: Record<string, number>; material?: number }[] }[];
  materials?: {
    name?: string;
    alphaMode?: string;
    doubleSided?: boolean;
    extensions?: Record<string, unknown>;
    pbrMetallicRoughness?: {
      baseColorTexture?: { index: number };
      baseColorFactor?: number[];
      metallicFactor?: number;
      roughnessFactor?: number;
    };
  }[];
  textures?: { source?: number }[];
  images?: { mimeType?: string; bufferView?: number }[];
  buffers?: { byteLength: number }[];
  [key: string]: unknown;
}

export interface GlbInfo {
  version: number;
  /** 檔頭記載的總長（位元組） */
  length: number;
  /** JSON 區塊的內容 */
  json: GlbJson;
  /** BIN 區塊的長度（沒有時 0） */
  binLength: number;
}

/** 解析 GLB；格式不對時丟出 Error（訊息可直接顯示） */
export function parseGlb(bytes: Uint8Array): GlbInfo {
  if (bytes.byteLength < 20) throw new Error('GLB 檔案太短');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== GLB_MAGIC) throw new Error('不是 GLB 檔（檔頭不是 glTF）');
  const version = dv.getUint32(4, true);
  const length = dv.getUint32(8, true);
  if (length !== bytes.byteLength) throw new Error('GLB 檔頭記載的長度與檔案不符');
  const jsonLength = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== CHUNK_JSON) throw new Error('GLB 的第一個區塊不是 JSON');
  if (20 + jsonLength > length) throw new Error('GLB 的 JSON 區塊超出檔案');
  const text = new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength));
  const json = JSON.parse(text) as GlbJson;
  let binLength = 0;
  const o = 20 + jsonLength;
  if (o + 8 <= length) {
    binLength = dv.getUint32(o, true);
    if (dv.getUint32(o + 4, true) !== CHUNK_BIN) throw new Error('GLB 的第二個區塊不是 BIN');
    if (o + 8 + binLength > length) throw new Error('GLB 的 BIN 區塊超出檔案');
  }
  return { version, length, json, binLength };
}
