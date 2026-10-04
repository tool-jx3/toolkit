/**
 * 釋放 three.js 物件佔用的 GPU 資源（幾何、材質、貼圖）。同一份材質或貼圖被很多個網格共用時只釋放一次。
 */
import type { Material, Object3D, Texture } from 'three';

function isTexture(v: unknown): v is Texture {
  return !!v && typeof v === 'object' && (v as Texture).isTexture === true;
}

type Drawable = Object3D & {
  geometry?: { dispose(): void };
  material?: Material | Material[];
};

/** 釋放 root 底下所有網格的幾何、材質與材質上的貼圖（root 本身不會從場景移除） */
export function disposeObject(root: Object3D): void {
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse((o) => {
    const mesh = o as Drawable;
    mesh.geometry?.dispose();
    const list = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    for (const m of list) materials.add(m);
  });
  for (const m of materials) {
    for (const v of Object.values(m)) if (isTexture(v)) textures.add(v);
    m.dispose();
  }
  for (const t of textures) t.dispose();
}
