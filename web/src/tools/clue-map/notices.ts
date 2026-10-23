/**
 * 加入圖片的結果合成一則通知（規格 2.）：同一批的「已加入」「不是圖片」「讀不了」「存不進瀏覽器」寫在同一則；
 * 有任何問題時警告色，一張都沒加進去時錯誤色（第一個問題當標題）。純函式。
 */
import { S } from './strings';

export interface AddResult {
  /** 用掉的張數（場景、線索圖片都只用第一張） */
  added: number;
  /** 不是圖片的檔名 */
  notImages: readonly string[];
  /** 讀不了的檔名 */
  failed: readonly string[];
  /** 有圖片存不進瀏覽器 */
  notSaved: boolean;
  /** 加進去之後的標題 */
  title: string;
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
    r.notSaved ? S.imageNotSaved : '',
  ].filter(Boolean);
  if (r.added > 0) {
    return notes.length
      ? { title: r.title, description: notes.join(''), tone: 'warning' }
      : { title: r.title, tone: 'success' };
  }
  if (!notes.length) return null;
  const [title, ...rest] = notes;
  return { title, description: rest.length ? rest.join('') : undefined, tone: 'danger' };
}
