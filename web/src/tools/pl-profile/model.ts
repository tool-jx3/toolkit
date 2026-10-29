/**
 * PL 自介卡與地雷表的資料（規格第 1～3 節）：自介卡的欄位、地雷表（內建主題的程度、補充、自訂主題與分類）、外觀。
 * 純資料與純函式（不依賴 React、DOM），自動存檔、專案檔、分享連結、KP 對照表都用這裡的整理函式（normalizeData）。
 */
import { clampPlacement, type FramePlacement, normalizePlacement } from '@/core/image';
import { CATEGORIES, CATEGORY_INDEX, type CategoryDef, TOPIC_INDEX } from './topics';

export const TOOL_ID = 'pl-profile';
export const DATA_VERSION = 1;

/* ---------- 五級量表 ---------- */

export type LevelId = 'love' | 'like' | 'ok' | 'ask' | 'ng';
/** 量表的順序（編輯區的按鈕、圖例） */
export const LEVELS: readonly LevelId[] = ['love', 'like', 'ok', 'ask', 'ng'];
/** 依程度列出時的順序：需要注意的在前 */
export const LEVEL_OUTPUT_ORDER: readonly LevelId[] = ['ng', 'ask', 'love', 'like', 'ok'];
export const isLevel = (v: unknown): v is LevelId => LEVELS.includes(v as LevelId);
/** 需要 KP 注意的程度 */
export const isIssue = (l: LevelId | null | undefined): boolean => l === 'ng' || l === 'ask';

/* ---------- 自介卡 ---------- */

export type ExpLevel = '' | 'none' | 'new' | 'some' | 'veteran';
export const EXP_LEVELS: readonly Exclude<ExpLevel, ''>[] = ['none', 'new', 'some', 'veteran'];
export type SystemLevel = 'main' | 'often' | 'played' | 'want';
export const SYSTEM_LEVELS: readonly SystemLevel[] = ['main', 'often', 'played', 'want'];
export type AgeChoice = '' | 'adult' | 'minor' | 'private';
export const AGE_CHOICES: readonly Exclude<AgeChoice, ''>[] = ['adult', 'minor', 'private'];

/** 可以開關的欄位（暱稱一定顯示） */
export type FieldKey =
  | 'handle'
  | 'tagline'
  | 'avatar'
  | 'age'
  | 'experience'
  | 'systems'
  | 'styles'
  | 'formats'
  | 'tools'
  | 'schedule'
  | 'contact'
  | 'memo';
export const FIELD_KEYS: readonly FieldKey[] = [
  'handle',
  'tagline',
  'avatar',
  'age',
  'experience',
  'systems',
  'styles',
  'formats',
  'tools',
  'schedule',
  'contact',
  'memo',
];

/** 標籤組（預設的選項＋自己加的） */
export type TagGroupKey = 'styles' | 'formats' | 'tools' | 'schedule';
export const TAG_GROUPS: readonly TagGroupKey[] = ['styles', 'formats', 'tools', 'schedule'];

/** 各標籤組的預設選項（id；名稱在 strings.ts 的 OUT.tags） */
export const TAG_PRESETS: Record<TagGroupKey, readonly string[]> = {
  styles: [
    'story',
    'rp',
    'explore',
    'puzzle',
    'battle',
    'horror',
    'comedy',
    'drama',
    'tactics',
    'sandbox',
  ],
  formats: [
    'online',
    'offline',
    'voice',
    'text',
    'solo',
    'duo',
    'party',
    'oneshot',
    'campaign',
    'longterm',
  ],
  tools: ['ccfolia', 'discord', 'roll20', 'foundry', 'owlbear', 'udonarium'],
  schedule: ['wdday', 'wdnight', 'weday', 'wenight', 'late', 'flexible'],
};

export interface TagGroup {
  /** 選了的預設選項（照預設的順序存） */
  picked: string[];
  /** 自己加的（加了就算選了；按 × 拿掉） */
  extra: string[];
}

export interface SystemEntry {
  id: string;
  name: string;
  level: SystemLevel;
  /** 可以當 KP */
  kp: boolean;
  note: string;
}

export interface ContactEntry {
  id: string;
  /** 種類（Discord、X…，自由輸入） */
  kind: string;
  value: string;
}

export interface AvatarRef {
  /** 資產庫的 id */
  id: string;
  name: string;
  width: number;
  height: number;
}

export interface Profile {
  nickname: string;
  handle: string;
  tagline: string;
  avatar: AvatarRef | null;
  /** 頭像取圖片的哪一部分（ImageFrameDialog 的位置；null＝置中蓋滿） */
  avatarPlacement: FramePlacement | null;
  avatarCredit: string;
  age: AgeChoice;
  plExp: ExpLevel;
  kpExp: ExpLevel;
  expNote: string;
  systems: SystemEntry[];
  styles: TagGroup;
  formats: TagGroup;
  tools: TagGroup;
  schedule: TagGroup;
  scheduleNote: string;
  contacts: ContactEntry[];
  memo: string;
}

/* ---------- 地雷表 ---------- */

export interface CustomTopic {
  id: string;
  /** 放在哪個分類：內建分類的 key，或自訂分類的 id */
  cat: string;
  label: string;
  level: LevelId | null;
  note: string;
}

export interface CustomCategory {
  id: string;
  name: string;
}

export interface Jirai {
  /** 內建主題的程度（沒填的不列） */
  levels: Record<string, LevelId>;
  /** 內建主題的補充（一句） */
  notes: Record<string, string>;
  custom: CustomTopic[];
  cats: CustomCategory[];
  /** 顯示成人向的主題 */
  adult: boolean;
  /** 整張的補充說明 */
  memo: string;
}

/* ---------- 外觀 ---------- */

export type ThemeId = 'paper' | 'cream' | 'mint' | 'sakura' | 'night' | 'ink';
export const THEMES: readonly ThemeId[] = ['paper', 'cream', 'mint', 'sakura', 'night', 'ink'];
/** 要哪幾張圖 */
export type ImagesMode = 'combined' | 'split' | 'profile' | 'jirai';
export const IMAGES_MODES: readonly ImagesMode[] = ['combined', 'split', 'profile', 'jirai'];
/** 地雷表的列法 */
export type GroupMode = 'level' | 'category';
export const GROUP_MODES: readonly GroupMode[] = ['level', 'category'];
export type ScaleId = 1 | 2;

export const ACCENT_SWATCHES: readonly string[] = [
  '#4b6bd6',
  '#2f9c8f',
  '#4f9a46',
  '#d8902a',
  '#d0505a',
  '#c4588f',
  '#7d5bc4',
  '#4a4f5c',
];

export interface Look {
  theme: ThemeId;
  /** 主色 #rrggbb */
  accent: string;
  images: ImagesMode;
  group: GroupMode;
  /** 圖片與文字包含主題的補充 */
  notes: boolean;
  /** 圖片的倍率（寬 800 × 倍率） */
  scale: ScaleId;
}

export interface ProfileData {
  profile: Profile;
  show: Record<FieldKey, boolean>;
  jirai: Jirai;
  look: Look;
}

/* ---------- 上限（規格 2.） ---------- */

export const LIMITS = {
  nickname: 24,
  handle: 40,
  tagline: 60,
  avatarCredit: 40,
  expNote: 60,
  systems: 12,
  systemName: 30,
  systemNote: 40,
  tagExtra: 10,
  tagLabel: 20,
  scheduleNote: 80,
  contacts: 6,
  contactKind: 12,
  contactValue: 60,
  memo: 300,
  customTopics: 40,
  topicLabel: 24,
  topicNote: 40,
  customCats: 6,
  catName: 16,
  jiraiMemo: 300,
} as const;

/** 頭像的縮放上限（ImageFrameDialog 的 cover） */
export const AVATAR_MAX_ZOOM = 4;
/** 頭像圖片存進資產庫時的長邊上限 */
export const AVATAR_MAX_SIDE = 1024;

/* ---------- 初始值 ---------- */

const emptyTags = (): TagGroup => ({ picked: [], extra: [] });

export function initialShow(): Record<FieldKey, boolean> {
  const show = Object.fromEntries(FIELD_KEYS.map((k) => [k, true])) as Record<FieldKey, boolean>;
  /* 年齡預設不顯示（個人資料，要的人自己打開；規格 F06） */
  show.age = false;
  return show;
}

export function initialProfile(): Profile {
  return {
    nickname: '',
    handle: '',
    tagline: '',
    avatar: null,
    avatarPlacement: null,
    avatarCredit: '',
    age: '',
    plExp: '',
    kpExp: '',
    expNote: '',
    systems: [],
    styles: emptyTags(),
    formats: emptyTags(),
    tools: emptyTags(),
    schedule: emptyTags(),
    scheduleNote: '',
    contacts: [],
    memo: '',
  };
}

export const initialJirai = (): Jirai => ({
  levels: {},
  notes: {},
  custom: [],
  cats: [],
  adult: false,
  memo: '',
});

export const initialLook = (): Look => ({
  theme: 'paper',
  accent: ACCENT_SWATCHES[0],
  images: 'combined',
  group: 'level',
  notes: true,
  scale: 2,
});

export const initialData = (): ProfileData => ({
  profile: initialProfile(),
  show: initialShow(),
  jirai: initialJirai(),
  look: initialLook(),
});

/* ---------- 識別碼 ---------- */

let idSeq = 0;
/** 清單項目的 id（同一頁面內不重複即可） */
export function newId(prefix: string): string {
  idSeq += 1;
  return `${prefix}${Date.now().toString(36)}${idSeq.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/* ---------- 整理（讀存檔、專案檔、分享連結時；任何輸入都不丟錯） ---------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** 拿掉控制字元（換行另外處理）、截到 max 個字（碼位） */
function clip(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? chars.slice(0, max).join('') : text;
}

/**
 * 雙向文字的控制字元（U+202A～U+202E、U+2066～U+2069）：可以把後面的字倒過來顯示、讓檔名或名稱看起來是別的樣子，
 * 和 C0 控制字元一起拿掉（pl-profile 驗證後加的）。
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: 刻意拿掉控制字元
const CONTROL_1 = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: 刻意拿掉控制字元（換行留著）
const CONTROL_N = /[\u0000-\u0009\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g;

/** 單行文字：換行換成空白、控制字元拿掉、截斷（不去頭尾空白：打字中的空白要留著） */
export function oneLine(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return clip(v.replace(/[\r\n\t]+/g, ' ').replace(CONTROL_1, ''), max);
}

/** 多行文字：統一換行、去掉其他控制字元、截斷 */
export function multiLine(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return clip(v.replace(/\r\n?/g, '\n').replace(CONTROL_N, ''), max);
}

const oneOf = <V>(values: readonly V[], v: unknown, fallback: V): V =>
  values.includes(v as V) ? (v as V) : fallback;

const cleanId = (v: unknown, prefix: string): string =>
  typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : newId(prefix);

/** 同一個清單裡的 id 不重複（重複的換新的） */
function uniqueIds<T extends { id: string }>(list: T[], prefix: string): T[] {
  const seen = new Set<string>();
  return list.map((it) => {
    if (!seen.has(it.id)) {
      seen.add(it.id);
      return it;
    }
    const id = newId(prefix);
    seen.add(id);
    return { ...it, id };
  });
}

/** 標籤文字的比對鍵：全形半形、大小寫、前後與連續空白都當成一樣 */
export const labelKey = (label: string): string =>
  label.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

function normalizeTags(raw: unknown, group: TagGroupKey): TagGroup {
  const o = isObj(raw) ? raw : {};
  const presets = TAG_PRESETS[group];
  const picked = Array.isArray(o.picked) ? o.picked : [];
  const want = new Set(picked.filter((x): x is string => typeof x === 'string'));
  const extra: string[] = [];
  const seen = new Set<string>();
  for (const x of Array.isArray(o.extra) ? o.extra : []) {
    const label = oneLine(x, LIMITS.tagLabel).trim();
    const key = labelKey(label);
    if (!label || seen.has(key)) continue;
    seen.add(key);
    extra.push(label);
    if (extra.length >= LIMITS.tagExtra) break;
  }
  return { picked: presets.filter((p) => want.has(p)), extra };
}

function normalizeAvatar(raw: unknown): AvatarRef | null {
  if (!isObj(raw)) return null;
  const id = typeof raw.id === 'string' && /^[A-Za-z0-9_-]{4,80}$/.test(raw.id) ? raw.id : null;
  const w = Number(raw.width);
  const h = Number(raw.height);
  if (!id || !(w >= 1 && w <= 20000) || !(h >= 1 && h <= 20000)) return null;
  return { id, name: oneLine(raw.name, 120), width: Math.round(w), height: Math.round(h) };
}

/**
 * 頭像的範圍：縮放 1～AVATAR_MAX_ZOOM、位移夾在「圓框被圖片蓋滿」的範圍（共用的 clampPlacement）；
 * 沒有圖片、看不懂、置中蓋滿（預設）時 null。
 */
export function normalizeAvatarPlacement(
  raw: unknown,
  image: { width: number; height: number } | null,
): FramePlacement | null {
  if (!image || !isObj(raw)) return null;
  const p = normalizePlacement(raw, { minZoom: 1, maxZoom: AVATAR_MAX_ZOOM });
  const c = clampPlacement(image, { width: 1, height: 1 }, p, AVATAR_MAX_ZOOM);
  const r = (v: number) => Math.round(v * 10000) / 10000;
  const out = { zoom: r(c.zoom), x: r(c.x) || 0, y: r(c.y) || 0, turns: c.turns };
  if (out.zoom === 1 && out.x === 0 && out.y === 0 && out.turns === 0) return null;
  return out;
}

export function normalizeProfile(raw: unknown): Profile {
  const o = isObj(raw) ? raw : {};
  const avatar = normalizeAvatar(o.avatar);
  const systems = (Array.isArray(o.systems) ? o.systems : [])
    .slice(0, LIMITS.systems)
    .map((x): SystemEntry => {
      const s = isObj(x) ? x : {};
      return {
        id: cleanId(s.id, 's'),
        name: oneLine(s.name, LIMITS.systemName),
        level: oneOf(SYSTEM_LEVELS, s.level, 'played'),
        kp: s.kp === true,
        note: oneLine(s.note, LIMITS.systemNote),
      };
    });
  const contacts = (Array.isArray(o.contacts) ? o.contacts : [])
    .slice(0, LIMITS.contacts)
    .map((x): ContactEntry => {
      const c = isObj(x) ? x : {};
      return {
        id: cleanId(c.id, 'c'),
        kind: oneLine(c.kind, LIMITS.contactKind),
        value: oneLine(c.value, LIMITS.contactValue),
      };
    });
  return {
    nickname: oneLine(o.nickname, LIMITS.nickname),
    handle: oneLine(o.handle, LIMITS.handle),
    tagline: oneLine(o.tagline, LIMITS.tagline),
    avatar,
    avatarPlacement: normalizeAvatarPlacement(o.avatarPlacement, avatar),
    avatarCredit: oneLine(o.avatarCredit, LIMITS.avatarCredit),
    age: oneOf<AgeChoice>(['', ...AGE_CHOICES], o.age, ''),
    plExp: oneOf<ExpLevel>(['', ...EXP_LEVELS], o.plExp, ''),
    kpExp: oneOf<ExpLevel>(['', ...EXP_LEVELS], o.kpExp, ''),
    expNote: oneLine(o.expNote, LIMITS.expNote),
    systems: uniqueIds(systems, 's'),
    styles: normalizeTags(o.styles, 'styles'),
    formats: normalizeTags(o.formats, 'formats'),
    tools: normalizeTags(o.tools, 'tools'),
    schedule: normalizeTags(o.schedule, 'schedule'),
    scheduleNote: oneLine(o.scheduleNote, LIMITS.scheduleNote),
    contacts: uniqueIds(contacts, 'c'),
    memo: multiLine(o.memo, LIMITS.memo),
  };
}

export function normalizeShow(raw: unknown): Record<FieldKey, boolean> {
  const o = isObj(raw) ? raw : {};
  const base = initialShow();
  for (const k of FIELD_KEYS) if (typeof o[k] === 'boolean') base[k] = o[k] as boolean;
  return base;
}

export function normalizeJirai(raw: unknown): Jirai {
  const o = isObj(raw) ? raw : {};
  const levels: Record<string, LevelId> = {};
  const notes: Record<string, string> = {};
  if (isObj(o.levels))
    for (const [k, v] of Object.entries(o.levels))
      if (TOPIC_INDEX.has(k) && isLevel(v)) levels[k] = v;
  if (isObj(o.notes))
    for (const [k, v] of Object.entries(o.notes)) {
      const note = oneLine(v, LIMITS.topicNote);
      if (TOPIC_INDEX.has(k) && note.trim()) notes[k] = note;
    }
  const cats = uniqueIds(
    (Array.isArray(o.cats) ? o.cats : []).slice(0, LIMITS.customCats).map((x) => {
      const c = isObj(x) ? x : {};
      return { id: cleanId(c.id, 'k'), name: oneLine(c.name, LIMITS.catName) };
    }),
    'k',
  ).filter((c) => !CATEGORY_INDEX.has(c.id));
  const catIds = new Set(cats.map((c) => c.id));
  const custom = uniqueIds(
    (Array.isArray(o.custom) ? o.custom : []).slice(0, LIMITS.customTopics).map((x) => {
      const t = isObj(x) ? x : {};
      const cat = typeof t.cat === 'string' && (CATEGORY_INDEX.has(t.cat) || catIds.has(t.cat));
      return {
        id: cleanId(t.id, 't'),
        cat: cat ? (t.cat as string) : (cats[0]?.id ?? CATEGORIES[0].key),
        label: oneLine(t.label, LIMITS.topicLabel),
        level: isLevel(t.level) ? t.level : null,
        note: oneLine(t.note, LIMITS.topicNote),
      };
    }),
    't',
  );
  return {
    levels,
    notes,
    custom,
    cats,
    adult: o.adult === true,
    memo: multiLine(o.memo, LIMITS.jiraiMemo),
  };
}

const HEX = /^#[0-9a-f]{6}$/;

export function normalizeLook(raw: unknown): Look {
  const o = isObj(raw) ? raw : {};
  const base = initialLook();
  const accent = typeof o.accent === 'string' ? o.accent.trim().toLowerCase() : '';
  return {
    theme: oneOf(THEMES, o.theme, base.theme),
    accent: HEX.test(accent) ? accent : base.accent,
    images: oneOf(IMAGES_MODES, o.images, base.images),
    group: oneOf(GROUP_MODES, o.group, base.group),
    notes: typeof o.notes === 'boolean' ? o.notes : base.notes,
    scale: o.scale === 1 ? 1 : 2,
  };
}

/** 任何輸入 → 可以用的資料（壞掉的欄位用預設值） */
export function normalizeData(raw: unknown): ProfileData {
  const o = isObj(raw) ? raw : {};
  return {
    profile: normalizeProfile(o.profile),
    show: normalizeShow(o.show),
    jirai: normalizeJirai(o.jirai),
    look: normalizeLook(o.look),
  };
}

/* ---------- 地雷表的檢視（編輯區、輸出、對照表共用） ---------- */

export interface TopicView {
  /** 內建主題的 key 或自訂主題的 id */
  id: string;
  builtin: boolean;
  label: string;
  level: LevelId | null;
  note: string;
}

export interface CategoryView {
  /** 內建分類的 key 或自訂分類的 id */
  id: string;
  name: string;
  builtin: boolean;
  adult: boolean;
  topics: TopicView[];
}

/** 地雷表的所有分類與主題（依編輯區的順序：內建分類〔各自的自訂主題接在後面〕、自訂分類）；成人向依 adult */
export function jiraiCategories(j: Jirai, { includeAdult = j.adult } = {}): CategoryView[] {
  const customOf = (cat: string): TopicView[] =>
    j.custom
      .filter((t) => t.cat === cat)
      .map((t) => ({ id: t.id, builtin: false, label: t.label, level: t.level, note: t.note }));
  const builtin = CATEGORIES.filter((c) => includeAdult || !c.adult).map(
    (c: CategoryDef): CategoryView => ({
      id: c.key,
      name: c.name,
      builtin: true,
      adult: c.adult === true,
      topics: [
        ...c.topics.map((t) => ({
          id: t.key,
          builtin: true,
          label: t.label,
          level: j.levels[t.key] ?? null,
          note: j.notes[t.key] ?? '',
        })),
        ...customOf(c.key),
      ],
    }),
  );
  const custom = j.cats.map(
    (c): CategoryView => ({
      id: c.id,
      name: c.name,
      builtin: false,
      adult: false,
      topics: customOf(c.id),
    }),
  );
  return [...builtin, ...custom];
}

/** 已填／全部（目前顯示的分類；自訂主題沒有名稱的不算） */
export function jiraiProgress(j: Jirai): { filled: number; total: number } {
  let filled = 0;
  let total = 0;
  for (const c of jiraiCategories(j))
    for (const t of c.topics) {
      if (!t.builtin && !t.label.trim()) continue;
      total += 1;
      if (t.level) filled += 1;
    }
  return { filled, total };
}

/** 填了程度、名稱不是空白的主題（輸出用；成人向依 adult） */
export function filledTopics(j: Jirai): { category: CategoryView; topic: TopicView }[] {
  const out: { category: CategoryView; topic: TopicView }[] = [];
  for (const c of jiraiCategories(j))
    for (const t of c.topics) if (t.level && t.label.trim()) out.push({ category: c, topic: t });
  return out;
}

/** 某個標籤組實際列出的文字（預設選項的名稱＋自己加的） */
export function tagLabels(
  g: TagGroup,
  group: TagGroupKey,
  names: Record<string, string>,
): string[] {
  const picked = TAG_PRESETS[group].filter((p) => g.picked.includes(p)).map((p) => names[p] ?? p);
  return [...picked, ...g.extra.map((x) => x.trim()).filter(Boolean)];
}

/** 頭像的檔名以外，專案檔要帶的圖片 */
export const projectAssetIds = (d: ProfileData): string[] =>
  d.profile.avatar ? [d.profile.avatar.id] : [];

/** 檔名用的名稱（暱稱，空白時用預設） */
export function fileBase(d: ProfileData, fallback: string): string {
  const nick = d.profile.nickname.trim();
  return nick ? `${nick}_${fallback}` : fallback;
}
