/**
 * GLB（二進位 glTF 2.0）：把 three.js 的物件存成 GLB。檔案結構的檢查在 glbInfo.ts（純函式，不依賴 three.js）。
 */
import type { Material, Object3D } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

/** 非 PBR 材質（Phong、Lambert…）在 GLB 裡的金屬度與粗糙度 */
export interface NonPbrFactors {
  metallic: number;
  roughness: number;
}

/**
 * three.js r128 的 GLTFExporter 對非 PBR 材質的換算（metallic 0.5、roughness 0.5）。
 * 現行版本改成 0／1（無反光的塑膠）；照舊版外觀的工具（例如壓克力周邊工房）傳這個值。
 */
export const LEGACY_GLB_NON_PBR: NonPbrFactors = { metallic: 0.5, roughness: 0.5 };

export interface ExportGlbOptions {
  /** 只匯出看得到的物件（預設 true） */
  onlyVisible?: boolean;
  /** 貼圖最大邊長（預設 4096） */
  maxTextureSize?: number;
  /**
   * 非 PBR 材質（不是 MeshStandardMaterial、也不是 MeshBasicMaterial）寫進 GLB 的 metallicFactor／roughnessFactor。
   * 不給時照 three.js 現行的 0／1；MeshBasicMaterial 一律是不受光照（KHR_materials_unlit），不受影響。
   */
  nonPbr?: NonPbrFactors;
}

/** 把物件（含子物件、材質與貼圖）存成 GLB 的位元組 */
export async function exportGlb(
  object: Object3D,
  options: ExportGlbOptions = {},
): Promise<Uint8Array> {
  const { onlyVisible = true, maxTextureSize = 4096, nonPbr } = options;
  const exporter = new GLTFExporter();
  if (nonPbr) {
    exporter.register(() => ({
      writeMaterialAsync: async (material: Material, def: { [key: string]: unknown }) => {
        const m = material as Material & {
          isMeshStandardMaterial?: boolean;
          isMeshBasicMaterial?: boolean;
        };
        if (m.isMeshStandardMaterial || m.isMeshBasicMaterial) return;
        const pbr = def.pbrMetallicRoughness as {
          metallicFactor?: number;
          roughnessFactor?: number;
        };
        pbr.metallicFactor = nonPbr.metallic;
        pbr.roughnessFactor = nonPbr.roughness;
      },
    }));
  }
  const result = await exporter.parseAsync(object, {
    binary: true,
    onlyVisible,
    maxTextureSize,
  });
  if (!(result instanceof ArrayBuffer)) throw new Error('GLB 匯出失敗');
  return new Uint8Array(result);
}
