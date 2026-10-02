/**
 * core/ruler：尺規刻度。產生主次刻度、依間距抽稀數字（盤面上與匯出共用同一份規則）。
 *
 * ```ts
 * const ticks = rulerTicks({ min: 0, max: 210, step: 10, majorEvery: 50, scale: pxPerCm, fontPx: 11 });
 * for (const t of ticks) {
 *   const y = toScreenY(t.value);
 *   ctx.strokeStyle = t.kind === 'zero' ? '#909090' : t.kind === 'major' ? '#c7c7c7' : '#e8e8e8';
 *   if (t.label !== null) ctx.fillText(t.label, x, y);
 * }
 * ```
 */

export type RulerTickKind = 'zero' | 'major' | 'minor';

export interface RulerTick {
  /** 刻度的值（世界座標單位，例如 cm） */
  value: number;
  /** 0（地面）、主刻度（majorEvery 的倍數）、次刻度 */
  kind: RulerTickKind;
  /** 要顯示的數字；這一條不顯示數字時為 null */
  label: string | null;
}

export interface RulerOptions {
  /** 範圍（含兩端；不必是 step 的倍數） */
  min: number;
  max: number;
  /** 刻度間隔（預設 10） */
  step?: number;
  /** 主刻度間隔（預設 step × 5） */
  majorEvery?: number;
  /** 每單位幾 px（決定數字要不要抽稀） */
  scale: number;
  /** 數字的字級（px，預設 11） */
  fontPx?: number;
  /** 數字之間至少要隔幾倍字高（預設 1.7） */
  minLabelGap?: number;
  /** 可用的數字間隔（由小到大；預設 step 的 1、5、10、20、50、100… 倍） */
  labelSteps?: readonly number[];
  /** 小於這個值的刻度不產生（例如地面以下不畫：0） */
  floor?: number;
  /** 數字格式（預設整數不帶小數、其他最多兩位小數） */
  format?: (value: number) => string;
}

const EPS = 1e-9;

/** 預設的數字間隔候選：step 的 1、5、10、20、50、100、200、500、1000 倍 */
export function defaultLabelSteps(step: number): number[] {
  return [1, 5, 10, 20, 50, 100, 200, 500, 1000].map((k) => k * step);
}

/**
 * 數字間隔：候選中第一個「間隔 × scale ≥ minLabelGap × fontPx」的值；都太密時取最後一個再加倍。
 * 例：step 10、scale 1.2 px/cm、字 11 px → 10 cm 只有 12 px（< 18.7）→ 50 cm。
 */
export function labelInterval(
  scale: number,
  {
    step = 10,
    fontPx = 11,
    minLabelGap = 1.7,
    labelSteps,
  }: Pick<RulerOptions, 'step' | 'fontPx' | 'minLabelGap' | 'labelSteps'> = {},
): number {
  const steps = labelSteps?.length
    ? [...labelSteps].sort((a, b) => a - b)
    : defaultLabelSteps(step);
  const need = minLabelGap * fontPx;
  for (const s of steps) if (s * scale + EPS >= need) return s;
  let s = steps[steps.length - 1];
  while (s * scale + EPS < need && s < 1e12) s *= 2;
  return s;
}

const defaultFormat = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

/** value 是不是 step 的整數倍（容許浮點誤差） */
export function isMultiple(value: number, step: number): boolean {
  if (!(step > 0)) return false;
  const k = value / step;
  return Math.abs(k - Math.round(k)) < 1e-6;
}

/**
 * 產生刻度：從 ≥ min（與 floor）的第一個 step 倍數到 ≤ max 的最後一個。
 * 值以「整數倍 × step」計算，不累加浮點誤差。
 */
export function rulerTicks(options: RulerOptions): RulerTick[] {
  const { min, max, scale, floor = Number.NEGATIVE_INFINITY, format = defaultFormat } = options;
  const step = options.step ?? 10;
  const majorEvery = options.majorEvery ?? step * 5;
  if (!(step > 0) || !(max >= min)) return [];
  const every = labelInterval(scale, options);
  const lo = Math.max(min, floor);
  const k0 = Math.ceil(lo / step - 1e-9);
  const k1 = Math.floor(max / step + 1e-9);
  const out: RulerTick[] = [];
  for (let k = k0; k <= k1; k++) {
    /* + 0：把 -0 變成 0 */
    const value = Math.round(k * step * 1e9) / 1e9 + 0;
    const kind: RulerTickKind =
      Math.abs(value) < EPS ? 'zero' : isMultiple(value, majorEvery) ? 'major' : 'minor';
    const label = kind === 'zero' || isMultiple(value, every) ? format(value) : null;
    out.push({ value, kind, label });
  }
  return out;
}

/** 依刻度種類的建議外觀（顏色、線寬倍率、數字字重）；工具可以自己決定，不一定要用 */
export const RULER_STYLE: Record<
  RulerTickKind,
  { line: string; widthRatio: number; text: string; weight: number }
> = {
  zero: { line: '#909090', widthRatio: 1.6, text: '#333333', weight: 700 },
  major: { line: '#c7c7c7', widthRatio: 1.3, text: '#555555', weight: 700 },
  minor: { line: '#e8e8e8', widthRatio: 1, text: '#888888', weight: 400 },
};

/** 無條件進位到 step 的倍數（例：盤面上緣 202.5 → 210） */
export function ceilTo(value: number, step: number): number {
  return Math.ceil(value / step - 1e-9) * step;
}

/** 無條件捨去到 step 的倍數 */
export function floorTo(value: number, step: number): number {
  return Math.floor(value / step + 1e-9) * step;
}
