/**
 * 預覽欄：3D 預覽（共用 Viewport3D＋core/three）、重設鏡頭、重新產生、搖一搖、自動旋轉，匯出區與 GLB。
 * 設定改了就重新組場景（不必按「產生」）；只動了偏移、打光、背景、自動旋轉時不必重建。
 */
import { Maximize2, RefreshCw, Vibrate } from 'lucide-react';
import { type KeyboardEvent, useEffect, useMemo, useRef } from 'react';
import { Button, Field, Slider, Viewport3D } from '@/ui';
import { exitGyro, getEngine, setEngine } from './actions';
import { ExportArea } from './ExportArea';
import { AcrylicEngine } from './engine';
import { loadImageInfo, useImages } from './media';
import { type Kind, normalizeKind, RANGE, type Settings } from './model';
import { applyLayerOffsets, buildScene } from './scene';
import { requestRebuild, useSession, useSettings, useView } from './store';
import { S } from './strings';

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
  const { error, building, exporting, immersive, seed, rebuild } = useSession();
  const lastKind = useRef<Kind | null>(null);
  const lastRebuild = useRef(rebuild);
  /* 上一次組好（或確定組不出來）時的 key：匯出結束時 key 沒變就不重建（搖搖樂的零件留在原地） */
  const built = useRef<string | null>(null);

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: 形狀、圖片、種子改變時才重建；匯出中延後
  useEffect(() => {
    const e = getEngine();
    if (!e || exporting || built.current === key) return;
    const now = useSettings.getState().data;
    const r = buildScene(kind, now, e.prepareTexture, seed);
    const kindChanged = lastKind.current !== kind;
    const forced = lastRebuild.current !== rebuild;
    if (r.ok) {
      e.setBuild(r.build, kindChanged || forced ? 'always' : 'auto');
      applyLayerOffsets(r.build, now);
      lastKind.current = kind;
      lastRebuild.current = rebuild;
      built.current = key;
      useSession.setState({ info: r.build.info, error: null, building: false });
    } else if (r.error === 'loading') {
      /* 讀圖中：換了種類就先清掉舊的 */
      if (kindChanged) e.setBuild(null);
      useSession.setState({ building: true, error: null });
    } else {
      e.setBuild(null);
      lastKind.current = null;
      built.current = key;
      useSession.setState({ info: null, error: r.error, building: false });
    }
  }, [key, exporting]);

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
        busy={exporting ? S.view.exporting : building ? S.view.building : null}
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
