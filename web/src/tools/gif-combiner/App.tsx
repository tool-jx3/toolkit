import { type RefObject, useEffect, useMemo, useRef } from 'react';
import { pickFiles } from '@/core/files';
import { resetToolStore, useSaveError, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  type ExportPanelHandle,
  ProjectMenu,
  type Shortcut,
  ToolShell,
  UsageSection,
  useToast,
} from '@/ui';
import { addFiles, openProject, restoreOnce, setNotifier } from './actions';
import { type CombinerData, TOOL_ID } from './logic';
import { assets, collectGarbage, useMedia } from './media';
import { Preview, type PreviewHandle } from './Preview';
import { ACCEPT, CanvasPanel, FilesPanel, GridPanel } from './panels';
import { dataNow, PROJECT_VERSION, select, useCombiner, useUi } from './store';
import { S } from './strings';

const USAGE = (
  <>
    <ol>
      {S.usage.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ol>
    <p>{S.about}</p>
  </>
);

declare global {
  interface Window {
    __gifCombiner?: unknown;
  }
}

/** 開頁還原、測試入口（要在 ToolShell 裡才拿得到 toast） */
function Bootstrap({ preview }: { preview: RefObject<PreviewHandle | null> }) {
  const toast = useToast();
  const saveError = useSaveError(TOOL_ID);
  useEffect(() => {
    setNotifier(toast);
    void restoreOnce(toast);
    return () => setNotifier(null);
  }, [toast]);
  /* 設定寫不進瀏覽器（容量已滿、被封鎖）時提醒，工具照常可用（F45） */
  useEffect(() => {
    if (saveError) toast({ title: S.files.settingsNotSaved, tone: 'warning' });
  }, [saveError, toast]);
  useEffect(() => {
    window.__gifCombiner = {
      data: () => dataNow(),
      media: () =>
        Object.fromEntries(
          Object.entries(useMedia.getState().media).map(([id, m]) => [
            id,
            { width: m.width, height: m.height, delays: m.delays, total: m.total },
          ]),
        ),
      ui: () => ({ selected: useUi.getState().selected, zoom: useUi.getState().zoom }),
      seek: (t: number) => preview.current?.seek(t),
      get time() {
        return preview.current?.time ?? 0;
      },
      get playing() {
        return preview.current?.playing ?? false;
      },
      toggle: () => preview.current?.toggle(),
      /* 停在 t 秒（測試、截圖用） */
      pauseAt: (t: number) => {
        preview.current?.pause();
        preview.current?.seek(t);
      },
    };
    return () => {
      window.__gifCombiner = undefined;
    };
  }, [preview]);
  return null;
}

export function App() {
  const preview = useRef<PreviewHandle | null>(null);
  const exportRef = useRef<ExportPanelHandle | null>(null);
  const { undo, redo } = useUndoRedo(useCombiner);
  const savedAt = useSaveStatus(TOOL_ID);

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      { keys: 'mod+z', label: S.keys.undo, group: S.keys.edit, handler: undo },
      { keys: ['shift+mod+z', 'mod+y'], label: S.keys.redo, group: S.keys.edit, handler: redo },
      {
        keys: ['mod+shift+o', 'alt+shift+o'],
        label: S.keys.open,
        group: S.keys.edit,
        handler: () => {
          void pickFiles({ accept: ACCEPT, multiple: true }).then((files) => {
            if (files.length) void addFiles(files);
          });
        },
      },
      {
        keys: ['mod+shift+p', 'alt+shift+p'],
        label: S.keys.play,
        group: S.keys.edit,
        handler: () => preview.current?.toggle(),
      },
      {
        keys: ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'],
        label: S.keys.nudge,
        group: S.keys.layout,
      },
      {
        keys: ['shift+arrowleft', 'shift+arrowright', 'shift+arrowup', 'shift+arrowdown'],
        label: S.keys.nudge10,
        group: S.keys.layout,
      },
      { keys: ['delete', 'backspace'], label: S.keys.remove, group: S.keys.layout },
      { keys: 'escape', label: S.keys.deselect, group: S.keys.layout },
    ],
    [undo, redo],
  );

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={USAGE}
      shortcuts={shortcuts}
      headerActions={
        <ProjectMenu<CombinerData>
          toolId={TOOL_ID}
          version={PROJECT_VERSION}
          getData={dataNow}
          getFiles={() => assets.exportFiles(dataNow().items.map((it) => it.asset))}
          openAccept=".zip,.json,application/zip,application/json"
          onLoad={(data, project, files) => openProject(data, project, files)}
          onReset={() => {
            resetToolStore(useCombiner);
            select(null);
            useUi.setState({ zoom: 'fit' });
            /* 清掉的動圖已經沒人用（復原紀錄也清了）：從瀏覽器刪掉、釋放解碼好的影格 */
            void collectGarbage();
          }}
          resetText={{
            title: S.project.resetTitle,
            description: S.project.resetDescription,
          }}
          savedAt={savedAt}
        />
      }
      settings={
        <>
          <Bootstrap preview={preview} />
          <UsageSection persistKey="gif-combiner">{USAGE}</UsageSection>
          <FilesPanel />
          <CanvasPanel />
          <GridPanel />
        </>
      }
      preview={<Preview handle={preview} exportRef={exportRef} />}
    />
  );
}
