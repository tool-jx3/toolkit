/**
 * 專案檔（共用專案檔格式的 ZIP：`project.json`＋`files/…`，規格 3.5）：設定與本文＋用到的圖片（`<資產 id>.<副檔名>`）
 * ＋用到的自己加的字型（`font-<n>.<副檔名>`）。開啟時整理內容（normalizeState），圖片要在 ZIP 裡（或這個瀏覽器已經有）
 * 而且能解碼才換掉目前的內容；字型放進共用的字型庫（名稱不同時跟著改）。
 */
import { importAssetFiles } from '@/core/assets';
import { uploadedFontFile, uploadFont } from '@/core/fonts';
import type { ProjectBinary } from '@/core/storage';
import { isBuiltinFont, normalizeState, type ProseState, stateAssetIds, stateFonts } from './model';
import { assets, docNow } from './store';
import { S } from './strings';

export const PROJECT_VERSION = 1;

export class ProjectDataError extends Error {}

export interface ProjectData {
  state: ProseState;
  /** 一起帶走的自己加的字型（files/ 裡的檔名 → 字型名稱） */
  fonts: { family: string; file: string; name: string }[];
}

/** 存進專案檔的圖 */
export const projectAssetIds = (d: ProseState): string[] => [...new Set(stateAssetIds(d))];

/** 用到的、自己加的字型 */
export const uploadedFontsIn = (d: ProseState): string[] =>
  stateFonts(d).filter((f) => !isBuiltinFont(f));

/* ProjectMenu 先呼叫 getFiles 再呼叫 getData：字型的對應在 getFiles 時記下 */
let pendingFonts: ProjectData['fonts'] = [];

export async function projectFiles(): Promise<ProjectBinary[]> {
  const d = docNow();
  const files: ProjectBinary[] = await assets.exportFiles(projectAssetIds(d));
  pendingFonts = [];
  let i = 0;
  for (const family of uploadedFontsIn(d)) {
    const f = await uploadedFontFile(family);
    if (!f) continue;
    const ext = /\.[a-z0-9]+$/i.exec(f.meta.fileName)?.[0]?.toLowerCase() ?? '';
    const file = `font-${++i}${ext}`;
    files.push({ name: file, data: new Uint8Array(f.data) });
    pendingFonts.push({ family, file, name: f.meta.fileName });
  }
  return files;
}

export function projectData(): ProjectData {
  const fonts = pendingFonts;
  pendingFonts = [];
  return { state: docNow(), fonts };
}

const isFontFile = (path: string) => /^font-/.test(path.split('/').pop() ?? '');

export interface ImportedProject {
  state: ProseState;
  /** 要提醒的事（圖片存不進瀏覽器、缺字型） */
  warnings: string[];
}

export async function importProject(
  data: unknown,
  files: Map<string, Uint8Array>,
): Promise<ImportedProject> {
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    throw new ProjectDataError(S.projectBad);
  const d = data as Partial<ProjectData>;
  if (!d.state || typeof d.state !== 'object') throw new ProjectDataError(S.projectBad);
  const next = normalizeState(d.state);
  const images = [...files].filter(([name]) => !isFontFile(name));
  const imported = await importAssetFiles(assets, images);
  for (const id of projectAssetIds(next)) {
    const bmp = await assets.bitmap(id).catch(() => undefined);
    if (!bmp) throw new ProjectDataError(S.projectMissingImage);
  }
  const warnings: string[] = [];
  if (imported.notPersisted > 0) warnings.push(S.projectNotSaved);
  /* 字型：放進共用字型庫，名稱有變時跟著改 */
  const rename = new Map<string, string>();
  for (const f of Array.isArray(d.fonts) ? d.fonts : []) {
    if (!f || typeof f.family !== 'string' || typeof f.file !== 'string') continue;
    const bytes = files.get(f.file);
    if (!bytes) continue;
    try {
      const meta = await uploadFont(
        new File(
          [bytes as Uint8Array<ArrayBuffer>],
          typeof f.name === 'string' && f.name ? f.name : f.file,
        ),
      );
      if (meta.family !== f.family) rename.set(f.family, meta.family);
    } catch {
      /* 字型壞掉：用備用字型顯示 */
    }
  }
  if (rename.size) {
    if (rename.has(next.font)) next.font = rename.get(next.font) as string;
    for (const l of next.body.lines)
      for (const r of l.runs) if (r.font && rename.has(r.font)) r.font = rename.get(r.font);
  }
  return { state: next, warnings };
}
