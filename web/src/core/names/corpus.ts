/**
 * NPC 的姓名之二：弄墨 Inknomu《角色姓名產生器》的考據語料（CC BY 4.0；npc-names 2026-10 導入）。
 *
 * - 29 個「包」：8 個地區（日本、台灣、韓國、英國、美國、俄羅斯、北歐、奇幻）的年代、族裔或種族，每個姓與名附涵義
 *   （部分附讀音、備註、暱稱、姓的女性形）。資料依地區分成 8 個檔（`inknomu/inknomu-<地區>.ts`），`loadCorpus(地區)`
 *   用到才載入；包的清單（選單要用的部分）在 `inknomu/catalog.ts`。兩者都由 `web/scripts/inknomu-names.mjs` 從原站的
 *   JSON 轉出來，文字照原文。出處、授權與本站的變更在 `inknomu/meta.json`＋`LICENSE.txt`（建置時列進 THIRD_PARTY_NOTICES）。
 * - 抽法照原站：姓與名各自**平均**抽（不用人數；原站資料的 weight 是備用欄位，沒有用來抽）。男＝男性名＋中性名、
 *   女＝女性名＋中性名、中性＝只有中性名。階級（貴族／平民）與國家（北歐）篩選：沒有標的、標「兩者通用」的照樣入選，
 *   篩完是空的就退回不篩。
 * - 組名：`name_order` 是 'gs' 時「名 姓」（空白分開），其他「姓＋name_sep＋名」；女性用姓的女性形（俄羅斯）。
 *   沒有姓、規則有父名的包（維京）：父名＝隨機一個男性名的屬格字根（沒有就用原形）＋ son／dóttir，30% 再加一個綽號。
 * - 種子、不重複、排除名單和 core/names 的 `generateNames` 相同（同樣的種子、選項與排除名單 → 同樣的一批）。
 *
 * coc-npc 不用這個模組（它的隨機取名只用 core/names 的人數名單）。規格：docs/refactor/specs/npc-names.md 2.5、3.5。
 */

import {
  kanaToRomaji,
  NAME_COUNT_MAX,
  type NamePart,
  type NameReadings,
  type RandomFn,
  seededRandom,
  toKatakana,
} from './index';
import { INKNOMU_PACKS } from './inknomu/catalog';

/* ---------- 地區與包 ---------- */

export type CorpusRegion = 'jp' | 'tw' | 'kr' | 'uk' | 'us' | 'ru' | 'nordic' | 'fantasy';

export interface CorpusRegionInfo {
  id: CorpusRegion;
  label: string;
  /** 年代欄的名稱（奇幻是種族，美國另有族裔的分類） */
  eraLabel: string;
  /** 原站這個地區的頁面（出處的連結） */
  url: string;
}

/** 地區（本站的順序：日本在前，其他照原站） */
export const CORPUS_REGIONS: readonly CorpusRegionInfo[] = [
  { id: 'jp', label: '日本', eraLabel: '年代', url: 'https://inknomu.com/namegen/jp' },
  { id: 'tw', label: '台灣', eraLabel: '年代', url: 'https://inknomu.com/namegen/tw' },
  { id: 'kr', label: '韓國', eraLabel: '年代', url: 'https://inknomu.com/namegen/kr' },
  { id: 'uk', label: '英國', eraLabel: '年代', url: 'https://inknomu.com/namegen/uk' },
  { id: 'us', label: '美國', eraLabel: '年代與分類', url: 'https://inknomu.com/namegen/us' },
  { id: 'ru', label: '俄羅斯', eraLabel: '年代', url: 'https://inknomu.com/namegen/ru' },
  { id: 'nordic', label: '北歐', eraLabel: '年代', url: 'https://inknomu.com/namegen/nordic' },
  { id: 'fantasy', label: '奇幻', eraLabel: '種族', url: 'https://inknomu.com/namegen/fantasy' },
];

export const INKNOMU_SOURCE = {
  name: '弄墨 Inknomu《角色姓名產生器》',
  url: 'https://inknomu.com/namegen/',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
} as const;

export function isCorpusRegion(v: unknown): v is CorpusRegion {
  return CORPUS_REGIONS.some((r) => r.id === v);
}

export function corpusRegionInfo(region: CorpusRegion): CorpusRegionInfo {
  return CORPUS_REGIONS.find((r) => r.id === region) ?? CORPUS_REGIONS[0];
}

/** 包的摘要（catalog.ts；開頁就要用：選單、哪些選項要出現） */
export interface InknomuPackInfo {
  id: string;
  region: CorpusRegion;
  /** 原站的名稱（「日本・江戶時代（1603–1868）」） */
  label: string;
  /** 有中性名 */
  neutral: boolean;
  /** 姓有階級（貴族／平民）的標記 */
  rank: boolean;
  /** 有國家的標記（北歐） */
  countries: boolean;
  /** 讀音：平假名（日本）、原文或拼音（韓國的羅馬拼音、俄羅斯的西里爾字母、維京的古諾斯語拼法）、沒有 */
  reading: 'kana' | 'latin' | null;
  /** 沒有姓，以父名構成（維京） */
  patronymic: boolean;
  /** 原始 JSON 的 SHA-256（2026-10-29 取得） */
  sha256: string;
}

export const CORPUS_PACKS: readonly InknomuPackInfo[] = INKNOMU_PACKS;

export function corpusPackInfo(id: unknown): InknomuPackInfo | undefined {
  return CORPUS_PACKS.find((p) => p.id === id);
}

export function corpusPacksOf(region: CorpusRegion): InknomuPackInfo[] {
  return CORPUS_PACKS.filter((p) => p.region === region);
}

/** 選單上的名稱：去掉地區（「江戶時代（1603–1868）」） */
export function corpusPackLabel(info: Pick<InknomuPackInfo, 'label'>): string {
  const i = info.label.indexOf('・');
  return i < 0 ? info.label : info.label.slice(i + 1);
}

/** 選單下方的一句話（本站寫的） */
export const CORPUS_PACK_HINTS: Readonly<Record<string, string>> = {
  'jp-sengoku': '大名、武士的苗字與通稱，以及地侍、百姓的名字',
  'jp-edo': '武家的通稱與町人、百姓的名字（平民的姓是屋號）',
  'jp-taisho': '明治後期到大正，「正」字與「〇子」開始流行',
  'jp-showa': '「〇子」的全盛期到戰後的誠、大輔',
  'jp-modern': '平成、令和：翔、陽、蓮、葵這類自然與和風的字',
  'jp-rare': '實際存在的稀有、難讀的姓，配古風、雅字的名',
  'tw-qing': '移民開墾社會：求財、求子與「賤名」，女性多是「〇娘」',
  'tw-japanese': '漢人的漢式姓名（男性名多「雄、金、財」）',
  'tw-modern': '戰後到現在：從志明、淑芬到家豪、雅婷',
  'tw-y2k': '2000 年後出生：宥、睿、恩、晴、妍這類字',
  'tw-wuxia': '武俠小說與武俠跑團的角色名（原創的組合）',
  'kr-modern': '現代韓國常見的姓與名，附羅馬拼音',
  'uk-medieval': '諾曼征服到玫瑰戰爭：貴族的諾曼名與平民的古英語名',
  'uk-regency': '珍．奧斯汀的年代：仕紳的法式、古典名與勞工的美德名',
  'uk-victorian': '維多利亞女王在位時英格蘭與威爾斯的常見姓名',
  'uk-modern': '1990 年代以後英格蘭與威爾斯的常見姓名',
  'us-classic': '西部拓荒、爵士年代、黑色電影時代的姓名',
  'us-modern': '1990 年代以後的姓名，含拉美裔、亞裔與新創的名字',
  'us-latino': '源自西班牙語命名傳統的常見姓名',
  'us-african-american': '英語系的姓，與聖經名、非洲與阿拉伯語名、新創的名字',
  'ru-imperial': '托爾斯泰、杜斯妥也夫斯基的年代，附西里爾字母與暱稱',
  'ru-modern': '蘇聯解體以後的姓名，附西里爾字母與暱稱',
  'nordic-viking': '沒有姓，以父名構成，有時加綽號；附古諾斯語拼法',
  'nordic-modern': '瑞典、挪威、丹麥（與芬蘭）的常見姓名，可以選國家',
  'fantasy-human': '擬真中世紀風格的人類角色名（原創）',
  'fantasy-elf': '流音、鼻音多的精靈名，氏族名是自然意象（原創）',
  'fantasy-dwarf': '北歐神話風格的矮人名，氏族名是鍛造與礦業意象',
  'fantasy-orc': '獸人與半獸人，氏族名是部落圖騰與戰績（原創）',
  'fantasy-halfling': '花草、食物、地貌組成的半身人姓名（原創）',
};

/* ---------- 資料（inknomu-<地區>.ts）的格式：原站的欄位名稱，只留用得到的 ---------- */

export type InknomuClass = 'noble' | 'common' | 'both';

interface InknomuEntry {
  reading?: string;
  meaning: string;
  note?: string;
  class?: InknomuClass;
  countries?: readonly string[];
}

export interface InknomuSurname extends InknomuEntry {
  s: string;
  /** 女性形（俄羅斯）與它的讀音 */
  f_form?: string;
  f_reading?: string;
}

export interface InknomuGiven extends InknomuEntry {
  g: string;
  /** 父名用的屬格字根（維京） */
  pat?: string;
  /** 暱稱（俄羅斯） */
  diminutive?: string;
}

export interface InknomuEpithet {
  /** 綽號（「the Red」；「Peace-」這類結尾是連字號的是前綴式，接在名的前面） */
  e: string;
  meaning: string;
  /** 史料裡的例子 */
  note?: string;
}

/** 命名規則的說明（父名、雙姓、複合名、命名慣例…）；note 照原文顯示 */
export interface InknomuRule {
  enabled?: boolean;
  note?: string;
  [key: string]: unknown;
}

export interface InknomuPack {
  id: string;
  label: string;
  note: string;
  corpus_note: string;
  rules?: Readonly<Record<string, InknomuRule>>;
  /** 'gs'＝名在前；沒有或其他＝姓在前 */
  name_order?: string;
  /** 姓在前時姓與名之間的字（日本是空白；沒有＝連在一起） */
  name_sep?: string;
  epithets?: readonly InknomuEpithet[];
  surnames: readonly InknomuSurname[];
  given: {
    m: readonly InknomuGiven[];
    f: readonly InknomuGiven[];
    u: readonly InknomuGiven[];
  };
}

export interface CorpusData {
  region: CorpusRegion;
  packs: readonly InknomuPack[];
}

export function corpusPack(data: CorpusData, id: string): InknomuPack | undefined {
  return data.packs.find((p) => p.id === id);
}

type RawCorpus = { PACKS: readonly InknomuPack[] };

const LOADERS: Record<CorpusRegion, () => Promise<RawCorpus>> = {
  jp: () => import('./inknomu/inknomu-jp'),
  tw: () => import('./inknomu/inknomu-tw'),
  kr: () => import('./inknomu/inknomu-kr'),
  uk: () => import('./inknomu/inknomu-uk'),
  us: () => import('./inknomu/inknomu-us'),
  ru: () => import('./inknomu/inknomu-ru'),
  nordic: () => import('./inknomu/inknomu-nordic'),
  fantasy: () => import('./inknomu/inknomu-fantasy'),
};

const loaded = new Map<CorpusRegion, CorpusData>();
const loading = new Map<CorpusRegion, Promise<CorpusData>>();

/** 載入一個地區的語料（第一次才下載；之後回傳同一份） */
export function loadCorpus(region: CorpusRegion): Promise<CorpusData> {
  const done = loaded.get(region);
  if (done) return Promise.resolve(done);
  let p = loading.get(region);
  if (!p) {
    p = LOADERS[region]().then(
      (raw) => {
        const data: CorpusData = { region, packs: raw.PACKS };
        loaded.set(region, data);
        loading.delete(region);
        return data;
      },
      (error: unknown) => {
        loading.delete(region);
        throw error;
      },
    );
    loading.set(region, p);
  }
  return p;
}

/** 已經載入的語料（還沒載入時 null） */
export const loadedCorpus = (region: CorpusRegion): CorpusData | null => loaded.get(region) ?? null;

/** 地區頁面的「資料來源」的一組（政府和研究機構、網站、書籍、作品、其他） */
export interface InknomuSourceGroup {
  group: string;
  items: readonly {
    /** 照原文的一筆 */
    text: string;
    /** 文字裡可以點的部分（text 是 text 裡的一段；網址都是 https） */
    links?: readonly { text: string; url: string }[];
  }[];
}

let sourcesLoading: Promise<Readonly<Record<CorpusRegion, readonly InknomuSourceGroup[]>>> | null =
  null;

/** 各地區頁面的資料來源（inknomu/sources.ts；第一次用到才載入，約 20 KB） */
export function loadCorpusSources(region: CorpusRegion): Promise<readonly InknomuSourceGroup[]> {
  if (!sourcesLoading) {
    sourcesLoading = import('./inknomu/sources').then(
      (m) => m.SOURCES,
      (error: unknown) => {
        sourcesLoading = null;
        throw error;
      },
    );
  }
  return sourcesLoading.then((all) => all[region] ?? []);
}

/**
 * 一筆資料來源切成文字與連結：依序在文字裡找每個連結的字，找到的那段變成連結；找不到的連結接在後面。
 */
export function sourceSegments(item: InknomuSourceGroup['items'][number]): {
  text: string;
  url?: string;
}[] {
  const out: { text: string; url?: string }[] = [];
  let rest = item.text;
  const tail: { text: string; url: string }[] = [];
  for (const link of item.links ?? []) {
    const i = rest.indexOf(link.text);
    if (i < 0) {
      tail.push(link);
      continue;
    }
    if (i > 0) out.push({ text: rest.slice(0, i) });
    out.push({ text: link.text, url: link.url });
    rest = rest.slice(i + link.text.length);
  }
  if (rest) out.push({ text: rest });
  for (const link of tail) out.push({ text: ` ${link.text}`, url: link.url });
  return out;
}

/* ---------- 選項 ---------- */

export type CorpusGender = 'male' | 'female' | 'neutral';
export type CorpusGenderChoice = CorpusGender | 'any';
export type CorpusRank = 'all' | 'noble' | 'common';
/** 北歐的國家（刻意沒有冰島：冰島沒有世襲的姓，姓沒有冰島的標記） */
export type CorpusCountry = 'all' | 'se' | 'no' | 'dk' | 'fi';

export const CORPUS_GENDER_LABELS: Record<CorpusGenderChoice, string> = {
  male: '男',
  female: '女',
  neutral: '中性',
  any: '不限',
};
export const CORPUS_RANK_LABELS: Record<CorpusRank, string> = {
  all: '不限',
  noble: '貴族',
  common: '平民',
};
export const CORPUS_COUNTRY_LABELS: Record<CorpusCountry, string> = {
  all: '不限',
  se: '瑞典',
  no: '挪威',
  dk: '丹麥',
  fi: '芬蘭',
};

export const isCorpusGenderChoice = (v: unknown): v is CorpusGenderChoice =>
  typeof v === 'string' && Object.hasOwn(CORPUS_GENDER_LABELS, v);
export const isCorpusRank = (v: unknown): v is CorpusRank =>
  typeof v === 'string' && Object.hasOwn(CORPUS_RANK_LABELS, v);
export const isCorpusCountry = (v: unknown): v is CorpusCountry =>
  typeof v === 'string' && Object.hasOwn(CORPUS_COUNTRY_LABELS, v);

/* ---------- 抽籤 ---------- */

export interface CorpusName {
  /** 包的 id（jp-edo…） */
  pack: string;
  region: CorpusRegion;
  gender: CorpusGender;
  /** 姓（俄羅斯的女性是女性形）；沒有姓的包（維京）是父名 */
  family: string;
  given: string;
  /** 綽號（維京） */
  epithet?: string;
  /** 平假名（日本的包） */
  familyReading?: string;
  givenReading?: string;
  /** 原文或拼音一行（韓國、俄羅斯、維京；見 corpusOriginal） */
  original?: string;
  /** 顯示與複製用的全名 */
  text: string;
  /** 涵義，依姓名的順序：「姓：…」「名：…」「父名：…」 */
  meanings: string[];
  /** 備註：名的備註、綽號的說明 */
  notes: string[];
  /** 暱稱、姓的另一個性別形 */
  extras: string[];
  /** 只有名或只有姓（這時另一段是空字串、全名就是那一段） */
  part?: 'given' | 'family';
  /** 查回說明用的鍵（資料裡的位置；紀錄只存精簡版，放回時用它查回涵義） */
  ref?: CorpusRef;
}

export interface CorpusDrawOptions {
  gender?: CorpusGenderChoice;
  rank?: CorpusRank;
  country?: CorpusCountry;
  /** 輸出（預設全名）；沒有姓的包（維京）選只有姓時當作全名 */
  part?: NamePart;
}

/** 選了中性、但這個包沒有中性名時當作不限 */
export function corpusGenderOf(
  pack: Pick<InknomuPack, 'given'>,
  choice: CorpusGenderChoice | undefined,
): CorpusGenderChoice {
  if (!choice) return 'any';
  return choice === 'neutral' && !pack.given.u.length ? 'any' : choice;
}

/**
 * 階級、國家篩選：沒有標的與「兩者通用」的照樣入選；篩完是空的就退回篩之前（國家退回篩完階級的）。
 */
export function filterEntries<T extends InknomuEntry>(
  list: readonly T[],
  rank: CorpusRank = 'all',
  country: CorpusCountry = 'all',
): readonly T[] {
  let base = list;
  if (rank !== 'all') {
    const f = base.filter((x) => !x.class || x.class === rank || x.class === 'both');
    if (f.length) base = f;
  }
  if (country !== 'all') {
    const f = base.filter((x) => !x.countries || x.countries.includes(country));
    if (f.length) base = f;
  }
  return base;
}

/** 某個性別的名字池：男＝男性名＋中性名、女＝女性名＋中性名、中性＝中性名 */
export function givenPool(pack: Pick<InknomuPack, 'given'>, gender: CorpusGender) {
  const { m, f, u } = pack.given;
  const pool = gender === 'neutral' ? u : gender === 'male' ? [...m, ...u] : [...f, ...u];
  return pool.length ? pool : [...m, ...f, ...u];
}

const pickOne = <T>(list: readonly T[], r: number): T =>
  list[Math.min(list.length - 1, Math.floor(r * list.length))];

/** 維京的父名後綴（原站資料沒有給 suffixes 時的預設） */
const PATRONYMIC = { son: 'son', daughter: 'dóttir' } as const;
/** 維京的綽號：每個名字有這個機率加一個（原站的值） */
export const EPITHET_CHANCE = 0.3;

/**
 * 查回說明用的鍵（紀錄裡的名字不存涵義、備註，放回時用它從資料查回來）：資料裡的位置——
 * 姓（`s`）、名（`g`：男 m／女 f／中性 u 加位置，例如 "m12"）、維京的父親（`f`，男性名的位置）、綽號（`e`）。
 * 查回時比對組出來的全名和存的相同才算數（資料以後改版、位置變了就退回用寫法找，再找不到就只顯示名字）。
 */
export interface CorpusRef {
  s?: number;
  g: string;
  f?: number;
  e?: number;
}

/** 一個姓名用到的資料（抽出來的，或從鍵查回來的） */
interface CorpusPicks {
  gender: CorpusGender;
  surname?: InknomuSurname;
  father?: InknomuGiven;
  given: InknomuGiven;
  epithet?: InknomuEpithet;
}

const GIVEN_LISTS = ['m', 'f', 'u'] as const;

function refOf(pack: InknomuPack, picks: CorpusPicks): CorpusRef {
  let g = '';
  for (const list of GIVEN_LISTS) {
    const i = pack.given[list].indexOf(picks.given);
    if (i >= 0) {
      g = `${list}${i}`;
      break;
    }
  }
  const ref: CorpusRef = { g };
  if (picks.surname) ref.s = pack.surnames.indexOf(picks.surname);
  if (picks.father) ref.f = pack.given.m.indexOf(picks.father);
  if (picks.epithet && pack.epithets) ref.e = pack.epithets.indexOf(picks.epithet);
  return ref;
}

/**
 * 由用到的資料組出姓名（組名、涵義、備註、暱稱、讀音，3.5）。只有名或只有姓（`part`）時只留那一段。
 */
export function composeCorpusName(
  pack: InknomuPack,
  picks: CorpusPicks,
  partOption: NamePart = 'full',
  region: CorpusRegion = corpusPackInfo(pack.id)?.region ?? 'jp',
): CorpusName {
  const { gender, surname: s, father, given: g, epithet: e } = picks;
  const female = gender === 'female';
  const extras: string[] = [];
  let family = '';
  let familyReading: string | undefined;
  let familyMeaning = '';
  let familyIsOriginal = false;
  if (s) {
    family = (female && s.f_form) || s.s;
    familyReading = female && s.f_form ? s.f_reading : s.reading;
    familyMeaning = `姓：${s.meaning}`;
    if (s.f_form) extras.push(female ? `姓氏男性形 ${s.s}` : `姓氏女性形 ${s.f_form}`);
  } else if (father) {
    family = `${father.pat || father.g}${female ? PATRONYMIC.daughter : PATRONYMIC.son}`;
    familyIsOriginal = true;
    /* 本站的寫法；父名制的說明在「關於這份語料」（包的 rules.patronymic.note） */
    familyMeaning = `父名：${father.g} ${female ? '之女' : '之子'}`;
  }
  const notes = g.note ? [g.note] : [];
  if (g.diminutive) extras.unshift(`暱稱 ${g.diminutive}`);
  const epithet = e?.e;
  if (e) notes.push(`綽號 ${e.e}：${e.meaning}${e.note ? `（${e.note}）` : ''}`);
  const givenMeaning = `名：${g.meaning}`;
  const givenFirst = pack.name_order === 'gs' || !pack.surnames.length;
  /* 前綴式的綽號（Peace-、Turf-）接在名的前面：Peace-Bjorn Ragnarsson；其他接在最後：Erik Thorvaldsson the Red */
  const prefix = epithet?.endsWith('-') ? epithet : '';
  const shownGiven = `${prefix}${g.g}`;
  const text = !family
    ? shownGiven
    : givenFirst
      ? [shownGiven, family, prefix ? '' : epithet].filter(Boolean).join(' ')
      : `${family}${pack.name_sep ?? ''}${g.g}`;
  const ref = refOf(pack, picks);
  const part = partOption === 'family' && !s ? 'full' : partOption;
  const diminutive = g.diminutive ? [`暱稱 ${g.diminutive}`] : [];
  if (part === 'given' || part === 'family') {
    /* 只有名：涵義只留名的，名的備註與暱稱照留，父名、綽號、姓的另一形不出現；只有姓：涵義只留姓的，名的備註與暱稱不出現 */
    const given = part === 'given';
    const name: CorpusName = {
      pack: pack.id,
      region,
      gender,
      family: given ? '' : family,
      given: given ? g.g : '',
      part,
      text: given ? g.g : family,
      meanings: [given ? givenMeaning : familyMeaning],
      notes: given && g.note ? [g.note] : [],
      extras: given ? diminutive : extras.filter((x) => !diminutive.includes(x)),
      ref,
    };
    const reading = given ? g.reading : familyReading;
    if (region === 'jp') {
      if (reading) name[given ? 'givenReading' : 'familyReading'] = reading;
    } else {
      const original = corpusOriginal([{ text: name.text, reading }]);
      if (original) name.original = original;
    }
    return name;
  }
  const name: CorpusName = {
    pack: pack.id,
    region,
    gender,
    family,
    given: g.g,
    text,
    meanings: (givenFirst ? [givenMeaning, familyMeaning] : [familyMeaning, givenMeaning]).filter(
      Boolean,
    ),
    notes,
    extras,
    ref,
  };
  if (epithet) name.epithet = epithet;
  if (region === 'jp') {
    if (familyReading) name.familyReading = familyReading;
    if (g.reading) name.givenReading = g.reading;
  } else {
    const parts = [
      { text: g.g, reading: g.reading },
      ...(family ? [{ text: family, reading: familyIsOriginal ? family : familyReading }] : []),
    ];
    const original = corpusOriginal(givenFirst ? parts : parts.reverse());
    if (original) name.original = original;
  }
  return name;
}

/**
 * 抽一個姓名（不管重複）。亂數依序用在：性別（不限時 < 0.5 是男性）、姓（維京是父親的名字）、名、
 * （維京）要不要綽號（< 0.3）、哪一個綽號。
 */
export function drawCorpusName(
  pack: InknomuPack,
  options: CorpusDrawOptions,
  random: RandomFn,
  region: CorpusRegion = corpusPackInfo(pack.id)?.region ?? 'jp',
): CorpusName {
  const choice = corpusGenderOf(pack, options.gender);
  const gender: CorpusGender = choice === 'any' ? (random() < 0.5 ? 'male' : 'female') : choice;
  const rank = options.rank ?? 'all';
  const country = options.country ?? 'all';
  const patronymic = !pack.surnames.length && pack.rules?.patronymic?.enabled === true;
  const surname = pack.surnames.length
    ? pickOne(filterEntries(pack.surnames, rank, country), random())
    : undefined;
  const father = !surname && patronymic ? pickOne(pack.given.m, random()) : undefined;
  const given = pickOne(filterEntries(givenPool(pack, gender), rank, country), random());
  const epithet =
    patronymic && pack.epithets?.length && random() < EPITHET_CHANCE
      ? pickOne(pack.epithets, random())
      : undefined;
  return composeCorpusName(
    pack,
    { gender, surname, father, given, epithet },
    options.part ?? 'full',
    region,
  );
}

/** 紀錄用的精簡版：不存涵義、備註、暱稱與姓的另一形（放回時用 `rehydrateCorpusName` 從資料查回來） */
export type SlimCorpusName = Omit<CorpusName, 'meanings' | 'notes' | 'extras'>;

export function slimCorpusName(name: CorpusName): SlimCorpusName {
  const { meanings: _m, notes: _n, extras: _x, ...rest } = name;
  return rest;
}

/** 依鍵（資料裡的位置）找回用到的資料；位置不對就回 null */
function picksFromRef(
  pack: InknomuPack,
  name: Pick<CorpusName, 'gender' | 'ref'>,
): CorpusPicks | null {
  const ref = name.ref;
  const m = ref ? /^([mfu])(\d+)$/.exec(ref.g) : null;
  if (!ref || !m) return null;
  const given = pack.given[m[1] as 'm' | 'f' | 'u'][Number(m[2])];
  if (!given) return null;
  const at = <T>(list: readonly T[] | undefined, i: number | undefined) =>
    i === undefined ? undefined : list?.[i];
  const picks: CorpusPicks = {
    gender: name.gender,
    given,
    surname: at(pack.surnames, ref.s),
    father: at(pack.given.m, ref.f),
    epithet: at(pack.epithets, ref.e),
  };
  if ((ref.s !== undefined && !picks.surname) || (ref.f !== undefined && !picks.father))
    return null;
  if (ref.e !== undefined && !picks.epithet) return null;
  return picks;
}

/** 依寫法找回用到的資料（鍵對不上時；同寫法有好幾筆時取第一筆） */
function picksFromText(pack: InknomuPack, name: SlimCorpusName): CorpusPicks | null {
  const female = name.gender === 'female';
  const lists =
    name.gender === 'neutral'
      ? (['u'] as const)
      : female
        ? (['f', 'u'] as const)
        : (['m', 'u'] as const);
  const givenText = name.part === 'family' ? null : name.given;
  let given: InknomuGiven | undefined;
  if (givenText) {
    for (const l of lists) given ??= pack.given[l].find((g) => g.g === givenText);
  } else given = [...pack.given.m, ...pack.given.f, ...pack.given.u][0];
  if (!given) return null;
  const familyText = name.part === 'given' ? null : name.family;
  let surname: InknomuSurname | undefined;
  let father: InknomuGiven | undefined;
  if (familyText && pack.surnames.length) {
    surname = pack.surnames.find((s) => ((female && s.f_form) || s.s) === familyText);
    if (!surname) return null;
  } else if (familyText) {
    const suffix = female ? PATRONYMIC.daughter : PATRONYMIC.son;
    father = pack.given.m.find((g) => `${g.pat || g.g}${suffix}` === familyText);
    if (!father) return null;
  }
  const epithet = name.epithet ? pack.epithets?.find((e) => e.e === name.epithet) : undefined;
  if (name.epithet && !epithet) return null;
  return { gender: name.gender, given, surname, father, epithet };
}

/**
 * 紀錄裡的精簡版 → 完整的姓名（查回涵義、備註、暱稱與姓的另一形）。先用鍵、再用寫法找；
 * 組出來的全名和存的不同（資料改版了）時回 null（呼叫的地方就只顯示名字）。
 */
export function rehydrateCorpusName(pack: InknomuPack, name: SlimCorpusName): CorpusName | null {
  const region = corpusPackInfo(pack.id)?.region ?? name.region;
  for (const picks of [picksFromRef(pack, name), picksFromText(pack, name)]) {
    if (!picks) continue;
    const full = composeCorpusName(pack, picks, name.part ?? 'full', region);
    if (full.text === name.text && full.family === name.family && full.given === name.given)
      return full;
  }
  return null;
}

/**
 * 原文或拼音一行（韓國的羅馬拼音、俄羅斯的西里爾字母、維京的古諾斯語拼法）：每一段的讀音以空白分開
 * （和全名的分隔字無關：韓國的 김서준 → Gim Seojun）。維京的父名本來就是古諾斯語的字根，照寫；綽號不列。
 * 有一段沒有讀音（帝俄的 Tolstaya、Trubetskaya 沒有女性形的讀音）、或每一段的讀音都和原字相同時，沒有這一行（null）。
 */
export function corpusOriginal(
  parts: readonly { text: string; reading?: string }[],
): string | null {
  if (!parts.length || parts.some((p) => !p.reading)) return null;
  if (parts.every((p) => p.reading === p.text)) return null;
  return parts.map((p) => p.reading).join(' ');
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** 平假名的讀音 → 羅馬拼音（有兩種讀法「のぞみ／のぞむ」時各自轉、首字大寫） */
const romajiOf = (kana: string) =>
  kana
    .split('／')
    .map((k) => capitalize(kanaToRomaji(k)))
    .join('／');

/** 日本的包的三種讀音（姓在前、以空白分開；只有名或只有姓時只有那一段）；沒有讀音時 null */
export function corpusKanaReadings(
  name: Pick<CorpusName, 'familyReading' | 'givenReading' | 'part'>,
): NameReadings | null {
  if (name.part) {
    const one = name.part === 'given' ? name.givenReading : name.familyReading;
    return one ? { hiragana: one, katakana: toKatakana(one), romaji: romajiOf(one) } : null;
  }
  if (!name.familyReading || !name.givenReading) return null;
  const hiragana = `${name.familyReading} ${name.givenReading}`;
  return {
    hiragana,
    katakana: toKatakana(hiragana),
    romaji: `${romajiOf(name.familyReading)} ${romajiOf(name.givenReading)}`,
  };
}

export interface GenerateCorpusOptions extends CorpusDrawOptions {
  count: number;
  /** 種子：給了就用它的決定性亂數（同樣的種子、選項與排除名單，結果相同） */
  seed?: string | number;
  /** 直接給亂數（測試用）；有 seed 時忽略 */
  random?: RandomFn;
  /** 不要產生的全名（鎖定的） */
  exclude?: Iterable<string>;
}

/** 產生一批不重複的姓名（以全名判斷；也不和 exclude 重複）。最多試 count × 20 ＋ 50 次。 */
export function generateCorpusNames(
  pack: InknomuPack,
  options: GenerateCorpusOptions,
): { names: CorpusName[]; exhausted: boolean } {
  const count = Math.max(0, Math.min(NAME_COUNT_MAX, Math.floor(options.count)));
  const random: RandomFn =
    options.seed !== undefined && options.seed !== ''
      ? seededRandom(options.seed)
      : (options.random ?? Math.random);
  const region = corpusPackInfo(pack.id)?.region ?? 'jp';
  const seen = new Set(options.exclude ?? []);
  const names: CorpusName[] = [];
  const maxTries = count * 20 + 50;
  for (let tries = 0; names.length < count && tries < maxTries; tries++) {
    const name = drawCorpusName(pack, options, random, region);
    if (seen.has(name.text)) continue;
    seen.add(name.text);
    names.push(name);
  }
  return { names, exhausted: names.length < count };
}

/* ---------- 規則的說明 ---------- */

/** 規則的名稱（本站寫的）：原站的鍵 → 介面上的標題 */
export const CORPUS_RULE_LABELS: Readonly<Record<string, string>> = {
  patronymic: '父名',
  double_surname: '雙姓',
  compound_given: '複合名',
  naming: '命名慣例',
  surname_note: '姓氏',
  coinage_note: '新創的名字',
};

/** 這裡產生的名字沒有照這條規則組（只有說明）時的補充（本站寫的） */
export function corpusRuleNotice(
  pack: Pick<InknomuPack, 'surnames' | 'rules'>,
  key: string,
): string | null {
  const rule = pack.rules?.[key];
  if (rule?.enabled !== true) return null;
  if (key === 'patronymic')
    return pack.surnames.length ? '這裡產生的名字只有名與姓，不加父名。' : null;
  if (key === 'double_surname') return '這裡產生的名字只有一個姓。';
  if (key === 'compound_given') return '這裡產生的名字不組複合名。';
  return null;
}

/* ---------- 搜尋（npc-names 的「查名字」；原站組合模式的搜尋） ---------- */

/** 也比對讀音的地區（日本的平假名、韓國的羅馬拼音、俄羅斯的西里爾字母；維京的古諾斯語拼法不比對，同原站） */
export const CORPUS_SEARCH_READING: readonly CorpusRegion[] = ['jp', 'kr', 'ru'];

export type CorpusSearchKind = 'family' | 'given';

/** 索引的一筆：一個包裡的一個姓或名（同一個包裡寫法相同的併成一筆） */
export interface CorpusSearchEntry {
  kind: CorpusSearchKind;
  pack: string;
  text: string;
  reading?: string;
  meaning: string;
  notes: string[];
  /** 暱稱、姓的另一個性別形 */
  extras: string[];
  /** 名：在哪幾份名單（男、女、中性）；姓：俄羅斯的男性形是 male、女性形是 female，其他的姓沒有 */
  genders: CorpusGender[];
  /** 階級（沒有標＝undefined，兩邊都算） */
  class?: InknomuClass;
  countries?: readonly string[];
  /** 正規化後的寫法與讀音（比對用；不比對讀音的地區 r 是空字串） */
  n: string;
  r: string;
}

const kataToHira = (s: string) =>
  s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/**
 * 搜尋用的正規化：前後空白去掉；全形英數當半形（NFKC，原站沒有）；片假名當平假名；
 * 拆開附加符號後丟掉（é → e、だ → た：濁音、半濁音、清音互通）；英文字母不分大小寫。
 */
export function normalizeSearch(s: string): string {
  return kataToHira(s.normalize('NFKC').trim())
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase();
}

const mergeClass = (a: InknomuClass | undefined, b: InknomuClass | undefined) =>
  !a || !b ? undefined : a === b ? a : 'both';

const indexCache = new WeakMap<CorpusData, CorpusSearchEntry[]>();

/** 一個地區的搜尋索引（所有包的姓與名；綽號、父名不收）。同一份資料只建一次。 */
export function corpusSearchIndex(data: CorpusData): CorpusSearchEntry[] {
  const cached = indexCache.get(data);
  if (cached) return cached;
  const withReading = CORPUS_SEARCH_READING.includes(data.region);
  const out: CorpusSearchEntry[] = [];
  for (const pack of data.packs) {
    const byKey = new Map<string, CorpusSearchEntry>();
    const add = (
      kind: CorpusSearchKind,
      text: string,
      x: InknomuEntry,
      gender: CorpusGender | null,
      reading: string | undefined,
      extra: string | null,
    ) => {
      const key = `${kind}:${text}`;
      let e = byKey.get(key);
      if (!e) {
        e = {
          kind,
          pack: pack.id,
          text,
          ...(reading ? { reading } : {}),
          meaning: x.meaning,
          notes: [],
          extras: [],
          genders: [],
          ...(x.class ? { class: x.class } : {}),
          ...(x.countries ? { countries: x.countries } : {}),
          n: normalizeSearch(text),
          r: withReading && reading ? normalizeSearch(reading) : '',
        };
        byKey.set(key, e);
        out.push(e);
      } else {
        const cls = mergeClass(e.class, x.class);
        if (cls) e.class = cls;
        else delete e.class;
        if (e.countries && x.countries)
          e.countries = [...new Set([...e.countries, ...x.countries])];
        else delete e.countries;
      }
      if (x.note && !e.notes.includes(x.note)) e.notes.push(x.note);
      if (extra && !e.extras.includes(extra)) e.extras.push(extra);
      if (gender && !e.genders.includes(gender)) e.genders.push(gender);
    };
    for (const s of pack.surnames) {
      add(
        'family',
        s.s,
        s,
        s.f_form ? 'male' : null,
        s.reading,
        s.f_form ? `姓氏女性形 ${s.f_form}` : null,
      );
      if (s.f_form) add('family', s.f_form, s, 'female', s.f_reading, `姓氏男性形 ${s.s}`);
    }
    const lists = [
      ['male', pack.given.m],
      ['female', pack.given.f],
      ['neutral', pack.given.u],
    ] as const;
    for (const [gender, list] of lists) {
      for (const g of list)
        add('given', g.g, g, gender, g.reading, g.diminutive ? `暱稱 ${g.diminutive}` : null);
    }
  }
  indexCache.set(data, out);
  return out;
}

export interface CorpusSearchHit extends CorpusSearchEntry {
  /** 對上的位置（寫法與讀音較前面的那個；0＝開頭就對上） */
  at: number;
}

/**
 * 搜尋：寫法（與讀音）裡有這個字（開頭、中間、結尾都算），開頭就對上的排前面，再依寫法排序（繁中），
 * 最後依包的順序。不找涵義、備註。空字串時沒有結果。
 */
export function searchCorpus(
  index: readonly CorpusSearchEntry[],
  query: string,
): CorpusSearchHit[] {
  const q = normalizeSearch(query);
  if (!q) return [];
  const found: [CorpusSearchHit, number][] = [];
  index.forEach((e, i) => {
    const a = e.n.indexOf(q);
    const b = e.r ? e.r.indexOf(q) : -1;
    const at = a < 0 ? b : b < 0 ? a : Math.min(a, b);
    if (at >= 0) found.push([{ ...e, at }, i]);
  });
  return found
    .sort(([x, i], [y, j]) => x.at - y.at || x.text.localeCompare(y.text, 'zh-Hant') || i - j)
    .map(([hit]) => hit);
}

export interface CorpusSearchFilters {
  /** 包的 id 或 'all' */
  era: string;
  gender: CorpusGenderChoice;
  rank: CorpusRank;
  country: CorpusCountry;
  kind: 'all' | CorpusSearchKind;
}

export const DEFAULT_SEARCH_FILTERS: CorpusSearchFilters = {
  era: 'all',
  gender: 'any',
  rank: 'all',
  country: 'all',
  kind: 'all',
};

export type CorpusSearchAxis = keyof CorpusSearchFilters;

/**
 * 一筆符不符合某個篩選：年代＝那個包；性別：沒有性別的姓都算，男（女）也包含中性名，中性只有中性名；
 * 階級：沒有標的與兩者通用都算；國家：沒有標的都算。
 */
export function matchesSearchFilter(
  e: CorpusSearchEntry,
  axis: CorpusSearchAxis,
  value: string,
): boolean {
  if (value === 'all' || value === 'any') return true;
  switch (axis) {
    case 'era':
      return e.pack === value;
    case 'kind':
      return e.kind === value;
    case 'gender':
      return (
        !e.genders.length ||
        e.genders.includes(value as CorpusGender) ||
        (value !== 'neutral' && e.genders.includes('neutral'))
      );
    case 'rank':
      return !e.class || e.class === 'both' || e.class === value;
    case 'country':
      return !e.countries || e.countries.includes(value);
  }
}

/** 套用篩選（skip：不看那一個篩選，用來算那個篩選的每個選項有沒有結果） */
export function filterSearchHits<T extends CorpusSearchEntry>(
  hits: readonly T[],
  filters: CorpusSearchFilters,
  skip?: CorpusSearchAxis,
): T[] {
  const axes = (Object.keys(filters) as CorpusSearchAxis[]).filter((a) => a !== skip);
  return hits.filter((h) => axes.every((a) => matchesSearchFilter(h, a, filters[a])));
}

/** 某個篩選的某個選項選下去會不會是 0 筆（「不限」與目前選的不算） */
export function searchOptionEmpty(
  hits: readonly CorpusSearchEntry[],
  filters: CorpusSearchFilters,
  axis: CorpusSearchAxis,
  value: string,
): boolean {
  if (value === 'all' || value === 'any' || filters[axis] === value) return false;
  return !filterSearchHits(hits, filters, axis).some((h) => matchesSearchFilter(h, axis, value));
}
