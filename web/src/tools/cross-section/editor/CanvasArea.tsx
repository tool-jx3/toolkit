/**
 * 畫布區：畫布本身、下方的提示與縮放（縮小、倍率、放大、全體顯示、移動畫面）。
 */
import { Hand, Maximize, Minus, Plus } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { IconButton } from '@/ui';
import { S } from '../strings';
import * as act from './actions';
import { editor } from './controller';
import { useEditor } from './store';

function StatusBar() {
  const tool = useEditor((s) => s.tool);
  const audience = useEditor((s) => s.audience);
  const kind = useEditor((s) => s.kind);
  const zoom = useEditor((s) => s.zoomPct);
  const hint =
    audience === 'player'
      ? S.canvasHint.player
      : tool === 'place'
        ? `${S.fixtures[kind] ?? ''}：${S.canvasHint.place}`
        : S.canvasHint[tool];
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      <span className="min-w-0 flex-1 truncate" data-testid="canvas-hint">
        {hint}
      </span>
      <div className="flex items-center gap-0.5">
        <IconButton
          size="sm"
          variant="ghost"
          icon={<Hand />}
          label={S.zoom.hand}
          pressed={tool === 'hand'}
          onClick={() => act.setTool(tool === 'hand' ? 'select' : 'hand')}
        />
        <IconButton
          size="sm"
          variant="ghost"
          icon={<Minus />}
          label={S.zoom.out}
          onClick={() => editor.zoomBy(1 / 1.22)}
        />
        <span className="w-11 text-center tabular-nums" data-testid="zoom-label">
          {zoom}%
        </span>
        <IconButton
          size="sm"
          variant="ghost"
          icon={<Plus />}
          label={S.zoom.in}
          onClick={() => editor.zoomBy(1.22)}
        />
        <IconButton
          size="sm"
          variant="ghost"
          icon={<Maximize />}
          label={S.zoom.fit}
          onClick={() => editor.fitView()}
          data-testid="fit-view"
        />
      </div>
    </div>
  );
}

export function CanvasArea() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvas.current && wrap.current) editor.attach(canvas.current, wrap.current);
    return () => editor.detach();
  }, []);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5">
      <div
        ref={wrap}
        className="relative h-[min(62dvh,34rem,95vw)] min-h-60 min-w-0 overflow-hidden rounded-md border border-border bg-surface-2 lg:h-auto lg:flex-1"
      >
        <canvas
          ref={canvas}
          tabIndex={0}
          aria-label={S.canvas}
          className="block touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-focus"
          data-testid="section-canvas"
        />
      </div>
      <StatusBar />
    </div>
  );
}
