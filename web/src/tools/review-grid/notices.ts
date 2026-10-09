/**
 * 放進圖片的結果合成一則通知（規格 F14）：同一批的「放進幾格」「不是圖片」「讀不了」「放不下」「存不進瀏覽器」寫在同一則，
 * 有任何問題時警告色、一張都沒放進去時錯誤色（不會被後面的成功通知蓋掉）。純函式。
 */
import { S } from './strings';

export interface PlaceResult {
  /** 放進頭像或格子 */
  target: 'profile' | 'cells';
  /** 放進去的張數（頭像：0 或 1） */
  placed: number;
  /** 不是圖片的檔名 */
  notImages: readonly string[];
  /** 讀不了的檔名 */
  failed: readonly string[];
  /** 格子到上限、放不下的張數 */
  dropped: number;
  /** 有圖片存不進瀏覽器 */
  notSaved: boolean;
}

export interface PlaceNotice {
  title: string;
  description?: string;
  tone: 'success' | 'warning' | 'danger';
}

export function placeNotice(r: PlaceResult): PlaceNotice | null {
  const notes = [
    r.notImages.length ? S.notImage(r.notImages.join('、')) : '',
    r.failed.length ? S.decodeError(r.failed.join('、')) : '',
    r.dropped ? S.imagesDropped(r.dropped) : '',
    r.notSaved ? S.imageNotSaved : '',
  ].filter(Boolean);
  if (r.placed > 0) {
    const title = r.target === 'profile' ? S.avatarSet : S.imagesPlaced(r.placed);
    return notes.length
      ? { title, description: notes.join(''), tone: 'warning' }
      : { title, tone: 'success' };
  }
  if (!notes.length) return null;
  const [title, ...rest] = notes;
  return { title, description: rest.length ? rest.join('') : undefined, tone: 'danger' };
}
