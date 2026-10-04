/**
 * 專案檔（共用的 ProjectMenu）：`project.json` 的 data ＝ { kind, settings }，放進來的圖片放在 ZIP 的 files/（示範圖不放）。
 * 開啟時圖片先放回資產庫，找不到的圖從設定裡拿掉並提醒。
 */
import { importAssetFiles, referencedAssetIds } from '@/core/assets';
import { ProjectFileError, resetToolStore } from '@/core/storage';
import { isDemoImage } from './demo';
import { assets, forgetImage, sessionAssets } from './media';
import { imageIdsOf, type Kind, normalizeKind, normalizeSettings, type Settings } from './model';
import { kindNow, PROJECT_VERSION, setKind, settingsNow, useSettings, useView } from './store';
import { S } from './strings';

export interface ProjectData {
  kind: Kind;
  settings: Settings;
}

export const projectData = (): ProjectData => ({ kind: kindNow(), settings: settingsNow() });

export const projectFiles = () => assets.exportFiles(imageIdsOf(settingsNow()));

/** 圖片 id 不在 keep 裡的拿掉（設定成沒有圖） */
function dropImages(s: Settings, keep: (id: string) => boolean): number {
  let n = 0;
  const fix = (id: string | null) => {
    if (!id || isDemoImage(id) || keep(id)) return id;
    n++;
    return null;
  };
  s.stand.front = fix(s.stand.front);
  s.stand.back = fix(s.stand.back);
  s.stand.baseImage = fix(s.stand.baseImage);
  s.shaker.frameImage = fix(s.shaker.frameImage);
  for (const p of s.shaker.parts) p.image = fix(p.image);
  for (const l of s.diorama.layers) l.image = fix(l.image);
  return n;
}

/** 開啟專案檔；回傳拿掉的圖片數 */
export async function openProject(
  data: unknown,
  version: number,
  files: Map<string, Uint8Array>,
): Promise<number> {
  if (version > PROJECT_VERSION) throw new ProjectFileError(S.project.newer);
  const raw = data && typeof data === 'object' ? (data as Partial<ProjectData>) : null;
  const settings = normalizeSettings(raw?.settings);
  if (!raw || !settings) throw new ProjectFileError(S.project.invalid);
  const imported = await importAssetFiles(assets, files);
  for (const id of imported.ids) {
    forgetImage(id);
    sessionAssets.add(id);
  }
  const present = new Set<string>();
  for (const id of imageIdsOf(settings)) if (await assets.get(id)) present.add(id);
  const dropped = dropImages(settings, (id) => present.has(id));
  useSettings.endGesture();
  useSettings.getState().replace(settings);
  useSettings.temporal.getState().clear();
  setKind(normalizeKind(raw.kind));
  void collectGarbage();
  return dropped;
}

/** 清掉沒有人用的圖片（目前的設定＋復原／重做歷史） */
export async function collectGarbage(): Promise<void> {
  try {
    const keep = referencedAssetIds(useSettings, (d) => imageIdsOf(d));
    for (const id of sessionAssets) keep.add(id);
    await assets.gc(keep);
  } catch {
    /* 清不掉就下次再清 */
  }
}

/** 全部重來：回到示範內容、清掉圖片 */
export function resetAll(): void {
  resetToolStore(useSettings);
  useView.getState().reset();
  sessionAssets.clear();
  void collectGarbage();
}
