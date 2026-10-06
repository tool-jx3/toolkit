/**
 * 設定的型別、預設值、選項與正規化（規格 1、4）。不依賴 React 與瀏覽器。
 */

export const TOOL_ID = 'music-frame';

/** 輸出的畫面尺寸（規格 3.1） */
export const FRAME_W = 1920;
export const FRAME_H = 1080;

export type LayoutId = 'split' | 'center' | 'vinyl';
export type BackgroundId = 'blur' | 'gradient' | 'solid';
export type MoodId = 'auto' | 'dark' | 'light';
export type FontId = 'sans' | 'serif' | 'latin' | 'pixel' | 'hand' | 'mono';
export type DecoId = 'none' | 'line' | 'cyber';
export type VizId = 'bars' | 'wave' | 'peaks' | 'none';
export type LyricPosition = 'bottom' | 'stack';
export type RangeMode = 'all' | 'part';
export type VideoFps = 30 | 60;

export const LAYOUTS: readonly LayoutId[] = ['split', 'center', 'vinyl'];
export const BACKGROUNDS: readonly BackgroundId[] = ['blur', 'gradient', 'solid'];
export const MOODS: readonly MoodId[] = ['auto', 'dark', 'light'];
export const FONTS: readonly FontId[] = ['sans', 'serif', 'latin', 'pixel', 'hand', 'mono'];
export const DECOS: readonly DecoId[] = ['none', 'line', 'cyber'];
export const VIZ: readonly VizId[] = ['bars', 'wave', 'peaks', 'none'];
export const FPS_CHOICES: readonly VideoFps[] = [30, 60];

/** 數值的範圍（規格 1） */
export const RANGES = {
  radius: { min: 0, max: 48, step: 1 },
  lyricSize: { min: 28, max: 72, step: 2 },
  lyricOffset: { min: -3, max: 3, step: 0.1 },
  loopLength: { min: 4, max: 20, step: 1 },
} as const;

export interface LyricSettings {
  /** 顯示歌詞 */
  enabled: boolean;
  /** 歌詞文字欄的內容（LRC／SRT／VTT／純文字） */
  text: string;
  /** 位置（中央版面一律在曲目資訊下方） */
  position: LyricPosition;
  /** 大小（px，28～72） */
  size: number;
  /** 預告下一行 */
  showNext: boolean;
  /** 時間偏移（秒，正值＝晚一點出現） */
  offset: number;
  /** 讀進來的歌詞檔名（顯示用） */
  fileName: string;
}

export interface MediaRef {
  /** 資產庫的 id（沒有時 null） */
  id: string | null;
  /** 原本的檔名（顯示、輸出檔名不用） */
  name: string;
}

export interface ExportSettings {
  /** 沒有音樂時的循環長度（秒，4～20） */
  loopLength: number;
  /** 有音樂時的範圍 */
  range: RangeMode;
  /** 指定區間的開始、結束（秒） */
  start: number;
  end: number;
  fps: VideoFps;
  /** 即時錄影時喇叭靜音 */
  mute: boolean;
}

export interface Settings {
  title: string;
  artist: string;
  subtitle: string;
  layout: LayoutId;
  background: BackgroundId;
  mood: MoodId;
  font: FontId;
  /** 封面圓角（以 640 px 的封面計，0～48） */
  radius: number;
  /** 重點色從封面自動抽 */
  accentAuto: boolean;
  /** 手動的重點色（#rrggbb） */
  accent: string;
  deco: DecoId;
  /** 科技風的角落文字 */
  hud: boolean;
  /** 左下角的文字（hudTextAuto 時跟著 FPS） */
  hudText: string;
  hudTextAuto: boolean;
  /** 科技風的掃描線 */
  scanlines: boolean;
  viz: VizId;
  /** 進度條與時間 */
  progress: boolean;
  /** 封面漂浮（以及背景、黑膠、掃描光的動態） */
  motion: boolean;
  /** 隨節拍的封面動態（有音樂時） */
  react: boolean;
  /** 底片顆粒 */
  grain: boolean;
  /** 沒有音樂時畫面上的曲長（秒） */
  fakeDuration: number;
  /** 沒有音樂時的進度位置（0～1） */
  fakePosition: number;
  lyrics: LyricSettings;
  cover: MediaRef;
  audio: MediaRef;
  export: ExportSettings;
}

/** 預設的曲目資訊（本站自己寫的示範文字） */
export const DEFAULT_TEXT = {
  title: '星夜下的酒館',
  artist: '吟遊詩人樂團',
};

export function defaultSettings(): Settings {
  return {
    title: DEFAULT_TEXT.title,
    artist: DEFAULT_TEXT.artist,
    subtitle: '',
    layout: 'split',
    background: 'blur',
    mood: 'auto',
    font: 'sans',
    radius: 18,
    accentAuto: true,
    accent: '#c9973a',
    deco: 'cyber',
    hud: true,
    hudText: '',
    hudTextAuto: true,
    scanlines: false,
    viz: 'bars',
    progress: true,
    motion: true,
    react: true,
    grain: true,
    fakeDuration: 663,
    fakePosition: 328 / 663,
    lyrics: {
      enabled: false,
      text: '',
      position: 'bottom',
      size: 32,
      showNext: true,
      offset: 0,
      fileName: '',
    },
    cover: { id: null, name: '' },
    audio: { id: null, name: '' },
    export: { loopLength: 8, range: 'all', start: 0, end: 30, fps: 30, mute: false },
  };
}

/** 左下角文字的自動值（跟著 FPS） */
export const autoHudText = (fps: number) => `${fps} FPS`;

/** 畫面上實際的左下角文字 */
export const hudTextOf = (s: Pick<Settings, 'hudText' | 'hudTextAuto' | 'export'>) =>
  s.hudTextAuto ? autoHudText(s.export.fps) : s.hudText;

/** 中央版面的歌詞一律在曲目資訊下方 */
export const lyricPositionOf = (s: Pick<Settings, 'layout' | 'lyrics'>): LyricPosition =>
  s.layout === 'center' ? 'stack' : s.lyrics.position;

/* ---------- 時間的寫法 ---------- */

/** 秒 → 「分:秒」（無條件捨去到秒） */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * 「分:秒」「時:分:秒」或秒數 → 秒；看不懂時 NaN。分、秒可以有小數，全形數字與冒號也接受。
 */
export function parseClock(input: string): number {
  const str = String(input ?? '')
    .trim()
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[：]/g, ':')
    .replace(/[．]/g, '.');
  if (!str) return Number.NaN;
  if (!/^[\d.:]+$/.test(str)) return Number.NaN;
  const parts = str.split(':');
  if (parts.length > 3 || parts.some((p) => p === '' || !/^\d*\.?\d*$/.test(p))) return Number.NaN;
  return parts.reduce((t, p) => t * 60 + Number.parseFloat(p), 0);
}

/** 科技風右上角的時間碼「時:分:秒:格」（每秒 30 格） */
export function timecode(seconds: number): string {
  const s = Math.max(0, seconds || 0);
  const f = Math.floor((s % 1) * 30);
  const x = Math.floor(s);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(x / 3600))}:${p(Math.floor(x / 60) % 60)}:${p(x % 60)}:${p(f)}`;
}

/* ---------- 正規化（自動存檔與專案檔讀回時） ---------- */

const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;
const num = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const str = (v: unknown, fallback: string, max = 2000) =>
  typeof v === 'string' ? v.slice(0, max) : fallback;
const hex = (v: unknown, fallback: string) =>
  typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback;
const media = (v: unknown): MediaRef => {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<MediaRef>;
  return {
    id: typeof o.id === 'string' && o.id ? o.id : null,
    name: str(o.name, '', 300),
  };
};
const snap = (v: number, step: number, min: number) =>
  Math.round(Math.round((v - min) / step) * step * 1000) / 1000 + min;

/** 把任何值修成合法的設定（缺的欄位補預設值） */
export function normalizeSettings(raw: unknown): Settings {
  const d = defaultSettings();
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const ly = (r.lyrics && typeof r.lyrics === 'object' ? r.lyrics : {}) as Record<string, unknown>;
  const ex = (r.export && typeof r.export === 'object' ? r.export : {}) as Record<string, unknown>;
  const start = num(ex.start, 0, 86400, d.export.start);
  return {
    title: str(r.title, d.title, 300),
    artist: str(r.artist, d.artist, 300),
    subtitle: str(r.subtitle, d.subtitle, 300),
    layout: pick(LAYOUTS, r.layout, d.layout),
    background: pick(BACKGROUNDS, r.background, d.background),
    mood: pick(MOODS, r.mood, d.mood),
    font: pick(FONTS, r.font, d.font),
    radius: Math.round(num(r.radius, RANGES.radius.min, RANGES.radius.max, d.radius)),
    accentAuto: bool(r.accentAuto, d.accentAuto),
    accent: hex(r.accent, d.accent),
    deco: pick(DECOS, r.deco, d.deco),
    hud: bool(r.hud, d.hud),
    hudText: str(r.hudText, d.hudText, 100),
    hudTextAuto: bool(r.hudTextAuto, d.hudTextAuto),
    scanlines: bool(r.scanlines, d.scanlines),
    viz: pick(VIZ, r.viz, d.viz),
    progress: bool(r.progress, d.progress),
    motion: bool(r.motion, d.motion),
    react: bool(r.react, d.react),
    grain: bool(r.grain, d.grain),
    fakeDuration: num(r.fakeDuration, 1, 359999, d.fakeDuration),
    fakePosition: num(r.fakePosition, 0, 1, d.fakePosition),
    lyrics: {
      enabled: bool(ly.enabled, d.lyrics.enabled),
      text: str(ly.text, d.lyrics.text, 200_000),
      position: pick(['bottom', 'stack'] as const, ly.position, d.lyrics.position),
      size: snap(
        num(ly.size, RANGES.lyricSize.min, RANGES.lyricSize.max, d.lyrics.size),
        RANGES.lyricSize.step,
        RANGES.lyricSize.min,
      ),
      showNext: bool(ly.showNext, d.lyrics.showNext),
      offset: snap(
        num(ly.offset, RANGES.lyricOffset.min, RANGES.lyricOffset.max, d.lyrics.offset),
        RANGES.lyricOffset.step,
        RANGES.lyricOffset.min,
      ),
      fileName: str(ly.fileName, '', 300),
    },
    cover: media(r.cover),
    audio: media(r.audio),
    export: {
      loopLength: Math.round(
        num(ex.loopLength, RANGES.loopLength.min, RANGES.loopLength.max, d.export.loopLength),
      ),
      range: pick(['all', 'part'] as const, ex.range, d.export.range),
      start,
      end: num(ex.end, 0, 86400, d.export.end),
      fps: ex.fps === 60 ? 60 : 30,
      mute: bool(ex.mute, d.export.mute),
    },
  };
}

/** 輸出檔名的主體：「標題 - 歌手」（不能用在檔名的字拿掉、最多 80 字；都空白時「播放畫面」） */
export function fileBase(s: Pick<Settings, 'title' | 'artist'>): string {
  const raw = (s.title.trim() || '播放畫面') + (s.artist.trim() ? ` - ${s.artist.trim()}` : '');
  return (
    raw
      // biome-ignore lint/suspicious/noControlCharactersInRegex: 檔名不能有控制字元
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
      .trim()
      .slice(0, 80)
      .trim() || '播放畫面'
  );
}

/** 有音樂時匯出的範圍（秒）；區間不到 1 秒時 null */
export function exportRange(
  s: Pick<Settings, 'export'>,
  duration: number,
): { start: number; end: number } | null {
  let start = 0;
  let end = duration;
  if (s.export.range === 'part') {
    start = Math.min(duration, Math.max(0, s.export.start));
    end = Math.min(duration, Math.max(0, s.export.end));
  }
  return end - start >= 1 ? { start, end } : null;
}
