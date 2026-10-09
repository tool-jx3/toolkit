/**
 * 專案檔與原作地圖檔的存取（快捷鍵、拖放、選單共用）。
 * - 本工具的專案檔：共用格式（`{ format: 'trpg-toolkit-project', tool: 'floor-plan', … }`）；版本比這一版新的不開（D15）。
 * - 原作（TRPG 室內圖メーカー）的 .trpgmap.json：欄位相同，整理後讀進來。
 *
 * 「專案 → 開啟專案檔…」走共用的 ProjectMenu：本工具的專案檔交給 openProject、其他檔案交給 openForeign（App.tsx），
 * 和 Ctrl＋O、拖放、「匯入…」（openFile）的結果與通知相同。
 */
import { downloadText, pickFiles, readAsBytes } from '@/core/files';
import {
  type ProjectFile,
  ProjectFileError,
  parseProjectBytes,
  serializeProject,
} from '@/core/storage';
import { S } from '../strings';
import { fileBase, isLegacyMapFile, notify, openProjectData } from './actions';
import { DATA_VERSION, TOOL_ID, useProject } from './store';

/** 開啟時選檔視窗接受的類型（選單、Ctrl＋O、匯入、拖放都一樣） */
export const OPEN_ACCEPT = '.json,.zip,.trpgmap,application/json,application/zip';

export function saveProjectFile(): void {
  const data = useProject.getState().data;
  const name = `${fileBase(data.name)}.floor-plan.json`;
  downloadText(serializeProject(TOOL_ID, DATA_VERSION, data), name, 'application/json');
  notify(S.msg.saved(name), 'success');
}

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes).replace(/^﻿/, ''));
  } catch {
    return null;
  }
}

/** 讀不進來：通知（錯誤）「這個檔案讀不進來…」，說明寫原因 */
export function notifyOpenFailed(reason?: string): void {
  notify(S.project.openFailed, 'danger', reason ? { description: reason } : {});
}

/** 本工具的專案檔：版本太新或內容不能用時丟出 ProjectFileError（訊息是原因） */
export function openProject(file: Pick<ProjectFile, 'version' | 'data'>): void {
  if (file.version > DATA_VERSION) throw new ProjectFileError(S.project.newer);
  if (!openProjectData(file.data, 'project').ok) throw new ProjectFileError(S.project.unusable);
}

/** 不是本工具的專案檔：是原作的地圖檔就讀進來（true），不是就 false */
export function openForeign(bytes: Uint8Array): boolean {
  const raw = parseJson(bytes);
  return isLegacyMapFile(raw) && openProjectData(raw, 'legacy').ok;
}

/** 讀一個檔案（Ctrl＋O、拖放、匯入）：本工具的專案檔或原作的地圖檔；都不是時顯示錯誤 */
export async function openFile(file: File): Promise<boolean> {
  let bytes: Uint8Array;
  try {
    bytes = await readAsBytes(file);
  } catch {
    notifyOpenFailed();
    return false;
  }
  try {
    let project: ProjectFile;
    try {
      project = parseProjectBytes(bytes, TOOL_ID);
    } catch (e) {
      if (e instanceof ProjectFileError && openForeign(bytes)) return true;
      throw e;
    }
    openProject(project);
    return true;
  } catch (e) {
    notifyOpenFailed(e instanceof ProjectFileError ? e.message : undefined);
    return false;
  }
}

export async function openProjectFile(): Promise<void> {
  const [file] = await pickFiles({ accept: OPEN_ACCEPT, multiple: false });
  if (file) await openFile(file);
}

export async function importLegacyFile(): Promise<void> {
  const [file] = await pickFiles({ accept: OPEN_ACCEPT, multiple: false });
  if (file) await openFile(file);
}
