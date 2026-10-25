/**
 * 手冊的編號與變數（規格 1.13、3.16；原作 v3.8.0～v3.9.0，CC0）：
 * 變數清單（手冊的編號、登錄的名稱、原稿裡寫到的 HO＋數字）、還沒登錄的名稱、
 * 把 HTML 裡的 {名稱} 包成顯示預設值的標記（紙面、列印、PDF、匯出共用）。
 * 這裡的函式不依賴 DOM。
 */
import { allBlocks } from './blocks';
import { escapeHtml } from './text';
import type { Block, Doc, DocVar, Handout } from './types';

/** 變數名稱：英數字、底線、假名、漢字 1～16 字（同原作） */
export const VAR_NAME_RE = /^[A-Za-z0-9_぀-ヿ一-鿿]{1,16}$/;
/** 頁尾的代號，不能當變數名稱 */
export const VAR_RESERVED: readonly string[] = ['title', 'page', 'total'];

export const isVarName = (n: unknown): boolean =>
  typeof n === 'string' && VAR_NAME_RE.test(n) && !VAR_RESERVED.includes(n);

/** 文字裡的 {名稱}（名稱符合規則的） */
const REF_RE = /\{([A-Za-z0-9_぀-ヿ一-鿿]{1,16})\}/g;
/** 文字裡的 {HO＋1～3 位數字} */
const HO_REF_RE = /\{(HO\d{1,3})\}/g;

/* ---------- 讀入時的整理（3.1.3） ---------- */

/** 登錄的變數：名稱去頭尾空白，名稱空白、與前面同名的不收 */
export function cleanVars(a: unknown): DocVar[] {
  const seen = new Set<string>();
  const out: DocVar[] = [];
  for (const v of Array.isArray(a) ? a : []) {
    const o = (v && typeof v === 'object' ? v : {}) as Partial<DocVar>;
    const n = String(o.n ?? '').trim();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push({ n, def: String(o.def ?? ''), note: String(o.note ?? '') });
  }
  return out;
}

/** 補齊手冊的資料（編號、題名；原作 v3.8.0 的其他欄位原樣保留）。不自動編號（見 numberHandouts） */
export function ensureHo(b: Block): Handout {
  if (!b.ho || typeof b.ho !== 'object') b.ho = { no: '', ttl: '' };
  const h = b.ho as Handout;
  h.no = String(h.no ?? '').trim();
  h.ttl = String(h.ttl ?? '');
  return h;
}

/** 讀取用（不修改段落） */
export function hoOf(b: Block): Handout {
  const h = b.ho && typeof b.ho === 'object' ? b.ho : null;
  return { ...(h ?? {}), no: String(h?.no ?? '').trim(), ttl: String(h?.ttl ?? '') };
}

const handouts = (doc: Pick<Doc, 'blocks'>): Block[] =>
  allBlocks(doc).filter((b) => b.type === 'handout');

/** 還沒用的最小的 HO 編號（HO1、HO2…） */
export function nextHoNo(used: ReadonlySet<string>): string {
  let n = 1;
  while (used.has(`HO${n}`)) n++;
  return `HO${n}`;
}

/**
 * 手冊的編號：不符合規則（含空白）的依原稿順序自動編號（其他手冊還沒用的最小 HO 編號；F252）。
 * 重複的編號不改（同原作）。就地修改。
 */
export function numberHandouts(doc: Pick<Doc, 'blocks'>): void {
  const list = handouts(doc);
  if (!list.length) return;
  for (const b of list) ensureHo(b);
  for (const b of list) {
    const h = b.ho as Handout;
    if (isVarName(h.no)) continue;
    const used = new Set(list.filter((x) => x !== b).map((x) => (x.ho as Handout).no));
    h.no = nextHoNo(used);
  }
}

/**
 * 複製、貼上的手冊（fresh 裡的段落與其巢狀的段落）：編號和原稿裡別的手冊重複時換成新的編號（D3）。
 * fresh 必須已經放進 doc。就地修改。
 */
export function freshHandoutNumbers(doc: Pick<Doc, 'blocks'>, fresh: readonly Block[]): void {
  const freshSet = new Set<Block>();
  for (const b of fresh) for (const x of allBlocks({ blocks: [b] })) freshSet.add(x);
  const list = handouts(doc);
  const kept = new Set(list.filter((x) => !freshSet.has(x)).map((x) => hoOf(x).no));
  for (const b of list) {
    if (!freshSet.has(b)) continue;
    const h = ensureHo(b);
    if (isVarName(h.no) && !kept.has(h.no)) kept.add(h.no);
    else h.no = '';
  }
  numberHandouts(doc);
}

/* ---------- 變數清單（F254、3.16） ---------- */

export type VarSource = 'ho' | 'reg' | 'auto';

export interface VarItem {
  n: string;
  /** 預設值（空白＝顯示名稱） */
  def: string;
  /** 說明 */
  note: string;
  /** 來源：手冊、登錄、原稿裡寫到的 HO＋數字 */
  src: VarSource;
  /** 手冊的題名（src＝ho 時） */
  ttl?: string;
  /** 手冊段落的 id（src＝ho 時） */
  id?: string;
}

const DATA_KEYS = new Set(['img', 'art', 'data']);

/** 段落裡所有的文字欄位（含巢狀；略過圖片、立繪、字型的 data URL；D8） */
export function blockStrings(doc: Pick<Doc, 'blocks'>): string[] {
  const out: string[] = [];
  const walk = (v: unknown, key: string): void => {
    if (typeof v === 'string') {
      if (!DATA_KEYS.has(key) && !v.startsWith('data:')) out.push(v);
      return;
    }
    if (!v || typeof v !== 'object' || DATA_KEYS.has(key)) return;
    if (Array.isArray(v)) {
      for (const x of v) walk(x, key);
      return;
    }
    for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(doc.blocks, '');
  return out;
}

const hoNum = (n: string): number => {
  const m = /^HO(\d+)$/.exec(n);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
};

/** 手冊變數的說明（匯出 HTML 的輸入欄下方） */
export const hoNote = (ttl: string): string =>
  ttl.trim() ? `手冊「${ttl.trim()}」的 PC` : '手冊的 PC';

/** 變數清單：手冊的編號 → 登錄的 → 原稿裡寫到的 HO＋數字；最後 HO＋數字依數字排在前面 */
export function varList(doc: Pick<Doc, 'blocks' | 'vars'>): VarItem[] {
  const out: VarItem[] = [];
  const seen = new Set<string>();
  for (const b of handouts(doc)) {
    const h = hoOf(b);
    if (!isVarName(h.no) || seen.has(h.no)) continue;
    seen.add(h.no);
    /* 說明：手冊自己寫的（第三批，上游 v3.10.2），沒有時「手冊「題名」的 PC」 */
    out.push({
      n: h.no,
      def: String(h.def ?? ''),
      note: String(h.note ?? '').trim() || hoNote(h.ttl),
      src: 'ho',
      ttl: h.ttl,
      id: b.id,
    });
  }
  for (const v of Array.isArray(doc.vars) ? doc.vars : []) {
    const n = String(v?.n ?? '').trim();
    if (!isVarName(n) || seen.has(n)) continue;
    seen.add(n);
    out.push({ n, def: String(v.def ?? ''), note: String(v.note ?? ''), src: 'reg' });
  }
  for (const s of blockStrings(doc)) {
    if (s.indexOf('{') < 0) continue;
    for (const m of s.matchAll(HO_REF_RE)) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      out.push({ n: m[1], def: '', note: hoNote(''), src: 'auto' });
    }
  }
  return out
    .map((v, i) => ({ v, i }))
    .sort((a, b) => hoNum(a.v.n) - hoNum(b.v.n) || a.i - b.i)
    .map((x) => x.v);
}

/** 原稿裡寫到、還沒登錄的名稱（F256；出現的順序、同名一次） */
export function varCandidates(doc: Pick<Doc, 'blocks' | 'vars'>): string[] {
  const reg = new Set(varList(doc).map((v) => v.n));
  const out: string[] = [];
  for (const s of blockStrings(doc)) {
    if (s.indexOf('{') < 0) continue;
    for (const m of s.matchAll(REF_RE)) {
      const n = m[1];
      if (reg.has(n) || VAR_RESERVED.includes(n) || out.includes(n)) continue;
      out.push(n);
    }
  }
  return out;
}

/* ---------- 顯示（F257、3.9） ---------- */

export interface VarView {
  /** 名稱 → 變數 */
  by: ReadonlyMap<string, VarItem>;
  /** 比對 {名稱}（全域旗標；用之前把 lastIndex 歸零） */
  re: RegExp;
  list: readonly VarItem[];
}

const viewCache = new WeakMap<object, VarView | null>();

/** 原稿的變數（沒有變數時 null）。以原稿物件快取（Immer 每次修改都是新的物件） */
export function varView(doc: Pick<Doc, 'blocks' | 'vars'>): VarView | null {
  if (viewCache.has(doc)) return viewCache.get(doc) ?? null;
  const list = varList(doc);
  const v: VarView | null = list.length
    ? {
        list,
        by: new Map(list.map((x) => [x.n, x])),
        re: new RegExp(`\\{(${list.map((x) => x.n).join('|')})\\}`, 'g'),
      }
    : null;
  viewCache.set(doc, v);
  return v;
}

/** 還沒填值時顯示的字：預設值，沒有時名稱 */
export const varShown = (v: Pick<VarItem, 'n' | 'def'>): string => v.def || v.n;

/** 純文字裡的 {名稱} 換成預設值（頁面一覽的標題等） */
export function varPlain(text: string, view: VarView | null): string {
  if (!view || text.indexOf('{') < 0) return text;
  view.re.lastIndex = 0;
  return text.replace(view.re, (_m, n: string) => {
    const v = view.by.get(n);
    return v ? varShown(v) : _m;
  });
}

/** 一個變數的標記（還沒填值的樣子） */
export const varSpan = (v: Pick<VarItem, 'n' | 'def'>): string =>
  `<span class="tvar unset" data-v="${escapeHtml(v.n)}">${escapeHtml(varShown(v))}</span>`;

/** 不包的元素（裡面的字照原樣）：腳本、樣式、文字欄、SVG */
const SKIP_TAGS = ['script', 'style', 'textarea', 'svg'];

/**
 * HTML 字串裡文字部分的 {名稱} 包成 <span class="tvar unset" data-v="名稱">預設值或名稱</span>。
 * 標籤（含屬性值）、SKIP_TAGS 的內容、已經包好的標記不動，所以重複呼叫結果相同。
 * 輸入必須是本工具產生的 HTML（文字都已跳脫、屬性值裡沒有「>」）。
 */
export function wrapVarsHtml(html: string, view: VarView | null): string {
  if (!view || html.indexOf('{') < 0) return html;
  const tagRe = /<[^>]*>/g;
  let out = '';
  let last = 0;
  let skip: string | null = null;
  let inVar = false;
  const text = (s: string) => {
    if (skip || inVar || s.indexOf('{') < 0) return s;
    view.re.lastIndex = 0;
    return s.replace(view.re, (m, n: string) => {
      const v = view.by.get(n);
      return v ? varSpan(v) : m;
    });
  };
  for (let m = tagRe.exec(html); m; m = tagRe.exec(html)) {
    out += text(html.slice(last, m.index));
    const tag = m[0];
    out += tag;
    last = m.index + tag.length;
    const name = (/^<\/?([a-zA-Z][\w-]*)/.exec(tag)?.[1] ?? '').toLowerCase();
    const closing = tag.startsWith('</');
    if (skip) {
      if (closing && name === skip) skip = null;
      continue;
    }
    if (inVar) {
      if (closing && name === 'span') inVar = false;
      continue;
    }
    if (!closing && SKIP_TAGS.includes(name) && !tag.endsWith('/>')) skip = name;
    else if (!closing && name === 'span' && /\bclass="tvar[\s"]/.test(tag)) inVar = true;
  }
  out += text(html.slice(last));
  return out;
}
