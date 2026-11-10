/**
 * 畫布上方與下方的操作列（規格 F10、F11、F15、F30～F41）：畫布的切換、畫法、顏色、縮放；草稿的狀態與
 * 決定／取消／退一點／移動／反轉／旋轉。窄畫面時緊貼在畫布上下，一指就能操作。
 */
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Delete,
  FlipHorizontal2,
  Grid2x2X,
  LayoutGrid,
  Maximize,
  PaintBucket,
  Pencil,
  Pentagon,
  Plus,
  RotateCw,
  Slash,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Button,
  buttonClass,
  IconButton,
  MenuButton,
  Segmented,
  useToast,
  withShortcut,
} from '@/ui';
import { fitView, zoomIn, zoomOut } from './Board';
import { canShift, canTurn, hasContent, isReady, pendingFigures } from './model/draft';
import { CANVAS_MAX, type Kind, PALETTE, SIZE_CHARACTER, SIZE_MINION } from './model/types';
import {
  addCanvas,
  cancelDraft,
  commit,
  mirror,
  rotate,
  selectCanvas,
  setColor,
  setMode,
  shift,
  showAll,
  stepBackDraft,
  useActive,
  useDoc,
  useDraft,
  usePrefs,
} from './store';
import { S } from './strings';

const KIND_ICONS: Record<Kind, ReactNode> = {
  line: <Slash />,
  shape: <Pentagon />,
  fill: <PaintBucket />,
  damage: <Grid2x2X />,
};

/** 畫布的切換：全員＋每一張＋新增 */
export function CanvasTabs() {
  const canvases = useDoc((s) => s.data.canvases);
  const active = useActive();
  const view = usePrefs((s) => s.data.view);
  const toast = useToast();
  const add = (size: number) => {
    if (!addCanvas(size)) toast({ title: S.canvas.full(CANVAS_MAX), tone: 'warning' });
  };
  return (
    <div className="flex min-w-0 items-center gap-2">
      {/* biome-ignore lint/a11y/useSemanticElements: 一排切換畫布的按鈕，不是表單分組 */}
      <div
        role="group"
        aria-label={S.canvas.tabsLabel}
        className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-1"
        data-testid="canvas-tabs"
      >
        <button
          type="button"
          className={buttonClass('secondary', 'sm', 'gap-1', view === 'all')}
          aria-pressed={view === 'all'}
          title={S.canvas.allHint}
          onClick={showAll}
        >
          <LayoutGrid aria-hidden className="size-3.5" />
          {S.canvas.all}
        </button>
        {canvases.map((c) => {
          const on = view === 'one' && c.id === active.id;
          return (
            <button
              key={c.id}
              type="button"
              className={buttonClass('secondary', 'sm', 'max-w-40', on)}
              aria-pressed={on}
              data-canvas-id={c.id}
              onClick={() => selectCanvas(c.id)}
            >
              <span className="truncate">{c.name || S.canvas.untitled}</span>
              {c.size !== SIZE_CHARACTER ? (
                <span className="text-[10px] text-muted tabular-nums">{c.size}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      <MenuButton
        label={<span className="sr-only sm:not-sr-only">{S.canvas.add}</span>}
        aria-label={S.canvas.add}
        icon={<Plus />}
        align="end"
        items={[
          {
            label: S.canvas.addCharacter,
            description: S.canvas.addCharacterHint,
            onSelect: () => add(SIZE_CHARACTER),
          },
          {
            label: S.canvas.addMinion,
            description: S.canvas.addMinionHint,
            onSelect: () => add(SIZE_MINION),
          },
        ]}
      />
    </div>
  );
}

/** 畫法、顏色、縮放 */
export function ModeBar() {
  const kind = usePrefs((s) => s.data.kind);
  const erase = usePrefs((s) => s.data.erase);
  const color = usePrefs((s) => s.data.color);
  const colorOff = erase || kind === 'damage';
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<'draw' | 'erase'>
          size="sm"
          aria-label={S.mode.groupLabel}
          value={erase ? 'erase' : 'draw'}
          onValueChange={(v) => setMode(kind, v === 'erase')}
          options={[
            { value: 'draw', label: S.mode.draw, icon: <Pencil /> },
            { value: 'erase', label: S.mode.erase, icon: <Trash2 /> },
          ]}
        />
        <Segmented<Kind>
          size="sm"
          className="order-3 sm:order-none"
          aria-label={S.mode.kindLabel}
          value={kind}
          onValueChange={(k) => setMode(k, erase)}
          options={(['line', 'shape', 'fill', 'damage'] as const).map((k) => ({
            value: k,
            label: S.mode.kinds[k],
            icon: KIND_ICONS[k],
          }))}
        />
        <div className="order-2 ml-auto flex gap-1 sm:order-none">
          <IconButton
            size="sm"
            label={withShortcut(S.view.zoomOut, '-')}
            icon={<ZoomOut />}
            onClick={zoomOut}
          />
          <IconButton
            size="sm"
            label={withShortcut(S.view.fit, '0')}
            icon={<Maximize />}
            onClick={fitView}
          />
          <IconButton
            size="sm"
            label={withShortcut(S.view.zoomIn, '+')}
            icon={<ZoomIn />}
            onClick={zoomIn}
          />
        </div>
      </div>
      <div
        role="radiogroup"
        aria-label={S.mode.color}
        className="flex flex-wrap items-center gap-1.5"
        data-testid="palette"
        title={S.mode.colorHint}
      >
        <span className="mr-1 text-xs text-muted">{S.mode.color}</span>
        {PALETTE.map((hex, i) => (
          // biome-ignore lint/a11y/useSemanticElements: 色塊做成按鈕外觀的單選
          <button
            key={hex}
            type="button"
            role="radio"
            aria-checked={color === i}
            aria-label={S.mode.colors[i]}
            disabled={colorOff}
            onClick={() => setColor(i)}
            className={`size-6 rounded-md border-2 transition-transform disabled:opacity-40 sm:size-7 ${
              color === i ? 'scale-110 border-fg' : 'border-border'
            }`}
            style={{ background: hex }}
          />
        ))}
      </div>
    </div>
  );
}

/** 草稿的狀態文字 */
function draftSummary(kind: Kind, d: ReturnType<typeof useDraft>): string {
  if (!d || !hasContent(d)) return S.draft.empty;
  if (kind === 'damage') return S.draft.cells(d.cells.length);
  const parts: string[] = [];
  if (kind === 'fill') {
    if (d.figures.length) parts.push(S.draft.area);
  } else if (d.figures.length) {
    const n = d.figures.reduce((a, f) => a + Math.max(0, f.pts.length - 1) + (f.closed ? 1 : 0), 0);
    parts.push(
      kind === 'line'
        ? S.draft.lines(n)
        : `${S.draft.figures(d.figures.length)}（${S.draft.lines(n)}）`,
    );
  }
  if (d.current.length) parts.push(S.draft.drawing(d.current.length));
  return parts.join('、');
}

/** 草稿：說明、狀態與按鈕 */
export function DraftBar() {
  const d = useDraft();
  const kind = usePrefs((s) => s.data.kind);
  const erase = usePrefs((s) => s.data.erase);
  const canvas = useActive();
  const toast = useToast();
  const ready = isReady(d);
  const movable = canShift(d);
  const turnable = canTurn(d);
  const any = hasContent(d);
  const empty = erase
    ? kind === 'damage'
      ? !canvas.damage.length
      : kind === 'fill'
        ? !canvas.fills.length
        : !canvas.lines.length
    : false;
  const doCommit = () => {
    const r = commit();
    if (r.kind === 'not-ready') toast({ title: S.draft.notReady[kind], tone: 'warning' });
    else if (r.kind === 'nothing-to-erase')
      toast({ title: S.draft.nothingErased, tone: 'warning' });
  };
  const doShift = (dx: number, dy: number) => {
    if (!shift(dx, dy)) toast({ title: S.draft.edge, tone: 'warning' });
  };
  const pending = d ? pendingFigures(d) : [];
  return (
    <div className="flex flex-col gap-2" data-testid="draft-bar">
      <p className="m-0 text-xs text-muted" data-testid="mode-hint">
        {empty ? S.mode.nothingToErase[kind] : S.mode.hints[erase ? 'erase' : 'draw'][kind]}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="min-w-0 text-sm tabular-nums"
          data-testid="draft-status"
          data-ready={ready ? 'true' : 'false'}
          data-figures={pending.length}
        >
          <span className="text-muted">{S.draft.label}：</span>
          {draftSummary(kind, d)}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <Button
            size="sm"
            variant="primary"
            icon={<Check />}
            disabled={!ready}
            onClick={doCommit}
            aria-keyshortcuts="Enter"
          >
            {S.draft.commit}
          </Button>
          <Button
            size="sm"
            icon={<X />}
            disabled={!any}
            onClick={() => cancelDraft()}
            aria-keyshortcuts="Escape"
          >
            {S.draft.cancel}
          </Button>
          <IconButton
            size="sm"
            label={withShortcut(S.draft.stepBack, 'backspace')}
            icon={<Delete />}
            disabled={!any}
            onClick={() => stepBackDraft()}
          />
        </div>
      </div>
      {!erase && kind !== 'fill' ? (
        // biome-ignore lint/a11y/useSemanticElements: 一排移動與反轉的按鈕，不是表單分組
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label={S.draft.move}>
          <span className="mr-1 text-xs text-muted">{S.draft.move}</span>
          <IconButton
            size="sm"
            label={S.draft.left}
            icon={<ArrowLeft />}
            disabled={!movable}
            onClick={() => doShift(-1, 0)}
          />
          <IconButton
            size="sm"
            label={S.draft.up}
            icon={<ArrowUp />}
            disabled={!movable}
            onClick={() => doShift(0, -1)}
          />
          <IconButton
            size="sm"
            label={S.draft.down}
            icon={<ArrowDown />}
            disabled={!movable}
            onClick={() => doShift(0, 1)}
          />
          <IconButton
            size="sm"
            label={S.draft.right}
            icon={<ArrowRight />}
            disabled={!movable}
            onClick={() => doShift(1, 0)}
          />
          {kind !== 'damage' ? (
            <>
              <IconButton
                size="sm"
                label={withShortcut(S.draft.mirror, 'h')}
                icon={<FlipHorizontal2 />}
                disabled={!turnable}
                onClick={() => mirror()}
              />
              <IconButton
                size="sm"
                label={withShortcut(S.draft.rotate, 'r')}
                icon={<RotateCw />}
                disabled={!turnable}
                onClick={() => rotate()}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
