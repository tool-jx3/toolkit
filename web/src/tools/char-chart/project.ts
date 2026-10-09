/**
 * 專案檔（共用專案檔格式的 ZIP：project.json＋files/<圖片的資產 id>.<副檔名>，規格 3.6）。
 * 讀入時先整理內容（normalizeState），用到的圖片都要在 ZIP 裡（或這個瀏覽器已經有）而且能解碼，才換掉目前的內容。
 */
import { importAssetFiles } from '@/core/assets';
import { type ChartState, imageIds, normalizeState } from './model';
import { assets } from './store';
import { S } from './strings';

export class ProjectDataError extends Error {}

/** 存進專案檔的圖片 */
export const projectAssetIds = (d: ChartState): string[] => [...new Set(imageIds(d))];

export interface ImportedProject {
  state: ChartState;
  /** 有圖片存不進瀏覽器（這次可以用，重新整理之後就沒了） */
  notSaved: boolean;
}

/**
 * 讀本工具的專案檔。圖片一張一張寫進圖片庫時開頁的整理可能剛好在中間執行：已經寫好、還沒換上狀態的圖
 * 由 assets.gcStale 保留（這次開頁寫進或讀過的圖不刪）。
 */
export async function importProject(
  data: unknown,
  files: Map<string, Uint8Array>,
): Promise<ImportedProject> {
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    throw new ProjectDataError(S.projectBad);
  const next = normalizeState(data);
  const imported = await importAssetFiles(assets, files.entries());
  for (const id of projectAssetIds(next)) {
    const bmp = await assets.bitmap(id).catch(() => undefined);
    if (!bmp) throw new ProjectDataError(S.projectMissingImage);
  }
  return { state: next, notSaved: imported.notPersisted > 0 };
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
