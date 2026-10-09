/**
 * 把原作的檔案讀進來（規格 3.9）：解析（legacy.ts）→ 圖片的 data URL 放進圖片庫 → 取代目前的內容（一步復原）。
 * 讀不了的圖片：那個角色照樣加入（沒有圖片）。
 */
import { loadCharacterImage } from './images';
import {
  dataUrlToBlob,
  fromBackupCode,
  fromRelationFile,
  isRelationFile,
  type LegacyImport,
} from './legacy';
import { type ChartState, normalizeState } from './model';
import { chartNow, replaceAll, usePrefs } from './store';

export interface LegacyResult {
  kind: LegacyImport['kind'];
  characters: number;
  pages: number;
  links: number;
  /** 讀不了的圖片 */
  failed: number;
  dropped: number;
  /** 有圖片存不進瀏覽器（這次可以用，重新整理後就沒了） */
  notSaved: boolean;
}

async function apply(imp: LegacyImport): Promise<LegacyResult> {
  const d: ChartState = structuredClone(imp.state);
  let failed = imp.invalid;
  let notSaved = false;
  for (const [i, url] of imp.images) {
    const c = d.characters[i];
    const blob = dataUrlToBlob(url);
    if (!c || !blob) {
      failed++;
      continue;
    }
    try {
      const r = await loadCharacterImage(blob, c.name || `image-${i + 1}`);
      if (!r.persisted) notSaved = true;
      c.image = r.ref;
      c.marker = 'image';
    } catch {
      failed++;
    }
  }
  const next = normalizeState(d);
  replaceAll(next);
  usePrefs.getState().patch({ page: imp.page, chart: imp.kind });
  return {
    kind: imp.kind,
    characters: next.characters.length,
    pages: next.pages.length,
    links: next.relation.links.length,
    failed,
    dropped: imp.dropped,
    notSaved,
  };
}

/** 「開啟專案檔」選到的不是本工具的專案檔：是原作 R 的 JSON 就讀進來，否則 null（交回共用的錯誤） */
export async function openRelationFile(bytes: Uint8Array): Promise<LegacyResult | null> {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes).replace(/^﻿/, ''));
  } catch {
    return null;
  }
  if (!isRelationFile(raw)) return null;
  return apply(fromRelationFile(raw));
}

/** 原作 Q 的備份碼（看不懂時丟 LegacyFileError，內容不變） */
export function openBackupCode(code: string): Promise<LegacyResult> {
  return apply(fromBackupCode(code, chartNow()));
}
