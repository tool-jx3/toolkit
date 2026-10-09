/**
 * 自訂圖樣、自訂裝飾的上傳（規格 F113、F126、2）：PNG、JPEG、WebP、GIF、SVG，每個最大 4 MB；
 * SVG 先用 DOMPurify（SVG 設定）去掉 script、事件屬性與 javascript: 網址（D19）。
 */
import DOMPurify from 'dompurify';
import { readAsDataUrl } from '@/core/files';
import type { UserDecor, UserPattern } from './model';

export const USER_ASSET_MAX_BYTES = 4 * 1024 * 1024;
export const USER_ASSET_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg';

export class AssetError extends Error {
  constructor(readonly code: 'too-large' | 'read') {
    super(code);
  }
}

/** 短的 id（user-pat-xxxx／user-dec-xxxx；同舊版） */
export function userAssetId(
  prefix: 'user-pat' | 'user-dec',
  now = Date.now(),
  random = Math.random,
): string {
  return `${prefix}-${now.toString(36)}${random().toString(36).slice(2, 6)}`;
}

/** 檔名 → 名稱（去副檔名、最多 24 字） */
export function assetName(fileName: string, fallback: string): string {
  return fileName.replace(/\.[^.]+$/, '').slice(0, 24) || fallback;
}

export function sanitizeSvg(text: string): string {
  return DOMPurify.sanitize(text, {
    USE_PROFILES: { svg: true, svgFilters: true },
  }) as unknown as string;
}

function utf8Base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function readAsset(
  file: File,
): Promise<{ type: 'raster' | 'svg'; dataUrl: string; rawSvg: string | null }> {
  if (file.size > USER_ASSET_MAX_BYTES) throw new AssetError('too-large');
  try {
    const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
    if (isSvg) {
      const cleaned = sanitizeSvg(await file.text());
      if (!cleaned.trim()) throw new Error('empty');
      return {
        type: 'svg',
        dataUrl: `data:image/svg+xml;base64,${utf8Base64(cleaned)}`,
        rawSvg: cleaned,
      };
    }
    return { type: 'raster', dataUrl: await readAsDataUrl(file), rawSvg: null };
  } catch {
    throw new AssetError('read');
  }
}

export async function readUserPattern(file: File, fallbackName: string): Promise<UserPattern> {
  const a = await readAsset(file);
  return {
    id: userAssetId('user-pat'),
    name: assetName(file.name, fallbackName),
    type: a.type,
    dataUrl: a.dataUrl,
    color: '#888888',
    scale: 0.5,
    ground: 'user',
    wall: 'user',
  };
}

export async function readUserDecor(file: File, fallbackName: string): Promise<UserDecor> {
  const a = await readAsset(file);
  return {
    id: userAssetId('user-dec'),
    name: assetName(file.name, fallbackName),
    type: a.type,
    dataUrl: a.dataUrl,
    rawSvg: a.rawSvg,
    scale: 1,
    anchorX: 'center',
    anchorY: 'center',
    genres: ['user'],
  };
}
