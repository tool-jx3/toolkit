/**
 * 設定的型別、預設值、選項與正規化（規格 1、3.10）。不依賴 React 與瀏覽器。
 */
import {
  DEFAULT_CREDIT_WORDS,
  DEFAULT_FILTERS,
  DEFAULT_LYRIC_STYLE,
  getLyricStyle,
  type LineFilters,
  type LineOverride,
  LYRIC_STYLES,
  type LyricLanguage,
  type LyricRegion,
  normalizeLineAdjust,
  normalizeRegion,
} from '@/core/lyricfx';
import { SAMPLE_LYRICS } from './sample';

export const TOOL_ID = 'lyric-fx';
/**
 * 存檔與專案檔的版本（規格 3.10）。
 * 2：避開區域從「散落」的設定（styles.scatter.region）搬到工具層（region）；預設的關鍵字改版（資訊行要冒號、單獨一行的 Inst）。
 * 3：逐句的手動調整（overrides.<鍵>.adjust：位置、角度、顏色、大小、透明度、字型；F75～F81）。版本 1、2 照常讀（沒有 adjust）。
 */
export const PROJECT_VERSION = 3;
/** 預設的種子 */
export const DEFAULT_SEED = 20261021;

export type SizeId = '1920x1080' | '1280x720' | '1440x1080' | '1080x1080' | '1080x1920';
export const SIZES: readonly SizeId[] = [
  '1920x1080',
  '1280x720',
  '1440x1080',
  '1080x1080',
  '1080x1920',
];
export const sizeOf = (id: SizeId): { width: number; height: number } => {
  const [w, h] = id.split('x').map(Number);
  return { width: w, height: h };
};

export type BackgroundKind = 'transparent' | 'color' | 'image';
export type BackgroundFit = 'cover' | 'contain';
export type RangeMode = 'all' | 'part';
export type VideoFps = 24 | 30 | 60;
export const FPS_CHOICES: readonly VideoFps[] = [24, 30, 60];

export interface MediaRef {
  id: string | null;
  name: string;
}

export interface Settings {
  lyrics: {
    text: string;
    /** 讀進來的歌詞檔名 */
    fileName: string;
    /** 演出延遲（秒） */
    offset: number;
  };
  language: LyricLanguage;
  filters: LineFilters;
  /** 逐句調整（鍵 → 覆寫） */
  overrides: Record<string, LineOverride>;
  styleId: string;
  /** 每個風格的設定（換風格時保留） */
  styles: Record<string, unknown>;
  /** 避開區域（畫面的 0～1；null＝沒有）：工具層的共用設定，plan 的 options.region 交給風格 */
  region: LyricRegion | null;
  seed: number;
  canvas: { size: SizeId };
  background: { kind: BackgroundKind; color: string; image: MediaRef; fit: BackgroundFit };
  audio: MediaRef;
  export: {
    fps: VideoFps;
    range: RangeMode;
    start: number;
    end: number;
    /** 透明 WebM 含音樂 */
    webmAudio: boolean;
  };
}

export const RANGES = {
  offset: { min: -10, max: 10, step: 0.1 },
} as const;

export function defaultSettings(): Settings {
  return {
    lyrics: { text: SAMPLE_LYRICS, fileName: '', offset: 0 },
    language: 'original',
    filters: { ...DEFAULT_FILTERS },
    overrides: {},
    styleId: DEFAULT_LYRIC_STYLE,
    styles: Object.fromEntries(LYRIC_STYLES.map((s) => [s.id, s.defaults()])),
    region: null,
    seed: DEFAULT_SEED,
    canvas: { size: '1920x1080' },
    background: {
      kind: 'transparent',
      color: '#000000',
      image: { id: null, name: '' },
      fit: 'cover',
    },
    audio: { id: null, name: '' },
    export: { fps: 30, range: 'all', start: 0, end: 30, webmAudio: true },
  };
}

/* ---------- 正規化 ---------- */

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const str = (v: unknown, fallback: string, max = 200_000) =>
  typeof v === 'string' ? v.slice(0, max) : fallback;
const num = (v: unknown, fallback: number, min = -Infinity, max = Infinity) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const oneOf = <T>(v: unknown, list: readonly T[], fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;
const HEX = /^#[0-9a-f]{6}$/i;
const media = (v: unknown): MediaRef => {
  const o = obj(v);
  const id = typeof o.id === 'string' && o.id ? o.id : null;
  return { id, name: id ? str(o.name, '', 500) : '' };
};

function normalizeOverride(v: unknown): LineOverride | null {
  const o = obj(v);
  const out: LineOverride = {};
  if (typeof o.text === 'string') out.text = o.text.slice(0, 2000);
  if (typeof o.tr === 'string') out.tr = o.tr.slice(0, 2000);
  if (typeof o.t === 'number' && Number.isFinite(o.t) && o.t >= 0) out.t = Math.min(359999, o.t);
  if (typeof o.reroll === 'number' && Number.isFinite(o.reroll) && o.reroll > 0)
    out.reroll = Math.min(1_000_000, Math.floor(o.reroll));
  if (o.lock && typeof o.lock === 'object') out.lock = o.lock;
  const adjust = normalizeLineAdjust(o.adjust);
  if (adjust) out.adjust = adjust;
  return Object.keys(out).length ? out : null;
}

/** 以前的預設關鍵字（存檔裡還是其中一份、沒有改過時換成新的預設） */
const V1_CREDIT_WORDS = [
  '作詞',
  '作词',
  '作曲',
  '編曲',
  '编曲',
  '製作人',
  '制作人',
  '監製',
  '监制',
  '原唱',
  '翻唱',
  '混音',
  '錄音',
  '录音',
  '和聲',
  '和声',
  '統籌',
  '统筹',
  '企劃',
  '企划',
  '出品',
  '封面',
  '詞:',
  '词:',
  '曲:',
  '吉他:',
  '貝斯:',
  '贝斯:',
  '鼓:',
  '鍵盤:',
  '键盘:',
  '弦樂:',
  '弦乐:',
  'op:',
  'sp:',
  'program',
  'produced by',
  'written by',
  'composed by',
  'arranged by',
  'mixed by',
  'mastered by',
  'lyrics by',
  'music by',
].join('\n');
const V1_INST_WORDS = [
  '(inst',
  '[inst',
  '【inst',
  'instrumental',
  '純音樂',
  '纯音乐',
  '伴奏',
  'off vocal',
  'カラオケ',
  'karaoke',
].join('\n');

/** 版本 2 第一版的預設（還沒有 programming:） */
const V2A_CREDIT_WORDS = DEFAULT_CREDIT_WORDS.filter((w) => w !== 'programming:').join('\n');

const words = (v: unknown, legacy: readonly string[], fallback: string) => {
  const text = str(v, fallback, 20_000);
  return legacy.includes(text) ? fallback : text;
};

/** 避開區域：版本 2 在 region；版本 1 在風格的設定裡（styles.<id>.region，目前的風格優先） */
function regionOf(o: Record<string, unknown>, styleId: string): LyricRegion | null {
  if ('region' in o) return normalizeRegion(o.region);
  const styles = obj(o.styles);
  const ids = [styleId, ...Object.keys(styles).filter((k) => k !== styleId)];
  for (const id of ids) {
    const r = normalizeRegion(obj(styles[id]).region);
    if (r) return r;
  }
  return null;
}

export function normalizeSettings(raw: unknown): Settings {
  const d = defaultSettings();
  const o = obj(raw);
  const ly = obj(o.lyrics);
  const fl = obj(o.filters);
  const bg = obj(o.background);
  const ex = obj(o.export);
  const overrides: Record<string, LineOverride> = {};
  for (const [k, v] of Object.entries(obj(o.overrides))) {
    const n = normalizeOverride(v);
    if (n && k.length <= 4000) overrides[k] = n;
  }
  const styles: Record<string, unknown> = {};
  const rawStyles = obj(o.styles);
  for (const s of LYRIC_STYLES) styles[s.id] = s.normalize(rawStyles[s.id]);
  const styleId = getLyricStyle(typeof o.styleId === 'string' ? o.styleId : null).id;
  return {
    lyrics: {
      text: str(ly.text, d.lyrics.text),
      fileName: str(ly.fileName, '', 500),
      offset: Math.round(num(ly.offset, 0, RANGES.offset.min, RANGES.offset.max) * 10) / 10,
    },
    language: oneOf(o.language, ['original', 'translation', 'both'] as const, d.language),
    filters: {
      credits: typeof fl.credits === 'boolean' ? fl.credits : d.filters.credits,
      creditWords: words(
        fl.creditWords,
        [V1_CREDIT_WORDS, V2A_CREDIT_WORDS],
        d.filters.creditWords,
      ),
      inst: typeof fl.inst === 'boolean' ? fl.inst : d.filters.inst,
      instWords: words(fl.instWords, [V1_INST_WORDS], d.filters.instWords),
    },
    overrides,
    styleId,
    styles,
    region: regionOf(o, styleId),
    seed: Math.floor(num(o.seed, d.seed, 0, 4294967295)) >>> 0,
    canvas: { size: oneOf(obj(o.canvas).size, SIZES, d.canvas.size) },
    background: {
      kind: oneOf(bg.kind, ['transparent', 'color', 'image'] as const, d.background.kind),
      color:
        typeof bg.color === 'string' && HEX.test(bg.color)
          ? bg.color.toLowerCase()
          : d.background.color,
      image: media(bg.image),
      fit: oneOf(bg.fit, ['cover', 'contain'] as const, d.background.fit),
    },
    audio: media(o.audio),
    export: {
      fps: oneOf(ex.fps, FPS_CHOICES, d.export.fps),
      range: oneOf(ex.range, ['all', 'part'] as const, d.export.range),
      start: num(ex.start, 0, 0, 359999),
      end: num(ex.end, 30, 0, 359999),
      webmAudio: typeof ex.webmAudio === 'boolean' ? ex.webmAudio : d.export.webmAudio,
    },
  };
}

/* ---------- 時間的寫法 ---------- */

/** 分:秒（整秒；播放列） */
export function formatClock(t: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(t) ? t : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** 分:秒.百分秒（逐句清單、匯出區間） */
export function formatLyricTime(t: number): string {
  const cs = Math.max(0, Math.round((Number.isFinite(t) ? t : 0) * 100));
  const m = Math.floor(cs / 6000);
  const s = (cs % 6000) / 100;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

/** 「分:秒.百分秒」「分:秒」「秒」「時:分:秒」→ 秒；看不懂＝NaN（全形數字可以） */
export function parseLyricTime(text: string): number {
  const s = String(text ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/[：]/g, ':');
  if (!s) return Number.NaN;
  if (/^\d+(?:\.\d+)?$/.test(s)) return Number.parseFloat(s);
  const m = /^(?:(\d+):)?(\d+):(\d{1,2}(?:\.\d+)?)$/.exec(s);
  if (!m) return Number.NaN;
  const sec = Number.parseFloat(m[3]);
  if (sec >= 60) return Number.NaN;
  return (m[1] ? Number.parseInt(m[1], 10) * 3600 : 0) + Number.parseInt(m[2], 10) * 60 + sec;
}

/** 檔名的主要部分：音樂檔名 → 歌詞檔名 → lyric-fx（去掉副檔名） */
export function fileBase(s: Settings): string {
  const name = s.audio.name || s.lyrics.fileName;
  const base = name.replace(/\.[^.]+$/, '').trim();
  return base || TOOL_ID;
}

/** 匯出的範圍（秒）；有音樂、指定區間不到 1 秒時 null */
export function exportRange(s: Settings, duration: number): { start: number; end: number } | null {
  if (s.export.range === 'all') return duration >= 1 ? { start: 0, end: duration } : null;
  const start = Math.min(duration, Math.max(0, s.export.start));
  const end = Math.min(duration, Math.max(0, s.export.end));
  return end - start >= 1 ? { start, end } : null;
}

/** 沒有音樂時的長度：最後一句完整出現再 3 秒、至少 5 秒 */
export const loopLengthFor = (settledAt: number): number =>
  Math.max(5, Math.ceil((settledAt + 3) * 10) / 10);
