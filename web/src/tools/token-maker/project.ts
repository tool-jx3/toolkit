/**
 * 專案檔（共用專案檔格式的 ZIP：project.json＋files/<資產 id>.<副檔名>）：圖片與出框遮罩一起存。
 * 讀入時先整理內容（normalizeState），用到的圖片與遮罩要在 ZIP 裡（或這個瀏覽器已經有）才換掉目前的內容。
 */
import { importAssetFiles } from '@/core/assets';
import { type DocState, normalizeState } from './model';
import { assets, docAssetIds } from './store';
import { S } from './strings';

export class ProjectDataError extends Error {}

export const projectAssetIds = (d: DocState): string[] => [...new Set(docAssetIds(d))];

export async function importProject(
  data: unknown,
  files: Map<string, Uint8Array>,
): Promise<{ state: DocState; notSaved: boolean }> {
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    throw new ProjectDataError(S.projectBad);
  const next = normalizeState(data);
  const imported = await importAssetFiles(assets, files.entries());
  for (const t of next.tokens) {
    if (t.image && !(await assets.get(t.image.id)))
      throw new ProjectDataError(S.projectMissingImage);
    /* 遮罩不見了：那個棋子沒有出框（不擋下整個專案檔） */
    if (t.mask && !(await assets.get(t.mask.id))) t.mask = null;
  }
  return { state: next, notSaved: imported.notPersisted > 0 };
}
