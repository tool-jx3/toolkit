/**
 * CCFOLIA・紀錄的匯入（規格 3.8.6、F81～F84）：房間資料與聊天紀錄 → 一場或多場（劇本、日期、系統、發言者）。
 *
 * CCFOLIA 的外部格式只從 `@/ccfolia` 取：聊天紀錄（舊格式、新格式）用 parseLegacyLog／parseV2Log，房間資料用
 * resolveRoomData／readRoomZip，角色剪貼簿用 parseCharacterClipboard。其他平台的 HTML 與文字紀錄用本檔的通用讀法。
 * 聊天紀錄的解析用 DOMParser（主執行緒；單元測試用 jsdom）。
 */
import {
  detectLogFormat,
  parseCharacterClipboard,
  parseLegacyLog,
  parseV2Log,
  readRoomZip,
  resolveRoomData,
} from '@/ccfolia';
import { localIsoDate, normalizePersonName, type SessionRow } from '@/core/sessions';
import { detectSystemFromText } from './importReport';
import {
  applySelfRole,
  coerceImportValues,
  desmallcaps,
  normalizeImportedRow,
  type PartialRow,
} from './importSheet';

/** 讀進來的檔案（文字或 ZIP 的位元組） */
export interface CcFile {
  name: string;
  text: string;
  /** ZIP 等二進位檔 */
  bytes?: Uint8Array;
  /** 修改時間（毫秒；沒有時 0） */
  mtime: number;
}

export type CcRole = 'pc' | 'pl' | 'kp' | '';

export interface CcSpeaker {
  name: string;
  msgCount: number;
  diceCount: number;
  /** 房間資料裡的角色（棋子） */
  fromJson?: boolean;
  role: CcRole;
}

export interface CcSession {
  /** 檔名的主幹（房間資料與聊天紀錄配對用） */
  base: string;
  scenario: string;
  system: string;
  dateList: string[];
  fallbackDate: string;
  speakers: Map<string, CcSpeaker>;
}

/* ---------- 名稱整理 ---------- */

/** 房間名稱 → 劇本：去掉系統標記、KP 標示、募集狀態 */
export function cleanRoomName(name: unknown): string {
  return String(name ?? '')
    .replace(
      /[【[（(]\s*(coc|coc6|coc7|新?クトゥルフ[^\]】）)]*|エモクロア|マダミス|シノビガミ|インセイン|dx3?|ダブルクロス|sw2\.?5?|ソード・?ワールド)\s*[】\]）)]/gi,
      '',
    )
    .replace(/\s*[/／|｜]\s*(kp|dl|gm)\s*[:：].*/i, '')
    .replace(/\s*(kp|dl|gm)\s*[:：]\s*\S+\s*$/i, '')
    .replace(/\s*[:：]?\s*(募集中?|満卓|クローズ|進行中|終了|済|完走).*/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** 檔名 → 劇本：去副檔名、「[all]」「[ログ]」等標記、結尾的「第 N 回」「part N」「day N」等 */
export function deriveScenarioFromFilename(fileName: string): string {
  return String(fileName ?? '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[[［(（]\s*(all|全部?|完全版?|ログ|log|セッション\s*\d*|まとめ)\s*[\]］)）]/gi, '')
    .replace(
      /[\s_　-]*(?:第?\s*[0-9０-９一二三四五六七八九十百]+\s*(?:陣|回|話|日目|周目)|part\s*\d+|その\s*\d+|day\s*\d+)\s*$/i,
      '',
    )
    .replace(/[\s_　:：\-–—]+$/, '')
    .replace(/[_　]+/g, ' ')
    .trim();
}

/** 檔名的主幹（小寫）：房間資料與聊天紀錄配對用 */
export function ccBaseName(name: string): string {
  return String(name ?? '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[[［(（]\s*(all|全部?|完全版?|ログ|log)\s*[\]］)）]/gi, '')
    .replace(/[\s_　:：\-–—]+$/, '')
    .trim()
    .toLowerCase();
}

/** 發言者名稱：去掉開頭的記號、結尾括號裡的假名讀音，合併空白 */
export function cleanSpeakerName(raw: unknown): string {
  return String(raw ?? '')
    .replace(/^[!！*＊・\s　:：]+/, '')
    .replace(/\s*[（(][ぁ-んァ-ヶ゛゜ー\s]+[)）]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 不是人名的發言者（只有數字、裝飾記號開頭、HO1、OP、幕間…） */
export function isNoiseSpeaker(name: string): boolean {
  const n = cleanSpeakerName(name);
  if (!n) return true;
  if (!/[ぁ-んァ-ヶ一-龠a-zA-Z]/.test(n)) return true;
  if (/^\d{1,3}$/.test(n)) return true;
  if (/^[＜〈《【▌■◆◇●○□★☆※▲△▼▽➤▸▶►◀]/.test(n)) return true;
  if (/[＜〈《][^＞〉》]{1,12}[＞〉》]/.test(n) && n.length <= 16) return true;
  if (/^ho\s*\d+\s*(主|副|表|裏|＜|:|：)?\s*$/i.test(n)) return true;
  if (
    /^(prologue|epilogue|opening|ending|op|ed|導入|クロージング|オープニング|エンディング|幕間|中入り|休憩)$/i.test(
      n,
    )
  )
    return true;
  return false;
}

/** KP、GM、DL、副 KP、戰鬥用 KP…（身分標籤，不算 PC） */
export const CC_ROLE_LABEL_RE =
  /^\s*(?:sub|サブ|副|戦闘用?|バトル|裏方?|進行)?\s*(?:kpc?|skp|dl|gmc?|game\s*master|master|マスター|キーパー|ディーラー|ゲームマスター?|ゲームマスタ)\s*(?:[（(][^）)]*[）)])?\s*$/i;

const SYSTEM_SPEAKER_RE = /^(system|システム|bcdice|dicebot|ダイスbot|ダイス(ロール)?|情報)$/i;
const NPC_RE = /\bNPC\b|ＮＰＣ|モブ|背景|エキストラ/i;

/** 擲骰的寫法（NdM、CCB<=、SCC、1d100、判定結果…） */
export const DICE_RE =
  /\b\d{0,2}[dD]\d{1,3}\b|ccb?<=|\bscc?\b|1d100|→\s*(決定的成功|致命的失敗|クリティカル|ファンブル|スペシャル|成功|失敗)|【\s*(判定|技能|SAN)/i;

/** 擲骰 20 次以上才算 PC */
export const CC_PC_DICE_THRESHOLD = 20;

/* ---------- 房間資料 ---------- */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

function walkJson(node: unknown, cb: (node: Obj) => void, depth = 0): void {
  if (node == null || depth > 8) return;
  if (Array.isArray(node)) {
    if (node.length < 4000) for (const n of node) walkJson(n, cb, depth + 1);
    return;
  }
  if (typeof node === 'object') {
    cb(node as Obj);
    for (const v of Object.values(node as Obj)) walkJson(v, cb, depth + 1);
  }
}

/** 一般 JSON 的房間名稱（舊版的找法） */
function findRoomNameGeneric(data: unknown): string {
  let found = '';
  walkJson(data, (node) => {
    if (found) return;
    const d = node.data;
    if (node.kind === 'room' && isObj(d) && typeof d.name === 'string') {
      found = d.name;
      return;
    }
    if (
      typeof node.name === 'string' &&
      node.name.trim() &&
      node.name.length < 120 &&
      (Array.isArray(node.characters) ||
        node.mediaList ||
        node.screenName ||
        node.roomId ||
        node.bgmUrl !== undefined)
    ) {
      found = node.name;
    }
  });
  if (!found && isObj(data) && isObj(data.data) && typeof data.data.name === 'string')
    found = data.data.name;
  return found.trim();
}

/** 一般 JSON 的角色名稱（舊版的找法） */
function collectCharactersGeneric(data: unknown, into: Set<string>): void {
  walkJson(data, (node) => {
    const d = node.data;
    if (
      (node.kind === 'character' || node.type === 'character') &&
      isObj(d) &&
      typeof d.name === 'string'
    )
      into.add(d.name.trim());
    if (Array.isArray(node.characters)) {
      for (const c of node.characters)
        if (isObj(c) && typeof c.name === 'string' && c.name.trim()) into.add(c.name.trim());
    }
  });
}

/** JSON → 房間名稱與角色（CCFOLIA 房間資料、角色剪貼簿用共用層；其他照舊版的找法） */
export function roomClues(
  json: unknown,
  text?: string,
): { roomName: string; characters: string[] } {
  if (text !== undefined) {
    const clip = parseCharacterClipboard(text);
    if (clip.ok) return { roomName: '', characters: [clip.character.name.trim()].filter(Boolean) };
  }
  const { entities, room } = resolveRoomData(json);
  if (entities && isObj(json) && (json.entities || json.data || 'characters' in entities)) {
    const chars = entities.characters;
    const list = Array.isArray(chars) ? chars : isObj(chars) ? Object.values(chars) : [];
    const names = list
      .filter(isObj)
      .map((c) => (typeof c.name === 'string' ? c.name.trim() : ''))
      .filter(Boolean);
    const roomName = room && typeof room.name === 'string' ? room.name.trim() : '';
    if (names.length || roomName) return { roomName, characters: [...new Set(names)] };
  }
  const set = new Set<string>();
  collectCharactersGeneric(json, set);
  return { roomName: findRoomNameGeneric(json), characters: [...set] };
}

/* ---------- 聊天紀錄 ---------- */

export interface ChatLine {
  name: string;
  text: string;
  /** 整行文字（找時間戳記、判斷系統） */
  full: string;
}

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();
const pad2 = (n: number) => String(n).padStart(2, '0');

/** 毫秒時間戳 → 本地的「YYYY-MM-DD HH:MM」 */
function stamp(ms: number): string {
  const d = new Date(ms);
  return `${localIsoDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 其他平台的 HTML：每個段落、表格列一行（span 2 個以上時取發言者與內容） */
function genericHtmlLines(doc: Document): ChatLine[] {
  return [...doc.querySelectorAll('p, tr, div.log, .p-log__row')]
    .map((el) => {
      const spans = [...el.querySelectorAll('span')].map((s) => collapse(s.textContent ?? ''));
      const full = collapse(el.textContent ?? '');
      if (spans.length >= 3) return { name: spans[1], text: spans.slice(2).join(' '), full };
      if (spans.length === 2) return { name: spans[0], text: spans[1], full };
      return { name: '', text: full, full };
    })
    .filter((r) => r.full);
}

/** 聊天紀錄 → 標題與每一行 */
export function chatLogLines(text: string): { title: string; lines: ChatLine[] } {
  if (/<(p|body|html|div|table|article)\b/i.test(text)) {
    if (detectLogFormat(text) === 'v2') {
      const log = parseV2Log(text);
      return {
        title: log.roomName?.trim() || log.title,
        lines: log.messages.map((m) => {
          const body = m.roll ? `${m.text}\n${m.roll}` : m.text;
          const ts = m.timeMs !== null ? `[${stamp(m.timeMs)}] ` : '';
          return { name: m.speaker, text: body, full: collapse(`${ts}${m.speaker} : ${body}`) };
        }),
      };
    }
    const legacy = parseLegacyLog(text);
    if (legacy.messages.length) {
      return {
        title: legacy.title,
        lines: legacy.messages.map((m) => ({
          name: m.speaker,
          text: m.text,
          full: collapse(`[${m.channel}] ${m.speaker} : ${m.text}`),
        })),
      };
    }
    const doc = new DOMParser().parseFromString(text, 'text/html');
    return {
      title: (doc.querySelector('title')?.textContent ?? '').trim(),
      lines: genericHtmlLines(doc),
    };
  }
  return {
    title: '',
    lines: text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => ({ name: '', text: l, full: l })),
  };
}

const ISO_TS_RE = /^\s*[[［]?\s*(20\d{2})[-/](\d{1,2})[-/](\d{1,2})[ T]\d{1,2}:\d{2}/;
const ANY_TS_RE = /(20\d{2})[-/](\d{1,2})[-/](\d{1,2})[ T]\d{1,2}:\d{2}/;

/** 系統：先看劇本名稱，再看內文的擲骰寫法 */
export function detectLogSystem(scenario: string, body: string): string {
  const named = detectSystemFromText(scenario);
  if (named) return named;
  const t = desmallcaps(body).normalize('NFKC');
  if (/エモクロア|emoklore/i.test(t)) return 'エモクロア';
  const ccb = (t.match(/(?:^|[^a-z])ccb\s*(?:<=|＜＝|\()/gi) ?? []).length;
  const cc = (t.match(/(?:^|[^a-z])cc\s*(?:\([^)]*\))?\s*(?:<=|＜＝|\()/gi) ?? []).length;
  if (ccb || cc) return ccb >= cc ? 'CoC 6版' : 'CoC 7版';
  const pool = (t.match(/\b[1-9]\s*d6\b/gi) ?? []).length;
  if (pool >= 6 && /成功数|決定的成功|フルスペック|◇+/.test(t)) return 'エモクロア';
  return detectSystemFromText(t.slice(0, 20000));
}

/** 一份聊天紀錄 → 一場 */
export function parseChatLog(file: Pick<CcFile, 'name' | 'text' | 'mtime'>): CcSession {
  const speakers = new Map<string, CcSpeaker>();
  const diceDates = new Set<string>();
  const allDates = new Set<string>();
  let body = '';
  let firstDate = '';
  const { title, lines } = chatLogLines(file.text);
  const scenario = title && title !== 'ccfolia - logs' ? cleanRoomName(title) : '';
  const isoCount = lines.filter((r) => ISO_TS_RE.test(r.full)).length;
  const anyCount = lines.filter((r) => ANY_TS_RE.test(r.full)).length;
  const useTs = (isoCount >= 10 && isoCount >= lines.length * 0.4) || anyCount >= 3;
  for (const { name: rawName, text, full } of lines) {
    body += `${full}\n`;
    let lineDate = '';
    if (useTs) {
      const m = ANY_TS_RE.exec(full);
      if (m) {
        lineDate = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
        allDates.add(lineDate);
        if (!firstDate) firstDate = lineDate;
      }
    }
    let nm = cleanSpeakerName(rawName);
    let msg = text;
    if (!nm) {
      const cleaned = text
        .replace(/^\s*[[［][^\]］]*[\]］]\s*/, '')
        .replace(/^\s*\d{1,2}:\d{2}(?::\d{2})?\s*/, '');
      const m = /^([^:：\n]{1,24}?)\s*[:：]\s+(\S.*)$/.exec(cleaned);
      if (!m) continue;
      nm = cleanSpeakerName(m[1]);
      msg = m[2];
    }
    if (!nm || nm.length > 24) continue;
    if (SYSTEM_SPEAKER_RE.test(nm) || isNoiseSpeaker(nm)) continue;
    let s = speakers.get(nm);
    if (!s) {
      s = { name: nm, msgCount: 0, diceCount: 0, role: '' };
      speakers.set(nm, s);
    }
    s.msgCount++;
    if (DICE_RE.test(msg)) {
      s.diceCount++;
      if (lineDate) diceDates.add(lineDate);
    }
  }
  const scen = scenario || deriveScenarioFromFilename(file.name);
  return {
    base: ccBaseName(file.name),
    scenario: scen,
    system: detectLogSystem(scen, body),
    dateList: [...(diceDates.size ? diceDates : allDates)].sort(),
    fallbackDate: firstDate || (file.mtime ? localIsoDate(new Date(file.mtime)) : ''),
    speakers,
  };
}

/* ---------- 多個檔案 → 場次 ---------- */

/** JSON 檔的判斷：副檔名 .json，或以「{」開頭、前 600 字內有常見的鍵 */
export const looksLikeJson = (f: Pick<CcFile, 'name' | 'text'>): boolean =>
  /\.json$/i.test(f.name) || /^\s*\{[\s\S]{0,600}"(kind|data|characters|name|params)"/.test(f.text);

export const isZipFile = (f: Pick<CcFile, 'name' | 'bytes'>): boolean =>
  /\.zip$/i.test(f.name) ||
  (!!f.bytes && f.bytes[0] === 0x50 && f.bytes[1] === 0x4b && f.bytes[2] === 0x03);

/** 檔案 → 場次（房間資料的線索套到每一場；只有房間資料時當成一場） */
export function analyzeFiles(files: readonly CcFile[]): CcSession[] {
  let jsonRoom = '';
  const jsonChars = new Set<string>();
  const charsByBase = new Map<string, Set<string>>();
  const logFiles: CcFile[] = [];
  const addClues = (base: string, json: unknown, text?: string) => {
    const { roomName, characters } = roomClues(json, text);
    if (roomName && !jsonRoom) jsonRoom = cleanRoomName(roomName);
    for (const nm of characters) {
      const clean = cleanSpeakerName(nm);
      if (!clean || clean.length > 24 || isNoiseSpeaker(clean)) continue;
      jsonChars.add(clean);
      let set = charsByBase.get(base);
      if (!set) {
        set = new Set();
        charsByBase.set(base, set);
      }
      set.add(clean);
    }
  };
  for (const f of files) {
    if (isZipFile(f)) {
      try {
        const { json } = readRoomZip(f.bytes ?? new TextEncoder().encode(f.text));
        if (json !== null) addClues(ccBaseName(f.name), json);
      } catch {
        /* 不是有效的 ZIP，略過 */
      }
      continue;
    }
    if (looksLikeJson(f)) {
      try {
        addClues(ccBaseName(f.name), JSON.parse(f.text.replace(/^﻿/, '')), f.text);
      } catch {
        /* 不是有效的 JSON，略過 */
      }
      continue;
    }
    logFiles.push(f);
  }
  let sessions = logFiles.map(parseChatLog);
  if (!sessions.length && (jsonRoom || jsonChars.size)) {
    const latest = files.reduce((m, f) => Math.max(m, f.mtime || 0), 0);
    sessions = [
      {
        base: '',
        scenario: jsonRoom,
        system: jsonRoom ? detectSystemFromText(jsonRoom) : '',
        dateList: [],
        fallbackDate: latest ? localIsoDate(new Date(latest)) : '',
        speakers: new Map(),
      },
    ];
  }
  for (const session of sessions) {
    if (!session.scenario && jsonRoom) session.scenario = jsonRoom;
    if (!session.system && jsonRoom)
      session.system = detectSystemFromText(jsonRoom) || session.system;
    const chars = sessions.length === 1 ? jsonChars : charsByBase.get(session.base);
    for (const nm of chars ?? []) {
      const s = session.speakers.get(nm);
      if (s) s.fromJson = true;
      else
        session.speakers.set(nm, { name: nm, msgCount: 0, diceCount: 0, fromJson: true, role: '' });
    }
  }
  return sessions;
}

/* ---------- 發言者 → 身分 ---------- */

/** 自動指定（3.8.6） */
export function autoRole(s: CcSpeaker, self: ReadonlySet<string>): CcRole {
  if (CC_ROLE_LABEL_RE.test(s.name)) return 'kp';
  if (NPC_RE.test(s.name)) return '';
  if (s.fromJson) return 'pc';
  if (self.has(normalizePersonName(s.name)) && s.diceCount < CC_PC_DICE_THRESHOLD) return 'kp';
  return s.diceCount >= CC_PC_DICE_THRESHOLD ? 'pc' : '';
}

/** 發言者清單：棋子＋發言 2 次以上或擲骰 1 次以上的人，依擲骰、發言、棋子排序，並自動指定 */
export function speakerList(session: CcSession, self: ReadonlySet<string>): CcSpeaker[] {
  return [...session.speakers.values()]
    .filter((s) => s.fromJson || s.msgCount >= 2 || s.diceCount >= 1)
    .map((s, i) => ({ s, i }))
    .sort(
      (a, b) =>
        b.s.diceCount - a.s.diceCount ||
        b.s.msgCount - a.s.msgCount ||
        (b.s.fromJson ? 1 : 0) - (a.s.fromJson ? 1 : 0) ||
        a.i - b.i,
    )
    .map(({ s }) => ({ ...s, role: autoRole(s, self) }));
}

const uniq = (list: string[]) => [...new Set(list)];
const namesWith = (speakers: readonly CcSpeaker[], role: CcRole) =>
  speakers.filter((s) => s.role === role).map((s) => s.name);

/** 表單的 GM：KP・GM 的名字（身分標籤除外，去重複） */
export const formGm = (speakers: readonly CcSpeaker[]): string =>
  uniq(namesWith(speakers, 'kp').filter((n) => !CC_ROLE_LABEL_RE.test(n))).join('、');

/** 表單的 PL */
export const formPl = (speakers: readonly CcSpeaker[]): string =>
  uniq(namesWith(speakers, 'pl')).join('、');

/** 表單的身分 */
export function formRole(speakers: readonly CcSpeaker[], self: ReadonlySet<string>): string {
  const isSelf = (n: string) => self.has(normalizePersonName(n));
  const kp = namesWith(speakers, 'kp');
  if (kp.some(isSelf) || (kp.length && !speakers.some((s) => s.role === 'pc' && isSelf(s.name))))
    return 'KP';
  if (speakers.some((s) => (s.role === 'pc' || s.role === 'pl') && isSelf(s.name))) return 'PL';
  return kp.length ? 'PL' : '';
}

/** 單場表單的內容 */
export interface CcForm {
  scenario: string;
  date: string;
  system: string;
  role: string;
  gm: string;
  players: string;
}

/** 一場 → 表單的初始值與發言者 */
export function sessionForm(
  session: CcSession,
  self: ReadonlySet<string>,
): {
  form: CcForm;
  speakers: CcSpeaker[];
  detected: { scenario: string; date: string; system: string };
} {
  const speakers = speakerList(session, self);
  const date = session.dateList.length ? session.dateList.join(', ') : session.fallbackDate;
  return {
    speakers,
    detected: { scenario: session.scenario, date, system: session.system },
    form: {
      scenario: session.scenario,
      date,
      system: session.system,
      role: formRole(speakers, self),
      gm: formGm(speakers),
      players: formPl(speakers),
    },
  };
}

/** 表單 → 一團（劇本、PC、GM 都沒有時 null；空白的劇本、日期、系統退回偵測值） */
export function formRow(
  form: CcForm,
  speakers: readonly CcSpeaker[],
  detected: { scenario: string; date: string; system: string },
): PartialRow | null {
  const pcs = namesWith(speakers, 'pc');
  const scenario = (form.scenario || detected.scenario || '').trim();
  const gm = form.gm.trim();
  if (!scenario && !pcs.length && !gm) return null;
  return {
    scenario,
    date: (form.date || detected.date || '').trim(),
    system: (form.system || detected.system || '').trim(),
    role: form.role.trim(),
    gm,
    players: form.players.trim(),
    pc: pcs.join(' / '),
  };
}

/** 多場時每一場的列（3.8.6 最後一點） */
export function sessionRow(session: CcSession, self: ReadonlySet<string>): PartialRow {
  const list = speakerList(session, self);
  const isSelf = (n: string) => self.has(normalizePersonName(n));
  const kp = uniq(namesWith(list, 'kp').filter((n) => !CC_ROLE_LABEL_RE.test(n)));
  const pl = uniq(namesWith(list, 'pl'));
  const pc = namesWith(list, 'pc');
  let role = '';
  if (kp.some(isSelf)) role = 'KP';
  else if (pc.concat(pl).some(isSelf)) role = 'PL';
  else if (kp.length) role = 'PL';
  return {
    date: session.dateList.length ? session.dateList.join(', ') : session.fallbackDate || '',
    scenario: session.scenario,
    system: session.system,
    role,
    gm: kp.join('、'),
    players: pl.join('、'),
    pc: pc.join(' / '),
  };
}

/** 轉成試算表格線的七欄 */
export const CC_SHEET_FIELDS = [
  'date',
  'scenario',
  'system',
  'role',
  'gm',
  'players',
  'pc',
] as const;

/** 一團（部分欄位）→ 格線的一列（整理後的值；日期以「, 」連接） */
export function rowToCells(row: PartialRow, self: ReadonlySet<string>): string[] {
  const applied: SessionRow = normalizeImportedRow(
    applySelfRole(coerceImportValues({ ...row }), self),
  );
  return CC_SHEET_FIELDS.map((key) => {
    if (key === 'date') return applied.dates.length ? applied.dates.join(', ') : applied.date || '';
    return String(applied[key] ?? '');
  });
}
