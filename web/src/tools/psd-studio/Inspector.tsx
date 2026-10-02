/**
 * 單圖檢視器（F66～F83）：全解析度、套好整體＋個別調色的大畫面（與匯出的 PNG 逐像素相同）、上一張／下一張、按住對照原圖、
 * 下載這一張、個別調色、畫布尺寸、APNG 的播放控制、播放次數與容量壓縮試算。
 * Esc、×、「回到清單」關閉；←／→ 切換上一張／下一張；對照原圖可以用滑鼠、觸控或鍵盤（聚焦後按住空白鍵）按住。
 */
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Dialog,
  DialogClose,
  Field,
  FieldRow,
  IconButton,
  isFormControlTarget,
  NumberInput,
  Section,
  Segmented,
  Select,
  Slider,
} from '@/ui';
import { CurveControls, GradientControls, ToneControls } from './AdjustControls';
import { kindText } from './AssetGrid';
import {
  ASSET_TONE_RANGES,
  type AssetAdjust,
  adjustKey,
  type CurveChannel,
  defaultAssetAdjust,
  type GlobalAdjust,
} from './adjust';
import type { StudioRunner } from './client';
import { formatMb, savingPercent } from './compress';
import { type AssetLoopMode, loopCount, MAX_LOOP_COUNT } from './naming';
import type { ProcessInfo } from './process';
import type { Asset, Mode } from './store';
import { S } from './strings';

export interface InspectorProps {
  open: boolean;
  asset: Asset | null;
  mode: Mode;
  global: GlobalAdjust;
  compressOn: boolean;
  runner: StudioRunner;
  onClose: () => void;
  onNavigate: (dir: -1 | 1) => void;
  onAdjust: (id: string, adjust: AssetAdjust | null) => void;
  onLoop: (id: string, mode: AssetLoopMode, count: number) => void;
  onResize: (id: string, w: number, h: number) => void;
  onPad: (id: string) => void;
  onDownload: (id: string) => void;
  onTest: (id: string) => Promise<ProcessInfo | null>;
  /** 壓縮中的狀態文字（F81、F89） */
  status?: string;
}

const SPEEDS = ['0.5', '1', '1.5', '2'] as const;

export function assetKindLabel(a: Asset, mode: Mode): string {
  if (mode === 'psd') return S.kindPsdLayer;
  return a.apng ? S.kindApng : S.kindStatic;
}

/** 影格快取：同一組（素材版本＋調色）的 ImageBitmap */
interface FrameCache {
  key: string;
  frames: Map<number, ImageBitmap>;
  pending: Set<number>;
}

export function Inspector(p: InspectorProps) {
  const { asset, open } = p;
  return (
    <Dialog
      open={open && !!asset}
      onOpenChange={(v) => {
        if (!v) p.onClose();
      }}
      size="xl"
      flush
      dismissOnOutside={false}
      className="h-[calc(100dvh-2rem)]"
      title={<span className="break-all">{asset?.label ?? ''}</span>}
      description={
        asset ? S.viewerTitleMeta(asset.width, asset.height, assetKindLabel(asset, p.mode)) : ''
      }
      footer={<DialogClose>{S.back}</DialogClose>}
    >
      {asset ? <InspectorBody key={asset.id} {...p} asset={asset} /> : null}
    </Dialog>
  );
}

function InspectorBody(p: InspectorProps & { asset: Asset }) {
  const { asset, global, runner } = p;
  const adjust = asset.adjust;
  const [original, setOriginal] = useState(false);
  const [playing, setPlaying] = useState(asset.apng);
  const [frame, setFrame] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>('1');
  const [channel, setChannel] = useState<CurveChannel>('all');
  const [error, setError] = useState(false);
  const [test, setTest] = useState<ProcessInfo | null>(null);
  const [testing, setTesting] = useState(false);
  const [size, setSize] = useState({ w: asset.width, h: asset.height });
  const canvas = useRef<HTMLCanvasElement>(null);
  const caches = useRef<FrameCache[]>([]);
  const frameRef = useRef(frame);
  frameRef.current = frame;

  useEffect(() => setSize({ w: asset.width, h: asset.height }), [asset.width, asset.height]);

  const renderKey = `${asset.id}:${asset.rev}`;
  const adjKey = original ? 'original' : adjustKey(global, adjust);
  const cacheKey = `${renderKey}|${adjKey}`;
  const delays = asset.delays;
  const total = Math.max(1, asset.frames);

  /* ---------- 大畫面 ---------- */

  const draw = useCallback((bmp: ImageBitmap) => {
    const c = canvas.current;
    if (!c) return;
    if (c.width !== bmp.width) c.width = bmp.width;
    if (c.height !== bmp.height) c.height = bmp.height;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0);
  }, []);

  const cacheFor = useCallback((key: string): FrameCache => {
    let c = caches.current.find((x) => x.key === key);
    if (!c) {
      c = { key, frames: new Map(), pending: new Set() };
      caches.current.push(c);
      /* 留目前的調色與原圖兩組，其餘釋放 */
      while (caches.current.length > 2) {
        const old = caches.current.shift()!;
        for (const b of old.frames.values()) b.close();
      }
    }
    return c;
  }, []);

  /* 一次只送一批給 Worker：拖滑桿時不會累積一長串過時的工作，做完再補上最新的那一格 */
  const inflight = useRef(false);
  const queued = useRef(false);
  const currentKey = useRef(cacheKey);
  currentKey.current = cacheKey;
  const playingRef = useRef(playing);
  playingRef.current = playing;

  const request = useCallback(
    (key: string, want: number[]) => {
      if (inflight.current) {
        queued.current = true;
        return;
      }
      const c = cacheFor(key);
      const missing = want.filter(
        (i) => i >= 0 && i < total && !c.frames.has(i) && !c.pending.has(i),
      );
      if (!missing.length) return;
      for (const i of missing) c.pending.add(i);
      const adj = key.endsWith('|original') ? null : { global, asset: adjust };
      inflight.current = true;
      runner
        .render(renderKey, asset.bytes, adj, missing)
        .then((out) => {
          out.indices.forEach((i, k) => {
            c.pending.delete(i);
            if (!caches.current.includes(c)) {
              out.bitmaps[k].close();
              return;
            }
            c.frames.set(i, out.bitmaps[k]);
          });
          setError(false);
          const cur = caches.current.find((x) => x.key === currentKey.current);
          const bmp = cur?.frames.get(frameRef.current);
          if (bmp) draw(bmp);
        })
        .catch(() => {
          for (const i of missing) c.pending.delete(i);
          setError(true);
        })
        .finally(() => {
          inflight.current = false;
          if (queued.current) {
            queued.current = false;
            const f = frameRef.current;
            latestRequest.current(currentKey.current, playingRef.current ? [f, f + 1, f + 2] : [f]);
          }
        });
    },
    [global, adjust, renderKey, asset.bytes, runner, total, draw, cacheFor],
  );
  const latestRequest = useRef(request);
  latestRequest.current = request;

  /* 目前這一格：有快取就畫，沒有就要（並預先要後面兩格） */
  useEffect(() => {
    const c = cacheFor(cacheKey);
    const bmp = c.frames.get(frame);
    if (bmp) draw(bmp);
    request(cacheKey, playing ? [frame, frame + 1, frame + 2] : [frame]);
  }, [cacheKey, frame, playing, request, draw, cacheFor]);

  /* 離開時釋放 */
  useEffect(
    () => () => {
      for (const c of caches.current) for (const b of c.frames.values()) b.close();
      caches.current = [];
    },
    [],
  );

  /* ---------- APNG 播放（F76～F80） ---------- */

  useEffect(() => {
    if (!asset.apng || !playing) return;
    const ms = (delays[frame] || 100) / Number(speed);
    const t = window.setTimeout(() => setFrame((f) => (f + 1) % total), Math.max(16, ms));
    return () => window.clearTimeout(t);
  }, [asset.apng, playing, frame, speed, delays, total]);

  const step = (dir: -1 | 1) => {
    setPlaying(false);
    setFrame((f) => (f + dir + total) % total);
  };

  /* ---------- 鍵盤：←／→ 上一張／下一張 ---------- */

  const nav = useRef(p.onNavigate);
  nav.current = p.onNavigate;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (isFormControlTarget(e.target)) return;
      if (e.key === 'ArrowLeft') nav.current(-1);
      else if (e.key === 'ArrowRight') nav.current(1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ---------- 個別調色 ---------- */

  const a = adjust ?? defaultAssetAdjust();
  const setAdjust = (patch: Partial<AssetAdjust>) => p.onAdjust(asset.id, { ...a, ...patch });

  const runTest = async () => {
    setTesting(true);
    try {
      setTest(await p.onTest(asset.id));
    } finally {
      setTesting(false);
    }
  };

  const loopOptions = useMemo(
    () =>
      (Object.keys(S.assetLoopOptions) as AssetLoopMode[]).map((v) => ({
        value: v,
        label: S.assetLoopOptions[v],
      })),
    [],
  );

  const delayShown = delays[frame] ?? 0;

  return (
    <div className="flex flex-col lg:grid lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-2 p-3 lg:min-h-0">
        <div className="flex flex-wrap items-center gap-2">
          <Button icon={<ChevronLeft />} onClick={() => p.onNavigate(-1)}>
            {S.prev}
          </Button>
          <Button icon={<ChevronRight />} onClick={() => p.onNavigate(1)}>
            {S.next}
          </Button>
          <Button
            variant="secondary"
            aria-pressed={original}
            title={S.compareHint}
            data-testid="compare"
            onPointerDown={(e) => {
              if (e.pointerType === 'mouse' && e.button !== 0) return;
              setOriginal(true);
            }}
            onPointerUp={() => setOriginal(false)}
            /* 滑鼠移出按鈕就恢復（與舊版相同）；觸控按住時瀏覽器會把指標留在按鈕上，放開才恢復 */
            onPointerLeave={() => setOriginal(false)}
            onPointerCancel={() => setOriginal(false)}
            onKeyDown={(e) => {
              if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
                e.preventDefault();
                setOriginal(true);
              }
            }}
            onKeyUp={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                setOriginal(false);
              }
            }}
            onBlur={() => setOriginal(false)}
          >
            {S.compare}
          </Button>
          <Button
            variant="primary"
            icon={<Download />}
            className="ml-auto"
            onClick={() => p.onDownload(asset.id)}
          >
            {S.download}
          </Button>
        </div>
        <div
          className="checker relative flex h-[45dvh] items-center lg:h-auto lg:min-h-0 lg:flex-1 justify-center overflow-hidden rounded-md border border-border [--checker-a:#2b2b30] [--checker-b:#202024]"
          data-testid="viewer-stage"
        >
          <canvas
            ref={canvas}
            role="img"
            aria-label={S.viewerCanvas(asset.label)}
            data-testid="viewer-canvas"
            data-original={original || undefined}
            className="block max-h-full max-w-full object-contain"
            width={asset.width}
            height={asset.height}
          />
          {original ? (
            <span className="absolute top-2 left-2 rounded-sm bg-surface px-2 py-0.5 text-xs font-semibold shadow-1">
              {S.showingOriginal}
            </span>
          ) : null}
          {error ? (
            <span className="absolute inset-x-0 bottom-2 text-center text-sm text-danger">
              {S.viewerFailed}
            </span>
          ) : null}
        </div>
        {asset.apng ? (
          <div className="flex flex-col gap-2" data-testid="apng-player">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                icon={playing ? <Pause /> : <Play />}
                onClick={() => setPlaying((v) => !v)}
                data-testid="play-toggle"
              >
                {playing ? S.pause : S.play}
              </Button>
              <IconButton label={S.prevFrame} icon={<SkipBack />} onClick={() => step(-1)} />
              <IconButton label={S.nextFrame} icon={<SkipForward />} onClick={() => step(1)} />
              <span className="text-sm text-muted tabular-nums" data-testid="frame-info">
                {S.frameInfo(frame + 1, total, delayShown)}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-muted">{S.speed}</span>
                <Segmented
                  aria-label={S.speed}
                  size="sm"
                  value={speed}
                  onValueChange={(v) => setSpeed(v)}
                  options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))}
                />
              </div>
            </div>
            <Slider
              aria-label={S.frameSlider}
              value={frame}
              onChange={(v) => {
                setPlaying(false);
                setFrame(Math.min(total - 1, Math.max(0, Math.round(v))));
              }}
              min={0}
              max={total - 1}
              showInput={false}
              valueText={(v) => S.frameInfo(v + 1, total, delays[v] ?? 0)}
            />
          </div>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-3 border-t border-border p-3 lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:border-l">
        <Section
          title={S.individual}
          description={S.individualHint}
          persistKey="psd-studio:viewer-tone"
          actions={
            <Button size="sm" variant="ghost" onClick={() => p.onAdjust(asset.id, null)}>
              {S.resetAsset}
            </Button>
          }
        >
          <ToneControls
            value={a}
            ranges={ASSET_TONE_RANGES}
            idPrefix="asset"
            satHint={S.assetSatHint}
            onChange={(key, v) => setAdjust({ [key]: v })}
          />
        </Section>
        <Section
          title={S.individualGradient}
          persistKey="psd-studio:viewer-gradient"
          defaultOpen={false}
        >
          <GradientControls
            name="個別"
            toggleLabel={S.individualGradientToggle}
            value={a.gradient}
            onChange={(gradient) => setAdjust({ gradient })}
          />
        </Section>
        <Section
          title={S.individualCurves}
          description={S.individualCurvesHint}
          persistKey="psd-studio:viewer-curves"
          defaultOpen={false}
        >
          <CurveControls
            name="個別"
            curves={a.curves}
            channel={channel}
            onChannel={setChannel}
            onChange={(ch, pts) => setAdjust({ curves: { ...a.curves, [ch]: pts } })}
          />
        </Section>
        <Section
          title={S.canvasSize}
          description={S.canvasHint}
          persistKey="psd-studio:viewer-canvas"
        >
          <CanvasSizeFields
            width={size.w}
            height={size.h}
            onChange={(w, h) => setSize({ w, h })}
            onApply={() => p.onResize(asset.id, size.w, size.h)}
            onPad={() => p.onPad(asset.id)}
            idPrefix="viewer"
          />
        </Section>
        {asset.apng ? (
          <>
            <Section
              title={S.loops}
              description={S.loopsOriginal(asset.plays)}
              persistKey="psd-studio:viewer-loops"
            >
              <div className="flex flex-col gap-2">
                <Field label={S.loops}>
                  <Select<AssetLoopMode>
                    value={asset.loopMode}
                    onValueChange={(m) => p.onLoop(asset.id, m, asset.loopCount)}
                    options={loopOptions}
                  />
                </Field>
                <Field label={S.loopCount} hidden={asset.loopMode !== 'custom'}>
                  <NumberInput
                    value={asset.loopCount}
                    onChange={(v) => p.onLoop(asset.id, asset.loopMode, loopCount(v))}
                    min={1}
                    max={MAX_LOOP_COUNT}
                    unit="次"
                  />
                </Field>
              </div>
            </Section>
            <Section
              title={S.compressTest}
              description={S.compressTestHint}
              persistKey="psd-studio:viewer-test"
            >
              <div className="flex flex-col gap-2">
                {!p.compressOn ? (
                  <p className="m-0 text-xs text-warning">{S.compressOffHint}</p>
                ) : null}
                <Button
                  onClick={runTest}
                  loading={testing}
                  disabled={testing}
                  data-testid="test-run"
                >
                  {S.compressTestRun}
                </Button>
                {testing && p.status ? (
                  <p className="m-0 text-xs text-accent" role="status" data-testid="test-status">
                    {p.status}
                  </p>
                ) : null}
                {test ? <TestCard info={test} /> : null}
              </div>
            </Section>
          </>
        ) : null}
        <p className="m-0 text-xs text-muted">{kindText(asset, p.mode)}</p>
      </div>
    </div>
  );
}

function TestCard({ info }: { info: ProcessInfo }) {
  return (
    <section
      className="flex flex-col gap-1 rounded-md border border-border bg-surface-2 p-2 text-sm"
      data-testid="test-card"
      aria-label={S.testResult}
    >
      <div className="flex justify-between gap-2">
        <span className="text-muted">{S.testSize}</span>
        <strong data-testid="test-size">{formatMb(info.size)}</strong>
      </div>
      <div className="flex justify-between gap-2">
        <span className="text-muted">{S.testOrig}</span>
        <span data-testid="test-orig">{formatMb(info.origSize)}</span>
      </div>
      <div className="flex justify-between gap-2">
        <span className="text-muted">{S.testSaving}</span>
        <span data-testid="test-saving">{savingPercent(info.origSize, info.size)}%</span>
      </div>
      <div className="text-xs text-muted" data-testid="test-detail">
        {S.testDetail(Math.round(info.scale * 100), info.colors, info.frames, info.skipped)}
      </div>
      {info.over ? <div className="text-xs text-danger">{S.testOver}</div> : null}
    </section>
  );
}

/** 畫布尺寸（F63、F64、F83）：寬、高＋套用、補到 24 倍數 */
export function CanvasSizeFields({
  width,
  height,
  onChange,
  onApply,
  onPad,
  idPrefix,
}: {
  width: number;
  height: number;
  onChange: (w: number, h: number) => void;
  onApply: () => void;
  onPad: () => void;
  idPrefix: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <FieldRow columns={2}>
        <Field label={S.canvasWidth}>
          <NumberInput
            id={`${idPrefix}-w`}
            value={width}
            onChange={(v) => onChange(v, height)}
            min={1}
            max={16384}
            unit="px"
          />
        </Field>
        <Field label={S.canvasHeight}>
          <NumberInput
            id={`${idPrefix}-h`}
            value={height}
            onChange={(v) => onChange(width, v)}
            min={1}
            max={16384}
            unit="px"
          />
        </Field>
      </FieldRow>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onApply}>{S.canvasApply}</Button>
        <Button onClick={onPad} title={S.padHint}>
          {S.pad}
        </Button>
      </div>
    </div>
  );
}
