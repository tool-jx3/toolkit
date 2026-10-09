/**
 * 操作（不依賴 React）：圖片庫、說話者、文字、清單的修改、已確定、匯出、專案檔。
 * 需要確認的操作由元件先確認再呼叫。訊息寫進各區塊的狀態列（store 的 say）。
 */
import { checkRoomZip, sniffImageMime } from '@/ccfolia';
import { importAssetFiles } from '@/core/assets';
import { downloadBlob, sha256Hex } from '@/core/files';
import { allEntries, ensureEdited, entriesOf, type ListEntry, lookupOf } from './derived';
import { type Effect, EffectError, renderEffect } from './effects';
import { readLegacyProject } from './legacy';
import {
  BATCH_LABEL_CHARS,
  type Batch,
  baseName,
  cleanDoc,
  cleanEntry,
  type Doc,
  defaultDoc,
  type Entry,
  type EntryImage,
  isImageUrl,
  isTooBig,
  MAX_IMAGE_BYTES,
  newFace,
  newSpeaker,
  type Opts,
  type ShelfImage,
  type Speaker,
  sizeText,
  snippet,
  stamp,
  uid,
  urlImageName,
} from './model';
import { type BundleImage, buildImageBundle, buildScenarioZip, type NoteInput } from './output';
import { aliasesOf } from './parse';
import {
  detachImage,
  facesFromNames,
  findFace,
  imageOf,
  titleOf,
  usageMap,
  withFace,
} from './resolve';
import {
  assets,
  markMissing,
  markSessionAsset,
  type StatusArea,
  say,
  select,
  setBusy,
  useDoc,
  useUi,
} from './store';
import { BUNDLE_TEXT, S, SAMPLES } from './strings';

const doc = (): Doc => useDoc.getState().data;
const update = (recipe: (d: Doc) => void): void => useDoc.getState().update(recipe);
const join = (parts: readonly string[]): string => parts.join('、');
const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/* =================== 圖片庫 =================== */

export interface AddFilesOptions {
  /** 不寫狀態訊息（效果差分自己寫） */
  quiet?: boolean;
}

/**
 * 把檔案放進圖片庫（規格 F18）：依檔頭認格式，同內容已經在圖片庫的沿用原本那張。
 * 回傳每個可用檔案的圖片庫 id（依順序；格式不符的不在裡面）。
 */
export async function addFiles(
  files: readonly File[],
  area: StatusArea = 'shelf',
  { quiet = false }: AddFilesOptions = {},
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
    markSessionAsset(r.id);
    markMissing([r.id], false);
    if (!r.persisted) notSaved = true;
    const had = [...doc().images, ...fresh].find((im) => im.kind === 'file' && im.asset === r.id);
    if (had) {
      ids.push(had.id);
      same++;
      continue;
    }
    const im: ShelfImage = {
      id: uid('i'),
      kind: 'file',
      name: baseName(file.name, S.fallbackImageName),
      credit: '',
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
  if (!quiet) {
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
  }
  return ids;
}

/** 用網址加入（F19）。回傳圖片庫 id；網址不對時 null（並顯示錯誤） */
export function addUrl(raw: string): string | null {
  const url = raw.trim();
  if (!isImageUrl(url)) {
    say('shelf', S.urlBad, 'danger');
    return null;
  }
  const had = doc().images.find((x) => x.kind === 'url' && x.url === url);
  if (had) {
    say('shelf', S.urlExists, 'info');
    return had.id;
  }
  const im: ShelfImage = {
    id: uid('i'),
    kind: 'url',
    name: urlImageName(url, S.urlImageName),
    credit: '',
    url,
  };
  update((d) => {
    d.images.push(im);
  });
  say('shelf', S.urlAdded, 'success');
  return im.id;
}

export function renameImage(id: string, name: string): void {
  update((d) => {
    const im = d.images.find((x) => x.id === id);
    if (im) im.name = name;
  });
}

export function setImageCredit(id: string, credit: string): void {
  update((d) => {
    const im = d.images.find((x) => x.id === id);
    if (im) im.credit = credit;
  });
}

/** 刪除（F21；確認由元件做）：用到的地方變成「沒有圖」 */
export function removeImage(id: string, used: boolean): void {
  update((d) => detachImage(d, id));
  say('shelf', used ? S.deletedUsed : S.deleted, 'success');
}

/** 每張圖做一則（F22） */
export function makeFromImages(): void {
  const d0 = doc();
  if (!d0.images.length) {
    say('shelf', S.makeNone, 'danger');
    return;
  }
  const L = lookupOf(d0);
  const list = entriesOf(d0);
  const used = new Set(
    list.map((e) => imageOf(e, L)?.id).filter((x): x is string => typeof x === 'string'),
  );
  const fresh = d0.images.filter((im) => !used.has(im.id));
  if (!fresh.length) {
    say('shelf', S.makeAllUsed, 'danger');
    return;
  }
  let first = 0;
  update((d) => {
    const ed = ensureEdited(d, list);
    first = ed.length;
    for (const im of fresh) {
      ed.push({
        kind: 'heading',
        title: im.name,
        text: '',
        speakerId: null,
        face: '',
        line: null,
        titleCustom: true,
        image: im.id,
      });
    }
  });
  select(first);
  say('shelf', S.made(fresh.length, used.size), 'success');
}

/* =================== 說話者 =================== */

/** 新增說話者，回傳 id */
export function addSpeaker(name = ''): string {
  const sp = newSpeaker(name);
  update((d) => {
    d.speakers.push(sp);
  });
  return sp.id;
}

export function updateSpeaker(
  id: string,
  patch: Partial<Pick<Speaker, 'name' | 'aliases' | 'imageId'>>,
): void {
  update((d) => {
    const sp = d.speakers.find((x) => x.id === id);
    if (sp) Object.assign(sp, patch);
  });
}

export function removeSpeaker(id: string): void {
  update((d) => {
    d.speakers = d.speakers.filter((x) => x.id !== id);
  });
}

/** 新增差分，回傳 id */
export function addFace(speakerId: string, label = ''): string {
  const f = newFace(label);
  update((d) => {
    d.speakers.find((x) => x.id === speakerId)?.faces.push(f);
  });
  return f.id;
}

export function updateFace(
  speakerId: string,
  faceId: string,
  patch: Partial<{ label: string; imageId: string | null }>,
): void {
  update((d) => {
    const f = d.speakers.find((x) => x.id === speakerId)?.faces.find((x) => x.id === faceId);
    if (f) Object.assign(f, patch);
  });
}

export function removeFace(speakerId: string, faceId: string): void {
  update((d) => {
    const sp = d.speakers.find((x) => x.id === speakerId);
    if (sp) sp.faces = sp.faces.filter((f) => f.id !== faceId);
  });
}

/** 從圖片庫建立差分（F31、規格 3.4） */
export function makeFacesFromNames(speakerId: string): void {
  const d0 = doc();
  const sp = d0.speakers.find((x) => x.id === speakerId);
  if (!sp) return;
  if (!aliasesOf(sp).length) {
    say('speakers', S.facesNeedName, 'danger');
    return;
  }
  const r = facesFromNames(sp, d0.images);
  if (!r.made.length && !r.portrait) {
    say(
      'speakers',
      r.found ? S.facesNothing : S.facesNotFound(sp.name),
      r.found ? 'info' : 'danger',
    );
    return;
  }
  update((d) => {
    const t = d.speakers.find((x) => x.id === speakerId);
    if (!t) return;
    if (r.portrait && !t.imageId) t.imageId = r.portrait;
    t.faces.push(...r.made);
  });
  say(
    'speakers',
    (r.made.length ? S.facesMade(r.made.length, join(r.made.map((f) => f.label))) : '') +
      (r.portrait ? S.facesPortrait : ''),
    'success',
  );
}

/** 效果差分（F32、規格 3.5） */
export async function makeEffect(speakerId: string, fx: Effect): Promise<void> {
  const d0 = doc();
  const sp = d0.speakers.find((x) => x.id === speakerId);
  if (!sp) return;
  const L = lookupOf(d0);
  const src = L.image(sp.imageId);
  if (!src) {
    say('speakers', S.fxNoPortrait, 'danger');
    return;
  }
  if (src.kind !== 'file' || useUi.getState().missing.has(src.asset)) {
    say('speakers', S.fxUrl, 'danger');
    return;
  }
  const label = S.effects[fx];
  if (findFace(sp, label)) {
    say('speakers', S.fxExists(label), 'danger');
    return;
  }
  if (useUi.getState().busy.fx) return;
  setBusy('fx', true);
  try {
    const blob = await assets.get(src.asset);
    if (!blob) {
      markMissing([src.asset], true);
      say('speakers', S.fxUrl, 'danger');
      return;
    }
    const out = await renderEffect(blob, fx);
    const [id] = await addFiles(
      [new File([out], `${withFace(src.name, label)}.png`, { type: 'image/png' })],
      'speakers',
      { quiet: true },
    );
    if (!id) return;
    update((d) => {
      d.speakers.find((x) => x.id === speakerId)?.faces.push(newFace(label, id));
    });
    const big = isTooBig(lookupOf(doc()).image(id));
    say(
      'speakers',
      S.fxMade(label, sp.name || S.speakerFallback) + (big ? S.fxBig : ''),
      big ? 'warning' : 'success',
    );
  } catch (e) {
    if (e instanceof EffectError && e.reason === 'opaque') say('speakers', S.fxOpaque, 'danger');
    else if (e instanceof EffectError && e.reason === 'unsupported') {
      say('speakers', S.fxUnsupported, 'danger');
    } else say('speakers', S.fxFailed(errorText(e)), 'danger');
  } finally {
    setBusy('fx', false);
  }
}

/* =================== 文字與讀取方式 =================== */

export function setScript(script: string): void {
  update((d) => {
    d.script = script;
  });
}

export function setOpts(patch: Partial<Opts>): void {
  update((d) => {
    Object.assign(d.opts, patch);
  });
}

/** 填入範例（F06；有文字時的確認由元件做） */
export function fillSample(): void {
  update((d) => {
    d.script = SAMPLES[d.opts.mode];
    d.edited = null;
  });
  select(0);
}

/* =================== 清單的修改 =================== */

/** 改第 i 則（第一次修改時把清單固定下來，F56） */
export function editEntry(i: number, fn: (e: Entry, list: Entry[]) => void): void {
  const base = entriesOf(doc());
  if (i < 0 || i >= base.length) return;
  update((d) => {
    const list = ensureEdited(d, base);
    const e = list[i];
    if (e) fn(e, list);
  });
}

export function setEntryTitle(i: number, title: string): void {
  editEntry(i, (e) => {
    e.title = title;
    e.titleCustom = true;
  });
}

export function resetEntryTitle(i: number): void {
  const speakers = doc().speakers;
  editEntry(i, (e) => {
    const sp = speakers.find((s) => s.id === e.speakerId);
    if (sp) e.title = sp.name;
    e.titleCustom = false;
  });
}

/** 換說話者（F49）：換成某人時標題＝他的名稱、差分清空；換成「沒有立繪」只清掉說話者與差分 */
export function setEntrySpeaker(i: number, speakerId: string | null): void {
  const sp = speakerId ? doc().speakers.find((s) => s.id === speakerId) : null;
  editEntry(i, (e) => {
    e.speakerId = sp ? sp.id : null;
    e.face = '';
    if (sp) {
      e.title = sp.name;
      e.kind = 'speaker';
      e.titleCustom = false;
    }
  });
}

export function setEntryFace(i: number, face: string): void {
  editEntry(i, (e) => {
    e.face = face;
  });
}

export function setEntryImage(i: number, image: EntryImage): void {
  editEntry(i, (e) => {
    e.image = image;
  });
}

export function setEntryText(i: number, text: string): void {
  editEntry(i, (e) => {
    e.text = text;
  });
}

export function moveEntry(i: number, delta: -1 | 1): void {
  const n = entriesOf(doc()).length;
  const j = i + delta;
  if (j < 0 || j >= n) return;
  editEntry(i, (_e, list) => {
    [list[i], list[j]] = [list[j], list[i]];
  });
  select(j);
}

/** 在下面加一則（複製這則，本文換成「（新的劇本文字）」） */
export function addEntryBelow(i: number): void {
  editEntry(i, (e, list) => {
    list.splice(i + 1, 0, { ...cleanEntry(e), text: S.newEntryText, line: null });
  });
  select(i + 1);
}

export function deleteEntry(i: number): void {
  const n = entriesOf(doc()).length;
  editEntry(i, (_e, list) => {
    list.splice(i, 1);
  });
  /* 選取留在同一個位置；刪掉最後一則時移到新的最後一則 */
  select(i >= n - 1 ? n - 2 : i);
}

/** 從文字重建（F38；確認由元件做） */
export function rebuild(): void {
  update((d) => {
    d.edited = null;
  });
  select(-1);
  say('list', S.rebuilt, 'success');
}

/* =================== 已確定 =================== */

/** 目前的清單 → 一批（label 依目前的標題規則） */
function batchOf(d0: Doc, list: readonly ListEntry[]): Batch {
  const L = lookupOf(d0);
  const first = list[0];
  const t = titleOf(first, L);
  return {
    id: uid('b'),
    mode: d0.opts.mode,
    label: snippet((t ? t + S.titleSep : '') + first.text, BATCH_LABEL_CHARS),
    script: d0.script,
    opts: { ...d0.opts },
    entries: list.map(cleanEntry),
    edited: !!d0.edited,
  };
}

/** 確定，換下一段文字（F39） */
export function confirmBatch(): boolean {
  const d0 = doc();
  const list = entriesOf(d0);
  if (!list.length) return false;
  const batch = batchOf(d0, list);
  update((d) => {
    d.confirmed.push(batch);
    d.script = '';
    d.edited = null;
  });
  select(-1);
  say('list', S.confirmed(batch.entries.length), 'success');
  return true;
}

/** 放回修改（F58）：目前清單有則數時先確定它（排到最後）。回傳是否移動了目前的清單 */
export function restoreBatch(i: number): boolean {
  const d0 = doc();
  const list = entriesOf(d0);
  const moved = list.length > 0;
  const current = moved ? batchOf(d0, list) : null;
  update((d) => {
    if (current) d.confirmed.push(current);
    const [b] = d.confirmed.splice(i, 1);
    if (!b) return;
    d.script = b.script;
    d.opts = { ...b.opts, faceInTitle: d.opts.faceInTitle };
    d.edited = b.edited ? b.entries.map(cleanEntry) : null;
  });
  select(-1);
  say('list', moved ? S.restoredMoved : S.restored, 'success');
  return moved;
}

export function moveBatch(i: number, delta: -1 | 1): void {
  update((d) => {
    const j = i + delta;
    if (j < 0 || j >= d.confirmed.length) return;
    [d.confirmed[i], d.confirmed[j]] = [d.confirmed[j], d.confirmed[i]];
  });
}

export function deleteBatch(i: number): void {
  update((d) => {
    d.confirmed.splice(i, 1);
  });
}

/* =================== 匯出 =================== */

class UserError extends Error {}

/** 匯出房間 ZIP（F60） */
export async function exportRoomZip(): Promise<void> {
  const d0 = doc();
  const list = allEntries(d0);
  if (!list.length || useUi.getState().busy.export) return;
  const emptyBatch = d0.confirmed.findIndex((b) => b.entries.some((e) => !e.text.trim()));
  const empty = entriesOf(d0).findIndex((e) => !e.text.trim());
  if (emptyBatch >= 0 || empty >= 0) {
    if (emptyBatch < 0) select(empty);
    say(
      'export',
      S.exportEmptyText(emptyBatch >= 0 ? S.whereBatch(emptyBatch + 1) : S.whereNow),
      'danger',
    );
    return;
  }
  setBusy('export', true);
  say('export', S.exporting, 'progress');
  try {
    const L = lookupOf(d0);
    const bytesOf = new Map<string, Uint8Array>();
    const big = new Set<string>();
    const inputs: NoteInput[] = [];
    for (const e of list) {
      const im = imageOf(e, L);
      let image: NoteInput['image'] = null;
      if (im?.kind === 'url') image = { kind: 'url', url: im.url };
      else if (im?.kind === 'file') {
        let bytes = bytesOf.get(im.asset);
        if (!bytes) {
          const blob = await assets.get(im.asset);
          if (!blob) {
            markMissing([im.asset], true);
            throw new UserError(S.exportMissing(im.name));
          }
          bytes = new Uint8Array(await blob.arrayBuffer());
          bytesOf.set(im.asset, bytes);
        }
        if (isTooBig(im)) big.add(im.id);
        image = { kind: 'file', key: im.asset, bytes, type: im.type };
      }
      inputs.push({ title: titleOf(e, L), text: e.text, image });
    }
    const built = await buildScenarioZip(inputs);
    const check = await checkRoomZip(built.bytes);
    if (!check.ok) {
      say('export', S.exportCheckFailed, 'danger');
      return;
    }
    downloadBlob(
      new Blob([built.bytes], { type: 'application/zip' }),
      `scenario-text-${stamp()}.zip`,
    );
    say(
      'export',
      S.exportDone(list.length, built.files.length) + (big.size ? S.exportBig(big.size) : ''),
      big.size ? 'warning' : 'success',
    );
  } catch (e) {
    say('export', S.exportFailed(errorText(e)), 'danger');
  } finally {
    setBusy('export', false);
  }
}

/** 打包圖片的對象（F61）：勾「所有圖片」時圖片庫全部，否則用到的 */
export function bundleTargets(d0: Doc, all: boolean): ShelfImage[] {
  if (all) return d0.images;
  const use = usageMap(allEntries(d0), lookupOf(d0), S.emptyTitle);
  return d0.images.filter((im) => use.has(im.id));
}

/** 打包用到的圖片（F61） */
export async function exportImages(): Promise<void> {
  const d0 = doc();
  if (useUi.getState().busy.bundle) return;
  const all = useUi.getState().bundleAll;
  const use = usageMap(allEntries(d0), lookupOf(d0), S.emptyTitle);
  const list = bundleTargets(d0, all);
  if (!list.length) {
    say('export', S.bundleNone, 'danger');
    return;
  }
  setBusy('bundle', true);
  say('export', S.bundling, 'progress');
  try {
    const items: BundleImage[] = [];
    for (const im of list) {
      if (im.kind === 'url') {
        items.push({ name: im.name, credit: im.credit, use: use.get(im.id), url: im.url });
        continue;
      }
      const blob = await assets.get(im.asset);
      if (!blob) {
        markMissing([im.asset], true);
        items.push({ name: im.name, credit: im.credit, use: use.get(im.id), file: null });
        continue;
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      items.push({
        name: im.name,
        credit: im.credit,
        use: use.get(im.id),
        file: { bytes, type: im.type, size: im.size, hash: await sha256Hex(bytes) },
      });
    }
    const built = buildImageBundle(items, {
      all,
      date: new Date().toLocaleString('zh-TW'),
      T: BUNDLE_TEXT,
    });
    const name = `scenario-text-images-${stamp()}.zip`;
    downloadBlob(new Blob([built.bytes], { type: 'application/zip' }), name);
    say(
      'export',
      S.bundled(built.files, name, sizeText(built.bytes.byteLength)) +
        (built.urls ? S.bundledUrls(built.urls) : '') +
        (built.lost ? S.bundledLost(built.lost) : ''),
      built.lost ? 'warning' : 'success',
    );
  } catch (e) {
    say('export', S.bundleFailed(errorText(e)), 'danger');
  } finally {
    setBusy('bundle', false);
  }
}

/* =================== 專案檔 =================== */

export const projectData = (): Doc => doc();

/** 專案檔附帶的圖片（圖片庫的檔案圖） */
export async function projectFiles(): Promise<{ name: string; data: Uint8Array }[]> {
  return assets.exportFiles(doc().images.flatMap((im) => (im.kind === 'file' ? [im.asset] : [])));
}

/** 圖片庫合併：讀進來的在前，目前的圖片庫裡 id 不同的接在後面（F65） */
function mergeShelf(next: Doc): Doc {
  const ids = new Set(next.images.map((im) => im.id));
  return { ...next, images: [...next.images, ...doc().images.filter((im) => !ids.has(im.id))] };
}

async function checkMissing(d: Doc): Promise<void> {
  const ids = d.images.flatMap((im) => (im.kind === 'file' ? [im.asset] : []));
  try {
    const { missing } = await assets.preload(ids);
    markMissing(ids, false);
    markMissing(missing, true);
  } catch {
    /* 讀不到就維持原本的標記 */
  }
}

/** 開啟本站的專案檔（F65） */
export async function loadProject(data: unknown, files: Map<string, Uint8Array>): Promise<void> {
  const next = cleanDoc(data);
  const r = await importAssetFiles(assets, files);
  for (const id of r.ids) markSessionAsset(id);
  const merged = mergeShelf(next);
  useDoc.getState().replace(merged);
  select(-1);
  await checkMissing(merged);
}

/** 開啟原作的專案檔（.json）。回傳放進圖片庫的圖片張數；不是原作的專案檔時丟錯 */
export async function loadLegacyProject(text: string): Promise<number> {
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new Error(S.notProject);
  }
  const legacy = readLegacyProject(json);
  if (!legacy) throw new Error(S.notProject);
  const assetOf = new Map<string, string>();
  for (const f of legacy.files) {
    const r = await assets.add(new Blob([f.bytes as Uint8Array<ArrayBuffer>], { type: f.type }));
    markSessionAsset(r.id);
    markMissing([r.id], false);
    assetOf.set(f.id, r.id);
  }
  const next: Doc = {
    ...legacy.doc,
    images: legacy.doc.images.map((im) =>
      im.kind === 'file' ? { ...im, asset: assetOf.get(im.id) ?? im.asset } : im,
    ),
  };
  const merged = mergeShelf(next);
  useDoc.getState().replace(merged);
  select(-1);
  await checkMissing(merged);
  return legacy.files.length;
}

/** 重來（F66）：說話者、文字、讀取方式、清單、已確定回預設，圖片庫留著 */
export function resetAll(): void {
  useDoc.getState().replace({ ...defaultDoc(), images: doc().images });
  select(-1);
  say('list', S.resetDone, 'info');
}
