/**
 * 專案檔（共用專案檔格式的 ZIP：project.json＋files/<資產 id>.<副檔名>，規格 3.9）。
 * 讀入時先整理內容（normalizeState），用到的照片要在 ZIP 裡（或這個瀏覽器已經有）而且能解碼，才換掉目前的內容。
 */
import { importAssetFiles } from '@/core/assets';
import { collectAssetIds, normalizeState, type SocialState } from './model';
import { assets } from './store';
import { S } from './strings';

export class ProjectDataError extends Error {}

export interface ImportedProject {
  state: SocialState;
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
  const imported = await importAssetFiles(assets, files.entries());
  for (const id of collectAssetIds(next)) {
    const bmp = await assets.bitmap(id).catch(() => undefined);
    if (!bmp) throw new ProjectDataError(S.projectMissingImage);
  }
  return { state: next, notSaved: imported.notPersisted > 0 };
}
