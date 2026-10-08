/**
 * 自動綁定：PSD 的圖層 → 部件、左右、錨點、髮束（純函式，Node 與 Worker 都能跑）。
 *
 * 參考原作 Anime2.5DRig（MIT）的 rigger.js 改寫；數值、判斷順序與原作相同（規格 1.2、3.2），
 * 舊版與新版拿同一個 PSD 綁定的結果要一樣（`tests/unit/anime-rig-rigger.test.ts` 有並排比對）。
 *
 * 輸入是 ag-psd 以 `useImageData` 讀出來的圖層樹（`PsdRoot`）：圖層的 `imageData` 是未預乘的 RGBA，
 * `left`／`top` 是畫布座標。
 */
import { RIG_ERRORS, type RigErrorCode, type RigWarning } from './rigText';

/* ---------- 輸入：ag-psd 的圖層樹（只列用得到的欄位） ---------- */

export interface PsdImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface PsdNode {
  name?: string;
  hidden?: boolean;
  /** 0～1 */
  opacity?: number;
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
  imageData?: PsdImage;
  children?: PsdNode[];
  canvas?: unknown;
}

export interface PsdRoot {
  width: number;
  height: number;
  children?: PsdNode[];
}

/* ---------- 輸出 ---------- */

export type PartGroup = 'head' | 'body';
export type PartPhys = 'hair' | 'sway';
export type PartFade = 'eyeOpen' | 'eyeClose' | 'eyeClose2' | 'mouthOpen' | 'mouthClose';
export type Side = 'L' | 'R';

export interface Strand {
  /** 髮束的位置（畫布 x） */
  x: number;
  /** 髮梢（這一欄最下面的不透明點） */
  tipY: number;
  /** 髮根（這一欄最上面的不透明點） */
  rootY: number;
}

export interface RigPart {
  /** 正規化後的名稱（左右分離的加 `_l`／`_r`） */
  name: string;
  /** PSD 裡的原名（內建差分是空字串） */
  source: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 繪製順序（0＝最後面） */
  z: number;
  depth: number;
  group: PartGroup;
  phys: PartPhys | null;
  /** 0～1（內建差分沒有，視為 1） */
  opacity?: number;
  fade: PartFade | null;
  side: Side | null;
  strands: Strand[] | null;
  /** 不認得的名稱 */
  unknown?: boolean;
  /** 內建的閉眼／閉嘴差分 */
  synthetic?: boolean;
  img: PsdImage;
}

export interface FaceAnchor {
  cx: number;
  cy: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface EyeAnchor {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** 虹膜中心 */
  icx: number;
  icy: number;
  /** 閉眼的高度 */
  closeY: number;
}

export interface MouthAnchor {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  cx: number;
  cy: number;
}

export interface RigAnchors {
  face: FaceAnchor;
  eyeL?: EyeAnchor;
  eyeR?: EyeAnchor;
  mouth: MouthAnchor;
  neckPivot: { cx: number; cy: number };
  neckTop: number;
  neckBottom: number;
  bodyPivot: { cx: number; cy: number };
  /** 臉寬 ÷ 333（動作量的比例） */
  faceScale: number;
  hairRootY: number;
}

export interface Rig {
  canvas: { w: number; h: number };
  layers: RigPart[];
  anchors: RigAnchors;
  warnings: RigWarning[];
  synth: { eye: boolean; mouth: boolean };
}

/** 內建的閉眼／閉嘴差分（左眼、右眼、嘴巴） */
export interface GenericParts {
  eyeL?: PsdImage | null;
  eyeR?: PsdImage | null;
  mouth?: PsdImage | null;
}

export class RigError extends Error {
  readonly code: RigErrorCode;
  constructor(code: RigErrorCode) {
    super(RIG_ERRORS[code]);
    this.name = 'RigError';
    this.code = code;
  }
}

/* ---------- 圖層名稱 ---------- */

/**
 * 別名表：鍵是正規名稱，值是用空白分隔的別名。比對時兩邊都「壓扁」（去掉空白、底線、連字號、中點、句點），
 * 所以 Front_Hair、front-hair、前髪、bangs 都對到同一個部位。
 */
export const ALIAS_GROUPS: Readonly<Record<string, string>> = {
  'front hair': 'fronthair hairfront bangs fringe 前髪 まえがみ',
  'back hair': 'backhair hairback 後ろ髪 後髪 うしろがみ',
  'side hair': 'sidehair hairside sidelock sidelocks 横髪 サイド髪 もみあげ',
  ahoge: 'ahoge アホ毛 あほ毛',
  hair: 'hair 髪 髪の毛 かみ',
  face: 'face 顔 かお 輪郭 facebase',
  facedetail: 'facedetail blush cheek cheeks 頬 頬染め チーク',
  eyewhite: 'eyewhite eyewhites sclera 白目',
  irides: 'irides iris irises pupil pupils 瞳 黒目 虹彩',
  eyelash: 'eyelash eyelashes lash lashes eyeline まつ毛 まつげ 睫毛 アイライン',
  eyebrow: 'eyebrow eyebrows brow brows 眉 眉毛 まゆ まゆげ',
  eye_close: 'eyeclose eyeclosed eyesclosed closedeye closedeyes 閉じ目 目閉じ 閉眼',
  mouth_open: 'mouthopen openmouth 口 開き口 口開き 開口',
  mouth_close: 'mouthclose mouthclosed closedmouth 閉じ口 口閉じ',
  nose: 'nose 鼻 はな',
  ears: 'ears ear 耳',
  earwear: 'earwear earring earrings イヤリング ピアス 耳飾り',
  neck: 'neck 首',
  neckwear: 'neckwear necktie tie necklace choker ネクタイ ネックレス チョーカー 首飾り',
  topwear: 'topwear top tops shirt body torso clothes 服 上着 体 胴体 上半身 トップス',
  bottomwear: 'bottomwear bottom bottoms skirt pants スカート ズボン ボトムス 下半身',
  handwear: 'handwear hand hands arm arms gloves 手 腕 手袋',
  legwear: 'legwear leg legs socks tights 脚 足 靴下 ソックス タイツ',
  footwear: 'footwear shoes shoe boots 靴 ブーツ',
  headwear: 'headwear hat cap hairpin hairband 帽子 カチューシャ 髪飾り ヘアピン',
  eyewear: 'eyewear glasses 眼鏡 メガネ めがね',
  tail: 'tail しっぽ 尻尾 シッポ',
  wings: 'wings wing 羽 翼 羽根',
  objects: 'objects object 小物 持ち物',
};

const squash = (s: string) => String(s).replace(/[\s_\-・･.]+/g, '');

const ALIASES: Record<string, string> = Object.create(null);
for (const canon of Object.keys(ALIAS_GROUPS)) {
  for (const a of ALIAS_GROUPS[canon].split(' ')) ALIASES[squash(a)] = canon;
}

const canonical = (base: string): string | null => ALIASES[squash(base)] ?? null;

export interface SlotInfo {
  depth: number;
  group: PartGroup | 'auto';
  phys?: PartPhys;
  split?: boolean;
  fade?: PartFade;
}

/** 部位表：深度（轉頭時的移動量）、跟隨頭部或身體、物理、左右分離、淡入淡出的種類 */
export const SLOTS: Readonly<Record<string, SlotInfo>> = {
  wings: { depth: 0.48, group: 'body' },
  tail: { depth: 0.5, group: 'body', phys: 'sway' },
  'back hair': { depth: 0.55, group: 'head', phys: 'hair' },
  footwear: { depth: 0.83, group: 'body' },
  legwear: { depth: 0.84, group: 'body' },
  bottomwear: { depth: 0.88, group: 'body' },
  neck: { depth: 0.95, group: 'body' },
  topwear: { depth: 0.9, group: 'body' },
  neckwear: { depth: 0.98, group: 'body' },
  handwear: { depth: 0.86, group: 'body' },
  objects: { depth: 1.0, group: 'auto' },
  earwear: { depth: 0.97, group: 'head', phys: 'sway' },
  ears: { depth: 0.96, group: 'head' },
  face: { depth: 1.0, group: 'head' },
  facedetail: { depth: 1.02, group: 'head' },
  headwear: { depth: 1.2, group: 'head' },
  mouth_close: { depth: 1.08, group: 'head', fade: 'mouthClose' },
  mouth_open: { depth: 1.08, group: 'head', fade: 'mouthOpen' },
  nose: { depth: 1.15, group: 'head' },
  eyewhite: { depth: 1.06, group: 'head', split: true, fade: 'eyeOpen' },
  eyebrow: { depth: 1.14, group: 'head', split: true },
  irides: { depth: 1.08, group: 'head', split: true, fade: 'eyeOpen' },
  eyelash: { depth: 1.12, group: 'head', split: true, fade: 'eyeOpen' },
  eye_close: { depth: 1.12, group: 'head', split: true, fade: 'eyeClose' },
  eye_close2: { depth: 1.12, group: 'head', split: true, fade: 'eyeClose2' },
  eyewear: { depth: 1.18, group: 'head' },
  'side hair': { depth: 1.22, group: 'head', phys: 'hair' },
  'front hair': { depth: 1.28, group: 'head', phys: 'hair' },
  ahoge: { depth: 1.3, group: 'head', phys: 'hair' },
};

export const SLOT_NAMES = Object.keys(SLOTS);

const hasSlot = (name: string) => Object.hasOwn(SLOTS, name);

/** 圖層名稱 → 正規名稱（規格 F13） */
export function normName(raw: unknown): string {
  const n = String(raw ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s*のコピー\s*\d*$/, '')
    .replace(/\s+copy(\s*\d+)?$/i, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
  /* 舊的、特殊的名稱先處理 */
  if (n === 'eyelash_c') return 'eye_close';
  if (n === 'mouth_c') return 'mouth_close';
  if (n === 'レイヤー 1') return 'facedetail';
  if (n === 'mouth' || /^mouth[ _-]?\d+$/.test(n)) return 'mouth_open'; /* see-through 的輸出 */
  /* 「eye_close2」「eyeclose2」「閉じ目2」是長閉眼；數字前有分隔符號（eye_close_2）是編號的部件 */
  if (/^(eye_?close|eye close|閉じ目)2$/.test(n)) return 'eye_close2';
  const direct = canonical(n);
  if (direct) return direct;
  const m = /^(.+?)[ _-]?(\d+)$/.exec(n);
  if (m) {
    const head = m[1].trim();
    const base = canonical(head) ?? (hasSlot(head) ? head : null);
    if (base) return `${base}_${m[2]}`;
  }
  return n;
}

/** 去掉編號（`front hair_2` → `front hair`；長閉眼不動） */
export const baseName = (n: string): string => (n === 'eye_close2' ? n : n.replace(/_\d+$/, ''));

/** 部件的部位名（去掉左右與編號） */
export const partBase = (name: string): string => baseName(name.replace(/_(l|r)$/, ''));

/* ---------- 圖層樹 ---------- */

/** 看得到的圖像圖層（資料夾攤平、隱藏的資料夾與圖層略過），依 PSD 的順序（下到上） */
export function imageLayersOf(psd: PsdRoot): PsdNode[] {
  const out: PsdNode[] = [];
  const visit = (nodes: PsdNode[] | undefined, parentVisible: boolean) => {
    for (const c of nodes ?? []) {
      const visible = parentVisible && c.hidden !== true;
      if (!visible) continue;
      if (c.children) visit(c.children, visible);
      else if (c.imageData) out.push(c);
    }
  };
  visit(psd.children, true);
  return out;
}

/** PSD 的大小、圖層數、資料夾深度、像素總量檢查（規格 F08）；不合時丟 RigError */
export function validatePsd<T extends PsdRoot>(psd: T): T {
  if (
    !psd ||
    !Number.isInteger(psd.width) ||
    !Number.isInteger(psd.height) ||
    psd.width < 2 ||
    psd.height < 2
  )
    throw new RigError('canvasSize');
  if (psd.width * psd.height > 24_000_000 || Math.max(psd.width, psd.height) > 16384)
    throw new RigError('canvasTooBig');
  let pixels = 0;
  let count = 0;
  const visit = (nodes: PsdNode[] | undefined, depth: number) => {
    if (depth > 64) throw new RigError('tooDeep');
    for (const c of nodes ?? []) {
      if (++count > 1000) throw new RigError('tooManyLayers');
      if (c.children) visit(c.children, depth + 1);
      const w = c.imageData ? c.imageData.width : Math.max(0, (c.right || 0) - (c.left || 0));
      const h = c.imageData ? c.imageData.height : Math.max(0, (c.bottom || 0) - (c.top || 0));
      if (!Number.isInteger(w) || !Number.isInteger(h) || w < 0 || h < 0 || w * h > 24_000_000)
        throw new RigError('layerSize');
      pixels += w * h;
      if (c.imageData && (!c.imageData.data || c.imageData.data.length !== w * h * 4))
        throw new RigError('layerData');
    }
  };
  visit(psd.children, 0);
  if (pixels > 96_000_000) throw new RigError('totalPixels');
  return psd;
}

/* ---------- 透明度的處理（整張畫布大小的 Uint8Array） ---------- */

function fullAlphaOf(layer: PsdNode, W: number, H: number): Uint8Array {
  const a = new Uint8Array(W * H);
  const img = layer.imageData as PsdImage;
  const lw = img.width;
  const lh = img.height;
  const lx = (layer.left ?? 0) | 0;
  const ly = (layer.top ?? 0) | 0;
  const d = img.data;
  for (let y = 0; y < lh; y++) {
    const cy = y + ly;
    if (cy < 0 || cy >= H) continue;
    const ro = cy * W;
    const lo = y * lw;
    for (let x = 0; x < lw; x++) {
      const cx = x + lx;
      if (cx < 0 || cx >= W) continue;
      a[ro + cx] = d[(lo + x) * 4 + 3];
    }
  }
  return a;
}

interface Components {
  lab: Int32Array;
  count: number;
  sizes: number[];
  sumX: number[];
}

/** 四連通的區塊標記（透明度 > thr） */
export function labelComponents(alpha: Uint8Array, W: number, H: number, thr: number): Components {
  const lab = new Int32Array(W * H);
  const sizes = [0];
  const sumX = [0];
  let cnt = 0;
  const stack = new Int32Array(W * H);
  for (let s = 0; s < W * H; s++) {
    if (lab[s] || alpha[s] <= thr) continue;
    cnt++;
    let sp = 0;
    stack[sp++] = s;
    lab[s] = cnt;
    let size = 0;
    let sx = 0;
    while (sp) {
      const q = stack[--sp];
      size++;
      sx += q % W;
      const x = q % W;
      const y = (q / W) | 0;
      if (x > 0 && !lab[q - 1] && alpha[q - 1] > thr) {
        lab[q - 1] = cnt;
        stack[sp++] = q - 1;
      }
      if (x < W - 1 && !lab[q + 1] && alpha[q + 1] > thr) {
        lab[q + 1] = cnt;
        stack[sp++] = q + 1;
      }
      if (y > 0 && !lab[q - W] && alpha[q - W] > thr) {
        lab[q - W] = cnt;
        stack[sp++] = q - W;
      }
      if (y < H - 1 && !lab[q + W] && alpha[q + W] > thr) {
        lab[q + W] = cnt;
        stack[sp++] = q + W;
      }
    }
    sizes.push(size);
    sumX.push(sx);
  }
  return { lab, count: cnt, sizes, sumX };
}

/** 方形外擴 r px（先橫後直） */
function dilate(mask: Uint8Array, W: number, H: number, r: number): Uint8Array {
  const tmp = new Uint8Array(W * H);
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const o = y * W;
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < W && mask[o + xx]) {
          v = 1;
          break;
        }
      }
      tmp[o + x] = v;
    }
  }
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      let v = 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < H && tmp[yy * W + x]) {
          v = 1;
          break;
        }
      }
      out[y * W + x] = v;
    }
  }
  return out;
}

/**
 * 雜點清除（規格 F15）：透明度 > 16 的四連通區塊中，留下 ≥ minPx 的，外擴 3 px，其餘的透明度歸零。
 * 沒有任何區塊夠大時整張不動。會直接改 alpha。
 */
export function cleanAlpha(alpha: Uint8Array, W: number, H: number, minPx: number): Uint8Array {
  const L = labelComponents(alpha, W, H, 16);
  if (!L.count) return alpha;
  const keep = new Uint8Array(L.count + 1);
  let any = false;
  for (let i = 1; i <= L.count; i++) {
    if (L.sizes[i] >= minPx) {
      keep[i] = 1;
      any = true;
    }
  }
  if (!any) return alpha;
  const kept = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (keep[L.lab[i]]) kept[i] = 1;
  const mask = dilate(kept, W, H, 3);
  for (let i = 0; i < W * H; i++) if (!mask[i]) alpha[i] = 0;
  return alpha;
}

/** 左右分離（規格 F21）：區塊重心在臉中心左邊＝左、右邊＝右（< 20 px 的區塊不算），各自外擴 3 px */
function splitSides(alpha: Uint8Array, W: number, H: number, faceCx: number) {
  const L = labelComponents(alpha, W, H, 16);
  const side = new Uint8Array(L.count + 1); /* 1＝左、2＝右 */
  for (let c = 1; c <= L.count; c++) {
    if (L.sizes[c] < 20) continue;
    side[c] = L.sumX[c] / L.sizes[c] < faceCx ? 1 : 2;
  }
  const ml = new Uint8Array(W * H);
  const mr = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (side[L.lab[i]] === 1) ml[i] = 1;
    else if (side[L.lab[i]] === 2) mr[i] = 1;
  }
  let nl = 0;
  let nr = 0;
  for (let i = 0; i < W * H; i++) {
    nl += ml[i];
    nr += mr[i];
  }
  const out: { l?: Uint8Array; r?: Uint8Array } = {};
  if (nl) out.l = dilate(ml, W, H, 3);
  if (nr) out.r = dilate(mr, W, H, 3);
  return out;
}

interface BBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** 透明度 > thr 的外接框（含端點）；沒有時 null */
export function bboxOf(alpha: Uint8Array, W: number, H: number, thr: number): BBox | null {
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y++) {
    const o = y * W;
    for (let x = 0; x < W; x++) {
      if (alpha[o + x] > thr) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** 以透明度加權的重心 */
export function centroidOf(
  alpha: Uint8Array,
  W: number,
  H: number,
): { cx: number; cy: number } | null {
  let sx = 0;
  let sy = 0;
  let s = 0;
  for (let y = 0; y < H; y++) {
    const o = y * W;
    for (let x = 0; x < W; x++) {
      const a = alpha[o + x];
      if (a) {
        sx += x * a;
        sy += y * a;
        s += a;
      }
    }
  }
  return s ? { cx: sx / s, cy: sy / s } : null;
}

function mergeAlphas(entries: { alpha: Uint8Array }[] | undefined, W: number, H: number) {
  if (!entries?.length) return null;
  const out = new Uint8Array(W * H);
  for (const e of entries) {
    const a = e.alpha;
    for (let i = 0; i < out.length; i++) if (a[i] > out[i]) out[i] = a[i];
  }
  return out;
}

/* ---------- 內建差分 ---------- */

/** 雙線性縮放（以透明度加權顏色，透明處不滲色） */
export function resampleRGBA(src: PsdImage, tw: number, th: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(tw * th * 4);
  const sw = src.width;
  const sh = src.height;
  const d = src.data;
  for (let y = 0; y < th; y++) {
    const sy = Math.max(0, Math.min(sh - 1, ((y + 0.5) * sh) / th - 0.5));
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(sh - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < tw; x++) {
      const sx = Math.max(0, Math.min(sw - 1, ((x + 0.5) * sw) / tw - 0.5));
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(sw - 1, x0 + 1);
      const fx = sx - x0;
      const o = (y * tw + x) * 4;
      const ids = [(y0 * sw + x0) * 4, (y0 * sw + x1) * 4, (y1 * sw + x0) * 4, (y1 * sw + x1) * 4];
      const ws = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
      let a = 0;
      for (let k = 0; k < 4; k++) a += d[ids[k] + 3] * ws[k];
      out[o + 3] = a;
      for (let c = 0; c < 3; c++) {
        let value = 0;
        for (let q = 0; q < 4; q++) value += d[ids[q] + c] * d[ids[q] + 3] * ws[q];
        out[o + c] = a ? value / a : 0;
      }
    }
  }
  return out;
}

/** 以透明度加權的平均色；darkWeight 時越暗的像素權重越大 */
function meanColorOfImg(img: PsdImage, darkWeight: boolean): number[] | null {
  const d = img.data;
  let r = 0;
  let g = 0;
  let b = 0;
  let s = 0;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a < 24) continue;
    let w = a;
    if (darkWeight) {
      const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
      w = a * (1 - lum / 255) ** 2;
    }
    r += d[i] * w;
    g += d[i + 1] * w;
    b += d[i + 2] * w;
    s += w;
  }
  return s ? [r / s, g / s, b / s] : null;
}

/** 換成目標色，保留相對亮度（亮度比上限 2.2） */
function recolorTo(data: Uint8ClampedArray, target: number[]) {
  let lumSum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 24) {
      lumSum += (data[i] + data[i + 1] + data[i + 2]) / 3;
      n++;
    }
  }
  if (!n) return;
  const mean = Math.max(8, lumSum / n);
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const f = Math.min(2.2, (data[i] + data[i + 1] + data[i + 2]) / 3 / mean);
    data[i] = target[0] * f;
    data[i + 1] = target[1] * f;
    data[i + 2] = target[2] * f;
  }
}

function synthPart(
  name: string,
  gimg: PsdImage,
  targetW: number,
  cx: number,
  anchorY: number,
  vAlign: number,
  tint: number[] | null,
  slot: SlotInfo,
  side: Side | null,
): RigPart {
  const scale = targetW / gimg.width;
  const tw = Math.max(2, Math.round(targetW));
  const th = Math.max(2, Math.round(gimg.height * scale));
  const data = resampleRGBA(gimg, tw, th);
  if (tint) recolorTo(data, tint);
  return {
    name,
    source: '',
    x: Math.round(cx - tw / 2),
    y: Math.round(anchorY - vAlign * th),
    w: tw,
    h: th,
    z: 0,
    depth: slot.depth,
    group: 'head',
    phys: null,
    fade: slot.fade ?? null,
    side: side ?? null,
    strands: null,
    synthetic: true,
    img: { width: tw, height: th, data },
  };
}

function lastIndexWhere<T>(arr: T[], pred: (v: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) return i;
  return -1;
}

/* ---------- 髮束偵測 ---------- */

/** 峰值：突出度 ≥ minProm，依突出度由大到小，彼此相距 ≥ minDist */
export function findPeaks(
  a: ArrayLike<number>,
  minDist: number,
  minProm: number,
): { x: number; prom: number }[] {
  const n = a.length;
  const cand: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (!(a[i] > a[i - 1] && a[i] >= a[i + 1])) continue;
    /* 平頂（窄的部件平滑後常見）取中間 */
    let e = i;
    while (e + 1 < n && a[e + 1] === a[i]) e++;
    if (e + 1 < n && a[e + 1] > a[i]) continue;
    cand.push((i + e) >> 1);
    i = e;
  }
  const peaks: { x: number; prom: number }[] = [];
  for (const p of cand) {
    let lmin = a[p];
    let rmin = a[p];
    for (let j = p - 1; j >= 0; j--) {
      if (a[j] > a[p]) break;
      if (a[j] < lmin) lmin = a[j];
    }
    for (let j = p + 1; j < n; j++) {
      if (a[j] > a[p]) break;
      if (a[j] < rmin) rmin = a[j];
    }
    const prom = a[p] - Math.max(lmin, rmin);
    if (prom >= minProm) peaks.push({ x: p, prom });
  }
  peaks.sort((u, v) => v.prom - u.prom);
  const kept: { x: number; prom: number }[] = [];
  for (const pk of peaks) {
    if (kept.every((k) => Math.abs(k.x - pk.x) >= minDist)) kept.push(pk);
  }
  return kept;
}

/** 髮束（規格 F27）：每一欄最下面的不透明點，寬 41 的平均，找峰值；不足時從等距候選補 */
export function detectStrands(
  alpha: Uint8Array,
  W: number,
  H: number,
  minSep: number,
  want: number,
): Strand[] {
  const bottom = new Float32Array(W);
  const top = new Float32Array(W);
  let minX = W;
  let maxX = -1;
  for (let x = 0; x < W; x++) {
    top[x] = -1;
    bottom[x] = 0;
    for (let y = 0; y < H; y++) {
      if (alpha[y * W + x] > 16) {
        top[x] = y;
        break;
      }
    }
    if (top[x] < 0) continue;
    for (let y = H - 1; y >= 0; y--) {
      if (alpha[y * W + x] > 16) {
        bottom[x] = y;
        break;
      }
    }
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  if (maxX < 0) return [];
  /* 寬 41 的平均（範圍外補 0） */
  const k = 41;
  const hk = 20;
  const sm = new Float32Array(W);
  const pre = new Float32Array(W + 1);
  for (let x = 0; x < W; x++) pre[x + 1] = pre[x] + bottom[x];
  for (let x = 0; x < W; x++) {
    const a0 = Math.max(0, x - hk);
    const a1 = Math.min(W - 1, x + hk);
    sm[x] = (pre[a1 + 1] - pre[a0]) / k;
  }
  const pk = findPeaks(sm, minSep, 10);
  const xs: number[] = [];
  for (let i = 0; i < pk.length && xs.length < want; i++) xs.push(pk[i].x);
  /* 補足：離已有的最遠、而且那一欄有內容的候選 */
  let guard = 0;
  while (xs.length < want && guard++ < 50) {
    let best = -1;
    let bestD = -1;
    for (let t = 0; t < 40; t++) {
      const inset = Math.min(30, (maxX - minX) / 4);
      const cx = Math.round(minX + inset + ((maxX - minX - 2 * inset) * t) / 39);
      if (cx < 0 || cx >= W || top[cx] < 0) continue;
      let dmin = 1e9;
      for (const x of xs) dmin = Math.min(dmin, Math.abs(cx - x));
      if (xs.length === 0) dmin = 1e9 - t;
      if (dmin > bestD) {
        bestD = dmin;
        best = cx;
      }
    }
    if (best < 0 || (xs.length && bestD < Math.max(1, minSep))) break;
    xs.push(best);
  }
  xs.sort((a, b) => a - b);
  const strands: Strand[] = [];
  const used = new Set<number>();
  for (const x0 of xs) {
    let sx = x0;
    /* 平均後峰值可能落在沒有內容的欄：移到最近有內容的欄 */
    for (let r = 0; top[sx] < 0 && r < W; r++) {
      if (x0 - r >= 0 && top[x0 - r] >= 0) sx = x0 - r;
      else if (x0 + r < W && top[x0 + r] >= 0) sx = x0 + r;
    }
    if (top[sx] < 0 || used.has(sx)) continue;
    used.add(sx);
    strands.push({ x: sx, tipY: bottom[sx], rootY: top[sx] });
  }
  strands.sort((a, b) => a.x - b.x);
  return strands;
}

/* ---------- 部件 ---------- */

function makePart(
  name: string,
  layer: PsdNode,
  fullAlpha: Uint8Array,
  mask: Uint8Array | null,
  W: number,
  H: number,
  slot: { depth: number; group: PartGroup; phys?: PartPhys; fade?: PartFade },
  z: number,
  side: Side | null,
  strands: Strand[] | null,
): RigPart | null {
  let eff = fullAlpha;
  if (mask) {
    eff = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) eff[i] = mask[i] ? fullAlpha[i] : 0;
  }
  const bb = bboxOf(eff, W, H, 8);
  if (!bb) return null;
  const pad = 2;
  const x0 = Math.max(0, bb.x0 - pad);
  const y0 = Math.max(0, bb.y0 - pad);
  const x1 = Math.min(W, bb.x1 + 1 + pad);
  const y1 = Math.min(H, bb.y1 + 1 + pad);
  const w = x1 - x0;
  const h = y1 - y0;
  const data = new Uint8ClampedArray(w * h * 4);
  const img = layer.imageData as PsdImage;
  const lw = img.width;
  const lh = img.height;
  const lx = (layer.left ?? 0) | 0;
  const ly = (layer.top ?? 0) | 0;
  const ld = img.data;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const di = ((y - y0) * w + (x - x0)) * 4;
      const yy = y - ly;
      const xx = x - lx;
      if (yy >= 0 && yy < lh && xx >= 0 && xx < lw) {
        const li = (yy * lw + xx) * 4;
        data[di] = ld[li];
        data[di + 1] = ld[li + 1];
        data[di + 2] = ld[li + 2];
      }
      data[di + 3] = eff[y * W + x];
    }
  }
  return {
    name,
    source: String(layer.name ?? ''),
    x: x0,
    y: y0,
    w,
    h,
    z,
    depth: slot.depth,
    group: slot.group,
    phys: slot.phys ?? null,
    opacity: layer.opacity == null ? 1 : Math.max(0, Math.min(1, layer.opacity)),
    fade: slot.fade ?? null,
    side: side ?? null,
    strands: strands ?? null,
    img: { width: w, height: h, data },
  };
}

/* ---------- 綁定 ---------- */

export interface BuildRigOptions {
  generic?: GenericParts | null;
}

/** 圖層樹 → 綁定（規格 1.2）。PSD 先用 cleanPsdLayers 清過 */
export function buildRig(psd: PsdRoot, opts: BuildRigOptions = {}): Rig {
  validatePsd(psd);
  const W = psd.width;
  const H = psd.height;
  const warnings: RigWarning[] = [];
  const kids = imageLayersOf(psd);
  if (!kids.length) throw new RigError('noLayers');
  if (kids.length * W * H > 128_000_000) throw new RigError('memory');

  /* 整張畫布的透明度（去掉雜點） */
  const entries: { name: string; layer: PsdNode; alpha: Uint8Array }[] = [];
  for (const kid of kids) {
    const name = normName(kid.name);
    const fa = cleanAlpha(fullAlphaOf(kid, W, H), W, H, 40);
    if (!bboxOf(fa, W, H, 8)) {
      warnings.push({ code: 'emptyLayer', args: [name] });
      continue;
    }
    entries.push({ name, layer: kid, alpha: fa });
  }
  if (!entries.length) throw new RigError('noPixels');
  /* 單純的「hair」依繪製順序：在臉的上層＝瀏海、下層＝後髮（see-through 都叫 hair） */
  const faceIndex = entries.findIndex((e) => baseName(e.name) === 'face');
  entries.forEach((e, idx) => {
    if (baseName(e.name) !== 'hair') return;
    const suffix = e.name.slice(4);
    e.name = (faceIndex >= 0 && idx > faceIndex ? 'front hair' : 'back hair') + suffix;
  });
  const byBase: Record<string, { alpha: Uint8Array }[]> = Object.create(null);
  for (const e of entries) {
    const bn = baseName(e.name);
    if (!byBase[bn]) byBase[bn] = [];
    byBase[bn].push(e);
  }
  const merged = (name: string) => mergeAlphas(byBase[name], W, H);

  /* 臉的錨點 */
  const faceAlpha = merged('face');
  let FACE: FaceAnchor;
  if (faceAlpha) {
    const fb = bboxOf(faceAlpha, W, H, 8) as BBox;
    const fc = centroidOf(faceAlpha, W, H) as { cx: number; cy: number };
    FACE = { cx: fc.cx, cy: fc.cy, x0: fb.x0, x1: fb.x1, y0: fb.y0, y1: fb.y1 };
  } else {
    warnings.push({ code: 'noFace', args: [] });
    FACE = { cx: W / 2, cy: H * 0.3, x0: W * 0.35, x1: W * 0.65, y0: H * 0.1, y1: H * 0.5 };
  }

  /* 部件 */
  const parts: RigPart[] = [];
  let z = 0;
  const sided: Record<string, Uint8Array> = {};
  for (const e of entries) {
    const bn = baseName(e.name);
    const known = hasSlot(bn) ? SLOTS[bn] : null;
    let slot: {
      depth: number;
      group: PartGroup;
      phys?: PartPhys;
      split?: boolean;
      fade?: PartFade;
      unknown?: boolean;
    };
    if (!known || known.group === 'auto') {
      const c0 = centroidOf(e.alpha, W, H);
      const guessed: PartGroup = c0 && c0.cy < FACE.y1 ? 'head' : 'body';
      if (!known) warnings.push({ code: 'unknownLayer', args: [e.name, guessed] });
      slot = { depth: known ? known.depth : 1.0, group: guessed, unknown: !known };
    } else {
      slot = known as typeof slot;
    }
    if (slot.split) {
      const masks = splitSides(e.alpha, W, H, FACE.cx);
      let got = false;
      for (const s of ['l', 'r'] as const) {
        const m = masks[s];
        if (!m) continue;
        const side = s.toUpperCase() as Side;
        const rec = makePart(`${e.name}_${s}`, e.layer, e.alpha, m, W, H, slot, z, side, null);
        if (rec) {
          parts.push(rec);
          z++;
          const ma = new Uint8Array(W * H);
          for (let q = 0; q < W * H; q++) ma[q] = m[q] ? e.alpha[q] : 0;
          const sideKey = `${bn}|${s}`;
          const prev = sided[sideKey];
          if (!prev) sided[sideKey] = ma;
          else for (let q = 0; q < ma.length; q++) if (ma[q] > prev[q]) prev[q] = ma[q];
          got = true;
        }
      }
      if (!got) warnings.push({ code: 'splitFailed', args: [e.name] });
    } else if (slot.phys === 'hair') {
      const isPart = /_\d+$/.test(e.name);
      const bb2 = bboxOf(e.alpha, W, H, 16);
      const wpx = bb2 ? bb2.x1 - bb2.x0 : 0;
      const want = isPart ? Math.max(2, Math.min(6, Math.round(wpx / 110))) : 6;
      const minSep = Math.max(30, Math.round(wpx / (want * 1.6)));
      const strands = detectStrands(e.alpha, W, H, minSep, want);
      const rec = makePart(e.name, e.layer, e.alpha, null, W, H, slot, z, null, strands);
      if (rec) {
        parts.push(rec);
        z++;
      }
    } else if (slot.phys === 'sway') {
      /* 耳飾、尾巴：從部件上方垂下的幾個鐘擺 */
      const bb3 = bboxOf(e.alpha, W, H, 16);
      const wpx = bb3 ? bb3.x1 - bb3.x0 : 0;
      const want = Math.max(1, Math.min(4, Math.round(wpx / 140)));
      const sway = detectStrands(e.alpha, W, H, Math.max(20, Math.round(wpx / (want * 1.6))), want);
      const rec = makePart(e.name, e.layer, e.alpha, null, W, H, slot, z, null, sway);
      if (rec) {
        parts.push(rec);
        z++;
      }
    } else {
      const rec = makePart(e.name, e.layer, e.alpha, null, W, H, slot, z, null, null);
      if (rec) {
        if (slot.unknown) rec.unknown = true;
        parts.push(rec);
        z++;
      }
    }
  }

  /* 錨點 */
  const anchors: RigAnchors = {
    face: FACE,
    mouth: { x0: 0, x1: 0, y0: 0, y1: 0, cx: 0, cy: 0 },
    neckPivot: { cx: 0, cy: 0 },
    neckTop: 0,
    neckBottom: 0,
    bodyPivot: { cx: 0, cy: 0 },
    faceScale: 1,
    hairRootY: 0,
  };
  for (const s of ['l', 'r'] as const) {
    const ew = sided[`eyewhite|${s}`];
    const ir = sided[`irides|${s}`];
    const ec = sided[`eye_close|${s}`];
    if (!ew) continue;
    const b = bboxOf(ew, W, H, 8) as BBox;
    const ic = (ir ? centroidOf(ir, W, H) : centroidOf(ew, W, H)) as { cx: number; cy: number };
    const cc = ec ? centroidOf(ec, W, H) : null;
    const a: EyeAnchor = {
      x0: b.x0,
      x1: b.x1,
      y0: b.y0,
      y1: b.y1,
      icx: ic.cx,
      icy: ic.cy,
      closeY: cc ? cc.cy : b.y0 + (b.y1 - b.y0) * 0.62,
    };
    if (s === 'l') anchors.eyeL = a;
    else anchors.eyeR = a;
  }
  if (!anchors.eyeL || !anchors.eyeR) warnings.push({ code: 'eyeAnchor', args: [] });

  const mouthAlpha = merged('mouth_open') || merged('mouth_close');
  if (mouthAlpha) {
    const mb = bboxOf(mouthAlpha, W, H, 8) as BBox;
    const mc = centroidOf(mouthAlpha, W, H) as { cx: number; cy: number };
    anchors.mouth = { x0: mb.x0, x1: mb.x1, y0: mb.y0, y1: mb.y1, cx: mc.cx, cy: mc.cy };
  } else {
    warnings.push({ code: 'noMouth', args: [] });
    anchors.mouth = {
      x0: FACE.cx - 20,
      x1: FACE.cx + 20,
      y0: FACE.cy + 40,
      y1: FACE.cy + 60,
      cx: FACE.cx,
      cy: FACE.cy + 50,
    };
  }

  const neckAlpha = merged('neck');
  if (neckAlpha) {
    const nb = bboxOf(neckAlpha, W, H, 8) as BBox;
    const nc = centroidOf(neckAlpha, W, H) as { cx: number; cy: number };
    anchors.neckPivot = { cx: nc.cx, cy: nb.y0 + (nb.y1 - nb.y0) * 0.85 };
    anchors.neckTop = nb.y0;
    anchors.neckBottom = nb.y1;
  } else {
    anchors.neckPivot = { cx: FACE.cx, cy: FACE.y1 + 20 };
    anchors.neckTop = FACE.y1;
    anchors.neckBottom = FACE.y1 + 60;
  }
  anchors.bodyPivot = { cx: anchors.neckPivot.cx, cy: H };
  anchors.faceScale = Math.max(1, FACE.x1 - FACE.x0) / 333.0;
  anchors.hairRootY = FACE.y0 + 60;

  /* 缺少的閉眼／閉嘴：放上內建差分 */
  const synth = { eye: false, mouth: false };
  const G = opts.generic;
  if (G) {
    const findPart = (name: string) => parts.filter((p) => partBase(p.name) === name);
    if (G.eyeL || G.eyeR) {
      const slotEC = SLOTS.eye_close;
      const mk = (S: EyeAnchor, gimg: PsdImage, side: Side) => {
        const lash =
          findPart('eyelash').find((p) => p.side === side) ??
          findPart('eyebrow').find((p) => p.side === side);
        const tint = lash ? meanColorOfImg(lash.img, false) : null;
        return synthPart(
          `eye_close_${side.toLowerCase()}`,
          gimg,
          (S.x1 - S.x0) * 1.1,
          (S.x0 + S.x1) / 2,
          S.closeY,
          0.55,
          tint,
          slotEC,
          side,
        );
      };
      let idxE = lastIndexWhere(parts, (p) => p.name.indexOf('eyelash') === 0);
      if (idxE < 0) idxE = lastIndexWhere(parts, (p) => p.name.indexOf('irides') === 0);
      if (idxE < 0) idxE = lastIndexWhere(parts, (p) => p.name === 'face');
      for (const side of ['L', 'R'] as const) {
        const gimg = side === 'L' ? G.eyeL : G.eyeR;
        const anchor = side === 'L' ? anchors.eyeL : anchors.eyeR;
        if (gimg && anchor && !findPart('eye_close').some((p) => p.side === side)) {
          parts.splice(++idxE, 0, mk(anchor, gimg, side));
          synth.eye = true;
        }
      }
      if (synth.eye) warnings.push({ code: 'synthEye', args: [] });
    }
    if (G.mouth && !findPart('mouth_close').length && merged('mouth_open')) {
      const m = anchors.mouth;
      const mo = findPart('mouth_open')[0];
      const mc = synthPart(
        'mouth_close',
        G.mouth,
        (m.x1 - m.x0) * 1.1,
        m.cx,
        m.y0 + 0.3 * (m.y1 - m.y0),
        0.5,
        mo ? meanColorOfImg(mo.img, true) : null,
        SLOTS.mouth_close,
        null,
      );
      let idxM = lastIndexWhere(parts, (p) => partBase(p.name) === 'mouth_open');
      if (idxM < 0) idxM = lastIndexWhere(parts, (p) => p.name === 'face');
      parts.splice(idxM + 1, 0, mc);
      synth.mouth = true;
      warnings.push({ code: 'synthMouth', args: [] });
    }
  }
  for (let i = 0; i < parts.length; i++) parts[i].z = i;

  return { canvas: { w: W, h: H }, layers: parts, anchors, warnings, synth };
}

/**
 * 讀檔後的前處理（規格 F15）：每個圖像圖層去掉雜點（四連通區塊 < 40 px）、裁到內容的範圍（外留 4 px）。
 * 直接改圖層樹（之後「儲存輕量 PSD」存的就是這一份）。回傳去掉雜點的圖層數。
 */
export function cleanPsdLayers(psd: PsdRoot): { noisy: number; layers: number } {
  validatePsd(psd);
  const stats = { noisy: 0, layers: 0 };
  for (const c of imageLayersOf(psd)) {
    const img = c.imageData as PsdImage;
    const W = img.width;
    const H = img.height;
    const d = img.data;
    stats.layers++;
    const a = new Uint8Array(W * H);
    let before = 0;
    let after = 0;
    for (let j = 0; j < W * H; j++) {
      a[j] = d[j * 4 + 3];
      if (a[j]) before++;
    }
    cleanAlpha(a, W, H, 40);
    for (let j = 0; j < W * H; j++) {
      if (a[j]) after++;
      d[j * 4 + 3] = a[j];
    }
    if (after < before) stats.noisy++;
    const bb = bboxOf(a, W, H, 0);
    if (!bb) continue;
    const pad = 4;
    const x0 = Math.max(0, bb.x0 - pad);
    const y0 = Math.max(0, bb.y0 - pad);
    const x1 = Math.min(W - 1, bb.x1 + pad);
    const y1 = Math.min(H - 1, bb.y1 + pad);
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    if (w >= W && h >= H) continue;
    const nd = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      const so = ((y + y0) * W + x0) * 4;
      nd.set(d.subarray(so, so + w * 4), y * w * 4);
    }
    c.imageData = { width: w, height: h, data: nd };
    c.left = ((c.left ?? 0) | 0) + x0;
    c.top = ((c.top ?? 0) | 0) + y0;
    c.right = c.left + w;
    c.bottom = c.top + h;
    if (c.canvas) c.canvas = undefined;
  }
  return stats;
}
