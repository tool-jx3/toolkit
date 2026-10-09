/**
 * 專案檔（共用專案檔格式的 ZIP：project.json＋files/<圖片的資產 id>.<副檔名>，規格 3.6）。
 * 讀入時先整理內容（normalizeState），用到的圖片都要在 ZIP 裡（或這個瀏覽器已經有）而且能解碼，才換掉目前的內容。
 */
import { importAssetFiles } from '@/core/assets';
import { type ChartState, imageIds, normalizeState } from './model';
import { assets, markSessionImage } from './store';
import { S } from './strings';

export class ProjectDataError extends Error {}

/** 存進專案檔的圖片 */
export const projectAssetIds = (d: ChartState): string[] => [...new Set(imageIds(d))];

export async function importProject(
  data: unknown,
  files: Map<string, Uint8Array>,
): Promise<ChartState> {
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    throw new ProjectDataError(S.projectBad);
  const next = normalizeState(data);
  const imported = await importAssetFiles(assets, files.entries());
  for (const id of imported.ids) markSessionImage(id);
  for (const id of projectAssetIds(next)) {
    const bmp = await assets.bitmap(id).catch(() => undefined);
    if (!bmp) throw new ProjectDataError(S.projectMissingImage);
  }
  return next;
}

/**
 * 存專案檔時讀不到的圖片：那些角色存成沒有圖片（四象限畫圓點），存出來的檔開得了（規格 F74、7.1）。
 * 回傳要存的狀態與受影響的角色名字。
 */
export function dropMissingImages(
  d: ChartState,
  missing: ReadonlySet<string>,
): { data: ChartState; names: string[] } {
  if (!missing.size) return { data: d, names: [] };
  const names: string[] = [];
  const characters = d.characters.map((c) => {
    if (!c.image || !missing.has(c.image.id)) return c;
    names.push(c.name || S.noName);
    return { ...c, image: null, marker: 'dot' as const };
  });
  return { data: { ...d, characters }, names };
}
