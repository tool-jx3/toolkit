/**
 * QR Code 產生器的資料：內容、大小、QR code 設定、點與角的樣式、背景、中間的圖。
 * 預設值照原作（kozakdenys/qr-code-styling 的 README 與 `src/core/QROptions.ts`）；內容（本站）與邊距（24 px，原作 0）除外。
 * 存檔與專案檔讀回時一律經過 normalizeDoc（缺欄位補預設、數值夾在範圍裡、看不懂的選項回到預設）。
 */
import type { AssetImageRef } from '@/core/assets';
import { normalizeHex } from '@/core/color';
import type { Gradient } from '@/core/gradient';
import {
  QR_CORNER_DOT_TYPES,
  QR_CORNER_SQUARE_TYPES,
  QR_DOT_TYPES,
  QR_ECLS,
  type QrCornerDotType,
  type QrCornerSquareType,
  type QrDotType,
  type QrEcl,
  type QrModeChoice,
  type QrPaint,
  type QrShape,
  type QrStyle,
} from '@/core/qr';

export type PaintMode = 'solid' | 'gradient';

/** 單色與漸層都記著，切換時不會弄丟另一邊的設定 */
export interface PaintState {
  mode: PaintMode;
  color: string;
  gradient: Gradient;
}

/** 角：inherit＝跟著點（外框）或跟著外框（中心） */
export interface CornerPaintState {
  mode: 'inherit' | PaintMode;
  color: string;
  gradient: Gradient;
}

export interface BackgroundState {
  mode: 'transparent' | PaintMode;
  color: string;
  gradient: Gradient;
  /** 圓角 0～1（1＝圓形） */
  round: number;
}

export type CornerSquareChoice = 'none' | QrCornerSquareType;
export type CornerDotChoice = 'none' | QrCornerDotType;
export const MODE_CHOICES: readonly QrModeChoice[] = [
  'auto',
  'numeric',
  'alphanumeric',
  'byte',
  'kanji',
];

export interface DocState {
  /** 內容（網址或文字） */
  data: string;
  width: number;
  height: number;
  margin: number;
  shape: QrShape;
  qr: { version: number; mode: QrModeChoice; ecl: QrEcl };
  dots: { type: QrDotType; paint: PaintState; roundSize: boolean };
  cornerSquare: { type: CornerSquareChoice; paint: CornerPaintState };
  cornerDot: { type: CornerDotChoice; paint: CornerPaintState };
  background: BackgroundState;
  image: AssetImageRef | null;
  imageOptions: { size: number; margin: number; hideBackgroundDots: boolean };
}

export const RANGES = {
  size: { min: 32, max: 4096 },
  margin: { min: 0, max: 2048, slider: 200 },
  imageSize: { min: 0.05, max: 1 },
  imageMargin: { min: 0, max: 200, slider: 60 },
  version: { min: 0, max: 40 },
} as const;

export const DATA_MAX = 7089;

const grad = (a: string, b: string, angle = 90): Gradient => ({
  kind: 'linear',
  angle,
  stops: [
    { offset: 0, color: a },
    { offset: 1, color: b },
  ],
});

export const DEFAULT_DATA = 'https://example.com/';

export function initialDoc(): DocState {
  return {
    data: DEFAULT_DATA,
    width: 300,
    height: 300,
    /* 和原作不同（原作 0）：預設內容約 2.4 格的留白，貼在有顏色的底上也掃得到（主控 2026-10-29 裁定，規格 D2） */
    margin: 24,
    shape: 'square',
    qr: { version: 0, mode: 'auto', ecl: 'Q' },
    dots: {
      type: 'square',
      paint: { mode: 'solid', color: '#000000', gradient: grad('#000000', '#4b2a85') },
      roundSize: true,
    },
    cornerSquare: {
      type: 'none',
      paint: { mode: 'inherit', color: '#000000', gradient: grad('#000000', '#4b2a85') },
    },
    cornerDot: {
      type: 'none',
      paint: { mode: 'inherit', color: '#000000', gradient: grad('#000000', '#4b2a85') },
    },
    background: {
      mode: 'solid',
      color: '#ffffff',
      gradient: grad('#ffffff', '#e4e9f2'),
      round: 0,
    },
    image: null,
    imageOptions: { size: 0.4, margin: 0, hideBackgroundDots: true },
  };
}

/* ---------- 整理（存檔、專案檔） ---------- */

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function num(v: unknown, fallback: number, min: number, max: number, int = false): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  const c = Math.min(max, Math.max(min, n));
  return int ? Math.round(c) : c;
}

const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback;

const color = (v: unknown, fallback: string): string =>
  typeof v === 'string' ? normalizeHex(v, fallback) : fallback;

function gradient(v: unknown, fallback: Gradient): Gradient {
  const g = obj(v);
  const stops = Array.isArray(g.stops)
    ? g.stops
        .map((s) => obj(s))
        .filter((s) => typeof s.color === 'string')
        .slice(0, 8)
        .map((s) => ({ offset: num(s.offset, 0, 0, 1), color: color(s.color, '#000000') }))
    : [];
  return {
    kind: g.kind === 'radial' ? 'radial' : 'linear',
    angle: num(g.angle, fallback.angle, 0, 360),
    stops: stops.length >= 2 ? stops : fallback.stops.map((s) => ({ ...s })),
  };
}

function paint<M extends string>(
  v: unknown,
  modes: readonly M[],
  fallback: { mode: M; color: string; gradient: Gradient },
) {
  const p = obj(v);
  return {
    mode: oneOf(p.mode, modes, fallback.mode),
    color: color(p.color, fallback.color),
    gradient: gradient(p.gradient, fallback.gradient),
  };
}

function imageRef(v: unknown): AssetImageRef | null {
  const r = obj(v);
  if (typeof r.id !== 'string' || !r.id) return null;
  return {
    id: r.id,
    name: typeof r.name === 'string' ? r.name.slice(0, 200) : '',
    width: num(r.width, 1, 1, 100_000, true),
    height: num(r.height, 1, 1, 100_000, true),
  };
}

export function normalizeDoc(raw: unknown): DocState {
  const d = obj(raw);
  const def = initialDoc();
  const qr = obj(d.qr);
  const dots = obj(d.dots);
  const cs = obj(d.cornerSquare);
  const cd = obj(d.cornerDot);
  const bg = obj(d.background);
  const io = obj(d.imageOptions);
  return {
    data: typeof d.data === 'string' ? d.data.slice(0, DATA_MAX) : def.data,
    width: num(d.width, def.width, RANGES.size.min, RANGES.size.max, true),
    height: num(d.height, def.height, RANGES.size.min, RANGES.size.max, true),
    margin: num(d.margin, def.margin, RANGES.margin.min, RANGES.margin.max, true),
    shape: d.shape === 'circle' ? 'circle' : 'square',
    qr: {
      version: num(qr.version, 0, RANGES.version.min, RANGES.version.max, true),
      mode: oneOf(qr.mode, MODE_CHOICES, 'auto'),
      ecl: oneOf(qr.ecl, QR_ECLS, 'Q'),
    },
    dots: {
      type: oneOf(dots.type, QR_DOT_TYPES, def.dots.type),
      paint: paint(dots.paint, ['solid', 'gradient'] as const, def.dots.paint),
      roundSize: typeof dots.roundSize === 'boolean' ? dots.roundSize : true,
    },
    cornerSquare: {
      type: oneOf(cs.type, ['none', ...QR_CORNER_SQUARE_TYPES] as const, 'none'),
      paint: paint(cs.paint, ['inherit', 'solid', 'gradient'] as const, def.cornerSquare.paint),
    },
    cornerDot: {
      type: oneOf(cd.type, ['none', ...QR_CORNER_DOT_TYPES] as const, 'none'),
      paint: paint(cd.paint, ['inherit', 'solid', 'gradient'] as const, def.cornerDot.paint),
    },
    background: {
      ...paint(bg, ['transparent', 'solid', 'gradient'] as const, def.background),
      round: num(bg.round, 0, 0, 1),
    },
    image: imageRef(d.image),
    imageOptions: {
      size: num(io.size, def.imageOptions.size, RANGES.imageSize.min, RANGES.imageSize.max),
      margin: num(io.margin, 0, RANGES.imageMargin.min, RANGES.imageMargin.max, true),
      hideBackgroundDots: typeof io.hideBackgroundDots === 'boolean' ? io.hideBackgroundDots : true,
    },
  };
}

/* ---------- 換成 core/qr 的樣式 ---------- */

export function toPaint(p: { mode: string; color: string; gradient: Gradient }): QrPaint {
  return p.mode === 'gradient'
    ? { kind: 'gradient', gradient: p.gradient }
    : { kind: 'solid', color: p.color };
}

/** 角的畫法：跟著（null）或自己的 */
export const cornerPaint = (p: CornerPaintState): QrPaint | null =>
  p.mode === 'inherit' ? null : toPaint(p);

export const backgroundPaint = (b: BackgroundState): QrPaint | null =>
  b.mode === 'transparent' ? null : toPaint(b);

export function toStyle(d: DocState, image: { width: number; height: number } | null): QrStyle {
  return {
    width: d.width,
    height: d.height,
    margin: d.margin,
    shape: d.shape,
    dots: { type: d.dots.type, paint: toPaint(d.dots.paint), roundSize: d.dots.roundSize },
    cornerSquare: {
      type: d.cornerSquare.type === 'none' ? null : d.cornerSquare.type,
      paint: cornerPaint(d.cornerSquare.paint),
    },
    cornerDot: {
      type: d.cornerDot.type === 'none' ? null : d.cornerDot.type,
      paint: cornerPaint(d.cornerDot.paint),
    },
    background: { paint: backgroundPaint(d.background), round: d.background.round },
    image: image
      ? {
          width: image.width,
          height: image.height,
          size: d.imageOptions.size,
          margin: d.imageOptions.margin,
          hideBackgroundDots: d.imageOptions.hideBackgroundDots,
        }
      : null,
  };
}

/** 畫面上看得到的前景（點、角）的畫法，對比檢查用 */
export function foregroundPaints(d: DocState): QrPaint[] {
  const dots = toPaint(d.dots.paint);
  const square = cornerPaint(d.cornerSquare.paint) ?? dots;
  const dot = cornerPaint(d.cornerDot.paint) ?? square;
  return [dots, square, dot];
}

/** 專案檔、自動儲存用到的圖 */
export const docAssetIds = (d: DocState): string[] => (d.image ? [d.image.id] : []);
