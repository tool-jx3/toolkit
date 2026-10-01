/**
 * 字型：設定裡的字型參照 → 畫布用的字型字串（含自動替代）、要先載入的字型清單。
 */
import { ensureFont, findGoogleFont } from '@/core/fonts';
import {
  canvasFont,
  type FontStyleClass,
  fontStack,
  nearestWeightUp,
  type StackFont,
} from '@/core/typeset';
import type { FontRef, Settings } from './settings';

const ALL_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

export const DEFAULT_FONT: FontRef = { source: 'google', family: 'Noto Serif TC' };

/**
 * 舊版字型清單的風格分類（決定替代字型：西文字型遇到中文時接思源宋體或思源黑體、韓文接 Noto Serif／Sans KR）。
 * 目錄裡其他字型依分類推定：襯線（serif）為 serif，其餘為 sans。
 */
const STYLE_OVERRIDES: Record<string, FontStyleClass> = {
  'Noto Serif TC': 'serif',
  'Noto Sans TC': 'sans',
  'LXGW WenKai TC': 'serif',
  'Chocolate Classical Sans': 'sans',
  'Cactus Classical Serif': 'serif',
  Huninn: 'sans',
  Iansui: 'sans',
  Cinzel: 'serif',
  'Bebas Neue': 'sans',
  'Special Elite': 'serif',
  Creepster: 'sans',
  UnifrakturMaguntia: 'serif',
};

export interface FontMeta {
  family: string;
  weights: readonly number[];
  styleClass: FontStyleClass;
  latinOnly: boolean;
  google: boolean;
}

/** 字型參照的資訊；找不到的 Google 字型當作預設字型 */
export function fontMeta(ref: FontRef | null | undefined): FontMeta {
  const r = ref?.family ? ref : DEFAULT_FONT;
  if (r.source === 'google') {
    const entry = findGoogleFont(r.family) ?? findGoogleFont(DEFAULT_FONT.family)!;
    return {
      family: entry.family,
      weights: entry.weights,
      styleClass: STYLE_OVERRIDES[entry.family] ?? (entry.category === 'serif' ? 'serif' : 'sans'),
      latinOnly: entry.scripts.every((s) => s === 'latin'),
      google: true,
    };
  }
  if (r.source === 'upload')
    return {
      family: r.family,
      weights: [400, 700],
      styleClass: 'sans',
      latinOnly: false,
      google: false,
    };
  return {
    family: r.family,
    weights: ALL_WEIGHTS,
    styleClass: 'sans',
    latinOnly: false,
    google: false,
  };
}

const stackFont = (m: FontMeta): StackFont => ({
  family: m.family,
  styleClass: m.styleClass,
  latinOnly: m.latinOnly,
});

/** 實際使用的字重（最接近；同距離取粗的） */
export const usedWeight = (ref: FontRef | null | undefined, weight: number): number =>
  nearestWeightUp(fontMeta(ref).weights, weight);

/** 畫布用的 font 字串 */
export function fontCssFor(
  ref: FontRef | null | undefined,
  weight: number,
  italic: boolean,
  size: number,
  text: string,
): string {
  const m = fontMeta(ref);
  return canvasFont(
    fontStack(stackFont(m), text),
    nearestWeightUp(m.weights, weight),
    size,
    italic,
  );
}

export interface FontLoad {
  family: string;
  weight: number;
  italic: boolean;
  text: string;
}

/** 這組設定要用到的字型（含自動替代的字型），給 ensureFont 先載入 */
export function fontLoads(cfg: Settings, mainText: string, subText: string): FontLoad[] {
  const out: FontLoad[] = [];
  const add = (ref: FontRef | null, weight: number, italic: boolean, text: string) => {
    const m = fontMeta(ref);
    const stack = fontStack(stackFont(m), text);
    const w = nearestWeightUp(m.weights, weight);
    stack.families.forEach((family, i) => {
      const entry = findGoogleFont(family);
      const fw = i === 0 ? w : entry ? nearestWeightUp(entry.weights, w) : w;
      out.push({ family, weight: fw, italic, text });
    });
  };
  add(cfg.font, cfg.weight, cfg.italic, mainText || '永');
  if (subText.trim()) add(cfg.subFont ?? cfg.font, cfg.subWeight, cfg.subItalic, subText);
  return out;
}

/** 載入字型（逾時就算了，用替代字型畫）。回傳是否全部在時限內完成。 */
export async function loadFonts(list: readonly FontLoad[], timeoutMs = 12000): Promise<boolean> {
  const all = Promise.all(
    list.map((f) =>
      ensureFont(f.family, f.weight, f.text, {
        timeoutMs,
        style: f.italic ? 'italic' : 'normal',
      }).catch(() => false),
    ),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((r) => {
    timer = setTimeout(() => r('timeout'), timeoutMs);
  });
  const res = await Promise.race([all, timeout]);
  clearTimeout(timer);
  return res !== 'timeout';
}

/** 舊版字型清單（範本、效果裡用到的字型都在這裡） */
export const LEGACY_FONTS = Object.keys(STYLE_OVERRIDES);
