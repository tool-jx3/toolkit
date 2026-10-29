/**
 * 把棋子的設定嵌進匯出的 PNG、之後再開來改（token-workshop 的「Keep editable」）：
 * - 本站：PNG 的 iTXt（共用的 setPngText，關鍵字 `trpg-toolkit`、壓縮），內容是 JSON：
 *   `{ format: 'trpg-toolkit-token', version: 1, look, token: { name, badge, view, popOn, adjust }, image: { name, type, data }, mask: { width, height, data } | null }`；
 *   圖片與遮罩（PNG）以 base64 放在裡面。
 * - token-workshop 匯出的 PNG：私有 chunk `tkWs`（4 位元組的 JSON 長度＋JSON＋圖檔），對應到本站的設定（規格 F08）。
 */
import { readPngText, setPngText } from '@/core/encode';
import {
  type Adjust,
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
  token: { name: string; badge: string; view: TokenView; popOn: boolean; adjust: Adjust };
  image: { name: string; type: string; bytes: Uint8Array };
  /** 遮罩：本站是遮罩的 PNG；TW 是遮罩的像素（0／255） */
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

export function embedJson(e: EmbedInput): string {
  return JSON.stringify({
    format: EMBED_FORMAT,
    version: EMBED_VERSION,
    look: e.look,
    token: e.token,
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
    return {
      look: normalizeLook(d.look),
      token: {
        name: typeof t.name === 'string' ? t.name.slice(0, 40) : '',
        badge: typeof t.badge === 'string' ? t.badge.slice(0, 4) : '',
        view: normalizeView(t.view),
        popOn: t.popOn !== false,
        adjust: normalizeAdjust(t.adjust),
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

/** TW 的遮罩：交錯的 0／1 連續長度（7 位元一組的可變長度整數） */
export function twRleDecode(u8: Uint8Array, len: number): Uint8Array {
  const m = new Uint8Array(len);
  let p = 0;
  let i = 0;
  let cur = 0;
  while (i < u8.length && p < len) {
    let n = 0;
    let sh = 0;
    let b: number;
    do {
      b = u8[i++];
      n |= (b & 127) << sh;
      sh += 7;
    } while (b & 128 && i < u8.length);
    if (cur) m.fill(255, p, Math.min(len, p + n));
    p += n;
    cur ^= 1;
  }
  return m;
}

/** TW 的編碼（測試與相容檢查用） */
export function twRleEncode(m: Uint8Array): Uint8Array {
  const out: number[] = [];
  let cur = 0;
  let run = 0;
  const put = (n0: number) => {
    let n = n0;
    while (n > 127) {
      out.push((n & 127) | 128);
      n >>>= 7;
    }
    out.push(n);
  };
  for (let i = 0; i < m.length; i++) {
    const b = m[i] ? 1 : 0;
    if (b === cur) run++;
    else {
      put(run);
      cur = b;
      run = 1;
    }
  }
  put(run);
  return Uint8Array.from(out);
}

const deg = (r: unknown, fallback: number) =>
  typeof r === 'number' && Number.isFinite(r)
    ? Math.round((((((r * 180) / Math.PI) % 360) + 360) % 360) * 10) / 10
    : fallback;
const pctOf = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1000) / 10 : fallback;

/** TW 的設定（SETTINGS）→ 本站的外觀與擺放 */
export function fromTokenWorkshop(
  settings: Record<string, unknown>,
  base: Look,
): { look: Look; view: TokenView; popOn: boolean } {
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
    lightAngle: deg(s.lAng, 135),
    lightStrength: pctOf(s.lInt, 100),
    bg: s.bgOn === false ? 'none' : 'color',
    bgColor: s.bg,
    autoMargin: s.autoFit !== false,
    margin: pctOf(s.pad, base.margin),
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
  return { look, view, popOn: s.popOn !== false };
}

function parseTokenWorkshop(png: Uint8Array, base: Look): EmbeddedToken | null {
  if (png.length < 20 || png[0] !== 0x89 || png[1] !== 0x50) return null;
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let p = 8;
  while (p + 12 <= png.length) {
    const len = dv.getUint32(p);
    const type = String.fromCharCode(png[p + 4], png[p + 5], png[p + 6], png[p + 7]);
    if (type === 'tkWs') {
      try {
        const jl = dv.getUint32(p + 8);
        const meta = JSON.parse(new TextDecoder().decode(png.subarray(p + 12, p + 12 + jl)));
        if (
          !isObj(meta) ||
          meta.app !== 'token-workshop' ||
          !isObj(meta.img) ||
          !isObj(meta.mask) ||
          !isObj(meta.settings)
        )
          return null;
        const img = png.slice(p + 12 + jl, p + 8 + len);
        const w = Math.round(Number(meta.mask.w) || 0);
        const h = Math.round(Number(meta.mask.h) || 0);
        const mapped = fromTokenWorkshop(meta.settings, base);
        const mask =
          w > 0 && h > 0 && typeof meta.mask.rle === 'string'
            ? {
                kind: 'pixels' as const,
                width: w,
                height: h,
                data: twRleDecode(fromBase64(meta.mask.rle), w * h),
              }
            : null;
        return {
          look: mapped.look,
          token: {
            name: '',
            badge: '',
            view: mapped.view,
            popOn: mapped.popOn,
            adjust: normalizeAdjust(null),
          },
          image: {
            name: 'token-workshop',
            type: typeof meta.img.type === 'string' ? meta.img.type : 'image/png',
            bytes: img,
          },
          mask,
          source: 'token-workshop',
        };
      } catch {
        return null;
      }
    }
    if (type === 'IEND') break;
    p += 12 + len;
  }
  return null;
}

/** 讀 PNG 裡嵌的棋子（本站或 token-workshop）；沒有時 null */
export function readEmbedded(png: Uint8Array, base: Look): EmbeddedToken | null {
  const text = readPngText(png, EMBED_KEYWORD);
  if (text) {
    const r = parseToolkit(text);
    if (r) return r;
  }
  return parseTokenWorkshop(png, base);
}
