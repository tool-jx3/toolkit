/**
 * 圖片檔頭的尺寸與動態判斷（不解碼、不依賴 DOM；讀入房間 ZIP 時用，規格 F291）。
 * 認得 PNG（含 APNG）、GIF、JPEG、WebP（VP8／VP8L／VP8X）；讀不出尺寸時寬高是 0（素材的「未知」）。
 */
import { isAnimatedImage } from './materials';

export interface ImageInfo {
  width: number;
  height: number;
  animated: boolean;
}

const u32be = (b: Uint8Array, i: number) =>
  ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const tag = (b: Uint8Array, i: number, s: string) =>
  [...s].every((c, k) => b[i + k] === c.charCodeAt(0));

function pngSize(b: Uint8Array) {
  /* 8 位元簽名之後第一個區塊是 IHDR（長度 4＋名稱 4＋寬 4＋高 4） */
  if (b.length < 24 || !tag(b, 12, 'IHDR')) return null;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

function gifSize(b: Uint8Array) {
  return b.length >= 10 ? { width: u16le(b, 6), height: u16le(b, 8) } : null;
}

function jpegSize(b: Uint8Array) {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const m = b[i + 1];
    if (m === 0xff) {
      i++;
      continue;
    }
    /* SOF0～SOF15，扣掉 DHT（C4）、JPG（C8）、DAC（CC） */
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
    }
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) {
      i += 2;
      continue;
    }
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return null;
}

function webpSize(b: Uint8Array) {
  if (b.length < 25) return null;
  if (tag(b, 12, 'VP8X') && b.length >= 30) {
    return { width: 1 + u24le(b, 24), height: 1 + u24le(b, 27) };
  }
  if (tag(b, 12, 'VP8L') && b[20] === 0x2f) {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
  }
  if (tag(b, 12, 'VP8 ') && b.length >= 30) {
    return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  }
  return null;
}

/** 圖片的寬高與是否動態（mime 是 sniffImageMime 看出的格式） */
export function imageInfo(bytes: Uint8Array, mime: string): ImageInfo {
  const size =
    mime === 'image/png'
      ? pngSize(bytes)
      : mime === 'image/gif'
        ? gifSize(bytes)
        : mime === 'image/jpeg'
          ? jpegSize(bytes)
          : mime === 'image/webp'
            ? webpSize(bytes)
            : null;
  return {
    width: size?.width ?? 0,
    height: size?.height ?? 0,
    animated: isAnimatedImage(bytes, mime),
  };
}
