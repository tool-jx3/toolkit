/**
 * 標題與圖片的規則（規格 3.3）、從圖片庫建立差分（3.4）、圖片的使用情形——都依目前的說話者與圖片庫決定，
 * 不依賴 React。
 */
import {
  type Doc,
  type Entry,
  type Face,
  newFace,
  type Opts,
  type ShelfImage,
  type Speaker,
} from './model';
import { aliasesOf, key } from './parse';

/** 「名（差分）」（全形括號） */
export const withFace = (title: string, face: string): string => `${title}（${face}）`;

/** 說話者裡 key 相同的差分 */
export function findFace(speaker: Speaker | null | undefined, label: string): Face | null {
  if (!speaker || !label) return null;
  return speaker.faces.find((f) => key(f.label) === key(label)) ?? null;
}

/** 依目前狀態查詢的工具：說話者、圖片、同名的圖 */
export interface Lookup {
  opts: Pick<Opts, 'faceInTitle'>;
  speaker(id: string | null | undefined): Speaker | null;
  image(id: string | null | undefined): ShelfImage | null;
  /** 圖片庫裡 key 相同的第一張 */
  imageByName(name: string): ShelfImage | null;
}

export function createLookup(doc: Pick<Doc, 'images' | 'speakers' | 'opts'>): Lookup {
  const speakers = new Map(doc.speakers.map((s) => [s.id, s]));
  const images = new Map(doc.images.map((im) => [im.id, im]));
  const byName = new Map<string, ShelfImage>();
  for (const im of doc.images) {
    const k = key(im.name);
    if (k && !byName.has(k)) byName.set(k, im);
  }
  return {
    opts: doc.opts,
    speaker: (id) => (id ? (speakers.get(id) ?? null) : null),
    image: (id) => (id ? (images.get(id) ?? null) : null),
    imageByName: (name) => byName.get(key(name)) ?? null,
  };
}

/** 畫面上（送出時）的標題：手動標題原樣；有說話者、差分而且開了「差分名稱加進標題」時「名（差分）」 */
export function titleOf(e: Entry, L: Lookup): string {
  return !e.titleCustom && e.face && e.speakerId && L.opts.faceInTitle
    ? withFace(e.title, e.face)
    : e.title;
}

/** 這則送出時的圖（規格 3.3 的順序） */
export function imageOf(e: Entry, L: Lookup): ShelfImage | null {
  if (e.image === 'none') return null;
  if (e.image && e.image !== 'auto') return L.image(e.image);
  const sp = L.speaker(e.speakerId);
  if (sp) {
    const own = L.image(findFace(sp, e.face)?.imageId) ?? L.image(sp.imageId);
    if (own) return own;
  }
  return L.imageByName(titleOf(e, L)) ?? L.imageByName(e.title);
}

/** 差分沒有登錄（說話者在、差分不在） */
export function faceMissing(e: Entry, L: Lookup): boolean {
  if (!e.face || !e.speakerId) return false;
  const sp = L.speaker(e.speakerId);
  return !!sp && !findFace(sp, e.face);
}

/** 清單裡還沒登錄的差分（說話者＋差分只列一次） */
export function missingFaces(
  entries: readonly Entry[],
  L: Lookup,
): { speaker: Speaker; face: string }[] {
  const seen = new Set<string>();
  const out: { speaker: Speaker; face: string }[] = [];
  for (const e of entries) {
    if (!faceMissing(e, L)) continue;
    const k = `${e.speakerId}\u0000${key(e.face)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ speaker: L.speaker(e.speakerId) as Speaker, face: e.face });
  }
  return out;
}

/* ---------- 圖片的使用情形 ---------- */

/** 用到某張圖的地方（刪除前的確認）：說話者與差分的名稱、個別指定這張的劇本文字幾則 */
export function usesOf(
  doc: Pick<Doc, 'speakers' | 'edited' | 'confirmed'>,
  imageId: string,
  labels: { noName: string; face: string },
): { names: string[]; count: number } {
  const names: string[] = [];
  for (const sp of doc.speakers) {
    const n = sp.name || labels.noName;
    if (sp.imageId === imageId) names.push(n);
    for (const f of sp.faces)
      if (f.imageId === imageId) names.push(withFace(n, f.label || labels.face));
  }
  const lists = [doc.edited ?? [], ...doc.confirmed.map((b) => b.entries)];
  const count = lists.reduce((n, list) => n + list.filter((e) => e.image === imageId).length, 0);
  return { names, count };
}

/** 刪掉一張圖時，把用到的地方改成「沒有圖」（直接改 doc，給 Immer 的 draft 用） */
export function detachImage(doc: Doc, imageId: string): void {
  for (const sp of doc.speakers) {
    if (sp.imageId === imageId) sp.imageId = null;
    for (const f of sp.faces) if (f.imageId === imageId) f.imageId = null;
  }
  for (const list of [doc.edited ?? [], ...doc.confirmed.map((b) => b.entries)]) {
    for (const e of list) if (e.image === imageId) e.image = 'none';
  }
  doc.images = doc.images.filter((im) => im.id !== imageId);
}

/** 圖片 id → （畫面上的標題 → 次數），只算有圖的則 */
export function usageMap(
  entries: readonly Entry[],
  L: Lookup,
  emptyTitle: string,
): Map<string, Map<string, number>> {
  const use = new Map<string, Map<string, number>>();
  for (const e of entries) {
    const im = imageOf(e, L);
    if (!im) continue;
    const title = titleOf(e, L) || emptyTitle;
    let m = use.get(im.id);
    if (!m) {
      m = new Map();
      use.set(im.id, m);
    }
    m.set(title, (m.get(title) ?? 0) + 1);
  }
  return use;
}

/* ---------- 從圖片庫建立差分（規格 3.4） ---------- */

/** 名字和差分之間的分隔（key 已把全形換成半形） */
const FACE_SEP = /^[\s_\-－@＠（(：:]+/;

export interface FacesFromNamesResult {
  /** 新建的差分 */
  made: Face[];
  /** 設成立繪的圖（原本沒有立繪時） */
  portrait: string | null;
  /** 名字相符的圖有幾張（含已經建好的） */
  found: number;
}

/**
 * 依圖片名稱找出說話者的差分與立繪（不改 speaker；呼叫端套用結果）。
 * 名稱與其他寫法由長到短比對：等於寫法 → 立繪；寫法＋分隔＋差分名 → 差分。
 */
export function facesFromNames(
  speaker: Speaker,
  images: readonly ShelfImage[],
): FacesFromNamesResult {
  const names = aliasesOf(speaker).sort((a, b) => b.length - a.length);
  const made: Face[] = [];
  let portrait: string | null = null;
  let found = 0;
  if (!names.length) return { made, portrait, found };
  const has = (label: string) =>
    !!findFace(speaker, label) || made.some((f) => key(f.label) === key(label));
  for (const im of images) {
    const n = key(im.name);
    const a = names.find((x) => n === x || n.startsWith(x));
    if (!a) continue;
    if (n === a) {
      found++;
      if (!speaker.imageId && !portrait) portrait = im.id;
      continue;
    }
    const rest = n.slice(a.length);
    if (!FACE_SEP.test(rest)) continue;
    const label = rest
      .replace(FACE_SEP, '')
      .replace(/[）)]+$/, '')
      .trim();
    if (!label) continue;
    found++;
    if (has(label)) continue;
    made.push(newFace(label, im.id));
  }
  return { made, portrait, found };
}
