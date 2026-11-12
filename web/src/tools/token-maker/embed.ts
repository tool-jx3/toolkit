/**
 * 把棋子的設定嵌進匯出的 PNG、之後再開來改（token-workshop 的「Keep editable」）：
 * - 本站：PNG 的 iTXt（共用的 setPngText，關鍵字 `trpg-toolkit`、壓縮），內容是 JSON：
 *   `{ format: 'trpg-toolkit-token', version: 1, look, token: { name, badge, view, popOn, adjust, halo? }, image: { name, type, data }, mask: { width, height, data } | null }`；
 *   圖片與遮罩（PNG）以 base64 放在裡面。沒用到新功能時（漸層的色彩平衡 50%、沒有去光暈）內容和 2026-11-05 之前逐位元組相同。
 * - token-workshop 匯出的 PNG（私有 chunk `tkWs`）與 WebP（RIFF chunk `TKWS`）：4 位元組的 JSON 長度＋JSON＋圖檔，
 *   遮罩是舊的 `rle`（交錯的 0／1 長度）或新的 `rle8`（32 階的軟遮罩，ce4c62b）；照原作檢查 CRC 與大小上限，
 *   對應到本站的設定（規格 F08、F78、3.8）。
 */
import { crc32, readPngText, setPngText } from '@/core/encode';
import {
  type Adjust,
  clamp,
  type Look,
  METALS,
  normalizeAdjust,
  normalizeLook,
  normalizeView,
  type TokenView,
} from './model';

export const EMBED_KEYWORD = 'trpg-toolkit';
export const EMBED_FORMAT = 'trpg-toolkit-token';
export const EMBED_VERSION = 1;

export interface EmbeddedToken {
  look: Look;
  token: {
    name: string;
    badge: string;
    view: TokenView;
    popOn: boolean;
    adjust: Adjust;
    /** 去光暈（%；0 或沒有＝關） */
    halo?: number;
  };
  image: { name: string; type: string; bytes: Uint8Array };
  /** 遮罩：本站是遮罩的 PNG；TW 是遮罩的像素（舊的 0／255，新的 32 階） */
  mask:
    | { kind: 'png'; width: number; height: number; bytes: Uint8Array }
    | { kind: 'pixels'; width: number; height: number; data: Uint8Array }
    | null;
  source: 'toolkit' | 'token-workshop';
}

/* ---------- base64 ---------- */

export function toBase64(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000)
    s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(s: string): Uint8Array {
  const b = atob(s);
  const u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return u;
}

/* ---------- 本站 ---------- */

export interface EmbedInput {
  look: Look;
  token: EmbeddedToken['token'];
  image: { name: string; type: string; bytes: Uint8Array };
  mask: { width: number; height: number; bytes: Uint8Array } | null;
}

/**
 * 外觀裡 2026-11-05 之後加的欄位：以前的值（色彩平衡 50%、畫布貼合與外緣淡出關）時不寫，嵌入的內容和之前相同；
 * 讀的時候沒有這些欄位就是以前的值。
 */
function lookForEmbed(look: Look): Partial<Look> {
  const out: Partial<Look> = { ...look };
  if (look.gMid === 50) delete out.gMid;
  if (!look.tightFit) delete out.tightFit;
  if (!look.edgeFade) delete out.edgeFade;
  return out;
}

export function embedJson(e: EmbedInput): string {
  const { halo, ...token } = e.token;
  return JSON.stringify({
    format: EMBED_FORMAT,
    version: EMBED_VERSION,
    look: lookForEmbed(e.look),
    token: halo ? { ...token, halo } : token,
    image: { name: e.image.name, type: e.image.type, data: toBase64(e.image.bytes) },
    mask: e.mask
      ? { width: e.mask.width, height: e.mask.height, data: toBase64(e.mask.bytes) }
      : null,
  });
}

/** 把設定嵌進 PNG（位元組） */
export function embedInPng(png: Uint8Array, e: EmbedInput): Uint8Array {
  return setPngText(png, EMBED_KEYWORD, embedJson(e), { compress: true });
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const haloOf = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(v), 0, 100) : 0;

function parseToolkit(text: string): EmbeddedToken | null {
  let d: unknown;
  try {
    d = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(d) || d.format !== EMBED_FORMAT || !isObj(d.image) || typeof d.image.data !== 'string')
    return null;
  const t = isObj(d.token) ? d.token : {};
  try {
    const m = isObj(d.mask) && typeof d.mask.data === 'string' ? d.mask : null;
    const halo = haloOf(t.halo);
    return {
      look: normalizeLook(d.look),
      token: {
        name: typeof t.name === 'string' ? t.name.slice(0, 40) : '',
        badge: typeof t.badge === 'string' ? t.badge.slice(0, 4) : '',
        view: normalizeView(t.view),
        popOn: t.popOn !== false,
        adjust: normalizeAdjust(t.adjust),
        ...(halo ? { halo } : {}),
      },
      image: {
        name: typeof d.image.name === 'string' ? d.image.name : 'token.png',
        type: typeof d.image.type === 'string' ? d.image.type : 'image/png',
        bytes: fromBase64(d.image.data),
      },
      mask: m
        ? {
            kind: 'png',
            width: Math.max(1, Math.round(Number(m.width) || 1)),
            height: Math.max(1, Math.round(Number(m.height) || 1)),
            bytes: fromBase64(m.data as string),
          }
        : null,
      source: 'toolkit',
    };
  } catch {
    return null;
  }
}

/* ---------- token-workshop ---------- */

/** 原作讀檔的上限（LIMITS）：檔案、JSON、遮罩的像素數 */
export const TW_LIMITS = { file: 120e6, json: 8e6, maskPixels: 16.8e6 } as const;

/** 可變長度整數（7 位元一組、低位在前；最多 5 組）；回傳值與下一個位置 */
function varint(u8: Uint8Array, at: number): { n: number; i: number } {
  let n = 0;
  let sh = 0;
  let i = at;
  let b: number;
  do {
    b = u8[i++];
    n += (b & 127) * 2 ** sh;
    sh += 7;
  } while (b & 128 && i < u8.length && sh < 35);
  return { n, i };
}

function putVarint(out: number[], n0: number): void {
  let n = n0;
  while (n > 127) {
    out.push((n & 127) | 128);
    n >>>= 7;
  }
  out.push(n);
}

/** TW 的舊遮罩（`rle`）：交錯的 0／1 連續長度，從 0 開始 */
export function twRleDecode(u8: Uint8Array, len: number): Uint8Array {
  const m = new Uint8Array(len);
  let p = 0;
  let i = 0;
  let cur = 0;
  while (i < u8.length && p < len) {
    const r = varint(u8, i);
    i = r.i;
    if (cur) m.fill(255, p, Math.min(len, p + r.n));
    p += r.n;
    cur ^= 1;
  }
  return m;
}

/** TW 的舊編碼（測試與相容檢查用） */
export function twRleEncode(m: Uint8Array): Uint8Array {
  const out: number[] = [];
  let cur = 0;
  let run = 0;
  for (let i = 0; i < m.length; i++) {
    const b = m[i] ? 1 : 0;
    if (b === cur) run++;
    else {
      putVarint(out, run);
      cur = b;
      run = 1;
    }
  }
  putVarint(out, run);
  return Uint8Array.from(out);
}

/**
 * TW 的新遮罩（`rle8`，ce4c62b）：一段一段的「值（5 位元，0～31）＋長度（可變長度整數）」；
 * 值 v 還原成 (v << 3) | (v >> 2)（31 → 255、0 → 0），所以半透明的髮絲留得住。
 */
export function twRle8Decode(u8: Uint8Array, len: number): Uint8Array {
  const m = new Uint8Array(len);
  let p = 0;
  let i = 0;
  while (i < u8.length && p < len) {
    const v = u8[i++] & 31;
    const r = varint(u8, i);
    i = r.i;
    if (v) m.fill((v << 3) | (v >> 2), p, Math.min(len, p + r.n));
    p += r.n;
  }
  return m;
}

/** TW 的新編碼（測試用；每個像素取高 5 位元） */
export function twRle8Encode(m: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < m.length) {
    const v = m[i] >> 3;
    let j = i + 1;
    while (j < m.length && m[j] >> 3 === v) j++;
    out.push(v);
    putVarint(out, j - i);
    i = j;
  }
  return Uint8Array.from(out);
}

const deg = (r: unknown, fallback: number) =>
  typeof r === 'number' && Number.isFinite(r)
    ? Math.round((((((r * 180) / Math.PI) % 360) + 360) % 360) * 10) / 10
    : fallback;
const pctOf = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1000) / 10 : fallback;
/** TW 的 −100～100 → 本站的 0～200%（亮度、對比、飽和度） */
const adjOf = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(100 + v), 0, 200) : 100;

/** TW 的設定（SETTINGS）→ 本站的外觀、擺放、色彩調整、去光暈 */
export function fromTokenWorkshop(
  settings: Record<string, unknown>,
  base: Look,
): { look: Look; view: TokenView; popOn: boolean; adjust: Adjust; halo: number } {
  const s = settings;
  const key = typeof s.colorKey === 'string' ? s.colorKey.toLowerCase() : '';
  const tex = s.tex === 'marble' ? 'stone' : s.tex;
  const look = normalizeLook({
    ...base,
    frame: s.formula,
    color: s.color,
    colorKey: METALS.some((m) => m.key === key) ? key : 'custom',
    colorMode: s.gradOn === true ? 'gradient' : 'solid',
    accent: s.accent,
    width: pctOf(s.width, base.width),
    count: s.count,
    depth: pctOf(s.depth, base.depth),
    lineW: pctOf(s.lineW, base.lineW),
    texture: tex,
    texAmount: pctOf(s.texAmt, base.texAmount),
    texScale: pctOf(s.texDens, base.texScale),
    texRotate: deg(s.texRot, 0),
    texSeed: s.seed,
    energy: s.eCol,
    g1: s.g1,
    g2: s.g2,
    gAngle: deg(s.gAng, 45),
    /* 漸層的色彩平衡（ce4c62b；沒有時 50%） */
    gMid: pctOf(s.gMid, 50),
    lightAngle: deg(s.lAng, 135),
    lightStrength: pctOf(s.lInt, 100),
    bg: s.bgOn === false ? 'none' : 'color',
    bgColor: s.bg,
    autoMargin: s.autoFit !== false,
    margin: pctOf(s.pad, base.margin),
    /* TW 70f1503 起一律是貼合的畫布、外緣淡出（檔案裡沒有這兩個設定；規格 D48） */
    tightFit: true,
    edgeFade: true,
    feather: s.feather,
    shadow: pctOf(s.shadow, 0),
    /* TW 的環沒有光暈與不透明度 */
    glow: 'off',
    opacity: 100,
  });
  const view = normalizeView({
    x: s.ix,
    y: s.iy,
    zoom: s.zoom,
    rotate: typeof s.rot === 'number' ? Math.max(-180, Math.min(180, (s.rot * 180) / Math.PI)) : 0,
    flip: s.flip === -1,
  });
  /* 圖片的亮度、對比、飽和度（ce4c62b；近似成本站照 CSS filter 的公式，D25）；色相 TW 沒有 */
  const adjust = normalizeAdjust({
    bright: adjOf(s.bri),
    contrast: adjOf(s.con),
    sat: adjOf(s.sat),
    hue: 0,
  });
  return {
    look,
    view,
    popOn: s.popOn !== false,
    adjust,
    halo: typeof s.defr === 'number' && Number.isFinite(s.defr) ? haloOf(s.defr * 100) : 0,
  };
}

interface TwMeta {
  img: { type: string };
  mask: { w: number; h: number; rle?: unknown; rle8?: unknown };
  settings: Record<string, unknown>;
}

/** 原作的 validMeta：app、圖片類型、遮罩的寬高與長度上限、settings */
function validTwMeta(meta: unknown): meta is TwMeta {
  if (!isObj(meta) || meta.app !== 'token-workshop' || !isObj(meta.img) || !isObj(meta.mask))
    return false;
  if (!isObj(meta.settings)) return false;
  if (meta.img.type !== 'image/png' && meta.img.type !== 'image/jpeg') return false;
  const M = meta.mask;
  if (!Number.isInteger(M.w) || !Number.isInteger(M.h)) return false;
  const W = M.w as number;
  const H = M.h as number;
  if (W < 1 || H < 1 || W * H > TW_LIMITS.maskPixels) return false;
  return (
    (typeof M.rle === 'string' && M.rle.length <= W * H * 2 + 16) ||
    (typeof M.rle8 === 'string' && M.rle8.length <= W * H * 3 + 16)
  );
}

/** 4 位元組的 JSON 長度＋JSON＋圖檔（PNG 與 WebP 共用）→ 本站的棋子 */
function parseTwPayload(pl: Uint8Array, base: Look): EmbeddedToken | null {
  if (pl.length < 4) return null;
  const jl = new DataView(pl.buffer, pl.byteOffset, pl.byteLength).getUint32(0);
  if (jl > TW_LIMITS.json || 4 + jl > pl.length) return null;
  let meta: unknown;
  try {
    meta = JSON.parse(new TextDecoder().decode(pl.subarray(4, 4 + jl)));
  } catch {
    return null;
  }
  if (!validTwMeta(meta)) return null;
  try {
    const M = meta.mask;
    const len = M.w * M.h;
    const data =
      typeof M.rle8 === 'string'
        ? twRle8Decode(fromBase64(M.rle8), len)
        : twRleDecode(fromBase64(M.rle as string), len);
    const mapped = fromTokenWorkshop(meta.settings, base);
    return {
      look: mapped.look,
      token: {
        name: '',
        badge: '',
        view: mapped.view,
        popOn: mapped.popOn,
        adjust: mapped.adjust,
        ...(mapped.halo ? { halo: mapped.halo } : {}),
      },
      image: { name: 'token-workshop', type: meta.img.type, bytes: pl.slice(4 + jl) },
      mask: { kind: 'pixels', width: M.w, height: M.h, data },
      source: 'token-workshop',
    };
  } catch {
    return null;
  }
}

/** TW 的 PNG：IEND 之前的 `tkWs` chunk（CRC 要對） */
function parseTwPng(png: Uint8Array, base: Look): EmbeddedToken | null {
  if (png.length < 20 || png.length > TW_LIMITS.file || png[0] !== 0x89 || png[1] !== 0x50)
    return null;
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let p = 8;
  while (p + 12 <= png.length) {
    const len = dv.getUint32(p);
    const type = String.fromCharCode(png[p + 4], png[p + 5], png[p + 6], png[p + 7]);
    if (len > png.length - p - 12) return null;
    if (type === 'tkWs') {
      if (len < 4 || crc32(png, p + 4, p + 8 + len) !== dv.getUint32(p + 8 + len)) return null;
      return parseTwPayload(png.subarray(p + 8, p + 8 + len), base);
    }
    if (type === 'IEND') break;
    p += 12 + len;
  }
  return null;
}

/** TW 的 WebP：RIFF 裡多一個 `TKWS` chunk（解碼器會略過不認得的 chunk） */
function parseTwWebp(u8: Uint8Array, base: Look): EmbeddedToken | null {
  const tag = (i: number) => String.fromCharCode(u8[i], u8[i + 1], u8[i + 2], u8[i + 3]);
  if (u8.length < 20 || u8.length > TW_LIMITS.file || tag(0) !== 'RIFF' || tag(8) !== 'WEBP')
    return null;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let p = 12;
  while (p + 8 <= u8.length) {
    const len = dv.getUint32(p + 4, true);
    if (len > u8.length - p - 8) return null;
    if (tag(p) === 'TKWS') return parseTwPayload(u8.subarray(p + 8, p + 8 + len), base);
    p += 8 + len + (len & 1);
  }
  return null;
}

/** 檔案是不是 WebP（看檔頭） */
export const isWebp = (u8: Uint8Array): boolean =>
  u8.length >= 12 &&
  u8[0] === 0x52 &&
  u8[1] === 0x49 &&
  u8[2] === 0x46 &&
  u8[3] === 0x46 &&
  u8[8] === 0x57 &&
  u8[9] === 0x45 &&
  u8[10] === 0x42 &&
  u8[11] === 0x50;

/** 讀圖檔裡嵌的棋子（本站的 PNG、token-workshop 的 PNG 與 WebP）；沒有時 null */
export function readEmbedded(bytes: Uint8Array, base: Look): EmbeddedToken | null {
  if (isWebp(bytes)) return parseTwWebp(bytes, base);
  const text = readPngText(bytes, EMBED_KEYWORD);
  if (text) {
    const r = parseToolkit(text);
    if (r) return r;
  }
  return parseTwPng(bytes, base);
}
