/**
 * 單元測試用的真畫布：Node 沒有 OffscreenCanvas。有裝 `canvas`（node-canvas；fabric、jsdom 的選用相依，`npm ci` 會裝）時
 * 把 globalThis.OffscreenCanvas 換成它（工具的 makeCanvas 在沒有 document 時用 OffscreenCanvas），回傳 createCanvas；
 * 裝不起來時回傳 null，用到的測試以 `describe.runIf` 跳過（純函式的測試照跑）。
 * 單元測試的型別沒有 Node（tsconfig.json），模組以動態 import 載入、自己標型別。
 */
export interface NodeCanvas {
  createCanvas(width: number, height: number): OffscreenCanvas;
}

const dyn = <T>(name: string): Promise<T> => import(/* @vite-ignore */ name) as Promise<T>;

export async function nodeCanvas(): Promise<NodeCanvas | null> {
  try {
    const mod = await dyn<Partial<NodeCanvas> & { default?: NodeCanvas }>('canvas');
    const m = (typeof mod.createCanvas === 'function' ? mod : mod.default) as
      | NodeCanvas
      | undefined;
    if (!m || typeof m.createCanvas !== 'function') return null;
    const make = m.createCanvas.bind(m);
    const g = globalThis as { OffscreenCanvas?: unknown };
    if (typeof g.OffscreenCanvas === 'undefined') {
      g.OffscreenCanvas = class {
        constructor(width: number, height: number) {
          // biome-ignore lint/correctness/noConstructorReturn: 直接交出 node-canvas 的畫布當 OffscreenCanvas 用
          return make(width, height);
        }
      };
    }
    return m;
  } catch {
    return null;
  }
}
