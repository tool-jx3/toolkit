/**
 * SVG 字串畫成 canvas：圖片必須是 data URI（SVG 當成 <img> 載入時不能讀 blob 網址）。
 * 有內嵌的匯入字型時（第三批）：SVG 圖片裡的 @font-face 是非同步載入的，第一次畫可能還是後備字型——
 * 先等圖片解碼、試畫一次，等字型就緒再正式畫（PNG 點陣化前確定字型已載入）。
 */
import { canvasToBlob } from '@/core/image';

const nextFrame = () =>
  new Promise<void>((r) =>
    typeof requestAnimationFrame === 'undefined'
      ? setTimeout(r, 16)
      : requestAnimationFrame(() => r()),
  );

export async function svgToCanvas(
  svg: string,
  W: number,
  H: number,
  waitFonts = false,
): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('無法把關係圖畫成圖片。'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(W));
    canvas.height = Math.max(1, Math.round(H));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('無法建立畫布。');
    ctx.imageSmoothingQuality = 'high';
    if (waitFonts) {
      await img.decode?.().catch(() => undefined);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      await nextFrame();
      await new Promise((r) => setTimeout(r, 120));
      await nextFrame();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function svgToPng(
  svg: string,
  W: number,
  H: number,
  waitFonts = false,
): Promise<Blob> {
  const canvas = await svgToCanvas(svg, W, H, waitFonts);
  return await canvasToBlob(canvas, 'image/png');
}
