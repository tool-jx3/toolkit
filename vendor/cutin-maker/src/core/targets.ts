import type { OutputFormat, RenderParams } from './types';
import { getFont } from './fonts';
import { t } from '../i18n';

export interface ExportTarget {
  id: string;
  /** 切り替えた言語で読み直せるよう getter。中身は i18n 辞書から引く */
  readonly label: string;
  /** null = 自由。数値指定は「厳密一致が必要」を意味する */
  fixedSize: { w: number; h: number } | null;
  defaultSize: { w: number; h: number };
  defaultFrames: number;
  defaultFps: number;
  maxBytes: number;
  /** 使用可能な形式。先頭が既定 */
  formats: OutputFormat[];
  alpha: 'full' | '1bit' | 'none';
  /** 実際にユーザーの画面で表示される概算px。adaptForTarget の縁取り補正に使う */
  displaySize: number;
  maxChars: number;
  /** GIF出力時のマット既定色。null=透過のまま */
  defaultMatte: string | null;
  readonly notes: string[];
}

export const TARGETS: ExportTarget[] = [
  {
    id: 'ccfolia-cutin',
    get label() { return t('target.ccfolia-cutin'); },
    fixedSize: null,
    defaultSize: { w: 480, h: 480 },
    defaultFrames: 15,
    defaultFps: 20,
    maxBytes: 1_000_000,
    formats: ['apng', 'gif', 'png'],
    alpha: 'full',
    displaySize: 480,
    maxChars: 20,
    defaultMatte: null,
    get notes() { return [t('target.ccfolia-cutin.note1')]; },
  },
  {
    id: 'discord-sticker',
    get label() { return t('target.discord-sticker'); },
    fixedSize: { w: 320, h: 320 },
    defaultSize: { w: 320, h: 320 },
    defaultFrames: 12,
    defaultFps: 20,
    maxBytes: 512_000,
    formats: ['apng', 'png'],
    alpha: 'full',
    displaySize: 160,
    maxChars: 8,
    defaultMatte: null,
    get notes() { return [t('target.discord-sticker.note1'), t('target.discord-sticker.note2')]; },
  },
  {
    id: 'discord-attachment',
    get label() { return t('target.discord-attachment'); },
    fixedSize: null,
    defaultSize: { w: 720, h: 720 },
    defaultFrames: 30,
    defaultFps: 30,
    maxBytes: 8_000_000,
    formats: ['gif', 'png'],
    alpha: '1bit',
    displaySize: 400,
    maxChars: 20,
    defaultMatte: '#313338',
    get notes() {
      return [
        t('target.discord-attachment.note1'),
        t('target.discord-attachment.note2'),
        t('target.discord-attachment.note3'),
      ];
    },
  },
];

export const DEFAULT_TARGET_ID = 'ccfolia-cutin';

export function getTarget(id: string): ExportTarget {
  return TARGETS.find((t) => t.id === id) ?? TARGETS[0];
}

/** ターゲット既定値へ追従させるフィールド名 */
export type TargetDrivenField = 'canvas' | 'frameCount' | 'fps' | 'format' | 'matte';

/**
 * ターゲット切替時の既定値追従。
 * ユーザーが手で触ったフィールドは上書きしない（触った直後に値が消える不快な挙動を避ける）。
 */
export function applyTargetDefaults(
  params: RenderParams,
  target: ExportTarget,
  touched: ReadonlySet<TargetDrivenField>,
): RenderParams {
  const next: RenderParams = { ...params, canvas: { ...params.canvas }, output: { ...params.output } };
  if (target.fixedSize) {
    next.canvas = { ...target.fixedSize }; // 厳密一致が要求されるので手動値より優先
  } else if (!touched.has('canvas')) {
    next.canvas = { ...target.defaultSize };
  }
  if (!touched.has('frameCount')) next.frameCount = target.defaultFrames;
  if (!touched.has('fps')) next.fps = target.defaultFps;
  if (!touched.has('format') || !target.formats.includes(next.output.format)) {
    next.output.format = target.formats[0];
  }
  if (!touched.has('matte')) next.output.matte = target.defaultMatte;
  return next;
}

/**
 * 表示サイズに応じた自動調整。純関数。プレビューにも同じものを通す。
 */
export function adaptForTarget(params: RenderParams, target: ExportTarget): RenderParams {
  const k = target.displaySize / 480; // 480px（ココフォリアのカットイン）を基準にする
  if (Math.abs(k - 1) < 0.01) return params;

  const strokeBoost = k < 1 ? 1 + (1 - k) * 0.6 : 1; // 小さく表示されるほど縁を太く
  const decorations = params.text.decorations.map((d) =>
    d.type === 'stroke' ? { ...d, widthRatio: d.widthRatio * strokeBoost } : d,
  );

  const layers = params.layers.map((l) => {
    if (l.type !== 'radiate') return l;
    const count = typeof l.params.count === 'number' ? l.params.count : 48;
    return { ...l, params: { ...l.params, count: Math.max(8, Math.round(count * k)) } };
  });

  return {
    ...params,
    text: { ...params.text, decorations },
    layers,
    motion: k < 1 ? { ...params.motion, amount: params.motion.amount * (0.6 + 0.4 * k) } : params.motion,
  };
}

/**
 * 幅×高さ×フレーム数の上限。renderFrames() は全フレームを ImageData で保持するため、
 * これを超えるとブラウザのタブごと落ちる（RGBA なので 4 倍のバイト数になる）。
 * 40,000,000 px = 160MB 相当。480×480×15 の約12倍。
 */
export const MAX_TOTAL_PIXELS = 40_000_000;

export function totalPixels(params: RenderParams): number {
  return params.canvas.w * params.canvas.h * Math.max(1, params.frameCount);
}

export type Issue = { level: 'error' | 'warn' | 'info'; message: string };

/** 書き出しボタンの近くに常時表示する */
export function validate(params: RenderParams, target: ExportTarget, actualBytes?: number): Issue[] {
  const issues: Issue[] = [];
  const fmt = params.output.format;

  if (!target.formats.includes(fmt)) {
    issues.push({ level: 'error', message: t('issue.format', target.label, fmt.toUpperCase(), target.formats.map((f) => f.toUpperCase()).join(' / ')) });
  }
  if (target.fixedSize) {
    if (params.canvas.w !== target.fixedSize.w || params.canvas.h !== target.fixedSize.h) {
      issues.push({ level: 'error', message: t('issue.fixedSize', target.fixedSize.w, target.fixedSize.h) });
    }
  }
  if (target.alpha === '1bit' && fmt === 'gif' && !params.output.matte && params.background.kind === 'transparent') {
    issues.push({ level: 'warn', message: t('issue.gifAlpha') });
  }
  if (fmt === 'gif' && params.output.matte && target.alpha === 'full') {
    issues.push({ level: 'info', message: t('issue.matte') });
  }

  const px = totalPixels(params);
  if (px > MAX_TOTAL_PIXELS) {
    issues.push({
      level: 'error',
      message: t('issue.tooLarge', params.canvas.w, params.canvas.h, params.frameCount),
    });
  } else if (px > MAX_TOTAL_PIXELS * 0.6) {
    issues.push({ level: 'warn', message: t('issue.slow') });
  }

  const chars = params.text.lines.join('').length;
  if (chars > target.maxChars) {
    issues.push({ level: 'warn', message: t('issue.tooManyChars', chars, target.maxChars) });
  }
  const font = getFont(params.text.fontId);
  if (chars > font.recommendedMaxChars) {
    issues.push({ level: 'warn', message: t('issue.fontChars', font.label, font.recommendedMaxChars) });
  }
  if (actualBytes !== undefined && actualBytes > target.maxBytes) {
    issues.push({ level: 'error', message: t('issue.overBudget', fmtBytes(actualBytes), fmtBytes(target.maxBytes)) });
  }
  return issues;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/** 超過時の自動軽量化。効果が大きく劣化が小さい順に1段階だけ下げる */
export function lighten(params: RenderParams, target: ExportTarget): { params: RenderParams; applied: string } | null {
  const next: RenderParams = {
    ...params,
    output: { ...params.output },
    layers: params.layers.map((l) => ({ ...l, params: { ...l.params } })),
    canvas: { ...params.canvas },
  };
  if (next.output.colors > 64) {
    next.output.colors = next.output.colors > 128 ? 128 : 64;
    return { params: next, applied: t('lighten.colors', next.output.colors) };
  }
  if (next.frameCount > 10) {
    next.frameCount = Math.max(10, next.frameCount - 3);
    return { params: next, applied: t('lighten.frames', next.frameCount) };
  }
  const radiate = next.layers.find((l) => l.type === 'radiate');
  if (radiate && typeof radiate.params.count === 'number' && radiate.params.count > 16) {
    radiate.params.count = Math.max(16, Math.round(radiate.params.count * 0.7));
    return { params: next, applied: t('lighten.radiate', radiate.params.count) };
  }
  if (!target.fixedSize && Math.min(next.canvas.w, next.canvas.h) > 240) {
    next.canvas = { w: Math.round(next.canvas.w * 0.8), h: Math.round(next.canvas.h * 0.8) };
    return { params: next, applied: t('lighten.canvas', next.canvas.w, next.canvas.h) };
  }
  return null;
}

/** ココフォリア向けサイズプリセット */
export interface SizePreset {
  id: string;
  readonly label: string;
  w: number;
  h: number;
  frames: number;
  fps: number;
  /** 円い演出が切れないように中身を縮める率。省略=1 */
  contentScale?: number;
}

export const CCFOLIA_SIZE_PRESETS: SizePreset[] = [
  { id: 'square', get label() { return t('size.square'); }, w: 480, h: 480, frames: 15, fps: 20 },
  { id: 'large', get label() { return t('size.large'); }, w: 600, h: 600, frames: 18, fps: 20, contentScale: 0.72 },
  { id: 'wide', get label() { return t('size.wide'); }, w: 800, h: 450, frames: 15, fps: 20 },
  { id: 'light', get label() { return t('size.light'); }, w: 320, h: 320, frames: 10, fps: 15 },
];
