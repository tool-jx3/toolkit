/**
 * see-through（shitagaki-lab/see-through）的深度（規格 1.15、3.7）。純函式，Node、Worker、主執行緒都能跑：
 * - Worker：深度 PSD（`<名稱>_depth.psd`，灰階 8 位元）與 `<名稱>.psd.json` 讀進來，和彩色 PSD 的圖層一一對應，
 *   算出每個圖層的深度（see-through 的偽深度，0＝近、1＝遠）；
 * - 主執行緒：把 see-through 的深度換成轉頭時的深度（本站的部位表的尺度：臉 1.0、瀏海 1.28、後髮 0.55），
 *   依開關與強度和部位表的深度混合。
 *
 * see-through 的輸出（common/utils/inference_utils.py 的 save_part、dump_parts_psd）：每個部件的深度是 Marigold 的偽深度
 * 夾到 0～1、乘 255 存成灰階；部件外是 255；`depth_median`＝透明度 > 10 的像素的深度中位數（0～1）。
 * 同一次推論的所有部件在同一個深度空間裡，可以互相比較，但尺度隨圖片而不同（只有相對的意義）。
 */
import { imageLayersOf, type PsdNode, type PsdRoot } from './rigger';
import { DEPTH_ERRORS } from './rigText';

/* ---------- 讀入（Worker） ---------- */

export interface LayerRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type DepthIssueCode = 'size' | 'jsonSize' | 'notGray' | 'missing' | 'extra' | 'offset';

/** 深度檔和彩色 PSD 對不上的地方（args：尺寸或圖層名稱） */
export interface DepthIssue {
  code: DepthIssueCode;
  args: string[];
}

export interface DepthMeasure {
  /** 每個圖像圖層（imageLayersOf 的順序）的深度（0＝近、1＝遠，4 位小數）；沒有時 null */
  values: (number | null)[];
  /** 有深度的圖層數 */
  matched: number;
  /** 有像素的圖像圖層數 */
  total: number;
  /** 實際用到的檔案 */
  used: { psd: boolean; json: boolean };
  issues: DepthIssue[];
}

/** 和彩色 PSD 的部件一樣：透明度 > 10 的像素算部件（see-through 的 save_part） */
export const DEPTH_MASK_ALPHA = 10;

/** 深度 PSD 的檔頭（8BPS、版本 1、8 位元、灰階或 RGB）；不合時丟 Error（訊息可以直接顯示） */
export function validateDepthHeader(buffer: ArrayBuffer): { w: number; h: number; gray: boolean } {
  if (!buffer || buffer.byteLength < 26) throw new Error(DEPTH_ERRORS.short);
  const v = new DataView(buffer);
  if (v.getUint32(0) !== 0x38425053 || v.getUint16(4) !== 1) throw new Error(DEPTH_ERRORS.notPsd);
  const h = v.getUint32(14);
  const w = v.getUint32(18);
  const mode = v.getUint16(24);
  if (v.getUint16(22) !== 8 || (mode !== 1 && mode !== 3)) throw new Error(DEPTH_ERRORS.mode);
  return { w, h, gray: mode === 1 };
}

/** 檔頭是灰階的 PSD（一次給兩個 PSD 時用來分辨哪個是深度） */
export function isGrayPsdHeader(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 26 &&
    bytes[0] === 0x38 &&
    bytes[1] === 0x42 &&
    bytes[2] === 0x50 &&
    bytes[3] === 0x53 &&
    bytes[24] === 0 &&
    bytes[25] === 1
  );
}

/** see-through 的 `.psd.json`：`parts` 是物件、沒有本站設定的 `format` */
export function isSeeThroughJson(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    v.format === undefined &&
    !!v.parts &&
    typeof v.parts === 'object' &&
    !Array.isArray(v.parts) &&
    (v.frame_size === undefined || Array.isArray(v.frame_size))
  );
}

const nameKey = (n: unknown) =>
  String(n ?? '')
    .normalize('NFKC')
    .trim();
const round4 = (v: number) => Math.round(v * 1e4) / 1e4;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** 透明度 > 10 的像素數（沒有像素的圖層不算在對應裡） */
function maskCount(c: PsdNode): number {
  const d = c.imageData?.data;
  if (!d) return 0;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > DEPTH_MASK_ALPHA) n++;
  return n;
}

/** 彩色圖層的部件像素（透明度 > 10）底下的深度中位數（與 numpy 的 median 相同：偶數個取中間兩個的平均） */
function sampleMedian(c: PsdNode, d: PsdNode) {
  const ci = c.imageData;
  const di = d.imageData;
  const out = { median: null as number | null, n: 0, nonGray: 0 };
  if (!ci || !di) return out;
  const hist = new Uint32Array(256);
  const ox = ((c.left ?? 0) | 0) - ((d.left ?? 0) | 0);
  const oy = ((c.top ?? 0) | 0) - ((d.top ?? 0) | 0);
  for (let y = 0; y < ci.height; y++) {
    const Y = y + oy;
    if (Y < 0 || Y >= di.height) continue;
    for (let x = 0; x < ci.width; x++) {
      if (ci.data[(y * ci.width + x) * 4 + 3] <= DEPTH_MASK_ALPHA) continue;
      const X = x + ox;
      if (X < 0 || X >= di.width) continue;
      const o = (Y * di.width + X) * 4;
      if (di.data[o + 3] === 0) continue;
      const r = di.data[o];
      hist[r]++;
      out.n++;
      if (Math.abs(r - di.data[o + 1]) > 2 || Math.abs(di.data[o + 1] - di.data[o + 2]) > 2)
        out.nonGray++;
    }
  }
  if (!out.n) return out;
  const at = (k: number) => {
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc > k) return v;
    }
    return 255;
  };
  const mid = out.n >> 1;
  out.median = out.n % 2 ? at(mid) : (at(mid - 1) + at(mid)) / 2;
  return out;
}

/** `.psd.json` 的 `parts[名稱].depth_median`（0～1）；`frame_size`＝[高, 寬] */
function jsonDepths(value: unknown): {
  frame: [number, number] | null;
  parts: Map<string, number>;
} {
  const v = value as { parts?: Record<string, unknown>; frame_size?: unknown };
  const parts = new Map<string, number>();
  for (const [name, rec] of Object.entries(v.parts ?? {})) {
    const d = (rec as { depth_median?: unknown } | null)?.depth_median;
    if (typeof d === 'number' && Number.isFinite(d)) parts.set(nameKey(name), clamp01(d));
  }
  const f = v.frame_size;
  const frame =
    Array.isArray(f) && f.length >= 2 && f.every((n) => typeof n === 'number')
      ? ([f[0], f[1]] as [number, number])
      : null;
  return { frame, parts };
}

/**
 * 深度檔 → 每個彩色圖層的深度（規格 F101、F102）。
 * - 深度 PSD：圖層依名稱對應（同名的依順序），在彩色圖層的部件像素（透明度 > 10）底下取深度的中位數 ÷ 255；
 *   畫布尺寸不同時整個不用；位置或範圍和彩色 PSD 讀入時不同的照樣以畫布座標取，列進提示；
 *   像素不是灰階（> 1％ 的像素 R、G、B 差 > 2）時整個不用（多半是給錯了彩色 PSD）。
 * - `.psd.json`：`parts[名稱].depth_median`；深度 PSD 沒有給值的圖層才用；`frame_size` 和畫布不同時不用。
 * @param color 彩色 PSD（去過雜點的圖層樹）
 * @param rects 彩色 PSD 讀入時（去雜點、裁切之前）每個圖像圖層的範圍
 */
export function measureDepth(
  color: PsdRoot,
  rects: readonly (LayerRect | undefined)[],
  depth: PsdRoot | null,
  json: unknown,
): DepthMeasure {
  const cl = imageLayersOf(color);
  const values: (number | null)[] = cl.map(() => null);
  const issues: DepthIssue[] = [];
  const used = { psd: false, json: false };
  const counts = cl.map(maskCount);
  const size = (w: number, h: number) => `${w} × ${h}`;
  if (depth) {
    if (depth.width !== color.width || depth.height !== color.height) {
      issues.push({
        code: 'size',
        args: [size(depth.width, depth.height), size(color.width, color.height)],
      });
    } else {
      const dl = imageLayersOf(depth);
      const pool = new Map<string, number[]>();
      dl.forEach((l, i) => {
        const k = nameKey(l.name);
        const list = pool.get(k);
        if (list) list.push(i);
        else pool.set(k, [i]);
      });
      const found: (number | null)[] = cl.map(() => null);
      const offset: string[] = [];
      let usedD = 0;
      let samples = 0;
      let nonGray = 0;
      cl.forEach((c, ci) => {
        const di = pool.get(nameKey(c.name))?.shift();
        if (di === undefined) return;
        usedD++;
        const d = dl[di];
        const r = rects[ci];
        if (
          r &&
          (d.left !== r.left || d.top !== r.top || d.right !== r.right || d.bottom !== r.bottom)
        )
          offset.push(String(c.name ?? ''));
        const m = sampleMedian(c, d);
        samples += m.n;
        nonGray += m.nonGray;
        if (m.median !== null) found[ci] = round4(m.median / 255);
      });
      if (samples && nonGray > samples * 0.01) {
        issues.push({ code: 'notGray', args: [] });
      } else {
        found.forEach((v, i) => {
          if (v !== null) {
            values[i] = v;
            used.psd = true;
          }
        });
        if (offset.length) issues.push({ code: 'offset', args: offset });
        if (dl.length > usedD) issues.push({ code: 'extra', args: [String(dl.length - usedD)] });
      }
    }
  }
  if (json != null) {
    const j = jsonDepths(json);
    if (j.frame && (j.frame[0] !== color.height || j.frame[1] !== color.width)) {
      issues.push({
        code: 'jsonSize',
        args: [size(j.frame[1], j.frame[0]), size(color.width, color.height)],
      });
    } else {
      cl.forEach((c, i) => {
        if (values[i] !== null) return;
        const v = j.parts.get(nameKey(c.name));
        if (v === undefined) return;
        values[i] = round4(v);
        used.json = true;
      });
    }
  }
  const missing = cl
    .filter((_c, i) => counts[i] > 0 && values[i] === null)
    .map((c) => String(c.name ?? ''));
  if ((used.psd || used.json) && missing.length) issues.push({ code: 'missing', args: missing });
  return {
    values,
    matched: values.filter((v, i) => v !== null && counts[i] > 0).length,
    total: counts.filter((n) => n > 0).length,
    used,
    issues,
  };
}

/* ---------- 換成轉頭的深度（主執行緒） ---------- */

/** 用 see-through 的深度的部位（規格 3.7）：可以離開臉與身體表面的部件；未分類的圖層也用 */
export const DEPTH_MAPPED_PARTS: ReadonlySet<string> = new Set([
  'front hair',
  'back hair',
  'side hair',
  'ahoge',
  'headwear',
  'ears',
  'earwear',
  'handwear',
  'objects',
  'tail',
  'wings',
]);

/** 決定倍率用的部位（部位表的深度有明確的前後：瀏海 1.28、側髮 1.22、呆毛 1.30、後髮 0.55） */
const CALIBRATION_PARTS: ReadonlySet<string> = new Set([
  'front hair',
  'side hair',
  'ahoge',
  'back hair',
]);

/** 倍率的範圍、太平的門檻（深度差的均方根 < 0.004，約 1／255） */
export const DEPTH_SCALE_RANGE = [0.5, 20] as const;
export const DEPTH_FLAT_RMS = 0.004;

export interface DepthPart {
  id: string;
  /** 部位（去掉左右與編號） */
  bn: string;
  unknown: boolean;
  synthetic: boolean;
  /** 部位表的深度（綁定時的深度） */
  table: number;
}

export type DepthMapReason = 'noFace' | 'noHair' | 'flat' | 'reversed';

export interface DepthMap {
  /** 部件代號 → 換算後的深度（強度 1 的值，0～2、3 位小數） */
  mapped: Record<string, number>;
  /** 倍率 K（深度差 1 ＝ 轉頭的深度差 K） */
  scale: number | null;
  /** 臉的 see-through 深度 */
  face: number | null;
  /** 換算不了的原因（沿用部位表） */
  reason: DepthMapReason | null;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function median(xs: number[]): number {
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * see-through 的深度 → 轉頭的深度（規格 3.7）：
 * 深度＝1＋K ×（臉的 see-through 深度 − 部件的），K 以最小平方法配合部位表裡頭髮的深度
 * （K＝Σ x·y ÷ Σ x²，x＝臉 − 頭髮、y＝部位表 − 1），夾在 0.5～20。瀏海與呆毛至少 1.0、後髮最多 1.0，全部夾在 0～2。
 * 只換 DEPTH_MAPPED_PARTS 與未分類的圖層；臉的表面（眼睛、眉毛、鼻子、嘴巴、臉部細節、眼鏡）與身體（脖子、上身、下身、腿、鞋子、領口）維持部位表。
 * 沒有臉、沒有頭髮、深度太平或頭髮的前後相反時不換（reason）。
 */
export function mapSeeThroughDepth(
  parts: readonly DepthPart[],
  values: Readonly<Record<string, number>>,
): DepthMap {
  const fail = (reason: DepthMapReason, face: number | null = null): DepthMap => ({
    mapped: {},
    scale: null,
    face,
    reason,
  });
  const faces = parts
    .filter((p) => p.bn === 'face' && !p.synthetic && isNum(values[p.id]))
    .map((p) => values[p.id]);
  if (!faces.length) return fail('noFace');
  const sFace = median(faces);
  let sxy = 0;
  let sxx = 0;
  let n = 0;
  for (const p of parts) {
    const v = values[p.id];
    if (!CALIBRATION_PARTS.has(p.bn) || !isNum(v)) continue;
    const x = sFace - v;
    sxy += x * (p.table - 1);
    sxx += x * x;
    n++;
  }
  if (!n) return fail('noHair', sFace);
  if (Math.sqrt(sxx / n) < DEPTH_FLAT_RMS) return fail('flat', sFace);
  const k = sxy / sxx;
  if (!(k > 0)) return fail('reversed', sFace);
  const K = Math.max(DEPTH_SCALE_RANGE[0], Math.min(DEPTH_SCALE_RANGE[1], k));
  const mapped: Record<string, number> = {};
  for (const p of parts) {
    const v = values[p.id];
    if (p.synthetic || !(DEPTH_MAPPED_PARTS.has(p.bn) || p.unknown) || !isNum(v)) continue;
    let d = 1 + K * (sFace - v);
    if (p.bn === 'front hair' || p.bn === 'ahoge') d = Math.max(1, d);
    if (p.bn === 'back hair') d = Math.min(1, d);
    mapped[p.id] = round3(Math.max(0, Math.min(2, d)));
  }
  return { mapped, scale: round3(K), face: round4(sFace), reason: null };
}

/** 綁定時的深度（開關關著、沒有換算值時＝部位表；強度 0～1 在部位表與換算值之間） */
export function blendDepth(
  table: number,
  mapped: number | undefined,
  on: boolean,
  strength: number,
): number {
  if (!on || mapped === undefined) return table;
  return round3(table + Math.max(0, Math.min(1, strength)) * (mapped - table));
}

/** 換了深度的設定時，圖層的深度跟著移動（手動改過的差距保留），夾 0～2、3 位小數 */
export function rebaseDepth(current: number, oldDefault: number, newDefault: number): number {
  if (oldDefault === newDefault) return current;
  return round3(Math.max(0, Math.min(2, current + newDefault - oldDefault)));
}
