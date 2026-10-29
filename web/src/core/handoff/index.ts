/**
 * 工具之間交接一個檔案（2026-10-29 新增；第一個用的是室內平面圖產生器 → 地圖演出產生器，floor-plan F267、map-fx F84）。
 *
 * - 寄件的工具 `sendHandoff({ to, from, name, blob, meta, id })` 存進 IndexedDB（圖片放不進 localStorage）：
 *   資料庫 `trpg-toolkit:handoff`，鍵＝收件的工具 id；同一個收件的工具只留最新的一份（再送一次蓋掉）。
 * - 收件的工具開頁時 `takeHandoff(to)`：讀出來就刪掉（讀過一次就沒有了，重新整理不會再讀一次）；
 *   過期的（預設超過一天）與壞掉的也刪掉，回傳 null。開頁時順便清掉所有過期的交接資料（`purgeHandoffs`）。
 * - 沒有 IndexedDB（部分瀏覽器的無痕模式）或寫入失敗時 `sendHandoff` 回傳 false，寄件的工具改請使用者下載再讀入。
 *
 * **先開分頁、後送資料**（2026-10-29 主控追加）：畫圖與寫入要時間，等寫好才 `window.open` 的話已經不在點擊的當下，
 * 瀏覽器會擋掉新分頁。所以寄件的工具在點擊的當下（任何 await 之前）：
 * 1. `beginHandoff(to)` 取一個交接編號（開始回答收件分頁的詢問：還在準備／好了／失敗）；
 * 2. 開新分頁 `handoffHref(收件工具的網址, id)`（網址的 # 帶 `handoff=<id>`）；
 * 3. 之後才畫圖、`sendHandoff({ …, id })`；畫不出來時 `failHandoff(to, id)`。
 * 收件的分頁看到 `readHandoffId(location.hash)` 就 `waitHandoff(to, id)`：輪詢 IndexedDB，並用 BroadcastChannel
 * 問寄件的分頁（還在準備就繼續等；失敗就馬上知道，不乾等）。寄件的分頁沒有回應超過 `timeoutMs`（預設 10 秒）就放棄。
 * 失敗也寫一筆小小的紀錄（`failed:<id>`），收件的分頁晚一點開也看得到。
 *
 * session-log → session-report 的交接（`@/core/sessions`，localStorage、只有文字）是更早的做法，沒有改用這裡。
 */
import {
  hasIndexedDb,
  idbDel,
  idbEntries,
  idbGet,
  idbSet,
  idbStore,
  type UseStore,
} from '@/core/storage';

export interface HandoffInput {
  /** 收件的工具 id（例：'map-fx'） */
  to: string;
  /** 寄件的工具 id（例：'floor-plan'） */
  from: string;
  /** 檔案的名稱（顯示用；例：地圖名稱） */
  name: string;
  blob: Blob;
  /** 其他資料（收件的工具自己解讀，例：`{ gridPx: 48 }`）；要能被 structured clone */
  meta?: Record<string, unknown>;
  /** 交接編號（`beginHandoff` 取的；先開分頁、後送資料時用） */
  id?: string;
}

export interface Handoff extends HandoffInput {
  /** 寫入的時間（ms） */
  createdAt: number;
}

/** 交接資料的有效期限（預設一天） */
export const HANDOFF_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** 收件的分頁等寄件的分頁的時間：寄件的分頁沒有回應（關掉了、當掉了）超過這麼久就放棄 */
export const HANDOFF_WAIT_MS = 10_000;
/** 寄件的分頁一直說「還在準備」時最多等多久（畫很大的圖） */
export const HANDOFF_WAIT_MAX_MS = 60_000;
/** 網址的 # 裡交接編號的鍵 */
export const HANDOFF_HASH_KEY = 'handoff';

const CHANNEL = 'trpg-toolkit:handoff';
const FAIL_PREFIX = 'failed:';
const ID_RE = /^[\w-]{1,64}$/;

let store: UseStore | null = null;
const db = (): UseStore => {
  store ??= idbStore('handoff');
  return store;
};

const isHandoff = (v: unknown): v is Handoff => {
  if (!v || typeof v !== 'object') return false;
  const h = v as Record<string, unknown>;
  return (
    typeof h.to === 'string' &&
    typeof h.from === 'string' &&
    typeof h.name === 'string' &&
    typeof h.createdAt === 'number' &&
    (h.id === undefined || typeof h.id === 'string') &&
    typeof Blob !== 'undefined' &&
    h.blob instanceof Blob
  );
};

interface FailMark {
  failed: true;
  to: string;
  id: string;
  createdAt: number;
}

const isFailMark = (v: unknown): v is FailMark => {
  if (!v || typeof v !== 'object') return false;
  const h = v as Record<string, unknown>;
  return (
    h.failed === true &&
    typeof h.to === 'string' &&
    typeof h.id === 'string' &&
    typeof h.createdAt === 'number'
  );
};

/* ---------- 寄件與收件的分頁之間的通知（BroadcastChannel；沒有時只靠輪詢） ---------- */

type Status = 'pending' | 'ready' | 'failed';
type Message =
  | { type: 'ask'; to: string; id: string }
  | { type: 'status'; to: string; id: string; status: Status };

const isMessage = (v: unknown): v is Message => {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  return (
    (m.type === 'ask' || m.type === 'status') &&
    typeof m.to === 'string' &&
    typeof m.id === 'string'
  );
};

const openChannel = (): BroadcastChannel | null => {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    const ch = new BroadcastChannel(CHANNEL);
    /* Node（單元測試）裡不讓頻道撐住程序 */
    (ch as unknown as { unref?: () => void }).unref?.();
    return ch;
  } catch {
    return null;
  }
};

/** 這個分頁寄出的交接的狀態（回答收件分頁的詢問用） */
const sent = new Map<string, { to: string; status: Status }>();
let answering: BroadcastChannel | null = null;

const post = (ch: BroadcastChannel | null, m: Message) => {
  try {
    ch?.postMessage(m);
  } catch {
    /* 頻道關了：收件的分頁靠輪詢 */
  }
};

function setStatus(to: string, id: string, status: Status) {
  sent.set(id, { to, status });
  if (!answering) {
    answering = openChannel();
    if (answering)
      answering.onmessage = (e: MessageEvent) => {
        const m = e.data;
        if (!isMessage(m) || m.type !== 'ask') return;
        const s = sent.get(m.id);
        if (s && s.to === m.to)
          post(answering, { type: 'status', to: m.to, id: m.id, status: s.status });
      };
  }
  post(answering, { type: 'status', to, id, status });
}

/** 新的交接編號 */
export function newHandoffId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 寄件的第一步（同步；在點擊的當下、開新分頁之前呼叫）：取一個交接編號，開始回答收件分頁的詢問（「還在準備」）。
 */
export function beginHandoff(to: string): string {
  const id = newHandoffId();
  setStatus(to, id, 'pending');
  return id;
}

/** 收件工具的網址加上交接編號（`#handoff=<id>`；換掉原本的 #） */
export function handoffHref(href: string, id: string): string {
  const base = href.split('#')[0];
  return `${base}#${HANDOFF_HASH_KEY}=${encodeURIComponent(id)}`;
}

/** 網址的 # 裡的交接編號（沒有或格式不對時 null） */
export function readHandoffId(hash: string): string | null {
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!h) return null;
  const id = new URLSearchParams(h).get(HANDOFF_HASH_KEY);
  return id && ID_RE.test(id) ? id : null;
}

/** 寄出（同一個收件的工具只留最新的一份）；沒有 IndexedDB 或寫入失敗時 false（有 id 時同時通知收件的分頁失敗了） */
export async function sendHandoff(input: HandoffInput, now = Date.now()): Promise<boolean> {
  if (!hasIndexedDb()) {
    if (input.id) await failHandoff(input.to, input.id, now);
    return false;
  }
  try {
    const value: Handoff = { ...input, createdAt: now };
    await idbSet(input.to, value, db());
  } catch {
    if (input.id) await failHandoff(input.to, input.id, now);
    return false;
  }
  if (input.id) setStatus(input.to, input.id, 'ready');
  return true;
}

/** 寄件失敗（畫不出圖、寫不進去）：通知等著的收件分頁，並留一筆失敗的紀錄（寫得進去的話） */
export async function failHandoff(to: string, id: string, now = Date.now()): Promise<void> {
  setStatus(to, id, 'failed');
  if (!hasIndexedDb()) return;
  try {
    const mark: FailMark = { failed: true, to, id, createdAt: now };
    await idbSet(FAIL_PREFIX + id, mark, db());
  } catch {
    /* 連失敗的紀錄都寫不進去：收件的分頁靠 BroadcastChannel 的回答，或等到逾時 */
  }
}

/** 清掉過期（或壞掉）的交接資料與失敗的紀錄；回傳清掉的筆數 */
export async function purgeHandoffs(
  maxAgeMs = HANDOFF_MAX_AGE_MS,
  now = Date.now(),
): Promise<number> {
  if (!hasIndexedDb()) return 0;
  try {
    let n = 0;
    for (const [key, value] of await idbEntries<unknown>(db())) {
      if (
        (isHandoff(value) || isFailMark(value)) &&
        now - value.createdAt <= maxAgeMs &&
        value.createdAt <= now + 60_000
      )
        continue;
      await idbDel(key, db());
      n++;
    }
    return n;
  } catch {
    return 0;
  }
}

/**
 * 收件：讀出給 `to` 的交接資料並刪掉（讀過一次就沒有了）。沒有、過期（超過 maxAgeMs）、壞掉時 null。
 * 其他收件人的過期資料也順便清掉。
 */
export async function takeHandoff(
  to: string,
  { maxAgeMs = HANDOFF_MAX_AGE_MS, now = Date.now() }: { maxAgeMs?: number; now?: number } = {},
): Promise<Handoff | null> {
  if (!hasIndexedDb()) return null;
  try {
    await purgeHandoffs(maxAgeMs, now);
    const value = await idbGet<unknown>(to, db());
    if (value === undefined) return null;
    await idbDel(to, db());
    return isHandoff(value) && value.to === to ? value : null;
  } catch {
    return null;
  }
}

export type HandoffWait =
  | { status: 'ok'; handoff: Handoff }
  /** 寄件的分頁說失敗了（或這個瀏覽器不能交接） */
  | { status: 'failed' }
  /** 等不到（寄件的分頁關掉了、沒有回應） */
  | { status: 'timeout' };

/**
 * 收件：等編號 `id` 的交接資料（寄件的分頁先開了這個分頁、資料晚一點才寫好）。
 * 輪詢 IndexedDB（每 `intervalMs`），同時用 BroadcastChannel 問寄件的分頁：「還在準備」就繼續等（最多 `maxMs`），
 * 「失敗」或留下失敗的紀錄就馬上回 failed；寄件的分頁超過 `timeoutMs` 都沒有回應而且資料還沒到就回 timeout。
 * 拿到的資料讀出就刪（同 `takeHandoff`）。
 */
export async function waitHandoff(
  to: string,
  id: string,
  {
    timeoutMs = HANDOFF_WAIT_MS,
    maxMs = HANDOFF_WAIT_MAX_MS,
    intervalMs = 400,
  }: { timeoutMs?: number; maxMs?: number; intervalMs?: number } = {},
): Promise<HandoffWait> {
  if (!hasIndexedDb()) return { status: 'failed' };
  await purgeHandoffs();
  const start = Date.now();
  let alive = start;
  let failed = false;
  let wake: (() => void) | null = null;
  const ch = openChannel();
  if (ch)
    ch.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (!isMessage(m) || m.type !== 'status' || m.to !== to || m.id !== id) return;
      alive = Date.now();
      if (m.status === 'failed') failed = true;
      if (m.status !== 'pending') wake?.();
    };
  const check = async (): Promise<HandoffWait | null> => {
    try {
      const value = await idbGet<unknown>(to, db());
      if (isHandoff(value) && value.to === to && value.id === id) {
        await idbDel(to, db());
        return { status: 'ok', handoff: value };
      }
      const mark = await idbGet<unknown>(FAIL_PREFIX + id, db());
      if (isFailMark(mark)) {
        await idbDel(FAIL_PREFIX + id, db());
        return { status: 'failed' };
      }
    } catch {
      return { status: 'failed' };
    }
    return failed ? { status: 'failed' } : null;
  };
  try {
    for (;;) {
      post(ch, { type: 'ask', to, id });
      const r = await check();
      if (r) return r;
      const t = Date.now();
      if (t - alive > timeoutMs || t - start > maxMs) return { status: 'timeout' };
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          wake = null;
          resolve();
        };
        const timer = setTimeout(done, intervalMs);
        wake = done;
      });
    }
  } finally {
    if (ch) {
      ch.onmessage = null;
      ch.close();
    }
  }
}

/** 有沒有給 `to` 的交接資料（不讀出、不刪；寄件前提醒「會蓋掉上一份」用） */
export async function hasHandoff(to: string): Promise<boolean> {
  if (!hasIndexedDb()) return false;
  try {
    return (await idbGet<unknown>(to, db())) !== undefined;
  } catch {
    return false;
  }
}
