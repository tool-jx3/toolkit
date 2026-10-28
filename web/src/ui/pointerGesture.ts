/**
 * 一指拖曳／兩指捏合的追蹤（純邏輯，不綁 DOM；指標事件的 pointerId 與 clientX／Y 丟進來就好）。
 * color-palette 的配色卡照片加雙指縮放時新增（2026-10）。
 *
 * - 一根手指（或滑鼠）按著：`move` 給 `{ kind: 'pan', dx, dy }`（從起點算的位移）。
 * - 第二根手指按下：改成捏合，`move` 給 `{ kind: 'pinch', scale, originX, originY, dx, dy }`：
 *   scale＝兩指距離÷開始時的距離，origin＝開始時兩指的中點，dx／dy＝中點的位移（跟著中點平移）。
 * - 第三根以後的手指不理。放開一指時剩下的那一指從目前的位置接著拖。
 * - `down`／`up` 回傳 true 表示「起點換了」：呼叫端要把目前的狀態記成新的起點（之後的 move 都相對於它）。
 *
 * ```ts
 * const g = createPointerGesture();
 * onPointerDown: if (g.down(e.pointerId, e.clientX, e.clientY)) start = current;
 * onPointerMove: const s = g.move(e.pointerId, e.clientX, e.clientY); if (s) current = apply(start, s);
 * onPointerUp:   if (g.up(e.pointerId)) start = current; if (!g.active()) commit(current);
 * ```
 */

export type GestureSample =
  | { kind: 'pan'; dx: number; dy: number }
  | { kind: 'pinch'; scale: number; originX: number; originY: number; dx: number; dy: number };

export interface PointerGesture {
  /** 按下；回傳 true＝起點換了（開始拖曳、或改成捏合） */
  down(id: number, x: number, y: number): boolean;
  /** 移動；不是追蹤中的指標時 null */
  move(id: number, x: number, y: number): GestureSample | null;
  /** 放開或取消；回傳 true＝還有手指按著、起點換了（捏合變回一指拖曳） */
  up(id: number): boolean;
  /** 還有指標按著嗎 */
  active(): boolean;
  /** 目前按著幾個指標（最多算 2 個） */
  count(): number;
  reset(): void;
}

export function createPointerGesture(): PointerGesture {
  const points = new Map<number, { x: number; y: number }>();
  let base:
    | { kind: 'pan'; id: number; x: number; y: number }
    | { kind: 'pinch'; dist: number; mx: number; my: number }
    | null = null;

  const pair = () => {
    const [a, b] = [...points.values()];
    return {
      dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      mx: (a.x + b.x) / 2,
      my: (a.y + b.y) / 2,
    };
  };
  const rebase = () => {
    if (points.size >= 2) base = { kind: 'pinch', ...pair() };
    else if (points.size === 1) {
      const [[id, p]] = [...points.entries()];
      base = { kind: 'pan', id, x: p.x, y: p.y };
    } else base = null;
  };

  return {
    down(id, x, y) {
      if (points.size >= 2 || points.has(id)) return false;
      points.set(id, { x, y });
      rebase();
      return true;
    },
    move(id, x, y) {
      if (!points.has(id) || !base) return null;
      points.set(id, { x, y });
      if (base.kind === 'pan')
        return base.id === id ? { kind: 'pan', dx: x - base.x, dy: y - base.y } : null;
      const now = pair();
      return {
        kind: 'pinch',
        scale: now.dist / base.dist,
        originX: base.mx,
        originY: base.my,
        dx: now.mx - base.mx,
        dy: now.my - base.my,
      };
    },
    up(id) {
      if (!points.delete(id)) return false;
      rebase();
      return points.size > 0;
    },
    active: () => points.size > 0,
    count: () => points.size,
    reset() {
      points.clear();
      base = null;
    },
  };
}
