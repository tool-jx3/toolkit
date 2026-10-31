/**
 * 大地圖的繪製（Worker）：產生格局、畫底圖、疊火光與格線，像素轉移給主執行緒。
 * 格局與底圖留在 Worker 的快取裡，只切換格線／火光時不重算。
 */
import { exposeApi, transfer } from '@/core/worker';
import { type MapPixels, MapRenderer, type MapRequest } from './mapRenderer';

const renderer = new MapRenderer();

const api = {
  draw(request: MapRequest): MapPixels {
    const out = renderer.draw(request);
    return transfer(out, [out.pixels.buffer]);
  },
};

export type RenderWorkerApi = typeof api;

exposeApi(api);
