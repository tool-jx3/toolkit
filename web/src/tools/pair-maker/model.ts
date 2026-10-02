/**
 * 角色介紹圖產生器的資料模型（不依賴 React）：版型的定義格式、編輯內容（Draft）、欄位的條件顯示與預設值、
 * 讀入資料的檢查（編輯檔、存檔槽、自動保存共用）、貼紙的新增與限制。
 * 規格：docs/refactor/specs/pair-maker.md。
 */
import type { FontValue } from '@/core/fonts';
import { type RichDoc, RichTextError, validateDoc } from '@/core/richtext';
import type { HitTarget, Placement, Rect, SceneNode, Size } from '@/core/scene';

/* ---------- 編輯內容 ---------- */

export type Value = string | number | boolean | FontValue | RichDoc;

export interface Sticker extends Placement {
  id: string;
  /** 圖片庫的 id */
  asset: string;
  name: string;
  shadow: boolean;
  outline: boolean;
  /** 出處 */
  cite: string;
  /** 文字記錄：所在的頁（頁的編號，不是順序） */
  page?: number;
}

export interface Draft {
  /** 欄位的值（id → 值）；圖片的出處是 `cite:<格子 id>` */
  v: Record<string, Value>;
  /** 改過的欄位（預設文字不再自動清空） */
  touched: Record<string, true>;
  /** 圖片格 id → 圖片庫的 id */
  images: Record<string, string>;
  /** 貼紙：第一個在最上層 */
  stickers: Sticker[];
  /** 多人資料框：角色的編號（依顯示順序） */
  members?: number[];
  /** 多人資料框：下一個預設分頁名稱用的號碼（只增不減） */
  nextNo?: number;
  /** 文字記錄：頁的編號（依顯示順序） */
  pages?: number[];
  /** 文字記錄：目前的頁 */
  active?: number;
  /** 文字記錄：單獨看／看全部 */
  view?: 'single' | 'all';
  /** 文字記錄：接續上一頁的本文（id → true） */
  cont?: Record<string, true>;
}

/* ---------- 版型的定義 ---------- */

/** 條件顯示：勾選框 id（打開時顯示）、某欄是某值、某欄不是某值 */
export type Cond = string | { id: string; is: string } | { id: string; not: string };

interface FieldBase {
  id: string;
  label: string;
  when?: Cond;
  /** 同一列（同一個 row 名稱的欄位排在同一列） */
  row?: string;
  hint?: string;
}

export interface TextField extends FieldBase {
  type: 'text' | 'textarea';
  /** 字數上限（預設 text 100、textarea 500） */
  max?: number;
  /** 不自動清空預設文字 */
  keep?: boolean;
  placeholder?: string;
  inputMode?: 'decimal';
}

export interface NumberField extends FieldBase {
  type: 'number';
  min: number;
  max: number;
  step?: number;
  unit?: string;
}

export interface RadioField extends FieldBase {
  type: 'radio';
  options: readonly { value: string; label: string }[];
}

export interface FontField extends FieldBase {
  type: 'font';
  /** 樣張用哪個文字欄的內容 */
  sampleOf?: string;
}

export interface RichField extends FieldBase {
  type: 'rich';
  /** 字數上限（預設 1,000） */
  max?: number;
  /** 編輯區的固定行數 */
  rows?: number;
  note?: string;
  /** 第一次聚焦時清空預設文字 */
  clear?: boolean;
  /** 預設字色 */
  color?: string;
}

export interface SimpleField extends FieldBase {
  type: 'checkbox' | 'color';
}

export interface SeparatorField {
  type: 'separator';
  id: string;
  label?: string;
  when?: Cond;
}

export type FieldDef =
  | TextField
  | NumberField
  | RadioField
  | FontField
  | RichField
  | SimpleField
  | SeparatorField;

export interface SlotDef {
  id: string;
  /** 欄位標題（不給時用分類名稱） */
  label?: string;
  width: number;
  height: number;
  shape?: 'rect' | 'round' | 'circle';
  /** 自由裁切（不限比例、原解析度） */
  free?: boolean;
  when?: Cond;
  /** 放在欄位後面（預設在前面） */
  after?: boolean;
}

export interface GroupAction {
  id: string;
  label: string;
  icon?: 'delete' | 'left' | 'right';
  disabled?: boolean;
  danger?: boolean;
}

export interface GroupDef {
  id: string;
  label: string;
  fields: readonly FieldDef[];
  slots?: readonly SlotDef[];
}

export interface SideDef {
  id: string;
  label: string;
  /** 面板標題的前半（預設 label） */
  heading?: string;
  groups: readonly GroupDef[];
}

export interface SceneEnv {
  /** 圖片格的圖（沒有時 null） */
  image: (slotId: string) => CanvasImageSource | null;
  /** 量字寬用的 2D context（排版、跟著本文移動的標題） */
  measure: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  /** 畫 PDF 的底圖：不畫文字 */
  noText?: boolean;
}

export type TemplateTag = '資料整理' | '橫幅' | '置頂推文' | '文字';

export interface TemplateDef {
  id: string;
  name: string;
  tag: TemplateTag;
  /** 一句提示 */
  tip: string;
  kind: 'fixed' | 'roster' | 'textlog';
  /** 初始內容 */
  initial: () => Draft;
  /** 畫布大小（多人資料框、文字記錄看全部時依內容） */
  size: (d: Draft) => Size;
  /** 編輯對象（不含「貼紙」） */
  sides: (d: Draft) => readonly SideDef[];
  /** 欄位的預設值（判斷「還是預設文字」用；依目前結構） */
  defaults: (d: Draft) => Record<string, Value>;
  scene: (d: Draft, env: SceneEnv) => SceneNode[];
  /** 新貼紙放在哪裡（中心）＋放開時要留在哪裡；文字記錄是目前頁 */
  stickerArea: (d: Draft, s?: Sticker) => Rect;
  /** 貼紙在畫布上的位移（文字記錄看全部時依頁的位置）；不給時 0 */
  stickerOffset?: (d: Draft, s: Sticker) => { x: number; y: number };
  /** 貼紙目前看不看得到（文字記錄單獨看時只有目前頁的） */
  stickerVisible?: (d: Draft, s: Sticker) => boolean;
  /** 讀入外來資料時：檢查並建立結構（人數、頁數），回傳以預設值填好的 Draft；不合格丟 DraftError */
  restore?: (raw: Partial<Draft>) => Draft;
}

export class DraftError extends Error {
  override name = 'DraftError';
}

/* ---------- 小工具 ---------- */

/** 版型所有的欄位與圖片格（依目前結構） */
export function allFields(def: TemplateDef, d: Draft): FieldDef[] {
  return def.sides(d).flatMap((s) => s.groups.flatMap((g) => g.fields));
}

export function allSlots(def: TemplateDef, d: Draft): SlotDef[] {
  return def.sides(d).flatMap((s) => s.groups.flatMap((g) => g.slots ?? []));
}

/** 條件成立嗎 */
export function condMet(c: Cond | undefined, v: Record<string, Value>): boolean {
  if (!c) return true;
  if (typeof c === 'string') return v[c] === true;
  if ('is' in c) return v[c.id] === c.is;
  return v[c.id] !== c.not;
}

/** 字數上限 */
export const textMax = (f: TextField): number => f.max ?? (f.type === 'textarea' ? 500 : 100);

/** 「還是預設文字、沒改過」：第一次聚焦時要清空 */
export function shouldClear(f: FieldDef, d: Draft, defaults: Record<string, Value>): boolean {
  if (f.type !== 'text' && f.type !== 'textarea' && f.type !== 'rich') return false;
  if ((f.type === 'text' || f.type === 'textarea') && f.keep) return false;
  if (f.type === 'rich' && !f.clear) return false;
  if (d.touched[f.id]) return false;
  const cur = d.v[f.id];
  const def = defaults[f.id];
  if (f.type === 'rich') {
    const a = JSON.stringify(cur);
    return (
      !!def &&
      a === JSON.stringify(def) &&
      JSON.stringify(def) !== JSON.stringify({ lines: [{ runs: [] }] })
    );
  }
  return typeof cur === 'string' && cur !== '' && cur === def;
}

/** 文字值（取不到時空字串） */
export const str = (v: Record<string, Value>, id: string): string => {
  const x = v[id];
  return typeof x === 'string' ? x : '';
};

export const num = (v: Record<string, Value>, id: string, fallback = 0): number => {
  const x = v[id];
  return typeof x === 'number' && Number.isFinite(x) ? x : fallback;
};

export const bool = (v: Record<string, Value>, id: string): boolean => v[id] === true;

export const font = (v: Record<string, Value>, id: string, fallback: FontValue): FontValue => {
  const x = v[id] as FontValue | undefined;
  return x && typeof x === 'object' && 'family' in x ? x : fallback;
};

export const rich = (v: Record<string, Value>, id: string): RichDoc => {
  const x = v[id] as RichDoc | undefined;
  return x && typeof x === 'object' && 'lines' in x ? x : { lines: [{ runs: [] }] };
};

/** 出處欄的 id */
export const citeId = (slotId: string): string => `cite:${slotId}`;

/** 點選區 */
export const hit = (side: string, group: string, label: string): HitTarget => ({
  key: `${side}/${group}`,
  label,
});

/** 點選區的鍵 → 對象與分類 */
export function parseHitKey(key: string): { side: string; group: string } | null {
  const i = key.indexOf('/');
  if (i < 0) return null;
  return { side: key.slice(0, i), group: key.slice(i + 1) };
}

/* ---------- 限制 ---------- */

export const MAX_STICKERS = 30;
/** 圖片：檔案大小、像素數、長邊 */
export const IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const IMAGE_MAX_PIXELS = 40_000_000;
export const IMAGE_MAX_SIDE = 2048;
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
/** 貼紙新加入時的長邊 */
export const STICKER_START_SIDE = 300;
/** 貼紙寬高的下限（縮放控點） */
export const STICKER_MIN = 12;
/** 放開時至少留在範圍裡的距離 */
export const STICKER_MARGIN = 16;
/** 出處的字數上限 */
export const CITE_MAX = 100;
/** 編輯檔：檔案大小、解壓後大小、檔案數 */
export const ARCHIVE_MAX_BYTES = 80 * 1024 * 1024;
export const ARCHIVE_MAX_FILES = 100;

/** 圖片的檔案類型可以用嗎（PNG、JPEG、WebP） */
export const imageTypeOk = (type: string): boolean =>
  (IMAGE_TYPES as readonly string[]).includes(type);

/** 長邊超過上限時的縮放比例（1＝不縮） */
export const downscaleRatio = (w: number, h: number, max = IMAGE_MAX_SIDE): number =>
  Math.min(1, max / Math.max(w, h));

/** 貼紙寬高的上限：畫布長邊 × 2 */
export const stickerMax = (size: Size): number => Math.max(size.width, size.height) * 2;

/* ---------- 讀入資料的檢查 ---------- */

const HEX = /^#[0-9a-f]{6}$/i;
const FONT_SOURCES = new Set(['google', 'local', 'upload']);
const ASSET_ID = /^[0-9a-z_-]{1,128}$/i;

function checkFont(x: unknown): FontValue {
  const f = x as Partial<FontValue> | null;
  if (
    !f ||
    typeof f !== 'object' ||
    !FONT_SOURCES.has(f.source as string) ||
    typeof f.family !== 'string' ||
    f.family.length > 200 ||
    typeof f.weight !== 'number' ||
    !Number.isFinite(f.weight) ||
    f.weight < 1 ||
    f.weight > 1000
  )
    throw new DraftError('字型的設定不正確。');
  return { source: f.source as FontValue['source'], family: f.family, weight: f.weight };
}

/**
 * 外來資料（編輯檔、存檔槽、自動保存）→ 可以用的 Draft。
 * 結構（人數、頁數）由版型的 restore 檢查；欄位逐一檢查型別與範圍，缺的用預設值；
 * 圖片格只留這個版型有的格子；貼紙檢查 id、座標、大小、張數。不合格丟 DraftError（訊息可以直接顯示）。
 */
export function validateDraft(def: TemplateDef, input: unknown): Draft {
  const raw = input as Partial<Draft> | null;
  if (!raw || typeof raw !== 'object' || !raw.v || typeof raw.v !== 'object')
    throw new DraftError('編輯內容的格式不正確。');
  const base = def.restore ? def.restore(raw) : def.initial();
  const next: Draft = { ...base, v: { ...base.v }, touched: {}, images: {}, stickers: [] };
  const rv = raw.v as Record<string, unknown>;
  const rt = (raw.touched ?? {}) as Record<string, unknown>;
  for (const f of allFields(def, next)) {
    if (f.type === 'separator') continue;
    const x = rv[f.id];
    if (rt[f.id] === true) next.touched[f.id] = true;
    if (x === undefined) continue;
    switch (f.type) {
      case 'number':
        if (typeof x !== 'number' || !Number.isFinite(x) || x < f.min || x > f.max)
          throw new DraftError('數值超出範圍了。');
        next.v[f.id] = x;
        break;
      case 'checkbox':
        if (typeof x !== 'boolean') throw new DraftError('勾選項的值不正確。');
        next.v[f.id] = x;
        break;
      case 'radio':
        if (typeof x !== 'string' || !f.options.some((o) => o.value === x))
          throw new DraftError('選項的值不正確。');
        next.v[f.id] = x;
        break;
      case 'color':
        if (typeof x !== 'string' || !HEX.test(x)) throw new DraftError('色彩值不正確。');
        next.v[f.id] = x.toLowerCase();
        break;
      case 'font':
        next.v[f.id] = checkFont(x);
        break;
      case 'rich':
        try {
          next.v[f.id] = validateDoc(x, f.max ?? 1000);
        } catch (e) {
          throw new DraftError(e instanceof RichTextError ? e.message : '格式化文字不正確。');
        }
        break;
      default:
        if (typeof x !== 'string' || x.length > textMax(f))
          throw new DraftError('文字內容不正確。');
        next.v[f.id] = x;
    }
  }
  const rawImages = (raw.images ?? {}) as Record<string, unknown>;
  for (const s of allSlots(def, next)) {
    const id = rawImages[s.id];
    if (typeof id === 'string' && ASSET_ID.test(id)) next.images[s.id] = id;
    const cite = rv[citeId(s.id)];
    if (cite !== undefined) {
      if (typeof cite !== 'string' || cite.length > CITE_MAX)
        throw new DraftError('出處的文字不正確。');
      next.v[citeId(s.id)] = cite;
    }
  }
  const size = def.size(next);
  const big = Math.max(size.width, size.height);
  const list = raw.stickers ?? [];
  if (!Array.isArray(list) || list.length > MAX_STICKERS)
    throw new DraftError('貼紙的資料不正確。');
  const ids = new Set<string>();
  for (const item of list as Partial<Sticker>[]) {
    if (
      !item ||
      typeof item.id !== 'string' ||
      !item.id ||
      item.id.length > 100 ||
      ids.has(item.id)
    )
      throw new DraftError('貼紙 ID 不正確。');
    if (typeof item.asset !== 'string' || !ASSET_ID.test(item.asset))
      throw new DraftError('貼紙的圖片不正確。');
    for (const k of ['cx', 'cy', 'width', 'height', 'rotation'] as const)
      if (typeof item[k] !== 'number' || !Number.isFinite(item[k]))
        throw new DraftError('貼紙座標不正確。');
    const s = item as Sticker;
    if (
      s.width < 8 ||
      s.height < 8 ||
      s.width > big * 2 ||
      s.height > big * 2 ||
      Math.abs(s.cx) > big * 3 ||
      Math.abs(s.cy) > big * 3 ||
      Math.abs(s.rotation) > 36000
    )
      throw new DraftError('貼紙的大小或位置超出範圍了。');
    if (def.kind === 'textlog' && !(next.pages ?? []).includes(s.page as number))
      throw new DraftError('貼紙所在的頁面不正確。');
    ids.add(s.id);
    next.stickers.push({
      id: s.id,
      asset: s.asset,
      name: String(s.name ?? '貼紙').slice(0, 100),
      cx: s.cx,
      cy: s.cy,
      width: s.width,
      height: s.height,
      rotation: s.rotation,
      shadow: s.shadow === true,
      outline: s.outline === true,
      cite: String(s.cite ?? '').slice(0, CITE_MAX),
      ...(def.kind === 'textlog' ? { page: s.page } : {}),
    });
  }
  return next;
}

/** Draft 用到的圖片（格子＋貼紙） */
export function draftAssets(d: Draft): string[] {
  return [...new Set([...Object.values(d.images), ...d.stickers.map((s) => s.asset)])];
}

/** 新的 id（貼紙、存檔槽） */
export function newId(prefix: string): string {
  const r =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 18);
  return `${prefix}${r}`;
}
