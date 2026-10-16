/**
 * SVG 字串畫成 canvas：圖片必須是 data URI（SVG 當成 <img> 載入時不能讀 blob 網址）。
 */
import { canvasToBlob } from '@/core/image';

export async function svgToCanvas(svg: string, W: number, H: number): Promise<HTMLCanvasElement> {
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
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function svgToPng(svg: string, W: number, H: number): Promise<Blob> {
  const canvas = await svgToCanvas(svg, W, H);
  return await canvasToBlob(canvas, 'image/png');
}
