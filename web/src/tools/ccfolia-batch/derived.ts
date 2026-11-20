/**
 * 由狀態算出來的東西（不依賴 React）：讀取的結果、目前的清單（手動修改中用固定的清單）、圖片的對應、
 * 棋子的實際值（全體設定套上去、共用的聊天面板接上去）。同樣的輸入回傳同一個結果（元件與動作都用它）。
 */
import { type AutoImages, facesOf, matchImages, portraitOf } from './match';
import { type LabelInfo, type MemoHint, parseMemo, type ReadPiece } from './memo';
import {
  activeOf,
  cleanPiece,
  type Doc,
  hideOf,
  type Opts,
  type Piece,
  type ShelfImage,
  secretOf,
  sizeOf,
} from './model';
import { parseTable, type TableColumn, type TableHint } from './table';

export interface Parsed {
  mode: Doc['mode'];
  /** 從輸入讀到的棋子 */
  pieces: (Piece | ReadPiece)[];
  columns: TableColumn[];
  labels: LabelInfo[];
  memoHints: MemoHint[];
  tableHints: TableHint[];
}

let lastParse: {
  mode: Doc['mode'];
  text: string;
  opts: Opts;
  labels: Doc['labels'];
  columns: Doc['columns'];
  out: Parsed;
} | null = null;

/** 讀取的結果（模式、文字、讀取方式、改過的讀法都沒變時沿用上一次的） */
export function parsedOf(doc: Doc): Parsed {
  const text = doc.mode === 'table' ? doc.table : doc.memo;
  const p = lastParse;
  if (
    p &&
    p.mode === doc.mode &&
    p.text === text &&
    p.opts === doc.opts &&
    p.labels === doc.labels &&
    p.columns === doc.columns
  ) {
    return p.out;
  }
  let out: Parsed;
  if (doc.mode === 'table') {
    const r = parseTable(text, doc.columns);
    out = {
      mode: 'table',
      pieces: r.pieces,
      columns: r.columns,
      labels: [],
      memoHints: [],
      tableHints: r.hints,
    };
  } else {
    const r = parseMemo(text, { ...doc.opts, labels: doc.labels });
    out = {
      mode: 'memo',
      pieces: r.pieces,
      columns: [],
      labels: r.labels,
      memoHints: r.hints,
      tableHints: [],
    };
  }
  lastParse = {
    mode: doc.mode,
    text,
    opts: doc.opts,
    labels: doc.labels,
    columns: doc.columns,
    out,
  };
  return out;
}

let lastList: {
  kept: Doc['kept'];
  pasted: Doc['pasted'];
  parsed: Parsed;
  out: readonly Piece[];
} | null = null;

/** 目前的清單：手動修改中是固定的那份，否則 已確定＋讀到的＋貼上的 */
export function piecesOf(doc: Doc): readonly Piece[] {
  if (doc.edited) return doc.edited;
  const parsed = parsedOf(doc);
  const p = lastList;
  if (p && p.kept === doc.kept && p.pasted === doc.pasted && p.parsed === parsed) return p.out;
  const out = [...doc.kept, ...parsed.pieces, ...doc.pasted];
  lastList = { kept: doc.kept, pasted: doc.pasted, parsed, out };
  return out;
}

/** 清單第 i 個是從輸入讀到的（不是已確定、貼上的，也沒有在手動修改）時回傳讀到的那份（有原文的讀法） */
export function readPieceAt(doc: Doc, i: number): ReadPiece | null {
  if (doc.edited || doc.mode !== 'memo') return null;
  const p = parsedOf(doc).pieces[i - doc.kept.length];
  return p && 'source' in p ? p : null;
}

let lastMatch: {
  pieces: readonly Piece[];
  images: readonly ShelfImage[];
  out: AutoImages[];
} | null = null;

/** 圖片庫的自動對應（依清單的位置） */
export function matchesOf(pieces: readonly Piece[], images: readonly ShelfImage[]): AutoImages[] {
  const p = lastMatch;
  if (p && p.pieces === pieces && p.images === images) return p.out;
  const out = matchImages(pieces, images);
  lastMatch = { pieces, images, out };
  return out;
}

/** 一個棋子在畫面與匯出時的樣子 */
export interface PieceView {
  piece: Piece;
  portrait: ShelfImage | null;
  faces: ReturnType<typeof facesOf>;
  size: number;
  active: boolean;
  secret: boolean;
  hideStatus: boolean;
  /** 聊天面板（共用的、差分的 @ 名稱都接上） */
  commands: string;
}

/** 棋子的實際值 */
export function viewOf(
  piece: Piece,
  auto: AutoImages | undefined,
  images: readonly ShelfImage[],
  opts: Opts,
): PieceView {
  const faces = facesOf(piece, auto, images);
  const faceLines = opts.faceCommands
    ? faces.filter((f) => f.image && f.label.trim()).map((f) => `@${f.label.trim()}`)
    : [];
  const commands = [piece.commands, opts.commonCommands, faceLines.join('\n')]
    .filter((s) => s.trim())
    .join('\n');
  return {
    piece,
    portrait: portraitOf(piece, auto, images),
    faces,
    size: sizeOf(piece, opts),
    active: activeOf(piece, opts),
    secret: secretOf(piece, opts),
    hideStatus: hideOf(piece, opts),
    commands,
  };
}

let lastViews: {
  pieces: readonly Piece[];
  images: readonly ShelfImage[];
  opts: Opts;
  out: PieceView[];
} | null = null;

/** 整份清單的樣子（清單、圖片庫、全體設定都沒變時沿用上一次的） */
export function viewsOf(doc: Doc): PieceView[] {
  const pieces = piecesOf(doc);
  const p = lastViews;
  if (p && p.pieces === pieces && p.images === doc.images && p.opts === doc.opts) return p.out;
  const auto = matchesOf(pieces, doc.images);
  const out = pieces.map((c, i) => viewOf(c, auto[i], doc.images, doc.opts));
  lastViews = { pieces, images: doc.images, opts: doc.opts, out };
  return out;
}

/**
 * 手動修改的第一步：把目前的清單（base，在 Immer 的 recipe 外面用 piecesOf 算好）複製下來固定。
 * d 是 Immer 的 draft。
 */
export function ensureEdited(d: Doc, base: readonly Piece[]): Piece[] {
  if (!d.edited) d.edited = base.map(cleanPiece);
  return d.edited;
}
