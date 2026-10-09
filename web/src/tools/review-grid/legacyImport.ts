/**
 * 把原作的資料備份讀進來（規格 3.8）：解析（legacy.ts）→ 圖片的 data URL 放進圖片庫 → 換掉個人資料與格子（一步復原）。
 * 排列、圖片比例、心得標籤清單留著（原作的備份沒有這些）。讀不了的圖片：那一格照樣讀進來（沒有圖片）。
 */
import { dataUriToBlob } from '@/core/image';
import { loadReviewImage } from './images';
import { fromLegacyBackup, isLegacyBackup } from './legacy';
import { type ImageRef, normalizeState, type ReviewState } from './model';
import { replaceAll, reviewNow } from './store';

export interface LegacyResult {
  cells: number;
  /** 讀不了的圖片 */
  failed: number;
  /** 超過格數上限沒讀的 */
  dropped: number;
  /** 有圖片存不進瀏覽器（這次可以用，重新整理後就沒了） */
  notSaved: boolean;
}

type Loaded = { ref: ImageRef; persisted: boolean } | 'failed' | null;

async function toImage(url: string | null, name: string): Promise<Loaded> {
  if (!url) return null;
  try {
    return await loadReviewImage(dataUriToBlob(url), name);
  } catch {
    return 'failed';
  }
}

/** 「開啟專案檔」選到的不是本工具的專案檔：是原作的備份就讀進來，否則 null（交回共用的錯誤） */
export async function openLegacyFile(bytes: Uint8Array): Promise<LegacyResult | null> {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes).replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
  if (!isLegacyBackup(raw)) return null;
  const b = fromLegacyBackup(raw);
  let failed = 0;
  let notSaved = false;
  const take = (r: Loaded): ImageRef | null => {
    if (r === 'failed') {
      failed++;
      return null;
    }
    if (r && !r.persisted) notSaved = true;
    return r?.ref ?? null;
  };
  const cur = reviewNow();
  const next: ReviewState = {
    view: cur.view,
    ratio: cur.ratio,
    tags: [...cur.tags],
    profile: {
      name: b.profile.name,
      handle: b.profile.handle,
      image: take(await toImage(b.profile.image, 'profile')),
    },
    cells: [],
  };
  for (let i = 0; i < b.cells.length; i++) {
    const c = b.cells[i];
    c.image = take(await toImage(b.images[i], `cell-${i + 1}`));
    next.cells.push(c);
  }
  replaceAll(normalizeState(next));
  return { cells: next.cells.length, failed, dropped: b.dropped, notSaved };
}
