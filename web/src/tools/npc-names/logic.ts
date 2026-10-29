/**
 * NPC 名字產生器的純邏輯（不依賴 React）：設定、鎖定後再產生的合併、複製的文字、讀回存檔時的整理。
 * 抽籤本身在 core/names。
 */
import {
  type GeneratedName,
  type GenerateNamesResult,
  generateNames,
  isNameGenderChoice,
  isNameRegion,
  NAME_COUNT_MAX,
  NAME_GENDER_LABELS,
  NAME_REGIONS,
  type NameData,
  type NameGenderChoice,
  type NameRegion,
  nameReadings,
  randomSeed,
} from '@/core/names';

export const TOOL_ID = 'npc-names';

export interface ReadingShow {
  hiragana: boolean;
  katakana: boolean;
  romaji: boolean;
}

export interface NamesState {
  region: NameRegion;
  /** 每個地區各自記住選的年代 */
  eras: Record<NameRegion, string>;
  gender: NameGenderChoice;
  count: number;
  middleInitial: boolean;
  show: ReadingShow;
  copyReading: boolean;
  /** 使用者填的種子（空字串＝每次隨機） */
  seed: string;
  /** 目前這一批 */
  names: GeneratedName[];
  /** 鎖定的名字（全名） */
  locked: string[];
  /** 目前這一批用的種子 */
  lastSeed: string;
}

export const DEFAULT_COUNT = 10;

export const initialState: NamesState = {
  region: 'jp',
  eras: Object.fromEntries(NAME_REGIONS.map((r) => [r.id, r.eras[0].id])) as Record<
    NameRegion,
    string
  >,
  gender: 'any',
  count: DEFAULT_COUNT,
  middleInitial: false,
  show: { hiragana: true, katakana: true, romaji: true },
  copyReading: false,
  seed: '',
  names: [],
  locked: [],
  lastSeed: '',
};

const clampCount = (n: unknown) =>
  Math.max(1, Math.min(NAME_COUNT_MAX, Math.round(Number(n)) || DEFAULT_COUNT));

/** 讀回的一個名字：欄位不齊的丟掉 */
function cleanName(raw: unknown): GeneratedName | null {
  if (!raw || typeof raw !== 'object') return null;
  const n = raw as Partial<GeneratedName>;
  if (!isNameRegion(n.region) || typeof n.text !== 'string' || !n.text) return null;
  if (typeof n.family !== 'string' || typeof n.given !== 'string') return null;
  if (n.gender !== 'male' && n.gender !== 'female') return null;
  return {
    region: n.region,
    era: typeof n.era === 'string' ? n.era : '',
    gender: n.gender,
    family: n.family,
    given: n.given,
    ...(typeof n.middle === 'string' ? { middle: n.middle } : {}),
    ...(typeof n.familyReading === 'string' ? { familyReading: n.familyReading } : {}),
    ...(typeof n.givenReading === 'string' ? { givenReading: n.givenReading } : {}),
    text: n.text,
  };
}

/** 存檔讀回時整理（壞掉的欄位用預設值；新版加的欄位由 createToolStore 補） */
export function sanitizeState(raw: unknown): NamesState {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Partial<NamesState>;
  const eras = { ...initialState.eras };
  if (d.eras && typeof d.eras === 'object') {
    for (const r of NAME_REGIONS) {
      const v = (d.eras as Record<string, unknown>)[r.id];
      if (r.eras.some((e) => e.id === v)) eras[r.id] = v as string;
    }
  }
  const names = Array.isArray(d.names)
    ? d.names.map(cleanName).filter((n): n is GeneratedName => !!n)
    : [];
  const texts = new Set(names.map((n) => n.text));
  return {
    region: isNameRegion(d.region) ? d.region : initialState.region,
    eras,
    gender: isNameGenderChoice(d.gender) ? d.gender : initialState.gender,
    count: clampCount(d.count),
    middleInitial: d.middleInitial === true,
    show: {
      hiragana: d.show?.hiragana !== false,
      katakana: d.show?.katakana !== false,
      romaji: d.show?.romaji !== false,
    },
    copyReading: d.copyReading === true,
    seed: typeof d.seed === 'string' ? d.seed : '',
    names,
    locked: Array.isArray(d.locked)
      ? d.locked.filter((t): t is string => typeof t === 'string' && texts.has(t))
      : [],
    lastSeed: typeof d.lastSeed === 'string' ? d.lastSeed : '',
  };
}

/**
 * 鎖定後再產生：鎖定的名字留在原本的位置，其他位置依序換成新的；位置不夠時接在後面，
 * 數量變少時從後面拿掉沒有鎖定的。
 */
export function mergeBatch(
  old: readonly GeneratedName[],
  locked: ReadonlySet<string>,
  fresh: readonly GeneratedName[],
  count: number,
): GeneratedName[] {
  const out: GeneratedName[] = [];
  let next = 0;
  const keep = old.filter((n) => locked.has(n.text)).length;
  let unlockedSlots = Math.max(0, count - keep);
  for (const n of old) {
    if (locked.has(n.text)) out.push(n);
    else if (unlockedSlots > 0 && next < fresh.length) {
      out.push(fresh[next++]);
      unlockedSlots--;
    }
  }
  while (unlockedSlots > 0 && next < fresh.length) {
    out.push(fresh[next++]);
    unlockedSlots--;
  }
  return out;
}

export interface BatchResult {
  names: GeneratedName[];
  seed: string;
  exhausted: boolean;
}

/**
 * 依目前的設定產生一批（鎖定的留著）。種子：使用者填了就用它，否則隨機產生一個（記在 lastSeed，
 * 填回去就能重現）。
 */
export function nextBatch(
  state: NamesState,
  data: NameData,
  random: () => number = Math.random,
): BatchResult {
  const locked = new Set(state.locked);
  const kept = state.names.filter((n) => locked.has(n.text));
  const seed = state.seed.trim() || randomSeed(random);
  const need = Math.max(0, state.count - kept.length);
  const result: GenerateNamesResult = generateNames(data, {
    count: need,
    era: state.eras[state.region],
    gender: state.gender,
    middleInitial: state.middleInitial,
    seed,
    exclude: kept.map((n) => n.text),
  });
  return {
    names: mergeBatch(state.names, locked, result.names, state.count),
    seed,
    exhausted: result.exhausted,
  };
}

/** 一個名字畫面上要顯示的讀音（依設定；沒有讀音的地區是空陣列） */
export function shownReadings(name: GeneratedName, show: ReadingShow): string[] {
  const r = nameReadings(name);
  if (!r) return [];
  return [show.hiragana && r.hiragana, show.katakana && r.katakana, show.romaji && r.romaji].filter(
    (s): s is string => !!s,
  );
}

/** 複製一個名字的文字：只有全名，或附上畫面上顯示的讀音「佐藤 博（さとう ひろし／Satou Hiroshi）」 */
export function copyLine(name: GeneratedName, state: Pick<NamesState, 'show' | 'copyReading'>) {
  if (!state.copyReading) return name.text;
  const r = shownReadings(name, state.show);
  return r.length ? `${name.text}（${r.join('／')}）` : name.text;
}

/** 全部複製：一行一個 */
export function copyAllText(
  names: readonly GeneratedName[],
  state: Pick<NamesState, 'show' | 'copyReading'>,
): string {
  return names.map((n) => copyLine(n, state)).join('\n');
}

/* ---------- 紀錄 ---------- */

/** 紀錄最多留幾批（自訂） */
export const HISTORY_MAX = 20;
/** 上一批產生後這麼短的時間內又產生（例如拖數量的滑桿），取代上一筆紀錄，不另外記（毫秒，自訂） */
export const HISTORY_MERGE_MS = 1000;

export interface HistoryEntry {
  id: string;
  /** 產生的時間（毫秒時間戳） */
  at: number;
  region: NameRegion;
  era: string;
  gender: NameGenderChoice;
  seed: string;
  names: GeneratedName[];
}

/** 加一筆紀錄（新的在前；和上一筆相隔不到 HISTORY_MERGE_MS 時取代它；最多 HISTORY_MAX 筆） */
export function pushHistory(
  history: readonly HistoryEntry[],
  entry: HistoryEntry,
  max = HISTORY_MAX,
): HistoryEntry[] {
  const rest =
    history[0] && entry.at - history[0].at >= 0 && entry.at - history[0].at < HISTORY_MERGE_MS
      ? history.slice(1)
      : history;
  return [entry, ...rest].slice(0, max);
}

/** 讀回的紀錄：壞掉的丟掉 */
export function sanitizeHistory(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: HistoryEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Partial<HistoryEntry>;
    if (!isNameRegion(e.region) || typeof e.at !== 'number' || !Array.isArray(e.names)) continue;
    const names = e.names.map(cleanName).filter((n): n is GeneratedName => !!n);
    if (!names.length) continue;
    out.push({
      id: typeof e.id === 'string' ? e.id : String(e.at),
      at: e.at,
      region: e.region,
      era: typeof e.era === 'string' ? e.era : '',
      gender: isNameGenderChoice(e.gender) ? e.gender : 'any',
      seed: typeof e.seed === 'string' ? e.seed : '',
      names,
    });
    if (out.length >= HISTORY_MAX) break;
  }
  return out;
}

/** 紀錄的標題：「日本・現代・不限」 */
export function historyLabel(entry: Pick<HistoryEntry, 'region' | 'era' | 'gender'>): string {
  const info = NAME_REGIONS.find((r) => r.id === entry.region);
  const era = info?.eras.find((e) => e.id === entry.era);
  return [
    info?.label,
    info && info.eras.length > 1 ? era?.label : null,
    NAME_GENDER_LABELS[entry.gender],
  ]
    .filter(Boolean)
    .join('・');
}

/* ---------- 匯出 ---------- */

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 匯出的檔名：NPC名字_20261029-1430.txt／.csv */
export function exportFileName(ext: 'txt' | 'csv', now = new Date()): string {
  const stamp = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}`;
  return `NPC名字_${stamp}.${ext}`;
}

/** TXT：和「全部複製」相同（一行一個；附讀音的設定也一樣），最後換行；換行 CRLF（Windows 的記事本） */
export function toTxt(
  names: readonly GeneratedName[],
  state: Pick<NamesState, 'show' | 'copyReading'>,
): string {
  return `${names.map((n) => copyLine(n, state)).join('\r\n')}\r\n`;
}

export const CSV_HEADER = [
  '全名',
  '姓',
  '名',
  '中間名縮寫',
  '性別',
  '地區',
  '年代',
  '平假名',
  '片假名',
  '羅馬拼音',
] as const;

/** CSV 的列（第一列是標題；讀音不看顯示的設定，日本的名字三種都填） */
export function csvRows(names: readonly GeneratedName[]): string[][] {
  return [
    [...CSV_HEADER],
    ...names.map((n) => {
      const info = NAME_REGIONS.find((r) => r.id === n.region);
      const r = nameReadings(n);
      return [
        n.text,
        n.family,
        n.given,
        n.middle ?? '',
        NAME_GENDER_LABELS[n.gender],
        info?.label ?? '',
        info?.eras.find((e) => e.id === n.era)?.label ?? '',
        r?.hiragana ?? '',
        r?.katakana ?? '',
        r?.romaji ?? '',
      ];
    }),
  ];
}
