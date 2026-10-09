/**
 * 編輯列：範本、復原、重做、GM／PL 檢視、匯出圖片。
 */
import { Download, LayoutTemplate, Redo2, Undo2 } from 'lucide-react';
import { useUndoRedo } from '@/core/storage';
import { Button, IconButton, Segmented, withShortcut } from '@/ui';
import { S } from '../strings';
import { redo, setPlayerView, undo } from './actions';
import { setEditor, useEditor, useProject } from './store';

export function EditorBar() {
  const { canUndo, canRedo } = useUndoRedo(useProject);
  const playerView = useEditor((s) => s.playerView);
  const name = useProject((s) => s.data.name);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5" data-testid="editor-bar">
      <Button
        size="sm"
        variant="primary"
        icon={<LayoutTemplate />}
        onClick={() => setEditor({ templatesOpen: true })}
      >
        {S.bar.templates}
      </Button>
      <span
        className="min-w-0 max-w-[16rem] truncate text-sm text-muted"
        data-testid="map-name"
        title={name}
      >
        {name || S.untitled}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <IconButton
          size="sm"
          variant="ghost"
          icon={<Undo2 />}
          label={withShortcut(S.bar.undo, 'mod+z')}
          disabled={!canUndo}
          onClick={undo}
          data-testid="undo"
        />
        <IconButton
          size="sm"
          variant="ghost"
          icon={<Redo2 />}
          label={withShortcut(S.bar.redo, 'shift+mod+z')}
          disabled={!canRedo}
          onClick={redo}
          data-testid="redo"
        />
        <Segmented
          size="sm"
          aria-label={S.bar.view}
          value={playerView ? 'pl' : 'gm'}
          onValueChange={(v) => setPlayerView(v === 'pl')}
          options={[
            { value: 'gm', label: S.bar.gm },
            { value: 'pl', label: S.bar.pl },
          ]}
        />
        <Button
          size="sm"
          variant="secondary"
          icon={<Download />}
          onClick={() => setEditor({ exportOpen: true })}
          data-testid="export-open"
        >
          {S.bar.export}
        </Button>
      </div>
    </div>
  );
}
