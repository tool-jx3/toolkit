/**
 * 編輯畫面的版面：上方編輯列；寬畫面左邊圖塊、中間畫布（左上工具列、下方狀態列）、右邊畫筆與圖層；
 * 窄畫面依序往下排（畫布在上、圖塊、畫筆與圖層）。
 */
import { useEffect } from 'react';
import { useConfirm, useToast, WindowDrop } from '@/ui';
import { S } from '../strings';
import { bindUi, notify } from './actions';
import { BrushPanel } from './BrushPanel';
import {
  MapSettingsDialog,
  MoveDialog,
  NewMapDialog,
  RenameLayerDialog,
  ShapeSizeDialog,
} from './Dialogs';
import { EditorBar } from './EditorBar';
import { ExportDialog } from './ExportDialog';
import { dropFiles } from './files';
import { ImportDialog } from './ImportDialog';
import { handleKeyDown } from './keys';
import { LayerPanel } from './LayerPanel';
import { MapCanvas, useHover } from './MapCanvas';
import { Palette } from './Palette';
import { bindPersistNotify, bootPersistence } from './persist';
import { useEditor, useMap } from './store';
import { TilesetManager } from './TilesetManager';
import { ToolStrip } from './ToolStrip';
import { installTestHook } from './testHook';

function StatusLine() {
  const hover = useHover();
  const map = useMap((s) => s.data);
  const savedAt = useEditor((s) => s.savedAt);
  const saveError = useEditor((s) => s.saveError);
  let text = '';
  if (hover && hover.x < map.width && hover.y < map.height) {
    const i = hover.y * map.width + hover.x;
    const names = [...map.layers]
      .reverse()
      .filter((l) => l.visible && l.opacity !== 0 && l.cells[i])
      .map((l) => l.name);
    text = S.bar.cursor(hover.x + 1, hover.y + 1, names);
  }
  return (
    <div
      className="flex min-h-5 items-center justify-between gap-2 text-xs text-muted"
      data-testid="status-line"
    >
      <span className="min-w-0 truncate" aria-live="off" data-testid="cursor-status">
        {text}
      </span>
      {saveError ? (
        <span className="shrink-0 text-warning">{S.save.failed}</span>
      ) : savedAt ? (
        <span className="sr-only" data-testid="saved-at" data-saved={savedAt} />
      ) : null}
    </div>
  );
}

export function Editor() {
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    bindUi(toast, confirm);
    bindPersistNotify((kind) => {
      if (kind === 'restoreFailed') notify(S.save.restoreFailed, 'warning', { duration: 8000 });
      else if (kind === 'saveFailed') notify(S.save.failed, 'warning', { duration: 8000 });
      else if (kind === 'libraryFailed')
        notify(S.save.libraryFailed, 'warning', { duration: 8000 });
    });
    installTestHook();
    void bootPersistence();
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      bindUi(null, null);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [toast, confirm]);

  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="tile-map">
      <WindowDrop
        accept=".zip,.json,image/png,image/jpeg,image/webp,application/zip,application/json"
        label={S.project.dropHint}
        onDrop={(files) => dropFiles(files)}
      />
      <EditorBar />
      <div className="grid min-w-0 grid-cols-1 gap-3 lg:h-[calc(100dvh-9.5rem)] lg:min-h-[36rem] lg:grid-cols-[15rem_minmax(0,1fr)_16rem] xl:grid-cols-[17rem_minmax(0,1fr)_18rem]">
        <section
          aria-label={S.palette.heading}
          className="order-2 flex min-h-0 min-w-0 flex-col lg:order-1"
        >
          <Palette />
        </section>
        <section
          aria-label="畫布"
          className="order-1 flex min-h-0 min-w-0 flex-col gap-1 lg:order-2"
        >
          <div className="relative flex min-h-0 flex-1 flex-col">
            <MapCanvas />
            <ToolStrip />
          </div>
          <StatusLine />
        </section>
        <section
          aria-label={S.layers.heading}
          className="order-3 flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto"
        >
          <BrushPanel />
          <LayerPanel />
        </section>
      </div>
      <NewMapDialog />
      <MapSettingsDialog />
      <MoveDialog />
      <ShapeSizeDialog />
      <RenameLayerDialog />
      <TilesetManager />
      <ImportDialog />
      <ExportDialog />
    </div>
  );
}
