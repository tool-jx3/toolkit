/**
 * 專案檔（共用專案檔格式的 ZIP：project.json＋files/<圖片的資產 id>.<副檔名>，規格 3.7）。
 * 讀入時先整理內容（normalizeState），用到的圖片都要在 ZIP 裡（或這個瀏覽器已經有）而且能解碼，才換掉目前的內容。
 */
import { importAssetFiles } from '@/core/assets';
import { imageIds, normalizeState, type ReviewState } from './model';
import { assets } from './store';
import { S } from './strings';

export class ProjectDataError extends Error {}

/** 存進專案檔的圖片 */
export const projectAssetIds = (d: ReviewState): string[] => [...new Set(imageIds(d))];

export async function importProject(
  data: unknown,
  files: Map<string, Uint8Array>,
): Promise<ReviewState> {
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    throw new ProjectDataError(S.projectBad);
  const next = normalizeState(data);
  await importAssetFiles(assets, files.entries());
  for (const id of projectAssetIds(next)) {
    const bmp = await assets.bitmap(id).catch(() => undefined);
    if (!bmp) throw new ProjectDataError(S.projectMissingImage);
  }
  return next;
}
