/**
 * 劇本文字產生器的資料模型（不依賴 React）：圖片庫、說話者、讀取方式、清單的一則、已確定的一批，
 * 預設值與讀回時的整理（自動保存、專案檔）。規格：docs/refactor/specs/scenario-text.md。
 *
 * - 圖片庫的圖片內容放在資產庫（`@/core/assets`，IndexedDB），這裡只記 id、名稱、出處與 MIME、大小。
 * - 一則記的是說話者 id 與差分名稱，不是圖：換立繪後所有用到的劇本文字一起換（規格 1.8 F56）。
 * - `edited` 是 null 時清單跟著文字重建；第一次手動修改時把清單複製到這裡固定下來。
 */

/** 圖片庫的一張圖 */
export type ShelfImage =
  | {
      id: string;
      kind: 'file';
      name: string;
      /** 出處／作者（選填） */
      credit: string;
      /** 資產庫的 id（內容雜湊） */
      asset: string;
      /** MIME（image/png、image/jpeg、image/gif、image/webp） */
      type: string;
      /** 位元組數 */
      size: number;
    }
  | { id: string; kind: 'url'; name: string; credit: string; url: string };

export interface Face {
  id: string;
  label: string;
  imageId: string | null;
}

export interface Speaker {
  id: string;
  /** 名稱（＝送出時的名稱、劇本文字的標題） */
  name: string;
  /** 台本裡的其他寫法（「、」「,」「，」分隔） */
  aliases: string;
  /** 立繪（圖片庫 id） */
  imageId: string | null;
  faces: Face[];
}

export type Mode = 'script' | 'heading';
export type Unit = 'line' | 'block';
export type Style = 'auto' | 'quote' | 'colon';
export type Narration = 'include' | 'skip';

export interface Opts {
  mode: Mode;
  unit: Unit;
  style: Style;
  keepQuotes: boolean;
  narration: Narration;
  narratorName: string;
  /** 差分名稱加進標題 */
  faceInTitle: boolean;
}

export type EntryKind = 'speaker' | 'unknown' | 'narration' | 'heading';

/** 一則的圖：'auto'（說話者、差分、同名的圖）、'none'（沒有圖）、圖片庫 id（指定這張） */
export type EntryImage = 'auto' | 'none' | (string & {});

/** 清單的一則（存檔的形狀） */
export interface Entry {
  kind: EntryKind;
  title: string;
  text: string;
  speakerId: string | null;
  /** 差分名稱（照登錄的寫法；沒登錄時照台本的寫法） */
  face: string;
  /** 開始的行號（1 起算）；手動加的是 null */
  line: number | null;
  /** 手動輸入的標題（不再跟著說話者、差分） */
  titleCustom: boolean;
  image: EntryImage;
}

/** 已確定的一批 */
export interface Batch {
  id: string;
  mode: Mode;
  /** 摘要（第一則的「標題：本文」前 28 字） */
  label: string;
  script: string;
  opts: Opts;
  entries: Entry[];
  edited: boolean;
}

export interface Doc {
  images: ShelfImage[];
  speakers: Speaker[];
  script: string;
  opts: Opts;
  edited: Entry[] | null;
  confirmed: Batch[];
}

/** CCFOLIA 的圖片上限（5 MB） */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** 清單的「確定」摘要長度、已確定清單裡每則本文的長度 */
export const BATCH_LABEL_CHARS = 28;
export const BATCH_ENTRY_CHARS = 60;

/* ---------- id ---------- */

let seq = 0;
/** 工具內部的 id（圖片庫、說話者、差分、已確定的一批）；前綴＋時間＋亂數＋序號，不會重複 */
export function uid(prefix: string): string {
  seq = (seq + 1) % 1296;
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}${seq.toString(36)}`;
}

/* ---------- 預設值 ---------- */

export const defaultOpts = (): Opts => ({
  mode: 'script',
  unit: 'line',
  style: 'auto',
  keepQuotes: true,
  narration: 'include',
  narratorName: '',
  faceInTitle: false,
});

export const newSpeaker = (name = ''): Speaker => ({
  id: uid('s'),
  name,
  aliases: '',
  imageId: null,
  faces: [],
});

export const newFace = (label = '', imageId: string | null = null): Face => ({
  id: uid('f'),
  label,
  imageId,
});

/** 預設的兩位說話者（固定 id，開頁的預設內容每次相同） */
export const DEFAULT_SPEAKER_NAMES = ['艾莉絲', '鮑伯'] as const;

export function defaultSpeakers(): Speaker[] {
  return DEFAULT_SPEAKER_NAMES.map((name, i) => ({
    id: `s-default-${i + 1}`,
    name,
    aliases: '',
    imageId: null,
    faces: [],
  }));
}

export function defaultDoc(): Doc {
  return {
    images: [],
    speakers: defaultSpeakers(),
    script: '',
    opts: defaultOpts(),
    edited: null,
    confirmed: [],
  };
}

/* ---------- 整理（自動保存、專案檔讀回） ---------- */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const ref = (v: unknown): string | null => (v ? String(v) : null);

const ENTRY_KINDS: readonly EntryKind[] = ['speaker', 'unknown', 'narration', 'heading'];

export function cleanEntry(v: unknown): Entry {
  const e = isObj(v) ? v : {};
  const line = typeof e.line === 'number' && Number.isFinite(e.line) && e.line > 0 ? e.line : null;
  return {
    kind: ENTRY_KINDS.includes(e.kind as EntryKind) ? (e.kind as EntryKind) : 'narration',
    title: str(e.title),
    text: str(e.text),
    speakerId: e.speakerId ? String(e.speakerId) : null,
    face: str(e.face),
    line,
    titleCustom: !!e.titleCustom,
    image: e.image ? String(e.image) : 'auto',
  };
}

export const cleanEntries = (v: unknown): Entry[] =>
  Array.isArray(v) ? v.filter(isObj).map(cleanEntry) : [];

export function cleanOpts(v: unknown): Opts {
  const o = isObj(v) ? v : {};
  const d = defaultOpts();
  return {
    mode: o.mode === 'heading' ? 'heading' : d.mode,
    unit: o.unit === 'block' ? 'block' : d.unit,
    style: o.style === 'quote' || o.style === 'colon' ? o.style : d.style,
    keepQuotes: typeof o.keepQuotes === 'boolean' ? o.keepQuotes : d.keepQuotes,
    narration: o.narration === 'skip' ? 'skip' : d.narration,
    narratorName: typeof o.narratorName === 'string' ? o.narratorName : d.narratorName,
    faceInTitle: typeof o.faceInTitle === 'boolean' ? o.faceInTitle : d.faceInTitle,
  };
}

export function cleanImage(v: unknown): ShelfImage | null {
  if (!isObj(v) || !v.id) return null;
  const base = { id: String(v.id), name: str(v.name), credit: str(v.credit) };
  if (v.kind === 'url') return v.url ? { ...base, kind: 'url', url: String(v.url) } : null;
  if (v.kind === 'file' && v.asset) {
    return {
      ...base,
      kind: 'file',
      asset: String(v.asset),
      type: str(v.type),
      size: Number(v.size) || 0,
    };
  }
  return null;
}

export function cleanSpeaker(v: unknown): Speaker {
  const s = isObj(v) ? v : {};
  return {
    id: s.id ? String(s.id) : uid('s'),
    name: str(s.name),
    aliases: str(s.aliases),
    imageId: ref(s.imageId),
    faces: Array.isArray(s.faces)
      ? s.faces.filter(isObj).map((f) => ({
          id: f.id ? String(f.id) : uid('f'),
          label: str(f.label),
          imageId: ref(f.imageId),
        }))
      : [],
  };
}

export function cleanBatch(v: unknown): Batch | null {
  if (!isObj(v)) return null;
  return {
    id: v.id ? String(v.id) : uid('b'),
    mode: v.mode === 'heading' ? 'heading' : 'script',
    label: str(v.label),
    script: str(v.script),
    opts: cleanOpts(v.opts),
    entries: cleanEntries(v.entries),
    edited: !!v.edited,
  };
}

/** 存檔、專案檔讀回時整理（不是物件時回到預設；缺的欄位補預設；說話者不是陣列時用預設的兩位） */
export function cleanDoc(v: unknown): Doc {
  const d = defaultDoc();
  if (!isObj(v)) return d;
  return {
    images: Array.isArray(v.images)
      ? v.images.map(cleanImage).filter((x): x is ShelfImage => !!x)
      : [],
    speakers: Array.isArray(v.speakers) ? v.speakers.map(cleanSpeaker) : d.speakers,
    script: str(v.script),
    opts: cleanOpts(v.opts),
    edited: Array.isArray(v.edited) ? cleanEntries(v.edited) : null,
    confirmed: Array.isArray(v.confirmed)
      ? v.confirmed.map(cleanBatch).filter((x): x is Batch => !!x)
      : [],
  };
}

/* ---------- 小工具 ---------- */

/** 去掉副檔名；空白時 fallback */
export function baseName(fileName: string, fallback = '圖片'): string {
  return String(fileName || '').replace(/\.[^.]+$/, '') || fallback;
}

/** 網址的圖的名稱：路徑最後一段（解碼、去副檔名）；沒有時 fallback */
export function urlImageName(url: string, fallback = '網址的圖片'): string {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop();
    return last ? baseName(decodeURIComponent(last), fallback) : fallback;
  } catch {
    return fallback;
  }
}

/** 網址的格式：https:// 開頭、沒有空白字元 */
export const isImageUrl = (url: string): boolean => /^https:\/\/\S+$/.test(url);

/** 大小的寫法：未滿 1 MiB「n KB」（至少 1），其餘「x.x MB」 */
export function sizeText(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 摘要：連續空白換成一個、去頭尾，超過 n 字時切掉加「…」 */
export function snippet(s: string, n: number): string {
  const t = String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = Array.from(t);
  return chars.length > n ? `${chars.slice(0, n).join('')}…` : t;
}

/** 檔名用的時間：YYYYMMDD-HHMM（當地時間） */
export function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export const isTooBig = (img: ShelfImage | null | undefined): boolean =>
  !!img && img.kind === 'file' && img.size > MAX_IMAGE_BYTES;
