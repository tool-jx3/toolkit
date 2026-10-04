/**
 * GLB（二進位 glTF 2.0）：把 three.js 的物件存成 GLB。檔案結構的檢查在 glbInfo.ts（純函式，不依賴 three.js）。
 */
import type { Object3D } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

export interface ExportGlbOptions {
  /** 只匯出看得到的物件（預設 true） */
  onlyVisible?: boolean;
  /** 貼圖最大邊長（預設 4096） */
  maxTextureSize?: number;
}

/** 把物件（含子物件、材質與貼圖）存成 GLB 的位元組 */
export async function exportGlb(
  object: Object3D,
  options: ExportGlbOptions = {},
): Promise<Uint8Array> {
  const { onlyVisible = true, maxTextureSize = 4096 } = options;
  const result = await new GLTFExporter().parseAsync(object, {
    binary: true,
    onlyVisible,
    maxTextureSize,
  });
  if (!(result instanceof ArrayBuffer)) throw new Error('GLB 匯出失敗');
  return new Uint8Array(result);
}
