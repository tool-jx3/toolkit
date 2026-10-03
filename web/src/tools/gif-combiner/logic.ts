/**
 * GIF 接合器的純邏輯（不依賴 React、瀏覽器）：資料結構、預設值與範圍、時間軸、格線排列、吸附、疊放順序。
 * 數值規則見 docs/refactor/specs/gif-combiner.md 第 3 節。
 */
import type { Box } from '@/core/layout';
import type { FrameSpec } from '@/core/timeline/frames';

export const TOOL_ID = 'gif-combiner';

/** 匯出格式（GIF 是舊版唯一的格式；APNG、WebP 是新版加的，F43） */
export type OutputFormat = 'gif' | 'apng' | 'webp';

/** 畫布上的一張動圖 */
export interface CombinerItem {
  id: string;
  /** 資產庫（IndexedDB）裡原始檔的 id */
  asset: string;
  /** 檔名 */
  name: string;
  /** 原始寬高（GIF 的邏輯畫面） */
  ow: number;
  oh: number;
  /** 一輪的長度（毫秒，所有格的時間總和）與格數 */
  totalMs: number;
  frames: number;
  /** 位置與大小（畫布 px，不取整） */
  x: number;
  y: number;
  width: number;
  height: number;
  /** 疊放順序：大的畫在上面（F07、F14） */
  z: number;
}

export interface CombinerData {
  canvas: { width: number; height: number };
  grid: { cols: number; rows: number };
  /** 輸出倍率（%） */
  scale: number;
  /** 輸出影格率 */
  fps: number;
  /** 總播放時間（毫秒） */
  durationMs: number;
  background: string;
  /** 透明背景（F42） */
  transparent: boolean;
  format: OutputFormat;
  /** 播放次數，0＝無限循環 */
  plays: number;
  /** APNG 減色 */
  quantize: boolean;
  /** 清單順序（格線排列的順序） */
  items: CombinerItem[];
}

export const DEFAULTS: CombinerData = {
  canvas: { width: 800, height: 600 },
  grid: { cols: 3, rows: 2 },
  scale: 100,
  fps: 20,
  durationMs: 3000,
  background: '#00ff00',
  transparent: false,
  format: 'gif',
  plays: 0,
  quantize: false,
  items: [],
};

/** 數值欄的範圍（舊版沒有範圍，見規格 5. 第 3 項） */
export const RANGE = {
  canvas: [16, 4096],
  grid: [1, 20],
  scale: [10, 200],
  fps: [1, 50],
  durationMs: [20, 600_000],
  plays: [0, 65_535],
} as const satisfies Record<string, readonly [number, number]>;

/** 吸附距離（畫布 px，嚴格小於） */
export const SNAP_DISTANCE = 15;
/** 調整大小時寬高的下限 */
export const MIN_ITEM_SIZE = 20;
/** 「正方格」每格的邊長 */
export const SQUARE_CELL = 250;
/** 每個檔案最多讀幾格（F40） */
export const MAX_FRAMES_PER_FILE = 500;
/** 每格時間：最短 20 ms、讀不到（0）時 100 ms（F03） */
export const DECODE_OPTIONS = {
  maxFrames: MAX_FRAMES_PER_FILE,
  minDelayMs: 20,
  defaultDelayMs: 100,
} as const;
/** 處理量上限：輸出寬 × 高 × 影格數（F44） */
export const PIXEL_BUDGET = 220_000_000;
/** 輸出檔名主體（F32） */
export const OUTPUT_BASE_NAME = 'combined';

export const clampTo = (v: number, [lo, hi]: readonly [number, number]): number =>
  Math.min(hi, Math.max(lo, v));

/** 整數並夾在範圍內（不是數字時用 fallback） */
export function clampInt(v: number, range: readonly [number, number], fallback: number): number {
  return Number.isFinite(v) ? clampTo(Math.round(v), range) : fallback;
}

/* ---------- 時間軸（3.1） ---------- */

/** 每格的間隔：1000 ÷ 影格率，無條件捨去成整數毫秒 */
export function stepMs(fps: number): number {
  return Math.max(1, Math.floor(1000 / Math.max(1, fps)));
}

/** 取樣的格數：t＝0、s、2s… 小於總播放時間的個數（至少 1） */
export function sampleCount(durationMs: number, fps: number): number {
  return Math.max(1, Math.ceil(durationMs / stepMs(fps)));
}

/**
 * 輸出的影格表：每格 s 毫秒、第 i 格畫 i × s 毫秒時的畫面（t 以秒計，給 exportAnimation／Transport）。
 * GIF 的延遲由編碼器以累計時間換成 1/100 秒（規格 5. 第 1 項）。
 */
export function outputFrames(durationMs: number, fps: number): FrameSpec[] {
  const s = stepMs(fps);
  const n = sampleCount(durationMs, fps);
  return Array.from({ length: n }, (_, i) => ({ ms: s, t: (i * s) / 1000 }));
}

/** 舊版寫進 GIF 的延遲：每格都是「間隔 ÷ 10」四捨五入（1/100 秒；對照用） */
export function legacyDelayCs(fps: number): number {
  return Math.round(stepMs(fps) / 10);
}

/** 第 i 格的取樣時間（整數毫秒；預覽、匯出共用） */
export const sampleTimeMs = (t: number): number => Math.round(t * 1000);

/* ---------- 尺寸（3.4） ---------- */

export function outputSize(
  canvas: { width: number; height: number },
  scalePct: number,
): { width: number; height: number } {
  const k = scalePct / 100;
  return {
    width: Math.max(1, Math.round(canvas.width * k)),
    height: Math.max(1, Math.round(canvas.height * k)),
  };
}

/* ---------- 新動圖與自動總長 ---------- */

/** 新動圖：原始大小、放在畫布正中央（不取整，F04） */
export function centeredBox(
  canvas: { width: number; height: number },
  ow: number,
  oh: number,
): Box {
  return { x: (canvas.width - ow) / 2, y: (canvas.height - oh) / 2, width: ow, height: oh };
}

/** 加入或刪除後的總播放時間：最長那張的長度；沒有動圖時 null（不改，F09） */
export function suggestedDuration(items: readonly Pick<CombinerItem, 'totalMs'>[]): number | null {
  if (!items.length) return null;
  return Math.max(...items.map((it) => it.totalMs));
}

/* ---------- 疊放順序 ---------- */

/** 畫的順序：z 小的先畫（同 z 時照清單順序） */
export function drawOrder<T extends Pick<CombinerItem, 'z'>>(items: readonly T[]): T[] {
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => a.it.z - b.it.z || a.i - b.i)
    .map((x) => x.it);
}

/** 比所有動圖都上層的 z */
export function topZ(items: readonly Pick<CombinerItem, 'z'>[]): number {
  return items.reduce((m, it) => Math.max(m, it.z), 0) + 1;
}

/** 疊放改成清單順序（越後面越上層，F07） */
export function zInListOrder<T extends Pick<CombinerItem, 'z'>>(items: readonly T[]): T[] {
  return items.map((it, i) => (it.z === i + 1 ? it : { ...it, z: i + 1 }));
}

/* ---------- 格線排列（3.5） ---------- */

type Size = Pick<CombinerItem, 'ow' | 'oh'>;

/** 排列（F21）：等比放進格子、置中、四捨五入 */
export function arrangeGrid(
  items: readonly Size[],
  canvas: { width: number; height: number },
  cols: number,
  rows: number,
): Box[] {
  const cw = canvas.width / cols;
  const ch = canvas.height / rows;
  return items.map((it, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const k = Math.min(cw / it.ow, ch / it.oh);
    const width = Math.round(it.ow * k);
    const height = Math.round(it.oh * k);
    /* `|| 0`：−0.5 四捨五入是 −0，存成 0 */
    return {
      x: Math.round(col * cw + (cw - width) / 2) || 0,
      y: Math.round(row * ch + (ch - height) / 2) || 0,
      width,
      height,
    };
  });
}

/** 正方格（F22）的畫布尺寸 */
export function squareCanvas(cols: number, rows: number): { width: number; height: number } {
  return { width: cols * SQUARE_CELL, height: rows * SQUARE_CELL };
}

/** 去掉留白（F23）：以第一張為一格；沒有動圖時 null */
export function tightGrid(
  items: readonly Size[],
  cols: number,
  rows: number,
): { canvas: { width: number; height: number }; boxes: Box[] } | null {
  const first = items[0];
  if (!first) return null;
  const bw = first.ow;
  const bh = first.oh;
  return {
    canvas: { width: cols * bw, height: rows * bh },
    boxes: items.map((_, i) => ({
      x: (i % cols) * bw,
      y: Math.floor(i / cols) * bh,
      width: bw,
      height: bh,
    })),
  };
}

/* ---------- 吸附（3.6） ---------- */

const near = (a: number, b: number) => Math.abs(a - b) < SNAP_DISTANCE;

/** 自己的邊（依序）與目標的邊（依序）第一組不到吸附距離的位移；沒有時 null */
function edgeShift(mine: readonly number[], targets: readonly number[]): number | null {
  for (const m of mine) for (const t of targets) if (near(m, t)) return t - m;
  return null;
}

/**
 * 移動的吸附：候選位置（按下時的位置＋總位移）先吸畫布的邊，沒吸到再依清單順序吸其他動圖的邊；
 * 左右、上下各自獨立，只吸邊。
 */
export function snapMove(
  box: Box,
  others: readonly Box[],
  canvas: { width: number; height: number },
): Box {
  let { x, y } = box;
  const { width: w, height: h } = box;
  let sx = false;
  let sy = false;
  if (near(x, 0)) {
    x = 0;
    sx = true;
  } else if (near(x + w, canvas.width)) {
    x = canvas.width - w;
    sx = true;
  }
  if (near(y, 0)) {
    y = 0;
    sy = true;
  } else if (near(y + h, canvas.height)) {
    y = canvas.height - h;
    sy = true;
  }
  for (const o of others) {
    if (!sx) {
      const d = edgeShift([x, x + w], [o.x, o.x + o.width]);
      if (d !== null) {
        x += d;
        sx = true;
      }
    }
    if (!sy) {
      const d = edgeShift([y, y + h], [o.y, o.y + o.height]);
      if (d !== null) {
        y += d;
        sy = true;
      }
    }
  }
  return { x, y, width: w, height: h };
}

/** 調整大小（右下角）的吸附：右邊、下邊吸畫布或其他動圖的邊，最後寬高各至少 20 */
export function snapResize(
  box: Box,
  others: readonly Box[],
  canvas: { width: number; height: number },
): Box {
  const { x, y } = box;
  let w = box.width;
  let h = box.height;
  let sw = false;
  let sh = false;
  if (near(x + w, canvas.width)) {
    w = canvas.width - x;
    sw = true;
  }
  if (near(y + h, canvas.height)) {
    h = canvas.height - y;
    sh = true;
  }
  for (const o of others) {
    if (!sw) {
      const d = edgeShift([x + w], [o.x, o.x + o.width]);
      if (d !== null) {
        w += d;
        sw = true;
      }
    }
    if (!sh) {
      const d = edgeShift([y + h], [o.y, o.y + o.height]);
      if (d !== null) {
        h += d;
        sh = true;
      }
    }
  }
  return { x, y, width: Math.max(MIN_ITEM_SIZE, w), height: Math.max(MIN_ITEM_SIZE, h) };
}

/* ---------- 顯示 ---------- */

/** 「120 × 80 · 12 格 · 1.20 秒」 */
export function itemMeta(it: Pick<CombinerItem, 'ow' | 'oh' | 'frames' | 'totalMs'>): string {
  return `${it.ow} × ${it.oh} · ${it.frames} 格 · ${(it.totalMs / 1000).toFixed(2)} 秒`;
}

let seq = 0;
/** 動圖在畫布上的 id（同一個檔案加兩次是兩筆） */
export function newItemId(): string {
  seq += 1;
  return `g${Date.now().toString(36)}${seq.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** 讀回的資料（自動保存、專案檔）整理成合法的值；不是本工具的資料時 null */
export function normalizeData(raw: unknown): CombinerData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<CombinerData>;
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  const items = Array.isArray(r.items) ? r.items : [];
  const cleanItems: CombinerItem[] = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const x = it as Partial<CombinerItem>;
    if (typeof x.asset !== 'string' || !x.asset) continue;
    const ow = num(x.ow, 0);
    const oh = num(x.oh, 0);
    if (!(ow > 0 && oh > 0)) continue;
    cleanItems.push({
      id: typeof x.id === 'string' && x.id ? x.id : newItemId(),
      asset: x.asset,
      name: typeof x.name === 'string' ? x.name : '',
      ow,
      oh,
      totalMs: Math.max(1, num(x.totalMs, 100)),
      frames: Math.max(1, Math.round(num(x.frames, 1))),
      x: num(x.x, 0),
      y: num(x.y, 0),
      width: Math.max(1, num(x.width, ow)),
      height: Math.max(1, num(x.height, oh)),
      z: num(x.z, cleanItems.length + 1),
    });
  }
  const format: OutputFormat =
    r.format === 'apng' || r.format === 'webp' || r.format === 'gif' ? r.format : DEFAULTS.format;
  return {
    canvas: {
      width: clampInt(num(r.canvas?.width, NaN), RANGE.canvas, DEFAULTS.canvas.width),
      height: clampInt(num(r.canvas?.height, NaN), RANGE.canvas, DEFAULTS.canvas.height),
    },
    grid: {
      cols: clampInt(num(r.grid?.cols, NaN), RANGE.grid, DEFAULTS.grid.cols),
      rows: clampInt(num(r.grid?.rows, NaN), RANGE.grid, DEFAULTS.grid.rows),
    },
    scale: clampInt(num(r.scale, NaN), RANGE.scale, DEFAULTS.scale),
    fps: clampInt(num(r.fps, NaN), RANGE.fps, DEFAULTS.fps),
    durationMs: clampInt(num(r.durationMs, NaN), RANGE.durationMs, DEFAULTS.durationMs),
    background:
      typeof r.background === 'string' && /^#[0-9a-f]{6}$/i.test(r.background)
        ? r.background.toLowerCase()
        : DEFAULTS.background,
    transparent: r.transparent === true,
    format,
    plays: clampInt(num(r.plays, NaN), RANGE.plays, DEFAULTS.plays),
    quantize: r.quantize === true,
    items: cleanItems,
  };
}
