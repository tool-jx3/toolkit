/**
 * 時間軸：開場、彈出、動作、結尾四段；會動的框依序或同時動作；運鏡從對象的動作開始拉回全圖。
 * 各框的進度（彈出、動作）、塗黑蓋住的範圍、逐步公開的每一階段、運鏡在某個時刻看的範圍。
 */
import { clamp, clamp01, EASE, type TimelineSegment } from '@/core/timeline';
import { intersects, type Layout, rectInCard, toCanvasRect } from './layout';
import type {
  CameraSettings,
  FrameBase,
  FxDoc,
  Rect,
  RedactDir,
  RedactMode,
  TimingSettings,
  ZoomFrameBase,
} from './types';

/** 工具告訴引擎：哪些框會動（佔動作時間）、哪些框可以當運鏡的對象 */
export interface TimelineKit<F extends FrameBase = FrameBase> {
  /** 會動的框（放大框以外；例如螢光筆、揭開與蓋上的塗黑） */
  isAction(f: F): boolean;
  /** 運鏡的候選（不給＝沒有運鏡） */
  isCameraCandidate?(f: F): boolean;
}

export type PhaseId = 'intro' | 'popup' | 'action' | 'outro';
export const PHASES: readonly PhaseId[] = ['intro', 'popup', 'action', 'outro'];

export interface Window {
  start: number;
  end: number;
}

export interface Timeline {
  phases: Record<PhaseId, Window>;
  total: number;
  /** 會動的框的動作時間（清單順序） */
  windows: Record<string, Window>;
  /** 會動的框的 id（清單順序） */
  actionIds: string[];
  /** 運鏡：拉回全圖的時間與對象（沒有運鏡時 null） */
  camera: (Window & { targetId: string }) | null;
}

/**
 * 運鏡的對象：指定的框；自動或指定的框不在了時，第一個會動的候選，沒有時第一個候選。
 * 運鏡關掉、沒有候選時 null。
 */
export function cameraTarget<F extends FrameBase>(
  frames: readonly F[],
  camera: CameraSettings,
  kit: TimelineKit<F>,
): F | null {
  if (camera.mode !== 'pullback' || !kit.isCameraCandidate) return null;
  const cands = frames.filter(kit.isCameraCandidate);
  if (camera.target !== 'auto') {
    const f = cands.find((x) => x.id === camera.target);
    if (f) return f;
  }
  return cands.find(kit.isAction) ?? cands[0] ?? null;
}

/**
 * 四段依序排列：開場（等待）→ 彈出（所有放大框一起彈出、周圍變暗）→ 動作 → 結尾（停在完成的樣子）。
 * 動作：依序＝會動的框照清單順序一個接一個、每個佔「動作」秒數（動作段＝個數 × 秒數）；同時＝全部一起、動作段＝秒數。
 * 沒有會動的框時動作段照樣是「動作」秒數（自訂）。
 * 運鏡：從對象的動作開始拉回全圖；對象的動作比拉回的時間短時，對象的動作放慢到拉回的時間
 * （依序時後面的框跟著往後）；對象不會動時從動作段的開頭拉回。拉回超過結尾時結尾跟著延長。
 */
export function buildTimeline<F extends FrameBase>(
  timing: TimingSettings,
  frames: readonly F[],
  kit: TimelineKit<F>,
  camera?: CameraSettings,
): Timeline {
  const actionIds = frames.filter(kit.isAction).map((f) => f.id);
  const target = camera ? cameraTarget(frames, camera, kit) : null;
  const pullLen = target && camera ? camera.duration : 0;
  const lenOf = (id: string) =>
    target && id === target.id ? Math.max(timing.action, pullLen) : timing.action;
  const sequential = timing.order === 'sequential';
  const actionLen = !actionIds.length
    ? timing.action
    : sequential
      ? actionIds.reduce((sum, id) => sum + lenOf(id), 0)
      : Math.max(...actionIds.map(lenOf));
  /* 取到微秒（0.1 秒的加總不會變成 4.6999…） */
  const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
  const win = (start: number, len: number): Window => ({ start: r6(start), end: r6(start + len) });
  const intro = win(0, timing.intro);
  const popup = win(intro.end, timing.popup);
  const action = win(popup.end, actionLen);
  const outro = win(action.end, timing.outro);
  const windows: Record<string, Window> = {};
  let at = action.start;
  for (const id of actionIds) {
    windows[id] = win(sequential ? at : action.start, lenOf(id));
    at += lenOf(id);
  }
  let cam: Timeline['camera'] = null;
  if (target) {
    cam = { ...win(windows[target.id]?.start ?? action.start, pullLen), targetId: target.id };
    if (cam.end > outro.end) outro.end = cam.end;
  }
  return {
    phases: { intro, popup, action, outro },
    total: outro.end,
    windows,
    actionIds,
    camera: cam,
  };
}

/** 時間軸的分段色條 */
export function timelineSegments(
  tl: Timeline,
  labels: Record<PhaseId, string>,
  colors?: Partial<Record<PhaseId, string>>,
): TimelineSegment[] {
  return PHASES.filter((id) => tl.phases[id].end > tl.phases[id].start).map((id) => ({
    id,
    label: labels[id],
    start: tl.phases[id].start,
    end: tl.phases[id].end,
    color: colors?.[id],
  }));
}

/** w 之間的進度 0～1（長度 0 時到了就是 1） */
export const windowProgress = (w: Window, t: number): number =>
  w.end <= w.start ? (t >= w.start ? 1 : 0) : clamp01((t - w.start) / (w.end - w.start));

/** 彈出的進度（線性 0～1） */
export const popupProgress = (tl: Timeline, t: number): number =>
  windowProgress(tl.phases.popup, t);

/** 一個框的動作進度（線性 0～1）；不會動的框一律 1 */
export function actionProgress(tl: Timeline, id: string, t: number): number {
  const w = tl.windows[id];
  return w ? windowProgress(w, t) : 1;
}

/** 放大框彈出後的倍率（過衝回彈：中間會略超過再回到設定的倍率） */
export const zoomFactor = (scale: number, p: number): number =>
  p <= 0 ? 1 : p >= 1 ? scale : 1 + (scale - 1) * EASE.back(p);

/** 放大框的外框、陰影與周圍變暗的濃度（緩停） */
export const popupAlpha = (p: number): number => EASE.out(clamp01(p));

/** 會動的框的動作曲線（平滑 S 形） */
export const actionEase = (q: number): number => EASE.smooth(clamp01(q));

/**
 * 塗黑蓋住的範圍（框的比例 [a, b]，沿方向；q＝已經走了多少，已套曲線）：
 * 靜止＝一直全蓋；揭開＝從起點那一側掀開（[q, 1]）；蓋上＝從起點那一側蓋上（[0, q]）。
 */
export function coverSpan(mode: RedactMode, q: number): [number, number] {
  const v = clamp01(q);
  if (mode === 'static') return [0, 1];
  if (mode === 'reveal') return [v, 1];
  return [0, v];
}

/** 塗黑蓋住的樣子：沿方向的範圍與不透明度（fade＝整塊淡出〔揭開〕或淡入〔蓋上〕） */
export interface Cover {
  span: [number, number];
  alpha: number;
}
export function redactCover(mode: RedactMode, dir: RedactDir, q: number): Cover {
  if (dir !== 'fade') return { span: coverSpan(mode, q), alpha: 1 };
  const v = clamp01(q);
  return { span: [0, 1], alpha: mode === 'static' ? 1 : mode === 'reveal' ? 1 - v : v };
}

/* ---------- 各框的進度 ---------- */

/** 每個框在某個時刻的進度：放大框的彈出、會動的框的動作（線性 0～1） */
export interface Progress {
  popup: (z: ZoomFrameBase) => number;
  action: (f: FrameBase) => number;
}

/** 依時間 */
export const timeProgress = (tl: Timeline, t: number): Progress => {
  const p = popupProgress(tl, t);
  return { popup: () => p, action: (f) => actionProgress(tl, f.id, t) };
};

/** 逐步公開的順序：放大框與會動的框，照清單順序（不會動的框一直是做完的樣子，不算一個階段） */
export const stepFrames = <F extends FrameBase>(
  frames: readonly F[],
  isAction: (f: F) => boolean,
): F[] => frames.filter((f) => f.kind === 'zoom' || isAction(f));

/** 第 k 個階段（0＝演出前）：前 k 個框做完、其他的還沒開始 */
export function stepProgress<F extends FrameBase>(
  frames: readonly F[],
  k: number,
  isAction: (f: F) => boolean,
): Progress {
  const done = new Set(
    stepFrames(frames, isAction)
      .slice(0, Math.max(0, k))
      .map((f) => f.id),
  );
  return {
    popup: (z) => (done.has(z.id) ? 1 : 0),
    action: (f) => (isAction(f as F) ? (done.has(f.id) ? 1 : 0) : 1),
  };
}

/* ---------- 運鏡 ---------- */

/** 運鏡一開始看的範圍的中心，離演出開始那一端多遠（畫面寬或高的比例；自訂） */
export const CAMERA_START_INSET = 0.3;

/** 對象在拉回開始時的位置（畫面 px）：在放大框裡時是放大框彈出後的位置 */
export function cameraFocusRect(s: Pick<FxDoc, 'frames'>, layout: Layout, target: FrameBase): Rect {
  const zoom = [...s.frames]
    .reverse()
    .find((f): f is ZoomFrameBase => f.kind === 'zoom' && intersects(f, target));
  return zoom ? rectInCard(zoom, target, layout) : toCanvasRect(layout.shot, target);
}

/**
 * 運鏡在 t 秒看的範圍（畫面 px，寬高比同畫面）；全圖時 null。
 * 拉回前停在「倍率 Z、對準對象」；拉回時倍率以等比（Z^(1−c)）回到 1、中心跟著回到畫面中央，c＝平滑 S 曲線；範圍不超出畫面。
 * 一開始的中心：「框的中央」＝對象的中心；「演出開始的那一端」＝橫向時離左端 0.3 個看到的寬度（不超過框的中心）、直向時離上端。
 */
export function cameraView(
  s: Pick<FxDoc, 'frames' | 'camera'>,
  layout: Layout,
  tl: Timeline,
  t: number,
): Rect | null {
  if (!tl.camera || !s.camera) return null;
  const target = s.frames.find((f) => f.id === tl.camera?.targetId);
  if (!target || target.kind === 'zoom') return null;
  const c = actionEase(windowProgress(tl.camera, t));
  if (c >= 1) return null;
  const { width: W, height: H } = layout.canvas;
  const Z0 = s.camera.zoom;
  const z = Z0 ** (1 - c);
  const vw0 = W / Z0;
  const vh0 = H / Z0;
  const r = cameraFocusRect(s, layout, target);
  let sx = r.x + r.w / 2;
  let sy = r.y + r.h / 2;
  if (s.camera.focus === 'start') {
    if ((target as { dir?: string }).dir !== 'v') sx = Math.min(r.x + vw0 * CAMERA_START_INSET, sx);
    else sy = Math.min(r.y + vh0 * CAMERA_START_INSET, sy);
  }
  sx = clamp(sx, vw0 / 2, W - vw0 / 2);
  sy = clamp(sy, vh0 / 2, H - vh0 / 2);
  const vw = W / z;
  const vh = H / z;
  const k = Z0 > 1 ? (vw - vw0) / (W - vw0) : 1;
  const cx = clamp(sx + (W / 2 - sx) * k, vw / 2, W - vw / 2);
  const cy = clamp(sy + (H / 2 - sy) * k, vh / 2, H - vh / 2);
  return { x: cx - vw / 2, y: cy - vh / 2, w: vw, h: vh };
}

/* ---------- 塗黑的邊界演出 ---------- */

/** 邊界演出的濃度：動作中才有，頭尾各 8% 淡入淡出（自訂） */
export const edgeEnvelope = (q: number): number =>
  q <= 0 || q >= 1 ? 0 : Math.min(1, q / 0.08, (1 - q) / 0.08);
