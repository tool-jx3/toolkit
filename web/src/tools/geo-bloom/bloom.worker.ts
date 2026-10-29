/**
 * 幾何花紋的 Worker：產生與繪製都在這裡做，主畫面不會凍住（規格 F54）。
 * 預覽畫在 OffscreenCanvas 上、以 ImageBitmap 轉移回去；PNG 用 convertToBlob（全尺寸）。
 */
import { exposeApi, transfer } from '@/core/worker';
import { type DecodeImage, type DecodeMode, type DecodeResult, decodeImage } from './decode';
import {
  drawFull,
  drawPreview,
  loadDecodeImage,
  type PreviewOutput,
  sceneOf,
  svgText,
} from './engine';
import type { BloomScene } from './generate';
import type { Settings } from './settings';

/** 從圖片讀種子：讀過的圖留著（換讀的方式、點中心時再讀不必重新解碼圖片） */
let decodeSource: DecodeImage | null = null;

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
  /** 讀一張圖（縮到長邊最多 4000 px）：回傳結果與縮過的圖（畫標記用） */
  async decodeLoad(
    blob: Blob,
    mode: DecodeMode,
  ): Promise<{ result: DecodeResult; bitmap: ImageBitmap }> {
    const { image, bitmap } = await loadDecodeImage(blob);
    decodeSource = image;
    return transfer({ result: decodeImage(image, mode), bitmap }, [bitmap]);
  },
  /** 同一張圖換讀的方式或點的位置再讀 */
  decodeAgain(mode: DecodeMode, center: [number, number] | null): DecodeResult | null {
    return decodeSource ? decodeImage(decodeSource, mode, center) : null;
  },
};

export type BloomWorkerApi = typeof api;

exposeApi(api);
