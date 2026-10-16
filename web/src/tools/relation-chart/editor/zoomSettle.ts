/**
 * 縮放的「停手」判斷（D72）：縮放中只改圖層的 transform（不重新排版），停手才用新的倍率重新排版、整張以螢幕解析度重畫。
 *
 * 角色多時，縮放的每一格本身就要 0.1～0.15 秒（倍率一變，SVG 的文字要照新的倍率重新排版），換遠近檔位那格是整張重畫、
 * 可能到 0.5 秒；而重新排版＋整張重畫一次在 120 位時要 0.3～0.4 秒。第四批固定「停手 0.15 秒」：一格稍慢，計時就在
 * 那一格還沒畫完時到期，滾動途中重新排版、卡住下一格（驗證時 120 位偶爾一格 347～828 ms）。改成：
 * - 最後一格的畫面畫好之前不算停手（呼叫端在縮放後的第二個 rAF 呼叫 framed）；
 * - 畫好之後再等「最近幾格間隔的 3 倍」（至少 0.3 秒、至多 1 秒）；
 * - 重新排版過之後的下一次縮放不帶上一次的間隔。
 */
export const SETTLE_MIN_MS = 300;
export const SETTLE_MAX_MS = 1000;
/** 看最近幾格的間隔 */
const RECENT = 4;

export class ZoomSettle {
  /** 最後的動靜（縮放或畫好畫面）的時間 */
  private last = Number.NEGATIVE_INFINITY;
  private lastInput = Number.NEGATIVE_INFINITY;
  private gaps: number[] = [];
  /** 最後一格的畫面還沒畫好 */
  private pending = false;

  /** 縮放了一格（t＝performance.now()） */
  input(t: number): void {
    const gap = t - this.lastInput;
    if (gap < SETTLE_MAX_MS) {
      this.gaps.push(gap);
      if (this.gaps.length > RECENT) this.gaps.shift();
    } else this.gaps = [];
    this.lastInput = t;
    this.last = t;
    this.pending = true;
  }

  /** 最後一格的畫面畫好了（縮放後的第二個 rAF） */
  framed(t: number): void {
    this.pending = false;
    this.last = Math.max(this.last, t);
  }

  /** 還要等多久才算停手（0＝已經停手，可以重新排版；Infinity＝等畫面畫好再算） */
  wait(t: number): number {
    if (this.pending) return Number.POSITIVE_INFINITY;
    const need = Math.min(SETTLE_MAX_MS, Math.max(SETTLE_MIN_MS, 3 * Math.max(0, ...this.gaps)));
    return Math.max(0, this.last + need - t);
  }

  /** 重新排版過了：下一次縮放重新算間隔 */
  done(): void {
    this.gaps = [];
  }
}
