/**
 * 狀態列（F040、F034）：游標所在的格、縮放、格子大小、最後的操作（或暫時訊息）；縮小、放大、重設檢視。
 */
import { Maximize, ZoomIn, ZoomOut } from 'lucide-react';
import { IconButton } from '@/ui';
import { CELL_SIZE } from '../model';
import { getEngine } from '../runtime';
import { useEditor } from '../stores';
import { S } from '../strings';

export function StatusBar() {
  const pointer = useEditor((s) => s.pointer);
  const zoom = useEditor((s) => s.zoom);
  const last = useEditor((s) => s.lastAction);
  const transient = useEditor((s) => s.transient);
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-muted"
      data-testid="status-bar"
    >
      <span title={S.statusBar.cell} className="tabular-nums" data-testid="status-cell">
        {pointer ? `${pointer.col}, ${pointer.row}` : '–'}
      </span>
      <span className="flex items-center gap-0.5">
        <IconButton
          size="sm"
          variant="ghost"
          icon={<ZoomOut />}
          label={S.statusBar.zoomOut}
          onClick={() => getEngine()?.zoomBy(1 / 1.25)}
        />
        <span
          title={S.statusBar.zoom}
          className="w-12 text-center tabular-nums"
          data-testid="status-zoom"
        >
          {Math.round(zoom * 100)}%
        </span>
        <IconButton
          size="sm"
          variant="ghost"
          icon={<ZoomIn />}
          label={S.statusBar.zoomIn}
          onClick={() => getEngine()?.zoomBy(1.25)}
        />
        <IconButton
          size="sm"
          variant="ghost"
          icon={<Maximize />}
          label={S.statusBar.resetView}
          onClick={() => getEngine()?.resetView()}
        />
      </span>
      <span title={S.statusBar.cellSizeLabel}>{S.statusBar.cellSize(CELL_SIZE)}</span>
      <span
        className={`ml-auto min-w-0 truncate ${transient ? 'text-warning' : ''}`}
        role="status"
        aria-live="polite"
        data-testid="status-message"
      >
        {transient ?? last}
      </span>
    </div>
  );
}
