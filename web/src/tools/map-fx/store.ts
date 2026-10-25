/**
 * 狀態與動作（共用的 createFxStore，core/imagefx/store.ts）：內容（自動儲存、可以復原）、偏好（不列入復原）、
 * 選取與編輯區（不儲存）。地圖演出另外有「點選建立路線」「編輯路線的點」的狀態（usePoints，不儲存）與
 * 房間遮罩 ZIP 的「1 格幾 px」（偏好）。
 */
import { create } from 'zustand';
import {
  createFxStore,
  type FxPrefsBase,
  newFrameId,
  STAGE_BGS,
  type StageBg,
} from '@/core/imagefx';
import type { ExportSettings } from '@/ui';
import {
  applyRect,
  canFinishPoints,
  DEFAULT_GRID,
  duplicateFrame,
  type Frame,
  type FrameDefaults,
  type FrameKind,
  initialDefaults,
  initialState,
  insertPoint,
  isPathStyle,
  type MapState,
  makeFrame,
  makePointRoute,
  normalizeDefaults,
  normalizeState,
  type Point,
  type RouteFrame,
  removePoint,
  setRoutePoints,
  snapRange,
  stateAssetIds,
  toPointRoute,
  VIDEO_FPS,
} from './model';

export { type PointerTool, STAGE_BGS, type StageBg } from '@/core/imagefx';

export const TOOL_ID = 'map-fx';
/** 專案檔與自動儲存的資料版本 */
export const DATA_VERSION = 1;

/* ---------- 不列入復原的設定 ---------- */

export interface Prefs extends FxPrefsBase<FrameKind, FrameDefaults> {
  export: ExportSettings;
  /** 房間遮罩 ZIP：1 格幾 px */
  grid: number;
}

export const initialExport = (): ExportSettings => ({
  format: 'png',
  fps: 30,
  plays: 0,
  scale: 1,
  quantize: false,
  colors: 128,
});

export const initialPrefs = (): Prefs => ({
  tool: 'zoom',
  defaults: initialDefaults(),
  guides: true,
  loop: true,
  export: initialExport(),
  stageBg: 'checker',
  grid: DEFAULT_GRID,
});

export const EXPORT_FORMATS = [
  'png',
  'apng',
  'video',
  'xmp4',
  'rooms',
  'steps',
  'layers',
  'sequence',
] as const;
export const APNG_COLORS: readonly number[] = [0, 256, 128, 64];

export function normalizePrefs(raw: unknown): Prefs {
  const d = initialPrefs();
  const p = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Prefs>;
  const e = (
    typeof p.export === 'object' && p.export !== null ? p.export : {}
  ) as Partial<ExportSettings>;
  return {
    tool: (['zoom', 'route', 'redact'] as const).includes(p.tool as FrameKind)
      ? (p.tool as FrameKind)
      : d.tool,
    defaults: normalizeDefaults(p.defaults),
    guides: typeof p.guides === 'boolean' ? p.guides : d.guides,
    loop: typeof p.loop === 'boolean' ? p.loop : d.loop,
    export: {
      format: (EXPORT_FORMATS as readonly string[]).includes(e.format as string)
        ? (e.format as string)
        : d.export.format,
      fps: VIDEO_FPS.includes(e.fps as number) ? (e.fps as number) : d.export.fps,
      plays:
        typeof e.plays === 'number' && Number.isFinite(e.plays)
          ? Math.max(0, Math.min(99, Math.round(e.plays)))
          : d.export.plays,
      scale: 1,
      quantize: false,
      colors: APNG_COLORS.includes(e.colors as number) ? (e.colors as number) : d.export.colors,
    },
    stageBg: STAGE_BGS.includes(p.stageBg as StageBg) ? (p.stageBg as StageBg) : d.stageBg,
    grid: snapRange('grid', p.grid, d.grid),
  };
}

export type PanelTab = 'image' | 'frames' | 'timing';

export const fx = createFxStore<Frame, MapState, Prefs, PanelTab>({
  toolId: TOOL_ID,
  version: DATA_VERSION,
  initialState,
  normalizeState,
  initialPrefs,
  normalizePrefs,
  makeFrame,
  duplicateFrame,
  applyRect,
  assetIds: stateAssetIds,
  tabs: { initial: 'image', frames: 'frames' },
});

export const {
  useDoc,
  gesture,
  docNow,
  edit,
  editMerged,
  historyStep,
  usePrefs,
  prefsNow,
  setPrefs,
  setDefaults,
  useLive,
  requestSeek,
  select,
  assets,
  referencedImages,
  dropMissingImage,
  setImage,
  clearImage,
  frameById,
  insertFrame,
  addFrame,
  updateFrame,
  setFrameRect,
  removeFrame,
  clearFrames,
  duplicate,
  moveFrame,
  resetAll,
} = fx;

/* ---------- 點選建立路線、編輯路線的點（不儲存） ---------- */

export type PointMode =
  | { mode: 'create'; points: Point[] }
  | { mode: 'edit'; id: string; active: number | null };

export const usePoints = create<{ draft: PointMode | null }>(() => ({ draft: null }));

/** 開始點選建立路線（工具換成路線・地點、取消選取） */
export function startPointRoute(): void {
  if (!docNow().image) return;
  select(null);
  setPrefs({ tool: 'route' });
  useLive.setState({ pointer: 'edit' });
  usePoints.setState({ draft: { mode: 'create', points: [] } });
}

/** 點一下加一個點（同一點可以再點：U 字、往返） */
export function addDraftPoint(p: Point): void {
  const d = usePoints.getState().draft;
  if (d?.mode !== 'create') return;
  usePoints.setState({ draft: { mode: 'create', points: [...d.points, { ...p }].slice(0, 64) } });
}

/** 退回上一點 */
export function undoDraftPoint(): void {
  const d = usePoints.getState().draft;
  if (d?.mode !== 'create') return;
  usePoints.setState({ draft: { mode: 'create', points: d.points.slice(0, -1) } });
}

/** 結束（取消建立、結束編輯） */
export function endPointMode(): void {
  usePoints.setState({ draft: null });
}

/** 確定：點夠了就做成一條路線（一步復原），回傳 id */
export function finishPointRoute(): string | null {
  const d = usePoints.getState().draft;
  const s = docNow();
  if (d?.mode !== 'create' || !s.image) return null;
  const route = makePointRoute(
    d.points,
    prefsNow().defaults,
    s.image,
    newFrameId(s.frames.map((f) => f.id)),
  );
  if (!canFinishPoints(route.points)) return null;
  const id = insertFrame(route);
  endPointMode();
  return id;
}

/** 編輯選取的路線的點（拖曳畫出的路線換成點選的） */
export function startEditPoints(id: string): void {
  const { frames, image } = docNow();
  const f = frames.find((x) => x.id === id);
  if (f?.kind !== 'route' || !image) return;
  if (f.shape !== 'points' && !isPathStyle(f.style)) return;
  if (f.shape !== 'points') {
    const pr = toPointRoute(f, image);
    edit((d) => {
      const x = d.frames.find((y) => y.id === id) as RouteFrame | undefined;
      if (x) setRoutePoints(x, pr.points, image);
    });
  }
  select(id, true);
  useLive.setState({ pointer: 'edit' });
  usePoints.setState({ draft: { mode: 'edit', id, active: null } });
}

/** 改點（拖曳中在手勢裡，放開記一步；其他一次一步） */
export function setPoints(id: string, points: Point[]): void {
  const image = docNow().image;
  if (!image) return;
  edit((d) => {
    const f = d.frames.find((x) => x.id === id);
    if (f?.kind === 'route') setRoutePoints(f, points, image);
  });
}

export function routeById(id: string): RouteFrame | null {
  const f = frameById(id);
  return f?.kind === 'route' ? f : null;
}

/** 拿掉一個點（至少留兩個） */
export function deletePoint(id: string, i: number): void {
  const f = routeById(id);
  if (!f || f.points.length <= 2) return;
  setPoints(id, removePoint(f.points, i));
  const d = usePoints.getState().draft;
  if (d?.mode === 'edit') usePoints.setState({ draft: { ...d, active: null } });
}

/** 在第 index 段中間插入一點 */
export function addPointOnSegment(id: string, index: number, p: Point): void {
  const f = routeById(id);
  if (!f) return;
  setPoints(id, insertPoint(f.points, index, p));
  const d = usePoints.getState().draft;
  if (d?.mode === 'edit') usePoints.setState({ draft: { ...d, active: index + 1 } });
}
