/**
 * 專案檔（共用專案檔格式的 ZIP：project.json＋files/<資產 id>.<副檔名>，規格 3.4）。
 * 讀入時先整理內容（normalizeState），照片與貼紙的圖要在 ZIP 裡（或這個瀏覽器已經有）而且能解碼，才換掉目前的內容。
 */
import { importAssetFiles } from '@/core/assets';
import { normalizeState, type PolaroidState } from './model';
import { assets, docAssetIds, markSessionAsset } from './store';
import { S } from './strings';

export class ProjectDataError extends Error {}

/** 存進專案檔的圖（照片＋貼紙） */
export const projectAssetIds = (d: PolaroidState): string[] => [...new Set(docAssetIds(d))];

/** ZIP 裡的圖檔名 `files/<資產 id>.<副檔名>` → 資產 id */
export const assetIdOfPath = (path: string): string =>
  (path.split('/').pop() ?? path).replace(/\.[^.]+$/, '');

export interface ImportedProject {
  state: PolaroidState;
  /** 有圖存不進瀏覽器（這次可以用，重新整理之後就沒了） */
  notSaved: boolean;
}

export async function importProject(
  data: unknown,
  files: Map<string, Uint8Array>,
): Promise<ImportedProject> {
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    throw new ProjectDataError(S.projectBad);
  const next = normalizeState(data);
  /*
   * 寫進圖片庫之前先記下這些 id：一張一張寫的時候，開頁的整理可能剛好在中間執行，
   * 已經寫好、還沒換上狀態的圖會被當成沒人用而刪掉（對等驗證 F51）。
   */
  for (const path of files.keys()) {
    const id = assetIdOfPath(path);
    if (id) markSessionAsset(id);
  }
  for (const id of projectAssetIds(next)) markSessionAsset(id);
  const imported = await importAssetFiles(assets, files.entries());
  for (const id of projectAssetIds(next)) {
    const bmp = await assets.bitmap(id).catch(() => undefined);
    if (!bmp) throw new ProjectDataError(S.projectMissingImage);
  }
  return { state: next, notSaved: imported.notPersisted > 0 };
}
