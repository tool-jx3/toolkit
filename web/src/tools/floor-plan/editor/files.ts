/**
 * 專案檔與原作地圖檔的存取（快捷鍵、拖放、選單共用）。
 * - 本工具的專案檔：共用格式（`{ format: 'trpg-toolkit-project', tool: 'floor-plan', … }`）。
 * - 原作（TRPG 室內圖メーカー）的 .trpgmap.json：欄位相同，整理後讀進來。
 */
import { downloadText, pickFiles, readAsBytes } from '@/core/files';
import { ProjectFileError, parseProjectBytes, serializeProject } from '@/core/storage';
import { S } from '../strings';
import { fileBase, isLegacyMapFile, notify, openProjectData } from './actions';
import { DATA_VERSION, TOOL_ID, useProject } from './store';

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

/** 讀一個檔案：本工具的專案檔或原作的地圖檔；都不是時顯示錯誤 */
export async function openFile(file: File): Promise<boolean> {
  let bytes: Uint8Array;
  try {
    bytes = await readAsBytes(file);
  } catch {
    notify(S.project.openFailed, 'danger');
    return false;
  }
  let reason: string | undefined;
  try {
    const p = parseProjectBytes(bytes, TOOL_ID);
    if (openProjectData(p.data, 'project').ok) return true;
  } catch (e) {
    const raw = parseJson(bytes);
    if (isLegacyMapFile(raw) && openProjectData(raw, 'legacy').ok) return true;
    if (e instanceof ProjectFileError) reason = e.message;
  }
  notify(S.project.openFailed, 'danger', reason ? { description: reason } : {});
  return false;
}

export async function openProjectFile(): Promise<void> {
  const [file] = await pickFiles({
    accept: '.json,.zip,.trpgmap,application/json',
    multiple: false,
  });
  if (file) await openFile(file);
}

export async function importLegacyFile(): Promise<void> {
  const [file] = await pickFiles({ accept: '.json,.trpgmap,application/json', multiple: false });
  if (file) await openFile(file);
}
