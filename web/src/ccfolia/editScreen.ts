/**
 * CCFOLIA「キャラクター編集」對話框整頁複製下來的文字（外部格式事實，character-editor 規格 2.2）。
 *
 * 日文介面的 CCFOLIA 打開角色的編輯對話框、全選複製，得到「一個標籤或一個值各佔一行」的純文字。下面的日文字樣是
 * CCFOLIA 介面上的文字（解析用的錨點，照原樣比對；不是給使用者看的字）。只認日文介面：其他介面語言沒有可靠的事實依據，
 * 依主控裁定不猜。依原作（organon-torah/ccfoliaCharacterEditor 的 editScreenText.ts）的規則改寫，並修正
 * 「狀態標籤空白時把『現在値』當成標籤」的問題（規格 5. 與第 7 節裁定，附件 E06）。
 */
import { type CcfoliaCharacter, normalizeCharacter } from './characterData';

/** 編輯對話框的錨點字樣（CCFOLIA 日文介面；依原作的解析規則，2026-10 整理） */
export const EDIT_SCREEN = Object.freeze({
  /** 開頭標記（取最後一個整行相符的） */
  marker: 'キャラクター編集',
  name: '名前',
  initiative: 'イニシアティブ',
  size: '駒サイズ',
  x: 'x',
  y: 'y',
  externalUrl: '参照URL',
  faces: '立ち絵・差分',
  status: 'ステータス',
  params: 'パラメータ',
  commands: 'チャットパレット',
  label: 'ラベル',
  current: '現在値',
  max: '最大値',
  value: '値',
  /** 狀態、參數、聊天面板段落開頭的說明文字 */
  statusHelp: 'HPやMPなどのキャラクターに連動して変動するステータスを設定します。',
  paramsHelp: 'キャラクターに対してめったに変動しないパラメータを設定します。',
  commandsHelp:
    '1d100 などのダイスコマンドやキャラクターに紐づくチャットコマンドを改行区切りで登録します。',
  /** 聊天面板之後的三個勾選項與說明（聊天面板到這裡為止） */
  checkboxes: Object.freeze([
    'ステータスを非公開にする',
    '秘匿NPC・敵キャラクターなど',
    '発言時キャラクターを表示しない',
    '盤面キャラクター一覧に表示しない',
  ]),
});

/** 清理段落時刪掉的整行字樣（段落標題與勾選項） */
const SECTION_TITLES = new Set<string>([
  EDIT_SCREEN.faces,
  EDIT_SCREEN.status,
  EDIT_SCREEN.params,
  EDIT_SCREEN.commands,
  ...EDIT_SCREEN.checkboxes,
]);

export type CharacterEditScreenResult =
  | {
      ok: true;
      /** 讀出的角色，已經過 normalizeCharacter（不讀顏色、頭像、差分、勾選項；x、y 有讀但工具通常不用） */
      character: CcfoliaCharacter;
    }
  /** 找不到開頭標記（整行等於「キャラクター編集」） */
  | { ok: false; error: 'marker' };

const findFrom = (lines: readonly string[], label: string, start: number): number => {
  for (let i = Math.max(0, start); i < lines.length; i++) if (lines[i] === label) return i;
  return -1;
};
const find = (lines: readonly string[], label: string) => findFrom(lines, label, 0);

/** JavaScript 的數字轉換（「1e1」＝10、「0x10」＝16）；空字串、沒有這行、不是有限數字時用 fallback */
function toNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** 標記的下一行（沒有這個標記時 undefined） */
function after(lines: readonly string[], label: string): string | undefined {
  const i = find(lines, label);
  return i >= 0 ? lines[i + 1] : undefined;
}

/** 標記 start 的下一行起到標記 end 之前（end 不存在時到最後；start 不存在時是空的） */
function between(lines: readonly string[], start: number, end: number): string[] {
  if (start < 0) return [];
  return lines.slice(start + 1, end < 0 ? lines.length : end);
}

/** 刪掉空行、說明文字與段落標題 */
function compact(lines: readonly string[], help: string): string[] {
  return lines.filter((l) => l !== '' && l !== help && !SECTION_TITLES.has(l));
}

function parseMemo(lines: readonly string[]): string {
  const ini = find(lines, EDIT_SCREEN.initiative);
  const size = find(lines, EDIT_SCREEN.size);
  if (ini < 0 || size < 0 || ini + 2 >= size) return '';
  return lines
    .slice(ini + 2, size)
    .join('\n')
    .trim();
}

function parseStatus(section: readonly string[]): { label: string; value: number; max: number }[] {
  const lines = compact(section, EDIT_SCREEN.statusHelp);
  const out: { label: string; value: number; max: number }[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i] !== EDIT_SCREEN.label) {
      i += 1;
      continue;
    }
    /* 標籤空白時「ラベル」後面直接是「現在値」：標籤當成空白，從那一行繼續讀（原作把「現在値」當成標籤，已修正） */
    const blankLabel = lines[i + 1] === EDIT_SCREEN.current;
    const label = blankLabel ? '' : (lines[i + 1] ?? '');
    const cur = findFrom(lines, EDIT_SCREEN.current, blankLabel ? i + 1 : i + 2);
    const max = cur < 0 ? -1 : findFrom(lines, EDIT_SCREEN.max, cur + 1);
    if (cur < 0 || max < 0) break;
    out.push({ label, value: toNumber(lines[cur + 1], 0), max: toNumber(lines[max + 1], 0) });
    i = max + 2;
  }
  return out;
}

function parseParams(section: readonly string[]): { label: string; value: string }[] {
  const lines = compact(section, EDIT_SCREEN.paramsHelp);
  const out: { label: string; value: string }[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i] !== EDIT_SCREEN.label) {
      i += 1;
      continue;
    }
    const candidate = lines[i + 1] ?? '';
    const blankLabel = candidate === EDIT_SCREEN.value;
    const valueAt = findFrom(lines, EDIT_SCREEN.value, blankLabel ? i + 1 : i + 2);
    if (valueAt < 0) break;
    const v = lines[valueAt + 1] ?? '';
    /* 值那一行是「ラベル」＝值空白，而且那個「ラベル」是下一筆的開頭 */
    const blankValue = v === EDIT_SCREEN.label;
    out.push({ label: blankLabel ? '' : candidate, value: blankValue ? '' : v });
    i = blankValue ? valueAt + 1 : valueAt + 2;
  }
  return out;
}

function parseCommands(lines: readonly string[], start: number): string {
  if (start < 0) return '';
  const ends = EDIT_SCREEN.checkboxes
    .map((label) => findFrom(lines, label, start + 1))
    .filter((i) => i >= 0);
  const end = ends.length ? Math.min(...ends) : lines.length;
  return lines
    .slice(start + 1, end)
    .filter((line, i) => !(i === 0 && line === EDIT_SCREEN.commandsHelp))
    .join('\n')
    .trim();
}

/**
 * 解析編輯對話框的複製文字（character-editor 2.2）：
 * 1. 換行統一成 LF，每行去頭尾空白（含全形空白）；
 * 2. 從**最後一個**「キャラクター編集」開始往後看（找不到 → `{ ok: false, error: 'marker' }`；只有開頭標記也算成功）；
 * 3. 名稱、先攻值、棋子大小、外部網址、x、y＝各標記的下一行（數字轉換失敗時 0、棋子大小 4）；
 *    備註＝「イニシアティブ」後第 2 行到「駒サイズ」前一行；狀態、參數、聊天面板見規格。
 * 讀出的角色再經過 normalizeCharacter（2.3）。
 */
export function parseCharacterEditScreen(text: string): CharacterEditScreenResult {
  const all = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim());
  let start = -1;
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i] === EDIT_SCREEN.marker) {
      start = i;
      break;
    }
  }
  if (start < 0) return { ok: false, error: 'marker' };
  const lines = all.slice(start);
  const statusAt = find(lines, EDIT_SCREEN.status);
  const paramsAt = find(lines, EDIT_SCREEN.params);
  const commandsAt = find(lines, EDIT_SCREEN.commands);
  const character = normalizeCharacter({
    name: after(lines, EDIT_SCREEN.name) ?? '',
    initiative: toNumber(after(lines, EDIT_SCREEN.initiative), 0),
    memo: parseMemo(lines),
    width: toNumber(after(lines, EDIT_SCREEN.size), 4),
    x: toNumber(after(lines, EDIT_SCREEN.x), 0),
    y: toNumber(after(lines, EDIT_SCREEN.y), 0),
    externalUrl: after(lines, EDIT_SCREEN.externalUrl) ?? '',
    status: parseStatus(between(lines, statusAt, paramsAt)),
    params: parseParams(between(lines, paramsAt, commandsAt)),
    commands: parseCommands(lines, commandsAt),
  });
  return { ok: true, character };
}
