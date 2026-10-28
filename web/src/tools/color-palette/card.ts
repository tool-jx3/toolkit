/**
 * 配色卡（規格 1.2）的純邏輯：每一欄的色票與代表色、混色帶、綜合色、版面（本站自己的版型，方向參考
 * dearmysn1p3r/Colorpalettecard_Maker：照片在上、取出的顏色一列一列排在下面、色名＋HEX）、複製的文字、檔名。
 */
import { parseColor } from '@/core/color';
import { colorName } from '@/core/colornames';
import { mixColors, nearestPaletteColor, type PaletteColor, pickKeyColor } from '@/core/image';
import { realColors, roleColors } from './characters';
import type { Bar, CardColumn, CardRatio, CardSettings } from './logic';

export type Rgb = [number, number, number];

const rgbOf = (hex: string): Rgb => {
  const c = parseColor(hex) ?? { r: 0, g: 0, b: 0 };
  return [c.r, c.g, c.b];
};

/** 一欄解析之後的內容（畫卡片用） */
export interface ResolvedColumn {
  id: string;
  /** 照片下的名字 */
  name: string;
  /** 角色（source 為 character 時） */
  bar: Bar | null;
  image: { id: string; width: number; height: number } | null;
  /** 色票（由上到下） */
  swatches: PaletteColor[];
  /** 代表色（null＝沒有色票） */
  key: Rgb | null;
  /** 代表色是不是使用者選的（不是自動） */
  keyChosen: boolean;
  /** 實際用的色票來源 */
  colors: 'auto' | 'parts';
}

/** 角色的部位顏色當色票（「無」不算、重複的只留一個，占比平均） */
export function partsSwatches(bar: Bar): PaletteColor[] {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const s of bar.segments) {
    if (s.none || seen.has(s.color)) continue;
    seen.add(s.color);
    list.push(s.color);
  }
  return list.map((color) => ({ color, rgb: rgbOf(color), share: 1 / list.length }));
}

/**
 * 一欄的色票來源：角色沒有立繪、或選了「用角色的顏色」時用部位的顏色；照片、有立繪的角色用自動取色。
 */
export function columnColorsMode(col: CardColumn, bar: Bar | null): 'auto' | 'parts' {
  if (col.source === 'photo') return 'auto';
  if (!bar) return 'auto';
  if (!bar.image) return 'parts';
  return col.colors;
}

/**
 * 解析一欄：auto 時用 k-means 的結果（呼叫端算好傳進來，沒有圖片時是空的）。
 * 代表色：角色＝角色的代表色（沒有時自動選）；照片＝欄的代表色（換成色票裡最接近的那個；沒有時自動選）。
 */
export function resolveColumn(
  col: CardColumn,
  bars: readonly Bar[],
  auto: PaletteColor[] | null,
): ResolvedColumn {
  const bar =
    col.source === 'character' ? (bars.find((b) => b.id === col.characterId) ?? null) : null;
  const mode = columnColorsMode(col, bar);
  const swatches = mode === 'parts' && bar ? partsSwatches(bar) : (auto ?? []);
  let key: Rgb | null = null;
  let keyChosen = false;
  if (bar?.theme && parseColor(bar.theme)) {
    key = rgbOf(bar.theme);
    keyChosen = true;
  } else if (col.source === 'photo' && col.key && swatches.length) {
    key = (nearestPaletteColor(swatches, rgbOf(col.key))?.rgb as Rgb | undefined) ?? null;
    keyChosen = true;
  } else {
    key = (pickKeyColor(swatches)?.rgb as Rgb | undefined) ?? null;
  }
  return {
    id: col.id,
    name: col.source === 'photo' ? col.name.trim() : (bar?.name ?? '').trim(),
    bar,
    image: col.source === 'photo' ? col.image : (bar?.image ?? null),
    swatches,
    key,
    keyChosen,
    colors: mode,
  };
}

/** 角色的「用角色的顏色」選得了嗎（有部位顏色） */
export const hasPartColors = (bar: Bar | null) =>
  !!bar && realColors(bar.segments.map((s) => ({ color: s.color, none: !!s.none }))).length > 0;

/** 角色有髮色時的名字提示（選單用） */
export const hairHint = (bar: Bar) => realColors(roleColors(bar, 'hair'))[0] ?? null;

/* ---------- 混色帶、綜合色 ---------- */

/**
 * 混色帶（兩色之間的漸層）：有兩欄以上有代表色時，相鄰兩欄的代表色各一條（最多 3 條）；
 * 只有一欄時，用那一欄的色票：最暗＋最亮、第二暗＋第二亮（最多 2 條）。
 */
export function mixPairs(cols: readonly ResolvedColumn[]): [Rgb, Rgb][] {
  const keys = cols.map((c) => c.key).filter((k): k is Rgb => !!k);
  if (keys.length >= 2) {
    const out: [Rgb, Rgb][] = [];
    for (let i = 0; i + 1 < keys.length && out.length < 3; i++) out.push([keys[i], keys[i + 1]]);
    return out;
  }
  const one = cols.find((c) => c.swatches.length >= 2);
  if (!one) return [];
  const sw = one.swatches.map((s) => s.rgb as Rgb);
  const out: [Rgb, Rgb][] = [[sw[0], sw[sw.length - 1]]];
  if (sw.length >= 4) out.push([sw[1], sw[sw.length - 2]]);
  return out;
}

/** 綜合色（兩欄以上有代表色時：代表色的平均） */
export function blendOf(cols: readonly ResolvedColumn[]): Rgb | null {
  const keys = cols.map((c) => c.key).filter((k): k is Rgb => !!k);
  return keys.length >= 2 ? (mixColors(keys) as Rgb) : null;
}

/* ---------- 版面 ---------- */

/** 本站自己的版面數值（1 倍；匯出 PNG 是兩倍） */
export const CARD = {
  pad: 72,
  gap: 40,
  /** 欄寬（依欄數） */
  colW: [640, 520, 440, 380],
  titleH: 110,
  photoR: 24,
  nameH: 64,
  noNameH: 32,
  rowH: 60,
  rowGap: 10,
  rowR: 14,
  mixH: 52,
  mixGap: 10,
  blendH: 80,
  sectionGap: 36,
} as const;

export const ratioValue = (r: CardRatio): number => (r === '4:5' ? 5 / 4 : r === '3:4' ? 4 / 3 : 1);

export interface CardLayout {
  width: number;
  height: number;
  colW: number;
  cols: { x: number; w: number }[];
  title: boolean;
  titleY: number;
  photoY: number;
  photoH: number;
  names: boolean;
  nameY: number;
  rowsY: number;
  rows: number;
  mixY: number;
  mix: [Rgb, Rgb][];
  blendY: number;
  blend: Rgb | null;
  /** GIF 一步一步出現的範圍（色票每一列、每條混色帶、綜合色） */
  steps: { y: number; h: number }[];
}

export function layoutCard(card: CardSettings, cols: readonly ResolvedColumn[]): CardLayout {
  const C = CARD;
  const n = Math.max(1, Math.min(4, cols.length));
  const colW = C.colW[n - 1];
  const width = C.pad * 2 + n * colW + (n - 1) * C.gap;
  const title = !!card.title.trim();
  const names = cols.some((c) => c.name);
  const counts = cols.map((c) => c.swatches.length).filter((k) => k > 0);
  const rows = counts.length ? Math.max(...counts) : card.count;
  const mix = card.showMix ? mixPairs(cols) : [];
  const blend = blendOf(cols);
  let y = C.pad;
  const titleY = y;
  if (title) y += C.titleH;
  const photoY = y;
  const photoH = Math.round(colW * ratioValue(card.ratio));
  y += photoH;
  const nameY = y;
  y += names ? C.nameH : C.noNameH;
  const rowsY = y;
  const steps: { y: number; h: number }[] = [];
  for (let j = 0; j < rows; j++) steps.push({ y: rowsY + j * (C.rowH + C.rowGap), h: C.rowH });
  y += rows * C.rowH + (rows - 1) * C.rowGap;
  const mixY = y + C.sectionGap;
  if (mix.length) {
    mix.forEach((_, p) => {
      steps.push({ y: mixY + p * (C.mixH + C.mixGap), h: C.mixH });
    });
    y = mixY + mix.length * C.mixH + (mix.length - 1) * C.mixGap;
  }
  const blendY = y + (mix.length ? C.mixGap * 2 : C.sectionGap);
  if (blend) {
    steps.push({ y: blendY, h: C.blendH });
    y = blendY + C.blendH;
  }
  const height = Math.round(y + C.pad);
  return {
    width,
    height,
    colW,
    cols: Array.from({ length: n }, (_, i) => ({ x: C.pad + i * (colW + C.gap), w: colW })),
    title,
    titleY,
    photoY,
    photoH,
    names,
    nameY,
    rowsY,
    rows,
    mixY,
    mix,
    blendY,
    blend,
    steps,
  };
}

/* ---------- 色名、複製、檔名 ---------- */

export const hexOf = ([r, g, b]: readonly number[]) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/**
 * 卡片上每一格的色名（同一張卡不重複：由左到右、由上到下依序取最接近、還沒用過的名字；綜合色最後）。
 */
export function cardNames(
  cols: readonly ResolvedColumn[],
  blend: Rgb | null,
): {
  swatch: string[][];
  blend: string;
} {
  const used = new Set<string>();
  const rows = Math.max(0, ...cols.map((c) => c.swatches.length));
  const swatch = cols.map(() => [] as string[]);
  for (let j = 0; j < rows; j++)
    cols.forEach((c, i) => {
      const s = c.swatches[j];
      if (s) swatch[i][j] = colorName(s.color, used);
    });
  return { swatch, blend: blend ? colorName(hexOf(blend), used) : '' };
}

/** 「複製 HEX」的文字：每一欄（名字一行、每色「#HEX 色名」一行、空一行），最後是綜合色 */
export function cardCopyText(
  cols: readonly ResolvedColumn[],
  names: { swatch: string[][]; blend: string },
  blend: Rgb | null,
  blendLabel: string,
): string {
  const out: string[] = [];
  cols.forEach((c, i) => {
    if (!c.swatches.length) return;
    if (c.name) out.push(c.name);
    c.swatches.forEach((s, j) => {
      out.push(`${s.color.toUpperCase()} ${names.swatch[i][j] ?? ''}`.trim());
    });
    out.push('');
  });
  if (blend) out.push(`${blendLabel} ${hexOf(blend)} ${names.blend}`.trim());
  return out.join('\n').trim();
}

/** 檔名（不含副檔名）：標題 → 各欄的名字 → 預設 */
export function cardFileBase(
  card: CardSettings,
  cols: readonly ResolvedColumn[],
  fallback: string,
): string {
  const t = card.title.trim();
  if (t) return t;
  const names = cols.map((c) => c.name).filter(Boolean);
  return names.length ? names.join('-') : fallback;
}
