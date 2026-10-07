import { Redo2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  type ExportPanelHandle,
  IconButton,
  ProjectMenu,
  type Shortcut,
  ToolShell,
  useModelCache,
  withShortcut,
} from '@/ui';
import { finishPick, go, openProject, projectData, projectFiles, resetAll } from './actions';
import { startEngine, strokeActive, useWork } from './engine';
import { modelSpec, RANGE, type ViewMode } from './model';
import { SettingsPanel, Usage } from './Panels';
import { PreviewColumn, setNote } from './Preview';
import {
  collectGarbage,
  PROJECT_VERSION,
  setPreview,
  TOOL_ID,
  usePreview,
  useSettings,
} from './store';
import { S } from './strings';

const spec = modelSpec();

export function App() {
  const savedAt = useSaveStatus(TOOL_ID);
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useSettings);
  const model = useModelCache(spec);
  const busy = useWork((st) => !!st.ai);
  const exportRef = useRef<ExportPanelHandle>(null);

  useEffect(() => {
    const stop = startEngine();
    void collectGarbage();
    return stop;
  }, []);

  /* Esc 取消取色 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && useWork.getState().picking) {
        e.preventDefault();
        finishPick(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const shortcuts = useMemo<Shortcut[]>(() => {
    const brush = (step: number) => () => {
      const v = usePreview.getState().data.brushSize;
      const next = Math.round(step > 0 ? Math.max(v + 1, v * 1.25) : Math.min(v - 1, v / 1.25));
      setPreview({
        brushSize: Math.min(RANGE.brushSize.max, Math.max(RANGE.brushSize.min, next)),
      });
    };
    const view = (v: ViewMode) => () => setPreview({ view: v });
    const safe = (fn: () => void) => () => {
      if (!strokeActive()) fn();
    };
    return [
      {
        keys: 'e',
        label: S.keys.erase,
        group: S.keys.tools,
        handler: () => setPreview({ tool: 'erase' }),
      },
      {
        keys: 'r',
        label: S.keys.restore,
        group: S.keys.tools,
        handler: () => setPreview({ tool: 'restore' }),
      },
      {
        keys: 'shift+e',
        label: S.keys.fillErase,
        group: S.keys.tools,
        handler: () => setPreview({ tool: 'fill-erase' }),
      },
      {
        keys: 'shift+r',
        label: S.keys.fillRestore,
        group: S.keys.tools,
        handler: () => setPreview({ tool: 'fill-restore' }),
      },
      {
        keys: 'v',
        label: S.keys.move,
        group: S.keys.tools,
        handler: () => setPreview({ tool: 'move' }),
      },
      { keys: '[', label: S.keys.smaller, group: S.keys.tools, handler: brush(-1) },
      { keys: ']', label: S.keys.bigger, group: S.keys.tools, handler: brush(1) },
      { keys: '1', label: S.keys.result, group: S.keys.view, handler: view('result') },
      { keys: '2', label: S.keys.original, group: S.keys.view, handler: view('original') },
      { keys: '3', label: S.keys.mask, group: S.keys.view, handler: view('mask') },
      { keys: ['a', 'shift+a'], label: S.keys.prev, group: S.keys.images, handler: () => go(-1) },
      { keys: ['d', 'shift+d'], label: S.keys.next, group: S.keys.images, handler: () => go(1) },
      { keys: 'mod+v', label: S.keys.paste, group: S.keys.images },
      {
        keys: 'mod+s',
        label: S.keys.export,
        group: S.keys.edit,
        handler: () => exportRef.current?.exportNow(),
      },
      /* Esc：從圖上取色時取消（上面的 keydown 處理；這裡只列在快捷鍵一覽） */
      { keys: 'escape', label: S.keys.cancel, group: S.keys.edit },
      { keys: 'mod+z', label: S.keys.undo, group: S.keys.edit, handler: safe(undo) },
      {
        keys: ['shift+mod+z', 'mod+y'],
        label: S.keys.redo,
        group: S.keys.edit,
        handler: safe(redo),
      },
    ];
  }, [undo, redo]);

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={<Usage />}
      shortcuts={shortcuts}
      headerActions={
        <>
          <IconButton
            label={withShortcut(S.undo, 'mod+z')}
            icon={<Undo2 />}
            onClick={undo}
            disabled={!canUndo}
          />
          <IconButton
            label={withShortcut(S.redo, 'shift+mod+z')}
            icon={<Redo2 />}
            onClick={redo}
            disabled={!canRedo}
          />
          <ProjectMenu
            toolId={TOOL_ID}
            version={PROJECT_VERSION}
            getData={projectData}
            getFiles={projectFiles}
            onLoad={async (data, project, files) => {
              if (useWork.getState().ai) throw new Error(S.aiRunning(1, 1));
              const missing = await openProject(data, project.version, files);
              if (missing) setNote({ tone: 'warning', text: S.project.missing(missing) });
              return true;
            }}
            onReset={resetAll}
            resetText={{ title: S.project.resetTitle, description: S.project.resetText }}
            resetDisabled={busy}
            openDisabled={busy}
            savedAt={savedAt}
          />
        </>
      }
      settings={<SettingsPanel model={model} />}
      preview={<PreviewColumn model={model} exportRef={exportRef} />}
    />
  );
}
