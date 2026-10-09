/**
 * 不依賴瀏覽器的檢查與計算：PSD 檔頭、模型指紋、網格大小、彈簧、錨點位移、設定 JSON（v1／v2）。
 * 參考原作 Anime2.5DRig（MIT）的 runtime.js 改寫，數值與規則相同。
 */
import {
  ANCHOR_KEYS,
  type AnchorKey,
  type AnchorOffsets,
  AUTO_KEYS,
  type AutoState,
  type BackgroundId,
  clamp,
  isBackground,
  isNum,
  isPresetId,
  MAX_FILE_BYTES,
  PARAM_DEFS,
  type Params,
  type PresetId,
} from './params';
import { HEADER_ERRORS } from './rigText';

/* ---------- PSD 檔頭 ---------- */

/** 檔頭檢查（規格 F04）：8BPS、版本 1、尺寸、8 位元 RGB；不合時丟 Error（訊息可以直接顯示） */
export function validateHeader(buffer: ArrayBuffer): { w: number; h: number } {
  if (!buffer || buffer.byteLength < 26) throw new Error(HEADER_ERRORS.short);
  if (buffer.byteLength > MAX_FILE_BYTES) throw new Error(HEADER_ERRORS.tooLarge);
  const v = new DataView(buffer);
  if (v.getUint32(0) !== 0x38425053 || v.getUint16(4) !== 1) throw new Error(HEADER_ERRORS.notPsd);
  const h = v.getUint32(14);
  const w = v.getUint32(18);
  if (w < 2 || h < 2 || w * h > 24_000_000 || Math.max(w, h) > 16384)
    throw new Error(HEADER_ERRORS.size);
  if (v.getUint16(22) !== 8 || v.getUint16(24) !== 3) throw new Error(HEADER_ERRORS.depth);
  return { w, h };
}

/**
 * 模型指紋（設定依這個分模型存）：檔案大小（16 進位）-FNV-1a-DJB2（xor 版）。
 * 與原作相同，所以舊版存的設定（anime25d.settings.<指紋>）新版讀得到。
 */
export function fingerprint(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let a = 2166136261;
  let c = 5381;
  for (let i = 0; i < b.length; i++) {
    a = Math.imul(a ^ b[i], 16777619);
    c = Math.imul(c, 33) ^ b[i];
  }
  return `${b.length.toString(16)}-${(a >>> 0).toString(16)}-${(c >>> 0).toString(16)}`;
}

/* ---------- 網格與物理 ---------- */

/** 部件的網格格數：約 cell px 一格，頂點不超過 65,000 個（16 位元索引） */
export function meshSize(w: number, h: number, cell: number): { nx: number; ny: number } {
  let nx = Math.max(2, Math.round(w / cell));
  let ny = Math.max(2, Math.round(h / cell));
  while ((nx + 1) * (ny + 1) > 65000) {
    if (nx >= ny) nx = Math.max(2, Math.floor(nx * 0.9));
    else ny = Math.max(2, Math.floor(ny * 0.9));
  }
  return { nx, ny };
}

export interface SpringState {
  x: number;
  v: number;
}

/** 彈簧：半隱式歐拉法、固定 120 Hz 的子步（10～240 fps 都穩定） */
export function spring(s: SpringState, target: number, k: number, damping: number, dt: number) {
  const count = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / count;
  for (let i = 0; i < count; i++) {
    s.v += (-k * (s.x - target) - damping * s.v) * h;
    s.x += s.v * h;
  }
}

/* ---------- 錨點位移 ---------- */

export const SETTINGS_ERRORS = {
  anchors: '錨點設定不正確。',
  anchorKey: (k: string) => `錨點設定不正確：${k}`,
  format: '不是支援的設定檔。',
  otherModel: '這是其他 PSD 的設定。請讀入與儲存時相同的 PSD。',
  shape: '設定的結構不正確。',
  param: (k: string) => `數值設定不正確：${k}`,
  auto: '自動動作的設定不正確。',
  layers: '圖層設定不正確。',
} as const;

/**
 * 錨點位移的檢查與整理（規格 F50）：只留認得的錨點與方向，夾在 ±limit（預設 16,384），
 * 取到 0.01 px，0 的方向與沒有方向的錨點拿掉。格式不對時丟 Error。
 */
export function sanitizeAnchors(value: unknown, limit?: number): AnchorOffsets {
  const out: AnchorOffsets = {};
  if (value == null) return out;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error(SETTINGS_ERRORS.anchors);
  const lim = isNum(limit) && limit > 0 ? limit : 16384;
  const src = value as Record<string, unknown>;
  for (const [key, axes] of Object.entries(ANCHOR_KEYS) as [AnchorKey, readonly string[]][]) {
    const rec = src[key] as Record<string, unknown> | null | undefined;
    if (rec == null) continue;
    if (typeof rec !== 'object') throw new Error(SETTINGS_ERRORS.anchorKey(key));
    const clean: Record<string, number> = {};
    for (const axis of axes) {
      if (rec[axis] === undefined) continue;
      if (!isNum(rec[axis])) throw new Error(SETTINGS_ERRORS.anchorKey(key));
      const n = clamp(rec[axis] as number, -lim, lim);
      if (n !== 0) clean[axis] = Math.round(n * 100) / 100;
    }
    if (Object.keys(clean).length) out[key] = clean;
  }
  return out;
}

/* ---------- 設定 JSON（每個模型一份；v1／v2，與原作相同的格式） ---------- */

export const SETTINGS_FORMAT = 'anime25d-settings';
export const SETTINGS_VERSION = 2;

export interface LayerSetting {
  id: string;
  visible: boolean;
  opacity: number;
  depth: number;
}

/** 設定 JSON（規格 3.3） */
export interface SettingsFile {
  format: typeof SETTINGS_FORMAT;
  version: 1 | 2;
  app?: string;
  modelId: string;
  modelName?: string;
  params: Partial<Params>;
  preset: PresetId | null;
  auto: Partial<AutoState>;
  background: BackgroundId;
  /** 繪製順序（第一個在最後面） */
  layers: LayerSetting[];
  anchors?: AnchorOffsets;
}

export interface ParsedSettings {
  params: Partial<Params>;
  auto: Partial<AutoState>;
  layers: LayerSetting[];
  background: BackgroundId;
  preset: PresetId | null;
  anchors: AnchorOffsets;
  /** 這個模型有、設定沒寫到的圖層數 */
  missingLayers: number;
  /** 設定寫了、這個模型沒有的圖層數 */
  unknownLayers: number;
}

export interface ParseSettingsOptions {
  /** 不檢查 modelId */
  anyModel?: boolean;
  /** 錨點位移的上限（畫布的長邊） */
  anchorLimit?: number;
}

/**
 * 讀設定（規格 F78）：格式與版本、modelId、結構都要對；參數夾在範圍內（沒寫的用預設值）、
 * 圖層只套用這個模型有的。不合時丟 Error（訊息可以直接顯示）。
 */
export function parseSettings(
  value: unknown,
  modelId: string,
  layerIds: readonly string[],
  defaults: Params,
  options: ParseSettingsOptions = {},
): ParsedSettings {
  const v = value as Partial<SettingsFile> | null;
  if (!v || v.format !== SETTINGS_FORMAT || !(v.version === 1 || v.version === 2))
    throw new Error(SETTINGS_ERRORS.format);
  if (!options.anyModel && v.modelId !== modelId) throw new Error(SETTINGS_ERRORS.otherModel);
  if (!v.params || typeof v.params !== 'object' || !Array.isArray(v.layers))
    throw new Error(SETTINGS_ERRORS.shape);
  const out: ParsedSettings = {
    params: {},
    auto: {},
    layers: [],
    background: 'checker',
    preset: null,
    anchors: {},
    missingLayers: 0,
    unknownLayers: 0,
  };
  if (isPresetId(v.preset)) out.preset = v.preset;
  const params = v.params as Record<string, unknown>;
  for (const d of PARAM_DEFS) {
    const n = params[d.key];
    if (n === undefined) {
      if (isNum(defaults[d.key])) out.params[d.key] = clamp(defaults[d.key], d.min, d.max);
      continue;
    }
    if (!isNum(n)) throw new Error(SETTINGS_ERRORS.param(d.key));
    out.params[d.key] = clamp(n, d.min, d.max);
  }
  const auto = (v.auto ?? {}) as Record<string, unknown>;
  for (const key of AUTO_KEYS) {
    const a = auto[key];
    if (a === undefined) continue;
    if (typeof a !== 'boolean') throw new Error(SETTINGS_ERRORS.auto);
    out.auto[key] = a;
  }
  const known = new Set(layerIds);
  const seen = new Set<string>();
  for (const raw of v.layers as unknown[]) {
    const l = raw as Partial<LayerSetting> | null;
    if (
      !l ||
      typeof l.id !== 'string' ||
      seen.has(l.id) ||
      typeof l.visible !== 'boolean' ||
      !isNum(l.opacity) ||
      !isNum(l.depth)
    )
      throw new Error(SETTINGS_ERRORS.layers);
    seen.add(l.id);
    if (!known.has(l.id)) {
      out.unknownLayers++;
      continue;
    }
    out.layers.push({
      id: l.id,
      visible: l.visible,
      opacity: clamp(l.opacity, 0, 1),
      depth: clamp(l.depth, 0, 2),
    });
  }
  out.missingLayers = layerIds.filter((id) => !seen.has(id)).length;
  if (isBackground(v.background)) out.background = v.background;
  out.anchors = sanitizeAnchors(v.anchors, options.anchorLimit);
  return out;
}

/** 存檔裡的圖層順序併進目前的圖層：存檔沒提到的圖層留在原本的鄰居後面 */
export function mergeLayerOrder(
  defaultIds: readonly string[],
  savedIds: readonly string[],
): string[] {
  const saved = savedIds.filter((id) => defaultIds.includes(id));
  const out = saved.slice();
  defaultIds.forEach((id, i) => {
    if (out.includes(id)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = out.indexOf(defaultIds[j]);
      if (k >= 0) {
        at = k + 1;
        break;
      }
    }
    out.splice(at, 0, id);
  });
  return out;
}

/** 下載檔名的主檔名：去掉副檔名、不能用的字元換成「_」、最多 80 字 */
export function safeFileName(name: string, fallback = 'avatar'): string {
  const base = String(name || '')
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: 檔名不能有控制字元（同原作）
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '_')
    .trim()
    .slice(0, 80);
  return base || fallback;
}
