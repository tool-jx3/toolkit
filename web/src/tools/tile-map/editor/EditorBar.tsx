/**
 * 畫布上方的編輯列：復原／重做、新地圖、地圖名稱、地圖設定（顯示目前的大小）、格線、符合畫面、縮放、匯出。
 */
import {
  Download,
  FilePlus2,
  Grid3x3,
  Maximize,
  Minus,
  Plus,
  Redo2,
  Settings,
  Undo2,
} from 'lucide-react';
import { useStore } from 'zustand';
import { Button, IconButton, TextInput } from '@/ui';
import { S } from '../strings';
import * as act from './actions';
import { fitView, zoomBy, zoomTo } from './MapCanvas';
import { setEditor, useEditor, useMap, usePrefs } from './store';

export function EditorBar() {
  const name = useMap((s) => s.data.name);
  const width = useMap((s) => s.data.width);
  const height = useMap((s) => s.data.height);
  const canUndo = useStore(useMap.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useMap.temporal, (s) => s.futureStates.length > 0);
  const zoom = useEditor((s) => s.zoom);
  const grid = usePrefs((s) => s.data.grid);
  const patch = usePrefs((s) => s.patch);
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="editor-bar">
      <IconButton
        label={`${S.bar.undo}（Ctrl＋Z）`}
        icon={<Undo2 />}
        size="sm"
        variant="ghost"
        disabled={!canUndo}
        onClick={act.undo}
        data-testid="undo"
      />
      <IconButton
        label={`${S.bar.redo}（Ctrl＋Shift＋Z）`}
        icon={<Redo2 />}
        size="sm"
        variant="ghost"
        disabled={!canRedo}
        onClick={act.redo}
        data-testid="redo"
      />
      <Button
        size="sm"
        variant="ghost"
        icon={<FilePlus2 />}
        onClick={() => setEditor({ dialog: 'new' })}
        data-testid="new-map"
      >
        {S.bar.newMap}
      </Button>
      <TextInput
        aria-label={S.bar.mapName}
        value={name}
        maxLength={100}
        placeholder={S.defaultMapName}
        onFocus={() => useMap.beginGesture()}
        onBlur={() => useMap.endGesture()}
        onChange={(e) => act.renameMap(e.target.value)}
        className="h-7 min-w-36 flex-1 text-sm sm:w-44 sm:flex-none"
        data-testid="map-name"
      />
      <Button
        size="sm"
        variant="ghost"
        icon={<Settings />}
        onClick={() => setEditor({ dialog: 'settings' })}
        data-testid="map-settings"
      >
        {S.bar.settings}
        <span className="text-xs text-muted tabular-nums" data-testid="map-size">
          {S.bar.size(width, height)}
        </span>
      </Button>
      <div className="ml-auto flex flex-wrap items-center gap-1">
        <IconButton
          label={`${S.bar.grid}（V）`}
          icon={<Grid3x3 />}
          size="sm"
          variant="ghost"
          pressed={grid}
          onClick={() => patch({ grid: !grid })}
          data-testid="grid-toggle"
        />
        <IconButton
          label={`${S.bar.fit}（0）`}
          icon={<Maximize />}
          size="sm"
          variant="ghost"
          onClick={fitView}
        />
        <IconButton
          label={`${S.bar.zoomOut}（−）`}
          icon={<Minus />}
          size="sm"
          variant="ghost"
          onClick={() => zoomBy(0.8)}
        />
        <button
          type="button"
          className="h-7 min-w-14 rounded-sm px-1 text-xs text-muted tabular-nums hover:bg-surface-3 focus-visible:focus-ring"
          aria-label={S.bar.zoom}
          title={S.bar.zoom}
          onClick={() => zoomTo(1)}
          data-testid="zoom"
        >
          {Math.round(zoom * 100)}%
        </button>
        <IconButton
          label={`${S.bar.zoomIn}（＋）`}
          icon={<Plus />}
          size="sm"
          variant="ghost"
          onClick={() => zoomBy(1.25)}
        />
        <Button
          size="sm"
          variant="primary"
          icon={<Download />}
          onClick={() => setEditor({ dialog: 'export' })}
          data-testid="open-export"
        >
          {S.bar.export}
        </Button>
      </div>
    </div>
  );
}
