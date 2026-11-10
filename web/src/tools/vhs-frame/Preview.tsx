/**
 * 預覽區（規格 1.6、1.7）：預覽模式（錄影帶／GIF 動畫）、舞台（直接拖曳、縮放照片）、播放列、共用的匯出區。
 * - 錄影帶：一直在播（0～58 秒一輪、每 1/24 秒一格）；PNG 存目前這一格。播放中、拖曳與縮放照片時以畫面顯示的大小
 *   （含 devicePixelRatio，最多 1280 寬）畫，暫停而且沒在操作時以 PNG 的大小畫（暫停時的預覽＝下載的 PNG）。
 * - GIF 動畫：以動畫的大小畫出跟匯出一樣的影格（預設 24 格；場景依序換、字幕逐字打出、開場與收尾）。
 * 合成好的照片層依「照片、位置、比例、寬度、調色」快取（最近 4 份），切換預覽模式、播放與暫停不重新縮照片。
 * 畫一格比一格的時間還久時少畫幾格（播放的時間照走），主執行緒不被佔滿；停下來時一定畫到最新的狀態。
 */
import {
  type KeyboardEvent,
  type PointerEvent,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { create } from 'zustand';
import { useAssetImage } from '@/core/assets';
import { uniformFrames } from '@/core/timeline';
import {
  cn,
  ExportPanel,
  type ExportPanelHandle,
  type ExportSettings,
  Field,
  Notice,
  Segmented,
  Select,
  Stage,
  Toggle,
  Transport,
  usePlayback,
  useStageView,
  useWebpSupport,
} from '@/ui';
import { digitalFrameAt } from './digital';
import {
  composeLook,
  masterFor as composeMaster,
  type ExportJob,
  type FrameSource,
  outputSize,
  renderAnimFrame,
  renderInto,
  runExport,
} from './exporter';
import { fontLoads, useEnsureFonts, useFontTick } from './fonts';
import {
  ANIM_SIZES,
  animPlan,
  animSize,
  EXPORT_FORMATS,
  type ExportFormat,
  GIF_COLOR_OPTIONS,
  GIF_COLORS,
  GIF_STEP,
  gifFrameAt,
  heightFor,
  KEY_STEP,
  KEY_STEP_BIG,
  KEY_ZOOM,
  masterWidthFor,
  type PhotoView,
  PNG_WIDTHS,
  panView,
  pngSize,
  SCREEN_W,
  screenSize,
  TAPE_FPS,
  TAPE_LOOP,
  tapeFrameTime,
  WHEEL_ZOOM,
  wheelPixels,
  zoomViewAt,
} from './model';
import { type Master, placePhoto, VhsRenderer } from './render';
import {
  assets,
  COMPARE_RANGE,
  docNow,
  dropMissingPhoto,
  edit,
  gesture,
  type PreviewMode,
  prefsNow,
  setPrefs,
  setView,
  useDoc,
  useMissingPhoto,
  usePrefs,
} from './store';
import { S } from './strings';

const PREVIEW_MODES: readonly PreviewMode[] = ['tape', 'gif'];

/** 照片層的快取份數 */
const MASTER_CACHE = 4;
/** 拖曳、滾輪、方向鍵停下來多久之後改回全尺寸（毫秒） */
const SETTLE_MS = 250;
/** 一格的時間（毫秒）：畫一格比這個久時少畫幾格 */
const FRAME_MS = 1000 / TAPE_FPS;

/** 回報畫面在螢幕上的寬（CSS px＝內容寬 × 顯示倍率；錄影帶與 GIF 動畫都是填滿同一個舞台，換模式時差不多） */
function ScaleProbe({ onWidth }: { onWidth: (cssWidth: number) => void }) {
  const view = useStageView();
  const css = view ? view.width * view.scale : 0;
  useEffect(() => {
    if (css > 0) onWidth(css);
  }, [css, onWidth]);
  return null;
}

/** 「錄影帶」目前的那一格與是否在播（PNG 的說明用；每 1/24 秒更新一次） */
const useTapeClock = create<{ t: number; playing: boolean }>(() => ({ t: 0, playing: false }));

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface ScreenHandle {
  /** 播放／暫停目前的預覽 */
  toggle: () => void;
  /** 回到開頭：暫停並停在第一格（目前的預覽） */
  rewind: () => void;
  /** 焦點移到畫面（重設位置之後） */
  focus: () => void;
  /** 「錄影帶」目前這一格的 t（PNG 用） */
  tapeT: () => number;
  /** 停在某個時間（測試、對等驗證用）；mode 不給時是目前的預覽 */
  seek: (t: number, mode?: PreviewMode) => void;
  state: () => {
    mode: PreviewMode;
    t: number;
    playing: boolean;
    drawn: number;
    /** 合成了幾次照片層（快取沒中的次數） */
    composed: number;
    /** 目前是不是以顯示的大小畫（播放中或操作中） */
    live: boolean;
    /** 「GIF 動畫」的格數 */
    frames: number;
  };
}

/* ---------- 畫面（舞台＋播放列） ---------- */

function Screen({ mode, ref }: { mode: PreviewMode; ref: Ref<ScreenHandle> }) {
  const s = useDoc((st) => st.data);
  const animIndex = usePrefs((p) => p.data.animSize);
  const pngIndex = usePrefs((p) => p.data.pngSize);
  const tapePaused = usePrefs((p) => p.data.tapePaused);
  const compare = usePrefs((p) => p.data.compare);
  const compareAt = usePrefs((p) => p.data.compareAt);
  /* 動畫的安排（長度、場景、開場、收尾） */
  const plan = useMemo(() => animPlan(s), [s]);
  const photo = useAssetImage(assets, s.photo?.id);
  const loads = useMemo(() => fontLoads(s), [s]);
  useEnsureFonts(loads);
  const tick = useFontTick();
  const renderer = useMemo(() => new VhsRenderer(), []);

  /* 舞台上的大小（內容座標）：錄影帶＝畫面（1280 寬）、GIF 動畫＝動畫的大小；暫停的錄影帶以 PNG 的大小畫 */
  const size = mode === 'tape' ? screenSize(s.aspect) : animSize(s.aspect, animIndex);
  const png = pngSize(s.aspect, pngIndex);
  const bitmap = photo.bitmap && s.photo ? photo.bitmap : null;

  /* 操作中（拖曳、捏合、滾輪、方向鍵）：停下來 SETTLE_MS 之後才算結束 */
  const [interacting, setInteracting] = useState(false);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const poke = (hold = false) => {
    setInteracting(true);
    if (settle.current) clearTimeout(settle.current);
    settle.current = hold ? null : setTimeout(() => setInteracting(false), SETTLE_MS);
  };
  useEffect(
    () => () => {
      if (settle.current) clearTimeout(settle.current);
    },
    [],
  );
  const [shownWidth, setShownWidth] = useState(640);
  const onWidth = useCallback((v: number) => setShownWidth(v), []);

  /* 播放：錄影帶與 GIF 動畫各一條時間軸；只有目前的模式在播 */
  const tapePrefs = useRef(prefsNow());
  const tape = usePlayback({
    duration: TAPE_LOOP,
    loop: true,
    autoPlay: tapePrefs.current.tapePaused ? false : undefined,
  });
  const gif = usePlayback({ duration: plan.total * GIF_STEP, loop: true, autoPlay: false });
  const pb = useRef({ tape, gif });
  pb.current = { tape, gif };
  const active = mode === 'tape' ? tape : gif;
  /*
   * 錄影帶播放中（或照上次的設定馬上要接著播：切回錄影帶、開頁自動播放的第一格）、操作中：
   * 以顯示的大小畫（含 devicePixelRatio，最多 PNG 的大小）。暫停（記在 prefs）而且沒在操作時才畫全尺寸。
   */
  const live =
    mode === 'tape' && (tape.playing || interacting || (!tapePaused && !reducedMotion()));
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const liveW = Math.min(SCREEN_W, Math.max(64, Math.ceil(shownWidth * dpr)));
  const target =
    mode === 'tape' ? (live ? { width: liveW, height: heightFor(liveW, s.aspect) } : png) : size;
  /* 暫停的錄影帶＝PNG：照片層以 PNG 的寬合成 */
  const masterRes = mode === 'tape' && !live ? png.width : masterWidthFor(target.width);

  /*
   * 照片層的快取（照片、位置、比例、寬度、調色與反轉；最近 MASTER_CACHE 份）。
   * 數位攝影開著時，照片層每一格不同：鍵加上數位攝影的設定與第幾格。
   */
  const masters = useRef(new Map<string, Master>());
  const composed = useRef(0);
  const masterFor = (res: number, t: number): Master | null => {
    if (!bitmap || !s.photo) return null;
    const v = s.view;
    const look = composeLook(s);
    const dg = s.digital.on
      ? `|${JSON.stringify(s.digital)}|${digitalFrameAt(t, s.digital.fps)}`
      : '';
    const key = `${s.photo.id}|${s.aspect}|${v.zoom}|${v.x}|${v.y}|${res}|${look.tone}|${look.brightness}|${look.saturation}|${look.flip}${dg}`;
    const cache = masters.current;
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    const m = composeMaster(renderer, s, bitmap, res, t);
    if (!m) return null;
    composed.current++;
    cache.set(key, m);
    while (cache.size > MASTER_CACHE) cache.delete(cache.keys().next().value as string);
    return m;
  };

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
  /* 播放列的拖曳、←／→：算操作中（以顯示的大小畫，停下來之後才畫全尺寸） */
  const tapeSeek = (t: number) => {
    poke();
    pb.current.tape.onTimeChange(t);
    if (!pb.current.tape.playing) setPrefs({ tapeTime: tapeFrameTime(t) });
  };
  /* 關掉循環、播到最後停下來：記成暫停（之後畫全尺寸） */
  useEffect(() => {
    if (
      mode === 'tape' &&
      !tape.playing &&
      !tape.loop &&
      tape.time >= TAPE_LOOP - 1e-6 &&
      !prefsNow().tapePaused
    )
      setPrefs({ tapePaused: true, tapeTime: tapeFrameTime(tape.time) });
  }, [mode, tape.playing, tape.loop, tape.time]);

  const frameKey = mode === 'tape' ? tapeFrameTime(tape.time) : gifFrameAt(gif.time, plan.total);
  useEffect(() => {
    useTapeClock.setState({ t: tapeFrameTime(tape.time), playing: tape.playing });
  }, [tape.time, tape.playing]);

  /*
   * 畫：播放中、操作中畫一格比一格的時間（1/24 秒）還久時，休息同樣長的時間才畫下一格（主執行緒不被佔滿）；
   * 停下來時一定畫到最新的狀態。在畫面更新之前畫（layout effect）：換大小時畫布會被清空，不會閃一下空白。
   */
  const canvas = useRef<HTMLCanvasElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const nextAllowed = useRef(0);
  const drawn = useRef(0);
  const moving = active.playing || interacting;
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 只用來在字型載好後重畫；masterFor 依 s、bitmap
  useLayoutEffect(() => {
    const c = canvas.current;
    if (!c) return;
    if (moving && performance.now() < nextAllowed.current) return;
    const start = performance.now();
    const src: FrameSource = {
      photo: bitmap,
      res: masterRes,
      master: (t) => masterFor(masterRes, t),
      draft: live,
    };
    if (mode === 'tape') renderInto(renderer, c, s, src, frameKey);
    else renderAnimFrame(renderer, c, s, src, plan, frameKey);
    /* 比較原圖：右邊畫上沒有效果的照片（只在預覽上，匯出不經過這裡） */
    if (compare && bitmap && s.photo) paintOriginal(c, bitmap, s, compareAt);
    const end = performance.now();
    const cost = end - start;
    nextAllowed.current = cost > FRAME_MS ? end + cost : 0;
    drawn.current++;
    c.dataset.frame = String(frameKey);
  }, [
    mode,
    frameKey,
    s,
    plan,
    bitmap,
    tick,
    target.width,
    target.height,
    masterRes,
    moving,
    renderer,
    compare,
    compareAt,
  ]);

  /* 暫停並停在某個時間（錄影帶的暫停與時間一併記進 prefs） */
  const seekPaused = (t: number, m: PreviewMode = mode) => {
    if (m === 'tape') {
      pb.current.tape.pause();
      pb.current.tape.onTimeChange(t);
      setPrefs({ tapePaused: true, tapeTime: tapeFrameTime(t) });
    } else {
      pb.current.gif.pause();
      pb.current.gif.onTimeChange(t);
    }
  };

  useImperativeHandle(ref, () => ({
    toggle: () => {
      if (mode === 'tape') tapePlaying(!pb.current.tape.playing);
      else pb.current.gif.toggle();
    },
    rewind: () => seekPaused(0),
    focus: () => surface.current?.focus(),
    tapeT: () => tapeFrameTime(pb.current.tape.time),
    seek: seekPaused,
    state: () => {
      const p = mode === 'tape' ? pb.current.tape : pb.current.gif;
      return {
        mode,
        t: p.time,
        playing: p.playing,
        drawn: drawn.current,
        composed: composed.current,
        live,
        frames: plan.total,
      };
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
    poke(true);
    pointers.current.set(e.pointerId, toScreen(e.clientX, e.clientY));
    const pts = [...pointers.current.values()];
    if (pts.length === 1) drag.current = { p: pts[0], view: d.view };
    else if (pts.length === 2) {
      drag.current = null;
      pinch.current = mid(pts).d;
    }
  };
  /*
   * 拖曳、捏合、滾輪：同一個畫面更新裡的多次變更合成一次（每次位置變了都要重新合成照片層、重畫）。
   * 還沒套用的位置記在 pendingView，接著的變更以它為準；放開、按鍵之前先套用。
   */
  const pendingView = useRef<PhotoView | null>(null);
  const viewRaf = useRef(0);
  const currentView = (): PhotoView => pendingView.current ?? docNow().view;
  const flushView = () => {
    if (viewRaf.current) cancelAnimationFrame(viewRaf.current);
    viewRaf.current = 0;
    const v = pendingView.current;
    pendingView.current = null;
    if (v) setView(v);
  };
  const queueView = (v: PhotoView) => {
    pendingView.current = v;
    if (!viewRaf.current) viewRaf.current = requestAnimationFrame(flushView);
  };
  useEffect(
    () => () => {
      if (viewRaf.current) cancelAnimationFrame(viewRaf.current);
    },
    [],
  );

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const d = docNow();
    if (!d.photo) return;
    pointers.current.set(e.pointerId, toScreen(e.clientX, e.clientY));
    const pts = [...pointers.current.values()];
    if (pts.length === 1 && drag.current) {
      const from = drag.current;
      queueView(panView(d.photo, box, from.view, pts[0].x - from.p.x, pts[0].y - from.p.y));
    } else if (pts.length >= 2) {
      const m = mid(pts);
      if (pinch.current > 0)
        queueView(zoomViewAt(d.photo, box, currentView(), m.x, m.y, m.d / pinch.current));
      pinch.current = m.d;
    }
  };
  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    flushView();
    const pts = [...pointers.current.values()];
    drag.current = pts.length === 1 ? { p: pts[0], view: docNow().view } : null;
    pinch.current = 0;
    if (!pts.length) {
      gesture.commit();
      poke();
    }
  };

  /* 滾輪：原生的監聽（React 的 wheel 是被動的，擋不住頁面捲動） */
  const boxRef = useRef(box);
  boxRef.current = box;
  /* 滾輪的監聽只掛一次：用到的函式從這裡拿最新的 */
  const wheelOps = useRef({ poke, queueView, currentView });
  wheelOps.current = { poke, queueView, currentView };
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
      const ops = wheelOps.current;
      ops.poke();
      ops.queueView(zoomViewAt(d.photo, b, ops.currentView(), px, py, Math.exp(-dy * WHEEL_ZOOM)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    flushView();
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
    poke();
    setView(next);
  };

  /* GIF 動畫的影格表（播放列的 ←／→ 逐格） */
  const gifTable = useMemo(() => uniformFrames(plan.total, 1 / GIF_STEP), [plan.total]);

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
        <ScaleProbe onWidth={onWidth} />
        <div
          ref={surface}
          role="application"
          aria-label={S.screenLabel}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: 畫面可以用方向鍵移動照片、＋／－ 縮放
          tabIndex={0}
          className={cn(
            'size-full outline-none focus-visible:[outline:calc(2px/var(--stage-scale,1))_solid_var(--focus)]',
            /* 有照片時觸控留給拖曳與捏合；沒有照片時照常捲動頁面 */
            s.photo && 'touch-none',
          )}
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
            width={target.width}
            height={target.height}
            className="block size-full"
            data-testid="vhs-canvas"
            data-mode={mode}
            data-size={`${size.width}x${size.height}`}
            data-live={live ? 'true' : 'false'}
          />
          {compare && s.photo ? <CompareLine at={compareAt} surface={surface} /> : null}
          {s.loop.on && s.photo ? <VanishDot surface={surface} /> : null}
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
          onRewind={() => seekPaused(0, 'tape')}
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
          frames={gifTable}
          fps={Math.round(1 / GIF_STEP)}
          legend={false}
        />
      )}
    </>
  );
}

/** 比較原圖：canvas 的右邊（從 at 起）畫上照片的原樣（依位置、左右反轉，沒有任何效果） */
function paintOriginal(
  c: HTMLCanvasElement,
  photo: CanvasImageSource,
  s: ReturnType<typeof docNow>,
  at: number,
): void {
  const g = c.getContext('2d');
  if (!g || !s.photo) return;
  const x = Math.round(c.width * at);
  g.save();
  g.beginPath();
  g.rect(x, 0, c.width - x, c.height);
  g.clip();
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.fillStyle = '#000';
  g.fillRect(x, 0, c.width - x, c.height);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  placePhoto(g, photo, s.photo, s.view, s.aspect, c.width, s.flip);
  g.restore();
}

/** 指標在畫面上的位置（0～1） */
function pointerAt(el: HTMLElement | null, clientX: number, clientY: number) {
  const r = el?.getBoundingClientRect();
  if (!r?.width || !r.height) return { x: 0.5, y: 0.5 };
  return { x: (clientX - r.left) / r.width, y: (clientY - r.top) / r.height };
}

/** 舞台縮放下維持固定的螢幕大小（px） */
const screenPx = (px: number) => `calc(${px}px / var(--stage-scale, 1))`;

/** 比較原圖的分割線：拖曳或左右方向鍵移動（Shift 移動得多、Home／End 到兩端）；記在瀏覽器（不列入復原） */
function CompareLine({
  at,
  surface,
}: {
  at: number;
  surface: React.RefObject<HTMLDivElement | null>;
}) {
  const clampAt = (v: number) => Math.min(COMPARE_RANGE.max, Math.max(COMPARE_RANGE.min, v));
  const move = (v: number) => setPrefs({ compareAt: Math.round(clampAt(v) * 1000) / 1000 });
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture?.(e.pointerId)) return;
    move(pointerAt(surface.current, e.clientX, e.clientY).x);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const next: Record<string, number> = {
      ArrowLeft: at - step,
      ArrowRight: at + step,
      Home: COMPARE_RANGE.min,
      End: COMPARE_RANGE.max,
    };
    if (!(e.key in next)) return;
    e.preventDefault();
    e.stopPropagation();
    move(next[e.key]);
  };
  const pct = Math.round(at * 100);
  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute top-0 rounded-sm bg-[rgba(0,0,0,0.6)] text-white"
        style={{
          right: `${100 - pct}%`,
          margin: screenPx(6),
          padding: `${screenPx(1)} ${screenPx(6)}`,
          fontSize: screenPx(12),
        }}
      >
        {S.compareLeft}
      </span>
      <span
        aria-hidden
        className="pointer-events-none absolute top-0 rounded-sm bg-[rgba(0,0,0,0.6)] text-white"
        style={{
          left: `${pct}%`,
          margin: screenPx(6),
          padding: `${screenPx(1)} ${screenPx(6)}`,
          fontSize: screenPx(12),
        }}
      >
        {S.compareRight}
      </span>
      <div
        role="slider"
        tabIndex={0}
        aria-label={S.compareLine}
        aria-valuemin={Math.round(COMPARE_RANGE.min * 100)}
        aria-valuemax={Math.round(COMPARE_RANGE.max * 100)}
        aria-valuenow={pct}
        aria-valuetext={`${pct}%`}
        data-testid="compare-line"
        className="absolute top-0 bottom-0 flex cursor-ew-resize touch-none justify-center outline-none focus-visible:[outline:calc(2px/var(--stage-scale,1))_solid_var(--focus)]"
        style={{ left: `${at * 100}%`, width: screenPx(24), marginLeft: screenPx(-12) }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onKeyDown={onKeyDown}
      >
        <span
          aria-hidden
          className="h-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
          style={{ width: screenPx(2) }}
        />
      </div>
    </>
  );
}

/** Screen Loop 的消失點：拖曳或方向鍵移動（1%，Shift 5%）；拖曳一次算一步復原 */
function VanishDot({ surface }: { surface: React.RefObject<HTMLDivElement | null> }) {
  const loop = useDoc((st) => st.data.loop);
  const R = { min: -45, max: 45 };
  const clampV = (v: number) => Math.min(R.max, Math.max(R.min, Math.round(v)));
  const put = (cx: number, cy: number) =>
    edit((d) => {
      d.loop.cx = clampV(cx);
      d.loop.cy = clampV(cy);
    });
  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    gesture.begin();
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (!e.currentTarget.hasPointerCapture?.(e.pointerId)) return;
    const p = pointerAt(surface.current, e.clientX, e.clientY);
    put((p.x - 0.5) * 100, (p.y - 0.5) * 100);
  };
  const onPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.currentTarget.hasPointerCapture?.(e.pointerId))
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    gesture.commit();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 5 : 1;
    const mv: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const m = mv[e.key];
    if (!m) return;
    e.preventDefault();
    e.stopPropagation();
    put(loop.cx + m[0], loop.cy + m[1]);
  };
  return (
    <button
      type="button"
      aria-label={S.vanishHandle(S.vanishText(loop.cx, loop.cy))}
      data-testid="vanish-dot"
      data-at={`${loop.cx},${loop.cy}`}
      className="absolute cursor-move touch-none rounded-full border-white bg-success outline-none focus-visible:[outline:calc(2px/var(--stage-scale,1))_solid_var(--focus)]"
      style={{
        left: `${50 + loop.cx}%`,
        top: `${50 + loop.cy}%`,
        width: screenPx(18),
        height: screenPx(18),
        marginLeft: screenPx(-9),
        marginTop: screenPx(-9),
        borderWidth: screenPx(2),
        boxShadow: `0 0 0 ${screenPx(1)} rgba(0,0,0,0.6)`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    />
  );
}

/** PNG 存哪一格的說明（播放中／暫停在幾秒） */
function PngFrameNote() {
  const t = useTapeClock((c) => c.t);
  const playing = useTapeClock((c) => c.playing);
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
  const missing = useMissingPhoto((m) => m.name);
  /* 照片讀不回來：從內容裡拿掉（回到無訊號，檔名、按鈕一起清掉），提醒留著 */
  useEffect(() => {
    if (photo.status === 'missing' && photoId) dropMissingPhoto(photoId);
  }, [photo.status, photoId]);
  const webpOk = useWebpSupport();
  const handle = useRef<ScreenHandle | null>(null);
  useImperativeHandle(screenRef, () => ({
    toggle: () => handle.current?.toggle(),
    rewind: () => handle.current?.rewind(),
    focus: () => handle.current?.focus(),
    tapeT: () => handle.current?.tapeT() ?? 0,
    seek: (t: number, m?: PreviewMode) => handle.current?.seek(t, m),
    state: () =>
      handle.current?.state() ?? {
        mode: prefs.preview,
        t: 0,
        playing: false,
        drawn: 0,
        composed: 0,
        live: false,
        frames: 0,
      },
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
  const out = outputSize(
    { aspect },
    { format: prefs.format, animSize: prefs.animSize, pngSize: prefs.pngSize },
  );
  /* 影響輸出的設定改了：已完成的結果卡作廢（錄影帶的時間不算，播放中一直在變） */
  const doc = useDoc((st) => st.data);
  const frames = useMemo(() => animPlan(doc).total, [doc]);
  const resetKey = useMemo(
    () => ({
      doc,
      f: prefs.format,
      a: prefs.animSize,
      p: prefs.plays,
      q: prefs.quantize,
      s: prefs.pngSize,
      c: prefs.gifColors,
    }),
    [
      doc,
      prefs.format,
      prefs.animSize,
      prefs.plays,
      prefs.quantize,
      prefs.pngSize,
      prefs.gifColors,
    ],
  );

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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Toggle
          label={S.compare}
          aria-label={S.compareAria}
          checked={prefs.compare && hasPhoto}
          disabled={!hasPhoto}
          onCheckedChange={(v) => setPrefs({ compare: v })}
        />
        <span className="text-xs text-muted">{hasPhoto ? S.compareHint : S.compareNeedsPhoto}</span>
      </div>
      <p className="m-0 px-1 text-xs text-muted" data-testid="preview-hint">
        {hasPhoto ? S.hintPhoto : S.hintNoPhoto}{' '}
        {prefs.preview === 'tape' ? S.hintTape : S.hintGif(frames)}
      </p>
      {missing !== null ? <Notice tone="warning">{S.photoMissing}</Notice> : null}
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
        fixedFpsHint={S.animFrames(frames)}
        loopHint={prefs.format === 'gif' ? S.loopHint : undefined}
        resetKey={resetKey}
        extra={
          prefs.format === 'png' ? (
            <div className="flex min-w-0 flex-col gap-2">
              <Field label={S.pngSizeLabel}>
                <Select
                  value={String(prefs.pngSize)}
                  onValueChange={(v) => setPrefs({ pngSize: Number(v) })}
                  options={PNG_WIDTHS.map((w, i) => {
                    const sz = pngSize(aspect, i);
                    return {
                      value: String(i),
                      label: S.animSizeOption(S.pngSizes[i], sz.width, sz.height, w === SCREEN_W),
                    };
                  })}
                />
              </Field>
              <div className="flex min-w-0 flex-col gap-1">
                <p className="m-0 text-xs text-muted tabular-nums" data-testid="export-size">
                  {S.pngSize(out.width, out.height)}
                </p>
                <PngFrameNote />
              </div>
            </div>
          ) : (
            <div className="flex min-w-0 flex-col gap-2">
              <Field
                label={S.animSize}
                hint={<span data-testid="export-frames">{S.animFrames(frames)}</span>}
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
              {prefs.format === 'gif' ? (
                <Field label={S.gifColors} hint={S.gifColorsHint}>
                  <Select
                    value={String(prefs.gifColors)}
                    onValueChange={(v) => setPrefs({ gifColors: Number(v) })}
                    options={GIF_COLOR_OPTIONS.map((n) => ({
                      value: String(n),
                      label: S.gifColorOption(n, n === GIF_COLORS),
                    }))}
                  />
                </Field>
              ) : null}
            </div>
          )
        }
        onExport={(st, { signal, onProgress }) => {
          const job: ExportJob = {
            format: st.format as ExportFormat,
            animSize: prefsNow().animSize,
            plays: st.plays,
            quantize: st.quantize,
            tapeTime: handle.current?.tapeT() ?? 0,
            pngSize: prefsNow().pngSize,
            gifColors: prefsNow().gifColors,
          };
          return runExport(docNow(), photo.bitmap, job, { signal, onProgress });
        }}
      />
    </>
  );
}
