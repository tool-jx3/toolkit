/**
 * core/lyricfx 的型別：要排的句、量字、矩形、設定面板的描述、演出風格的介面（lyric-fx 規格 3.8）。
 * 不依賴 React 與 DOM（`draw` 只拿到畫布的 2D context）。
 */

/** 要排的一句（工具由歌詞組出來：規格 3.2） */
export interface LyricFxLine {
  /** 這一句的鍵（逐句調整用；同一份歌詞每次相同） */
  key: string;
  /** 開始（秒，已加上演出延遲） */
  t: number;
  /** 結束（秒；最後一句是 Infinity）：到了就變成殘影（也可能更早被下一句換掉） */
  end: number;
  /** 文字（不是空字串） */
  text: string;
  /** 一起顯示的翻譯（沒有時空字串） */
  tr: string;
  /** 重抽了幾次（換這一句自己的亂數） */
  reroll: number;
  /** 鎖定時記下的資料（風格自己的格式，見 LyricStyle.lock） */
  lock: unknown;
  /** 沒有時間標記的歌詞整段當成一句（規格 F03） */
  untimed?: boolean;
}

/** 量字（瀏覽器用畫布量；單元測試給固定寬度） */
export interface LyricMeasureEnv {
  /** 一個字（一個 code point）的前進寬度（px），font 是 canvas 的 font 字串 */
  advance(ch: string, font: string): number;
}

export interface LyricSize {
  width: number;
  height: number;
}

export interface LyricRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LyricCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 字型（同 core/fonts 的 FontValue） */
export interface LyricFont {
  source: 'google' | 'local' | 'upload';
  family: string;
  weight: number;
}

/* ---------- 設定面板的描述（共用元件 LyricStyleControls 照這個產生控制項） ---------- */

/** 控制項的 when／disabled 拿到的工具層共用設定（和風格無關；規格 3.8） */
export interface LyricControlContext {
  /** 避開區域（null＝沒有） */
  region: LyricRegion | null;
}

interface ControlBase {
  /** 設定物件的欄位名稱 */
  key: string;
  label: string;
  hint?: string;
  /** 依目前的設定決定要不要顯示（不顯示時值保留） */
  when?: (settings: Record<string, unknown>, ctx: LyricControlContext) => boolean;
  /** 依目前的設定決定要不要停用；回傳字串時當成停用的說明 */
  disabled?: (settings: Record<string, unknown>, ctx: LyricControlContext) => boolean | string;
}

export interface SliderControl extends ControlBase {
  kind: 'slider';
  min: number;
  max: number;
  step: number;
  unit?: string;
  /** 數字欄的小數位數（預設依 step） */
  precision?: number;
  /** 顯示換算後的值（例：透視 X 50 → 0.000050） */
  format?: (value: number) => string;
}

export interface NumberControl extends ControlBase {
  kind: 'number';
  min: number;
  max: number;
  step: number;
  unit?: string;
  precision?: number;
}

/** 兩個數字欄：最小、最大（key 是最小，maxKey 是最大） */
export interface RangeControl extends ControlBase {
  kind: 'range';
  maxKey: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  labels: { min: string; max: string };
}

export interface ToggleControl extends ControlBase {
  kind: 'toggle';
}

export interface ColorControl extends ControlBase {
  kind: 'color';
}

export interface ChoiceControl extends ControlBase {
  kind: 'segmented' | 'select';
  options: readonly { value: string | number; label: string }[];
}

export interface FontControl extends ControlBase {
  kind: 'font';
  /** 可以選「同上」（值為 null）時給這個選項的名稱 */
  nullLabel?: string;
  previewText?: string;
}

/** 配色預設：按一下把幾個欄位一起換掉（使用者自己存的由工具保存） */
export interface PresetsControl extends ControlBase {
  kind: 'presets';
  /** 一起換掉的欄位 */
  keys: readonly string[];
  builtins: readonly { name: string; values: Record<string, unknown> }[];
}

/**
 * 避開區域的位置：風格用這個控制項表示「會避開避開區域，框選的控制項放在面板的這裡」。
 * 值不在風格的設定裡：避開區域是工具層的共用設定（LyricControlContext.region），由工具畫控制項（在預覽上框選）、
 * 透過 plan 的 options.region 交給風格；key 不使用（寫 'region'）。
 */
export interface RegionControl extends ControlBase {
  kind: 'region';
}

export type LyricControl =
  | SliderControl
  | NumberControl
  | RangeControl
  | ToggleControl
  | ColorControl
  | ChoiceControl
  | FontControl
  | PresetsControl
  | RegionControl;

export interface LyricControlSection {
  id: string;
  title: string;
  description?: string;
  controls: readonly LyricControl[];
}

/** 避開區域（畫面的比例，0～1） */
export interface LyricRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/* ---------- 演出風格 ---------- */

/** plan 的工具層共用輸入（和風格無關的設定；規格 3.8）。風格用不到的欄位不理它 */
export interface LyricPlanOptions {
  /** 避開區域（畫面的比例，0～1；null／沒有＝沒有避開區域） */
  region?: LyricRegion | null;
}

/**
 * 一種歌詞演出風格（規格 3.8）。工具本體只透過這個介面用風格。
 * - plan：事先排好每一句（位置、角度、時間…），純函式：同樣的參數一定得到同樣的結果。
 * - draw：畫時間 t 的那一格到 rect（基準畫面等比例縮放、置中），純函式、不碰 DOM、不畫背景。
 * - 選填的 lock、settledAt 沒有提供時工具怎麼做，寫在各欄位的說明。
 */
export interface LyricStyle<S = Record<string, unknown>, P = unknown> {
  id: string;
  name: string;
  description: string;
  defaults(): S;
  normalize(raw: unknown): S;
  controls: readonly LyricControlSection[];
  /** 要先載入的字型（畫之前 ensureFont） */
  fonts(settings: S): LyricFont[];
  plan(
    lines: readonly LyricFxLine[],
    settings: S,
    seed: number,
    size: LyricSize,
    env: LyricMeasureEnv,
    options?: LyricPlanOptions,
  ): P;
  draw(ctx: LyricCtx, t: number, plan: P, settings: S, rect: LyricRect): void;
  /**
   * 鎖定一句時記下的資料（之後放在 LyricFxLine.lock 傳回 plan）；這一句沒有排到時 null。
   * 沒有提供＝這個風格不能鎖定：工具的逐句清單不顯示「鎖定」。
   */
  lock?(plan: P, key: string): unknown;
  /** 面板上的提醒（例：有翻譯時預點亮停用） */
  notes?(lines: readonly LyricFxLine[], settings: S): string[];
  /** 這一句在時間 t 有沒有畫在畫面上（逐句清單標示用） */
  visibleAt?(plan: P, key: string, t: number): boolean;
  /**
   * 最後一句完整出現的時間（秒；沒有音樂時預覽與匯出的長度用；沒有句時 0）。
   * 沒有提供時工具用最後一句的開始時間（沒有句時 0）；長度＝它再加 3 秒、至少 5 秒。
   */
  settledAt?(plan: P): number;
}

// biome-ignore lint/suspicious/noExplicitAny: 風格的登錄表收各種設定型別
export type AnyLyricStyle = LyricStyle<any, any>;
