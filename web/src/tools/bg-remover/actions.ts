/**
 * 使用者的動作：加圖、移除、切換、取色、專案檔、全部重來。
 */
import { importAssetFiles } from '@/core/assets';
import { readAsBytes } from '@/core/files';
import { detectImageType } from '@/core/image';
import { ProjectFileError, resetToolStore } from '@/core/storage';
import { useWork } from './engine';
import { type ImageItem, normalizeSettings, PROJECT_VERSION, type Settings } from './model';
import {
  assets,
  collectGarbage,
  currentItem,
  previewNow,
  referencedIds,
  setPreview,
  settingsNow,
  step,
  usePreview,
  useSettings,
} from './store';
import { S } from './strings';

/** 一張圖最多 6,000 萬像素（瀏覽器的畫布放得下、記憶體也還夠） */
export const MAX_PIXELS = 60_000_000;

let seq = 0;
const newId = () => `img-${Date.now().toString(36)}-${(++seq).toString(36)}`;

export interface AddResult {
  added: ImageItem[];
  failed: string[];
  tooLarge: string[];
  notStored: boolean;
  rejected: number;
}

/** 讀檔頭判斷是不是圖片（不看副檔名） */
async function isImage(file: File): Promise<boolean> {
  return detectImageType(await readAsBytes(file.slice(0, 64))) !== null;
}

async function measure(file: Blob): Promise<{ width: number; height: number }> {
  const bmp = await createImageBitmap(file);
  const size = { width: bmp.width, height: bmp.height };
  bmp.close();
  return size;
}

/** 加入圖片（放在清單最後，選取第一張新加的；算一步復原） */
export async function addFiles(files: readonly File[]): Promise<AddResult> {
  const result: AddResult = { added: [], failed: [], tooLarge: [], notStored: false, rejected: 0 };
  for (const file of files) {
    if (!(await isImage(file))) {
      result.rejected++;
      continue;
    }
    try {
      const { width, height } = await measure(file);
      if (width * height > MAX_PIXELS) {
        result.tooLarge.push(file.name);
        continue;
      }
      const r = await assets.add(file);
      if (!r.persisted) result.notStored = true;
      result.added.push({
        id: newId(),
        name: file.name || 'image.png',
        asset: r.id,
        width,
        height,
        strokes: [],
      });
    } catch {
      result.failed.push(file.name);
    }
  }
  if (result.added.length) {
    step((d) => {
      d.images.push(...result.added);
    });
    setPreview({ current: result.added[0].id });
  }
  return result;
}

export function selectImage(id: string): void {
  if (previewNow().current !== id) setPreview({ current: id });
}

/** 上一張／下一張 */
export function go(dir: -1 | 1): void {
  const list = settingsNow().images;
  const cur = currentItem();
  if (!cur) return;
  const i = list.findIndex((it) => it.id === cur.id) + dir;
  if (i >= 0 && i < list.length) setPreview({ current: list[i].id });
}

/** 移除一張（算一步復原；原檔留著，復原時還在） */
export function removeImage(id: string): void {
  const list = settingsNow().images;
  const i = list.findIndex((it) => it.id === id);
  if (i < 0) return;
  const cur = currentItem();
  step((d) => {
    d.images.splice(i, 1);
  });
  if (cur?.id === id) {
    const next = settingsNow().images[Math.min(i, settingsNow().images.length - 1)];
    setPreview({ current: next?.id ?? null });
  }
}

/* ---------- 從圖上取色 ---------- */

let pickResolve: ((hex: string | null) => void) | null = null;

/** 等使用者點預覽上的一個位置（Esc 取消）；回傳色碼或 null */
export function pickFromImage(): Promise<string | null> {
  pickResolve?.(null);
  useWork.setState({ picking: true });
  return new Promise((resolve) => {
    pickResolve = resolve;
  });
}

export function finishPick(hex: string | null): void {
  const r = pickResolve;
  pickResolve = null;
  useWork.setState({ picking: false });
  r?.(hex);
}

/* ---------- 專案檔 ---------- */

export interface ProjectData extends Settings {
  /** 原圖的資產 id → AI 遮罩的資產 id（清單裡用到的） */
  aiMasks: Record<string, string>;
}

export function projectData(): ProjectData {
  const s = settingsNow();
  const masks = previewNow().aiMasks;
  const used: Record<string, string> = {};
  for (const it of s.images) if (masks[it.asset]) used[it.asset] = masks[it.asset];
  return { ...s, aiMasks: used };
}

export async function projectFiles() {
  const d = projectData();
  const ids = new Set<string>();
  for (const it of d.images) ids.add(it.asset);
  for (const m of Object.values(d.aiMasks)) ids.add(m);
  return assets.exportFiles(ids);
}

/** 開啟專案檔；回傳找不到的圖片數（已從清單拿掉） */
export async function openProject(
  data: unknown,
  version: number,
  files: Map<string, Uint8Array>,
): Promise<number> {
  if (version > PROJECT_VERSION) throw new ProjectFileError(S.project.newer);
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new ProjectFileError(S.project.invalid);
  const s = normalizeSettings(data);
  const rawMasks = (data as { aiMasks?: unknown }).aiMasks;
  await importAssetFiles(assets, files);
  let missing = 0;
  const kept: ImageItem[] = [];
  for (const it of s.images) {
    if (await assets.get(it.asset)) kept.push(it);
    else missing++;
  }
  s.images = kept;
  const masks: Record<string, string> = {};
  if (rawMasks && typeof rawMasks === 'object') {
    for (const [src, m] of Object.entries(rawMasks as Record<string, unknown>)) {
      if (typeof m === 'string' && (await assets.get(m))) masks[src] = m;
    }
  }
  useSettings.endGesture();
  useSettings.getState().replace(s);
  useSettings.temporal.getState().clear();
  usePreview.getState().update((d) => {
    Object.assign(d.aiMasks, masks);
    d.current = s.images[0]?.id ?? null;
  });
  void collectGarbage();
  return missing;
}

/** 全部重來：清單、筆刷、設定都清掉（下載好的模型留著） */
export function resetAll(): void {
  resetToolStore(useSettings);
  const keepBg = previewNow().stageBg;
  usePreview.getState().reset();
  setPreview({ stageBg: keepBg });
  void collectGarbage();
}

export { referencedIds };
