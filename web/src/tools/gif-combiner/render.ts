/**
 * 畫一格合成畫面（預覽與匯出共用同一段程式）：依疊放順序把每張動圖在 t 毫秒時的那一格拉伸到它的位置與大小。
 * 背景色由呼叫端先塗（預覽自己塗；匯出交給 exportAnimation 的 background）。
 */
import { frameAtTime } from '@/core/decode';
import type { Ctx2D } from '@/core/timeline';
import { type CombinerItem, drawOrder } from './logic';
import type { Media } from './media';

export function renderComposite(
  ctx: Ctx2D,
  items: readonly CombinerItem[],
  media: Readonly<Record<string, Media>>,
  tMs: number,
  /** 畫在最上面的動圖（預覽拖曳中：放開時才真的移到最上層，見 Preview） */
  topId: string | null = null,
): void {
  const order = drawOrder(items);
  if (topId) {
    const i = order.findIndex((it) => it.id === topId);
    if (i >= 0) order.push(...order.splice(i, 1));
  }
  for (const it of order) {
    const m = media[it.asset];
    if (!m?.frames.length || !(it.width > 0 && it.height > 0)) continue;
    const k = frameAtTime(m.delays, tMs);
    /* 畫布預設的平滑（與舊版相同；見規格 3.2） */
    ctx.drawImage(m.frames[k], 0, 0, m.width, m.height, it.x, it.y, it.width, it.height);
  }
}
