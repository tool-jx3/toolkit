/**
 * 讀原作存的檔案（規格 3.9）：只解析與換算，不碰 DOM、資產庫（單元測試直接用）；圖片的 data URL 另外列出，
 * 由 legacyImport.ts 放進圖片庫後再整理成狀態。
 * - 原作 R（關係圖）「存成專案」的 JSON：{ title, legends, connections, showNames, images: [{ name, src, x, y }] }；
 * - 原作 Q（四象限）「全部專案備份」的備份碼：整份狀態的 JSON 以 UTF-8 轉成 Base64。
 */
import {
  type Character,
  type ChartState,
  clipText,
  DEFAULT_RELATION_TITLE,
  initialState,
  type Legend,
  LIMITS,
  type Link,
  normalizeColor,
  normalizeState,
  PALETTE,
  type Point,
  type QuadPage,
} from './model';

export class LegacyFileError extends Error {}

export interface LegacyImport {
  kind: 'relation' | 'quadrant';
  /** 整理好的狀態（圖片還沒放進去：image 都是 null） */
  state: ChartState;
  /** 角色的索引 → 圖片的 data URL（有圖片的角色才有） */
  images: Map<number, string>;
  /** 原作 Q 的目前的頁 */
  page: number;
  /** 超過上限沒有讀進來的角色數 */
  dropped: number;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const imageUrl = (v: unknown): string | null =>
  typeof v === 'string' && /^data:image\/[a-z0-9.+-]+(;[^,]*)?,/i.test(v) ? v : null;

const character = (i: number, name: string, color?: unknown): Character => ({
  id: `c${i + 1}`,
  name: clipText(name.trim(), LIMITS.name),
  color: normalizeColor(color, PALETTE[i % PALETTE.length]),
  image: null,
  marker: 'dot',
  inMap: true,
});

/* ---------- 原作 R：關係圖的專案 JSON ---------- */

/** 看起來是原作 R 的專案檔（有 images 陣列，以及 legends 或 connections 陣列；不是本站的專案檔） */
export function isRelationFile(raw: unknown): raw is Record<string, unknown> {
  return (
    isObj(raw) &&
    raw.format === undefined &&
    Array.isArray(raw.images) &&
    (Array.isArray(raw.legends) || Array.isArray(raw.connections))
  );
}

/** 原作 R → 新的狀態（取代全部：四象限回到預設的三頁、沒有人放在上面） */
export function fromRelationFile(raw: unknown): LegacyImport {
  if (!isRelationFile(raw)) throw new LegacyFileError('relation');
  const all = raw.images as unknown[];
  const list = all.slice(0, LIMITS.characters);
  const images = new Map<number, string>();
  const characters = list.map((it, i) => {
    const o = isObj(it) ? it : {};
    const url = imageUrl(o.src);
    if (url) images.set(i, url);
    return character(i, text(o.name));
  });
  /* 線的種類：原作的 id（數字）換成 l1、l2…（順序不變） */
  const legendIds = new Map<unknown, string>();
  const legends: Legend[] = [];
  for (const it of Array.isArray(raw.legends) ? raw.legends : []) {
    if (!isObj(it) || legends.length >= LIMITS.legends) continue;
    const id = `l${legends.length + 1}`;
    if (!legendIds.has(it.id)) legendIds.set(it.id, id);
    legends.push({
      id,
      label: text(it.label),
      color: normalizeColor(it.color, PALETTE[legends.length % PALETTE.length]),
      style: it.style === 'dash' || it.style === 'arrow' ? it.style : 'solid',
    });
  }
  /* 連線：索引換成角色、線的種類換成新的 id；不合的由 normalizeState 丟掉 */
  const links: Link[] = [];
  for (const it of Array.isArray(raw.connections) ? raw.connections : []) {
    if (!isObj(it)) continue;
    const a = characters[num(it.fromIndex) ?? -1];
    const b = characters[num(it.toIndex) ?? -1];
    const legend = legendIds.get(it.legendId);
    if (a && b && legend) links.push({ from: a.id, to: b.id, legend });
  }
  const state = normalizeState({
    characters,
    pages: initialState().pages,
    relation: {
      title: text(raw.title) || DEFAULT_RELATION_TITLE,
      showNames: raw.showNames !== false,
      legends,
      links,
    },
  });
  return { kind: 'relation', state, images, page: 0, dropped: all.length - list.length };
}

/* ---------- 原作 Q：全部專案備份碼 ---------- */

/** 備份碼 → JSON 物件（空白、換行忽略）；不是 Base64、不是 UTF-8 的 JSON 物件時丟 LegacyFileError */
export function decodeBackupCode(code: string): Record<string, unknown> {
  const s = code.replace(/\s+/g, '');
  if (!s || s.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(s))
    throw new LegacyFileError('base64');
  let raw: unknown;
  try {
    const bytes = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new LegacyFileError('json');
  }
  if (!isObj(raw) || !(Array.isArray(raw.characters) || Array.isArray(raw.pages)))
    throw new LegacyFileError('state');
  return raw;
}

/**
 * 原作 Q 的備份碼 → 新的狀態：取代角色與四象限的頁面（關係圖的標題、線的種類、顯示名字留著，連線清掉）。
 * 原作舊版的格式也接受：角色沒有每頁的位置時用 x、y 當第 1 頁；沒有 pages、有 title 時當成一頁。
 */
export function fromBackupCode(code: string, current: ChartState): LegacyImport {
  const raw = decodeBackupCode(code);
  const label = (o: Record<string, unknown>) => ({
    top: text(o.top),
    bottom: text(o.bottom),
    left: text(o.left),
    right: text(o.right),
  });
  const rawPages: unknown[] = Array.isArray(raw.pages)
    ? raw.pages
    : typeof raw.title === 'string'
      ? [{ title: raw.title, labels: raw.labels }]
      : [];
  const pages: QuadPage[] = rawPages.slice(0, LIMITS.pages).map((it, i) => {
    const o = isObj(it) ? it : {};
    return {
      id: `p${i + 1}`,
      title: text(o.title),
      labels: label(isObj(o.labels) ? o.labels : {}),
      positions: {},
    };
  });
  if (!pages.length) pages.push(...current.pages.map((p) => ({ ...p, positions: {} })));
  const all = Array.isArray(raw.characters) ? raw.characters : [];
  const list = all.slice(0, LIMITS.characters);
  const images = new Map<number, string>();
  const characters = list.map((it, i) => {
    const o = isObj(it) ? it : {};
    const c = character(i, text(o.name), o.color);
    const url = o.type === 'image' ? imageUrl(o.imageSrc) : null;
    if (url) images.set(i, url);
    /* 每頁的位置（舊版：沒有 positions 時 x、y 是第 1 頁） */
    const positions: Record<string, unknown> = isObj(o.positions)
      ? o.positions
      : { 0: { x: num(o.x) ?? 0, y: num(o.y) ?? 0 } };
    for (const [k, p] of Object.entries(positions)) {
      const page = pages[Number(k)];
      const x = isObj(p) ? num(p.x) : null;
      const y = isObj(p) ? num(p.y) : null;
      if (page && x !== null && y !== null) page.positions[c.id] = { x, y } satisfies Point;
    }
    return c;
  });
  const state = normalizeState({
    characters,
    pages,
    relation: { ...current.relation, links: [] },
  });
  const page = Math.max(0, Math.min(state.pages.length - 1, Math.floor(num(raw.currentPage) ?? 0)));
  return { kind: 'quadrant', state, images, page, dropped: all.length - list.length };
}

/** data URL → Blob（看不懂時 null） */
export function dataUrlToBlob(url: string): Blob | null {
  const m = /^data:([^;,]*)((?:;[^;,]*)*),(.*)$/s.exec(url);
  if (!m) return null;
  const type = m[1] || 'application/octet-stream';
  try {
    if (/;base64/i.test(m[2])) {
      const bytes = Uint8Array.from(atob(m[3].replace(/\s+/g, '')), (c) => c.charCodeAt(0));
      return new Blob([bytes], { type });
    }
    return new Blob([decodeURIComponent(m[3])], { type });
  } catch {
    return null;
  }
}
