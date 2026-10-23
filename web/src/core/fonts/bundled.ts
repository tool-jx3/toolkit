/**
 * 本站附帶的字型（rpg-screenshot 移植時新增）：字型檔放在 `core/fonts/files/<資料夾>/`（同一個資料夾有 `LICENSE.txt` 授權全文與
 * `meta.json` 出處，建置時併入 THIRD_PARTY_NOTICES），不從 CDN 載入。
 *
 * 只在用到時下載：`loadBundledFont(id)` 第一次呼叫才建立 FontFace、下載並加進 `document.fonts`，之後回傳同一個結果。
 * 畫 canvas 前 `await loadBundledFont(id)`，再用 `bundledFontStack(id)` 當 `ctx.font` 的字型（後面接替代字型，字型沒有的字由它補）。
 *
 * 不從 `@/core/fonts` 匯出（字型檔的網址只在 import 這個檔的工具裡）；用 `import { … } from '@/core/fonts/bundled'`。
 *
 * ```ts
 * await loadBundledFont('cubic-11');
 * ctx.font = `24px ${bundledFontStack('cubic-11')}`; // 24px "Cubic 11", monospace
 * ```
 */
import cubic11Url from './files/cubic-11/Cubic_11.woff2?url';
import fusion10Url from './files/fusion-pixel-10px/fusion-pixel-10px-proportional-tc.woff2?url';

export type BundledFontId = 'cubic-11' | 'fusion-pixel-10';

export interface BundledFont {
  id: BundledFontId;
  /** 註冊到 document.fonts 的字型名稱 */
  family: string;
  /** 介面上的名稱 */
  label: string;
  /** 字型檔的網址（建置後的資產） */
  url: string;
  /** 字型檔的大小（位元組，WOFF2） */
  bytes: number;
  /** 像素字型的格子大小（px）：字級是它的整數倍時最清楚 */
  gridPx: number;
  /** 授權（SPDX） */
  license: string;
  /** 出處 */
  source: string;
}

export const BUNDLED_FONTS: Record<BundledFontId, BundledFont> = {
  'cubic-11': {
    id: 'cubic-11',
    family: 'Cubic 11',
    label: '俐方體 11 號',
    url: cubic11Url,
    bytes: 400_228,
    gridPx: 12,
    license: 'OFL-1.1',
    source: 'https://github.com/ACh-K/Cubic-11',
  },
  'fusion-pixel-10': {
    id: 'fusion-pixel-10',
    family: 'Fusion Pixel 10px TC',
    label: '縫合像素體 10px',
    url: fusion10Url,
    bytes: 409_368,
    gridPx: 10,
    license: 'OFL-1.1',
    source: 'https://github.com/TakWolf/fusion-pixel-font',
  },
};

export const BUNDLED_FONT_IDS = Object.keys(BUNDLED_FONTS) as BundledFontId[];

/** 字型堆疊：本站字型＋替代字型（預設瀏覽器的等寬字型） */
export function bundledFontStack(id: BundledFontId, fallback = 'monospace'): string {
  return `"${BUNDLED_FONTS[id].family}", ${fallback}`;
}

const loads = new Map<BundledFontId, Promise<boolean>>();
const loaded = new Set<BundledFontId>();

/** 已經載好了沒有（同步；畫之前不必再等） */
export function isBundledFontLoaded(id: BundledFontId): boolean {
  return loaded.has(id);
}

/**
 * 下載並註冊字型（只做一次）；成功 true，失敗（離線、瀏覽器不支援 FontFace）false——之後再呼叫會重試。
 */
export function loadBundledFont(id: BundledFontId): Promise<boolean> {
  const cur = loads.get(id);
  if (cur) return cur;
  const font = BUNDLED_FONTS[id];
  const p = (async () => {
    if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts)
      return false;
    try {
      const face = new FontFace(font.family, `url("${font.url}") format("woff2")`, {
        display: 'swap',
      });
      await face.load();
      document.fonts.add(face);
      loaded.add(id);
      return true;
    } catch {
      loads.delete(id);
      return false;
    }
  })();
  loads.set(id, p);
  return p;
}
