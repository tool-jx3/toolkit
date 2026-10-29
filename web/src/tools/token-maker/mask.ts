/**
 * 出框遮罩（在圖片的座標裡、每個像素 0～255；255＝蓋在外框上面）的純計算：
 * 魔術棒（共用的 colorRegion）、加入／去掉、反轉、擴大／縮小、填滿、清除、讀入遮罩圖、自動偵測主體、
 * 選取比例、出框的邊界點（自動邊距用）。不碰 DOM，單元測試直接用。
 */
import { colorRegion, growMask } from '@/core/image';
import { MASK_MAX_SIDE } from './model';

export interface Mask {
  width: number;
  height: number;
  data: Uint8Array<ArrayBuffer>;
}

export interface Rgba {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

export type SelectMode = 'add' | 'sub';

/** 遮罩的大小：和圖片同比例，長邊最多 MASK_MAX_SIDE（小圖不放大） */
export function maskSizeFor(image: { width: number; height: number }): {
  width: number;
  height: number;
} {
  const long = Math.max(image.width, image.height);
  const k = long > MASK_MAX_SIDE ? MASK_MAX_SIDE / long : 1;
  return {
    width: Math.max(1, Math.round(image.width * k)),
    height: Math.max(1, Math.round(image.height * k)),
  };
}

export const emptyMask = (width: number, height: number): Mask => ({
  width,
  height,
  data: new Uint8Array(width * height),
});

export const copyMask = (m: Mask): Mask => ({ ...m, data: new Uint8Array(m.data) });

/** 有沒有選到任何像素 */
export function maskIsEmpty(m: Mask | null): boolean {
  if (!m) return true;
  const d = m.data;
  for (let i = 0; i < d.length; i++) if (d[i]) return false;
  return true;
}

/** 選取了圖片的幾 %（遮罩 > 0 的像素） */
export function selectedRatio(m: Mask | null): number {
  if (!m) return 0;
  let n = 0;
  const d = m.data;
  for (let i = 0; i < d.length; i++) if (d[i]) n++;
  return d.length ? n / d.length : 0;
}

/**
 * 魔術棒：點 (x, y)（遮罩的 px）選顏色差在容許度以內的範圍（共用的 colorRegion：RGB 距離 0～100、完全透明不選），
 * 只選相連的或整張圖。和目前的遮罩無關（已經選了的地方照樣可以經過）。
 */
export function wandRegion(
  rgba: Rgba,
  x: number,
  y: number,
  tolerance: number,
  contiguous: boolean,
): { region: Uint8Array; count: number } {
  const zero = new Uint8Array(rgba.width * rgba.height);
  const r = colorRegion(rgba.data, zero, rgba.width, rgba.height, {
    x,
    y,
    tolerance,
    contiguous,
    target: 'removed',
  });
  return { region: r.region, count: r.count };
}

/** 範圍加進遮罩（255）或從遮罩去掉（0）；回傳新的遮罩與真的改到的像素數 */
export function applyRegion(
  base: Mask,
  region: Uint8Array,
  mode: SelectMode,
): { mask: Mask; changed: number } {
  const out = copyMask(base);
  const d = out.data;
  let changed = 0;
  const add = mode === 'add';
  for (let i = 0; i < d.length; i++) {
    if (!region[i]) continue;
    if (add ? d[i] !== 255 : d[i] !== 0) changed++;
    d[i] = add ? 255 : 0;
  }
  return { mask: out, changed };
}

/** 反轉：沒選的、圖片看得到的地方（不透明度 > 8）變成選取 */
export function invertMask(m: Mask, rgba: Rgba | null): Mask {
  const out = emptyMask(m.width, m.height);
  for (let i = 0; i < m.data.length; i++) {
    const visible = !rgba || rgba.data[i * 4 + 3] > 8;
    out.data[i] = !m.data[i] && visible ? 255 : 0;
  }
  return out;
}

/** 擴大（grow）或縮小 2 px（遮罩的 px） */
export function morphMask(m: Mask, grow: boolean): Mask {
  return { ...m, data: growMask(m.data, m.width, m.height, grow ? 2 : -2) };
}

export function filledMask(width: number, height: number): Mask {
  const m = emptyMask(width, height);
  m.data.fill(255);
  return m;
}

/**
 * 讀入的遮罩圖（已經拉伸到遮罩大小的 RGBA）→ 遮罩：有透明的地方（任一像素不透明度 < 250）用不透明度，
 * 否則用亮度（白＝出框、黑＝留在框裡）。
 */
export function maskFromImage(rgba: Rgba): Mask {
  const n = rgba.width * rgba.height;
  const d = rgba.data;
  let alpha = false;
  for (let i = 3; i < d.length; i += 4)
    if (d[i] < 250) {
      alpha = true;
      break;
    }
  const out = emptyMask(rgba.width, rgba.height);
  for (let i = 0, p = 0; i < n; i++, p += 4)
    out.data[i] = alpha ? d[p + 3] : Math.round(0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]);
  return out;
}

/** 圖片有沒有透明背景（不透明度 < 16 的像素超過 3%） */
export function hasTransparency(rgba: Rgba): boolean {
  const n = rgba.width * rgba.height;
  let t = 0;
  for (let i = 0; i < n; i++) if (rgba.data[i * 4 + 3] < 16) t++;
  return t > n * 0.03;
}

/** 有透明背景的立繪：不透明度直接當主體 */
export function maskFromAlpha(rgba: Rgba): Mask {
  const out = emptyMask(rgba.width, rgba.height);
  for (let i = 0; i < out.data.length; i++) out.data[i] = rgba.data[i * 4 + 3];
  return out;
}

/** 最近鄰縮放（遮罩換大小） */
export function resampleMask(m: Mask, width: number, height: number): Mask {
  if (m.width === width && m.height === height) return copyMask(m);
  const out = emptyMask(width, height);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(m.height - 1, Math.floor((y / height) * m.height));
    for (let x = 0; x < width; x++)
      out.data[y * width + x] =
        m.data[sy * m.width + Math.min(m.width - 1, Math.floor((x / width) * m.width))];
  }
  return out;
}

/**
 * 不透明的圖自動找主體（token-workshop 的做法）：縮到長邊 ≤ 360 px；從四邊的像素往內「淹」背景
 * （先從接近四邊中位數顏色的像素開始，相鄰的顏色差 ≤ 14、離起點的顏色差 ≤ 130），剩下的像素分成相連的塊，
 * 留下大小 ≥ 最大塊 12% 的；主體太小（< 1%）或幾乎整張（> 93%）時算找不到（null）。
 * 輸入是遮罩大小的 RGBA，回傳同樣大小的遮罩（0／255）。
 */
export function autoSubject(rgba: Rgba): Mask | null {
  const W = rgba.width;
  const H = rgba.height;
  const k = Math.min(1, 360 / Math.max(W, H));
  const w = Math.max(8, Math.round(W * k));
  const h = Math.max(8, Math.round(H * k));
  const N = w * h;
  /* 縮小（區塊平均） */
  const d = new Float32Array(N * 4);
  const cnt = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    const sy = Math.min(h - 1, Math.floor((y * h) / H));
    for (let x = 0; x < W; x++) {
      const sx = Math.min(w - 1, Math.floor((x * w) / W));
      const i = sy * w + sx;
      const p = (y * W + x) * 4;
      d[i * 4] += rgba.data[p];
      d[i * 4 + 1] += rgba.data[p + 1];
      d[i * 4 + 2] += rgba.data[p + 2];
      d[i * 4 + 3] += rgba.data[p + 3];
      cnt[i]++;
    }
  }
  for (let i = 0; i < N; i++) {
    const c = cnt[i] || 1;
    for (let j = 0; j < 4; j++) d[i * 4 + j] /= c;
  }
  const bg = new Uint8Array(N);
  const stack = new Int32Array(N);
  let transparent = 0;
  for (let i = 0; i < N; i++) if (d[i * 4 + 3] < 16) transparent++;
  if (transparent > N * 0.03) {
    for (let i = 0; i < N; i++) bg[i] = d[i * 4 + 3] < 16 ? 1 : 0;
  } else {
    const border: number[] = [];
    for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
    for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1);
    const median = (ch: number) => {
      const a = border.map((i) => d[i * 4 + ch]).sort((p, q) => p - q);
      return a[a.length >> 1];
    };
    const mr = median(0);
    const mg = median(1);
    const mb = median(2);
    const anchor = new Int32Array(N);
    let sp = 0;
    const seed = (strict: boolean) => {
      for (const i of border) {
        if (bg[i]) continue;
        if (!strict || Math.hypot(d[i * 4] - mr, d[i * 4 + 1] - mg, d[i * 4 + 2] - mb) < 110) {
          bg[i] = 1;
          anchor[i] = i;
          stack[sp++] = i;
        }
      }
    };
    seed(true);
    if (!sp) seed(false);
    const T = 14;
    const A = 130;
    while (sp) {
      const i = stack[--sp];
      const x = i % w;
      const y = (i / w) | 0;
      const p = i * 4;
      const an = anchor[i] * 4;
      const tryN = (j: number) => {
        if (bg[j]) return;
        const q = j * 4;
        if (d[q + 3] < 16) return;
        const near = Math.max(
          Math.abs(d[q] - d[p]),
          Math.abs(d[q + 1] - d[p + 1]),
          Math.abs(d[q + 2] - d[p + 2]),
        );
        const fromAnchor = Math.max(
          Math.abs(d[q] - d[an]),
          Math.abs(d[q + 1] - d[an + 1]),
          Math.abs(d[q + 2] - d[an + 2]),
        );
        if (near <= T && fromAnchor <= A) {
          bg[j] = 1;
          anchor[j] = anchor[i];
          stack[sp++] = j;
        }
      };
      if (x > 0) tryN(i - 1);
      if (x < w - 1) tryN(i + 1);
      if (y > 0) tryN(i - w);
      if (y < h - 1) tryN(i + w);
    }
  }
  /* 剩下的像素分成相連的塊 */
  const label = new Int32Array(N);
  const sizes = [0];
  let nl = 0;
  for (let s = 0; s < N; s++) {
    if (bg[s] || label[s]) continue;
    nl++;
    let sp = 0;
    let count = 0;
    stack[sp++] = s;
    label[s] = nl;
    while (sp) {
      const i = stack[--sp];
      const x = i % w;
      const y = (i / w) | 0;
      count++;
      if (x > 0 && !bg[i - 1] && !label[i - 1]) {
        label[i - 1] = nl;
        stack[sp++] = i - 1;
      }
      if (x < w - 1 && !bg[i + 1] && !label[i + 1]) {
        label[i + 1] = nl;
        stack[sp++] = i + 1;
      }
      if (y > 0 && !bg[i - w] && !label[i - w]) {
        label[i - w] = nl;
        stack[sp++] = i - w;
      }
      if (y < h - 1 && !bg[i + w] && !label[i + w]) {
        label[i + w] = nl;
        stack[sp++] = i + w;
      }
    }
    sizes[nl] = count;
  }
  if (!nl) return null;
  const maxSize = Math.max(...sizes);
  const keep = sizes.map((s) => s >= maxSize * 0.12);
  const small = new Float32Array(N);
  let total = 0;
  for (let i = 0; i < N; i++)
    if (label[i] && keep[label[i]]) {
      small[i] = 1;
      total++;
    }
  if (total < N * 0.01 || total > N * 0.93) return null;
  /* 放大回遮罩大小（雙線性，> 0.5 算主體） */
  const out = emptyMask(W, H);
  for (let y = 0; y < H; y++) {
    const fy = Math.min(h - 1, Math.max(0, ((y + 0.5) * h) / H - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(h - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(w - 1, Math.max(0, ((x + 0.5) * w) / W - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(w - 1, x0 + 1);
      const tx = fx - x0;
      const v =
        (small[y0 * w + x0] * (1 - tx) + small[y0 * w + x1] * tx) * (1 - ty) +
        (small[y1 * w + x0] * (1 - tx) + small[y1 * w + x1] * tx) * ty;
      out.data[y * W + x] = v > 0.5 ? 255 : 0;
    }
  }
  return out;
}

/**
 * 出框的邊界點（自動邊距用）：選取中、圖片看得到（不透明度 > 8）、而且旁邊有不是這樣的像素（或在圖邊）的位置，
 * 換成圖片的 px、以圖片中心為原點（xy 交錯）。
 */
export function maskBoundary(
  m: Mask,
  alpha: Uint8Array | null,
  image: { width: number; height: number },
): Float32Array {
  const { width: w, height: h, data } = m;
  const on = (i: number) => data[i] > 0 && (!alpha || alpha[i] > 8);
  const sx = image.width / w;
  const sy = image.height / h;
  const pts: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!on(i)) continue;
      if (
        x === 0 ||
        y === 0 ||
        x === w - 1 ||
        y === h - 1 ||
        !on(i - 1) ||
        !on(i + 1) ||
        !on(i - w) ||
        !on(i + w)
      )
        pts.push((x + 0.5) * sx - image.width / 2, (y + 0.5) * sy - image.height / 2);
    }
  return Float32Array.from(pts);
}
