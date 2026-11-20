/**
 * 角色卡網站匯出給 CCFOLIA 的角色資料（CCFOLIA 的剪貼簿格式 `{"kind":"character","data":{…}}`）→ 棋子（規格 3.5）。
 *
 * 貼上的文字可能是：一個、放在陣列裡的好幾個、前後接著貼的好幾個、整段被包成一個 JSON 字串。
 * 做法：整段能當 JSON 讀時只看它；不能時把最外層的 `{…}` 一段一段切出來各自讀。讀到的值往裡面找
 * `kind: "character"` 的物件（陣列逐項、字串再當 JSON 讀一次）。
 * `iconUrl` 不讀（CCFOLIA 的棋子不收別的網站的圖），只記下有沒有，讓畫面提醒「立繪要放進圖片庫」。
 * 可以讀的寫法參考原作（shiki365／キャラクター一括メーカー，MIT）。
 */
import { isCharacterColor } from '@/ccfolia';
import { clampPieceSize, newPiece, type Piece } from './model';
import { isRecord, type JsonRecord, readNumber, recordsIn } from './text';

export interface PastedPieces {
  pieces: Piece[];
  /** 原本帶了立繪網址的個數 */
  withIcon: number;
}

const parseOrUndefined = (json: string): unknown => {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
};

/** 最外層的每一段 `{…}`（字串裡的大括號不算） */
function* outerObjects(s: string): Generator<string> {
  let depth = 0;
  let open = 0;
  let quoted = false;
  let escaped = false;
  for (let at = 0; at < s.length; at++) {
    const ch = s.charAt(at);
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') quoted = false;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === '{') {
      if (depth === 0) open = at;
      depth += 1;
    } else if (ch === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0) yield s.slice(open, at + 1);
    }
  }
}

/** 讀到的值裡的角色資料（data 部分），依出現的順序 */
function* charactersIn(value: unknown): Generator<JsonRecord> {
  if (typeof value === 'string') {
    const inner = parseOrUndefined(value);
    if (inner !== undefined) yield* charactersIn(inner);
  } else if (Array.isArray(value)) {
    for (const item of value) yield* charactersIn(item);
  } else if (isRecord(value) && value.kind === 'character' && isRecord(value.data)) {
    yield value.data;
  }
}

/** 貼上的文字 → 每一個角色資料 */
function characterData(text: string): JsonRecord[] {
  const s = String(text ?? '').trim();
  const whole = parseOrUndefined(s);
  if (whole !== undefined) return [...charactersIn(whole)];
  return [...outerObjects(s)].flatMap((chunk) => {
    const value = parseOrUndefined(chunk);
    return value === undefined ? [] : [...charactersIn(value)];
  });
}

const textOf = (v: unknown): string => (typeof v === 'string' ? v : '');
const flagOrNull = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

/** 一個角色資料 → 棋子（數值寫成文字的「11」也讀；顏色不是 #rrggbb 時用預設） */
function pieceFromExport(d: JsonRecord): Piece {
  const width = typeof d.width === 'number' && Number.isFinite(d.width) ? d.width : null;
  const piece = newPiece({
    line: null,
    from: 'paste',
    name: textOf(d.name),
    memo: textOf(d.memo),
    commands: textOf(d.commands),
    externalUrl: textOf(d.externalUrl),
    initiative: readNumber(d.initiative) ?? 0,
    size: width === null ? null : clampPieceSize(width),
    secret: flagOrNull(d.secret),
    hideStatus: flagOrNull(d.hideStatus),
    invisible: d.invisible === true,
    status: recordsIn(d.status).map((s) => ({
      label: String(s.label ?? ''),
      value: readNumber(s.value) ?? 0,
      max: readNumber(s.max) ?? 0,
    })),
    params: recordsIn(d.params).map((p) => ({
      label: String(p.label ?? ''),
      value: String(p.value ?? ''),
    })),
  });
  if (isCharacterColor(d.color)) piece.color = d.color;
  return piece;
}

/** 讀貼上的角色資料 */
export function readSheetExport(text: string): PastedPieces {
  const found = characterData(text);
  return {
    pieces: found.map(pieceFromExport),
    withIcon: found.reduce((n, d) => (d.iconUrl ? n + 1 : n), 0),
  };
}
