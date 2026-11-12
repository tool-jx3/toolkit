/**
 * 畫布區：畫布本身、左側的工具列、右上的「隱藏線索」開關、跟著選取的迷你工具列、下方的提示與縮放。
 * 2026-11-09：立體樓層圖、樓層總覽時沒有工具列與迷你工具列；空的樓層顯示「快速建立樓層」（F308）。
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
  Link2,
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
import { Button, cn, IconButton } from '@/ui';
import { SWING_DOORS } from '../model/catalog';
import { donorFloorIndex } from '../model/floorCopy';
import { MOMENTS, momentOf } from '../model/moment';
import { getObj } from '../model/ops';
import type { Opening, Room } from '../model/types';
import { S } from '../strings';
import * as act from './actions';
import { editor } from './controller';
import { useStage, useStageModule } from './stageStore';
import { currentFloor, type ToolId, useEditor, usePrefs, useProject } from './store';

/** L 形房間的圖示（虛線的 L 形；和房間工具的虛線方框成對，2026-10-29） */
function LShapeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray="3 3"
      aria-hidden="true"
      className="lucide"
      width={24}
      height={24}
    >
      <path d="M4 3h8v9h8v9H4z" />
    </svg>
  );
}

const TOOLS: { id: ToolId; icon: React.ReactNode; key: string; sep?: boolean }[] = [
  { id: 'select', icon: <MousePointer2 />, key: 'V' },
  { id: 'hand', icon: <Hand />, key: 'H' },
  { id: 'room', icon: <SquareDashed />, key: 'B', sep: true },
  { id: 'lroom', icon: <LShapeIcon />, key: 'J' },
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
          {/* 按鈕右下角寫快捷鍵字母（D14；名稱與提示另有「（B）」） */}
          <IconButton
            size="sm"
            variant="ghost"
            className="relative"
            icon={
              <>
                <span className="inline-flex -translate-x-0.5 -translate-y-0.5">{t.icon}</span>
                <span
                  className="absolute right-px bottom-px text-[9px] leading-none font-bold opacity-70"
                  data-tool-key
                >
                  {t.key}
                </span>
              </>
            }
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

/**
 * 事件前／事件後（2026-11-12 參考 KIIN v3.0 的「状態差分」，F330）：畫布右上、隱藏線索的下面。
 * 切換不算一步復原；事件後是醒目的顏色（不會忘了自己在事件後畫東西）。
 */
function MomentToggle() {
  const moment = useProject((s) => momentOf(s.data));
  return (
    <fieldset
      aria-label={S.moment.toggle}
      title={S.moment.toggleHint}
      className={cn(
        'absolute top-11 right-2 z-10 m-0 flex min-w-0 items-center gap-0.5 rounded-full border bg-surface p-0.5 text-xs font-medium shadow-1',
        moment === 'after' ? 'border-danger' : 'border-border',
      )}
      data-testid="moment-toggle"
    >
      {MOMENTS.map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={moment === m}
          onClick={() => act.setMoment(m)}
          className={cn(
            /* 觸控：每顆至少 32 px 高（驗證後修訂 2026-11-12；原本 22 px） */
            'inline-flex min-h-8 items-center rounded-full px-3 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none',
            moment === m
              ? m === 'after'
                ? 'bg-danger font-bold text-danger-contrast'
                : 'bg-surface-2 font-bold text-fg'
              : 'text-muted hover:text-fg',
          )}
          data-moment={m}
        >
          {S.moment.names[m]}
        </button>
      ))}
    </fieldset>
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
  /* 自由線（2026-11-05，F286）：翻轉＝左右反轉 */
  const onlyLines = objs.length > 0 && objs.every((o) => o.type === 'line');
  const oneDoor =
    objs.length === 1 &&
    objs[0].type === 'opening' &&
    SWING_DOORS.has((objs[0].obj as unknown as Opening).kind);
  const gm = objs.length > 0 && objs.every((o) => o.obj.gm);
  const clueTargets = objs.length > 0 && objs.every((o) => o.type === 'item' || o.type === 'text');
  const clue = clueTargets && objs.every((o) => o.obj.clue);
  const locked = rooms.length > 0 && rooms.every((o) => (o.obj as unknown as Room).locked);
  /* 選了兩間房間：打通兩間房（2026-10-29，F250） */
  const twoRooms = rooms.length === 2 && objs.length === 2;
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
          onClick={() => act.rotateSelection()}
          data-mini="rotate"
        />
      ) : null}
      {onlyItems || oneDoor || onlyLines ? (
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
      {twoRooms ? (
        <IconButton
          size="sm"
          variant="ghost"
          icon={<Link2 />}
          label={S.mini.connect}
          onClick={act.connectSelection}
          data-mini="connect"
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
        onClick={() => void act.deleteSelection()}
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
  const base = useEditor((s) => s.hint);
  /* 演出（2026-11-09）：工具與演出的畫面的說明 */
  const stage = useStage((s) => s.on);
  const tool = useStage((s) => s.tool);
  const preview = useStage((s) => s.preview);
  const playerView = useEditor((s) => s.playerView);
  const hint = stage
    ? {
        text:
          preview || playerView
            ? S.stageEntry.hintPreview
            : tool === 'route'
              ? S.stageEntry.hintRoute
              : tool === 'hand'
                ? S.hints.hand
                : S.stageEntry.hintHide,
        warn: false,
      }
    : base;
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

/**
 * 快速建立樓層（2026-11-09 參考 KIIN 的 MULTI-FLOOR QUICK SETUP，F308）：平面編輯、GM 檢視、這一層沒有房間、
 * 別一層有房間時，畫布上方顯示三種做法。選了「從空白開始畫」的樓層這一頁不再顯示。
 */
function QuickSetup() {
  const p = useProject((s) => s.data);
  const view = usePrefs((s) => s.data.view ?? 'plan');
  const playerView = useEditor((s) => s.playerView);
  const skip = useEditor((s) => s.quickSkip);
  const stage = useStage((s) => s.on);
  const f = p.floors[p.active];
  if (stage || view !== 'plan' || playerView || !f || f.rooms.length || skip.includes(f.id))
    return null;
  const donor = donorFloorIndex(p.floors, p.active);
  if (donor < 0) return null;
  const from = p.floors[donor].name || '—';
  return (
    <section
      aria-label={S.quick.kicker}
      className="absolute top-12 left-1/2 z-10 flex w-[min(26rem,calc(100%-6rem))] -translate-x-1/2 flex-col gap-2 rounded-lg border border-border bg-surface p-3 shadow-2"
      data-testid="quick-setup"
    >
      <p className="m-0 text-xs font-semibold text-muted">{S.quick.kicker}</p>
      <h3 className="m-0 text-base font-bold text-fg">{S.quick.title(f.name)}</h3>
      <p className="m-0 text-xs text-muted">{S.quick.desc(from)}</p>
      <Button
        size="sm"
        variant="primary"
        onClick={() => act.quickFill('shell', donor)}
        data-testid="quick-shell"
      >
        {S.quick.shell(from)}
      </Button>
      <Button size="sm" onClick={() => act.quickFill('full', donor)} data-testid="quick-full">
        {S.quick.full(from)}
      </Button>
      <Button size="sm" variant="ghost" onClick={act.quickSkip} data-testid="quick-blank">
        {S.quick.blank}
      </Button>
    </section>
  );
}

export function CanvasArea() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = usePrefs((s) => s.data.view ?? 'plan');
  const stage = useStage((s) => s.on);
  const M = useStageModule();
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
        aria-label={
          stage
            ? S.stageEntry.canvas
            : view === 'stack'
              ? S.view3d.canvasStack
              : view === 'board'
                ? S.view3d.canvasBoard
                : S.canvasLabel
        }
        className="absolute inset-0 block size-full touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-focus"
        data-testid="map-canvas"
        data-view={view}
        data-stage={stage ? 'on' : undefined}
      />
      {stage && M ? <M.StageToolStrip /> : view === 'plan' ? <ToolStrip /> : null}
      <ClueToggle />
      <MomentToggle />
      {view === 'plan' && !stage ? <MiniBar /> : null}
      <QuickSetup />
      <Hint />
      <ZoomBox />
    </div>
  );
}
