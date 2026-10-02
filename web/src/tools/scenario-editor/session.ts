/**
 * 目前作品的管理：開啟、自動儲存（0.7／3 秒）、關閉瞬間的備份、離開確認、版本、存成檔案與開啟檔案、啟動（F001～F018）。
 */
import { create } from 'zustand';
import { downloadText, pickFiles, readAsText } from '@/core/files';
import { paperFileName } from '@/core/paged';
import { ProjectFileError, parseProject, serializeProject } from '@/core/storage';
import { bridge } from './bridge';
import {
  busyIds,
  GEN_EVERY,
  hasLocks,
  JOURNAL_MAX,
  journalClear,
  journalRead,
  journalWrite,
  LOCAL_MAX,
  lastCurrent,
  legacyDone,
  legacyWorks,
  listAll,
  listTrash,
  listWorks,
  markLegacyDone,
  newWorkId,
  patchMeta,
  purgeOldTrash,
  readBrowserTemplates,
  readGen,
  readWork,
  rememberCurrent,
  restoreWork,
  singleRead,
  singleWrite,
  snapGen,
  takeLock,
  trashWork,
  type WorkMeta,
  whenText,
  workStore,
  writeBrowserTemplates,
  writeWork,
} from './library';
import { blankDoc, looksLikeDoc, normalizeDoc, UNTITLED } from './model/doc';
import { bxTplClean, mergeTemplates } from './model/proc';
import type { BoxTemplate, Doc } from './model/types';
import { doc, edit, say, setUi, TOOL_ID, useDoc } from './store';
import { S } from './strings';

export interface SessionState {
  ready: boolean;
  /** 開啟中的作品（還沒決定時 null） */
  id: string | null;
  /** 能不能用 IndexedDB */
  idb: boolean;
  /** 最後一次寫入失敗 */
  error: boolean;
  /** 內容太大，無法自動儲存（沒有 IndexedDB 時） */
  tooBig: boolean;
  /** 最後一次存成檔案之後有變更 */
  unsaved: boolean;
}

export const useSession = create<SessionState>(() => ({
  ready: false,
  id: null,
  idb: true,
  error: false,
  tooBig: false,
  unsaved: false,
}));

const ses = () => useSession.getState();

export const SAVE_WAIT = 700;
export const SAVE_MAXWAIT = 3000;

let release: (() => void) | null = null;
let pending = false;
let pendSince = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight: string | null = null;
let queue: Promise<unknown> = Promise.resolve();
let loading = 0;
let silent = 0;
let bc: BroadcastChannel | null = null;

/* ---------- 原稿的變更 → 自動儲存 ---------- */

/** 不列入復原、也不算「尚未存成檔案」的變更（頁面設定的整理、方框的自動加高） */
export function silentEdit(recipe: (d: Doc) => void): void {
  const t = useDoc.temporal.getState();
  const was = t.isTracking;
  silent++;
  if (was) t.pause();
  try {
    edit(recipe);
  } finally {
    if (was) t.resume();
    silent--;
  }
}

/** 換掉整份原稿（開啟作品）：復原紀錄從頭開始 */
function loadDoc(d: Doc): void {
  loading++;
  try {
    useDoc.getState().replace(d);
    useDoc.temporal.getState().clear();
  } finally {
    loading--;
  }
}

let subscribed = false;
function subscribe(): void {
  if (subscribed) return;
  subscribed = true;
  useDoc.subscribe((s, prev) => {
    if (s.data === prev.data || loading) return;
    if (!silent && !ses().unsaved) useSession.setState({ unsaved: true });
    schedule();
  });
}

function schedule(): void {
  pending = true;
  const now = Date.now();
  if (!pendSince) pendSince = now;
  if (timer) clearTimeout(timer);
  timer = setTimeout(
    () => void flush(),
    Math.max(0, Math.min(SAVE_WAIT, pendSince + SAVE_MAXWAIT - now)),
  );
}

function savedMessage(): void {
  const u = ses().unsaved;
  say(u ? S.status.savedUnsaved : S.status.saved, u ? 'warn' : 'ok');
}

/** 把目前的原稿寫進存放處（寫入目標固定為呼叫當下的作品） */
export function flush(): Promise<unknown> {
  pending = false;
  pendSince = 0;
  if (timer) clearTimeout(timer);
  timer = null;
  const id = ses().id;
  const d = doc();
  const json = JSON.stringify(d);
  inflight = json;
  queue = queue.then(async () => {
    if (!ses().idb) {
      const r = singleWrite(json);
      if (inflight === json) inflight = null;
      if (r === 'ok') {
        useSession.setState({ tooBig: false, error: false });
        savedMessage();
      } else if (r === 'big') {
        useSession.setState({ tooBig: true });
        say(S.status.tooBig, 'err');
      } else {
        useSession.setState({ error: true });
        say(S.status.saveFailed, 'err');
      }
      return;
    }
    if (!id) {
      if (inflight === json) inflight = null;
      return;
    }
    let m: WorkMeta | undefined;
    try {
      m = await writeWork(id, json, d.title);
    } catch {
      if (id === ses().id) {
        useSession.setState({ error: true });
        say(S.status.saveFailed, 'err');
      }
      return;
    }
    if (inflight === json) inflight = null;
    if (id === ses().id) useSession.setState({ error: false });
    if (!pending && inflight == null) journalClear(id);
    post('saved');
    if (m && Date.now() - (m.genAt ?? 0) >= GEN_EVERY) {
      try {
        await snapGen(id, json);
      } catch {
        /* 下次再留 */
      }
    }
    if (id === ses().id) savedMessage();
  });
  return queue;
}

/** 不等，把打到一半的寫完（換作品前） */
export function flushNow(): Promise<unknown> {
  if (pending) return flush();
  return queue;
}

/** 失敗後重試（F010 的「重試」） */
export function retrySave(): void {
  void flush();
}

/* ---------- 關閉 ---------- */

function pendingJson(): string | null {
  return pending ? JSON.stringify(doc()) : inflight;
}

/** 關閉分頁、切到別的頁面時：還沒寫完的內容備份到 localStorage */
export function writeJournal(): boolean {
  const json = pendingJson();
  if (json == null) return true;
  const id = ses().id;
  if (!ses().idb) return singleWrite(json) === 'ok';
  if (!id) return true;
  return journalWrite(id, json);
}

/** 關閉前確認（F012） */
export function needsLeaveConfirm(): boolean {
  const s = ses();
  const json = pendingJson();
  const limit = s.idb ? JOURNAL_MAX : LOCAL_MAX;
  return s.unsaved || s.error || (json != null && json.length > limit);
}

let lifecycleBound = false;
function bindLifecycle(): void {
  if (lifecycleBound || typeof window === 'undefined') return;
  lifecycleBound = true;
  window.addEventListener('pagehide', () => {
    writeJournal();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') writeJournal();
  });
  window.addEventListener('beforeunload', (e) => {
    if (needsLeaveConfirm()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  try {
    bc = new BroadcastChannel(`trpg-toolkit:${TOOL_ID}`);
    bc.onmessage = (e) => {
      const m = (e.data ?? {}) as { t?: string; id?: string };
      const id = ses().id;
      if (hasLocks() || !id || m.id !== id) return;
      if (m.t === 'open') post('busy');
      if (m.t === 'busy' || m.t === 'saved') say(S.status.openElsewhere, 'warn');
    };
  } catch {
    bc = null;
  }
}

function post(t: string): void {
  try {
    const id = ses().id;
    if (bc && id) bc.postMessage({ t, id });
  } catch {
    /* 沒有 BroadcastChannel */
  }
}

/* ---------- 樣板（記在這個瀏覽器） ---------- */

function browserTemplates(): BoxTemplate[] {
  return readBrowserTemplates()
    .map(bxTplClean)
    .filter((t): t is BoxTemplate => !!t);
}

/** 開啟原稿時：這個瀏覽器記住的樣板，原稿沒有的同名加進去 */
function withBrowserTemplates(d: Doc): Doc {
  const merged = mergeTemplates(d.bxTpl, browserTemplates());
  writeBrowserTemplates(merged);
  return { ...d, bxTpl: merged };
}

/** 樣板改變時記到這個瀏覽器 */
export function rememberTemplates(list: readonly BoxTemplate[]): void {
  writeBrowserTemplates([...list]);
}

/* ---------- 作品的開啟與建立 ---------- */

function parseDoc(json: string | undefined | null): Doc {
  if (!json) return blankDoc();
  try {
    return normalizeDoc(JSON.parse(json));
  } catch {
    return blankDoc();
  }
}

function resetUi(): void {
  setUi({
    sel: [],
    anchor: null,
    focusId: null,
    cell: null,
    popEdit: null,
    flowEdit: null,
    npcEdit: null,
    tableWide: null,
    preview: null,
    pageSel: [],
  });
}

/** 開啟作品（被別的分頁鎖住時 false） */
export async function openWork(id: string, wait = 0): Promise<boolean> {
  await flushNow();
  if (ses().id === id) return true;
  const rel = await takeLock(id, wait);
  if (!rel) {
    say(S.status.lockedOther, 'warn');
    return false;
  }
  let json = await readWork(id).catch(() => undefined);
  let restored = false;
  const j = journalRead(id);
  if (j) {
    const meta = (await listAll()).find((m) => m.id === id);
    if (!meta || j.t > meta.updated) {
      try {
        await snapGen(id);
        const d = parseDoc(j.json);
        await writeWork(id, j.json, d.title);
        json = j.json;
        restored = true;
      } catch {
        /* 放不回去就照存放處的內容 */
      }
    }
    journalClear(id);
  }
  release?.();
  release = rel;
  const d = withBrowserTemplates(parseDoc(json));
  loadDoc(d);
  useSession.setState({ id, unsaved: false, error: false });
  rememberCurrent(id);
  resetUi();
  try {
    await snapGen(id, json);
  } catch {
    /* 版本留不下來也照常開啟 */
  }
  post('open');
  say(
    restored ? S.status.restoredJournal : S.status.opened(d.title || UNTITLED),
    restored ? 'info' : 'ok',
  );
  return true;
}

/** 建立新作品（不開啟）；回傳 id */
export async function createWork(d: Doc, extra: Partial<WorkMeta> = {}): Promise<string> {
  const id = newWorkId();
  await writeWork(id, JSON.stringify(d), d.title, { fileAt: null, gens: [], ...extra });
  return id;
}

/** 新建作品（範例原稿）並開啟（F003） */
export async function newWork(): Promise<string | null> {
  const id = await createWork(blankDoc());
  return (await openWork(id)) ? id : null;
}

/** 複製作品（F004）：標題加「（副本）」，不開啟 */
export async function duplicateWork(id: string): Promise<string | null> {
  if (id === ses().id) await flushNow();
  const json = await readWork(id);
  if (!json) return null;
  const d = parseDoc(json);
  d.title = `${d.title || UNTITLED}（副本）`;
  return createWork(d);
}

/** 刪除作品（F005）：移到垃圾桶；刪的是目前的作品時開啟下一個能開的（都沒有就新建） */
export async function deleteWork(id: string): Promise<void> {
  if (id === ses().id) await flushNow();
  await trashWork(id);
  if (id !== ses().id) return;
  release?.();
  release = null;
  useSession.setState({ id: null });
  const busy = await busyIds(null);
  for (const m of await listWorks()) {
    if (busy.has(m.id)) continue;
    if (await openWork(m.id)) return;
  }
  await newWork();
}

export const restoreFromTrash = (id: string): Promise<void> => restoreWork(id);

/** 過去的版本還原成新作品（F007） */
export async function restoreGen(id: string, t: number): Promise<string | null> {
  const json = await readGen(id, t);
  if (!json) return null;
  const d = parseDoc(json);
  d.title = `${d.title || UNTITLED}（${whenText(t)} 的版本）`;
  return createWork(d);
}

/** 全部清除重新開始（F016）：清除前的內容留成過去的版本，也可以復原 */
export async function resetDoc(): Promise<void> {
  if (
    !(await bridge.confirm({
      title: S.confirm.reset,
      description: S.confirm.resetHint,
      confirmLabel: S.confirm.ok,
      danger: true,
    }))
  )
    return;
  const id = ses().id;
  if (id && ses().idb) {
    try {
      await snapGen(id, JSON.stringify(doc()));
    } catch {
      /* 版本留不下來也照常清除 */
    }
  }
  const fresh = blankDoc();
  fresh.bxTpl = doc().bxTpl;
  useDoc.getState().replace(fresh);
  resetUi();
  say(S.status.reset);
}

/* ---------- 檔案（F013、F015） ---------- */

export function saveFile(): void {
  const d = doc();
  const name = paperFileName(d.title, 'json');
  downloadText(serializeProject(TOOL_ID, 1, d), name, 'application/json');
  useSession.setState({ unsaved: false });
  const id = ses().id;
  if (id && ses().idb) void patchMeta(id, { fileAt: Date.now() }).catch(() => undefined);
  say(S.status.fileSaved(name));
}

/** 檔案內容 → 原稿（新版的專案檔或舊版的原稿 JSON）；不是原稿時丟錯（訊息可以直接顯示） */
export function docFromFileText(text: string): Doc {
  const t = String(text ?? '').replace(/^﻿/, '');
  let obj: unknown;
  try {
    obj = JSON.parse(t);
  } catch {
    throw new ProjectFileError(S.status.notDoc);
  }
  if (
    obj &&
    typeof obj === 'object' &&
    (obj as { format?: unknown }).format === 'trpg-toolkit-project'
  ) {
    const p = parseProject<unknown>(t, TOOL_ID);
    if (!looksLikeDoc(p.data)) throw new ProjectFileError(S.status.notDoc);
    return normalizeDoc(p.data);
  }
  if (!looksLikeDoc(obj)) throw new ProjectFileError(S.status.notDoc);
  return normalizeDoc(obj);
}

/** 開啟檔案：新增為一個新作品並開啟（F015） */
export async function openFile(file?: File): Promise<void> {
  const f = file ?? (await pickFiles({ accept: '.json,application/json' }))[0];
  if (!f) return;
  let text: string;
  try {
    text = await readAsText(f);
  } catch {
    say(S.status.readFail, 'err');
    return;
  }
  let d: Doc;
  try {
    d = docFromFileText(text);
  } catch (e) {
    say(e instanceof Error ? e.message : S.status.notDoc, 'err');
    return;
  }
  if (!ses().idb) {
    loadDoc(withBrowserTemplates(d));
    useSession.setState({ unsaved: false });
    resetUi();
    void flush();
    say(S.status.opened(d.title));
    return;
  }
  const id = await createWork(d);
  if (await openWork(id)) say(S.status.openedNew(d.title || UNTITLED));
}

/* ---------- 啟動（F008、F017、F018） ---------- */

async function importLegacy(): Promise<number> {
  try {
    const doneSet = await legacyDone();
    const list = await legacyWorks(doneSet);
    const keys: string[] = [];
    for (const w of list) {
      let d: Doc;
      try {
        const raw = JSON.parse(w.json);
        if (!looksLikeDoc(raw)) {
          keys.push(w.key);
          continue;
        }
        d = normalizeDoc(raw);
      } catch {
        keys.push(w.key);
        continue;
      }
      if (w.title) d.title = w.title;
      await createWork(d, { updated: w.updated, ...(w.deleted ? { deleted: w.deleted } : {}) });
      keys.push(w.key);
    }
    if (keys.length) await markLegacyDone(keys);
    return list.length;
  } catch {
    return 0;
  }
}

/** 開頁（回傳要不要顯示作品清單） */
export async function startSession(): Promise<boolean> {
  subscribe();
  bindLifecycle();
  const store = await workStore();
  if (!store) {
    useSession.setState({ idb: false });
    loadDoc(withBrowserTemplates(parseDoc(singleRead())));
    useSession.setState({ id: 'single', ready: true });
    say(S.status.noIdb, 'warn');
    return false;
  }
  const imported = await importLegacy();
  await purgeOldTrash();
  const works = await listWorks();
  const trash = await listTrash();
  if (!works.length && !trash.length) {
    await newWork();
    useSession.setState({ ready: true });
    if (imported) say(S.status.legacyImported(imported), 'info');
    return false;
  }
  const last = lastCurrent();
  const order = [...works.filter((m) => m.id === last), ...works.filter((m) => m.id !== last)];
  let opened = false;
  for (const m of order) {
    if (await openWork(m.id, m.id === last ? 1500 : 0)) {
      opened = true;
      break;
    }
  }
  if (!opened) await newWork();
  useSession.setState({ ready: true });
  if (imported) say(S.status.legacyImported(imported), 'info');
  return true;
}

/** 測試、除錯用 */
export const sessionInternals = { pendingJson, docFromFileText, parseDoc };
