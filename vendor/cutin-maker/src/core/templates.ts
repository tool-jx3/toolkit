import type { BackgroundSpec, ColorSpec, LayerSpec, MotionSpec, RenderParams, TextDecoSpec } from './types';
import { t } from '../i18n';

/* ------------------------------------------------------------------ */
/* 軸1: カラーテーマ（decorations 内の ColorSpec を差し替える）           */
/* ------------------------------------------------------------------ */

export interface ColorTheme {
  id: string;
  /** 切り替えた言語で読み直せるよう getter。中身は i18n 辞書から引く */
  readonly label: string;
  /** 本体の塗り */
  fill: ColorSpec;
  /** 外→内の順。デコテンプレが必要なぶんだけ拾う */
  strokes: ColorSpec[];
  background: BackgroundSpec;
  /** 影・グロー等の単色が要る場面で使う */
  accent: string;
  /** 想定する背景の明るさ */
  tone: 'dark' | 'light' | 'any';
}

const RAINBOW: ColorSpec = { kind: 'rainbow', saturation: 1, lightness: 0.5, cycles: 1, speed: 1, angle: 0 };

export const COLOR_THEMES: ColorTheme[] = [
  {
    id: 'rainbow-gold',
    get label() { return t('theme.rainbow-gold'); },
    fill: RAINBOW,
    strokes: [{ kind: 'metal', base: 'gold', angle: 90 }, { kind: 'solid', color: '#ffffff' }],
    background: { kind: 'transparent' },
    accent: '#2b1a00',
    tone: 'any',
  },
  {
    id: 'rainbow-black',
    get label() { return t('theme.rainbow-black'); },
    fill: RAINBOW,
    strokes: [{ kind: 'solid', color: '#000000' }, { kind: 'solid', color: '#ffffff' }],
    background: { kind: 'transparent' },
    accent: '#000000',
    tone: 'any',
  },
  {
    id: 'gold-lux',
    get label() { return t('theme.gold-lux'); },
    fill: { kind: 'metal', base: 'gold', angle: 90 },
    strokes: [{ kind: 'solid', color: '#3b2400' }, { kind: 'solid', color: '#ffe9a0' }],
    background: { kind: 'transparent' },
    accent: '#3b2400',
    tone: 'any',
  },
  {
    id: 'pastel-pop',
    get label() { return t('theme.pastel-pop'); },
    fill: { kind: 'linear', stops: [{ at: 0, color: '#ffd1dc' }, { at: 1, color: '#c1e7ff' }], angle: 90, scrollSpeed: 0 },
    strokes: [{ kind: 'solid', color: '#3a2b4a' }, { kind: 'solid', color: '#ffffff' }],
    background: { kind: 'transparent' },
    accent: '#3a2b4a',
    tone: 'any',
  },
  {
    id: 'fire',
    get label() { return t('theme.fire'); },
    fill: { kind: 'linear', stops: [{ at: 0, color: '#ffe259' }, { at: 1, color: '#ff512f' }], angle: 90, scrollSpeed: 0 },
    strokes: [{ kind: 'solid', color: '#4a1500' }, { kind: 'solid', color: '#ffd08a' }],
    background: { kind: 'transparent' },
    accent: '#ff512f',
    tone: 'any',
  },
  {
    id: 'ice',
    get label() { return t('theme.ice'); },
    fill: { kind: 'linear', stops: [{ at: 0, color: '#e0f7ff' }, { at: 1, color: '#2196f3' }], angle: 90, scrollSpeed: 0 },
    strokes: [{ kind: 'solid', color: '#0b3a5c' }, { kind: 'solid', color: '#ffffff' }],
    background: { kind: 'transparent' },
    accent: '#2196f3',
    tone: 'any',
  },
  {
    id: 'blood',
    get label() { return t('theme.blood'); },
    fill: { kind: 'linear', stops: [{ at: 0, color: '#ff4d4d' }, { at: 1, color: '#7a0000' }], angle: 90, scrollSpeed: 0 },
    strokes: [{ kind: 'solid', color: '#12060a' }, { kind: 'solid', color: '#c98b8b' }],
    background: { kind: 'transparent' },
    accent: '#7a0000',
    tone: 'any',
  },
  {
    id: 'mono',
    get label() { return t('theme.mono'); },
    fill: { kind: 'solid', color: '#ffffff' },
    strokes: [{ kind: 'solid', color: '#000000' }, { kind: 'solid', color: '#8a8a8a' }],
    background: { kind: 'transparent' },
    accent: '#000000',
    tone: 'any',
  },
];

export function getTheme(id: string): ColorTheme {
  return COLOR_THEMES.find((t) => t.id === id) ?? COLOR_THEMES[0];
}

const stroke = (theme: ColorTheme, i: number): ColorSpec => theme.strokes[i] ?? theme.strokes[theme.strokes.length - 1] ?? { kind: 'solid', color: '#000000' };

/* ------------------------------------------------------------------ */
/* 軸2: 文字装飾テンプレ（text.decorations を差し替える）                 */
/* ------------------------------------------------------------------ */

export interface DecoTemplate {
  id: string;
  readonly label: string;
  /** 相性ヒント。禁止ではなく警告に使う */
  compatible: { background: 'dark' | 'light' | 'any' };
  /** 透過背景では成立しないテンプレ（くり抜き系） */
  needsOpaqueBackground?: boolean;
  build(theme: ColorTheme): TextDecoSpec[];
}

export const DECO_TEMPLATES: DecoTemplate[] = [
  {
    id: 'outline-gold',
    get label() { return t('deco.outline-gold'); },
    compatible: { background: 'any' },
    build: (th) => [
      { type: 'stroke', widthRatio: 0.1, color: stroke(th, 0) },
      { type: 'stroke', widthRatio: 0.04, color: stroke(th, 1) },
      { type: 'fill', color: th.fill },
    ],
  },
  {
    id: 'outline-simple',
    get label() { return t('deco.outline-simple'); },
    compatible: { background: 'any' },
    build: (th) => [
      { type: 'stroke', widthRatio: 0.09, color: stroke(th, 0) },
      { type: 'fill', color: th.fill },
    ],
  },
  {
    id: 'extrude-3d',
    get label() { return t('deco.extrude-3d'); },
    compatible: { background: 'any' },
    build: (th) => [
      { type: 'extrude', depth: 0.09, angle: 60, color: stroke(th, 0) },
      { type: 'stroke', widthRatio: 0.05, color: stroke(th, 0) },
      { type: 'fill', color: th.fill },
    ],
  },
  {
    id: 'neon',
    get label() { return t('deco.neon'); },
    compatible: { background: 'dark' },
    build: (th) => [
      { type: 'glow', color: th.fill, radius: 0.22, passes: 3, intensity: 1.5 },
      { type: 'stroke', widthRatio: 0.025, color: th.fill },
      { type: 'fill', color: { kind: 'solid', color: '#ffffff' } },
    ],
  },
  {
    id: 'hard-shadow',
    get label() { return t('deco.hard-shadow'); },
    compatible: { background: 'any' },
    build: (th) => [
      { type: 'shadow', blur: 0, offset: { x: 0.07, y: 0.07 }, color: th.accent, opacity: 1 },
      { type: 'stroke', widthRatio: 0.07, color: stroke(th, 0) },
      { type: 'fill', color: th.fill },
    ],
  },
  {
    id: 'sticker',
    get label() { return t('deco.sticker'); },
    compatible: { background: 'any' },
    build: (th) => [
      { type: 'shadow', blur: 0.05, offset: { x: 0.02, y: 0.04 }, color: '#000000', opacity: 0.45 },
      { type: 'stroke', widthRatio: 0.14, color: { kind: 'solid', color: '#ffffff' } },
      { type: 'stroke', widthRatio: 0.05, color: stroke(th, 0) },
      { type: 'fill', color: th.fill },
    ],
  },
  {
    id: 'glitch',
    get label() { return t('deco.glitch'); },
    compatible: { background: 'dark' },
    build: (th) => [
      { type: 'stroke', widthRatio: 0.06, color: stroke(th, 0) },
      { type: 'offsetCopy', offset: { x: -0.03, y: 0 }, color: '#ff0044', blend: 'screen', jitter: 0.012 },
      { type: 'offsetCopy', offset: { x: 0.03, y: 0 }, color: '#00e5ff', blend: 'screen', jitter: 0.012 },
      { type: 'fill', color: th.fill },
    ],
  },
  {
    id: 'stripe',
    get label() { return t('deco.stripe'); },
    compatible: { background: 'any' },
    build: (th) => [
      { type: 'stroke', widthRatio: 0.1, color: stroke(th, 0) },
      { type: 'stroke', widthRatio: 0.04, color: stroke(th, 1) },
      { type: 'pattern', kind: 'stripe', colors: ['#ffffff', '#ff3355'], scale: 0.16, angle: 45, scrollSpeed: 1 },
    ],
  },
  {
    id: 'knockout',
    get label() { return t('deco.knockout'); },
    compatible: { background: 'any' },
    needsOpaqueBackground: true,
    build: () => [{ type: 'knockout' }],
  },
];

export function getDecoTemplate(id: string): DecoTemplate {
  return DECO_TEMPLATES.find((d) => d.id === id) ?? DECO_TEMPLATES[0];
}

/* ------------------------------------------------------------------ */
/* 軸3: 演出テンプレ（layers + motion を差し替える）                     */
/* ------------------------------------------------------------------ */

export interface EffectTemplate {
  id: string;
  readonly label: string;
  layers: LayerSpec[];
}

export const EFFECT_TEMPLATES: EffectTemplate[] = [
  { id: 'none', get label() { return t('effect.none'); }, layers: [] },
  {
    id: 'radiate',
    get label() { return t('effect.radiate'); },
    layers: [{ type: 'radiate', z: 'back', params: { count: 48, minLen: 0.1, maxLen: 0.3, width: 0.012, gap: 0.02, groups: 2, pulse: true, colorMode: 'rainbow', jitter: 0.3 } }],
  },
  {
    id: 'sparkle',
    get label() { return t('effect.sparkle'); },
    layers: [{ type: 'sparkle', z: 'front', params: { count: 16, size: 0.07, twinkleSpeed: 2, color: '#fffbe6' } }],
  },
  {
    id: 'confetti',
    get label() { return t('effect.confetti'); },
    layers: [{ type: 'confetti', z: 'front', params: { count: 28, speed: 1, size: 0.035 } }],
  },
  {
    id: 'ring',
    get label() { return t('effect.ring'); },
    layers: [{ type: 'ring', z: 'back', params: { count: 3, speed: 1, width: 0.012, color: '#ffffff' } }],
  },
];

/** 文字の動き。種類を切り替えたときの既定の大きさ（0 のままだと何も起きない） */
export const MOTION_DEFAULT_AMOUNT: Record<MotionSpec['type'], number> = {
  none: 0,
  pulse: 0.05,
  bounce: 0.04,
  shake: 0.02,
  rotate: 1,
  wave: 0.08,
};

export function applyMotion(params: RenderParams, type: MotionSpec['type'], amount?: number): RenderParams {
  return {
    ...params,
    motion: { type, amount: amount ?? (params.motion.type === type ? params.motion.amount : MOTION_DEFAULT_AMOUNT[type]) },
    // 波打ちだけは1文字ずつ位相をずらす必要がある
    text: { ...params.text, perChar: type === 'wave' },
  };
}

export function getEffect(id: string): EffectTemplate {
  return EFFECT_TEMPLATES.find((e) => e.id === id) ?? EFFECT_TEMPLATES[0];
}

/* ------------------------------------------------------------------ */
/* レシピ = 3軸のセット。ギャラリーの入口                                 */
/* ------------------------------------------------------------------ */

export type RecipeCategory = 'coc' | 'general' | 'style';

/* 値は i18n key。表示側で t() を通す。 */
export const RECIPE_CATEGORY_LABELS: Record<RecipeCategory, string> = {
  coc: 'category.coc',
  general: 'category.general',
  style: 'category.style',
};

export interface Recipe {
  id: string;
  readonly label: string;
  readonly text: string;
  fontId: string;
  decoId: string;
  themeId: string;
  effectId: string;
  motion?: MotionSpec;
  category: RecipeCategory;
}

export const RECIPES: Recipe[] = [
  { id: 'success', get label() { return t('recipe.success'); }, get text() { return t('recipe.success.text'); }, fontId: 'reggae', decoId: 'outline-gold', themeId: 'rainbow-gold', effectId: 'radiate', category: 'coc' },
  { id: 'critical', get label() { return t('recipe.critical'); }, get text() { return t('recipe.critical.text'); }, fontId: 'reggae', decoId: 'outline-gold', themeId: 'rainbow-gold', effectId: 'radiate', motion: { type: 'pulse', amount: 0.05 }, category: 'coc' },
  { id: 'failure', get label() { return t('recipe.failure'); }, get text() { return t('recipe.failure.text'); }, fontId: 'shippori-b1', decoId: 'outline-simple', themeId: 'blood', effectId: 'none', motion: { type: 'shake', amount: 0.02 }, category: 'coc' },
  { id: 'fumble', get label() { return t('recipe.fumble'); }, get text() { return t('recipe.fumble.text'); }, fontId: 'shippori-b1', decoId: 'hard-shadow', themeId: 'blood', effectId: 'none', motion: { type: 'shake', amount: 0.02 }, category: 'coc' },
  { id: 'madness', get label() { return t('recipe.madness'); }, get text() { return t('recipe.madness.text'); }, fontId: 'shippori-b1', decoId: 'glitch', themeId: 'blood', effectId: 'none', category: 'coc' },
  { id: 'secret', get label() { return t('recipe.secret'); }, get text() { return t('recipe.secret.text'); }, fontId: 'noto-black', decoId: 'outline-simple', themeId: 'mono', effectId: 'none', category: 'coc' },
  { id: 'victory', get label() { return t('recipe.victory'); }, get text() { return t('recipe.victory.text'); }, fontId: 'reggae', decoId: 'extrude-3d', themeId: 'gold-lux', effectId: 'sparkle', motion: { type: 'pulse', amount: 0.03 }, category: 'general' },
  { id: 'defeat', get label() { return t('recipe.defeat'); }, get text() { return t('recipe.defeat.text'); }, fontId: 'shippori-b1', decoId: 'outline-simple', themeId: 'mono', effectId: 'none', category: 'general' },
  { id: 'cyber', get label() { return t('recipe.cyber'); }, get text() { return t('recipe.cyber.text'); }, fontId: 'dotgothic', decoId: 'neon', themeId: 'ice', effectId: 'ring', category: 'style' },
  { id: 'pop', get label() { return t('recipe.pop'); }, get text() { return t('recipe.pop.text'); }, fontId: 'mplus-round', decoId: 'sticker', themeId: 'pastel-pop', effectId: 'confetti', motion: { type: 'bounce', amount: 0.03 }, category: 'style' },
  { id: 'retro', get label() { return t('recipe.retro'); }, get text() { return t('recipe.retro.text'); }, fontId: 'dotgothic', decoId: 'hard-shadow', themeId: 'fire', effectId: 'sparkle', motion: { type: 'pulse', amount: 0.03 }, category: 'style' },
  { id: 'stripe-pop', get label() { return t('recipe.stripe-pop'); }, get text() { return t('recipe.stripe-pop.text'); }, fontId: 'mplus-round', decoId: 'stripe', themeId: 'rainbow-black', effectId: 'none', motion: { type: 'wave', amount: 0.08 }, category: 'style' },
  { id: 'kp-trouble', get label() { return t('recipe.kp-trouble'); }, get text() { return t('recipe.kp-trouble.text'); }, fontId: 'reggae', decoId: 'outline-gold', themeId: 'rainbow-gold', effectId: 'radiate', category: 'general' },
  { id: 'handwrite', get label() { return t('recipe.handwrite'); }, get text() { return t('recipe.handwrite.text'); }, fontId: 'rocknroll', decoId: 'outline-simple', themeId: 'ice', effectId: 'none', motion: { type: 'wave', amount: 0.08 }, category: 'style' },
];

/* ------------------------------------------------------------------ */

export interface BuildInput {
  text: string;
  fontId: string;
  decoId: string;
  themeId: string;
  effectId: string;
  motion?: MotionSpec;
  canvas?: { w: number; h: number };
  frameCount?: number;
  fps?: number;
  seed?: number;
}

/** 3軸 + テキストから RenderParams を組む */
export function buildParams(input: BuildInput, base?: RenderParams): RenderParams {
  const theme = getTheme(input.themeId);
  const deco = getDecoTemplate(input.decoId);
  const effect = getEffect(input.effectId);
  const prev = base ?? DEFAULT_PARAMS;
  return {
    ...prev,
    version: 1,
    canvas: input.canvas ?? prev.canvas,
    frameCount: input.frameCount ?? prev.frameCount,
    fps: input.fps ?? prev.fps,
    seed: input.seed ?? prev.seed,
    background: backgroundFor(theme, deco),
    text: {
      ...prev.text,
      lines: input.text.split('\n'),
      fontId: input.fontId,
      decorations: deco.build(theme),
      perChar: input.motion?.type === 'wave',
    },
    layers: effect.layers.map((l) => ({ ...l, params: { ...l.params } })),
    motion: input.motion ? { ...input.motion } : { type: 'none', amount: 0 },
  };
}

/** 文字装飾テンプレを適用する（カラーテーマは据え置き） */
/** くり抜き系は透過背景だと消えるだけになるので、テーマの塗りを背景に回す */
function backgroundFor(theme: ColorTheme, deco: DecoTemplate): BackgroundSpec {
  if (deco.needsOpaqueBackground && theme.background.kind === 'transparent') return theme.fill;
  return theme.background;
}

export function applyDeco(params: RenderParams, decoId: string, themeId: string): RenderParams {
  const theme = getTheme(themeId);
  const deco = getDecoTemplate(decoId);
  return {
    ...params,
    background: backgroundFor(theme, deco),
    text: { ...params.text, decorations: deco.build(theme) },
  };
}

/** カラーテーマを適用する（背景も追従する） */
export function applyTheme(params: RenderParams, themeId: string, decoId: string): RenderParams {
  const theme = getTheme(themeId);
  const deco = getDecoTemplate(decoId);
  return {
    ...params,
    background: backgroundFor(theme, deco),
    text: { ...params.text, decorations: deco.build(theme) },
  };
}

/** 演出テンプレを適用する（レイヤーとモーションを差し替える） */
export function applyEffect(params: RenderParams, effectId: string): RenderParams {
  const e = getEffect(effectId);
  return { ...params, layers: e.layers.map((l) => ({ ...l, params: { ...l.params } })) };
}

/** ギャラリー用。レシピ1件を既定キャンバスで組む */
export function recipeParams(recipe: Recipe): RenderParams {
  return buildParams({ ...recipe }, DEFAULT_PARAMS);
}

export const DEFAULT_PARAMS: RenderParams = {
  version: 1,
  canvas: { w: 480, h: 480 },
  frameCount: 15,
  fps: 20,
  seed: 12345,
  background: { kind: 'transparent' },
  text: {
    lines: [t('recipe.success.text')],
    fontId: 'reggae',
    scale: 1,
    lineHeight: 1.1,
    letterSpacing: 0.02,
    decorations: getDecoTemplate('outline-gold').build(getTheme('rainbow-gold')),
    perChar: false,
  },
  layers: getEffect('radiate').layers.map((l) => ({ ...l, params: { ...l.params } })),
  motion: { type: 'none', amount: 0 },
  output: { format: 'apng', colors: 256, budgetBytes: 1_000_000, matte: null },
};

/** 一括書き出し用の文言プリセット */
export const TEXT_PRESETS: Array<{ id: string; readonly label: string; readonly items: string[] }> = [
  {
    id: 'coc',
    get label() { return t('textPreset.coc'); },
    get items() {
      return ['critical', 'success', 'failure', 'fumble', 'madness', 'secret'].map((id) => t(`recipe.${id}.text`));
    },
  },
  { id: 'simple', get label() { return t('textPreset.simple'); }, get items() { return [t('recipe.success.text'), t('recipe.failure.text')]; } },
  { id: 'battle', get label() { return t('textPreset.battle'); }, get items() { return [t('recipe.victory.text'), t('recipe.defeat.text')]; } },
  { id: 'kp', get label() { return t('textPreset.kp'); }, get items() { return [t('recipe.kp-trouble.text')]; } },
];
