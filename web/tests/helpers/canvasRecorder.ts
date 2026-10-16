/**
 * 記錄 canvas 2D 指令的假 context（Node 沒有 canvas）：每一個方法呼叫（含參數）與屬性設定都依序記下來，
 * 變換矩陣照實計算（getTransform 回傳目前的矩陣，陰影、光暈的模糊依它換算）。
 * 用途：比對兩段程式畫出來的指令是否完全相同（指令相同＝像素相同），例如「沒用到新功能時輸出不變」。
 */
type M = [number, number, number, number, number, number];

const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

export interface CanvasRecording {
  ctx: CanvasRenderingContext2D;
  log: unknown[];
}

export function recordCanvas(width = 100, height = 100): CanvasRecording {
  const log: unknown[] = [];
  let m: M = [1, 0, 0, 1, 0, 0];
  const stack: { m: M; props: Record<string, unknown> }[] = [];
  let props: Record<string, unknown> = { globalAlpha: 1 };
  let gradSeq = 0;
  const arg = (v: unknown): unknown =>
    v && typeof v === 'object' ? ((v as { __id?: string }).__id ?? 'object') : v;
  const gradient = (kind: string, args: unknown[]) => {
    const id = `${kind}#${++gradSeq}`;
    log.push([kind, ...args, id]);
    return {
      __id: id,
      addColorStop(o: number, c: string) {
        log.push(['addColorStop', id, o, c]);
      },
    };
  };
  const methods: Record<string, (...a: unknown[]) => unknown> = {
    save() {
      stack.push({ m: [...m] as M, props: { ...props } });
      log.push(['save']);
    },
    restore() {
      const top = stack.pop();
      if (top) {
        m = top.m;
        props = top.props;
      }
      log.push(['restore']);
    },
    translate(x, y) {
      m = mul(m, [1, 0, 0, 1, x as number, y as number]);
      log.push(['translate', x, y]);
    },
    scale(x, y) {
      m = mul(m, [x as number, 0, 0, y as number, 0, 0]);
      log.push(['scale', x, y]);
    },
    rotate(a) {
      const c = Math.cos(a as number);
      const s = Math.sin(a as number);
      m = mul(m, [c, s, -s, c, 0, 0]);
      log.push(['rotate', a]);
    },
    setTransform(...a) {
      m = a.length >= 6 ? (a.slice(0, 6) as M) : [1, 0, 0, 1, 0, 0];
      log.push(['setTransform', ...a]);
    },
    transform(...a) {
      m = mul(m, a.slice(0, 6) as M);
      log.push(['transform', ...a]);
    },
    resetTransform() {
      m = [1, 0, 0, 1, 0, 0];
      log.push(['resetTransform']);
    },
    getTransform() {
      return { a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] };
    },
    createLinearGradient: (...a) => gradient('linear', a),
    createRadialGradient: (...a) => gradient('radial', a),
    createConicGradient: (...a) => gradient('conic', a),
    createPattern: (...a) => {
      log.push(['createPattern', ...a.map(arg)]);
      return { __id: 'pattern' };
    },
    measureText: (s) => ({ width: String(s).length * 10 }),
  };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_t, key) {
      if (key === 'canvas') return { width, height };
      if (typeof key !== 'string') return undefined;
      if (key in methods) return methods[key];
      if (key in props) return props[key];
      return (...a: unknown[]) => {
        log.push([key, ...a.map(arg)]);
      };
    },
    set(_t, key, value) {
      props[key as string] = value;
      log.push(['=', key, arg(value)]);
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log };
}
