/**
 * 「速記・從劇本貼上」的讀法（不依賴 React）：NPC 的文字 → 一批棋子（規格 3.2、3.3）。
 *
 * 讀法參考原作（shiki365／キャラクター一括メーカー，MIT）改寫：各作者寫 NPC 資料的習慣不同，所以不是每份劇本一條規則，
 * 而是把共通的寫法收斂成「標籤 數值」——黏在一起的 `STR12`、各種括號、`成功率`、`%`、括號裡另一版的值 `12(60)`、
 * `STR／DEX 60／50`、技能後面的傷害、「技能：」「武器：」「法術：」這類小標、PDF 複製時拆開的字與斷到下一行的數字。
 * 本站補上繁中、簡中的寫法（words.ts）與幾處修正（規格 5. D 項）。
 *
 * 管線：
 *   1. `segment`：空行分隔，一段一個 NPC；
 *   2. `stitchRows`：PDF 斷開的行接回去；
 *   3. `NpcDraft.consume`／`route`：每一行判斷種類（名字、標籤行、網址、小標、指令、傷害、武器、說明、資料）；
 *   4. 資料行：`normalizeLine` 整理成詞，`PairScanner` 掃成「標籤＋數值＋傷害」，`place` 依讀法放進狀態、參數、技能；
 *   5. `paletteLines` 組聊天面板，`draftHints` 出提示。
 * 每個棋子帶 `source`：每一行讀成什麼，畫面上列出來讓使用者看到哪裡沒讀到。
 */
import {
  type LabelKind,
  MAX_COPIES,
  newPiece,
  type Piece,
  type PieceParam,
  type PieceStatus,
  type RollStyle,
  type SuffixStyle,
} from './model';
import { OUT } from './strings';
import { alternation, keySet, readNumber } from './text';
import {
  ABILITY_NAMES,
  ALT_DAMAGE_WORDS,
  CANON_LABELS,
  type CanonKind,
  COUNTERS,
  DAMAGE_SUFFIXES,
  DAMAGE_WORDS,
  DB_WORDS,
  HEADING_PREFIXES,
  LINE_TAGS,
  LUCK,
  NAME_TAGS,
  NONE_WORDS,
  PALETTE_SECTION_ENDINGS,
  SECTION_WORDS,
  type SectionKind,
  SKILL_NAMES,
  SKILLS_7TH_ONLY,
  SPELL_WORDS,
  STATUS_ENDINGS,
  VALUE_WORDS,
  wordKey,
} from './words';

/* =================== 對外的型別 =================== */

/** 一行讀到的東西（畫面上的小標籤；文字由 strings.ts 依種類組） */
export type ReadChip =
  | { t: 'name'; name: string; count: number }
  | { t: 'tag'; tag: string; value: string }
  | { t: 'url' }
  | { t: 'memo' }
  | { t: 'command'; command: string }
  | { t: 'damage'; label: string; damage: string }
  | { t: 'weapon'; name: string }
  | { t: 'ignored'; label: string }
  | { t: 'initiative'; value: number }
  | { t: 'status'; label: string; value: number; max: number }
  | { t: 'param'; label: string; value: string }
  | { t: 'skill'; label: string; value: number; damage: string }
  | { t: 'miss'; text: string };

/** 一行的狀態：名字、小標、沒用到、讀到、讀到一部分（有讀不出的數字）、讀不出 */
export type SourceState = 'name' | 'section' | 'skip' | 'read' | 'partial' | 'unread';

export interface SourceLine {
  line: number;
  /** 原文（PDF 斷行接回來的是好幾行） */
  text: string;
  state: SourceState;
  read: ReadChip[];
}

/** 提示的對象：有名字用名字，沒有時「第 n 行開始的 NPC」 */
export interface Who {
  name: string;
  line: number;
}

/** 讀取時的提示（文字由 strings.ts 依代碼組） */
export type MemoHint =
  | { code: 'no-name'; line: number }
  | { code: 'unread'; who: Who; lines: number[] }
  | { code: 'joined'; who: Who; count: number }
  | { code: 'nothing'; who: Who }
  | { code: 'too-many'; line: number; name: string; max: number };

/** 讀到的標籤（畫面上的「讀到的標籤」：可以改讀法） */
export interface LabelInfo {
  /** 讀成的標籤（耐久力 → HP） */
  label: string;
  /** 劇本的寫法 */
  written: string;
  /** wordKey(寫法)：改讀法時記的鍵 */
  key: string;
  auto: LabelKind | 'initiative';
  kind: LabelKind | 'initiative';
  /** 是不是常見的技能、能力值（不是時畫面上標「？」） */
  known: boolean;
  count: number;
}

/** 讀出來的棋子：多了每一行的讀法與判斷的版本 */
export interface ReadPiece extends Piece {
  source: SourceLine[];
  edition: 6 | 7;
}

export interface MemoOptions {
  roll: RollStyle;
  secretRoll: boolean;
  suffix: SuffixStyle;
  proseToMemo: boolean;
  /** 能力值也寫成判定（6 版 ×5） */
  abilityChecks: boolean;
  /** 使用者改過的讀法：wordKey(寫法) → 讀法 */
  labels: Readonly<Record<string, LabelKind>>;
}

export interface MemoResult {
  pieces: ReadPiece[];
  hints: MemoHint[];
  labels: LabelInfo[];
}

/* =================== 字元集與樣式的片段 =================== */

/** 標籤可以用的括號（開、關） */
const LABEL_OPEN = '〈《<【〔[「『';
const LABEL_CLOSE = '〉》>】〕\\]」』';
/** 算括號有沒有收尾時另外算的括號 */
const ANY_OPEN = `${LABEL_OPEN}(（＜`;
const ANY_CLOSE = `${LABEL_CLOSE})）＞`;
/** 武器名稱去掉的括號（不含 [ ]） */
const QUOTE_MARKS = `${LABEL_OPEN.replace('[', '')}${LABEL_CLOSE.replace('\\]', '')}`;
/** 行首的記號 */
const LEAD_MARKS = '■□◆◇●○▼▽★☆◎§・\\s';
/** 一顆骰子：1d6、D10 */
const DIE = '\\d*[dD]\\d+';
const DEC = '[+-]?\\d+(?:\\.\\d+)?';
const INT = '[+-]?\\d+';
const ROLL_HEAD = 's?(?:CCB?|RESB?|CBRB?)';
/** 括號裡數字以外的字（屬於標籤的括號、附註） */
const NOT_NUMERIC = '[^\\d\\s/()%.+\\-]';
const PAIR_WORD = '(?:[A-Za-z]{2,4}|[^\\s\\d,/:=|]{1,6})';
const SLASH = '\\s*\\/\\s*';
/** 骰子式裡會有的字（數字以外） */
const DICE_CHARS = '.+\\-*/dD';
const DAMAGE_EXPR = `[+-]?${DIE}(?:\\s*[+-]\\s*(?:${DIE}|\\d+|DB))*`;

const SPACES = '\\s*';

const re = (src: string, flags = '') => new RegExp(src, flags);

const DICE_HEAD = re(`^[+-]?${DIE}`);
const DICE_BODY = re(`^[+-]?(?:${DIE}|\\d+)(?:[+\\-*/](?:${DIE}|\\d+|DB|db|\\{DB\\}))*`);
const NUMBER_WORD = re(`^${DEC}(?:/${DEC})?$`);
const COMMAND_HEAD = re(`^(?:${ROLL_HEAD}\\b|s?${DIE}|choice|[:@])`, 'i');
const COMMAND_CUT = re(`\\s+(?=${ROLL_HEAD}\\s*(?:<=|\\()|s?${DIE}\\s*[【[(])`, 'i');
const DICE_GAP = re(`(${DIE})\\s*([+-])\\s*(?=\\d|DB\\b|db\\b)`, 'g');
const WRITTEN_DAMAGE = re(
  `(?:${alternation(['ダメージ', '傷害', '伤害'])})\\s*[:：]?\\s*(${DAMAGE_EXPR})`,
  'i',
);
/** 「+傷害加值」「+ダメボ」→「+DB」 */
const DB_IN_EXPR = re(`\\+\\s*(?:${alternation(DB_WORDS)})`, 'g');
/** 行首的項目符號：「- 」「• 」「・」「1.」「1、」（後面要有字；「---」「1.5」不算） */
const BULLET = /^\s*(?:[-*](?![\d.\-*])|[•·・･]|\d{1,2}[.、](?!\d))\s*(?=\S)/;
/** 名字後面括號裡的讀音（假名、拉丁字母、注音）：不是名字的一部分 */
const READING = /^[ぁ-ゟ゠-ヿ\s・=ー\-'.A-Za-zÀ-ɏㄅ-ㄯˊˇˋ˙]+$/;
/** 說明的文字：有句號、6 個以上連續的平假名、或 12 個以上連續的漢字（中文的句子） */
const PROSE = /。|[ぁ-ゟ]{6,}|[㐀-鿿]{12,}/;
const BRACKET_ONLY = /^\s*[(（][^)）]*[)）]\s*$/;
/** 整行只有網址 */
const URL_ONLY = /^https?:\/\/[^\s]+$/;

/* =================== 詞表的查詢 =================== */

const ABILITIES = ABILITY_NAMES.map(([code]) => code);
/** PDF 拆開的英文代號（「D EX」）接得回去的 */
const SPLIT_CODES = new Set([...ABILITIES, 'SAN', 'LUK', 'MOV', 'BLD']);

interface Canon {
  label: string;
  kind: CanonKind;
}
/** 每一種寫法的 key → 讀成的標籤（能力值的代號是參數） */
const CANON = new Map<string, Canon>(
  [...ABILITY_NAMES.map((names) => ['param', ...names] as const), ...CANON_LABELS].flatMap(
    ([kind, label, ...aliases]) =>
      [label, ...aliases].map((w): [string, Canon] => [wordKey(w), { kind, label }]),
  ),
);
const SKILLS = keySet(SKILL_NAMES);

/** 去掉括號之後的 key（「射擊(手槍)」→ 射擊） */
const stemKey = (label: string): string => wordKey(String(label).split(/[(（]/)[0]);

/** 標籤 → 讀成的狀態／參數：整個寫法 → 去掉括號 → 兩個詞都指向同一個（「力量 STR」） */
function lookupCanon(label: string): Canon | undefined {
  const direct = CANON.get(wordKey(label)) ?? CANON.get(stemKey(label));
  if (direct) return direct;
  const words = label.trim().split(/\s+/);
  if (words.length !== 2) return undefined;
  const [a, b] = words.map((w) => CANON.get(wordKey(w)));
  return a && b && a.label === b.label ? a : undefined;
}

const isFamiliar = (label: string): boolean => !!lookupCanon(label) || SKILLS.has(stemKey(label));

const HEADING_KIND = new Map<string, SectionKind>();
for (const [kind, words] of Object.entries(SECTION_WORDS) as [SectionKind, readonly string[]][]) {
  for (const w of words) HEADING_KIND.set(wordKey(w), kind);
}
const PALETTE_TAILS = PALETTE_SECTION_ENDINGS.map(wordKey);

function headingKind(word: string): SectionKind | null {
  const k = wordKey(word);
  return HEADING_KIND.get(k) ?? (PALETTE_TAILS.some((e) => k.endsWith(e)) ? 'palette' : null);
}

type TagKind = keyof typeof LINE_TAGS;
const TAG_KIND = new Map<string, TagKind>();
for (const [kind, words] of Object.entries(LINE_TAGS) as [TagKind, readonly string[]][]) {
  for (const w of words) TAG_KIND.set(wordKey(w), kind);
}

const TAG_WORDS = alternation(Object.values(LINE_TAGS).flat());
/** 「角色備註：…」（NFKC 之後） */
const TAG_LINE = re(`^(${TAG_WORDS})\\s*:\\s*(.+)$`, 'i');
/** 同上，比對原文（值照原文：全形標點不會被 NFKC 換成半形） */
const TAG_LINE_RAW = re(`^(${TAG_WORDS})\\s*[:：]\\s*(.+)$`, 'i');
const NAME_TAG = re(`^(?:${alternation(NAME_TAGS)})\\s*:`, 'i');
const HEADING_PREFIX = re(`^(?:${alternation(HEADING_PREFIXES)})\\s*:\\s*`, 'i');
const COUNT_SUFFIX = re(
  `^(.*?)(?:\\s*[×✕✖*]\\s*|\\s+[xX]\\s*)(\\d{1,3})\\s*(?:${alternation(COUNTERS)})?\\s*(.*)$`,
);
const DAMAGE_WORD = re(`^(?:${alternation(DAMAGE_WORDS)})$`, 'i');
const DAMAGE_LEAD = re(`^(?:${alternation(DAMAGE_WORDS)})\\s*[:：]?\\s*`, 'i');
const DAMAGE_TAIL = re(`^(?:${alternation(DAMAGE_SUFFIXES)})`);
const MENTIONS_DAMAGE = re(alternation(['ダメージ', '威力', '傷害', '伤害']));
const ALT_DAMAGE = re(`^(?:${alternation(ALT_DAMAGE_WORDS)})\\s*(?=${DIE})`, 'i');
const VALUE_NOISE = re(alternation(VALUE_WORDS), 'g');
const SPELL_START = re(`^(?:${alternation(SPELL_WORDS)})`);
const NONE = keySet(NONE_WORDS);
const STATUS_TAIL = re(`[${STATUS_ENDINGS.join('')}]$`);
const SEVENTH_SKILL = re(`^(?:${alternation(SKILLS_7TH_ONLY)})`);

const containsDigit = (t: string): boolean => /\d/.test(t.normalize('NFKC'));
const countOf = (s: string, chars: string): number => (s.match(re(`[${chars}]`, 'g')) ?? []).length;
/** 開括號比關括號多幾個 */
const bracketBalance = (s: string): number => countOf(s, ANY_OPEN) - countOf(s, ANY_CLOSE);
/** 骰子式裡的空白去掉（1D10 + DB → 1D10+DB） */
const squeezeDice = (s: string): string => s.replace(DICE_GAP, '$1$2');

/* =================== 1. 切段、2. 接回斷行 =================== */

interface Row {
  no: number;
  raw: string;
}
interface StitchedRow {
  no: number;
  /** 接起來的文字（去頭尾空白） */
  text: string;
  /** 原本的每一行 */
  parts: string[];
}

/** 空行分隔成段（每行記下行號） */
function segment(text: string): Row[][] {
  const segments: Row[][] = [[]];
  String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .forEach((raw, i) => {
      const open = segments[segments.length - 1];
      if (raw.trim()) open.push({ no: i + 1, raw });
      else if (open.length) segments.push([]);
    });
  return segments.filter((s) => s.length > 0);
}

const KANA = 'ぁ-ヿ';
const KANA_TAIL = re(`[${KANA}]$`);
const KANA_BIT = re(`^[${KANA}]{1,2}$`);
/** 以數字開頭、數字後面是 % 括號 空白或行尾（「80」「7 5%」） */
const VALUE_HEAD = /^\d[\d ]*(?:$|[\s%％(（])/;
const OPEN_TAIL = /[^\d\s%。]$/;

/** 下一行直接接在上一行後面：「、頭銜」、斷開的假名（スタ／ン）、跨行的括號（〈こぶし／〉80） */
function gluesTight(prev: string, next: string): boolean {
  const kanaSplit = KANA_BIT.test(next) && KANA_TAIL.test(prev);
  const bracketSplit = bracketBalance(prev) > 0 && bracketBalance(next) < 0;
  return /^[、,，]/.test(next) || kanaSplit || bracketSplit;
}

/** 下一行是上一行的值（「〈圖書館〉」＋下一行「80」）：以空白接上 */
function valueOnNextRow(prev: string, next: string): boolean {
  if (!VALUE_HEAD.test(next) || !OPEN_TAIL.test(prev) || PROSE.test(prev)) return false;
  return headingAt(prev.normalize('NFKC')) === null;
}

function stitchRows(rows: readonly Row[]): StitchedRow[] {
  const out: StitchedRow[] = [];
  for (const { no, raw } of rows) {
    const text = raw.trim();
    const last = out.at(-1);
    if (last && gluesTight(last.text, text)) {
      last.text += text;
      last.parts.push(raw);
    } else if (last && valueOnNextRow(last.text, text)) {
      last.text += ` ${text}`;
      last.parts.push(raw);
    } else out.push({ no, text, parts: [raw] });
  }
  return out;
}

/* =================== 小標、名字行 =================== */

const BRACKET_HEADING = re(`^[${LABEL_OPEN}(]([^${LABEL_CLOSE})]{1,20})[${LABEL_CLOSE})]\\s*(.*)$`);
/** 「技能：…」「技能 …」：最多 14 個字的詞，後面是冒號、空白或行尾 */
const WORD_HEADING = re(`^([^\\s:]{1,14}?)\\s*(?:$|:\\s*|\\s+)(.*)$`);

/** 小標：「【技能】」「技能：〈閃避〉40」「武器：」→ { kind, rest }；「戰鬥 60」是技能，不是小標 */
function headingAt(line: string): { kind: SectionKind; rest: string } | null {
  const s = line.replace(re(`^[${LEAD_MARKS}]+`), '');
  const bracketed = BRACKET_HEADING.exec(s);
  const m = bracketed ?? WORD_HEADING.exec(s);
  if (!m) return null;
  const [, word, rest] = m;
  const kind = headingKind(bracketed ? word.replace(/[:\s]+$/, '') : word);
  if (kind === null || (!bracketed && /^[+-]?\d/.test(rest))) return null;
  return { kind, rest };
}

const CLOSERS = ANY_CLOSE.replace('\\', '');

/** 括號外第一個「、」「,」的位置（括號裡的逗號不算：「老人（72 歲，退休教師）」） */
function topLevelComma(s: string): number {
  let depth = 0;
  return Array.prototype.findIndex.call(s, (ch: string) => {
    if (ANY_OPEN.includes(ch)) depth += 1;
    else if (CLOSERS.includes(ch)) depth = depth > 0 ? depth - 1 : 0;
    else return depth === 0 && '、,'.includes(ch);
    return false;
  });
}

const NAME_BRACKET = re(`^[${LABEL_OPEN}]([^${LABEL_CLOSE}]+)[${LABEL_CLOSE}]\\s*(.*)$`);
const TITLE_DASH = /^(.+?)\s*[─—―]+\s*(.+)$/;
const TITLE_HYPHEN = /^(.+?)\s+-\s+(.+)$/;
const PAREN_GROUP = '\\(([^()]*)\\)';
/** 名字後面的括號：「名字 (讀音) 其他」 */
const TRAILING_PAREN = re(`^(.+?)\\s*${PAREN_GROUP}\\s*(.*)$`);
const FIRST_PAREN = re(PAREN_GROUP);

/**
 * 第一行 → 名字、個數、其他的文字：去掉行首記號與「名稱：」→「【名字】其他」→「名字 ×3」→
 * 「頭銜─名字(讀音)」→「名字、頭銜」（括號外的逗號）→ 名字後面的「(讀音)」「(34 歲)」。
 */
function parseNameLine(line: string): { name: string; count: number; extra: string[] } {
  const extra: string[] = [];
  let s = line
    .replace(re(`^[${LEAD_MARKS}]+`), '')
    .trim()
    .replace(HEADING_PREFIX, '');
  const bracketed = NAME_BRACKET.exec(s);
  if (bracketed) {
    s = bracketed[1].trim();
    extra.push(bracketed[2]);
  }
  let copies = 1;
  const counted = COUNT_SUFFIX.exec(s);
  if (counted?.[1].trim()) {
    s = counted[1].trim();
    copies = Number.parseInt(counted[2], 10);
    extra.push(counted[3]);
  }
  const titled = TITLE_DASH.exec(s) ?? TITLE_HYPHEN.exec(s);
  if (titled) {
    /* 「頭銜─名字(讀音)」：讀音跟著的是名字 */
    const [, left, right] = titled;
    const nameRight = READING.test(FIRST_PAREN.exec(right)?.[1] ?? '\u0000');
    extra.push(nameRight ? left : right);
    s = nameRight ? right : left;
  }
  const comma = topLevelComma(s);
  if (comma > 0 && comma < s.length - 1) {
    extra.push(s.slice(comma + 1));
    s = s.slice(0, comma).trim();
  }
  for (let round = 0; round < 3; round++) {
    const tail = TRAILING_PAREN.exec(s);
    const inside = tail?.[2] ?? '';
    if (!tail || !(/\d/.test(inside) || READING.test(inside))) break;
    s = tail[1];
    extra.push(`(${inside})`, tail[3]);
  }
  const others = extra.map((t) => t.trim()).filter((t) => t !== '');
  const name = s.trim();
  return { name, count: copies, extra: others };
}

/* =================== 4a. 一行的整理 =================== */

/** 被保護的文字換成一個私用區字元，後面的整理不會動到它（括號裡的標籤、附註） */
const VAULT_BASE = 0xeb00;
const VAULT_CHAR = /[\ueb00-\uebff]/g;

class Vault {
  private readonly items: { text: string; attached: boolean }[] = [];

  stash(text: string, attached: boolean): string {
    this.items.push({ text, attached });
    return String.fromCharCode(VAULT_BASE + this.items.length - 1);
  }

  reveal(s: string): string {
    return s.replace(VAULT_CHAR, (c) => this.items[c.charCodeAt(0) - VAULT_BASE]?.text ?? c);
  }

  /** 這個詞是一整段括號的附註（「(絕命時發動)」）時回傳它的原文 */
  noteOf(token: string): string | null {
    if (token.length !== 1) return null;
    const item = this.items[token.charCodeAt(0) - VAULT_BASE];
    return item?.attached ? item.text : null;
  }
}

interface Normalized {
  text: string;
  vault: Vault;
}

const LINE_PATTERNS = {
  bracketLabel: re(`[${LABEL_OPEN}]([^${LABEL_OPEN}${LABEL_CLOSE}]{1,40})[${LABEL_CLOSE}]`, 'g'),
  attachedParen: re(`\\(([^()]*${NOT_NUMERIC}[^()]*)\\)`, 'g'),
  footnote: /※\s*\d+/g,
  splitCode: /\b([A-Z])\s+([A-Z]{2})\b/g,
  splitDigits: re(`(^|\\D)(\\d(?: \\d)+)(?!\\d)`, 'g'),
  otherEdition: /\s*\(\s*[\d\s/]*\)?/g,
  pairs: re(
    `(${PAIR_WORD}(?:${SLASH}${PAIR_WORD})+)\\s*[:=|]?\\s*(${INT}(?:${SLASH}${INT})+)`,
    'g',
  ),
  separators: /[、,|;]/g,
  listSlash: /\/(?!\s*[+-]?\d)/g,
  wordSlash: /([^\d\s])\s*\//g,
  colon: /([^\s\d:=])\s*[:=]\s*/g,
  /* 「STR12」「99天文學」拆開；骰子式（1d6、1D3+2）不拆 */
  labelThenNumber: re(`([^\\s\\d${DICE_CHARS}(,])(?=\\d)`, 'g'),
  numberThenLabel: re(`(\\d)(?=[^\\s\\d${DICE_CHARS}),])`, 'g'),
};

/** 「STR/DEX 60/50」→「STR 60 , DEX 50」（個數不同時不動） */
function spreadPairs(whole: string, names: string, values: string): string {
  const keys = names.split(re(SLASH));
  const nums = values.split(re(SLASH));
  if (keys.length !== nums.length) return whole;
  return keys.map((k, i) => `${k} ${nums[i]}`).join(' , ');
}

/**
 * 一行 → 「標籤 數值 , 標籤 數值」的詞（以空白分隔、逗號分項）。步驟見規格 3.2；順序不能換
 * （例：先保護括號裡的標籤，再去掉另一版的值）。
 */
function normalizeLine(line: string): Normalized {
  const vault = new Vault();
  const P = LINE_PATTERNS;
  let s = line.normalize('NFKC').replace(/±/g, '+');
  s = s.replace(P.bracketLabel, (_m, inner: string) => ` ${vault.stash(inner.trim(), false)} `);
  s = s.replace(P.attachedParen, (whole) => vault.stash(whole, true));
  s = s.replace(P.footnote, ' ');
  s = s.replace(P.splitCode, (whole, a: string, b: string) =>
    SPLIT_CODES.has(a + b) ? a + b : whole,
  );
  s = s.replace(
    P.splitDigits,
    (_m, lead: string, digits: string) => lead + digits.replace(/ /g, ''),
  );
  s = s.replace(P.otherEdition, ' ');
  s = s.replace(P.pairs, spreadPairs);
  s = s.replace(VALUE_NOISE, ' ').replace(/%/g, ' ');
  for (let round = 0; round < 3; round++) s = squeezeDice(s);
  s = s.replace(P.separators, ' , ');
  s = s.replace(P.listSlash, ' , ').replace(P.wordSlash, '$1 , ');
  s = s.replace(P.colon, '$1 ');
  s = s.replace(P.labelThenNumber, '$1 ');
  s = s.replace(P.numberThenLabel, '$1 ');
  const text = s.split(/\s+/).filter(Boolean).join(' ');
  return { text, vault };
}

/* =================== 4b. 掃成項目 =================== */

interface DamagePart {
  damage: string;
  note: string;
}

interface Pair extends DamagePart {
  label: string;
  /** 數值（「DB 1d6」這種只有骰子的是 null） */
  value: number | null;
  /** 「55/99」的最大值 */
  max: number | null;
  /** 原本的寫法（「+1d4」「1d6」） */
  raw: string;
}

/** 骰子式後面的說明：拿掉「+」「的傷害」；黏住的括號只留裡面（5. D 項） */
function noteAfterDice(rest: string): string {
  return rest
    .replace(/^[+\s]+/, '')
    .replace(DAMAGE_TAIL, '')
    .replace(/^[+\s]+/, '')
    .replace(/^\((.*)\)$/, '$1');
}

/** 一個詞的骰子式與後面的說明（「1d4傷害+束縛」→ 1d4、「束縛」） */
function splitDamage(token: string): DamagePart {
  const damage = DICE_BODY.exec(token)?.[0] ?? '';
  return { damage, note: noteAfterDice(token.slice(damage.length)) };
}

/**
 * 括號附註裡的傷害（「(傷害 1D6、對象隨機)」「(1D3+DB)」「(1D10,射程15米)」）；不是傷害時 null。
 * 附註照原本的字，不插空白（5. D 項）。
 */
function damageInParen(note: string): DamagePart | null {
  const inner = squeezeDice(
    note
      .replace(/^[(（]|[)）]$/g, '')
      .trim()
      .replace(DAMAGE_LEAD, ''),
  );
  if (!DICE_HEAD.test(inner)) return null;
  const damage = DICE_BODY.exec(inner)?.[0] ?? '';
  const rest = inner.slice(damage.length).replace(/^[,、;\s]+/, '');
  return { damage, note: noteAfterDice(rest).trim() };
}

interface ScanResult {
  pairs: Pair[];
  /** 沒有讀成項目的文字（有數字的標成讀不出） */
  stray: string[];
  /** 遇到「法術：」：後面是說明 */
  spell: boolean;
}

/** 整理過的詞 → 項目：「標籤 數值 傷害」「標籤 骰子式」；數值後面的傷害接在那個項目上 */
class PairScanner {
  private readonly pairs: Pair[] = [];
  private readonly stray: string[] = [];
  private words: string[] = [];
  /** 最後一個有數值的項目（「傷害 1d6」接在它後面） */
  private previous: Pair | null = null;

  constructor(
    private readonly tokens: readonly string[],
    private readonly vault: Vault,
  ) {}

  run(): ScanResult {
    let i = 0;
    while (i < this.tokens.length) {
      const next = this.step(i);
      if (next === null) return { pairs: this.pairs, stray: this.stray, spell: true };
      i = next;
    }
    this.dropWords();
    return { pairs: this.pairs, stray: this.stray, spell: false };
  }

  /** 讀第 i 個詞，回傳下一個要讀的位置；遇到法術時 null */
  private step(i: number): number | null {
    const tok = this.tokens[i];
    const word = this.vault.reveal(tok);
    if (tok === ',' || tok === '/') {
      this.dropWords();
      return i + 1;
    }
    if (this.vault.noteOf(tok) !== null && !this.words.length) return i + 1;
    const after = this.tokens[i + 1];
    if (SPELL_START.test(word) && !(after && NUMBER_WORD.test(after))) {
      this.dropWords();
      this.stray.push(this.vault.reveal(this.tokens.slice(i).join(' ')));
      return null;
    }
    if (this.words.length && NONE.has(wordKey(word))) {
      this.words = [];
      return i + 1;
    }
    if (this.words.length && NUMBER_WORD.test(tok)) {
      const [current, max] = tok.split('/');
      const pair = this.emit({
        value: Number.parseFloat(current),
        max: max === undefined ? null : Number.parseFloat(max),
        raw: current,
      });
      return this.attachDamage(i + 1, pair);
    }
    if (DICE_HEAD.test(tok)) {
      const [only, ...more] = this.words;
      const onlyDamageWord = only !== undefined && !more.length && this.isDamageWord(only);
      if (this.words.length && !onlyDamageWord) {
        this.emit({ raw: word, value: null, max: null });
        return i + 1;
      }
      if (this.previous && !this.previous.damage) {
        this.words = [];
        return this.attachDamage(i, this.previous);
      }
    }
    this.words.push(tok);
    return i + 1;
  }

  private emit(v: Pick<Pair, 'value' | 'max' | 'raw'>): Pair {
    const label = this.vault.reveal(this.words.join(' ')).trim();
    const pair: Pair = { label, ...v, damage: '', note: '' };
    this.words = [];
    this.pairs.push(pair);
    if (v.value !== null) this.previous = pair;
    return pair;
  }

  private isDamageWord(tok: string): boolean {
    return DAMAGE_WORD.test(this.vault.reveal(tok));
  }

  private dropWords(): void {
    if (this.words.length) this.stray.push(this.vault.reveal(this.words.join(' ')));
    this.words = [];
  }

  /** 從第 at 個詞起讀傷害（附註裡的、「傷害 1d6」、「1d6」、「1d6 的傷害」）；回傳下一個要讀的位置 */
  private attachDamage(at: number, pair: Pair): number {
    const t = this.tokens;
    let k = at;
    const note = t[k] === undefined ? null : this.vault.noteOf(t[k]);
    if (note !== null) {
      const inside = damageInParen(this.vault.reveal(note));
      if (inside) {
        Object.assign(pair, inside);
        return k + 1;
      }
      k++;
    }
    if (t[k] && t[k + 1] && this.isDamageWord(t[k]) && DICE_HEAD.test(t[k + 1])) k++;
    if (!t[k] || !DICE_HEAD.test(t[k])) return at;
    Object.assign(pair, splitDamage(this.vault.reveal(t[k])));
    k++;
    const tail = t[k] ? this.vault.reveal(t[k]) : '';
    if (DAMAGE_TAIL.test(tail)) {
      const extra = tail.replace(DAMAGE_TAIL, '').replace(/^[+\s]+/, '');
      if (extra) pair.note = pair.note ? `${pair.note} ${extra}` : extra;
      k++;
    }
    return k;
  }
}

/* =================== 判定的指令與版本 =================== */

interface Skill extends DamagePart {
  label: string;
  value: number;
  alts: DamagePart[];
}

/** 判定的指令（「CCB<=」、秘密骰「sCCB<=」；不寫成判定時空字串） */
export function rollPrefix(roll: RollStyle, secret: boolean, edition: 6 | 7): string {
  const fixed: Record<Exclude<RollStyle, 'auto'>, string> = {
    ccb: 'CCB<=',
    cc: 'CC<=',
    d100: '1d100<=',
    none: '',
  };
  const base = roll === 'auto' ? (edition === 7 ? 'CC<=' : 'CCB<=') : fixed[roll];
  return base && secret ? `s${base}` : base;
}

/** 指令的標籤：【標籤】，或指令後面的文字（「CCB<=80 觸手」→ 觸手） */
export function commandLabel(command: string): string {
  const bracketed = /【([^】]+)】/.exec(command);
  return bracketed ? bracketed[1] : command.trim().split(/\s+/).slice(1).join(' ');
}

/** 「60%(30/12)」：括號裡是 7 版的困難、極限成功值 */
const HARD_EXTREME = re(`%${SPACES}[(（]${SPACES}\\d+${SPACES}[/／]${SPACES}\\d+`);

/** 能力值是 7 版的寫法：3 個以上、全部是 5 的倍數、四分之三以上大於 20 */
function scaledAbilities(values: readonly number[]): boolean {
  if (values.length < 3 || values.some((v) => v % 5 !== 0)) return false;
  return values.filter((v) => v > 20).length / values.length >= 3 / 4;
}

/** 7 版：括號裡有困難／極限的值、能力值是 7 版的寫法、用到 7 版才有的技能 */
function guessEdition(text: string, abilities: readonly number[], skills: readonly Skill[]): 6 | 7 {
  if (HARD_EXTREME.test(text.normalize('NFKC')) || scaledAbilities(abilities)) return 7;
  return skills.some((s) => SEVENTH_SKILL.test(s.label)) ? 7 : 6;
}

/** DB 的值一律帶正負號（{DB} 接在骰子式後面才成立）：0 → +0、1d4 → +1d4 */
function signedDb(v: string): string {
  const value = `${v}`.trim();
  return /^[+-]/.test(value) ? value : `+${value}`;
}

/** 同一個標籤再出現時取代，否則加在後面 */
function upsert<T>(list: T[], entry: T, same: (x: T) => boolean): void {
  const at = list.findIndex(same);
  if (at < 0) list.push(entry);
  else list[at] = entry;
}

/* =================== 3. 一段 → 一個棋子 =================== */

class NpcDraft {
  readonly piece: ReadPiece;
  copies = 1;
  private readonly skills: Skill[] = [];
  /** 劇本寫好的指令（照原文放進聊天面板） */
  private readonly written: string[] = [];
  private readonly memo: string[] = [];
  private readonly prose: string[] = [];
  /** 「武器：」下面的武器 → 傷害 */
  private readonly weaponDamage = new Map<string, string>();
  private section: SectionKind = 'stats';
  private weapon = '';
  private lastSkill: Skill | null = null;
  /** 上一行最後讀到的是技能時是它（下一行只有「（1D3+DB）」時是它的傷害） */
  private skillEndingPrevRow: Skill | null = null;
  private skillEndingThisRow: Skill | null = null;
  /** 讀到的先攻（沒有時用 DEX） */
  private initiative: number | null = null;
  private strCount = 0;
  /** 這一行的原文（沒有拿掉小標時）：放進備註的文字用原文 */
  private original: string | null = null;

  constructor(
    private readonly rows: readonly Row[],
    private readonly o: MemoOptions,
    private readonly seen: Map<string, LabelInfo>,
    private readonly hints: MemoHint[],
  ) {
    this.piece = { ...newPiece({ line: rows[0].no, from: 'text' }), source: [], edition: 6 };
  }

  assemble(): ReadPiece {
    stitchRows(this.rows).forEach((row, i) => {
      this.skillEndingThisRow = null;
      this.consume(row, i === 0);
      this.skillEndingPrevRow = this.skillEndingThisRow;
    });
    return this.finish();
  }

  private log(row: StitchedRow, state: SourceState, read: ReadChip[] = []): void {
    this.piece.source.push({ line: row.no, text: row.parts.join('\n'), state, read });
  }

  /** 備註、說明的文字：有原文時用原文 */
  private kept(text: string): string {
    return this.original ?? text;
  }

  private consume(row: StitchedRow, first: boolean): void {
    const raw = row.text.replace(BULLET, '');
    const nfkc = raw.normalize('NFKC').replace(DB_IN_EXPR, '+DB');
    if (first && this.readName(row, nfkc)) return;
    if (this.readTag(row, raw, nfkc)) return;
    if (URL_ONLY.test(nfkc)) {
      this.piece.externalUrl = nfkc;
      this.log(row, 'read', [{ t: 'url' }]);
      return;
    }
    this.original = raw;
    let text = nfkc;
    const heading = headingAt(nfkc);
    if (heading) {
      this.section = heading.kind;
      this.weapon = '';
      this.original = null;
      if (!heading.rest) {
        this.log(row, 'section');
        return;
      }
      text = heading.rest;
    }
    this.route(row, text);
  }

  /** 小標決定之後：這一行交給哪一種讀法 */
  private route(row: StitchedRow, text: string): void {
    if (this.section === 'memo') {
      this.memo.push(this.kept(text));
      this.log(row, 'read', [{ t: 'memo' }]);
      return;
    }
    if (this.section === 'text' || /^[#※]/.test(text)) {
      this.skipAsProse(row, text);
      return;
    }
    const last = this.lastSkill;
    const ownDamageRow =
      !!last &&
      !last.damage &&
      DICE_HEAD.test(text) &&
      MENTIONS_DAMAGE.test(text) &&
      !text.includes('【');
    const looksLikeCommand = COMMAND_HEAD.test(text) || text.includes('<=');
    if (this.section === 'palette' || (!ownDamageRow && looksLikeCommand)) {
      this.readCommands(row, text);
    } else if (last && (ownDamageRow || ALT_DAMAGE.test(text))) {
      this.readDamageRow(row, text, last, !ownDamageRow);
    } else if (BRACKET_ONLY.test(text) && this.section !== 'weapons') {
      this.readBracketRow(row, text);
    } else if (this.section === 'weapons' && !/[%％]/.test(row.text)) {
      this.readWeaponRow(row, text);
    } else this.readData(row, text);
  }

  private skipAsProse(row: StitchedRow, text: string): void {
    this.prose.push(this.kept(text));
    this.log(row, 'skip');
  }

  /** 第一行：名字（第一個詞是能力值、技能，或是小標時不是名字） */
  private readName(row: StitchedRow, nfkc: string): boolean {
    const n = normalizeLine(nfkc);
    const firstWord = n.vault.reveal(n.text.split(' ')[0] ?? '');
    const looksLikeData = !NAME_TAG.test(nfkc) && isFamiliar(firstWord);
    if (headingAt(nfkc) || looksLikeData) {
      this.hints.push({ code: 'no-name', line: row.no });
      return false;
    }
    const parsed = parseNameLine(nfkc);
    this.piece.name = parsed.name;
    this.copies = parsed.count;
    if (this.o.proseToMemo) this.memo.push(...parsed.extra);
    this.log(row, 'name', [{ t: 'name', name: parsed.name, count: parsed.count }]);
    return true;
  }

  /** 「角色備註：」「立繪：」「網址：」「聊天面板：」 */
  private readTag(row: StitchedRow, raw: string, nfkc: string): boolean {
    const tagged = TAG_LINE.exec(nfkc);
    if (!tagged) return false;
    const original = TAG_LINE_RAW.exec(raw);
    const value = tagged[2].trim();
    const shown = original ? original[2].trim() : value;
    switch (TAG_KIND.get(wordKey(tagged[1]))) {
      case 'memo':
        this.memo.push(shown);
        break;
      case 'image':
        this.piece.imageName = value;
        break;
      case 'url':
        this.piece.externalUrl = value;
        break;
      default:
        this.written.push(value);
    }
    this.log(row, 'read', [{ t: 'tag', tag: original ? original[1] : tagged[1], value: shown }]);
    return true;
  }

  /** 劇本寫好的指令：「CCB<=80 觸手」「sCCB<=60 【鬥毆】 sCCB<=50 【閃避】 1d3 【鬥毆】」 */
  private readCommands(row: StitchedRow, text: string): void {
    const commands = text
      .split(COMMAND_CUT)
      .map((t) => t.trim())
      .filter(Boolean);
    this.written.push(...commands);
    this.log(
      row,
      'read',
      commands.map((command) => ({ t: 'command', command })),
    );
  }

  /** 自己一行的傷害（「1d6 的傷害」），或另一種傷害（「或 1D6+DB（用菜刀時）」） */
  private readDamageRow(row: StitchedRow, text: string, skill: Skill, alt: boolean): void {
    const n = normalizeLine(text.replace(ALT_DAMAGE, ''));
    const [head, ...rest] = n.text.split(' ');
    const part = splitDamage(n.vault.reveal(head));
    if (!part.note) {
      const when = rest.map((t) => n.vault.noteOf(t)).find((x) => x !== null);
      if (when) part.note = when.replace(/^\(|\)$/g, '');
    }
    if (alt) skill.alts.push(part);
    else Object.assign(skill, part);
    this.log(row, 'read', [{ t: 'damage', label: skill.label, damage: part.damage }]);
  }

  /**
   * 只有括號的行：「(傷害 1d10／裝彈數 8)」是前一個技能的傷害；整行只有骰子式「（1D3+DB）」、
   * 上一行最後是技能時也是它的傷害（中文 PDF 常在這裡斷行）。
   */
  private readBracketRow(row: StitchedRow, text: string): void {
    const last = this.lastSkill;
    const named = WRITTEN_DAMAGE.exec(text);
    if (named) {
      const owner = last?.damage === '' ? last : null;
      if (owner) {
        owner.damage = named[1].replace(/\s+/g, '');
        this.log(row, 'read', [{ t: 'damage', label: owner.label, damage: owner.damage }]);
      } else this.log(row, 'skip');
      return;
    }
    const prev = this.skillEndingPrevRow;
    const inner = text
      .trim()
      .replace(/^[(（]|[)）]$/g, '')
      .replace(/\s+/g, '');
    const onlyDice = DICE_HEAD.test(inner) && DICE_BODY.exec(inner)?.[0] === inner;
    if (prev && !prev.damage && onlyDice) {
      prev.damage = inner;
      this.log(row, 'read', [{ t: 'damage', label: prev.label, damage: inner }]);
    } else this.log(row, 'skip');
  }

  /** 「武器：」下面：武器的名字、它的傷害；說明的文字不讀（5. D 項） */
  private readWeaponRow(row: StitchedRow, text: string): void {
    if (PROSE.test(text)) {
      this.skipAsProse(row, text);
      return;
    }
    const named = WRITTEN_DAMAGE.exec(text);
    if (!named) {
      this.weapon = text.replace(re(`[${QUOTE_MARKS}]`, 'g'), '').replace(/\s+/g, '');
      this.log(row, 'read', [{ t: 'weapon', name: this.weapon }]);
    } else if (this.weapon) {
      const damage = named[1].replace(/\s+/g, '');
      this.weaponDamage.set(stemKey(this.weapon), damage);
      this.log(row, 'read', [{ t: 'damage', label: this.weapon, damage }]);
    } else this.log(row, 'skip');
  }

  /** 「標籤 數值」的行 */
  private readData(row: StitchedRow, text: string): void {
    const n = normalizeLine(text);
    const firstWord = n.vault.reveal(n.text.split(' ')[0] ?? '');
    if (PROSE.test(n.text.replace(VAULT_CHAR, '')) && !lookupCanon(firstWord)) {
      this.skipAsProse(row, text);
      return;
    }
    const scan = new PairScanner(n.text.split(' ').filter(Boolean), n.vault).run();
    /* 法術後面是它的說明，不是沒讀到的資料 */
    if (scan.spell) {
      const tail = scan.stray.pop();
      if (tail) this.prose.push(tail);
    }
    const read = scan.pairs.map((p) => this.place(p));
    const unread = scan.stray.filter(containsDigit);
    let state: SourceState = 'read';
    if (!scan.pairs.length) state = unread.length ? 'unread' : 'skip';
    else if (unread.length) state = 'partial';
    this.log(row, state, [...read, ...unread.map((t) => ({ t: 'miss' as const, text: t }))]);
    if (state === 'skip') this.prose.push(this.kept(text));
  }

  /** 一個項目依讀法放進狀態、參數、技能、先攻 */
  private place(p: Pair): ReadChip {
    this.skillEndingThisRow = null;
    const key = wordKey(p.label);
    const canon = lookupCanon(p.label);
    let auto: LabelKind | 'initiative' = 'skill';
    if (canon) auto = canon.kind;
    else if (p.value === null) auto = 'param';
    else if (p.max !== null || STATUS_TAIL.test(p.label)) auto = 'status';
    const kind: LabelKind | 'initiative' = (this.o.labels[key] as LabelKind | undefined) ?? auto;
    /* 參數的參照是 {標籤}：標籤裡的半形冒號換成全形 */
    const label = canon ? canon.label : p.label.replace(/:/g, '：');
    const info = this.seen.get(key) ?? {
      label,
      written: p.label,
      key,
      auto,
      kind,
      known: !!canon || SKILLS.has(stemKey(p.label)),
      count: 0,
    };
    info.count++;
    this.seen.set(key, info);
    if (kind === 'ignore') return { t: 'ignored', label };
    if (kind === 'initiative') {
      this.initiative = p.value;
      return { t: 'initiative', value: p.value ?? 0 };
    }
    if (label === 'STR') this.strCount++;
    return kind === 'status'
      ? this.placeStatus(label, p)
      : kind === 'param'
        ? this.placeParam(label, p)
        : this.placeSkill(label, p);
  }

  private placeStatus(label: string, p: Pair): ReadChip {
    const value = p.value ?? 0;
    const entry: PieceStatus = { label, value, max: p.max ?? value };
    upsert(this.piece.status, entry, (x) => x.label === label);
    return { t: 'status', ...entry };
  }

  private placeParam(label: string, p: Pair): ReadChip {
    const written = p.value === null || /^[+-]/.test(p.raw) ? p.raw : String(p.value);
    const value = label === 'DB' ? signedDb(written) : written;
    upsert(this.piece.params, { label, value }, (x) => x.label === label);
    return { t: 'param', label, value };
  }

  private placeSkill(label: string, p: Pair): ReadChip {
    const skill: Skill = { label, value: p.value ?? 0, damage: p.damage, note: p.note, alts: [] };
    this.skills.push(skill);
    this.lastSkill = skill;
    this.skillEndingThisRow = skill;
    return { t: 'skill', label, value: skill.value, damage: skill.damage };
  }

  private finish(): ReadPiece {
    const c = this.piece;
    /* 另外列在「武器：」的傷害接到同名的技能 */
    for (const s of this.skills) s.damage ||= this.weaponDamage.get(stemKey(s.label)) ?? '';
    const abilityValue = (code: string): number | null => {
      const param = c.params.find((p) => p.label === code);
      return param ? readNumber(param.value) : null;
    };
    c.initiative = this.initiative ?? abilityValue('DEX') ?? 0;
    const abilities = ABILITIES.map(abilityValue).filter((v): v is number => v !== null);
    c.edition = guessEdition(this.rows.map((r) => r.raw).join('\n'), abilities, this.skills);
    c.commands = paletteLines(
      { edition: c.edition, skills: this.skills, written: this.written, sheet: c },
      this.o,
    ).join('\n');
    c.memo = [...this.memo, ...(this.o.proseToMemo ? this.prose : [])].join('\n');
    this.hints.push(...draftHints(c, this.strCount, this.skills.length + this.written.length));
    return c;
  }
}

/** 一個棋子讀完的提示：讀不出的數字、好幾個 NPC 連在一起、讀不到任何數值 */
function draftHints(c: ReadPiece, strCount: number, extras: number): MemoHint[] {
  const who: Who = { name: c.name, line: c.line ?? 0 };
  const unreadLines = c.source
    .filter((row) => row.state === 'unread' || row.state === 'partial')
    .map((row) => row.line);
  const nothingRead = c.status.length + c.params.length + extras === 0 && c.source.length > 1;
  const out: MemoHint[] = [];
  if (unreadLines.length > 0) out.push({ code: 'unread', who, lines: unreadLines.slice(0, 4) });
  if (strCount > 1) out.push({ code: 'joined', who, count: strCount });
  if (nothingRead) out.push({ code: 'nothing', who });
  return out;
}

/* =================== 5. 聊天面板 =================== */

interface PaletteInput {
  edition: 6 | 7;
  skills: readonly Skill[];
  /** 劇本寫好的指令 */
  written: readonly string[];
  /** 讀到的狀態與參數（不寫成判定時技能加進參數） */
  sheet: { status: readonly PieceStatus[]; params: PieceParam[] };
}

const WRITES_SAN = /SAN|正気度|理智|理性/i;
const WRITES_LUCK = /幸運|幸运|LUK|LUCK/i;

/**
 * 讀到的資料 → 聊天面板的行（順序照本站 coc-sheet、coc-npc：理智檢定 → 幸運 → 能力值 → 技能 → 指令；規格 3.3）：
 * 1. SAN、幸運的狀態（最大值大於 0）參照狀態寫成判定（劇本寫好的指令裡已經有時不加）；
 * 2. 勾「能力值也寫成判定」時 STR～EDU（6 版的 CoC 判定 ×5）；
 * 3. 技能依讀到的順序，每個接自己的傷害（有 DB 參數時 `+DB` 換成參照 `{DB}`）；
 * 4. 劇本寫好的指令照原文（同名的技能不重複寫）。不寫成判定時技能變成參數（傷害照樣寫）。
 */
function paletteLines(r: PaletteInput, o: MemoOptions): string[] {
  const { status, params } = r.sheet;
  const prefix = rollPrefix(o.roll, o.secretRoll, r.edition);
  const refDb = params.some((p) => p.label === 'DB')
    ? (d: string) => d.replace(/\+\s*DB\b/gi, '{DB}')
    : (d: string) => d;
  const already = new Set(r.written.map((t) => wordKey(commandLabel(t))).filter(Boolean));
  const fresh = (label: string) => !already.has(wordKey(label));
  const hasStatus = (label: string) => status.some((x) => x.label === label && x.max > 0);
  const notWritten = (pattern: RegExp) => !r.written.some((t) => pattern.test(t));
  const lines: string[] = [];
  const check = (target: string | number, name: string) => lines.push(`${prefix}${target} ${name}`);
  if (prefix && hasStatus('SAN') && notWritten(WRITES_SAN)) check('{SAN}', OUT.sanCheck);
  if (prefix && hasStatus(LUCK) && notWritten(WRITES_LUCK)) check(`{${LUCK}}`, OUT.luckCheck);
  if (prefix && o.abilityChecks) {
    const times = r.edition === 6 && /CCB?<=$/.test(prefix) ? 5 : 1;
    for (const code of ABILITIES.filter(fresh)) {
      const found = params.find((x) => x.label === code);
      const v = found ? readNumber(found.value) : null;
      if (v !== null) check(v * times, code);
    }
  }
  for (const skill of r.skills.filter((x) => fresh(x.label))) {
    if (prefix) check(skill.value, skill.label);
    else params.push({ label: skill.label, value: `${skill.value}` });
    const damages = skill.damage ? [skill, ...skill.alts] : skill.alts;
    for (const d of damages)
      lines.push(`${refDb(d.damage)} ${OUT.damageName(skill.label, d.note)}`);
  }
  return [...lines, ...r.written];
}

/* =================== 整份 =================== */

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** ×N 的複本的名字：「名字A」「名字B」…（26 個以上或選了數字時 1、2、3…；英數結尾的名字先空一格） */
function copyNames(name: string, n: number, style: SuffixStyle): string[] {
  const join = /[\dA-Za-z]$/.test(name) ? `${name} ` : name;
  const byNumber = style === 'number' || n > LETTERS.length;
  return Array.from({ length: n }, (_, i) => join + (byNumber ? `${i + 1}` : LETTERS[i]));
}

/** 讀「速記・從劇本貼上」的文字 */
export function readNpcText(text: string, opts: MemoOptions): MemoResult {
  const hints: MemoHint[] = [];
  const seen = new Map<string, LabelInfo>();
  const pieces: ReadPiece[] = [];
  for (const rows of segment(text)) {
    const draft = new NpcDraft(rows, opts, seen, hints);
    const c = draft.assemble();
    const limit = MAX_COPIES;
    if (draft.copies > limit) {
      hints.push({ code: 'too-many', line: c.line ?? 0, name: c.name, max: limit });
    }
    const n = Math.min(draft.copies, limit);
    if (n <= 1) {
      pieces.push(c);
      continue;
    }
    /* 複本共用原本名字的圖（立繪、差分） */
    const sharedImage = c.imageName ? c.imageName : c.name;
    for (const name of copyNames(c.name, n, opts.suffix)) {
      pieces.push({ ...structuredClone(c), name, imageName: sharedImage });
    }
  }
  return { pieces, hints, labels: [...seen.values()] };
}
