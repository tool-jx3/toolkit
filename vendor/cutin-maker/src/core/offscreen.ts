/**
 * オフスクリーンは使い回す。パスごとに createElement('canvas') すると
 * フレーム描画が破綻する（GC 圧と生成コスト）。
 *
 * プールは用途ごとに分ける。プレビュー（480px）とサムネ（160px）が同じバッファを
 * 取り合うと、rAF のたびにリサイズが往復して重くなるため。
 */
export type PoolId = 'main' | 'thumb';

const pools = new Map<PoolId, HTMLCanvasElement[]>();

export function scratch(pool: PoolId, index: number, w: number, h: number): HTMLCanvasElement {
  let list = pools.get(pool);
  if (!list) {
    list = [];
    pools.set(pool, list);
  }
  let c = list[index];
  if (!c) {
    c = document.createElement('canvas');
    list[index] = c;
  }
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  return c;
}

/** クリアして 2D コンテキストを返す */
export function scratchCtx(pool: PoolId, index: number, w: number, h: number): CanvasRenderingContext2D {
  const c = scratch(pool, index, w, h);
  const ctx = c.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.clearRect(0, 0, w, h);
  return ctx;
}
