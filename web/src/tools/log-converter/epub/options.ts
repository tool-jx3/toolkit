/**
 * EPUB 電子書的輸入型別與輕量的整理函式（規格 F104～F112）：介面在轉換、選字型檔時就要用，
 * 所以和產生 EPUB 的程式（book.ts，下載時才載入、主要在 Worker 裡跑）分開，頁面不必一開始就載入整套。
 */
import type { LogEntry } from '../classify';
import type { IllustrationAlign, IllustrationSize, RenderOptions } from '../render/common';
import {
  type ChatMode,
  EPUB_CHAPTER_SIZE_MAX,
  EPUB_CHAPTER_SIZE_MIN,
  type EpubChapterMode,
  type EpubFont,
  type EpubNameColor,
  type EpubWriting,
  type LcSettings,
  type SubNarratorStyle,
} from '../settings';
import { OUT } from '../strings';

/* ---------- 輸入 ---------- */

export type EpubImageMime = 'image/jpeg' | 'image/png' | 'image/gif';

export interface EpubImage {
  bytes: Uint8Array;
  mime: EpubImageMime;
}

export type EpubFontFormat = 'ttf' | 'otf' | 'woff' | 'woff2';

export interface EpubFontFile {
  bytes: Uint8Array;
  format: EpubFontFormat;
}

/** 放進電子書的插圖（只有上傳的；網址插圖不放） */
export interface EpubIllustration {
  /** 插在第幾則之後（全域訊息序號） */
  position: number;
  /** images 的索引 */
  image: number;
  size: IllustrationSize;
  align: IllustrationAlign;
}

/** 圖片與字型（主執行緒先轉好格式） */
export interface EpubMedia {
  images: EpubImage[];
  illustrations: EpubIllustration[];
  cover: EpubImage | null;
  fontFile: EpubFontFile | null;
}

/** EPUB 的設定（F105～F110），取自工具的設定 */
export interface EpubSettings {
  author: string;
  chapters: EpubChapterMode;
  /** 標記文字（已去頭尾空白、略過空行） */
  markers: string[];
  chapterSize: number;
  writing: EpubWriting;
  font: EpubFont;
  nameColor: EpubNameColor;
}

/** 產生一本電子書需要的全部資料（可以整份傳進 Worker：沒有函式、Set 換成陣列） */
export interface EpubInput {
  title: string;
  subtitle: string;
  summary: string;
  author: string;
  /** 分類、合併後的所有「則」（含不輸出的） */
  entries: readonly LogEntry[];
  /** 分頁名稱，依第一次出現的順序（依分頁分章用） */
  tabs: readonly string[];
  hiddenTabs: readonly string[];
  chatMode: ChatMode;
  showChatCount: boolean;
  hideSystem: boolean;
  subNarrators: Readonly<Record<string, { style: SubNarratorStyle; color: string }>>;
  nameColors: Readonly<Record<string, string>>;
  chapters: EpubChapterMode;
  markers: readonly string[];
  chapterSize: number;
  writing: EpubWriting;
  font: EpubFont;
  nameColor: EpubNameColor;
  illustrations: readonly EpubIllustration[];
  images: readonly EpubImage[];
  cover: EpubImage | null;
  fontFile: EpubFontFile | null;
  /** 匯出時間（dcterms:modified、ZIP 內的檔案時間） */
  modified: Date;
}

/** 標記文字：每行一個，去頭尾空白、略過空行 */
export const markerLines = (text: string): string[] =>
  String(text ?? '')
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter(Boolean);

export function epubSettingsOf(s: LcSettings): EpubSettings {
  const size = Number.isFinite(s.epubChapterSize) ? Math.round(s.epubChapterSize) : 500;
  return {
    author: s.epubAuthor.trim(),
    chapters: s.epubChapters,
    markers: markerLines(s.epubMarkers),
    chapterSize: Math.min(EPUB_CHAPTER_SIZE_MAX, Math.max(EPUB_CHAPTER_SIZE_MIN, size)),
    writing: s.epubWriting,
    font: s.epubFont,
    nameColor: s.epubNameColor,
  };
}

/** 轉換結果（按下轉換當時的選項與則）＋EPUB 設定＋圖片 → 電子書的輸入 */
export function epubInputFrom(
  o: RenderOptions,
  entries: readonly LogEntry[],
  tabs: readonly string[],
  es: EpubSettings,
  media: EpubMedia,
  now: Date,
): EpubInput {
  return {
    title: o.title.trim() || OUT.defaultTitle,
    subtitle: o.subtitle.trim(),
    summary: o.summary.trim(),
    author: es.author,
    entries,
    tabs: [...tabs],
    hiddenTabs: [...o.hiddenTabs],
    chatMode: o.chatMode,
    showChatCount: o.showChatCount,
    hideSystem: o.hideSystem,
    subNarrators: { ...o.subNarrators },
    nameColors: { ...o.nameColors },
    chapters: es.chapters,
    markers: es.markers,
    chapterSize: es.chapterSize,
    writing: es.writing,
    font: es.font,
    nameColor: es.nameColor,
    illustrations: media.illustrations,
    images: media.images,
    cover: media.cover,
    fontFile: media.fontFile,
    modified: now,
  };
}

/** 以檔頭辨認字型檔（F109）：TrueType、OpenType、WOFF、WOFF2；其他回傳 null */
export function fontFormatOf(bytes: Uint8Array): EpubFontFormat | null {
  if (bytes.length < 4) return null;
  const tag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (tag === '\u0000\u0001\u0000\u0000' || tag === 'true') return 'ttf';
  if (tag === 'OTTO') return 'otf';
  if (tag === 'wOFF') return 'woff';
  if (tag === 'wOF2') return 'woff2';
  return null;
}
