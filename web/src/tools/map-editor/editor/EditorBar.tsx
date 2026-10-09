/**
 * 編輯列（F020）：地圖一覽、地圖名稱（點一下重新命名）、網格種類、儲存狀態、立即儲存、復原、重做、匯出圖片。
 */
import { ArrowLeft, Download, Redo2, Save, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton, withShortcut } from '@/ui';
import { redo, saveNow, startExport, undo } from '../actions';
import { RenameDialog } from '../MapList';
import { getSession } from '../runtime';
import { useEditor } from '../stores';
import { S } from '../strings';

const STATUS_TONE = {
  saved: 'text-muted',
  dirty: 'text-warning',
  saving: 'text-muted',
  error: 'text-danger',
} as const;

export function EditorBar({ onBack }: { onBack: () => void }) {
  const name = useEditor((s) => s.mapName);
  const gridType = useEditor((s) => s.gridType);
  const status = useEditor((s) => s.saveStatus);
  const canUndo = useEditor((s) => s.canUndo);
  const canRedo = useEditor((s) => s.canRedo);
  const exportMode = useEditor((s) => s.exportMode);
  const [renaming, setRenaming] = useState(false);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1" data-testid="editor-bar">
      <Button size="sm" variant="ghost" icon={<ArrowLeft />} onClick={onBack}>
        {S.editor.backToList}
      </Button>
      <button
        type="button"
        className="min-w-0 max-w-full truncate rounded-sm px-1 text-base font-semibold hover:text-accent hover:underline focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none sm:max-w-[24rem]"
        title={S.editor.renameMap}
        aria-label={`${S.editor.renameMap}：${name}`}
        onClick={() => setRenaming(true)}
        data-testid="map-name"
      >
        {name || '…'}
      </button>
      <span className="rounded-sm bg-surface-3 px-1.5 py-0.5 text-xs text-muted">
        {S.gridTypes[gridType]}
      </span>
      <span
        className={`text-xs ${STATUS_TONE[status]}`}
        role="status"
        aria-live="polite"
        data-testid="save-status"
        data-status={status}
      >
        {S.save[status]}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <IconButton
          size="sm"
          variant="ghost"
          icon={<Save />}
          label={withShortcut(S.editor.saveNow, 'mod+s')}
          onClick={saveNow}
          data-testid="save-now"
        />
        <IconButton
          size="sm"
          variant="ghost"
          icon={<Undo2 />}
          label={withShortcut(S.editor.undo, 'mod+z')}
          disabled={!canUndo}
          onClick={undo}
          data-testid="undo"
        />
        <IconButton
          size="sm"
          variant="ghost"
          icon={<Redo2 />}
          label={withShortcut(S.editor.redo, 'shift+mod+z')}
          disabled={!canRedo}
          onClick={redo}
          data-testid="redo"
        />
        <Button
          size="sm"
          variant="primary"
          icon={<Download />}
          onClick={startExport}
          aria-pressed={exportMode !== 'off'}
          data-testid="export-start"
        >
          {S.editor.exportImage}
        </Button>
      </div>
      <RenameDialog
        target={renaming ? { name } : null}
        onClose={() => setRenaming(false)}
        onRename={async (_m, next) => {
          setRenaming(false);
          await getSession()?.rename(next);
        }}
      />
    </div>
  );
}
