/**
 * 從文字擷取填字遊戲的候選單字（規格 3.2、3.3）。純函式（Node 也能跑）。
 *
 * 流程照原作：JSON 取出所有字串值 → 拿掉 HTML 的 style／script 與標籤 → 逐行拿掉開頭的說話者名稱與
 * 括號標籤 → 依句號、問號、驚嘆號切句（括號裡的不切）→ 每句取出單字（韓文切掉助詞與詞尾）→
 * 依單字統計出現次數與出現過的句子，挑一句當代表提示。
 *
 * 新版加的（規格 5. D2、D3）：中文（漢字依瀏覽器的斷詞切成詞）、全形標點與括號、HTML 實體解碼。
 * 只有半形標點、韓文與英數的文字，結果與原作完全相同（單元測試以原作算出的對照值確認）。
 */
import { CHINESE_STOPWORDS, KOREAN_STOPWORDS, KOREAN_SUFFIXES } from './stopwords';

export interface Candidate {
  /** 答案（韓文是切掉助詞後的詞幹） */
  answer: string;
  /** 出現過的句子（不重複；120 字以內的由長到短在前，超過 120 字的由短到長在後） */
  sentences: string[];
  /** 代表提示（sentences 的第一句） */
  hint: string;
  /** 出現次數 */
  count: number;
}

export interface ExtractOptions {
  /**
   * 新版的擴充（中文、全形標點、HTML 實體）。false＝只做原作的處理（對照測試用）。預設 true。
   */
  extended?: boolean;
  /** 中文斷詞（測試可以換掉；預設用 Intl.Segmenter） */
  segmentHan?: (run: string) => string[];
}

/** 代表提示偏好的句子長度上限（字） */
export const PREFERRED_HINT_MAX = 120;
/** 句子要超過幾個字才算（原作：大於 5） */
export const MIN_SENTENCE_LENGTH = 5;

const SUFFIX_RE = new RegExp(`(${KOREAN_SUFFIXES.join('|')})$`);

/* ---------- 1. 文字整理 ---------- */

/** JSON：依序取出所有字串值，各接一個空白（物件、陣列遞迴；數字、布林不取） */
function jsonStrings(value: unknown): string {
  let out = '';
  if (value === null || typeof value !== 'object') return out;
  for (const key of Object.keys(value)) {
    const v = (value as Record<string, unknown>)[key];
    if (typeof v === 'string') out += `${v} `;
    else if (typeof v === 'object' && v !== null) out += `${jsonStrings(v)} `;
  }
  return out;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** HTML 實體（&amp; &lt; &gt; &quot; &apos; &nbsp; 與數字實體） */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, name: string) => {
    if (name[0] === '#') {
      const cp =
        name[1] === 'x' || name[1] === 'X'
          ? Number.parseInt(name.slice(2), 16)
          : Number.parseInt(name.slice(1), 10);
      if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff) return m;
      try {
        return String.fromCodePoint(cp);
      } catch {
        return m;
      }
    }
    return ENTITIES[name.toLowerCase()] ?? m;
  });
}

/** 整段文字的整理：JSON、HTML 標籤（3.2 的 1～3 步） */
export function cleanSource(text: string, extended = true): string {
  let clean = text;
  const head = text.trim();
  if (head.startsWith('{') || head.startsWith('[')) {
    try {
      clean = jsonStrings(JSON.parse(text));
    } catch {
      /* 不是 JSON：照一般文字處理 */
    }
  }
  clean = clean.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  clean = clean.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  clean = clean.replace(/<[^>]*>?/gm, '');
  /* 新版：HTML 實體；只用 \r 換行的文字（舊 Mac）也照換行切（CRLF 的結果不變） */
  if (extended) clean = decodeEntities(clean).replace(/\r\n?/g, '\n');
  return clean;
}

/* ---------- 2. 行首的說話者與標籤、切句 ---------- */

const SPEAKER_RE = /^[^:?.!]{1,20}:\s*/;
const SPEAKER_RE_EXT = /^[^:：?.!？！。]{1,20}[:：]\s*/;
const TAGS_RE = /^(?:[([<{（〈《][^)\]}>）〉》]+[)\]}>）〉》][\s:]*)+/;
const TAGS_RE_EXT =
  /^(?:[([<{（〈《【〔［｛][^)\]}>）〉》】〕］｝]+[)\]}>）〉》】〕］｝][\s:：]*)+/;

/** 一行的開頭反覆拿掉「名字：」與括號標籤（標籤後面緊接句點時保留，例如書名） */
export function stripLineHead(line: string, extended = true): string {
  const speaker = extended ? SPEAKER_RE_EXT : SPEAKER_RE;
  const tags = extended ? TAGS_RE_EXT : TAGS_RE;
  let str = line;
  let prev: string;
  do {
    prev = str;
    str = str.replace(speaker, '');
    const m = str.match(tags);
    if (m) {
      const after = str.slice(m[0].length);
      if (!(after.startsWith('.') || (extended && after.startsWith('。')))) str = after;
    }
  } while (str !== prev);
  return str;
}

const OPEN_RE = /[([{<]/;
const CLOSE_RE = /[)\]}>]/;
const END_RE = /[.?!]/;
const OPEN_RE_EXT = /[([{<（「『【〔［｛]/;
const CLOSE_RE_EXT = /[)\]}>）」』】〕］｝]/;
const END_RE_EXT = /[.?!。？！]/;

/** 一行切成句子：句號、問號、驚嘆號（連續的算一個）結束一句；括號裡不切；超過 5 個字才算一句 */
export function splitSentences(line: string, extended = true): string[] {
  const open = extended ? OPEN_RE_EXT : OPEN_RE;
  const close = extended ? CLOSE_RE_EXT : CLOSE_RE;
  const end = extended ? END_RE_EXT : END_RE;
  const out: string[] = [];
  let current = '';
  let inParen = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    current += ch;
    if (open.test(ch)) inParen = true;
    else if (close.test(ch)) inParen = false;
    if (!inParen && end.test(ch)) {
      const next = line[i + 1];
      if (!next || !end.test(next)) {
        const t = current.trim();
        if (t.length > MIN_SENTENCE_LENGTH) out.push(t);
        current = '';
      }
    }
  }
  const t = current.trim();
  if (t.length > MIN_SENTENCE_LENGTH) out.push(t);
  return out;
}

/** 整段文字 → 句子（3.2 的 1～5 步） */
export function textToSentences(text: string, extended = true): string[] {
  const out: string[] = [];
  for (const raw of cleanSource(text, extended).split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    out.push(...splitSentences(stripLineHead(line, extended), extended));
  }
  return out;
}

/* ---------- 3. 單字 ---------- */

let segmenter: Intl.Segmenter | null | undefined;

/** 漢字串切成詞：瀏覽器的斷詞（Intl.Segmenter）；不支援時 2～6 個字的整串當一個詞，更長的不取 */
export function segmentHanDefault(run: string): string[] {
  if (segmenter === undefined) {
    try {
      segmenter =
        typeof Intl !== 'undefined' && 'Segmenter' in Intl
          ? new Intl.Segmenter('zh-Hant-TW', { granularity: 'word' })
          : null;
    } catch {
      segmenter = null;
    }
  }
  if (!segmenter) return Array.from(run).length <= 6 ? [run] : [];
  const out: string[] = [];
  for (const s of segmenter.segment(run)) if (s.isWordLike) out.push(s.segment);
  return out;
}

const TOKEN_RE = /[가-힣a-zA-Z0-9]+/g;
const TOKEN_RE_EXT = /[가-힣a-zA-Z0-9]+|\p{Script=Han}+/gu;
const HAN_RE = /^\p{Script=Han}/u;

/** 切掉韓文的助詞與詞尾（反覆，直到切不掉） */
export function koreanStem(word: string): string {
  let stem = word;
  let prev: string;
  do {
    prev = stem;
    stem = stem.replace(SUFFIX_RE, '');
  } while (stem !== prev);
  return stem;
}

/** 一句裡的單字（依出現順序；同一個詞出現兩次就列兩次） */
export function sentenceWords(
  sentence: string,
  extended = true,
  segmentHan: (run: string) => string[] = segmentHanDefault,
): string[] {
  const out: string[] = [];
  for (const m of sentence.matchAll(extended ? TOKEN_RE_EXT : TOKEN_RE)) {
    const token = m[0];
    if (extended && HAN_RE.test(token)) {
      for (const w of segmentHan(token))
        if (Array.from(w).length >= 2 && !CHINESE_STOPWORDS.has(w)) out.push(w);
      continue;
    }
    const stem = koreanStem(token);
    if (stem.length >= 2 && !KOREAN_STOPWORDS.has(stem) && !KOREAN_STOPWORDS.has(token))
      out.push(stem);
  }
  return out;
}

/** 依提示的偏好排序：120 字以內由長到短，超過的由短到長排在後面（同長度保持出現順序） */
export function sortHints(sentences: readonly string[]): string[] {
  const preferred = sentences
    .filter((s) => s.length <= PREFERRED_HINT_MAX)
    .sort((a, b) => b.length - a.length);
  const others = sentences
    .filter((s) => s.length > PREFERRED_HINT_MAX)
    .sort((a, b) => a.length - b.length);
  return [...preferred, ...others];
}

/** 整段文字 → 候選單字（依第一次出現的順序） */
export function extractWords(text: string, options: ExtractOptions = {}): Candidate[] {
  const extended = options.extended ?? true;
  const segmentHan = options.segmentHan ?? segmentHanDefault;
  const map = new Map<string, { sentences: string[]; count: number }>();
  for (const sentence of textToSentences(text, extended)) {
    for (const w of sentenceWords(sentence, extended, segmentHan)) {
      const item = map.get(w);
      if (!item) map.set(w, { sentences: [sentence], count: 1 });
      else {
        item.count += 1;
        if (!item.sentences.includes(sentence)) item.sentences.push(sentence);
      }
    }
  }
  return Array.from(map, ([answer, item]) => {
    const sentences = sortHints(item.sentences);
    return { answer, sentences, hint: sentences[0], count: item.count };
  });
}
