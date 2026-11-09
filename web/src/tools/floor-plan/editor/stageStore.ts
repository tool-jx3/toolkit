/**
 * 演出的畫面狀態（2026-11-09，F313～F328）：只在這一頁（不存、不列入復原）。演出的資料（藏起來的房間、路線）在地圖裡
 * （`Project.stage`，useProject）；這裡是「現在是不是在演出」「用哪個工具」「出發地」「播放到幾秒」「暫時公開了哪些」。
 *
 * 播放到幾秒由下方的時間軸（StageDock 的 usePlayback）推進，寫進這裡給畫布（controller）與快捷鍵用。
 */
import { create } from 'zustand';
import { type RouteContext, routeContext } from '../model/route';
import { buildTimeline, type StageTimeline, stageContext } from '../model/stage';
import type { Floor, Project } from '../model/types';

export type StageTool = 'hide' | 'route' | 'hand';

/** 播放的控制（時間軸掛上來；沒有掛時 null） */
export interface StagePlayer {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  /** 跳到 t 秒（暫停） */
  seek: (t: number) => void;
  /** 播放下一步就停 */
  next: () => void;
  /** 跳到上一步完成的樣子 */
  prev: () => void;
  /** 回到開頭（回到準備的樣子） */
  rewind: () => void;
  /** 跳到第 k 步完成的樣子 */
  jump: (k: number) => void;
  /** 停下來回到 0 秒（不改演出的畫面的開關；stopPreview 用） */
  reset: () => void;
}

export interface StageUi {
  /** 演出（編輯列的「演出」） */
  on: boolean;
  tool: StageTool;
  /** 移動路線的出發地 */
  start: { floor: string; room: string } | null;
  /** 演出的畫面（PL 用、照時間軸；播放、看某一步、全部公開、暫時公開時） */
  preview: boolean;
  time: number;
  playing: boolean;
  /** 在演出的畫面點了暫時公開的房間（鍵）、樓層（id） */
  openRooms: string[];
  openFloors: string[];
  /** 全部公開（暫時） */
  revealAll: boolean;
  exportOpen: boolean;
  /** 時間軸收起來了 */
  dockClosed: boolean;
  player: StagePlayer | null;
}

export const useStage = create<StageUi>(() => ({
  on: false,
  tool: 'hide',
  start: null,
  preview: false,
  time: 0,
  playing: false,
  openRooms: [],
  openFloors: [],
  revealAll: false,
  exportOpen: false,
  dockClosed: false,
  player: null,
}));

export const setStage = (patch: Partial<StageUi>): void => useStage.setState(patch);

export const stageOn = (): boolean => useStage.getState().on;

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
