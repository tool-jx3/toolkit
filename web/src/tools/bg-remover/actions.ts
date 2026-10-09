/**
 * 使用者的動作：加圖、移除、切換、取色、專案檔、全部重來。
 */
import { importAssetFiles } from '@/core/assets';
import {
  type DiagnosticField,
  type DiagnosticItem,
  errorText,
  fileFields,
} from '@/core/diagnostics';
import { readFilesNow } from '@/core/files';
import { ProjectFileError, resetToolStore } from '@/core/storage';
import type { StageBackground } from '@/ui';
import { pixels, useWork } from './engine';
import { type ImageItem, normalizeSettings, PROJECT_VERSION, type Settings } from './model';
import type { InspectResult } from './pixels';
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
import { rememberThumb } from './thumbs';

/** 一張圖最多 6,000 萬像素（瀏覽器的畫布放得下、記憶體也還夠） */
export const MAX_PIXELS = 60_000_000;

let seq = 0;
const newId = () => `img-${Date.now().toString(36)}-${(++seq).toString(36)}`;

export interface AddResult {
  added: ImageItem[];
  failed: string[];
  /** 讀不進來的檔案各一段：哪一步失敗、瀏覽器回報的錯誤（給「複製錯誤資訊」） */
  problems: DiagnosticItem[];
  tooLarge: string[];
  notStored: boolean;
  rejected: number;
  /** 有檔案在選的當下就讀不到（NotReadableError：瀏覽器沒有讀取權限，例如雲端相簿還沒下載的照片） */
  notReadable: boolean;
}

/**
 * 加入圖片（放在清單最後，選取第一張新加的；算一步復原）。先把所有檔案讀進記憶體（Android 的相片挑選器給的檔案，
 * 讀取權限之後會失效），再一個一個在 Worker 裡檢查（看檔頭判斷是不是圖片——不看副檔名、解碼量尺寸、做清單的縮圖），
 * 畫面不卡；onProgress(i, n) 在開始處理第 i 個（0 起）檔案前呼叫。
 */
export async function addFiles(
  picked: readonly File[],
  onProgress?: (i: number, n: number) => void,
): Promise<AddResult> {
  /* 選的當下就讀：不要在這之前 await 別的東西 */
  const read = readFilesNow(picked);
  const result: AddResult = {
    added: [],
    failed: [],
    problems: [],
    tooLarge: [],
    notStored: false,
    rejected: 0,
    notReadable: false,
  };
  const fail = (file: File, fields: DiagnosticField[]) => {
    result.failed.push(file.name);
    result.problems.push({ title: file.name, fields: [...fileFields(file), ...fields] });
  };
  const { files, failed: unreadable } = await read;
  for (const { file, error } of unreadable) {
    if ((error as { name?: unknown } | null)?.name === 'NotReadableError')
      result.notReadable = true;
    fail(file, [
      ['步驟', S.diag.read],
      ['錯誤', errorText(error)],
    ]);
  }
  for (let k = 0; k < files.length; k++) {
    const file = files[k];
    onProgress?.(k, files.length);
    let info: InspectResult;
    try {
      info = await pixels.inspect(file);
    } catch (e) {
      fail(file, [
        ['步驟', S.diag.inspect],
        ['錯誤', errorText(e)],
      ]);
      continue;
    }
    if (info.kind === 'not-image') {
      result.rejected++;
      continue;
    }
    if (info.kind === 'failed') {
      fail(file, [
        ['檔頭', info.format],
        ['步驟', S.diag.decode],
        ['錯誤', info.error],
      ]);
      continue;
    }
    const { width, height } = info;
    if (width * height > MAX_PIXELS) {
      result.tooLarge.push(file.name);
      continue;
    }
    try {
      const r = await assets.add(file);
      if (!r.persisted) result.notStored = true;
      rememberThumb(r.id, info.thumb);
      result.added.push({
        id: newId(),
        name: file.name || 'image.png',
        asset: r.id,
        width,
        height,
        strokes: [],
      });
    } catch (e) {
      fail(file, [
        ['尺寸', `${width} × ${height}`],
        ['步驟', S.diag.save],
        ['錯誤', errorText(e)],
      ]);
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

/** 開啟專案檔；回傳找不到的圖片數（已從清單拿掉）與存不進瀏覽器的檔案數 */
export async function openProject(
  data: unknown,
  version: number,
  files: Map<string, Uint8Array>,
): Promise<{ missing: number; notPersisted: number }> {
  if (version > PROJECT_VERSION) throw new ProjectFileError(S.project.newer);
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new ProjectFileError(S.project.invalid);
  const s = normalizeSettings(data);
  const rawMasks = (data as { aiMasks?: unknown }).aiMasks;
  const { notPersisted } = await importAssetFiles(assets, files);
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
  return { missing, notPersisted };
}

/** 全部重來：清單、筆刷、設定都清掉（下載好的模型、預覽背景留著） */
export function resetAll(): void {
  resetToolStore(useSettings);
  const { stageBg, stageBgImage } = previewNow();
  usePreview.getState().reset();
  setPreview({ stageBg, stageBgImage });
  void collectGarbage();
}

/* ---------- 預覽背景 ---------- */

/**
 * 換預覽背景。背景圖：Stage 給的是剛選的檔案的物件網址（重新整理後就失效），這裡讀出檔案放進素材庫、只記 id；
 * currentUrl 是目前背景圖的網址（同一張圖不必再存一次）。
 */
export async function setStageBackground(
  bg: StageBackground,
  currentUrl: string | null,
): Promise<void> {
  const next: StageBackground = { kind: bg.kind, ...(bg.color ? { color: bg.color } : null) };
  if (bg.kind === 'image' && bg.imageUrl && bg.imageUrl !== currentUrl) {
    try {
      const blob = await (await fetch(bg.imageUrl)).blob();
      const r = await assets.add(blob);
      setPreview({ stageBg: next, stageBgImage: r.id });
      return;
    } catch {
      /* 讀不到這個檔案：只換種類 */
    }
  }
  setPreview({ stageBg: next });
}

export { referencedIds };
