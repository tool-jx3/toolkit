/**
 * 把排好的一頁（DOM 元素）畫成點陣圖（PNG）：複製元素、圖片換成 data URL，連同頁面的 CSS 放進
 * SVG 的 foreignObject，再畫到 canvas 上。（coc-sheet 的「匯出 PNG」移植時新增）
 *
 * 限制（瀏覽器把 SVG 當圖片畫時不讀任何外部資源）：
 * - 字型只用得到電腦上的字型（網頁字型不會載入）；要和畫面一致，頁面的 CSS 請用系統字型堆疊。
 * - `<img>` 會先換成 data URL（同網域、blob: 的圖都可以）；CSS 的 `url()` 背景圖要自己先寫成 data URL。
 * - 表單元件畫的是屬性裡的值；頁面請用一般的文字元素。
 * 元素的尺寸用排版尺寸（offsetWidth／offsetHeight），所以放在縮放過的檢視區（PagedViewport）裡也可以直接畫。
 */

export interface RasterizeOptions {
  /** 頁面的樣式（與畫面、列印用的同一份 CSS 字串） */
  css: string;
  /** 倍率（預設 2：A4 約 192 dpi） */
  scale?: number;
  /** 包住頁面的元素的 class（CSS 選擇器依附的祖先，例如 `.sheet-root`） */
  rootClass?: string;
  /** 底色（預設白色；null＝透明） */
  background?: string | null;
}

/** 圖片元素 → data URL（已經是 data URL 的照原樣；畫不出來時 null） */
async function imageDataUrl(img: HTMLImageElement): Promise<string | null> {
  const src = img.currentSrc || img.src;
  if (!src) return null;
  if (src.startsWith('data:')) return src;
  try {
    if (!img.complete) await img.decode();
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return null;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return c.toDataURL('image/png');
  } catch {
    return null;
  }
}

/** 頁面元素的 SVG（foreignObject）文字；圖片已換成 data URL */
export async function elementSvg(
  el: HTMLElement,
  o: Pick<RasterizeOptions, 'css' | 'rootClass'>,
): Promise<{ svg: string; width: number; height: number }> {
  const width = el.offsetWidth;
  const height = el.offsetHeight;
  const clone = el.cloneNode(true) as HTMLElement;
  clone.style.margin = '0';
  const srcImages = [...el.querySelectorAll('img')];
  const cloneImages = [...clone.querySelectorAll('img')];
  await Promise.all(
    srcImages.map(async (img, i) => {
      const target = cloneImages[i];
      if (!target) return;
      const url = await imageDataUrl(img);
      if (url) target.setAttribute('src', url);
      else target.remove();
      target.removeAttribute('srcset');
    }),
  );
  const xml = new XMLSerializer().serializeToString(clone);
  const css = o.css.replace(/]]>/g, ']] >');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject x="0" y="0" width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" class="${o.rootClass ?? ''}" style="margin:0;padding:0"><style><![CDATA[${css}]]></style>${xml}</div></foreignObject></svg>`;
  return { svg, width, height };
}

/** 畫成 canvas（尺寸＝排版尺寸 × scale） */
export async function rasterizeElement(
  el: HTMLElement,
  o: RasterizeOptions,
): Promise<HTMLCanvasElement> {
  const scale = o.scale ?? 2;
  const { svg, width, height } = await elementSvg(el, o);
  const img = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('無法把頁面畫成圖片。'));
  });
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await loaded;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('無法建立畫布。');
  const bg = o.background === undefined ? '#ffffff' : o.background;
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** 把幾張 canvas 由上而下接成一張（間距 gap px，底色 background；null＝透明） */
export function stackCanvases(
  canvases: readonly HTMLCanvasElement[],
  { gap = 0, background = '#ffffff' }: { gap?: number; background?: string | null } = {},
): HTMLCanvasElement {
  const width = Math.max(1, ...canvases.map((c) => c.width));
  const height = Math.max(
    1,
    canvases.reduce((sum, c) => sum + c.height, 0) + gap * Math.max(0, canvases.length - 1),
  );
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('無法建立畫布。');
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  let y = 0;
  for (const c of canvases) {
    ctx.drawImage(c, 0, y);
    y += c.height + gap;
  }
  return out;
}
