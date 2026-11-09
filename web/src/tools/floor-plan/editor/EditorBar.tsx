/**
 * 編輯列：範本、復原、重做、檢視方式（平面編輯／立體樓層圖／樓層總覽，2026-11-09）、GM／PL 檢視、匯出圖片。
 */
import { Clapperboard, Download, LayoutTemplate, Redo2, Undo2 } from 'lucide-react';
import { useUndoRedo } from '@/core/storage';
import { Button, IconButton, Segmented, withShortcut } from '@/ui';
import { S } from '../strings';
import { redo, setPlayerView, setViewMode, undo } from './actions';
import { toggleStage, useStage } from './stageStore';
import { setEditor, useEditor, usePrefs, useProject, type ViewMode } from './store';

export function EditorBar() {
  const { canUndo, canRedo } = useUndoRedo(useProject);
  const playerView = useEditor((s) => s.playerView);
  const name = useProject((s) => s.data.name);
  const view = usePrefs((s) => s.data.view ?? 'plan');
  const stage = useStage((s) => s.on);
  const stageLoading = useStage((s) => s.loading);
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
        <Segmented<ViewMode>
          size="sm"
          aria-label={S.view3d.label}
          value={view}
          onValueChange={setViewMode}
          options={[
            { value: 'plan', label: S.view3d.plan },
            { value: 'stack', label: S.view3d.stack },
            { value: 'board', label: S.view3d.board },
          ]}
        />
        {/* 演出（2026-11-09，F313）：和檢視方式分開（演出時也可以換平面編輯／立體樓層圖／樓層總覽） */}
        <Button
          size="sm"
          variant={stage ? 'primary' : 'secondary'}
          icon={<Clapperboard />}
          aria-pressed={stage}
          title={S.stageEntry.toggleTip}
          loading={stageLoading}
          onClick={toggleStage}
          data-testid="stage-toggle"
        >
          {stageLoading ? S.stageEntry.loading : S.stageEntry.toggle}
        </Button>
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
