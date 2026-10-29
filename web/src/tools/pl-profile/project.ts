/**
 * 專案檔（規格 F43、3.7）：共用的專案檔格式。有頭像時存成 ZIP（project.json＋files/<頭像的資產 id>.<副檔名>），
 * 沒有頭像時是 JSON。讀入時整理內容（normalizeData）；頭像不在 ZIP 裡、這個瀏覽器也沒有時開成沒有頭像（提醒）。
 */
import { importAssetFiles } from '@/core/assets';
import { safeFileName } from '@/core/files';
import { normalizeData, type ProfileData } from './model';
import { assets } from './store';
import { S } from './strings';

export class ProjectDataError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export interface ImportedProject {
  state: ProfileData;
  warnings: string[];
}

export async function importProject(
  data: unknown,
  files: Map<string, Uint8Array>,
): Promise<ImportedProject> {
  if (!isObj(data)) throw new ProjectDataError(S.project.bad);
  let state = normalizeData(data);
  const imported = await importAssetFiles(assets, files.entries());
  const warnings: string[] = [];
  const avatar = state.profile.avatar;
  if (avatar) {
    const bmp = await assets.bitmap(avatar.id).catch(() => undefined);
    if (!bmp) {
      state = { ...state, profile: { ...state.profile, avatar: null, avatarPlacement: null } };
      warnings.push(S.project.missingAvatar);
    } else if (imported.notPersisted > 0) warnings.push(S.project.avatarNotSaved);
  }
  return { state, warnings };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 專案檔的檔名（不含副檔名）：<暱稱>_自介卡_YYYYMMDD */
export function projectFileBase(d: ProfileData, now: Date): string {
  const nick = d.profile.nickname.trim();
  const date = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
  const base = nick ? `${nick}_${S.project.fileWord}_${date}` : `${S.project.fileWord}_${date}`;
  return safeFileName(base, { fallback: S.project.fileWord });
}
