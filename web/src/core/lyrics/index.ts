/**
 * core/lyrics：歌詞時間軸（LRC、SRT、WebVTT、純文字）的解析、「目前這一行」的查找、播放中逐行打點。
 * 全部是純函式（Node 也能跑）。（music-frame 移植時新增）
 *
 * ```ts
 * const { lines, untimed, kind } = parseLyrics(text);          // 依時間排序；SRT／VTT 有結束時間
 * const { current, next } = lyricAt(lines, playbackTime);      // 這一刻要顯示的行（沒有時 null）與下一行
 * const r = stampLyrics(text, textarea.selectionStart, time);  // 在游標所在（或下一個）沒有時間的行前面加上 [mm:ss.xx]
 * if (r.ok) { textarea.value = r.text; textarea.setSelectionRange(r.caret, r.caret); }
 * ```
 *
 * 規則：
 * - 內容有「-->」就當成 SRT／WebVTT：以空白行分段，每段找第一個時間列（時:分:秒,毫秒 或 分:秒.毫秒；小時可省略），
 *   時間列下面的每一行合併成一行（以空白連接），去掉 `<…>` 標籤；以「[-]」開頭的行是翻譯。
 * - 否則當成 LRC：每行開頭可以有多個時間標籤 `[分:秒]`、`[分:秒.百分秒]`（小數 1～3 位），同一句歌詞放在每個時間；
 *   行內的逐字時間 `<分:秒.xx>` 去掉；`[offset:±毫秒]` 讓之後的時間提早（正值）或延後（負值）；
 *   `[ar:…]` 這類標頭略過；沒有時間標籤的行算「沒有時間的行」（不顯示）；
 *   「[-]」開頭（前面可以再加時間標籤）的行是上一個有時間的行的翻譯（同一個時間的每一句都加上，多行以空白連接）。
 *   每一句顯示到下一句的時間為止（最後一句一直顯示）；內容空白的時間標籤用來清掉畫面上的歌詞。
 */

export type LyricKind = 'lrc' | 'srt';

export interface LyricLine {
  /** 開始（秒） */
  t: number;
  /** 結束（秒）；LRC 是下一句的開始，最後一句是 Infinity */
  end: number;
  /** 歌詞（可以是空字串：清掉畫面上的歌詞） */
  text: string;
  /** 翻譯（沒有時空字串） */
  tr: string;
}

export interface ParsedLyrics {
  lines: LyricLine[];
  /** 沒有時間的行數（LRC；不會顯示） */
  untimed: number;
  kind: LyricKind;
}

/** 歌詞檔的選檔類型 */
export const LYRIC_FILE_ACCEPT = '.lrc,.srt,.vtt,.txt,text/plain';

/** 依副檔名判斷是不是歌詞檔（拖放時用；.txt 不算，避免和其他文字檔混淆） */
export const isLyricFileName = (name: string): boolean => /\.(lrc|srt|vtt)$/i.test(name);

const TAG = String.raw`\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]`;
/** 一個 LRC 時間標籤（分、秒、小數） */
const LRC_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const LEADING_TAGS = new RegExp(`^(?:${TAG}\\s*)+`);
const TRANSLATION_LINE = new RegExp(`^(?:${TAG}\\s*)*\\[-\\]\\s*(.*)$`);
const TRANSLATION_MARK = /^\[-\]\s*/;
const OFFSET_TAG = /^\[offset:\s*([+-]?\d+)\s*\]$/i;
const HEADER_TAG = /^\[[a-z]+:[^\]]*\]$/i;
const WORD_TIME = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;
const CUE_TIME =
  /(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})\s*-->\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})/;

const cueSeconds = (h: string | undefined, m: string, s: string, ms: string) =>
  (Number.parseInt(h ?? '0', 10) || 0) * 3600 +
  Number.parseInt(m, 10) * 60 +
  Number.parseInt(s, 10) +
  Number.parseInt(ms.padEnd(3, '0'), 10) / 1000;

const stripTags = (s: string) => s.replace(/<[^>]+>/g, '').trim();

function parseCues(text: string): LyricLine[] {
  const out: LyricLine[] = [];
  for (const block of text.split(/\n\s*\n/)) {
    const rows = block.split('\n');
    const at = rows.findIndex((l) => CUE_TIME.test(l));
    if (at < 0) continue;
    const m = rows[at].match(CUE_TIME)!;
    const body = rows
      .slice(at + 1)
      .map((x) => x.trim())
      .filter(Boolean);
    out.push({
      t: cueSeconds(m[1], m[2], m[3], m[4]),
      end: cueSeconds(m[5], m[6], m[7], m[8]),
      text: stripTags(body.filter((x) => !TRANSLATION_MARK.test(x)).join(' ')),
      tr: stripTags(
        body
          .filter((x) => TRANSLATION_MARK.test(x))
          .map((x) => x.replace(TRANSLATION_MARK, ''))
          .join(' '),
      ),
    });
  }
  return out.sort((a, b) => a.t - b.t);
}

function parseLrc(text: string): { lines: LyricLine[]; untimed: number } {
  const out: LyricLine[] = [];
  let untimed = 0;
  let fileOffset = 0;
  /** 上一個有時間的行做出來的句子（翻譯行加在這些句子上） */
  let group: LyricLine[] | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const tr = line.match(TRANSLATION_LINE);
    if (tr) {
      if (group) {
        const add = tr[1].trim();
        for (const g of group) g.tr = g.tr ? `${g.tr} ${add}` : add;
      }
      continue;
    }
    const off = line.match(OFFSET_TAG);
    if (off) {
      fileOffset = Number.parseInt(off[1], 10) / 1000;
      continue;
    }
    if (HEADER_TAG.test(line)) continue;
    const lead = line.match(LEADING_TAGS);
    if (!lead) {
      untimed++;
      group = null;
      continue;
    }
    const body = line.slice(lead[0].length).replace(WORD_TIME, '').trim();
    group = [];
    for (const m of lead[0].matchAll(LRC_TAG)) {
      const frac = m[3] ? Number.parseInt(m[3], 10) / 10 ** m[3].length : 0;
      const e: LyricLine = {
        t: Math.max(
          0,
          Number.parseInt(m[1], 10) * 60 + Number.parseInt(m[2], 10) + frac - fileOffset,
        ),
        end: Number.POSITIVE_INFINITY,
        text: body,
        tr: '',
      };
      out.push(e);
      group.push(e);
    }
  }
  out.sort((a, b) => a.t - b.t);
  for (let i = 0; i < out.length; i++)
    out[i].end = i + 1 < out.length ? out[i + 1].t : Number.POSITIVE_INFINITY;
  return { lines: out, untimed };
}

/** 解析歌詞文字（LRC、SRT、WebVTT；沒有時間的行算在 untimed） */
export function parseLyrics(source: string): ParsedLyrics {
  const text = String(source ?? '').replace(/\r\n?/g, '\n');
  if (text.includes('-->')) return { lines: parseCues(text), untimed: 0, kind: 'srt' };
  return { ...parseLrc(text), kind: 'lrc' };
}

/** 有沒有任何一句帶翻譯 */
export const hasTranslation = (lines: readonly LyricLine[]): boolean => lines.some((l) => !!l.tr);

/** 開始時間 ≤ t 的最後一句（二分搜尋；沒有時 -1） */
export function lyricIndexAt(lines: readonly LyricLine[], t: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (lines[m].t <= t) {
      ans = m;
      lo = m + 1;
    } else hi = m - 1;
  }
  return ans;
}

/** 預告下一行的最長等待：沒有正在顯示的歌詞、下一句還要超過這麼多秒才開始時不預告 */
export const NEXT_LINE_LEAD = 4;

/**
 * 時間 t 要顯示的歌詞：current＝開始時間 ≤ t、還沒結束、內容不是空白的那一句（沒有時 null）；
 * next＝之後第一句有內容的（沒有 current、而且離開始還超過 4 秒時 null）。
 */
export function lyricAt(
  lines: readonly LyricLine[],
  t: number,
): { current: LyricLine | null; next: LyricLine | null } {
  const i = lyricIndexAt(lines, t);
  const current = i >= 0 && t < lines[i].end && lines[i].text ? lines[i] : null;
  let next: LyricLine | null = null;
  for (let j = i + 1; j < lines.length; j++) {
    if (lines[j].text) {
      next = lines[j];
      break;
    }
  }
  if (next && !current && next.t - t > NEXT_LINE_LEAD) next = null;
  return { current, next };
}

/** LRC 的時間標籤「[mm:ss.xx]」（百分秒四捨五入；59.996 秒 → [01:00.00]） */
export function formatLrcTag(seconds: number): string {
  const cs = Math.max(0, Math.round((Number.isFinite(seconds) ? seconds : 0) * 100));
  const m = Math.floor(cs / 6000);
  const s = (cs % 6000) / 100;
  return `[${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}]`;
}

export type StampResult =
  | {
      ok: true;
      text: string;
      /** 打點後的游標位置（下一行的開頭） */
      caret: number;
      /** 打點的那一行是第幾行（0 起） */
      row: number;
    }
  | { ok: false; reason: 'empty' | 'done' };

const STAMP_LEADING = new RegExp(`^\\s*(?:${TAG}\\s*)+`);
const IS_TRANSLATION = new RegExp(`^\\s*(?:${TAG}\\s*)*\\[-\\]`);
const HAS_TIME = /^\[\d{1,3}:\d{1,2}/;

/**
 * 打點：在游標所在的行（空白行、標頭、翻譯行往下跳過）前面換上 `[mm:ss.xx] `；到底了還找不到時，
 * 從頭找第一個還沒有時間的行。緊接在下面的翻譯行（「[-]」開頭）換上同樣的時間。
 * 游標移到下一行的開頭（打的是最後一行時文字尾端補一個換行、游標移到最後）。
 * 全部是空白時 'empty'；每一行都有時間、游標後面也沒有可以打的行時 'done'。
 */
export function stampLyrics(text: string, caret: number, seconds: number): StampResult {
  const v = String(text ?? '');
  if (!v.trim()) return { ok: false, reason: 'empty' };
  const stamp = `${formatLrcTag(seconds)} `;
  const lineEnd = (i: number) => {
    const e = v.indexOf('\n', i);
    return e < 0 ? v.length : e;
  };
  const isTarget = (a: number, needUntimed: boolean) => {
    const ln = v.slice(a, lineEnd(a)).trim();
    if (!ln || HEADER_TAG.test(ln) || IS_TRANSLATION.test(ln)) return false;
    return needUntimed ? !HAS_TIME.test(ln) : true;
  };
  const c = Math.max(0, Math.min(v.length, Math.floor(caret) || 0));
  let ls = c === 0 ? 0 : v.lastIndexOf('\n', c - 1) + 1;
  while (ls < v.length && !isTarget(ls, false)) ls = lineEnd(ls) + 1;
  if (ls >= v.length) {
    ls = 0;
    while (ls < v.length && !isTarget(ls, true)) ls = lineEnd(ls) + 1;
  }
  if (ls >= v.length) return { ok: false, reason: 'done' };
  let le = lineEnd(ls);
  let block = stamp + v.slice(ls, le).replace(STAMP_LEADING, '');
  while (le < v.length) {
    const a = le + 1;
    const b = lineEnd(a);
    const ln = v.slice(a, b);
    if (!IS_TRANSLATION.test(ln)) break;
    block += `\n${stamp}${ln.replace(STAMP_LEADING, '').trim()}`;
    le = b;
  }
  /* 打的是最後一行：尾端補一個換行，游標移到它後面（再按一次就是「全部都有時間了」，不會一直覆蓋最後一行） */
  const out = v.slice(0, ls) + block + (le >= v.length ? '\n' : v.slice(le));
  return {
    ok: true,
    text: out,
    caret: Math.min(out.length, ls + block.length + 1),
    row: v.slice(0, ls).split('\n').length - 1,
  };
}

/** 歌詞的統計（狀態列用）：有內容的句數、帶翻譯的句數 */
export function lyricStats(parsed: ParsedLyrics): {
  lines: number;
  translated: number;
  untimed: number;
} {
  return {
    lines: parsed.lines.filter((l) => l.text).length,
    translated: parsed.lines.filter((l) => l.tr).length,
    untimed: parsed.untimed,
  };
}
