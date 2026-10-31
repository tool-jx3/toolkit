/**
 * 把分開的地板區塊用寬 1 格的 L 形隧道接起來，讓每塊地板都走得到（四方向）。
 * 參考 rot.js（© Ondrej Zara，BSD-3-Clause；見 ../UPSTREAM_LICENSE）的 Map.Cellular#connect：
 * 從已接上的那一邊（或還沒接上的那一邊，看哪邊格子少）隨機挑一格、找另一邊最近的一格，試 5 次、夠近就停，
 * 再先橫後直挖過去。這裡每挖一條就重新算一次區塊（地圖最多 3600 格），所以隧道穿過的別的區塊也算接上了。
 *
 * 只有一個區塊時什麼都不做、也不取亂數（洞窟以外的生成法拿它當保險，不影響本來就連通的地圖）。
 */
import type { Random } from '@/core/timeline';
import { type Mask, regions } from './mask';

const dist2 = (cols: number, a: number, b: number): number => {
  const dx = (a % cols) - (b % cols);
  const dy = Math.floor(a / cols) - Math.floor(b / cols);
  return dx * dx + dy * dy;
};

function closest(cols: number, from: number, pool: readonly number[]): number {
  let best = pool[0];
  let bestD = Number.POSITIVE_INFINITY;
  for (const p of pool) {
    const d = dist2(cols, from, p);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** 先沿左邊那一點的列橫著挖，再沿右邊那一點的欄直著挖（兩點都是地板，所以隧道不會超出兩點圍成的範圍） */
function tunnel(m: Mask, a: number, b: number): void {
  const { cols, open } = m;
  let ax = a % cols;
  let ay = Math.floor(a / cols);
  let bx = b % cols;
  let by = Math.floor(b / cols);
  if (ax > bx) {
    [ax, ay, bx, by] = [bx, by, ax, ay];
  }
  for (let x = ax; x <= bx; x++) open[ay * cols + x] = 1;
  const x = bx;
  const y0 = Math.min(ay, by);
  const y1 = Math.max(ay, by);
  for (let y = y0; y <= y1; y++) open[y * cols + x] = 1;
}

/** 接起所有區塊；回傳挖了幾條隧道 */
export function connectRegions(m: Mask, rng: Random): number {
  let r = regions(m);
  if (r.cells.length <= 1) return 0;
  const all = r.cells.flat().sort((p, q) => p - q);
  const start = all[rng.int(0, all.length - 1)];
  let dug = 0;
  /* 保險：區塊數每次至少少一個 */
  for (let guard = r.cells.length + 1; r.cells.length > 1 && guard > 0; guard--) {
    const home = r.label[start];
    const connected = r.cells[home];
    const others = r.cells.filter((_, i) => i !== home).flat();
    let from = others[0];
    let to = connected[0];
    for (let i = 0; i < 5; i++) {
      if (connected.length < others.length) {
        to = connected[rng.int(0, connected.length - 1)];
        from = closest(m.cols, to, others);
      } else {
        from = others[rng.int(0, others.length - 1)];
        to = closest(m.cols, from, connected);
      }
      if (dist2(m.cols, from, to) < 64) break;
    }
    tunnel(m, from, to);
    dug++;
    r = regions(m);
  }
  return dug;
}
