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

export async function importProject(
  data: unknown,
  files: Map<string, Uint8Array>,
): Promise<PolaroidState> {
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    throw new ProjectDataError(S.projectBad);
  const next = normalizeState(data);
  const imported = await importAssetFiles(assets, files.entries());
  for (const id of imported.ids) markSessionAsset(id);
  for (const id of projectAssetIds(next)) {
    const bmp = await assets.bitmap(id).catch(() => undefined);
    if (!bmp) throw new ProjectDataError(S.projectMissingImage);
  }
  return next;
}
