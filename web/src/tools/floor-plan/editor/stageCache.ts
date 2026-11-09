/**
 * 演出的計算的快取（2026-11-09，F313～F328；打開演出時才載入）：時間軸以地圖為鍵、路線的計算以樓層為鍵重用。
 */
import { type RouteContext, routeContext } from '../model/route';
import { buildTimeline, type StageTimeline, stageContext } from '../model/stage';
import type { Floor, Project } from '../model/types';

let cache: { p: Project; tl: StageTimeline } | null = null;
let routeCache: { floors: Floor[]; ctx: RouteContext } | null = null;

/**
 * 路線的計算（每一層的導航、上下樓層的連接）：樓層沒有改時用同一份（store 的地圖不會原地改；只改演出時 `floors`
 * 是同一個陣列），連續點房間、自動產生時不必每次重建導航（曲線多的地圖一層要 0.1～0.2 秒）。
 */
export function routeContextOf(p: Project): RouteContext {
  if (routeCache?.floors === p.floors) return routeCache.ctx;
  const ctx = routeContext(p);
  routeCache = { floors: p.floors, ctx };
  return ctx;
}

/** 目前的地圖的時間軸（地圖沒有改時用同一份） */
export function timelineOf(p: Project): StageTimeline {
  if (cache?.p === p) return cache.tl;
  const tl = buildTimeline(p, stageContext(p, routeContextOf(p)));
  cache = { p, tl };
  return tl;
}
