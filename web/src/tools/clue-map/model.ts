/**
 * 調查熱點圖的內容（自動儲存、專案檔、復原的對象）與整理規則、出現條件的規則。純函式，不依賴瀏覽器。
 * 規格：docs/refactor/specs/clue-map.md（第 1、2、3.1、3.3 節）。
 */
import { S } from './strings';

/* ---------- 型別 ---------- */

export type Shape = 'rect' | 'ellipse';
export const SHAPES: readonly Shape[] = ['rect', 'ellipse'];

export type RequireMode = 'all' | 'any';
export const REQUIRE_MODES: readonly RequireMode[] = ['all', 'any'];

export type BuiltinSceneId = 'study' | 'paper' | 'board';
export const BUILTIN_SCENES: readonly BuiltinSceneId[] = ['study', 'paper', 'board'];

/** 上傳的圖（資產庫的 id）或網址 */
export type ImageRef =
  | { kind: 'asset'; id: string; name: string; width: number; height: number }
  | { kind: 'url'; url: string; name: string };

export type SceneRef = { kind: 'builtin'; id: BuiltinSceneId } | ImageRef;

export type Theme = 'dark' | 'light';
export const THEMES: readonly Theme[] = ['dark', 'light'];
export type Marker = 'outline' | 'pin' | 'none';
export const MARKERS: readonly Marker[] = ['outline', 'pin', 'none'];
export type FoundMark = 'both' | 'check' | 'color' | 'none';
export const FOUND_MARKS: readonly FoundMark[] = ['both', 'check', 'color', 'none'];
export type ProgressMode = 'count' | 'found' | 'off';
export const PROGRESS_MODES: readonly ProgressMode[] = ['count', 'found', 'off'];

export interface Spot {
  /** 'h' ＋ 6 個小寫英數字；專案內不重複，出現條件記的是它（不是編號） */
  id: string;
  name: string;
  shape: Shape;
  /** 相對於場景圖的 %（0～100，小數 2 位） */
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  check: string;
  memo: string;
  image: ImageRef | null;
  /** 出現條件：開啟時 requires 裡的熱點要先找到（沒有指定任何熱點＝一開始就看得到） */
  locked: boolean;
  requires: string[];
  mode: RequireMode;
  hidden: boolean;
}

export interface Look {
  theme: Theme;
  marker: Marker;
  accent: string;
  foundColor: string;
  foundMark: FoundMark;
  names: boolean;
  progress: ProgressMode;
  reveal: boolean;
}

export interface ClueMapState {
  title: string;
  intro: string;
  scene: SceneRef;
  spots: Spot[];
  look: Look;
}

/* ---------- 範圍與預設 ---------- */

export const LIMITS = {
  spots: 40,
  title: 60,
  intro: 500,
  name: 30,
  text: 2000,
  check: 60,
  memo: 1000,
  url: 2000,
  /** 熱點的最小寬、高（%） */
  minSize: 1.5,
  /** 場景圖的長邊超過這個值時先縮小再存 */
  sceneSide: 1600,
  /** 線索圖的長邊超過這個值時先縮小再存 */
  imageSide: 1024,
} as const;

export const DEFAULT_LOOK: Look = {
  theme: 'dark',
  marker: 'outline',
  accent: '#f5b83d',
  foundColor: '#4cc38a',
  foundMark: 'both',
  names: false,
  progress: 'count',
  reveal: true,
};

/** 內建場景的尺寸 */
export const BUILTIN_SIZE: Record<BuiltinSceneId, { width: number; height: number }> = {
  study: { width: 1200, height: 800 },
  paper: { width: 1200, height: 900 },
  board: { width: 1200, height: 800 },
};

export function blankState(): ClueMapState {
  return {
    title: '',
    intro: '',
    scene: { kind: 'builtin', id: 'paper' },
    spots: [],
    look: { ...DEFAULT_LOOK },
  };
}

/* ---------- 文字 ---------- */

const chars = (s: string) => Array.from(s);

/** 單行：換行與控制字元換成空白，截到上限（字元計） */
export function oneLine(text: unknown, max: number): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: 控制字元換成空白
  const s = String(text ?? '').replace(/[\r\n\t\u0000-\u001f\u007f]/g, ' ');
  const c = chars(s);
  return c.length > max ? c.slice(0, max).join('') : s;
}

/** 多行：統一換行，截到上限 */
export function multiLine(text: unknown, max: number): string {
  const s = String(text ?? '').replace(/\r\n?/g, '\n');
  const c = chars(s);
  return c.length > max ? c.slice(0, max).join('') : s;
}

/** 線索文字分段：空行（連續的空行算一個）分段，段內的換行保留；前後的空白行去掉 */
export function paragraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n(?:[ \t]*\n)*/)
    .map((p) => p.replace(/^\n+|\n+$/g, ''))
    .filter((p) => p.trim() !== '');
}

/* ---------- 網址與圖片參照 ---------- */

/** http(s) 圖片網址（去頭尾空白；不合格時 null） */
export function cleanImageUrl(raw: string): string | null {
  const s = String(raw ?? '').trim();
  if (!s || chars(s).length > LIMITS.url || !/^https?:\/\//i.test(s)) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return s;
  } catch {
    return null;
  }
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** 網址圖片的名稱：網址最後一段（沒有時主機名稱） */
export function urlImageName(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    return last ? decodeSafe(last) : u.hostname;
  } catch {
    return url;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;

export function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** 取到小數 2 位 */
export const round2 = (n: number): number => Math.round(n * 100) / 100;

function num(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** 不透明的 #rrggbb（#rgb 展開、轉小寫）；不合格時 fallback */
export function cleanColor(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const s = v.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${[...s.slice(1)].map((c) => c + c).join('')}`;
  return fallback;
}

/** 一張圖片的參照（壞掉時 null） */
export function cleanImageRef(v: unknown): ImageRef | null {
  if (!isObj(v)) return null;
  if (v.kind === 'url') {
    const url = typeof v.url === 'string' ? cleanImageUrl(v.url) : null;
    if (!url) return null;
    return { kind: 'url', url, name: oneLine(str(v.name, '') || urlImageName(url), 200) };
  }
  if (v.kind === 'asset' && typeof v.id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(v.id)) {
    return {
      kind: 'asset',
      id: v.id,
      name: oneLine(str(v.name, ''), 200),
      width: clampInt(v.width, 1, 100_000, 1),
      height: clampInt(v.height, 1, 100_000, 1),
    };
  }
  return null;
}

/** 場景的參照（壞掉時 null） */
export function cleanScene(v: unknown): SceneRef | null {
  if (isObj(v) && v.kind === 'builtin') {
    return BUILTIN_SCENES.includes(v.id as BuiltinSceneId)
      ? { kind: 'builtin', id: v.id as BuiltinSceneId }
      : null;
  }
  return cleanImageRef(v);
}

/** 圖片的辨識鍵（快取、對照用） */
export const imageKey = (im: SceneRef): string =>
  im.kind === 'asset' ? `a:${im.id}` : im.kind === 'url' ? `u:${im.url}` : `b:${im.id}`;

/** 場景的寬高比（寬 ÷ 高）；網址的圖讀進來之前不知道，用 3:2 */
export function sceneAspect(scene: SceneRef, measured?: { width: number; height: number } | null) {
  if (scene.kind === 'builtin') {
    const s = BUILTIN_SIZE[scene.id];
    return s.width / s.height;
  }
  if (scene.kind === 'asset') return scene.width / scene.height;
  return measured && measured.height > 0 ? measured.width / measured.height : 3 / 2;
}

/** 場景的名稱（資訊列、無障礙名稱） */
export function sceneName(scene: SceneRef): string {
  return scene.kind === 'builtin' ? S.scene.builtinName[scene.id] : scene.name;
}

/* ---------- 熱點 ---------- */

/** 'h' ＋ 6 個小寫英數字（不和 used 重複） */
export function newSpotId(used: ReadonlySet<string> = new Set()): string {
  for (;;) {
    const id = `h${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`;
    if (!used.has(id)) return id;
  }
}

const ID_PATTERN = /^[a-z0-9]{3,16}$/;

/** 位置與大小：寬高夾在 [最小, 100]，位置夾在場景內，取到小數 2 位 */
export interface PctBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function clampBox(b: PctBox): PctBox {
  const w = round2(Math.min(100, Math.max(LIMITS.minSize, b.w)));
  const h = round2(Math.min(100, Math.max(LIMITS.minSize, b.h)));
  const x = round2(Math.min(100 - w, Math.max(0, b.x)));
  const y = round2(Math.min(100 - h, Math.max(0, b.y)));
  return { x, y, w, h };
}

/** 新增按鈕用的預設位置與大小：矩形 22% × 16%；橢圓是正圓（邊長＝場景較短邊的 20%）；每個比上一個往右下錯開 4%（每 6 個回到中央） */
export function defaultBox(shape: Shape, aspect: number, count: number): PctBox {
  const size =
    shape === 'rect'
      ? { w: 22, h: 16 }
      : aspect >= 1
        ? { w: 20 / aspect, h: 20 }
        : { w: 20, h: 20 * aspect };
  const off = (count % 6) * 4;
  return clampBox({ x: 50 - size.w / 2 + off - 10, y: 50 - size.h / 2 + off - 10, ...size });
}

/** 以某一點為中心、預設大小的位置（畫熱點時只點一下） */
export function boxAround(shape: Shape, aspect: number, cx: number, cy: number): PctBox {
  const d = defaultBox(shape, aspect, 0);
  return clampBox({ x: cx - d.w / 2, y: cy - d.h / 2, w: d.w, h: d.h });
}

/** 兩個對角點（任意順序）圍出的範圍；任一邊 < 最小值時用預設大小（以起點為中心） */
export function boxFromDrag(
  shape: Shape,
  aspect: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
): PctBox {
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);
  if (w < LIMITS.minSize || h < LIMITS.minSize) return boxAround(shape, aspect, a.x, a.y);
  return clampBox({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w, h });
}

export function newSpot(
  id: string,
  shape: Shape,
  box: PctBox,
  name: string,
  patch: Partial<Spot> = {},
): Spot {
  return {
    id,
    name,
    shape,
    ...box,
    text: '',
    check: '',
    memo: '',
    image: null,
    locked: false,
    requires: [],
    mode: 'all',
    hidden: false,
    ...patch,
  };
}

/** 顯示用的名稱：空白時「熱點 N」（N＝編號，從 1 開始） */
export const spotLabel = (s: Pick<Spot, 'name'>, index: number): string =>
  s.name.trim() || S.spot.defaultName(index + 1);

function cleanSpot(raw: unknown, used: Set<string>): Spot | null {
  if (!isObj(raw)) return null;
  const w = round2(num(raw.w, LIMITS.minSize, 100, 20));
  const h = round2(num(raw.h, LIMITS.minSize, 100, 15));
  const box = clampBox({
    x: num(raw.x, 0, 100, 40),
    y: num(raw.y, 0, 100, 40),
    w,
    h,
  });
  const given = typeof raw.id === 'string' && ID_PATTERN.test(raw.id) ? raw.id : '';
  const id = given && !used.has(given) ? given : newSpotId(used);
  used.add(id);
  return {
    id,
    name: oneLine(str(raw.name, ''), LIMITS.name),
    shape: oneOf(raw.shape, SHAPES, 'rect'),
    ...box,
    text: multiLine(str(raw.text, ''), LIMITS.text),
    check: oneLine(str(raw.check, ''), LIMITS.check),
    memo: multiLine(str(raw.memo, ''), LIMITS.memo),
    image: raw.image ? cleanImageRef(raw.image) : null,
    locked: bool(raw.locked, false),
    requires: Array.isArray(raw.requires)
      ? raw.requires.filter((x): x is string => typeof x === 'string')
      : [],
    mode: oneOf(raw.mode, REQUIRE_MODES, 'all'),
    hidden: bool(raw.hidden, false),
  };
}

export function cleanLook(raw: unknown): Look {
  const d = isObj(raw) ? raw : {};
  const b = DEFAULT_LOOK;
  return {
    theme: oneOf(d.theme, THEMES, b.theme),
    marker: oneOf(d.marker, MARKERS, b.marker),
    accent: cleanColor(d.accent, b.accent),
    foundColor: cleanColor(d.foundColor, b.foundColor),
    foundMark: oneOf(d.foundMark, FOUND_MARKS, b.foundMark),
    names: bool(d.names, b.names),
    progress: oneOf(d.progress, PROGRESS_MODES, b.progress),
    reveal: bool(d.reveal, b.reveal),
  };
}

/** 熱點的出現條件整理：只留存在的、不含自己的、不重複的代號 */
export function cleanRequires(spots: Spot[]): Spot[] {
  const ids = new Set(spots.map((s) => s.id));
  return spots.map((s) => {
    const seen = new Set<string>();
    const requires = s.requires.filter((id) => {
      if (id === s.id || !ids.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    return requires.length === s.requires.length && requires.every((id, i) => id === s.requires[i])
      ? s
      : { ...s, requires };
  });
}

/** 讀回的資料（自動儲存、專案檔）一律整理：缺的補預設、壞的換預設、超過範圍的夾回 */
export function normalizeState(raw: unknown): ClueMapState {
  const d = isObj(raw) ? raw : {};
  const used = new Set<string>();
  const spots: Spot[] = [];
  if (Array.isArray(d.spots)) {
    for (const r of d.spots) {
      if (spots.length >= LIMITS.spots) break;
      const s = cleanSpot(r, used);
      if (s) spots.push(s);
    }
  }
  return {
    title: oneLine(str(d.title, ''), LIMITS.title),
    intro: multiLine(str(d.intro, ''), LIMITS.intro),
    scene: cleanScene(d.scene) ?? { kind: 'builtin', id: 'paper' },
    spots: cleanRequires(spots),
    look: cleanLook(d.look),
  };
}

/* ---------- 出現條件的規則（引擎有一份一樣的，單元測試比對） ---------- */

/** 有效的出現條件：沒開啟、或沒指定任何熱點＝一開始就看得到 */
export const effectiveRequires = (s: Pick<Spot, 'locked' | 'requires'>): string[] =>
  s.locked ? s.requires : [];

/** 條件成立：all＝要求的熱點全部已找到；any＝至少一個已找到；沒有條件＝成立 */
export function isUnlocked(
  s: Pick<Spot, 'locked' | 'requires' | 'mode'>,
  found: ReadonlySet<string>,
): boolean {
  const r = effectiveRequires(s);
  if (!r.length) return true;
  const n = r.filter((id) => found.has(id)).length;
  return s.mode === 'any' ? n > 0 : n === r.length;
}

/** 從「沒有找到任何熱點」開始反覆套用出現條件，到不再有新熱點為止：會出現的熱點代號 */
export function reachableIds(spots: readonly Spot[]): Set<string> {
  const reach = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of spots) {
      if (!reach.has(s.id) && isUnlocked(s, reach)) {
        reach.add(s.id);
        changed = true;
      }
    }
  }
  return reach;
}

export interface UnreachableInfo {
  id: string;
  /** 卡住它的熱點（要求的熱點裡自己也永遠不會出現的） */
  blockers: string[];
}

/** 永遠不會出現的熱點（循環等待、等一個永遠不出現的熱點） */
export function unreachable(spots: readonly Spot[]): UnreachableInfo[] {
  const reach = reachableIds(spots);
  return spots
    .filter((s) => !reach.has(s.id))
    .map((s) => ({ id: s.id, blockers: effectiveRequires(s).filter((id) => !reach.has(id)) }));
}

/* ---------- 編輯動作（純函式；store 用 immer 的 draft 呼叫） ---------- */

/** 刪掉一個熱點，其他熱點的出現條件裡的它一併拿掉 */
export function removeSpotFrom(spots: Spot[], id: string): Spot[] {
  return spots
    .filter((s) => s.id !== id)
    .map((s) =>
      s.requires.includes(id) ? { ...s, requires: s.requires.filter((r) => r !== id) } : s,
    );
}

/** 狀態裡用到的資產 id（場景＋線索圖片） */
export function assetIds(d: Pick<ClueMapState, 'scene' | 'spots'>): string[] {
  const out: string[] = [];
  if (d.scene.kind === 'asset') out.push(d.scene.id);
  for (const s of d.spots) if (s.image?.kind === 'asset') out.push(s.image.id);
  return out;
}

/** 用到上傳的圖片（放不進分享連結） */
export const usesUploadedImages = (d: Pick<ClueMapState, 'scene' | 'spots'>): boolean =>
  assetIds(d).length > 0;
