/**
 * 預覽的狀態（純函式）：預覽文字、上一次產生的團報（基準）、有沒有手動編輯、復原／重做紀錄。
 * 規格：docs/refactor/specs/session-report.md 3.8（手動編輯的保留）、3.9（復原紀錄）。
 */

/** 復原紀錄最多幾筆 */
export const HISTORY_LIMIT = 80;

export interface PreviewState {
  /** 預覽目前的文字 */
  text: string;
  /** 上一次產生的團報（3.8 的基準） */
  base: string;
  /** 有手動編輯 */
  dirty: boolean;
  /** 復原紀錄（最後一筆最新） */
  past: string[];
  /** 重做紀錄（最後一筆是下一個要重做的） */
  future: string[];
}

export const emptyPreview = (): PreviewState => ({
  text: '',
  base: '',
  dirty: false,
  past: [],
  future: [],
});

/**
 * 手動編輯的保留（3.8）：base＝上一次產生的團報、edited＝目前的預覽、next＝新產生的團報。
 * 相同的開頭與結尾以外的部分當作手動改的那一段，放到新團報的同一個位置。字元以 UTF-16 碼元計。
 */
export function mergeManualEdits(base: string, edited: string, next: string): string {
  if (!base || edited === base) return next;
  let start = 0;
  const minLen = Math.min(base.length, edited.length);
  while (start < minLen && base[start] === edited[start]) start += 1;
  let baseEnd = base.length;
  let editedEnd = edited.length;
  while (baseEnd > start && editedEnd > start && base[baseEnd - 1] === edited[editedEnd - 1]) {
    baseEnd -= 1;
    editedEnd -= 1;
  }
  const manual = edited.slice(start, editedEnd);
  const nextEnd = Math.max(start, next.length - (base.length - baseEnd));
  return next.slice(0, start) + manual + next.slice(nextEnd);
}

/** 新產生的團報（輸入改變）：沒有手動編輯就換掉，有就保留手動的部分 */
export function applyGenerated(s: PreviewState, next: string): PreviewState {
  const text = s.dirty ? mergeManualEdits(s.base, s.text, next) : next;
  return { ...s, text, base: next, dirty: text !== next };
}

/** 記一步（3.9）：和最後一筆不同才加；重做紀錄一律清空 */
export function pushHistory(s: PreviewState): PreviewState {
  const past =
    s.past[s.past.length - 1] === s.text && s.past.length
      ? s.past
      : [...s.past, s.text].slice(-HISTORY_LIMIT);
  return { ...s, past, future: [] };
}

/** 使用者在預覽打字、插入裝飾（新版也算手動編輯） */
export function editPreview(s: PreviewState, text: string): PreviewState {
  return { ...pushHistory(s), text, dirty: true };
}

/** 清除預覽 */
export function clearPreview(s: PreviewState): PreviewState {
  return { ...pushHistory(s), text: '', dirty: true };
}

/** 重新產生：記一步、捨棄手動編輯 */
export function regenerate(s: PreviewState, next: string): PreviewState {
  return { ...pushHistory(s), text: next, base: next, dirty: false };
}

export function undo(s: PreviewState): PreviewState {
  if (!s.past.length) return s;
  const past = s.past.slice(0, -1);
  return { ...s, past, future: [...s.future, s.text], text: s.past[s.past.length - 1] };
}

export function redo(s: PreviewState): PreviewState {
  if (!s.future.length) return s;
  const future = s.future.slice(0, -1);
  return { ...s, future, past: [...s.past, s.text], text: s.future[s.future.length - 1] };
}
