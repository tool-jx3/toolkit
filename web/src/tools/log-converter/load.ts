/**
 * 載入日誌（規格 1.1、2.3、2.4）：選檔後判斷格式、舊格式只用第一個檔、新格式多檔合併、加入／移除檔案、分頁改名，
 * 以及載入時自動帶入的值（標題、旁白角色、閒聊分頁、名稱顏色）。
 *
 * 解析與合併用 `@/ccfolia`（共用層）；這裡只做工具自己的規則。舊格式的訊息內容在這裡用 DOMPurify 淨化一次，
 * 之後的轉換只拿淨化過的 HTML。
 */
import {
  type CcfoliaLog,
  detectLogFormat,
  LOG_SYSTEM_SPEAKER,
  logChannelName,
  type MergedCcfoliaLog,
  mergeCcfoliaLogs,
  parseCcfoliaLog,
} from '@/ccfolia';
import { formatHex, parseColor } from '@/core/color';
import { sanitizeLogHtml } from './sanitize';
import { NAME_COLOR_POOL } from './settings';

export type LogFormat = 'legacy' | 'v2';

/** 一則訊息（兩種格式整理成同一個樣子） */
export interface SourceMessage {
  /** 分頁名稱（舊格式是方括號裡的文字；新格式是代碼對應的名稱）。分頁的設定都以名稱為準 */
  tab: string;
  /** 新格式的分頁代碼（舊格式同 tab） */
  channel: string;
  speaker: string;
  /** CCFOLIA 代發的系統列 */
  system: boolean;
  /** 新格式的擲骰結果（舊格式一律空字串） */
  roll: string;
  /** 輸出用的內容 HTML（舊格式已淨化；新格式本來就是跳脫過的純文字） */
  html: string;
  /** 舊格式判斷擲骰用的原文（2.5 第 3 條） */
  rawHtml: string;
  /** 新格式這一則的頭像（原圖的 data URL） */
  avatar: string | null;
}

export interface LoadedFile {
  name: string;
  log: CcfoliaLog;
}

export interface LegacySource {
  format: 'legacy';
  fileName: string;
  log: CcfoliaLog;
  messages: SourceMessage[];
}

export interface V2Source {
  format: 'v2';
  files: LoadedFile[];
  merged: MergedCcfoliaLog;
  /** 使用者改過的分頁名稱（代碼 → 名稱）；加入、移除檔案後照樣保留（第 5 節第 9 項） */
  renames: Record<string, string>;
  messages: SourceMessage[];
}

export type LogSource = LegacySource | V2Source;

/** 新格式預設分頁代碼的名稱（F12）；沒有分頁代碼的訊息歸在「其他」 */
export const DEFAULT_CHANNEL_NAMES: Readonly<Record<string, string>> = Object.freeze({
  main: '主要',
  info: '情報',
  other: '閒聊',
  '': '其他',
});

/** 載入時自動選為閒聊分頁的名稱，依序比對（F19） */
export const CHAT_TAB_NAMES = ['잡담', '閒聊', '雜談', '雑談'] as const;

/* ---------- 讀入 ---------- */

export interface InputFile {
  name: string;
  text: string;
}

export type LoadNotice =
  | { kind: 'legacy-one'; first: string; rest: number }
  | { kind: 'mixed'; excluded: number }
  | { kind: 'multi-all'; count: number };

export type LoadResult =
  | { ok: true; source: LogSource; notices: LoadNotice[] }
  | { ok: false; error: 'empty' };

/** 新格式的分頁名稱：使用者改過的名稱優先，其次是合併時決定的名稱（預設名稱、單分頁檔的標題），再沒有就是代碼 */
export function channelDisplayName(
  source: Pick<V2Source, 'merged' | 'renames'>,
  code: string,
): string {
  const renamed = source.renames[code];
  if (renamed) return renamed;
  return logChannelName(source.merged, code);
}

function v2Messages(merged: MergedCcfoliaLog, renames: Record<string, string>): SourceMessage[] {
  const names = new Map<string, string>();
  const nameOf = (code: string) => {
    let n = names.get(code);
    if (n === undefined) {
      n = channelDisplayName({ merged, renames }, code);
      names.set(code, n);
    }
    return n;
  };
  return merged.messages.map((m) => ({
    tab: nameOf(m.channel),
    channel: m.channel,
    speaker: m.speaker,
    system: m.system,
    roll: m.roll,
    html: m.html,
    rawHtml: m.html,
    avatar: m.avatar,
  }));
}

function legacyMessages(log: CcfoliaLog): SourceMessage[] {
  return log.messages.map((m) => ({
    tab: m.channel,
    channel: m.channel,
    speaker: m.speaker,
    system: m.system,
    roll: '',
    html: sanitizeLogHtml(m.html),
    rawHtml: m.html,
    avatar: m.avatar,
  }));
}

/** 用已解析的新格式檔組出（或重新組出）來源；沒有任何訊息時回傳 null */
export function buildV2Source(
  files: LoadedFile[],
  renames: Record<string, string> = {},
): V2Source | null {
  const merged = mergeCcfoliaLogs(
    files.map((f) => f.log),
    { defaultChannelNames: { ...DEFAULT_CHANNEL_NAMES } },
  );
  if (!merged.messages.length) return null;
  const kept: Record<string, string> = {};
  for (const [code, name] of Object.entries(renames))
    if (merged.channels.includes(code)) kept[code] = name;
  return { format: 'v2', files, merged, renames: kept, messages: v2Messages(merged, kept) };
}

/**
 * 選檔（F01～F06、F10）：有新格式就只用新格式（F05）並合併（F04、F06）；
 * 都是舊格式時只用第一個檔（F03）。新格式一則都沒有時回傳錯誤（F10）；舊格式沒有訊息時照樣載入。
 */
export function loadLogFiles(inputs: readonly InputFile[]): LoadResult {
  const notices: LoadNotice[] = [];
  const v2 = inputs.filter((f) => detectLogFormat(f.text) === 'v2');
  if (v2.length) {
    if (v2.length !== inputs.length)
      notices.push({ kind: 'mixed', excluded: inputs.length - v2.length });
    const files = v2.map((f) => ({ name: f.name, log: parseCcfoliaLog(f.text) }));
    const source = buildV2Source(files);
    if (!source) return { ok: false, error: 'empty' };
    if (source.merged.droppedMulti.length)
      notices.push({ kind: 'multi-all', count: source.merged.droppedMulti.length + 1 });
    return { ok: true, source, notices };
  }
  const first = inputs[0];
  if (inputs.length > 1)
    notices.push({ kind: 'legacy-one', first: first.name, rest: inputs.length - 1 });
  const log = parseCcfoliaLog(first.text);
  return {
    ok: true,
    source: { format: 'legacy', fileName: first.name, log, messages: legacyMessages(log) },
    notices,
  };
}

/** F08 的「重複檔」：分頁組合與則數都相同 */
export const fileSignature = (log: CcfoliaLog): string =>
  `${[...log.channels].sort().join(',')}|${log.messages.length}`;

export type AddResult =
  | { ok: true; source: V2Source; added: number; skipped: number; excluded: number }
  | { ok: false; reason: 'mismatch' | 'duplicate'; skipped: number; excluded: number };

/** 加入檔案（F08）：只收新格式；與已載入的檔重複的略過 */
export function addLogFiles(source: V2Source, inputs: readonly InputFile[]): AddResult {
  const v2 = inputs.filter((f) => detectLogFormat(f.text) === 'v2');
  const excluded = inputs.length - v2.length;
  if (!v2.length) return { ok: false, reason: 'mismatch', skipped: 0, excluded };
  const known = new Set(source.files.map((f) => fileSignature(f.log)));
  const fresh: LoadedFile[] = [];
  for (const f of v2) {
    const log = parseCcfoliaLog(f.text);
    const sig = fileSignature(log);
    if (known.has(sig)) continue;
    known.add(sig);
    fresh.push({ name: f.name, log });
  }
  const skipped = v2.length - fresh.length;
  if (!fresh.length) return { ok: false, reason: 'duplicate', skipped, excluded };
  const next = buildV2Source([...source.files, ...fresh], source.renames);
  if (!next) return { ok: false, reason: 'duplicate', skipped, excluded };
  return { ok: true, source: next, added: fresh.length, skipped, excluded };
}

/** 移除檔案（F09）：去掉那個檔重新合併；一個都不剩（或剩下的檔沒有訊息）時回傳 null（回到未載入） */
export function removeLogFile(source: V2Source, index: number): V2Source | null {
  const files = source.files.filter((_, i) => i !== index);
  if (!files.length) return null;
  return buildV2Source(files, source.renames);
}

/**
 * 分頁改名（F54）：名稱清空＝用代碼；改成和其他分頁相同的名稱時兩者合併成一個分頁。
 * 回傳新的來源與改名前後的分頁名稱（工具用來搬移以名稱為準的設定）。
 */
export function renameChannel(
  source: V2Source,
  code: string,
  name: string,
): { source: V2Source; from: string; to: string } {
  const from = channelDisplayName(source, code);
  const to = name.trim() || code;
  const renames = { ...source.renames, [code]: to };
  return {
    source: { ...source, renames, messages: v2Messages(source.merged, renames) },
    from,
    to,
  };
}

/** 檔案在合併時有沒有被採用（全分頁檔只採用一份、單分頁檔被涵蓋就捨棄） */
export function fileUsage(source: V2Source, index: number): 'used' | 'dropped-multi' | 'covered' {
  if (source.merged.droppedMulti.includes(index)) return 'dropped-multi';
  if (source.merged.droppedCovered.includes(index)) return 'covered';
  return 'used';
}

/* ---------- 由來源整理出的清單 ---------- */

/** 分頁名稱，依第一次出現的順序（改名合併後不重複） */
export function sourceTabs(source: LogSource): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const list =
    source.format === 'legacy'
      ? source.log.channels
      : source.merged.channels.map((c) => channelDisplayName(source, c));
  for (const t of list) {
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/**
 * 發言者清單（旁白選單、名稱顏色、頭像卡、副旁白）：依第一次出現的順序，不含 system；
 * 舊格式保留沒有名稱的發言者（以代表空白的字樣顯示），新格式不含空白名稱（2.4）。
 */
export function sourceSpeakers(source: LogSource): string[] {
  const list = source.format === 'legacy' ? source.log.speakers : source.merged.speakers;
  return list.filter((s) => s !== LOG_SYSTEM_SPEAKER && (source.format === 'legacy' || s !== ''));
}

/** 每位發言者每則訊息裡的頭像次數最多的那張（新格式的代表頭像，F30 關閉時用） */
export function sourceMainAvatars(source: LogSource): Record<string, string> {
  return source.format === 'v2' ? source.merged.mainAvatars : {};
}

/** 新格式日誌裡用到的所有頭像（原圖） */
export function sourceAvatars(source: LogSource): string[] {
  return source.format === 'v2' ? source.merged.avatars : [];
}

/** 每個分頁的則數（分頁名稱編輯器） */
export function channelCounts(source: V2Source): { code: string; name: string; count: number }[] {
  return source.merged.channels.map((code) => ({
    code,
    name: channelDisplayName(source, code),
    count: source.merged.messages.filter((m) => m.channel === code).length,
  }));
}

/* ---------- 載入時自動帶入的值 ---------- */

/** 舊格式從檔名帶入標題與副標題（F11、3.2） */
export function titleFromFileName(fileName: string): { title: string; subtitle: string } {
  const base = fileName.replace(/\.html?$/i, '');
  const t = /\]\s*(.*?)\s*\[/.exec(base);
  const s = /^\[(.*?)\]/.exec(base);
  return { title: t ? t[1] : base, subtitle: s ? s[1] : '' };
}

/** 自動選閒聊分頁（F19）：依序比對閒聊的名稱；都沒有時選 other；否則不指定（null） */
export function autoChatTab(tabs: readonly string[]): string | null {
  for (const name of CHAT_TAB_NAMES) if (tabs.includes(name)) return name;
  return tabs.includes('other') ? 'other' : null;
}

/** 自動選旁白角色（F16，第 5 節第 1 項修正）：有 GM 就選 GM，否則用預設的 GM 選項（null） */
export function autoNarrator(speakers: readonly string[]): string | null {
  return speakers.includes('GM') ? 'GM' : null;
}

const toHex6 = (c: string): string | null => {
  const p = parseColor(c);
  return p ? formatHex({ ...p, a: 1 }) : null;
};

/** 名稱顏色的初始值（F32）：日誌記錄的顏色，沒有時依出現順序從 5 色輪流給 */
export function initialNameColors(source: LogSource): Record<string, string> {
  const recorded =
    source.format === 'legacy' ? source.log.speakerColors : source.merged.speakerColors;
  const out: Record<string, string> = {};
  sourceSpeakers(source).forEach((speaker, i) => {
    const c = recorded[speaker] ? toHex6(recorded[speaker]) : null;
    out[speaker] = c ?? NAME_COLOR_POOL[i % NAME_COLOR_POOL.length];
  });
  return out;
}

/** 新格式的房間名稱（標題空白時帶入，F11） */
export const sourceRoomName = (source: LogSource): string | null =>
  source.format === 'v2' ? source.merged.roomName : null;

/* ---------- 標題與檔名（3.2） ---------- */

/** 檔名主體清理不出東西時的後備檔名 */
export const FALLBACK_FILE_BASE = '跑團日誌';

/** 檔名主體的清理：`\ / : * ? " < > |` 換成「_」、去頭尾空白、合併連續的「_」、去頭尾的「_」 */
export function cleanFileBase(text: string): string {
  const out = text
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return out || FALLBACK_FILE_BASE;
}

/** 檔名主體：標題 → 新格式的房間名稱 → 檔名（去掉 .html，不清理） */
export function fileBaseFor(title: string, source: LogSource): string {
  if (title.trim()) return cleanFileBase(title);
  const room = sourceRoomName(source);
  if (room) return cleanFileBase(room);
  const name = source.format === 'legacy' ? source.fileName : (source.files[0]?.name ?? '');
  return name.replace(/\.html?$/i, '') || FALLBACK_FILE_BASE;
}

/** 成品的標題（3.2）：標題欄照原樣；空白時從檔名主體取「]」與其後「[」之間的文字；再沒有就是預設標題 */
export function outputTitle(title: string, fileBase: string, defaultTitle: string): string {
  if (title !== '') return title;
  const m = /\]\s*(.*?)\s*\[/.exec(fileBase);
  return m ? m[1] : defaultTitle;
}
