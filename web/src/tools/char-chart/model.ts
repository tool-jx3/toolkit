/**
 * 角色分析圖產生器的資料與純計算（規格 docs/refactor/specs/char-chart.md）：
 * 角色清單（兩張圖共用）、四象限的頁面與位置、契合度、座標碼、關係圖的排列與連線、讀檔時的整理。
 * 這裡不碰 DOM，單元測試直接用。四象限的位置以「畫布中心」為原點、往右往下為正（畫布 px）。
 */

/* ---------- 型別 ---------- */

export type ChartKind = 'quadrant' | 'relation';
export const CHART_KINDS: readonly ChartKind[] = ['quadrant', 'relation'];

/** 四象限上的標記：圓點或圖片（有圖片時才能選圖片） */
export type Marker = 'dot' | 'image';
export const MARKERS: readonly Marker[] = ['dot', 'image'];

/** 關係圖的線：實線、虛線、箭頭（實線＋終點的箭頭） */
export type LineStyle = 'solid' | 'dash' | 'arrow';
export const LINE_STYLES: readonly LineStyle[] = ['solid', 'dash', 'arrow'];

export type AxisKey = 'top' | 'bottom' | 'left' | 'right';
export const AXIS_KEYS: readonly AxisKey[] = ['top', 'bottom', 'left', 'right'];
export type LabelKey = 'title' | AxisKey;

/** 角色的圖片（圖片本身存在資產庫，這裡只記 id 與尺寸） */
export interface ImageRef {
  id: string;
  name: string;
  width: number;
  height: number;
}

export interface Character {
  id: string;
  name: string;
  /** 小寫 #rrggbb */
  color: string;
  image: ImageRef | null;
  /** 四象限的標記（沒有圖片時一律畫圓點） */
  marker: Marker;
  /** 放在關係圖上 */
  inMap: boolean;
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export type AxisLabels = Record<AxisKey, string>;

export interface QuadPage {
  id: string;
  title: string;
  labels: AxisLabels;
  /** 角色 id → 位置（相對於畫布中心）；沒有的角色不在這一頁 */
  positions: Record<string, Point>;
}

export interface Legend {
  id: string;
  label: string;
  color: string;
  style: LineStyle;
}

/** 一條連線（from → to；箭頭畫在 to 那一端） */
export interface Link {
  from: string;
  to: string;
  legend: string;
}

export interface RelationState {
  title: string;
  showNames: boolean;
  /** 圖例的順序＝畫在圖上的順序 */
  legends: Legend[];
  links: Link[];
}

export interface ChartState {
  /** 角色清單（順序＝四象限的上下層、關係圖繞圈的順序） */
  characters: Character[];
  pages: QuadPage[];
  relation: RelationState;
}

/* ---------- 數值 ---------- */

export const LIMITS = {
  characters: 50,
  pages: 30,
  legends: 20,
  name: 40,
  title: 60,
  axis: 30,
  legend: 20,
} as const;

/** 加入的圖片超過這個長邊時先縮小（四象限畫 50 px 寬、關係圖畫直徑 120 px） */
export const IMAGE_MAX_SIDE = 1024;

/** 四象限 */
export const QUAD = {
  size: 800,
  grid: 20,
  /** 軸的兩端離畫布上下緣 */
  margin: 70,
  titleY: 35,
  /** 上下兩個軸名離軸的端點 */
  labelGap: 25,
  /** 左右兩個軸名再往內 */
  sideInset: 20,
  /** 左右兩個軸名在橫軸上方 */
  sideRaise: 20,
  arrow: 10,
  dotRadius: 8,
  imageWidth: 50,
  /** 按到角色的範圍（畫布 px） */
  dotHit: 15,
  imageHit: 30,
  nameFont: 12,
  nameBoxHeight: 14,
} as const;

export const QUAD_COLORS = {
  background: '#ffffff',
  grid: '#e5e7eb',
  axis: '#374151',
  title: '#1f2937',
  label: '#4b5563',
  labelOutline: '#ffffff',
  name: '#1f2937',
  nameBox: 'rgba(255, 255, 255, 0.7)',
  shadow: 'rgba(0, 0, 0, 0.2)',
  dotOutline: '#ffffff',
} as const;

/** 關係圖 */
export const REL = {
  width: 1000,
  height: 800,
  radius: 280,
  /** 13 個人以上時每多一個人畫布加高 50（寬 × 1.25）、半徑加 20 */
  growFrom: 13,
  growStep: 50,
  nodeRadius: 60,
  titleX: 30,
  titleY: 30,
  titleFont: 32,
  legendX: 30,
  legendY: 100,
  legendFirst: 130,
  legendStep: 30,
  legendSample: 40,
  legendFont: 16,
  legendItemFont: 14,
  lineWidth: 3,
  arrowHead: 15,
  nameFont: 16,
  nameGap: 10,
  nameBoxHeight: 24,
  namePad: 6,
  initialFont: 48,
  /** 標題的範圍：在這裡按下不會選取或取消選取 */
  titleZone: { width: 300, height: 80 },
} as const;

export const REL_COLORS = {
  background: '#ffffff',
  title: '#000000',
  legendTitle: '#333333',
  legendLabel: '#555555',
  nodeBorder: '#e5e7eb',
  name: '#000000',
  nameBox: 'rgba(255, 255, 255, 0.85)',
} as const;

/** 角色的常用色（新角色依序輪流用） */
export const PALETTE = [
  '#e5484d',
  '#f2711c',
  '#f5b700',
  '#7cb518',
  '#2bb673',
  '#12a4b4',
  '#2f80ed',
  '#5b5bd6',
  '#9b51e0',
  '#d6409f',
  '#a0522d',
  '#6b7280',
  '#1f3a93',
  '#0f766e',
  '#b91c1c',
  '#374151',
] as const;

/* ---------- 預設內容（本站自己寫的） ---------- */

export const DEFAULT_PAGES: readonly Omit<QuadPage, 'id' | 'positions'>[] = [
  {
    title: '角色性格分布',
    labels: { top: '外向', bottom: '內向', left: '感性', right: '理性' },
  },
  {
    title: '調查員的行動風格',
    labels: { top: '謹慎', bottom: '衝動', left: '單獨行動', right: '團隊合作' },
  },
  {
    title: '面對神話的態度',
    labels: { top: '好奇心旺盛', bottom: '明哲保身', left: '理智堅定', right: '瀕臨瘋狂' },
  },
];

export const NEW_PAGE_LABELS: AxisLabels = { top: '上', bottom: '下', left: '左', right: '右' };
export const newPageTitle = (n: number): string => `新頁面 ${n}`;

export const DEFAULT_LEGENDS: readonly Legend[] = [
  { id: 'l1', label: '戀愛', color: '#e8457a', style: 'solid' },
  { id: 'l2', label: '單箭頭', color: '#f08c00', style: 'arrow' },
  { id: 'l3', label: '宿敵', color: '#5c5f66', style: 'dash' },
  { id: 'l4', label: '搭檔', color: '#2b9a66', style: 'solid' },
  { id: 'l5', label: '家人', color: '#3a6fd8', style: 'solid' },
];

export const DEFAULT_RELATION_TITLE = '角色關係圖';
export const newLegendLabel = (n: number): string => `關係 ${n}`;

export function initialState(): ChartState {
  return {
    characters: [],
    pages: DEFAULT_PAGES.map((p, i) => ({
      id: `p${i + 1}`,
      title: p.title,
      labels: { ...p.labels },
      positions: {},
    })),
    relation: {
      title: DEFAULT_RELATION_TITLE,
      showNames: true,
      legends: DEFAULT_LEGENDS.map((l) => ({ ...l })),
      links: [],
    },
  };
}

/* ---------- 小工具 ---------- */

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** 截到最多 n 個字（以字元計，emoji 算一個） */
export const clipText = (s: string, n: number): string => Array.from(s).slice(0, n).join('');

/** 新的 id：前綴＋（目前最大的號碼＋1） */
export function nextId(prefix: string, items: readonly { id: string }[]): string {
  let n = 0;
  const re = new RegExp(`^${prefix}(\\d+)$`);
  for (const it of items) {
    const m = re.exec(it.id);
    if (m) n = Math.max(n, Number(m[1]));
  }
  return `${prefix}${n + 1}`;
}

/** 下一個新角色的顏色：常用色裡第一個還沒有人用的；都用過了就依人數輪流 */
export function nextColor(characters: readonly { color: string }[]): string {
  const used = new Set(characters.map((c) => c.color.toLowerCase()));
  return PALETTE.find((c) => !used.has(c)) ?? PALETTE[characters.length % PALETTE.length];
}

/** 從檔名取角色名：去掉最後的副檔名 */
export function nameFromFile(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, '');
  const i = base.lastIndexOf('.');
  return (i > 0 ? base.slice(0, i) : base).trim();
}

/** 第一個字（沒有圖片的關係圖頭像） */
export const initialOf = (name: string): string => Array.from(name.trim())[0] ?? '';

/** 實際畫的標記（沒有圖片時一律圓點） */
export const markerOf = (c: Character): Marker =>
  c.image && c.marker === 'image' ? 'image' : 'dot';

/* ---------- 四象限 ---------- */

/** 軸的半長（端點離中心） */
export const axisRadius = (size: number = QUAD.size): number => size / 2 - QUAD.margin;

/** 四象限上的圖片標記：寬 50、高依比例 */
export function imageMarkerSize(img: Size): Size {
  const w = QUAD.imageWidth;
  return { width: w, height: img.width > 0 ? (img.height * w) / img.width : w };
}

/** 標題與四個軸名的位置（畫布 px，字的中心） */
export function labelAnchors(size: number = QUAD.size): Record<LabelKey, Point> {
  const c = size / 2;
  const r = axisRadius(size);
  const side = r - QUAD.labelGap - QUAD.sideInset;
  return {
    title: { x: c, y: QUAD.titleY },
    top: { x: c, y: c - r + QUAD.labelGap },
    bottom: { x: c, y: c + r - QUAD.labelGap },
    left: { x: c - side, y: c - QUAD.sideRaise },
    right: { x: c + side, y: c - QUAD.sideRaise },
  };
}

/** 按兩下可以改字的範圍（中心＋寬高；標題 300 × 40、軸名 150 × 30） */
export function labelTargets(
  size: number = QUAD.size,
): { key: LabelKey; x: number; y: number; w: number; h: number }[] {
  const a = labelAnchors(size);
  return (['title', 'top', 'bottom', 'left', 'right'] as const).map((key) => ({
    key,
    ...a[key],
    w: key === 'title' ? 300 : 150,
    h: key === 'title' ? 40 : 30,
  }));
}

/** 按兩下的位置落在哪個字上（沒有時 null） */
export function hitLabel(p: Point, size: number = QUAD.size): LabelKey | null {
  for (const t of labelTargets(size)) {
    if (Math.abs(p.x - t.x) < t.w / 2 && Math.abs(p.y - t.y) < t.h / 2) return t.key;
  }
  return null;
}

/** 位置夾在畫布裡 */
export function clampPosition(p: Point, size: number = QUAD.size): Point {
  const h = size / 2;
  return { x: clamp(p.x, -h, h), y: clamp(p.y, -h, h) };
}

/**
 * 按到哪個角色（後面的〔上層〕優先）：圓點 15、圖片 30 畫布 px 以內；圖片標記另外算整張圖的範圍。
 * `minRadius` 是至少多大的範圍（例如換算成畫布 px 的觸控範圍）。
 */
export function hitCharacter(
  characters: readonly Character[],
  page: QuadPage,
  p: Point,
  minRadius = 0,
): string | null {
  for (let i = characters.length - 1; i >= 0; i--) {
    const c = characters[i];
    const pos = page.positions[c.id];
    if (!pos) continue;
    const isImage = markerOf(c) === 'image';
    const r = Math.max(isImage ? QUAD.imageHit : QUAD.dotHit, minRadius);
    const dx = p.x - pos.x;
    const dy = p.y - pos.y;
    if (dx * dx + dy * dy < r * r) return c.id;
    if (isImage && c.image) {
      const s = imageMarkerSize(c.image);
      if (Math.abs(dx) <= s.width / 2 && Math.abs(dy) <= s.height / 2) return c.id;
    }
  }
  return null;
}

/* ---------- 契合度 ---------- */

/** 每一軸 50 分：距離每 20 px 一格，相差 22 格扣光（再遠就是負的） */
export function pairScore(a: Point, b: Point): number {
  const axis = (d: number) => 50 - (Math.abs(d) / QUAD.grid / 22) * 50;
  return axis(a.x - b.x) + axis(a.y - b.y);
}

export interface ScoreRow {
  pageId: string;
  title: string;
  /** null：這一頁沒辦法算（有人不在這一頁） */
  score: number | null;
}

/** 兩個角色每一頁的契合度與平均（平均只算有分數的頁） */
export function pairReport(
  state: Pick<ChartState, 'pages'>,
  a: string,
  b: string,
): { rows: ScoreRow[]; average: number | null } {
  const rows = state.pages.map((p) => {
    const pa = p.positions[a];
    const pb = p.positions[b];
    return { pageId: p.id, title: p.title, score: pa && pb ? pairScore(pa, pb) : null };
  });
  return { rows, average: mean(rows.map((r) => r.score)) };
}

/** 全體：每一頁所有兩兩組合的平均，再取有分數的頁的平均 */
export function groupReport(state: Pick<ChartState, 'pages' | 'characters'>): {
  rows: ScoreRow[];
  average: number | null;
} {
  const ids = state.characters.map((c) => c.id);
  const rows = state.pages.map((p) => {
    const scores: number[] = [];
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = p.positions[ids[i]];
        const b = p.positions[ids[j]];
        if (a && b) scores.push(pairScore(a, b));
      }
    return { pageId: p.id, title: p.title, score: mean(scores) };
  });
  return { rows, average: mean(rows.map((r) => r.score)) };
}

function mean(list: readonly (number | null)[]): number | null {
  const v = list.filter((x): x is number => x !== null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

export type ScoreTone = 'high' | 'low' | 'normal';
/** 80 以上醒目、負的另一種顏色 */
export const scoreTone = (s: number): ScoreTone => (s >= 80 ? 'high' : s < 0 ? 'low' : 'normal');
export const formatScore = (s: number | null): string => (s === null ? '—' : `${s.toFixed(1)}%`);

/* ---------- 座標碼（這一頁的名字、顏色、位置；與原作的格式相容） ---------- */

export interface ShareEntry {
  name: string;
  color: string;
  x: number;
  y: number;
}

/** 這一頁有放的角色 → `[{"n":名字,"c":顏色,"x":整數,"y":整數}, …]` */
export function pageShareCode(state: Pick<ChartState, 'characters'>, page: QuadPage): string {
  const list = state.characters
    .filter((c) => page.positions[c.id])
    .map((c) => {
      const p = page.positions[c.id];
      return { n: c.name, c: c.color, x: Math.round(p.x), y: Math.round(p.y) };
    });
  return JSON.stringify(list);
}

export class ShareCodeError extends Error {}

/** 讀座標碼：不是 JSON 陣列時丟 ShareCodeError；看不懂的項目略過；一項都沒有時也丟錯 */
export function parseShareCode(text: string): ShareEntry[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ShareCodeError('json');
  }
  if (!Array.isArray(raw)) throw new ShareCodeError('array');
  const out: ShareEntry[] = [];
  for (const it of raw) {
    if (!isObj(it)) continue;
    const name = typeof it.n === 'string' ? clipText(it.n.trim(), LIMITS.name) : '';
    const x = num(it.x);
    const y = num(it.y);
    if (!name || x === null || y === null) continue;
    out.push({ name, color: normalizeColor(it.c, ''), x, y });
  }
  if (!out.length) throw new ShareCodeError('empty');
  return out;
}

/**
 * 把座標碼套到某一頁（就地修改 draft）：名字相同的角色（第一個）換位置，沒有的加成新角色（圓點、碼裡的顏色）。
 * 角色數到上限時不再新增。回傳新增、更新、略過的數量。
 */
export function applyShareEntries(
  d: ChartState,
  pageIndex: number,
  entries: readonly ShareEntry[],
): { added: number; updated: number; skipped: number } {
  const page = d.pages[pageIndex];
  let added = 0;
  let updated = 0;
  let skipped = 0;
  if (!page) return { added, updated, skipped: entries.length };
  for (const e of entries) {
    const pos = clampPosition({ x: e.x, y: e.y });
    const hit = d.characters.find((c) => c.name === e.name);
    if (hit) {
      page.positions[hit.id] = pos;
      updated++;
      continue;
    }
    if (d.characters.length >= LIMITS.characters) {
      skipped++;
      continue;
    }
    const c = createCharacter(d.characters, { name: e.name, color: e.color || undefined });
    d.characters.push(c);
    page.positions[c.id] = pos;
    added++;
  }
  return { added, updated, skipped };
}

/* ---------- 角色 ---------- */

export function createCharacter(
  existing: readonly Character[],
  { name, color, image = null }: { name: string; color?: string; image?: ImageRef | null },
): Character {
  return {
    id: nextId('c', existing),
    name: clipText(name, LIMITS.name),
    color: normalizeColor(color, nextColor(existing)),
    image,
    marker: image ? 'image' : 'dot',
    inMap: true,
  };
}

/** 刪掉角色：所有頁的位置、關係圖的連線一起刪（就地修改 draft） */
export function deleteCharacter(d: ChartState, id: string): void {
  d.characters = d.characters.filter((c) => c.id !== id);
  for (const p of d.pages) delete p.positions[id];
  d.relation.links = d.relation.links.filter((l) => l.from !== id && l.to !== id);
}

/* ---------- 關係圖 ---------- */

export interface RelationNode {
  id: string;
  /** 圓心 */
  x: number;
  y: number;
  /** 連線的端點（兩個人時在內側、三個人以上在朝向中心的那一點） */
  ax: number;
  ay: number;
}

export interface RelationLayout extends Size {
  radius: number;
  nodes: RelationNode[];
}

/** 畫布大小、半徑與每個人的位置（第一個人在正上方，順時針排） */
export function relationLayout(ids: readonly string[]): RelationLayout {
  const n = ids.length;
  const extra = n >= REL.growFrom ? (n - (REL.growFrom - 1)) * REL.growStep : 0;
  const width = REL.width + extra * 1.25;
  const height = REL.height + extra;
  const radius = REL.radius + extra / 2.5;
  const cx = width / 2;
  const cy = height / 2;
  const R = REL.nodeRadius;
  let nodes: RelationNode[];
  if (n === 1) nodes = [{ id: ids[0], x: cx, y: cy, ax: cx, ay: cy }];
  else if (n === 2) {
    const dx = radius / 1.5;
    nodes = [
      { id: ids[0], x: cx - dx, y: cy, ax: cx - dx + R, ay: cy },
      { id: ids[1], x: cx + dx, y: cy, ax: cx + dx - R, ay: cy },
    ];
  } else {
    const step = (2 * Math.PI) / Math.max(1, n);
    nodes = ids.map((id, i) => {
      const t = i * step - Math.PI / 2;
      return {
        id,
        x: cx + radius * Math.cos(t),
        y: cy + radius * Math.sin(t),
        ax: cx + (radius - R) * Math.cos(t),
        ay: cy + (radius - R) * Math.sin(t),
      };
    });
  }
  return { width, height, radius, nodes };
}

/** 關係圖上的人（清單的順序、有勾「放進關係圖」的） */
export const mapMembers = (characters: readonly Character[]): Character[] =>
  characters.filter((c) => c.inMap);

export const samePair = (l: Link, a: string, b: string): boolean =>
  (l.from === a && l.to === b) || (l.from === b && l.to === a);

/**
 * 連線（依序點了 from、to）：這兩人之間已經有線（不論方向、種類）就刪掉，沒有就用 legend 連一條 from → to。
 * 回傳新的清單與做了什麼。
 */
export function toggleLink(
  links: readonly Link[],
  from: string,
  to: string,
  legend: string,
): { links: Link[]; action: 'added' | 'removed' | 'none' } {
  if (from === to) return { links: links.slice(), action: 'none' };
  const i = links.findIndex((l) => samePair(l, from, to));
  if (i >= 0) return { links: links.filter((_, k) => k !== i), action: 'removed' };
  return { links: [...links, { from, to, legend }], action: 'added' };
}

/**
 * 隨機連線：加上「人數 − 1」條還沒有的線（隨機兩人、隨機一種線），最多試「條數 × 20」次。
 * random 回傳 [0, 1)。
 */
export function randomLinks(
  members: readonly string[],
  legends: readonly string[],
  existing: readonly Link[],
  random: () => number = Math.random,
): Link[] {
  const n = members.length;
  if (n < 2 || !legends.length) return [];
  const target = n - 1;
  const out: Link[] = [];
  const all = [...existing];
  let attempts = 0;
  while (out.length < target && attempts < target * 20) {
    attempts++;
    const a = members[Math.floor(random() * n)];
    const b = members[Math.floor(random() * n)];
    if (a === b) continue;
    if (all.some((l) => samePair(l, a, b))) continue;
    const link = { from: a, to: b, legend: legends[Math.floor(random() * legends.length)] };
    out.push(link);
    all.push(link);
  }
  return out;
}

/** 刪掉一種線：用到它的連線一起刪（至少要留一種，最後一種不刪） */
export function deleteLegend(d: ChartState, id: string): boolean {
  if (d.relation.legends.length <= 1) return false;
  d.relation.legends = d.relation.legends.filter((l) => l.id !== id);
  d.relation.links = d.relation.links.filter((l) => l.legend !== id);
  return true;
}

/* ---------- 讀檔、還原時的整理 ---------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown, max: number, fallback = ''): string =>
  typeof v === 'string' ? clipText(v, max) : fallback;

/** 色碼整理成小寫 #rrggbb（#rgb 也接受）；看不懂時用 fallback */
export function normalizeColor(v: unknown, fallback: string = PALETTE[0]): string {
  if (typeof v !== 'string') return fallback;
  const s = v.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${[...s.slice(1)].map((c) => c + c).join('')}`;
  return fallback;
}

function normalizeImage(raw: unknown): ImageRef | null {
  if (!isObj(raw)) return null;
  const w = num(raw.width);
  const h = num(raw.height);
  if (typeof raw.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(raw.id)) return null;
  if (w === null || h === null || w < 1 || h < 1) return null;
  return { id: raw.id, name: str(raw.name, 200), width: Math.round(w), height: Math.round(h) };
}

function normalizeCharacters(raw: unknown): Character[] {
  const out: Character[] = [];
  if (!Array.isArray(raw)) return out;
  const used = new Set<string>();
  for (const it of raw) {
    if (!isObj(it) || out.length >= LIMITS.characters) continue;
    let id = typeof it.id === 'string' && /^c\d+$/.test(it.id) ? it.id : '';
    if (!id || used.has(id))
      id = nextId(
        'c',
        [...used].map((u) => ({ id: u })),
      );
    used.add(id);
    const image = normalizeImage(it.image);
    out.push({
      id,
      name: str(it.name, LIMITS.name),
      color: normalizeColor(it.color, PALETTE[out.length % PALETTE.length]),
      image,
      marker: image && it.marker !== 'dot' ? 'image' : 'dot',
      inMap: it.inMap !== false,
    });
  }
  return out;
}

function normalizePages(raw: unknown, ids: Set<string>): QuadPage[] {
  const out: QuadPage[] = [];
  if (Array.isArray(raw)) {
    const used = new Set<string>();
    for (const it of raw) {
      if (!isObj(it) || out.length >= LIMITS.pages) continue;
      let id = typeof it.id === 'string' && /^p\d+$/.test(it.id) ? it.id : '';
      if (!id || used.has(id))
        id = nextId(
          'p',
          [...used].map((u) => ({ id: u })),
        );
      used.add(id);
      const labels = isObj(it.labels) ? it.labels : {};
      const positions: Record<string, Point> = {};
      if (isObj(it.positions))
        for (const [cid, p] of Object.entries(it.positions)) {
          if (!ids.has(cid) || !isObj(p)) continue;
          const x = num(p.x);
          const y = num(p.y);
          if (x !== null && y !== null) positions[cid] = clampPosition({ x, y });
        }
      out.push({
        id,
        title: str(it.title, LIMITS.title),
        labels: {
          top: str(labels.top, LIMITS.axis),
          bottom: str(labels.bottom, LIMITS.axis),
          left: str(labels.left, LIMITS.axis),
          right: str(labels.right, LIMITS.axis),
        },
        positions,
      });
    }
  }
  return out.length ? out : initialState().pages;
}

function normalizeRelation(raw: unknown, ids: Set<string>): RelationState {
  const base = initialState().relation;
  if (!isObj(raw)) return base;
  const legends: Legend[] = [];
  if (Array.isArray(raw.legends)) {
    const used = new Set<string>();
    for (const it of raw.legends) {
      if (!isObj(it) || legends.length >= LIMITS.legends) continue;
      let id = typeof it.id === 'string' && /^l\d+$/.test(it.id) ? it.id : '';
      if (!id || used.has(id))
        id = nextId(
          'l',
          [...used].map((u) => ({ id: u })),
        );
      used.add(id);
      legends.push({
        id,
        label: str(it.label, LIMITS.legend),
        color: normalizeColor(it.color, PALETTE[legends.length % PALETTE.length]),
        style: LINE_STYLES.includes(it.style as LineStyle) ? (it.style as LineStyle) : 'solid',
      });
    }
  }
  const finalLegends = legends.length ? legends : base.legends;
  const legendIds = new Set(finalLegends.map((l) => l.id));
  const links: Link[] = [];
  if (Array.isArray(raw.links))
    for (const it of raw.links) {
      if (!isObj(it)) continue;
      const { from, to, legend } = it;
      if (typeof from !== 'string' || typeof to !== 'string' || typeof legend !== 'string')
        continue;
      if (from === to || !ids.has(from) || !ids.has(to) || !legendIds.has(legend)) continue;
      if (links.some((l) => samePair(l, from, to))) continue;
      links.push({ from, to, legend });
    }
  return {
    title: str(raw.title, LIMITS.title, base.title),
    showNames: raw.showNames !== false,
    legends: finalLegends,
    links,
  };
}

/**
 * 自動儲存、專案檔讀回時的整理（規格 3.7）：壞掉的項目丟掉、id 重複時重編、文字截到上限、色碼整理、
 * 位置夾在畫布裡、指到不存在的角色或線的資料丟掉；沒有頁面時回到預設的三頁、沒有線的種類時回到預設。
 */
export function normalizeState(raw: unknown): ChartState {
  const d = isObj(raw) ? raw : {};
  const characters = normalizeCharacters(d.characters);
  const ids = new Set(characters.map((c) => c.id));
  /* 不在關係圖上的人不能有連線 */
  const members = new Set(characters.filter((c) => c.inMap).map((c) => c.id));
  return {
    characters,
    pages: normalizePages(d.pages, ids),
    relation: normalizeRelation(d.relation, members),
  };
}

/** 狀態裡用到的圖片（專案檔、資產庫整理用） */
export const imageIds = (d: ChartState): string[] =>
  d.characters.flatMap((c) => (c.image ? [c.image.id] : []));
