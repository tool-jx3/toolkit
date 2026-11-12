/**
 * 單元測試用的「記錄畫布」：不畫像素，把每一次呼叫畫布的方法與設定的屬性（名稱＋參數）依序算成一個雜湊。
 * 同樣的畫法指令＝同樣的 PNG，所以拿來檢查「沒有用到新功能時輸出和改版前逐位元組相同」（floor-plan D79、D84 的量測），
 * 而且和平台、字型無關（node-canvas 的像素會跟著系統字型變；這裡只記指令，CI 上也穩定）。
 *
 * - measureText：照 `font` 的字級估字寬（寬字 1 個字級、其他 0.6），每次都一樣。
 * - createLinearGradient／createRadialGradient／createPattern：回傳的物件也記錄（addColorStop）。
 * - document.createElement('canvas')、OffscreenCanvas：`installRecordingDocument()` 換成記錄畫布。
 */

/** 64 位元的 FNV-1a（兩個 32 位元的種子），純 JS，平台無關 */
export class Hasher {
  private a = 0x811c9dc5;
  private b = 0x01000193 ^ 0x5bd1e995;
  add(s: string): void {
    let a = this.a;
    let b = this.b;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      a = Math.imul(a ^ c, 0x01000193);
      b = Math.imul(b ^ c, 0x01000193) ^ (b >>> 13);
    }
    this.a = a;
    this.b = b;
  }
  hex(): string {
    return (
      (this.a >>> 0).toString(16).padStart(8, '0') + (this.b >>> 0).toString(16).padStart(8, '0')
    );
  }
}

const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/;

const fmt = (v: unknown): string => {
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (v === null || v === undefined) return String(v);
  if (Array.isArray(v)) return `[${v.map(fmt).join(',')}]`;
  if (typeof v === 'object' && v && '__rec' in v) return `#${(v as { __rec: string }).__rec}`;
  if (typeof v === 'boolean') return String(v);
  return typeof v;
};

export interface RecordingCanvas {
  width: number;
  height: number;
  getContext(kind: string): CanvasRenderingContext2D;
  toDataURL(): string;
  /** 這張畫布的指令雜湊 */
  readonly hash: string;
  readonly calls: number;
}

let seq = 0;

/**
 * 畫布、漸層的編號從 0 重新數（2026-11-12）：兩次畫圖要逐指令比較、而且用到漸層（夜的光）時，先各自重設，
 * 漸層的編號才會一樣。不呼叫時照舊（編號一路往上加）。
 */
export function resetRecordingIds(): void {
  seq = 0;
}

export function recordingCanvas(width = 300, height = 150): RecordingCanvas {
  const h = new Hasher();
  let calls = 0;
  const id = `c${seq++}`;
  const log = (s: string) => {
    calls++;
    h.add(s);
    h.add('\n');
  };
  const state: Record<string, unknown> = { font: '10px sans-serif' };
  const stack: Record<string, unknown>[] = [];
  let matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const sub = (kind: string) => {
    const obj = { __rec: `${id}.${kind}${seq++}` } as Record<string, unknown>;
    obj.addColorStop = (o: number, col: string) => log(`${obj.__rec}.stop(${o},${col})`);
    obj.setTransform = () => log(`${obj.__rec}.setTransform`);
    return obj;
  };
  const canvas = {
    width,
    height,
    toDataURL: () => 'data:image/png;base64,',
    get hash() {
      return h.hex();
    },
    get calls() {
      return calls;
    },
  } as unknown as RecordingCanvas;
  const methods: Record<string, (...args: unknown[]) => unknown> = {
    save: () => {
      stack.push({ ...state, __m: { ...matrix } });
      log('save');
    },
    restore: () => {
      const s = stack.pop();
      if (s) {
        matrix = s.__m as typeof matrix;
        delete s.__m;
        for (const k of Object.keys(state)) delete state[k];
        Object.assign(state, s);
      }
      log('restore');
    },
    measureText: (text: unknown) => {
      const m = /(\d+(?:\.\d+)?)px/.exec(String(state.font));
      const size = m ? Number(m[1]) : 10;
      let w = 0;
      for (const ch of String(text)) w += WIDE.test(ch) ? size : size * 0.6;
      log(`measure(${fmt(text)},${fmt(state.font)})`);
      return {
        width: w,
        actualBoundingBoxAscent: size * 0.8,
        actualBoundingBoxDescent: size * 0.2,
        fontBoundingBoxAscent: size * 0.9,
        fontBoundingBoxDescent: size * 0.25,
      };
    },
    createLinearGradient: (...a: unknown[]) => {
      const g = sub('lg');
      log(`${g.__rec}=linear(${a.map(fmt).join(',')})`);
      return g;
    },
    createRadialGradient: (...a: unknown[]) => {
      const g = sub('rg');
      log(`${g.__rec}=radial(${a.map(fmt).join(',')})`);
      return g;
    },
    createConicGradient: (...a: unknown[]) => {
      const g = sub('cg');
      log(`${g.__rec}=conic(${a.map(fmt).join(',')})`);
      return g;
    },
    createPattern: (img: unknown, rep: unknown) => {
      const g = sub('pat');
      log(`${g.__rec}=pattern(${fmt((img as RecordingCanvas)?.hash ?? img)},${fmt(rep)})`);
      return g;
    },
    createImageData: (w: unknown, hh: unknown) => {
      log(`imageData(${fmt(w)},${fmt(hh)})`);
      const n = Number(w) * Number(hh) * 4;
      return { width: w, height: hh, data: new Uint8ClampedArray(Number.isFinite(n) ? n : 0) };
    },
    getImageData: (...a: unknown[]) => {
      log(`getImageData(${a.map(fmt).join(',')})`);
      const n = Number(a[2]) * Number(a[3]) * 4;
      return { width: a[2], height: a[3], data: new Uint8ClampedArray(Number.isFinite(n) ? n : 0) };
    },
    putImageData: (img: unknown, ...a: unknown[]) => {
      const d = (img as { data?: Uint8ClampedArray })?.data;
      let sum = 0;
      if (d) for (let i = 0; i < d.length; i += 7) sum = (sum * 31 + d[i]) | 0;
      log(`putImageData(${sum},${a.map(fmt).join(',')})`);
    },
    drawImage: (img: unknown, ...a: unknown[]) =>
      log(`drawImage(${fmt((img as RecordingCanvas)?.hash ?? 'img')},${a.map(fmt).join(',')})`),
    getTransform: () => ({ ...matrix }),
    setTransform: (...a: unknown[]) => {
      if (a.length >= 6) {
        const [ma, mb, mc, md, me, mf] = a as number[];
        matrix = { a: ma, b: mb, c: mc, d: md, e: me, f: mf };
      } else if (a[0] && typeof a[0] === 'object') matrix = { ...(a[0] as typeof matrix) };
      log(`setTransform(${a.map(fmt).join(',')})`);
    },
    resetTransform: () => {
      matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      log('resetTransform');
    },
    isPointInPath: () => false,
    isPointInStroke: () => false,
    getLineDash: () => (state.__dash as number[]) ?? [],
    setLineDash: (d: unknown) => {
      state.__dash = d;
      log(`setLineDash(${fmt(d)})`);
    },
  };
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get(_t, prop) {
      if (prop === 'canvas') return canvas;
      if (typeof prop !== 'string') return undefined;
      if (prop in methods) return methods[prop];
      if (prop in state) return state[prop];
      /* 沒列的方法（moveTo、arc、fill…）：照名稱與參數記錄 */
      if (
        /^(globalAlpha|lineWidth|miterLimit|lineDashOffset|shadowBlur|shadowOffsetX|shadowOffsetY)$/.test(
          prop,
        )
      )
        return prop === 'globalAlpha' || prop === 'lineWidth' ? 1 : 0;
      if (/^(fillStyle|strokeStyle|shadowColor)$/.test(prop)) return '#000000';
      if (
        /^(lineCap|lineJoin|textAlign|textBaseline|globalCompositeOperation|direction|filter|imageSmoothingQuality|fontKerning)$/.test(
          prop,
        )
      )
        return '';
      if (prop === 'imageSmoothingEnabled') return true;
      return (...a: unknown[]) => {
        log(`${prop}(${a.map(fmt).join(',')})`);
        return undefined;
      };
    },
    set(_t, prop, value) {
      if (typeof prop !== 'string') return true;
      state[prop] = value;
      log(`${prop}=${fmt(value)}`);
      return true;
    },
  });
  canvas.getContext = () => ctx as unknown as CanvasRenderingContext2D;
  return canvas;
}

/** document.createElement('canvas') 與 OffscreenCanvas 換成記錄畫布；回傳還原的函式 */
export function installRecordingDocument(): () => void {
  const g = globalThis as Record<string, unknown>;
  const prevDoc = g.document;
  const prevOff = g.OffscreenCanvas;
  g.document = {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`recording document: <${tag}>`);
      return recordingCanvas();
    },
  };
  g.OffscreenCanvas = class {
    constructor(w: number, h: number) {
      // biome-ignore lint/correctness/noConstructorReturn: 直接交出記錄畫布
      return recordingCanvas(w, h);
    }
  };
  return () => {
    g.document = prevDoc;
    g.OffscreenCanvas = prevOff;
  };
}
