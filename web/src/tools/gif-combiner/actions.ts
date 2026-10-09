/**
 * 需要非同步處理的動作：加入檔案、開頁還原、開啟專案檔。通知交給呼叫端（toast）。
 */
import { importAssetFiles } from '@/core/assets';
import { type ProjectFile, ProjectFileError } from '@/core/storage';
import {
  type CombinerData,
  centeredBox,
  MAX_FRAMES_PER_FILE,
  newItemId,
  normalizeData,
} from './logic';
import { addFile, assets, collectGarbage, loadMedia } from './media';
import { addItem, dataNow, PROJECT_VERSION, select, useCombiner, useUi } from './store';
import { S } from './strings';

export type Notify = (n: {
  title: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
}) => void;

let warnedNotSaved = false;

/** 預設的通知（ToolShell 裡的 toast；快捷鍵等不在元件裡的地方用） */
let notifier: Notify = () => {};
export function setNotifier(fn: Notify | null): void {
  notifier = fn ?? (() => {});
}

/**
 * 加入檔案（F01、F39、F40）：依順序一個接一個解碼，成功的放到畫布正中央；失敗的通知檔名，其餘照常加入。
 * 整批算一步復原。
 */
export async function addFiles(
  files: readonly File[],
  notify: Notify = (n) => notifier(n),
): Promise<number> {
  if (!files.length) return 0;
  useUi.setState((s) => ({ loading: s.loading + files.length }));
  useCombiner.beginGesture();
  let added = 0;
  try {
    for (const file of files) {
      try {
        const r = await addFile(file);
        const d = dataNow();
        const box = centeredBox(d.canvas, r.media.width, r.media.height);
        addItem({
          id: newItemId(),
          asset: r.asset,
          name: file.name || S.files.untitled,
          ow: r.media.width,
          oh: r.media.height,
          totalMs: r.media.total,
          frames: r.media.frames.length,
          ...box,
        });
        added++;
        if (r.media.truncated)
          notify({ title: S.files.truncated(file.name, MAX_FRAMES_PER_FILE), tone: 'warning' });
        if (!r.persisted && !warnedNotSaved) {
          warnedNotSaved = true;
          notify({ title: S.files.notSaved, tone: 'warning' });
        }
      } catch {
        notify({ title: S.files.failed(file.name || S.files.untitled), tone: 'danger' });
      } finally {
        useUi.setState((s) => ({ loading: Math.max(0, s.loading - 1) }));
      }
    }
  } finally {
    useCombiner.endGesture();
  }
  return added;
}

/** 開頁時只做一次：整理存檔、解碼保存的動圖（找不到的拿掉）、清空復原紀錄、清掉以前留下、沒人用的檔案 */
let restored = false;
export async function restoreOnce(notify: Notify): Promise<void> {
  if (restored) return;
  restored = true;
  const t = useCombiner.temporal.getState();
  const current = dataNow();
  const clean = normalizeData(current) ?? useCombiner.initial;
  if (JSON.stringify(clean) !== JSON.stringify(current)) {
    t.pause();
    useCombiner.getState().replace(clean);
    t.resume();
  }
  const ids = [...new Set(clean.items.map((it) => it.asset))];
  const missing = new Set<string>();
  await Promise.all(
    ids.map((id) =>
      loadMedia(id).catch(() => {
        missing.add(id);
      }),
    ),
  );
  if (missing.size) {
    const before = dataNow().items;
    const after = before.filter((it) => !missing.has(it.asset));
    if (after.length !== before.length) {
      t.pause();
      useCombiner.getState().update((d) => {
        d.items = d.items.filter((it) => !missing.has(it.asset));
      });
      t.resume();
      notify({ title: S.files.restoredMissing(before.length - after.length), tone: 'warning' });
    }
  }
  useCombiner.temporal.getState().clear();
  await collectGarbage({ onOpen: true });
}

/**
 * 開啟專案檔（F45）：動圖放回資產庫並解碼，全部成功才換掉目前的內容。
 * 動圖存不進瀏覽器時回傳提醒（和「已開啟專案檔」合成一則）。
 */
export async function openProject(
  data: CombinerData,
  project: ProjectFile<CombinerData>,
  files: Map<string, Uint8Array>,
): Promise<{ warnings: string[] }> {
  if (project.version > PROJECT_VERSION) throw new ProjectFileError(S.project.newer);
  const clean = normalizeData(data);
  if (!clean) throw new ProjectFileError(S.project.invalid);
  const imported = await importAssetFiles(assets, files);
  for (const it of clean.items) {
    if (!(await assets.get(it.asset))) throw new ProjectFileError(S.project.missing);
    try {
      await loadMedia(it.asset);
    } catch {
      throw new ProjectFileError(S.project.broken(it.name || it.asset));
    }
  }
  useCombiner.endGesture();
  useCombiner.getState().replace(clean);
  useCombiner.temporal.getState().clear();
  select(null);
  useUi.setState({ zoom: 'fit' });
  /* 換掉的內容用的動圖已經沒人用（復原紀錄也清了）：釋放 */
  void collectGarbage();
  return { warnings: imported.notPersisted ? [S.project.notSaved] : [] };
}
