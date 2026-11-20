/**
 * 「速記・從劇本貼上」的讀法（不依賴 React）：NPC 的文字 → 一批棋子（規格 3.2）。
 *
 * 讀法照原作（shiki365／キャラクター一括メーカー 的 parse.v1.js，MIT）：一段（空行分隔）一個 NPC，第一行是名字，
 * 之後是「標籤 數值」。各作者寫劇本 NPC 資料的習慣不同，不是每份劇本一條規則，而是把共通的寫法收斂成同一種形狀：
 * 黏在一起的 `STR12`、各種括號、`成功率`、`%`、括號裡另一版的值 `12(60)`、`STR／DEX 60／50`、技能後面的傷害、
 * 「技能：」「武器：」「法術：」這類小標、PDF 複製時被空白拆開的字與斷到下一行的數字。
 * 本站另外補上繁中、簡中劇本的寫法（words.ts）與幾處改善（規格 5. D 項）。
 *
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
  HEADING_PREFIXES,
  LINE_TAGS,
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

/* =================== 型別 =================== */

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

/* =================== 詞表 =================== */

const ABILITIES = ABILITY_NAMES.map(([code]) => code);
/** PDF 被拆開的英文代號（「D EX」）可以接回去的 */
const JOINABLE = new Set([...ABILITIES, 'SAN', 'LUK', 'MOV', 'BLD']);

interface Canon {
  label: string;
  kind: CanonKind;
}
const CANON = new Map<string, Canon>();
for (const [code, ...aliases] of ABILITY_NAMES) {
  for (const a of [code, ...aliases]) CANON.set(wordKey(a), { label: code, kind: 'param' });
}
for (const [kind, label, ...aliases] of CANON_LABELS) {
  for (const a of [label, ...aliases]) CANON.set(wordKey(a), { label, kind });
}
const SKILLS = keySet(SKILL_NAMES);

/** 標籤去掉括號之後（「射擊(手槍)」→ 射擊） */
const baseKey = (label: string): string => wordKey(String(label).replace(/[(（].*$/, ''));

/**
 * 標籤 → 讀成的狀態／參數：整個寫法 → 去掉括號（「STR(力量)」）→ 兩個詞都指向同一個（「力量 STR」）。
 */
function canonOf(label: string): Canon | undefined {
  const exact = CANON.get(wordKey(label));
  if (exact) return exact;
  const base = CANON.get(baseKey(label));
  if (base) return base;
  const words = label.trim().split(/\s+/);
  if (words.length === 2) {
    const [a, b] = words.map((w) => CANON.get(wordKey(w)));
    if (a && b && a.label === b.label) return a;
  }
  return undefined;
}

const isKnown = (label: string): boolean => !!canonOf(label) || SKILLS.has(baseKey(label));

const SECTION_OF = new Map<string, SectionKind>();
for (const [kind, words] of Object.entries(SECTION_WORDS) as [SectionKind, readonly string[]][]) {
  for (const w of words) SECTION_OF.set(wordKey(w), kind);
}
const PALETTE_ENDINGS = PALETTE_SECTION_ENDINGS.map(wordKey);

function sectionKind(word: string): SectionKind | null {
  const k = wordKey(word);
  const hit = SECTION_OF.get(k);
  if (hit) return hit;
  return PALETTE_ENDINGS.some((e) => k.endsWith(e)) ? 'palette' : null;
}

const TAG_KIND = new Map<string, keyof typeof LINE_TAGS>();
for (const [kind, words] of Object.entries(LINE_TAGS) as [
  keyof typeof LINE_TAGS,
  readonly string[],
][]) {
  for (const w of words) TAG_KIND.set(wordKey(w), kind);
}

/* 由詞表組成的樣式 */
const RE_TAG_LINE = new RegExp(
  `^(${alternation(Object.values(LINE_TAGS).flat())})\\s*:\\s*(.+)$`,
  'i',
);
/** 同上，但比對原文（值照原文留下：全形標點不會被 NFKC 換成半形） */
const RE_TAG_LINE_RAW = new RegExp(
  `^(${alternation(Object.values(LINE_TAGS).flat())})\\s*[:：]\\s*(.+)$`,
  'i',
);
const RE_NAME_TAG = new RegExp(`^(?:${alternation(NAME_TAGS)})\\s*:`, 'i');
const RE_HEADING_PREFIX = new RegExp(`^(?:${alternation(HEADING_PREFIXES)})\\s*:\\s*`, 'i');
const RE_COUNT = new RegExp(
  `^(.*?)(?:\\s*[×✕✖*]\\s*|\\s+[xX]\\s*)(\\d{1,3})\\s*(?:${alternation(COUNTERS)})?\\s*(.*)$`,
);
const RE_DAMAGE_WORD = new RegExp(`^(?:${alternation(DAMAGE_WORDS)})$`, 'i');
const RE_DAMAGE_SUFFIX = new RegExp(`^(?:${alternation(DAMAGE_SUFFIXES)})`);
const RE_DAMAGE_MENTION = new RegExp(alternation(['ダメージ', '威力', '傷害', '伤害']));
const RE_ALT_DAMAGE = new RegExp(`^(?:${alternation(ALT_DAMAGE_WORDS)})\\s*(?=\\d*[dD]\\d+)`, 'i');
const RE_VALUE_WORDS = new RegExp(alternation(VALUE_WORDS), 'g');
const RE_SPELL = new RegExp(`^(?:${alternation(SPELL_WORDS)})`);
const NONE = keySet(NONE_WORDS);
const RE_STATUS_ENDING = new RegExp(`[${STATUS_ENDINGS.join('')}]$`);
const RE_7TH_SKILL = new RegExp(`^(?:${alternation(SKILLS_7TH_ONLY)})`);
/** 「ダメージ 1D10 ＋ DB」「傷害：1D6」的骰子式 */
const DAMAGE_IN_TEXT = new RegExp(
  `(?:${alternation(['ダメージ', '傷害', '伤害'])})\\s*[:：]?\\s*([+\\-]?\\d*[dD]\\d+(?:\\s*[+\\-]\\s*(?:\\d*[dD]\\d+|\\d+|DB))*)`,
  'i',
);

/** 名字後面括號裡的讀音（假名、拉丁字母、注音）：不是名字的一部分 */
const READING = /^[ぁ-ゟ゠-ヿ\s・=ー\-'.A-Za-zÀ-ɏㄅ-ㄯˊˇˋ˙]+$/;
/** 行首的記號（■●▼…） */
const MARKS = /^[■□◆◇●○▼▽★☆◎§・\s]+/;
/** 一行是說明的文字：有句號、6 個以上連續的平假名、或 12 個以上連續的漢字（中文的句子） */
const PROSE = /。|[ぁ-ゟ]{6,}|[㐀-鿿]{12,}/;

/* =================== 一行裡被保護的文字 =================== */

/** 被保護的文字換成一個私用區字元，後面的整理不會動到它（括號裡的標籤、附註） */
const PROTECT_BASE = 0xe100;
const PROTECTED_RE = /[-]/g;

class Protected {
  readonly pieces: { text: string; paren: boolean }[] = [];

  keep(text: string, paren: boolean): string {
    this.pieces.push({ text, paren });
    return String.fromCharCode(PROTECT_BASE + this.pieces.length - 1);
  }

  restore(s: string): string {
    return s.replace(PROTECTED_RE, (c) => this.pieces[c.charCodeAt(0) - PROTECT_BASE]?.text ?? c);
  }

  /** 這個詞是一整段括號的附註（「(絕命時發動)」）時回傳它的原文 */
  note(token: string): string | null {
    if (token.length !== 1) return null;
    const p = this.pieces[token.charCodeAt(0) - PROTECT_BASE];
    return p?.paren ? p.text : null;
  }
}

interface Prepared {
  text: string;
  prot: Protected;
}

/**
 * 一行的整理：NFKC，再把各作者不同的寫法收斂成「標籤 數值 , 標籤 數值」（以空白分隔、逗號分項）。
 * 依序：括號裡的標籤、屬於標籤的括號與附註先保護起來 → 拿掉「※2」→ PDF 拆開的英文代號與數字接回去 →
 * 括號裡另一版的值去掉 → 成對的標籤展開 → 「成功率」與 % 去掉 → 骰子式裡的空白去掉 → 分隔符號 → 冒號 →
 * 黏在一起的標籤與數字拆開。
 */
function prepareLine(line: string): Prepared {
  const prot = new Protected();
  let s = line.normalize('NFKC').replace(/±/g, '+');
  /* 括號裡的標籤：〈閃避〉《藝術:吉他》【咬】<踢擊>〔法術〕 */
  s = s.replace(
    /[〈《<【〔[「『]([^〈《<【〔[「『〉》>】〕\]」』]{1,40})[〉》>】〕\]」』]/g,
    (_all, t: string) => ` ${prot.keep(t.trim(), false)} `,
  );
  /* 屬於標籤的括號「藝術(魔術)」「射擊(手槍)」、附註「(絕命時發動)」：裡面有數字、空白、/ ( ) % . + - 以外的字 */
  s = s.replace(/\(([^()]*[^\d\s/()%.+-][^()]*)\)/g, (all) => prot.keep(all, true));
  /* 「99%※2」的註記 */
  s = s.replace(/※\s*\d+/g, ' ');
  /* PDF：「D EX」→ DEX */
  s = s.replace(/\b([A-Z])\s+([A-Z]{2})\b/g, (all, a: string, b: string) =>
    JOINABLE.has(a + b) ? a + b : all,
  );
  /* PDF：「7 5」→ 75 */
  s = s.replace(
    /(^|[^\d])(\d(?: \d)+)(?!\d)/g,
    (_all, pre: string, d: string) => pre + d.replace(/ /g, ''),
  );
  /* 括號裡另一版的值：12(60)、60(30/12)，與沒有收尾的「(1 0」 */
  s = s.replace(/\s*\(\s*[\d\s/]*\)?/g, ' ');
  /* 成對的標籤：STR/DEX 60/50、STR / CON | 80 / 65 */
  s = s.replace(
    /((?:[A-Za-z]{2,4}|[^\s\d,/:=|]{1,6})(?:\s*\/\s*(?:[A-Za-z]{2,4}|[^\s\d,/:=|]{1,6}))+)\s*[:=|]?\s*([+-]?\d+(?:\s*\/\s*[+-]?\d+)+)/g,
    (all, labels: string, values: string) => {
      const ls = labels.split(/\s*\/\s*/);
      const vs = values.split(/\s*\/\s*/);
      return ls.length === vs.length ? ls.map((l, i) => `${l} ${vs[i]}`).join(' , ') : all;
    },
  );
  s = s.replace(RE_VALUE_WORDS, ' ').replace(/%/g, ' ');
  /* 骰子式裡的空白：1D10 + DB → 1D10+DB */
  for (let i = 0; i < 3; i++) {
    s = s.replace(/(\d*[dD]\d+)\s*([+-])\s*(?=\d|DB\b|db\b)/g, '$1$2');
  }
  s = s.replace(/[、,|;]/g, ' , ');
  /* 數字之間的斜線是「目前值/最大值」，其他的斜線是分項 */
  s = s.replace(/\/(?!\s*[+-]?\d)/g, ' , ').replace(/([^\d\s])\s*\//g, '$1 , ');
  /* HP:12、HP=12 */
  s = s.replace(/([^\s\d:=])\s*[:=]\s*/g, '$1 ');
  /* STR12 → STR 12（1d6 不拆） */
  s = s.replace(/([^\s\d.+\-*/(,dD])(?=\d)/g, '$1 ');
  /* 99天文學 → 99 天文學 */
  s = s.replace(/(\d)(?=[^\s\d.dD+\-*/),])/g, '$1 ');
  return { text: s.replace(/\s+/g, ' ').trim(), prot };
}

/* =================== 一行裡的項目 =================== */

const NUM = /^[+-]?\d+(?:\.\d+)?(?:\/[+-]?\d+(?:\.\d+)?)?$/;
const DICE_START = /^[+-]?\d*[dD]\d+/;
const DICE = /^[+-]?(?:\d*[dD]\d+|\d+)(?:[+\-*/](?:\d*[dD]\d+|\d+|DB|db|\{DB\}))*/;

interface Damage {
  damage: string;
  note: string;
}

interface Item extends Damage {
  label: string;
  /** 數值（「DB 1d6」這種只有骰子的是 null） */
  value: number | null;
  /** 「55/99」的最大值 */
  max: number | null;
  /** 原本的寫法（「+1d4」「1d6」） */
  raw: string;
}

/** 骰子式＋後面的說明（「1d4傷害+束縛」→ 1d4、「束縛」） */
function damageFrom(token: string): Damage {
  const m = DICE.exec(token);
  const damage = m ? m[0] : '';
  const note = token
    .slice(damage.length)
    .replace(/^[+\s]+/, '')
    .replace(RE_DAMAGE_SUFFIX, '')
    .replace(/^[+\s]+/, '')
    /* 「1D6+DB（用菜刀時）」黏在一起的括號：只留裡面（本站修正，5. D 項） */
    .replace(/^\((.*)\)$/, '$1');
  return { damage, note };
}

/** 括號附註裡的傷害（「（傷害 1D6、對象隨機）」「(1D3+DB)」）；不是傷害時 null（本站新增，5. D 項） */
function damageInNote(note: string): Damage | null {
  const inner = note.replace(/^\(|\)$/g, '').trim();
  const p = prepareLine(inner);
  const tokens = p.text.split(' ').filter(Boolean);
  let k = 0;
  if (tokens[k] && RE_DAMAGE_WORD.test(p.prot.restore(tokens[k]))) k++;
  if (!tokens[k] || !DICE_START.test(tokens[k])) return null;
  const d = damageFrom(p.prot.restore(tokens[k]));
  const rest = p.prot
    .restore(tokens.slice(k + 1).join(' '))
    .replace(/^[,\s]+/, '')
    .replace(/\s*,\s*/g, '、')
    .trim();
  return { damage: d.damage, note: [d.note, rest].filter(Boolean).join(' ') };
}

interface ItemsResult {
  items: Item[];
  /** 沒有讀成項目的文字（有數字的會標成讀不出） */
  leftover: string[];
  /** 遇到「法術：」：後面是說明 */
  stopped: boolean;
}

/** 整理過的一行 → 項目 */
function readItems({ text, prot }: Prepared): ItemsResult {
  const tokens = text.split(' ').filter(Boolean);
  const items: Item[] = [];
  const leftover: string[] = [];
  let label: string[] = [];
  let last: Item | null = null;
  const flush = () => {
    if (label.length) leftover.push(prot.restore(label.join(' ')));
    label = [];
  };
  /** 數值後面的傷害：1d6／傷害 1d6／1d6 的傷害／(附註) 1d4 傷害+束縛；回傳下一個要讀的位置 */
  const damageAfter = (i: number, item: Item): number => {
    let k = i;
    const note = tokens[k] ? prot.note(tokens[k]) : null;
    if (note !== null) {
      const inNote = damageInNote(note);
      if (inNote) {
        item.damage = inNote.damage;
        item.note = inNote.note;
        return k + 1;
      }
      k++;
    }
    if (
      tokens[k] &&
      RE_DAMAGE_WORD.test(prot.restore(tokens[k])) &&
      tokens[k + 1] &&
      DICE_START.test(tokens[k + 1])
    ) {
      k++;
    }
    if (!tokens[k] || !DICE_START.test(tokens[k])) return i;
    Object.assign(item, damageFrom(prot.restore(tokens[k])));
    k++;
    const next = tokens[k] ? prot.restore(tokens[k]) : '';
    if (RE_DAMAGE_SUFFIX.test(next)) {
      const rest = next.replace(RE_DAMAGE_SUFFIX, '').replace(/^[+\s]+/, '');
      if (rest) item.note = item.note ? `${item.note} ${rest}` : rest;
      k++;
    }
    return k;
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const word = prot.restore(t);
    if (t === ',' || t === '/') {
      flush();
      continue;
    }
    if (prot.note(t) !== null && !label.length) continue;
    /* 法術與它的說明：之後不讀 */
    if (RE_SPELL.test(word) && !(tokens[i + 1] && NUM.test(tokens[i + 1]))) {
      flush();
      leftover.push(prot.restore(tokens.slice(i).join(' ')));
      return { items, leftover, stopped: true };
    }
    /* 「護甲 無」 */
    if (NONE.has(wordKey(word)) && label.length) {
      label = [];
      continue;
    }
    if (label.length && NUM.test(t)) {
      const [a, b] = t.split('/');
      const item: Item = {
        label: prot.restore(label.join(' ')).trim(),
        value: Number.parseFloat(a),
        max: b == null ? null : Number.parseFloat(b),
        raw: a,
        damage: '',
        note: '',
      };
      label = [];
      items.push(item);
      last = item;
      i = damageAfter(i + 1, item) - 1;
      continue;
    }
    if (DICE_START.test(t)) {
      const damageWord = label.length === 1 && RE_DAMAGE_WORD.test(prot.restore(label[0]));
      /* 「DB 1d6」：標籤＋骰子 */
      if (label.length && !damageWord) {
        items.push({
          label: prot.restore(label.join(' ')).trim(),
          value: null,
          max: null,
          raw: word,
          damage: '',
          note: '',
        });
        label = [];
        continue;
      }
      /* 「傷害 1d6」「1d6 的傷害」接在前一個技能後面 */
      if (last && !last.damage) {
        label = [];
        i = damageAfter(i, last) - 1;
        continue;
      }
    }
    label.push(t);
  }
  flush();
  return { items, leftover, stopped: false };
}

/* =================== 一段的行 =================== */

const COMMAND_START = /^(?:s?(?:CCB?|RESB?|CBRB?)\b|s?\d*[dD]\d+|choice|[:@])/i;
const COMMAND_SPLIT = /\s+(?=s?(?:CCB?|RESB?|CBRB?)\s*(?:<=|\()|s?\d*[dD]\d+\s*[【[(])/i;
const hasDigit = (t: string): boolean => /\d/.test(t.normalize('NFKC'));
const opens = (t: string): number => (t.match(/[〈《<【〔[「『(（＜]/g) ?? []).length;
const closes = (t: string): number => (t.match(/[〉》>】〕\]」』)）＞]/g) ?? []).length;

interface Row {
  line: number;
  text: string;
}
interface JoinedRow {
  line: number;
  text: string;
  raw: string[];
}

/** 小標：「【技能】」「技能：〈閃避〉40」「武器：」→ { kind, rest }；「戰鬥 60」是技能，不是小標 */
function sectionOf(line: string): { kind: SectionKind; rest: string } | null {
  const s = line.replace(MARKS, '');
  let m = /^[〈《<【〔[「『(]([^〉》>】〕\]」』)]{1,20})[〉》>】〕\]」』)]\s*(.*)$/.exec(s);
  if (m) {
    const kind = sectionKind(m[1].replace(/[:\s]+$/, ''));
    return kind ? { kind, rest: m[2] } : null;
  }
  m = /^([^\s:]{1,14}?)\s*(?::\s*|\s+|$)(.*)$/.exec(s);
  const kind = m ? sectionKind(m[1]) : null;
  if (!m || !kind || /^[+-]?\d/.test(m[2])) return null;
  return { kind, rest: m[2] };
}

/** PDF 複製時一個項目被斷到下一行：接回去 */
function joinLines(rows: readonly Row[]): JoinedRow[] {
  const out: JoinedRow[] = [];
  for (const row of rows) {
    const prev = out[out.length - 1];
    const t = row.text.trim();
    if (prev) {
      const p = prev.text;
      /* 「、肩書き」、斷開的假名（スタ／ン）、跨行的括號（〈こぶし／〉80） */
      const short = t.length <= 2 && /^[ぁ-ヿ]+$/.test(t) && /[ぁ-ヿ]$/.test(p);
      if (/^[、,，]/.test(t) || short || (opens(p) > closes(p) && closes(t) > opens(t))) {
        prev.text = p + t;
        prev.raw.push(row.text);
        continue;
      }
      /* 「〈圖書館〉」＋下一行的「80」 */
      if (
        /[^\d\s%。]$/.test(p) &&
        !PROSE.test(p) &&
        /^\d[\d ]*(?:[%％(（\s]|$)/.test(t) &&
        !sectionOf(p.normalize('NFKC'))
      ) {
        prev.text = `${p} ${t}`;
        prev.raw.push(row.text);
        continue;
      }
    }
    out.push({ line: row.line, text: t, raw: [row.text] });
  }
  return out;
}

/** 一段的第一行：■名字(讀音)、頭銜／【名字】／名字 ×3／頭銜─名字(讀音) → 名字、個數、其他的文字 */
function headingOf(line: string): { name: string; count: number; extra: string[] } {
  let s = line.replace(MARKS, '').trim().replace(RE_HEADING_PREFIX, '');
  const extra: string[] = [];
  let m = /^[【《〈<[〔「『]([^】》〉>\]〕」』]+)[】》〉>\]〕」』]\s*(.*)$/.exec(s);
  if (m) {
    s = m[1].trim();
    extra.push(m[2]);
  }
  let count = 1;
  m = RE_COUNT.exec(s);
  if (m?.[1].trim()) {
    s = m[1].trim();
    count = Number.parseInt(m[2], 10);
    extra.push(m[3]);
  }
  m = /^(.+?)\s*[─—―]+\s*(.+)$/.exec(s) ?? /^(.+?)\s+-\s+(.+)$/.exec(s);
  if (m) {
    const reading = /\(([^()]*)\)/.exec(m[2]);
    if (reading && READING.test(reading[1])) {
      extra.push(m[1]);
      s = m[2];
    } else {
      extra.push(m[2]);
      s = m[1];
    }
  }
  m = /^([^、,]+?)\s*[、,]\s*(.+)$/.exec(s);
  if (m) {
    s = m[1];
    extra.push(m[2]);
  }
  /* (讀音)、(34 歲)、(139) 與後面的文字 */
  for (let i = 0; i < 3; i++) {
    m = /^(.+?)\s*\(([^()]*)\)\s*(.*)$/.exec(s);
    if (!m || !(READING.test(m[2]) || /\d/.test(m[2]))) break;
    s = m[1];
    extra.push(`(${m[2]})`, m[3]);
  }
  return { name: s.trim(), count, extra: extra.map((t) => t.trim()).filter(Boolean) };
}

/** 7 版：括號裡有另一版的值「(30/12)」、能力值大多是 5 的倍數而且大於 20、用到 7 版才有的技能 */
function editionOf(text: string, abilities: readonly number[], skills: readonly Skill[]): 6 | 7 {
  if (/%\s*[(（]\s*\d+\s*[/／]\s*\d+/.test(text.normalize('NFKC'))) return 7;
  if (
    abilities.length >= 3 &&
    abilities.filter((v) => v > 20).length >= abilities.length * 0.75 &&
    abilities.every((v) => v % 5 === 0)
  ) {
    return 7;
  }
  if (skills.some((s) => RE_7TH_SKILL.test(s.label))) return 7;
  return 6;
}

/** DB 的值一律帶正負號（{DB} 接在骰子式後面才成立）：0 → +0、1d4 → +1d4 */
const signedDb = (v: string): string => {
  const t = String(v).trim();
  return /^[+-]/.test(t) ? t : t === '0' ? '+0' : `+${t}`;
};

interface Skill extends Damage {
  label: string;
  value: number;
  alts: Damage[];
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
  const m = /【([^】]+)】/.exec(command);
  if (m) return m[1];
  return command.trim().split(/\s+/).slice(1).join(' ');
}

/* =================== 讀一段 =================== */

class BlockReader {
  readonly piece: ReadPiece;
  count = 1;
  private readonly skills: Skill[] = [];
  /** 劇本裡寫好的指令（照原文放進聊天面板） */
  private readonly explicit: string[] = [];
  private readonly memo: string[] = [];
  private readonly prose: string[] = [];
  /** 「武器：」下面的武器 → 傷害 */
  private readonly weaponDamage = new Map<string, string>();
  private section: SectionKind = 'stats';
  private weapon = '';
  private lastSkill: Skill | null = null;
  /** 讀到的先攻（沒有時用 DEX） */
  private initiative: number | null = null;
  private strSeen = 0;
  /** 這一行的原文（沒有拿掉小標時）：放進備註的文字用原文（本站修正，5. D 項） */
  private original: string | null = null;

  constructor(
    private readonly rows: readonly Row[],
    private readonly o: MemoOptions,
    private readonly labelsOut: Map<string, LabelInfo>,
    private readonly hints: MemoHint[],
  ) {
    this.piece = { ...newPiece({ line: rows[0].line, from: 'text' }), source: [], edition: 6 };
  }

  private note(l: JoinedRow, state: SourceState, read: ReadChip[] = []): void {
    this.piece.source.push({ line: l.line, text: l.raw.join('\n'), state, read });
  }

  read(): ReadPiece {
    joinLines(this.rows).forEach((l, i) => {
      this.readLine(l, i === 0);
    });
    return this.finish();
  }

  private readLine(l: JoinedRow, first: boolean): void {
    const nfkc = l.text.normalize('NFKC');
    if (first && this.nameLine(l, nfkc)) return;
    if (this.tagLine(l, nfkc)) return;
    if (/^https?:\/\/\S+$/.test(nfkc)) {
      this.piece.externalUrl = nfkc;
      this.note(l, 'read', [{ t: 'url' }]);
      return;
    }
    let text = nfkc;
    this.original = l.text;
    const sec = sectionOf(nfkc);
    if (sec) {
      this.original = null;
      this.section = sec.kind;
      this.weapon = '';
      if (!sec.rest) {
        this.note(l, 'section');
        return;
      }
      text = sec.rest;
    }
    if (this.section === 'memo') {
      this.memo.push(this.kept(text));
      this.note(l, 'read', [{ t: 'memo' }]);
      return;
    }
    if (this.section === 'text' || /^[#※]/.test(text)) {
      this.prose.push(this.kept(text));
      this.note(l, 'skip');
      return;
    }
    const last = this.lastSkill;
    const damageLine =
      DICE_START.test(text) &&
      RE_DAMAGE_MENTION.test(text) &&
      !!last &&
      !last.damage &&
      !/【/.test(text);
    if (
      this.section === 'palette' ||
      (!damageLine && (COMMAND_START.test(text) || /<=/.test(text)))
    ) {
      this.commandLine(l, text);
      return;
    }
    if (last && (damageLine || RE_ALT_DAMAGE.test(text))) {
      this.damageLine(l, text, last, !damageLine);
      return;
    }
    /* 武器技能下面的「(傷害 1d10／裝彈數 8／…)」 */
    if (/^\s*[(（][^)）]*[)）]\s*$/.test(text) && this.section !== 'weapons') {
      const m = DAMAGE_IN_TEXT.exec(text);
      if (m && last && !last.damage) {
        last.damage = m[1].replace(/\s+/g, '');
        this.note(l, 'read', [{ t: 'damage', label: last.label, damage: last.damage }]);
      } else this.note(l, 'skip');
      return;
    }
    if (this.section === 'weapons' && !/%|％/.test(l.text)) {
      /* 武器清單後面的說明文字不是武器的名字（本站修正，5. D 項） */
      if (PROSE.test(text)) {
        this.prose.push(this.kept(text));
        this.note(l, 'skip');
      } else this.weaponLine(l, text);
      return;
    }
    this.dataLine(l, text);
  }

  /** 第一行：名字（第一個詞是能力值、技能，或是小標時不是名字） */
  private nameLine(l: JoinedRow, nfkc: string): boolean {
    const sec = sectionOf(nfkc);
    const p = prepareLine(nfkc);
    const firstWord = p.prot.restore(p.text.split(' ')[0] ?? '');
    const statFirst = !RE_NAME_TAG.test(nfkc) && isKnown(firstWord);
    if (!sec && !statFirst) {
      const h = headingOf(nfkc);
      this.piece.name = h.name;
      this.count = h.count;
      if (this.o.proseToMemo) this.memo.push(...h.extra);
      this.note(l, 'name', [{ t: 'name', name: h.name, count: h.count }]);
      return true;
    }
    this.hints.push({ code: 'no-name', line: l.line });
    return false;
  }

  /** 備註、說明的文字：有原文時用原文 */
  private kept(text: string): string {
    return this.original ?? text;
  }

  /** 「角色備註：」「立繪：」「網址：」「聊天面板：」 */
  private tagLine(l: JoinedRow, nfkc: string): boolean {
    const m = RE_TAG_LINE.exec(nfkc);
    if (!m) return false;
    const kind = TAG_KIND.get(wordKey(m[1]));
    const v = m[2].trim();
    const raw = RE_TAG_LINE_RAW.exec(l.text);
    if (kind === 'memo') this.memo.push(raw ? raw[2].trim() : v);
    else if (kind === 'image') this.piece.imageName = v;
    else if (kind === 'url') this.piece.externalUrl = v;
    else this.explicit.push(v);
    this.note(l, 'read', [{ t: 'tag', tag: m[1], value: v }]);
    return true;
  }

  /** 劇本寫好的指令：「CCB<=80 觸手」「sCCB<=60 【鬥毆】 sCCB<=50 【閃避】 1d3 【鬥毆】」 */
  private commandLine(l: JoinedRow, text: string): void {
    const cmds = text
      .split(COMMAND_SPLIT)
      .map((t) => t.trim())
      .filter(Boolean);
    this.explicit.push(...cmds);
    this.note(
      l,
      'read',
      cmds.map((command) => ({ t: 'command', command })),
    );
  }

  /** 自己一行的傷害（「1d6 的傷害」），或另一種傷害（「或 1D6+DB（用菜刀時）」） */
  private damageLine(l: JoinedRow, text: string, last: Skill, alt: boolean): void {
    const p = prepareLine(text.replace(RE_ALT_DAMAGE, ''));
    const [tok, ...rest] = p.text.split(' ');
    const item = damageFrom(p.prot.restore(tok));
    /* 「或1D6+DB（用菜刀時）」：括號是什麼時候用 */
    if (!item.note) {
      const note = rest.map((t) => p.prot.note(t)).find((x) => x !== null);
      if (note) item.note = note.replace(/^\(|\)$/g, '');
    }
    if (alt) last.alts.push(item);
    else Object.assign(last, item);
    this.note(l, 'read', [{ t: 'damage', label: last.label, damage: item.damage }]);
  }

  /** 「武器：」下面：武器的名字、它的傷害 */
  private weaponLine(l: JoinedRow, text: string): void {
    const m = DAMAGE_IN_TEXT.exec(text);
    if (m && this.weapon) {
      const damage = m[1].replace(/\s+/g, '');
      this.weaponDamage.set(baseKey(this.weapon), damage);
      this.note(l, 'read', [{ t: 'damage', label: this.weapon, damage }]);
    } else if (!m) {
      this.weapon = text.replace(/[〈《<【〔「『〉》>】〕」』]/g, '').replace(/\s+/g, '');
      this.note(l, 'read', [{ t: 'weapon', name: this.weapon }]);
    } else this.note(l, 'skip');
  }

  /** 「標籤 數值」的行 */
  private dataLine(l: JoinedRow, text: string): void {
    const p = prepareLine(text);
    const firstWord = p.prot.restore(p.text.split(' ')[0] ?? '');
    if (PROSE.test(p.text.replace(PROTECTED_RE, '')) && !canonOf(firstWord)) {
      this.prose.push(this.kept(text));
      this.note(l, 'skip');
      return;
    }
    const { items, leftover, stopped } = readItems(p);
    /* 法術後面是它的說明，不是沒讀到的資料 */
    if (stopped) {
      const tail = leftover.pop();
      if (tail) this.prose.push(tail);
    }
    const read: ReadChip[] = [];
    for (const it of items) read.push(this.addItem(it));
    const unread = leftover.filter(hasDigit);
    const state: SourceState =
      !items.length && !unread.length
        ? 'skip'
        : unread.length
          ? items.length
            ? 'partial'
            : 'unread'
          : 'read';
    this.note(l, state, [...read, ...unread.map((t) => ({ t: 'miss' as const, text: t }))]);
    if (!items.length && !unread.length) this.prose.push(this.kept(text));
  }

  private addItem(it: Item): ReadChip {
    const c = this.piece;
    const k = wordKey(it.label);
    const known = canonOf(it.label);
    const auto: LabelKind | 'initiative' = known
      ? known.kind
      : it.value == null
        ? 'param'
        : it.max != null
          ? 'status'
          : RE_STATUS_ENDING.test(it.label)
            ? 'status'
            : 'skill';
    const kind: LabelKind | 'initiative' = (this.o.labels[k] as LabelKind | undefined) ?? auto;
    /* 參數的參照是 {標籤}：標籤裡的半形冒號換成全形 */
    const label = known ? known.label : it.label.replace(/:/g, '：');
    const entry = this.labelsOut.get(k) ?? {
      label,
      written: it.label,
      key: k,
      auto,
      kind,
      known: !!known || SKILLS.has(baseKey(it.label)),
      count: 0,
    };
    entry.count++;
    this.labelsOut.set(k, entry);
    if (kind === 'ignore') return { t: 'ignored', label };
    if (kind === 'initiative') {
      this.initiative = it.value;
      return { t: 'initiative', value: it.value ?? 0 };
    }
    if (label === 'STR') this.strSeen++;
    if (kind === 'status') {
      const value = it.value ?? 0;
      const s: PieceStatus = { label, value, max: it.max ?? value };
      const at = c.status.findIndex((x) => x.label === label);
      if (at >= 0) c.status[at] = s;
      else c.status.push(s);
      return { t: 'status', ...s };
    }
    if (kind === 'param') {
      let value = it.value == null || /^[+-]/.test(it.raw) ? it.raw : String(it.value);
      if (label === 'DB') value = signedDb(value);
      const at = c.params.findIndex((x) => x.label === label);
      if (at >= 0) c.params[at].value = value;
      else c.params.push({ label, value });
      return { t: 'param', label, value };
    }
    const s: Skill = { label, value: it.value ?? 0, damage: it.damage, note: it.note, alts: [] };
    this.skills.push(s);
    this.lastSkill = s;
    return { t: 'skill', label, value: s.value, damage: s.damage };
  }

  private finish(): ReadPiece {
    const c = this.piece;
    /* 另外列在「武器：」的傷害接到同名的技能 */
    for (const s of this.skills) {
      if (!s.damage) s.damage = this.weaponDamage.get(baseKey(s.label)) ?? '';
    }
    const dex = c.params.find((p) => p.label === 'DEX');
    c.initiative = this.initiative ?? (dex ? readNumber(dex.value) : null) ?? 0;
    const abilities = c.params
      .filter((p) => ABILITIES.includes(p.label))
      .map((p) => readNumber(p.value))
      .filter((v): v is number => v != null);
    c.edition = editionOf(this.rows.map((r) => r.text).join('\n'), abilities, this.skills);
    c.commands = buildPalette(
      {
        edition: c.edition,
        status: c.status,
        params: c.params,
        skills: this.skills,
        explicit: this.explicit,
      },
      this.o,
    ).join('\n');
    c.memo = [...this.memo, ...(this.o.proseToMemo ? this.prose : [])].join('\n');

    const who: Who = { name: c.name, line: c.line ?? 0 };
    const missed = c.source
      .filter((s) => s.state === 'partial' || s.state === 'unread')
      .map((s) => s.line);
    if (missed.length) this.hints.push({ code: 'unread', who, lines: missed.slice(0, 4) });
    if (this.strSeen > 1) this.hints.push({ code: 'joined', who, count: this.strSeen });
    if (
      !c.status.length &&
      !c.params.length &&
      !this.skills.length &&
      !this.explicit.length &&
      c.source.length > 1
    ) {
      this.hints.push({ code: 'nothing', who });
    }
    return c;
  }
}

/* =================== 聊天面板 =================== */

interface PaletteInput {
  edition: 6 | 7;
  status: readonly PieceStatus[];
  /** 不寫成判定時技能會加進這裡 */
  params: PieceParam[];
  skills: readonly Skill[];
  explicit: readonly string[];
}

/**
 * 讀到的資料 → 聊天面板的行（順序照本站 coc-npc：理智檢定 → 能力值 → 技能 → 指令；規格 3.3）：
 * 1. 有 SAN 時「判定{SAN} 理智檢定」（劇本寫好的指令裡已經有 SAN 的檢定時不加）；
 * 2. 勾「能力值也寫成判定」時 STR～EDU（6 版的 CoC 判定 ×5）；
 * 3. 技能依讀到的順序，每個接自己的傷害（`+DB` 換成參照 `{DB}`，有 DB 參數時）；
 * 4. 劇本寫好的指令照原文（同名的技能不重複寫）。
 * 不寫成判定時技能變成參數（傷害照樣寫）。
 */
function buildPalette(r: PaletteInput, o: MemoOptions): string[] {
  const prefix = rollPrefix(o.roll, o.secretRoll, r.edition);
  const hasDb = r.params.some((p) => p.label === 'DB');
  const dmg = (d: string) => (hasDb ? d.replace(/\+\s*DB\b/gi, '{DB}') : d);
  const written = new Set(r.explicit.map((t) => wordKey(commandLabel(t))).filter(Boolean));
  const lines: string[] = [];
  if (
    prefix &&
    r.status.some((s) => s.label === 'SAN') &&
    !r.explicit.some((t) => /SAN|正気度|理智|理性/i.test(t))
  ) {
    lines.push(`${prefix}{SAN} ${OUT.sanCheck}`);
  }
  if (prefix && o.abilityChecks) {
    const coc = /CCB?<=$/.test(prefix);
    for (const code of ABILITIES) {
      const p = r.params.find((x) => x.label === code);
      const v = p ? readNumber(p.value) : null;
      if (v == null || written.has(wordKey(code))) continue;
      lines.push(`${prefix}${coc && r.edition === 6 ? v * 5 : v} ${code}`);
    }
  }
  for (const s of r.skills) {
    if (written.has(wordKey(s.label))) continue;
    if (prefix) lines.push(`${prefix}${s.value} ${s.label}`);
    else r.params.push({ label: s.label, value: String(s.value) });
    if (s.damage) lines.push(`${dmg(s.damage)} ${OUT.damageLabel(s.label, s.note)}`);
    for (const a of s.alts) lines.push(`${dmg(a.damage)} ${OUT.damageLabel(s.label, a.note)}`);
  }
  lines.push(...r.explicit);
  return lines;
}

/* =================== 整份 =================== */

/** ×N 的第 i 個（0 起算）的字尾：A、B、C…；26 個以上或選了數字時 1、2、3… */
const copySuffix = (i: number, n: number, style: SuffixStyle): string =>
  style === 'number' || n > 26 ? String(i + 1) : String.fromCharCode(65 + i);

/** 讀「速記・從劇本貼上」的文字 */
export function parseMemo(text: string, opts: MemoOptions): MemoResult {
  const hints: MemoHint[] = [];
  const pieces: ReadPiece[] = [];
  const labels = new Map<string, LabelInfo>();
  const blocks: Row[][] = [];
  let rows: Row[] = [];
  String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .forEach((raw, i) => {
      if (raw.trim()) rows.push({ line: i + 1, text: raw });
      else if (rows.length) {
        blocks.push(rows);
        rows = [];
      }
    });
  if (rows.length) blocks.push(rows);
  for (const b of blocks) {
    const reader = new BlockReader(b, opts, labels, hints);
    const c = reader.read();
    let n = reader.count;
    if (n > MAX_COPIES) {
      hints.push({ code: 'too-many', line: c.line ?? 0, name: c.name, max: MAX_COPIES });
      n = MAX_COPIES;
    }
    if (n <= 1) {
      pieces.push(c);
      continue;
    }
    /* 複本共用原本名字的圖（立繪、差分） */
    for (let i = 0; i < n; i++) {
      const copy = structuredClone(c);
      copy.name = c.name + (/[A-Za-z0-9]$/.test(c.name) ? ' ' : '') + copySuffix(i, n, opts.suffix);
      copy.imageName = c.imageName || c.name;
      pieces.push(copy);
    }
  }
  return { pieces, hints, labels: [...labels.values()] };
}
