/**
 * 壓克力周邊工房的設定（自動保存、復原／重做、專案檔）。圖片只記 id（core/assets 的資產或 `demo:` 內建示範圖）。
 * 預設值與範圍照舊版（規格第 1 節）。純資料與純函式，不依賴 React、three.js。
 */

export const TOOL_ID = 'acrylic-goods';

/** 三種周邊（規格 1.1） */
export type Kind = 'stand' | 'shaker' | 'diorama';
export const KINDS: readonly Kind[] = ['stand', 'shaker', 'diorama'];

export type OutlineMode = 'unified' | 'separate';
export type BaseShape = 'circle' | 'square' | 'contour';
export type FrameShape = 'circle' | 'square' | 'image';
export type Finish = 'glossy' | 'matte';

export interface StandSettings {
  /** 正面圖 */
  front: string | null;
  /** 背面圖（可省略） */
  back: string | null;
  /** 外框模式：用正面的外框／正反面各自算 */
  outline: OutlineMode;
  /** 加底座（false＝只有圖） */
  base: boolean;
  baseShape: BaseShape;
  /** 底座大小（px，圓形是半徑、方形是半邊長） */
  baseSize: number;
  /** 底面圖（可省略） */
  baseImage: string | null;
}

export interface ShakerPart {
  id: string;
  image: string | null;
  /** 數量 1～20 */
  qty: number;
  /** 大小 20～200（%） */
  scale: number;
}

export interface ShakerSettings {
  frame: FrameShape;
  /** 「依圖片生成外框」用的背景圖 */
  frameImage: string | null;
  /** 外框整體大小（px，圓形是直徑、方形是邊長） */
  frameSize: number;
  /** 內部留白（%）：物理碰撞範圍＝外框 × 這個比例 */
  padding: number;
  parts: ShakerPart[];
}

export interface DioramaLayer {
  id: string;
  image: string | null;
  /** 位置偏移（px） */
  x: number;
  y: number;
  /** 水平旋轉（0、90、180、270 度） */
  rotation: number;
}

export interface DioramaSettings {
  /** 底座邊距（px） */
  baseMargin: number;
  /** 圖層間距（px） */
  gap: number;
  layers: DioramaLayer[];
}

export interface MaterialSettings {
  /** 壓克力厚度（px） */
  thickness: number;
  /** 外框留白（px） */
  margin: number;
  finish: Finish;
}

export interface LightSettings {
  /** 主光方向（打光盤上的位置，單位圓內；x 右、y 下＝往前） */
  x: number;
  y: number;
  /** 主光強度 */
  key: number;
  /** 環境光強度 */
  ambient: number;
}

export interface BackgroundSettings {
  color: string;
  transparent: boolean;
}

export type ExportFormatId = 'apng' | 'gif' | 'webp' | 'png';

export interface ExportSettings {
  format: ExportFormatId;
  fps: number;
  scale: number;
  plays: number;
  /** APNG 減色（256 色） */
  quantize: boolean;
}

export interface Settings {
  stand: StandSettings;
  shaker: ShakerSettings;
  diorama: DioramaSettings;
  material: MaterialSettings;
  light: LightSettings;
  background: BackgroundSettings;
  /** 自動旋轉速度 0～10（0＝不轉） */
  spin: number;
  export: ExportSettings;
  /** 放進來的圖的檔名（圖片 id → 檔名，圖片欄顯示用；示範圖不放） */
  names: Record<string, string>;
}

/* ---------- 範圍與預設 ---------- */

export const RANGE = {
  baseSize: [50, 400],
  frameSize: [100, 400],
  padding: [40, 100],
  qty: [1, 20],
  partScale: [20, 200],
  baseMargin: [0, 100],
  gap: [10, 150],
  /** 圖層位置偏移：滑桿的範圍（數字欄可以超出，最多 ±OFFSET_INPUT_MAX） */
  offset: [-200, 200],
  thickness: [5, 50],
  margin: [0, 50],
  light: [0, 2],
  spin: [0, 10],
} as const satisfies Record<string, readonly [number, number]>;

/** 圖層位置數字欄的範圍（舊版不限；新版 ±2000） */
export const OFFSET_INPUT_MAX = 2000;

export const DEFAULT_LIGHT: LightSettings = { x: 0.5, y: 0.5, key: 0.5, ambient: 0.6 };

export const FPS_CHOICES = [10, 15, 20, 24, 30] as const;
export const SCALE_CHOICES = [0.5, 0.75, 1, 1.5, 2] as const;

/** 預覽與匯出的畫面大小（px，舊版固定 800 × 800） */
export const CANVAS_SIZE = 800;

/** 檔名最多記幾個字 */
export const IMAGE_NAME_MAX = 255;

export function defaultSettings(): Settings {
  return {
    stand: {
      front: null,
      back: null,
      outline: 'unified',
      base: true,
      baseShape: 'circle',
      baseSize: 150,
      baseImage: null,
    },
    shaker: { frame: 'circle', frameImage: null, frameSize: 200, padding: 85, parts: [] },
    diorama: { baseMargin: 30, gap: 40, layers: [] },
    material: { thickness: 20, margin: 15, finish: 'glossy' },
    light: { ...DEFAULT_LIGHT },
    background: { color: '#eef1f5', transparent: false },
    spin: 0,
    export: { format: 'apng', fps: 20, scale: 1, plays: 0, quantize: false },
    names: {},
  };
}

/* ---------- 清理（讀檔、還原時） ---------- */

const num = (v: unknown, fb: number, [lo, hi]: readonly [number, number], int = true): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fb;
  const c = Math.min(hi, Math.max(lo, n));
  return int ? Math.round(c) : Math.round(c * 1000) / 1000;
};
const oneOf = <T extends string>(v: unknown, list: readonly T[], fb: T): T =>
  list.includes(v as T) ? (v as T) : fb;
const imageId = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const color = (v: unknown, fb: string) =>
  typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fb;
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

let idSeq = 0;
/** 零件、圖層的 id */
export function newId(prefix: string): string {
  idSeq += 1;
  return `${prefix}${Date.now().toString(36)}${idSeq.toString(36)}`;
}

/** 水平旋轉：轉 delta 度後換算成 0～270 */
export function turn(rotation: number, delta: number): number {
  return (((rotation + delta) % 360) + 360) % 360;
}

/** 任何來源（自動保存、專案檔）的值都整理成合法的設定；完全不像設定時回傳 null */
export function normalizeSettings(raw: unknown): Settings | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const d = defaultSettings();
  const r = obj(raw);
  const st = obj(r.stand);
  const sh = obj(r.shaker);
  const di = obj(r.diorama);
  const ma = obj(r.material);
  const li = obj(r.light);
  const bg = obj(r.background);
  const ex = obj(r.export);
  const ids = new Set<string>();
  const uniqueId = (v: unknown, prefix: string) => {
    let id = typeof v === 'string' && v ? v : newId(prefix);
    while (ids.has(id)) id = newId(prefix);
    ids.add(id);
    return id;
  };
  /* 打光盤的點：超出單位圓時沿原方向拉回圓周 */
  const fin = (v: unknown, fb: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
  const rx = fin(li.x, d.light.x);
  const ry = fin(li.y, d.light.y);
  const len = Math.hypot(rx, ry);
  const lx = Math.round((len > 1 ? rx / len : rx) * 1000) / 1000;
  const ly = Math.round((len > 1 ? ry / len : ry) * 1000) / 1000;
  const out: Settings = {
    stand: {
      front: imageId(st.front),
      back: imageId(st.back),
      outline: oneOf(st.outline, ['unified', 'separate'] as const, d.stand.outline),
      base: typeof st.base === 'boolean' ? st.base : d.stand.base,
      baseShape: oneOf(st.baseShape, ['circle', 'square', 'contour'] as const, d.stand.baseShape),
      baseSize: num(st.baseSize, d.stand.baseSize, RANGE.baseSize),
      baseImage: imageId(st.baseImage),
    },
    shaker: {
      frame: oneOf(sh.frame, ['circle', 'square', 'image'] as const, d.shaker.frame),
      frameImage: imageId(sh.frameImage),
      frameSize: num(sh.frameSize, d.shaker.frameSize, RANGE.frameSize),
      padding: num(sh.padding, d.shaker.padding, RANGE.padding),
      parts: (Array.isArray(sh.parts) ? sh.parts : []).map((p) => {
        const o = obj(p);
        return {
          id: uniqueId(o.id, 'p'),
          image: imageId(o.image),
          qty: num(o.qty, 1, RANGE.qty),
          scale: num(o.scale, 100, RANGE.partScale),
        };
      }),
    },
    diorama: {
      baseMargin: num(di.baseMargin, d.diorama.baseMargin, RANGE.baseMargin),
      gap: num(di.gap, d.diorama.gap, RANGE.gap),
      layers: (Array.isArray(di.layers) ? di.layers : []).map((l) => {
        const o = obj(l);
        return {
          id: uniqueId(o.id, 'l'),
          image: imageId(o.image),
          x: num(o.x, 0, [-OFFSET_INPUT_MAX, OFFSET_INPUT_MAX]),
          y: num(o.y, 0, [-OFFSET_INPUT_MAX, OFFSET_INPUT_MAX]),
          rotation: turn(Math.round(num(o.rotation, 0, [-3600, 3600]) / 90) * 90, 0),
        };
      }),
    },
    material: {
      thickness: num(ma.thickness, d.material.thickness, RANGE.thickness),
      margin: num(ma.margin, d.material.margin, RANGE.margin),
      finish: oneOf(ma.finish, ['glossy', 'matte'] as const, d.material.finish),
    },
    light: {
      x: lx,
      y: ly,
      key: num(li.key, d.light.key, RANGE.light, false),
      ambient: num(li.ambient, d.light.ambient, RANGE.light, false),
    },
    background: {
      color: color(bg.color, d.background.color),
      transparent: typeof bg.transparent === 'boolean' ? bg.transparent : false,
    },
    spin: num(r.spin, d.spin, RANGE.spin),
    export: {
      format: oneOf(ex.format, ['apng', 'gif', 'webp', 'png'] as const, d.export.format),
      fps: (FPS_CHOICES as readonly number[]).includes(ex.fps as number)
        ? (ex.fps as number)
        : d.export.fps,
      scale: (SCALE_CHOICES as readonly number[]).includes(ex.scale as number)
        ? (ex.scale as number)
        : d.export.scale,
      plays: num(ex.plays, 0, [0, 99]),
      quantize: ex.quantize === true,
    },
    names: {},
  };
  /* 檔名：只留設定裡用到的圖 */
  const used = new Set(imageIdsOf(out));
  for (const [id, name] of Object.entries(obj(r.names))) {
    const n = typeof name === 'string' ? name.trim().slice(0, IMAGE_NAME_MAX) : '';
    if (n && used.has(id)) out.names[id] = n;
  }
  return out;
}

/**
 * 記下圖片的檔名（放進新的圖時）：回傳新的檔名表，順便拿掉設定裡已經沒用到的圖的檔名
 * （id 是依內容產生的，同一張圖放在兩個欄位時共用最後一次的檔名）。
 */
export function withImageName(s: Settings, id: string, name: string): Record<string, string> {
  const keep = new Set(imageIdsOf(s));
  keep.add(id);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(s.names)) if (keep.has(k)) out[k] = v;
  const n = name.trim().slice(0, IMAGE_NAME_MAX);
  if (n) out[id] = n;
  else delete out[id];
  return out;
}

/** 周邊種類（不合法時立牌） */
export const normalizeKind = (v: unknown): Kind => oneOf(v, KINDS, 'stand');

/** 所有用到的圖片 id（不含內建示範圖） */
export function imageIdsOf(s: Settings, keepDemo = false): string[] {
  const all = [
    s.stand.front,
    s.stand.back,
    s.stand.baseImage,
    s.shaker.frameImage,
    ...s.shaker.parts.map((p) => p.image),
    ...s.diorama.layers.map((l) => l.image),
  ].filter((id): id is string => !!id);
  return [...new Set(keepDemo ? all : all.filter((id) => !id.startsWith('demo:')))];
}
