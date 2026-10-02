/**
 * 每次編輯後的修正（舊版的 sanitizeState）與讀入資料時的完整修正（純函式）。
 */
import { DEFAULT_FONT, type FontValue } from '@/core/fonts';
import { clamp } from '@/core/timeline';
import { layoutGap } from './layout';
import {
  createDefaultSettings,
  DEFAULT_COLORS,
  DEFAULT_PLACEHOLDER,
  DEFAULT_SUBTITLE,
  DEFAULT_TITLE,
  MAX_PLAYER_NUMBER,
  MAX_WAYPOINTS,
  normalizeCharacter,
  normalizeCrop,
  normalizePlayerLabel,
  type PathMode,
  type Settings,
} from './model';
import { normalizeStoredPaths, normalizeTargets } from './motion';

const num = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
/** 數字（不是有限數字或 0 時用 fallback，與舊版的 `Number(v) || fallback` 相同） */
const orNum = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : fallback;
};
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;
const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const hex = (v: unknown, fallback: string): string => (isHex(v) ? v.toLowerCase() : fallback);

/* ---------- 每次編輯後的修正（舊版的 sanitizeState） ---------- */

/**
 * 夾範圍、補齊玩家陣列、重算自動間距、修正目標與路徑。直接改傳入的物件（Immer 的草稿）。
 * 多次執行的結果相同。
 */
export function sanitize(d: Settings): void {
  d.canvas.width = clamp(Math.round(orNum(d.canvas.width, 960)), 240, 4096);
  d.canvas.height = clamp(Math.round(orNum(d.canvas.height, 540)), 180, 4096);
  const L = d.layout;
  L.columns = clamp(Math.round(orNum(L.columns, 1)), 1, 12);
  L.rows = clamp(Math.round(orNum(L.rows, 1)), 1, 12);
  L.autoGap = L.autoGap === true;
  L.autoRows = L.autoRows !== false;
  L.radius = clamp(num(L.radius, 0), 0, 120);
  L.borderWidth = clamp(num(L.borderWidth, 0), 0, 20);
  L.borderStyle = oneOf(L.borderStyle, ['solid', 'corners', 'dashed', 'double'], 'solid');
  L.width = clamp(orNum(L.width, 20), 20, d.canvas.width * 2);
  L.height = clamp(orNum(L.height, 20), 20, d.canvas.height * 2);
  L.x = num(L.x, 0);
  L.y = num(L.y, 0);
  L.fit = L.fit === 'contain' ? 'contain' : 'cover';
  const M = d.mainPanel;
  M.enabled = M.enabled === true;
  M.effects = M.effects !== false;
  M.count = clamp(Math.round(orNum(M.count, 1)), 1, 12);
  M.columns = clamp(Math.round(orNum(M.columns, 1)), 1, M.count);
  M.slotGap = clamp(num(M.slotGap, 0), 0, 120);
  M.position = oneOf(M.position, ['top', 'left', 'right'], 'top');
  M.size = clamp(orNum(M.size, 62), 35, 80);
  M.gap = clamp(num(M.gap, 0), 0, 120);
  M.fit = M.fit === 'cover' ? 'cover' : 'contain';
  M.reveal = M.reveal === 'hover' ? 'hover' : 'confirm';
  M.showName = M.showName !== false;
  M.placeholder = String(M.placeholder ?? '').slice(0, 100);
  L.gap = layoutGap(d);

  const P = d.players;
  P.count = clamp(Math.round(orNum(P.count, 1)), 1, MAX_PLAYER_NUMBER);
  P.selectionMode = P.selectionMode === 'single' ? 'single' : 'sequence';
  P.singleNumber = clamp(Math.round(orNum(P.singleNumber, 1)), 1, MAX_PLAYER_NUMBER);
  P.allowDuplicate = P.allowDuplicate === true;
  if (!Array.isArray(P.labels)) P.labels = ['', '', '', ''];
  if (!Array.isArray(P.colors)) P.colors = [...DEFAULT_COLORS];
  if (!Array.isArray(P.targets)) P.targets = [0, 1, 2, 3];
  if (!Array.isArray(P.starts)) P.starts = [null, null, null, null];
  if (!Array.isArray(P.pathModes)) P.pathModes = ['random', 'random', 'random', 'random'];
  if (!Array.isArray(P.paths)) P.paths = [[], [], [], []];
  const slots = Math.min(
    MAX_PLAYER_NUMBER,
    Math.max(
      4,
      P.count,
      P.singleNumber,
      P.labels.length,
      P.colors.length,
      P.targets.length,
      P.starts.length,
      P.pathModes.length,
      P.paths.length,
    ),
  );
  for (const key of ['labels', 'colors', 'targets', 'starts', 'pathModes', 'paths'] as const)
    if (P[key].length > slots) P[key].length = slots;
  while (P.labels.length < slots) P.labels.push('');
  for (let i = 0; i < slots; i++) {
    const v = normalizePlayerLabel(P.labels[i]);
    if (P.labels[i] !== v) P.labels[i] = v;
  }
  while (P.colors.length < slots) P.colors.push(DEFAULT_COLORS[P.colors.length % 4]);
  for (let i = 0; i < slots; i++) {
    const v = hex(P.colors[i], DEFAULT_COLORS[i % 4]);
    if (P.colors[i] !== v) P.colors[i] = v;
  }
  while (P.targets.length < slots) P.targets.push(P.targets.length);
  while (P.starts.length < slots) P.starts.push(null);
  while (P.pathModes.length < slots) P.pathModes.push('random');
  while (P.paths.length < slots) P.paths.push([]);
  const count = d.characters.length;
  for (let p = 0; p < slots; p++) {
    const raw = P.starts[p] as unknown;
    const n = Number(raw);
    const start =
      count > 0 &&
      raw !== null &&
      raw !== undefined &&
      raw !== '' &&
      raw !== 'random' &&
      Number.isFinite(n)
        ? clamp(Math.round(n), 0, count - 1)
        : null;
    if (P.starts[p] !== start) P.starts[p] = start;
    const mode: PathMode = P.pathModes[p] === 'custom' ? 'custom' : 'random';
    if (P.pathModes[p] !== mode) P.pathModes[p] = mode;
    const src: unknown[] = Array.isArray(P.paths[p]) ? P.paths[p] : [];
    const path =
      count > 0
        ? src.slice(0, MAX_WAYPOINTS).flatMap((v) => {
            const x = Number(v);
            return Number.isFinite(x) ? [clamp(Math.round(x), 0, count - 1)] : [];
          })
        : [];
    if (!sameArray(P.paths[p], path)) P.paths[p] = path;
  }
  normalizeTargets(d);
  normalizeStoredPaths(d);

  const A = d.animation;
  A.initialHold = clamp(num(A.initialHold, 650), 0, 3000);
  A.searchDuration = clamp(orNum(A.searchDuration, 900), 100, 4000);
  A.confirmDuration = clamp(orNum(A.confirmDuration, 650), 100, 3000);
  A.endHold = clamp(orNum(A.endHold, 1600), 100, 6000);
  A.hops = clamp(Math.round(num(A.hops, 3)), 0, 10);
  A.loop = A.loop !== false;
  const E = d.export;
  E.format = oneOf(E.format, ['apng', 'webp', 'gif', 'mp4', 'avi'], 'apng');
  E.fps = clamp(Math.round(orNum(E.fps, 10)), 1, 60);
  E.scale = clamp(orNum(E.scale, 1), 0.25, 2);
  E.webpQuality = clamp(orNum(E.webpQuality, 0.9), 0.1, 1);
}

function sameArray(a: unknown, b: readonly number[]): boolean {
  if (!Array.isArray(a) || a.length !== b.length) return false;
  for (let i = 0; i < b.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/* ---------- 讀入（自動存檔、專案檔、舊版專案）時的完整修正 ---------- */

type Loose = Record<string, unknown>;
const obj = (v: unknown): Loose =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Loose) : {};
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const str = (v: unknown, fallback: string, max: number) =>
  typeof v === 'string' ? v.slice(0, max) : fallback;
const range = (v: unknown, fallback: number, lo: number, hi: number) =>
  clamp(num(v, fallback), lo, hi);

/**
 * 把任意資料（自動存檔、專案檔）修正成合法的設定：缺的欄位用預設值、數值夾範圍、列舉值不合法時用預設。
 * `characters` 只保留有圖片 id 的項目。
 */
export function normalizeSettings(input: unknown): Settings {
  const base = createDefaultSettings();
  const src = obj(input);
  const out = structuredCloneSafe(base);
  const c = obj(src.canvas);
  out.canvas = { width: num(c.width, 960), height: num(c.height, 540) };
  const b = obj(src.background);
  out.background = {
    type: oneOf(b.type, ['gradient', 'solid', 'image', 'transparent'], 'gradient'),
    colorA: hex(b.colorA, base.background.colorA),
    colorB: hex(b.colorB, base.background.colorB),
    angle: range(b.angle, 135, 0, 360),
    image: typeof b.image === 'string' && b.image ? b.image : null,
    imageDim: range(b.imageDim, 24, 0, 90),
    vignette: range(b.vignette, 38, 0, 80),
    pattern: bool(b.pattern, true),
  };
  if (out.background.type === 'image' && !out.background.image) out.background.type = 'gradient';
  const l = obj(src.layout);
  out.layout = {
    x: num(l.x, 64),
    y: num(l.y, 124),
    width: num(l.width, 832),
    height: num(l.height, 328),
    columns: num(l.columns, 4),
    rows: num(l.rows, 2),
    autoRows: bool(l.autoRows, true),
    autoGap: bool(l.autoGap, true),
    gap: range(l.gap, 14, 0, 120),
    radius: num(l.radius, 24),
    fit: l.fit === 'contain' ? 'contain' : 'cover',
    borderWidth: num(l.borderWidth, 2),
    borderStyle: oneOf(l.borderStyle, ['solid', 'corners', 'dashed', 'double'], 'solid'),
  };
  const t = obj(src.text);
  out.text = {
    showTitle: bool(t.showTitle, true),
    title: str(t.title, DEFAULT_TITLE, 80),
    subtitle: str(t.subtitle, DEFAULT_SUBTITLE, 100),
    titleSize: range(t.titleSize, 30, 10, 120),
    align: oneOf(t.align, ['left', 'center', 'right'], 'center'),
  };
  const f = obj(src.font);
  out.font =
    typeof f.family === 'string' &&
    oneOf(f.source, ['google', 'local', 'upload'], 'google') === f.source
      ? {
          source: f.source as FontValue['source'],
          family: f.family.slice(0, 160),
          weight: range(f.weight, 400, 100, 900),
        }
      : { ...DEFAULT_FONT };
  const m = obj(src.mainPanel);
  out.mainPanel = {
    enabled: bool(m.enabled, false),
    effects: bool(m.effects, true),
    count: num(m.count, 1),
    columns: num(m.columns, 1),
    slotGap: num(m.slotGap, 16),
    position: oneOf(m.position, ['top', 'left', 'right'], 'top'),
    size: num(m.size, 62),
    gap: num(m.gap, 24),
    fit: m.fit === 'cover' ? 'cover' : 'contain',
    reveal: m.reveal === 'hover' ? 'hover' : 'confirm',
    showName: bool(m.showName, true),
    placeholder: str(m.placeholder, DEFAULT_PLACEHOLDER, 100),
  };
  const lb = obj(src.labels);
  out.labels = {
    show: bool(lb.show, true),
    height: range(lb.height, 46, 0, 160),
    fontSize: range(lb.fontSize, 17, 8, 60),
  };
  const i = obj(src.idle);
  out.idle = {
    mode: oneOf(i.mode, ['normal', 'grayscale', 'sepia'], 'grayscale'),
    amount: range(i.amount, 88, 0, 100),
    brightness: range(i.brightness, 68, 20, 140),
    saturation: range(i.saturation, 62, 0, 180),
    overlayAlpha: range(i.overlayAlpha, 18, 0, 80),
  };
  const s = obj(src.selected);
  out.selected = {
    tintMode: oneOf(s.tintMode, ['none', 'fixed', 'player'], 'player'),
    tint: hex(s.tint, '#64e4ff'),
    tintAlpha: range(s.tintAlpha, 18, 0, 80),
    brightness: range(s.brightness, 108, 20, 180),
    saturation: range(s.saturation, 124, 0, 240),
    scale: range(s.scale, 1.06, 1, 1.18),
    glow: range(s.glow, 30, 0, 80),
    borderWidth: range(s.borderWidth, 5, 1, 16),
  };
  const p = obj(src.players);
  const arr = <T>(v: unknown, fallback: T[]): T[] =>
    Array.isArray(v) ? (v.slice() as T[]) : fallback;
  out.players = {
    count: num(p.count, 4),
    selectionMode: p.selectionMode === 'single' ? 'single' : 'sequence',
    singleNumber: num(p.singleNumber, 1),
    allowDuplicate: bool(p.allowDuplicate, false),
    labels: arr<string>(p.labels, ['', '', '', '']).map((x) => (typeof x === 'string' ? x : '')),
    colors: arr<string>(p.colors, [...DEFAULT_COLORS]),
    targets: arr<number>(p.targets, [0, 1, 2, 3]).map((x) => num(x, 0)),
    starts: arr<number | null>(p.starts, [null, null, null, null]),
    pathModes: arr<PathMode>(p.pathModes, ['random', 'random', 'random', 'random']),
    paths: arr<number[]>(p.paths, [[], [], [], []]).map((x) => (Array.isArray(x) ? x.slice() : [])),
  };
  const a = obj(src.animation);
  out.animation = {
    initialHold: num(a.initialHold, 650),
    searchDuration: num(a.searchDuration, 900),
    confirmDuration: num(a.confirmDuration, 650),
    endHold: num(a.endHold, 1600),
    hops: num(a.hops, 3),
    loop: bool(a.loop, true),
  };
  const e = obj(src.export);
  out.export = {
    format: oneOf(e.format, ['apng', 'webp', 'gif', 'mp4', 'avi'], 'apng'),
    scale: num(e.scale, 0.75),
    fps: num(e.fps, 10),
    webpQuality: num(e.webpQuality, 0.9),
  };
  out.ui = { showGuides: bool(obj(src.ui).showGuides, true) };
  const seen = new Set<string>();
  out.characters = (Array.isArray(src.characters) ? src.characters : [])
    .map((x) => obj(x))
    .filter((x) => typeof x.image === 'string' && x.image)
    .map((x, n) => {
      let id = typeof x.id === 'string' && x.id ? x.id : `c${n + 1}`;
      while (seen.has(id)) id = `${id}-${n}`;
      seen.add(id);
      return normalizeCharacter({
        id,
        name: typeof x.name === 'string' ? x.name : '',
        image: x.image as string,
        demo: x.demo === true,
        scale: num(x.scale, 1),
        offsetX: num(x.offsetX, 0),
        offsetY: num(x.offsetY, 0),
        moveRangeX: num(x.moveRangeX, 100),
        moveRangeY: num(x.moveRangeY, 100),
        mainCrop: normalizeCrop(x.mainCrop),
        listCrop: normalizeCrop(x.listCrop),
      });
    });
  sanitize(out);
  return out;
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
