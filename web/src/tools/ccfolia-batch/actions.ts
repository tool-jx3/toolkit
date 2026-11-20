/**
 * 操作（不依賴 React）：圖片庫、輸入與讀取方式、角色卡網站貼上、清單的修改、確定、匯出、專案檔。
 * 需要確認的操作由元件先確認再呼叫。訊息寫進各區塊的狀態列（store 的 say）。
 */
import { checkRoomZip, sniffImageMime } from '@/ccfolia';
import { importAssetFiles } from '@/core/assets';
import { downloadBlob } from '@/core/files';
import {
  ensureEdited,
  matchesOf,
  type PieceView,
  parsedOf,
  piecesOf,
  viewOf,
  viewsOf,
} from './derived';
import { readLegacyProject } from './legacy';
import { imageByName } from './match';
import {
  baseName,
  cleanDoc,
  cleanPiece,
  type Doc,
  defaultDoc,
  type InputMode,
  isTooBig,
  type LabelKind,
  MAX_IMAGE_BYTES,
  MAX_PIECES,
  newPiece,
  type Opts,
  type Piece,
  type ShelfImage,
  stamp,
  uid,
} from './model';
import {
  type AssetsInput,
  buildAssetsZip,
  buildPiecesZip,
  type OutImage,
  type OutPiece,
} from './output';
import { parsePieces } from './pieces';
import { assets, markMissing, type StatusArea, say, select, setBusy, useDoc, useUi } from './store';
import { memoHintText, OUT, S, SAMPLES, tableHintText } from './strings';
import type { ColumnKind } from './words';

const doc = (): Doc => useDoc.getState().data;
const update = (recipe: (d: Doc) => void): void => useDoc.getState().update(recipe);
const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** 記成獨立的一步復原（不和前後 0.4 秒內的變更合併） */
function asStep(fn: () => void): void {
  if (useDoc.inGesture()) useDoc.endGesture();
  useDoc.beginGesture();
  fn();
  useDoc.endGesture();
}

/* =================== 圖片庫 =================== */

/**
 * 把檔案放進圖片庫（規格 F04～F06）：依檔頭認格式，同內容已經在圖片庫的沿用原本那張。
 * 回傳每個可用檔案的圖片庫 id（依順序；格式不符的不在裡面）。
 */
export async function addFiles(
  files: readonly File[],
  area: StatusArea = 'shelf',
): Promise<string[]> {
  const ids: string[] = [];
  const fresh: ShelfImage[] = [];
  let bad = 0;
  let big = 0;
  let same = 0;
  let notSaved = false;
  for (const file of files) {
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch {
      bad++;
      continue;
    }
    const type = sniffImageMime(bytes);
    if (!type) {
      bad++;
      continue;
    }
    const r = await assets.add(new Blob([bytes], { type }));
    markMissing([r.id], false);
    if (!r.persisted) notSaved = true;
    const had = [...doc().images, ...fresh].find((im) => im.asset === r.id);
    if (had) {
      ids.push(had.id);
      same++;
      continue;
    }
    const im: ShelfImage = {
      id: uid('i'),
      name: baseName(file.name, S.fallbackImageName),
      asset: r.id,
      type,
      size: bytes.length,
    };
    fresh.push(im);
    ids.push(im.id);
    if (bytes.length > MAX_IMAGE_BYTES) big++;
  }
  if (fresh.length) {
    update((d) => {
      d.images.push(...fresh);
    });
  }
  const added = ids.length - same;
  const parts: string[] = [];
  if (added) parts.push(S.added(added));
  if (added && notSaved) parts.push(S.addedNotSaved);
  if (same) parts.push(S.same(same));
  if (bad) parts.push(S.badFormat(bad));
  if (big) parts.push(S.tooBig(big));
  if (parts.length) {
    say(area, parts.join(''), bad || big || (added && notSaved) ? 'warning' : 'success');
  }
  return ids;
}

export function renameImage(id: string, name: string): void {
  update((d) => {
    const im = d.images.find((x) => x.id === id);
    if (im) im.name = name;
  });
}

const allLists = (d: Doc): Piece[][] => [d.kept, d.pasted, ...(d.edited ? [d.edited] : [])];

/** 指定了這張圖的地方（棋子的立繪、差分；用名稱自動對到的不算） */
export function usesOf(d: Doc, imageId: string): string[] {
  const names: string[] = [];
  const seen = new Set<Piece>();
  for (const list of allLists(d)) {
    for (const c of list) {
      if (seen.has(c)) continue;
      seen.add(c);
      const name = c.name || S.noNameRow;
      if (c.image === imageId) names.push(name);
      for (const f of c.faces) {
        if (f.imageId === imageId) names.push(S.faceOfName(name, f.label || OUT.faceFallback));
      }
    }
  }
  return names;
}

/** 刪除（確認由元件做）：指定了這張圖的地方變成「沒有圖」 */
export function removeImage(id: string): void {
  const used = usesOf(doc(), id).length > 0;
  update((d) => {
    for (const list of allLists(d)) {
      for (const c of list) {
        if (c.image === id) c.image = 'none';
        for (const f of c.faces) if (f.imageId === id) f.imageId = null;
      }
    }
    d.images = d.images.filter((x) => x.id !== id);
  });
  say('shelf', used ? S.deletedUsed : S.deleted, 'success');
}

/* =================== 輸入與讀取方式 =================== */

/** 切換輸入的方式（手動修改中的確認由元件做）：取消手動修改 */
export function setMode(mode: InputMode): void {
  update((d) => {
    d.mode = mode;
    d.edited = null;
  });
  select(-1);
}

export function setText(text: string): void {
  update((d) => {
    if (d.mode === 'table') d.table = text;
    else d.memo = text;
  });
}

export function setOpts(patch: Partial<Opts>): void {
  update((d) => {
    Object.assign(d.opts, patch);
  });
}

/** 改一個標籤的讀法（和自動判斷相同時不記） */
export function setLabelKind(key: string, kind: LabelKind, auto: string): void {
  update((d) => {
    if (kind === auto) delete d.labels[key];
    else d.labels[key] = kind;
  });
}

/** 改一欄的用途（和自動判斷相同時不記） */
export function setColumnKind(header: string, kind: ColumnKind, auto: ColumnKind): void {
  update((d) => {
    if (kind === auto) delete d.columns[header];
    else d.columns[header] = kind;
  });
}

/** 填入範例（確認由元件做）：表格時欄的用途也清掉 */
export function fillSample(): void {
  update((d) => {
    if (d.mode === 'table') {
      d.table = SAMPLES.table;
      d.columns = {};
    } else d.memo = SAMPLES.memo;
    d.edited = null;
  });
  select(0);
}

/* =================== 角色卡網站貼上 =================== */

/** 加入貼上的角色資料（F24）；成功時回傳 true（元件清空輸入欄） */
export function addPasted(text: string): boolean {
  if (!text.trim()) {
    say('paste', S.pasteEmpty, 'danger');
    return false;
  }
  const r = parsePieces(text);
  if (!r.pieces.length) {
    say('paste', S.pasteNone, 'danger');
    return false;
  }
  update((d) => {
    d.pasted.push(...r.pieces.map(cleanPiece));
    if (d.edited) d.edited.push(...r.pieces.map(cleanPiece));
  });
  select(piecesOf(doc()).length - 1);
  say(
    'paste',
    S.pasteAdded(r.pieces.length) + (r.withIcon ? S.pasteIcon : S.pasteNoIcon),
    'success',
  );
  return true;
}

/** 清掉貼上的棋子（確認由元件做；手動修改中由修改欄一個一個刪） */
export function clearPasted(): void {
  update((d) => {
    d.pasted = [];
  });
  say('paste', S.pasteCleared, 'success');
}

/* =================== 清單的修改 =================== */

/** 改第 i 個（第一次修改時把清單固定下來） */
export function editPiece(i: number, fn: (c: Piece, list: Piece[]) => void): void {
  const base = piecesOf(doc());
  if (i < 0 || i >= base.length) return;
  update((d) => {
    const list = ensureEdited(d, base);
    const c = list[i];
    if (c) fn(c, list);
  });
}

/** 改名稱：原本靠名稱對到的圖，改名後照樣用（記成「立繪的名稱」） */
export function renamePiece(i: number, name: string): void {
  const d0 = doc();
  const pieces = piecesOf(d0);
  const found = matchesOf(pieces, d0.images)[i];
  const under = found && (found.byName || found.faces.length) ? pieces[i]?.name : '';
  editPiece(i, (c) => {
    if (!c.imageName && under) c.imageName = under;
    c.name = name;
  });
}

export function movePiece(i: number, delta: -1 | 1): void {
  const n = piecesOf(doc()).length;
  const j = i + delta;
  if (j < 0 || j >= n) return;
  editPiece(i, (_c, list) => {
    [list[i], list[j]] = [list[j], list[i]];
  });
  select(j);
}

/** 複製一個（排在下面） */
export function copyPiece(i: number): void {
  editPiece(i, (c, list) => {
    list.splice(i + 1, 0, { ...cleanPiece(c), line: null, from: 'hand' });
  });
  select(i + 1);
}

export function deletePiece(i: number): void {
  const n = piecesOf(doc()).length;
  editPiece(i, (_c, list) => {
    list.splice(i, 1);
  });
  select(i >= n - 1 ? n - 2 : i);
}

/** 加一個棋子（名稱「新的棋子」、HP 0/0） */
export function addPiece(): void {
  const base = piecesOf(doc());
  let at = 0;
  update((d) => {
    const list = ensureEdited(d, base);
    list.push(
      newPiece({
        from: 'hand',
        name: OUT.newPiece,
        status: [{ label: 'HP', value: 0, max: 0 }],
      }),
    );
    at = list.length - 1;
  });
  select(at);
}

/** 從輸入重做（確認由元件做） */
export function rebuild(): void {
  update((d) => {
    d.edited = null;
  });
  select(-1);
  say('list', S.rebuilt, 'success');
}

/** 確定，換下一位 NPC（F31）：目前的清單（含手動修改）留成已確定，輸入欄清空 */
export function confirmCurrent(): boolean {
  const d0 = doc();
  const list = piecesOf(d0);
  if (!list.length) return false;
  const before = d0.kept.length;
  /* 獨立的一步：復原時輸入欄的文字回來 */
  asStep(() =>
    update((d) => {
      d.kept = list.map((c) => ({ ...cleanPiece(c), from: 'kept', line: null }));
      d.edited = null;
      d.pasted = [];
      if (d.mode === 'table') d.table = '';
      else d.memo = '';
    }),
  );
  select(-1);
  say('list', S.confirmed(list.length - before, list.length), 'success');
  return true;
}

/* =================== 匯出 =================== */

class UserError extends Error {}

/** 依圖片庫的圖讀出位元組（同一張只讀一次；找不到內容時丟錯） */
function imageReader() {
  const cache = new Map<string, OutImage>();
  return async (im: ShelfImage | null): Promise<OutImage | null> => {
    if (!im) return null;
    const hit = cache.get(im.asset);
    if (hit) return hit;
    const blob = await assets.get(im.asset);
    if (!blob) {
      markMissing([im.asset], true);
      throw new UserError(S.exportMissing(im.name));
    }
    const out: OutImage = {
      key: im.asset,
      bytes: new Uint8Array(await blob.arrayBuffer()),
      type: im.type || blob.type,
    };
    cache.set(im.asset, out);
    return out;
  };
}

/** 匯出用的棋子（圖片的位元組讀好） */
async function outPiece(v: PieceView, read: ReturnType<typeof imageReader>): Promise<OutPiece> {
  const c = v.piece;
  const faces: OutPiece['faces'][number][] = [];
  for (const f of v.faces) {
    const image = await read(f.image);
    if (image) faces.push({ label: f.label, image });
  }
  return {
    name: c.name,
    memo: c.memo,
    initiative: c.initiative,
    externalUrl: c.externalUrl,
    status: c.status,
    params: c.params,
    commands: v.commands,
    color: c.color,
    size: v.size,
    active: v.active,
    secret: v.secret,
    invisible: c.invisible,
    hideStatus: v.hideStatus,
    image: await read(v.portrait),
    faces,
  };
}

/** 匯出房間 ZIP（F40） */
export async function exportRoomZip(): Promise<void> {
  const d0 = doc();
  const views = viewsOf(d0);
  if (!views.length || useUi.getState().busy.room) return;
  if (views.length > MAX_PIECES) {
    say('export', S.exportTooMany(views.length, MAX_PIECES), 'danger');
    return;
  }
  setBusy('room', true);
  say('export', S.exporting, 'progress');
  try {
    const read = imageReader();
    const list: OutPiece[] = [];
    for (const v of views) list.push(await outPiece(v, read));
    const built = await buildPiecesZip(list);
    const check = await checkRoomZip(built.bytes);
    if (!check.ok) {
      say('export', S.exportCheckFailed, 'danger');
      return;
    }
    downloadBlob(
      new Blob([built.bytes], { type: 'application/zip' }),
      `ccfolia-batch-${stamp()}.zip`,
    );
    const big = new Set(
      views.flatMap((v) => [v.portrait, ...v.faces.map((f) => f.image)]).filter(isTooBig),
    ).size;
    const noName = list.filter((c) => !c.name.trim()).length;
    const faces = list.reduce((n, c) => n + c.faces.length, 0);
    const notes = (big ? S.exportBig(big) : '') + (noName ? S.exportNoName(noName) : '');
    say(
      'export',
      S.exportDone(list.length, faces, built.files.length) + notes,
      notes ? 'warning' : 'success',
    );
  } catch (e) {
    say('export', S.exportFailed(errorText(e)), 'danger');
  } finally {
    setBusy('room', false);
  }
}

/** 匯出素材 ZIP（F41） */
export async function exportAssetsZip(): Promise<void> {
  const d0 = doc();
  if (useUi.getState().busy.assets) return;
  if (!d0.images.length) {
    say('export', S.assetsNone, 'danger');
    return;
  }
  setBusy('assets', true);
  say('export', S.exporting, 'progress');
  try {
    /* 讀不到內容的圖跳過（照原作），不中斷 */
    const raw = imageReader();
    const read = async (im: ShelfImage | null) => {
      try {
        return await raw(im);
      } catch {
        return null;
      }
    };
    const pieces: AssetsInput['pieces'][number][] = [];
    for (const v of viewsOf(d0)) {
      const faces: { label: string; image: OutImage }[] = [];
      for (const f of v.faces) {
        const image = await read(f.image);
        if (image) faces.push({ label: f.label, image });
      }
      pieces.push({
        base: v.piece.imageName || v.piece.name,
        portrait: await read(v.portrait),
        faces,
      });
    }
    const shelf: AssetsInput['shelf'][number][] = [];
    for (const im of d0.images) {
      const out = await read(im);
      if (out) shelf.push({ ...out, name: im.name });
    }
    const built = buildAssetsZip({ pieces, shelf }, OUT);
    if (!built.count) {
      say('export', S.assetsNone, 'danger');
      return;
    }
    downloadBlob(
      new Blob([built.bytes], { type: 'application/zip' }),
      `ccfolia-batch-assets-${stamp()}.zip`,
    );
    say('export', S.assetsDone(built.count), 'success');
  } catch (e) {
    say('export', S.assetsFailed(errorText(e)), 'danger');
  } finally {
    setBusy('assets', false);
  }
}

/** 一個棋子的實際值（剪貼簿 JSON 用） */
export function viewAt(i: number): PieceView | null {
  const d0 = doc();
  const pieces = piecesOf(d0);
  const p = pieces[i];
  if (!p) return null;
  return viewOf(p, matchesOf(pieces, d0.images)[i], d0.images, d0.opts);
}

/* =================== 專案檔 =================== */

export const projectData = (): Doc => doc();

/** 專案檔附帶的圖片（圖片庫的圖） */
export async function projectFiles(): Promise<{ name: string; data: Uint8Array }[]> {
  return assets.exportFiles(doc().images.map((im) => im.asset));
}

/** 圖片庫合併：讀進來的在前，目前的圖片庫裡 id 不同的接在後面（同原作） */
function mergeShelf(next: Doc): Doc {
  const ids = new Set(next.images.map((im) => im.id));
  return { ...next, images: [...next.images, ...doc().images.filter((im) => !ids.has(im.id))] };
}

async function checkMissing(d: Doc): Promise<void> {
  const ids = d.images.map((im) => im.asset);
  try {
    const { missing } = await assets.preload(ids);
    markMissing(ids, false);
    markMissing(missing, true);
  } catch {
    /* 讀不到就維持原本的標記 */
  }
}

/** 整份換掉（開專案檔、重來）並記成獨立的一步復原 */
function replaceAsStep(next: Doc): void {
  asStep(() => useDoc.getState().replace(next));
}

/** 開啟本站的專案檔（F44）；回傳存不進瀏覽器的圖片數 */
export async function loadProject(
  data: unknown,
  files: Map<string, Uint8Array>,
): Promise<{ notPersisted: number }> {
  const next = cleanDoc(data);
  const r = await importAssetFiles(assets, files);
  const merged = mergeShelf(next);
  replaceAsStep(merged);
  select(-1);
  await checkMissing(merged);
  return { notPersisted: r.notPersisted };
}

/** 讀原作的專案檔（F45）；不是原作的專案檔時回傳 null */
export async function loadLegacyProject(
  bytes: Uint8Array,
): Promise<{ images: number; notPersisted: number } | null> {
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes).replace(/^﻿/, ''));
  } catch {
    return null;
  }
  const legacy = readLegacyProject(json);
  if (!legacy) return null;
  const assetOf = new Map<string, string>();
  let notPersisted = 0;
  for (const f of legacy.files) {
    const r = await assets.add(new Blob([f.bytes as Uint8Array<ArrayBuffer>], { type: f.type }));
    if (!r.persisted) notPersisted++;
    markMissing([r.id], false);
    assetOf.set(f.id, r.id);
  }
  const next: Doc = {
    ...legacy.doc,
    images: legacy.doc.images.map((im) => ({ ...im, asset: assetOf.get(im.id) ?? im.asset })),
  };
  const merged = mergeShelf(next);
  replaceAsStep(merged);
  select(-1);
  await checkMissing(merged);
  return { images: legacy.files.length, notPersisted };
}

/** 重來（F46）：輸入、清單、設定回預設；圖片庫與改過的讀法留著 */
export function resetAll(): void {
  const d0 = doc();
  replaceAsStep({ ...defaultDoc(), images: d0.images, labels: d0.labels });
  select(-1);
  say('list', S.resetDone, 'info');
}

/** 目前的輸入有沒有文字 */
export const hasInput = (d: Doc): boolean => !!(d.mode === 'table' ? d.table : d.memo).trim();

/**
 * 清單上方的提醒（F22）：讀取的提示（最多 8 則＋「還有 n 則」；手動修改中不顯示）、
 * 指定了名稱但圖片庫找不到的圖（×N 的複本不算）、同名的棋子。
 */
export function warningsOf(d: Doc): string[] {
  const out: string[] = [];
  if (!d.edited) {
    const p = parsedOf(d);
    const hints = [...p.memoHints.map(memoHintText), ...p.tableHints.map(tableHintText)];
    out.push(...hints.slice(0, 8));
    if (hints.length > 8) out.push(S.moreHints(hints.length - 8));
  }
  const pieces = piecesOf(d);
  const lost: string[] = [];
  for (const c of pieces) {
    const name = c.name || S.noNameRow;
    const copy =
      c.name.startsWith(c.imageName) && /^ ?[A-Z0-9]+$/.test(c.name.slice(c.imageName.length));
    if (c.image === 'auto' && c.imageName && !copy && !imageByName(d.images, c.imageName)) {
      lost.push(S.lostPortrait(name, c.imageName));
    }
    for (const f of c.faces) {
      if (!f.imageId && f.imageName && !imageByName(d.images, f.imageName)) {
        lost.push(S.lostFace(name, f.label, f.imageName));
      }
    }
  }
  if (lost.length) out.push(S.lostImages(lost.slice(0, 6), Math.max(0, lost.length - 6)));
  const count = new Map<string, number>();
  for (const c of pieces) if (c.name) count.set(c.name, (count.get(c.name) ?? 0) + 1);
  const dup = [...count].filter(([, n]) => n > 1).map(([name]) => name);
  if (dup.length) out.push(S.dupNames(dup.slice(0, 6)));
  return out;
}
