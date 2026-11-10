/**
 * 整份資料（畫布、圖形庫、草稿）：預設值、新畫布的名字、讀進來的資料整理（自動儲存、專案檔；規格 3.6）。
 */
import { dedupeRing } from './canvas';
import { cellKey, segKey } from './geometry';
import {
  CANVAS_MAX,
  type Cell,
  type Doc,
  type Draft,
  type Figure,
  KINDS,
  type Kind,
  NAME_MAX,
  type Pt,
  SIZE_CHARACTER,
  SIZE_MAX,
  SIZE_MIN,
  STAMP_MAX,
  type Stamp,
  UNIT,
  type VeinCanvas,
  type VeinFill,
  type VeinLine,
} from './types';

let counter = 0;
/** 畫布、圖形的 id（同一份資料裡不重複就好） */
export function newId(prefix: string): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return `${prefix}-${c.randomUUID().slice(0, 8)}`;
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}`;
}

/** 新的一份：一張 11×11 的畫布「PC」（和原作第一次打開時相同，只有一張自己的畫布） */
export function defaultDoc(): Doc {
  return {
    canvases: [{ id: 'c-1', name: 'PC', size: SIZE_CHARACTER, lines: [], fills: [], damage: [] }],
    stamps: [],
    draft: null,
  };
}

/** 新畫布的名字：角色「PC1、PC2…」、隨從「隨從1…」，接在已經用到的最大號碼後面 */
export function nextName(canvases: readonly VeinCanvas[], prefix: string): string {
  let max = 0;
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(\\d+)$`);
  for (const c of canvases) {
    const m = re.exec(c.name.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${max + 1}`;
}

/* ---------- 整理讀進來的資料 ---------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const HEX = /^#[0-9a-f]{6}$/i;

function readPt(v: unknown): Pt | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const [x, y] = v;
  return Number.isInteger(x) && Number.isInteger(y) ? [x as number, y as number] : null;
}

function readColor(v: unknown, fallback: string): string {
  return typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : fallback;
}

const readName = (v: unknown, fallback: string) =>
  typeof v === 'string' ? v.slice(0, NAME_MAX) : fallback;

function readCanvas(v: unknown, used: Set<string>): VeinCanvas | null {
  if (!isObj(v)) return null;
  const size = Number(v.size);
  if (!Number.isInteger(size) || size < SIZE_MIN || size > SIZE_MAX) return null;
  const max = size * UNIT;
  const inside = (p: Pt) => p[0] >= 0 && p[1] >= 0 && p[0] <= max && p[1] <= max;
  let id = typeof v.id === 'string' && v.id ? v.id.slice(0, 40) : newId('c');
  if (used.has(id)) id = newId('c');
  used.add(id);
  const lines = new Map<string, VeinLine>();
  for (const l of Array.isArray(v.lines) ? v.lines : []) {
    if (!isObj(l)) continue;
    const a = readPt(l.a);
    const b = readPt(l.b);
    if (!a || !b || !inside(a) || !inside(b)) continue;
    if (a[0] % UNIT || a[1] % UNIT || b[0] % UNIT || b[1] % UNIT) continue;
    if (a[0] === b[0] && a[1] === b[1]) continue;
    const color = readColor(l.color, '#0000ff');
    const k = segKey([a, b]);
    lines.delete(k);
    lines.set(k, { a, b, color });
  }
  const fills: VeinFill[] = [];
  for (const f of Array.isArray(v.fills) ? v.fills : []) {
    if (!isObj(f) || !Array.isArray(f.pts)) continue;
    const pts = f.pts.map(readPt);
    if (pts.some((p) => !p || !inside(p))) continue;
    const ring = dedupeRing(pts as Pt[]);
    if (ring.length < 3) continue;
    fills.push({ pts: ring, color: readColor(f.color, '#00c0ff') });
  }
  const damage: Cell[] = [];
  const seen = new Set<string>();
  for (const c of Array.isArray(v.damage) ? v.damage : []) {
    if (!Array.isArray(c) || c.length !== 2) continue;
    const [x, y] = c;
    if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
    if (x < 0 || y < 0 || x >= size || y >= size) continue;
    const k = cellKey([x, y]);
    if (seen.has(k)) continue;
    seen.add(k);
    damage.push([x, y]);
  }
  return {
    id,
    name: readName(v.name, ''),
    size,
    lines: [...lines.values()],
    fills,
    damage,
  };
}

function readFigures(v: unknown): Figure[] | null {
  if (!Array.isArray(v)) return null;
  const out: Figure[] = [];
  for (const f of v) {
    if (!isObj(f) || !Array.isArray(f.pts)) return null;
    const pts = f.pts.map(readPt);
    if (pts.some((p) => !p)) return null;
    out.push({ pts: pts as Pt[], closed: f.closed === true });
  }
  return out;
}

function readStamp(v: unknown, used: Set<string>): Stamp | null {
  if (!isObj(v)) return null;
  const figures = readFigures(v.figures);
  if (!figures?.length || figures.some((f) => f.pts.length < 2)) return null;
  if (figures.some((f) => f.pts.some((p) => p[0] % UNIT || p[1] % UNIT))) return null;
  let id = typeof v.id === 'string' && v.id ? v.id.slice(0, 40) : newId('s');
  if (used.has(id)) id = newId('s');
  used.add(id);
  return { id, name: readName(v.name, ''), figures };
}

function readDraft(v: unknown, canvases: readonly VeinCanvas[]): Draft | null {
  if (!isObj(v)) return null;
  const canvas = canvases.find((c) => c.id === v.canvasId);
  if (!canvas || !KINDS.includes(v.kind as Kind)) return null;
  const figures = readFigures(v.figures);
  const current = Array.isArray(v.current) ? v.current.map(readPt) : null;
  const cells = Array.isArray(v.cells) ? v.cells.map(readPt) : null;
  if (!figures || !current || !cells || current.some((p) => !p) || cells.some((p) => !p))
    return null;
  return {
    canvasId: canvas.id,
    kind: v.kind as Kind,
    erase: v.erase === true,
    figures,
    current: current as Pt[],
    cells: cells as Cell[],
  };
}

/**
 * 整理讀進來的資料（自動儲存、專案檔）：看不懂的畫布、線、塗色、格子略過；一張畫布都沒有時 null。
 * `keepDraft`：自動儲存的資料保留草稿（專案檔不帶草稿）。
 */
export function sanitizeDoc(raw: unknown, { keepDraft = false } = {}): Doc | null {
  if (!isObj(raw) || !Array.isArray(raw.canvases)) return null;
  const used = new Set<string>();
  const canvases = raw.canvases
    .map((c) => readCanvas(c, used))
    .filter((c): c is VeinCanvas => !!c)
    .slice(0, CANVAS_MAX);
  if (!canvases.length) return null;
  const stampIds = new Set<string>();
  const stamps = (Array.isArray(raw.stamps) ? raw.stamps : [])
    .map((s) => readStamp(s, stampIds))
    .filter((s): s is Stamp => !!s)
    .slice(0, STAMP_MAX);
  return {
    canvases,
    stamps,
    draft: keepDraft ? readDraft(raw.draft, canvases) : null,
  };
}

/** 專案檔裡的資料（不帶草稿） */
export const projectData = (d: Doc): Doc => ({ ...d, draft: null });
