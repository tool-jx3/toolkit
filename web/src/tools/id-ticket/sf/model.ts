/**
 * SF 證件的資料：範本、欄位（5 款共用）、卡上的欄位名稱、樣式（5 款共用，同原作）、照片、浮水印、裝飾圖（每一款各自）、
 * 執照（實心的、改過的名稱與圖示）。讀檔整理與預設值。規格：docs/refactor/specs/id-ticket.md 1.11～1.14、3.8。
 */
import type { AssetImageRef } from '@/core/assets';
import { normalizePlacement } from '@/core/image';
import { generateCode, generateDate, normalizeHexColor, oneLine, type Photo } from '../model';
import { normalizePhotoFx, PHOTO_FX_DEFAULT, type PhotoFx } from '../photofx';
import { type FieldDef, fieldMax } from '../templates';
import { isSfChipType, type SfChipType } from './chips';
import { isSfCodeType, type SfCodeType } from './codes';
import {
  CUSTOM_MAX,
  CUSTOM_VALUE_MAX,
  type CustomBlank,
  customBlankDef,
  customKey,
  normalizeCustom,
} from './custom';
import { isSfDateFormat, type SfDateFormat } from './dates';
import {
  SF_BLANK_IDS,
  SF_BLANKS,
  SF_CAPTIONS,
  SF_DEFAULTS,
  SF_LICENSES_DEFAULT,
  SF_SCHEMES,
  SF_SERIALS,
  SF_SPECIES,
  type SfBlankDef,
  type SfBlankId,
  sfBlank,
  sfCaptionMax,
} from './defs';
import { SF_FRAME_IDS, type SfFrameId } from './frames';
import { FX_AMOUNT_RANGE, SF_FX_DEFAULT } from './fx';
import { LICENSE_CAP_MAX, LICENSE_KEYS } from './licenses';

export type { SfCodeType } from './codes';

export interface SfStyle {
  card: string;
  ink: string;
  accent: string;
  frame: SfFrameId;
  /**
   * 條碼的種類：Code 128 條碼（'barcode'）、QR code，或看起來像的 EAN-13、四態郵政、堆疊、點碼（2026-11-05；
   * 2D 的〔QR code、點碼〕放在方形的位置）
   */
  code: SfCodeType;
  /** 晶片的種類（2026-11-05；以前只有 ISO 接觸式） */
  chipType: SfChipType;
  /** 卡上日期的格式（2026-11-05；預設照打的 YYYY-MM-DD） */
  dateFmt: SfDateFormat;
  /** 卡片效果（2026-11-05）：光暈、顆粒、掃描線與強度（5～100%） */
  glow: boolean;
  glowAmt: number;
  grain: boolean;
  grainAmt: number;
  scan: boolean;
  scanAmt: number;
  /** 數位證件的場景（2026-11-05；開著時匯出整個場景） */
  digital: boolean;
  /** 數位證件的背景（null＝夜色） */
  digitalBg: string | null;
  stripes: boolean;
  slashes: boolean;
  /** 條碼（或 QR code）要不要畫 */
  barcode: boolean;
  edge: boolean;
  chip: boolean;
  dna: boolean;
  /** DNA 條畫成字母（否則雙螺旋） */
  dnaText: boolean;
  mrz: boolean;
  photoFx: PhotoFx;
  /** 照片蓋過裝飾圖（裝飾圖不畫進照片格） */
  photoOverElements: boolean;
}

export type WatermarkMode = 'off' | 'text' | 'image';
export type WatermarkTone = 'ink' | 'accent' | 'custom';

export interface SfWatermark {
  mode: WatermarkMode;
  text: string;
  image: AssetImageRef | null;
  /** 濃度（%） */
  amount: number;
  /** 大小（%） */
  scale: number;
  /** 角度（度，−180～180） */
  rotate: number;
  /** 密度：重複的字或圖彼此靠近多少（%；負的＝拉開） */
  overlap: number;
  /** 每一列相對上一列往旁邊錯開（一格的 %，50＝磚牆） */
  shift: number;
  /** 位移（卡片寬高的比例） */
  x: number;
  y: number;
  tone: WatermarkTone;
  color: string;
  /** 圖片：染成同一個顏色 */
  tint: boolean;
  /** 圖片：重複鋪滿（否則置中一張） */
  tile: boolean;
  /** 圖片：智慧混合（淺色的卡用色彩增值、深色的卡用濾色） */
  smart: boolean;
  /** 圖片：反轉顏色（沒有染色時） */
  invert: boolean;
}

/** 裁切範圍（原圖的比例；可以超出原圖，超出的地方透明） */
export interface CropFrac {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const WHOLE: CropFrac = { x: 0, y: 0, w: 1, h: 1 };

export interface SfElement {
  id: string;
  image: AssetImageRef;
  /** 中心（卡片寬高的比例） */
  x: number;
  y: number;
  /** 放進邊長＝卡片短邊 × size 的方形 */
  size: number;
  /** 不透明度（%） */
  alpha: number;
  /** 單色印（墨色） */
  tint: boolean;
  /** 單色印的門檻（0～100） */
  thr: number;
  crop: CropFrac;
}

export interface SfLicenseIcon {
  image: AssetImageRef;
  crop: CropFrac;
}

export interface SfState {
  /** 範本（自組底版開著時是它借的外形） */
  blank: SfBlankId;
  /** 自組底版（2026-11-05；開著時是它的 id，否則 null） */
  custom: string | null;
  /** 自己組的底版（2026-11-05） */
  customs: CustomBlank[];
  values: Record<string, string>;
  /** 卡上的欄位名稱（改過的才有） */
  captions: Record<string, string>;
  style: SfStyle;
  photo: Photo | null;
  watermark: SfWatermark;
  /** 每一款的裝飾圖（內建的範本代號；自組底版是 `custom:<id>`） */
  elements: Record<string, SfElement[]>;
  /** 實心（有執照）的 */
  licenses: string[];
  licenseCaps: Record<string, string>;
  licenseIcons: Record<string, SfLicenseIcon>;
}

export const SF_ZOOM_MAX = 5;
export const SF_ELEMENT_MAX = 16;
export const ELEMENT_SIZE_RANGE = { min: 0.05, max: 1.5 } as const;
export const WM_RANGES = {
  amount: { min: 0, max: 100 },
  scale: { min: 25, max: 1000 },
  rotate: { min: -180, max: 180 },
  overlap: { min: -100, max: 75 },
  shift: { min: 0, max: 100 },
} as const;
export const WM_TEXT_MAX = 40;

export const defaultSfStyle = (): SfStyle => ({
  card: SF_SCHEMES[0].card,
  ink: SF_SCHEMES[0].ink,
  accent: SF_SCHEMES[0].accent,
  frame: 'notch',
  code: 'barcode',
  chipType: 'contact',
  dateFmt: 'iso',
  ...SF_FX_DEFAULT,
  digital: false,
  digitalBg: null,
  stripes: true,
  slashes: true,
  barcode: true,
  edge: true,
  chip: true,
  dna: true,
  dnaText: false,
  mrz: true,
  photoFx: { ...PHOTO_FX_DEFAULT },
  photoOverElements: false,
});

export const defaultWatermark = (): SfWatermark => ({
  mode: 'off',
  text: 'MISTPORT // RESTRICTED',
  image: null,
  amount: 15,
  scale: 100,
  rotate: -30,
  overlap: 0,
  shift: 50,
  x: 0,
  y: 0,
  tone: 'ink',
  color: '#7a7a88',
  tint: true,
  tile: true,
  smart: true,
  invert: false,
});

const emptyElements = (): Record<SfBlankId, SfElement[]> =>
  Object.fromEntries(SF_BLANK_IDS.map((id) => [id, []])) as unknown as Record<
    SfBlankId,
    SfElement[]
  >;

export function sfValueDefaults(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const b of SF_BLANKS) for (const f of b.fields) out[f.key] = SF_DEFAULTS[f.key] ?? '';
  return out;
}

export const initialSf = (): SfState => ({
  blank: 'citizen',
  custom: null,
  customs: [],
  values: sfValueDefaults(),
  captions: {},
  style: defaultSfStyle(),
  photo: null,
  watermark: defaultWatermark(),
  elements: emptyElements(),
  licenses: [...SF_LICENSES_DEFAULT],
  licenseCaps: {},
  licenseIcons: {},
});

/* ---------- 產生 ---------- */

/** 「重新產生」：編號（5 種格式隨機挑一種）、種別、日期 */
export function sfGenerate(f: FieldDef, rand: () => number = Math.random): string | null {
  if (f.genDate) return generateDate(f.genDate, rand);
  if (f.gen === 'serial')
    return generateCode(
      SF_SERIALS[Math.min(SF_SERIALS.length - 1, Math.floor(rand() * SF_SERIALS.length))],
      rand,
    );
  if (f.gen === 'species')
    return SF_SPECIES[Math.min(SF_SPECIES.length - 1, Math.floor(rand() * SF_SPECIES.length))];
  if (f.gen) return generateCode(f.gen, rand);
  return null;
}

/* ---------- 讀檔整理 ---------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const num = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

export function normalizeImageRef(v: unknown): AssetImageRef | null {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id) return null;
  const w = num(v.width, 0, 0, 100_000);
  const h = num(v.height, 0, 0, 100_000);
  if (!(w > 0 && h > 0)) return null;
  return { id: v.id, name: typeof v.name === 'string' ? v.name : '', width: w, height: h };
}

export function normalizeCrop(v: unknown): CropFrac {
  if (!isObj(v)) return { ...WHOLE };
  const w = num(v.w, 1, 0.001, 4);
  const h = num(v.h, 1, 0.001, 4);
  return { x: num(v.x, 0, -2, 2), y: num(v.y, 0, -2, 2), w, h };
}

function normalizeStyle(raw: unknown): SfStyle {
  const d = defaultSfStyle();
  if (!isObj(raw)) return d;
  return {
    card: normalizeHexColor(raw.card, d.card),
    ink: normalizeHexColor(raw.ink, d.ink),
    accent: normalizeHexColor(raw.accent, d.accent),
    frame: (SF_FRAME_IDS as readonly string[]).includes(raw.frame as string)
      ? (raw.frame as SfFrameId)
      : d.frame,
    code: isSfCodeType(raw.code) ? raw.code : d.code,
    chipType: isSfChipType(raw.chipType) ? raw.chipType : d.chipType,
    dateFmt: isSfDateFormat(raw.dateFmt) ? raw.dateFmt : d.dateFmt,
    glow: bool(raw.glow, d.glow),
    glowAmt: Math.round(num(raw.glowAmt, d.glowAmt, FX_AMOUNT_RANGE.min, FX_AMOUNT_RANGE.max)),
    grain: bool(raw.grain, d.grain),
    grainAmt: Math.round(num(raw.grainAmt, d.grainAmt, FX_AMOUNT_RANGE.min, FX_AMOUNT_RANGE.max)),
    scan: bool(raw.scan, d.scan),
    scanAmt: Math.round(num(raw.scanAmt, d.scanAmt, FX_AMOUNT_RANGE.min, FX_AMOUNT_RANGE.max)),
    digital: bool(raw.digital, d.digital),
    digitalBg:
      raw.digitalBg === null || raw.digitalBg === undefined
        ? null
        : normalizeHexColor(raw.digitalBg, '') || null,
    stripes: bool(raw.stripes, d.stripes),
    slashes: bool(raw.slashes, d.slashes),
    barcode: bool(raw.barcode, d.barcode),
    edge: bool(raw.edge, d.edge),
    chip: bool(raw.chip, d.chip),
    dna: bool(raw.dna, d.dna),
    dnaText: bool(raw.dnaText, d.dnaText),
    mrz: bool(raw.mrz, d.mrz),
    photoFx: normalizePhotoFx(raw.photoFx),
    photoOverElements: bool(raw.photoOverElements, d.photoOverElements),
  };
}

export function normalizeWatermark(raw: unknown, d: SfWatermark = defaultWatermark()): SfWatermark {
  if (!isObj(raw)) return d;
  const r = WM_RANGES;
  return {
    mode: raw.mode === 'text' || raw.mode === 'image' ? raw.mode : 'off',
    text: typeof raw.text === 'string' ? oneLine(raw.text, WM_TEXT_MAX) : d.text,
    image: normalizeImageRef(raw.image),
    amount: Math.round(num(raw.amount, d.amount, r.amount.min, r.amount.max)),
    scale: Math.round(num(raw.scale, d.scale, r.scale.min, r.scale.max)),
    rotate: Math.round(num(raw.rotate, d.rotate, r.rotate.min, r.rotate.max)),
    overlap: Math.round(num(raw.overlap, d.overlap, r.overlap.min, r.overlap.max)),
    shift: Math.round(num(raw.shift, d.shift, r.shift.min, r.shift.max)),
    x: num(raw.x, 0, -0.5, 0.5),
    y: num(raw.y, 0, -0.5, 0.5),
    tone: raw.tone === 'accent' || raw.tone === 'custom' ? raw.tone : 'ink',
    color: normalizeHexColor(raw.color, d.color),
    tint: bool(raw.tint, d.tint),
    tile: bool(raw.tile, d.tile),
    smart: bool(raw.smart, d.smart),
    invert: bool(raw.invert, d.invert),
  };
}

let elSeq = 0;
export const newElementId = (): string =>
  `e${Date.now().toString(36)}${(elSeq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function normalizeElement(raw: unknown, seen: Set<string>): SfElement | null {
  if (!isObj(raw)) return null;
  const image = normalizeImageRef(raw.image);
  if (!image) return null;
  let id = typeof raw.id === 'string' && raw.id ? raw.id : newElementId();
  if (seen.has(id)) id = newElementId();
  seen.add(id);
  return {
    id,
    image,
    x: num(raw.x, 0.5, -0.5, 1.5),
    y: num(raw.y, 0.5, -0.5, 1.5),
    size: num(raw.size, 0.3, ELEMENT_SIZE_RANGE.min, ELEMENT_SIZE_RANGE.max),
    alpha: Math.round(num(raw.alpha, 100, 0, 100)),
    tint: bool(raw.tint, true),
    thr: Math.round(num(raw.thr, 0, 0, 100)),
    crop: normalizeCrop(raw.crop),
  };
}

export function normalizeSfValues(raw: unknown): Record<string, string> {
  const src = isObj(raw) ? raw : {};
  const out: Record<string, string> = {};
  for (const b of SF_BLANKS)
    for (const f of b.fields) {
      if (f.key in out) continue;
      const v = src[f.key];
      out[f.key] = typeof v === 'string' ? oneLine(v, fieldMax(f)) : (SF_DEFAULTS[f.key] ?? '');
    }
  return out;
}

export function normalizeSf(raw: unknown): SfState {
  const d = initialSf();
  if (!isObj(raw)) return d;
  const capsSrc = isObj(raw.captions) ? raw.captions : {};
  const captions: Record<string, string> = {};
  for (const k of Object.keys(SF_CAPTIONS))
    if (typeof capsSrc[k] === 'string')
      captions[k] = oneLine(capsSrc[k] as string, sfCaptionMax(k));
  const seenItems = new Set<string>();
  const customs: CustomBlank[] = [];
  for (const c of Array.isArray(raw.customs) ? raw.customs : []) {
    if (customs.length >= CUSTOM_MAX) break;
    const def = normalizeCustom(c, seenItems);
    if (def && !customs.some((x) => x.id === def.id)) customs.push(def);
  }
  const custom =
    typeof raw.custom === 'string' ? (customs.find((c) => c.id === raw.custom) ?? null) : null;
  const elSrc = isObj(raw.elements) ? raw.elements : {};
  const elements: Record<string, SfElement[]> = emptyElements();
  const seen = new Set<string>();
  for (const id of [...SF_BLANK_IDS, ...customs.map((c) => customKey(c.id))]) {
    const list = Array.isArray(elSrc[id]) ? (elSrc[id] as unknown[]) : [];
    elements[id] = list
      .slice(0, SF_ELEMENT_MAX)
      .map((e) => normalizeElement(e, seen))
      .filter((e): e is SfElement => !!e);
  }
  const licenses = Array.isArray(raw.licenses)
    ? LICENSE_KEYS.filter((k) => (raw.licenses as unknown[]).includes(k))
    : d.licenses;
  const lcSrc = isObj(raw.licenseCaps) ? raw.licenseCaps : {};
  const licenseCaps: Record<string, string> = {};
  for (const k of LICENSE_KEYS)
    if (typeof lcSrc[k] === 'string' && (lcSrc[k] as string).trim())
      licenseCaps[k] = oneLine(lcSrc[k] as string, LICENSE_CAP_MAX);
  const liSrc = isObj(raw.licenseIcons) ? raw.licenseIcons : {};
  const licenseIcons: Record<string, SfLicenseIcon> = {};
  for (const k of LICENSE_KEYS) {
    const v = liSrc[k];
    if (!isObj(v)) continue;
    const image = normalizeImageRef(v.image);
    if (image) licenseIcons[k] = { image, crop: normalizeCrop(v.crop) };
  }
  const photoRaw = isObj(raw.photo) ? raw.photo : null;
  const photoImage = photoRaw ? normalizeImageRef(photoRaw.image) : null;
  const values = normalizeSfValues(raw.values);
  const valSrc = isObj(raw.values) ? raw.values : {};
  for (const c of customs)
    for (const it of c.items)
      if (it.type === 'text')
        values[it.id] =
          typeof valSrc[it.id] === 'string'
            ? oneLine(valSrc[it.id] as string, CUSTOM_VALUE_MAX)
            : '';
  return {
    blank: custom
      ? custom.base
      : (SF_BLANK_IDS as readonly string[]).includes(raw.blank as string)
        ? (raw.blank as SfBlankId)
        : d.blank,
    custom: custom?.id ?? null,
    customs,
    values,
    captions,
    style: normalizeStyle(raw.style),
    photo:
      photoRaw && photoImage
        ? {
            image: photoImage,
            place: normalizePlacement(photoRaw.place, {
              minZoom: 1,
              maxZoom: SF_ZOOM_MAX,
              limit: 3,
            }),
          }
        : null,
    watermark: normalizeWatermark(raw.watermark),
    elements,
    licenses,
    licenseCaps,
    licenseIcons,
  };
}

/** SF 用到的圖（資產 id） */
export function sfAssetIds(s: SfState): string[] {
  const ids: string[] = [];
  if (s.photo) ids.push(s.photo.image.id);
  if (s.watermark.image) ids.push(s.watermark.image.id);
  for (const list of Object.values(s.elements)) for (const e of list) ids.push(e.image.id);
  for (const ic of Object.values(s.licenseIcons)) ids.push(ic.image.id);
  return ids;
}

/** 卡上印的欄位名稱（改過的優先；{org} 換成組織） */
export function sfCaption(s: SfState, key: string): string {
  const own = s.captions[key];
  const t = typeof own === 'string' ? own : (SF_CAPTIONS[key] ?? '');
  return key === 'fine' ? t.replace(/\{org\}/g, (s.values.org ?? '').trim() || 'THE ISSUER') : t;
}

/* ---------- 自組底版（2026-11-05） ---------- */

/** 開著的自組底版（沒有時 null） */
export const activeCustom = (s: SfState): CustomBlank | null =>
  s.custom ? (s.customs.find((c) => c.id === s.custom) ?? null) : null;

/** 目前的範本的定義（自組底版：欄位＝文字項目、裝飾開關＝有的項目） */
export function sfDef(s: SfState): SfBlankDef {
  const c = activeCustom(s);
  return c ? customBlankDef(c) : sfBlank(s.blank);
}

/** 目前的範本的裝飾圖的鍵 */
export const sfElementKey = (s: SfState): string => (s.custom ? customKey(s.custom) : s.blank);

/** 範本清單的值（內建的代號或 `custom:<id>`） */
export const sfTemplateValue = (s: SfState): string => (s.custom ? customKey(s.custom) : s.blank);

/** 換成範本清單的某一個（內建的或自組底版） */
export function withTemplate(s: SfState, value: string): SfState {
  if (value.startsWith('custom:')) {
    const c = s.customs.find((x) => customKey(x.id) === value);
    if (c) return { ...s, blank: c.base, custom: c.id };
  }
  return (SF_BLANK_IDS as readonly string[]).includes(value)
    ? { ...s, blank: value as SfBlankId, custom: null }
    : s;
}
