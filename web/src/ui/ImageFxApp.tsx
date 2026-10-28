/**
 * 圖片演出工具的外框零件（截圖演出、地圖演出共用）：「專案」選單（存成專案檔、開啟、重設）、自動儲存失敗的提醒、
 * 開頁約 5 秒後整理圖片庫、整個視窗拖放圖片、快捷鍵表。
 */
import { useEffect } from 'react';
import { type FxStore, type ImportedProject, importFxProject } from '@/core/imagefx';
import { useSaveError, useSaveStatus } from '@/core/storage';
import { ProjectMenu } from './ProjectMenu';
import { playbackShortcuts } from './playbackShortcuts';
import type { Shortcut } from './shortcuts';
import { useToast } from './Toast';

// biome-ignore lint/suspicious/noExplicitAny: 各工具的框、內容、偏好、分頁型別不同，這裡只用共同的部分
type AnyFxStore = FxStore<any, any, any, any>;

/** 開頁約 5 秒後整理一次圖片庫：以前留下、目前的狀態與復原紀錄都沒用到的圖才刪 */
export function useFxAssetCleanup(fx: AnyFxStore): void {
  useEffect(() => {
    const t = setTimeout(() => {
      void fx.assets.gcStale(fx.referencedImages()).catch(() => undefined);
    }, 5000);
    return () => clearTimeout(t);
  }, [fx]);
}

/** 自動儲存失敗時提醒一次 */
export function FxSaveErrorNotice({ toolId, text }: { toolId: string; text: string }) {
  const toast = useToast();
  const failed = !!useSaveError(toolId);
  useEffect(() => {
    if (failed) toast({ title: text, tone: 'warning' });
  }, [failed, toast, text]);
  return null;
}

export interface ImageFxProjectText {
  saveFailed: string;
  openConfirmTitle: string;
  openConfirmDesc: string;
  openConfirmLabel: string;
  projectNotSaved: string;
  projectOpened: string;
  projectSaved: string;
  projectOpenFailed: string;
  projectReset: string;
  resetTitle: string;
  resetDesc: string;
  projectBad: string;
  projectMissingImage: string;
}

/** 「專案」選單：存成專案檔（設定＋圖）、開啟（先確認；缺圖的不開啟）、重設（先確認；可以復原） */
export function ImageFxProjectMenu({ fx, text }: { fx: AnyFxStore; text: ImageFxProjectText }) {
  const toast = useToast();
  const savedAt = useSaveStatus(fx.toolId);
  const saveError = useSaveError(fx.toolId);
  return (
    <ProjectMenu<unknown>
      toolId={fx.toolId}
      version={fx.version}
      getData={() => fx.docNow()}
      getFiles={() => fx.assets.exportFiles([...new Set(fx.assetIds(fx.docNow()))])}
      confirmOpen={{
        title: text.openConfirmTitle,
        description: text.openConfirmDesc,
        confirmLabel: text.openConfirmLabel,
      }}
      onLoad={async (data, _file, files) => {
        const r: ImportedProject<unknown> = await importFxProject(
          data,
          files,
          fx.assets,
          fx.normalizeState,
          fx.assetIds,
          text,
        );
        fx.resetAll(r.state);
        return { warnings: [r.notSaved && text.projectNotSaved] };
      }}
      onNotify={(n) => {
        if (n.kind === 'opened')
          toast(
            n.warnings
              ? { title: text.projectOpened, description: n.warnings.join(''), tone: 'warning' }
              : { title: text.projectOpened, description: n.fileName, tone: 'success' },
          );
        else if (n.kind === 'saved')
          toast({ title: text.projectSaved, description: n.fileName, tone: 'success' });
        else if (n.kind === 'open-failed')
          toast({ title: text.projectOpenFailed, description: n.message, tone: 'danger' });
        else toast({ title: text.projectReset });
      }}
      onReset={() => {
        fx.resetAll(fx.initialState());
        const p = fx.prefsNow();
        fx.usePrefs.getState().replace({ ...fx.initialPrefs(), loop: p.loop, stageBg: p.stageBg });
      }}
      resetText={{ title: text.resetTitle, description: text.resetDesc }}
      savedAt={savedAt}
      statusText={saveError ? text.saveFailed : undefined}
    />
  );
}

export interface ImageFxShortcutText {
  undo: string;
  redo: string;
  groupEdit: string;
  groupFrame: string;
  groupPlay: string;
  playShortcut: string;
  dupShortcut: string;
  delShortcut: string;
  nudgeShortcut: string;
  escShortcut: string;
  shiftShortcut: string;
  escViewShortcut: string;
}

/**
 * 快捷鍵表：復原、重做、播放（空白鍵）、回到開頭（Home）、複製框、刪除、方向鍵、Esc、Shift 拖曳。
 * `play`：預覽的播放／暫停與回到開頭（預覽的 `FxPlayerHandle` 有 `toggle`、`rewind`）；還沒有圖時兩個都不作用。
 */
export function imageFxShortcuts(
  fx: AnyFxStore,
  text: ImageFxShortcutText,
  play: { toggle: () => void; rewind: () => void },
  extra: readonly Shortcut[] = [],
): Shortcut[] {
  return [
    {
      keys: 'mod+z',
      label: text.undo,
      group: text.groupEdit,
      handler: () => fx.historyStep('undo'),
    },
    {
      keys: ['shift+mod+z', 'mod+y'],
      label: text.redo,
      group: text.groupEdit,
      handler: () => fx.historyStep('redo'),
    },
    ...playbackShortcuts({
      toggle: () => {
        if (fx.docNow().image) play.toggle();
      },
      rewind: () => {
        if (fx.docNow().image) play.rewind();
      },
      group: text.groupPlay,
      labels: { toggle: text.playShortcut },
    }),
    {
      keys: 'mod+d',
      label: text.dupShortcut,
      group: text.groupFrame,
      handler: () => {
        const id = fx.useLive.getState().selected;
        if (id) fx.duplicate(id);
      },
    },
    { keys: ['delete', 'backspace'], label: text.delShortcut, group: text.groupFrame },
    {
      keys: ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'],
      label: text.nudgeShortcut,
      group: text.groupFrame,
    },
    { keys: 'escape', label: text.escShortcut, group: text.groupFrame },
    { keys: 'shift', label: text.shiftShortcut, group: text.groupFrame },
    ...extra,
    { keys: 'escape', label: text.escViewShortcut, group: text.groupPlay },
  ];
}
