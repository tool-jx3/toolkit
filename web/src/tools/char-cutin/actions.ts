/**
 * 操作：加入與換掉立繪（自動對準臉）、清單的整理、型與樣式、專案檔、匯出。
 * 每個操作是一步復原（加入一批、換圖、拿掉、排序、ROUND 編號、換型、回到初始值、開專案檔）。
 */
import { addImageFile, importAssetFiles, loadAssetBitmaps, splitImageFiles } from '@/core/assets';
import { downloadBlob, formatBytes, naturalSort } from '@/core/files';
import { ProjectFileError } from '@/core/storage';
import {
  buildCutinRoom,
  CUTIN_LIMIT,
  loadShotFonts,
  type Rendered,
  renderShot,
  type ZipItem,
  zipOf,
} from './exporter';
import { faceOfBitmap } from './face';
import {
  type Actor,
  type CutKind,
  cleanDoc,
  DOC_VERSION,
  type Doc,
  defaultDoc,
  defaultStyle,
  MYSTERY,
  moveActor,
  RANGES,
  rivalActor,
} from './model';
import {
  batchEntries,
  canLeadVersus,
  nameFromFile,
  roomZipFileName,
  singleFileName,
  triggerName,
  uniqueNames,
  withRoundTags,
  zipEntryName,
  zipFileName,
} from './names';
import { shotOf } from './shot';
import { assets, doc, markMissing, say, update, useDoc, usePrefs, useUi } from './store';
import { S } from './strings';

/** 立繪存進資產庫時的長邊上限（特寫用，比一般的 1024 大） */
export const IMAGE_MAX_SIDE = 4096;

const ACCEPT = /^image\/(png|webp|jpeg)$/;

let nextId = 0;
const newActorId = (): string =>
  `c${Date.now().toString(36)}${(nextId++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const select = (id: string | null): void => usePrefs.getState().patch({ selected: id });

export const selectedActor = (): Actor | null => {
  const d = doc();
  const id = usePrefs.getState().data.selected;
  return d.actors.find((a) => a.id === id) ?? null;
};

/* ---------- 加入與換圖 ---------- */

/** 放進立繪（依檔名自然排序；一批算一步復原）；選取中沒有人時選第一個加入的人 */
export async function addFiles(files: readonly File[]): Promise<void> {
  const { images, others } = await splitImageFiles(files);
  const list = naturalSort(
    images.filter((f) => !f.type || ACCEPT.test(f.type)),
    (f) => f.name,
  );
  let bad = others.length + (images.length - list.length);
  let lost = false;
  const added: Actor[] = [];
  for (const file of list) {
    try {
      const r = await addImageFile(assets, file, { maxSide: IMAGE_MAX_SIDE });
      const bmp = await assets.bitmap(r.ref.id);
      if (!bmp) throw new Error('decode');
      const face = faceOfBitmap(bmp);
      if (!r.persisted) lost = true;
      markMissing([r.ref.id], false);
      added.push({
        id: newActorId(),
        image: r.ref.id,
        name: nameFromFile(file.name),
        tag: '',
        quote: '',
        scale: RANGES.scale.def,
        ...face,
        color: null,
      });
    } catch {
      bad++;
    }
  }
  if (!added.length) {
    say('castStatus', S.addedNone, 'danger');
    return;
  }
  update((d) => {
    d.actors.push(...added);
  });
  const sel = usePrefs.getState().data.selected;
  if (!sel || !doc().actors.some((a) => a.id === sel)) select(added[0].id);
  say(
    'castStatus',
    S.added(added.length, bad) + (lost ? S.notPersisted : ''),
    bad || lost ? 'warning' : 'success',
  );
}

/** 換掉某個人的圖（臉的位置重新對準；名字、台詞不變） */
export async function replaceImage(actorId: string, file: File): Promise<void> {
  const a = doc().actors.find((x) => x.id === actorId);
  if (!a) return;
  try {
    const r = await addImageFile(assets, file, { maxSide: IMAGE_MAX_SIDE });
    const bmp = await assets.bitmap(r.ref.id);
    if (!bmp) throw new Error('decode');
    const face = faceOfBitmap(bmp);
    markMissing([r.ref.id], false);
    update((d) => {
      const t = d.actors.find((x) => x.id === actorId);
      if (t) Object.assign(t, { image: r.ref.id, ...face });
    });
    select(actorId);
    say(
      'castStatus',
      S.replaced(a.name || S.unnamed) + (r.persisted ? '' : S.notPersisted),
      r.persisted ? 'success' : 'warning',
    );
  } catch {
    say('castStatus', S.replaceFailed, 'danger');
  }
}

/** 重新自動對準臉 */
export async function realign(actorId: string): Promise<void> {
  const a = doc().actors.find((x) => x.id === actorId);
  if (!a) return;
  const bmp = await assets.bitmap(a.image).catch(() => undefined);
  if (!bmp) {
    say('castStatus', S.missingImage, 'danger');
    return;
  }
  const face = faceOfBitmap(bmp);
  update((d) => {
    const t = d.actors.find((x) => x.id === actorId);
    if (t) Object.assign(t, face);
  });
  say('castStatus', S.realigned(a.name || S.unnamed), 'success');
}

/* ---------- 清單 ---------- */

export function setActor<K extends keyof Actor>(id: string, key: K, value: Actor[K]): void {
  update((d) => {
    const t = d.actors.find((x) => x.id === id);
    if (t) t[key] = value;
  });
}

export function removeActor(id: string): void {
  const d0 = doc();
  const i = d0.actors.findIndex((a) => a.id === id);
  if (i < 0) return;
  const name = d0.actors[i].name || S.unnamed;
  update((d) => {
    d.actors.splice(i, 1);
    if (d.rival === id) d.rival = MYSTERY;
  });
  const rest = doc().actors;
  if (usePrefs.getState().data.selected === id)
    select(rest[Math.min(i, rest.length - 1)]?.id ?? null);
  say('castStatus', S.removed(name), 'info');
}

export function reorder(from: number, to: number): void {
  update((d) => {
    d.actors = moveActor(d.actors, from, to);
  });
}

export function numberRounds(): void {
  const n = doc().actors.length;
  if (!n) return;
  update((d) => {
    d.actors = withRoundTags(d.actors);
  });
  say('castStatus', S.numbered(n), 'success');
}

/* ---------- 型與樣式 ---------- */

export function setKind(kind: CutKind): void {
  if (doc().kind === kind) return;
  update((d) => {
    d.kind = kind;
  });
}

export function resetKind(kind: CutKind): void {
  update((d) => {
    d.styles[kind] = defaultStyle(kind);
  });
  say('status', S.resetKindDone(S.kinds[kind].label), 'success');
}

export const isDefaultStyle = (d: Doc, kind: CutKind): boolean =>
  JSON.stringify(d.styles[kind]) === JSON.stringify(defaultStyle(kind));

/* ---------- 專案檔 ---------- */

export const projectFiles = (): Promise<{ name: string; data: Uint8Array }[]> =>
  assets.exportFiles(doc().actors.map((a) => a.image));

/** 開啟專案檔：較新版本的不開；圖片放回資產庫；整份換掉（一步復原） */
export async function loadProject(
  data: unknown,
  version: number,
  files: Map<string, Uint8Array>,
): Promise<{ notPersisted: number }> {
  if (version > DOC_VERSION) throw new ProjectFileError(S.newerProject);
  const next = cleanDoc(data);
  const r = await importAssetFiles(assets, files);
  useDoc.getState().replace(next);
  const ids = next.actors.map((a) => a.image);
  try {
    const { missing } = await assets.preload(ids);
    markMissing(ids, false);
    markMissing(missing, true);
  } catch {
    markMissing(ids, true);
  }
  select(next.actors[0]?.id ?? null);
  return { notPersisted: r.notPersisted };
}

export function resetAll(): void {
  useDoc.getState().replace(defaultDoc());
  select(null);
}

/* ---------- 匯出 ---------- */

let running: AbortController | null = null;

export const cancelExport = (): void => running?.abort();

function progress(label: string, ratio: number): void {
  useUi.setState({ busy: { label, ratio: Math.max(0, Math.min(1, ratio)) } });
}

const isAbort = (e: unknown): boolean =>
  e instanceof DOMException ? e.name === 'AbortError' : (e as Error)?.name === 'AbortError';

function failText(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m ? S.exp.failedWith(m) : S.exp.failed;
}

async function withExport(job: (signal: AbortSignal) => Promise<void>): Promise<void> {
  if (useUi.getState().busy) return;
  const ctl = new AbortController();
  running = ctl;
  progress(S.exp.working, 0);
  try {
    await job(ctl.signal);
  } catch (e) {
    if (isAbort(e)) say('status', S.exp.cancelled, 'info');
    else say('status', failText(e), 'danger');
  } finally {
    running = null;
    useUi.setState({ busy: null });
  }
}

/** 這些人用到的立繪（讀不到的人丟錯） */
async function bitmapsFor(list: readonly Actor[]): Promise<Map<string, ImageBitmap>> {
  const map = await loadAssetBitmaps(
    assets,
    list.map((a) => a.image),
  );
  for (const a of list)
    if (!map.has(a.image)) {
      markMissing([a.image], true);
      throw new Error(S.exp.missingImage(a.name || S.unnamed));
    }
  return map;
}

function shrinkNote(r: Rendered): string {
  if (r.over) return S.exp.over;
  const a = r.attempt;
  if (!a || a.step === 0) return '';
  return S.exp.shrunk(S.exp.attempt(a.fps, a.quality, a.colors));
}

/** 匯出選取的一人 */
export function exportSelected(): Promise<void> {
  return withExport(async (signal) => {
    const d = doc();
    const hero = selectedActor() ?? d.actors[0];
    if (!hero) throw new Error(S.exp.noActors);
    if (!canLeadVersus(d, hero.id)) throw new Error(S.exp.rivalSelected);
    const rival = d.kind === 'versus' ? rivalActor(d) : null;
    const bitmaps = await bitmapsFor(rival ? [hero, rival] : [hero]);
    const shot = shotOf(d, hero, bitmaps);
    const fontsOk = await loadShotFonts(shot);
    progress(S.exp.workingOne(hero.name || S.unnamed), 0);
    const r = await renderShot(shot, d.out, {
      signal,
      onProgress: (x) => progress(S.exp.workingOne(hero.name || S.unnamed), x),
    });
    const index = d.actors.findIndex((a) => a.id === hero.id);
    const file = singleFileName(index, hero.name, d.kind, r.ext);
    downloadBlob(r.blob, file);
    const notes = [
      shrinkNote(r),
      d.out.format === 'video' && r.ext === 'webm' ? S.exp.webmFallback : '',
      fontsOk ? '' : S.exp.fontFallback,
    ].join('');
    say(
      'status',
      S.exp.done(file, formatBytes(r.blob.size)) + notes,
      r.over ? 'warning' : 'success',
    );
  });
}

/** 全員（VS 時對手以外）一個一個做 */
async function renderEach(
  signal: AbortSignal,
  onEach: (entry: { index: number; hero: Actor }, r: Rendered) => Promise<void> | void,
): Promise<{ count: number; over: number; fontsOk: boolean; webm: boolean }> {
  const d = doc();
  const list = batchEntries(d);
  if (!list.length) throw new Error(S.exp.noActors);
  const rival = d.kind === 'versus' ? rivalActor(d) : null;
  const bitmaps = await bitmapsFor(
    rival ? [...list.map((e) => e.hero), rival] : list.map((e) => e.hero),
  );
  let over = 0;
  let fontsOk = true;
  let webm = false;
  for (let k = 0; k < list.length; k++) {
    const e = list[k];
    const label = S.exp.workingMany(k + 1, list.length, e.hero.name || S.unnamed);
    progress(label, k / list.length);
    const shot = shotOf(d, e.hero, bitmaps);
    if (!(await loadShotFonts(shot))) fontsOk = false;
    const r = await renderShot(shot, d.out, {
      signal,
      onProgress: (x) => progress(label, (k + x) / list.length),
    });
    if (r.blob.size > CUTIN_LIMIT && d.out.format !== 'video') over++;
    if (r.ext === 'webm') webm = true;
    await onEach(e, r);
  }
  return { count: list.length, over, fontsOk, webm };
}

/** 全員匯出成 ZIP（兩人以上） */
export function exportAll(): Promise<void> {
  return withExport(async (signal) => {
    const d = doc();
    if (d.actors.length < 2) throw new Error(S.exp.noActors);
    const items: ZipItem[] = [];
    const res = await renderEach(signal, async (e, r) => {
      items.push({
        name: zipEntryName(e.index, e.hero.name, r.ext),
        data: new Uint8Array(await r.blob.arrayBuffer()),
      });
    });
    const file = zipFileName(d.kind, res.count);
    const zip = zipOf(items);
    downloadBlob(new Blob([zip], { type: 'application/zip' }), file);
    const notes = [
      res.over && d.out.size === 'small' ? S.exp.overSome(res.over) : '',
      res.webm ? S.exp.webmFallback : '',
      res.fontsOk ? '' : S.exp.fontFallback,
    ].join('');
    say(
      'status',
      S.exp.doneMany(res.count, file, formatBytes(zip.byteLength)) + notes,
      notes ? 'warning' : 'success',
    );
  });
}

/** CCFOLIA 房間 ZIP：每人一個切入 */
export function exportRoom(): Promise<void> {
  return withExport(async (signal) => {
    const d = doc();
    if (d.out.format === 'video') throw new Error(S.roomNoVideo);
    const rivalName = d.kind === 'versus' ? (rivalActor(d)?.name ?? d.mysteryName) : '';
    const blobs: { name: string; blob: Blob }[] = [];
    const res = await renderEach(signal, (e, r) => {
      blobs.push({
        name: triggerName(e.hero, d.kind, rivalName, d.out.triggerPrefix),
        blob: r.blob,
      });
    });
    const names = uniqueNames(blobs.map((b) => b.name));
    const bytes = await buildCutinRoom(blobs.map((b, i) => ({ name: names[i], blob: b.blob })));
    const file = roomZipFileName(d.kind);
    downloadBlob(new Blob([bytes], { type: 'application/zip' }), file);
    const notes = [
      res.over ? S.exp.overSome(res.over) : '',
      res.fontsOk ? '' : S.exp.fontFallback,
    ].join('');
    say('status', S.exp.doneRoom(res.count, file) + notes, notes ? 'warning' : 'success');
  });
}
