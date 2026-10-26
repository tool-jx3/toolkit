/**
 * 專案檔（共用專案檔格式的 ZIP：project.json＋files/<資產 id>.<副檔名>，規格 3.10）：讀入走共用的 importFxProject
 * （core/imagefx）——先整理內容（normalizeState），圖片要在 ZIP 裡（或這個瀏覽器已經有）而且能解碼，才換掉目前的內容。
 */
import { type ImportedProject, importFxProject } from '@/core/imagefx';
import { type FxState, normalizeState, stateAssetIds } from './model';
import { assets } from './store';
import { S } from './strings';

export { ProjectDataError } from '@/core/imagefx';

/** 存進專案檔的圖 */
export const projectAssetIds = (d: FxState): string[] => [...new Set(stateAssetIds(d))];

export const importProject = (
  data: unknown,
  files: Map<string, Uint8Array>,
): Promise<ImportedProject<FxState>> =>
  importFxProject(data, files, assets, normalizeState, stateAssetIds, S);
