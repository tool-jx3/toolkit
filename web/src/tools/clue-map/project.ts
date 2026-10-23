/**
 * 專案檔（共用專案檔格式的 ZIP：project.json＋files/<圖片的資產 id>.<副檔名>，沒有圖片時只有 project.json；也讀只有 JSON 的專案檔，規格 3.1）。
 */
import { importAssetFiles } from '@/core/assets';
import { ProjectFileError } from '@/core/storage';
import { assetIds, type ClueMapState, LIMITS, normalizeState } from './model';
import { assets } from './store';
import { S } from './strings';

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
    throw new ProjectFileError(S.projectBad);
  const next = normalizeState(data);
  const given = (data as { spots?: unknown }).spots;
  const droppedSpots = Array.isArray(given) ? Math.max(0, given.length - LIMITS.spots) : 0;
  const imported = await importAssetFiles(assets, files.entries());
  for (const id of projectAssetIds(next)) {
    const bmp = await assets.bitmap(id).catch(() => undefined);
    if (!bmp) throw new ProjectFileError(S.projectMissingImage);
  }
  return { state: next, notSaved: imported.notPersisted > 0, droppedSpots };
}
