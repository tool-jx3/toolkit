/**
 * 軟選取與修邊（token-workshop ce4c62b 的做法，MIT；規格 F20 修訂、F79～F86、3.12）：
 * 遮罩存的是每個像素出框的不透明度（0～255），所以髮絲、毛邊可以是半透明的。全部是純計算（不碰 DOM），在遮罩大小上算
 * （圖片的 RGBA 也是遮罩大小，見 sources 的 ImageWork.work）；去光暈在圖片的原尺寸上算。
 *
 * - softAuto：背景單純（紙、攝影棚、深色背景）的不透明圖，依每個像素和「附近的背景色」差多少給不透明度；
 *   深色背景用形狀補（實心的部分閉合成一個剪影再填滿）；有紋理的背景丟掉沒有碰到實心主體的淡塊。
 * - fixEdges（一鍵修邊）：選取邊緣一圈的像素依顏色和背景差多少變成半透明（matte）＋去雜點、填小洞。
 * - gapRemove（去掉小縫隙）：選取裡像背景色、寬度在指定以內的縫隙去掉（髮捲之間露出的紙）。
 * - unmix（去光暈）：半透明的邊緣像素扣掉背景色（出框蓋在外框上時不會有一圈舊背景的顏色）。
 * - fillPolygon：套索圈起來的範圍。
 */
import type { Mask, Rgba } from './mask';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 倒角距離的斜角（照原作用 1.414，不是 √2，結果才和原作相同） */
// biome-ignore lint/suspicious/noApproximativeNumericConstant: 照原作的數值
const DIAG = 1.414;

/** 兩個顏色的差（RGB 的均方根，0～255） */
function cdist(d: ArrayLike<number>, i: number, c: ArrayLike<number>): number {
  const j = i * 4;
  const a = d[j] - c[0];
  const b = d[j + 1] - c[1];
  const e = d[j + 2] - c[2];
  return Math.sqrt((a * a + b * b + e * e) / 3);
}

const median = (a: number[]): number => {
  a.sort((p, q) => p - q);
  return a[a.length >> 1];
};

export const toHex = (c: ArrayLike<number>): string =>
  `#${[c[0], c[1], c[2]].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}`;

/**
 * 每個像素到最近的 src＝1 的像素的距離（倒角距離：上下左右 1、斜角 DIAG，兩趟）。
 * idx：同時記下最近的那個像素（沒有時 −1）。
 */
export function chamfer(src: Uint8Array, W: number, H: number, idx?: Int32Array): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(W * H);
  for (let i = 0; i < d.length; i++) {
    d[i] = src[i] ? 0 : INF;
    if (idx) idx[i] = src[i] ? i : -1;
  }
  const upd = (i: number, j: number, c: number) => {
    if (d[j] + c < d[i]) {
      d[i] = d[j] + c;
      if (idx) idx[i] = idx[j];
    }
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (x > 0) upd(i, i - 1, 1);
      if (y > 0) {
        upd(i, i - W, 1);
        if (x > 0) upd(i, i - W - 1, DIAG);
        if (x < W - 1) upd(i, i - W + 1, DIAG);
      }
    }
  for (let y = H - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (x < W - 1) upd(i, i + 1, 1);
      if (y < H - 1) {
        upd(i, i + W, 1);
        if (x < W - 1) upd(i, i + W + 1, DIAG);
        if (x > 0) upd(i, i + W - 1, DIAG);
      }
    }
  return d;
}

/** 一維的最小／最大濾鏡（半徑 r，先橫後直）：erode＝全部都是 1 才是 1，否則只要有一個 1 */
function boxMorph(src: Uint8Array, W: number, H: number, r: number, erode: boolean): Uint8Array {
  const t = new Uint8Array(W * H);
  const o = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let v = erode ? 1 : 0;
      for (let q = Math.max(0, x - r); q <= Math.min(W - 1, x + r); q++) {
        const s = src[y * W + q];
        if (erode ? !s : s) {
          v = erode ? 0 : 1;
          break;
        }
      }
      t[y * W + x] = v;
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let v = erode ? 1 : 0;
      for (let q = Math.max(0, y - r); q <= Math.min(H - 1, y + r); q++) {
        const s = t[q * W + x];
        if (erode ? !s : s) {
          v = erode ? 0 : 1;
          break;
        }
      }
      o[y * W + x] = v;
    }
  return o;
}

/** 斷開（先侵蝕再膨脹）：細的東西去掉，粗的留下 */
const opening = (src: Uint8Array, W: number, H: number, r: number) =>
  boxMorph(boxMorph(src, W, H, r, true), W, H, r, false);

/* ---------- 自動（軟選取） ---------- */

export interface SoftAutoOptions {
  /** 靈敏度 0～100（50＝預設）：低的要和背景差很多才算，高的連淡淡的、同色的部分都留 */
  sens: number;
  /** 內縮（正）／外擴（負），遮罩的 px */
  shrink: number;
}

export const AUTO_SENS_DEFAULT = 50;
export const AUTO_SHRINK_RANGE = { min: -10, max: 10 } as const;

/**
 * 背景單純的不透明圖：每個像素依和背景色的差給不透明度（0～255），回傳遮罩與背景色；
 * 透明背景的圖、背景不單純（四邊的像素不到 6 成接近中位數）、主體太小或幾乎整張時 null。
 */
export function softAuto(rgba: Rgba, opts: SoftAutoOptions): { mask: Mask; bg: string } | null {
  const w = rgba.width;
  const h = rgba.height;
  const N = w * h;
  const d = rgba.data;
  if (w < 8 || h < 8) return null;
  let tr = 0;
  for (let i = 0; i < N; i++) if (d[i * 4 + 3] < 16) tr++;
  if (tr > N * 0.03) return null;
  /* 四邊 3 px 寬的像素：中位數＝背景色；六成以上要接近它 */
  const bp: number[] = [];
  for (let t = 0; t < 3; t++) {
    for (let x = 0; x < w; x++) bp.push(t * w + x, (h - 1 - t) * w + x);
    for (let y = 3; y < h - 3; y++) bp.push(y * w + t, y * w + w - 1 - t);
  }
  const med = (c: number) => median(bp.map((i) => d[i * 4 + c]));
  const g = [med(0), med(1), med(2)];
  const mx = (i: number) =>
    Math.max(
      Math.abs(d[i * 4] - g[0]),
      Math.abs(d[i * 4 + 1] - g[1]),
      Math.abs(d[i * 4 + 2] - g[2]),
    );
  let near = 0;
  for (const i of bp) if (mx(i) <= 28) near++;
  if (near < bp.length * 0.6) return null;

  /* 附近的背景色：8 px 一格，像背景的像素在附近 15 × 15 格的平均（漸層、暗角也行）；兩趟，第二趟只看接近第一次估計的 */
  const CELL = 8;
  const cw = Math.ceil(w / CELL);
  const ch = Math.ceil(h / CELL);
  const fld = new Float32Array(cw * ch * 3);
  const R = 7;
  for (let c = 0; c < cw * ch; c++) {
    fld[c * 3] = g[0];
    fld[c * 3 + 1] = g[1];
    fld[c * 3 + 2] = g[2];
  }
  for (let pass = 0; pass < 2; pass++) {
    const sum = new Float32Array(cw * ch * 3);
    const cnt = new Float32Array(cw * ch);
    const lim = pass ? 7 : 14;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const o = (((y / CELL) | 0) * cw + ((x / CELL) | 0)) * 3;
        if (
          Math.max(
            Math.abs(d[i * 4] - fld[o]),
            Math.abs(d[i * 4 + 1] - fld[o + 1]),
            Math.abs(d[i * 4 + 2] - fld[o + 2]),
          ) > lim
        )
          continue;
        sum[o] += d[i * 4];
        sum[o + 1] += d[i * 4 + 1];
        sum[o + 2] += d[i * 4 + 2];
        cnt[o / 3]++;
      }
    const nf = new Float32Array(cw * ch * 3);
    for (let cy = 0; cy < ch; cy++)
      for (let cx = 0; cx < cw; cx++) {
        let a = 0;
        let b = 0;
        let c2 = 0;
        let n = 0;
        for (let yy = Math.max(0, cy - R); yy <= Math.min(ch - 1, cy + R); yy++)
          for (let xx = Math.max(0, cx - R); xx <= Math.min(cw - 1, cx + R); xx++) {
            const q = yy * cw + xx;
            a += sum[q * 3];
            b += sum[q * 3 + 1];
            c2 += sum[q * 3 + 2];
            n += cnt[q];
          }
        const o = (cy * cw + cx) * 3;
        if (n > 20) {
          nf[o] = a / n;
          nf[o + 1] = b / n;
          nf[o + 2] = c2 / n;
        } else {
          nf[o] = fld[o];
          nf[o + 1] = fld[o + 1];
          nf[o + 2] = fld[o + 2];
        }
      }
    fld.set(nf);
  }

  /* 不透明度：和附近背景色的差（深色背景時靈敏一點） */
  const darkBg = 0.299 * g[0] + 0.587 * g[1] + 0.114 * g[2] < 90;
  const f = 2 ** ((50 - Math.min(100, opts.sens + (darkBg ? 25 : 0))) / 25);
  const TOL = 9 * f;
  const D0 = TOL + 39 * f;
  const al = new Float32Array(N);
  const lo = (c: number, b: number) => (c >= b ? (c - b) / (255.01 - b) : (b - c) / (b + 0.01));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = (((y / CELL) | 0) * cw + ((x / CELL) | 0)) * 3;
      const B0 = fld[o];
      const B1 = fld[o + 1];
      const B2 = fld[o + 2];
      const C0 = d[i * 4];
      const C1 = d[i * 4 + 1];
      const C2 = d[i * 4 + 2];
      const dd = Math.sqrt(((C0 - B0) ** 2 + (C1 - B1) ** 2 + (C2 - B2) ** 2) / 3);
      const key = clamp((dd - TOL) / (D0 - TOL), 0, 1);
      /* 前景色還算合理的最小不透明度 */
      const amin = Math.max(lo(C0, B0), lo(C1, B1), lo(C2, B2));
      al[i] = dd < TOL ? 0 : Math.max(key, amin * 0.9);
    }

  /* 大片淡淡的地方（面紗、光暈）的紙紋閃爍：抹平（細的髮絲不動） */
  {
    const low = new Uint8Array(N);
    for (let i = 0; i < N; i++) low[i] = al[i] > 0.04 && al[i] < 0.7 ? 1 : 0;
    const wide = opening(low, w, h, 2);
    const sm = new Float32Array(al);
    for (let y = 2; y < h - 2; y++)
      for (let x = 2; x < w - 2; x++) {
        const i = y * w + x;
        if (!wide[i]) continue;
        let s = 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) s += al[i + dy * w + dx];
        sm[i] = s / 25;
      }
    al.set(sm);
  }

  const stack = new Int32Array(N);
  /** 8 連通的塊（al ≥ lo）；visit 對每一塊呼叫一次 */
  const blobs8 = (min: number, visit: (list: number[]) => void) => {
    const seen = new Uint8Array(N);
    for (let s0 = 0; s0 < N; s0++) {
      if (seen[s0] || al[s0] < min) continue;
      let sp = 0;
      const list: number[] = [];
      stack[sp++] = s0;
      seen[s0] = 1;
      while (sp) {
        const i = stack[--sp];
        const x = i % w;
        const y = (i / w) | 0;
        list.push(i);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            const q = yy * w + xx;
            if (!seen[q] && al[q] >= min) {
              seen[q] = 1;
              stack[sp++] = q;
            }
          }
      }
      visit(list);
    }
  };
  /* 散開的小點（紙上的髒點）丟掉 */
  const minS = Math.max(14, Math.round(N * 0.00003));
  blobs8(0.1, (list) => {
    if (list.length < minS) for (const i of list) al[i] = 0;
  });
  /* 沒有碰到實心主體的淡塊（紙的污漬、木紋的反光）丟掉 */
  {
    const comps: { list: number[]; solid: number }[] = [];
    blobs8(0.1, (list) => {
      let solid = 0;
      for (const i of list) if (al[i] >= 0.6) solid++;
      comps.push({ list, solid });
    });
    let big = 0;
    for (const c of comps) if (c.solid > big) big = c.solid;
    for (const c of comps)
      if (c.solid < Math.max(12, big * 0.02)) for (const i of c.list) al[i] = 0;
  }

  /* 深色背景：陰影、黑髮和背景一樣暗，只看顏色分不出來；用形狀：實心的部分閉合成一個剪影、填滿（剪影外面的髮絲照樣是半透明） */
  if (darkBg) {
    const RC = Math.max(6, Math.round(Math.max(w, h) * 0.045));
    const core = new Uint8Array(N);
    for (let i = 0; i < N; i++) core[i] = al[i] >= 0.8 ? 1 : 0;
    const d1 = chamfer(core, w, h);
    const dil = new Uint8Array(N);
    const inv = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      dil[i] = d1[i] <= RC ? 1 : 0;
      inv[i] = dil[i] ? 0 : 1;
    }
    const d2 = chamfer(inv, w, h);
    const sil = new Uint8Array(N);
    for (let i = 0; i < N; i++) sil[i] = dil[i] && d2[i] > RC ? 1 : 0;
    /* 剪影圍起來的都算 */
    const out = new Uint8Array(N);
    let sp = 0;
    const seed = (i: number) => {
      if (!sil[i] && !out[i]) {
        out[i] = 1;
        stack[sp++] = i;
      }
    };
    for (let x = 0; x < w; x++) {
      seed(x);
      seed((h - 1) * w + x);
    }
    for (let y = 0; y < h; y++) {
      seed(y * w);
      seed(y * w + w - 1);
    }
    while (sp) {
      const i = stack[--sp];
      const x = i % w;
      const y = (i / w) | 0;
      if (x > 0) seed(i - 1);
      if (x < w - 1) seed(i + 1);
      if (y > 0) seed(i - w);
      if (y < h - 1) seed(i + w);
    }
    const ins = new Uint8Array(N);
    for (let i = 0; i < N; i++) ins[i] = out[i] ? 0 : 1;
    const d3 = chamfer(ins, w, h);
    const RS = Math.round(RC * 0.6);
    for (let i = 0; i < N; i++) {
      if (ins[i]) al[i] = 1;
      else if (d3[i] > RS) al[i] = 0;
    }
  }

  /* 實心的內部：淺色的皮膚、銀色的反光和紙很像，但離「接到圖邊的背景」很遠就是主體 */
  {
    const open = new Uint8Array(N);
    let sp = 0;
    const seed = (i: number) => {
      if (!open[i] && al[i] < 0.5) {
        open[i] = 1;
        stack[sp++] = i;
      }
    };
    for (let x = 0; x < w; x++) {
      seed(x);
      seed((h - 1) * w + x);
    }
    for (let y = 0; y < h; y++) {
      seed(y * w);
      seed(y * w + w - 1);
    }
    while (sp) {
      const i = stack[--sp];
      const x = i % w;
      const y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const q = yy * w + xx;
          if (!open[q] && al[q] < 0.5) {
            open[q] = 1;
            stack[sp++] = q;
          }
        }
    }
    /* 半透明的一塊，周圍大多是實心主體（不是背景）：算主體；光暈、面紗接著背景，留著半透明 */
    const big2 = Math.round(N * 0.0008);
    const lab = new Uint8Array(N);
    for (let s0 = 0; s0 < N; s0++) {
      if (lab[s0] || open[s0] || al[s0] < 0.05 || al[s0] >= 0.95) continue;
      let sp2 = 0;
      let so = 0;
      let sd = 0;
      const list: number[] = [];
      stack[sp2++] = s0;
      lab[s0] = 1;
      while (sp2) {
        const i = stack[--sp2];
        const x = i % w;
        const y = (i / w) | 0;
        list.push(i);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            const q = yy * w + xx;
            if (open[q]) so++;
            else if (al[q] >= 0.95) sd++;
            else if (!lab[q] && al[q] >= 0.05) {
              lab[q] = 1;
              stack[sp2++] = q;
            }
          }
      }
      if ((so === 0 || list.length >= big2) && sd >= so * 2.5) for (const i of list) al[i] = 1;
    }
  }

  /* 粗的形狀圍起來的淺色（眼白、牙齒）是主體；細髮絲之間的縫不是 */
  {
    const fgb = new Uint8Array(N);
    for (let i = 0; i < N; i++) fgb[i] = al[i] >= 0.6 ? 1 : 0;
    const thick = opening(fgb, w, h, 3);
    const lab = new Uint8Array(N);
    for (let s0 = 0; s0 < N; s0++) {
      if (lab[s0] || al[s0] >= 0.5) continue;
      let sp = 0;
      let edge = false;
      let bnd = 0;
      let tk = 0;
      let x0 = w;
      let x1 = 0;
      let y0 = h;
      let y1 = 0;
      const list: number[] = [];
      stack[sp++] = s0;
      lab[s0] = 1;
      while (sp) {
        const i = stack[--sp];
        const x = i % w;
        const y = (i / w) | 0;
        list.push(i);
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        const nb = [
          x > 0 ? i - 1 : -1,
          x < w - 1 ? i + 1 : -1,
          y > 0 ? i - w : -1,
          y < h - 1 ? i + w : -1,
        ];
        for (const q of nb) {
          if (q < 0) continue;
          if (al[q] < 0.5) {
            if (!lab[q]) {
              lab[q] = 1;
              stack[sp++] = q;
            }
          } else {
            bnd++;
            if (thick[q]) tk++;
          }
        }
      }
      const bw = x1 - x0 + 1;
      const bh = y1 - y0 + 1;
      /* 眼睛是一團（中間有虹膜也一樣：每列、每欄的範圍跨過去填）；髮捲之間的縫是細長的月牙 */
      if (
        !edge &&
        list.length >= 24 &&
        list.length < N * 0.0012 &&
        bnd > 0 &&
        tk / bnd >= 0.85 &&
        Math.min(bw, bh) >= 5 &&
        Math.max(bw, bh) <= 4 * Math.min(bw, bh)
      ) {
        const rmin = new Int32Array(bh).fill(1e9);
        const rmax = new Int32Array(bh).fill(-1);
        const cmin = new Int32Array(bw).fill(1e9);
        const cmax = new Int32Array(bw).fill(-1);
        for (const i of list) {
          const x = (i % w) - x0;
          const y = ((i / w) | 0) - y0;
          if (x < rmin[y]) rmin[y] = x;
          if (x > rmax[y]) rmax[y] = x;
          if (y < cmin[x]) cmin[x] = y;
          if (y > cmax[x]) cmax[x] = y;
        }
        const inside = (x: number, y: number) =>
          x >= rmin[y] && x <= rmax[y] && y >= cmin[x] && y <= cmax[x];
        let fa = 0;
        for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (inside(x, y)) fa++;
        if (fa / (bw * bh) >= 0.5 && list.length / fa >= 0.4)
          for (let y = 0; y < bh; y++)
            for (let x = 0; x < bw; x++) {
              const q = (y + y0) * w + x + x0;
              if (inside(x, y) && al[q] < 0.5) al[q] = 1;
            }
      }
    }
  }

  /* 內縮／外擴整圈輪廓（遮罩的 px），像縮小魔術棒的選取 */
  if (opts.shrink) {
    const n = Math.abs(opts.shrink);
    const sub = new Uint8Array(N);
    if (opts.shrink > 0) {
      for (let i = 0; i < N; i++) sub[i] = al[i] < 0.5 ? 1 : 0;
      const dd = chamfer(sub, w, h);
      for (let i = 0; i < N; i++)
        if (al[i] > 0 && dd[i] < n) al[i] *= Math.max(0, (dd[i] - 0.5) / n);
    } else {
      for (let i = 0; i < N; i++) sub[i] = al[i] >= 0.5 ? 1 : 0;
      const dd = chamfer(sub, w, h);
      for (let i = 0; i < N; i++)
        if (dd[i] > 0 && dd[i] <= n) al[i] = Math.max(al[i], 1 - (dd[i] - 0.5) / n);
    }
  }
  let tot = 0;
  for (let i = 0; i < N; i++) if (al[i] >= 0.5) tot++;
  if (tot < N * 0.01 || tot > N * 0.93) return null;
  const mask: Mask = { width: w, height: h, data: new Uint8Array(N) };
  for (let i = 0; i < N; i++) {
    const v = Math.round(al[i] * 255);
    mask.data[i] = v < 10 ? 0 : v;
  }
  return { mask, bg: toHex(g) };
}

/** 軟的遮罩變成硬的（≥ 128 → 255，其他 0；「自動時順便修邊」關掉時） */
export function hardenMask(m: Mask): Mask {
  const out: Mask = { ...m, data: new Uint8Array(m.data.length) };
  for (let i = 0; i < m.data.length; i++) out.data[i] = m.data[i] >= 128 ? 255 : 0;
  return out;
}

/* ---------- 修邊 ---------- */

/** 修邊看選取邊緣多寬的一圈（遮罩的 px） */
export const edgeReach = (w: number, h: number): number =>
  clamp(Math.round(Math.min(w, h) / 200), 3, 14);

/** 自動之後順便修邊時寬一點 */
export const autoEdgeReach = (w: number, h: number): number =>
  Math.round(Math.max(edgeReach(w, h), Math.ceil(Math.max(w, h) / 360) + 2));

/** 去雜點、填洞的面積上限（px） */
export const speckArea = (w: number, h: number): number =>
  Math.max(4, Math.round(0.3 ** 2 * 0.0012 * w * h));

/** 修邊的顏色容許度與「髮絲的柔軟度」（原作的預設 14、70%；原作已經拿掉這兩個滑桿） */
const EDGE_TOL = 14;
const EDGE_SOFT = 0.7;

/**
 * 實心（遮罩 ≥ 128、圖片看得到）與「接到圖邊的非實心」：往外找背景時可以跳過 2 px 以內的細髮絲，
 * 髮捲之間的空隙也算背景。
 */
function solidMap(base: Mask, rgba: Rgba): { sol: Uint8Array; non: Uint8Array } {
  const W = base.width;
  const H = base.height;
  const N = W * H;
  const d = rgba.data;
  const sol = new Uint8Array(N);
  for (let i = 0; i < N; i++) sol[i] = base.data[i] >= 128 && d[i * 4 + 3] > 8 ? 1 : 0;
  const notSol = new Uint8Array(N);
  for (let i = 0; i < N; i++) notSol[i] = sol[i] ? 0 : 1;
  const dil = boxMorph(notSol, W, H, 2, false);
  const seen = new Uint8Array(N);
  const stack = new Int32Array(N);
  let sp = 0;
  const hop = (i: number) => {
    if (dil[i] && !seen[i]) {
      seen[i] = 1;
      stack[sp++] = i;
    }
  };
  for (let x = 0; x < W; x++) {
    hop(x);
    hop((H - 1) * W + x);
  }
  for (let y = 0; y < H; y++) {
    hop(y * W);
    hop(y * W + W - 1);
  }
  while (sp) {
    const i = stack[--sp];
    const x = i % W;
    const y = (i / W) | 0;
    if (x > 0) hop(i - 1);
    if (x < W - 1) hop(i + 1);
    if (y > 0) hop(i - W);
    if (y < H - 1) hop(i + W);
  }
  const non = new Uint8Array(N);
  for (let i = 0; i < N; i++) non[i] = seen[i] && !sol[i] ? 1 : 0;
  return { sol, non };
}

/** 主體後面的背景色：選取邊緣外面一圈取樣（不夠時用圖片的四邊）；顏色太雜時 busy */
export function estimateBg(
  base: Mask,
  rgba: Rgba,
  reach: number,
): { c: [number, number, number]; busy: boolean } {
  const W = base.width;
  const H = base.height;
  const d = rgba.data;
  const { sol, non } = solidMap(base, rgba);
  const dOut = chamfer(sol, W, H);
  const lo = reach + 1;
  const hi = reach + 1 + Math.max(6, reach);
  let cnt = 0;
  for (let i = 0; i < W * H; i++) if (non[i] && dOut[i] >= lo && dOut[i] <= hi) cnt++;
  const step = Math.max(1, Math.floor(cnt / 4000));
  let k = 0;
  const R: number[] = [];
  const G: number[] = [];
  const B: number[] = [];
  const take = (i: number) => {
    R.push(d[i * 4]);
    G.push(d[i * 4 + 1]);
    B.push(d[i * 4 + 2]);
  };
  for (let i = 0; i < W * H; i++)
    if (non[i] && dOut[i] >= lo && dOut[i] <= hi && d[i * 4 + 3] > 200 && k++ % step === 0) take(i);
  if (R.length < 40) {
    R.length = 0;
    G.length = 0;
    B.length = 0;
    for (let x = 0; x < W; x += 2) {
      take(x);
      take((H - 1) * W + x);
    }
    for (let y = 0; y < H; y += 2) {
      take(y * W);
      take(y * W + W - 1);
    }
  }
  const c: [number, number, number] = [median(R.slice()), median(G.slice()), median(B.slice())];
  let dev = 0;
  for (let i = 0; i < R.length; i++)
    dev += Math.sqrt(((R[i] - c[0]) ** 2 + (G[i] - c[1]) ** 2 + (B[i] - c[2]) ** 2) / 3);
  return { c, busy: dev / R.length > 38 };
}

/**
 * 邊緣一圈（reach 以內）的像素依顏色和背景的差變成半透明；背景色就近取（選取外面、reach 以外最近的背景像素附近 3 × 3 的平均）。
 * 邊緣和背景太像（差的中位數 < 12）、取樣太少時 null。
 */
export function matteEdges(
  base: Mask,
  rgba: Rgba,
  bg: ArrayLike<number>,
  reach: number,
  tol = EDGE_TOL,
  soft = EDGE_SOFT,
): Uint8Array<ArrayBuffer> | null {
  const W = base.width;
  const H = base.height;
  const N = W * H;
  const d = rgba.data;
  const { sol, non } = solidMap(base, rgba);
  const dOut = chamfer(sol, W, H);
  const dIn = chamfer(non, W, H);
  const far = new Uint8Array(N);
  let nFar = 0;
  for (let i = 0; i < N; i++)
    if (non[i] && dOut[i] > reach + 1) {
      far[i] = 1;
      nFar++;
    }
  let nearest: Int32Array | null = null;
  if (nFar > 50) {
    nearest = new Int32Array(N);
    chamfer(far, W, H, nearest);
  }
  const col = [0, 0, 0];
  const bgAt = (i: number): ArrayLike<number> => {
    if (!nearest || nearest[i] < 0) return bg;
    const s = nearest[i];
    const sx = s % W;
    const sy = (s / W) | 0;
    let r = 0;
    let g = 0;
    let b = 0;
    let c = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = sx + dx;
        const y = sy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const j = (y * W + x) * 4;
        r += d[j];
        g += d[j + 1];
        b += d[j + 2];
        c++;
      }
    col[0] = r / c;
    col[1] = g / c;
    col[2] = b / c;
    return col;
  };
  const samples: number[] = [];
  for (let i = 0; i < N; i++)
    if (sol[i] && dIn[i] <= reach + 1 && i % 3 === 0) samples.push(cdist(d, i, bgAt(i)));
  if (samples.length < 10) return null;
  const D = median(samples);
  if (D < 12) return null;
  const t = Math.min(tol, Math.max(3, D * 0.3));
  const hi = t + (Math.max(D * 0.9, t + 10) - t) * (0.15 + 0.85 * soft);
  const out = base.data.slice();
  for (let i = 0; i < N; i++) {
    if (d[i * 4 + 3] <= 8) continue;
    if (!((sol[i] && dIn[i] <= reach) || (non[i] && dOut[i] <= reach))) continue;
    let a = clamp((cdist(d, i, bgAt(i)) - t) / (hi - t), 0, 1);
    if (a < 0.08) a = 0;
    out[i] = Math.round(a * 255);
  }
  return out;
}

/** 去雜點（選取裡比 minArea 小的塊）與填洞（沒有接到圖邊、比 minArea 小的空洞）；都是 4 連通 */
export function cleanSpecks(
  base: Mask,
  minArea: number,
  holes = true,
): { mask: Mask; specks: number; filled: number } {
  const W = base.width;
  const H = base.height;
  const N = W * H;
  const src = base.data;
  const out = src.slice();
  const lab = new Uint8Array(N);
  const stack = new Int32Array(N);
  let specks = 0;
  let filled = 0;
  const flood = (start: number, test: (i: number) => boolean) => {
    let sp = 0;
    let edge = false;
    const list: number[] = [];
    stack[sp++] = start;
    lab[start] = 1;
    while (sp) {
      const i = stack[--sp];
      const x = i % W;
      const y = (i / W) | 0;
      list.push(i);
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;
      if (x > 0 && !lab[i - 1] && test(i - 1)) {
        lab[i - 1] = 1;
        stack[sp++] = i - 1;
      }
      if (x < W - 1 && !lab[i + 1] && test(i + 1)) {
        lab[i + 1] = 1;
        stack[sp++] = i + 1;
      }
      if (y > 0 && !lab[i - W] && test(i - W)) {
        lab[i - W] = 1;
        stack[sp++] = i - W;
      }
      if (y < H - 1 && !lab[i + W] && test(i + W)) {
        lab[i + W] = 1;
        stack[sp++] = i + W;
      }
    }
    return { edge, list };
  };
  const on = (i: number) => src[i] > 0;
  for (let i = 0; i < N; i++) {
    if (lab[i] || !on(i)) continue;
    const r = flood(i, on);
    if (r.list.length < minArea) {
      specks++;
      for (const j of r.list) out[j] = 0;
    }
  }
  if (holes) {
    lab.fill(0);
    const off = (i: number) => src[i] < 128;
    for (let i = 0; i < N; i++) {
      if (lab[i] || !off(i)) continue;
      const r = flood(i, off);
      if (!r.edge && r.list.length < minArea) {
        filled++;
        for (const j of r.list) out[j] = 255;
      }
    }
  }
  return { mask: { width: W, height: H, data: out }, specks, filled };
}

export interface FixResult {
  mask: Mask;
  /** 邊緣有變成半透明（去光暈要打開） */
  matte: boolean;
  /** 背景太雜，只去了雜點與洞 */
  busy: boolean;
  /** 邊緣和背景太像，沒有變半透明 */
  low: boolean;
  specks: number;
  filled: number;
}

/** 一鍵修邊：邊緣變半透明（背景不雜時）＋去雜點、填洞 */
export function fixEdges(base: Mask, rgba: Rgba, reach: number): FixResult {
  let out = base.data;
  let matte = false;
  let low = false;
  const bg = estimateBg(base, rgba, reach);
  if (!bg.busy) {
    const r = matteEdges(base, rgba, bg.c, reach);
    if (r) {
      out = r;
      matte = true;
    } else low = true;
  }
  const c = cleanSpecks(
    { width: base.width, height: base.height, data: out },
    speckArea(base.width, base.height),
  );
  return { mask: c.mask, matte, busy: bg.busy, low, specks: c.specks, filled: c.filled };
}

/**
 * 去掉小縫隙：選取裡顏色像背景（差 ≤ 18）、最寬不超過 width（遮罩的 px）的一塊塊去掉；
 * 去掉的地方旁邊一圈混色的像素也去掉。回傳新的遮罩與去掉了幾塊。
 */
export function gapRemove(
  base: Mask,
  rgba: Rgba,
  width: number,
  reach: number,
): { mask: Mask; n: number } {
  const W = base.width;
  const H = base.height;
  const N = W * H;
  const d = rgba.data;
  const c = estimateBg(base, rgba, reach).c;
  const tol = Math.max(EDGE_TOL, 8) + 4;
  const like = new Uint8Array(N);
  for (let i = 0; i < N; i++)
    like[i] = base.data[i] >= 128 && d[i * 4 + 3] > 8 && cdist(d, i, c) <= tol ? 1 : 0;
  /* 到不像背景的像素（或圖邊外面）的距離 */
  const dist = new Float32Array(N);
  for (let i = 0; i < N; i++) dist[i] = like[i] ? 1e9 : 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let v = dist[i];
      if (!v) continue;
      v = Math.min(v, x > 0 ? dist[i - 1] + 1 : 1, y > 0 ? dist[i - W] + 1 : 1);
      if (y > 0 && x > 0) v = Math.min(v, dist[i - W - 1] + DIAG);
      if (y > 0 && x < W - 1) v = Math.min(v, dist[i - W + 1] + DIAG);
      dist[i] = v;
    }
  for (let y = H - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      let v = dist[i];
      if (!v) continue;
      v = Math.min(v, x < W - 1 ? dist[i + 1] + 1 : 1, y < H - 1 ? dist[i + W] + 1 : 1);
      if (y < H - 1 && x < W - 1) v = Math.min(v, dist[i + W + 1] + DIAG);
      if (y < H - 1 && x > 0) v = Math.min(v, dist[i + W - 1] + DIAG);
      dist[i] = v;
    }
  const out = base.data.slice();
  const lab = new Uint8Array(N);
  const stack = new Int32Array(N);
  let n = 0;
  for (let s0 = 0; s0 < N; s0++) {
    if (lab[s0] || !like[s0]) continue;
    let sp = 0;
    let rmax = 0;
    const list: number[] = [];
    stack[sp++] = s0;
    lab[s0] = 1;
    while (sp) {
      const i = stack[--sp];
      const x = i % W;
      const y = (i / W) | 0;
      list.push(i);
      if (dist[i] > rmax) rmax = dist[i];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const q = yy * W + xx;
          if (like[q] && !lab[q]) {
            lab[q] = 1;
            stack[sp++] = q;
          }
        }
    }
    if (2 * rmax - 1 <= width) {
      n++;
      for (const i of list) out[i] = 0;
    }
  }
  /* 去掉的縫旁邊一圈混色的像素 */
  const rim = out.slice();
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!out[i] || cdist(d, i, c) > tol * 2.2) continue;
      if (!out[i - 1] || !out[i + 1] || !out[i - W] || !out[i + W]) rim[i] = 0;
    }
  return { mask: { width: W, height: H, data: rim }, n };
}

/* ---------- 去光暈 ---------- */

const DIRS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.7, 0.7],
  [-0.7, 0.7],
  [0.7, -0.7],
  [-0.7, -0.7],
];

/**
 * 去光暈：圖片（原尺寸的 RGBA，就地修改）裡遮罩半透明的像素扣掉背景色——
 * 前景色＝（像素 −（1 − 不透明度）× 背景色）÷ 不透明度，依強度 k（0～1）混進去；
 * 背景色就近找（遮罩往 8 個方向 2～14 px 第一個沒選的像素，取中位數；少於 3 個時用 fallback）。
 * 遮罩依圖片的大小雙線性取樣；全選、全沒選、不透明度 < 4% 或 > 98.5% 的不動。
 */
export function unmixHalo(
  img: { width: number; height: number; data: Uint8ClampedArray },
  mask: Mask,
  k: number,
  fallback: ArrayLike<number>,
): void {
  if (k <= 0) return;
  const W = img.width;
  const H = img.height;
  const d = img.data;
  const d0 = Uint8ClampedArray.from(d);
  const m = mask.data;
  const mw = mask.width;
  const mh = mask.height;
  const sx = mw / W;
  const sy = mh / H;
  const bgc = [0, 0, 0];
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const localBg = (px: number, py: number): ArrayLike<number> => {
    rs.length = 0;
    gs.length = 0;
    bs.length = 0;
    for (const [dx, dy] of DIRS)
      for (let s = 2; s <= 14; s++) {
        const qx = Math.round(px + dx * s);
        const qy = Math.round(py + dy * s);
        if (qx < 0 || qy < 0 || qx >= mw || qy >= mh) break;
        if (m[qy * mw + qx] === 0) {
          const hx = clamp(Math.round((qx + 0.5) / sx - 0.5), 0, W - 1);
          const hy = clamp(Math.round((qy + 0.5) / sy - 0.5), 0, H - 1);
          const j = (hy * W + hx) * 4;
          rs.push(d0[j]);
          gs.push(d0[j + 1]);
          bs.push(d0[j + 2]);
          break;
        }
      }
    if (rs.length < 3) return fallback;
    bgc[0] = median(rs);
    bgc[1] = median(gs);
    bgc[2] = median(bs);
    return bgc;
  };
  for (let y = 0; y < H; y++) {
    const fy = Math.max(0, Math.min(mh - 1.001, (y + 0.5) * sy - 0.5));
    const y0 = fy | 0;
    const y1 = Math.min(mh - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.max(0, Math.min(mw - 1.001, (x + 0.5) * sx - 0.5));
      const x0 = fx | 0;
      const x1 = Math.min(mw - 1, x0 + 1);
      const tx = fx - x0;
      const a = m[y0 * mw + x0];
      const b = m[y0 * mw + x1];
      const c = m[y1 * mw + x0];
      const e = m[y1 * mw + x1];
      if (
        (a === 0 && b === 0 && c === 0 && e === 0) ||
        (a === 255 && b === 255 && c === 255 && e === 255)
      )
        continue;
      const al = ((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty) / 255;
      if (al < 0.04 || al > 0.985) continue;
      const j = (y * W + x) * 4;
      const t = clamp((al - 0.12) / 0.4, 0, 1);
      const w8 = k * t * t * (3 - 2 * t);
      const bg = localBg(fx, fy);
      for (let ch = 0; ch < 3; ch++) {
        const C = d[j + ch];
        const F = clamp((C - (1 - al) * bg[ch]) / al, 0, 255);
        d[j + ch] = C + (F - C) * w8;
      }
    }
  }
}

/** 遮罩有沒有半透明的像素（去光暈有沒有東西可以做） */
export function hasPartial(m: Mask): boolean {
  const d = m.data;
  for (let i = 0; i < d.length; i++) if (d[i] > 0 && d[i] < 255) return true;
  return false;
}

/* ---------- 套索 ---------- */

/**
 * 套索圈起來的範圍（遮罩的 px；像素中心在圈裡面＝nonzero 規則）設成 value；回傳新的遮罩與真的改到的像素數。
 * 少於 3 點、範圍小於 2 × 2 時不改。
 */
export function fillPolygon(
  base: Mask,
  pts: readonly { x: number; y: number }[],
  value: number,
): { mask: Mask; changed: number } {
  const W = base.width;
  const H = base.height;
  const out: Mask = { width: W, height: H, data: base.data.slice() };
  if (pts.length < 3) return { mask: out, changed: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (maxX - minX < 2 || maxY - minY < 2) return { mask: out, changed: 0 };
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(H - 1, Math.ceil(maxY));
  let changed = 0;
  const xs: { x: number; dir: number }[] = [];
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5;
    xs.length = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      if ((p.y <= cy && q.y > cy) || (q.y <= cy && p.y > cy)) {
        const x = p.x + ((cy - p.y) * (q.x - p.x)) / (q.y - p.y);
        xs.push({ x, dir: q.y > p.y ? 1 : -1 });
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a.x - b.x);
    let wind = 0;
    for (let k = 0; k < xs.length - 1; k++) {
      wind += xs[k].dir;
      if (!wind) continue;
      const xa = Math.max(0, Math.ceil(xs[k].x - 0.5));
      const xb = Math.min(W, Math.ceil(xs[k + 1].x - 0.5));
      for (let x = xa; x < xb; x++) {
        const i = y * W + x;
        if (out.data[i] !== value) {
          out.data[i] = value;
          changed++;
        }
      }
    }
  }
  return { mask: out, changed };
}
