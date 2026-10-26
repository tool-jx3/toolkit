/**
 * 圖片演出（截圖演出、地圖演出）共用的介面：import { ImageFxPreview, … } from '@/ui/imagefx'。
 * 不放進 `@/ui` 的總入口：這些元件連帶 core/imagefx（編碼、影片），放進總入口會讓每個工具都載入它們。
 */
export {
  FxSaveErrorNotice,
  ImageFxProjectMenu,
  type ImageFxProjectText,
  type ImageFxShortcutText,
  imageFxShortcuts,
  useFxAssetCleanup,
} from './ImageFxApp';
export { ImageFxEditLayer, type ImageFxEditLayerProps } from './ImageFxEditLayer';
export {
  fxVideoFormat,
  ImageFxApngEstimate,
  ImageFxExportArea,
  type ImageFxExportAreaProps,
  type ImageFxExportText,
  type ImageFxExtraFormat,
  useFxVideoMode,
} from './ImageFxExport';
export {
  type FxPlayerHandle,
  ImageFxPreview,
  type ImageFxPreviewProps,
  type ImageFxPreviewText,
  type ImageFxStageContext,
  useFxSourceImage,
} from './ImageFxPreview';
export {
  FxDocSlider,
  FxRangeSlider,
  type FxZoomProps,
  fxFrameName,
  fxRangeText,
  ImageFxCanvasSection,
  type ImageFxCanvasText,
  ImageFxCreditSection,
  type ImageFxCreditText,
  ImageFxFramesSection,
  type ImageFxFramesText,
  ImageFxImageSection,
  type ImageFxImageText,
  ImageFxShotSection,
  type ImageFxShotText,
  ImageFxTimingSection,
  type ImageFxTimingText,
  ImageFxZoomControls,
  type ImageFxZoomText,
} from './ImageFxSettings';
