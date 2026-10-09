/**
 * 由狀態算出來的東西（不依賴 React）：目前的清單（手動修改中用固定的清單，否則從文字解析）、查詢工具。
 * 同樣的輸入回傳同一個結果（元件與動作都用它，不會重算）。
 */
import { cleanEntry, type Doc, type Entry } from './model';
import { type ParsedEntry, parseScenario } from './parse';
import { createLookup, type Lookup } from './resolve';

/** 清單的一則（從文字解析的多了台本上的寫法） */
export type ListEntry = Entry & Partial<Pick<ParsedEntry, 'name' | 'bare'>>;

let lastParse: {
  script: string;
  speakers: Doc['speakers'];
  opts: Doc['opts'];
  out: ParsedEntry[];
} | null = null;

/** 目前的清單 */
export function entriesOf(doc: Doc): readonly ListEntry[] {
  if (doc.edited) return doc.edited;
  const p = lastParse;
  if (p && p.script === doc.script && p.speakers === doc.speakers && p.opts === doc.opts) {
    return p.out;
  }
  const out = parseScenario(doc.script, doc.speakers, doc.opts);
  lastParse = { script: doc.script, speakers: doc.speakers, opts: doc.opts, out };
  return out;
}

let lastLookup: {
  images: Doc['images'];
  speakers: Doc['speakers'];
  opts: Doc['opts'];
  L: Lookup;
} | null = null;

/** 依目前的圖片庫、說話者、讀取方式查詢 */
export function lookupOf(doc: Pick<Doc, 'images' | 'speakers' | 'opts'>): Lookup {
  const p = lastLookup;
  if (p && p.images === doc.images && p.speakers === doc.speakers && p.opts === doc.opts)
    return p.L;
  const L = createLookup(doc);
  lastLookup = { images: doc.images, speakers: doc.speakers, opts: doc.opts, L };
  return L;
}

/**
 * 手動修改的第一步：把目前的清單（base，在 Immer 的 recipe 外面用 entriesOf 算好）複製下來固定。
 * d 是 Immer 的 draft。
 */
export function ensureEdited(d: Doc, base: readonly ListEntry[]): Entry[] {
  if (!d.edited) d.edited = base.map(cleanEntry);
  return d.edited;
}

/** 已確定＋目前的清單（匯出、打包的順序） */
export function allEntries(doc: Doc): ListEntry[] {
  return [...doc.confirmed.flatMap((b) => b.entries), ...entriesOf(doc)];
}
