/**
 * NPC 名字產生器的純邏輯（不依賴 React）：地區與「年代」的選項（兩種資料）、設定、鎖定後再產生的合併、複製的文字、
 * 讀回存檔時的整理。抽籤本身在 core/names（依人數的名單）與 core/names/corpus（弄墨 Inknomu 的考據語料）。
 */
import {
  type GeneratedName,
  generateNames,
  isNameRegion,
  NAME_COUNT_MAX,
  NAME_REGIONS,
  type NameData,
  type NameEra,
  type NamePart,
  type NameRegion,
  nameReadings,
  randomSeed,
} from '@/core/names';
import {
  CORPUS_COUNTRY_LABELS,
  CORPUS_GENDER_LABELS,
  CORPUS_PACK_HINTS,
  CORPUS_RANK_LABELS,
  CORPUS_REGIONS,
  type CorpusCountry,
  type CorpusData,
  type CorpusGenderChoice,
  type CorpusName,
  type CorpusRank,
  type CorpusRef,
  type CorpusRegion,
  type CorpusSearchEntry,
  corpusKanaReadings,
  corpusPack,
  corpusPackInfo,
  corpusPackLabel,
  corpusPacksOf,
  corpusRegionInfo,
  generateCorpusNames,
  type InknomuPackInfo,
  isCorpusCountry,
  isCorpusGenderChoice,
  isCorpusRank,
  isCorpusRegion,
} from '@/core/names/corpus';

export const TOOL_ID = 'npc-names';

/** 一個名字：依人數的名單（日本、台灣、美國）或考據語料（有 pack） */
export type NpcName = GeneratedName | CorpusName;

export const isCorpusName = (n: NpcName): n is CorpusName => 'pack' in n;

/* ---------- 地區與年代的選項 ---------- */

export type EraSource =
  | { kind: 'count'; region: NameRegion; era: NameEra }
  | { kind: 'corpus'; pack: InknomuPackInfo };

export interface EraOption {
  id: string;
  label: string;
  hint: string;
  source: EraSource;
}

const countRegion = (region: CorpusRegion) =>
  isNameRegion(region) ? NAME_REGIONS.find((r) => r.id === region) : undefined;

/** 一個地區的「年代」選項：依人數的名單（有的話）在前、考據語料的包在後 */
export function eraOptions(region: CorpusRegion): EraOption[] {
  const info = countRegion(region);
  const counts: EraOption[] = info
    ? info.eras.map((era) => ({
        id: era.id,
        label: era.label,
        hint: era.hint,
        source: { kind: 'count', region: info.id, era },
      }))
    : [];
  const packs: EraOption[] = corpusPacksOf(region).map((pack) => ({
    id: pack.id,
    label: corpusPackLabel(pack),
    hint: CORPUS_PACK_HINTS[pack.id] ?? '',
    source: { kind: 'corpus', pack },
  }));
  return [...counts, ...packs];
}

/** 年代 id 不屬於這個地區時用第一個 */
export function eraOption(region: CorpusRegion, era?: string): EraOption {
  const options = eraOptions(region);
  return options.find((o) => o.id === era) ?? options[0];
}

/* ---------- 設定 ---------- */

export interface ReadingShow {
  hiragana: boolean;
  katakana: boolean;
  romaji: boolean;
  /** 原文／拼音（韓國、俄羅斯、維京） */
  original: boolean;
  /** 涵義、備註（考據語料） */
  meaning: boolean;
}

export interface NamesState {
  region: CorpusRegion;
  /** 每個地區各自記住選的年代（或語料的包） */
  eras: Record<CorpusRegion, string>;
  gender: CorpusGenderChoice;
  /** 階級（日本、英國的語料；所有地區共用一個設定） */
  rank: CorpusRank;
  /** 國家（北歐的語料） */
  country: CorpusCountry;
  /** 輸出：全名、只有名、只有姓（所有地區共用一個設定；台灣沒有這個選項） */
  part: NamePart;
  count: number;
  middleInitial: boolean;
  show: ReadingShow;
  copyReading: boolean;
  /** 使用者填的種子（空字串＝每次隨機） */
  seed: string;
  /** 目前這一批 */
  names: NpcName[];
  /** 鎖定的名字（全名） */
  locked: string[];
  /** 目前這一批用的種子 */
  lastSeed: string;
}

export const DEFAULT_COUNT = 10;

export const initialState: NamesState = {
  region: 'jp',
  eras: Object.fromEntries(CORPUS_REGIONS.map((r) => [r.id, eraOptions(r.id)[0].id])) as Record<
    CorpusRegion,
    string
  >,
  gender: 'any',
  rank: 'all',
  country: 'all',
  part: 'full',
  count: DEFAULT_COUNT,
  middleInitial: false,
  show: { hiragana: true, katakana: true, romaji: true, original: true, meaning: true },
  copyReading: false,
  seed: '',
  names: [],
  locked: [],
  lastSeed: '',
};

/** 目前的地區與年代 */
export const currentEra = (state: Pick<NamesState, 'region' | 'eras'>): EraOption =>
  eraOption(state.region, state.eras[state.region]);

export const PART_LABELS: Record<NamePart, string> = {
  full: '全名',
  given: '只有名',
  family: '只有姓',
};

/** 這個地區與年代可以選的輸出：台灣（中文姓名拆開沒有意義）沒有；沒有姓的包（維京）沒有「只有姓」 */
export function partOptions(state: Pick<NamesState, 'region' | 'eras'>): NamePart[] {
  if (state.region === 'tw') return [];
  const src = currentEra(state).source;
  return src.kind === 'corpus' && src.pack.patronymic
    ? ['full', 'given']
    : ['full', 'given', 'family'];
}

/**
 * 實際用的條件：選了中性但這個年代沒有中性名時是不限；階級、國家只在有標記的包才篩；
 * 輸出在不能選的地方是全名（記住的選擇不變，換回可以選的地方時照舊）。
 */
export function effectiveConditions(
  state: Pick<NamesState, 'region' | 'eras' | 'gender' | 'rank' | 'country' | 'part'>,
): { gender: CorpusGenderChoice; rank: CorpusRank; country: CorpusCountry; part: NamePart } {
  const src = currentEra(state).source;
  const pack = src.kind === 'corpus' ? src.pack : null;
  return {
    gender: state.gender === 'neutral' && !pack?.neutral ? 'any' : state.gender,
    rank: pack?.rank ? state.rank : 'all',
    country: pack?.countries ? state.country : 'all',
    part: partOptions(state).includes(state.part) ? state.part : 'full',
  };
}

const isNamePart = (v: unknown): v is NamePart => v === 'full' || v === 'given' || v === 'family';

/** 這個名字是不是目前的地區與年代產生的 */
export function fromCurrentSource(name: NpcName, state: Pick<NamesState, 'region' | 'eras'>) {
  const era = currentEra(state);
  if (isCorpusName(name)) return era.source.kind === 'corpus' && name.pack === era.id;
  return era.source.kind === 'count' && name.region === state.region && name.era === era.id;
}

const clampCount = (n: unknown) =>
  Math.max(1, Math.min(NAME_COUNT_MAX, Math.round(Number(n)) || DEFAULT_COUNT));

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];

const optional = (key: string, v: unknown) => (typeof v === 'string' ? { [key]: v } : {});
const partOf = (v: unknown): { part?: 'given' | 'family' } =>
  v === 'given' || v === 'family' ? { part: v } : {};

const isIndex = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

/** 讀回的查回鍵（看不懂的不留，放回時改用寫法找） */
function refOf(v: unknown): { ref?: CorpusRef } {
  if (!v || typeof v !== 'object') return {};
  const r = v as Record<string, unknown>;
  if (typeof r.g !== 'string' || !/^[mfu]\d+$/.test(r.g)) return {};
  const ref: CorpusRef = { g: r.g };
  for (const k of ['s', 'f', 'e'] as const) {
    const x = r[k];
    if (x === undefined) continue;
    if (!isIndex(x)) return {};
    ref[k] = x;
  }
  return { ref };
}

/** 讀回的一個名字：欄位不齊的、看不懂的包丟掉 */
function cleanName(raw: unknown): NpcName | null {
  if (!raw || typeof raw !== 'object') return null;
  const n = raw as Record<string, unknown>;
  if (typeof n.text !== 'string' || !n.text) return null;
  if (typeof n.family !== 'string' || typeof n.given !== 'string') return null;
  if (typeof n.pack === 'string') {
    const info = corpusPackInfo(n.pack);
    if (!info || n.region !== info.region) return null;
    if (n.gender !== 'male' && n.gender !== 'female' && n.gender !== 'neutral') return null;
    return {
      pack: info.id,
      region: info.region,
      gender: n.gender,
      family: n.family,
      given: n.given,
      ...optional('epithet', n.epithet),
      ...optional('familyReading', n.familyReading),
      ...optional('givenReading', n.givenReading),
      ...optional('original', n.original),
      ...partOf(n.part),
      text: n.text,
      meanings: strings(n.meanings),
      notes: strings(n.notes),
      extras: strings(n.extras),
      ...refOf(n.ref),
    };
  }
  if (!isNameRegion(n.region)) return null;
  if (n.gender !== 'male' && n.gender !== 'female') return null;
  return {
    region: n.region,
    era: typeof n.era === 'string' ? n.era : '',
    gender: n.gender,
    family: n.family,
    given: n.given,
    ...optional('middle', n.middle),
    ...optional('familyReading', n.familyReading),
    ...optional('givenReading', n.givenReading),
    ...partOf(n.part),
    text: n.text,
  };
}

/**
 * 存檔讀回時整理（壞掉的欄位用預設值）。2026-10 以前的存檔（只有日本、台灣、美國與那時的年代 id）照常讀入，
 * 新的欄位（其他地區的年代、階級、國家、原文／拼音與涵義的顯示）用預設值。
 */
export function sanitizeState(raw: unknown): NamesState {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Partial<NamesState>;
  const eras = { ...initialState.eras };
  if (d.eras && typeof d.eras === 'object') {
    for (const r of CORPUS_REGIONS) {
      const v = (d.eras as Record<string, unknown>)[r.id];
      if (eraOptions(r.id).some((e) => e.id === v)) eras[r.id] = v as string;
    }
  }
  const names = Array.isArray(d.names)
    ? d.names.map(cleanName).filter((n): n is NpcName => !!n)
    : [];
  const texts = new Set(names.map((n) => n.text));
  return {
    region: isCorpusRegion(d.region) ? d.region : initialState.region,
    eras,
    gender: isCorpusGenderChoice(d.gender) ? d.gender : initialState.gender,
    rank: isCorpusRank(d.rank) ? d.rank : initialState.rank,
    country: isCorpusCountry(d.country) ? d.country : initialState.country,
    part: isNamePart(d.part) ? d.part : initialState.part,
    count: clampCount(d.count),
    middleInitial: d.middleInitial === true,
    show: {
      hiragana: d.show?.hiragana !== false,
      katakana: d.show?.katakana !== false,
      romaji: d.show?.romaji !== false,
      original: d.show?.original !== false,
      meaning: d.show?.meaning !== false,
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
  old: readonly NpcName[],
  locked: ReadonlySet<string>,
  fresh: readonly NpcName[],
  count: number,
): NpcName[] {
  const out: NpcName[] = [];
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
  names: NpcName[];
  seed: string;
  exhausted: boolean;
}

const isCorpusData = (data: NameData | CorpusData): data is CorpusData => 'packs' in data;

/**
 * 依目前的設定產生一批（鎖定的留著）。資料：依人數的名單是 core/names 的 NameData，考據語料是那個地區的 CorpusData。
 * 種子：使用者填了就用它，否則隨機產生一個（記在 lastSeed，填回去就能重現）。
 */
export function nextBatch(
  state: NamesState,
  data: NameData | CorpusData,
  random: () => number = Math.random,
): BatchResult {
  const locked = new Set(state.locked);
  const kept = state.names.filter((n) => locked.has(n.text));
  const seed = state.seed.trim() || randomSeed(random);
  const count = Math.max(0, state.count - kept.length);
  const exclude = kept.map((n) => n.text);
  const src = currentEra(state).source;
  const cond = effectiveConditions(state);
  let result: { names: NpcName[]; exhausted: boolean } = { names: [], exhausted: count > 0 };
  if (src.kind === 'corpus' && isCorpusData(data)) {
    const pack = corpusPack(data, src.pack.id);
    if (pack) result = generateCorpusNames(pack, { count, ...cond, seed, exclude });
  } else if (src.kind === 'count' && !isCorpusData(data)) {
    result = generateNames(data, {
      count,
      era: src.era.id,
      gender: cond.gender === 'neutral' ? 'any' : cond.gender,
      middleInitial: state.middleInitial,
      part: cond.part,
      seed,
      exclude,
    });
  }
  return {
    names: mergeBatch(state.names, locked, result.names, state.count),
    seed,
    exhausted: result.exhausted,
  };
}

/** 一個名字畫面上要顯示的讀音（依設定）：日本的平假名、片假名、羅馬拼音，其他地區的原文／拼音一行 */
export function shownReadings(name: NpcName, show: ReadingShow): string[] {
  if (isCorpusName(name) && name.original) return show.original ? [name.original] : [];
  const r = isCorpusName(name) ? corpusKanaReadings(name) : nameReadings(name);
  if (!r) return [];
  return [show.hiragana && r.hiragana, show.katakana && r.katakana, show.romaji && r.romaji].filter(
    (s): s is string => !!s,
  );
}

/** 複製一個名字的文字：只有全名，或附上畫面上顯示的讀音「佐藤 博（さとう ひろし／Satou Hiroshi）」；涵義不附 */
export function copyLine(name: NpcName, state: Pick<NamesState, 'show' | 'copyReading'>) {
  if (!state.copyReading) return name.text;
  const r = shownReadings(name, state.show);
  return r.length ? `${name.text}（${r.join('／')}）` : name.text;
}

/** 全部複製：一行一個 */
export function copyAllText(
  names: readonly NpcName[],
  state: Pick<NamesState, 'show' | 'copyReading'>,
): string {
  return names.map((n) => copyLine(n, state)).join('\n');
}

/**
 * 考據語料的說明行（卡片與查名字共用，原站的排法）：涵義一段一行（「姓：…」「名：…」，依姓名順序；維京是「父名：…」）、
 * 備註一行（名的備註與綽號，以「、」分開，次要顏色）、暱稱與姓的另一形一行（以「，」分開，次要顏色）。
 */
export function corpusDetails(n: {
  meanings: readonly string[];
  notes: readonly string[];
  extras: readonly string[];
}): { text: string; muted: boolean }[] {
  return [
    ...n.meanings.map((text) => ({ text, muted: false })),
    ...(n.notes.length ? [{ text: n.notes.join('、'), muted: true }] : []),
    ...(n.extras.length ? [{ text: n.extras.join('，'), muted: true }] : []),
  ];
}

/** 名字卡上的性別 */
export const genderLabel = (n: NpcName) => CORPUS_GENDER_LABELS[n.gender];

/* ---------- 紀錄 ---------- */

/** 紀錄最多留幾批（自訂） */
export const HISTORY_MAX = 20;
/** 上一批產生後這麼短的時間內又產生（例如拖數量的滑桿），取代上一筆紀錄，不另外記（毫秒，自訂） */
export const HISTORY_MERGE_MS = 1000;

export interface HistoryEntry {
  id: string;
  /** 產生的時間（毫秒時間戳） */
  at: number;
  region: CorpusRegion;
  era: string;
  gender: CorpusGenderChoice;
  /** 階級、國家（考據語料有標記的包才有，不限時不寫） */
  rank?: CorpusRank;
  country?: CorpusCountry;
  /** 只有名或只有姓（全名時不寫） */
  part?: 'given' | 'family';
  seed: string;
  names: NpcName[];
}

/**
 * 紀錄裡的考據語料名字（存在瀏覽器的精簡格式）：只存畫面上的名字與讀音需要的欄位，加上查回說明用的鍵；
 * 涵義、備註、暱稱與姓的另一形放回時從資料查回來（`rehydrateCorpusName`），讓自動儲存小一點
 * （同一個網站的工具共用瀏覽器的儲存額度）。2026-10 驗證後的裁定。
 * k 包、x 性別（m 男／f 女／n 中性）、t 全名、f 姓、g 名、fr／gr 姓與名的平假名、o 原文／拼音、e 綽號、
 * p 輸出（g 只有名／f 只有姓）、r 查回鍵（"m12.s3.f5.e7"：名、姓、維京的父親、綽號在資料裡的位置）。
 */
export interface StoredCorpusName {
  k: string;
  x: 'm' | 'f' | 'n';
  t: string;
  f?: string;
  g?: string;
  fr?: string;
  gr?: string;
  o?: string;
  e?: string;
  p?: 'g' | 'f';
  r?: string;
}

export type StoredHistoryEntry = Omit<HistoryEntry, 'names'> & {
  names: (GeneratedName | StoredCorpusName)[];
};

const GENDER_CODE = { male: 'm', female: 'f', neutral: 'n' } as const;

/** 查回鍵 → 字串 "m12.s3.f5.e7" */
export function refToString(ref: CorpusRef | undefined): string | undefined {
  if (!ref) return undefined;
  return [
    ref.g,
    ...(['s', 'f', 'e'] as const).map((k) => (ref[k] === undefined ? '' : `${k}${ref[k]}`)),
  ]
    .filter(Boolean)
    .join('.');
}

/** 字串 → 查回鍵（看不懂的回 undefined，放回時改用寫法找） */
export function parseRef(v: unknown): CorpusRef | undefined {
  if (typeof v !== 'string') return undefined;
  const [g, ...rest] = v.split('.');
  if (!/^[mfu]\d+$/.test(g ?? '')) return undefined;
  const ref: CorpusRef = { g };
  for (const part of rest) {
    const m = /^([sfe])(\d+)$/.exec(part);
    if (!m) return undefined;
    ref[m[1] as 's' | 'f' | 'e'] = Number(m[2]);
  }
  return ref;
}

/** 存進紀錄的名字：考據語料的名字換成精簡格式，人數名單照舊 */
export function storeHistoryName(n: NpcName): GeneratedName | StoredCorpusName {
  if (!isCorpusName(n)) return n;
  const out: StoredCorpusName = { k: n.pack, x: GENDER_CODE[n.gender], t: n.text };
  if (n.family) out.f = n.family;
  if (n.given) out.g = n.given;
  if (n.familyReading) out.fr = n.familyReading;
  if (n.givenReading) out.gr = n.givenReading;
  if (n.original) out.o = n.original;
  if (n.epithet) out.e = n.epithet;
  if (n.part) out.p = n.part === 'given' ? 'g' : 'f';
  const r = refToString(n.ref);
  if (r) out.r = r;
  return out;
}

/** 紀錄存進瀏覽器的格式 */
export function storeHistory(history: readonly HistoryEntry[]): StoredHistoryEntry[] {
  return history.map((e) => ({ ...e, names: e.names.map(storeHistoryName) }));
}

/** 讀回紀錄的一個名字：精簡格式、2026-10 驗證前的完整格式、人數名單都認得 */
function loadHistoryName(raw: unknown): NpcName | null {
  if (!raw || typeof raw !== 'object' || !('k' in raw)) return cleanName(raw);
  const c = raw as Record<string, unknown>;
  const info = corpusPackInfo(c.k);
  if (!info || typeof c.t !== 'string' || !c.t) return null;
  const gender = c.x === 'm' ? 'male' : c.x === 'f' ? 'female' : c.x === 'n' ? 'neutral' : null;
  if (!gender) return null;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const ref = parseRef(c.r);
  return {
    pack: info.id,
    region: info.region,
    gender,
    family: str(c.f),
    given: str(c.g),
    ...optional('epithet', c.e),
    ...optional('familyReading', c.fr),
    ...optional('givenReading', c.gr),
    ...optional('original', c.o),
    ...(c.p === 'g' ? { part: 'given' as const } : c.p === 'f' ? { part: 'family' as const } : {}),
    text: c.t,
    meanings: [],
    notes: [],
    extras: [],
    ...(ref ? { ref } : {}),
  };
}

/** 紀錄裡的語料名字是精簡版（沒有涵義）：要查回說明 */
export const needsDetails = (n: NpcName): n is CorpusName =>
  isCorpusName(n) && !n.meanings.length && !n.notes.length && !n.extras.length;

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
    if (!isCorpusRegion(e.region) || typeof e.at !== 'number' || !Array.isArray(e.names)) continue;
    const names = e.names.map(loadHistoryName).filter((n): n is NpcName => !!n);
    if (!names.length) continue;
    out.push({
      id: typeof e.id === 'string' ? e.id : String(e.at),
      at: e.at,
      region: e.region,
      era: typeof e.era === 'string' ? e.era : '',
      gender: isCorpusGenderChoice(e.gender) ? e.gender : 'any',
      ...(isCorpusRank(e.rank) && e.rank !== 'all' ? { rank: e.rank } : {}),
      ...(isCorpusCountry(e.country) && e.country !== 'all' ? { country: e.country } : {}),
      ...partOf(e.part),
      seed: typeof e.seed === 'string' ? e.seed : '',
      names,
    });
    if (out.length >= HISTORY_MAX) break;
  }
  return out;
}

/**
 * 紀錄的標題：「日本・現代・不限」「英國・攝政時代（1780–1837）・貴族・女・只有名」
 * （只有一個年代的地區不寫年代；階級、國家、輸出不限或全名時不寫）
 */
export function historyLabel(
  entry: Pick<HistoryEntry, 'region' | 'era' | 'gender' | 'rank' | 'country'> & {
    part?: NamePart;
  },
): string {
  const region = corpusRegionInfo(entry.region);
  const options = eraOptions(entry.region);
  const era = options.find((e) => e.id === entry.era);
  return [
    region.label,
    options.length > 1 ? era?.label : null,
    entry.rank && entry.rank !== 'all' ? CORPUS_RANK_LABELS[entry.rank] : null,
    entry.country && entry.country !== 'all' ? CORPUS_COUNTRY_LABELS[entry.country] : null,
    CORPUS_GENDER_LABELS[entry.gender],
    entry.part && entry.part !== 'full' ? PART_LABELS[entry.part] : null,
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
  names: readonly NpcName[],
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
  '原文／拼音',
  '涵義',
  '備註',
] as const;

/** 一格裡有好幾項時的分隔（涵義裡會有「、」「／」，不會有「；」） */
const CELL_SEP = '；';

/**
 * CSV 的列（第一列是標題；讀音不看顯示的設定，有的都填）。依人數的名單的列，原文／拼音、涵義、備註留白；
 * 考據語料的涵義依姓名順序（「姓：…；名：…」）、備註是名的備註、綽號、暱稱、姓的另一個性別形。
 */
export function csvRows(names: readonly NpcName[]): string[][] {
  return [
    [...CSV_HEADER],
    ...names.map((n) => {
      const region = corpusRegionInfo(n.region).label;
      if (isCorpusName(n)) {
        const kana = corpusKanaReadings(n);
        const info = corpusPackInfo(n.pack);
        return [
          n.text,
          n.family,
          n.given,
          '',
          genderLabel(n),
          region,
          info ? corpusPackLabel(info) : '',
          kana?.hiragana ?? '',
          kana?.katakana ?? '',
          kana?.romaji ?? '',
          n.original ?? '',
          n.meanings.join(CELL_SEP),
          [...n.notes, ...n.extras].join(CELL_SEP),
        ];
      }
      const kana = nameReadings(n);
      return [
        n.text,
        n.family,
        n.given,
        n.middle ?? '',
        genderLabel(n),
        region,
        eraOptions(n.region).find((e) => e.id === n.era)?.label ?? '',
        kana?.hiragana ?? '',
        kana?.katakana ?? '',
        kana?.romaji ?? '',
        '',
        '',
        '',
      ];
    }),
  ];
}

/* ---------- 查名字（考據語料的搜尋） ---------- */

/** 搜尋結果一筆的讀音（依顯示設定）：日本是平假名、片假名、羅馬拼音，其他是原文／拼音（和寫法相同時不列） */
export function searchReadings(
  hit: Pick<CorpusSearchEntry, 'text' | 'reading'>,
  region: CorpusRegion,
  show: ReadingShow,
): string[] {
  if (!hit.reading) return [];
  if (region !== 'jp') return show.original && hit.reading !== hit.text ? [hit.reading] : [];
  const r = corpusKanaReadings({ givenReading: hit.reading, part: 'given' });
  if (!r) return [];
  return [show.hiragana && r.hiragana, show.katakana && r.katakana, show.romaji && r.romaji].filter(
    (x): x is string => !!x,
  );
}

/** 複製搜尋結果的一筆（附不附讀音同 F27） */
export function searchCopyLine(
  hit: Pick<CorpusSearchEntry, 'text' | 'reading'>,
  region: CorpusRegion,
  state: Pick<NamesState, 'show' | 'copyReading'>,
): string {
  if (!state.copyReading) return hit.text;
  const r = searchReadings(hit, region, state.show);
  return r.length ? `${hit.text}（${r.join('／')}）` : hit.text;
}
