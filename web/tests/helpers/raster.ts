/**
 * 測試用的簡易點陣畫布（Node 沒有 canvas）：實作 drawBloom 用到的 canvas 2D 指令，畫成 RGBA 像素。
 * 不做反鋸齒（以像素中心判斷）；弧切成小段的折線；描邊＝每一段的矩形＋接點的圓（線頭圓的時候兩端也加圓）；
 * 塗滿＝折線圍起來的多邊形（非零環繞）；globalAlpha 照比例混色。只支援等比例的變形（平移、旋轉、等比縮放）。
 */

type Pt = [number, number];

interface SubPath {
  pts: Pt[];
  closed: boolean;
}

const hex = (c: string): [number, number, number] => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
  return m
    ? [Number.parseInt(m[1], 16), Number.parseInt(m[2], 16), Number.parseInt(m[3], 16)]
    : [0, 0, 0];
};

export interface RasterImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export function rasterCanvas(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  let m = [1, 0, 0, 1, 0, 0];
  const stack: {
    m: number[];
    alpha: number;
    lw: number;
    cap: string;
    fill: string;
    stroke: string;
  }[] = [];
  let path: SubPath[] = [];
  const state = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    globalAlpha: 1,
  };
  const tx = (x: number, y: number): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const scale = () => Math.hypot(m[0], m[1]);
  const cur = () => {
    if (!path.length) path.push({ pts: [], closed: false });
    return path[path.length - 1];
  };
  const blend = (i: number, rgb: [number, number, number], a: number) => {
    const j = i * 4;
    const da = data[j + 3] / 255;
    const oa = a + da * (1 - a);
    for (let k = 0; k < 3; k++)
      data[j + k] = oa ? (rgb[k] * a + data[j + k] * da * (1 - a)) / oa : 0;
    data[j + 3] = oa * 255;
  };
  /** 把一個「像素中心在不在裡面」的判斷畫出來（只看外框範圍） */
  const paint = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    inside: (x: number, y: number) => boolean,
    color: string,
    hit: Uint8Array,
  ) => {
    const ax = Math.max(0, Math.floor(x0));
    const ay = Math.max(0, Math.floor(y0));
    const bx = Math.min(width - 1, Math.ceil(x1));
    const by = Math.min(height - 1, Math.ceil(y1));
    for (let y = ay; y <= by; y++)
      for (let x = ax; x <= bx; x++) {
        const i = y * width + x;
        if (hit[i]) continue;
        if (inside(x + 0.5, y + 0.5)) hit[i] = 1;
      }
    void color;
  };
  const flush = (hit: Uint8Array, color: string, alpha: number) => {
    const rgb = hex(color);
    for (let i = 0; i < hit.length; i++) if (hit[i]) blend(i, rgb, alpha);
  };

  const ctx = {
    canvas: { width, height },
    get fillStyle() {
      return state.fillStyle;
    },
    set fillStyle(v: string) {
      state.fillStyle = v;
    },
    get strokeStyle() {
      return state.strokeStyle;
    },
    set strokeStyle(v: string) {
      state.strokeStyle = v;
    },
    get lineWidth() {
      return state.lineWidth;
    },
    set lineWidth(v: number) {
      state.lineWidth = v;
    },
    get lineCap() {
      return state.lineCap;
    },
    set lineCap(v: string) {
      state.lineCap = v;
    },
    get lineJoin() {
      return state.lineJoin;
    },
    set lineJoin(v: string) {
      state.lineJoin = v;
    },
    get globalAlpha() {
      return state.globalAlpha;
    },
    set globalAlpha(v: number) {
      state.globalAlpha = v;
    },
    clearRect() {
      data.fill(0);
    },
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
      m = [a, b, c, d, e, f];
    },
    save() {
      stack.push({
        m: [...m],
        alpha: state.globalAlpha,
        lw: state.lineWidth,
        cap: state.lineCap,
        fill: state.fillStyle,
        stroke: state.strokeStyle,
      });
    },
    restore() {
      const s = stack.pop();
      if (!s) return;
      m = s.m;
      state.globalAlpha = s.alpha;
      state.lineWidth = s.lw;
      state.lineCap = s.cap;
      state.fillStyle = s.fill;
      state.strokeStyle = s.stroke;
    },
    translate(x: number, y: number) {
      m = [m[0], m[1], m[2], m[3], m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    },
    rotate(a: number) {
      const c = Math.cos(a);
      const s = Math.sin(a);
      m = [
        m[0] * c + m[2] * s,
        m[1] * c + m[3] * s,
        m[2] * c - m[0] * s,
        m[3] * c - m[1] * s,
        m[4],
        m[5],
      ];
    },
    fillRect(x: number, y: number, w: number, h: number) {
      const [x0, y0] = tx(x, y);
      const [x1, y1] = tx(x + w, y + h);
      const hit = new Uint8Array(width * height);
      paint(x0, y0, x1, y1, (px, py) => px >= x0 && px < x1 && py >= y0 && py < y1, '', hit);
      flush(hit, state.fillStyle, state.globalAlpha);
    },
    beginPath() {
      path = [];
    },
    moveTo(x: number, y: number) {
      path.push({ pts: [tx(x, y)], closed: false });
    },
    lineTo(x: number, y: number) {
      cur().pts.push(tx(x, y));
    },
    closePath() {
      cur().closed = true;
    },
    rect(x: number, y: number, w: number, h: number) {
      path.push({ pts: [tx(x, y), tx(x + w, y), tx(x + w, y + h), tx(x, y + h)], closed: true });
    },
    arc(cx: number, cy: number, r: number, a0: number, a1: number) {
      let span = a1 - a0;
      if (span >= Math.PI * 2) span = Math.PI * 2;
      const n = Math.max(8, Math.ceil((Math.abs(span) * r * scale()) / 0.5));
      const sub = cur();
      for (let i = 0; i <= n; i++) {
        const a = a0 + (span * i) / n;
        sub.pts.push(tx(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
      }
    },
    stroke() {
      const hw = (state.lineWidth * scale()) / 2;
      const round = state.lineCap === 'round';
      const hit = new Uint8Array(width * height);
      for (const sp of path) {
        const pts = sp.closed ? [...sp.pts, sp.pts[0]] : sp.pts;
        for (let i = 0; i + 1 < pts.length; i++) {
          const [x1, y1] = pts[i];
          const [x2, y2] = pts[i + 1];
          const dx = x2 - x1;
          const dy = y2 - y1;
          const L2 = dx * dx + dy * dy || 1e-12;
          paint(
            Math.min(x1, x2) - hw,
            Math.min(y1, y2) - hw,
            Math.max(x1, x2) + hw,
            Math.max(y1, y2) + hw,
            (px, py) => {
              const t = ((px - x1) * dx + (py - y1) * dy) / L2;
              if (t < 0 || t > 1) return false;
              return Math.abs((px - x1) * dy - (py - y1) * dx) / Math.sqrt(L2) <= hw;
            },
            '',
            hit,
          );
        }
        /* 接點（與圓的線頭）畫圓 */
        pts.forEach(([x, y], i) => {
          const end = !sp.closed && (i === 0 || i === pts.length - 1);
          if (end && !round) return;
          paint(
            x - hw,
            y - hw,
            x + hw,
            y + hw,
            (px, py) => Math.hypot(px - x, py - y) <= hw,
            '',
            hit,
          );
        });
      }
      flush(hit, state.strokeStyle, state.globalAlpha);
    },
    fill() {
      const hit = new Uint8Array(width * height);
      for (const sp of path) {
        const pts = sp.pts;
        if (pts.length < 3) continue;
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        paint(
          Math.min(...xs),
          Math.min(...ys),
          Math.max(...xs),
          Math.max(...ys),
          (px, py) => {
            let wn = 0;
            for (let i = 0; i < pts.length; i++) {
              const [ax, ay] = pts[i];
              const [bx, by] = pts[(i + 1) % pts.length];
              const cross = (bx - ax) * (py - ay) - (px - ax) * (by - ay);
              if (ay <= py) {
                if (by > py && cross > 0) wn++;
              } else if (by <= py && cross < 0) wn--;
            }
            return wn !== 0;
          },
          '',
          hit,
        );
      }
      flush(hit, state.fillStyle, state.globalAlpha);
    },
  };
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    image: (): RasterImage => ({ width, height, data }),
  };
}

/** 雙線性縮放（測試縮放後讀不讀得出來） */
export function resample(img: RasterImage, k: number): RasterImage {
  const width = Math.round(img.width * k);
  const height = Math.round(img.height * k);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const sx = Math.min(img.width - 1, Math.max(0, (x + 0.5) / k - 0.5));
      const sy = Math.min(img.height - 1, Math.max(0, (y + 0.5) / k - 0.5));
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(img.width - 1, x0 + 1);
      const y1 = Math.min(img.height - 1, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      for (let c = 0; c < 4; c++) {
        const p = (xx: number, yy: number) => img.data[(yy * img.width + xx) * 4 + c];
        data[(y * width + x) * 4 + c] =
          p(x0, y0) * (1 - fx) * (1 - fy) +
          p(x1, y0) * fx * (1 - fy) +
          p(x0, y1) * (1 - fx) * fy +
          p(x1, y1) * fx * fy;
      }
    }
  return { width, height, data };
}
