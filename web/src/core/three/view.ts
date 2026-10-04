/**
 * 3D 檢視：WebGL 算繪器＋透視鏡頭＋滑鼠／觸控轉動鏡頭（OrbitControls）＋算繪迴圈。
 *
 * - 畫布一律透明（clear alpha 0）：底色由呼叫端鋪在畫布後面（預覽）或匯出時先塗（exportAnimation 的 background），
 *   半透明的物件疊在底色上的結果與「把底色畫進場景」相同。
 * - 繪圖緩衝區的大小固定（例如 800 × 800），顯示大小由 CSS 決定；匯出時 `capture` 可以換成輸出尺寸。
 * - 算繪迴圈只在需要時重畫：`invalidate()`、鏡頭在動（含慣性）、或 `onFrame` 的回呼回傳 true（例如自動旋轉、物理）。
 * - 色彩：`colorPipeline: 'legacy'` 照 three.js r152 以前的做法（貼圖與輸出都不做 sRGB 轉換，顏色值原樣進出），
 *   搭配 `LEGACY_LIGHT_SCALE` 把燈光強度換算成舊版的亮度；新工具用預設的 'srgb'。
 *
 * ```ts
 * const view = createOrbitView(canvas, { width: 800, height: 800, colorPipeline: 'legacy' });
 * view.scene.add(mesh);
 * view.frameObject(mesh);
 * view.onFrame((dt) => { mesh.rotation.y += dt; return true; });
 * view.start();
 * ```
 */
import {
  Box3,
  LinearSRGBColorSpace,
  NoColorSpace,
  type Object3D,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  type Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** 'legacy'：顏色值原樣進出（three.js r152 以前的預設）；'srgb'：貼圖當 sRGB、輸出轉 sRGB（現行預設） */
export type ColorPipeline = 'legacy' | 'srgb';

/**
 * 舊版燈光單位的換算：r155 以後的燈光是物理單位，舊版（useLegacyLights）的漫射與鏡面反射多乘了 π。
 * 舊工具的強度 × LEGACY_LIGHT_SCALE ＝ 現行版本同樣的亮度。
 */
export const LEGACY_LIGHT_SCALE = Math.PI;

export interface OrbitViewOptions {
  /** 繪圖緩衝區大小（px） */
  width: number;
  height: number;
  /** 垂直視角（度，預設 45） */
  fov?: number;
  near?: number;
  far?: number;
  /** 鏡頭初始位置（預設 [0, 200, 600]） */
  position?: readonly [number, number, number];
  colorPipeline?: ColorPipeline;
  /** 對數深度緩衝（遠近差很大、薄片很近時避免閃爍；預設 true） */
  logarithmicDepth?: boolean;
  /** 轉動鏡頭的慣性（預設 true） */
  damping?: boolean;
  antialias?: boolean;
}

export interface FrameOptions {
  /** 物件外接範圍以外留的比例（預設 1.35） */
  margin?: number;
  /**
   * 'axis'（預設）：鏡頭放在 z 軸正方向、看向 (0, 中心高度, 0)（物件以原點為中心擺放時用，與舊版相同）；
   * 'center'：看向外接範圍的中心。
   */
  aim?: 'axis' | 'center';
}

/** 每一個畫面的回呼：dt 是距離上一個畫面的秒數（最多 0.1）；回傳 true 表示這個畫面要重畫 */
export type FrameCallback = (dt: number) => boolean | undefined;

export interface OrbitView {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly colorPipeline: ColorPipeline;
  /** 目前繪圖緩衝區的大小 */
  readonly size: { width: number; height: number };
  /** 加一個每畫面的回呼；回傳取消函式 */
  onFrame(cb: FrameCallback): () => void;
  /** 開始／停止算繪迴圈（停止時鏡頭控制照樣可用，畫面不會更新） */
  start(): void;
  stop(): void;
  readonly running: boolean;
  /** 下一個畫面重畫 */
  invalidate(): void;
  /** 立刻畫一次 */
  render(): void;
  /** 換繪圖緩衝區大小（鏡頭比例跟著改） */
  setSize(width: number, height: number): void;
  /** 鏡頭對準物件（重設鏡頭） */
  frameObject(object: Object3D, options?: FrameOptions): void;
  /** 繞著目標轉（弧度；左右、上下），鍵盤操作用 */
  orbit(azimuth: number, polar: number): void;
  /** 拉近（factor > 1）或拉遠（< 1） */
  zoom(factor: number): void;
  /** 依色彩設定標記貼圖的色彩空間（彩色圖片） */
  prepareTexture<T extends Texture>(texture: T): T;
  /**
   * 以 width × height 畫一張，貼到 ctx 的整個畫布（忽略 ctx 目前的變形）。
   * 緩衝區大小會換成 width × height，結束後呼叫端自己 setSize 換回來（連續擷取時不必每格換）。
   */
  capture(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    width: number,
    height: number,
  ): void;
  dispose(): void;
}

export function createOrbitView(canvas: HTMLCanvasElement, options: OrbitViewOptions): OrbitView {
  const {
    width,
    height,
    fov = 45,
    near = 0.1,
    far = 10000,
    position = [0, 200, 600],
    colorPipeline = 'srgb',
    logarithmicDepth = true,
    damping = true,
    antialias = true,
  } = options;

  const renderer = new WebGLRenderer({
    canvas,
    antialias,
    alpha: true,
    /* 擷取（drawImage、toBlob）時畫面還在 */
    preserveDrawingBuffer: true,
    logarithmicDepthBuffer: logarithmicDepth,
  });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = colorPipeline === 'legacy' ? LinearSRGBColorSpace : SRGBColorSpace;
  renderer.setSize(width, height, false);

  const scene = new Scene();
  const camera = new PerspectiveCamera(fov, width / height, near, far);
  camera.position.set(position[0], position[1], position[2]);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = damping;

  const size = { width, height };
  const callbacks = new Set<FrameCallback>();
  let raf = 0;
  let running = false;
  let dirty = true;
  let last = 0;

  const render = () => {
    renderer.render(scene, camera);
    dirty = false;
  };

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const dt = last ? Math.min(0.1, Math.max(0, (now - last) / 1000)) : 1 / 60;
    last = now;
    let changed = controls.update();
    for (const cb of callbacks) if (cb(dt)) changed = true;
    if (changed || dirty) render();
  };

  controls.addEventListener('change', () => {
    dirty = true;
  });

  const view: OrbitView = {
    canvas,
    renderer,
    scene,
    camera,
    controls,
    colorPipeline,
    size,
    onFrame(cb) {
      callbacks.add(cb);
      return () => {
        callbacks.delete(cb);
      };
    },
    start() {
      if (running) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    get running() {
      return running;
    },
    invalidate() {
      dirty = true;
    },
    render,
    setSize(w, h) {
      if (w === size.width && h === size.height) return;
      size.width = w;
      size.height = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      dirty = true;
    },
    frameObject(object, { margin = 1.35, aim = 'axis' } = {}) {
      object.updateMatrixWorld(true);
      const box = new Box3().setFromObject(object);
      if (box.isEmpty()) return;
      const s = box.getSize(new Vector3());
      const c = box.getCenter(new Vector3());
      /* 水平方向用對角線（轉一圈都放得下），與高度取大的 */
      const maxDim = Math.max(Math.hypot(s.x, s.z), s.y);
      const dist = (maxDim / 2 / Math.tan((camera.fov * Math.PI) / 360)) * margin;
      const tx = aim === 'center' ? c.x : 0;
      const tz = aim === 'center' ? c.z : 0;
      /* 先把慣性留下的轉動量一次用完（關掉慣性時 update 會清空），對準後才不會再滑一下 */
      const damp = controls.enableDamping;
      controls.enableDamping = false;
      controls.update();
      camera.position.set(tx, c.y, tz + dist);
      controls.target.set(tx, c.y, tz);
      controls.update();
      controls.enableDamping = damp;
      dirty = true;
    },
    orbit(azimuth, polar) {
      if (azimuth) controls.rotateLeft(azimuth);
      if (polar) controls.rotateUp(polar);
      dirty = true;
    },
    zoom(factor) {
      if (factor > 1) controls.dollyIn(factor);
      else if (factor > 0 && factor < 1) controls.dollyOut(1 / factor);
      dirty = true;
    },
    prepareTexture(texture) {
      texture.colorSpace = colorPipeline === 'legacy' ? NoColorSpace : SRGBColorSpace;
      texture.needsUpdate = true;
      return texture;
    },
    capture(ctx, w, h) {
      view.setSize(w, h);
      render();
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(canvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
    },
    dispose() {
      view.stop();
      callbacks.clear();
      controls.dispose();
      renderer.dispose();
    },
  };
  return view;
}
