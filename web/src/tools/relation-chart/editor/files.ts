/**
 * 存成專案檔（Ctrl＋S；和「專案」選單同一種檔）、開啟檔案（本工具的專案檔或原作的專案檔，拖曳到視窗也可以）。
 */
import { downloadBytes, readAsBytes } from '@/core/files';
import { ProjectFileError, parseProjectBytes, serializeProjectZip } from '@/core/storage/project';
import type { useChoice, useConfirm, useToast } from '@/ui';
import { LegacyFileError } from '../logic/legacy';
import { initialProject, normalizeProject } from '../model/normalize';
import type { Project } from '../model/types';
import {
  collectProjectFiles,
  importLegacy,
  importOwnProject,
  type LegacyRead,
  type LegacyResult,
  projectDataForSave,
  readLegacyBytes,
  replaceProject,
  takeSaveDropped,
} from '../state/project';
import { DATA_VERSION, projectNow, TOOL_ID } from '../state/store';
import { S } from '../strings';

export const OPEN_ACCEPT = '.zip,.json,application/zip,application/json';

const pad2 = (n: number) => String(n).padStart(2, '0');
export const projectFileBase = (now = new Date()): string =>
  `${S.project.fileName}_${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;

interface Ui {
  toast: ReturnType<typeof useToast>;
  confirm: ReturnType<typeof useConfirm>;
  choose: ReturnType<typeof useChoice>;
}
let ui: Ui | null = null;
export function bindFileUi(u: Ui | null): void {
  ui = u;
}

export async function saveProjectFile(): Promise<void> {
  const files = await collectProjectFiles();
  const data = projectDataForSave();
  const name = `${projectFileBase()}.zip`;
  downloadBytes(serializeProjectZip(TOOL_ID, DATA_VERSION, data, files), name, 'application/zip');
  const dropped = takeSaveDropped();
  ui?.toast({
    title: dropped ? S.project.saveDropped(dropped) : S.project.saved(name),
    tone: dropped ? 'warning' : 'success',
  });
}

/** 空白專案（沒有角色、關係、背景）：讀原作的檔時直接取代、不用問 */
const isBlank = (p: Project) =>
  p.sheets.every((s) => !s.chars.length && !s.rels.length && !s.types.length && !s.bg);

/** 讀原作的專案：問加入或取代，讀完通知 */
export async function openLegacy(read: LegacyRead): Promise<boolean> {
  let mode: 'append' | 'replace' = 'replace';
  if (!isBlank(projectNow())) {
    const sheets = Array.isArray(read.data.sheets) ? read.data.sheets.length : 0;
    const v = await ui?.choose({
      title: S.legacy.askTitle,
      description: S.legacy.askText(sheets),
      choices: [
        { value: 'append', label: S.legacy.append },
        { value: 'replace', label: S.legacy.replace, variant: 'danger' },
      ],
    });
    if (!v) return true;
    mode = v as 'append' | 'replace';
  }
  const r = await importLegacy(read, mode);
  notifyLegacy(r);
  return true;
}

export function notifyLegacy(r: LegacyResult): void {
  const notes = [
    r.failedImages ? S.legacy.failedImages(r.failedImages) : '',
    r.noImages ? S.legacy.noImages : '',
    r.missingFrames || r.missingFonts ? S.legacy.missingAssets(r.missingFrames, r.missingFonts) : '',
    r.notSaved ? S.project.imageNotSaved : '',
    r.skipped.length ? S.legacy.skipped(r.skipped.join('、')) : '',
  ].filter(Boolean);
  ui?.toast({
    title: S.legacy.done(r.sheets, r.chars, r.rels),
    description: notes.length ? notes.join('') : undefined,
    tone: notes.length ? 'warning' : 'success',
    duration: notes.length ? 9000 : undefined,
  });
}

/** ProjectMenu 的 onForeignFile：原作的檔就接手 */
export async function openForeign(bytes: Uint8Array): Promise<boolean> {
  try {
    const read = readLegacyBytes(bytes);
    if (!read) return false;
    return await openLegacy(read);
  } catch (e) {
    if (e instanceof LegacyFileError) throw new ProjectFileError(e.message);
    throw e;
  }
}

/** ProjectMenu 的 onLoad */
export async function openOwnProject(
  data: unknown,
  version: number,
  files: Map<string, Uint8Array>,
): Promise<{ warnings: string[] }> {
  if (version > DATA_VERSION) throw new ProjectFileError(S.project.newer);
  const r = await importOwnProject(data, files);
  replaceProject(r.project);
  return {
    warnings: [
      r.notSaved ? S.project.imageNotSaved : '',
      r.dropped ? S.project.droppedImages(r.dropped) : '',
    ].filter(Boolean),
  };
}

/** 拖到視窗上的檔案 */
export async function openDroppedFile(file: File): Promise<void> {
  const bytes = await readAsBytes(file);
  try {
    const parsed = parseProjectBytes<unknown>(bytes, TOOL_ID);
    const ok = await ui?.confirm({
      title: S.project.openTitle,
      description: S.project.openText,
      confirmLabel: S.project.openConfirm,
    });
    if (!ok) return;
    const r = await openOwnProject(parsed.data, parsed.version, parsed.files);
    ui?.toast({
      title: S.project.opened,
      description: r.warnings.join('') || undefined,
      tone: r.warnings.length ? 'warning' : 'success',
    });
    return;
  } catch (e) {
    if (!(e instanceof ProjectFileError)) {
      ui?.toast({ title: S.project.unusable, tone: 'danger' });
      return;
    }
    try {
      if (await openForeign(bytes)) return;
      ui?.toast({ title: S.legacy.notLegacy, description: e.message, tone: 'danger' });
    } catch (e2) {
      ui?.toast({
        title: S.legacy.notLegacy,
        description: e2 instanceof Error ? e2.message : undefined,
        tone: 'danger',
      });
    }
  }
}

/** 全部重設（可以復原） */
export function resetProject(): void {
  replaceProject(normalizeProject(initialProject()) ?? initialProject());
}
