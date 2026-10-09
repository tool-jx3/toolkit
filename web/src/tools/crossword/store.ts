/**
 * 狀態與動作：
 * - useCrossword：答案來源、設定、外觀與排好的盤面（自動儲存 `trpg-toolkit:crossword`、復原／重做、專案檔）。
 *   讀回時整理（model.ts 的 sanitizeData）；文字超過 AUTOSAVE_TEXT_LIMIT 時不存文字（其餘照存）。
 * - useView：顯示答案（`trpg-toolkit:crossword:preview`，不列入復原）。
 * 原作沒有瀏覽器存檔，沒有要搬移的資料。
 */
import type { StateStorage } from 'zustand/middleware';
import { createPreviewStore, createToolStore, historyGesture } from '@/core/storage';
import { extractWords } from './extract';
import {
  buildFromCandidates,
  buildFromEntries,
  parseList,
  puzzleListText,
  type Rng,
} from './generate';
import {
  AUTOSAVE_TEXT_LIMIT,
  type CrosswordData,
  DATA_VERSION,
  inputKey,
  sanitizeData,
  TOOL_ID,
} from './model';
import { initialData } from './sample';

export { TOOL_ID };

function local(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** 讀回時整理 data（壞掉的存檔當作沒有存檔）；寫入照常（寫不進去時由 createToolStore 記下錯誤） */
function sanitizingStorage(clean: (raw: unknown) => unknown): StateStorage {
  return {
    getItem: (name) => {
      let raw: string | null = null;
      try {
        raw = local()?.getItem(name) ?? null;
      } catch {
        return null;
      }
      if (raw === null) return null;
      try {
        const parsed = JSON.parse(raw) as { state?: { data?: unknown }; version?: number };
        const data = clean(parsed?.state?.data);
        return data ? JSON.stringify({ ...parsed, state: { ...parsed.state, data } }) : null;
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

const INITIAL = initialData();

export const useCrossword = createToolStore<CrosswordData>(TOOL_ID, INITIAL, {
  version: DATA_VERSION,
  storage: sanitizingStorage((raw) => sanitizeData(raw, INITIAL)),
  migrate: (raw) => sanitizeData(raw, INITIAL) ?? INITIAL,
  /* 很長的文字不存進瀏覽器（整個網站共用 localStorage 的空間） */
  partialize: (d) => (d.text.length > AUTOSAVE_TEXT_LIMIT ? { ...d, text: '' } : d),
});

export interface ViewState {
  showAnswers: boolean;
}

export const useView = createPreviewStore<ViewState>(TOOL_ID, { showAnswers: false });

/** 文字欄：開始打字到離開算一步復原 */
export const gesture = historyGesture(useCrossword);

export const dataNow = (): CrosswordData => useCrossword.getState().data;

/** 一次變更＝一步復原（不和剛才的打字合併） */
export function commit(recipe: (d: CrosswordData) => void): void {
  useCrossword.getState().update((d) => {
    recipe(d as CrosswordData);
  });
}

/** 自己成為一步復原的變更（先結束打字中的那一步，也不和下一個變更合併） */
export function step(recipe: (d: CrosswordData) => void): void {
  useCrossword.endGesture();
  useCrossword.beginGesture();
  commit(recipe);
  useCrossword.endGesture();
}

/** 讀進文字檔：取代文字（換行統一成 \n）、記下檔名、切到「從文字擷取」（一步復原） */
export function loadText(text: string, fileName: string): void {
  /* 換行一律換成 \n（只用 \r 換行的舊 Mac 檔案、CRLF；對等驗證 §4） */
  const normalized = text.replace(/\r\n?/g, '\n');
  step((d) => {
    d.mode = 'text';
    d.text = normalized;
    d.fileName = fileName;
  });
}

export type GenerateResult = { ok: true; placed: number } | { ok: false; reason: 'empty' | 'none' };

/**
 * 產生填字遊戲（規格 F14）：目前的答案來源與設定 → 盤面（一步復原）。
 * 文字是空的、找不到可用的單字時不改盤面（原作也不改），回傳原因。
 */
export function generate(rng: Rng = Math.random): GenerateResult {
  const d = dataNow();
  if (d.mode === 'text' ? !d.text.trim() : !d.list.trim()) return { ok: false, reason: 'empty' };
  const built =
    d.mode === 'text'
      ? buildFromCandidates(
          extractWords(d.text),
          { target: d.wordCount, freqWeight: d.freqWeight, lenWeight: d.lenWeight },
          rng,
        )
      : buildFromEntries(parseList(d.list).entries, rng);
  if (!built.puzzle) return { ok: false, reason: 'none' };
  const puzzle = built.puzzle;
  step((x) => {
    x.puzzle = puzzle;
    x.stats = {
      mode: d.mode,
      found: built.found,
      target: d.mode === 'text' ? d.wordCount : built.found,
      unplaced: built.unplaced,
      key: inputKey(d),
    };
  });
  return { ok: true, placed: puzzle.words.length };
}

/**
 * 把盤面的答案與提示改成「自己列答案」的清單（依號碼、同號碼橫向在前）；盤面不變（一步復原）。
 * 回傳放進清單的答案數。
 */
export function puzzleToList(): number {
  const p = dataNow().puzzle;
  if (!p) return 0;
  const list = puzzleListText(p);
  const n = p.words.length;
  step((x) => {
    x.mode = 'list';
    x.list = list;
    x.stats = {
      mode: 'list',
      found: n,
      target: n,
      unplaced: [],
      key: inputKey({ ...x, mode: 'list', list }),
    };
  });
  return n;
}

export function toggleAnswers(): void {
  useView.getState().patch({ showAnswers: !useView.getState().data.showAnswers });
}

/** 復原／重做：打字中（還沒離開文字欄）先結束這一步 */
export function historyStep(kind: 'undo' | 'redo'): void {
  useCrossword.endGesture();
  const t = useCrossword.temporal.getState();
  if (kind === 'undo') t.undo();
  else t.redo();
}
