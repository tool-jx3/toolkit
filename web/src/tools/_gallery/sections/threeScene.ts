/**
 * 元件展示頁的 3D 示範場景（按下「載入 3D 示範」才動態載入，three.js 不會進展示頁的主檔）。
 */
import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshPhongMaterial,
  TorusKnotGeometry,
} from 'three';
import { createOrbitView, disposeObject, exportGlb, type OrbitView } from '@/core/three';

export interface ThreeDemo {
  view: OrbitView;
  setLight(x: number, y: number): void;
  glbBytes(): Promise<number>;
  dispose(): void;
}

export function createThreeDemo(canvas: HTMLCanvasElement): ThreeDemo {
  const view = createOrbitView(canvas, { width: 480, height: 360, position: [0, 80, 260] });
  const knot = new Mesh(
    new TorusKnotGeometry(50, 16, 160, 24),
    new MeshPhongMaterial({ color: 0x8b6fd6, shininess: 80 }),
  );
  const plate = new Mesh(
    new BoxGeometry(220, 6, 140),
    new MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }),
  );
  plate.position.y = -80;
  const key = new DirectionalLight(0xffffff, 2.5);
  key.position.set(200, 300, 200);
  view.scene.add(knot, plate, new AmbientLight(0xffffff, 0.8), key);
  view.frameObject(knot, { margin: 1.6, aim: 'center' });
  view.onFrame((dt) => {
    knot.rotation.y += dt * 0.8;
    return true;
  });
  view.start();
  return {
    view,
    setLight(x, y) {
      key.position.set(x * 400, 300, y * 400);
      view.invalidate();
    },
    async glbBytes() {
      return (await exportGlb(knot)).byteLength;
    },
    dispose() {
      disposeObject(knot);
      disposeObject(plate);
      view.dispose();
    },
  };
}
