/**
 * 專案檔（共用專案檔格式）：沒有中間的圖時是 JSON；有圖時是 ZIP（project.json＋files/<資產 id>.<副檔名>）。
 * 讀入時先整理內容（normalizeDoc）；用到的圖要在 ZIP 裡（或這個瀏覽器已經有）而且能解碼，才換掉目前的內容。
 */
import { importAssetFiles } from '@/core/assets';
import { type DocState, docAssetIds, normalizeDoc } from './model';
import { assets } from './store';
import { S } from './strings';

export class ProjectDataError extends Error {}

export const projectAssetIds = (d: DocState): string[] => [...new Set(docAssetIds(d))];

export async function importProject(
  data: unknown,
  files: Map<string, Uint8Array>,
): Promise<{ state: DocState; notSaved: boolean }> {
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    throw new ProjectDataError(S.projectBad);
  const next = normalizeDoc(data);
  const imported = await importAssetFiles(assets, files.entries());
  for (const id of projectAssetIds(next)) {
    const bmp = await assets.bitmap(id).catch(() => undefined);
    if (!bmp) throw new ProjectDataError(S.projectMissingImage);
  }
  return { state: next, notSaved: imported.notPersisted > 0 };
}
