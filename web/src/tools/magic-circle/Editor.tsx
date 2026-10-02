/**
 * 編輯區：工具列（工具、復原／重做、縮放、輔助線）、工具提示與選項、編輯畫面（PanZoomViewport）、狀態列（規格 1.2～1.4）。
 */
import {
  Brush,
  Circle,
  Grid3x3,
  Hand,
  Hexagon,
  Maximize,
  MousePointer2,
  PenTool,
  Redo2,
  Slash,
  Star,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useUndoRedo } from '@/core/storage';
import {
  Button,
  IconButton,
  NumberInput,
  PanZoomViewport,
  type PanZoomViewportHandle,
  Slider,
  TextInput,
  withShortcut,
} from '@/ui';
import { bridge, copyStyle, notify, pasteStyle, setTool } from './actions';
import { cursorFor, emptyClick, finishPen, pointerDown, pointerHover } from './drawing';
import { drawEditor, type EditorOverlay, TOOL_IDS, type ToolId } from './editorDraw';
import { clamp } from './geometry';
import { RANGE } from './model';
import { projectNow, useCursor, usePrefs, useProject, useUi } from './store';
import { S } from './strings';

const TOOL_ICONS: Record<ToolId, ReactNode> = {
  select: <MousePointer2 />,
  pen: <PenTool />,
  freehand: <Brush />,
  line: <Slash />,
  circle: <Circle />,
  polygon: <Hexagon />,
  star: <Star />,
  text: <Type />,
  pan: <Hand />,
};

export const TOOL_KEYS: Record<ToolId, string> = {
  select: 'v',
  pen: 'p',
  freehand: 'b',
  line: 'l',
  circle: 'o',
  polygon: 'g',
  star: 's',
  text: 't',
  pan: 'h',
};

/** 符合畫面的邊距（螢幕 px；PanZoomViewport 的留白 46 ＋ 1） */
const FIT_MARGIN = 47;
const ZOOM_STEP = 1.18;

function Toolbar({
  zoom,
  onZoom,
  onFit,
}: {
  zoom: number;
  onZoom: (factor: number) => void;
  onFit: () => void;
}) {
  const tool = useUi((s) => s.tool);
  const showGuides = usePrefs((s) => s.data.showGuides);
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useProject);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div role="toolbar" aria-label={S.tools.label} className="flex flex-wrap items-center gap-1">
        {TOOL_IDS.map((id) => (
          <IconButton
            key={id}
            size="sm"
            variant={tool === id ? 'primary' : 'ghost'}
            pressed={tool === id}
            label={withShortcut(S.tools[id].name, TOOL_KEYS[id])}
            icon={TOOL_ICONS[id]}
            onClick={() => setTool(id)}
            data-tool={id}
          />
        ))}
      </div>
      <div className="flex items-center gap-1">
        <IconButton
          size="sm"
          variant="ghost"
          label={withShortcut(S.toolbar.undo, 'mod+z')}
          icon={<Undo2 />}
          onClick={() => {
            undo();
            notify(S.msg.undone);
          }}
          disabled={!canUndo}
        />
        <IconButton
          size="sm"
          variant="ghost"
          label={withShortcut(S.toolbar.redo, 'mod+y')}
          icon={<Redo2 />}
          onClick={() => {
            redo();
            notify(S.msg.redone);
          }}
          disabled={!canRedo}
        />
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: 一組檢視按鈕，不是表單分組 */}
      <div role="group" aria-label={S.toolbar.view} className="ml-auto flex items-center gap-1">
        <IconButton
          size="sm"
          variant="ghost"
          label={S.toolbar.zoomOut}
          icon={<ZoomOut />}
          onClick={() => onZoom(1 / ZOOM_STEP)}
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={onFit}
          title={S.toolbar.zoomFit}
          className="min-w-14 tabular-nums"
          data-testid="zoom-label"
        >
          {Math.round(zoom * 100)}%
        </Button>
        <IconButton
          size="sm"
          variant="ghost"
          label={S.toolbar.zoomIn}
          icon={<ZoomIn />}
          onClick={() => onZoom(ZOOM_STEP)}
        />
        <IconButton
          size="sm"
          variant="ghost"
          label={S.toolbar.fit}
          icon={<Maximize />}
          onClick={onFit}
        />
        <IconButton
          size="sm"
          variant="ghost"
          label={S.toolbar.guides}
          icon={<Grid3x3 />}
          pressed={showGuides}
          onClick={() =>
            usePrefs.getState().update((d) => {
              d.showGuides = !d.showGuides;
            })
          }
        />
      </div>
    </div>
  );
}

function ToolOptions({ tool }: { tool: ToolId }) {
  const prefs = usePrefs((s) => s.data);
  const clipboard = useUi((s) => s.clipboardStyle);
  const set = usePrefs.getState().update;
  if (tool === 'pen')
    return (
      <>
        <Button size="sm" onClick={() => finishPen(false)}>
          {S.toolOpt.finish}
        </Button>
        <Button size="sm" onClick={() => finishPen(true)}>
          {S.toolOpt.close}
        </Button>
        <span className="text-xs text-muted">{S.toolOpt.penNote}</span>
      </>
    );
  if (tool === 'freehand')
    return (
      <div className="flex min-w-56 items-center gap-2 text-xs text-muted">
        <span aria-hidden className="shrink-0">
          {S.toolOpt.simplify}
        </span>
        <Slider
          aria-label={S.toolOpt.simplify}
          value={prefs.freehandTolerance}
          onChange={(v) =>
            set((d) => {
              d.freehandTolerance = clamp(v, ...RANGE.freehandTolerance);
            })
          }
          min={RANGE.freehandTolerance[0]}
          max={RANGE.freehandTolerance[1]}
          step={0.1}
          className="flex-1"
        />
      </div>
    );
  if (tool === 'polygon')
    return (
      <div className="flex items-center gap-2 text-xs text-muted">
        <span aria-hidden>{S.toolOpt.polygonSides}</span>
        <NumberInput
          aria-label={S.toolOpt.polygonSides}
          size="sm"
          value={prefs.polygonSides}
          onChange={(v) =>
            set((d) => {
              d.polygonSides = Math.round(clamp(v, ...RANGE.polygonSides));
            })
          }
          min={RANGE.polygonSides[0]}
          max={RANGE.polygonSides[1]}
          step={1}
          className="w-24"
        />
      </div>
    );
  if (tool === 'star')
    return (
      <>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span aria-hidden>{S.toolOpt.starPoints}</span>
          <NumberInput
            aria-label={S.toolOpt.starPoints}
            size="sm"
            value={prefs.starPoints}
            onChange={(v) =>
              set((d) => {
                d.starPoints = Math.round(clamp(v, ...RANGE.starPoints));
              })
            }
            min={RANGE.starPoints[0]}
            max={RANGE.starPoints[1]}
            step={1}
            className="w-24"
          />
        </div>
        <div className="flex min-w-56 items-center gap-2 text-xs text-muted">
          <span aria-hidden className="shrink-0">
            {S.toolOpt.starInner}
          </span>
          <Slider
            aria-label={S.toolOpt.starInner}
            value={Math.round(prefs.starInner * 100)}
            onChange={(v) =>
              set((d) => {
                d.starInner = clamp(v / 100, ...RANGE.starInner);
              })
            }
            min={5}
            max={95}
            step={1}
            unit="%"
            className="flex-1"
          />
        </div>
      </>
    );
  if (tool === 'select')
    return (
      <>
        <Button size="sm" onClick={copyStyle}>
          {S.toolOpt.copyStyle}
        </Button>
        <Button size="sm" onClick={pasteStyle} disabled={!clipboard}>
          {S.toolOpt.pasteStyle}
        </Button>
      </>
    );
  if (tool === 'circle') return <span className="text-xs text-muted">{S.toolOpt.circleNote}</span>;
  if (tool === 'text')
    return (
      <div className="flex items-center gap-2 text-xs text-muted">
        <span aria-hidden>{S.toolOpt.fontPreset}</span>
        <TextInput
          aria-label={S.toolOpt.fontPreset}
          value={prefs.fontPreset}
          placeholder="serif"
          onChange={(e) => {
            const v = e.target.value;
            set((d) => {
              d.fontPreset = v;
            });
          }}
          className="h-8 w-40"
        />
      </div>
    );
  return null;
}

function ContextBar() {
  const tool = useUi((s) => s.tool);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-surface px-3 py-2 text-sm">
      <div className="min-w-0 flex-1 basis-64">
        <strong className="mr-2" data-testid="tool-name">
          {S.tools[tool].name}
        </strong>
        <span className="text-xs text-muted">{S.tools[tool].hint}</span>
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: 工具選項的按鈕與欄位，不是表單分組 */}
      <div role="group" aria-label={S.toolOpt.label} className="flex flex-wrap items-center gap-2">
        <ToolOptions tool={tool} />
      </div>
    </div>
  );
}

function StatusLine() {
  const status = useUi((s) => s.status);
  const cursor = useCursor();
  const elements = useProject((s) => s.data.elements);
  const { selected, primary } = useUi(
    useShallow((s) => ({ selected: s.selected, primary: s.primary })),
  );
  const key = elements.find((el) => el.id === primary) ?? null;
  const count = selected.filter((id) => elements.some((el) => el.id === id)).length;
  const sel =
    count > 1
      ? S.status.multi(count, key?.name ?? '—')
      : key
        ? key.type === 'path'
          ? S.status.path(key.name, key.points.length)
          : key.type === 'circle'
            ? S.status.circle(key.name)
            : S.status.text(key.name)
        : S.status.none;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted">
      <span
        role="status"
        aria-label={S.status.label}
        className="min-w-0 flex-1 basis-48"
        data-testid="status-message"
      >
        {status}
      </span>
      <span className="tabular-nums" data-testid="cursor-position">
        {S.status.cursor(Math.round(cursor.x), Math.round(cursor.y))}
      </span>
      <span data-testid="selection-status">{sel}</span>
    </div>
  );
}

/** 編輯畫面本體（作品、時間、選取有變時重畫） */
const Viewport = memo(function Viewport({
  time,
  vpRef,
  zoom,
  onZoomChange,
}: {
  time: number;
  vpRef: React.RefObject<PanZoomViewportHandle | null>;
  zoom: number;
  onZoomChange: (z: number) => void;
}) {
  const project = useProject((s) => s.data);
  const ui = useUi(
    useShallow((s) => ({
      tool: s.tool,
      selected: s.selected,
      primary: s.primary,
      node: s.node,
      draft: s.draft,
      snap: s.snap,
    })),
  );
  const showGuides = usePrefs((s) => s.data.showGuides);
  const overlay: EditorOverlay = useMemo(() => {
    const set = new Set(ui.selected);
    return {
      tool: ui.tool,
      showGuides,
      selected: project.elements.filter((el) => set.has(el.id)),
      primary: project.elements.find((el) => el.id === ui.primary) ?? null,
      node: ui.node,
      draft: ui.draft,
      snap: ui.snap,
    };
  }, [project.elements, ui, showGuides]);
  const { width, height } = project.document;
  const scale = () => vpRef.current?.getView().scale ?? zoom;
  const empty = !project.elements.length && !ui.draft;
  return (
    <div className="relative">
      <PanZoomViewport
        ref={vpRef}
        aria-label={S.canvas.label}
        world={{ x: 0, y: 0, width, height }}
        baseScale={1}
        zoom={zoom}
        onZoomChange={onZoomChange}
        minZoom={RANGE.zoom[0]}
        maxZoom={RANGE.zoom[1]}
        wheelStep={Math.exp(0.15)}
        padding={46}
        background="var(--surface-2)"
        draw={(ctx, view) =>
          drawEditor(
            ctx,
            {
              origin: view.toScreen(0, 0),
              zoom: view.scale,
              dpr: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
            },
            project,
            time,
            overlay,
          )
        }
        onPointerDown={(p) => pointerDown(p, scale())}
        onEmptyClick={emptyClick}
        onHover={(p) => pointerHover(p, scale())}
        getCursor={() => cursorFor(ui.tool)}
        className="h-[min(58dvh,560px)] min-h-72 lg:h-[min(calc(100dvh-23rem),760px)]"
      />
      {empty ? (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center p-4"
          data-testid="empty-hint"
        >
          <div className="max-w-xs rounded-lg border border-border bg-surface/90 px-4 py-3 text-center shadow-1">
            <p className="m-0 text-sm font-medium">{S.canvas.emptyTitle}</p>
            <p className="m-0 mt-1 text-xs text-muted">{S.canvas.emptyHint}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
});

export function Editor({ time }: { time: number }) {
  const vp = useRef<PanZoomViewportHandle | null>(null);
  const [zoom, setZoom] = useState(0.72);

  const fitView = useCallback(() => {
    const v = vp.current?.getView();
    if (!v || v.width <= 0 || v.height <= 0) return false;
    const { width, height } = projectNow().document;
    const z = clamp(
      Math.min((v.width - FIT_MARGIN * 2) / width, (v.height - FIT_MARGIN * 2) / height),
      RANGE.zoom[0],
      RANGE.zoom[1],
    );
    vp.current?.zoomTo(z);
    return true;
  }, []);

  /* 開頁時符合畫面（等盤面量到大小） */
  useEffect(() => {
    let raf = 0;
    let tries = 0;
    const tick = () => {
      if (fitView() || ++tries > 120) return;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    bridge.fit = () => {
      requestAnimationFrame(() => fitView());
    };
    bridge.toClient = (x, y) => {
      const v = vp.current?.getView();
      const canvas = vp.current?.element()?.querySelector('canvas');
      if (!v || !canvas) return null;
      const r = canvas.getBoundingClientRect();
      const s = v.toScreen(x, y);
      return { x: r.left + s.x, y: r.top + s.y, zoom: v.scale };
    };
    return () => {
      cancelAnimationFrame(raf);
      bridge.fit = () => {};
      bridge.toClient = () => null;
    };
  }, [fitView]);

  return (
    <div className="flex min-w-0 flex-col gap-2" data-mc-editor>
      <Toolbar
        zoom={zoom}
        onZoom={(f) => vp.current?.zoomBy(f)}
        onFit={() => {
          fitView();
        }}
      />
      <ContextBar />
      <Viewport time={time} vpRef={vp} zoom={zoom} onZoomChange={setZoom} />
      <StatusLine />
    </div>
  );
}
