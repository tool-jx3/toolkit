/**
 * 「散落」的設定：型別、預設值（原作的預設：lyric-fx 規格 1.4～1.7）、範圍、正規化、設定面板的描述。
 */
import type { LyricControlSection, LyricFont, LyricRegion } from '../../types';
import { SCATTER_TEXT as T } from './strings';

export type ScatterMode = 'auto' | 'cjk' | 'latin';

export interface ScatterSettings {
  font: LyricFont;
  /** 英文句的字型（null＝同上） */
  latinFont: LyricFont | null;
  /** 字級（基準畫面的 px） */
  fontSize: number;
  spacing: number;
  mode: ScatterMode;
  textColor: string;
  strokeColor: string;
  strokeWidth: number;
  /** 整體的不透明度（%） */
  opacity: number;
  glow: boolean;
  glowColor: string;
  glowSize: number;
  /** 0～255 */
  glowAlpha: number;
  perspective: boolean;
  /** 滑桿值：× 10⁻⁶ */
  perspX: number;
  /** 滑桿值：× 10⁻⁵ */
  perspY: number;
  /** 滑桿值：× 0.01 */
  perspComp: number;
  shakeIntensity: number;
  /** ms */
  shakeSpeed: number;
  /** 每 30 ms 減少的不透明度（0～255） */
  fadeSpeed: number;
  /** 每 30 ms 上升的 px */
  riseSpeed: number;
  angleMin: number;
  angleMax: number;
  /** 預點亮：目前這一句之後幾句（0、1、2） */
  preview: 0 | 1 | 2;
  keepDim: boolean;
  partition: boolean;
  /** ms */
  marginTime: number;
  maxInterval: number;
  maxDuration: number;
  /** % */
  posXMin: number;
  posXMax: number;
  posYMin: number;
  posYMax: number;
  /** 避開區域（畫面的 0～1；null＝沒有） */
  region: LyricRegion | null;
}

export const SCATTER_RANGES = {
  fontSize: { min: 13, max: 133, step: 1 },
  spacing: { min: -10, max: 30, step: 0.5 },
  strokeWidth: { min: 0, max: 10, step: 0.1 },
  opacity: { min: 0, max: 100, step: 1 },
  glowSize: { min: 4, max: 30, step: 1 },
  glowAlpha: { min: 10, max: 120, step: 1 },
  perspX: { min: 0, max: 100, step: 1 },
  perspY: { min: 0, max: 100, step: 1 },
  perspComp: { min: 0, max: 100, step: 1 },
  shakeIntensity: { min: 0, max: 10, step: 1 },
  shakeSpeed: { min: 10, max: 200, step: 1 },
  fadeSpeed: { min: 1, max: 15, step: 1 },
  riseSpeed: { min: 0, max: 5, step: 1 },
  angle: { min: -90, max: 90, step: 1 },
  marginTime: { min: 0, max: 5000, step: 100 },
  maxInterval: { min: 1000, max: 30000, step: 1000 },
  maxDuration: { min: 500, max: 10000, step: 500 },
  posMin: { min: 0, max: 50, step: 1 },
  posMax: { min: 50, max: 100, step: 1 },
} as const;

export const DEFAULT_SCATTER_FONT: LyricFont = {
  source: 'google',
  family: 'Noto Sans TC',
  weight: 700,
};

export const scatterDefaults = (): ScatterSettings => ({
  font: { ...DEFAULT_SCATTER_FONT },
  latinFont: null,
  fontSize: 37,
  spacing: 5,
  mode: 'auto',
  textColor: '#fffeef',
  strokeColor: '#d8a523',
  strokeWidth: 0.5,
  opacity: 100,
  glow: true,
  glowColor: '#d8a523',
  glowSize: 4,
  glowAlpha: 82,
  perspective: true,
  perspX: 50,
  perspY: 30,
  perspComp: 3,
  shakeIntensity: 2,
  shakeSpeed: 143,
  fadeSpeed: 12,
  riseSpeed: 1,
  angleMin: -10,
  angleMax: 10,
  preview: 0,
  keepDim: true,
  partition: false,
  marginTime: 4000,
  maxInterval: 16000,
  maxDuration: 5000,
  posXMin: 5,
  posXMax: 85,
  posYMin: 5,
  posYMax: 75,
  region: null,
});

/** 內建的配色預設（文字／陰影／光暈；數值同原作的三組：config/settings.py 3-7，名稱自己取） */
export const SCATTER_PRESETS = [
  {
    name: T.presetNames.gold,
    values: { textColor: '#fffeef', strokeColor: '#d8a523', glowColor: '#d8a523' },
  },
  {
    name: T.presetNames.violet,
    values: { textColor: '#b223cb', strokeColor: '#991eaf', glowColor: '#b223cb' },
  },
  {
    name: T.presetNames.cyan,
    values: { textColor: '#00ffff', strokeColor: '#00aaff', glowColor: '#00aaff' },
  },
] as const;

/* ---------- 正規化 ---------- */

const HEX = /^#[0-9a-f]{6}$/i;
const color = (v: unknown, fallback: string) =>
  typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : fallback;
const num = (v: unknown, r: { min: number; max: number }, fallback: number, int = false) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  const x = Math.min(r.max, Math.max(r.min, v));
  return int ? Math.round(x) : x;
};
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

function font(v: unknown, fallback: LyricFont): LyricFont {
  if (!v || typeof v !== 'object') return { ...fallback };
  const o = v as Record<string, unknown>;
  const source =
    o.source === 'google' || o.source === 'local' || o.source === 'upload' ? o.source : null;
  const family = typeof o.family === 'string' ? o.family.trim().slice(0, 200) : '';
  if (!source || !family) return { ...fallback };
  const weight =
    typeof o.weight === 'number' && Number.isFinite(o.weight)
      ? Math.min(1000, Math.max(100, Math.round(o.weight)))
      : 400;
  return { source, family, weight };
}

export function normalizeRegion(v: unknown): LyricRegion | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : Number.NaN);
  let x = n(o.x);
  let y = n(o.y);
  let w = n(o.width);
  let h = n(o.height);
  if (![x, y, w, h].every(Number.isFinite)) return null;
  x = Math.min(1, Math.max(0, x));
  y = Math.min(1, Math.max(0, y));
  w = Math.min(1 - x, Math.max(0, w));
  h = Math.min(1 - y, Math.max(0, h));
  if (w < 0.003 || h < 0.003) return null;
  return { x, y, width: w, height: h };
}

export function normalizeScatter(raw: unknown): ScatterSettings {
  const d = scatterDefaults();
  if (!raw || typeof raw !== 'object') return d;
  const o = raw as Record<string, unknown>;
  const R = SCATTER_RANGES;
  return {
    font: font(o.font, d.font),
    latinFont: o.latinFont == null ? null : font(o.latinFont, d.font),
    fontSize: num(o.fontSize, R.fontSize, d.fontSize, true),
    spacing: Math.round(num(o.spacing, R.spacing, d.spacing) * 2) / 2,
    mode: o.mode === 'cjk' || o.mode === 'latin' || o.mode === 'auto' ? o.mode : d.mode,
    textColor: color(o.textColor, d.textColor),
    strokeColor: color(o.strokeColor, d.strokeColor),
    strokeWidth: Math.round(num(o.strokeWidth, R.strokeWidth, d.strokeWidth) * 10) / 10,
    opacity: num(o.opacity, R.opacity, d.opacity, true),
    glow: bool(o.glow, d.glow),
    glowColor: color(o.glowColor, d.glowColor),
    glowSize: num(o.glowSize, R.glowSize, d.glowSize, true),
    glowAlpha: num(o.glowAlpha, R.glowAlpha, d.glowAlpha, true),
    perspective: bool(o.perspective, d.perspective),
    perspX: num(o.perspX, R.perspX, d.perspX, true),
    perspY: num(o.perspY, R.perspY, d.perspY, true),
    perspComp: num(o.perspComp, R.perspComp, d.perspComp, true),
    shakeIntensity: num(o.shakeIntensity, R.shakeIntensity, d.shakeIntensity, true),
    shakeSpeed: num(o.shakeSpeed, R.shakeSpeed, d.shakeSpeed, true),
    fadeSpeed: num(o.fadeSpeed, R.fadeSpeed, d.fadeSpeed, true),
    riseSpeed: num(o.riseSpeed, R.riseSpeed, d.riseSpeed, true),
    angleMin: num(o.angleMin, R.angle, d.angleMin, true),
    angleMax: num(o.angleMax, R.angle, d.angleMax, true),
    preview: o.preview === 1 || o.preview === 2 || o.preview === 0 ? o.preview : d.preview,
    keepDim: bool(o.keepDim, d.keepDim),
    partition: bool(o.partition, d.partition),
    marginTime: num(o.marginTime, R.marginTime, d.marginTime, true),
    maxInterval: num(o.maxInterval, R.maxInterval, d.maxInterval, true),
    maxDuration: num(o.maxDuration, R.maxDuration, d.maxDuration, true),
    posXMin: num(o.posXMin, R.posMin, d.posXMin, true),
    posXMax: num(o.posXMax, R.posMax, d.posXMax, true),
    posYMin: num(o.posYMin, R.posMin, d.posYMin, true),
    posYMax: num(o.posYMax, R.posMax, d.posYMax, true),
    region: normalizeRegion(o.region),
  };
}

/* ---------- 設定面板 ---------- */

const R = SCATTER_RANGES;
const previewOff = (s: Record<string, unknown>) => (s.preview === 0 ? T.keepDimOff : false);

export const SCATTER_CONTROLS: readonly LyricControlSection[] = [
  {
    id: 'text',
    title: T.sections.text,
    controls: [
      { kind: 'font', key: 'font', label: T.font, previewText: '散落的歌詞 Lyrics' },
      {
        kind: 'font',
        key: 'latinFont',
        label: T.latinFont,
        hint: T.latinFontHint,
        nullLabel: T.latinFontSame,
        previewText: 'Falling lyrics',
      },
      {
        kind: 'slider',
        key: 'fontSize',
        label: T.fontSize,
        hint: T.fontSizeHint,
        unit: 'px',
        ...R.fontSize,
      },
      {
        kind: 'slider',
        key: 'spacing',
        label: T.spacing,
        hint: T.spacingHint,
        unit: 'px',
        ...R.spacing,
      },
      {
        kind: 'segmented',
        key: 'mode',
        label: T.mode,
        hint: T.modeHint,
        options: [
          { value: 'auto', label: T.modes.auto },
          { value: 'cjk', label: T.modes.cjk },
          { value: 'latin', label: T.modes.latin },
        ],
      },
    ],
  },
  {
    id: 'colors',
    title: T.sections.colors,
    controls: [
      {
        kind: 'presets',
        key: 'textColor',
        label: T.presets,
        keys: ['textColor', 'strokeColor', 'glowColor'],
        builtins: SCATTER_PRESETS,
      },
      { kind: 'color', key: 'textColor', label: T.textColor },
      { kind: 'color', key: 'strokeColor', label: T.strokeColor, hint: T.strokeColorHint },
      {
        kind: 'slider',
        key: 'strokeWidth',
        label: T.strokeWidth,
        hint: T.strokeWidthHint,
        unit: 'px',
        precision: 1,
        ...R.strokeWidth,
      },
      { kind: 'slider', key: 'opacity', label: T.opacity, unit: '%', ...R.opacity },
    ],
  },
  {
    id: 'glow',
    title: T.sections.glow,
    controls: [
      { kind: 'toggle', key: 'glow', label: T.glow },
      { kind: 'color', key: 'glowColor', label: T.glowColor, when: (s) => !!s.glow },
      {
        kind: 'slider',
        key: 'glowSize',
        label: T.glowSize,
        unit: 'px',
        when: (s) => !!s.glow,
        ...R.glowSize,
      },
      {
        kind: 'slider',
        key: 'glowAlpha',
        label: T.glowAlpha,
        hint: T.glowAlphaHint,
        when: (s) => !!s.glow,
        ...R.glowAlpha,
      },
    ],
  },
  {
    id: 'perspective',
    title: T.sections.perspective,
    controls: [
      { kind: 'toggle', key: 'perspective', label: T.perspective, hint: T.perspectiveHint },
      {
        kind: 'slider',
        key: 'perspX',
        label: T.perspX,
        hint: T.perspXHint,
        when: (s) => !!s.perspective,
        format: (v) => (v / 1e6).toFixed(6),
        ...R.perspX,
      },
      {
        kind: 'slider',
        key: 'perspY',
        label: T.perspY,
        hint: T.perspYHint,
        when: (s) => !!s.perspective,
        format: (v) => (v / 1e5).toFixed(5),
        ...R.perspY,
      },
      {
        kind: 'slider',
        key: 'perspComp',
        label: T.perspComp,
        hint: T.perspCompHint,
        when: (s) => !!s.perspective,
        format: (v) => (v / 100).toFixed(2),
        ...R.perspComp,
      },
    ],
  },
  {
    id: 'motion',
    title: T.sections.motion,
    controls: [
      {
        kind: 'slider',
        key: 'shakeIntensity',
        label: T.shakeIntensity,
        hint: T.shakeIntensityHint,
        unit: 'px',
        ...R.shakeIntensity,
      },
      {
        kind: 'slider',
        key: 'shakeSpeed',
        label: T.shakeSpeed,
        hint: T.shakeSpeedHint,
        unit: 'ms',
        ...R.shakeSpeed,
      },
      {
        kind: 'slider',
        key: 'fadeSpeed',
        label: T.fadeSpeed,
        hint: T.fadeSpeedHint,
        ...R.fadeSpeed,
      },
      {
        kind: 'slider',
        key: 'riseSpeed',
        label: T.riseSpeed,
        hint: T.riseSpeedHint,
        unit: 'px',
        ...R.riseSpeed,
      },
      {
        kind: 'range',
        key: 'angleMin',
        maxKey: 'angleMax',
        label: T.angle,
        hint: T.angleHint,
        unit: '°',
        labels: { min: T.angleMin, max: T.angleMax },
        ...R.angle,
      },
    ],
  },
  {
    id: 'timing',
    title: T.sections.timing,
    controls: [
      {
        kind: 'segmented',
        key: 'preview',
        label: T.preview,
        hint: T.previewHint,
        options: [
          { value: 0, label: T.previewOptions[0] },
          { value: 1, label: T.previewOptions[1] },
          { value: 2, label: T.previewOptions[2] },
        ],
      },
      {
        kind: 'toggle',
        key: 'keepDim',
        label: T.keepDim,
        hint: T.keepDimHint,
        disabled: previewOff,
      },
      { kind: 'toggle', key: 'partition', label: T.partition, hint: T.partitionHint },
      {
        kind: 'slider',
        key: 'marginTime',
        label: T.margin,
        hint: T.marginHint,
        unit: 'ms',
        ...R.marginTime,
      },
      {
        kind: 'slider',
        key: 'maxInterval',
        label: T.maxInterval,
        hint: T.maxIntervalHint,
        unit: 'ms',
        ...R.maxInterval,
      },
      {
        kind: 'slider',
        key: 'maxDuration',
        label: T.maxDuration,
        hint: T.maxDurationHint,
        unit: 'ms',
        ...R.maxDuration,
      },
    ],
  },
  {
    id: 'position',
    title: T.sections.position,
    controls: [
      { kind: 'region', key: 'region', label: T.region, hint: T.regionHint },
      {
        kind: 'slider',
        key: 'posXMin',
        label: `${T.posX}：${T.posMin}`,
        unit: '%',
        disabled: (s) => (s.region ? T.noteRegion : false),
        ...R.posMin,
      },
      {
        kind: 'slider',
        key: 'posXMax',
        label: `${T.posX}：${T.posMax}`,
        unit: '%',
        disabled: (s) => (s.region ? T.noteRegion : false),
        ...R.posMax,
      },
      {
        kind: 'slider',
        key: 'posYMin',
        label: `${T.posY}：${T.posMin}`,
        unit: '%',
        disabled: (s) => (s.region ? T.noteRegion : false),
        ...R.posMin,
      },
      {
        kind: 'slider',
        key: 'posYMax',
        label: `${T.posY}：${T.posMax}`,
        hint: T.posHint,
        unit: '%',
        disabled: (s) => (s.region ? T.noteRegion : false),
        ...R.posMax,
      },
    ],
  },
];
