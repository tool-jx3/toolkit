/**
 * 整段貼上拆成泡泡（規格 F65）：辨識三種台灣常用的格式，拆成一則一則的訊息（說話者、內容、日期時間）。
 * 原作的貼上格式是韓國某個平台專用的，不沿用；這裡的規則是本站自己定的：
 *
 * - **「名字：內容」**（全形或半形冒號，一行一則）：
 *   - 「名字：內容」開始新的一則；下一行沒有「名字：」時，是**同一個說話者的另一則**（另一個泡泡）；
 *   - 在任何名字之前、沒有名字的行是「沒有名字」的一則；
 *   - 空行只是分隔（合併時不會跨過空行）。
 * - **LINE 匯出的聊天記錄**（.txt）：開頭的 [LINE] 標題、儲存日期略過；日期列（2024/01/15（一）…）記下來；
 *   每一則是「時間⇥名字⇥內容」；用雙引號包起來的內容可以換行（"" 是一個引號）；只有兩欄的系統訊息（收回、加入群組…）略過。
 * - **Discord 複製的訊息**：「名字 — 時間」一行，下面每一行是一則；行首的「[時間]」是同一個人的下一則；
 *   精簡模式的「[時間] 名字: 內容」也認得。2026-10（規格 7.4）：舊的沒有分隔符號的標頭「阿明今天 14:30」
 *   （名字＋今天／昨天／日期＋時間在行尾），與網頁版複製成好幾行的「阿明／—／今天 21:03」
 *   （單獨一行的時間：上一行是說話者）也認得。
 * - 「名字：內容」的冒號前後都是數字（時間，例如「今天 14:30」）時不當成分隔。
 * - 都不是時：每一行一則，沒有名字。
 *
 * 選項「同一人連續的訊息合成一個泡泡」：相鄰、同一個說話者（而且中間沒有空行、沒有換日）的訊息合成一則（換行接起來）。
 */

import {
  type Align,
  type Bubble,
  bubbleFromSide,
  MAX_SPEAKER,
  MAX_TEXT,
  MAX_TIME,
  type Sides,
} from './model';

export type ChatFormat = 'colon' | 'line' | 'discord' | 'plain';

export interface ChatMessage {
  /** 說話者；空字串＝沒有名字 */
  speaker: string;
  text: string;
  /** 時間（照原文） */
  time: string;
  /** 這一則所在的日期（LINE 的日期列；照原文，沒有就是空字串） */
  date: string;
  /** 前面有空行（合併時不跨過） */
  breakBefore?: boolean;
}

export interface ChatParse {
  format: ChatFormat;
  messages: ChatMessage[];
  /** 略過的系統訊息行數 */
  skipped: number;
}

const lines = (text: string) => text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');

/* ---------- 時間與日期 ---------- */

const CLOCK = String.raw`\d{1,2}[:：]\d{2}(?::\d{2})?`;
const TIME_RE = new RegExp(
  String.raw`^(?:(?:上午|下午|中午|凌晨|晚上|早上|AM|PM|午前|午後)\s?${CLOCK}|${CLOCK}(?:\s?(?:AM|PM|am|pm))?)$`,
);
/** LINE 的日期列：2024/01/15（一）、2024.01.15 星期一、2024年1月15日 週一、Mon, 01/15/2024 */
const LINE_DATE_RE =
  /^(?:\d{4}[/.\-年]\s?\d{1,2}[/.\-月]\s?\d{1,2}日?(?:\s*[（(]?\s*(?:星期|週|周)?[一二三四五六日天]?[A-Za-z]*\s*[)）]?)?(?:\s*(?:星期|週|周)[一二三四五六日天])?|[A-Za-z]{3,9},?\s+\d{1,2}\/\d{1,2}\/\d{4})$/;
/** 像時間的字串（Discord 標題列右半邊） */
const TIMEISH_RE = /\d{1,2}[:：]\d{2}|今天|昨天|前天|Today|Yesterday|\d{4}[/.-]\d{1,2}[/.-]\d{1,2}/;
/** Discord 的時間戳：今天／昨天／前天／日期＋（上午／下午…）時間 */
const STAMP = String.raw`(?:今天|昨天|前天|Today at|Yesterday at|\d{4}[/.-]\d{1,2}[/.-]\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4})\s*(?:(?:上午|下午|中午|凌晨|晚上|早上)\s?)?\d{1,2}[:：]\d{2}(?:\s?(?:AM|PM|am|pm))?`;
/** 單獨一行的時間戳（網頁版複製成好幾行時） */
const STAMP_LINE_RE = new RegExp(`^${STAMP}$`);
/** 沒有分隔符號的標頭：名字＋時間戳在行尾 */
const LOOSE_HEAD_RE = new RegExp(String.raw`^(.+?)\s*(${STAMP})$`);
/** 只有破折號的一行（網頁版複製成三行時，名字與時間中間那一行） */
const DASH_LINE_RE = /^[—–-]{1,3}$/;

const isLineTime = (s: string) => TIME_RE.test(s.trim());

/* ---------- 偵測 ---------- */

/** 自動判斷格式 */
export function detectFormat(text: string): ChatFormat {
  const ls = lines(text).filter((l) => l.trim());
  if (!ls.length) return 'plain';
  if (/^\[LINE\]/i.test(ls[0].trim())) return 'line';
  const tabbed = ls.filter((l) => {
    const p = l.split('\t');
    return p.length >= 3 && isLineTime(p[0]);
  }).length;
  if (tabbed >= 1 && tabbed >= ls.length * 0.3) return 'line';
  const headers = ls.filter(
    (l) => discordHeader(l) !== null || discordCompact(l) !== null || STAMP_LINE_RE.test(l.trim()),
  ).length;
  if (headers >= 1) return 'discord';
  const named = ls.filter((l) => colonLine(l) !== null).length;
  /* 沒有分隔符號的標頭（「阿明今天 14:30」）：比「名字：」的行多時才算 Discord（句子剛好以時間結尾的不算） */
  const loose = ls.filter((l) => discordLooseHeader(l) !== null).length;
  if (loose >= 1 && loose > named) return 'discord';
  if (named >= 1) return 'colon';
  return 'plain';
}

/* ---------- 「名字：內容」 ---------- */

const MAX_NAME = 24;

/** 拿掉包住名字的括號：【KP】、[GM]、「阿明」 */
function cleanName(raw: string): string {
  const s = raw.trim();
  const m = /^[【[［(（「『〈《](.+)[】\]］)）」』〉》]$/.exec(s);
  return (m ? m[1] : s).trim();
}

/** 「名字：內容」→ [名字, 內容]；不是時 null（純數字、網址、時間、太長的不算名字） */
export function colonLine(line: string): [string, string] | null {
  const m = /^\s*([^:：\s][^:：]*?)\s*[:：]\s?(.*)$/.exec(line);
  if (!m) return null;
  const name = cleanName(m[1]);
  if (!name || Array.from(name).length > MAX_NAME) return null;
  if (/^\d+$/.test(name) || /^https?$/i.test(name) || /[/\\]/.test(name)) return null;
  /* 「12：30」「下午 3：00」這類時間 */
  if (isLineTime(`${m[1]}:${m[2].slice(0, 2)}`)) return null;
  /* 冒號前後都是數字：是時間（「阿明今天 14:30」「會議 9：30 開始」），不是名字的分隔（規格 7.4） */
  const at = line.search(/[:：]/);
  if (/\d/.test(line[at - 1] ?? '') && /\d/.test(line[at + 1] ?? '')) return null;
  return [name, m[2]];
}

function parseColon(text: string): ChatParse {
  const out: ChatMessage[] = [];
  let speaker = '';
  let blank = false;
  for (const raw of lines(text)) {
    if (!raw.trim()) {
      blank = true;
      continue;
    }
    const named = colonLine(raw);
    if (named) speaker = named[0];
    const body = (named ? named[1] : raw).trim();
    if (body || named)
      out.push({ speaker, text: body, time: '', date: '', breakBefore: blank && out.length > 0 });
    blank = false;
  }
  return { format: 'colon', messages: out.filter((m) => m.text), skipped: 0 };
}

/* ---------- LINE ---------- */

function parseLine(text: string): ChatParse {
  const out: ChatMessage[] = [];
  let date = '';
  let skipped = 0;
  let open: ChatMessage | null = null;
  let blank = false;
  const all = lines(text);
  for (let i = 0; i < all.length; i++) {
    const raw = all[i];
    const t = raw.trim();
    if (open) {
      /* 引號裡的多行內容：直到一行以單獨的引號結尾 */
      const end = /(^|[^"])("")*"$/.test(raw);
      open.text += `\n${end ? raw.slice(0, -1) : raw}`;
      if (end) {
        open.text = open.text.replace(/""/g, '"');
        open = null;
      }
      continue;
    }
    if (!t) {
      blank = true;
      continue;
    }
    if (i < 3 && (/^\[LINE\]/i.test(t) || /^(儲存日期|保存日時|Saved on)/i.test(t))) continue;
    const parts = raw.split('\t');
    if (parts.length >= 2 && isLineTime(parts[0])) {
      if (parts.length === 2 || !parts[1].trim()) {
        skipped++;
        continue;
      }
      let body = parts.slice(2).join('\t');
      const msg: ChatMessage = {
        speaker: parts[1].trim(),
        text: '',
        time: parts[0].trim(),
        date,
        breakBefore: blank && out.length > 0,
      };
      if (body.startsWith('"') && !/^"(?:[^"]|"")*"$/.test(body)) {
        msg.text = body.slice(1);
        open = msg;
      } else {
        if (/^"(?:[^"]|"")*"$/.test(body) && body.length >= 2)
          body = body.slice(1, -1).replace(/""/g, '"');
        msg.text = body;
      }
      out.push(msg);
      blank = false;
      continue;
    }
    if (LINE_DATE_RE.test(t)) {
      date = t;
      blank = false;
      continue;
    }
    /* 舊版沒有引號的多行訊息：接在上一則 */
    const last = out[out.length - 1];
    if (last) last.text += `\n${raw}`;
    else skipped++;
    blank = false;
  }
  for (const m of out) m.text = m.text.replace(/\s+$/, '');
  return { format: 'line', messages: out.filter((m) => m.text.trim()), skipped };
}

/* ---------- Discord ---------- */

/** 「名字 — 時間」→ [名字, 時間] */
export function discordHeader(line: string): [string, string] | null {
  const m = /^(.+?)\s+[—–]\s+(.+)$/.exec(line.trim());
  if (!m || !TIMEISH_RE.test(m[2]) || Array.from(m[1]).length > 40) return null;
  return [m[1].trim(), m[2].trim()];
}

/** 沒有分隔符號的標頭「阿明今天 14:30」→ [名字, 時間]（名字裡有冒號的不算：那是「名字：內容」） */
export function discordLooseHeader(line: string): [string, string] | null {
  const t = line.trim();
  if (STAMP_LINE_RE.test(t)) return null;
  const m = LOOSE_HEAD_RE.exec(t);
  if (!m) return null;
  const name = m[1].trim();
  if (!name || Array.from(name).length > 40 || /[:：]/.test(name)) return null;
  return [name, m[2].trim()];
}

/** 精簡模式「[時間] 名字: 內容」→ [時間, 名字, 內容] */
function discordCompact(line: string): [string, string, string] | null {
  const m = /^\[([^\]]{3,40})\]\s+(.+?):\s(.*)$/.exec(line.trim());
  if (!m || !TIMEISH_RE.test(m[1])) return null;
  return [m[1].trim(), m[2].trim(), m[3]];
}

function parseDiscord(text: string): ChatParse {
  const out: ChatMessage[] = [];
  let speaker = '';
  let time = '';
  let blank = false;
  /* 上一行（不算空行、破折號）是一則訊息時，它在 out 裡的位置（單獨一行的時間：那一行其實是說話者） */
  let lastLine = -1;
  for (const raw of lines(text)) {
    const t = raw.trim();
    if (!t) {
      blank = true;
      continue;
    }
    if (DASH_LINE_RE.test(t)) continue;
    if (STAMP_LINE_RE.test(t)) {
      time = t;
      const prev = lastLine >= 0 ? out[lastLine] : undefined;
      if (prev && lastLine === out.length - 1 && Array.from(prev.text).length <= 40) {
        speaker = prev.text;
        out.pop();
      }
      lastLine = -1;
      blank = false;
      continue;
    }
    lastLine = -1;
    const compact = discordCompact(t);
    if (compact) {
      [time, speaker] = compact;
      if (compact[2].trim())
        out.push({
          speaker,
          text: compact[2].trim(),
          time,
          date: '',
          breakBefore: blank && out.length > 0,
        });
      blank = false;
      continue;
    }
    const head = discordHeader(t) ?? discordLooseHeader(t);
    if (head) {
      [speaker, time] = head;
      blank = false;
      continue;
    }
    /* 同一個人的下一則：行首「[時間]」 */
    const stamp = /^\[([^\]]{3,20})\]\s?(.*)$/.exec(t);
    let body = t;
    let tm = time;
    if (stamp && TIMEISH_RE.test(stamp[1])) {
      tm = stamp[1].trim();
      body = stamp[2].trim();
    }
    if (body) {
      out.push({ speaker, text: body, time: tm, date: '', breakBefore: blank && out.length > 0 });
      if (!stamp) lastLine = out.length - 1;
    }
    blank = false;
  }
  return { format: 'discord', messages: out, skipped: 0 };
}

/* ---------- 都不是：每行一則 ---------- */

function parsePlain(text: string): ChatParse {
  const out: ChatMessage[] = [];
  let blank = false;
  for (const raw of lines(text)) {
    const t = raw.trim();
    if (!t) {
      blank = true;
      continue;
    }
    out.push({ speaker: '', text: t, time: '', date: '', breakBefore: blank && out.length > 0 });
    blank = false;
  }
  return { format: 'plain', messages: out, skipped: 0 };
}

/** 拆成訊息（format 不給＝自動判斷） */
export function parseChat(text: string, format: ChatFormat | 'auto' = 'auto'): ChatParse {
  const f = format === 'auto' ? detectFormat(text) : format;
  switch (f) {
    case 'line':
      return parseLine(text);
    case 'discord':
      return parseDiscord(text);
    case 'colon':
      return parseColon(text);
    default:
      return parsePlain(text);
  }
}

/** 相鄰、同一個說話者（中間沒有空行、沒有換日）的訊息合成一則；時間用第一則的 */
export function mergeRuns(messages: readonly ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    const last = out[out.length - 1];
    if (last && last.speaker === m.speaker && last.date === m.date && !m.breakBefore)
      last.text += `\n${m.text}`;
    else out.push({ ...m });
  }
  return out;
}

/** 說話者與則數（依第一次出現的順序；沒有名字的排在最後） */
export function speakerCounts(
  messages: readonly ChatMessage[],
): { speaker: string; count: number }[] {
  const map = new Map<string, number>();
  for (const m of messages) map.set(m.speaker, (map.get(m.speaker) ?? 0) + 1);
  const list = [...map.entries()].map(([speaker, count]) => ({ speaker, count }));
  return [...list.filter((x) => x.speaker), ...list.filter((x) => !x.speaker)];
}

/* ---------- 變成泡泡 ---------- */

export type DateMode = 'none' | 'time' | 'datetime';

export interface ImportChoices {
  /** 每個說話者放在哪一側（沒列到的放靠左） */
  sides: Record<string, Align>;
  /** 帶入日期時間：不帶入／只有時間／日期＋時間 */
  dates: DateMode;
  /** 每天的日期做成置中的泡泡 */
  separators: boolean;
  /** 同一人連續的訊息合成一個泡泡 */
  merge: boolean;
}

/** 預設的位置：第一個人靠左、第二個人靠右、其他人靠左；沒有名字的在有名字的人時置中，否則靠左 */
export function defaultSpeakerSides(counts: readonly { speaker: string }[]): Record<string, Align> {
  const named = counts.filter((c) => c.speaker);
  const out: Record<string, Align> = {};
  named.forEach((c, i) => {
    out[c.speaker] = i === 1 ? 'right' : 'left';
  });
  if (counts.some((c) => !c.speaker)) out[''] = named.length ? 'center' : 'left';
  return out;
}

/** 選了某人的一側：只有兩個人時另一個人自動放到另一側（原作的做法） */
export function chooseSide(
  sides: Record<string, Align>,
  counts: readonly { speaker: string }[],
  speaker: string,
  side: Align,
): Record<string, Align> {
  const next = { ...sides, [speaker]: side };
  const named = counts.filter((c) => c.speaker).map((c) => c.speaker);
  if (speaker && named.length === 2 && side !== 'center') {
    const other = named.find((n) => n !== speaker);
    if (other) next[other] = side === 'left' ? 'right' : 'left';
  }
  return next;
}

/** 左右互換（置中的不動） */
export const swapSides = (sides: Record<string, Align>): Record<string, Align> =>
  Object.fromEntries(
    Object.entries(sides).map(([k, v]) => [k, v === 'left' ? 'right' : v === 'right' ? 'left' : v]),
  );

/**
 * 訊息 → 泡泡（用三側的預設樣式；內文超過上限的截掉）。limit：最多幾個；total：全部有幾個。
 */
export function buildImport(
  parse: ChatParse,
  choices: ImportChoices,
  sides: Sides,
  limit: number,
): { bubbles: Bubble[]; total: number } {
  const messages = choices.merge ? mergeRuns(parse.messages) : parse.messages;
  const all: Bubble[] = [];
  let lastDate = '';
  for (const m of messages) {
    if (choices.separators && m.date && m.date !== lastDate)
      all.push(bubbleFromSide(sides.center, { text: m.date, align: 'center' }));
    lastDate = m.date || lastDate;
    const align = choices.sides[m.speaker] ?? 'left';
    const time =
      choices.dates === 'none'
        ? ''
        : choices.dates === 'time'
          ? m.time
          : [m.date, m.time].filter(Boolean).join(' ');
    all.push(
      bubbleFromSide(sides[align], {
        text: Array.from(m.text).slice(0, MAX_TEXT).join(''),
        align,
        speaker: Array.from(m.speaker).slice(0, MAX_SPEAKER).join(''),
        time: Array.from(time).slice(0, MAX_TIME).join(''),
      }),
    );
  }
  return { bubbles: all.slice(0, Math.max(0, limit)), total: all.length };
}
