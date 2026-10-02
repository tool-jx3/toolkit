/**
 * 一團的紀錄（跑團紀錄簿與團報產生器共用）：欄位、正規值、日期、人名、時間、劇本計數鍵。
 * 規格：docs/refactor/specs/session-log.md 3.1～3.6。
 *
 * 系統、狀態、生還以**日文正規值**存檔（舊版的存檔與 JSON 都是這樣，新舊版可以互相讀入），畫面上再換成繁中顯示名稱；
 * 輸入繁中顯示名稱或正規值都存成正規值，其他文字原樣保存。
 */

/** 側欄的貼文／連結（F60） */
export interface SessionMedia {
  type: 'tweet' | 'image' | 'link';
  url: string;
  caption: string;
}

/** 防雷連結（F63） */
export interface SessionLink {
  label: string;
  url: string;
}

/**
 * 一團。欄位名稱沿用舊版（舊版匯出的 JSON 可以直接讀入）；不認得的欄位（自訂欄位 `custom_…`、其他來源的欄位）照樣保留。
 */
export interface SessionRow {
  id: string;
  /** 第一次開啟時放的範例（不計入統計與清單輸出） */
  sample?: boolean;
  /** 第一天（＝dates[0]，沒有時空字串） */
  date: string;
  /** `YYYY-MM-DD`，排序、不重複 */
  dates: string[];
  scenario?: string;
  /** 正規值（SESSION_SYSTEMS 的 value）或使用者自己輸入的文字 */
  system?: string;
  role?: string;
  gm?: string;
  players?: string;
  pc?: string;
  /** 正規值（SESSION_STATUSES） */
  status?: string;
  /** 小時數（數字字串，例 "3.5"） */
  time?: string;
  note?: string;
  longNote?: string;
  reported?: boolean;
  /** 「★」或空字串 */
  fav?: string;
  ho?: string;
  ending?: string;
  /** 正規值（SESSION_SURVIVALS） */
  survival?: string;
  campaign?: string;
  hashtag?: string;
  sessionUrl?: string;
  scenarioUrl?: string;
  kansouUrl?: string;
  result?: string;
  media?: SessionMedia[];
  cushionLinks?: SessionLink[];
  scenarioCountKey?: string;
  [key: string]: unknown;
}

export interface SessionValueOption {
  /** 存檔用的正規值 */
  value: string;
  /** 繁中顯示名稱 */
  label: string;
}

/** 系統（前 4 個是常用系統：選單、篩選的固定選項） */
export const SESSION_SYSTEMS: readonly SessionValueOption[] = Object.freeze([
  { value: 'CoC 7版', label: 'CoC 7版' },
  { value: 'CoC 6版', label: 'CoC 6版' },
  { value: 'エモクロア', label: 'Emoklore' },
  { value: 'マダミス', label: '謀殺之謎' },
  { value: 'シノビガミ', label: '忍神' },
  { value: 'インセイン', label: 'Insane' },
  { value: 'ダブルクロス The 3rd Edition', label: '雙重十字 The 3rd Edition' },
  { value: 'ソード・ワールド2.5', label: '劍世界2.5' },
  { value: 'フタリソウサ', label: '二人搜查' },
]);

/** 常用系統（新增對話框的選單、篩選的固定選項） */
export const COMMON_SYSTEMS: readonly string[] = Object.freeze(
  SESSION_SYSTEMS.slice(0, 4).map((s) => s.value),
);

/** 清單輸出時排在最前面的系統（依序） */
export const SYSTEM_SORT_PRIORITY: readonly string[] = Object.freeze([
  'CoC 6版',
  'CoC 7版',
  'エモクロア',
  'マダミス',
]);

export const SESSION_STATUSES: readonly SessionValueOption[] = Object.freeze([
  { value: '新規', label: '新開' },
  { value: '継続', label: '延續' },
  { value: '完結', label: '完結' },
  { value: '中止', label: '中止' },
  { value: '予定', label: '預定' },
]);

export const SESSION_SURVIVALS: readonly SessionValueOption[] = Object.freeze([
  { value: '生還', label: '生還' },
  { value: 'ロスト', label: '撕卡' },
  { value: '全生還', label: '全員生還' },
  { value: '全ロスト', label: '全員撕卡' },
  { value: '継続', label: '延續' },
  { value: '不明', label: '不明' },
]);

/** 身分的選項（依序） */
export const SESSION_ROLES: readonly string[] = Object.freeze(['PL', 'KP', 'GM', 'DL']);

/** 新開一團時的狀態 */
export const DEFAULT_STATUS = '新規';

/* ---------- 正規值 ↔ 顯示名稱 ---------- */

function labelIn(options: readonly SessionValueOption[], value: unknown): string {
  const v = value == null ? '' : String(value);
  return options.find((o) => o.value === v)?.label ?? v;
}

/**
 * 顯示名稱（或正規值）→ 正規值。空白、已是正規值、對不上的文字原樣回傳（不去空白），與舊版相同。
 */
function canonicalIn(options: readonly SessionValueOption[], value: unknown): string {
  const raw = value == null ? '' : String(value);
  const text = raw.trim();
  if (!text || options.some((o) => o.value === text)) return raw;
  return options.find((o) => o.label === text)?.value ?? raw;
}

export const systemLabel = (value: unknown): string => labelIn(SESSION_SYSTEMS, value);
export const statusLabel = (value: unknown): string => labelIn(SESSION_STATUSES, value);
export const survivalLabel = (value: unknown): string => labelIn(SESSION_SURVIVALS, value);
export const canonicalSystem = (value: unknown): string => canonicalIn(SESSION_SYSTEMS, value);
export const canonicalStatus = (value: unknown): string => canonicalIn(SESSION_STATUSES, value);
export const canonicalSurvival = (value: unknown): string => canonicalIn(SESSION_SURVIVALS, value);

/** 舊版存檔裡的舊系統名稱（F107） */
const LEGACY_SYSTEMS: Readonly<Record<string, string>> = Object.freeze({
  エモクロアTRPG: 'エモクロア',
  マルチシステム: 'マダミス',
});

export function normalizeLegacySystem(value: string | undefined): string | undefined {
  return value && LEGACY_SYSTEMS[value] ? LEGACY_SYSTEMS[value] : value;
}

/**
 * 匯入時的系統別名（NFKC、去頭尾空白、小寫後比對；試算表、CCFOLIA 轉入的值用）。
 * 對不上時改用 canonicalSystem（顯示名稱 → 正規值）。
 */
export const SYSTEM_IMPORT_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  エモクロアtrpg: 'エモクロア',
  エモクロア: 'エモクロア',
  マーダーミステリー: 'マダミス',
  マダミス: 'マダミス',
  マルチシステム: 'マダミス',
  新クトゥルフ神話trpg: 'CoC 7版',
  新クトゥルフ: 'CoC 7版',
  クトゥルフ神話trpg: 'CoC 6版',
  coc6: 'CoC 6版',
  'coc 6': 'CoC 6版',
  coc6版: 'CoC 6版',
  'coc 6版': 'CoC 6版',
  coc7: 'CoC 7版',
  'coc 7': 'CoC 7版',
  coc7版: 'CoC 7版',
  'coc 7版': 'CoC 7版',
  新克蘇魯神話trpg: 'CoC 7版',
  新克蘇魯: 'CoC 7版',
  克蘇魯神話trpg: 'CoC 6版',
  emoklore: 'エモクロア',
  'emoklore trpg': 'エモクロア',
  謀殺之謎: 'マダミス',
});

export function importSystem(value: string): string {
  const key = value.normalize('NFKC').trim().toLowerCase();
  return SYSTEM_IMPORT_ALIASES[key] ?? canonicalSystem(value);
}

/** 匯入時的身分別名 */
export const ROLE_IMPORT_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  キーパー: 'KP',
  kp: 'KP',
  ゲームマスター: 'GM',
  マスター: 'GM',
  gm: 'GM',
  ディーラー: 'DL',
  dl: 'DL',
  プレイヤー: 'PL',
  pl: 'PL',
  主持人: 'GM',
  守密人: 'KP',
  玩家: 'PL',
});

/** 匯入的身分：別名（原樣或小寫）→ 轉大寫後在 PL／KP／GM／DL 裡 → 原值 */
export function importRole(value: string): string {
  const raw = value.normalize('NFKC').trim();
  return (
    ROLE_IMPORT_ALIASES[raw] ??
    ROLE_IMPORT_ALIASES[raw.toLowerCase()] ??
    (SESSION_ROLES.includes(raw.toUpperCase()) ? raw.toUpperCase() : value)
  );
}

/** 身分的分組：GM、KP、DL（不分大小寫）→ 'GM'；PL → 'PL'；其他回傳轉大寫的值 */
export function normalizeRoleGroup(role: unknown): string {
  const v = String(role ?? '')
    .trim()
    .toUpperCase();
  if (v === 'GM' || v === 'KP' || v === 'DL') return 'GM';
  if (v === 'PL') return 'PL';
  return v;
}

/** 屬於 GM 組但不是正式選項（例如小寫 kp）的身分 → 'GM'（F107） */
export function normalizeRole(role: string | undefined): string | undefined {
  if (role && normalizeRoleGroup(role) === 'GM' && !SESSION_ROLES.includes(role)) return 'GM';
  return role;
}

/* ---------- 人名（3.3） ---------- */

/**
 * 拆成一個個名字：「、」「,」「，」「/」「／」「&」「＆」「＋」「+」「;」「；」換行，以及前後有空白的「と」「and」。
 * 「・」不是分隔符號（外文名字的間隔號）。
 */
export function splitPeople(value: unknown): string[] {
  return String(value ?? '')
    .split(/[、,，/／&＆＋+;；\n\r]+|\s+と\s+|\s+and\s+/i)
    .map((v) => v.trim())
    .filter(Boolean);
}

/** 比對用的名字：NFKC、去空白（含全形）、結尾的句點換成一個「。」 */
export function normalizePersonName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/[\s　]+/g, '')
    .replace(/[。．.]+$/g, '。');
}

/** 內建的「自己」（通用詞；spec 5. D6：不含原作者的名字） */
export const DEFAULT_SELF_NAMES: readonly string[] = Object.freeze([
  '自己',
  '自分',
  '自分自身',
  'GM',
  'KP',
  'DL',
]);

/** 使用者填的「自己的名字」（「、」「,」「/」或換行分隔）＋內建通用詞，都正規化 */
export function selfNameSet(userNames: string | null | undefined): Set<string> {
  const user = String(userNames ?? '')
    .split(/[、,/\n]/)
    .map(normalizePersonName)
    .filter(Boolean);
  return new Set([...DEFAULT_SELF_NAMES.map(normalizePersonName), ...user]);
}

/** 同團玩家：GM 欄與 PL 欄的不重複名字（排除自己） */
export function countCoPlayers(
  rows: readonly Pick<SessionRow, 'gm' | 'players'>[],
  self: ReadonlySet<string>,
): number {
  const people = new Set<string>();
  for (const row of rows) {
    for (const field of [row.gm, row.players]) {
      for (const name of splitPeople(field)) {
        const n = normalizePersonName(name);
        if (n && !self.has(n)) people.add(n);
      }
    }
  }
  return people.size;
}

/* ---------- 時間（3.5） ---------- */

/** 「3:30」「3時30分」→ 3.5；其他取第一個數字；沒有數字時空字串 */
export function normalizeTimeValue(value: unknown): string {
  const text = String(value ?? '')
    .trim()
    .normalize('NFKC');
  if (!text) return '';
  const hm = /^(\d+)\s*[:：時]\s*(\d{1,2})\s*分?$/.exec(text);
  if (hm) {
    const hours = Number(hm[1]) + Number(hm[2]) / 60;
    return String(Math.round(hours * 100) / 100);
  }
  const num = /\d+(?:\.\d+)?/.exec(text);
  return num ? num[0] : '';
}

/** 統計用的時數：時間欄的第一個數字（沒有時 0） */
export function timeHours(value: unknown): number {
  const m = /[\d.]+/.exec(String(value ?? ''));
  return (m && Number.parseFloat(m[0])) || 0;
}

/* ---------- 劇本計數鍵（3.6） ---------- */

/** 劇本名稱整理：去掉「第 N 陣」「N 日目」「前編／後編…」等，合併空白 */
export function normalizeScenarioForCount(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[＿_]/g, ' ')
    .replace(/第\s*[0-9０-９一二三四五六七八九十百]+\s*陣/g, '')
    .replace(/[0-9０-９一二三四五六七八九十百]+\s*日目/g, '')
    .replace(/前編|後編|上巻|下巻|作成会|キャラシ作成会|前篇|後篇|上篇|下篇/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 劇本計數鍵：有填就用它（去頭尾空白），否則整理後的劇本名稱 */
export function scenarioCountKey(row: Pick<SessionRow, 'scenario' | 'scenarioCountKey'>): string {
  const explicit = String(row.scenarioCountKey ?? '').trim();
  return explicit || normalizeScenarioForCount(row.scenario);
}

/** 劇本數：不重複的劇本計數鍵（大小寫視為不同） */
export function countUniqueScenarios(
  rows: readonly Pick<SessionRow, 'scenario' | 'scenarioCountKey'>[],
): number {
  return new Set(rows.map(scenarioCountKey).filter(Boolean)).size;
}
