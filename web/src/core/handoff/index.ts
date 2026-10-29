/**
 * 工具之間交接一個檔案（2026-10-29 新增；第一個用的是室內平面圖產生器 → 地圖演出產生器，floor-plan F267、map-fx F84）。
 *
 * - 寄件的工具 `sendHandoff({ to, from, name, blob, meta })` 存進 IndexedDB（圖片放不進 localStorage）：
 *   資料庫 `trpg-toolkit:handoff`，鍵＝收件的工具 id；同一個收件的工具只留最新的一份（再送一次蓋掉）。
 * - 收件的工具開頁時 `takeHandoff(to)`：讀出來就刪掉（讀過一次就沒有了，重新整理不會再讀一次）；
 *   過期的（預設超過一天）與壞掉的也刪掉，回傳 null。開頁時順便清掉所有過期的交接資料（`purgeHandoffs`）。
 * - 沒有 IndexedDB（部分瀏覽器的無痕模式）或寫入失敗時 `sendHandoff` 回傳 false，寄件的工具改請使用者下載再讀入。
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
}

export interface Handoff extends HandoffInput {
  /** 寫入的時間（ms） */
  createdAt: number;
}

/** 交接資料的有效期限（預設一天） */
export const HANDOFF_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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
    typeof Blob !== 'undefined' &&
    h.blob instanceof Blob
  );
};

/** 寄出（同一個收件的工具只留最新的一份）；沒有 IndexedDB 或寫入失敗時 false */
export async function sendHandoff(input: HandoffInput, now = Date.now()): Promise<boolean> {
  if (!hasIndexedDb()) return false;
  try {
    const value: Handoff = { ...input, createdAt: now };
    await idbSet(input.to, value, db());
    return true;
  } catch {
    return false;
  }
}

/** 清掉過期（或壞掉）的交接資料；回傳清掉的筆數 */
export async function purgeHandoffs(
  maxAgeMs = HANDOFF_MAX_AGE_MS,
  now = Date.now(),
): Promise<number> {
  if (!hasIndexedDb()) return 0;
  try {
    let n = 0;
    for (const [key, value] of await idbEntries<unknown>(db())) {
      if (isHandoff(value) && now - value.createdAt <= maxAgeMs && value.createdAt <= now + 60_000)
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

/** 有沒有給 `to` 的交接資料（不讀出、不刪；寄件前提醒「會蓋掉上一份」用） */
export async function hasHandoff(to: string): Promise<boolean> {
  if (!hasIndexedDb()) return false;
  try {
    return (await idbGet<unknown>(to, db())) !== undefined;
  } catch {
    return false;
  }
}
