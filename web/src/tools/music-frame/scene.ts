/**
 * 組出一格要畫的東西（Scene）：設定、封面、配色、解析好的歌詞、音樂的長度與波形。
 * 歌詞的解析與配色有快取（文字或封面、明暗、重點色沒變時沿用）。
 * 另外放預覽與匯出共用的狀態：預覽目前的時間、預覽的長條（PNG 用）、預覽畫布（即時錄影用）。
 */
import { hasTranslation, type ParsedLyrics, parseLyrics } from '@/core/lyrics';
import type { Settings } from './model';
import type { CoverArt, FrameClock, Scene } from './render';
import type { LoadedAudio } from './store';
import { computeTheme, type Palette, type Theme } from './theme';
import { createVizState } from './viz';

let lyricKey: string | null = null;
let lyricValue: { parsed: ParsedLyrics; translated: boolean } | null = null;

/** 解析歌詞（同樣的文字沿用上一次的結果） */
export function parsedLyrics(text: string): { parsed: ParsedLyrics; translated: boolean } {
  if (lyricKey === text && lyricValue) return lyricValue;
  const parsed = parseLyrics(text);
  lyricKey = text;
  lyricValue = { parsed, translated: hasTranslation(parsed.lines) };
  return lyricValue;
}

let themeKey: { palette: Palette; mood: string; auto: boolean; accent: string } | null = null;
let themeValue: Theme | null = null;

export function themeFor(s: Settings, palette: Palette): Theme {
  const k = themeKey;
  if (
    k &&
    themeValue &&
    k.palette === palette &&
    k.mood === s.mood &&
    k.auto === s.accentAuto &&
    k.accent === s.accent
  )
    return themeValue;
  themeKey = { palette, mood: s.mood, auto: s.accentAuto, accent: s.accent };
  themeValue = computeTheme(palette, { mood: s.mood, accentAuto: s.accentAuto, accent: s.accent });
  return themeValue;
}

export function buildScene(s: Settings, art: CoverArt, audio: LoadedAudio | null): Scene {
  const ly = parsedLyrics(s.lyrics.text);
  return {
    settings: s,
    art,
    theme: themeFor(s, art.palette),
    lyrics: { lines: ly.parsed.lines, translated: ly.translated },
    audio: audio ? { duration: audio.duration, peaks: audio.peaks } : null,
  };
}

/* ---------- 預覽與匯出共用 ---------- */

/** 預覽的長條與低頻能量（PNG 照預覽目前的樣子畫） */
export const liveViz = createVizState();

export interface PreviewBridge {
  canvas: HTMLCanvasElement | null;
  /** 預覽目前這一格的時間 */
  clock(): FrameClock;
  /** 沒有音樂時：循環預覽回到 0 並播放（即時錄影開始時） */
  restartLoop(): void;
}

let bridge: PreviewBridge | null = null;
export const registerPreview = (b: PreviewBridge | null) => {
  bridge = b;
};
export const previewBridge = () => bridge;
