/**
 * 繪製環境：圖片從資產庫取、字型換成 canvas 的 font-family、換色圖片的快取。
 *
 * 圖片優先用解碼好的 `<img>`（與原作相同）：Chromium 縮小繪製 ImageBitmap 時不做 mipmap，
 * 細線會出現摩爾紋；`<img>` 縮小後與原作逐像素相同。`<img>` 還沒解碼好時先用資產庫的 ImageBitmap 畫，
 * 解碼好後 bump() 讓預覽重畫；匯出前用 loadImageElements() 等它們都準備好。
 */
import { canvasFontFamily } from './fonts';
import type { RenderEnv } from './render';
import { assets, bump } from './store';

const elements = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<void>>();

/** 把資產庫的圖解碼成 `<img>`（同一個 id 只做一次） */
function loadElement(id: string): Promise<void> {
  if (elements.has(id)) return Promise.resolve();
  let p = pending.get(id);
  if (!p) {
    p = (async () => {
      if (typeof Image === 'undefined') return;
      const url = await assets.url(id);
      if (!url) return;
      const img = new Image();
      img.src = url;
      await img.decode();
      elements.set(id, img);
      bump();
    })().catch(() => {
      pending.delete(id);
    });
    pending.set(id, p);
  }
  return p;
}

/** 匯出前：這些圖的 `<img>` 都解碼好 */
export async function loadImageElements(ids: Iterable<string>): Promise<void> {
  await Promise.all([...ids].map((id) => loadElement(id)));
}

export const env: RenderEnv = {
  image: (id) => {
    const el = elements.get(id);
    if (el) return el;
    const bmp = assets.peekBitmap(id);
    if (bmp) void loadElement(id);
    return bmp;
  },
  fontFamily: canvasFontFamily,
  recolorCache: new Map(),
};
