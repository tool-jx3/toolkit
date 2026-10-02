/**
 * 範例影片（本站自己畫）：640 × 360、30 fps、3 秒。深色漸層底、繞圈的圓、轉動的方塊、中央的文字與目前格數。
 */
import { recordCanvas } from '@/core/video';

export const SAMPLE = { width: 640, height: 360, fps: 30, seconds: 3, base: 'sample_motion' };

/** 畫範例影片第 t 秒（第 frame 格）的畫面 */
export function drawSampleFrame(ctx: CanvasRenderingContext2D, t: number, frame: number): void {
  const { width: W, height: H, fps, seconds } = SAMPLE;
  const total = Math.round(fps * seconds);
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0e2235');
  g.addColorStop(1, '#3a1d4d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  /* 地板的格線（看得出畫面在動） */
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  const shift = (t * 40) % 40;
  for (let x = -40 + shift; x < W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }

  const a = (t / seconds) * Math.PI * 2;
  /* 繞圈的圓 */
  ctx.fillStyle = '#f59e3b';
  ctx.beginPath();
  ctx.arc(W / 2 + Math.cos(a) * 200, H / 2 + Math.sin(a * 2) * 90, 34, 0, Math.PI * 2);
  ctx.fill();
  /* 轉動的方塊 */
  ctx.save();
  ctx.translate(W / 2 - Math.cos(a) * 170, H / 2 + Math.sin(a) * 70);
  ctx.rotate(a * 2);
  ctx.fillStyle = '#2bb6a8';
  ctx.fillRect(-26, -26, 52, 52);
  ctx.restore();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 30px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  ctx.fillText('範例影片', W / 2, H / 2 - 6);
  ctx.font = '16px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  ctx.fillStyle = '#d6dbe4';
  ctx.fillText(`第 ${Math.min(total, frame + 1)} 格／${total}`, W / 2, H / 2 + 28);
}

/** 錄製範例影片（依實際時間錄 3 秒） */
export async function makeSampleVideo(signal?: AbortSignal): Promise<File> {
  const blob = await recordCanvas({
    width: SAMPLE.width,
    height: SAMPLE.height,
    fps: SAMPLE.fps,
    seconds: SAMPLE.seconds,
    draw: drawSampleFrame,
    signal,
  });
  const type = blob.type || 'video/webm';
  return new File([blob], `${SAMPLE.base}.${type.includes('mp4') ? 'mp4' : 'webm'}`, { type });
}
