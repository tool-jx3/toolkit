/**
 * 讀原作的專案檔（不依賴 React；規格 2.4）：shiki365／キャラクター一括メーカー 的「プロジェクトを保存」存的 JSON
 * `{ app: "ccf-character-batch-maker", version: 1, state: { images: [{ id, kind, name, type, size, hash, dataUrl }], mode, memo,
 * table, columns, labels, kept, pasted, opts, edited } }`。圖片是 data URL，讀出位元組交給資產庫；棋子、設定照欄位轉成本站的形狀。
 */
import { cleanDoc, cleanPiece, type Doc, type Piece, type PieceFrom } from './model';

export const LEGACY_APP = 'ccf-character-batch-maker';

export interface LegacyFile {
  /** 原作的圖片 id（棋子用這個指定圖） */
  id: string;
  bytes: Uint8Array;
  type: string;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** data URL → 位元組與 MIME；讀不了時 null */
export function dataUrlBytes(url: unknown): { type: string; bytes: Uint8Array } | null {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(typeof url === 'string' ? url : '');
  if (!m) return null;
  try {
    const raw = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return { type: m[1], bytes };
  } catch {
    return null;
  }
}

/** 原作的「行」：數字＝讀到的行、✓＝已確定、⧉＝貼上的、空白＝手動加的 */
function legacyPiece(v: unknown): Piece {
  const c = isObj(v) ? v : {};
  const from: PieceFrom =
    typeof c.line === 'number'
      ? 'text'
      : c.line === '✓'
        ? 'kept'
        : c.line === '⧉'
          ? 'paste'
          : 'hand';
  return cleanPiece({ ...c, from, line: typeof c.line === 'number' ? c.line : null });
}

const pieces = (v: unknown): Piece[] => (Array.isArray(v) ? v.filter(isObj).map(legacyPiece) : []);

/** 原作的專案檔 → 本站的文件（圖片的資產 id 先用原作的 id，讀進資產庫後再換）；不是原作的專案檔時 null */
export function readLegacyProject(json: unknown): { doc: Doc; files: LegacyFile[] } | null {
  if (!isObj(json) || json.app !== LEGACY_APP) return null;
  const s = isObj(json.state) ? json.state : {};
  const files: LegacyFile[] = [];
  const images: Obj[] = [];
  for (const im of Array.isArray(s.images) ? s.images : []) {
    if (!isObj(im) || !im.id) continue;
    const data = dataUrlBytes(im.dataUrl);
    if (!data) continue;
    const id = String(im.id);
    files.push({ id, bytes: data.bytes, type: data.type });
    images.push({ id, name: im.name, asset: id, type: data.type, size: data.bytes.length });
  }
  const doc = cleanDoc({
    ...s,
    images,
    /* 原作的舊存檔：沒有 mode 而有表格時是表格 */
    mode:
      s.mode === 'table' || (s.mode !== 'memo' && String(s.table ?? '').trim()) ? 'table' : 'memo',
  });
  return {
    doc: {
      ...doc,
      kept: pieces(s.kept).map((p) => ({ ...p, from: 'kept' as const })),
      pasted: pieces(s.pasted).map((p) => ({ ...p, from: 'paste' as const })),
      edited: Array.isArray(s.edited) ? pieces(s.edited) : null,
    },
    files,
  };
}
