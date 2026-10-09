/**
 * 畫布區：畫布本身、左側的工具列、右上的「隱藏線索」開關、跟著選取的迷你工具列、下方的提示與縮放。
 */
import {
  AppWindow,
  BrickWall,
  Copy,
  DoorOpen,
  Eraser,
  Eye,
  EyeOff,
  FlipHorizontal2,
  Hand,
  Lock,
  LockOpen,
  Maximize,
  Minus,
  MousePointer2,
  Plus,
  RotateCw,
  Search,
  SquareDashed,
  Trash2,
  Type,
  Undo,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn, IconButton } from '@/ui';
import { SWING_DOORS } from '../model/catalog';
import { getObj } from '../model/ops';
import type { Opening, Room } from '../model/types';
import { S } from '../strings';
import * as act from './actions';
import { editor } from './controller';
import { currentFloor, type ToolId, useEditor, usePrefs, useProject } from './store';

const TOOLS: { id: ToolId; icon: React.ReactNode; key: string; sep?: boolean }[] = [
  { id: 'select', icon: <MousePointer2 />, key: 'V' },
  { id: 'hand', icon: <Hand />, key: 'H' },
  { id: 'room', icon: <SquareDashed />, key: 'B', sep: true },
  { id: 'wall', icon: <BrickWall />, key: 'W' },
  { id: 'door', icon: <DoorOpen />, key: 'D' },
  { id: 'window', icon: <AppWindow />, key: 'N' },
  { id: 'text', icon: <Type />, key: 'T' },
  { id: 'eraser', icon: <Eraser />, key: 'E', sep: true },
];

function ToolStrip() {
  const tool = useEditor((s) => s.tool);
  return (
    <div
      role="toolbar"
      aria-orientation="vertical"
      aria-label={S.tools.label}
      className="absolute top-2 left-2 z-10 flex flex-col gap-0.5 rounded-md border border-border bg-surface p-1 shadow-1"
      data-testid="tool-strip"
    >
      {TOOLS.map((t) => (
        <div key={t.id} className="contents">
          {t.sep ? <span aria-hidden className="my-0.5 h-px w-6 self-center bg-border" /> : null}
          <IconButton
            size="sm"
            variant="ghost"
            icon={t.icon}
            label={`${S.tools[t.id as Exclude<ToolId, 'place'>]}（${t.key}）`}
            pressed={tool === t.id}
            onClick={() => act.setTool(t.id)}
            data-tool={t.id}
          />
        </div>
      ))}
    </div>
  );
}

function ClueToggle() {
  const on = usePrefs((s) => s.data.showClues);
  return (
    <button
      type="button"
      aria-pressed={on}
      title={on ? S.bar.cluesOn : S.bar.cluesOff}
      onClick={() => act.setShowClues(!on)}
      className={cn(
        'absolute top-2 right-2 z-10 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium shadow-1 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none',
        on ? 'border-warning bg-surface text-fg' : 'border-border bg-surface text-muted',
      )}
      data-testid="clue-toggle"
    >
      <Search aria-hidden className={cn('size-3.5', on && 'text-warning')} />
      {S.bar.clues}
      <span className="font-bold">{on ? S.bar.on : S.bar.off}</span>
    </button>
  );
}

function MiniBar() {
  const ref = useRef<HTMLDivElement>(null);
  const sel = useEditor((s) => s.sel);
  /* 資料改了（例如切換 GM）也要重新算按鈕 */
  useProject((s) => s.data);
  useEffect(() => {
    editor.setMiniBar(ref.current);
    return () => editor.setMiniBar(null);
  }, []);
  const f = currentFloor();
  const objs = sel
    .map((s) => ({
      ...s,
      obj: getObj(f, s.type, s.id) as unknown as Record<string, unknown> | null,
    }))
    .filter((s): s is typeof s & { obj: Record<string, unknown> } => !!s.obj);
  const rooms = objs.filter((o) => o.type === 'room');
  const onlyItems = objs.length > 0 && objs.every((o) => o.type === 'item');
  const oneDoor =
    objs.length === 1 &&
    objs[0].type === 'opening' &&
    SWING_DOORS.has((objs[0].obj as unknown as Opening).kind);
  const gm = objs.length > 0 && objs.every((o) => o.obj.gm);
  const clueTargets = objs.length > 0 && objs.every((o) => o.type === 'item' || o.type === 'text');
  const clue = clueTargets && objs.every((o) => o.obj.clue);
  const locked = rooms.length > 0 && rooms.every((o) => (o.obj as unknown as Room).locked);
  return (
    <div
      ref={ref}
      hidden
      role="toolbar"
      aria-label={S.mini.label}
      className="absolute z-20 flex -translate-x-1/2 -translate-y-full gap-0.5 rounded-md border border-border bg-surface p-0.5 shadow-2"
      data-testid="mini-bar"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {onlyItems || rooms.length ? (
        <IconButton
          size="sm"
          variant="ghost"
          icon={<RotateCw />}
          label={S.mini.rotate}
          disabled={rooms.length > 0 && locked}
          onClick={act.rotateSelection}
          data-mini="rotate"
        />
      ) : null}
      {onlyItems || oneDoor ? (
        <IconButton
          size="sm"
          variant="ghost"
          icon={<FlipHorizontal2 />}
          label={S.mini.flip}
          onClick={act.flipSelection}
          data-mini="flip"
        />
      ) : null}
      {oneDoor ? (
        <IconButton
          size="sm"
          variant="ghost"
          icon={<Undo />}
          label={S.mini.hinge}
          onClick={act.flipHinge}
          data-mini="hinge"
        />
      ) : null}
      <IconButton
        size="sm"
        variant="ghost"
        icon={gm ? <EyeOff /> : <Eye />}
        label={gm ? S.mini.gmOn : S.mini.gmOff}
        pressed={gm}
        onClick={act.toggleGm}
        data-mini="gm"
      />
      {clueTargets ? (
        <IconButton
          size="sm"
          variant="ghost"
          icon={<Search />}
          label={clue ? S.mini.clueOn : S.mini.clueOff}
          pressed={clue}
          onClick={act.toggleClue}
          data-mini="clue"
        />
      ) : null}
      {rooms.length ? (
        <IconButton
          size="sm"
          variant="ghost"
          icon={locked ? <Lock /> : <LockOpen />}
          label={locked ? S.mini.unlock : S.mini.lock}
          pressed={locked}
          onClick={act.toggleLock}
          data-mini="lock"
        />
      ) : null}
      <IconButton
        size="sm"
        variant="ghost"
        icon={<Copy />}
        label={S.mini.duplicate}
        onClick={act.duplicateSelection}
        data-mini="duplicate"
      />
      <IconButton
        size="sm"
        variant="danger"
        icon={<Trash2 />}
        label={S.mini.delete}
        onClick={act.deleteSelection}
        data-mini="delete"
      />
    </div>
  );
}

function ZoomBox() {
  const pct = useEditor((s) => s.zoomPct);
  return (
    <div
      className="absolute right-2 bottom-2 z-10 flex items-center gap-0.5 rounded-md border border-border bg-surface p-0.5 shadow-1"
      role="toolbar"
      aria-label={S.zoom.label}
    >
      <IconButton
        size="sm"
        variant="ghost"
        icon={<Minus />}
        label={`${S.zoom.out}（-）`}
        onClick={() => editor.zoomBy(0.8)}
      />
      <button
        type="button"
        className="min-w-12 rounded-sm px-1 text-xs tabular-nums hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
        onClick={() => editor.fitView()}
        title={S.zoom.fit}
        data-testid="zoom-value"
      >
        {pct}%
      </button>
      <IconButton
        size="sm"
        variant="ghost"
        icon={<Plus />}
        label={`${S.zoom.in}（+）`}
        onClick={() => editor.zoomBy(1.25)}
      />
      <IconButton
        size="sm"
        variant="ghost"
        icon={<Maximize />}
        label={S.zoom.fit}
        onClick={() => editor.fitView()}
        data-testid="zoom-fit"
      />
    </div>
  );
}

function Hint() {
  const hint = useEditor((s) => s.hint);
  return (
    <p
      aria-live="polite"
      className={cn(
        'pointer-events-none absolute bottom-12 left-1/2 z-10 m-0 hidden max-w-[min(36rem,calc(100%-1rem))] -translate-x-1/2 rounded-md px-2.5 py-1 text-center text-xs shadow-1 sm:block',
        hint.warn ? 'bg-warning text-warning-contrast' : 'bg-surface text-fg opacity-90',
      )}
      data-testid="canvas-hint"
    >
      {hint.text}
    </p>
  );
}

export function CanvasArea() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    editor.attach(canvas, wrap);
    act.updateHint(false);
    return () => editor.detach();
  }, []);
  return (
    <div
      ref={wrapRef}
      className="relative h-[60dvh] min-h-[20rem] w-full min-w-0 overflow-hidden rounded-md border border-border data-[dropping=true]:border-accent lg:h-auto lg:flex-1"
      data-testid="canvas-wrap"
    >
      <canvas
        ref={canvasRef}
        tabIndex={0}
        aria-label={S.canvasLabel}
        className="absolute inset-0 block size-full touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-focus"
        data-testid="map-canvas"
      />
      <ToolStrip />
      <ClueToggle />
      <MiniBar />
      <Hint />
      <ZoomBox />
    </div>
  );
}
