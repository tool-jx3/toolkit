/**
 * 角色卡網站「輸出成 CCFOLIA 角色」的資料（CCFOLIA 的剪貼簿格式 `{"kind":"character","data":{…}}`）→ 棋子（規格 3.5）。
 *
 * 也讀得懂：好幾個放在陣列裡、好幾個前後接著貼、整段被包成一個字串。`iconUrl` 不讀（CCFOLIA 的棋子不收別的網站的圖），
 * 只記下有沒有，讓畫面提醒「立繪要放進圖片庫」。規則照原作（parse.v1.js 的 parsePieces，MIT）。
 */
import { isCharacterColor } from '@/ccfolia';
import { clampSize, newPiece, type Piece } from './model';
import { readNumber } from './text';

export interface PastedPieces {
  pieces: Piece[];
  /** 原本帶了立繪網址的個數 */
  withIcon: number;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** 文字裡的每一個角色資料（data 部分） */
function findCharacters(text: string): Obj[] {
  const found: Obj[] = [];
  const take = (v: unknown): void => {
    if (typeof v === 'string') {
      try {
        take(JSON.parse(v));
      } catch {
        /* 不是 JSON 的字串 */
      }
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) take(x);
      return;
    }
    if (isObj(v) && v.kind === 'character' && isObj(v.data)) found.push(v.data);
  };
  const s = String(text ?? '').trim();
  try {
    take(JSON.parse(s));
  } catch {
    /* 好幾個物件前後接著：在最外層的大括號切開 */
    let depth = 0;
    let start = -1;
    let inString = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inString) {
        if (ch === '\\') i++;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') {
        if (depth++ === 0) start = i;
      } else if (ch === '}' && depth > 0 && --depth === 0) {
        try {
          take(JSON.parse(s.slice(start, i + 1)));
        } catch {
          /* 壞掉的一段跳過 */
        }
      }
    }
  }
  return found;
}

/** 貼上的角色資料 → 棋子（數值寫成文字的「11」也讀；顏色不是 #rrggbb 時用預設） */
export function parsePieces(text: string): PastedPieces {
  const list = findCharacters(text);
  const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
  const pieces = list.map((d) =>
    newPiece({
      line: null,
      from: 'paste',
      name: str(d.name),
      memo: str(d.memo),
      initiative: readNumber(d.initiative) ?? 0,
      externalUrl: str(d.externalUrl),
      commands: str(d.commands),
      ...(isCharacterColor(d.color) ? { color: d.color } : {}),
      size: typeof d.width === 'number' && Number.isFinite(d.width) ? clampSize(d.width) : null,
      secret: bool(d.secret),
      invisible: d.invisible === true,
      hideStatus: bool(d.hideStatus),
      status: (Array.isArray(d.status) ? d.status : []).filter(isObj).map((x) => ({
        label: String(x.label ?? ''),
        value: readNumber(x.value) || 0,
        max: readNumber(x.max) || 0,
      })),
      params: (Array.isArray(d.params) ? d.params : []).filter(isObj).map((x) => ({
        label: String(x.label ?? ''),
        value: String(x.value ?? ''),
      })),
    }),
  );
  return { pieces, withIcon: list.filter((d) => !!d.iconUrl).length };
}
