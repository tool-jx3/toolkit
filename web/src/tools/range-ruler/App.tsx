import { Download, Redo2, Undo2 } from 'lucide-react';
import {
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { downloadBlob } from '@/core/files';
import { clientToCanvas, exceedsCanvasLimit } from '@/core/grid';
import { canvasToBlob } from '@/core/image';
import { resetToolStore, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  Button,
  Field,
  IconButton,
  Kbd,
  Notice,
  type NoticeTone,
  ProjectMenu,
  Segmented,
  type Shortcut,
  Stage,
  ToolShell,
  UsageSection,
  withShortcut,
} from '@/ui';
import { CellEditor } from './Editor';
import {
  hexRulerFileName,
  hexRulerHit,
  hexRulerLayout,
  type RulerCell,
  type RulerLayout,
  squareRulerFileName,
  squareRulerHit,
  squareRulerLayout,
} from './layout';
import { SettingsPanels } from './Panels';
import { drawRuler } from './render';
import { looksLikeSettings, type Settings, type Shape, sanitizeSettings } from './settings';
import { actions, TOOL_ID, useSettings } from './store';
import { S } from './strings';

interface Status {
  tone: NoticeTone;
  text: string;
}

declare global {
  interface Window {
    /** 測試與對等驗證用 */
    __rangeRuler?: unknown;
  }
}

const SHAPE_OPTIONS = (['square', 'hex'] as const).map((value) => ({
  value,
  label: S.shapes[value],
}));

/** 編輯中的醒目框（舊版：90% 不透明的青色、3 px） */
const HIGHLIGHT = 'rgba(0,229,255,0.9)';

function layoutOf(s: Settings): RulerLayout {
  return s.shape === 'square' ? squareRulerLayout(s.square) : hexRulerLayout(s.hex);
}

function fileNameOf(s: Settings): string {
  return s.shape === 'square' ? squareRulerFileName(s.square) : hexRulerFileName(s.hex);
}

/** 方向鍵在畫面上的方向 */
const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

function Usage() {
  return (
    <>
      <p>{S.usageIntro}</p>
      <ol className="mt-2">
        {S.usageSteps.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <ul className="mt-2">
        {S.usageNotes.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </>
  );
}

function Highlight({ cell, shape }: { cell: RulerCell; shape: Shape }) {
  const p = cell.polygon;
  return (
    <g fill="none" stroke={HIGHLIGHT} strokeWidth={3} data-testid="edit-highlight">
      {shape === 'square' ? (
        <rect
          x={p[0].x + 1.5}
          y={p[0].y + 1.5}
          width={p[1].x - p[0].x - 3}
          height={p[3].y - p[0].y - 3}
        />
      ) : (
        <polygon points={p.map((q) => `${q.x},${q.y}`).join(' ')} />
      )}
    </g>
  );
}

export function App() {
  const settings = useSettings((st) => st.data);
  const { undo, redo, canUndo, canRedo, clear } = useUndoRedo(useSettings);
  const savedAt = useSaveStatus(TOOL_ID);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  /* 編輯中的格子（畫面狀態，不存檔、不列入復原）；換形狀時關掉 */
  const [editingAt, setEditingAt] = useState<{ shape: Shape; key: string } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  const shape = settings.shape;
  const s = shape === 'square' ? settings.square : settings.hex;
  const layout = useMemo(() => layoutOf(settings), [settings]);
  const big = exceedsCanvasLimit(layout.width, layout.height);
  const byKey = useMemo(() => new Map(layout.cells.map((c) => [c.key, c])), [layout]);
  const editing = editingAt?.shape === shape ? (byKey.get(editingAt.key) ?? null) : null;
  const setEditingKey = (key: string | null) => setEditingAt(key ? { shape, key } : null);
  const name = fileNameOf(settings);

  useEffect(() => {
    window.__rangeRuler = { useSettings, actions };
  }, []);

  /* 預覽畫布就是匯出的畫布。每次都重設寬高：畫布清空、繪圖狀態回到預設 */
  useLayoutEffect(() => {
    const c = canvas.current;
    if (!c || big) return;
    c.width = layout.width;
    c.height = layout.height;
    const ctx = c.getContext('2d');
    if (ctx) drawRuler(ctx, layout, s, shape);
  }, [layout, s, shape, big]);

  const close = useCallback(() => setEditingAt(null), []);

  const onCanvasClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget;
    const p = clientToCanvas(e.clientX, e.clientY, c.getBoundingClientRect(), c.width, c.height);
    const data = useSettings.getState().data;
    const hit =
      data.shape === 'square'
        ? squareRulerHit(data.square, p.x, p.y)
        : hexRulerHit(data.hex, p.x, p.y);
    setEditingKey(hit?.key ?? null);
  };

  /* 方向鍵選格子：沿著畫面上的方向找下一個有畫出來的格子；Esc 關閉編輯 */
  const onCanvasKey = (e: KeyboardEvent<HTMLCanvasElement>) => {
    if (e.key === 'Escape') {
      if (editing) {
        e.preventDefault();
        close();
      }
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!editing) setEditingKey(byKey.has('0,0') ? '0,0' : null);
      return;
    }
    const dir = ARROWS[e.key];
    if (!dir) return;
    e.preventDefault();
    if (!editing) {
      setEditingKey('0,0');
      return;
    }
    /* 尖頂的六角格是平頂對調 x、y：左右改列、上下改欄 */
    const [dx, dy] =
      shape === 'hex' && settings.hex.orientation === 'pointy' ? [dir[1], dir[0]] : dir;
    let x = editing.x;
    let y = editing.y;
    for (let i = 0; i < 64; i++) {
      x += dx;
      y += dy;
      const next = byKey.get(`${x},${y}`);
      if (next) {
        setEditingKey(next.key);
        return;
      }
    }
  };

  const busyRef = useRef(false);
  const exportPng = useCallback(async () => {
    const c = canvas.current;
    const data = useSettings.getState().data;
    if (busyRef.current || !c) return;
    const lay = layoutOf(data);
    if (exceedsCanvasLimit(lay.width, lay.height)) return;
    busyRef.current = true;
    setBusy(true);
    const out = fileNameOf(data);
    setStatus({ tone: 'progress', text: S.exporting });
    try {
      downloadBlob(await canvasToBlob(c, 'image/png'), out);
      setStatus({ tone: 'success', text: S.exported(out) });
    } catch (err) {
      setStatus({
        tone: 'danger',
        text: S.exportFailed(err instanceof Error ? err.message : String(err)),
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      { keys: 'mod+z', label: S.undo, group: S.keysGroup, handler: undo },
      { keys: ['shift+mod+z', 'mod+y'], label: S.redo, group: S.keysGroup, handler: redo },
      { keys: 'escape', label: S.editorCloseKey, group: S.keysGroup, handler: close },
      {
        keys: ['d', 'shift+d'],
        label: S.exportPng,
        group: S.exportGroup,
        handler: () => void exportPng(),
      },
    ],
    [undo, redo, close, exportPng],
  );

  const headerActions = (
    <>
      <IconButton
        label={withShortcut(S.undo, 'mod+z')}
        icon={<Undo2 />}
        onClick={undo}
        disabled={!canUndo}
      />
      <IconButton
        label={withShortcut(S.redo, 'shift+mod+z')}
        icon={<Redo2 />}
        onClick={redo}
        disabled={!canRedo}
      />
      <ProjectMenu<Settings>
        toolId={TOOL_ID}
        getData={() => useSettings.getState().data}
        onLoad={(d) => {
          if (!looksLikeSettings(d)) return false;
          useSettings.getState().replace(sanitizeSettings(d));
          clear();
          close();
          return true;
        }}
        onReset={() => {
          resetToolStore(useSettings, { clearHistory: false });
          close();
        }}
        savedAt={savedAt}
        fileName={S.projectName}
        resetText={{ label: S.resetLabel, title: S.resetTitle, description: S.resetDescription }}
      />
    </>
  );

  const usage = <Usage />;

  const settingsPanel = (
    <>
      <Field label={S.shape} hint={S.shapeHint}>
        <Segmented<Shape>
          fullWidth
          value={shape}
          onValueChange={(v) => {
            actions.setShape(v);
            close();
          }}
          options={SHAPE_OPTIONS}
        />
      </Field>
      <SettingsPanels
        settings={settings}
        onClearCustoms={() => {
          actions.clearCustoms();
          close();
        }}
      />
      <UsageSection persistKey={TOOL_ID}>{usage}</UsageSection>
    </>
  );

  const preview = (
    <div className="flex flex-col gap-3">
      {big ? (
        <Notice tone="warning">
          <span data-testid="too-large">{S.tooLarge(layout.width, layout.height)}</span>
        </Notice>
      ) : (
        <Stage
          width={layout.width}
          height={layout.height}
          aria-label={S.stageLabel}
          /* 比預設矮一點，編輯面板才放得進桌面版的預覽欄 */
          maxViewportHeight="min(52dvh, 520px)"
        >
          <canvas
            ref={canvas}
            tabIndex={0}
            role="img"
            aria-label={S.canvasLabel}
            aria-describedby="range-ruler-canvas-hint"
            data-testid="ruler-canvas"
            className="block size-full cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-focus"
            onClick={onCanvasClick}
            onKeyDown={onCanvasKey}
          />
          {editing ? (
            <svg
              aria-hidden
              className="pointer-events-none absolute inset-0 size-full"
              viewBox={`0 0 ${layout.width} ${layout.height}`}
            >
              <Highlight cell={editing} shape={shape} />
            </svg>
          ) : null}
        </Stage>
      )}
      <p id="range-ruler-canvas-hint" className="m-0 text-xs text-muted">
        {S.canvasHint}
      </p>
      {editing ? (
        <CellEditor
          key={`${shape}:${editing.key}`}
          shape={shape}
          cell={editing}
          s={s}
          onClose={close}
        />
      ) : null}
      <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted tabular-nums">
        <span data-testid="canvas-size">{S.sizeInfo(layout.width, layout.height)}</span>
        <span data-testid="file-name">{S.fileInfo(name)}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          icon={<Download />}
          loading={busy}
          disabled={big}
          aria-keyshortcuts="D"
          onClick={() => void exportPng()}
        >
          {S.exportPng}
          <span aria-hidden className="hidden lg:inline-flex">
            <Kbd>D</Kbd>
          </span>
        </Button>
      </div>
      <p className="m-0 text-xs text-muted">{S.transparentNote}</p>
      {status ? (
        <Notice tone={status.tone}>
          <span data-testid="status-text">{status.text}</span>
        </Notice>
      ) : null}
    </div>
  );

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={usage}
      shortcuts={shortcuts}
      headerActions={headerActions}
      settings={settingsPanel}
      preview={preview}
    />
  );
}
