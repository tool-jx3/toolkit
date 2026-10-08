/**
 * 地圖編輯器的畫布引擎（Fabric 7）：檢視（平移、縮放、觸控）、網格、吸附、作圖工具、格子、手繪、文字、裝飾、
 * 選取與圖層的同步、復原的快照、讀寫地圖資料。React 只管面板，透過這個類別的方法操作畫布，
 * 狀態寫進 stores.ts 的 useEditor（圖層清單、選取、儲存狀態…）。
 */
import {
  ActiveSelection,
  Canvas,
  cache,
  Ellipse,
  FabricImage,
  type FabricObject,
  FabricText,
  Group,
  IText,
  Line,
  Path,
  PencilBrush,
  Point,
  Polygon,
  Polyline,
  Rect,
  Shadow,
  SprayBrush,
  type TMat2D,
  type TPointerEvent,
} from 'fabric';
import { ensureFont } from '@/core/fonts';
import { type MapGrid, type MapGridType, mapGrid, nearestSnap } from '@/core/grid';
import { type CellEntry, type FillResult, floodFill, solidEntry } from '../cellLogic';
import {
  bezierPath,
  boxFromPoints,
  closedBezierPath,
  dashArray,
  type Pt,
  rgbaOf,
  roundedPolyPath,
  splitAlpha,
  styleOfDash,
  thumbSize,
} from '../geometry';
import { CELL_SIZE, MAP_DATA_VERSION, type MapData, type MapPrefs } from '../model';
import {
  type EditorState,
  flashStatus,
  mapPrefsNow,
  setEditor,
  subtoolOf,
  type ToolName,
  useAutoSave,
  useEditor,
  useMapPrefs,
  usePrefs,
} from '../stores';
import { S } from '../strings';
import {
  addCell,
  commitCellLayer,
  eraseCell,
  newCellGroup,
  rebuildCellData,
  syncCellEntries,
} from './cells';
import { createDecorInstance, decorName, setDecorLoadedHandler, setUserDecors } from './decor';
import { History } from './history';
import { asPreview, Hud } from './hud';
import { type MapObj, mapLayers, setupFabric, snapshotWorldPosition } from './objects';
import {
  applyPatternOrigin,
  applyPatternTransform,
  defScale,
  groundFill,
  setPatternLoadedHandler,
  setUserPatterns,
  wallStroke,
} from './patterns';
import { computeSelection, layerRows, textStyleOf } from './sync';

export type Category = 'simple' | 'ground' | 'wall' | 'room';

interface DrawStyle {
  fill: unknown;
  stroke: unknown;
  strokeWidth: number;
  strokeDashArray: number[] | null;
  strokeLineJoin: CanvasLineJoin;
  strokeLineCap: CanvasLineCap;
  namePrefix: string;
  flag: '_isGroundLayer' | '_isWallLayer' | null;
}

/** 兩點作圖（矩形、橢圓、直線、匯出範圍）：第一點、按著沒放、拖曳過沒 */
interface TwoPoint {
  kind: 'rect' | 'ellipse' | 'line' | 'export';
  start: Pt;
  pressed: boolean;
  dragged: boolean;
  downClient: Pt;
}

const DRAG_THRESHOLD = 6;
export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 20;

function cssVar(name: string, fallback: string): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

export class MapEngine {
  readonly canvas: Canvas;
  readonly history: History;
  grid: MapGrid = mapGrid('square', CELL_SIZE);
  gridType: MapGridType = 'square';
  cellSize = CELL_SIZE;
  nextLayerId = 10;
  layerCounters: Record<string, number> = {};

  private host: HTMLElement;
  private box: HTMLDivElement;
  private tool: ToolName = 'select';
  private two: TwoPoint | null = null;
  private points: Pt[] = [];
  private cellStroke: { category: 'simple' | 'ground' } | null = null;
  private snapPt: Pt | null = null;
  private shiftHeld = false;
  private spaceHeld = false;
  private pan: { x: number; y: number } | null = null;
  private touch: { d: number; mx: number; my: number } | null = null;
  private previews: FabricObject[] = [];
  private decorPreview: FabricObject | null = null;
  private decorPreviewKey = '';
  private lastPointer: Pt | null = null;
  private exporting: { grid: boolean } | null = null;
  private loading = false;
  private disposed = false;
  private syncQueued = false;
  private unsubs: (() => void)[] = [];
  /** 已經確認載入的字型（字型｜字重｜文字） */
  private fontsReady = new Set<string>();
  /** 文字編輯前的內容（編輯完比較有沒有改） */
  private textBefore: string | null = null;
  /** 存檔、狀態列的通知 */
  onDirty: (() => void) | null = null;
  /** 在物件上按右鍵（已經選取它；視窗座標） */
  onContextMenu: ((p: Pt) => void) | null = null;

  constructor(host: HTMLElement) {
    this.host = host;
    setupFabric(cssVar('--accent', '#0099ff'));
    /* 自己的容器（React 的 StrictMode 會先建一個再丟掉：丟掉的那個只移除自己的容器） */
    this.box = document.createElement('div');
    this.box.style.position = 'absolute';
    this.box.style.inset = '0';
    host.appendChild(this.box);
    const el = document.createElement('canvas');
    this.box.appendChild(el);
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    this.canvas = new Canvas(el, {
      width: w,
      height: h,
      selection: true,
      preserveObjectStacking: true,
      stopContextMenu: false,
      fireRightClick: false,
      fireMiddleClick: false,
      hoverCursor: 'grab',
      moveCursor: 'grabbing',
      selectionColor: 'rgba(0,153,255,0.12)',
      selectionBorderColor: cssVar('--accent', '#0099ff'),
      targetFindTolerance: 4,
    });
    this.canvas.setViewportTransform([1, 0, 0, 1, Math.round(w / 2), Math.round(h / 2)]);
    this.history = new History({
      snapshot: () => this.snapshot(),
      restore: (s) => this.restoreSnapshot(s),
      changed: (kind, name) => this.historyChanged(kind, name),
    });
    setPatternLoadedHandler(() => this.canvas.requestRenderAll());
    setDecorLoadedHandler(() => this.canvas.requestRenderAll());
    this.bindCanvasEvents();
    this.bindDomEvents();
    this.unsubs.push(
      useMapPrefs.subscribe((s, prev) => {
        if (
          s.gridVisible !== prev.gridVisible ||
          s.gridColor !== prev.gridColor ||
          s.gridLineWidth !== prev.gridLineWidth ||
          s.gridDashArray !== prev.gridDashArray
        )
          this.canvas.requestRenderAll();
        if (s.userPatterns !== prev.userPatterns) setUserPatterns(s.userPatterns);
        if (s.userDecors !== prev.userDecors) setUserDecors(s.userDecors);
        if (this.tool === 'decor') this.refreshDecorPreview();
        if (
          this.tool === 'freehand' &&
          (s.freehandBrush !== prev.freehandBrush ||
            s.freehandWidth !== prev.freehandWidth ||
            s.freehandColor !== prev.freehandColor ||
            s.freehandOpacity !== prev.freehandOpacity ||
            s.freehandDecimation !== prev.freehandDecimation)
        )
          this.applyBrush();
        if (
          s.groundTool !== prev.groundTool ||
          s.wallTool !== prev.wallTool ||
          s.roomTool !== prev.roomTool
        )
          this.resetDraw();
      }),
      usePrefs.subscribe((s, prev) => {
        if (s.data.textFont !== prev.data.textFont) this.canvas.requestRenderAll();
      }),
    );
  }

  /* ================= 生命週期 ================= */

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.history.dispose();
    for (const u of this.unsubs) u();
    setPatternLoadedHandler(null);
    setDecorLoadedHandler(null);
    void this.canvas.dispose().finally(() => {
      this.box.remove();
    });
  }

  resize(w: number, h: number): void {
    if (this.disposed || w < 1 || h < 1) return;
    this.canvas.setDimensions({ width: Math.floor(w), height: Math.floor(h) });
    this.canvas.requestRenderAll();
  }

  /** 開啟地圖（規格 F030、3.5 的讀取後處理） */
  async load(data: MapData): Promise<void> {
    this.loading = true;
    this.history.restoring = true;
    try {
      this.resetDraw();
      this.gridType = data.gridType;
      this.cellSize = data.cellSize || CELL_SIZE;
      this.grid = mapGrid(this.gridType, this.cellSize);
      const { canvas: json, viewportTransform, nextLayerId, layerCounters, ...rest } = data;
      const prefs: MapPrefs = { ...mapPrefsNow(), ...rest } as MapPrefs;
      useMapPrefs.getState().replace(prefs);
      setUserPatterns(prefs.userPatterns);
      setUserDecors(prefs.userDecors);
      this.nextLayerId = nextLayerId || 10;
      this.layerCounters = { ...(layerCounters ?? {}) };
      this.canvas.discardActiveObject();
      await this.canvas.loadFromJSON(json ?? { objects: [] });
      if (this.disposed) return;
      if (viewportTransform) this.canvas.setViewportTransform(viewportTransform as TMat2D);
      else this.resetView();
      this.afterLoad();
      this.setTool('select');
    } finally {
      this.loading = false;
      this.history.restoring = false;
    }
    this.history.clear();
    this.sync();
  }

  /** 讀進來之後：格子圖層重建、房間關快取、預覽的殘留刪掉（舊版 restoreSaveData 的後處理） */
  private afterLoad(): void {
    for (const o of [...this.canvas.getObjects()] as MapObj[]) {
      if (o.isPreview) {
        this.canvas.remove(o);
        continue;
      }
      const g = o instanceof Group ? o : null;
      if (g && (o._isCellLayer || o._isTerrainLayer)) {
        o.set({
          objectCaching: true,
          lockScalingX: true,
          lockScalingY: true,
          lockRotation: true,
          hasControls: false,
        });
        rebuildCellData(o, this.grid);
        commitCellLayer(o, this.grid);
      }
      if (g && o._isFreehandLayer) o.set({ objectCaching: true });
      if (g && o._isRoomGroup) {
        o.set({ objectCaching: false, subTargetCheck: false });
        for (const c of g.getObjects()) c.set({ objectCaching: false });
      }
      /*
       * 一般的物件、裝飾不快取（與作圖的當下相同：描邊的陰影也落在填色上）。快取是否開著不會存進檔案，
       * 舊版重新開啟後會變成快取（外觀和畫的當下不同）；新版一律照作圖時的樣子。群組（混合模式只在群組內）照舊快取。
       */
      if (!g || o._isDecorLayer) o.set({ objectCaching: false });
    }
    this.applyInteractivity();
    for (const t of this.allTexts()) void this.ensureTextFonts(t);
    this.canvas.requestRenderAll();
  }

  /** 畫布上所有的文字（含群組裡的） */
  private allTexts(): IText[] {
    const out: IText[] = [];
    const walk = (list: FabricObject[]) => {
      for (const o of list) {
        if (o instanceof FabricText) out.push(o as IText);
        else if (o instanceof Group) walk(o.getObjects());
      }
    };
    walk(this.canvas.getObjects());
    return out;
  }

  /** 地圖資料（3.1） */
  serialize(): MapData {
    return {
      ...mapPrefsNow(),
      version: MAP_DATA_VERSION,
      cellSize: this.cellSize,
      gridType: this.gridType,
      nextLayerId: this.nextLayerId,
      layerCounters: { ...this.layerCounters },
      viewportTransform: [...this.canvas.viewportTransform],
      canvas: this.canvasJson(),
    };
  }

  private canvasJson(): MapData['canvas'] {
    for (const o of this.canvas.getObjects() as MapObj[]) if (o._isCellLayer) syncCellEntries(o);
    return this.canvas.toObject() as MapData['canvas'];
  }

  /** 一覽用的縮圖：目前看到的畫面（含網格、不含吸附標示與匯出範圍），縮到 400 × 250 以內 */
  thumbnail(): string | null {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (!(w > 0) || !(h > 0)) return null;
    const t = thumbSize(w, h);
    this.exporting = { grid: true };
    try {
      const el = this.canvas.toCanvasElement(t.w / w, {
        filter: (o: FabricObject) => !(o as MapObj).isPreview,
      } as never);
      return el.toDataURL('image/png');
    } catch {
      return null;
    } finally {
      this.exporting = null;
      this.canvas.requestRenderAll();
    }
  }

  /* ================= 復原的快照 ================= */

  private snapshot(): string {
    return JSON.stringify({
      canvas: this.canvasJson(),
      nextLayerId: this.nextLayerId,
      layerCounters: this.layerCounters,
    });
  }

  private async restoreSnapshot(s: string): Promise<void> {
    const data = JSON.parse(s) as {
      canvas: object;
      nextLayerId: number;
      layerCounters: Record<string, number>;
    };
    this.nextLayerId = data.nextLayerId;
    this.layerCounters = { ...(data.layerCounters ?? {}) };
    this.resetDraw();
    const vpt = [...this.canvas.viewportTransform] as TMat2D;
    this.canvas.discardActiveObject();
    await this.canvas.loadFromJSON(data.canvas);
    this.canvas.setViewportTransform(vpt);
    this.afterLoad();
    setEditor({ selectedIds: [] });
    this.sync();
  }

  private historyChanged(kind: 'push' | 'undo' | 'redo' | 'clear', name: string): void {
    const last =
      kind === 'undo'
        ? S.hist.undo(name)
        : kind === 'redo'
          ? S.hist.redo(name)
          : kind === 'push'
            ? name
            : '';
    setEditor({
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      lastAction: last,
    });
    if (kind !== 'clear') this.onDirty?.();
  }

  push(name: string): void {
    this.history.push(name);
  }

  pushDebounced(name: string): void {
    this.history.pushDebounced(name);
    setEditor({ canUndo: true });
    this.onDirty?.();
  }

  async undo(): Promise<void> {
    await this.history.undo();
  }

  async redo(): Promise<void> {
    await this.history.redo();
  }

  /* ================= 檢視 ================= */

  get zoom(): number {
    return this.canvas.getZoom();
  }

  zoomAt(x: number, y: number, zoom: number): void {
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    this.canvas.zoomToPoint(new Point(x, y), z);
    this.afterViewChange();
  }

  /** 以畫面中央縮放（縮放按鈕） */
  zoomBy(factor: number): void {
    this.zoomAt(this.canvas.width / 2, this.canvas.height / 2, this.zoom * factor);
  }

  /** 100%、原點在畫面中央 */
  resetView(): void {
    this.canvas.setViewportTransform([
      1,
      0,
      0,
      1,
      Math.round(this.canvas.width / 2),
      Math.round(this.canvas.height / 2),
    ]);
    this.afterViewChange();
  }

  private panBy(dx: number, dy: number): void {
    const v = [...this.canvas.viewportTransform] as TMat2D;
    v[4] = Math.round(v[4] + dx);
    v[5] = Math.round(v[5] + dy);
    this.canvas.setViewportTransform(v);
    this.afterViewChange();
  }

  private afterViewChange(): void {
    this.snapPt = null;
    this.canvas.requestRenderAll();
    this.queueSync();
  }

  /** 視窗座標 → 世界座標 */
  clientToWorld(clientX: number, clientY: number): Pt {
    const r = this.canvas.upperCanvasEl.getBoundingClientRect();
    const v = this.canvas.viewportTransform;
    return { x: (clientX - r.left - v[4]) / v[0], y: (clientY - r.top - v[5]) / v[3] };
  }

  /** 世界座標 → 視窗座標（測試用） */
  worldToClient(x: number, y: number): Pt {
    const r = this.canvas.upperCanvasEl.getBoundingClientRect();
    const v = this.canvas.viewportTransform;
    return { x: r.left + x * v[0] + v[4], y: r.top + y * v[3] + v[5] };
  }

  /* ================= 畫布事件 ================= */

  private bindCanvasEvents(): void {
    const c = this.canvas;
    c.on('mouse:down', (opt) => this.onDown(opt.e, opt.scenePoint, opt.target));
    c.on('mouse:move', (opt) => this.onMove(opt.e, opt.scenePoint));
    c.on('mouse:up', (opt) => this.onUp(opt.e, opt.scenePoint));
    c.on('mouse:out', () => {
      this.snapPt = null;
      this.lastPointer = null;
      if (this.decorPreview) {
        c.remove(this.decorPreview);
        this.decorPreview = null;
        this.decorPreviewKey = '';
      }
      c.requestRenderAll();
    });
    c.on('after:render', ({ ctx }) => this.drawOverlay(ctx));
    c.on('selection:created', () => this.queueSync());
    c.on('selection:updated', () => this.queueSync());
    c.on('selection:cleared', () => this.queueSync());
    c.on('object:moving', ({ target }) => this.onMoving(target as MapObj));
    c.on('object:modified', ({ target }) => this.onModified(target as MapObj));
    c.on('object:scaling', () => this.queueSync());
    c.on('object:rotating', () => this.queueSync());
    c.on('path:created', (opt) =>
      this.onPathCreated((opt as unknown as { path: FabricObject }).path),
    );
    c.on('text:editing:entered', ({ target }) => {
      this.textBefore = (target as IText).text ?? null;
      this.queueSync();
    });
    c.on('text:editing:exited', ({ target }) => this.onTextExited(target as IText & MapObj));
    c.on('text:selection:changed', () => this.queueSync());
    c.on('text:changed', ({ target }) => this.onTextChanged(target as IText));
  }

  private bindDomEvents(): void {
    const upper = this.canvas.upperCanvasEl;
    const wrapper = this.canvas.wrapperEl;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') this.shiftHeld = true;
      if (e.code === 'Space' && !e.repeat && this.spaceTarget(e.target)) {
        this.spaceHeld = true;
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') this.shiftHeld = false;
      if (e.code === 'Space') this.spaceHeld = false;
    };
    const onBlur = () => {
      this.shiftHeld = false;
      this.spaceHeld = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    /* 平移：空白鍵／Alt＋拖曳、中鍵（先攔下，Fabric 不會開始框選或作圖） */
    const onMouseDown = (e: MouseEvent) => {
      if (!(e.button === 1 || ((this.spaceHeld || e.altKey) && e.button === 0))) return;
      e.preventDefault();
      e.stopPropagation();
      this.pan = { x: e.clientX, y: e.clientY };
      upper.style.cursor = 'move';
      const move = (ev: MouseEvent) => {
        if (!this.pan) return;
        this.panBy(ev.clientX - this.pan.x, ev.clientY - this.pan.y);
        this.pan = { x: ev.clientX, y: ev.clientY };
      };
      const up = () => {
        this.pan = null;
        upper.style.cursor = '';
        window.removeEventListener('mousemove', move, true);
        window.removeEventListener('mouseup', up, true);
      };
      window.addEventListener('mousemove', move, true);
      window.addEventListener('mouseup', up, true);
    };
    wrapper.addEventListener('mousedown', onMouseDown, true);

    /* 滾輪縮放（以游標為中心） */
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey && Math.abs(e.deltaY) < 1) return;
      e.preventDefault();
      const r = upper.getBoundingClientRect();
      this.zoomAt(e.clientX - r.left, e.clientY - r.top, this.zoom * 0.999 ** e.deltaY);
    };
    wrapper.addEventListener('wheel', onWheel, { passive: false });

    /* 右鍵（F063）：瀏覽器的選單一律不出現；選取工具時在物件上才開選單（先選取它） */
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (this.tool !== 'select' || !this.onContextMenu) return;
      const t = this.canvas.findTarget(e).target as MapObj | undefined;
      if (!t) return;
      if (!(t instanceof ActiveSelection)) {
        if (!t._isMapLayer) return;
        if (!this.canvas.getActiveObjects().includes(t)) {
          this.canvas.setActiveObject(t);
          this.canvas.requestRenderAll();
          this.sync();
        }
      }
      this.onContextMenu({ x: e.clientX, y: e.clientY });
    };
    upper.addEventListener('contextmenu', onContextMenu);

    /* 兩指：平移＋縮放（第二指放下時中止進行中的動作；舊版的做法） */
    const dist = (a: Touch, b: Touch) => Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    const mid = (a: Touch, b: Touch) => ({
      x: (a.clientX + b.clientX) / 2,
      y: (a.clientY + b.clientY) / 2,
    });
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length < 2) return;
      if (!this.touch) this.abortInProgress();
      const m = mid(e.touches[0], e.touches[1]);
      this.touch = { d: dist(e.touches[0], e.touches[1]), mx: m.x, my: m.y };
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!this.touch) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.touches.length < 2) return;
      const d = dist(e.touches[0], e.touches[1]);
      const m = mid(e.touches[0], e.touches[1]);
      const r = upper.getBoundingClientRect();
      if (this.touch.d > 0) this.zoomAt(m.x - r.left, m.y - r.top, this.zoom * (d / this.touch.d));
      this.panBy(m.x - this.touch.mx, m.y - this.touch.my);
      this.touch = { d, mx: m.x, my: m.y };
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!this.touch) return;
      e.stopImmediatePropagation();
      if (e.touches.length === 0) this.touch = null;
    };
    upper.addEventListener('touchstart', onTouchStart, { passive: false, capture: true });
    upper.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    upper.addEventListener('touchend', onTouchEnd, { passive: false, capture: true });
    upper.addEventListener('touchcancel', onTouchEnd, { passive: false, capture: true });
    this.unsubs.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      wrapper.removeEventListener('mousedown', onMouseDown, true);
      wrapper.removeEventListener('wheel', onWheel);
      upper.removeEventListener('contextmenu', onContextMenu);
      upper.removeEventListener('touchstart', onTouchStart, true);
      upper.removeEventListener('touchmove', onTouchMove, true);
      upper.removeEventListener('touchend', onTouchEnd, true);
      upper.removeEventListener('touchcancel', onTouchEnd, true);
    });
  }

  /** 空白鍵平移：焦點在頁面本身或畫布上、而且不是在編輯文字時（按鈕、輸入欄上的空白鍵照常） */
  private spaceTarget(target: EventTarget | null): boolean {
    const t = target as HTMLElement | null;
    if (t && t !== document.body && t !== document.documentElement && !this.host.contains(t))
      return false;
    return !this.typing(target);
  }

  private typing(target: EventTarget | null): boolean {
    const t = target as HTMLElement | null;
    if (
      t &&
      (t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT' ||
        t.isContentEditable)
    )
      return true;
    const a = this.canvas.getActiveObject() as IText | undefined;
    return !!a?.isEditing;
  }

  /** 第二指放下：手繪、框選、拖曳、一點後的作圖全部取消 */
  private abortInProgress(): void {
    const c = this.canvas as Canvas & { _currentTransform: unknown; _groupSelector: unknown };
    if (c.isDrawingMode && c.contextTop) {
      const b = c.freeDrawingBrush as unknown as
        | { _points?: unknown[]; _reset?: () => void }
        | undefined;
      if (b) {
        b._points = [];
        b._reset?.();
      }
      c.clearContext(c.contextTop);
    }
    c.discardActiveObject();
    c._currentTransform = null;
    c._groupSelector = null;
    this.two = null;
    this.cellStroke = null;
    this.removePreview();
    c.requestRenderAll();
  }

  /* ================= 網格、吸附標示、匯出範圍 ================= */

  private drawOverlay(ctx: CanvasRenderingContext2D): void {
    const v = this.canvas.viewportTransform;
    const zoom = v[0];
    if (!this.exporting) {
      const S = 18 * zoom;
      this.host.style.backgroundSize = `${S}px ${S}px`;
      this.host.style.backgroundPosition = `${((v[4] % S) + S) % S}px ${((v[5] % S) + S) % S}px`;
    }
    const w = this.canvas.width;
    const h = this.canvas.height;
    const view = {
      left: -v[4] / zoom,
      top: -v[5] / zoom,
      right: (w - v[4]) / zoom,
      bottom: (h - v[5]) / zoom,
    };
    const mp = useMapPrefs.getState();
    const gridOn = mp.gridVisible && (!this.exporting || this.exporting.grid);
    if (gridOn && zoom >= this.grid.minZoom) {
      ctx.save();
      ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5]);
      ctx.strokeStyle = mp.gridColor;
      ctx.lineWidth = mp.gridLineWidth;
      ctx.setLineDash(mp.gridDashArray ?? []);
      ctx.beginPath();
      for (const line of this.grid.gridLines(view)) {
        ctx.moveTo(line[0].x, line[0].y);
        for (let i = 1; i < line.length; i++) ctx.lineTo(line[i].x, line[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }
    if (this.exporting) return;
    const ed = useEditor.getState();
    if (ed.exportMode === 'pick') {
      ctx.save();
      ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5]);
      const r = ed.exportRect;
      const cs = this.cellSize;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      if (r && r.w > 0 && r.h > 0) {
        ctx.rect(
          view.left - cs,
          view.top - cs,
          view.right - view.left + cs * 2,
          r.y - view.top + cs,
        );
        ctx.rect(view.left - cs, r.y, r.x - view.left + cs, r.h);
        ctx.rect(r.x + r.w, r.y, view.right - r.x - r.w + cs, r.h);
        ctx.rect(
          view.left - cs,
          r.y + r.h,
          view.right - view.left + cs * 2,
          view.bottom - r.y - r.h + cs,
        );
        ctx.fill();
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2 / zoom;
        ctx.setLineDash([]);
        ctx.strokeRect(r.x, r.y, r.w, r.h);
      } else {
        ctx.fillRect(
          view.left - cs,
          view.top - cs,
          view.right - view.left + cs * 2,
          view.bottom - view.top + cs * 2,
        );
      }
      ctx.restore();
    }
    if (this.snapPt) {
      const sz = 8 / zoom;
      ctx.save();
      ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5]);
      ctx.strokeStyle = '#00bcd4';
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([]);
      ctx.strokeRect(this.snapPt.x - sz / 2, this.snapPt.y - sz / 2, sz, sz);
      ctx.restore();
    }
  }

  setExporting(v: { grid: boolean } | null): void {
    this.exporting = v;
  }

  /* ================= 吸附 ================= */

  /** 格子的吸附（F037）：吸不到時 null */
  snap(p: Pt, e?: TPointerEvent | null): Pt | null {
    const pr = usePrefs.getState().data;
    if (!pr.snapEnabled || this.shiftHeld || (e as MouseEvent | undefined)?.shiftKey) return null;
    return nearestSnap(this.grid.snapPoints(p.x, p.y), p.x, p.y, 18 / this.zoom, {
      intersection: pr.snapIntersection,
      center: pr.snapCenter,
      midpoint: pr.snapMidpoint,
    });
  }

  /** 已點的頂點（F038）：8 螢幕 px 以內 */
  private snapToPoints(p: Pt, pts: readonly Pt[]): Pt | null {
    const t = 8 / this.zoom;
    let best: Pt | null = null;
    let bd = Number.POSITIVE_INFINITY;
    for (const q of pts) {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < t && d < bd) {
        bd = d;
        best = q;
      }
    }
    return best;
  }

  /* ================= 工具 ================= */

  get activeTool(): ToolName {
    return this.tool;
  }

  subtool() {
    return subtoolOf(this.tool, useMapPrefs.getState());
  }

  /** 切換工具（F024）：取消進行中的作圖、物件能不能點、取消選取、格子／手繪對準最上面的圖層 */
  setTool(tool: ToolName): void {
    this.resetDraw();
    if (useEditor.getState().exportMode === 'pick')
      setEditor({ exportMode: 'off', exportRect: null });
    const c = this.canvas;
    const active = c.getActiveObject() as IText | undefined;
    if (active?.isEditing) active.exitEditing();
    c.isDrawingMode = false;
    this.tool = tool;
    const isSelect = tool === 'select';
    c.selection = isSelect;
    if (!isSelect) c.discardActiveObject();
    this.applyInteractivity();
    if (tool === 'cell') {
      const top = mapLayers(c)
        .reverse()
        .find((o) => o._isCellLayer && !o._isGroundLayer);
      if (top && !useEditor.getState().selectedIds.includes(top._layerId ?? -1))
        setEditor({ selectedIds: [top._layerId ?? -1] });
    }
    if (tool === 'freehand') {
      c.isDrawingMode = true;
      this.applyBrush();
      const top = mapLayers(c)
        .reverse()
        .find((o) => o._isFreehandLayer);
      if (top && !useEditor.getState().selectedIds.includes(top._layerId ?? -1))
        setEditor({ selectedIds: [top._layerId ?? -1] });
    }
    c.defaultCursor = tool === 'text' ? 'text' : tool === 'freehand' ? 'crosshair' : 'default';
    setEditor({ tool });
    c.requestRenderAll();
    this.sync();
  }

  /** 物件能不能點（選取工具：全部；文字工具：只有文字） */
  applyInteractivity(): void {
    const isSelect = this.tool === 'select';
    for (const o of mapLayers(this.canvas)) {
      const on = isSelect || (this.tool === 'text' && !!o._isMapText);
      o.set({ selectable: on, evented: on });
    }
  }

  /** 進行中的作圖全部取消（不含匯出模式） */
  resetDraw(): void {
    this.removePreview();
    this.two = null;
    this.points = [];
    this.cellStroke = null;
    this.snapPt = null;
    if (this.decorPreview) {
      this.canvas.remove(this.decorPreview);
      this.decorPreview = null;
      this.decorPreviewKey = '';
    }
    this.updateFinish();
  }

  private removePreview(): void {
    if (this.previews.length) {
      this.canvas.remove(...this.previews);
      this.previews = [];
    }
  }

  private setPreview(objs: FabricObject[]): void {
    this.removePreview();
    for (const o of objs) asPreview(o);
    this.previews = objs;
    if (objs.length) this.canvas.add(...objs);
  }

  private updateFinish(): void {
    const sub = this.subtool();
    const n = this.points.length;
    let active = false;
    let canFinish = false;
    if (sub === 'path' || sub === 'curve') {
      active = n > 0;
      canFinish = n >= 2;
    } else if (sub === 'polygon' || sub === 'curve-closed') {
      active = n > 0;
      canFinish = n >= 3;
    }
    const f = useEditor.getState().finish;
    if (f.active !== active || f.canFinish !== canFinish)
      setEditor({ finish: { active, canFinish } });
  }

  /* ---------- 樣式 ---------- */

  /** 目前工具的作圖樣式（舊版 getCurrentDrawStyle） */
  currentStyle(): DrawStyle {
    const pr = usePrefs.getState().data;
    const mp = useMapPrefs.getState();
    if (this.tool === 'ground')
      return {
        fill: groundFill(mp.groundPattern),
        stroke: null,
        strokeWidth: 0,
        strokeDashArray: null,
        strokeLineJoin: pr.lineJoin,
        strokeLineCap: pr.lineCap,
        namePrefix: S.prefix.ground,
        flag: '_isGroundLayer',
      };
    if (this.tool === 'wall')
      return {
        fill: '',
        stroke: wallStroke(mp.wallPattern, mp.wallPatternScale),
        strokeWidth: mp.wallThickness || 12,
        strokeDashArray: dashArray(pr.strokeStyle, mp.wallThickness || 12),
        strokeLineJoin: pr.lineJoin,
        strokeLineCap: pr.lineCap,
        namePrefix: S.prefix.wall,
        flag: '_isWallLayer',
      };
    if (this.tool === 'room')
      return {
        fill: groundFill(mp.groundPattern),
        stroke: wallStroke(mp.wallPattern, mp.wallPatternScale),
        strokeWidth: mp.roomWallThickness || 12,
        strokeDashArray: dashArray(
          styleOfDash(mp.roomWallStrokeDashArray),
          mp.roomWallThickness || 12,
        ),
        strokeLineJoin: mp.roomWallStrokeLineJoin,
        strokeLineCap: mp.roomWallStrokeLineCap,
        namePrefix: S.prefix.room,
        flag: null,
      };
    const f = splitAlpha(pr.fill);
    const s = splitAlpha(pr.stroke);
    return {
      fill: rgbaOf(f.hex, f.alpha),
      stroke: rgbaOf(s.hex, s.alpha),
      strokeWidth: pr.strokeWidth,
      strokeDashArray: dashArray(pr.strokeStyle, pr.strokeWidth),
      strokeLineJoin: pr.lineJoin,
      strokeLineCap: pr.lineCap,
      namePrefix: '',
      flag: null,
    };
  }

  /** 預覽的樣式：一般圖形半透明（填色、描邊 × 0.5；多邊形類的填色 × 0.3） */
  private previewStyle(): DrawStyle & { fillSoft: unknown } {
    const st = this.currentStyle();
    if (this.tool === 'ground' || this.tool === 'wall' || this.tool === 'room')
      return { ...st, fillSoft: st.fill };
    const pr = usePrefs.getState().data;
    const f = splitAlpha(pr.fill);
    const s = splitAlpha(pr.stroke);
    return {
      ...st,
      fill: rgbaOf(f.hex, f.alpha * 0.5),
      stroke: rgbaOf(s.hex, s.alpha * 0.5),
      fillSoft: rgbaOf(f.hex, f.alpha * 0.3),
    };
  }

  private shadowFor(o: MapObj): Shadow | null {
    const pr = usePrefs.getState().data;
    const mp = useMapPrefs.getState();
    const on = o._isWallLayer
      ? pr.shadowWall
      : o._isGroundLayer
        ? pr.shadowGround
        : o._isDecorLayer && mp.decorShadowEnabled
          ? true
          : pr.shadowSimple;
    if (!on) return null;
    return new Shadow({
      color: pr.shadowColor,
      blur: pr.shadowBlur,
      offsetX: pr.shadowOffsetX,
      offsetY: pr.shadowOffsetY,
      affectStroke: true,
    });
  }

  /* ================= 新增物件 ================= */

  /**
   * 新增成圖層（舊版 addLayerObject）：編號、名稱「<種類><序號>」、轉角與線端、陰影；不自動選取；記一步。
   */
  addLayerObject(
    typeName: string,
    obj: MapObj,
    opts: { skipHistory?: boolean; index?: number; plain?: boolean } = {},
  ): void {
    const pr = usePrefs.getState().data;
    const id = this.nextLayerId++;
    this.layerCounters[typeName] = (this.layerCounters[typeName] || 0) + 1;
    obj._layerId = id;
    obj._isMapLayer = true;
    obj._layerName = `${typeName}${this.layerCounters[typeName]}`;
    const on = this.tool === 'select' || (this.tool === 'text' && !!obj._isMapText);
    obj.set({ selectable: on, evented: on });
    if (!opts.plain) {
      /* 新增的圖形帶上目前的轉角、線端與陰影（群組、複製、布林運算的結果照原本的） */
      if (!obj._isRoomGroup) obj.set({ strokeLineJoin: pr.lineJoin, strokeLineCap: pr.lineCap });
      const sh = this.shadowFor(obj);
      if (sh && !obj.shadow) obj.set({ shadow: sh });
    }
    if (!this.canvas.getObjects().includes(obj)) {
      if (opts.index !== undefined) this.canvas.insertAt(opts.index, obj);
      else this.canvas.add(obj);
    }
    setEditor({ selectedIds: [] });
    this.canvas.requestRenderAll();
    if (!opts.skipHistory) this.push(S.hist.add(typeName));
    this.queueSync();
  }

  /** 地面、牆壁：插在最上面的同類物件的上一層（舊版 repositionByCategory） */
  private addCategoryLayer(typeName: string, obj: MapObj, flag: DrawStyle['flag']): void {
    if (flag) obj[flag] = true;
    this.snapshotPatternSettings(obj);
    applyPatternOrigin(obj);
    const all = this.canvas.getObjects() as MapObj[];
    const same = flag ? all.filter((o) => o[flag]) : [];
    const index = same.length ? all.indexOf(same[same.length - 1]) + 1 : undefined;
    this.addLayerObject(typeName, obj, { index });
  }

  /** 圖樣的設定記在物件上（之後改工具的設定不影響已經畫好的；舊版 snapshotPatternSettings） */
  private snapshotPatternSettings(obj: MapObj): void {
    const mp = useMapPrefs.getState();
    if (this.tool === 'ground') {
      obj._patternOffsetX = mp.groundPatternOffsetX || 0;
      obj._patternOffsetY = mp.groundPatternOffsetY || 0;
      obj._patternRotation = mp.groundPatternRotation || 0;
      obj._patternScale = defScale(mp.groundPattern.id) * (mp.groundPatternScale ?? 1);
      obj._patternState = { ...mp.groundPattern };
    } else if (this.tool === 'wall') {
      obj._patternOffsetX = mp.wallPatternOffsetX || 0;
      obj._patternOffsetY = mp.wallPatternOffsetY || 0;
      obj._patternRotation = mp.wallPatternRotation || 0;
      obj._patternScale = defScale(mp.wallPattern.id) * (mp.wallPatternScale ?? 1);
      obj._patternState = { ...mp.wallPattern };
    } else {
      obj._patternOffsetX = 0;
      obj._patternOffsetY = 0;
      obj._patternRotation = 0;
      obj._patternScale = 1;
    }
  }

  private roomPatternSettings(obj: MapObj, kind: 'ground' | 'wall'): void {
    const mp = useMapPrefs.getState();
    const state = kind === 'wall' ? mp.wallPattern : mp.groundPattern;
    obj._patternOffsetX = (kind === 'wall' ? mp.wallPatternOffsetX : mp.groundPatternOffsetX) || 0;
    obj._patternOffsetY = (kind === 'wall' ? mp.wallPatternOffsetY : mp.groundPatternOffsetY) || 0;
    obj._patternRotation =
      (kind === 'wall' ? mp.wallPatternRotation : mp.groundPatternRotation) || 0;
    obj._patternScale =
      defScale(state.id) * ((kind === 'wall' ? mp.wallPatternScale : mp.groundPatternScale) ?? 1);
    obj._patternState = { ...state };
  }

  /** 房間：同形狀的地面＋牆組成群組（F102；舊版 addRoom） */
  private addRoom(typeName: string, make: (st: Partial<DrawStyle>) => MapObj | null): void {
    const mp = useMapPrefs.getState();
    const ground = make({
      fill: groundFill(mp.groundPattern),
      stroke: null,
      strokeWidth: 0,
      strokeDashArray: null,
    });
    if (!ground) return;
    ground._isRoomGround = true;
    ground.set({ objectCaching: false });
    this.roomPatternSettings(ground, 'ground');
    snapshotWorldPosition(ground);
    applyPatternOrigin(ground);
    if (mp.roomGroundShadowEnabled)
      ground.set({
        shadow: new Shadow({
          color: mp.roomGroundShadowColor,
          blur: mp.roomGroundShadowBlur,
          offsetX: mp.roomGroundShadowOffsetX,
          offsetY: mp.roomGroundShadowOffsetY,
          affectStroke: true,
        }),
      });
    const wall = make({
      fill: '',
      stroke: wallStroke(mp.wallPattern, mp.wallPatternScale),
      strokeWidth: mp.roomWallThickness || 12,
      strokeLineJoin: mp.roomWallStrokeLineJoin,
      strokeLineCap: mp.roomWallStrokeLineCap,
      strokeDashArray: dashArray(
        styleOfDash(mp.roomWallStrokeDashArray),
        mp.roomWallThickness || 12,
      ),
    });
    if (!wall) return;
    wall._isRoomWall = true;
    wall.set({ objectCaching: false });
    this.roomPatternSettings(wall, 'wall');
    snapshotWorldPosition(wall);
    applyPatternOrigin(wall);
    if (mp.roomWallShadowEnabled)
      wall.set({
        shadow: new Shadow({
          color: mp.roomWallShadowColor,
          blur: mp.roomWallShadowBlur,
          offsetX: mp.roomWallShadowOffsetX,
          offsetY: mp.roomWallShadowOffsetY,
          affectStroke: true,
        }),
      });
    const group = new Group([ground, wall], {
      objectCaching: false,
      subTargetCheck: false,
    }) as unknown as MapObj;
    group._isRoomGroup = true;
    this.addLayerObject(typeName, group);
  }

  /* ================= 指標 ================= */

  private onDown(e: TPointerEvent, sp: Point, target?: FabricObject): void {
    if (this.pan || this.touch) return;
    if ((e as MouseEvent).button === 2) return;
    const p = { x: sp.x, y: sp.y };
    const ed = useEditor.getState();
    if (ed.exportMode === 'pick') {
      this.twoPointDown('export', p, e);
      return;
    }
    if (this.tool === 'decor') {
      void this.placeDecor(p, e);
      return;
    }
    if (this.tool === 'text') {
      this.textDown(p, target);
      return;
    }
    const sub = this.subtool();
    switch (sub) {
      case 'rect':
      case 'ellipse':
      case 'line':
        this.twoPointDown(sub, p, e);
        break;
      case 'path':
      case 'polygon':
      case 'curve':
      case 'curve-closed': {
        const q = this.snapToPoints(p, this.points) ?? this.snap(p, e) ?? p;
        this.points.push({ x: q.x, y: q.y });
        this.updateFinish();
        break;
      }
      case 'cell':
        this.cellDown(p);
        break;
      default:
        break;
    }
  }

  private onMove(e: TPointerEvent, sp: Point): void {
    if (this.pan || this.touch) return;
    const p = { x: sp.x, y: sp.y };
    this.lastPointer = p;
    const cell = this.grid.cellAt(p.x, p.y);
    const cur = useEditor.getState().pointer;
    if (!cur || cur.col !== cell.col || cur.row !== cell.row) setEditor({ pointer: cell });
    if (this.tool === 'decor' && useEditor.getState().exportMode !== 'pick') {
      void this.updateDecorPreview(p, e);
      return;
    }
    const ed = useEditor.getState();
    const sub = this.subtool();
    const snapTools = ['rect', 'ellipse', 'line', 'path', 'polygon', 'curve', 'curve-closed'];
    if (snapTools.includes(sub) || ed.exportMode === 'pick') {
      const editPts = ['path', 'polygon', 'curve', 'curve-closed'].includes(sub) ? this.points : [];
      this.snapPt = this.snapToPoints(p, editPts) ?? this.snap(p, e);
      this.canvas.requestRenderAll();
    } else if (this.snapPt) {
      this.snapPt = null;
      this.canvas.requestRenderAll();
    }
    if (this.two) {
      const me = e as MouseEvent;
      if (this.two.pressed && !this.two.dragged) {
        const cx = 'clientX' in me ? me.clientX : ((e as TouchEvent).touches?.[0]?.clientX ?? 0);
        const cy = 'clientY' in me ? me.clientY : ((e as TouchEvent).touches?.[0]?.clientY ?? 0);
        if (Math.hypot(cx - this.two.downClient.x, cy - this.two.downClient.y) > DRAG_THRESHOLD)
          this.two.dragged = true;
      }
      this.twoPointPreview(this.snap(p, e) ?? p);
      return;
    }
    if (this.points.length && ['path', 'polygon', 'curve', 'curve-closed'].includes(sub)) {
      this.multiPreview(this.snapToPoints(p, this.points) ?? this.snap(p, e) ?? p);
      return;
    }
    if (this.cellStroke) this.cellPaint(p);
  }

  private onUp(e: TPointerEvent, sp: Point): void {
    if (this.pan || this.touch) return;
    const p = { x: sp.x, y: sp.y };
    if (this.two?.pressed) {
      this.two.pressed = false;
      if (this.two.dragged) this.twoPointFinish(this.snap(p, e) ?? p);
      return;
    }
    if (this.cellStroke) this.cellUp();
  }

  /* ---------- 兩點作圖（矩形、橢圓、直線、匯出範圍） ---------- */

  private clientOf(e: TPointerEvent): Pt {
    const me = e as MouseEvent;
    if (typeof me.clientX === 'number') return { x: me.clientX, y: me.clientY };
    const t = (e as TouchEvent).changedTouches?.[0] ?? (e as TouchEvent).touches?.[0];
    return t ? { x: t.clientX, y: t.clientY } : { x: 0, y: 0 };
  }

  private twoPointDown(kind: TwoPoint['kind'], p: Pt, e: TPointerEvent): void {
    const q = this.snap(p, e) ?? p;
    if (!this.two || this.two.kind !== kind) {
      this.two = { kind, start: q, pressed: true, dragged: false, downClient: this.clientOf(e) };
      if (kind === 'export') setEditor({ exportRect: null });
      return;
    }
    this.twoPointFinish(q);
  }

  private twoPointPreview(q: Pt): void {
    const two = this.two;
    if (!two) return;
    if (two.kind === 'export') {
      setEditor({ exportRect: rectOf(two.start, q) });
      this.canvas.requestRenderAll();
      return;
    }
    const ps = this.previewStyle();
    const hud = new Hud(this.zoom, this.cellSize);
    const objs: FabricObject[] = [];
    const strokeOpts = {
      stroke: ps.stroke as string,
      strokeWidth: ps.strokeWidth,
      strokeDashArray: ps.strokeDashArray,
      strokeLineJoin: ps.strokeLineJoin,
      strokeLineCap: ps.strokeLineCap,
    };
    if (two.kind === 'line') {
      if (q.x !== two.start.x || q.y !== two.start.y)
        objs.push(
          new Line([two.start.x, two.start.y, q.x, q.y], {
            ...strokeOpts,
            fill: null as unknown as string,
          }),
        );
      hud.segment(two.start.x, two.start.y, q.x, q.y);
    } else {
      const center = two.kind === 'ellipse' && usePrefs.getState().data.ellipseMode === 'center';
      const b = boxFromPoints(two.start, q, center);
      if (b.w > 0 || b.h > 0) {
        const o =
          two.kind === 'rect'
            ? new Rect({
                left: b.left + b.w / 2,
                top: b.top + b.h / 2,
                width: b.w,
                height: b.h,
                rx: usePrefs.getState().data.cornerRadius,
                ry: usePrefs.getState().data.cornerRadius,
                fill: ps.fill as string,
                ...strokeOpts,
              })
            : new Ellipse({
                left: b.left + b.w / 2,
                top: b.top + b.h / 2,
                rx: b.w / 2,
                ry: b.h / 2,
                fill: ps.fill as string,
                ...strokeOpts,
              });
        this.previewPatternLive(o as MapObj);
        objs.push(o);
      }
      if (center) hud.radius(two.start.x, two.start.y, q.x, q.y);
      else hud.box(b.left, b.top, b.w, b.h);
    }
    this.setPreview([...objs, ...hud.out]);
  }

  /** 預覽的圖樣對齊（目前工具的圖樣細節；房間是地面、牆各自的） */
  private previewPatternLive(o: MapObj): void {
    const mp = useMapPrefs.getState();
    const g = {
      offX: mp.groundPatternOffsetX || 0,
      offY: mp.groundPatternOffsetY || 0,
      deg: mp.groundPatternRotation || 0,
      scale: defScale(mp.groundPattern.id) * (mp.groundPatternScale ?? 1),
    };
    const w = {
      offX: mp.wallPatternOffsetX || 0,
      offY: mp.wallPatternOffsetY || 0,
      deg: mp.wallPatternRotation || 0,
      scale: defScale(mp.wallPattern.id) * (mp.wallPatternScale ?? 1),
    };
    if (this.tool === 'room') {
      /* 房間的預覽是一個物件同時有地面的填色與牆的線條；地面以內緣（不含線寬）對齊 */
      const hsw = (o.strokeWidth || 0) / 2;
      applyPatternTransform(o, { ...g, offX: g.offX - hsw, offY: g.offY - hsw }, w);
      return;
    }
    applyPatternTransform(o, this.tool === 'wall' ? w : g, this.tool === 'wall' ? w : g);
  }

  private twoPointFinish(q: Pt): void {
    const two = this.two;
    this.two = null;
    if (!two) return;
    this.removePreview();
    if (two.kind === 'export') {
      const r = rectOf(two.start, q);
      if (r.w < 5 || r.h < 5) {
        setEditor({ exportRect: null });
        this.canvas.requestRenderAll();
        return;
      }
      setEditor({ exportRect: r, exportMode: 'dialog' });
      this.canvas.requestRenderAll();
      return;
    }
    const st = this.currentStyle();
    const pr = usePrefs.getState().data;
    if (two.kind === 'line') {
      if (q.x === two.start.x && q.y === two.start.y) return;
      const line = new Line([two.start.x, two.start.y, q.x, q.y], {
        stroke: st.stroke as string,
        strokeWidth: st.strokeWidth,
        strokeLineCap: st.strokeLineCap,
        strokeDashArray: st.strokeDashArray,
        fill: null as unknown as string,
        objectCaching: false,
      }) as unknown as MapObj;
      this.addCategoryLayer(st.namePrefix + S.tools.line, line, st.flag);
      return;
    }
    const center = two.kind === 'ellipse' && pr.ellipseMode === 'center';
    const b = boxFromPoints(two.start, q, center);
    if (!(b.w > 2 && b.h > 2)) return;
    const cx = b.left + b.w / 2;
    const cy = b.top + b.h / 2;
    const name = two.kind === 'rect' ? S.tools.rect : S.tools.ellipse;
    const make = (style: Partial<DrawStyle>) =>
      (two.kind === 'rect'
        ? new Rect({
            left: cx,
            top: cy,
            width: b.w,
            height: b.h,
            rx: pr.cornerRadius,
            ry: pr.cornerRadius,
            ...(style as object),
            objectCaching: false,
          })
        : new Ellipse({
            left: cx,
            top: cy,
            rx: b.w / 2,
            ry: b.h / 2,
            ...(style as object),
            objectCaching: false,
          })) as unknown as MapObj;
    if (this.tool === 'room') {
      this.addRoom(S.prefix.room + name, make);
      return;
    }
    const obj = make({
      fill: st.fill,
      stroke: st.stroke,
      strokeWidth: st.strokeWidth,
      strokeDashArray: st.strokeDashArray,
      strokeLineJoin: st.strokeLineJoin,
      strokeLineCap: st.strokeLineCap,
    });
    this.addCategoryLayer(st.namePrefix + name, obj, st.flag);
  }

  /* ---------- 折線、多邊形、曲線、封閉曲線 ---------- */

  private multiPreview(q: Pt): void {
    const sub = this.subtool();
    const ps = this.previewStyle();
    const pr = usePrefs.getState().data;
    const pts = [...this.points, q];
    const hud = new Hud(this.zoom, this.cellSize);
    const base = {
      stroke: ps.stroke as string,
      strokeWidth: ps.strokeWidth,
      strokeDashArray: ps.strokeDashArray,
      strokeLineJoin: ps.strokeLineJoin,
      strokeLineCap: ps.strokeLineCap,
    };
    const last = this.points[this.points.length - 1];
    let shape: FabricObject | null = null;
    if (sub === 'path') {
      const fill = this.tool === 'room' ? (ps.fill as string) : '';
      const d = roundedPolyPath(pts, false, pr.cornerRadius);
      shape = d ? new Path(d, { ...base, fill }) : new Polyline(pts, { ...base, fill });
      hud.segment(last.x, last.y, q.x, q.y);
    } else if (sub === 'polygon') {
      const fill = (ps.fillSoft ?? ps.fill) as string;
      const d = roundedPolyPath(pts, true, pr.cornerRadius);
      shape = d ? new Path(d, { ...base, fill }) : new Polygon(pts, { ...base, fill });
      hud.segment(last.x, last.y, q.x, q.y);
    } else {
      const closed = sub === 'curve-closed';
      const d = closed ? closedBezierPath(pts) : bezierPath(pts);
      const fill =
        this.tool === 'room'
          ? (ps.fill as string)
          : closed
            ? ((ps.fillSoft ?? ps.fill) as string)
            : '';
      if (d) shape = new Path(d, { ...base, fill });
      hud.segment(last.x, last.y, q.x, q.y, false);
      hud.controlPolygon(this.points, q, closed);
    }
    if (shape) this.previewPatternLive(shape as MapObj);
    this.setPreview(shape ? [shape, ...hud.out] : hud.out);
  }

  /** 完成折線類的作圖（Enter、確定；F077）；沒有可以完成的時 false */
  finishDraw(): boolean {
    const sub = this.subtool();
    const pts = this.points.map((p) => ({ x: p.x, y: p.y }));
    const n = pts.length;
    const pr = usePrefs.getState().data;
    const room = this.tool === 'room';
    const st = this.currentStyle();
    const stroke = {
      stroke: st.stroke,
      strokeWidth: st.strokeWidth,
      strokeDashArray: st.strokeDashArray,
      strokeLineJoin: st.strokeLineJoin,
      strokeLineCap: st.strokeLineCap,
      objectCaching: false,
    };
    if (sub === 'path' && n >= 2) {
      this.removePreview();
      if (room)
        this.addRoom(S.prefix.room + S.tools.path, (style) => {
          const isWall = (style.strokeWidth || 0) > 0;
          const d = roundedPolyPath(pts, isWall ? false : 'fill', pr.cornerRadius);
          const o = { ...(style as object), objectCaching: false } as Record<string, unknown>;
          if (isWall) o.fill = '';
          return (d
            ? new Path(d, o)
            : isWall
              ? new Polyline(pts, o)
              : new Polygon(pts, o)) as unknown as MapObj;
        });
      else {
        const d = roundedPolyPath(pts, false, pr.cornerRadius);
        const o = { ...stroke, fill: '' } as Record<string, unknown>;
        const obj = (d ? new Path(d, o) : new Polyline(pts, o)) as unknown as MapObj;
        this.addCategoryLayer(st.namePrefix + S.tools.path, obj, st.flag);
      }
    } else if (sub === 'polygon' && n >= 3) {
      this.removePreview();
      if (room)
        this.addRoom(S.prefix.room + S.tools.polygon, (style) => {
          const d = roundedPolyPath(pts, true, pr.cornerRadius);
          const o = { ...(style as object), objectCaching: false } as Record<string, unknown>;
          return (d ? new Path(d, o) : new Polygon(pts, o)) as unknown as MapObj;
        });
      else {
        const d = roundedPolyPath(pts, true, pr.cornerRadius);
        const o = { ...stroke, fill: st.fill } as Record<string, unknown>;
        const obj = (d ? new Path(d, o) : new Polygon(pts, o)) as unknown as MapObj;
        this.addCategoryLayer(st.namePrefix + S.tools.polygon, obj, st.flag);
      }
    } else if (sub === 'curve' && n >= 2) {
      this.removePreview();
      const d = bezierPath(pts);
      if (room)
        this.addRoom(S.prefix.room + S.tools.curve, (style) => {
          const isWall = (style.strokeWidth || 0) > 0;
          const o = { ...(style as object), objectCaching: false } as Record<string, unknown>;
          if (isWall) o.fill = '';
          return new Path(d, o) as unknown as MapObj;
        });
      else
        this.addCategoryLayer(
          st.namePrefix + S.tools.curve,
          new Path(d, { ...stroke, fill: '' } as Record<string, unknown>) as unknown as MapObj,
          st.flag,
        );
    } else if (sub === 'curve-closed' && n >= 3) {
      this.removePreview();
      const d = closedBezierPath(pts);
      if (room)
        this.addRoom(
          S.prefix.room + S.tools['curve-closed'],
          (style) =>
            new Path(d, { ...(style as object), objectCaching: false }) as unknown as MapObj,
        );
      else
        this.addCategoryLayer(
          st.namePrefix + S.tools['curve-closed'],
          new Path(d, { ...stroke, fill: st.fill } as Record<string, unknown>) as unknown as MapObj,
          st.flag,
        );
    } else return false;
    this.points = [];
    this.updateFinish();
    return true;
  }

  /** 取消作圖（Esc、取消；匯出範圍也離開） */
  cancelDraw(): boolean {
    const had = !!this.two || this.points.length > 0 || !!this.cellStroke;
    if (useEditor.getState().exportMode === 'pick') {
      setEditor({ exportMode: 'off', exportRect: null });
      this.two = null;
      this.canvas.requestRenderAll();
      return true;
    }
    this.resetDraw();
    this.canvas.requestRenderAll();
    return had;
  }

  /* ---------- 格子 ---------- */

  private cellDown(p: Pt): void {
    const { col, row } = this.grid.cellAt(p.x, p.y);
    const mode = usePrefs.getState().data.cellMode;
    const ground = this.tool === 'ground';
    if (mode === 'fill') {
      const layer = this.cellLayerTarget(ground);
      this.selectLayerForPaint(layer);
      this.fillCells(layer, col, row, ground);
      return;
    }
    this.cellStroke = { category: ground ? 'ground' : 'simple' };
    this.paintCell(col, row);
  }

  private cellPaint(p: Pt): void {
    const { col, row } = this.grid.cellAt(p.x, p.y);
    this.paintCell(col, row);
  }

  private paintCell(col: number, row: number): void {
    if (!this.cellStroke) return;
    const ground = this.cellStroke.category === 'ground';
    const layer = this.cellLayerTarget(ground);
    this.selectLayerForPaint(layer);
    const mode = usePrefs.getState().data.cellMode;
    if (mode === 'eraser') eraseCell(layer, this.grid, col, row);
    else {
      const entry = this.cellEntryAt(col, row, ground);
      addCell(
        layer,
        this.grid,
        entry,
        ground ? groundFill(useMapPrefs.getState().groundPattern) : (entry.solidColor ?? ''),
      );
    }
    this.canvas.requestRenderAll();
  }

  private cellUp(): void {
    const ground = this.cellStroke?.category === 'ground';
    this.cellStroke = null;
    const ids = useEditor.getState().selectedIds;
    const layer = mapLayers(this.canvas)
      .reverse()
      .find(
        (o) => o._isCellLayer && !!o._isGroundLayer === ground && ids.includes(o._layerId ?? -1),
      );
    if (layer) commitCellLayer(layer, this.grid);
    this.canvas.requestRenderAll();
    this.push(S.hist.paint(ground ? S.layer.groundCell : S.layer.cell));
  }

  /** 這一格的資料（一般：目前的填色；地面：地面的圖樣＋圖樣細節） */
  private cellEntryAt(col: number, row: number, ground: boolean): CellEntry {
    if (!ground) {
      const f = splitAlpha(usePrefs.getState().data.fill);
      return solidEntry(col, row, rgbaOf(f.hex, f.alpha));
    }
    const mp = useMapPrefs.getState();
    const s = mp.groundPattern;
    if (s.mode === 'solid') return solidEntry(col, row, s.solidColor || '#888888');
    const patScale = defScale(s.id) * (mp.groundPatternScale ?? 1);
    const patOffX = mp.groundPatternOffsetX || 0;
    const patOffY = mp.groundPatternOffsetY || 0;
    const patRot = mp.groundPatternRotation || 0;
    return {
      col,
      row,
      fillKey: `pattern:${s.id}|${patOffX},${patOffY}|${patRot}|${patScale}`,
      mode: 'pattern',
      patternId: s.id ?? undefined,
      patOffX,
      patOffY,
      patRot,
      patScale,
    };
  }

  /** 塗哪一層：選取的格子圖層 → 最上面的 → 新增（F094） */
  private cellLayerTarget(ground: boolean): MapObj {
    const ids = useEditor.getState().selectedIds;
    const layers = mapLayers(this.canvas).filter(
      (o) => o._isCellLayer && !!o._isGroundLayer === ground,
    );
    const sel = layers.find((o) => ids.includes(o._layerId ?? -1));
    if (sel) return sel;
    const top = layers.at(-1);
    if (top) return top;
    return this.createCellLayer(ground);
  }

  private selectLayerForPaint(layer: MapObj): void {
    const ids = useEditor.getState().selectedIds;
    if (!ids.includes(layer._layerId ?? -1)) setEditor({ selectedIds: [layer._layerId ?? -1] });
  }

  /** 新增格子圖層（「新增圖層」按鈕、第一次塗） */
  createCellLayer(ground: boolean): MapObj {
    const g = newCellGroup(ground ? { _isGroundLayer: true } : {});
    if (ground) this.addCategoryLayer(S.layer.groundCell, g, '_isGroundLayer');
    else this.addLayerObject(S.layer.cell, g);
    commitCellLayer(g, this.grid);
    setEditor({ selectedIds: [g._layerId ?? -1] });
    this.queueSync();
    return g;
  }

  private fillCells(layer: MapObj, col: number, row: number, ground: boolean): void {
    if (!layer._cellData) rebuildCellData(layer, this.grid);
    const res: FillResult = floodFill(
      layer._cellData as Map<string, CellEntry>,
      this.grid,
      col,
      row,
      (c, r) => this.cellEntryAt(c, r, ground),
    );
    if (!res.ok) {
      if (res.reason === 'empty') flashStatus(S.status.cellLayerEmpty);
      else if (res.reason === 'outside') flashStatus(S.status.outOfCellLayer);
      else if (res.reason === 'limit') flashStatus(S.status.fillLimit(10000));
      return;
    }
    commitCellLayer(layer, this.grid);
    this.canvas.requestRenderAll();
    this.push(S.hist.fillCells(res.count));
  }

  /* ---------- 裝飾 ---------- */

  private decorOpts(center: Pt, preview: boolean) {
    const mp = useMapPrefs.getState();
    return {
      centerX: center.x,
      centerY: center.y,
      scale: mp.decorScale ?? 1,
      rotation: mp.decorRotation || 0,
      flipX: !!mp.decorFlipX,
      flipY: !!mp.decorFlipY,
      fill: mp.decorFill,
      stroke: mp.decorStroke,
      preview,
    };
  }

  private async updateDecorPreview(p: Pt, e?: TPointerEvent | null): Promise<void> {
    const mp = useMapPrefs.getState();
    this.snapPt = null;
    if (!mp.decorId) return;
    const center = this.snap(p, e) ?? p;
    const key = JSON.stringify([
      mp.decorId,
      mp.decorScale,
      mp.decorRotation,
      mp.decorFlipX,
      mp.decorFlipY,
      mp.decorFill,
      mp.decorStroke,
      mp.decorShadowEnabled,
      usePrefs.getState().data.shadowSimple,
    ]);
    if (this.decorPreview && this.decorPreviewKey === key) {
      this.decorPreview.set({ left: center.x, top: center.y });
      this.decorPreview.setCoords();
      this.canvas.requestRenderAll();
      return;
    }
    this.decorPreviewKey = key;
    const obj = await createDecorInstance(mp.decorId, this.decorOpts(center, true), this.cellSize);
    if (!obj || this.tool !== 'decor' || this.decorPreviewKey !== key || this.disposed) return;
    const sh = this.shadowFor(obj);
    if (sh) obj.set({ shadow: sh });
    if (this.decorPreview) this.canvas.remove(this.decorPreview);
    this.decorPreview = obj;
    const last = this.lastPointer;
    if (last) {
      const c = this.snap(last) ?? last;
      obj.set({ left: c.x, top: c.y });
    }
    this.canvas.add(obj);
    this.canvas.requestRenderAll();
  }

  /** 裝飾的設定改了：預覽重做 */
  refreshDecorPreview(): void {
    if (this.tool !== 'decor' || !this.lastPointer) return;
    this.decorPreviewKey = '';
    void this.updateDecorPreview(this.lastPointer);
  }

  private async placeDecor(p: Pt, e: TPointerEvent): Promise<void> {
    const mp = useMapPrefs.getState();
    if (!mp.decorId) {
      flashStatus(S.status.selectDecor);
      return;
    }
    const center = this.snap(p, e) ?? p;
    const obj = await createDecorInstance(mp.decorId, this.decorOpts(center, false), this.cellSize);
    if (!obj) return;
    this.addLayerObject(S.prefix.decor + decorName(mp.decorId), obj);
    if (this.decorPreview) this.canvas.bringObjectToFront(this.decorPreview);
  }

  /* ---------- 手繪 ---------- */

  /** 筆刷與設定（F140～F142） */
  applyBrush(): void {
    if (!this.canvas.isDrawingMode) return;
    const mp = useMapPrefs.getState();
    const type = mp.freehandBrush;
    let brush: PencilBrush | SprayBrush;
    if (type === 'spray') {
      const b = new SprayBrush(this.canvas);
      b.density = 20;
      b.dotWidth = 1;
      b.dotWidthVariance = 1;
      b.randomOpacity = true;
      brush = b;
    } else {
      const b = new PencilBrush(this.canvas);
      b.decimate = mp.freehandDecimation || 0;
      b.straightLineKey = 'shiftKey';
      brush = b;
    }
    brush.width = mp.freehandWidth || 3;
    brush.color =
      type === 'eraser'
        ? 'rgba(255,0,0,0.5)'
        : rgbaOf(mp.freehandColor || '#000000', mp.freehandOpacity ?? 1);
    (brush as unknown as MapObj)._isEraser = type === 'eraser';
    this.canvas.freeDrawingBrush = brush;
  }

  private onPathCreated(path: FabricObject | undefined): void {
    if (!path) return;
    const p = path as MapObj;
    p.set({ selectable: false, evented: false });
    const eraser = !!(this.canvas.freeDrawingBrush as unknown as MapObj | undefined)?._isEraser;
    if (eraser)
      p.set({ globalCompositeOperation: 'destination-out', stroke: 'rgba(0,0,0,1)', opacity: 1 });
    this.canvas.remove(p);
    const layer = this.freehandLayerTarget();
    (layer as unknown as Group).add(p);
    if (!useEditor.getState().selectedIds.includes(layer._layerId ?? -1))
      setEditor({ selectedIds: [layer._layerId ?? -1] });
    this.canvas.requestRenderAll();
    this.push(eraser ? S.hist.eraser : S.hist.freehandAdd);
  }

  private freehandLayerTarget(): MapObj {
    const ids = useEditor.getState().selectedIds;
    const layers = mapLayers(this.canvas).filter((o) => o._isFreehandLayer);
    return (
      layers.find((o) => ids.includes(o._layerId ?? -1)) ??
      layers.at(-1) ??
      this.createFreehandLayer()
    );
  }

  /** 新增手繪圖層（F143） */
  createFreehandLayer(): MapObj {
    const g = new Group([], {
      selectable: false,
      evented: false,
      objectCaching: true,
    }) as unknown as MapObj;
    g._isFreehandLayer = true;
    this.addLayerObject(S.tools.freehand, g);
    setEditor({ selectedIds: [g._layerId ?? -1] });
    this.queueSync();
    return g;
  }

  /* ---------- 文字 ---------- */

  private textDown(p: Pt, target?: FabricObject): void {
    const t = target as (IText & MapObj) | undefined;
    if (t?._isMapText) {
      this.canvas.setActiveObject(t);
      t.enterEditing();
      this.canvas.requestRenderAll();
      return;
    }
    const pr = usePrefs.getState().data;
    const mp = useMapPrefs.getState();
    const text = new IText('', {
      left: p.x,
      top: p.y,
      originX: 'left',
      originY: 'center',
      fontFamily: pr.textFont,
      fontSize: pr.textSize,
      fill: rgbaOf(mp.textFill, mp.textFillOpacity),
      stroke: mp.textStrokeWidth > 0 ? rgbaOf(mp.textStroke, mp.textStrokeOpacity) : null,
      strokeWidth: mp.textStrokeWidth > 0 ? mp.textStrokeWidth : 0,
      paintFirst: 'stroke',
      editable: true,
      objectCaching: false,
      cursorColor: '#000000',
      cursorWidth: 3,
      selectionColor: 'rgba(0,229,255,0.35)',
    }) as unknown as IText & MapObj;
    text._isMapText = true;
    this.addLayerObject(S.tools.text, text, { skipHistory: true });
    this.canvas.setActiveObject(text);
    text.enterEditing();
    this.textBefore = '';
    this.canvas.requestRenderAll();
  }

  private onTextChanged(t: IText): void {
    void this.ensureTextFonts(t);
  }

  /** 文字用到的字型載入（只下載用到的字），載入後重新量寬度 */
  async ensureTextFonts(t: IText): Promise<void> {
    const fams = new Set<string>([t.fontFamily]);
    for (const line of Object.values(t.styles ?? {}))
      for (const st of Object.values(line as Record<string, { fontFamily?: string }>))
        if (st.fontFamily) fams.add(st.fontFamily);
    const weight = t.fontWeight === 'bold' || Number(t.fontWeight) >= 600 ? 700 : 400;
    const text = t.text || '永';
    const keys = [...fams].map((f) => `${f}|${weight}|${text}`);
    if (keys.every((k) => this.fontsReady.has(k))) return;
    const results = await Promise.all([...fams].map((f) => ensureFont(f, weight, text)));
    for (const k of keys) this.fontsReady.add(k);
    if (this.disposed) return;
    if (results.some(Boolean)) {
      for (const f of fams) cache.clearFontCache(f);
      t.initDimensions();
      t.setCoords();
      t.dirty = true;
      this.canvas.requestRenderAll();
    }
  }

  private onTextExited(t: IText & MapObj): void {
    const before = this.textBefore;
    this.textBefore = null;
    if (t._isMapText && (t.text ?? '').trim() === '') {
      this.canvas.remove(t);
      this.canvas.discardActiveObject();
      this.canvas.requestRenderAll();
      if (before !== null && before !== '') this.push(S.hist.textDelete);
      this.queueSync();
      return;
    }
    this.canvas.requestRenderAll();
    if (before !== null && before !== t.text)
      this.push(before === '' ? S.hist.add(S.tools.text) : S.hist.textEdit);
    this.queueSync();
  }

  /* ---------- 圖片 ---------- */

  /** 圖片放在 (0, 0)（左上角；F156）；給了位置時放在那裡（拖進畫布） */
  async addImage(dataUrl: string, at?: Pt): Promise<boolean> {
    try {
      const img = (await FabricImage.fromURL(dataUrl)) as unknown as MapObj;
      if (at) img.set({ left: at.x, top: at.y, originX: 'center', originY: 'center' });
      else img.set({ left: 0, top: 0, originX: 'left', originY: 'top' });
      img.set({ objectCaching: false });
      this.addLayerObject(S.tools.image, img);
      return true;
    } catch {
      return false;
    }
  }

  /* ================= 選取、移動 ================= */

  private onMoving(t: MapObj | undefined): void {
    if (!t) return;
    if (t._isCellLayer) {
      if (!t._snapStart) t._snapStart = { left: t.left ?? 0, top: t.top ?? 0 };
      const s = this.grid.snapDelta(
        (t.left ?? 0) - t._snapStart.left,
        (t.top ?? 0) - t._snapStart.top,
      );
      t.set({ left: t._snapStart.left + s.dx, top: t._snapStart.top + s.dy });
      t._snapAccum = { colDelta: s.colDelta, rowDelta: s.rowDelta };
      this.queueSync();
      return;
    }
    const c = t.getCenterPoint();
    const snapped = this.snap({ x: c.x, y: c.y });
    if (snapped) t.setPositionByOrigin(new Point(snapped.x, snapped.y), 'center', 'center');
    applyPatternOrigin(t);
    this.queueSync();
  }

  private onModified(t: MapObj | undefined): void {
    if (!t) return;
    if (t._isCellLayer && t._snapAccum) {
      const { colDelta, rowDelta } = t._snapAccum;
      if (colDelta || rowDelta) {
        const next = new Map<string, CellEntry>();
        for (const e of t._cellData?.values() ?? []) {
          const m = { ...e, col: e.col + colDelta, row: e.row + rowDelta };
          next.set(this.grid.cellKey(m.col, m.row), m);
        }
        t._cellData = next;
        commitCellLayer(t, this.grid);
      }
      t._snapStart = undefined;
      t._snapAccum = undefined;
    }
    if (t instanceof ActiveSelection) for (const o of t.getObjects()) applyPatternOrigin(o);
    else applyPatternOrigin(t);
    if (this.history.restoring) return;
    if ((t as unknown as IText).isEditing) return;
    this.push(S.hist.modify((t as MapObj)._layerName || S.layer.object));
    this.queueSync();
  }

  /* ================= 狀態同步（圖層清單、選取） ================= */

  queueSync(): void {
    if (this.syncQueued || this.disposed) return;
    this.syncQueued = true;
    requestAnimationFrame(() => {
      this.syncQueued = false;
      this.sync();
    });
  }

  sync(): void {
    if (this.disposed || this.loading) return;
    const c = this.canvas;
    const active = c.getActiveObjects().filter((o) => (o as MapObj)._isMapLayer) as MapObj[];
    const ed = useEditor.getState();
    const ids = active.length
      ? active.map((o) => o._layerId ?? -1)
      : ed.tool === 'select'
        ? []
        : ed.selectedIds;
    const ao = c.getActiveObject() as (IText & MapObj) | undefined;
    const text = ao instanceof IText && ao._isMapText ? ao : null;
    const patch: Partial<EditorState> = {
      layers: layerRows(c),
      selectedIds: ids,
      selection: computeSelection(this, active),
      textStyle: textStyleOf(text),
      zoom: this.zoom,
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
    };
    setEditor(patch);
  }

  /* ================= 自動儲存用 ================= */

  autoSaveEnabled(): boolean {
    return useAutoSave.getState().enabled;
  }
}

function rectOf(a: Pt, b: Pt) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  };
}
