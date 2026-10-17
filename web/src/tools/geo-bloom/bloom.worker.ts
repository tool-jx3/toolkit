/**
 * 幾何花紋的 Worker：產生與繪製都在這裡做，主畫面不會凍住（規格 F54）。
 * 預覽畫在 OffscreenCanvas 上、以 ImageBitmap 轉移回去；PNG 用 convertToBlob（全尺寸）。
 */
import { exposeApi, transfer } from '@/core/worker';
import { drawFull, drawPreview, type PreviewOutput, sceneOf, svgText } from './engine';
import type { BloomScene } from './generate';
import type { Settings } from './settings';

const api = {
  preview(settings: Settings): PreviewOutput & { bitmap: ImageBitmap } {
    const canvas = new OffscreenCanvas(1, 1);
    const out = drawPreview(settings, canvas);
    const bitmap = canvas.transferToImageBitmap();
    return transfer({ ...out, bitmap }, [bitmap]);
  },
  async png(settings: Settings): Promise<Blob> {
    const canvas = new OffscreenCanvas(1, 1);
    drawFull(settings, canvas);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    /* 大畫布約 256 MB：馬上釋放 */
    canvas.width = 0;
    canvas.height = 0;
    return blob;
  },
  svg(settings: Settings): string {
    return svgText(settings);
  },
  scene(settings: Settings): BloomScene {
    return sceneOf(settings);
  },
};

export type BloomWorkerApi = typeof api;

exposeApi(api);
