/**
 * 畫面上要顯示的地圖。
 * - 一般大小（SYNC_MAX_PIXELS 以下）：在 render 裡同步畫好（和改版前相同：狀態一變，同一個事件裡畫布就更新）。
 * - 大地圖：交給 Worker（render.worker.ts）畫，畫面照常可以操作、顯示「正在產生」，畫好之前保留上一張；
 *   連續換設定時只畫最新的一筆（renderQueue.ts）。開不了 Worker 時改在主執行緒、等畫面先顯示「正在產生」再畫。
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { canUseWorker, wrapWorker } from '@/core/worker';
import { isHeavy, MapRenderer, type MapRequest, type RenderedMap, requestKey } from './mapRenderer';
import type { RenderWorkerApi } from './render.worker';
import { type DrawWorker, RenderQueue } from './renderQueue';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function spawnWorker(): DrawWorker | null {
  if (!canUseWorker()) return null;
  try {
    const handle = wrapWorker<RenderWorkerApi>(
      new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' }),
    );
    return { draw: (request) => handle.api.draw(request), terminate: () => handle.terminate() };
  } catch {
    return null;
  }
}

/** 等畫面先畫出一格（顯示「正在產生」）再執行 */
const afterPaint = (fn: () => void) => {
  requestAnimationFrame(() => {
    setTimeout(fn, 0);
  });
};

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
  const latest = useRef({ request, key, heavy });
  latest.current = { request, key, heavy };

  /* 一般大小：同步畫（依 key 快取；StrictMode 的第二次 render 直接拿快取） */
  const sync = useMemo((): Result | null => {
    if (heavy) return null;
    try {
      return { key, map: renderer.render(latest.current.request), error: null };
    } catch (e) {
      return { key, map: null, error: errorText(e) };
    }
  }, [key, heavy, renderer]);

  /* 大地圖：只畫最新的一筆 */
  const [deferred, setDeferred] = useState<Result | null>(null);
  const [queue] = useState(
    () =>
      new RenderQueue({
        spawn: spawnWorker,
        drawHere: (req) => renderer.render(req),
        later: afterPaint,
        wanted: () => (latest.current.heavy ? latest.current.key : null),
        onResult: (k, map, error) => setDeferred({ key: k, map, error }),
      }),
  );
  useEffect(() => () => queue.close(), [queue]);
  useEffect(() => {
    if (heavy) queue.request({ key, request: latest.current.request });
  }, [key, heavy, queue]);

  const shown = useRef<RenderedMap | null>(null);
  const done = heavy && deferred?.key === key ? deferred : null;
  const current = heavy ? done : sync;
  const map = current?.map ?? shown.current;
  useLayoutEffect(() => {
    shown.current = map;
  }, [map]);
  return { map, pending: heavy && !done, error: current?.error ?? null };
}
