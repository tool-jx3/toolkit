/**
 * 文字 → 劇本文字的清單（不依賴 React；規格 3.2）。演算法參考原作 parse.v1.js（MIT）改寫。
 *
 * - 台本（script）：一句台詞一則。`艾莉絲「你好」`、登錄的名字時 `艾莉絲：你好`，標題一律是**登錄的名稱**
 *   （CCFOLIA 送出劇本文字時以標題當名稱）。
 * - 依小標分段（heading）：`■圖書館`、`【圖書館】`、`## 圖書館` 這類小標各一則，標題＝小標、本文＝下面的文字。
 * - 名字可以帶差分：`艾莉絲（笑臉）「…」`、`艾莉絲@笑臉「…」`。先比整個名字（名字本身帶括號的也認得）。
 * - 引號一律讀「」『』"…" “…”（主控裁定）；`名：「台詞」` 的冒號去掉（D1）。
 */
import type { Entry, EntryKind, Opts, Speaker } from './model';

/** 解析結果的一則（存檔的欄位以外，多了台本的寫法與提示用的旗標） */
export interface ParsedEntry extends Entry {
  /** 台本上的寫法（台詞、未登錄時） */
  name: string;
  /** 差分沒有登錄 */
  faceMissing: boolean;
  /** 小標下面沒有本文（本文＝小標） */
  bare?: boolean;
}

/** 引號台詞：名＋（空白）＋引號開頭 … 引號結尾 */
const QUOTE = /^\s*([^\s「」『』"“”][^「」『』"“”]*?)\s*([「『"“][\s\S]*[」』"”])\s*$/;
/** 冒號台詞：名＋（空白）＋冒號＋台詞 */
const COLON = /^\s*([^\s：:「」『』][^：:「」『』]*?)\s*[：:]\s*([\s\S]+?)\s*$/;
/** 名字裡有句讀＝是敘述，不是名字 */
const PROSE = /[。、，．！？!?…]/;
/** 名（差分）、名(差分)、名@差分、名＠差分 */
const FACE = /^(.+?)\s*(?:[（(]\s*([^（）()]+?)\s*[）)]|[@＠]\s*(\S+))$/;
/** 小標：# 開頭、記號開頭、只有【】 */
const HEADINGS = [
  /^\s*#{1,6}\s*(.+?)\s*#*\s*$/,
  /^\s*[■□◆◇●○▼▽★☆◎]\s*(.+?)\s*$/,
  /^\s*【(.+?)】\s*$/,
];
/** 名字最多幾個字 */
export const MAX_NAME = 40;
/** 引號沒關上時最多再接幾行 */
export const MAX_JOIN = 20;
/** 拉丁引號前超過這麼多個詞就是句子 */
export const MAX_NAME_WORDS = 4;
/** 引號台詞的名結尾的冒號（D1） */
const TRAILING_COLON = /\s*[：:]+$/;

/** 名稱的比對用：NFKC、連續空白換成一個、去頭尾 */
export const key = (s: unknown): string =>
  String(s ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();

/** 說話者的名稱與其他寫法（key） */
export function aliasesOf(speaker: Pick<Speaker, 'name' | 'aliases'>): string[] {
  return [speaker.name, ...String(speaker.aliases || '').split(/[,、，]/)].map(key).filter(Boolean);
}

export type SpeakerIndex = Map<string, Speaker>;

/** key → 說話者（同一個 key 先登錄的優先） */
export function speakerIndex(speakers: readonly Speaker[]): SpeakerIndex {
  const map: SpeakerIndex = new Map();
  for (const sp of speakers) for (const a of aliasesOf(sp)) if (!map.has(a)) map.set(a, sp);
  return map;
}

export interface Resolved {
  speaker: Speaker;
  /** 差分名稱（登錄的寫法；沒登錄時照寫法） */
  face: string;
  faceMissing: boolean;
}

/** 台本上的寫法 → 說話者與差分（認不出時 null） */
export function resolveName(name: string, index: SpeakerIndex): Resolved | null {
  const whole = index.get(key(name));
  if (whole) return { speaker: whole, face: '', faceMissing: false };
  const m = FACE.exec(String(name ?? '').trim());
  if (!m) return null;
  const speaker = index.get(key(m[1]));
  if (!speaker) return null;
  const written = (m[2] ?? m[3] ?? '').trim();
  const face = speaker.faces.find((f) => key(f.label) === key(written));
  return { speaker, face: face ? face.label : written, faceMissing: !face };
}

const count = (s: string, re: RegExp): number => s.match(re)?.length ?? 0;

/** 還沒關上的引號數（直引號沒有方向，奇數個就是有一個沒關） */
export function openQuotes(s: string): number {
  return (
    count(s, /[「『]/g) -
    count(s, /[」』]/g) +
    count(s, /“/g) -
    count(s, /”/g) +
    (count(s, /"/g) % 2)
  );
}

interface Unit {
  text: string;
  line: number;
}

const lines = (script: string): string[] =>
  String(script ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n');

/** 台本切成一則一則：一行一則（引號沒關上時接下一行）或空行分隔的一段一則 */
export function splitUnits(script: string, unit: Opts['unit']): Unit[] {
  const out: Unit[] = [];
  let cur: Unit | null = null;
  let joined = 0;
  lines(script).forEach((raw, i) => {
    const text = raw.replace(/\s+$/, '');
    const cont =
      cur !== null &&
      (unit === 'block' ? text.trim() !== '' : openQuotes(cur.text) > 0 && joined < MAX_JOIN);
    if (cur && cont) {
      cur.text += `\n${text}`;
      joined++;
      return;
    }
    if (!text.trim()) {
      cur = null;
      return;
    }
    cur = { text, line: i + 1 };
    joined = 0;
    out.push(cur);
  });
  return out;
}

type Split = { name: string; quote: string } | { name: string; text: string };

/** 一則 → 說話者的寫法與台詞（不是台詞時 null） */
export function splitSpeaker(src: string, style: Opts['style'], index: SpeakerIndex): Split | null {
  if (style !== 'colon') {
    const m = QUOTE.exec(src);
    if (m) {
      const name = m[1].trim().replace(TRAILING_COLON, '');
      const wordy = /^["“]/.test(m[2]) && name.split(/\s+/).length > MAX_NAME_WORDS;
      if (name && m[1].length <= MAX_NAME && !PROSE.test(name) && !wordy) {
        return { name, quote: m[2] };
      }
    }
  }
  if (style !== 'quote') {
    const m = COLON.exec(src);
    if (
      m &&
      m[1].length <= MAX_NAME &&
      !PROSE.test(m[1]) &&
      (style === 'colon' || resolveName(m[1], index))
    ) {
      return { name: m[1].trim(), text: m[2] };
    }
  }
  return null;
}

function entry(
  kind: EntryKind,
  title: string,
  text: string,
  hit: Resolved | null,
  line: number,
  name = '',
): ParsedEntry {
  return {
    kind,
    title,
    text,
    speakerId: hit ? hit.speaker.id : null,
    face: hit ? hit.face : '',
    line,
    titleCustom: false,
    image: 'auto',
    name,
    faceMissing: !!hit?.faceMissing,
  };
}

function parseScript(script: string, index: SpeakerIndex, o: Opts): ParsedEntry[] {
  const out: ParsedEntry[] = [];
  for (const u of splitUnits(script, o.unit)) {
    const found = splitSpeaker(u.text, o.style, index);
    if (found) {
      const text =
        'quote' in found ? (o.keepQuotes ? found.quote : found.quote.slice(1, -1)) : found.text;
      const hit = resolveName(found.name, index);
      out.push(
        hit
          ? entry('speaker', hit.speaker.name, text, hit, u.line, found.name)
          : entry('unknown', found.name, text, null, u.line, found.name),
      );
    } else if (o.narration === 'include') {
      out.push(
        entry('narration', o.narratorName, u.text, resolveName(o.narratorName, index), u.line),
      );
    }
  }
  return out;
}

/** 小標的文字（不是小標時 null） */
export function headingOf(line: string): string | null {
  for (const re of HEADINGS) {
    const m = re.exec(line);
    if (m?.[1].trim()) return m[1].trim();
  }
  return null;
}

function parseHeadings(script: string, index: SpeakerIndex, o: Opts): ParsedEntry[] {
  const out: ParsedEntry[] = [];
  let cur: { title: string | null; body: string[]; line: number; hit: Resolved | null } | null =
    null;
  const flush = () => {
    if (!cur) return;
    const text = cur.body.join('\n').replace(/^\s*\n|\s+$/g, '');
    if (cur.title !== null || text) {
      const isHeading = cur.title !== null;
      const e = entry(
        isHeading ? 'heading' : 'narration',
        isHeading ? (cur.title as string) : o.narratorName,
        /* 本文空白時本文＝小標（CCFOLIA 本文空白會改送聊天欄裡的文字） */
        text || (cur.title ?? ''),
        cur.hit,
        cur.line,
      );
      e.bare = !text;
      out.push(e);
    }
    cur = null;
  };
  lines(script).forEach((raw, i) => {
    const h = headingOf(raw);
    if (h !== null) {
      flush();
      const hit = resolveName(h, index);
      cur = { title: hit ? hit.speaker.name : h, body: [], line: i + 1, hit };
      return;
    }
    if (!cur) {
      if (!raw.trim()) return;
      cur = { title: null, body: [], line: i + 1, hit: resolveName(o.narratorName, index) };
    }
    cur.body.push(raw.replace(/\s+$/, ''));
  });
  flush();
  return out;
}

/** 文字 → 清單 */
export function parseScenario(
  script: string,
  speakers: readonly Speaker[],
  opts: Opts,
): ParsedEntry[] {
  const index = speakerIndex(speakers);
  return opts.mode === 'heading'
    ? parseHeadings(script, index, opts)
    : parseScript(script, index, opts);
}

/** 清單裡還沒登錄的說話者寫法（依第一次出現的順序，key 相同的只列一次） */
export function unknownNames(entries: readonly ParsedEntry[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of entries) {
    if (e.kind === 'unknown' && !seen.has(key(e.name))) {
      seen.add(key(e.name));
      out.push(e.name);
    }
  }
  return out;
}
