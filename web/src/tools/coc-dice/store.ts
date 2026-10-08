/**
 * 狀態：
 * - useSettings：技能值、獎勵骰／懲罰骰、算式、護甲、傷害擲骰結果（自動存檔 `trpg-toolkit:coc-dice`、復原／重做）。
 * - usePrefs：目前的分頁、紀錄面板開關與擲骰紀錄（自動存檔 `trpg-toolkit:coc-dice:preview`，不列入復原）。
 *   新版還沒有存檔時，擲骰紀錄從舊版的 `iklab_coc7_dice_v1` 搬過來（舊的不刪）。
 * 兩者讀回時都先整理（型別不符的欄位用預設值、紀錄只留有文字的項目）。
 */
import type { StateStorage } from 'zustand/middleware';
import { createPreviewStore, createToolStore } from '@/core/storage';
import {
  DEFAULT_SETTINGS,
  type DiceSettings,
  LEGACY_LOG_KEY,
  type LogEntry,
  legacyLogEntries,
  sanitizeLog,
  sanitizeSettings,
  TOOL_ID,
} from './logic';

function local(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readLocal(key: string): string | null {
  try {
    return local()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** localStorage，讀回時用 fix 整理 `state.data`（壞掉時當作沒有存檔） */
function cleaningStorage(fix: (data: unknown) => unknown): StateStorage {
  return {
    getItem: (name) => {
      const raw = readLocal(name);
      if (raw === null) return null;
      try {
        const parsed = JSON.parse(raw) as { state?: { data?: unknown } };
        return JSON.stringify({
          ...parsed,
          state: { ...parsed.state, data: fix(parsed?.state?.data) },
        });
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      const ls = local();
      if (!ls) throw new Error('localStorage 無法使用');
      ls.setItem(name, value);
    },
    removeItem: (name) => {
      try {
        local()?.removeItem(name);
      } catch {
        /* 刪不掉就算了 */
      }
    },
  };
}

export const useSettings = createToolStore<DiceSettings>(TOOL_ID, DEFAULT_SETTINGS, {
  storage: cleaningStorage(sanitizeSettings),
});

/** 一個獨立的復原步驟（按鈕、選項：不跟緊接在前面的打字併成一步） */
export function settingsStep(fn: () => void): void {
  useSettings.beginGesture();
  try {
    fn();
  } finally {
    useSettings.endGesture();
  }
}

export type DiceTab = 'roll' | 'damage';

export interface DicePrefs {
  tab: DiceTab;
  logOpen: boolean;
  log: LogEntry[];
}

export const PREFS_KEY = `trpg-toolkit:${TOOL_ID}:preview`;

function sanitizePrefs(raw: unknown): DicePrefs {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    tab: r.tab === 'damage' ? 'damage' : 'roll',
    logOpen: r.logOpen === true,
    log: sanitizeLog(r.log),
  };
}

/** 新版沒有存檔時，紀錄的初始值取舊版的 */
function initialPrefs(): DicePrefs {
  const hasNew = readLocal(PREFS_KEY) !== null;
  const legacy = hasNew ? null : legacyLogEntries(readLocal(LEGACY_LOG_KEY));
  return { tab: 'roll', logOpen: false, log: legacy ?? [] };
}

export const usePrefs = createPreviewStore<DicePrefs>(TOOL_ID, initialPrefs(), {
  storage: cleaningStorage(sanitizePrefs),
});
