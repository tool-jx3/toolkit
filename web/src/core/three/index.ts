/**
 * 3D（three.js）：檢視（算繪器、鏡頭、鏡頭控制、算繪迴圈、擷取畫面）、GLB 匯出與檢查、資源釋放。
 *
 * three.js 很大，只有用到 3D 的工具才 import 這個模組（Vite 依工具分包，其他工具的檔案不會變大）。
 * 預覽的外框用 `@/ui` 的 `Viewport3D`（本身不含 three.js）；GLB 的結構檢查 `parseGlb` 也可以單獨從
 * `@/core/three/glbInfo` 引用（不載入 three.js）。
 */
export { disposeObject } from './dispose';
export { type ExportGlbOptions, exportGlb } from './glb';
export { GLB_MAGIC, type GlbInfo, type GlbJson, parseGlb } from './glbInfo';
export {
  type ColorPipeline,
  createOrbitView,
  type FrameCallback,
  type FrameOptions,
  LEGACY_LIGHT_SCALE,
  type OrbitView,
  type OrbitViewOptions,
} from './view';
