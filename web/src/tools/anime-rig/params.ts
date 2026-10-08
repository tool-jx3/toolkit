/**
 * 參數、表情預設、自動動作、錨點、偏好設定的定義（純資料；數值照原作 Anime2.5DRig）。
 */

export const TOOL_ID = 'anime-rig';

/** PSD 檔案大小上限（128 MB） */
export const MAX_FILE_BYTES = 128 * 1024 * 1024;

/* ---------- 參數 ---------- */

export type ParamSection = 'head' | 'eyes' | 'brow' | 'mouth' | 'bangs' | 'body';

export interface ParamDef {
  key: ParamKey;
  section: ParamSection;
  min: number;
  max: number;
  default: number;
}

/** 參數：滑桿的順序就是這裡的順序（間隔一律 0.01） */
export const PARAM_DEFS = [
  { key: 'angleX', section: 'head', min: -1, max: 1, default: 0 },
  { key: 'angleY', section: 'head', min: -1, max: 1, default: 0 },
  { key: 'angleZ', section: 'head', min: -1, max: 1, default: 0 },
  { key: 'eyeOpenL', section: 'eyes', min: 0, max: 1, default: 1 },
  { key: 'eyeOpenR', section: 'eyes', min: 0, max: 1, default: 1 },
  { key: 'eyeX', section: 'eyes', min: -1, max: 1, default: 0 },
  { key: 'eyeY', section: 'eyes', min: -1, max: 1, default: 0 },
  { key: 'irisScale', section: 'eyes', min: 0.5, max: 1.3, default: 1 },
  { key: 'eyeScaleL', section: 'eyes', min: 0.5, max: 1.5, default: 1 },
  { key: 'eyeScaleR', section: 'eyes', min: 0.5, max: 1.5, default: 1 },
  { key: 'eyeEase', section: 'eyes', min: 0, max: 1, default: 0.3 },
  { key: 'eyeCY', section: 'eyes', min: -1, max: 1, default: 0 },
  { key: 'eyeCAng', section: 'eyes', min: -1, max: 1, default: 0 },
  { key: 'brow', section: 'brow', min: -1, max: 1, default: 0 },
  { key: 'browAngSym', section: 'brow', min: -1, max: 1, default: 0 },
  { key: 'browAngL', section: 'brow', min: -1, max: 1, default: 0 },
  { key: 'browAngR', section: 'brow', min: -1, max: 1, default: 0 },
  { key: 'mouthOpen', section: 'mouth', min: 0, max: 1, default: 0 },
  { key: 'mouthForm', section: 'mouth', min: -1, max: 1, default: 0 },
  { key: 'mouthCY', section: 'mouth', min: -1, max: 1, default: 0 },
  { key: 'mouthEase', section: 'mouth', min: 0, max: 1, default: 0.72 },
  { key: 'mouthCAng', section: 'mouth', min: -1, max: 1, default: 0 },
  { key: 'mouthScale', section: 'mouth', min: 0.5, max: 1.5, default: 1 },
  { key: 'fhAmp', section: 'bangs', min: 0, max: 3, default: 2 },
  { key: 'fhSoft', section: 'bangs', min: 0, max: 2, default: 0.4 },
  { key: 'bangL', section: 'bangs', min: -1, max: 1, default: 0 },
  { key: 'bangC', section: 'bangs', min: -1, max: 1, default: 0 },
  { key: 'bangR', section: 'bangs', min: -1, max: 1, default: 0 },
  { key: 'body', section: 'body', min: -1, max: 1, default: 0 },
  { key: 'armY', section: 'body', min: -1, max: 1, default: 0 },
  { key: 'armPos', section: 'body', min: -1, max: 1, default: 0 },
  { key: 'bust', section: 'body', min: 0, max: 4, default: 2.5 },
  { key: 'bustY', section: 'body', min: -3, max: 3, default: 1 },
  { key: 'physAmp', section: 'body', min: 0, max: 3, default: 2 },
  { key: 'soft', section: 'body', min: 0, max: 3, default: 2 },
  { key: 'accAmp', section: 'body', min: 0, max: 3, default: 1 },
] as const satisfies readonly {
  key: string;
  section: ParamSection;
  min: number;
  max: number;
  default: number;
}[];

export type ParamKey = (typeof PARAM_DEFS)[number]['key'];
export type Params = Record<ParamKey, number>;

export const PARAM_KEYS: readonly ParamKey[] = PARAM_DEFS.map((d) => d.key);
export const PARAM_STEP = 0.01;

export const PARAM_RANGES: Record<ParamKey, readonly [number, number]> = Object.fromEntries(
  PARAM_DEFS.map((d) => [d.key, [d.min, d.max] as const]),
) as Record<ParamKey, readonly [number, number]>;

export function defaultParams(): Params {
  return Object.fromEntries(PARAM_DEFS.map((d) => [d.key, d.default])) as Params;
}

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function clampParam(key: ParamKey, v: number): number {
  const [lo, hi] = PARAM_RANGES[key];
  return clamp(v, lo, hi);
}

/* ---------- 表情預設（按鍵 1～7） ---------- */

export const PRESET_IDS = [
  'neutral',
  'smile',
  'usume',
  'surprise',
  'jito',
  'winkL',
  'winkR',
] as const;
export type PresetId = (typeof PRESET_IDS)[number];

type PresetValues = Pick<
  Params,
  'eyeOpenL' | 'eyeOpenR' | 'brow' | 'mouthOpen' | 'mouthForm' | 'irisScale'
>;

export const PRESETS: Record<PresetId, PresetValues> = {
  neutral: { eyeOpenL: 1, eyeOpenR: 1, brow: 0, mouthOpen: 0, mouthForm: 0, irisScale: 1 },
  smile: { eyeOpenL: 0, eyeOpenR: 0, brow: 0.45, mouthOpen: 0, mouthForm: 0.9, irisScale: 1 },
  usume: { eyeOpenL: 0.5, eyeOpenR: 0.5, brow: 0.35, mouthOpen: 1, mouthForm: 0.8, irisScale: 1 },
  surprise: { eyeOpenL: 1, eyeOpenR: 1, brow: 1, mouthOpen: 0.75, mouthForm: -0.1, irisScale: 0.7 },
  jito: { eyeOpenL: 0.4, eyeOpenR: 0.4, brow: -0.6, mouthOpen: 0, mouthForm: -0.4, irisScale: 1 },
  winkL: { eyeOpenL: 0, eyeOpenR: 1, brow: 0.2, mouthOpen: 0.4, mouthForm: 0.7, irisScale: 1 },
  winkR: { eyeOpenL: 1, eyeOpenR: 0, brow: 0.2, mouthOpen: 0.4, mouthForm: 0.7, irisScale: 1 },
};

export const isPresetId = (v: unknown): v is PresetId =>
  typeof v === 'string' && (PRESET_IDS as readonly string[]).includes(v);

/* ---------- 自動動作 ---------- */

/** 存進設定的自動動作（攝影機、麥克風不存） */
export const AUTO_KEYS = ['idle', 'blink', 'rand', 'talk', 'mouse', 'phys'] as const;
export type AutoKey = (typeof AUTO_KEYS)[number];
export type AutoState = Record<AutoKey, boolean>;

export const AUTO_DEFAULTS: AutoState = {
  idle: true,
  blink: true,
  rand: true,
  talk: true,
  mouse: false,
  phys: true,
};

/* ---------- 背景 ---------- */

export const BACKGROUNDS = ['checker', 'green', 'dark'] as const;
export type BackgroundId = (typeof BACKGROUNDS)[number];
export const isBackground = (v: unknown): v is BackgroundId =>
  typeof v === 'string' && (BACKGROUNDS as readonly string[]).includes(v);

/** 預覽背景的顏色（綠幕 #00b140、深色 #14151c） */
export const BACKGROUND_COLORS: Record<Exclude<BackgroundId, 'checker'>, string> = {
  green: '#00b140',
  dark: '#14151c',
};

export const EXPORT_BACKGROUNDS = ['transparent', 'green', 'dark'] as const;
export type ExportBackground = (typeof EXPORT_BACKGROUNDS)[number];

/** 匯出的底色（已預乘的 RGBA，0～1） */
export const EXPORT_BG_RGBA: Record<ExportBackground, [number, number, number, number]> = {
  transparent: [0, 0, 0, 0],
  green: [0, 177 / 255, 64 / 255, 1],
  dark: [20 / 255, 21 / 255, 28 / 255, 1],
};

/* ---------- 錨點 ---------- */

/** 可以調整的錨點與各自能動的方向（位移以 PSD 的 px 計） */
export const ANCHOR_KEYS = {
  face: ['dx', 'dy'],
  eyeL: ['dx', 'dy'],
  eyeR: ['dx', 'dy'],
  eyeLClose: ['dy'],
  eyeRClose: ['dy'],
  mouth: ['dx', 'dy'],
  neck: ['dx', 'dy'],
  chest: ['dx', 'dy'],
} as const satisfies Record<string, readonly ('dx' | 'dy')[]>;

export type AnchorKey = keyof typeof ANCHOR_KEYS;
export interface AnchorOffset {
  dx?: number;
  dy?: number;
}
export type AnchorOffsets = Partial<Record<AnchorKey, AnchorOffset>>;

/* ---------- 偏好設定（每個瀏覽器一份，不分模型） ---------- */

export const REC_SECONDS = [3, 5, 10, 15, 30, 60] as const;
export const REC_FPS = [30, 60] as const;

export interface Prefs {
  headGain: number;
  eyeGain: number;
  mouthGain: number;
  browGain: number;
  gazeGain: number;
  smoothing: number;
  linkEyes: boolean;
  trackBrow: boolean;
  trackSmile: boolean;
  camPreview: boolean;
  micGain: number;
  micGate: number;
  exportBg: ExportBackground;
  recSeconds: number;
  recFps: number;
  /** 錄影格式（MediaRecorder 的類型）；空字串＝第一個支援的 */
  recFormat: string;
  /** 收合的區塊 */
  collapsed: string[];
  /** 正面校正（攝影機） */
  calibration: Record<string, number> | null;
}

export type PrefNumberKey =
  | 'headGain'
  | 'eyeGain'
  | 'mouthGain'
  | 'browGain'
  | 'gazeGain'
  | 'smoothing'
  | 'micGain'
  | 'micGate';

/** 數值偏好的範圍與預設 [最小, 最大, 預設] */
export const PREF_RANGES: Record<PrefNumberKey, readonly [number, number, number]> = {
  headGain: [0.3, 2, 1],
  eyeGain: [0.5, 2, 1],
  mouthGain: [0.5, 2.5, 1],
  browGain: [0, 2, 1],
  gazeGain: [0, 2, 1],
  smoothing: [0, 1, 0.5],
  micGain: [0.25, 4, 1],
  micGate: [0, 0.5, 0.05],
};

export function defaultPrefs(): Prefs {
  return {
    headGain: 1,
    eyeGain: 1,
    mouthGain: 1,
    browGain: 1,
    gazeGain: 1,
    smoothing: 0.5,
    linkEyes: true,
    trackBrow: true,
    trackSmile: true,
    camPreview: true,
    micGain: 1,
    micGate: 0.05,
    exportBg: 'transparent',
    recSeconds: 5,
    recFps: 30,
    recFormat: '',
    collapsed: [],
    calibration: null,
  };
}

/** 校正值要有的欄位 */
export const NEUTRAL_KEYS = [
  'yaw',
  'pitch',
  'roll',
  'eyeL',
  'eyeR',
  'browL',
  'browR',
  'mouthOpen',
  'smile',
  'gazeX',
  'gazeY',
] as const;

/** 存檔讀回的偏好設定修正（舊版 anime25d.prefs 也用這個讀）：範圍外夾回、不認得的換預設 */
export function normalizePrefs(value: unknown): Prefs {
  const d = defaultPrefs();
  const src = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const num = (k: PrefNumberKey) => {
    const [lo, hi, def] = PREF_RANGES[k];
    return isNum(src[k]) ? clamp(src[k] as number, lo, hi) : def;
  };
  const bool = (k: 'linkEyes' | 'trackBrow' | 'trackSmile' | 'camPreview') =>
    typeof src[k] === 'boolean' ? (src[k] as boolean) : d[k];
  const cal = src.calibration as Record<string, unknown> | null | undefined;
  const calibration =
    cal && typeof cal === 'object' && NEUTRAL_KEYS.every((k) => isNum(cal[k]))
      ? (Object.fromEntries(NEUTRAL_KEYS.map((k) => [k, cal[k] as number])) as Record<
          string,
          number
        >)
      : null;
  return {
    headGain: num('headGain'),
    eyeGain: num('eyeGain'),
    mouthGain: num('mouthGain'),
    browGain: num('browGain'),
    gazeGain: num('gazeGain'),
    smoothing: num('smoothing'),
    linkEyes: bool('linkEyes'),
    trackBrow: bool('trackBrow'),
    trackSmile: bool('trackSmile'),
    camPreview: bool('camPreview'),
    micGain: num('micGain'),
    micGate: num('micGate'),
    exportBg: (EXPORT_BACKGROUNDS as readonly unknown[]).includes(src.exportBg)
      ? (src.exportBg as ExportBackground)
      : d.exportBg,
    recSeconds: (REC_SECONDS as readonly unknown[]).includes(src.recSeconds)
      ? (src.recSeconds as number)
      : d.recSeconds,
    recFps: (REC_FPS as readonly unknown[]).includes(src.recFps)
      ? (src.recFps as number)
      : d.recFps,
    recFormat: typeof src.recFormat === 'string' ? src.recFormat : d.recFormat,
    collapsed: Array.isArray(src.collapsed)
      ? src.collapsed.filter((s): s is string => typeof s === 'string')
      : [],
    calibration,
  };
}
