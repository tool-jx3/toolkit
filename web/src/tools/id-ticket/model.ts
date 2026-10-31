/**
 * 證件與票券產生器的資料模型（純函式，不依賴 React）：狀態、預設值、讀檔整理、編號的產生、收據的合計、
 * 證件的印刷尺寸（mm、600 dpi、出血）、匯出檔名。規格：docs/refactor/specs/id-ticket.md。
 */
import type { AssetImageRef } from '@/core/assets';
import {
  clampPlacement,
  DEFAULT_PLACEMENT,
  type FramePlacement,
  normalizePlacement,
} from '@/core/image';
import { printPixels } from '@/core/paged/units';
import { normalizePhotoFx, PHOTO_FX_DEFAULT, type PhotoFx } from './photofx';
import { initialSf, normalizeSf, type SfState, sfAssetIds } from './sf/model';
import {
  type FieldDef,
  fieldMax,
  ID_DEFAULTS,
  ID_TEMPLATE_IDS,
  ID_TEMPLATES,
  type IdTemplate,
  type IdTemplateId,
  idTemplate,
  type Orientation,
  RECEIPT_CAPTIONS,
  RECEIPT_ITEM_MAX,
  RECEIPT_ITEMS_DEFAULT,
  TICKET_TEMPLATE_IDS,
  TICKET_TEMPLATES,
  TICKET_THEMES,
  type TicketTemplate,
  type TicketTemplateId,
  ticketTemplate,
} from './templates';

export type Kind = 'id' | 'ticket' | 'sf';
export const KINDS: readonly Kind[] = ['id', 'sf', 'ticket'];
export type Side = 'front' | 'back';

/* ---------- 證件的尺寸（規格 3.1） ---------- */

/** 證件成品（直式）：54 × 86 mm */
export const CARD_MM = { w: 54, h: 86 } as const;
/** 印刷用的出血（四邊各 2 mm → 58 × 90 mm） */
export const BLEED_MM = 2;
/** 匯出解析度 */
export const CARD_DPI = 600;
/** 證件的設計單位：1 mm＝5.5 單位（成品 297 × 473、出血 11） */
export const UNITS_PER_MM = 5.5;
export const CARD_U = { w: CARD_MM.w * UNITS_PER_MM, h: CARD_MM.h * UNITS_PER_MM } as const;
export const BLEED_U = BLEED_MM * UNITS_PER_MM;
/** 卡片的圓角（設計單位；≈ 2.55 mm） */
export const CARD_RADIUS_U = 14;
/** 安全範圍：成品邊往內 17 單位（≈ 3 mm） */
export const SAFE_U = 17;
/** 正反面排在一張時的間隔（mm） */
export const SHEET_GAP_MM = 6;

/** 直式／橫式的成品尺寸（設計單位） */
export const cardUnits = (o: Orientation): { w: number; h: number } =>
  o === 'portrait' ? { w: CARD_U.w, h: CARD_U.h } : { w: CARD_U.h, h: CARD_U.w };

/** 直式／橫式的成品尺寸（mm） */
export const cardMm = (o: Orientation): { w: number; h: number } =>
  o === 'portrait' ? { w: CARD_MM.w, h: CARD_MM.h } : { w: CARD_MM.h, h: CARD_MM.w };

export type IdExportMode = 'card' | 'print';
export type IdFaces = 'current' | 'both' | 'sheet';
export const ID_EXPORT_MODES: readonly IdExportMode[] = ['card', 'print'];
export const ID_FACES: readonly IdFaces[] = ['current', 'both', 'sheet'];

/** 一面的輸出像素：卡片＝成品（54 × 86 mm）、印刷＝含出血（58 × 90 mm），600 dpi */
export function facePixels(o: Orientation, mode: IdExportMode): { width: number; height: number } {
  const mm = cardMm(o);
  return printPixels({ w: mm.w, h: mm.h }, CARD_DPI, mode === 'print' ? BLEED_MM : 0);
}

/** 600 dpi 時每個設計單位是幾個像素（≈ 4.295） */
export const EXPORT_SCALE = CARD_DPI / 25.4 / UNITS_PER_MM;

/** 正反面排在一張的間隔像素（6 mm → 142 px） */
export const sheetGapPx = (): number => Math.round((SHEET_GAP_MM * CARD_DPI) / 25.4);

/* ---------- 狀態 ---------- */

/** 照片：資產庫的圖＋在框裡的位置（和框的大小無關） */
export interface Photo {
  image: AssetImageRef;
  place: FramePlacement;
}

export interface IdStyle {
  /** 主題色 */
  color: string;
  dark: boolean;
  /** 背景漸層（會員卡；null＝依主題色自動） */
  g1: string | null;
  g2: string | null;
}

export interface ReceiptItem {
  id: string;
  name: string;
  qty: number;
  price: number;
}

export interface TicketTheme {
  c1: string;
  c2: string;
}

export interface IdTicketState {
  kind: Kind;
  idTemplate: IdTemplateId;
  ticketTemplate: TicketTemplateId;
  /** 證件的欄位值（依欄位代號，各款共用） */
  idValues: Record<string, string>;
  /** 每一款證件自己的樣式 */
  idStyles: Record<IdTemplateId, IdStyle>;
  /** 證件的照片（各款共用一張） */
  idPhoto: Photo | null;
  /** 票券的欄位值（每一款各自一份） */
  ticketValues: Record<TicketTemplateId, Record<string, string>>;
  /** 票券上畫的欄位名稱（改過的才有） */
  ticketCaptions: Record<TicketTemplateId, Record<string, string>>;
  /** 票券的照片（每一款各自一張） */
  ticketPhotos: Partial<Record<TicketTemplateId, Photo>>;
  receiptItems: ReceiptItem[];
  /** 收據要不要照片格 */
  receiptPhoto: boolean;
  /** 票券的配色（各款共用） */
  theme: TicketTheme;
  /** 證件照片的效果（各款共用；資料版本 2 起） */
  idPhotoFx: PhotoFx;
  /** SF 證件（資料版本 2 起） */
  sf: SfState;
}

export const defaultIdStyles = (): Record<IdTemplateId, IdStyle> =>
  Object.fromEntries(
    ID_TEMPLATES.map((t) => [t.id, { color: t.color, dark: t.dark, g1: null, g2: null }]),
  ) as Record<IdTemplateId, IdStyle>;

let itemSeq = 0;
export const newItemId = (): string =>
  `i${Date.now().toString(36)}${(itemSeq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const defaultReceiptItems = (): ReceiptItem[] =>
  RECEIPT_ITEMS_DEFAULT.map((it, i) => ({ id: `item${i + 1}`, ...it }));

export const initialState = (): IdTicketState => ({
  kind: 'id',
  idTemplate: 'employee',
  ticketTemplate: 'movie',
  idValues: normalizeIdValues(undefined),
  idStyles: defaultIdStyles(),
  idPhoto: null,
  ticketValues: Object.fromEntries(
    TICKET_TEMPLATES.map((t) => [t.id, normalizeTicketValues(t, undefined)]),
  ) as Record<TicketTemplateId, Record<string, string>>,
  ticketCaptions: Object.fromEntries(TICKET_TEMPLATES.map((t) => [t.id, {}])) as Record<
    TicketTemplateId,
    Record<string, string>
  >,
  ticketPhotos: {},
  receiptItems: defaultReceiptItems(),
  receiptPhoto: true,
  theme: { c1: TICKET_THEMES[0].c1, c2: TICKET_THEMES[0].c2 },
  idPhotoFx: { ...PHOTO_FX_DEFAULT },
  sf: initialSf(),
});

/* ---------- 文字 ---------- */

/** 單行：換行換成空白、截到上限（以字元計，emoji 算一個） */
export function oneLine(text: string, max: number): string {
  return [...String(text ?? '').replace(/\s*[\r\n]+\s*/g, ' ')].slice(0, max).join('');
}

/** 欄位值依欄位的規則整理（下拉選單只認選項或空白） */
export function cleanValue(f: FieldDef, raw: unknown): string {
  const s = typeof raw === 'string' ? raw : typeof raw === 'number' ? String(raw) : '';
  if (f.options) return f.options.includes(s) ? s : '';
  return oneLine(s, fieldMax(f));
}

/* ---------- 編號 ---------- */

/** 編號裡的英文字母（沒有 I、O：看起來像 1、0） */
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_HEX = '0123456789ABCDEF';

/**
 * 依格式產生編號：`#` 換成隨機數字（第一個 `#` 是 1～9，不會以 0 開頭）、`{yyyy}` 換成今年；
 * SF 證件另外用 `@`（英文字母，沒有 I、O）、`%`（十六進位）。
 * rand 是 0～1 的亂數（測試可以給固定的）。
 */
export function generateCode(
  pattern: string,
  rand: () => number = Math.random,
  now: Date = new Date(),
): string {
  let first = true;
  const pick = (pool: string) => pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
  return pattern.replace(/\{yyyy\}/g, String(now.getFullYear())).replace(/[#@%]/g, (c) => {
    if (c === '@') return pick(CODE_LETTERS);
    if (c === '%') return pick(CODE_HEX);
    const d = first ? 1 + Math.floor(rand() * 9) : Math.floor(rand() * 10);
    first = false;
    return String(Math.min(9, d));
  });
}

/** 隨機的日期 YYYY-MM-DD（年份 y0～y1；日只到 28，每個月都有） */
export function generateDate(
  [y0, y1]: readonly [number, number],
  rand: () => number = Math.random,
): string {
  const int = (a: number, b: number) => a + Math.min(b - a, Math.floor(rand() * (b - a + 1)));
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${int(y0, y1)}-${p2(int(1, 12))}-${p2(int(1, 28))}`;
}

/* ---------- 收據 ---------- */

/** 金額欄的數字（去掉千分位與符號；看不懂＝0） */
export function parseAmount(text: string): number {
  const n = Number.parseFloat(String(text ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** 千分位（台灣寫法；小數最多 2 位） */
export const formatAmount = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString('zh-TW', { maximumFractionDigits: 2 });

export const itemAmount = (it: Pick<ReceiptItem, 'qty' | 'price'>): number => it.qty * it.price;

/** 小計＝Σ 數量 × 單價；合計＝小計 −｜折扣｜（同原作：折扣一律當成減項） */
export function receiptTotals(
  items: readonly Pick<ReceiptItem, 'qty' | 'price'>[],
  discountText: string,
): { subtotal: number; discount: number; total: number } {
  const subtotal = items.reduce((a, it) => a + itemAmount(it), 0);
  const discount = Math.abs(parseAmount(discountText));
  return { subtotal, discount, total: subtotal - discount };
}

export const QTY_RANGE = { min: 0, max: 999 } as const;
export const PRICE_RANGE = { min: 0, max: 9_999_999 } as const;
/** 單價的小數位數（第 3 位四捨五入） */
export const PRICE_DECIMALS = 2;
export const roundPrice = (n: number): number =>
  Number(Math.min(PRICE_RANGE.max, Math.max(PRICE_RANGE.min, n)).toFixed(PRICE_DECIMALS));
export const ITEM_NAME_MAX = 16;

/* ---------- 讀檔整理 ---------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const HEX = /^#[0-9a-f]{6}$/i;
export const normalizeHexColor = (v: unknown, fallback: string): string =>
  typeof v === 'string' && HEX.test(v.trim()) ? v.trim().toLowerCase() : fallback;

const num = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

function normalizeImageRef(v: unknown): AssetImageRef | null {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id) return null;
  const w = num(v.width, 0, 0, 100_000);
  const h = num(v.height, 0, 0, 100_000);
  if (!(w > 0 && h > 0)) return null;
  return { id: v.id, name: typeof v.name === 'string' ? v.name : '', width: w, height: h };
}

export const ID_ZOOM_MAX = 6;
export const TICKET_ZOOM_MAX = 5;

export function normalizePhoto(v: unknown, maxZoom: number): Photo | null {
  if (!isObj(v)) return null;
  const image = normalizeImageRef(v.image);
  if (!image) return null;
  return { image, place: normalizePlacement(v.place, { minZoom: 1, maxZoom, limit: 3 }) };
}

/** 證件欄位的整理：每一款用到的欄位依規則整理，沒有的補預設值 */
function normalizeIdValues(raw: unknown): Record<string, string> {
  const src = isObj(raw) ? raw : {};
  const out: Record<string, string> = {};
  for (const t of ID_TEMPLATES)
    for (const f of t.fields) {
      if (f.key in out) continue;
      out[f.key] = f.key in src ? cleanValue(f, src[f.key]) : (ID_DEFAULTS[f.key] ?? '');
    }
  return out;
}

function normalizeTicketValues(t: TicketTemplate, raw: unknown): Record<string, string> {
  const src = isObj(raw) ? raw : {};
  const out: Record<string, string> = {};
  for (const f of t.fields)
    out[f.key] = f.key in src ? cleanValue(f, src[f.key]) : (t.defaults[f.key] ?? '');
  return out;
}

export const CAPTION_MAX = 12;

function normalizeCaptions(t: TicketTemplate, raw: unknown): Record<string, string> {
  const src = isObj(raw) ? raw : {};
  const out: Record<string, string> = {};
  const keys = [
    ...t.fields.filter((f) => f.caption).map((f) => f.key),
    ...(t.id === 'receipt' ? Object.keys(RECEIPT_CAPTIONS) : []),
  ];
  for (const k of keys) if (typeof src[k] === 'string') out[k] = oneLine(src[k], CAPTION_MAX);
  return out;
}

function normalizeItems(raw: unknown): ReceiptItem[] {
  if (!Array.isArray(raw)) return defaultReceiptItems();
  const seen = new Set<string>();
  const out: ReceiptItem[] = [];
  for (const it of raw.slice(0, RECEIPT_ITEM_MAX)) {
    if (!isObj(it)) continue;
    let id = typeof it.id === 'string' && it.id ? it.id : newItemId();
    if (seen.has(id)) id = newItemId();
    seen.add(id);
    out.push({
      id,
      name: oneLine(typeof it.name === 'string' ? it.name : '', ITEM_NAME_MAX),
      qty: Math.round(num(it.qty, 1, QTY_RANGE.min, QTY_RANGE.max)),
      price: roundPrice(num(it.price, 0, PRICE_RANGE.min, PRICE_RANGE.max)),
    });
  }
  return out;
}

/** 存檔、專案檔讀回來的內容：缺的補預設、壞的換成預設、文字截到上限 */
export function normalizeState(raw: unknown): IdTicketState {
  const d = initialState();
  if (!isObj(raw)) return d;
  const kind: Kind = raw.kind === 'ticket' || raw.kind === 'sf' ? raw.kind : 'id';
  const idT = (ID_TEMPLATE_IDS as readonly string[]).includes(raw.idTemplate as string)
    ? (raw.idTemplate as IdTemplateId)
    : d.idTemplate;
  const tkT = (TICKET_TEMPLATE_IDS as readonly string[]).includes(raw.ticketTemplate as string)
    ? (raw.ticketTemplate as TicketTemplateId)
    : d.ticketTemplate;
  const stylesSrc = isObj(raw.idStyles) ? raw.idStyles : {};
  const idStyles = defaultIdStyles();
  for (const t of ID_TEMPLATES) {
    const s = stylesSrc[t.id];
    if (!isObj(s)) continue;
    idStyles[t.id] = {
      color: normalizeHexColor(s.color, t.color),
      dark: typeof s.dark === 'boolean' ? s.dark : t.dark,
      g1: s.g1 === null || s.g1 === undefined ? null : normalizeHexColor(s.g1, '') || null,
      g2: s.g2 === null || s.g2 === undefined ? null : normalizeHexColor(s.g2, '') || null,
    };
  }
  const tvSrc = isObj(raw.ticketValues) ? raw.ticketValues : {};
  const tcSrc = isObj(raw.ticketCaptions) ? raw.ticketCaptions : {};
  const tpSrc = isObj(raw.ticketPhotos) ? raw.ticketPhotos : {};
  const ticketValues = { ...d.ticketValues };
  const ticketCaptions = { ...d.ticketCaptions };
  const ticketPhotos: Partial<Record<TicketTemplateId, Photo>> = {};
  for (const t of TICKET_TEMPLATES) {
    ticketValues[t.id] = normalizeTicketValues(t, tvSrc[t.id]);
    ticketCaptions[t.id] = normalizeCaptions(t, tcSrc[t.id]);
    if (t.photo) {
      const p = normalizePhoto(tpSrc[t.id], TICKET_ZOOM_MAX);
      if (p) ticketPhotos[t.id] = p;
    }
  }
  const theme = isObj(raw.theme) ? raw.theme : {};
  return {
    kind,
    idTemplate: idT,
    ticketTemplate: tkT,
    idValues: normalizeIdValues(raw.idValues),
    idStyles,
    idPhoto: normalizePhoto(raw.idPhoto, ID_ZOOM_MAX),
    ticketValues,
    ticketCaptions,
    ticketPhotos,
    receiptItems: normalizeItems(raw.receiptItems),
    receiptPhoto: typeof raw.receiptPhoto === 'boolean' ? raw.receiptPhoto : true,
    theme: {
      c1: normalizeHexColor(theme.c1, d.theme.c1),
      c2: normalizeHexColor(theme.c2, d.theme.c2),
    },
    idPhotoFx: normalizePhotoFx(raw.idPhotoFx),
    sf: normalizeSf(raw.sf),
  };
}

/** 狀態用到的圖（資產 id） */
export function stateAssetIds(s: IdTicketState): string[] {
  const ids: string[] = [];
  if (s.idPhoto) ids.push(s.idPhoto.image.id);
  for (const p of Object.values(s.ticketPhotos)) if (p) ids.push(p.image.id);
  ids.push(...sfAssetIds(s.sf));
  return ids;
}

/* ---------- 目前的範本 ---------- */

export const currentIdTemplate = (s: IdTicketState): IdTemplate => idTemplate(s.idTemplate);
export const currentTicketTemplate = (s: IdTicketState): TicketTemplate =>
  ticketTemplate(s.ticketTemplate);

/** 票上畫的欄位名稱（改過的優先） */
export function captionOf(s: IdTicketState, t: TicketTemplate, key: string): string {
  const own = s.ticketCaptions[t.id]?.[key];
  if (typeof own === 'string') return own;
  const f = t.fields.find((x) => x.key === key);
  if (f?.caption) return f.caption;
  return (RECEIPT_CAPTIONS as Record<string, string>)[key] ?? '';
}

/** 位置夾回蓋滿的範圍（框的比例改了、換了範本時） */
export const clampPhotoPlace = (
  p: Photo,
  box: { width: number; height: number },
  maxZoom: number,
): FramePlacement =>
  clampPlacement(
    { width: p.image.width, height: p.image.height },
    box,
    p.place ?? DEFAULT_PLACEMENT,
    maxZoom,
  );

/* ---------- 檔名 ---------- */

/** 證件：`id-<範本>-<front|back|sheet>-<card|print>.png`（規格 3.4） */
export function idFileName(tpl: IdTemplateId, face: Side | 'sheet', mode: IdExportMode): string {
  return `id-${tpl}-${face}-${mode}.png`;
}

/** 票券：`ticket-<範本>.<副檔名>` */
export const ticketFileName = (tpl: TicketTemplateId, ext: 'png' | 'gif'): string =>
  `ticket-${tpl}.${ext}`;
