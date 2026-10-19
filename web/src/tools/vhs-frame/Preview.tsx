/**
 * 預覽區（規格 1.6、1.7）：預覽模式（錄影帶／GIF 動畫）、舞台（直接拖曳、縮放照片）、播放列、共用的匯出區。
 * - 錄影帶：以 PNG 的大小畫，一直在播（0～58 秒一輪、每 1/24 秒一格）；PNG 存目前這一格。
 * - GIF 動畫：以動畫的大小畫出跟匯出一樣的 24 格（字幕逐字打出）。
 * 畫一格太慢時少畫幾格（播放的時間照走），主執行緒不被佔滿；暫停時一定畫到最新的狀態。
 */
import {
  type KeyboardEvent,
  type PointerEvent,
  type Ref,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { create } from 'zustand';
import { useAssetImage } from '@/core/assets';
import { uniformFrames } from '@/core/timeline';
import {
  ExportPanel,
  type ExportPanelHandle,
  type ExportSettings,
  Field,
  Notice,
  Segmented,
  Select,
  Stage,
  Transport,
  usePlayback,
  useWebpSupport,
} from '@/ui';
import { type ExportJob, outputSize, renderInto, runExport } from './exporter';
import { fontLoads, useEnsureFonts, useFontTick } from './fonts';
import {
  ANIM_SIZES,
  animSize,
  EXPORT_FORMATS,
  type ExportFormat,
  GIF_DURATION,
  GIF_FRAMES,
  GIF_STEP,
  gifFrameAt,
  gifFrameTime,
  KEY_STEP,
  KEY_STEP_BIG,
  KEY_ZOOM,
  masterWidthFor,
  type PhotoView,
  panView,
  SCREEN_W,
  screenSize,
  TAPE_FPS,
  TAPE_LOOP,
  tapeFrameTime,
  WHEEL_ZOOM,
  wheelPixels,
  zoomViewAt,
} from './model';
import { VhsRenderer } from './render';
import {
  assets,
  docNow,
  gesture,
  type PreviewMode,
  prefsNow,
  setPrefs,
  setView,
  useDoc,
  usePrefs,
} from './store';
import { S } from './strings';

const PREVIEW_MODES: readonly PreviewMode[] = ['tape', 'gif'];

/** 「錄影帶」目前的那一格與是否在播（PNG 的說明用；每 1/24 秒更新一次） */
const useTapeClock = create<{ t: number; playing: boolean }>(() => ({ t: 0, playing: false }));

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface ScreenHandle {
  /** 播放／暫停目前的預覽 */
  toggle: () => void;
  /** 焦點移到畫面（重設位置之後） */
  focus: () => void;
  /** 「錄影帶」目前這一格的 t（PNG 用） */
  tapeT: () => number;
  /** 停在某個時間（測試、對等驗證用）；mode 不給時是目前的預覽 */
  seek: (t: number, mode?: PreviewMode) => void;
  state: () => { mode: PreviewMode; t: number; playing: boolean; drawn: number };
}

/* ---------- 畫面（舞台＋播放列） ---------- */

function Screen({ mode, ref }: { mode: PreviewMode; ref: Ref<ScreenHandle> }) {
  const s = useDoc((st) => st.data);
  const animIndex = usePrefs((p) => p.data.animSize);
  const photo = useAssetImage(assets, s.photo?.id);
  const loads = useMemo(() => fontLoads(s), [s]);
  useEnsureFonts(loads);
  const tick = useFontTick();
  const renderer = useMemo(() => new VhsRenderer(), []);

  const size = mode === 'tape' ? screenSize(s.aspect) : animSize(s.aspect, animIndex);
  const masterRes = mode === 'tape' ? SCREEN_W : masterWidthFor(size.width);
  const bitmap = photo.bitmap && s.photo ? photo.bitmap : null;
  const master = useMemo(
    () =>
      bitmap && s.photo ? renderer.compose(bitmap, s.photo, s.view, s.aspect, masterRes) : null,
    [renderer, bitmap, s.photo, s.view, s.aspect, masterRes],
  );

  /* 播放：錄影帶與 GIF 動畫各一條時間軸；只有目前的模式在播 */
  const tapePrefs = useRef(prefsNow());
  const tape = usePlayback({
    duration: TAPE_LOOP,
    loop: true,
    autoPlay: tapePrefs.current.tapePaused ? false : undefined,
  });
  const gif = usePlayback({ duration: GIF_DURATION, loop: true, autoPlay: false });
  const pb = useRef({ tape, gif });
  pb.current = { tape, gif };
  const active = mode === 'tape' ? tape : gif;

  /* 開頁：回到上次的時間 */
  useEffect(() => {
    pb.current.tape.onTimeChange(tapePrefs.current.tapeTime);
  }, []);

  /* 換預覽模式：另一條停下來；GIF 動畫自動播，錄影帶照上次的播放／暫停 */
  useEffect(() => {
    const { tape: tp, gif: gf } = pb.current;
    if (mode === 'gif') {
      tp.pause();
      if (!reducedMotion()) gf.play();
    } else {
      gf.pause();
      if (!prefsNow().tapePaused && !reducedMotion()) tp.play();
    }
  }, [mode]);

  /* 錄影帶的播放／暫停與時間記在 prefs（暫停時才記時間） */
  const tapePlaying = (playing: boolean) => {
    if (playing) pb.current.tape.play();
    else pb.current.tape.pause();
    setPrefs({ tapePaused: !playing, tapeTime: tapeFrameTime(pb.current.tape.time) });
  };
  const tapeSeek = (t: number) => {
    pb.current.tape.onTimeChange(t);
    if (!pb.current.tape.playing) setPrefs({ tapeTime: tapeFrameTime(t) });
  };

  const frameKey = mode === 'tape' ? tapeFrameTime(tape.time) : gifFrameAt(gif.time);
  useEffect(() => {
    useTapeClock.setState({ t: tapeFrameTime(tape.time), playing: tape.playing });
  }, [tape.time, tape.playing]);

  /* 畫：太慢時少畫幾格（每畫完一格，至少休息同樣長的時間才畫下一格） */
  const canvas = useRef<HTMLCanvasElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const nextAllowed = useRef(0);
  const drawn = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 只用來在字型載好後重畫
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    if (active.playing && performance.now() < nextAllowed.current) return;
    const start = performance.now();
    if (mode === 'tape') renderInto(renderer, c, s, master, frameKey);
    else renderInto(renderer, c, s, master, gifFrameTime(frameKey), frameKey);
    const end = performance.now();
    const cost = end - start;
    nextAllowed.current = cost > 20 ? end + cost : 0;
    drawn.current++;
    c.dataset.frame = String(frameKey);
  }, [mode, frameKey, s, master, tick, size.width, size.height, active.playing, renderer]);

  useImperativeHandle(ref, () => ({
    toggle: () => {
      if (mode === 'tape') tapePlaying(!pb.current.tape.playing);
      else pb.current.gif.toggle();
    },
    focus: () => surface.current?.focus(),
    tapeT: () => tapeFrameTime(pb.current.tape.time),
    seek: (t: number, m: PreviewMode = mode) => {
      if (m === 'tape') {
        tapePlaying(false);
        tapeSeek(t);
      } else {
        pb.current.gif.pause();
        pb.current.gif.onTimeChange(t);
      }
    },
    state: () => {
      const p = mode === 'tape' ? pb.current.tape : pb.current.gif;
      return { mode, t: p.time, playing: p.playing, drawn: drawn.current };
    },
  }));

  /* ---------- 照片的拖曳、滾輪、捏合、鍵盤（座標換成 1280 寬的畫面 px） ---------- */

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ p: { x: number; y: number }; view: PhotoView } | null>(null);
  const pinch = useRef(0);
  const box = screenSize(s.aspect);

  const toScreen = (clientX: number, clientY: number) => {
    const r = surface.current?.getBoundingClientRect();
    if (!r?.width || !r.height) return { x: 0, y: 0 };
    return {
      x: ((clientX - r.left) / r.width) * box.width,
      y: ((clientY - r.top) / r.height) * box.height,
    };
  };
  const mid = (pts: { x: number; y: number }[]) => ({
    x: (pts[0].x + pts[1].x) / 2,
    y: (pts[0].y + pts[1].y) / 2,
    d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
  });

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const d = docNow();
    if (!d.photo || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (!pointers.current.size) gesture.begin();
    pointers.current.set(e.pointerId, toScreen(e.clientX, e.clientY));
    const pts = [...pointers.current.values()];
    if (pts.length === 1) drag.current = { p: pts[0], view: d.view };
    else if (pts.length === 2) {
      drag.current = null;
      pinch.current = mid(pts).d;
    }
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const d = docNow();
    if (!d.photo) return;
    pointers.current.set(e.pointerId, toScreen(e.clientX, e.clientY));
    const pts = [...pointers.current.values()];
    if (pts.length === 1 && drag.current) {
      const from = drag.current;
      setView(panView(d.photo, box, from.view, pts[0].x - from.p.x, pts[0].y - from.p.y));
    } else if (pts.length >= 2) {
      const m = mid(pts);
      if (pinch.current > 0)
        setView(zoomViewAt(d.photo, box, d.view, m.x, m.y, m.d / pinch.current));
      pinch.current = m.d;
    }
  };
  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const pts = [...pointers.current.values()];
    drag.current = pts.length === 1 ? { p: pts[0], view: docNow().view } : null;
    pinch.current = 0;
    if (!pts.length) gesture.commit();
  };

  /* 滾輪：原生的監聽（React 的 wheel 是被動的，擋不住頁面捲動） */
  const boxRef = useRef(box);
  boxRef.current = box;
  useEffect(() => {
    const el = surface.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const d = docNow();
      if (!d.photo || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const b = boxRef.current;
      const px = ((e.clientX - r.left) / r.width) * b.width;
      const py = ((e.clientY - r.top) / r.height) * b.height;
      const dy = wheelPixels(e.deltaY, e.deltaMode, window.innerHeight);
      setView(zoomViewAt(d.photo, b, d.view, px, py, Math.exp(-dy * WHEEL_ZOOM)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const d = docNow();
    if (!d.photo || e.ctrlKey || e.metaKey || e.altKey) return;
    const step = e.shiftKey ? KEY_STEP_BIG : KEY_STEP;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const mv = moves[e.key];
    let next: PhotoView | null = null;
    if (mv) next = panView(d.photo, box, d.view, mv[0], mv[1]);
    else if (e.key === '+' || e.key === '=')
      next = zoomViewAt(d.photo, box, d.view, box.width / 2, box.height / 2, KEY_ZOOM);
    else if (e.key === '-' || e.key === '_')
      next = zoomViewAt(d.photo, box, d.view, box.width / 2, box.height / 2, 1 / KEY_ZOOM);
    if (!next) return;
    e.preventDefault();
    setView(next);
  };

  const v = s.view;
  return (
    <>
      <Stage
        width={size.width}
        height={size.height}
        fitUpscale
        defaultBackground={{ kind: 'dark' }}
        aria-label={S.previewModeAria[mode]}
        className="shrink-0"
      >
        <div
          ref={surface}
          role="application"
          aria-label={S.screenLabel}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: 畫面可以用方向鍵移動照片、＋／－ 縮放
          tabIndex={0}
          className="size-full touch-none outline-none focus-visible:[outline:calc(2px/var(--stage-scale,1))_solid_var(--focus)]"
          style={{ cursor: s.photo ? 'grab' : 'default' }}
          data-testid="vhs-screen"
          data-view={`${v.zoom.toFixed(4)},${v.x.toFixed(4)},${v.y.toFixed(4)}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onKeyDown={onKeyDown}
        >
          <canvas
            ref={canvas}
            width={size.width}
            height={size.height}
            className="block size-full"
            data-testid="vhs-canvas"
            data-mode={mode}
            data-size={`${size.width}x${size.height}`}
          />
        </div>
      </Stage>
      {mode === 'tape' ? (
        <Transport
          time={tape.time}
          duration={tape.duration}
          playing={tape.playing}
          loop={tape.loop}
          onLoopChange={tape.onLoopChange}
          onTimeChange={tapeSeek}
          onPlayingChange={tapePlaying}
          onRestart={() => {
            tapeSeek(0);
            tapePlaying(true);
          }}
          fps={TAPE_FPS}
          legend={false}
        />
      ) : (
        <Transport
          time={gif.time}
          duration={gif.duration}
          playing={gif.playing}
          loop={gif.loop}
          onLoopChange={gif.onLoopChange}
          onTimeChange={gif.onTimeChange}
          onPlayingChange={gif.onPlayingChange}
          onRestart={gif.onRestart}
          frames={GIF_TABLE}
          fps={Math.round(1 / GIF_STEP)}
          legend={false}
        />
      )}
      {photo.status === 'missing' ? <Notice tone="warning">{S.photoMissing}</Notice> : null}
    </>
  );
}

/** GIF 動畫的影格表（播放列的 ←／→ 逐格） */
const GIF_TABLE = uniformFrames(GIF_FRAMES, 1 / GIF_STEP);

/** PNG 存哪一格的說明（播放中／暫停在幾秒） */
function PngFrameNote() {
  const { t, playing } = useTapeClock();
  return (
    <p className="m-0 text-xs text-muted tabular-nums" data-testid="png-frame">
      {playing ? S.pngFramePlaying : S.pngFrame(S.seconds(t))}
    </p>
  );
}

/* ---------- 預覽區 ---------- */

export function Preview({
  screenRef,
  exportRef,
}: {
  screenRef: Ref<ScreenHandle>;
  exportRef: Ref<ExportPanelHandle>;
}) {
  const prefs = usePrefs((p) => p.data);
  const aspect = useDoc((st) => st.data.aspect);
  const photoId = useDoc((st) => st.data.photo?.id);
  const photo = useAssetImage(assets, photoId);
  const hasPhoto = !!photoId;
  const webpOk = useWebpSupport();
  const handle = useRef<ScreenHandle | null>(null);
  useImperativeHandle(screenRef, () => ({
    toggle: () => handle.current?.toggle(),
    focus: () => handle.current?.focus(),
    tapeT: () => handle.current?.tapeT() ?? 0,
    seek: (t: number, m?: PreviewMode) => handle.current?.seek(t, m),
    state: () => handle.current?.state() ?? { mode: prefs.preview, t: 0, playing: false, drawn: 0 },
  }));

  const formats = useMemo(
    () =>
      EXPORT_FORMATS.map((id) => ({
        id,
        label: S.formats[id],
        description: S.formatDesc[id],
        animated: false,
        supportsLoop: id !== 'png',
        supportsQuantize: id === 'apng',
        disabled: id === 'webp' && !webpOk,
        disabledReason: id === 'webp' && !webpOk ? S.webpUnsupported : undefined,
      })),
    [webpOk],
  );
  const settings: ExportSettings = {
    format: prefs.format,
    fps: Math.round(1 / GIF_STEP),
    plays: prefs.plays,
    scale: 1,
    quantize: prefs.quantize,
  };
  const out = outputSize({ aspect }, { format: prefs.format, animSize: prefs.animSize });

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden className="text-sm text-muted">
          {S.previewMode}
        </span>
        <Segmented<PreviewMode>
          aria-label={S.previewMode}
          value={prefs.preview}
          onValueChange={(v) => setPrefs({ preview: v })}
          options={PREVIEW_MODES.map((m) => ({
            value: m,
            label: S.previewModes[m],
            ariaLabel: S.previewModeAria[m],
          }))}
        />
      </div>
      <Screen mode={prefs.preview} ref={handle} />
      <p className="m-0 px-1 text-xs text-muted" data-testid="preview-hint">
        {hasPhoto ? S.hintPhoto : S.hintNoPhoto} {prefs.preview === 'tape' ? S.hintTape : S.hintGif}
      </p>
      <ExportPanel
        ref={exportRef}
        title={S.exportTitle}
        formats={formats}
        settings={settings}
        onSettingsChange={(next) =>
          setPrefs({
            format: next.format as ExportFormat,
            plays: Math.max(0, next.plays),
            quantize: next.quantize,
          })
        }
        fixedFps={Math.round(1 / GIF_STEP)}
        fixedFpsHint={S.animFrames}
        loopHint={S.loopHint}
        extra={
          prefs.format === 'png' ? (
            <div className="flex min-w-0 flex-col gap-1">
              <p className="m-0 text-xs text-muted tabular-nums" data-testid="export-size">
                {S.pngSize(out.width, out.height)}
              </p>
              <PngFrameNote />
            </div>
          ) : (
            <Field
              label={S.animSize}
              hint={<span data-testid="export-frames">{S.animFrames}</span>}
            >
              <Select
                value={String(prefs.animSize)}
                onValueChange={(v) => setPrefs({ animSize: Number(v) })}
                options={ANIM_SIZES[aspect].map((sz, i) => ({
                  value: String(i),
                  label: S.animSizeOption(S.animSizes[i], sz.width, sz.height, i === 0),
                }))}
              />
            </Field>
          )
        }
        onExport={(st, { signal, onProgress }) => {
          const job: ExportJob = {
            format: st.format as ExportFormat,
            animSize: prefsNow().animSize,
            plays: st.plays,
            quantize: st.quantize,
            tapeTime: handle.current?.tapeT() ?? 0,
          };
          return runExport(docNow(), photo.bitmap, job, { signal, onProgress });
        }}
      />
    </>
  );
}
