/**
 * 劇本心得九宮格的資料與規則（純函式，Node 可測）：個人資料、格子（圖片、規則、劇本名稱、作者、心得標籤、感想）、
 * 心得標籤清單、排列與圖片比例；整理存檔、標籤的增刪改、一次放入多張圖片的分配。規格：docs/refactor/specs/review-grid.md。
 */

export type ViewMode = 'grid' | 'list';
export const VIEW_MODES: readonly ViewMode[] = ['grid', 'list'];

export type ImageRatio = 'square' | 'original';
export const IMAGE_RATIOS: readonly ImageRatio[] = ['square', 'original'];

/** 圖片（存在資產庫，狀態只記 id 與原始大小） */
export interface ImageRef {
  id: string;
  /** 原檔名 */
  name: string;
  width: number;
  height: number;
}

export interface Profile {
  image: ImageRef | null;
  /** 暱稱 */
  name: string;
  /** 帳號或一句話 */
  handle: string;
}

export interface Cell {
  id: string;
  image: ImageRef | null;
  /** 規則（系統） */
  rule: string;
  /** 劇本名稱 */
  title: string;
  /** 作者 */
  writer: string;
  /** 心得標籤（文字，依選取的順序，最多 LIMITS.tagsPerCell 個） */
  tags: string[];
  /** 感想（只畫在清單裡） */
  comment: string;
}

export interface ReviewState {
  view: ViewMode;
  ratio: ImageRatio;
  profile: Profile;
  cells: Cell[];
  /** 心得標籤清單（選項；可以改） */
  tags: string[];
}

export const LIMITS = {
  cells: 30,
  tagsPerCell: 3,
  tagList: 40,
  tag: 20,
  name: 30,
  handle: 40,
  rule: 20,
  title: 60,
  writer: 30,
  comment: 500,
} as const;

/** 開頁的格數 */
export const DEFAULT_CELLS = 9;

/** 圖片長邊超過時先縮小再存 */
export const IMAGE_MAX_SIDE = 1024;

/** 預設的心得標籤（本站自寫，台灣跑團的說法） */
export const DEFAULT_TAGS: readonly string[] = [
  '劇情完成度超高',
  '神展開連發',
  '結局反轉嚇到我',
  '伏筆收得漂亮',
  '笑到肚子痛',
  '一路發糖好甜',
  '被刀到體無完膚',
  '恐怖到不敢關燈',
  '推理超燒腦',
  '戰鬥打得超爽',
  'NPC 讓人念念不忘',
  'PC 成長了好多',
  '跑完真的哭了',
  '後勁超強',
  '想失憶再跑一次',
  '短團也很過癮',
  '適合長團慢慢跑',
  '新手也能放心玩',
  '總之就是我的菜',
  '強力推坑！',
];

/** 規則欄的建議（選填，照打也可以） */
export const RULE_SUGGESTIONS: readonly string[] = [
  'CoC 7版',
  'CoC 6版',
  'DX3rd',
  'Emoklore',
  '忍神',
  'Insane',
  'SW2.5',
  'D&D 5e',
];

/* ---------- 小工具 ---------- */

/** 以字元（碼位）截字 */
export const clipText = (s: string, n: number): string => Array.from(s).slice(0, n).join('');

/** 單行欄位：換行換成空白、截字 */
export const oneLine = (s: string, n: number): string => clipText(s.replace(/\r\n?|\n/g, ' '), n);

/** 下一個沒用過的 id（prefix + 數字） */
export function nextId(prefix: string, items: readonly { id: string }[]): string {
  let n = 0;
  const re = new RegExp(`^${prefix}(\\d+)$`);
  for (const it of items) {
    const m = re.exec(it.id);
    if (m) n = Math.max(n, Number(m[1]));
  }
  return `${prefix}${n + 1}`;
}

export function emptyCell(id: string): Cell {
  return { id, image: null, rule: '', title: '', writer: '', tags: [], comment: '' };
}

export function initialState(): ReviewState {
  return {
    view: 'grid',
    ratio: 'square',
    profile: { image: null, name: '', handle: '' },
    cells: Array.from({ length: DEFAULT_CELLS }, (_, i) => emptyCell(`c${i + 1}`)),
    tags: [...DEFAULT_TAGS],
  };
}

/** 一格有沒有任何內容 */
export const cellIsEmpty = (c: Cell): boolean =>
  !c.image &&
  !c.rule.trim() &&
  !c.title.trim() &&
  !c.writer.trim() &&
  !c.tags.length &&
  !c.comment.trim();

/** 狀態裡用到的圖片 id */
export const imageIds = (d: Pick<ReviewState, 'profile' | 'cells'>): string[] => {
  const out: string[] = [];
  if (d.profile.image) out.push(d.profile.image.id);
  for (const c of d.cells) if (c.image) out.push(c.image.id);
  return out;
};

/** 檔名 → 去掉最後的副檔名 */
export function nameFromFile(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(0, i) : base;
}

/* ---------- 心得標籤 ---------- */

/** 標籤的寫法：去頭尾空白、換行換成空白、截字 */
export const cleanTag = (s: string): string => oneLine(s.trim(), LIMITS.tag).trim();

export type TagToggle = 'added' | 'removed' | 'full';

/** 一格的標籤：有就拿掉，沒有就加在最後（滿了時不變） */
export function toggleTag(
  tags: readonly string[],
  tag: string,
): { tags: string[]; result: TagToggle } {
  if (tags.includes(tag)) return { tags: tags.filter((t) => t !== tag), result: 'removed' };
  if (tags.length >= LIMITS.tagsPerCell) return { tags: [...tags], result: 'full' };
  return { tags: [...tags, tag], result: 'added' };
}

export type TagEditError = 'empty' | 'duplicate' | 'full';

/** 新增標籤到清單的最後（回傳錯誤或新的清單） */
export function addTagTo(list: readonly string[], raw: string): TagEditError | string[] {
  const t = cleanTag(raw);
  if (!t) return 'empty';
  if (list.includes(t)) return 'duplicate';
  if (list.length >= LIMITS.tagList) return 'full';
  return [...list, t];
}

/**
 * 改標籤的文字：清單裡換掉，用到它的格子也跟著換（同一格已經有新的文字時只留一個）。
 * 回傳錯誤或新的狀態（不改傳進來的物件）。
 */
export function renameTagIn(
  d: Pick<ReviewState, 'tags' | 'cells'>,
  index: number,
  raw: string,
): Exclude<TagEditError, 'full'> | { tags: string[]; cells: Cell[] } {
  const old = d.tags[index];
  if (old === undefined) return 'empty';
  const t = cleanTag(raw);
  if (!t) return 'empty';
  if (t === old) return { tags: [...d.tags], cells: d.cells.map((c) => ({ ...c })) };
  if (d.tags.includes(t)) return 'duplicate';
  const tags = d.tags.map((x, i) => (i === index ? t : x));
  const cells = d.cells.map((c) =>
    c.tags.includes(old)
      ? { ...c, tags: [...new Set(c.tags.map((x) => (x === old ? t : x)))] }
      : { ...c },
  );
  return { tags, cells };
}

/** 有幾格用了這個標籤 */
export const tagUsage = (cells: readonly Cell[], tag: string): number =>
  cells.filter((c) => c.tags.includes(tag)).length;

/** 從清單刪掉一個標籤，用到它的格子一起拿掉 */
export function deleteTagIn(
  d: Pick<ReviewState, 'tags' | 'cells'>,
  index: number,
): { tags: string[]; cells: Cell[] } {
  const old = d.tags[index];
  return {
    tags: d.tags.filter((_, i) => i !== index),
    cells: d.cells.map((c) =>
      old !== undefined && c.tags.includes(old)
        ? { ...c, tags: c.tags.filter((t) => t !== old) }
        : { ...c },
    ),
  };
}

/* ---------- 一次放入多張圖片 ---------- */

/**
 * n 張圖片要放進哪幾格：有指定的格子時第一張放那一格，其餘依序放進它後面還沒有圖片的格子；
 * 沒有指定時從頭依序放進沒有圖片的格子。不夠時在最後加新的格子（到上限為止）。
 * 回傳 `targets`（既有格子的索引）與 `added`（要加幾格）；放不下的張數在 `dropped`。
 */
export function planImageFill(
  cells: readonly Pick<Cell, 'image'>[],
  n: number,
  startIndex: number | null,
  limit: number = LIMITS.cells,
): { targets: number[]; added: number; dropped: number } {
  const targets: number[] = [];
  let i = 0;
  if (startIndex !== null && startIndex >= 0 && startIndex < cells.length && n > 0) {
    targets.push(startIndex);
    i = startIndex + 1;
  }
  for (; i < cells.length && targets.length < n; i++) if (!cells[i].image) targets.push(i);
  const rest = n - targets.length;
  const added = Math.max(0, Math.min(rest, limit - cells.length));
  return { targets, added, dropped: rest - added };
}

/* ---------- 整理存檔（自動儲存、專案檔、復原） ---------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, n: number): string => (typeof v === 'string' ? clipText(v, n) : '');
const line = (v: unknown, n: number): string => (typeof v === 'string' ? oneLine(v, n) : '');

export function normalizeImage(raw: unknown): ImageRef | null {
  if (!isObj(raw)) return null;
  const w = typeof raw.width === 'number' && Number.isFinite(raw.width) ? raw.width : 0;
  const h = typeof raw.height === 'number' && Number.isFinite(raw.height) ? raw.height : 0;
  if (typeof raw.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(raw.id)) return null;
  if (w < 1 || h < 1) return null;
  return { id: raw.id, name: str(raw.name, 200), width: Math.round(w), height: Math.round(h) };
}

function normalizeTags(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t !== 'string') continue;
    const c = cleanTag(t);
    if (c && !out.includes(c)) out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

export function normalizeCell(raw: unknown, id: string): Cell {
  const c = isObj(raw) ? raw : {};
  return {
    id,
    image: normalizeImage(c.image),
    rule: line(c.rule, LIMITS.rule),
    title: line(c.title, LIMITS.title),
    writer: line(c.writer, LIMITS.writer),
    tags: normalizeTags(c.tags, LIMITS.tagsPerCell),
    comment: str(c.comment, LIMITS.comment).replace(/\r\n?/g, '\n'),
  };
}

/** 存檔可能缺欄位或被改壞：整理成可以用的狀態 */
export function normalizeState(raw: unknown): ReviewState {
  const d = isObj(raw) ? raw : {};
  const base = initialState();
  const p = isObj(d.profile) ? d.profile : {};
  const cells: Cell[] = [];
  const seen = new Set<string>();
  if (Array.isArray(d.cells)) {
    for (const rc of d.cells.slice(0, LIMITS.cells)) {
      const rid = isObj(rc) && typeof rc.id === 'string' && /^c\d{1,6}$/.test(rc.id) ? rc.id : '';
      const id = rid && !seen.has(rid) ? rid : '';
      const cell = normalizeCell(rc, id);
      cells.push(cell);
      if (id) seen.add(id);
    }
  }
  /* id 缺的、重複的重新編 */
  for (const c of cells) if (!c.id) c.id = nextId('c', cells);
  const tags = Array.isArray(d.tags) ? normalizeTags(d.tags, LIMITS.tagList) : base.tags;
  return {
    view: VIEW_MODES.includes(d.view as ViewMode) ? (d.view as ViewMode) : base.view,
    ratio: IMAGE_RATIOS.includes(d.ratio as ImageRatio) ? (d.ratio as ImageRatio) : base.ratio,
    profile: {
      image: normalizeImage(p.image),
      name: line(p.name, LIMITS.name),
      handle: line(p.handle, LIMITS.handle),
    },
    cells: cells.length ? cells : base.cells,
    tags,
  };
}
