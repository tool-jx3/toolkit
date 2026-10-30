/**
 * 畫面上要顯示的地圖。
 * - 一般大小（SYNC_MAX_PIXELS 以下）：在 render 裡同步畫好（和改版前相同：狀態一變，同一個事件裡畫布就更新）。
 * - 大地圖：交給 Worker（render.worker.ts）畫，畫面照常可以操作、顯示「正在產生」，畫好之前保留上一張。
 *   開不了 Worker 時改在主執行緒、等畫面先顯示「正在產生」再畫。
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { canUseWorker, type WorkerHandle, wrapWorker } from '@/core/worker';
import { isHeavy, MapRenderer, type MapRequest, type RenderedMap, requestKey } from './mapRenderer';
import type { RenderWorkerApi } from './render.worker';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function spawnWorker(): WorkerHandle<RenderWorkerApi> | null {
  if (!canUseWorker()) return null;
  try {
    return wrapWorker<RenderWorkerApi>(
      new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' }),
    );
  } catch {
    return null;
  }
}

interface Result {
  key: string;
  map: RenderedMap | null;
  error: string | null;
}

export function useRenderedMap(request: MapRequest): {
  /** 畫面上要顯示的地圖（大地圖還在畫時是上一張；還沒有任何一張時 null） */
  map: RenderedMap | null;
  /** 大地圖還在畫 */
  pending: boolean;
  error: string | null;
} {
  const [renderer] = useState(() => new MapRenderer());
  const key = requestKey(request);
  const heavy = isHeavy(request.settings);
  const latest = useRef(request);
  latest.current = request;

  /* 一般大小：同步畫（依 key 快取；StrictMode 的第二次 render 直接拿快取） */
  const sync = useMemo((): Result | null => {
    if (heavy) return null;
    try {
      return { key, map: renderer.render(latest.current), error: null };
    } catch (e) {
      return { key, map: null, error: errorText(e) };
    }
  }, [key, heavy, renderer]);

  /* 大地圖：Worker（undefined＝還沒開；null＝開不了，改在主執行緒） */
  const worker = useRef<WorkerHandle<RenderWorkerApi> | null | undefined>(undefined);
  useEffect(
    () => () => {
      worker.current?.terminate();
      worker.current = undefined;
    },
    [],
  );
  const [deferred, setDeferred] = useState<Result | null>(null);
  useEffect(() => {
    if (!heavy) return;
    const req = latest.current;
    let cancelled = false;
    let frame = 0;
    let timer = 0;
    const finish = (map: RenderedMap | null, error: string | null) => {
      if (!cancelled) setDeferred({ key, map, error });
    };
    const onMainThread = () => {
      /* 等畫面先顯示「正在產生」再畫 */
      frame = requestAnimationFrame(() => {
        timer = window.setTimeout(() => {
          if (cancelled) return;
          try {
            finish(renderer.render(req), null);
          } catch (e) {
            finish(null, errorText(e));
          }
        }, 0);
      });
    };
    if (worker.current === undefined) worker.current = spawnWorker();
    const w = worker.current;
    if (w) {
      w.api.draw(req).then(
        (out) => finish({ ...out, request: req }, null),
        (e) => {
          if (cancelled) return;
          /* Worker 本身壞了（載不到等）：之後都在主執行緒畫；畫的途中出錯（例如記憶體不足）就顯示錯誤 */
          if (e instanceof Error && e.name === 'WorkerFailedError') {
            worker.current = null;
            onMainThread();
          } else finish(null, errorText(e));
        },
      );
    } else onMainThread();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [key, heavy, renderer]);

  const shown = useRef<RenderedMap | null>(null);
  const done = heavy && deferred?.key === key ? deferred : null;
  const current = heavy ? done : sync;
  const map = current?.map ?? shown.current;
  useLayoutEffect(() => {
    shown.current = map;
  }, [map]);
  return { map, pending: heavy && !done, error: current?.error ?? null };
}
