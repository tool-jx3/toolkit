/**
 * 3D 預覽的引擎：共用的 core/three 檢視＋這個工具的燈光、目前的周邊、自動旋轉、搖搖樂的物理與搖晃、陀螺儀、
 * 匯出時的逐格擷取與 GLB。React 元件只呼叫這裡的方法。
 */
import {
  AmbientLight,
  Box3,
  type CanvasTexture,
  DirectionalLight,
  type Group,
  Quaternion,
  Vector3,
} from 'three';
import {
  createOrbitView,
  disposeObject,
  exportGlb,
  LEGACY_GLB_NON_PBR,
  LEGACY_LIGHT_SCALE,
  type OrbitView,
} from '@/core/three';
import type { Pt } from './contour';
import { CANVAS_SIZE, type LightSettings } from './model';
import { STEP } from './physics';
import {
  EXPORT_PHYSICS_RATIO,
  type ExportPlan,
  FILL_LIGHT,
  frameAngle,
  gravityFor,
  keyLightPosition,
  SHAKE_DECAY,
  SHAKE_PER_PX,
  SPIN_RAD_PER_SEC,
} from './plan';
import type { Build } from './scene';

/** 鏡頭的初始位置（舊版） */
const CAMERA_START = [0, 200, 600] as const;
/** 物件大小改變超過這個比例時自動重新對準鏡頭 */
const REFIT_RATIO = 0.2;

export class AcrylicEngine {
  readonly view: OrbitView;
  readonly ambient: AmbientLight;
  readonly key: DirectionalLight;
  readonly fill: DirectionalLight;
  build: Build | null = null;
  spin = 0;
  /** 搖晃的力（周邊的座標） */
  shake: Pt = { x: 0, y: 0 };
  /** 陀螺儀：開著時是最近一次的傾斜（還沒收到時 0） */
  gyro: { gamma: number; beta: number } | null = null;
  /** 換過幾次周邊、最近一次換的時間（performance.now()；測試與檢查用） */
  builds = 0;
  builtAt = 0;
  private acc = 0;
  private fitted: { w: number; h: number; d: number } | null = null;
  private exporting = false;
  private saved: { y: number; z: number; restore: (() => void) | null } | null = null;
  private shakeSaved: Pt = { x: 0, y: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.view = createOrbitView(canvas, {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      fov: 45,
      near: 0.1,
      far: 10000,
      position: CAMERA_START,
      colorPipeline: 'legacy',
    });
    const { scene } = this.view;
    this.ambient = new AmbientLight(0xffffff, 0.6 * LEGACY_LIGHT_SCALE);
    this.key = new DirectionalLight(0xffffff, 0.5 * LEGACY_LIGHT_SCALE);
    this.key.position.set(200, 300, 200);
    this.fill = new DirectionalLight(0xffffff, FILL_LIGHT.intensity * LEGACY_LIGHT_SCALE);
    this.fill.position.set(...FILL_LIGHT.position);
    scene.add(this.ambient, this.key, this.fill);
    this.view.onFrame((dt) => this.tick(dt));
    this.view.start();
  }

  /** 換成新的周邊（舊的釋放）；refit：'always'／'auto'（大小差很多才對準）／'never' */
  setBuild(build: Build | null, refit: 'always' | 'auto' | 'never' = 'auto'): void {
    this.builds++;
    this.builtAt = performance.now();
    const old = this.build;
    const keepY = old?.root.rotation.y ?? 0;
    if (old) {
      this.view.scene.remove(old.root);
      disposeObject(old.root);
    }
    this.build = build;
    this.shake = { x: 0, y: 0 };
    this.acc = 0;
    if (build) {
      /* 自動旋轉中換設定：接著原本的角度轉 */
      if (this.spin > 0) build.root.rotation.y = keepY;
      this.view.scene.add(build.root);
      this.updateSides();
      const size = this.sizeOf(build.root);
      const f = this.fitted;
      const changed =
        !f ||
        [
          [size.w, f.w],
          [size.h, f.h],
          [size.d, f.d],
        ].some(([a, b]) => Math.abs(a - b) > Math.max(a, b) * REFIT_RATIO);
      if (refit === 'always' || (refit === 'auto' && changed)) this.resetCamera();
    }
    this.view.invalidate();
  }

  /** 周邊的大小（不含目前的轉動角度：自動旋轉中不會因為轉到側面就被當成大小改變） */
  private sizeOf(root: Group) {
    const saved = root.rotation.clone();
    root.rotation.set(0, 0, 0);
    root.updateMatrixWorld(true);
    const v = new Box3().setFromObject(root).getSize(new Vector3());
    root.rotation.copy(saved);
    root.updateMatrixWorld(true);
    return { w: v.x, h: v.y, d: v.z };
  }

  /** 重設鏡頭：對準目前的周邊（舊版的 resetCamera） */
  resetCamera(): void {
    if (!this.build) return;
    const r = this.build.root;
    this.view.frameObject(r, { margin: 1.35, aim: 'axis' });
    this.fitted = this.sizeOf(r);
  }

  setLight(light: LightSettings): void {
    const [x, y, z] = keyLightPosition(light);
    this.key.position.set(x, y, z);
    this.key.intensity = light.key * LEGACY_LIGHT_SCALE;
    this.ambient.intensity = light.ambient * LEGACY_LIGHT_SCALE;
    this.view.invalidate();
  }

  setSpin(spin: number): void {
    this.spin = spin;
  }

  /** 拖曳畫面（螢幕 px 的位移）→ 搖晃的力 */
  addShake(dx: number, dy: number): void {
    if (this.build?.kind !== 'shaker') return;
    this.shake.x += dx * SHAKE_PER_PX;
    this.shake.y -= dy * SHAKE_PER_PX;
  }

  /** 「搖一搖」按鈕：左右甩一下 */
  kick(direction: 1 | -1 = 1): void {
    this.addShake(direction * 120, -40);
  }

  setGyro(on: boolean): void {
    this.gyro = on ? { gamma: 0, beta: 0 } : null;
    if (on && this.build) {
      this.build.root.rotation.y = 0;
      this.resetCamera();
    }
  }

  setOrientation(gamma: number | null, beta: number | null): void {
    if (this.gyro) this.gyro = { gamma: gamma ?? 0, beta: beta ?? 0 };
  }

  /** 正反面各自算：鏡頭在正面那一側時顯示正面那組，否則顯示背面那組 */
  private updateSides(): void {
    const b = this.build;
    if (!b?.sides) return;
    b.root.updateMatrixWorld(true);
    const cam = new Vector3();
    this.view.camera.getWorldPosition(cam);
    const center = new Vector3();
    b.root.getWorldPosition(center);
    const view = cam.sub(center).normalize();
    const fwd = new Vector3(0, 0, 1).applyQuaternion(b.root.quaternion);
    const front = fwd.dot(view) >= 0;
    b.sides.front.visible = front;
    b.sides.back.visible = !front;
  }

  /** 鏡頭的「下方」在周邊自己的座標裡 */
  private localDown(): Pt {
    const b = this.build;
    if (!b) return { x: 0, y: -1 };
    const down = new Vector3(0, -1, 0).applyQuaternion(this.view.camera.quaternion);
    down.applyQuaternion(b.root.quaternion.clone().invert());
    return { x: down.x, y: down.y };
  }

  /** 物理前進一步（h 秒） */
  private physicsStep(h: number): void {
    const s = this.build?.shaker;
    if (!s) return;
    const g = gravityFor(this.shake, this.localDown(), this.gyro);
    this.shake.x *= SHAKE_DECAY;
    this.shake.y *= SHAKE_DECAY;
    s.physics.step(g, h);
  }

  /** 物理的結果搬到畫面上 */
  private syncParts(): void {
    const s = this.build?.shaker;
    if (!s) return;
    s.physics.parts.forEach((p, i) => {
      const node = s.nodes[i];
      node.position.set(p.body.position.x, p.body.position.y, p.body.position.z);
      node.quaternion.copy(
        new Quaternion(
          p.body.quaternion.x,
          p.body.quaternion.y,
          p.body.quaternion.z,
          p.body.quaternion.w,
        ),
      );
    });
  }

  private tick(dt: number): boolean {
    if (this.exporting || !this.build) return false;
    let changed = false;
    const root = this.build.root;
    if (this.spin > 0 && !this.gyro) {
      root.rotation.y += this.spin * SPIN_RAD_PER_SEC * dt;
      changed = true;
    }
    this.updateSides();
    if (this.build.shaker) {
      /* 固定 1/60 秒一步，依實際經過的時間補步（最多 5 步） */
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < 5) {
        this.physicsStep(STEP);
        this.acc -= STEP;
        n++;
      }
      if (n === 5) this.acc = 0;
      this.syncParts();
      changed = true;
    }
    return changed;
  }

  /* ---------- 匯出 ---------- */

  /** 開始逐格擷取：停住預覽，記下目前的角度與物理狀態 */
  beginCapture(): void {
    this.exporting = true;
    this.view.stop();
    const r = this.build?.root;
    this.saved = {
      y: r?.rotation.y ?? 0,
      z: r?.rotation.z ?? 0,
      restore: this.build?.shaker?.physics.snapshot() ?? null,
    };
    this.shakeSaved = { ...this.shake };
  }

  /**
   * 畫第 i 格到 ctx（width × height）。轉一圈：y 軸角度＝i ÷ 格數 × 360°；搖搖樂：z 軸左右搖，
   * 第 2 格起每格先讓物理前進「影格時間 × 1/3」。
   */
  captureFrame(
    plan: ExportPlan,
    i: number,
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    const b = this.build;
    if (!b) return;
    const a = frameAngle(plan, i);
    if (plan.kind === 'spin') {
      b.root.rotation.y = a;
      b.root.rotation.z = 0;
    } else {
      b.root.rotation.z = a;
      if (i > 0) this.physicsStep((1 / plan.fps) * EXPORT_PHYSICS_RATIO);
      this.syncParts();
    }
    this.updateSides();
    this.view.capture(ctx, width, height);
  }

  /** 畫目前的畫面（PNG） */
  captureCurrent(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    this.updateSides();
    this.view.capture(ctx, width, height);
  }

  /** 結束擷取：角度、物理、畫面大小還原，預覽繼續 */
  endCapture(): void {
    const b = this.build;
    if (b && this.saved) {
      b.root.rotation.y = this.saved.y;
      b.root.rotation.z = this.saved.z;
      this.saved.restore?.();
      this.syncParts();
    }
    this.shake = { ...this.shakeSaved };
    this.saved = null;
    this.view.setSize(CANVAS_SIZE, CANVAS_SIZE);
    this.updateSides();
    this.exporting = false;
    this.view.invalidate();
    this.view.start();
  }

  /**
   * GLB：目前的周邊（含目前的角度、零件位置；正反面各自算時只有目前看得到的那面）。
   * Phong 材質（壓克力、亮面的印圖）照舊版（r128）的換算寫 metallic 0.5、roughness 0.5；霧面不受光照。
   */
  async glb(): Promise<Uint8Array | null> {
    if (!this.build) return null;
    return exportGlb(this.build.root, { nonPbr: LEGACY_GLB_NON_PBR });
  }

  prepareTexture = (t: CanvasTexture): CanvasTexture => this.view.prepareTexture(t);

  dispose(): void {
    if (this.build) {
      this.view.scene.remove(this.build.root);
      disposeObject(this.build.root);
      this.build = null;
    }
    this.view.dispose();
  }
}
