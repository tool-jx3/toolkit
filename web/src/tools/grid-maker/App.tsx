import { Download, Redo2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { downloadBlob } from '@/core/files';
import { exceedsCanvasLimit, hexSheet, hexSheetCcfoliaCells } from '@/core/grid';
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
import { HexPanel, SquarePanel } from './Panels';
import { drawHexGrid, drawSquareGrid } from './render';
import {
  canvasSize,
  drawableHex,
  fileName,
  looksLikeSettings,
  type Settings,
  type Shape,
  sanitizeSettings,
} from './settings';
import { actions, TOOL_ID, useSettings } from './store';
import { S } from './strings';

interface Status {
  tone: NoticeTone;
  text: string;
}

declare global {
  interface Window {
    /** 測試與對等驗證用 */
    __gridMaker?: unknown;
  }
}

const SHAPE_OPTIONS = (['square', 'hex'] as const).map((value) => ({
  value,
  label: S.shapes[value],
}));

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

export function App() {
  const s = useSettings((st) => st.data);
  const { undo, redo, canUndo, canRedo, clear } = useUndoRedo(useSettings);
  const savedAt = useSaveStatus(TOOL_ID);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);

  const size = useMemo(() => canvasSize(s), [s]);
  const big = exceedsCanvasLimit(size.width, size.height);
  const name = fileName(s);
  const ccfolia =
    s.shape === 'hex' && s.hex.fit ? hexSheetCcfoliaCells(hexSheet(drawableHex(s.hex))) : null;

  useEffect(() => {
    window.__gridMaker = { useSettings };
  }, []);

  /* 預覽畫布就是匯出的畫布（和舊版一樣直接存這張）。每次都重設寬高：畫布清空、繪圖狀態回到預設 */
  useLayoutEffect(() => {
    const c = canvas.current;
    if (!c || big) return;
    c.width = size.width;
    c.height = size.height;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    if (s.shape === 'square') drawSquareGrid(ctx, s.square);
    else drawHexGrid(ctx, s.hex);
  }, [s, size, big]);

  const busyRef = useRef(false);
  const exportPng = useCallback(async () => {
    const c = canvas.current;
    const data = useSettings.getState().data;
    if (busyRef.current || !c) return;
    const { width, height } = canvasSize(data);
    if (exceedsCanvasLimit(width, height)) return;
    busyRef.current = true;
    setBusy(true);
    const out = fileName(data);
    setStatus({ tone: 'progress', text: S.exporting });
    try {
      downloadBlob(await canvasToBlob(c, 'image/png'), out);
      setStatus({ tone: 'success', text: S.exported(out) });
    } catch (e) {
      setStatus({
        tone: 'danger',
        text: S.exportFailed(e instanceof Error ? e.message : String(e)),
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
      {
        keys: ['d', 'shift+d'],
        label: S.exportPng,
        group: S.exportGroup,
        handler: () => void exportPng(),
      },
    ],
    [undo, redo, exportPng],
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
          return true;
        }}
        onReset={() => resetToolStore(useSettings)}
        savedAt={savedAt}
        fileName={S.projectName}
        resetText={{ label: S.resetLabel, title: S.resetTitle, description: S.resetDescription }}
      />
    </>
  );

  const usage = <Usage />;

  const settings = (
    <>
      <Field label={S.shape} hint={S.shapeHint}>
        <Segmented<Shape>
          fullWidth
          value={s.shape}
          onValueChange={actions.setShape}
          options={SHAPE_OPTIONS}
        />
      </Field>
      {s.shape === 'square' ? <SquarePanel s={s.square} /> : <HexPanel s={s.hex} />}
      <UsageSection persistKey={TOOL_ID}>{usage}</UsageSection>
    </>
  );

  const preview = (
    <div className="flex flex-col gap-3">
      {big ? (
        <Notice tone="warning">
          <span data-testid="too-large">{S.tooLarge(size.width, size.height)}</span>
        </Notice>
      ) : (
        <Stage width={size.width} height={size.height} aria-label={S.stageLabel}>
          <canvas ref={canvas} className="block size-full" data-testid="grid-canvas" />
        </Stage>
      )}
      <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted tabular-nums">
        <span data-testid="canvas-size">{S.sizeInfo(size.width, size.height)}</span>
        <span data-testid="file-name">{S.fileInfo(name)}</span>
        {ccfolia ? (
          <span data-testid="ccfolia-size" title={S.ccfoliaInfoHint}>
            {S.ccfoliaInfo(ccfolia.cols, ccfolia.rows)}
          </span>
        ) : null}
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
      settings={settings}
      preview={preview}
    />
  );
}
