/**
 * 專案檔：存（Ctrl＋S 與「專案」選單相同的格式）、開（本站的專案檔；原作存的作業 JSON）。
 * 開啟後是一步復原（可以回到原本的斷面圖）。
 */
import { downloadText, pickFiles } from '@/core/files';
import { ProjectFileError, parseProject, serializeProject } from '@/core/storage';
import { safeTitle } from '../draw/export';
import {
  fromOriginal,
  isOriginalFile,
  normalizeDoc,
  OriginalFileError,
  type OriginalSkipped,
} from '../model/normalize';
import { S } from '../strings';
import { loadDoc, notify } from './actions';
import { DATA_VERSION, docNow, TOOL_ID } from './store';

export const PROJECT_ACCEPT = '.json,application/json';

export const projectFileName = (): string => `${safeTitle(docNow().title)}.cross-section.json`;

export function saveProjectFile(): void {
  const name = projectFileName();
  downloadText(serializeProject(TOOL_ID, DATA_VERSION, docNow()), name, 'application/json');
  notify(S.msg.saved(name), 'success');
}

/** 本站的專案檔（ProjectMenu 讀好 JSON 之後）；較新版本的工具存的不開（丟出說明的錯誤） */
export function openProject(data: unknown, version = DATA_VERSION): boolean {
  if (version > DATA_VERSION) throw new ProjectFileError(S.project.newer);
  const doc = normalizeDoc(data);
  if (!doc) return false;
  loadDoc(doc);
  return true;
}

export function skippedText(s: OriginalSkipped): string | undefined {
  const parts = [
    s.width !== null ? S.project.widthSnapped(s.width, docNow().building.width) : '',
    s.items ? S.project.skippedItems(s.items) : '',
    s.notes ? S.project.skippedNotes(s.notes) : '',
    s.floors ? S.project.skippedFloors(s.floors) : '',
    s.floorItems ? S.project.skippedFloorItems(s.floorItems) : '',
    s.floorNotes ? S.project.skippedFloorNotes(s.floorNotes) : '',
  ].filter(Boolean);
  return parts.length ? S.project.originalSkipped(parts) : undefined;
}

/** 不是本站的專案檔時：原作的作業 JSON（認不出來時回傳 false，交給共用的錯誤訊息） */
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
    loadDoc(r.doc);
    notify(S.project.original, 'success', { description: skippedText(r.skipped), duration: 6000 });
  } catch (e) {
    const reason = e instanceof OriginalFileError ? e.message : '';
    notify(S.project.openFailed, 'danger', {
      description:
        reason === 'train'
          ? S.project.trainFile
          : reason === 'empty'
            ? S.project.emptyFile
            : undefined,
    });
  }
  return true;
}

/** 開檔（開始畫面的「開啟專案檔…」、拖進視窗的檔案） */
export async function openFile(file: File): Promise<void> {
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
    if (!openProject(p.data, p.version)) throw new ProjectFileError(S.project.badData);
    notify(S.project.opened, 'success');
  } catch (e) {
    notify(S.project.openFailed, 'danger', {
      description: e instanceof ProjectFileError ? e.message : undefined,
    });
  }
}

export async function pickAndOpen(): Promise<void> {
  const files = await pickFiles({ accept: PROJECT_ACCEPT });
  if (files[0]) await openFile(files[0]);
}
