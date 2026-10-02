/**
 * 繪製環境：圖片從資產庫（已解碼的）取、字型換成 canvas 的 font-family、換色圖片的快取。
 */
import { canvasFontFamily } from './fonts';
import type { RenderEnv } from './render';
import { assets } from './store';

export const env: RenderEnv = {
  image: (id) => assets.peekBitmap(id),
  fontFamily: canvasFontFamily,
  recolorCache: new Map(),
};
