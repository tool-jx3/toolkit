/**
 * 專案檔（ZIP：共用專案檔格式 project.json＋files/ 的圖片）：資料是 { template: 版型 id, draft: 編輯內容 }。
 * 讀入時：檔案大小、檔案數、解壓後大小、版型、內容（validateDraft）、圖片都在且能解碼，才換掉目前的內容。
 */
import { importAssetFiles } from '@/core/assets';
import {
  ARCHIVE_MAX_BYTES,
  ARCHIVE_MAX_FILES,
  type Draft,
  DraftError,
  draftAssets,
  type TemplateDef,
  validateDraft,
} from './model';
import { assets } from './store';
import { S } from './strings';
import { templateById } from './templates';

export interface ProjectData {
  template: string;
  draft: Draft;
}

export const projectData = (def: TemplateDef, d: Draft): ProjectData => ({
  template: def.id,
  draft: d,
});

/**
 * 讀入專案檔的內容（不合格丟 DraftError，訊息可以直接顯示）。notSaved：有圖片存不進瀏覽器
 * （這次可以用，重新整理之後就沒了）。圖片一張一張寫進圖片庫時開頁的整理（assets.gcStale）不會刪掉已經寫好的。
 */
export async function importProject(
  def: TemplateDef,
  data: unknown,
  files: Map<string, Uint8Array>,
  sourceSize: number,
): Promise<{ draft: Draft; notSaved: boolean }> {
  if (sourceSize > ARCHIVE_MAX_BYTES) throw new DraftError(S.archiveTooBig);
  let total = 0;
  for (const b of files.values()) total += b.length;
  if (files.size > ARCHIVE_MAX_FILES || total > ARCHIVE_MAX_BYTES)
    throw new DraftError(S.archiveTooManyFiles);
  const p = data as Partial<ProjectData> | null;
  if (!p || typeof p !== 'object' || typeof p.template !== 'string')
    throw new DraftError(S.archiveUnknownTemplate);
  if (p.template !== def.id) {
    const other = templateById(p.template);
    throw new DraftError(other ? S.archiveOtherTemplate(other.name) : S.archiveUnknownTemplate);
  }
  const draft = validateDraft(def, p.draft);
  const imported = await importAssetFiles(assets, files.entries());
  for (const id of draftAssets(draft)) {
    const bmp = await assets.bitmap(id).catch(() => undefined);
    if (!bmp) throw new DraftError(S.archiveMissingImage);
  }
  return { draft, notSaved: imported.notPersisted > 0 };
}
