/**
 * 預覽欄：工具列（暫停、錨點編輯、背景、儲存 PNG、錄影、FPS）、WebGL 畫布（Stage：縮放、平移）、錨點與圖層範圍的疊加層、
 * 讀入畫面、讀入進度、攝影機小畫面、狀態訊息。
 */
import { Anchor, Circle, Download, FileUp, Pause, Play, Square, X } from 'lucide-react';
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import {
  Button,
  Dialog,
  DialogClose,
  IconButton,
  Notice,
  ProgressBar,
  Segmented,
  Stage,
  type StagePan,
  type StageZoom,
  useStageScale,
  withShortcut,
} from '@/ui';
import {
  cancelLoad,
  canRecord,
  nudgeAnchor,
  pickPsd,
  savePng,
  setAnchorOffset,
  setBackground,
  setCamPreviewCanvas,
  stopRecording,
  toggleAnchorMode,
  togglePause,
  toggleRecording,
} from './actions';
import { getEngine, RigEngine, setEngine } from './engine';
import {
  ANCHOR_KEYS,
  type AnchorKey,
  BACKGROUND_COLORS,
  BACKGROUNDS,
  type BackgroundId,
} from './params';
import { setPrefs, setStatus, useEdit, usePrefs, useSession } from './store';
import { S } from './strings';
import { Usage } from './Usage';

/* ---------- 縮放與平移 ---------- */

export const useView = create<{ zoom: StageZoom; pan: StagePan }>(() => ({
  zoom: 'fit',
  pan: { x: 0, y: 0 },
}));

/** 回到全圖（F、按兩下；規格 F88） */
export function fitView(): void {
  useView.setState({ zoom: 'fit', pan: { x: 0, y: 0 } });
}

/** 滾輪每格的倍率：同原作每 100 px ×e^0.15 */
const WHEEL: readonly [number, number] = [Math.exp(0.15), Math.exp(-0.15)];

/* ---------- 錨點 ---------- */

interface Handle {
  key: AnchorKey;
  label: string;
  x: number;
  y: number;
  kind: 'normal' | 'close' | 'chest';
  place: 'right' | 'left' | 'above';
  guide?: [number, number];
}

function anchorHandles(): Handle[] {
  const pose = getEngine()?.anchors();
  const model = useSession.getState().model;
  if (!pose || !model) return [];
  const { A, NP, CHEST, FS } = pose;
  const out: Handle[] = [
    {
      key: 'face',
      label: S.anchorNames.face,
      x: A.face.cx,
      y: A.face.cy,
      kind: 'normal',
      place: 'right',
    },
  ];
  for (const s of ['L', 'R'] as const) {
    const e = s === 'L' ? A.eyeL : A.eyeR;
    if (!e) continue;
    out.push({
      key: s === 'L' ? 'eyeL' : 'eyeR',
      label: s === 'L' ? S.anchorNames.eyeL : S.anchorNames.eyeR,
      x: e.icx,
      y: e.icy,
      kind: 'normal',
      place: 'above',
    });
    out.push({
      key: s === 'L' ? 'eyeLClose' : 'eyeRClose',
      label: s === 'L' ? S.anchorNames.eyeLClose : S.anchorNames.eyeRClose,
      x: s === 'L' ? e.x0 - 4 : e.x1 + 4,
      y: e.closeY,
      kind: 'close',
      place: s === 'L' ? 'left' : 'right',
      guide: [e.x0, e.x1],
    });
  }
  out.push({
    key: 'mouth',
    label: S.anchorNames.mouth,
    x: A.mouth.cx,
    y: A.mouth.cy,
    kind: 'normal',
    place: 'right',
  });
  out.push({
    key: 'neck',
    label: S.anchorNames.neck,
    x: NP.cx,
    y: NP.cy,
    kind: 'normal',
    place: 'right',
  });
  if (model.hasTopwear) {
    const bustY = useEdit.getState().data.params.bustY;
    out.push({
      key: 'chest',
      label: S.anchorNames.chest,
      x: CHEST.cx,
      y: CHEST.cy + bustY * 70 * FS,
      kind: 'chest',
      place: 'right',
    });
  }
  return out;
}

const HANDLE_COLOR: Record<Handle['kind'], string> = {
  normal: 'var(--accent)',
  close: '#4aa3ff',
  chest: '#b57cff',
};

function Overlay({ width, height }: { width: number; height: number }) {
  const scale = useStageScale();
  const anchorMode = useSession((s) => s.anchorMode);
  const highlight = useSession((s) => s.highlight);
  const model = useSession((s) => s.model);
  /* 錨點位移、胸部位置改了要重畫 */
  useEdit((s) => s.data.anchors);
  useEdit((s) => s.data.params.bustY);
  const [dragging, setDragging] = useState<AnchorKey | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const u = 1 / scale;
  const box = highlight ? model?.layers.find((l) => l.id === highlight) : null;
  const handles = anchorMode ? anchorHandles() : [];

  const toPsd = (clientX: number, clientY: number) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r?.width) return { x: 0, y: 0 };
    return {
      x: ((clientX - r.left) / r.width) * width,
      y: ((clientY - r.top) / r.height) * height,
    };
  };

  const startDrag = (e: ReactPointerEvent<SVGGElement>, h: Handle) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const id = e.pointerId;
    const target = e.currentTarget;
    target.setPointerCapture?.(id);
    target.focus({ preventScroll: true });
    const start = toPsd(e.clientX, e.clientY);
    const base = { dx: 0, dy: 0, ...useEdit.getState().data.anchors[h.key] };
    const axes = ANCHOR_KEYS[h.key] as readonly string[];
    const engine = getEngine();
    if (engine && h.kind === 'close') engine.closeEye = h.key === 'eyeLClose' ? 'L' : 'R';
    useEdit.beginGesture();
    setDragging(h.key);
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      const p = toPsd(ev.clientX, ev.clientY);
      const o: { dx?: number; dy?: number } = {};
      if (axes.includes('dx')) o.dx = Math.round(base.dx + p.x - start.x);
      if (axes.includes('dy')) o.dy = Math.round(base.dy + p.y - start.y);
      setAnchorOffset(h.key, o);
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (engine) engine.closeEye = null;
      useEdit.endGesture();
      setDragging(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const onKey = (e: React.KeyboardEvent<SVGGElement>, h: Handle) => {
    const step = e.shiftKey ? 10 : 1;
    const d: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const v = d[e.key];
    if (!v) return;
    e.preventDefault();
    e.stopPropagation();
    nudgeAnchor(h.key, v[0], v[1]);
  };

  return (
    <svg
      ref={svg}
      className="pointer-events-none absolute inset-0 size-full overflow-visible"
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden={!anchorMode}
      data-testid="rig-overlay"
    >
      <title>{S.overlayTitle}</title>
      {box ? (
        <rect
          x={box.x}
          y={box.y}
          width={box.w}
          height={box.h}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1.5 * u}
          data-testid="layer-box"
        />
      ) : null}
      {handles.map((h) => (
        <g key={h.key}>
          {h.guide ? (
            <line
              x1={h.guide[0]}
              x2={h.guide[1]}
              y1={h.y}
              y2={h.y}
              stroke={HANDLE_COLOR.close}
              strokeWidth={u}
              strokeDasharray={`${4 * u} ${4 * u}`}
            />
          ) : null}
          {/* biome-ignore lint/a11y/useSemanticElements: SVG 裡的圓點沒有對應的 HTML 元素 */}
          <g
            role="button"
            tabIndex={0}
            aria-label={S.anchorHandle(h.label)}
            data-anchor={h.key}
            data-shortcuts="pass"
            className="pointer-events-auto cursor-grab outline-none focus-visible:[&>circle]:stroke-[var(--focus)]"
            onPointerDown={(e) => startDrag(e, h)}
            onKeyDown={(e) => onKey(e, h)}
          >
            <circle
              cx={h.x}
              cy={h.y}
              r={7 * u}
              fill={dragging === h.key ? HANDLE_COLOR[h.kind] : 'rgba(0,0,0,0.45)'}
              stroke={HANDLE_COLOR[h.kind]}
              strokeWidth={2 * u}
            />
            <text
              x={h.place === 'left' ? h.x - 11 * u : h.place === 'above' ? h.x : h.x + 11 * u}
              y={h.place === 'above' ? h.y - 12 * u : h.y + 4 * u}
              fontSize={12 * u}
              textAnchor={h.place === 'left' ? 'end' : h.place === 'above' ? 'middle' : 'start'}
              fill="#fff"
              stroke="rgba(0,0,0,0.7)"
              strokeWidth={3 * u}
              paintOrder="stroke"
            >
              {h.label}
            </text>
          </g>
        </g>
      ))}
    </svg>
  );
}

/* ---------- 工具列 ---------- */

function BackgroundPicker({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const bg = useEdit((s) => s.data.background);
  const hasModel = useSession((s) => !!s.model);
  return (
    <Segmented<BackgroundId>
      aria-label={S.backgroundLabel}
      size={size}
      value={bg}
      onValueChange={(v) => setBackground(v)}
      options={BACKGROUNDS.map((b) => ({ value: b, label: S.backgrounds[b], disabled: !hasModel }))}
    />
  );
}

export { BackgroundPicker };

function Toolbar() {
  const hasModel = useSession((s) => !!s.model);
  const modelName = useSession((s) => s.model?.name ?? null);
  const paused = useSession((s) => s.paused);
  const anchorMode = useSession((s) => s.anchorMode);
  const recording = useSession((s) => s.recording);
  const pngBusy = useSession((s) => s.pngBusy);
  const fps = useSession((s) => s.fps);
  const recordable = canRecord();
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="預覽的操作">
      <Button
        size="sm"
        variant="secondary"
        icon={paused ? <Play /> : <Pause />}
        aria-pressed={paused}
        disabled={!hasModel}
        onClick={togglePause}
        title={withShortcut(paused ? S.play : S.pause, 'space')}
      >
        {paused ? S.play : S.pause}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        icon={<Anchor />}
        aria-pressed={anchorMode}
        disabled={!hasModel}
        onClick={toggleAnchorMode}
        title={withShortcut(S.anchorEdit, 'e')}
      >
        {S.anchorEdit}
      </Button>
      <BackgroundPicker />
      <Button
        size="sm"
        variant="secondary"
        icon={<Download />}
        disabled={!hasModel || pngBusy}
        onClick={() => void savePng()}
      >
        {S.savePng}
      </Button>
      <Button
        size="sm"
        variant={recording ? 'danger' : 'secondary'}
        icon={recording ? <Square /> : <Circle />}
        disabled={!hasModel || !recordable}
        onClick={toggleRecording}
        data-testid="record-button"
      >
        {recording ? S.recordStop : S.record}
      </Button>
      {recording ? (
        <span
          className="rounded-md bg-danger px-2 py-1 text-xs font-bold text-danger-contrast tabular-nums"
          data-testid="rec-badge"
          role="status"
        >
          {S.recBadge(recording.t, recording.total)}
        </span>
      ) : null}
      <span className="ml-auto flex min-w-0 items-center gap-2 text-xs text-muted">
        <span className="truncate" title={modelName ?? undefined} data-testid="model-name">
          {modelName ? S.modelLabel(modelName) : S.noModel}
        </span>
        {hasModel ? (
          <span className="shrink-0 tabular-nums" aria-hidden data-testid="fps">
            {S.fps(fps)}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/* ---------- 讀入畫面、進度、訊息 ---------- */

function EmptyState({ onHelp, error }: { onHelp: () => void; error: string | null }) {
  return (
    <div
      className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-surface px-4 py-8 text-center"
      data-testid="drop-empty"
    >
      <FileUp aria-hidden className="size-10 text-accent" />
      <h2 className="m-0 text-xl font-semibold text-fg">{S.dropTitle}</h2>
      <p className="m-0 max-w-md text-sm text-fg">{S.dropLead}</p>
      <p className="m-0 max-w-md text-xs text-muted">{S.dropHint}</p>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="primary" onClick={() => void pickPsd()} disabled={!!error}>
          {S.dropPick}
        </Button>
        <Button variant="secondary" onClick={onHelp}>
          {S.dropHelp}
        </Button>
      </div>
    </div>
  );
}

function LoadingBar() {
  const loading = useSession((s) => s.loading);
  if (loading === null) return null;
  return (
    <Notice
      tone="progress"
      action={
        <Button size="sm" variant="secondary" onClick={cancelLoad}>
          {S.cancelLoad}
        </Button>
      }
    >
      <span className="flex flex-col gap-1.5" data-testid="load-progress">
        <span>{loading}</span>
        <ProgressBar value={null} label={loading} />
      </span>
    </Notice>
  );
}

function StatusLine() {
  const status = useSession((s) => s.status);
  const [hidden, setHidden] = useState<number | null>(null);
  useEffect(() => {
    if (!status || status.tone === 'danger') return;
    const id = status.id;
    const t = setTimeout(() => setHidden(id), 6000);
    return () => clearTimeout(t);
  }, [status]);
  if (!status) return null;
  const faded = hidden === status.id;
  return (
    <p
      role={status.tone === 'danger' ? 'alert' : 'status'}
      data-testid="status-text"
      data-tone={status.tone}
      className={`m-0 min-h-5 text-sm transition-opacity duration-500 ${
        faded ? 'opacity-0' : 'opacity-100'
      } ${status.tone === 'danger' ? 'text-danger' : status.tone === 'warning' ? 'text-warning' : 'text-muted'}`}
    >
      {status.text}
    </p>
  );
}

function CamPreview() {
  const show = usePrefs((s) => s.data.camPreview);
  const cam = useSession((s) => s.cam);
  const visible = show && cam === 'on';
  return (
    <div
      className={`absolute top-12 left-2 z-10 overflow-hidden rounded-md border border-border bg-black shadow-2 ${
        visible ? '' : 'hidden'
      }`}
      data-testid="cam-preview"
    >
      <canvas
        ref={setCamPreviewCanvas}
        width={192}
        height={144}
        aria-label={S.camPreviewLabel}
        className="block h-24 w-32 sm:h-36 sm:w-48"
      />
      <IconButton
        label={S.camPreviewHide}
        icon={<X />}
        size="sm"
        variant="ghost"
        className="absolute top-1 right-1 bg-black/60 text-white"
        onClick={() => setPrefs({ camPreview: false })}
      />
    </div>
  );
}

/* ---------- 預覽欄 ---------- */

export function PreviewColumn() {
  const [helpOpen, setHelpOpen] = useState(false);
  const model = useSession((s) => s.model);
  const anchorMode = useSession((s) => s.anchorMode);
  const bg = useEdit((s) => s.data.background);
  const zoom = useView((s) => s.zoom);
  const pan = useView((s) => s.pan);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [glError, setGlError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let engine: RigEngine;
    try {
      engine = new RigEngine(canvas);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setGlError(msg);
      setStatus(msg, 'danger');
      return;
    }
    setEngine(engine);
    const off = engine.onContextLost(() => stopRecording(true));
    return () => {
      off();
      engine.destroy();
      setEngine(null);
    };
  }, []);

  const W = model?.width ?? 512;
  const H = model?.height ?? 512;
  const background =
    bg === 'checker'
      ? ({ kind: 'checker' } as const)
      : ({ kind: 'color', color: BACKGROUND_COLORS[bg] } as const);

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const engine = getEngine();
    if (!engine) return;
    const r = e.currentTarget.getBoundingClientRect();
    const clamp = (v: number) => Math.max(-1.5, Math.min(1.5, v));
    engine.mouse = {
      x: clamp(((e.clientX - r.left) / r.width) * 2 - 1),
      y: clamp(((e.clientY - r.top) / r.height) * 2 - 1),
    };
  };

  return (
    <div className="flex flex-col gap-2">
      <Toolbar />
      <LoadingBar />
      {!model ? <EmptyState onHelp={() => setHelpOpen(true)} error={glError} /> : null}
      <Dialog
        open={helpOpen}
        onOpenChange={setHelpOpen}
        title={S.helpTitle}
        footer={<DialogClose />}
      >
        <div className="text-sm leading-relaxed [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
          <Usage />
        </div>
      </Dialog>
      <div className={model ? 'relative' : 'hidden'}>
        <Stage
          width={W}
          height={H}
          background={background}
          backgrounds={[]}
          zoom={zoom}
          onZoomChange={(z) => useView.setState({ zoom: z })}
          pan={pan}
          onPanChange={(p) => useView.setState({ pan: p })}
          wheelZoom="plain"
          wheelFactors={WHEEL}
          zoomBase="fit"
          zoomRange={[0.5, 16]}
          fitUpscale
          dragPan
          aria-label={S.previewLabel}
          maxViewportHeight="calc(100dvh - 14rem)"
        >
          {/* biome-ignore lint/a11y/noStaticElementInteractions: 按兩下回到全圖（鍵盤用 F） */}
          <div className="relative size-full" onDoubleClick={fitView} data-testid="stage-content">
            <canvas
              ref={canvasRef}
              className="block size-full"
              data-testid="rig-canvas"
              aria-label={S.previewLabel}
              onMouseMove={onMouseMove}
              onMouseLeave={() => {
                const engine = getEngine();
                if (engine) engine.mouse = null;
              }}
            />
            {model ? <Overlay width={W} height={H} /> : null}
          </div>
        </Stage>
        <CamPreview />
        <p className="pointer-events-none absolute bottom-2 left-2 m-0 rounded-sm bg-black/50 px-1.5 py-0.5 text-xs text-white">
          {S.checkerNote}
        </p>
      </div>
      {anchorMode ? (
        <p className="m-0 text-xs text-muted" data-testid="anchor-hint">
          {S.anchorHint}
        </p>
      ) : null}
      <StatusLine />
    </div>
  );
}
