/**
 * 專案檔（共用專案檔格式的 ZIP：project.json＋files/<照片的資產 id>.<副檔名>，規格 3.6）。
 * 讀入時先整理內容（normalizeState），照片要在 ZIP 裡（或這個瀏覽器已經有）而且能解碼，才換掉目前的內容。
 */
import { importAssetFiles } from '@/core/assets';
import { type MemeState, normalizeState } from './model';
import { assets } from './store';
import { S } from './strings';

export class ProjectDataError extends Error {}

/** 存進專案檔的照片 */
export const projectAssetIds = (d: MemeState): string[] => (d.photo ? [d.photo.id] : []);

export interface ImportedProject {
  state: MemeState;
  /** 照片存不進瀏覽器（這次可以用，重新整理之後就沒了） */
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
  if (next.photo) {
    const bmp = await assets.bitmap(next.photo.id).catch(() => undefined);
    if (!bmp) throw new ProjectDataError(S.projectMissingPhoto);
  }
  return { state: next, notSaved: imported.notPersisted > 0 };
}
