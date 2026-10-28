/**
 * 專案檔（規格 1.3 F67）：沒有圖片時照舊存成 JSON（`{ format: 'trpg-toolkit-project', tool: 'color-palette', version, data }`）；
 * 有角色的立繪時存成共用格式的 ZIP（`project.json`＋`files/<圖片 id>.<副檔名>`）。
 * 讀入時先整理（sanitizeSettings），用到的圖片都要在 ZIP 裡（或這個瀏覽器已經有）而且讀得了，才換掉目前的內容。
 * 版本 1（舊版，只有色條）的專案檔照常讀。
 */
import { importAssetFiles } from '@/core/assets';
import { downloadBytes, downloadText, fileNameWithExt } from '@/core/files';
import { serializeProject, serializeProjectZip } from '@/core/storage';
import { dateStamp } from './characters';
import { imageIds, type Settings, sanitizeSettings } from './logic';
import { assets, DATA_VERSION, settingsNow, TOOL_ID } from './store';
import { S } from './strings';

export class ProjectDataError extends Error {}

/** 讀本工具的專案檔（ZIP 的圖片寫進圖片庫） */
export async function importProject(
  data: unknown,
  files: Map<string, Uint8Array>,
): Promise<{ settings: Settings; notSaved: boolean }> {
  if (!data || typeof data !== 'object' || !Array.isArray((data as Partial<Settings>).bars))
    throw new ProjectDataError(S.projectBad);
  const next = sanitizeSettings(data);
  const imported = await importAssetFiles(assets, files.entries());
  for (const id of imageIds(next)) {
    const bmp = await assets.bitmap(id).catch(() => undefined);
    if (!bmp) throw new ProjectDataError(S.projectMissingImage);
  }
  return { settings: next, notSaved: imported.notPersisted > 0 };
}

/** 存專案檔要帶的圖片 */
export const projectFiles = () => assets.exportFiles(imageIds(settingsNow()));

/** 存成專案檔（和頁首「專案」選單的「存成專案檔」相同；全部清除前的備份用） */
export async function saveProjectNow(now = new Date()): Promise<string> {
  const data = settingsNow();
  const base = `${S.projectFile}_${dateStamp(now)}`;
  if (imageIds(data).length) {
    const files = await projectFiles();
    const name = fileNameWithExt(base, 'zip');
    downloadBytes(
      serializeProjectZip(TOOL_ID, DATA_VERSION, data, files, now),
      name,
      'application/zip',
    );
    return name;
  }
  const name = fileNameWithExt(base, 'json');
  downloadText(serializeProject(TOOL_ID, DATA_VERSION, data, now), name, 'application/json');
  return name;
}
