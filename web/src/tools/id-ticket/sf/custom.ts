/**
 * SF 證件的自組底版（規格 F96～F100；原作的 CONSTRUCTOR）：借一個內建底版的外形（外框、內緣、打穿的洞、原生大小），
 * 上面放自己排的項目——照片（一定有一個）、文字（標題＋值；種類：文字／編號〔有「重新產生」，條碼編第一個編號〕／日期〔照日期格式印〕）、
 * 條碼、晶片、帶子（缺角或平的）、線、警示斜紋、斜線。項目的座標是底版的原生像素（由下往上排）。
 * 文字項目就是「內容」分頁的欄位（值存在 SF 證件的欄位裡、代號＝項目的 id）。
 * 做法與數值照 CyberDelaai/sinforge-ui（MIT，`67d459a`）的 js/custom.js 改寫；項目、標題的範例本站寫。
 */
import type { FieldDef } from '../templates';
import { SF_BLANK_IDS, type SfBlankDef, type SfBlankId, type SfDecor, sfBlank } from './defs';
import type { PortraitSpec } from './frames';

export const CUSTOM_ITEM_TYPES = [
  'photo',
  'text',
  'code',
  'chip',
  'band',
  'rule',
  'stripes',
  'slashes',
] as const;
export type CustomItemType = (typeof CUSTOM_ITEM_TYPES)[number];
/** 可以加的（照片一定有一個、不能加也不能刪） */
export const CUSTOM_ADDABLE: readonly CustomItemType[] = CUSTOM_ITEM_TYPES.filter(
  (t) => t !== 'photo',
);

export type CustomColor = 'ink' | 'accent' | 'card';
export type CustomKind = 'text' | 'serial' | 'date';
export type CustomAlign = 'left' | 'center' | 'right';

export interface CustomItem {
  id: string;
  type: CustomItemType;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 文字：印在值上面的標題（空白＝不印） */
  cap: string;
  kind: CustomKind;
  weight: 700 | 400;
  color: CustomColor;
  align: CustomAlign;
  /** 帶子：缺角或平的 */
  shape: 'notch' | 'rect';
  /** 警示斜紋：往另一邊斜 */
  flip: boolean;
}

export interface CustomBlank {
  id: string;
  name: string;
  base: SfBlankId;
  /** 由下往上 */
  items: CustomItem[];
}

export const CUSTOM_MAX = 20;
export const CUSTOM_ITEM_MAX = 40;
export const CUSTOM_NAME_MAX = 24;
export const CUSTOM_CAP_MAX = 32;
export const CUSTOM_VALUE_MAX = 48;
/** 最小的邊（原生像素；線可以到 2） */
export const CUSTOM_MIN = 6;
/** 拖曳與縮放的吸附（原生像素） */
export const CUSTOM_GRID = 10;

/** 各種項目的預設大小（卡片短邊的比例；'W' 開頭＝卡片寬的比例）與控制的裝飾開關 */
const TYPES: Record<CustomItemType, { size: [number | string, number]; decor?: SfDecor }> = {
  photo: { size: [0.4, 0.55] },
  text: { size: [0.5, 0.07] },
  code: { size: [0.38, 0.1], decor: 'barcode' },
  chip: { size: [0.16, 0.16], decor: 'chip' },
  band: { size: ['W0.8', 0.06] },
  rule: { size: [0.6, 0.005] },
  stripes: { size: [0.03, 0.4], decor: 'stripes' },
  slashes: { size: [0.3, 0.035], decor: 'slashes' },
};

export const decorOf = (t: CustomItemType): SfDecor | undefined => TYPES[t].decor;

let seq = 0;
export const customUid = (p: string): string =>
  `${p}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** 一個新的項目（放在卡片中央） */
export function newCustomItem(type: CustomItemType, base: SfBlankId): CustomItem {
  const B = sfBlank(base);
  const s = Math.min(B.w, B.h);
  const dim = (v: number | string, full: number) =>
    typeof v === 'string' ? Number(v.slice(1)) * full : v * s;
  const w = Math.round(dim(TYPES[type].size[0], B.w));
  const h = Math.max(type === 'rule' ? 4 : CUSTOM_MIN, Math.round(dim(TYPES[type].size[1], B.h)));
  return {
    id: customUid('i'),
    type,
    x: Math.round((B.w - w) / 2),
    y: Math.round((B.h - h) / 2),
    w,
    h,
    cap: '',
    kind: 'text',
    weight: 700,
    color: 'ink',
    align: 'left',
    shape: 'notch',
    flip: false,
  };
}

/** 內建底版的照片格（預設的裝飾開關時；sf/draw.ts 的 sfPortrait） */
const BASE_PHOTO: Record<SfBlankId, { x: number; y: number; w: number; h: number }> = {
  event: { x: 250, y: 250, w: 600, h: 840 },
  citizen: { x: 157, y: 220, w: 413, h: 530 },
  license: { x: 157, y: 230, w: 380, h: 490 },
  operator: { x: 100, y: 176, w: 420, h: 564 },
  pass: { x: 100, y: 210, w: 380, h: 480 },
};

/**
 * 新的底版：這個外形的照片格，旁邊（橫式）或下面（直式）一行名字、再下面一行編號（同原作）。
 * 回傳底版與兩行的值（名字、編號）。
 */
export function newCustomBlank(base: SfBlankId, name: string): CustomBlank {
  const B = sfBlank(base);
  const P = BASE_PHOTO[base];
  const s = Math.min(B.w, B.h);
  const photo = { ...newCustomItem('photo', base), ...P };
  const lh = Math.round(s * 0.09);
  const land = B.w > B.h;
  const x = land ? P.x + P.w + 60 : P.x;
  const y = land ? P.y : P.y + P.h + 60;
  const w = land ? B.w - x - P.x : P.w;
  const nameIt = { ...newCustomItem('text', base), x, y, w, h: lh, cap: 'NAME' };
  const noIt: CustomItem = {
    ...newCustomItem('text', base),
    x,
    y: y + lh + 50,
    w: Math.round(w * 0.7),
    h: Math.round(lh * 0.75),
    cap: 'ID NO.',
    kind: 'serial',
  };
  return { id: customUid('c'), name, base, items: [photo, nameIt, noIt] };
}

/** 項目留在卡片上（換底版時可能變小）；晶片是正方形 */
export function fitItem(it: CustomItem, base: SfBlankId): CustomItem {
  const B = sfBlank(base);
  const min = it.type === 'rule' ? 2 : CUSTOM_MIN;
  let w = Math.round(Math.min(B.w, Math.max(min, it.w)));
  let h = Math.round(Math.min(B.h, Math.max(min, it.h)));
  if (it.type === 'chip') w = h = Math.min(w, h);
  return {
    ...it,
    w,
    h,
    x: Math.round(Math.min(B.w - w, Math.max(0, it.x))),
    y: Math.round(Math.min(B.h - h, Math.max(0, it.y))),
  };
}

/** 換底版：項目跟著新的大小縮放（同原作） */
export function rebaseCustom(def: CustomBlank, base: SfBlankId): CustomBlank {
  if (def.base === base) return def;
  const A = sfBlank(def.base);
  const B = sfBlank(base);
  const fx = B.w / A.w;
  const fy = B.h / A.h;
  return {
    ...def,
    base,
    items: def.items.map((it) => {
      if (it.type === 'chip') {
        /* 晶片是正方形：邊長照短邊的比例、中心照寬高的比例（來回換不會越縮越小；2026-11-05 驗證後） */
        const side = it.w * (Math.min(B.w, B.h) / Math.min(A.w, A.h));
        const cx = (it.x + it.w / 2) * fx;
        const cy = (it.y + it.h / 2) * fy;
        return fitItem({ ...it, x: cx - side / 2, y: cy - side / 2, w: side, h: side }, base);
      }
      const n = { ...it, x: it.x * fx, w: it.w * fx, y: it.y * fy, h: it.h * fy };
      if (it.type === 'rule' || it.type === 'stripes') {
        n.w = Math.max(n.w, 2);
        n.h = Math.max(n.h, 2);
      }
      return fitItem(n, base);
    }),
  };
}

/* ---------- 讀檔整理 ---------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const pick = <T extends string | number>(v: unknown, list: readonly T[], d: T): T =>
  list.includes(v as T) ? (v as T) : d;

const oneLine = (v: unknown, max: number) =>
  [...String(v ?? '').replace(/\s*[\r\n]+\s*/g, ' ')].slice(0, max).join('');

/** 存檔裡的底版（不能用時 null）：認得的外形與種類、數字在卡片上、選項照允許的、照片剛好一個 */
export function normalizeCustom(raw: unknown, seenItems: Set<string>): CustomBlank | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || !raw.id) return null;
  if (!(SF_BLANK_IDS as readonly string[]).includes(raw.base as string)) return null;
  const base = raw.base as SfBlankId;
  const items: CustomItem[] = [];
  let photo = false;
  for (const it of Array.isArray(raw.items) ? raw.items : []) {
    if (items.length >= CUSTOM_ITEM_MAX) break;
    if (!isObj(it) || !(CUSTOM_ITEM_TYPES as readonly string[]).includes(it.type as string))
      continue;
    const type = it.type as CustomItemType;
    if (type === 'photo' && photo) continue;
    const d = newCustomItem(type, base);
    let id = typeof it.id === 'string' && it.id ? it.id.slice(0, 40) : d.id;
    if (seenItems.has(id)) id = d.id;
    seenItems.add(id);
    const num = (v: unknown, f: number) => (typeof v === 'number' && Number.isFinite(v) ? v : f);
    items.push(
      fitItem(
        {
          id,
          type,
          x: num(it.x, d.x),
          y: num(it.y, d.y),
          w: num(it.w, d.w),
          h: num(it.h, d.h),
          cap: typeof it.cap === 'string' ? oneLine(it.cap, CUSTOM_CAP_MAX) : '',
          kind: pick(it.kind, ['text', 'serial', 'date'] as const, 'text'),
          weight: pick(it.weight, [700, 400] as const, 700),
          color: pick(it.color, ['ink', 'accent', 'card'] as const, 'ink'),
          align: pick(it.align, ['left', 'center', 'right'] as const, 'left'),
          shape: pick(it.shape, ['notch', 'rect'] as const, 'notch'),
          flip: it.flip === true,
        },
        base,
      ),
    );
    if (type === 'photo') photo = true;
  }
  if (!photo) items.unshift({ ...newCustomItem('photo', base), ...BASE_PHOTO[base] });
  return {
    id: raw.id.slice(0, 40),
    name: oneLine(raw.name, CUSTOM_NAME_MAX).trim() || 'CUSTOM',
    base,
    items,
  };
}

/* ---------- 底版的定義（欄位、裝飾開關、照片格） ---------- */

export const customKey = (id: string): string => `custom:${id}`;

const textItems = (def: CustomBlank) => def.items.filter((it) => it.type === 'text');

/** 條碼編的欄位：第一個「編號」的文字項目（沒有時第一個文字項目） */
export function customCodeKey(def: CustomBlank): string {
  const t = textItems(def);
  return (t.find((it) => it.kind === 'serial') ?? t[0])?.id ?? '';
}

/** 文字項目的欄位名稱（標題；沒有時「文字 n」） */
export const customFieldLabel = (def: CustomBlank, it: CustomItem): string =>
  it.cap.trim() || `文字 ${textItems(def).indexOf(it) + 1}`;

/** 文字項目＝「內容」分頁的欄位（編號有「重新產生」、日期有「重新產生」與 YYYY-MM-DD 的灰字） */
export function customFields(def: CustomBlank): FieldDef[] {
  return textItems(def).map((it) => ({
    key: it.id,
    label: customFieldLabel(def, it),
    max: CUSTOM_VALUE_MAX,
    ...(it.kind === 'serial' ? { gen: 'serial' } : {}),
    ...(it.kind === 'date'
      ? { genDate: [2088, 2099] as [number, number], placeholder: 'YYYY-MM-DD' }
      : {}),
  })) as FieldDef[];
}

/** 這個底版的裝飾開關：外框線＋有的項目的開關 */
export function customDecor(def: CustomBlank): SfDecor[] {
  const d: SfDecor[] = ['edge'];
  for (const it of def.items) {
    const k = decorOf(it.type);
    if (k && !d.includes(k)) d.push(k);
  }
  return d;
}

/** 照片格（切角＝短邊 × 0.14、線寬 14，同原作） */
export function customPortrait(def: CustomBlank): PortraitSpec {
  const p = def.items.find((it) => it.type === 'photo') ?? {
    ...BASE_PHOTO[def.base],
  };
  return {
    box: { x: p.x, y: p.y, w: p.w, h: p.h },
    cut: Math.round(Math.min(p.w, p.h) * 0.14),
    line: 14,
  };
}

/** 範本清單、欄位用的定義（外形、大小照底版） */
export function customBlankDef(def: CustomBlank): SfBlankDef {
  const B = sfBlank(def.base);
  return {
    ...B,
    name: def.name,
    description: `自組底版（外形：${B.name}）`,
    fields: customFields(def),
    codeKey: customCodeKey(def),
    captions: [],
    decor: customDecor(def),
    letter: (def.name.trim()[0] ?? 'C').toUpperCase(),
  };
}

/** 文字項目的範例值（新加的項目、填入範例） */
export const CUSTOM_SAMPLE: Record<CustomKind, string> = {
  text: 'TEXT',
  serial: 'MP-2087-0413',
  date: '2093-12-31',
};
