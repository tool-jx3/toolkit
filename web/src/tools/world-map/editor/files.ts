/**
 * 專案檔：存（Ctrl＋S 與「專案」選單相同的格式）、開（本站的專案檔；原作的作業檔 `.world.json`）。
 * 開啟後是一步復原（可以回到原本的地圖）。
 */
import { downloadText } from '@/core/files';
import { ProjectFileError, parseProject, serializeProject } from '@/core/storage';
import { safeTitle } from '../draw/export';
import { fromOriginal, isOriginalFile, normalizeDoc, OriginalFileError } from '../model/normalize';
import type { WorldDoc } from '../model/types';
import { S } from '../strings';
import { notify } from './actions';
import { editor } from './controller';
import { DATA_VERSION, docNow, setEditor, TOOL_ID, useDoc, usePrefs } from './store';

export const PROJECT_ACCEPT = '.json,application/json';

export const projectFileName = (): string => `${safeTitle(docNow().title)}.world-map.json`;

export function saveProjectFile(): void {
  editor.cancelDraft();
  const name = projectFileName();
  downloadText(serializeProject(TOOL_ID, DATA_VERSION, docNow()), name, 'application/json');
  notify(S.msg.saved(name), 'success');
}

function load(doc: WorldDoc): void {
  editor.cancelDraft();
  useDoc.getState().update(() => doc);
  setEditor({ sel: null, audience: 'gm', tool: 'select' });
  editor.fitView();
}

/** 本站的專案檔（ProjectMenu 讀好 JSON 之後） */
export function openProject(data: unknown): boolean {
  const doc = normalizeDoc(data);
  if (!doc) return false;
  load(doc);
  return true;
}

/** 不是本站的專案檔時：原作的作業檔 */
export function openForeign(bytes: Uint8Array): boolean {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return false;
  }
  if (!isOriginalFile(raw)) return false;
  try {
    const r = fromOriginal(raw);
    load(r.doc);
    if (r.exportWidth || r.exportAudience)
      usePrefs.getState().update((p) => {
        if (r.exportWidth && [1536, 2400, 3200, 4096].includes(r.exportWidth))
          p.exportWidth = r.exportWidth;
        if (r.exportAudience) p.exportAudience = r.exportAudience;
      });
    notify(S.project.importOriginal(r.travelPaths), r.travelPaths ? 'warning' : 'success', {
      duration: 5000,
    });
  } catch (e) {
    notify(S.project.openFailed, 'danger', {
      description: e instanceof OriginalFileError ? e.message : undefined,
    });
  }
  return true;
}

/** 拖到視窗裡的檔案：本站的專案檔或原作的作業檔 */
export async function openDroppedFile(file: File): Promise<void> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    notify(S.project.openFailed, 'danger');
    return;
  }
  if (openForeign(new TextEncoder().encode(text))) return;
  try {
    const p = parseProject(text, TOOL_ID);
    if (!openProject(p.data)) throw new ProjectFileError(S.project.badData);
    notify(S.project.opened, 'success');
  } catch (e) {
    notify(S.project.openFailed, 'danger', {
      description: e instanceof ProjectFileError ? e.message : undefined,
    });
  }
}
