/**
 * 從歌詞文字組出要排的句（lyric-fx 規格 3.2；和風格無關，music-frame 之後也用這個）：
 * parseLyrics → 同一時間的翻譯（三行以上時第一行＋最後一行） → 鍵 → 逐句覆寫 → 過濾（作詞作曲、伴奏） → 語言 →
 * 演出延遲、排序 → 結束時間 → 拿掉空白的句。
 */
import { type LyricKind, type LyricLine, pairSameTimeLines, parseLyrics } from '../lyrics';
import type { LyricFxLine } from './types';

export type LyricLanguage = 'original' | 'translation' | 'both';

/** 一句的逐句調整（鍵 → 覆寫） */
export interface LineOverride {
  /** 改過的原文 */
  text?: string;
  /** 改過的翻譯 */
  tr?: string;
  /** 改過的開始時間（秒，歌詞裡的時間，不含演出延遲） */
  t?: number;
  /** 重抽了幾次 */
  reroll?: number;
  /** 鎖定的位置（風格的格式） */
  lock?: unknown;
}

export interface LineFilters {
  /** 略過作詞作曲等資訊行 */
  credits: boolean;
  /** 關鍵字（一行一個） */
  creditWords: string;
  /** 略過伴奏標示 */
  inst: boolean;
  instWords: string;
}

/**
 * 作詞作曲等資訊行的預設關鍵字（規格 3.2；新版自己整理）。資訊行的寫法是「名稱：人名」，所以每個都帶冒號
 * （「Program the world」這種歌詞不會被略過）；比對前全形轉半形、拿掉空白，「作詞 ： 某人」「Produced  by: 某人」都算。
 */
export const DEFAULT_CREDIT_WORDS: readonly string[] = [
  '作詞:',
  '作词:',
  '作曲:',
  '編曲:',
  '编曲:',
  '製作人:',
  '制作人:',
  '監製:',
  '监制:',
  '原唱:',
  '翻唱:',
  '混音:',
  '錄音:',
  '录音:',
  '和聲:',
  '和声:',
  '統籌:',
  '统筹:',
  '企劃:',
  '企划:',
  '出品:',
  '封面:',
  '詞:',
  '词:',
  '曲:',
  '吉他:',
  '貝斯:',
  '贝斯:',
  '鼓:',
  '鍵盤:',
  '键盘:',
  '弦樂:',
  '弦乐:',
  'op:',
  'sp:',
  'program:',
  'programming:',
  'produced by:',
  'written by:',
  'composed by:',
  'arranged by:',
  'mixed by:',
  'mastered by:',
  'lyrics by:',
  'music by:',
];

/** 伴奏標示的預設關鍵字（規格 F09）；「=」開頭的要整句相同（單獨一行的「Inst」「Inst.」） */
export const DEFAULT_INST_WORDS: readonly string[] = [
  '(inst',
  '[inst',
  '【inst',
  '=inst',
  '=inst.',
  'instrumental',
  '純音樂',
  '纯音乐',
  '伴奏',
  'off vocal',
  'カラオケ',
  'karaoke',
];

export const DEFAULT_FILTERS: LineFilters = {
  credits: true,
  creditWords: DEFAULT_CREDIT_WORDS.join('\n'),
  inst: true,
  instWords: DEFAULT_INST_WORDS.join('\n'),
};

/** 比對用的正規化：NFKC（全形轉半形）、轉小寫、拿掉所有空白 */
export const normalizeForMatch = (s: string): string =>
  s.normalize('NFKC').toLowerCase().replace(/\s+/gu, '');

/** 關鍵字欄 → 正規化後的關鍵字（空的不算） */
export const keywordList = (text: string): string[] =>
  String(text ?? '')
    .split('\n')
    .map(normalizeForMatch)
    .filter(Boolean);

/** 整句比對的關鍵字以「=」開頭（全形「＝」也可以） */
const WHOLE = '=';

/**
 * 文字符合任何一個關鍵字（words 是 keywordList 的結果）：一般的關鍵字＝含有它；「=」開頭的＝整句（正規化後）和它相同。
 */
export const matchesKeyword = (text: string, words: readonly string[]): boolean => {
  if (!words.length) return false;
  const s = normalizeForMatch(text);
  return words.some((w) =>
    w.startsWith(WHOLE) ? w.length > 1 && s === w.slice(1) : s.includes(w),
  );
};

/** 歌詞清單上的一句（逐句調整的介面用：含略過的句） */
export interface LyricRow {
  key: string;
  /** 歌詞裡的開始時間（秒，不含演出延遲；覆寫後） */
  t: number;
  text: string;
  tr: string;
  /** 原本的（沒有覆寫的）值 */
  original: { t: number; text: string; tr: string };
  /** 有覆寫文字、翻譯或時間 */
  edited: boolean;
  /** 略過的原因 */
  skipped: 'credit' | 'inst' | null;
}

export interface BuildLinesOptions {
  language?: LyricLanguage;
  /** 演出延遲（秒，正值＝晚一點出現） */
  offset?: number;
  filters?: LineFilters;
  overrides?: Readonly<Record<string, LineOverride>>;
  /** 最多排幾句（預設 2000） */
  maxLines?: number;
}

export interface BuiltLines {
  /** 要排的句（依開始時間） */
  lines: LyricFxLine[];
  /** 清單上的每一句（有字的句，依時間；含略過的） */
  rows: LyricRow[];
  kind: LyricKind;
  /** 沒有任何有時間的句、整段當成一句（規格 F03） */
  untimed: boolean;
  /** 沒有時間的行數（LRC） */
  untimedRows: number;
  /** 句數超過上限、後面的沒有排 */
  truncated: boolean;
}

export const MAX_LINES = 2000;

/** 每一句的鍵：`<開始的毫秒>:<原文>`，同樣的鍵第二次起加 `#2`… */
export function lineKeys(lines: readonly Pick<LyricLine, 't' | 'text'>[]): string[] {
  const seen = new Map<string, number>();
  return lines.map((l) => {
    const base = `${Math.round(l.t * 1000)}:${l.text}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  });
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * 同一時間有三行以上（規格 F07、D19）：第一行是原文、最後一行是翻譯，中間的行（例如羅馬拼音）略過；
 * 之後 pairSameTimeLines 把剩下的兩行合成原文＋翻譯。只處理它會合併的情形：第一行有字、還沒有翻譯，
 * 接著連續幾行同一時間、都有字（空白的時間標籤中斷）。結束取這幾行裡最晚的。
 */
export function dropMiddleSameTime(lines: readonly LyricLine[]): LyricLine[] {
  const out: LyricLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const first = lines[i];
    let j = i + 1;
    if (first.text && !first.tr)
      while (j < lines.length && lines[j].t === first.t && lines[j].text) j++;
    if (j - i < 3) {
      out.push(first);
      continue;
    }
    let end = lines[j - 1].end;
    for (let k = i + 1; k < j - 1; k++) end = Math.max(end, lines[k].end);
    out.push(first, { ...lines[j - 1], end });
    i = j - 1;
  }
  return out;
}

/** 從歌詞文字組出要排的句（規格 3.2） */
export function buildLyricLines(text: string, options: BuildLinesOptions = {}): BuiltLines {
  const language = options.language ?? 'original';
  const offset = finite(options.offset) ? options.offset : 0;
  const filters = options.filters ?? DEFAULT_FILTERS;
  const overrides = options.overrides ?? {};
  const max = Math.max(1, Math.floor(options.maxLines ?? MAX_LINES));
  const parsed = parseLyrics(text);
  const timed = parsed.lines.some((l) => l.text);

  if (!timed) {
    const body = String(text ?? '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .join('\n');
    if (!body)
      return {
        lines: [],
        rows: [],
        kind: parsed.kind,
        untimed: false,
        untimedRows: parsed.untimed,
        truncated: false,
      };
    const key = 'untimed';
    const ov = overrides[key] ?? {};
    return {
      lines: [
        {
          key,
          t: 0,
          end: Number.POSITIVE_INFINITY,
          text: body,
          tr: '',
          reroll: Math.max(0, Math.floor(ov.reroll ?? 0)),
          lock: ov.lock ?? null,
          untimed: true,
        },
      ],
      rows: [],
      kind: parsed.kind,
      untimed: true,
      untimedRows: parsed.untimed,
      truncated: false,
    };
  }

  const paired = pairSameTimeLines(dropMiddleSameTime(parsed.lines));
  const keys = lineKeys(paired);
  const credit = filters.credits ? keywordList(filters.creditWords) : [];
  const inst = filters.inst ? keywordList(filters.instWords) : [];

  interface Item {
    key: string;
    t: number;
    srtEnd: number;
    text: string;
    tr: string;
    blank: boolean;
    skipped: LyricRow['skipped'];
    order: number;
    ov: LineOverride;
    original: LyricRow['original'];
  }
  const items: Item[] = paired.map((l, i) => {
    const ov = overrides[keys[i]] ?? {};
    const textNow = typeof ov.text === 'string' ? ov.text : l.text;
    const trNow = typeof ov.tr === 'string' ? ov.tr : l.tr;
    const blank = !l.text;
    const skipped: LyricRow['skipped'] = blank
      ? null
      : matchesKeyword(textNow, credit)
        ? 'credit'
        : matchesKeyword(textNow, inst)
          ? 'inst'
          : null;
    return {
      key: keys[i],
      t: !blank && finite(ov.t) && ov.t >= 0 ? ov.t : l.t,
      srtEnd: parsed.kind === 'srt' ? l.end : Number.POSITIVE_INFINITY,
      text: textNow.trim(),
      tr: trNow.trim(),
      blank,
      skipped,
      order: i,
      ov,
      original: { t: l.t, text: l.text, tr: l.tr },
    };
  });

  const rows: LyricRow[] = items
    .filter((it) => !it.blank)
    .map((it) => ({
      key: it.key,
      t: it.t,
      text: it.text,
      tr: it.tr,
      original: it.original,
      edited:
        (typeof it.ov.text === 'string' && it.ov.text !== it.original.text) ||
        (typeof it.ov.tr === 'string' && it.ov.tr !== it.original.tr) ||
        (finite(it.ov.t) && Math.abs(it.ov.t - it.original.t) > 1e-6),
      skipped: it.skipped,
    }))
    .sort((a, b) => a.t - b.t);

  /* 略過的句當成不存在（不會讓前一句提早結束）；空白的句只當結束的記號 */
  const kept = items.filter((it) => !it.skipped).sort((a, b) => a.t - b.t || a.order - b.order);
  const lines: LyricFxLine[] = [];
  for (let i = 0; i < kept.length; i++) {
    const it = kept[i];
    if (it.blank) continue;
    const nextAny = i + 1 < kept.length ? kept[i + 1].t : Number.POSITIVE_INFINITY;
    const end = Math.min(nextAny, it.srtEnd);
    let shown = it.text;
    let tr = '';
    if (language === 'translation' && it.tr) shown = it.tr;
    else if (language === 'both') tr = it.tr;
    if (!shown) continue;
    lines.push({
      key: it.key,
      t: it.t + offset,
      end: end + offset,
      text: shown,
      tr,
      reroll: Math.max(0, Math.floor(finite(it.ov.reroll) ? it.ov.reroll : 0)),
      lock: it.ov.lock ?? null,
    });
  }
  const truncated = lines.length > max;
  return {
    lines: truncated ? lines.slice(0, max) : lines,
    rows,
    kind: parsed.kind,
    untimed: false,
    untimedRows: parsed.untimed,
    truncated,
  };
}
