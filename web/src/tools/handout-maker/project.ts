/**
 * 專案檔（共用專案檔格式的 ZIP：project.json＋files/<資產 id>.<副檔名>，規格 3.8）：整份道具清單＋用到的圖。
 * 讀入時先整理內容（normalizeState）；用到的圖要在 ZIP 裡（或這個瀏覽器已經有）而且能解碼，才換掉目前的內容。
 */
import { importAssetFiles } from '@/core/assets';
import { type HandoutState, normalizeState, stateAssetIds } from './model';
import { assets, blankState } from './store';
import { S } from './strings';

export class ProjectDataError extends Error {}

/** 存進專案檔的圖 */
export const projectAssetIds = (d: HandoutState): string[] => stateAssetIds(d);

export interface ImportedProject {
  state: HandoutState;
  /** 有圖存不進瀏覽器（這次可以用，重新整理之後就沒了） */
  notSaved: boolean;
}

/** 專案檔的資料是不是線索道具的（至少要有 items 陣列） */
export const isProjectData = (data: unknown): boolean =>
  !!data &&
  typeof data === 'object' &&
  !Array.isArray(data) &&
  Array.isArray((data as { items?: unknown }).items);

export async function importProject(
  data: unknown,
  files: Map<string, Uint8Array>,
): Promise<ImportedProject> {
  if (!isProjectData(data)) throw new ProjectDataError(S.projectBad);
  const next = normalizeState(data, blankState);
  const imported = await importAssetFiles(assets, files.entries());
  for (const id of projectAssetIds(next)) {
    const bmp = await assets.bitmap(id).catch(() => undefined);
    if (!bmp) throw new ProjectDataError(S.projectMissingImage);
  }
  return { state: next, notSaved: imported.notPersisted > 0 };
}
