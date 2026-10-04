/**
 * 預覽欄：3D 預覽（共用 Viewport3D＋core/three）、重設鏡頭、重新產生、搖一搖、自動旋轉，匯出區與 GLB。
 * 設定改了就重新組場景（不必按「產生」）；只動了偏移、打光、背景、自動旋轉時不必重建。
 * 重建前先蓋上「產生壓克力立牌中…」等遮罩、等它畫上畫面才開始組（大圖算外框時不會無聲地凍住）；
 * 拉桿拖曳、鍵盤連續調整時不每一步都重建，放開或停頓 REBUILD_IDLE_MS 後才重建（規格 F07）。
 */
import { Maximize2, RefreshCw, Vibrate } from 'lucide-react';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Field, Slider, Viewport3D } from '@/ui';
import { exitGyro, getEngine, setEngine } from './actions';
import { ExportArea } from './ExportArea';
import { AcrylicEngine } from './engine';
import { loadImageInfo, useImages } from './media';
import { type Kind, normalizeKind, RANGE, type Settings } from './model';
import { applyLayerOffsets, buildScene } from './scene';
import {
  rebuildHoldMs,
  releaseRebuildHold,
  requestRebuild,
  useSession,
  useSettings,
  useView,
} from './store';
import { S } from './strings';

/** 產生中的遮罩延後多久才淡入（ms）：很快就組好時不閃一下（舊版按產生後固定等 0.1 秒） */
const BUSY_DELAY_MS = 100;

/** 這個種類用到的圖 */
function neededImages(kind: Kind, s: Settings): string[] {
  if (kind === 'stand')
    return [s.stand.front, s.stand.back, s.stand.baseImage].filter(Boolean) as string[];
  if (kind === 'shaker')
    return [
      s.shaker.frame === 'image' ? s.shaker.frameImage : null,
      ...s.shaker.parts.map((p) => p.image),
    ].filter(Boolean) as string[];
  return s.diorama.layers.map((l) => l.image).filter(Boolean) as string[];
}

/** 會改變形狀的設定（偏移、旋轉、打光、背景不算） */
function shapeKey(kind: Kind, s: Settings): string {
  const part =
    kind === 'stand'
      ? s.stand
      : kind === 'shaker'
        ? s.shaker
        : {
            baseMargin: s.diorama.baseMargin,
            gap: s.diorama.gap,
            layers: s.diorama.layers.map((l) => [l.id, l.image]),
          };
  return JSON.stringify([kind, part, s.material]);
}

export function Preview() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const s = useSettings((st) => st.data);
  const kind = normalizeKind(useView((st) => st.data.kind));
  const images = useImages((st) => st.images);
  const { error, busy, exporting, immersive, seed, rebuild } = useSession();
  const lastKind = useRef<Kind | null>(null);
  const lastRebuild = useRef(rebuild);
  /* 上一次組好（或確定組不出來）時的 key：匯出結束時 key 沒變就不重建（搖搖樂的零件留在原地） */
  const built = useRef<string | null>(null);
  /** 等著組的場景：hold＝拉桿還在動（不蓋遮罩）、paint＝遮罩畫上畫面後就組 */
  const [pending, setPending] = useState<{ key: string; phase: 'hold' | 'paint' } | null>(null);
  /** 停頓到了、放開滑鼠時再檢查一次 */
  const [wake, setWake] = useState(0);

  /* 引擎：開頁建立一次（開發模式的 StrictMode 會建兩次：新的引擎要重新組場景） */
  useEffect(() => {
    const e = new AcrylicEngine(canvas.current!);
    setEngine(e);
    built.current = null;
    lastKind.current = null;
    return () => {
      setEngine(null);
      e.dispose();
    };
  }, []);

  /* 用到的圖先讀 */
  const needed = useMemo(() => neededImages(kind, s), [kind, s]);
  useEffect(() => {
    for (const id of needed) void loadImageInfo(id).catch(() => {});
  }, [needed]);

  /* 圖片的狀態只看用到的那幾張 */
  const readiness = needed.map((id) => {
    const e = images[id];
    return e === 'error' ? 'x' : e && e !== 'loading' ? 'o' : '.';
  });
  const key = `${shapeKey(kind, s)}|${readiness.join('')}|${seed}`;
  /* 組場景時用最新的值（組的時機可能晚一兩個畫面） */
  const latest = useRef({ key, kind, seed, rebuild });
  latest.current = { key, kind, seed, rebuild };

  /** 依目前的設定組場景 */
  const runBuild = () => {
    const e = getEngine();
    if (!e) return;
    const { key: k, kind: kd, seed: sd, rebuild: rb } = latest.current;
    const now = useSettings.getState().data;
    const r = buildScene(kd, now, e.prepareTexture, sd);
    const kindChanged = lastKind.current !== kd;
    const forced = lastRebuild.current !== rb;
    if (r.ok) {
      e.setBuild(r.build, kindChanged || forced ? 'always' : 'auto');
      applyLayerOffsets(r.build, now);
      lastKind.current = kd;
      lastRebuild.current = rb;
      built.current = k;
      useSession.setState({ info: r.build.info, error: null, building: false, busy: false });
    } else if (r.error === 'loading') {
      /* 讀圖中：換了種類就先清掉舊的；圖讀好時 key 會變，再組一次 */
      if (kindChanged) e.setBuild(null);
      useSession.setState({ building: true, busy: true, error: null });
    } else {
      e.setBuild(null);
      lastKind.current = null;
      built.current = k;
      useSession.setState({ info: null, error: r.error, building: false, busy: false });
    }
  };

  /* 放開滑鼠（拉桿拖完）：不必等停頓 */
  useEffect(() => {
    const onUp = () => {
      if (releaseRebuildHold()) setWake((n) => n + 1);
    };
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    return () => {
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
    };
  }, []);

  /* 形狀、圖片、種子改變時重建；拉桿還在動時等停頓，匯出中延後 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: wake 只用來在停頓、放開時重新檢查
  useEffect(() => {
    const e = getEngine();
    if (!e || exporting) return;
    if (built.current === key) {
      /* 例如拉桿拖回原本的值：不必重建 */
      setPending(null);
      if (useSession.getState().building) useSession.setState({ building: false, busy: false });
      return;
    }
    if (!useSession.getState().building) useSession.setState({ building: true });
    const wait = rebuildHoldMs();
    if (wait > 0) {
      setPending({ key, phase: 'hold' });
      const t = window.setTimeout(() => setWake((n) => n + 1), wait);
      return () => window.clearTimeout(t);
    }
    setPending({ key, phase: 'paint' });
  }, [key, exporting, wake]);

  /* 遮罩已經在畫面上（這個 effect 在它進 DOM 之後才跑）：下一個畫面畫完才組 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: runBuild 讀的是 ref 裡最新的值
  useEffect(() => {
    if (pending?.phase !== 'paint') return;
    let t = 0;
    const raf = requestAnimationFrame(() => {
      t = window.setTimeout(() => {
        if (useSession.getState().exporting) return;
        if (latest.current.key === pending.key) runBuild();
        setPending((p) => (p === pending ? null : p));
      }, 0);
    });
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [pending]);

  /* 偏移與旋轉（立體透視）：不必重建 */
  useEffect(() => {
    const e = getEngine();
    if (e?.build?.kind === 'diorama') {
      applyLayerOffsets(e.build, s);
      e.view.invalidate();
    }
  }, [s]);

  useEffect(() => {
    getEngine()?.setLight(s.light);
  }, [s.light]);
  useEffect(() => {
    getEngine()?.setSpin(s.spin);
  }, [s.spin]);

  /* 拖曳畫面＝搖晃（搖搖樂） */
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);

  const onKey = (ev: KeyboardEvent<HTMLCanvasElement>) => {
    const e = getEngine();
    if (!e) return;
    const big = ev.shiftKey ? 3 : 1;
    const a = (Math.PI / 18) * big;
    const handled: Record<string, () => void> = {
      ArrowLeft: () => e.view.orbit(a, 0),
      ArrowRight: () => e.view.orbit(-a, 0),
      ArrowUp: () => e.view.orbit(0, a),
      ArrowDown: () => e.view.orbit(0, -a),
      '+': () => e.view.zoom(1.15),
      '=': () => e.view.zoom(1.15),
      '-': () => e.view.zoom(1 / 1.15),
      Home: () => e.resetCamera(),
      ' ': () => e.kick(Math.random() < 0.5 ? 1 : -1),
    };
    const fn = handled[ev.key];
    if (!fn || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.key === ' ' && e.build?.kind !== 'shaker') return;
    ev.preventDefault();
    fn();
  };

  const message = error ? S.err[error] : null;
  const background = s.background.transparent ? null : s.background.color;

  return (
    <div className="flex flex-col gap-3">
      <Viewport3D
        aria-label={S.view.aria}
        canvasRef={canvas}
        background={background}
        busy={
          exporting
            ? S.view.exporting
            : busy || pending?.phase === 'paint'
              ? S.view.building(kind)
              : null
        }
        busyDelay={exporting ? 0 : BUSY_DELAY_MS}
        immersive={immersive}
        onExitImmersive={exitGyro}
        exitLabel={S.shaker.exitGyro}
        canvasLabel={S.view.canvas}
        canvasProps={{
          tabIndex: 0,
          role: 'img',
          onKeyDown: onKey,
          'data-testid': 'acrylic-canvas',
          'data-kind': kind,
          onPointerDown: (ev) => {
            drag.current = { id: ev.pointerId, x: ev.clientX, y: ev.clientY };
          },
          onPointerMove: (ev) => {
            const d = drag.current;
            if (!d || d.id !== ev.pointerId) return;
            getEngine()?.addShake(ev.clientX - d.x, ev.clientY - d.y);
            drag.current = { id: d.id, x: ev.clientX, y: ev.clientY };
          },
          onPointerUp: () => {
            drag.current = null;
          },
          onPointerCancel: () => {
            drag.current = null;
          },
        }}
        overlay={
          message ? (
            <p
              role={error === 'loading' ? 'status' : 'alert'}
              className="m-0 rounded-md bg-surface px-3 py-2 text-sm text-danger shadow-1"
              data-testid="build-error"
            >
              {message}
            </p>
          ) : null
        }
        toolbar={
          <>
            <Button
              size="sm"
              variant="ghost"
              icon={<Maximize2 />}
              onClick={() => getEngine()?.resetCamera()}
              disabled={exporting}
            >
              {S.view.resetCamera}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<RefreshCw />}
              title={S.view.rebuildHint}
              onClick={requestRebuild}
              disabled={exporting}
            >
              {S.view.rebuild}
            </Button>
            {kind === 'shaker' ? (
              <Button
                size="sm"
                variant="ghost"
                icon={<Vibrate />}
                title={S.shaker.kickHint}
                onClick={() => getEngine()?.kick(Math.random() < 0.5 ? 1 : -1)}
                disabled={exporting || !!error}
              >
                {S.shaker.kick}
              </Button>
            ) : null}
          </>
        }
        footer={
          <Field label={S.view.spin} className="min-w-0 flex-1">
            <Slider
              value={s.spin}
              onChange={(v) =>
                useSettings.getState().update((d) => {
                  d.spin = v;
                })
              }
              min={RANGE.spin[0]}
              max={RANGE.spin[1]}
              step={1}
              disabled={exporting}
            />
          </Field>
        }
      />
      <ExportArea kind={kind} />
    </div>
  );
}
