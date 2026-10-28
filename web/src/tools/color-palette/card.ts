/**
 * 配色卡（規格 1.2）的純邏輯：每一欄的色票與代表色、混色帶、綜合色、版面（本站自己設計的版型：
 * 照片在上、取出的顏色一列一列排在下面，每格是色塊＋色名＋HEX）、複製的文字、檔名。
 */
import { oklabDistance, parseColor, rgbToOklab } from '@/core/color';
import { colorName } from '@/core/colornames';
import {
  mixColors,
  nearestPaletteColor,
  type PaletteColor,
  paletteLuminance,
  pickKeyColor,
} from '@/core/image';
import { realColors, roleColors } from './characters';
import { type Bar, type CardColumn, type CardRatio, type CardSettings, LIMITS } from './logic';

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
  /**
   * 代表色是色票裡的哪一格（-1：不在色票裡）。完全相同、或看起來幾乎一樣（Oklab 距離 0.03 以內，
   * 例如角色的代表色與 k-means 取出的平均色只差一點）的那一格都算。
   */
  keyIndex: number;
  /** 代表色在色票裡（或沒有代表色）；false 時代表色另外標在色票下面 */
  keyInSwatches: boolean;
  /** 角色的立繪讀不到，改用角色的顏色 */
  imageMissing: boolean;
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
 * 角色的立繪讀不到（imageMissing）時改用角色的顏色。
 * 代表色：角色＝角色的代表色（沒有時自動選）；照片＝欄的代表色（換成色票裡最接近的那個；沒有時自動選）。
 */
export function resolveColumn(
  col: CardColumn,
  bars: readonly Bar[],
  auto: PaletteColor[] | null,
  imageMissing = false,
): ResolvedColumn {
  const bar =
    col.source === 'character' ? (bars.find((b) => b.id === col.characterId) ?? null) : null;
  const missing = !!bar?.image && imageMissing;
  const mode = missing ? 'parts' : columnColorsMode(col, bar);
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
  const keyIndex = key ? keySwatchIndex(swatches, key) : -1;
  return {
    id: col.id,
    name: col.source === 'photo' ? col.name.trim() : (bar?.name ?? '').trim(),
    bar,
    image: col.source === 'photo' ? col.image : (bar?.image ?? null),
    swatches,
    key,
    keyChosen,
    colors: mode,
    keyIndex,
    keyInSwatches: !key || keyIndex >= 0,
    imageMissing: missing,
  };
}

/** 看起來和代表色一樣的距離上限（Oklab） */
const SAME_KEY = 0.03;

/** 代表色是色票裡的哪一格：完全相同的優先，否則最接近、而且距離在 SAME_KEY 以內的；都沒有時 -1 */
export function keySwatchIndex(swatches: readonly PaletteColor[], key: Rgb): number {
  const exact = swatches.findIndex((s) => hexOf(s.rgb) === hexOf(key));
  if (exact >= 0) return exact;
  const k = rgbToOklab({ r: key[0], g: key[1], b: key[2], a: 1 });
  let best = -1;
  let bestD = SAME_KEY;
  swatches.forEach((s, i) => {
    const d = oklabDistance(k, rgbToOklab({ r: s.rgb[0], g: s.rgb[1], b: s.rgb[2], a: 1 }));
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** 角色的「用角色的顏色」選得了嗎（有部位顏色） */
export const hasPartColors = (bar: Bar | null) =>
  !!bar && realColors(bar.segments.map((s) => ({ color: s.color, none: !!s.none }))).length > 0;

/** 角色有髮色時的名字提示（選單用） */
export const hairHint = (bar: Bar) => realColors(roleColors(bar, 'hair'))[0] ?? null;

/* ---------- 混色帶、綜合色 ---------- */

/**
 * 混色帶（兩色之間的漸層）：兩欄以上有代表色時，相鄰兩欄的代表色各一條（最多 3 條）；
 * 只有一欄有代表色時，從代表色各拉一條到那一欄最暗、最亮的顏色（代表色本身就是最暗或最亮時跳過那一條）。
 * 都沒有代表色時沒有混色帶。
 */
export function mixPairs(cols: readonly ResolvedColumn[]): [Rgb, Rgb][] {
  const withKey = cols.filter((c): c is ResolvedColumn & { key: Rgb } => !!c.key);
  if (withKey.length >= 2) {
    return withKey
      .slice(0, 4)
      .slice(1)
      .map((c, i): [Rgb, Rgb] => [withKey[i].key, c.key]);
  }
  const one = withKey[0];
  if (!one) return [];
  const byLight = one.swatches
    .map((s) => s.rgb as Rgb)
    .sort((a, b) => paletteLuminance(a) - paletteLuminance(b));
  if (byLight.length < 2) return [];
  const keyHex = hexOf(one.key);
  const out: [Rgb, Rgb][] = [];
  for (const end of [byLight[0], byLight[byLight.length - 1]])
    if (hexOf(end) !== keyHex) out.push([one.key, end]);
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
  /** 卡片離圖邊、卡片的圓角、內容離卡片邊 */
  margin: 20,
  radius: 28,
  pad: 48,
  /** 欄間、欄寬（依欄數） */
  gap: 36,
  colW: [600, 500, 420, 360],
  titleH: 64,
  titleGap: 28,
  photoR: 22,
  nameH: 48,
  noNameH: 20,
  /** 一格色票：色塊見方＝列高 */
  rowH: 56,
  rowGap: 12,
  /** 代表色不在色票裡時，色票下面多一列標出代表色 */
  keyH: 44,
  mixH: 44,
  mixGap: 12,
  blendH: 72,
  sectionGap: 32,
} as const;

export const ratioValue = (r: CardRatio): number => (r === '4:5' ? 5 / 4 : r === '3:4' ? 4 / 3 : 1);

type BlockId = 'title' | 'photo' | 'name' | 'rows' | 'key' | 'mix' | 'blend';

export interface CardLayout {
  width: number;
  height: number;
  /** 內容的左右邊界 */
  left: number;
  right: number;
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
  /** 標出代表色的那一列（沒有時 null） */
  keyY: number | null;
  mixY: number;
  mix: [Rgb, Rgb][];
  blendY: number;
  blend: Rgb | null;
  /** GIF 一步一步出現的範圍（色票每一列、代表色那一列、每條混色帶、綜合色） */
  steps: { y: number; h: number }[];
}

/**
 * 版面：由上往下疊幾個區塊（標題、照片、名字、色票、代表色、混色帶、綜合色），
 * 每個區塊記下自己的高度與前面的空隙，再一次算出位置。
 */
export function layoutCard(card: CardSettings, cols: readonly ResolvedColumn[]): CardLayout {
  const C = CARD;
  const n = Math.max(1, Math.min(C.colW.length, cols.length));
  const colW = C.colW[n - 1];
  const left = C.margin + C.pad;
  const width = left * 2 + n * colW + (n - 1) * C.gap;
  const title = !!card.title.trim();
  const names = cols.some((c) => c.name);
  const rows = Math.max(0, ...cols.map((c) => c.swatches.length)) || card.count;
  const keyRow = cols.some((c) => !c.keyInSwatches);
  const mix = card.showMix ? mixPairs(cols) : [];
  const blend = blendOf(cols);
  const photoH = Math.round(colW * ratioValue(card.ratio));
  const mixH = mix.length ? mix.length * C.mixH + (mix.length - 1) * C.mixGap : 0;
  const plan: { id: BlockId; h: number; before: number }[] = [
    ...(title ? [{ id: 'title' as const, h: C.titleH, before: 0 }] : []),
    { id: 'photo', h: photoH, before: title ? C.titleGap : 0 },
    { id: 'name', h: names ? C.nameH : C.noNameH, before: 0 },
    { id: 'rows', h: rows * C.rowH + (rows - 1) * C.rowGap, before: 0 },
    ...(keyRow ? [{ id: 'key' as const, h: C.keyH, before: C.rowGap }] : []),
    ...(mix.length ? [{ id: 'mix' as const, h: mixH, before: C.sectionGap }] : []),
    ...(blend ? [{ id: 'blend' as const, h: C.blendH, before: C.sectionGap }] : []),
  ];
  const at = new Map<BlockId, number>();
  let y = C.margin + C.pad;
  for (const b of plan) {
    y += b.before;
    at.set(b.id, y);
    y += b.h;
  }
  const rowsY = at.get('rows') ?? 0;
  const keyY = at.get('key') ?? null;
  const mixY = at.get('mix') ?? y;
  const blendY = at.get('blend') ?? y;
  const steps = [
    ...Array.from({ length: rows }, (_, j) => ({ y: rowsY + j * (C.rowH + C.rowGap), h: C.rowH })),
    ...(keyY != null ? [{ y: keyY, h: C.keyH }] : []),
    ...mix.map((_, k) => ({ y: mixY + k * (C.mixH + C.mixGap), h: C.mixH })),
    ...(blend ? [{ y: blendY, h: C.blendH }] : []),
  ];
  return {
    width,
    height: Math.round(y + C.pad + C.margin),
    left,
    right: width - left,
    colW,
    cols: Array.from({ length: n }, (_, i) => ({ x: left + i * (colW + C.gap), w: colW })),
    title,
    titleY: at.get('title') ?? 0,
    photoY: at.get('photo') ?? 0,
    photoH,
    names,
    nameY: at.get('name') ?? 0,
    rowsY,
    rows,
    keyY,
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

/** 檔名去掉副檔名（照片名字的預設值；最多 20 字） */
export const fileStem = (name: string): string =>
  name.replace(/\.[^.]+$/, '').slice(0, LIMITS.cardName);

/**
 * 換一張照片／把照片放進一欄：名字是空的或還是上一張的檔名（沒改過）時，換成這一張的檔名。
 */
export function photoPatch(
  col: Pick<CardColumn, 'name' | 'autoName'> | null,
  image: { id: string; width: number; height: number },
  fileName: string,
): Partial<CardColumn> {
  const keepName = !!col && !!col.name.trim() && !col.autoName;
  return {
    source: 'photo',
    image,
    placement: { zoom: 1, x: 0, y: 0, turns: 0 },
    key: null,
    ...(keepName ? {} : { name: fileStem(fileName), autoName: true }),
  };
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
