/**
 * CCFOLIA 的聊天日誌（ログ出力）HTML（外部格式事實，log-converter 規格 2.1～2.4）。
 *
 * - **舊格式**（純文字版）：每則一個 `p`，裡面依序三個 `span`：「 [分頁]」、發言者、內容 HTML（換行是 `br`）；
 *   段落的 style 以 `color` 記錄名字顏色；CCFOLIA 代發的數值變更，發言者是 `system`。
 * - **新格式**（含頭像）：`article.message`（系統列另有 class `system`）、`data-channel`＝分頁代碼（預設 main／info／other，
 *   自訂分頁是一串隨機英數）、`.speaker`（style 的 `--speaker-color`＝名字顏色）、`time[datetime]`、`.message-text`、
 *   `.roll-result`；頭像元素 class `avatar-image-N`，對應 `<style>` 裡 `.avatar-image-N { background-image: url(data:…) }`。
 *   標題（`.log-title`，沒有時 `<title>`）是「房間名 [分頁名]」，全分頁檔的方括號裡是「全部」的字樣。
 *   觀察者無法取得實際的匯出檔對照，這部分照原作的辨識規則（log-converter 第 7 節：日後拿到真實匯出檔再補驗）。
 *
 * 這裡只做「HTML → 中立的訊息陣列」與多檔合併；訊息分類（對話、旁白、閒聊、系統）是 log-converter 自己的規則，不在這裡。
 * 用瀏覽器的 DOMParser 解析（Worker 裡沒有；單元測試用 jsdom）。依原作（Eon-00/eon-ccfolia-log-converter）的規則改寫。
 */
import { formatHex, parseColor } from '@/core/color';
import { escapeHtml } from '@/core/html';

export type CcfoliaLogFormat = 'legacy' | 'v2';

/** 新格式的預設分頁代碼（CCFOLIA 的メイン、情報、雑談） */
export const LOG_DEFAULT_CHANNELS = Object.freeze(['main', 'info', 'other'] as const);

/** 全分頁檔標題方括號裡代表「全部」的字樣（CCFOLIA 各介面語言＋繁中別名；比對時不分大小寫、去頭尾空白） */
export const LOG_ALL_TAB_LABELS = Object.freeze(['すべて', '全て', '전체', '全部', '所有', 'all']);

/** CCFOLIA 代發訊息（數值變更通知、新格式的系統列）的發言者名稱 */
export const LOG_SYSTEM_SPEAKER = 'system';

/** 是不是「全部分頁」的標籤 */
export function isAllTabLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  const t = label.trim().toLowerCase();
  return LOG_ALL_TAB_LABELS.some((l) => l.toLowerCase() === t);
}

/** 一則訊息（兩種格式共通的中立形狀） */
export interface CcfoliaLogMessage {
  /** 分頁：新格式是代碼（data-channel，可能是空字串）；舊格式是方括號裡的文字（預設分頁也以 main／info／other 出現） */
  channel: string;
  /** 發言者（去頭尾空白；系統列是 'system'） */
  speaker: string;
  /** CCFOLIA 代發的系統列（新格式 class system；舊格式發言者是 system） */
  system: boolean;
  /** 內文的純文字（換行是 \n）。新格式去掉結尾空白、不含擲骰結果；舊格式是 html 轉成的文字 */
  text: string;
  /**
   * 內容的 HTML。舊格式＝第 3 個 span 的原文去頭尾空白（保留標籤與實體，**輸出前要淨化**）；
   * 新格式＝內文跳脫後換行換成 `<br>`，有擲骰結果時再換一行接上結果（原作的組法）。
   */
  html: string;
  /** 擲骰結果（新格式 .roll-result 去頭尾空白；沒有時空字串；舊格式一律空字串，結果寫在內文裡） */
  roll: string;
  /** 這一則記錄的名字顏色（可解析時正規化成小寫 #rrggbb；沒有時 null） */
  color: string | null;
  /** 頭像（新格式是 data URL；舊格式只有段落帶 data-image-url 時才有） */
  avatar: string | null;
  /** 時間（新格式 time 的 datetime 原文；沒有時 null） */
  time: string | null;
  /** time 換成的毫秒時間戳（解析不了時 null） */
  timeMs: number | null;
}

/** 一個日誌檔的解析結果 */
export interface CcfoliaLog {
  format: CcfoliaLogFormat;
  /** 文件標題全文（新格式優先取 .log-title） */
  title: string;
  /** 房間名稱（新格式：標題去掉結尾的「[…]」；舊格式 null） */
  roomName: string | null;
  /** 標題結尾「[…]」裡的分頁標籤（新格式；沒有時 null） */
  tabLabel: string | null;
  /** 分頁，依第一次出現的順序（新格式不含空字串） */
  channels: string[];
  /** 發言者，依第一次出現的順序（含 'system' 與空字串；旁白選單等要自己濾掉） */
  speakers: string[];
  /** 每位發言者出現次數最多的名字顏色（次數相同取先出現的；不含 system） */
  speakerColors: Record<string, string>;
  messages: CcfoliaLogMessage[];
}

/**
 * 格式判斷（log-converter 2.3）：內容裡有「class 含 message 的 article」，而且有 `data-channel` 屬性或
 * `class="message-text"` 的元素 → 新格式；其餘一律是舊格式。
 */
export function detectLogFormat(html: string): CcfoliaLogFormat {
  const hasArticle = /<article[^>]*class="[^"]*\bmessage\b/.test(html);
  const hasChannel = /data-channel\s*=/.test(html);
  const hasText = /class="message-text"/.test(html);
  return hasArticle && (hasChannel || hasText) ? 'v2' : 'legacy';
}

const parseDoc = (html: string): Document => new DOMParser().parseFromString(html, 'text/html');

/** 顏色字串正規化（看得懂的轉小寫 #rrggbb／#rrggbbaa，看不懂的照原樣去頭尾空白） */
function normalizeLogColor(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const c = parseColor(t);
  return c ? formatHex(c) : t;
}

/** 元素的文字，`br` 換成換行 */
function textWithBreaks(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('br').forEach((br) => {
    br.replaceWith('\n');
  });
  return clone.textContent ?? '';
}

/** HTML 片段 → 純文字（`br` 換成換行） */
function htmlToText(html: string, doc: Document): string {
  const div = doc.createElement('div');
  div.innerHTML = html;
  return textWithBreaks(div);
}

/** 每位發言者出現最多次的值（顏色、頭像；同次數取先出現的） */
function topByCount(tally: Map<string, Map<string, number>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [speaker, counts] of tally) {
    let best = '';
    let max = 0;
    for (const [value, n] of counts) {
      if (n > max) {
        best = value;
        max = n;
      }
    }
    if (best) out[speaker] = best;
  }
  return out;
}

/** 記一次「這位發言者用了這個值」（不記 system 與空白名稱） */
function countFor(
  tally: Map<string, Map<string, number>>,
  speaker: string,
  value: string | null,
): void {
  if (!value || !speaker || speaker === LOG_SYSTEM_SPEAKER) return;
  let m = tally.get(speaker);
  if (!m) {
    m = new Map();
    tally.set(speaker, m);
  }
  m.set(value, (m.get(value) ?? 0) + 1);
}

const pushUnique = (list: string[], seen: Set<string>, v: string) => {
  if (!seen.has(v)) {
    seen.add(v);
    list.push(v);
  }
};

/**
 * 舊格式（log-converter 2.4）：所有 `p`（也接受 `div`）中含 3 個以上 `span` 的才算一則：
 * 分頁＝第 1 個的文字去頭尾空白、去掉方括號；發言者＝第 2 個的文字去頭尾空白；內容＝第 3 個的 HTML 原文去頭尾空白。
 * 第 3 個的文字去頭尾空白後是空的就略過。名字顏色取段落 style 的 color（log-converter 第 7 節裁定：讀入當初始值）。
 */
export function parseLegacyLog(html: string): CcfoliaLog {
  const doc = parseDoc(html);
  const messages: CcfoliaLogMessage[] = [];
  const channels: string[] = [];
  const speakers: string[] = [];
  const seenC = new Set<string>();
  const seenS = new Set<string>();
  const tally = new Map<string, Map<string, number>>();
  doc.querySelectorAll('p, div').forEach((entry) => {
    const spans = entry.querySelectorAll('span');
    if (spans.length < 3) return;
    const channel = (spans[0].textContent ?? '').trim().replace(/[[\]]/g, '');
    const speaker = (spans[1].textContent ?? '').trim();
    if (!(spans[2].textContent ?? '').trim()) return;
    const content = spans[2].innerHTML.trim();
    const style = entry.getAttribute('style') ?? '';
    const m = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(style);
    const color = m ? normalizeLogColor(m[1]) : null;
    pushUnique(channels, seenC, channel);
    pushUnique(speakers, seenS, speaker);
    countFor(tally, speaker, color);
    messages.push({
      channel,
      speaker,
      system: speaker === LOG_SYSTEM_SPEAKER,
      text: htmlToText(content, doc),
      html: content,
      roll: '',
      color,
      avatar: entry.getAttribute('data-image-url') || null,
      time: null,
      timeMs: null,
    });
  });
  return {
    format: 'legacy',
    title: (doc.title ?? '').trim(),
    roomName: null,
    tabLabel: null,
    channels,
    speakers,
    speakerColors: topByCount(tally),
    messages,
  };
}

/** `<style>` 裡每個 `.avatar-image-N` 的 data URL */
function avatarImages(doc: Document): Map<string, string> {
  const map = new Map<string, string>();
  const re =
    /\.avatar-image-(\d+)\s*\{[^}]*?background-image:\s*url\(\s*["']?(data:[^"')\s]+)["']?\s*\)/g;
  doc.querySelectorAll('style').forEach((el) => {
    const css = el.textContent ?? '';
    for (const m of css.matchAll(re)) map.set(`avatar-image-${m[1]}`, m[2]);
  });
  return map;
}

/**
 * 新格式（log-converter 2.4）：標題以「[…]」結尾時前面是房間名、括號內是分頁標籤；每則的內文（`br` 換成換行）與
 * 擲骰結果（去頭尾空白）都空就略過；發言者＝系統列為 'system'，否則 .speaker 的文字去頭尾空白；
 * 名字顏色取每位發言者出現次數最多的 `--speaker-color`；頭像＝該則 `avatar-image-N` 對應的圖。
 */
export function parseV2Log(html: string): CcfoliaLog {
  const doc = parseDoc(html);
  const title = (doc.querySelector('.log-title')?.textContent || doc.title || '').trim();
  const tm = /^(.*)\s*\[([^[\]]+)\]\s*$/.exec(title);
  const avatars = avatarImages(doc);
  const messages: CcfoliaLogMessage[] = [];
  const channels: string[] = [];
  const speakers: string[] = [];
  const seenC = new Set<string>();
  const seenS = new Set<string>();
  const tally = new Map<string, Map<string, number>>();
  doc.querySelectorAll('article.message').forEach((article) => {
    const channel = article.getAttribute('data-channel') || '';
    if (channel) pushUnique(channels, seenC, channel);
    const system = article.classList.contains('system');
    const scope = article.querySelector('.message-content') ?? article;
    const textEl = scope.querySelector('.message-text');
    const rollEl = scope.querySelector('.roll-result');
    const body = textEl ? textWithBreaks(textEl) : '';
    const roll = rollEl ? (rollEl.textContent ?? '').trim() : '';
    if (!body.trim() && !roll) return;
    const text = body.replace(/\s+$/, '');
    let out = escapeHtml(text).replace(/\r?\n/g, '<br>');
    if (roll) out += (out ? '<br>' : '') + escapeHtml(roll).replace(/\r?\n/g, '<br>');
    const speakerEl = scope.querySelector('.speaker');
    const speaker = system ? LOG_SYSTEM_SPEAKER : (speakerEl?.textContent ?? '').trim();
    let color: string | null = null;
    if (speakerEl && speaker) {
      const m = /--speaker-color:\s*([^;]+)/.exec(speakerEl.getAttribute('style') ?? '');
      color = m ? normalizeLogColor(m[1]) : null;
    }
    countFor(tally, speaker, color);
    pushUnique(speakers, seenS, speaker);
    const avatarEl = article.querySelector('.avatar');
    const cls = avatarEl
      ? [...avatarEl.classList].find((c) => /^avatar-image-\d+$/.test(c))
      : undefined;
    const time = article.querySelector('time')?.getAttribute('datetime') || null;
    const ms = time ? Date.parse(time) : Number.NaN;
    messages.push({
      channel,
      speaker,
      system,
      text,
      html: out,
      roll,
      color,
      avatar: (cls && avatars.get(cls)) || null,
      time,
      timeMs: Number.isNaN(ms) ? null : ms,
    });
  });
  return {
    format: 'v2',
    title,
    roomName: tm ? tm[1].trim() : title || null,
    tabLabel: tm ? tm[2].trim() : null,
    channels,
    speakers,
    speakerColors: topByCount(tally),
    messages,
  };
}

/** 判斷格式後解析（檔案一律以 UTF-8 讀成文字再傳進來） */
export function parseCcfoliaLog(html: string): CcfoliaLog {
  return detectLogFormat(html) === 'v2' ? parseV2Log(html) : parseLegacyLog(html);
}

/* ---------- 新格式的多檔合併（log-converter 2.4） ---------- */

export interface MergedLogMessage extends CcfoliaLogMessage {
  /** 來源檔在輸入陣列裡的索引 */
  source: number;
  /** 排序用的時間（沒有時間的則沿用同一檔前一則的；檔案開頭沒有時用該檔第一個時間；整檔都沒有時 null） */
  sortMs: number | null;
}

export interface MergedCcfoliaLog {
  /** 依時間由早到晚（null 最前）；同時間依來源順序（全分頁檔第一，其餘依選檔順序），同檔依原順序 */
  messages: MergedLogMessage[];
  /** 分頁代碼，依合併後第一次出現的順序（可能含空字串＝沒有分頁代碼） */
  channels: string[];
  /** 分頁代碼 → 名稱（預設名稱＋單分頁檔的標題標籤；沒有的代碼用代碼本身，見 logChannelName） */
  channelNames: Record<string, string>;
  /** 發言者，依合併後第一次出現的順序（含 'system' 與空字串） */
  speakers: string[];
  /** 名字顏色：依來源檔順序取第一個有記錄的 */
  speakerColors: Record<string, string>;
  /** 每位發言者的代表頭像（最常用的那張；同次數取先出現的；不含 system 與空白名稱） */
  mainAvatars: Record<string, string>;
  /** 用到的所有頭像（依第一次出現的順序，不重複） */
  avatars: string[];
  /** 第一個有房間名稱的來源檔的房間名稱 */
  roomName: string | null;
  /** 採用的來源檔（輸入陣列的索引，依來源順序） */
  sources: number[];
  /** 因為「含 2 個以上分頁的檔不只一個」而捨棄的檔（只採用則數最多的一個，log-converter F06） */
  droppedMulti: number[];
  /** 只含一個分頁、而且該分頁已被前面採用的檔涵蓋而捨棄的檔 */
  droppedCovered: number[];
}

export interface MergeLogOptions {
  /** 預設分頁代碼的名稱（例：{ main: '主要', info: '情報', other: '閒聊' }，log-converter F12） */
  defaultChannelNames?: Record<string, string>;
}

/** 分頁代碼的顯示名稱（channelNames 沒有時用代碼本身） */
export function logChannelName(
  merged: Pick<MergedCcfoliaLog, 'channelNames'>,
  code: string,
): string {
  return merged.channelNames[code] || code;
}

/**
 * 合併多個新格式日誌（log-converter 2.4 的「多檔合併」）：
 * 1. 分頁名稱：只含一個分頁而且有分頁標籤（不是「全部」）的檔，以標籤當那個代碼的名稱（後面的檔蓋過前面的）；
 * 2. 來源：含 2 個以上分頁的檔取則數最多的一個（同則數取先選的），其餘捨棄；只含一個分頁的檔依選檔順序，
 *    分頁已被前面採用的檔涵蓋就捨棄，否則採用（沒有分頁代碼的檔一律採用）；
 * 3. 排序、代表頭像、名字顏色、房間名稱見 MergedCcfoliaLog 各欄。
 */
export function mergeCcfoliaLogs(
  files: readonly CcfoliaLog[],
  { defaultChannelNames = {} }: MergeLogOptions = {},
): MergedCcfoliaLog {
  const channelNames: Record<string, string> = { ...defaultChannelNames };
  files.forEach((f) => {
    if (f.channels.length === 1 && f.tabLabel && !isAllTabLabel(f.tabLabel)) {
      channelNames[f.channels[0]] = f.tabLabel;
    }
  });
  const indexed = files.map((f, i) => ({ f, i }));
  const multi = indexed
    .filter(({ f }) => f.channels.length > 1)
    .sort((a, b) => b.f.messages.length - a.f.messages.length);
  const single = indexed.filter(({ f }) => f.channels.length <= 1);
  const sources: number[] = [];
  const droppedCovered: number[] = [];
  const covered = new Set<string>();
  if (multi.length) {
    sources.push(multi[0].i);
    for (const c of multi[0].f.channels) covered.add(c);
  }
  for (const { f, i } of single) {
    const ch = f.channels[0];
    if (!ch || !covered.has(ch)) {
      sources.push(i);
      if (ch) covered.add(ch);
    } else droppedCovered.push(i);
  }

  const merged: (MergedLogMessage & { order: number; rank: number })[] = [];
  sources.forEach((src, rank) => {
    const f = files[src];
    let last = f.messages.find((m) => m.timeMs !== null)?.timeMs ?? null;
    f.messages.forEach((m, order) => {
      if (m.timeMs !== null) last = m.timeMs;
      merged.push({ ...m, source: src, sortMs: last, order, rank });
    });
  });
  merged.sort((a, b) => {
    if (a.sortMs !== b.sortMs) {
      if (a.sortMs === null) return -1;
      if (b.sortMs === null) return 1;
      return a.sortMs - b.sortMs;
    }
    return a.rank - b.rank || a.order - b.order;
  });
  const messages: MergedLogMessage[] = merged.map(({ order: _o, rank: _r, ...m }) => m);

  const channels: string[] = [];
  const speakers: string[] = [];
  const avatars: string[] = [];
  const seenC = new Set<string>();
  const seenS = new Set<string>();
  const seenA = new Set<string>();
  const avatarTally = new Map<string, Map<string, number>>();
  for (const m of messages) {
    pushUnique(channels, seenC, m.channel);
    pushUnique(speakers, seenS, m.speaker);
    if (!m.avatar) continue;
    pushUnique(avatars, seenA, m.avatar);
    countFor(avatarTally, m.speaker, m.avatar);
  }
  const speakerColors: Record<string, string> = {};
  for (const src of sources) {
    for (const [name, color] of Object.entries(files[src].speakerColors)) {
      if (!speakerColors[name]) speakerColors[name] = color;
    }
  }
  const roomName = sources.map((s) => files[s].roomName).find((r) => r) ?? null;
  return {
    messages,
    channels,
    channelNames,
    speakers,
    speakerColors,
    mainAvatars: topByCount(avatarTally),
    avatars,
    roomName,
    sources,
    droppedMulti: multi.slice(1).map(({ i }) => i),
    droppedCovered,
  };
}
