/**
 * 生成法「洞窟」：細胞自動機。
 * 參考 rot.js（© Ondrej Zara，BSD-3-Clause；見 ../UPSTREAM_LICENSE）的 Map.Cellular：
 * 隨機撒岩石，再重複套用「岩石四周 8 格裡有 4 格以上是岩石就留著、空地四周有 5 格以上是岩石就變成岩石」
 * （rot.js 預設的 born 5～8／survive 4～8），最後把分開的空地挖隧道接起來（Cellular#connect）。
 * 改寫的地方：最外一圈固定是岩石（地圖外面也當岩石算），牆才能把地板包住；
 * 小於 MIN_REGION 格的地板碎塊先填回岩石，不為了一兩格的小洞挖長隧道；
 * 亂數用本站的種子亂數（rot.js 的亂數是全域狀態）。
 */
import type { Random } from '@/core/timeline';
import { connectRegions } from './connect';
import { scatterLights } from './lights';
import { countOpen, createMask, dropSmallRegions, type Mask } from './mask';
import type { Generated } from './types';

/** 小於這個格數的地板碎塊填回岩石 */
export const MIN_REGION = 4;

function smoothOnce(rock: Uint8Array, cols: number, rows: number): Uint8Array<ArrayBuffer> {
  const next = new Uint8Array(rock.length).fill(1);
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      const i = y * cols + x;
      const n =
        rock[i - cols - 1] +
        rock[i - cols] +
        rock[i - cols + 1] +
        rock[i - 1] +
        rock[i + 1] +
        rock[i + cols - 1] +
        rock[i + cols] +
        rock[i + cols + 1];
      next[i] = rock[i] ? (n >= 4 ? 1 : 0) : n >= 5 ? 1 : 0;
    }
  }
  return next;
}

/** 洞窟的地板遮罩（還沒接隧道）。fillPct：一開始是岩石的比例（%）；smooth：平滑次數 */
export function caveMask(
  rng: Random,
  cols: number,
  rows: number,
  fillPct: number,
  smooth: number,
): Mask {
  const fill = fillPct / 100;
  let rock = new Uint8Array(cols * rows).fill(1);
  for (let y = 1; y < rows - 1; y++)
    for (let x = 1; x < cols - 1; x++) rock[y * cols + x] = rng.next() < fill ? 1 : 0;
  for (let k = 0; k < smooth; k++) rock = smoothOnce(rock, cols, rows);
  const mask = createMask(cols, rows);
  for (let i = 0; i < rock.length; i++) mask.open[i] = rock[i] ? 0 : 1;
  dropSmallRegions(mask, MIN_REGION);
  /* 全部填滿了（填充率很高）：在正中央挖一塊 4 × 4 的空地，至少有個地方站 */
  if (countOpen(mask) === 0) {
    const x0 = Math.max(1, Math.floor(cols / 2) - 2);
    const y0 = Math.max(1, Math.floor(rows / 2) - 2);
    for (let y = y0; y < Math.min(rows - 1, y0 + 4); y++)
      for (let x = x0; x < Math.min(cols - 1, x0 + 4); x++) mask.open[y * cols + x] = 1;
  }
  return mask;
}

export function generateCave(
  rng: Random,
  cols: number,
  rows: number,
  fillPct: number,
  smooth: number,
): Generated {
  const mask = caveMask(rng, cols, rows, fillPct, smooth);
  connectRegions(mask, rng);
  return { mask, rooms: null, corridors: [], lights: scatterLights(mask, rng) };
}
