/**
 * 預覽欄：載入（拖放、選檔、貼上、範例圖）、圖片清單、預覽舞台（結果／原圖／遮罩、筆刷、取色）、AI 去背、匯出。
 */
import {
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  RotateCcw,
  Sparkles,
  WandSparkles,
  X,
} from 'lucide-react';
import {
  type PointerEvent as ReactPointerEvent,
  type Ref,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { create } from 'zustand';
import { applyMask, type BrushRect, maskToRgba } from '@/core/image';
import { clientToLocal } from '@/core/layout';
import {
  Button,
  ColorField,
  CopyDiagnostics,
  type ExportContext,
  ExportPanel,
  type ExportPanelHandle,
  Field,
  FileDrop,
  IconButton,
  type ModelCache,
  Notice,
  type NoticeTone,
  Segmented,
  Slider,
  Stage,
  type StagePan,
  ThumbnailList,
  Toggle,
  useWebpSupport,
} from '@/ui';
import { addFiles, finishPick, go, removeImage, selectImage, setStageBackground } from './actions';
import { demoFiles } from './demo';
import {
  cancelAi,
  detailsFor,
  exportImages,
  pixels,
  previewSource,
  runAi,
  sampleSource,
  strokeActive,
  strokeEnd,
  strokeMove,
  strokeStart,
  useWork,
} from './engine';
import {
  effectiveBackground,
  type OutBackground,
  type OutContent,
  type OutFormat,
  type OutScope,
  RANGE,
  type ViewMode,
} from './model';
import type { PreviewImage, PreviewJob } from './pixels';
import { assets, edit, setPreview, settingsNow, step, usePreview, useSettings } from './store';
import { S } from './strings';
import { thumbUrl } from './thumbs';

/* ---------- 狀態列 ---------- */

export interface Note {
  tone: NoticeTone;
  text: string;
  /** 出錯時「複製錯誤資訊」的內容（有才顯示按鈕） */
  details?: string;
}

export const useNote = create<{ note: Note | null }>(() => ({ note: null }));
export const setNote = (note: Note | null) => useNote.setState({ note });

/** 正在加圖（檢查檔頭、量尺寸；Worker 還沒交回第一張之前預覽也要顯示「讀取中…」，F43） */
export const useAdding = create<{ adding: boolean }>(() => ({ adding: false }));

function StatusLine() {
  const note = useNote((st) => st.note);
  if (!note) return null;
  return (
    <Notice
      tone={note.tone}
      action={note.details ? <CopyDiagnostics text={note.details} /> : undefined}
    >
      <span data-testid="status-text">{note.text}</span>
    </Notice>
  );
}

/* ---------- 載入 ---------- */

/**
 * 加圖並回報；AI 模式、模型已下載時自動去背新加的圖。
 * model：AI 去背時發現模型不見了或驗證不符，要讓下載區重新檢查（回到「要先下載」）。
 */
export async function addAndReport(files: readonly File[], model: ModelCache | null) {
  if (!files.length) return;
  const autoAi = model?.state.status === 'ready';
  useAdding.setState({ adding: true });
  let r: Awaited<ReturnType<typeof addFiles>>;
  try {
    r = await addFiles(files, (i, n) => {
      if (n > 1) setNote({ tone: 'progress', text: S.adding(i + 1, n) });
    });
  } finally {
    useAdding.setState({ adding: false });
  }
  /* 讀不進來的檔案：附上「複製錯誤資訊」（哪一步失敗、瀏覽器回報的錯誤） */
  const withDetails = async (note: Note) =>
    setNote(
      r.problems.length ? { ...note, details: await detailsFor(note.text, r.problems) } : note,
    );
  if (!r.added.length) {
    await withDetails({
      tone: 'danger',
      text: r.tooLarge.length
        ? S.tooLarge(r.tooLarge[0])
        : r.failed.length
          ? S.readFailed(r.failed)
          : S.typeError,
    });
    return;
  }
  const extra = [
    r.rejected ? S.skipped(r.rejected) : '',
    r.failed.length ? S.readFailed(r.failed) : '',
    r.tooLarge.length ? S.tooLarge(r.tooLarge[0]) : '',
    r.notStored ? S.storageWarn : '',
  ]
    .filter(Boolean)
    .join(' ');
  await withDetails({
    tone: extra ? 'warning' : 'success',
    text: `${S.loaded(r.added.length)}${extra ? ` ${extra}` : ''}`,
  });
  if (autoAi && settingsNow().mode === 'ai') await runAiAndReport(r.added, model);
}

/** AI 去背並把結果寫到狀態列 */
export async function runAiAndReport(
  items: Parameters<typeof runAi>[0],
  model: ModelCache | null,
  force = false,
): Promise<void> {
  const r = await runAi(items, force);
  if (r.error) {
    const text = S.aiFailed(r.error);
    setNote({ tone: 'danger', text });
    if (r.problem) {
      const details = await detailsFor(text, [r.problem]);
      /* 整理的期間狀態列沒換成別的訊息才補上 */
      if (useNote.getState().note?.text === text) setNote({ tone: 'danger', text, details });
    }
    if (r.modelGone) void model?.refresh();
  } else if (r.cancelled) setNote({ tone: 'info', text: S.aiCancelled });
  else if (r.done) setNote({ tone: 'success', text: S.aiDone(r.done) });
}

function LoadArea({ model }: { model: ModelCache }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <FileDrop
        multiple
        compact
        /* 右側一欄較窄：改成直式（圖示、說明、按鈕上下排） */
        className="xl:flex-col xl:items-center xl:gap-2 xl:py-4 xl:text-center"
        accept="image/*"
        filterByAccept={false}
        icon={<ImagePlus />}
        label={S.dropLabel}
        buttonLabel={S.dropButton}
        hint={S.dropHint}
        onFiles={(files) => void addAndReport(files, model)}
      />
      <Button
        size="sm"
        variant="ghost"
        icon={<WandSparkles />}
        loading={busy}
        className="self-start"
        onClick={async () => {
          setBusy(true);
          try {
            await addAndReport(await demoFiles(S.demoNames), model);
          } finally {
            setBusy(false);
          }
        }}
      >
        {S.demo}
      </Button>
    </div>
  );
}

/* ---------- 清單 ---------- */

/** 清單的縮圖網址（在 Worker 裡做的小圖；做好一張就換上一張） */
function useThumbUrls(ids: readonly string[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = ids.join('|');
  // biome-ignore lint/correctness/useExhaustiveDependencies: key 就是 ids
  useEffect(() => {
    let alive = true;
    for (const id of new Set(ids)) {
      void thumbUrl(id).then((u) => {
        if (alive && u) setUrls((prev) => (prev[id] === u ? prev : { ...prev, [id]: u }));
      });
    }
    return () => {
      alive = false;
    };
  }, [key]);
  return urls;
}

/** 素材庫裡一張圖的網址（id 是 null 或找不到時 null） */
function useAssetUrl(id: string | null): string | null {
  const [url, setUrl] = useState<{ id: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    void assets.url(id).then((u) => {
      if (alive) setUrl({ id, url: u ?? null });
    });
    return () => {
      alive = false;
    };
  }, [id]);
  return id && url?.id === id ? url.url : null;
}

function ImageList() {
  const images = useSettings((st) => st.data.images);
  const mode = useSettings((st) => st.data.mode);
  const current = usePreview((st) => st.data.current);
  const masks = usePreview((st) => st.data.aiMasks);
  const running = useWork((st) => !!st.ai);
  const urls = useThumbUrls(images.map((it) => it.asset));
  const selected = images.find((it) => it.id === current)?.id ?? images[0]?.id ?? null;
  if (!images.length) return null;
  return (
    <ThumbnailList
      aria-label={S.listLabel}
      empty={S.listEmpty}
      minItemWidth={96}
      selectedId={selected}
      onSelect={selectImage}
      onRemove={(id) => {
        const it = images.find((x) => x.id === id);
        removeImage(id);
        if (it) setNote({ tone: 'info', text: S.removed(it.name) });
      }}
      removeDisabled={running}
      removeLabel={(it) => S.remove(it.name)}
      items={images.map((it) => ({
        id: it.id,
        name: it.name,
        image: urls[it.asset] ?? null,
        meta: S.sizeMeta(it.width, it.height),
        status: mode === 'ai' && masks[it.asset] ? ('done' as const) : undefined,
        statusLabel: S.statusDone,
      }))}
    />
  );
}

function Navigator() {
  const images = useSettings((st) => st.data.images);
  const current = usePreview((st) => st.data.current);
  const n = images.length;
  const i = Math.max(
    0,
    images.findIndex((it) => it.id === current),
  );
  const item = images[i];
  if (!n) return null;
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <IconButton
        label={S.prev}
        icon={<ChevronLeft />}
        variant="secondary"
        aria-keyshortcuts="A"
        disabled={i <= 0}
        onClick={() => go(-1)}
      />
      <output
        className="min-w-12 text-center text-sm tabular-nums"
        aria-label={S.counterLabel(i + 1, n)}
        data-testid="counter"
      >
        {S.counter(i + 1, n)}
      </output>
      <IconButton
        label={S.next}
        icon={<ChevronRight />}
        variant="secondary"
        aria-keyshortcuts="D"
        disabled={i >= n - 1}
        onClick={() => go(1)}
      />
      <span
        className="ml-1 min-w-0 flex-1 truncate text-sm text-muted"
        title={item?.name}
        data-testid="file-name"
      >
        {item?.name}
      </span>
    </div>
  );
}

/* ---------- 預覽畫布 ---------- */

/** 正在畫的整張、排在後面的那一次（只留最新的）；筆刷畫過幾次 */
let drawing = false;
let queuedDraw: (() => void) | null = null;
let paintSeq = 0;

/** 主執行緒自己合成（Worker 不能用、合成失敗時的退路；結果相同） */
function drawFullHere(c: HTMLCanvasElement, view: ViewMode) {
  const ps = previewSource();
  const ctx = c.getContext('2d');
  if (!ps || !ctx) return;
  const { src, colors, final } = ps;
  const data =
    view === 'original' || !final
      ? src.rgba
      : view === 'mask'
        ? maskToRgba(final)
        : applyMask(colors ?? src.rgba, final);
  ctx.putImageData(new ImageData(new Uint8ClampedArray(data), src.width, src.height), 0, 0);
}

/**
 * 畫整張（view：結果／原圖／遮罩）。合成在 Worker 裡做（大圖的合成要幾百毫秒），這裡只 drawImage；
 * 畫好後畫布的 data-painted 寫上 tag（測試等這個）。同時只畫一次，期間又要求的只畫最新的那一次。
 */
function drawFull(c: HTMLCanvasElement, view: ViewMode, tag: string): void {
  if (drawing) {
    queuedDraw = () => drawFull(c, view, tag);
    return;
  }
  drawing = true;
  void composeAndDraw(c, view, tag).finally(() => {
    drawing = false;
    const next = queuedDraw;
    queuedDraw = null;
    next?.();
  });
}

async function composeAndDraw(c: HTMLCanvasElement, view: ViewMode, tag: string) {
  const ps = previewSource();
  const ctx = c.getContext('2d');
  if (!ctx) return;
  if (!ps) {
    ctx.clearRect(0, 0, c.width, c.height);
    c.dataset.painted = tag;
    return;
  }
  const { src, final } = ps;
  if (c.width !== src.width || c.height !== src.height) return;
  const painted = paintSeq;
  const blob = await assets.get(ps.asset);
  let img: PreviewImage | null = null;
  if (blob) {
    const job: PreviewJob = {
      key: ps.asset,
      blob,
      view,
      mask: view === 'original' ? null : final,
      colorsKey: ps.despillKey,
      colors: null,
    };
    try {
      img = await pixels.preview(job);
      /* Worker 不記得這組去色邊的顏色：附上再叫一次 */
      if (!img && ps.despillKey) img = await pixels.preview({ ...job, colors: ps.colors });
    } catch {
      img = null;
    }
  }
  /* 等的時候筆刷畫過（那一塊已經是最新的）、換了圖：這次的整張作廢（筆刷寫進清單後會再畫一次） */
  const stale =
    painted !== paintSeq ||
    c.width !== src.width ||
    c.height !== src.height ||
    previewSource()?.src !== src;
  if (img && 'bitmap' in img) {
    if (!stale) {
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(img.bitmap, 0, 0);
    }
    img.bitmap.close();
  } else if (img) {
    if (!stale) ctx.putImageData(new ImageData(img.rgba, img.width, img.height), 0, 0);
  } else if (!stale) {
    drawFullHere(c, view);
  }
  if (!stale) c.dataset.painted = tag;
}

/** 筆刷畫過的範圍只重畫那一塊 */
function drawRect(c: HTMLCanvasElement, view: ViewMode, r: BrushRect) {
  const ps = previewSource();
  const ctx = c.getContext('2d');
  if (!ps?.final || !ctx || view === 'original') return;
  const { src, colors, final } = ps;
  const rgb = colors ?? src.rgba;
  const out = new Uint8ClampedArray(r.width * r.height * 4);
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      const i = (r.y + y) * src.width + r.x + x;
      const o = (y * r.width + x) * 4;
      const m = final[i];
      if (view === 'mask') {
        out[o] = out[o + 1] = out[o + 2] = m;
        out[o + 3] = 255;
      } else {
        out[o] = rgb[i * 4];
        out[o + 1] = rgb[i * 4 + 1];
        out[o + 2] = rgb[i * 4 + 2];
        out[o + 3] = Math.round((src.rgba[i * 4 + 3] * m) / 255);
      }
    }
  }
  ctx.putImageData(new ImageData(out, r.width, r.height), r.x, r.y);
  paintSeq++;
}

function BrushLayer({
  width,
  height,
  onPaint,
}: {
  width: number;
  height: number;
  onPaint: (r: BrushRect | null) => void;
}) {
  const tool = usePreview((st) => st.data.tool);
  const size = usePreview((st) => st.data.brushSize);
  const picking = useWork((st) => st.picking);
  const ready = useWork((st) => st.phase === 'ready');
  const ref = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const active = picking || tool !== 'move';
  const local = (e: ReactPointerEvent) =>
    clientToLocal(e.clientX, e.clientY, ref.current!.getBoundingClientRect(), { width, height });

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!active || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const p = local(e);
    if (picking) {
      finishPick(sampleSource(p.x, p.y));
      return;
    }
    if (usePreview.getState().data.view === 'original') setPreview({ view: 'result' });
    const r = strokeStart(p.x, p.y);
    if (r === false) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    onPaint(r);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!active) return;
    const p = local(e);
    setCursor(p);
    if (strokeActive()) onPaint(strokeMove(p.x, p.y));
  };
  const up = () => {
    if (strokeActive()) strokeEnd();
  };
  return (
    <div
      ref={ref}
      className="absolute inset-0"
      data-testid="brush-layer"
      data-tool={picking ? 'pick' : tool}
      style={{
        pointerEvents: active ? 'auto' : 'none',
        cursor: picking ? 'crosshair' : active ? (ready ? 'none' : 'not-allowed') : undefined,
        touchAction: active ? 'none' : undefined,
      }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerLeave={() => setCursor(null)}
    >
      {cursor && active && !picking ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-full border-solid"
          style={{
            left: cursor.x - size / 2,
            top: cursor.y - size / 2,
            width: size,
            height: size,
            borderWidth: 'calc(1.5px / var(--stage-scale, 1))',
            borderColor: tool === 'erase' ? 'var(--danger)' : 'var(--success)',
            boxShadow: '0 0 0 calc(1px / var(--stage-scale, 1)) rgb(0 0 0 / 0.5)',
          }}
        />
      ) : null}
    </div>
  );
}

const EMPTY_STAGE = { width: 800, height: 600 };

/**
 * 預覽欄的版面：窄畫面由上而下（載入、清單、預覽、AI 去背、匯出）；≥ 1280 px 時預覽在左（跨兩列、放到畫面能容納的最高）、
 * 右側一欄由上而下是「載入＋清單」與「AI 去背＋匯出」（同立繪裁切器）。
 */
const PREVIEW_GRID =
  'flex flex-col gap-3 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)] xl:grid-rows-[auto_1fr] xl:items-start xl:gap-x-4 xl:[--stage-max-h:calc(100dvh-8rem)]';

function PreviewStage({ model }: { model: ModelCache }) {
  const phase = useWork((st) => st.phase);
  const tick = useWork((st) => st.tick);
  const itemId = useWork((st) => st.itemId);
  const w = useWork((st) => st.width);
  const h = useWork((st) => st.height);
  const view = usePreview((st) => st.data.view);
  const stageBg = usePreview((st) => st.data.stageBg);
  const stageBgImage = usePreview((st) => st.data.stageBgImage);
  const stageBgUrl = useAssetUrl(stageBgImage);
  const picking = useWork((st) => st.picking);
  const error = useWork((st) => (st.phase === 'error' ? st.error : null));
  const errorDetails = useWork((st) => st.errorDetails);
  const adding = useAdding((st) => st.adding);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [pan, setPan] = useState<StagePan>({ x: 0, y: 0 });
  const has = !!itemId && w > 0 && phase !== 'empty';
  const width = has ? w : EMPTY_STAGE.width;
  const height = has ? h : EMPTY_STAGE.height;

  // biome-ignore lint/correctness/useExhaustiveDependencies: 換圖時回到符合畫面
  useEffect(() => {
    setZoom('fit');
    setPan({ x: 0, y: 0 });
  }, [itemId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 代表遮罩或原圖換了
  useLayoutEffect(() => {
    const c = canvas.current;
    if (c) drawFull(c, view, `${tick}:${view}`);
  }, [tick, view, width, height]);

  /* 讀取中（包括清單本來是空的、第一張圖還沒讀完時）；AI 模式還沒去背 */
  const overlay =
    phase === 'loading' || (adding && !has)
      ? S.loadingStage
      : has && phase === 'needs-ai'
        ? model.state.status === 'ready'
          ? S.needsAiStage
          : S.needsModelStage
        : null;
  /* 預覽背景圖存在素材庫（id），這裡換成網址交給 Stage */
  /* 換成別的背景時也帶著圖的網址：再切回「圖」時直接顯示，不再跳出選檔視窗 */
  const background = {
    kind: stageBg.kind,
    color: stageBg.color,
    imageUrl: stageBgUrl ?? undefined,
  };

  return (
    <div className="relative min-w-0">
      <Stage
        width={width}
        height={height}
        aria-label={S.stageLabel}
        dragPan
        wheelZoom="plain"
        zoomBase="fit"
        zoomRange={[0.2, 8]}
        wheelFactors={[1.1, 0.9]}
        zoom={zoom}
        onZoomChange={(z) => setZoom(z === 'fit' ? 1 : z)}
        pan={pan}
        onPanChange={setPan}
        background={background}
        onBackgroundChange={(b) => void setStageBackground(b, stageBgUrl)}
        toolbarExtra={
          <>
            <Segmented<ViewMode>
              aria-label={S.viewLabel}
              size="sm"
              value={view}
              onValueChange={(v) => setPreview({ view: v })}
              options={(['result', 'original', 'mask'] as const).map((v) => ({
                value: v,
                label: S.views[v],
              }))}
            />
            <IconButton
              label={S.resetView}
              icon={<RotateCcw />}
              size="sm"
              onClick={() => {
                setZoom('fit');
                setPan({ x: 0, y: 0 });
              }}
            />
          </>
        }
      >
        <canvas
          ref={canvas}
          width={width}
          height={height}
          className="block size-full"
          data-testid="preview-canvas"
          data-phase={phase}
          data-view={view}
          data-tick={tick}
        />
        {has ? (
          <BrushLayer
            width={width}
            height={height}
            onPaint={(r) => {
              const c = canvas.current;
              if (c && r) drawRect(c, usePreview.getState().data.view, r);
            }}
          />
        ) : null}
      </Stage>
      {error ? (
        <div
          role="alert"
          className="absolute inset-x-4 top-1/2 flex -translate-y-1/2 flex-col items-center gap-2 rounded-md bg-surface/90 px-3 py-2 text-center text-sm text-danger"
          data-testid="stage-error"
        >
          <p className="m-0">{error}</p>
          {errorDetails ? <CopyDiagnostics text={errorDetails} /> : null}
        </div>
      ) : overlay ? (
        <p
          className="pointer-events-none absolute inset-x-4 top-1/2 m-0 -translate-y-1/2 rounded-md bg-surface/90 px-3 py-2 text-center text-sm text-fg"
          data-testid="stage-overlay"
        >
          {overlay}
        </p>
      ) : !has ? (
        <p className="pointer-events-none absolute inset-x-4 top-1/2 m-0 -translate-y-1/2 pt-8 text-center text-sm text-muted">
          {S.emptyStage}
        </p>
      ) : phase === 'processing' ? (
        <p className="pointer-events-none absolute top-14 left-3 m-0 rounded-md bg-surface/90 px-2 py-1 text-xs text-muted">
          {S.processingStage}
        </p>
      ) : null}
      {picking ? (
        <p className="pointer-events-none absolute top-14 right-3 m-0 rounded-md bg-accent px-2 py-1 text-xs text-accent-contrast">
          {S.picking}
        </p>
      ) : null}
    </div>
  );
}

/* ---------- AI 去背 ---------- */

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="tabular-nums">
      {S.aiElapsed(Math.max(0, Math.floor((now - since) / 1000)))}
    </span>
  );
}

function AiBar({ model }: { model: ModelCache }) {
  const mode = useSettings((st) => st.data.mode);
  const images = useSettings((st) => st.data.images);
  const current = usePreview((st) => st.data.current);
  const masks = usePreview((st) => st.data.aiMasks);
  const ai = useWork((st) => st.ai);
  if (mode !== 'ai' || !images.length) return null;
  const ready = model.state.status === 'ready';
  const item = images.find((it) => it.id === current) ?? images[0] ?? null;
  const pending = images.filter(
    (it, i, a) => !masks[it.asset] && a.findIndex((x) => x.asset === it.asset) === i,
  );
  const done = !!(item && masks[item.asset]);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* 這張已經去背時改成「重新 AI 去背」（例如換了運算方式、重新下載了模型） */}
        <Button
          variant={done ? 'secondary' : 'primary'}
          icon={done ? <RotateCcw /> : <Sparkles />}
          disabled={!ready || !item || !!ai}
          onClick={() => item && void runAiAndReport([item], model, done)}
        >
          {done ? S.rerunAi : S.runAi}
        </Button>
        {images.length > 1 ? (
          <Button
            disabled={!ready || !!ai || !pending.length}
            onClick={() => void runAiAndReport(pending, model)}
          >
            {S.runAiAll(pending.length)}
          </Button>
        ) : null}
        {!ready ? <span className="text-xs text-muted">{S.needsModel}</span> : null}
      </div>
      {ai ? (
        <Notice
          tone="progress"
          action={
            <Button size="sm" icon={<X />} onClick={cancelAi}>
              {S.cancel}
            </Button>
          }
        >
          <span data-testid="ai-progress">
            {ai.stage === 'model' ? S.aiLoadingModel : S.aiRunning(ai.index, ai.total)}
          </span>{' '}
          <Elapsed since={ai.startedAt} />
        </Notice>
      ) : null}
    </div>
  );
}

/* ---------- 匯出 ---------- */

function ExportExtra() {
  const s = useSettings((st) => st.data);
  const n = s.images.length;
  const scopes = S.scopes(n);
  return (
    <>
      <Field label={S.scope}>
        <Segmented<OutScope>
          value={s.scope}
          onValueChange={(v) =>
            step((d) => {
              d.scope = v;
            })
          }
          fullWidth
          options={(['current', 'all'] as const).map((v) => ({ value: v, label: scopes[v] }))}
        />
      </Field>
      <Field label={S.content} hint={S.contentHints[s.content]}>
        <Segmented<OutContent>
          value={s.content}
          onValueChange={(v) =>
            step((d) => {
              d.content = v;
            })
          }
          fullWidth
          options={(['cutout', 'mask', 'compare'] as const).map((v) => ({
            value: v,
            label: S.contents[v],
          }))}
        />
      </Field>
      {s.content === 'cutout' ? (
        <>
          <Field
            label={S.background}
            hint={
              s.format === 'jpg' && s.background === 'transparent' ? S.backgroundJpg : undefined
            }
          >
            <Segmented<OutBackground>
              value={s.background}
              onValueChange={(v) =>
                step((d) => {
                  d.background = v;
                })
              }
              fullWidth
              options={(['transparent', 'white', 'color'] as const).map((v) => ({
                value: v,
                label: S.backgrounds[v],
              }))}
            />
          </Field>
          {s.background === 'color' ? (
            <Field label={S.bgColor}>
              <ColorField
                value={s.bgColor}
                onChange={(v) =>
                  edit((d) => {
                    d.bgColor = v;
                  })
                }
              />
            </Field>
          ) : null}
          <Field label={S.trim} hint={S.trimHint} layout="inline">
            <Toggle
              checked={s.trim}
              onCheckedChange={(v) =>
                step((d) => {
                  d.trim = v;
                })
              }
            />
          </Field>
          {s.trim ? (
            <Field label={S.trimPad}>
              <Slider
                value={s.trimPad}
                onChange={(v) =>
                  edit((d) => {
                    d.trimPad = Math.round(v);
                  })
                }
                min={RANGE.trimPad.min}
                max={RANGE.trimPad.max}
                step={RANGE.trimPad.step}
                unit="px"
              />
            </Field>
          ) : null}
        </>
      ) : null}
      <p className="m-0 text-xs text-muted">{S.fileNameHint}</p>
    </>
  );
}

/** 匯出；取消時狀態列立刻顯示「正在取消…」，停下來後「已取消匯出。」 */
async function exportWithStatus(format: OutFormat, ctx: ExportContext) {
  const onAbort = () => setNote({ tone: 'warning', text: S.exportCancelling });
  ctx.signal.addEventListener('abort', onAbort, { once: true });
  try {
    const out = await exportImages(format, ctx);
    /* 最後一張剛好畫完才按取消：ExportPanel 一樣當成取消 */
    if (ctx.signal.aborted) setNote({ tone: 'warning', text: S.exportCancelled });
    return out;
  } catch (e) {
    if (ctx.signal.aborted || (e as { name?: string } | null)?.name === 'AbortError')
      setNote({ tone: 'warning', text: S.exportCancelled });
    throw e;
  } finally {
    ctx.signal.removeEventListener('abort', onAbort);
  }
}

function ExportArea({ panelRef }: { panelRef: Ref<ExportPanelHandle> }) {
  const s = useSettings((st) => st.data);
  const tick = useWork((st) => st.tick);
  const webp = useWebpSupport();
  const resetKey = [
    tick,
    s.mode,
    s.scope,
    s.content,
    effectiveBackground(s),
    s.bgColor,
    s.trim,
    s.trimPad,
    s.images.length,
  ].join('|');
  return (
    <ExportPanel
      ref={panelRef}
      title={S.exportTitle}
      formats={(['png', 'webp', 'jpg'] as const).map((f) => ({
        id: f,
        label: S.formats[f],
        description: S.formatHints[f],
        ...(f === 'webp' && !webp
          ? {
              disabled: true,
              disabledReason: S.webpUnsupported,
            }
          : null),
      }))}
      settings={{ format: s.format, fps: 30, plays: 0, scale: 1, quantize: false }}
      onSettingsChange={(x) =>
        step((d) => {
          d.format = x.format as OutFormat;
        })
      }
      onExport={(x, ctx) => exportWithStatus(x.format as OutFormat, ctx)}
      extra={<ExportExtra />}
      resetKey={resetKey}
      sizeWarningHint={S.sizeWarningHint}
    />
  );
}

export function PreviewColumn({
  model,
  exportRef,
}: {
  model: ModelCache;
  exportRef: Ref<ExportPanelHandle>;
}) {
  return (
    <div className={PREVIEW_GRID}>
      <div className="flex min-w-0 flex-col gap-3 xl:col-start-2 xl:row-start-1">
        <LoadArea model={model} />
        <ImageList />
        <Navigator />
      </div>
      <div className="min-w-0 xl:col-start-1 xl:row-span-2 xl:row-start-1">
        <PreviewStage model={model} />
      </div>
      <div className="flex min-w-0 flex-col gap-3 xl:col-start-2 xl:row-start-2">
        <AiBar model={model} />
        <StatusLine />
        <ExportArea panelRef={exportRef} />
      </div>
    </div>
  );
}
