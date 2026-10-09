/**
 * 加入圖片的結果合成一則通知（規格 F25）：同一批的「已加入 N 張」「不是圖片」「讀不了」「超過上限」「存不進瀏覽器」寫在同一則；
 * 有任何問題時警告色，一張都沒加進去時錯誤色（第一個問題當標題）。純函式。
 */
import { S } from './strings';

export interface AddResult {
  /** 加進去的張數 */
  added: number;
  /** 不是圖片的檔名 */
  notImages: readonly string[];
  /** 讀不了的檔名 */
  failed: readonly string[];
  /** 超過上限、沒有加入的張數 */
  over: number;
  /** 有圖片存不進瀏覽器 */
  notSaved: boolean;
  /** 加入的是背景圖 */
  background?: boolean;
}

export interface Notice {
  title: string;
  description?: string;
  tone: 'success' | 'warning' | 'danger';
}

export function addNotice(r: AddResult): Notice | null {
  const notes = [
    r.notImages.length ? S.notImage(r.notImages.join('、')) : '',
    r.failed.length ? S.decodeError(r.failed.join('、')) : '',
    r.over ? S.imagesOver(r.over) : '',
    r.notSaved ? S.imageNotSaved : '',
  ].filter(Boolean);
  if (r.added > 0) {
    const title = r.background ? S.bgSet : S.imagesAdded(r.added);
    return notes.length
      ? { title, description: notes.join(''), tone: 'warning' }
      : { title, tone: 'success' };
  }
  if (!notes.length) return null;
  const [title, ...rest] = notes;
  return { title, description: rest.length ? rest.join('') : undefined, tone: 'danger' };
}
