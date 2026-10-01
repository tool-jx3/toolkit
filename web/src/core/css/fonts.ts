/**
 * CSS 裡的字型：font-family 值（指定字型 → 該類的後備字型 → 通用字族）、Google Fonts 的 @import、
 * 用到的電腦字型清單（寫進開頭說明）。
 */
import type { FontSource } from '../fonts';
import {
  type FontCategory,
  type FontScript,
  findGoogleFont,
  findSystemFont,
  googleFontCssUrl,
  nearestWeight,
} from '../fonts/catalog';
import { cleanFontName, quoteFontFamily } from './escape';

/** CSS 類工具的字型設定（與 FontPicker 的值相容） */
export interface CssFont {
  source: FontSource;
  family: string;
  weight?: number;
}

/** 後備字型的種類 */
export type FallbackKind = 'tc-sans' | 'tc-serif' | 'tc-kai' | 'sans' | 'serif';

/**
 * 後備字型（網頁字型載不到、或字型沒有某些字時）：
 * 繁中黑體 → 微軟正黑體、PingFang TC、Heiti TC；繁中明體 → 新細明體、Songti TC；楷書 → 標楷體、BiauKai、Kaiti TC；
 * 其他 → 日文系統字型（黑體：Yu Gothic UI、Yu Gothic、Meiryo；明體：Yu Mincho、Hiragino Mincho ProN）；最後是通用字族。
 */
export const FALLBACK_STACKS: Readonly<Record<FallbackKind, readonly string[]>> = Object.freeze({
  'tc-sans': [
    'Microsoft JhengHei',
    '微軟正黑體',
    'PingFang TC',
    'Heiti TC',
    'Yu Gothic UI',
    'Yu Gothic',
    'Meiryo',
    'sans-serif',
  ],
  'tc-serif': ['PMingLiU', '新細明體', 'Songti TC', 'Yu Mincho', 'Hiragino Mincho ProN', 'serif'],
  'tc-kai': ['DFKai-SB', '標楷體', 'BiauKai', 'Kaiti TC', 'serif'],
  sans: ['Yu Gothic UI', 'Yu Gothic', 'Meiryo', 'Microsoft JhengHei', 'PingFang TC', 'sans-serif'],
  serif: ['Yu Mincho', 'Hiragino Mincho ProN', 'PMingLiU', 'Songti TC', 'serif'],
});

function kindOf(scripts: readonly FontScript[], category: FontCategory): FallbackKind {
  const tc = scripts.includes('tc') || scripts.includes('hk') || scripts.includes('bpmf');
  if (tc) {
    if (category === 'serif') return 'tc-serif';
    if (category === 'handwriting') return 'tc-kai';
    return 'tc-sans';
  }
  return category === 'serif' ? 'serif' : 'sans';
}

/** 這個字型該接哪一類後備字型。電腦字型（不在內建清單的）用黑體類 */
export function fallbackKind(font: Pick<CssFont, 'source' | 'family'>): FallbackKind {
  if (font.source === 'google') {
    const g = findGoogleFont(font.family);
    if (g) return kindOf(g.scripts, g.category);
  }
  const sys = findSystemFont(font.family);
  if (sys) return kindOf(sys.scripts, sys.category);
  return 'tc-sans';
}

/** 後備字型堆疊（已加引號、逗號分隔） */
export function fallbackStack(kind: FallbackKind): string {
  return FALLBACK_STACKS[kind].map(quoteFontFamily).join(', ');
}

/**
 * font-family 的值：指定字型（電腦內建字型連同中文／日文名稱）→ 後備字型 → 通用字族。
 * 電腦字型名稱空白時只用後備字型。重複的名稱只留第一個。
 */
export function fontStack(font: Pick<CssFont, 'source' | 'family'>): string {
  const names: string[] = [];
  const name =
    font.source === 'google' ? (findGoogleFont(font.family)?.family ?? font.family) : font.family;
  const clean = cleanFontName(name);
  if (clean) {
    names.push(clean);
    const sys = font.source === 'google' ? undefined : findSystemFont(clean);
    if (sys) names.push(sys.family, ...sys.aliases);
  }
  names.push(...FALLBACK_STACKS[fallbackKind(font)]);
  const seen = new Set<string>();
  return names
    .filter((n) => {
      const k = n.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map(quoteFontFamily)
    .join(', ');
}

/** 實際輸出的字重：Google 字型換成目錄裡最接近的可用字重（距離相同取較細的）；其他照設定 */
export function cssFontWeight(font: CssFont, wanted = font.weight ?? 400): number {
  if (font.source !== 'google') return wanted;
  const g = findGoogleFont(font.family);
  return g ? nearestWeight(g.weights, wanted) : wanted;
}

/**
 * Google Fonts 的 css2 網址（每個家族一條，只含用到的字重：換成最接近的可用字重、由小到大、同家族合併）。
 * 電腦字型、上傳字型、不在目錄裡的名稱不載入。順序依第一次出現的順序。
 */
export function googleFontUrls(fonts: readonly CssFont[]): string[] {
  const map = new Map<string, Set<number>>();
  for (const f of fonts) {
    if (f.source !== 'google') continue;
    const g = findGoogleFont(f.family);
    if (!g) continue;
    let set = map.get(g.family);
    if (!set) {
      set = new Set();
      map.set(g.family, set);
    }
    set.add(nearestWeight(g.weights, f.weight ?? 400));
  }
  return [...map.entries()].map(([family, ws]) =>
    googleFontCssUrl(
      family,
      [...ws].sort((a, b) => a - b),
    ),
  );
}

/** 同上，但輸出完整的 @import 敘述 */
export function googleFontImports(fonts: readonly CssFont[]): string[] {
  return googleFontUrls(fonts).map((u) => `@import url("${u}");`);
}

/** 用到的電腦字型名稱（不重複、清理過；寫進開頭說明，提醒在跑 OBS 的電腦安裝） */
export function localFontNames(fonts: readonly CssFont[]): string[] {
  const out: string[] = [];
  for (const f of fonts) {
    if (f.source === 'google') continue;
    const n = cleanFontName(f.family);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}
