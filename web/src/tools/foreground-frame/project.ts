/**
 * 專案檔（F85、F86）：設定＋目前差分與預覽背景圖；用到的圖片、背景圖與上傳字型一起帶走時存成 ZIP
 * （`project.json`＋`files/…`，共用的專案檔格式），沒有附加檔案時是 JSON。
 * 開啟成功時全部換掉（圖片、字型也一起換）、清空復原紀錄、取消所有選取。
 */
import { importAssetFiles } from '@/core/assets';
import { readAsBytes } from '@/core/files';
import { uploadedFontFile, uploadFont } from '@/core/fonts';
import { type ProjectBinary, ProjectFileError, parseProjectBytes } from '@/core/storage';
import { baseName } from './exporting';
import { type FrameState, normalizeState, stateAssetIds, stateUploadFonts, TOOL_ID } from './model';
import {
  assets,
  bump,
  frameNow,
  PREVIEW_BGS,
  type PreviewBg,
  setStatus,
  useFrame,
  usePreview,
  useSession,
} from './store';
import { S } from './strings';

export const PROJECT_VERSION = 1;

export interface ProjectData {
  state: FrameState;
  preview: { current: string | null; bg: PreviewBg; bgAsset: string | null };
  /** 一起帶走的上傳字型（files/ 裡的檔名 → 字型名稱） */
  fonts: { family: string; file: string; name: string }[];
}

/** 要一起存的圖片（圖片圖層、自訂圖示、預覽背景圖） */
export function projectAssetIds(): string[] {
  const ids = stateAssetIds(frameNow());
  const bg = usePreview.getState().data.bgAsset;
  if (bg && !ids.includes(bg)) ids.push(bg);
  return ids;
}

/** 有沒有附加檔案（有就存成 ZIP） */
export const projectHasFiles = (): boolean =>
  projectAssetIds().length > 0 || stateUploadFonts(frameNow()).length > 0;

export const projectFileName = (): string =>
  `${baseName(frameNow().fileBase)}.frame.${projectHasFiles() ? 'zip' : 'json'}`;

/* ProjectMenu 先呼叫 getFiles 再呼叫 getData：字型的對應在 getFiles 時記下 */
let pendingFonts: ProjectData['fonts'] = [];

export async function projectFiles(): Promise<ProjectBinary[]> {
  const files: ProjectBinary[] = await assets.exportFiles(projectAssetIds());
  pendingFonts = [];
  let i = 0;
  for (const family of stateUploadFonts(frameNow())) {
    const f = await uploadedFontFile(family);
    if (!f) continue;
    const ext = /\.[a-z0-9]+$/i.exec(f.meta.fileName)?.[0] ?? '';
    const file = `font-${++i}${ext.toLowerCase()}`;
    files.push({ name: file, data: new Uint8Array(f.data) });
    pendingFonts.push({ family, file, name: f.meta.fileName });
  }
  return files;
}

export function projectData(withFiles: boolean): ProjectData {
  const p = usePreview.getState().data;
  return {
    state: frameNow(),
    preview: { current: p.current, bg: p.bg, bgAsset: p.bgAsset },
    fonts: withFiles ? pendingFonts : [],
  };
}

/** 開啟專案檔；不合用時丟 ProjectFileError（訊息直接顯示） */
export async function openProject(
  data: unknown,
  version: number,
  files: Map<string, Uint8Array>,
  fileName: string,
): Promise<boolean> {
  if (version > PROJECT_VERSION) throw new ProjectFileError(S.project.newer);
  const d = (data && typeof data === 'object' ? data : null) as Partial<ProjectData> | null;
  if (!d?.state || typeof d.state !== 'object') throw new ProjectFileError(S.project.invalid);
  const next = normalizeState(d.state);
  /* 圖片 */
  const images = [...files].filter(([name]) => !/^font-/.test(name.split('/').pop() ?? ''));
  await importAssetFiles(assets, images);
  /* 字型：放進共用字型庫，名稱有變時跟著改 */
  for (const f of Array.isArray(d.fonts) ? d.fonts : []) {
    const bytes = files.get(f.file);
    if (!bytes) continue;
    try {
      const meta = await uploadFont(new File([bytes as Uint8Array<ArrayBuffer>], f.name || f.file));
      const fix = (font: { source: string; family: string }) => {
        if (font.source === 'upload' && font.family === f.family) font.family = meta.family;
      };
      for (const l of next.layers) if (l.kind === 'text') fix(l.font);
      fix(next.variants.label.font);
    } catch {
      /* 字型壞掉：退回後備字型 */
    }
  }
  useFrame.endGesture();
  useFrame.getState().replace(next);
  useFrame.temporal.getState().clear();
  const pv = d.preview ?? { current: null, bg: 'scenery', bgAsset: null };
  usePreview.getState().patch({
    current: typeof pv.current === 'string' ? pv.current : null,
    bg: PREVIEW_BGS.includes(pv.bg) ? pv.bg : 'scenery',
    bgAsset: typeof pv.bgAsset === 'string' && pv.bgAsset ? pv.bgAsset : null,
  });
  useSession.setState({ selected: null, decoSelected: null });
  bump();
  setStatus(S.status.projectOpened(fileName), 'success');
  return true;
}

/** 拖放進來的專案檔（.json 或專案 ZIP） */
export async function openProjectFile(file: File): Promise<void> {
  try {
    const parsed = parseProjectBytes(await readAsBytes(file), TOOL_ID);
    await openProject(parsed.data, parsed.version, parsed.files, file.name);
  } catch (e) {
    if (e instanceof ProjectFileError) setStatus(e.message, 'danger');
    else setStatus(S.project.unreadable, 'danger');
  }
}
