/**
 * NPC 的姓名：依實際的人數加權抽姓與名（NPC 名字產生器 npc-names 引入時新增；coc-npc 的「隨機取名」也用）。
 *
 * - 資料依地區分成三個檔（`jp/names-jp.ts`、`tw/names-tw.ts`、`us/names-us.ts`），`loadNameData(地區)` 用到時才載入
 *   （各自是一個 chunk，不會讓其他頁面變大）。出處、授權與整理方式在各資料夾的 `meta.json`＋`LICENSE.txt`
 *   （建置時列進 THIRD_PARTY_NOTICES），規格見 docs/refactor/specs/npc-names.md 第 2 節。
 * - 抽法：姓與名分開抽，各自依人數加權（某個名字被抽中的機率＝它的人數÷同一份名單、同一個年代的人數總和）；
 *   日本與美國的名依年代用不同的人數欄，姓不分年代。
 * - 給種子（`seed`）時結果固定：同樣的資料、選項、種子與排除名單，每次抽出同樣的姓名（`seededRandom`：
 *   sfc32，種子字串以 cyrb128 雜湊成 128 位元）。
 * - 讀音：日本的姓名附平假名（資料），片假名與羅馬拼音由平假名轉（`toKatakana`、`kanaToRomaji`）。
 */
export type NameRegion = 'jp' | 'tw' | 'us';
export type NameGender = 'male' | 'female';
export type NameGenderChoice = NameGender | 'any';

export interface NameEra {
  id: string;
  /** 故事的年代（選單上的名稱） */
  label: string;
  /** 用的是哪些年出生的人 */
  hint: string;
}

export interface NameRegionInfo {
  id: NameRegion;
  label: string;
  eras: readonly NameEra[];
  /** 有讀音（平假名、片假名、羅馬拼音） */
  reading: boolean;
  /** 可以加中間名縮寫 */
  middleInitial: boolean;
}

export const NAME_REGIONS: readonly NameRegionInfo[] = [
  {
    id: 'jp',
    label: '日本',
    eras: [
      {
        id: 'modern',
        label: '現代',
        hint: '1960 年代以後出生的人（偏 1960～1980 年代，年輕的名字較少）',
      },
      { id: 'showa', label: '昭和中後期', hint: '1920～1950 年代出生的人' },
      { id: 'taisho', label: '大正～昭和初期', hint: '1870～1910 年代出生的人' },
    ],
    reading: true,
    middleInitial: false,
  },
  {
    id: 'tw',
    label: '台灣',
    eras: [{ id: 'now', label: '現今', hint: '目前戶籍人口裡最常見的姓與名（不分年代）' }],
    reading: false,
    middleInitial: false,
  },
  {
    id: 'us',
    label: '美國',
    eras: [
      { id: 'adult1920', label: '1920 年代', hint: '1880～1909 年出生的人（1920 年代的大人）' },
      {
        id: 'born1920',
        label: '1920 年代出生',
        hint: '1920～1929 年出生的人（1940～50 年代的大人、1920 年代的小孩）',
      },
    ],
    reading: false,
    middleInitial: true,
  },
];

export const NAME_GENDER_LABELS: Record<NameGenderChoice, string> = {
  male: '男',
  female: '女',
  any: '不限',
};

/** 一次最多產生幾個 */
export const NAME_COUNT_MAX = 50;

export function regionInfo(region: NameRegion): NameRegionInfo {
  return NAME_REGIONS.find((r) => r.id === region) ?? NAME_REGIONS[0];
}

/** 年代 id 不屬於這個地區時用第一個 */
export function eraOf(region: NameRegion, era?: string): string {
  const info = regionInfo(region);
  return info.eras.some((e) => e.id === era) ? (era as string) : info.eras[0].id;
}

export function isNameRegion(v: unknown): v is NameRegion {
  return v === 'jp' || v === 'tw' || v === 'us';
}

export function isNameGenderChoice(v: unknown): v is NameGenderChoice {
  return v === 'male' || v === 'female' || v === 'any';
}

/* ---------- 資料 ---------- */

/** 資料檔的欄位（年代欄的順序） */
const DATA_ERAS: Record<NameRegion, readonly string[]> = {
  jp: ['taisho', 'showa', 'modern'],
  tw: ['now'],
  us: ['adult1920', 'born1920'],
};

interface RawNameData {
  FAMILY: string;
  MALE: string;
  FEMALE: string;
}

/** 一份名單：每一筆的文字、讀音，與各年代的權重（累積和，抽籤用） */
export interface NamePool {
  texts: readonly string[];
  /** 平假名（日本）；其他地區是空字串 */
  readings: readonly string[];
  /** 年代 id → 每一筆的人數 */
  weights: Readonly<Record<string, Float64Array>>;
  /** 年代 id → 累積的人數（最後一個是總和） */
  cumulative: Readonly<Record<string, Float64Array>>;
}

export interface NameData {
  region: NameRegion;
  family: NamePool;
  male: NamePool;
  female: NamePool;
}

function cumulativeOf(w: Float64Array): Float64Array {
  const out = new Float64Array(w.length);
  let acc = 0;
  for (let i = 0; i < w.length; i++) {
    acc += w[i];
    out[i] = acc;
  }
  return out;
}

/**
 * 把一份名單的文字（每行一筆、欄位以逗號分隔）讀成 NamePool。
 * withReading：第二欄是讀音；eras：人數欄對應的年代（只有一欄時每個年代都用它）。
 */
function parsePool(text: string, withReading: boolean, eras: readonly string[], cols: number) {
  const lines = text.split('\n').filter(Boolean);
  const texts: string[] = [];
  const readings: string[] = [];
  const w = Array.from({ length: cols }, () => new Float64Array(lines.length));
  lines.forEach((line, i) => {
    const f = line.split(',');
    texts.push(f[0]);
    readings.push(withReading ? f[1] : '');
    const start = withReading ? 2 : 1;
    for (let c = 0; c < cols; c++) w[c][i] = Number(f[start + c]) || 0;
  });
  const weights: Record<string, Float64Array> = {};
  const cumulative: Record<string, Float64Array> = {};
  eras.forEach((era, c) => {
    const col = w[cols === 1 ? 0 : c];
    weights[era] = col;
    cumulative[era] = cumulativeOf(col);
  });
  return { texts, readings, weights, cumulative } satisfies NamePool;
}

/** 資料模組（`<地區>/names-<地區>.ts`）→ NameData。單元測試可以直接餵資料模組。 */
export function parseNameData(region: NameRegion, raw: RawNameData): NameData {
  const eras = DATA_ERAS[region];
  const reading = region === 'jp';
  return {
    region,
    family: parsePool(raw.FAMILY, reading, eras, 1),
    male: parsePool(raw.MALE, reading, eras, eras.length),
    female: parsePool(raw.FEMALE, reading, eras, eras.length),
  };
}

const LOADERS: Record<NameRegion, () => Promise<RawNameData>> = {
  jp: () => import('./jp/names-jp'),
  tw: () => import('./tw/names-tw'),
  us: () => import('./us/names-us'),
};

const loaded = new Map<NameRegion, NameData>();
const loading = new Map<NameRegion, Promise<NameData>>();

/** 載入一個地區的資料（第一次才下載；之後回傳同一份） */
export function loadNameData(region: NameRegion): Promise<NameData> {
  const done = loaded.get(region);
  if (done) return Promise.resolve(done);
  let p = loading.get(region);
  if (!p) {
    p = LOADERS[region]().then(
      (raw) => {
        const data = parseNameData(region, raw);
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

/** 已經載入的資料（還沒載入時 null） */
export const loadedNameData = (region: NameRegion): NameData | null => loaded.get(region) ?? null;

/* ---------- 抽籤 ---------- */

/** 累積和裡 r（0～1）落在哪一筆：第一個累積和 > r × 總和的位置（人數 0 的筆不會被抽中） */
export function pickWeighted(cumulative: Float64Array, r: number): number {
  const n = cumulative.length;
  if (!n) return -1;
  const target = r * cumulative[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid] > target) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** 一份名單在某個年代有人數的筆數 */
export function poolSize(pool: NamePool, era: string): number {
  const w = pool.weights[era];
  if (!w) return 0;
  let n = 0;
  for (const v of w) if (v > 0) n++;
  return n;
}

export interface GeneratedName {
  region: NameRegion;
  era: string;
  gender: NameGender;
  family: string;
  given: string;
  /** 中間名縮寫（美國，例如「J.」） */
  middle?: string;
  /** 平假名（日本） */
  familyReading?: string;
  givenReading?: string;
  /** 顯示與複製用的全名：日本「佐藤 博」、台灣「陳家豪」、美國「Harold J. Whitmore」 */
  text: string;
}

export interface DrawNameOptions {
  era?: string;
  gender?: NameGenderChoice;
  middleInitial?: boolean;
}

export type RandomFn = () => number;

/** 全名的寫法 */
export function joinName(
  region: NameRegion,
  parts: Pick<GeneratedName, 'family' | 'given' | 'middle'>,
): string {
  if (region === 'us') {
    return [parts.given, parts.middle, parts.family].filter(Boolean).join(' ');
  }
  return region === 'jp' ? `${parts.family} ${parts.given}` : `${parts.family}${parts.given}`;
}

/**
 * 抽一個姓名（不管重複）。亂數依序用在：性別（不限時，< 0.5 是男性）、姓、名、中間名縮寫（有開時；
 * 從同一個性別、年代的名字依人數抽一個，取第一個字母）。
 */
export function drawName(
  data: NameData,
  options: DrawNameOptions,
  random: RandomFn,
): GeneratedName {
  const region = data.region;
  const era = eraOf(region, options.era);
  const choice = options.gender ?? 'any';
  const gender: NameGender = choice === 'any' ? (random() < 0.5 ? 'male' : 'female') : choice;
  const fi = pickWeighted(data.family.cumulative[era], random());
  const pool = data[gender];
  const gi = pickWeighted(pool.cumulative[era], random());
  const name: GeneratedName = {
    region,
    era,
    gender,
    family: data.family.texts[fi],
    given: pool.texts[gi],
    text: '',
  };
  if (region === 'jp') {
    name.familyReading = data.family.readings[fi];
    name.givenReading = pool.readings[gi];
  }
  if (options.middleInitial && regionInfo(region).middleInitial) {
    const mi = pickWeighted(pool.cumulative[era], random());
    name.middle = `${pool.texts[mi].charAt(0).toUpperCase()}.`;
  }
  name.text = joinName(region, name);
  return name;
}

export interface GenerateNamesOptions extends DrawNameOptions {
  count: number;
  /** 種子：給了就用它的決定性亂數（同樣的種子、選項與排除名單，結果相同） */
  seed?: string | number;
  /** 直接給亂數（測試、coc-npc 的亂數注入點）；有 seed 時忽略 */
  random?: RandomFn;
  /** 不要產生的全名（例如鎖定、留著的那幾個） */
  exclude?: Iterable<string>;
}

export interface GenerateNamesResult {
  names: GeneratedName[];
  /** 不重複的姓名不夠，產生的比要求的少 */
  exhausted: boolean;
}

/** 產生一批不重複的姓名（以全名判斷；也不和 exclude 重複）。最多試 count × 20 ＋ 50 次。 */
export function generateNames(data: NameData, options: GenerateNamesOptions): GenerateNamesResult {
  const count = Math.max(0, Math.min(NAME_COUNT_MAX, Math.floor(options.count)));
  const random: RandomFn =
    options.seed !== undefined && options.seed !== ''
      ? seededRandom(options.seed)
      : (options.random ?? Math.random);
  const seen = new Set(options.exclude ?? []);
  const names: GeneratedName[] = [];
  const maxTries = count * 20 + 50;
  for (let tries = 0; names.length < count && tries < maxTries; tries++) {
    const name = drawName(data, options, random);
    if (seen.has(name.text)) continue;
    seen.add(name.text);
    names.push(name);
  }
  return { names, exhausted: names.length < count };
}

/** 字串 → 四個 32 位元整數（cyrb128 雜湊） */
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** 由種子（字串或數字）得到決定性的亂數 [0, 1)：cyrb128 ＋ sfc32，先丟掉前 12 個 */
export function seededRandom(seed: string | number): RandomFn {
  let [a, b, c, d] = cyrb128(String(seed));
  const next = () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  return next;
}

/** 隨機的種子（6 個英數字；畫面上顯示、可以複製回來重現同一批） */
export function randomSeed(random: RandomFn = Math.random): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(random() * chars.length)];
  return out;
}

/* ---------- 讀音 ---------- */

/** 平假名 → 片假名（其他字照原樣） */
export function toKatakana(text: string): string {
  return text.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

// biome-ignore format: 五十音表一行一列比較好讀
const KANA: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', ゐ: 'i', ゑ: 'e', を: 'o', ん: 'n',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  ゔ: 'vu', ゎ: 'wa',
};
const SMALL_Y: Record<string, string> = { ゃ: 'a', ゅ: 'u', ょ: 'o' };
const SMALL_V: Record<string, string> = { ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o' };

/** 一個音節（含後面的小字）→ 羅馬字；回傳 [羅馬字, 用掉幾個字] */
function syllable(text: string, i: number): [string, number] {
  const c = text[i];
  const base = KANA[c];
  if (base === undefined) return [SMALL_V[c] ?? SMALL_Y[c] ?? c, 1];
  const next = text[i + 1];
  if (next && SMALL_Y[next] && base.endsWith('i') && base.length > 1) {
    const stem = base.slice(0, -1);
    const glide = stem === 'sh' || stem === 'ch' || stem === 'j' ? '' : 'y';
    return [stem + glide + SMALL_Y[next], 2];
  }
  if (next && SMALL_V[next]) {
    const stem = base.length > 1 ? base.slice(0, -1) : 'w';
    return [stem + SMALL_V[next], 2];
  }
  return [base, 1];
}

/**
 * 平假名 → 羅馬拼音（平文式／ヘボン式，長音照假名寫：さとう → satou、ゆうき → yuuki）：
 * し shi、ち chi、つ tsu、ふ fu、じ・ぢ ji、づ zu；ん在母音與 y 前寫 n'（じゅんいち → jun'ichi）；
 * っ重複下一個子音（ch 前寫 t：まっちゃ → matcha）。全部小寫，`capitalize` 另外處理。
 */
export function kanaToRomaji(text: string): string {
  let out = '';
  let geminate = false;
  for (let i = 0; i < text.length; ) {
    const c = text[i];
    if (c === 'っ') {
      geminate = true;
      i++;
      continue;
    }
    const [syl, used] = syllable(text, i);
    i += used;
    if (geminate) {
      out += syl.startsWith('ch') ? 't' : /^[a-z]/.test(syl) && !/^[aiueo]/.test(syl) ? syl[0] : '';
      geminate = false;
    }
    if (c === 'ん') {
      const [nextSyl] = i < text.length ? syllable(text, i) : [''];
      out += /^[aiueoy]/.test(nextSyl) ? "n'" : 'n';
      continue;
    }
    out += syl;
  }
  return out;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface NameReadings {
  hiragana: string;
  katakana: string;
  romaji: string;
}

/** 日本姓名的三種讀音（姓在前、以空白分開）；沒有讀音的姓名回傳 null */
export function nameReadings(name: GeneratedName): NameReadings | null {
  if (!name.familyReading || !name.givenReading) return null;
  const hira = `${name.familyReading} ${name.givenReading}`;
  return {
    hiragana: hira,
    katakana: toKatakana(hira),
    romaji: `${capitalize(kanaToRomaji(name.familyReading))} ${capitalize(kanaToRomaji(name.givenReading))}`,
  };
}
