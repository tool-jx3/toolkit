/**
 * 專案檔（共用專案檔格式的 ZIP：project.json＋files/<資產 id>.<副檔名>）：圖片、出框遮罩、自訂外框與遮罩一起存。
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
  /* 自訂外框、自訂遮罩不見了：拿掉（外框回到單純） */
  if (next.custom.frame && !(await assets.get(next.custom.frame.id))) {
    next.custom.frame = null;
    if (next.look.frame === 'custom') next.look.frame = 'plain';
  }
  if (next.custom.mask && !(await assets.get(next.custom.mask.id))) next.custom.mask = null;
  return { state: next, notSaved: imported.notPersisted > 0 };
}
