/**
 * 預覽的引擎（不依賴 React）：WebGL 畫布、部件、錨點、自動動作與物理的每一格、PNG 擷取、錄影用的重畫。
 * 參數、圖層設定、錨點位移從 store 讀；攝影機與麥克風的值由 devices 寫進來。
 */
import {
  type AnchorOffsets,
  AUTO_KEYS,
  type AutoState,
  defaultParams,
  EXPORT_BG_RGBA,
  type ExportBackground,
  type ParamKey,
  type Params,
} from './params';
import {
  Animator,
  applyAnchorOffsets,
  type Bounce,
  buildBangWeights,
  type CamValues,
  deform,
  type Frame,
  fadeAlpha,
  type LayerRuntime,
  type PoseAnchors,
  prepareLayer,
  resetPhysics,
  restFrame,
  stillFrame,
  updateSprings,
} from './pose';
import { type GlMesh, MeshRenderer } from './renderer';
import type { Rig, RigAnchors } from './rigger';
import type { LayerSetting } from './runtime';
import { useAuto, useEdit, useSession } from './store';
import { S } from './strings';

interface EngineLayer extends LayerRuntime {
  mesh: GlMesh;
}

/** 攝影機的追蹤值（devices 寫入） */
export interface CamInput extends CamValues {
  /** 最近一次有臉的時間（performance.now） */
  at: number;
}

const THUMB_MAX = 64;

function makeThumb(img: ImageData): string {
  try {
    const s = Math.min(1, THUMB_MAX / Math.max(img.width, img.height));
    const tw = Math.max(1, Math.round(img.width * s));
    const th = Math.max(1, Math.round(img.height * s));
    const full = document.createElement('canvas');
    full.width = img.width;
    full.height = img.height;
    full.getContext('2d')?.putImageData(img, 0, 0);
    const t = document.createElement('canvas');
    t.width = tw;
    t.height = th;
    const ctx = t.getContext('2d');
    if (!ctx) return '';
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(full, 0, 0, tw, th);
    return t.toDataURL('image/png');
  } catch {
    return '';
  }
}

export class RigEngine {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private renderer: MeshRenderer;
  private layers: EngineLayer[] = [];
  private rig: Rig | null = null;
  private baseAnchors: RigAnchors | null = null;
  private pose: PoseAnchors | null = null;
  private bounce: Bounce = { x: 0, v: 0, dy: 0 };
  private animator = new Animator(defaultParams(), performance.now());
  private lastFrame: Frame | null = null;
  private simTime = performance.now();
  private last = performance.now();
  private raf = 0;
  private dirty = true;
  private contextLost = false;
  private maskFailed = false;
  private hasEyeClose2 = false;
  private exportBg: ExportBackground | null = null;
  /** 錄影中：每一格都重畫 */
  recording = false;
  /** 錨點編輯中拖曳閉眼位置：那一隻眼睛閉上 */
  closeEye: 'L' | 'R' | null = null;
  /** 滑鼠在預覽上的位置（−1.5～1.5） */
  mouse: { x: number; y: number } | null = null;
  cam: CamInput | null = null;
  /** 麥克風嘴型的音量（麥克風開著時；沒開時 null） */
  mic: number | null = null;
  private fpsN = 0;
  private fpsT = performance.now();
  private unsubs: (() => void)[] = [];
  private onFrame: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error(S.errWebgl);
    this.gl = gl;
    try {
      this.renderer = new MeshRenderer(gl);
    } catch (e) {
      throw new Error(S.errGlInit(e instanceof Error ? e.message : String(e)));
    }
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
    /* 參數、圖層、錨點改了要重畫；暫停中改的參數直接套到最後一格（不平滑） */
    this.unsubs.push(
      useEdit.subscribe((st, prev) => {
        const a = st.data;
        const b = prev.data;
        if (a.params !== b.params && this.lastFrame && useSession.getState().paused) {
          for (const k of Object.keys(a.params) as ParamKey[]) {
            if (a.params[k] !== b.params[k]) this.lastFrame[k] = a.params[k];
          }
        }
        if (a.anchors !== b.anchors) this.applyAnchors(a.anchors);
        if (a.layers !== b.layers) this.syncLayers(a.layers);
        this.dirty = true;
      }),
      useAuto.subscribe((st, prev) => {
        if (prev.blink && !st.blink) this.animator.resetBlink();
        this.dirty = true;
      }),
      useSession.subscribe((st, prev) => {
        if (st.anchorMode !== prev.anchorMode) {
          if (!st.anchorMode) this.animator.snap(useEdit.getState().data.params);
          this.closeEye = null;
          this.dirty = true;
        }
        if (st.paused !== prev.paused) this.dirty = true;
      }),
    );
    this.raf = requestAnimationFrame(this.tick);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    for (const u of this.unsubs) u();
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    for (const L of this.layers) this.renderer.dispose(L.mesh);
    this.layers = [];
  }

  get width(): number {
    return this.rig?.canvas.w ?? 0;
  }

  get height(): number {
    return this.rig?.canvas.h ?? 0;
  }

  get hasModel(): boolean {
    return this.layers.length > 0;
  }

  /** 每畫完一格呼叫（測試入口用） */
  setFrameListener(fn: (() => void) | null): void {
    this.onFrame = fn;
  }

  /* ---------- 模型 ---------- */

  /**
   * 換成新的綁定：檢查裝置的上限、建網格、上傳貼圖；失敗時丟錯（目前的模型不變）。
   * 回傳每個部件的縮圖（data URL）。
   */
  applyRig(rig: Rig): Map<string, string> {
    if (this.contextLost) throw new Error(S.errContextLost);
    const gl = this.gl;
    const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    if (
      rig.canvas.w > maxViewport[0] ||
      rig.canvas.h > maxViewport[1] ||
      rig.canvas.w > maxTexture ||
      rig.canvas.h > maxTexture
    )
      throw new Error(S.errViewport(Math.min(maxViewport[0], maxTexture)));
    const prepared: EngineLayer[] = [];
    const thumbs = new Map<string, string>();
    try {
      for (const part of rig.layers) {
        if (part.w > maxTexture || part.h > maxTexture) throw new Error(S.errTexture(maxTexture));
        const L = prepareLayer(part, rig.canvas.w);
        const image = new ImageData(
          new Uint8ClampedArray(
            part.img.data.buffer as ArrayBuffer,
            part.img.data.byteOffset,
            part.img.data.length,
          ),
          part.img.width,
          part.img.height,
        );
        thumbs.set(L.id, makeThumb(image));
        const mesh = this.renderer.upload({
          positions: L.cur,
          uvs: L.uv,
          indices: L.indices,
          image,
        });
        prepared.push(Object.assign(L, { mesh }));
      }
    } catch (e) {
      for (const L of prepared) this.renderer.dispose(L.mesh);
      throw e;
    }
    for (const L of this.layers) this.renderer.dispose(L.mesh);
    this.layers = prepared;
    this.rig = rig;
    this.baseAnchors = structuredClone(rig.anchors);
    this.canvas.width = rig.canvas.w;
    this.canvas.height = rig.canvas.h;
    this.applyAnchors({});
    resetPhysics(this.layers, this.bounce);
    this.lastFrame = null;
    this.animator.resetBlink();
    this.hasEyeClose2 = this.layers.some((L) => L.bn === 'eye_close2');
    this.maskFailed = false;
    this.dirty = true;
    return thumbs;
  }

  /** 參數直接跳到目前的設定（讀入、套用設定時；規格 F40 的例外） */
  snap(): void {
    this.animator.snap(useEdit.getState().data.params);
    if (this.lastFrame) Object.assign(this.lastFrame, useEdit.getState().data.params);
    this.dirty = true;
  }

  private applyAnchors(offsets: AnchorOffsets) {
    if (!this.baseAnchors) return;
    this.pose = applyAnchorOffsets(this.baseAnchors, offsets);
    for (const L of this.layers) buildBangWeights(L, this.pose);
    this.dirty = true;
  }

  /** 圖層設定（順序、顯示、濃度、深度）套到部件 */
  private syncLayers(settings: readonly LayerSetting[]) {
    if (!settings.length) return;
    const byId = new Map(this.layers.map((L) => [L.id, L]));
    const next: EngineLayer[] = [];
    for (const s of settings) {
      const L = byId.get(s.id);
      if (!L) continue;
      L.visible = s.visible;
      L.opacity = s.opacity;
      L.depth = s.depth;
      next.push(L);
      byId.delete(s.id);
    }
    for (const L of byId.values()) next.push(L);
    this.layers = next;
    this.dirty = true;
  }

  /** 錨點（目前的位移套上去之後），錨點編輯的圓點用 */
  anchors(): PoseAnchors | null {
    return this.pose;
  }

  /* ---------- 每一格 ---------- */

  private camValues(): CamValues | null {
    const c = this.cam;
    if (!useAuto.getState().cam || !c) return null;
    return performance.now() - c.at < 1200 ? c : null;
  }

  private animate(now: number, dt: number): Frame {
    const edit = useEdit.getState().data;
    const session = useSession.getState();
    if (session.anchorMode && this.pose) {
      const e = restFrame(edit.params, this.closeEye);
      updateSprings(this.layers, e, 0, dt, false, this.pose, this.bounce);
      return e;
    }
    const auto = useAuto.getState();
    const autoFlags = Object.fromEntries(AUTO_KEYS.map((k) => [k, auto[k]])) as AutoState;
    const e = this.animator.step(
      now,
      dt,
      {
        target: edit.params,
        auto: autoFlags,
        preset: !!edit.preset,
        cam: this.camValues(),
        mouse: this.mouse,
        mic: auto.mic ? (this.mic ?? 0) : null,
      },
      this.hasEyeClose2,
    );
    if (this.pose) updateSprings(this.layers, e, now / 1000, dt, auto.idle, this.pose, this.bounce);
    return e;
  }

  private render(e: Frame) {
    if (!this.pose || !this.rig) return;
    const alt = { L: false, R: false };
    for (const L of this.layers) {
      if (L.fade === 'eyeClose2' && L.side && L.visible && L.opacity > 0) alt[L.side] = true;
    }
    const ctx = { ...this.pose, phys: useAuto.getState().phys, bounceDy: this.bounce.dy };
    const items: { mesh: GlMesh; alpha: number; clip: 'L' | 'R' | null }[] = [];
    const masks: { mesh: GlMesh; side: 'L' | 'R' }[] = [];
    const variant = this.animator.blinkVariant;
    for (const L of this.layers) {
      const isMask = L.bn === 'eyewhite' && !!L.side;
      const alpha = L.visible ? fadeAlpha(L, e, alt, variant) * L.opacity : 0;
      if (alpha < 0.004 && !isMask) continue;
      deform(L, e, ctx);
      this.renderer.positions(L.mesh, L.cur);
      if (isMask && L.side) masks.push({ mesh: L.mesh, side: L.side });
      if (alpha >= 0.004)
        items.push({ mesh: L.mesh, alpha, clip: L.bn === 'irides' && L.side ? L.side : null });
    }
    const bg = this.exportBg ? EXPORT_BG_RGBA[this.exportBg] : EXPORT_BG_RGBA.transparent;
    const frame = {
      width: this.rig.canvas.w,
      height: this.rig.canvas.h,
      background: bg,
      masks: this.maskFailed ? [] : masks,
      items,
    };
    try {
      this.renderer.draw(frame);
    } catch (err) {
      if (this.maskFailed) throw err;
      this.maskFailed = true;
      useSession.setState({
        status: {
          text: S.glMaskDisabled(err instanceof Error ? err.message : String(err)),
          tone: 'warning',
          id: Date.now(),
        },
      });
      this.renderer.draw({ ...frame, masks: [] });
    }
  }

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000));
    this.last = now;
    if (!this.layers.length || !this.pose || this.contextLost) return;
    const session = useSession.getState();
    if (session.anchorMode || !session.paused || !this.lastFrame) {
      this.simTime += dt * 1000;
      this.lastFrame = this.animate(this.simTime, dt);
      this.dirty = true;
    }
    if (this.dirty || this.recording) {
      this.exportBg = this.recording ? this.recordingBg : null;
      this.render(this.lastFrame);
      this.dirty = false;
      this.onFrame?.();
    }
    this.fpsN++;
    if (now - this.fpsT > 500) {
      const fps = Math.round((this.fpsN * 1000) / (now - this.fpsT));
      this.fpsN = 0;
      this.fpsT = now;
      if (useSession.getState().fps !== fps) useSession.setState({ fps });
    }
  };

  /** 錄影中的背景 */
  recordingBg: ExportBackground = 'transparent';

  /** 讓下一格重畫 */
  invalidate(): void {
    this.dirty = true;
  }

  /** 以匯出背景畫目前的姿勢並擷取 PNG（規格 F66） */
  capturePng(bg: ExportBackground): Promise<Blob | null> {
    if (!this.lastFrame || this.contextLost) return Promise.resolve(null);
    this.exportBg = bg;
    this.render(this.lastFrame);
    this.exportBg = null;
    /* preserveDrawingBuffer 是 false：在同一個畫面裡立刻擷取 */
    const out = new Promise<Blob | null>((resolve) => this.canvas.toBlob(resolve, 'image/png'));
    this.dirty = true;
    return out;
  }

  /**
   * 測試入口：停在決定性的姿勢（暫停、參數直接採用、呼吸 0、物理歸零、眨眼重設）。
   */
  still(): void {
    useSession.setState({ paused: true });
    resetPhysics(this.layers, this.bounce);
    this.animator.resetBlink();
    this.lastFrame = stillFrame(useEdit.getState().data.params);
    this.dirty = true;
  }

  /** 目前的參數（自動動作、追蹤之後）；測試、狀態檢查用 */
  currentFrame(): Readonly<Frame> | null {
    return this.lastFrame;
  }

  currentParams(): Readonly<Params> {
    return this.animator.cur;
  }

  /* ---------- 繪圖內容遺失 ---------- */

  private onLost = (ev: Event) => {
    ev.preventDefault();
    this.contextLost = true;
    useSession.setState({ status: { text: S.glLost, tone: 'danger', id: Date.now() } });
    for (const fn of this.lostListeners) fn();
  };

  private onRestored = () => {
    try {
      this.layers = [];
      this.renderer.init();
      this.contextLost = false;
      if (this.rig) {
        this.applyRig(this.rig);
        const d = useEdit.getState().data;
        this.applyAnchors(d.anchors);
        this.syncLayers(d.layers);
      }
      useSession.setState({ status: { text: S.glRestored, tone: 'success', id: Date.now() } });
    } catch {
      this.contextLost = true;
      useSession.setState({ status: { text: S.glRestoreFailed, tone: 'danger', id: Date.now() } });
    }
  };

  private lostListeners = new Set<() => void>();

  /** 繪圖內容遺失時通知（錄影要取消） */
  onContextLost(fn: () => void): () => void {
    this.lostListeners.add(fn);
    return () => this.lostListeners.delete(fn);
  }
}

/* ---------- 單一的引擎（預覽元件建立） ---------- */

let engine: RigEngine | null = null;

export function setEngine(e: RigEngine | null): void {
  engine = e;
}

export function getEngine(): RigEngine | null {
  return engine;
}
