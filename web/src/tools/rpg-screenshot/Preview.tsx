/**
 * 預覽區（規格 1.7、1.8）：舞台（畫面；直接拖曳、滾輪縮放背景圖）、播放與換頁列、提示、共用的匯出區。
 *
 * 預覽平常停在「全部顯示」（＝PNG 的那一格，只是繼續箭頭與選項的游標底色依時間動）；按「播放」從頭逐字打出，
 * 名字、地點、演出文字的開場動畫一起開始。畫圖不經過 React：設定改了在畫面更新前（layout effect）畫一次，
 * 有動畫時以 requestAnimationFrame 一直畫，沒有動畫時停。
 */
import { ChevronLeft, ChevronRight, Copy, Eye, Play, Sparkles } from 'lucide-react';
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
import { useAssetImage } from '@/core/assets';
import { copyImage } from '@/core/files';
import {
  Button,
  cn,
  ExportPanel,
  type ExportPanelHandle,
  type ExportSettings,
  Field,
  IconButton,
  Stage,
  Toggle,
  useToast,
  useWebpSupport,
} from '@/ui';
import {
  animationTable,
  buildImages,
  pngBlob,
  renderFrame,
  runExport,
  type SceneImages,
} from './exporter';
import { ensureFont, fontStack, isFontReady, useFontTick } from './fonts';
import { assetElement, useAssetElement } from './media';
import {
  ANIM_MAX_SCALE,
  type BgView,
  clampView,
  EXPORT_FORMATS,
  type ExportFormat,
  type FrameClocks,
  FULL_CLOCKS,
  isAnimated,
  KEY_STEP,
  KEY_STEP_BIG,
  normalizeState,
  outputSize,
  panView,
  parsePages,
  REPLAY_DELAY,
  type RpgState,
  SCALES,
  screenSize,
  type Token,
  tokenCount,
  tokenize,
  WHEEL_ZOOM,
  zoomView,
} from './model';
import { buildBackground, buildFace, drawScene, overflowPages } from './render';
import { blip } from './sound';
import {
  assets,
  docNow,
  dropMissingImage,
  gesture,
  goPage,
  prefsNow,
  setPrefs,
  setView,
  useDoc,
  useLive,
  usePrefs,
} from './store';
import { S } from './strings';
import { THEMES } from './themes';

const INF = Number.POSITIVE_INFINITY;

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 動畫的狀態（null＝已結束／全部顯示） */
interface AnimState {
  /** 開始逐字打出的時間 */
  typeStart: number | null;
  name: number | null;
  loc: number | null;
  /** 'pending'＝等台詞打完才開始 */
  pop: number | 'pending' | null;
  /** 已打出的字數（音效用） */
  revealed: number;
}

const idleAnim = (): AnimState => ({
  typeStart: null,
  name: null,
  loc: null,
  pop: null,
  revealed: 0,
});

export interface ScreenHandle {
  play: () => void;
  showAll: () => void;
  /** 目前的像素化背景圖、頭像（匯出用） */
  images: () => SceneImages;
  state: () => { playing: boolean; anim: AnimState; drawn: number };
  focus: () => void;
}

/* ---------- 畫面 ---------- */

function Screen({ ref }: { ref: Ref<ScreenHandle> }) {
  const s = useDoc((st) => st.data);
  const page = useLive((l) => l.page);
  const nav = useLive((l) => l.nav);
  const locked = usePrefs((p) => p.data.locked);
  const toast = useToast();
  const bgImg = useAssetImage(assets, s.bg?.id);
  const faceImg = useAssetImage(assets, s.face?.id);
  const tick = useFontTick(s.font);
  const { width: W, height: H } = screenSize(s.ratio);

  /* 圖讀不回來：從內容裡拿掉，提醒留著 */
  useEffect(() => {
    if (bgImg.status === 'missing' && s.bg) dropMissingImage('bg', s.bg.id);
  }, [bgImg.status, s.bg]);
  useEffect(() => {
    if (faceImg.status === 'missing' && s.face) dropMissingImage('face', s.face.id);
  }, [faceImg.status, s.face]);

  /* 像素化（圖、位置、比例、像素化、色調改了才重做） */
  const {
    bg,
    face,
    view,
    ratio,
    pixelSize,
    levels,
    dither,
    tone,
    brightness,
    contrast,
    saturation,
  } = s;
  const bgBitmap = useAssetElement(bg?.id);
  const faceBitmap = useAssetElement(face?.id);
  const bgCanvas = useMemo(
    () =>
      bgBitmap && bg
        ? buildBackground(bgBitmap, {
            ratio,
            view,
            pixelSize,
            levels,
            dither,
            tone,
            brightness,
            contrast,
            saturation,
          })
        : null,
    [bgBitmap, bg, ratio, view, pixelSize, levels, dither, tone, brightness, contrast, saturation],
  );
  const faceCanvas = useMemo(
    () =>
      faceBitmap && face
        ? buildFace(faceBitmap, {
            pixelSize,
            levels,
            dither,
            tone,
            brightness,
            contrast,
            saturation,
          })
        : null,
    [faceBitmap, face, pixelSize, levels, dither, tone, brightness, contrast, saturation],
  );

  /* 這一頁的字（音效、播放的長度） */
  const pageTokens = useMemo(() => {
    const pages = parsePages(s.dialogue, s.speaker);
    const pg = pages[Math.max(0, Math.min(pages.length - 1, page))];
    return tokenize(pg.text, THEMES[s.theme].accent).filter((t) => t.ch !== '\n');
  }, [s.dialogue, s.speaker, s.theme, page]);

  const canvas = useRef<HTMLCanvasElement>(null);
  const anim = useRef<AnimState>(idleAnim());
  const raf = useRef(0);
  const drawn = useRef(0);
  const latest = useRef({ s, page, bgCanvas, faceCanvas, pageTokens });
  latest.current = { s, page, bgCanvas, faceCanvas, pageTokens };

  /** 畫目前的時間；回傳要不要繼續畫下一格 */
  const drawAt = useCallback((now: number): boolean => {
    const c = canvas.current;
    if (!c) return false;
    const L = latest.current;
    const a = anim.current;
    const total = L.pageTokens.length;
    let reveal = INF;
    if (a.typeStart !== null) {
      reveal = Math.min(total, Math.floor((now - a.typeStart) / L.s.typeSpeed));
      if (reveal > a.revealed) {
        const t: Token | undefined = L.pageTokens[reveal - 1];
        const p = prefsNow();
        if (t?.ch.trim() && p.sound) blip(p.pitch);
      }
      a.revealed = reveal;
      if (reveal >= total) {
        a.typeStart = null;
        reveal = INF;
        if (a.pop === 'pending') a.pop = now;
      }
    }
    const clocks: FrameClocks = {
      reveal,
      name: a.name !== null ? now - a.name : INF,
      loc: a.loc !== null ? now - a.loc : INF,
      pop: a.pop === 'pending' ? -1 : a.pop !== null ? now - a.pop : INF,
      blinkOn: true,
    };
    const { width, height } = screenSize(L.s.ratio);
    if (c.width !== width || c.height !== height) {
      c.width = width;
      c.height = height;
    }
    const ctx = c.getContext('2d');
    if (!ctx) return false;
    const still = reducedMotion();
    const res = drawScene(ctx, {
      state: L.s,
      page: L.page,
      bg: L.bgCanvas,
      face: L.faceCanvas,
      font: fontStack(L.s.font),
      clocks,
      now: still ? undefined : now,
    });
    drawn.current++;
    c.dataset.drawn = String(drawn.current);
    c.dataset.playing = a.typeStart !== null ? 'true' : 'false';
    const animating = a.typeStart !== null || a.pop === 'pending' || res.animating;
    return !!L.bgCanvas && (animating || (res.idle && !still));
  }, []);

  const loop = useCallback(
    (now: number) => {
      raf.current = 0;
      if (drawAt(now)) raf.current = requestAnimationFrame(loop);
    },
    [drawAt],
  );
  const kick = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(loop);
  }, [loop]);
  useEffect(
    () => () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    },
    [],
  );

  /* 內容改了：在畫面更新前畫一次，需要時接著動 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 只用來在字型載好後重畫
  useLayoutEffect(() => {
    if (raf.current) {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    }
    if (drawAt(performance.now())) kick();
  }, [s, page, bgCanvas, faceCanvas, pageTokens, tick, drawAt, kick]);

  const play = useCallback(() => {
    if (!latest.current.bgCanvas) {
      toast({ title: S.needBackground, tone: 'warning', replace: true });
      return;
    }
    const now = performance.now();
    anim.current = {
      typeStart: now,
      name: now,
      loc: now,
      pop: latest.current.s.popupWhen === 'with' ? now : 'pending',
      revealed: 0,
    };
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = 0;
    if (drawAt(now)) kick();
  }, [drawAt, kick, toast]);

  const showAll = useCallback(() => {
    anim.current = idleAnim();
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = 0;
    if (drawAt(performance.now())) kick();
  }, [drawAt, kick]);

  /* 換頁：自動播放（下一頁、有背景圖）或全部顯示 */
  const firstNav = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在換頁（nav）時
  useEffect(() => {
    if (firstNav.current) {
      firstNav.current = false;
      return;
    }
    if (useLive.getState().autoplay && latest.current.bgCanvas) play();
    else showAll();
  }, [nav]);

  /* 改了名字、地點、演出文字：約 0.35 秒後在預覽上重播那一段的開場動畫（F51） */
  const replay = useRef<Record<'name' | 'loc' | 'pop', ReturnType<typeof setTimeout> | null>>({
    name: null,
    loc: null,
    pop: null,
  });
  const scheduleReplay = useCallback(
    (which: 'name' | 'loc' | 'pop') => {
      const t = replay.current;
      if (t[which]) clearTimeout(t[which]);
      t[which] = setTimeout(() => {
        t[which] = null;
        anim.current[which] = performance.now();
        kick();
      }, REPLAY_DELAY);
    },
    [kick],
  );
  useEffect(
    () => () => {
      for (const t of Object.values(replay.current)) if (t) clearTimeout(t);
    },
    [],
  );
  const watch = useRef<{ name: string; loc: string; pop: string } | null>(null);
  useEffect(() => {
    const cur = {
      name: `${s.speaker}\u0000${s.nameStyle}`,
      loc: s.location,
      pop: `${s.popups}\u0000${s.popupPos}\u0000${s.popupWhen}`,
    };
    const prev = watch.current;
    watch.current = cur;
    if (!prev) return;
    if (prev.name !== cur.name) scheduleReplay('name');
    if (prev.loc !== cur.loc) scheduleReplay('loc');
    if (prev.pop !== cur.pop) scheduleReplay('pop');
  }, [s.speaker, s.nameStyle, s.location, s.popups, s.popupPos, s.popupWhen, scheduleReplay]);

  /* 字超出訊息視窗的頁（提醒用）；字型載好（tick）後重量 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 只用來在字型載好後重量
  useEffect(() => {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const over = overflowPages(ctx, s, fontStack(s.font), s.face ? s.faceSide : null);
    const prev = useLive.getState().overflow;
    if (prev.join(',') !== over.join(',')) useLive.setState({ overflow: over });
  }, [s, tick]);

  const surface = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({
    play,
    showAll,
    images: () => ({ bg: latest.current.bgCanvas, face: latest.current.faceCanvas }),
    state: () => ({
      playing: anim.current.typeStart !== null,
      anim: { ...anim.current },
      drawn: drawn.current,
    }),
    focus: () => surface.current?.focus(),
  }));

  /* ---------- 背景圖的拖曳、滾輪、鍵盤 ---------- */

  const movable = !!s.bg && !locked;
  const drag = useRef<{ x: number; y: number; view: BgView; id: number } | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const pendingView = useRef<BgView | null>(null);
  const viewRaf = useRef(0);
  const flushView = () => {
    if (viewRaf.current) cancelAnimationFrame(viewRaf.current);
    viewRaf.current = 0;
    const v = pendingView.current;
    pendingView.current = null;
    if (v) setView(v);
  };
  const queueView = (v: BgView) => {
    pendingView.current = v;
    if (!viewRaf.current) viewRaf.current = requestAnimationFrame(flushView);
  };
  useEffect(
    () => () => {
      if (viewRaf.current) cancelAnimationFrame(viewRaf.current);
    },
    [],
  );
  /** 螢幕 px → 畫面 px */
  const toScreen = (dx: number, dy: number) => {
    const r = surface.current?.getBoundingClientRect();
    if (!r?.width || !r.height) return { x: 0, y: 0 };
    return { x: (dx / r.width) * W, y: (dy / r.height) * H };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const d = docNow();
    if (!d.bg || prefsNow().locked || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (drag.current) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    gesture.begin();
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      view: clampView(d.bg, screenSize(d.ratio), d.view),
      id: e.pointerId,
    };
    setGrabbing(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = drag.current;
    if (!g || g.id !== e.pointerId) return;
    const d = docNow();
    if (!d.bg) return;
    const p = toScreen(e.clientX - g.x, e.clientY - g.y);
    queueView(panView(d.bg, screenSize(d.ratio), g.view, p.x, p.y));
  };
  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    const g = drag.current;
    if (!g || g.id !== e.pointerId) return;
    drag.current = null;
    flushView();
    gesture.commit();
    setGrabbing(false);
  };

  /* 滾輪：原生的監聽（React 的 wheel 是被動的，擋不住頁面捲動）；只掛一次，用到的狀態從 store 讀 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: queueView 只用到 ref
  useEffect(() => {
    const el = surface.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const d = docNow();
      if (!d.bg || prefsNow().locked || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      const v = pendingView.current ?? d.view;
      queueView(zoomView(v, v.zoom * (e.deltaY < 0 ? WHEEL_ZOOM : 1 / WHEEL_ZOOM)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const d = docNow();
    if (!d.bg || prefsNow().locked || e.ctrlKey || e.metaKey || e.altKey) return;
    const step = e.shiftKey ? KEY_STEP_BIG : KEY_STEP;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const out = screenSize(d.ratio);
    const mv = moves[e.key];
    let next: BgView | null = null;
    if (mv) next = panView(d.bg, out, clampView(d.bg, out, d.view), mv[0], mv[1]);
    else if (e.key === '+' || e.key === '=') next = zoomView(d.view, d.view.zoom * WHEEL_ZOOM);
    else if (e.key === '-' || e.key === '_') next = zoomView(d.view, d.view.zoom / WHEEL_ZOOM);
    if (!next) return;
    e.preventDefault();
    setView(next, !!mv);
  };

  const hasBg = !!s.bg;
  return (
    <Stage
      width={W}
      height={H}
      pixelated
      fitUpscale
      defaultBackground={{ kind: 'dark' }}
      aria-label={S.previewLabel}
      className="shrink-0"
    >
      <div
        ref={surface}
        role="application"
        aria-label={S.screenLabel}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: 畫面可以用方向鍵移動背景圖、＋／－ 縮放
        tabIndex={0}
        className={cn(
          'relative size-full outline-none focus-visible:[outline:calc(2px/var(--stage-scale,1))_solid_var(--focus)]',
          movable && 'touch-none',
        )}
        style={{ cursor: movable ? (grabbing ? 'grabbing' : 'grab') : 'default' }}
        data-testid="rpg-screen"
        data-view={`${s.view.zoom.toFixed(4)},${s.view.x.toFixed(3)},${s.view.y.toFixed(3)}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
      >
        <canvas
          ref={canvas}
          width={W}
          height={H}
          className="block size-full"
          data-testid="rpg-canvas"
          data-size={`${W}x${H}`}
        />
        {hasBg ? null : <EmptyState />}
      </div>
    </Stage>
  );
}

/** 沒有背景圖時（字的大小不跟著舞台縮放） */
function EmptyState() {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center bg-surface-2 text-center text-muted"
      style={{
        gap: 'calc(12px / var(--stage-scale, 1))',
        padding: 'calc(24px / var(--stage-scale, 1))',
        fontSize: 'calc(14px / var(--stage-scale, 1))',
      }}
      data-testid="empty-state"
    >
      <p
        className="m-0 font-semibold text-fg"
        style={{ fontSize: 'calc(18px / var(--stage-scale, 1))' }}
      >
        {S.emptyTitle}
      </p>
      <p className="m-0 max-w-[36em]">{S.emptyText}</p>
    </div>
  );
}

/* ---------- 播放與換頁列 ---------- */

function Controls({
  onPlay,
  onShowAll,
  onCopy,
  onSample,
}: {
  onPlay: () => void;
  onShowAll: () => void;
  onCopy: () => void;
  onSample: () => void;
}) {
  const dialogue = useDoc((s) => s.data.dialogue);
  const speaker = useDoc((s) => s.data.speaker);
  const hasBg = useDoc((s) => !!s.data.bg);
  const page = useLive((l) => l.page);
  const n = parsePages(dialogue, speaker).length;
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="preview-controls">
      <Button
        variant="primary"
        icon={<Play />}
        onClick={onPlay}
        title={S.playHint}
        disabled={!hasBg}
      >
        {S.play}
      </Button>
      <Button icon={<Eye />} onClick={onShowAll} disabled={!hasBg}>
        {S.showAll}
      </Button>
      {n > 1 ? (
        <div className="flex items-center gap-1" data-testid="pager">
          <IconButton
            label={S.prevPage}
            icon={<ChevronLeft />}
            disabled={page <= 0}
            onClick={() => goPage(page - 1)}
          />
          <span
            className="min-w-12 text-center text-sm tabular-nums text-muted"
            data-testid="page-info"
          >
            <span aria-hidden>{S.pageInfo(page + 1, n)}</span>
            <span className="sr-only">{S.pageAria(page + 1, n)}</span>
          </span>
          <IconButton
            label={S.nextPage}
            icon={<ChevronRight />}
            disabled={page >= n - 1}
            onClick={() => goPage(page + 1, true)}
          />
        </div>
      ) : null}
      <span className="flex-1" />
      {hasBg ? (
        <Button icon={<Copy />} onClick={onCopy} title={S.copyHint}>
          {S.copy}
        </Button>
      ) : (
        <Button icon={<Sparkles />} onClick={onSample}>
          {S.useSample}
        </Button>
      )}
    </div>
  );
}

/* ---------- 預覽區 ---------- */

export function Preview({
  screenRef,
  exportRef,
  onSample,
}: {
  screenRef: Ref<ScreenHandle>;
  exportRef: Ref<ExportPanelHandle>;
  onSample: () => void;
}) {
  const toast = useToast();
  const prefs = usePrefs((p) => p.data);
  const doc = useDoc((st) => st.data);
  const page = useLive((l) => l.page);
  const hasBg = !!doc.bg;
  const webpOk = useWebpSupport();
  const handle = useRef<ScreenHandle | null>(null);
  useImperativeHandle(screenRef, () => ({
    play: () => handle.current?.play(),
    showAll: () => handle.current?.showAll(),
    images: () => handle.current?.images() ?? { bg: null, face: null },
    state: () => handle.current?.state() ?? { playing: false, anim: idleAnim(), drawn: 0 },
    focus: () => handle.current?.focus(),
  }));

  /* 字型的狀態（下載中、失敗） */
  useEffect(() => {
    let alive = true;
    if (isFontReady(doc.font)) {
      useLive.setState({ fontState: 'ready' });
      return;
    }
    useLive.setState({ fontState: 'loading' });
    void ensureFont(doc.font).then((ok) => {
      if (alive) useLive.setState({ fontState: ok ? 'ready' : 'failed' });
    });
    return () => {
      alive = false;
    };
  }, [doc.font]);

  const formats = useMemo(
    () =>
      EXPORT_FORMATS.map((id) => {
        const webpOff = id === 'webp' && !webpOk;
        return {
          id,
          label: S.formats[id],
          description: S.formatDesc[id],
          animated: false,
          supportsLoop: isAnimated(id),
          disabled: !hasBg || webpOff,
          disabledReason: !hasBg ? S.noBackgroundReason : webpOff ? S.webpUnsupported : undefined,
        };
      }),
    [webpOk, hasBg],
  );
  const format = prefs.format;
  const light = format === 'gif-light';
  const maxScale = format === 'png' ? 3 : ANIM_MAX_SCALE;
  const settings: ExportSettings = {
    format,
    fps: 10,
    plays: prefs.plays,
    scale: Math.min(prefs.scale, maxScale),
    quantize: false,
  };
  const screen = screenSize(doc.ratio);
  const lightSize = outputSize(doc.ratio, 'gif-light', 1);
  const resetKey = useMemo(
    () => ({ doc, page, f: format, s: prefs.scale, a: prefs.gifAll, p: prefs.plays }),
    [doc, page, format, prefs.scale, prefs.gifAll, prefs.plays],
  );

  const copy = async () => {
    const imgs = handle.current?.images();
    if (!imgs?.bg) {
      toast({ title: S.needBackground, tone: 'warning', replace: true });
      return;
    }
    const s = docNow();
    const k = Math.min(3, prefsNow().scale);
    const r = await copyImage(pngBlob(s, useLive.getState().page, imgs, k));
    toast(
      r.ok
        ? { title: S.copied, tone: 'success', replace: true }
        : { title: S.copyFailed, tone: 'warning', replace: true },
    );
  };

  return (
    <>
      <Screen ref={handle} />
      <Controls
        onPlay={() => handle.current?.play()}
        onShowAll={() => handle.current?.showAll()}
        onCopy={() => void copy()}
        onSample={onSample}
      />
      <p className="m-0 px-1 text-xs text-muted" data-testid="preview-hint">
        <span className="tabular-nums" data-testid="screen-size">
          {S.sizeNote(screen.width, screen.height)}
        </span>
        {' · '}
        {S.previewHint}
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
            ...(next.format === 'gif-light' || next.format !== format
              ? {}
              : { scale: SCALES.includes(next.scale) ? next.scale : prefsNow().scale }),
          })
        }
        baseSize={light ? undefined : screen}
        scaleOptions={format === 'png' ? SCALES : SCALES.filter((k) => k <= ANIM_MAX_SCALE)}
        sizeWarningBytes={15 * 1024 * 1024}
        sizeWarningHint={S.sizeWarning}
        resetKey={resetKey}
        extra={
          format === 'png' ? null : (
            <div className="flex min-w-0 flex-col gap-2">
              {light ? (
                <p className="m-0 text-xs text-muted tabular-nums" data-testid="light-size">
                  {S.lightSize(lightSize.width, lightSize.height)}
                </p>
              ) : prefs.scale > ANIM_MAX_SCALE ? (
                <p className="m-0 text-xs text-muted">{S.animScaleNote}</p>
              ) : null}
              <Field label={S.allPages} hint={S.allPagesHint} layout="inline">
                <Toggle checked={prefs.gifAll} onCheckedChange={(on) => setPrefs({ gifAll: on })} />
              </Field>
            </div>
          )
        }
        onExport={(st, { signal, onProgress }) =>
          runExport(
            docNow(),
            handle.current?.images() ?? { bg: null, face: null },
            {
              format: st.format as ExportFormat,
              scale:
                st.format === 'png' ? prefsNow().scale : Math.min(prefsNow().scale, ANIM_MAX_SCALE),
              allPages: prefsNow().gifAll,
              plays: st.plays,
              page: useLive.getState().page,
            },
            { signal, onProgress },
          )
        }
      />
    </>
  );
}

/* ---------- 測試入口 ---------- */

declare global {
  interface Window {
    __rpgShot?: unknown;
  }
}

/**
 * 測試與對等驗證用：讀狀態、影格表、用目前的內容另外畫一格（W × H，PNG 的 data URL）。
 * frame(i, { light, allPages })：影格表的第 i 格（縮放之前）；still()：PNG 的那一格（1 倍）。
 */
export function useTestHook(screen: React.RefObject<ScreenHandle | null>) {
  useEffect(() => {
    /** 用目前的內容重新像素化（不靠預覽的快取） */
    const freshImages = async (): Promise<SceneImages> => {
      const s = docNow();
      const bg = s.bg ? await assetElement(s.bg.id) : null;
      const face = s.face ? await assetElement(s.face.id) : null;
      return buildImages(s, bg, face);
    };
    const render = async (clocks: FrameClocks, pageIndex: number, noScanline = false) => {
      const s = docNow();
      await ensureFont(s.font);
      const { width, height } = screenSize(s.ratio);
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      renderFrame(c, s, pageIndex, await freshImages(), clocks, noScanline);
      return c.toDataURL('image/png');
    };
    const blobUrl = (b: Blob) =>
      new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(b);
      });
    window.__rpgShot = {
      doc: () => docNow(),
      prefs: () => prefsNow(),
      /** 測試用：換掉部分內容（整理後套用，一步復原） */
      set: (patch: Partial<RpgState>) =>
        useDoc.getState().replace(normalizeState({ ...docNow(), ...patch })),
      goto: (i: number) => goPage(i),
      live: () => {
        const l = useLive.getState();
        return { page: l.page, overflow: l.overflow, fontState: l.fontState };
      },
      screen: () => screen.current?.state(),
      table: (o: { light: boolean; allPages: boolean }) =>
        animationTable(docNow(), useLive.getState().page, o).map((f) => ({
          page: f.page,
          delay: f.delay,
          clocks: Object.fromEntries(
            Object.entries(f.clocks).map(([k, v]) => [k, v === INF ? 'inf' : v]),
          ),
        })),
      frame: async (i: number, o: { light: boolean; allPages: boolean }) => {
        const t = animationTable(docNow(), useLive.getState().page, o)[i];
        return t ? render(t.clocks, t.page, o.light) : null;
      },
      still: () => render(FULL_CLOCKS, useLive.getState().page),
      /** PNG（同匯出）的 data URL */
      png: async (scale: number) =>
        blobUrl(await pngBlob(docNow(), useLive.getState().page, await freshImages(), scale)),
      total: () => {
        const s = docNow();
        const pages = parsePages(s.dialogue, s.speaker);
        return pages.map((p) => tokenCount(tokenize(p.text, THEMES[s.theme].accent)));
      },
    };
  }, [screen]);
}
