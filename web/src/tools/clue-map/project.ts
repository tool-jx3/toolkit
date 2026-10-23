/**
 * 專案檔（共用專案檔格式：沒有上傳的圖片時是 JSON，有時是 ZIP：project.json＋files/<圖片的資產 id>.<副檔名>，規格 3.1）。
 */
import { importAssetFiles } from '@/core/assets';
import { assetIds, type ClueMapState, LIMITS, normalizeState } from './model';
import { assets } from './store';
import { S } from './strings';

export class ProjectDataError extends Error {}

/** 存進專案檔的圖片 */
export const projectAssetIds = (d: ClueMapState): string[] => [...new Set(assetIds(d))];

export interface ImportedProject {
  state: ClueMapState;
  /** 有圖片存不進瀏覽器 */
  notSaved: boolean;
  /** 超過上限沒有讀入的熱點數 */
  droppedSpots: number;
}

export async function importProject(
  data: unknown,
  files: Map<string, Uint8Array>,
): Promise<ImportedProject> {
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    throw new ProjectDataError(S.projectBad);
  const next = normalizeState(data);
  const given = (data as { spots?: unknown }).spots;
  const droppedSpots = Array.isArray(given) ? Math.max(0, given.length - LIMITS.spots) : 0;
  const imported = await importAssetFiles(assets, files.entries());
  for (const id of projectAssetIds(next)) {
    const bmp = await assets.bitmap(id).catch(() => undefined);
    if (!bmp) throw new ProjectDataError(S.projectMissingImage);
  }
  return { state: next, notSaved: imported.notPersisted > 0, droppedSpots };
}
