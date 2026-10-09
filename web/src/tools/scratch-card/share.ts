/**
 * 分享連結（規格 3.8）：網址 `#c=` ＋ deflate 壓縮的 `{ v: 1, d: 卡片 }`（共用 core/share）。
 * 卡片＝畫出這一張需要的設定＋抽出來的結果（不含種子、句子清單與其他圖片）；網址圖片「去掉透明留白」時另外帶裁切範圍
 * （`crops`：網址 → [x, y, 寬, 高, 原圖寬, 原圖高]），開連結的畫面照這個範圍顯示，不必再讀圖片的像素。
 * 讀回時一律整理（網址是任何人都能編的輸入）：數值夾到範圍、選項不認得時用預設、圖片只收 http(s) 網址。
 */
import { encodeShareHash, readShareHash } from '@/core/share';
import type { CardSpec, Drawn } from './card';
import { ICON_COUNT } from './icons';
import {
  type Crop,
  cleanCrop,
  cleanImageRef,
  type ImageRef,
  LIMITS,
  normalizeState,
  oneLine,
  type ScratchState,
} from './model';

export const SHARE_KEY = 'c';
export const SHARE_VERSION = 1;
/** # 後面最多幾個字 */
export const SHARE_MAX_LENGTH = 8000;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** 分享用的卡片：進階設定關閉時不帶背景圖（不會用到） */
export function shareSpec(spec: CardSpec): CardSpec {
  return { ...spec, bgImage: spec.expert ? spec.bgImage : null };
}

/** 用到上傳的圖片（放不進連結） */
export function usesUploadedImages(spec: CardSpec): boolean {
  const s = shareSpec(spec);
  if (s.bgImage?.kind === 'asset') return true;
  const r = s.result;
  if (r.kind === 'image-icon') return r.images.some((im) => im.kind === 'asset');
  if (r.kind === 'image-full') return r.image.kind === 'asset';
  return false;
}

/** 網址 → 裁切範圍 */
export type ShareCrops = Record<string, Crop>;

/** 開連結時讀到的內容 */
export interface SharedCard {
  spec: CardSpec;
  crops: ShareCrops;
}

/** 結果裡要裁的網址圖片（「去掉透明留白」打開的小圖） */
export function trimmedUrls(spec: CardSpec): string[] {
  const r = spec.result;
  if (r.kind !== 'image-icon' || !spec.trim) return [];
  return [...new Set(r.images.flatMap((im) => (im.kind === 'url' ? [im.url] : [])))];
}

/** 只留結果用到的網址、合理的範圍 */
function pickCrops(spec: CardSpec, raw: unknown): ShareCrops {
  const out: ShareCrops = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const url of trimmedUrls(spec)) {
    const c = cleanCrop((raw as Record<string, unknown>)[url]);
    if (c) out[url] = c;
  }
  return out;
}

/** 卡片（＋網址圖片的裁切範圍）→ `#c=…`（含 #） */
export function encodeShare(spec: CardSpec, crops: ShareCrops = {}): string {
  const s = shareSpec(spec);
  const picked = pickCrops(s, crops);
  const packed = Object.fromEntries(
    Object.entries(picked).map(([u, c]) => [u, [c.x, c.y, c.w, c.h, c.nw, c.nh]]),
  );
  return encodeShareHash(Object.keys(packed).length ? { ...s, crops: packed } : s, {
    version: SHARE_VERSION,
    key: SHARE_KEY,
  });
}

/** 完整的分享網址（目前的網址換掉 #） */
export function shareUrlFor(spec: CardSpec, base: string, crops: ShareCrops = {}): string {
  const u = new URL(base);
  u.hash = encodeShare(spec, crops).slice(1);
  return u.toString();
}

const urlRef = (v: unknown): ImageRef | null => {
  const r = cleanImageRef(v);
  return r?.kind === 'url' ? r : null;
};

function cleanDrawn(v: unknown): Drawn | null {
  if (!isObj(v)) return null;
  switch (v.kind) {
    case 'icons': {
      if (!Array.isArray(v.icons) || !v.icons.length) return null;
      const icons = v.icons
        .slice(0, LIMITS.count[1])
        .map((n) => (Number.isInteger(n) && n >= 0 && n < ICON_COUNT ? (n as number) : 0));
      return { kind: 'icons', icons };
    }
    case 'sentence':
      return typeof v.text === 'string'
        ? { kind: 'sentence', text: oneLine(v.text, LIMITS.sentences) }
        : null;
    case 'image-icon': {
      if (!Array.isArray(v.images)) return null;
      const images = v.images
        .slice(0, LIMITS.count[1])
        .map(urlRef)
        .filter((x): x is ImageRef => !!x);
      return images.length ? { kind: 'image-icon', images } : { kind: 'no-images' };
    }
    case 'image-full': {
      const image = urlRef(v.image);
      return image ? { kind: 'image-full', image } : { kind: 'no-images' };
    }
    case 'no-images':
      return { kind: 'no-images' };
    default:
      return null;
  }
}

/** 整理讀回來的卡片（結構不對時 null） */
export function cleanSpec(raw: unknown): CardSpec | null {
  if (!isObj(raw)) return null;
  const result = cleanDrawn(raw.result);
  if (!result) return null;
  const s: ScratchState = normalizeState({ ...raw, images: [], bgImage: null });
  return {
    width: s.width,
    height: s.height,
    expert: s.expert,
    bgColor: s.bgColor,
    bgImage: s.expert ? urlRef(raw.bgImage) : null,
    bgFit: s.bgFit,
    zone: s.zone,
    titleText: s.titleText,
    titleColor: s.titleColor,
    titleSize: s.titleSize,
    titlePos: s.titlePos,
    coverText: s.coverText,
    coverColor: s.coverColor,
    brush: s.brush,
    kind: s.kind,
    coverShape: s.coverShape,
    sentenceSize: s.sentenceSize,
    sentenceColor: s.sentenceColor,
    imageSize: s.imageSize,
    imageStyle: s.imageStyle,
    trim: s.trim,
    result,
  };
}

/**
 * 網址的 # 部分 → 卡片。
 * 'none'：沒有分享的內容（照常打開編輯畫面）；'broken'：有 `c=` 但讀不出來。
 */
export function readShare(hash: string): SharedCard | 'none' | 'broken' {
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!h || !new URLSearchParams(h).has(SHARE_KEY)) return 'none';
  const raw = readShareHash(hash, {
    version: SHARE_VERSION,
    key: SHARE_KEY,
    maxLength: SHARE_MAX_LENGTH,
  });
  if (raw === null) return 'broken';
  const spec = cleanSpec(raw);
  if (!spec) return 'broken';
  return { spec, crops: pickCrops(spec, isObj(raw) ? raw.crops : null) };
}
