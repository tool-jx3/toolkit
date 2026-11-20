/**
 * 讀原作的專案檔（不依賴 React；規格 2.4、3.10）。
 *
 * 原作（shiki365／キャラクター一括メーカー）的「プロジェクトを保存」存成 JSON：`app` 是 `ccf-character-batch-maker`，
 * `state` 裡有圖片清單（每張圖帶 id、名稱與 data URL）、輸入的文字與表格、欄與標籤的讀法、設定，
 * 以及已確定、貼上的、手動修改過的三份棋子清單。
 * 這裡把圖片的 data URL 解成位元組（交給資產庫），其他欄位交給本站的 `cleanDoc`／`cleanPiece` 整理成本站的形狀。
 */
import { cleanDoc, cleanPiece, type Doc, type Piece, type PieceFrom } from './model';
import { isRecord, type JsonRecord, recordsIn } from './text';

export const LEGACY_APP = 'ccf-character-batch-maker';

export interface LegacyFile {
  /** 原作的圖片 id（棋子用這個指定圖） */
  id: string;
  bytes: Uint8Array;
  type: string;
}

/** 「%xx」以外的字照 UTF-8 編碼，「%xx」是一個位元組 */
function percentDecoded(body: string): Uint8Array {
  const out: number[] = [];
  const utf8 = new TextEncoder();
  for (const part of body.split(/(%[\da-f]{2})/i)) {
    if (/^%[\da-f]{2}$/i.test(part)) out.push(Number.parseInt(part.slice(1), 16));
    else out.push(...utf8.encode(part));
  }
  return Uint8Array.from(out);
}

/** data URL → MIME 與位元組；不是 data URL、沒有 MIME、base64 壞掉時 null */
export function decodeDataUrl(url: unknown): { type: string; bytes: Uint8Array } | null {
  if (typeof url !== 'string' || !url.startsWith('data:')) return null;
  const comma = url.indexOf(',');
  if (comma < 0) return null;
  const [type, ...flags] = url.slice('data:'.length, comma).split(';');
  if (!type) return null;
  const body = url.slice(comma + 1);
  if (!flags.some((f) => f.toLowerCase() === 'base64'))
    return { type, bytes: percentDecoded(body) };
  try {
    return { type, bytes: Uint8Array.from(atob(body), (ch) => ch.charCodeAt(0)) };
  } catch {
    return null;
  }
}

/** 原作的「行」欄：數字＝讀到的行、✓＝已確定、⧉＝貼上的、其他＝手動加的 */
const MARKED_FROM = new Map<unknown, PieceFrom>([
  ['✓', 'kept'],
  ['⧉', 'paste'],
]);

function pieceFromLegacy(row: JsonRecord): Piece {
  const line = typeof row.line === 'number' ? row.line : null;
  const from = line === null ? (MARKED_FROM.get(row.line) ?? 'hand') : 'text';
  return cleanPiece({ ...row, from, line });
}

const legacyPieces = (v: unknown): Piece[] => recordsIn(v).map(pieceFromLegacy);

/** 圖片清單 → 資產庫要收的檔案、圖片庫的項目（資產 id 先用原作的 id） */
function legacyImages(list: unknown): { files: LegacyFile[]; images: JsonRecord[] } {
  const files: LegacyFile[] = [];
  const images: JsonRecord[] = [];
  for (const entry of recordsIn(list)) {
    const decoded = entry.id ? decodeDataUrl(entry.dataUrl) : null;
    if (!decoded) continue;
    const id = String(entry.id);
    files.push({ id, ...decoded });
    images.push({
      id,
      name: entry.name,
      asset: id,
      type: decoded.type,
      size: decoded.bytes.length,
    });
  }
  return { files, images };
}

/** 原作較舊的存檔沒有 mode：有表格時是表格 */
function legacyMode(state: JsonRecord): 'table' | 'memo' {
  if (state.mode === 'table') return 'table';
  if (state.mode === 'memo') return 'memo';
  return String(state.table ?? '').trim() ? 'table' : 'memo';
}

/** 原作的專案檔 → 本站的文件（圖片的資產 id 先用原作的 id，讀進資產庫後再換）；不是原作的專案檔時 null */
export function readLegacyProject(json: unknown): { doc: Doc; files: LegacyFile[] } | null {
  if (!isRecord(json) || json.app !== LEGACY_APP) return null;
  const state = isRecord(json.state) ? json.state : {};
  const { files, images } = legacyImages(state.images);
  const base = cleanDoc({ ...state, images, mode: legacyMode(state) });
  const doc: Doc = {
    ...base,
    kept: legacyPieces(state.kept).map((p) => ({ ...p, from: 'kept' as const })),
    pasted: legacyPieces(state.pasted).map((p) => ({ ...p, from: 'paste' as const })),
    edited: Array.isArray(state.edited) ? legacyPieces(state.edited) : null,
  };
  return { doc, files };
}
