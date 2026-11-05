/**
 * 畫布區：畫布本身、畫到一半時的「完成／取消」列、下方的提示與縮放。
 */
import { Maximize, Minus, Plus } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button, IconButton } from '@/ui';
import { assetDef } from '../model/assets';
import { CELL } from '../model/types';
import { S } from '../strings';
import { editor } from './controller';
import { LINE_TOOLS, useDoc, useEditor } from './store';

function DraftBar() {
  const n = useEditor((s) => s.draftCount);
  const tool = useEditor((s) => s.tool);
  if (!n || !LINE_TOOLS.includes(tool)) return null;
  const min = tool === 'region' ? 3 : 2;
  return (
    <div
      className="absolute top-2 left-1/2 z-10 flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-1"
      data-testid="draft-bar"
    >
      <span className="tabular-nums">{S.draft.count(n, min)}</span>
      <Button
        size="sm"
        variant="primary"
        disabled={n < min}
        onClick={() => editor.finishDraft()}
        data-testid="draft-finish"
      >
        {S.draft.finish}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => editor.cancelDraft()}>
        {S.draft.cancel}
      </Button>
    </div>
  );
}

function StatusBar() {
  const tool = useEditor((s) => s.tool);
  const audience = useEditor((s) => s.audience);
  const asset = useEditor((s) => s.asset);
  const zoom = useEditor((s) => s.zoomPct);
  const cols = useDoc((s) => s.data.cols);
  const rows = useDoc((s) => s.data.rows);
  const name =
    tool === 'asset' ? `${S.tools.asset}：${assetDef(asset)?.name ?? ''}` : S.tools[tool];
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      <span className="font-semibold text-fg" data-testid="tool-name">
        {name}
      </span>
      <span className="min-w-0 flex-1 truncate" data-testid="canvas-hint">
        {audience === 'player' ? S.hint.player : S.hint[tool]}
      </span>
      <span className="hidden tabular-nums sm:inline">
        {S.zoom.size(cols, rows, cols * CELL, rows * CELL)}
      </span>
      <div className="flex items-center gap-0.5">
        <IconButton
          size="sm"
          variant="ghost"
          icon={<Minus />}
          label={S.zoom.out}
          onClick={() => editor.zoomBy(0.8)}
        />
        <span className="w-11 text-center tabular-nums" data-testid="zoom-label">
          {zoom}%
        </span>
        <IconButton
          size="sm"
          variant="ghost"
          icon={<Plus />}
          label={S.zoom.in}
          onClick={() => editor.zoomBy(1.25)}
        />
        <IconButton
          size="sm"
          variant="ghost"
          icon={<Maximize />}
          label={S.zoom.fit}
          onClick={() => editor.fitView()}
        />
      </div>
    </div>
  );
}

export function CanvasArea() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tool = useEditor((s) => s.tool);
  useEffect(() => {
    if (canvas.current && wrap.current) editor.attach(canvas.current, wrap.current);
    return () => editor.detach();
  }, []);
  const cursor = tool === 'hand' ? 'grab' : tool === 'select' ? 'default' : 'crosshair';
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5">
      <div
        ref={wrap}
        className="relative h-[min(62dvh,34rem,80vw)] min-h-60 min-w-0 overflow-hidden rounded-md border border-border bg-surface-2 lg:h-auto lg:flex-1"
      >
        <canvas
          ref={canvas}
          tabIndex={0}
          aria-label={S.canvas}
          className="block touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-focus"
          style={{ cursor }}
          data-testid="map-canvas"
        />
        <DraftBar />
      </div>
      <StatusBar />
    </div>
  );
}
