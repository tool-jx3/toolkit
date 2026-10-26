/**
 * SF 標題模式（2026-10-26 新增的第四個模式）：設定、範本、色票、字型、代碼自動產生、解碼字串、時間軸與尺寸。
 *
 * 功能參考 Mellow Noise 的「SF 타이틀 메이커」（未授權：只參考功能、選項、數值與動畫的時間安排；
 * 程式、範本的畫法、文字與色票由本站自做）。範本在 1200 × 400 的設計空間畫，依輸出尺寸置中縮放（sfDraw.ts）。
 * 這個檔不碰畫布，方便單元測試。
 */

import type { BundledFontId } from '@/core/fonts/bundled';
import { clamp, clamp01, EASE, hashUnit, seedOf, timeSlot } from '@/core/timeline';
import type { LoopMode, Settings } from './settings';

/* ---------- 範本 ---------- */

export type SfTemplateId =
  | 'reticle'
  | 'callout'
  | 'warning'
  | 'slab'
  | 'hex'
  | 'index'
  | 'bracket'
  | 'terminal';

export interface SfTemplateInfo {
  id: SfTemplateId;
  name: string;
  /** 滑鼠提示 */
  note: string;
  /** 範本會畫出編號 */
  usesNum?: boolean;
}

export const SF_TEMPLATES: readonly SfTemplateInfo[] = [
  { id: 'reticle', name: '準星', note: '左邊轉動的瞄準環，右邊四角框住標題。' },
  { id: 'callout', name: '資料掃描', note: '定位點拉出引線，旁邊是讀數與進度格。' },
  { id: 'warning', name: '警告面板', note: '切角面板、閃爍的警示三角與斜紋警戒條。' },
  { id: 'slab', name: '賽博標籤', note: '整塊斜角色塊，標題鏤空，旁邊有箭頭與條碼。' },
  { id: 'hex', name: '六角徽章', note: '轉動的六角徽章，接一條箭頭形的鏤空標題帶。' },
  { id: 'index', name: '索引', note: '鏤空標題的色帶，右邊菱形裡放編號。', usesNum: true },
  {
    id: 'bracket',
    name: '括號框',
    note: '大括號框住置中的標題，下方有來回移動的游標。',
    usesNum: true,
  },
  { id: 'terminal', name: '終端機', note: '終端機視窗逐字打出標題，下方捲動系統紀錄。' },
];

export const SF_TEMPLATE_IDS = SF_TEMPLATES.map((t) => t.id);

export const sfTemplateInfo = (id: string | null | undefined): SfTemplateInfo =>
  SF_TEMPLATES.find((t) => t.id === id) ?? SF_TEMPLATES[0];

/* ---------- 色票（本站自選） ---------- */

export const SF_MAIN_SWATCHES: readonly (readonly [string, string])[] = [
  ['#eef4fb', '冰白'],
  ['#7fe0ff', '青'],
  ['#94f0c6', '薄荷'],
  ['#ff5d63', '紅'],
  ['#ffb6d3', '粉'],
  ['#ffc861', '琥珀'],
  ['#b8a5ff', '紫'],
];

export const SF_ACCENT_SWATCHES: readonly (readonly [string, string])[] = [
  ['#ff4458', '警示紅'],
  ['#7fe0ff', '青'],
  ['#d4ff40', '螢光綠'],
  ['#ffc861', '琥珀'],
  ['#eef4fb', '白'],
  ['#ff7bd5', '洋紅'],
];

/* ---------- 字型 ---------- */

/** 英文字型（共用字型目錄裡的 Google Fonts） */
export const SF_LATIN_FONTS = [
  'Orbitron',
  'Chakra Petch',
  'Rajdhani',
  'Michroma',
  'Share Tech Mono',
] as const;

/** 代碼、副文字等小字用的等寬字型 */
export const SF_MONO_FONT = 'Share Tech Mono';

export interface SfCjkFont {
  id: string;
  label: string;
  /** CSS 的字型名稱 */
  family: string;
  /** 本站附帶的字型（不是 Google Fonts） */
  bundled?: BundledFontId;
}

/** 中文字型：繁中可用的粗黑體與像素字型（原作是韓文、日文字型） */
export const SF_CJK_FONTS: readonly SfCjkFont[] = [
  { id: 'noto-sans-tc', label: '思源黑體', family: 'Noto Sans TC' },
  { id: 'chiron-hei', label: '昭源黑體', family: 'Chiron Hei HK' },
  { id: 'chocolate', label: '朱古力黑體', family: 'Chocolate Classical Sans' },
  { id: 'cubic-11', label: '俐方體 11 號（像素）', family: 'Cubic 11', bundled: 'cubic-11' },
  {
    id: 'fusion-pixel',
    label: '縫合像素體（像素）',
    family: 'Fusion Pixel 10px TC',
    bundled: 'fusion-pixel-10',
  },
];

export const sfCjkFont = (id: string | null | undefined): SfCjkFont =>
  SF_CJK_FONTS.find((f) => f.id === id) ?? SF_CJK_FONTS[0];

/** 範本用到的字重（小字 400；標題依範本 700、800、900） */
export const SF_WEIGHTS = [400, 700, 800, 900] as const;

/** 範本裡固定的英數字（給字型先載入） */
export const SF_FONT_SAMPLE =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 #%&*+-/<>=:;[]()._!?·';

/* ---------- 設定 ---------- */

export interface SfSettings {
  /** 範本（版面） */
  tpl: SfTemplateId;
  /** 代碼標籤（空＝依標題自動產生） */
  code: string;
  /** 編號（「索引」「括號框」顯示） */
  num: string;
  /** 主色、強調色 */
  main: string;
  accent: string;
  /** 英文字型（family） */
  latin: string;
  /** 中文字型（SF_CJK_FONTS 的 id） */
  cjk: string;
  /** 光暈、顆粒雜訊：0～10 */
  glow: number;
  grain: number;
  scan: boolean;
  glitch: boolean;
  /** 長度：2～8 秒（每 0.5 秒） */
  dur: number;
  /** WebP 品質：50～95（每 5） */
  webpQuality: number;
}

export const SF_LIMITS = {
  title: 40,
  sub: 60,
  code: 24,
  num: 4,
} as const;

export const SF_DEFAULT_TEXT = '異常訊號';
export const SF_DEFAULT_SUB = '第 13 區・觀測站回報';

export function sfDefaults(): SfSettings {
  return {
    tpl: 'reticle',
    code: '',
    num: '13',
    main: SF_MAIN_SWATCHES[0][0],
    accent: SF_ACCENT_SWATCHES[0][0],
    latin: 'Orbitron',
    cjk: 'noto-sans-tc',
    glow: 4,
    grain: 2,
    scan: false,
    glitch: true,
    dur: 4,
    webpQuality: 80,
  };
}

/** SF 標題的 fps 選項（原作 10～24） */
export const SF_FPS_CHOICES = [10, 12, 15, 20, 24] as const;
export const SF_FPS_DEFAULT = 15;

const HEX = /^#[0-9a-f]{6}$/i;
const cut = (v: unknown, n: number) =>
  Array.from(typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ') : '')
    .slice(0, n)
    .join('');
const num = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/** 存檔、範本檔裡的 SF 設定 → 合法的值（缺的欄位用預設） */
export function normalizeSf(raw: unknown): SfSettings {
  const d = sfDefaults();
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<
    Record<keyof SfSettings, unknown>
  >;
  return {
    tpl: SF_TEMPLATE_IDS.includes(r.tpl as SfTemplateId) ? (r.tpl as SfTemplateId) : d.tpl,
    code: cut(r.code, SF_LIMITS.code),
    num: typeof r.num === 'string' ? cut(r.num, SF_LIMITS.num) : d.num,
    main: typeof r.main === 'string' && HEX.test(r.main) ? r.main.toLowerCase() : d.main,
    accent: typeof r.accent === 'string' && HEX.test(r.accent) ? r.accent.toLowerCase() : d.accent,
    latin: (SF_LATIN_FONTS as readonly string[]).includes(r.latin as string)
      ? (r.latin as string)
      : d.latin,
    cjk: SF_CJK_FONTS.some((f) => f.id === r.cjk) ? (r.cjk as string) : d.cjk,
    glow: clamp(Math.round(num(r.glow, d.glow)), 0, 10),
    grain: clamp(Math.round(num(r.grain, d.grain)), 0, 10),
    scan: typeof r.scan === 'boolean' ? r.scan : d.scan,
    glitch: typeof r.glitch === 'boolean' ? r.glitch : d.glitch,
    dur: clamp(Math.round(num(r.dur, d.dur) * 2) / 2, 2, 8),
    webpQuality: clamp(Math.round(num(r.webpQuality, d.webpQuality) / 5) * 5, 50, 95),
  };
}

/** 設定裡的 SF 部分（不是 SF 模式、或缺的時候是預設） */
export const sfOf = (cfg: Pick<Settings, 'sf'>): SfSettings => cfg.sf ?? sfDefaults();

/* ---------- 代碼與解碼 ---------- */

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** 代碼留空時：依標題雜湊產生，例如「KQ-3F9A·42」（同一個標題永遠相同） */
export function sfAutoCode(title: string): string {
  const h = seedOf(String(title ?? '').trim() || 'SF') >>> 0;
  const a = CODE_LETTERS[h % 24];
  const b = CODE_LETTERS[(h >>> 5) % 24];
  const hex = ((h >>> 10) & 0xffff).toString(16).toUpperCase().padStart(4, '0');
  return `${a}${b}-${hex}·${String(h % 100).padStart(2, '0')}`;
}

export const sfCodeOf = (cfg: Pick<Settings, 'text' | 'sf'>): string =>
  sfOf(cfg).code.trim() || sfAutoCode(cfg.text);

/** 解碼時還沒定下來的字用的亂碼 */
export const SF_SCRAMBLE = 'ABCDEFGHKLMNPRSTUVXYZ0123456789#%&*+<>/=';

/**
 * 解碼字串：進度 p（0～1）之前的字已經定下來，後面最多 4 個字顯示亂碼（空白照留），每秒換 24 次；
 * p ≥ 1 時是原文，p ≤ 0 時是空字串。同一組（字串、進度、時間）結果永遠相同。
 */
export function sfDecode(str: string, p: number, t: number, tail = 4): string {
  if (p >= 1) return str;
  if (p <= 0) return '';
  const chars = Array.from(str);
  const shown = Math.floor(p * chars.length);
  const slot = timeSlot(t, 24);
  let out = chars.slice(0, shown).join('');
  for (let i = shown; i < Math.min(chars.length, shown + tail); i++) {
    out +=
      chars[i] === ' '
        ? ' '
        : SF_SCRAMBLE[Math.floor(hashUnit(i, slot, 0x5f) * SF_SCRAMBLE.length)];
  }
  return out;
}

/* ---------- 時間軸 ---------- */

export interface SfTiming {
  /** 總長（循環一次） */
  D: number;
  /** 登場長度（0＝沒有登場） */
  Ti: number;
  /** 退場長度（0＝沒有退場） */
  To: number;
  introOn: boolean;
  outroOn: boolean;
}

/** 登場＝min(1.6, 0.45 × 長度)、退場＝最後 0.4 秒；停留＝中間 */
export function sfTiming(cfg: Pick<Settings, 'introOn' | 'outroOn' | 'sf'>): SfTiming {
  const D = clamp(sfOf(cfg).dur, 2, 8);
  const introOn = cfg.introOn !== false;
  const outroOn = !!cfg.outroOn;
  return { D, Ti: introOn ? Math.min(1.6, D * 0.45) : 0, To: outroOn ? 0.4 : 0, introOn, outroOn };
}

export interface SfPhase {
  /** 登場進度、退場進度（0～1） */
  ip: number;
  op: number;
}

export function sfPhase(tm: SfTiming, t: number): SfPhase {
  return {
    ip: tm.Ti > 0 ? clamp01(t / tm.Ti) : 1,
    op: tm.To > 0 ? clamp01((t - (tm.D - tm.To)) / tm.To) : 0,
  };
}

/** 範本裡一段動作的進度：登場進度在 a～b 之間時 0→1（緩停） */
export const sfSeg = (ip: number, a: number, b: number): number =>
  EASE.out(clamp01((ip - a) / (b - a)));

/** 一個循環裡轉 n 圈的相位（0～1），循環接回去時無縫 */
export const sfCycle = (t: number, D: number, n: number): number => {
  const v = ((t / D) * n) % 1;
  return v < 0 ? v + 1 : v;
};

/** 退場時整體的不透明度：淡出，同時每 1/30 秒有機會暗一下 */
export function sfAlpha(op: number, t: number): number {
  if (op <= 0) return 1;
  return (1 - op) * (hashUnit(timeSlot(t, 30), 3, 0x51) > 0.35 ? 1 : 0.35);
}

/**
 * 故障（水平切片錯位）的強度：登場剛開始最強、登場一半時閃一下、停留中每個循環偶爾一下、退場越來越強。
 */
export function sfGlitchAmount(tm: SfTiming, ph: SfPhase, t: number): number {
  let g = 0;
  if (ph.ip < 1) {
    if (ph.ip < 0.12) g = 1 - ph.ip / 0.12;
    else if (ph.ip > 0.5 && ph.ip < 0.56) g = 0.55;
  }
  if (ph.op > 0) g = Math.max(g, ph.op);
  const c = sfCycle(t, tm.D, 1);
  if (ph.ip >= 1 && ph.op === 0 && c > 0.62 && c < 0.655) g = 0.45;
  return g;
}

/* ---------- 播放方式（對應到既有的登場、退場開關與循環） ---------- */

export type SfPlay = 'full' | 'once' | 'idle';

export interface SfPlayInfo {
  id: SfPlay;
  label: string;
  note: string;
  introOn: boolean;
  outroOn: boolean;
  loop: LoopMode;
}

export const SF_PLAYS: readonly SfPlayInfo[] = [
  {
    id: 'full',
    label: '登場→退場循環',
    note: '登場、停留、退場之後從頭再來（無限循環）。',
    introOn: true,
    outroOn: true,
    loop: 'infinite',
  },
  {
    id: 'once',
    label: '登場一次後停住',
    note: '登場之後播停留動作，最後停在最後一格（播放 1 次）。',
    introOn: true,
    outroOn: false,
    loop: 'once',
  },
  {
    id: 'idle',
    label: '只有停留動作',
    note: '沒有登場與退場，停留中的小動作無縫循環。',
    introOn: false,
    outroOn: false,
    loop: 'infinite',
  },
];

/** 目前的登場、退場開關與循環是哪一種播放方式（其他組合是 null＝自訂） */
export function sfPlayOf(cfg: Pick<Settings, 'introOn' | 'outroOn' | 'loop'>): SfPlay | null {
  const intro = cfg.introOn !== false;
  return (
    SF_PLAYS.find((p) => p.introOn === intro && p.outroOn === !!cfg.outroOn && p.loop === cfg.loop)
      ?.id ?? null
  );
}

/* ---------- 尺寸 ---------- */

/** 比例（原作的 3:1、2:1、16:9） */
export const SF_RATIOS: readonly (readonly [string, string, number])[] = [
  ['3:1', '3:1', 3],
  ['2:1', '2:1', 2],
  ['16:9', '16:9', 1.7778],
];

export const SF_WIDTHS = [640, 800, 960, 1200] as const;

/** 寬 → 高：寬 ÷ 比例，取最接近的偶數（例：800 × 3:1 → 266、1200 × 16:9 → 674） */
export const sfHeight = (w: number, ratio: number): number => Math.round(w / ratio / 2) * 2;

/** 畫面尺寸對應到哪個比例與寬度（自訂的尺寸 null） */
export function sfSizeOf(W: number, H: number): { ratio: string; width: number } | null {
  if (!(SF_WIDTHS as readonly number[]).includes(W)) return null;
  const r = SF_RATIOS.find(([, , v]) => sfHeight(W, v) === H);
  return r ? { ratio: r[0], width: W } : null;
}

/** 設計空間（範本都畫在這個範圍裡） */
export const SF_DESIGN = { w: 1200, h: 400 } as const;

/** 設計空間 → 輸出畫面：等比縮放、置中 */
export function sfFit(W: number, H: number): { s: number; ox: number; oy: number } {
  const s = Math.min(W / SF_DESIGN.w, H / SF_DESIGN.h);
  return { s, ox: (W - SF_DESIGN.w * s) / 2, oy: (H - SF_DESIGN.h * s) / 2 };
}
