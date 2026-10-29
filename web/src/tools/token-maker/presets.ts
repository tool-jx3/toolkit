/**
 * 外觀的預設：
 * - token-workshop 的 18 組外觀（MIT；名稱翻成繁中）：只換外框的部分（樣式、顏色、寬度、參數、質感、光照），
 *   其他（背景、邊距、名字、徽章、效果）不變——同原作的「套用外觀」。
 * - eidolon-ui 的 5 組範例（MIT）：整組外觀（外框、平塗的顏色、光暈、背景、名字與徽章的樣式、效果）。
 *   原作套用範例時會把目前的圖換成它的吉祥物範例圖（不收，規格 D4），這裡只套外觀。
 * - 我的預設：存目前整組外觀（可以含匯出設定）。
 * 另有「隨機」（token-workshop 的 Shuffle）。
 */
import { frameDefaults } from './frames';
import {
  DEFAULT_FX,
  type ExportFormat,
  type Fx,
  GRADIENTS,
  type Look,
  METALS,
  normalizeLook,
  RELIEF_FRAMES,
  TEXTURE_AMOUNT,
  TEXTURE_IDS,
  type TextureId,
} from './model';

/** 浮雕環的外觀會換掉的欄位（token-workshop 的 RING_KEYS） */
export const RING_FIELDS = [
  'frame',
  'color',
  'colorKey',
  'colorMode',
  'accent',
  'width',
  'count',
  'depth',
  'lineW',
  'texture',
  'texAmount',
  'texScale',
  'texSeed',
  'energy',
  'g1',
  'g2',
  'gAngle',
  'lightAngle',
  'lightStrength',
  'texRotate',
] as const satisfies readonly (keyof Look)[];

/** 浮雕環外觀的基準（token-workshop 的 RING_DEFAULT） */
const RING_BASE: Partial<Look> = {
  frame: 'plain',
  color: '#d9a521',
  colorKey: 'gold',
  colorMode: 'solid',
  accent: '#2b2d33',
  width: 11,
  texture: 'none',
  texAmount: 60,
  texScale: 100,
  texSeed: 1,
  energy: '#5ec8ff',
  g1: '#ff8a1f',
  g2: '#7a0c10',
  gAngle: 45,
  lightAngle: 135,
  lightStrength: 100,
  texRotate: 0,
};

export interface LookPreset {
  id: string;
  name: string;
  kind: 'ring' | 'example' | 'mine';
  /** 套用時換掉的欄位 */
  patch: Partial<Look>;
  /** 我的預設：匯出設定（勾了才有） */
  output?: { sizeChoice: number | 'custom'; customSize: number; format: ExportFormat };
  savedAt?: number;
}

const ring = (id: string, name: string, p: Partial<Look>): LookPreset => {
  const frame = (p.frame ?? 'plain') as Look['frame'];
  return {
    id,
    name,
    kind: 'ring',
    patch: { ...RING_BASE, ...frameDefaults(frame), ...p },
  };
};

/** token-workshop 的 18 組外觀 */
export const RING_PRESETS: readonly LookPreset[] = [
  ring('gold-gear', '金色齒輪', {
    frame: 'gear',
    color: '#d9a521',
    colorKey: 'gold',
    width: 12,
    count: 24,
    depth: 55,
  }),
  ring('granite-facets', '花崗岩切面', {
    frame: 'facet',
    color: '#7d7f84',
    colorKey: 'granite',
    accent: '#4a4c50',
    texture: 'stone',
    texAmount: 90,
    width: 14,
    count: 8,
    depth: 50,
  }),
  ring('scratched-steel', '刮痕鋼環', {
    frame: 'plain',
    color: '#8a9199',
    colorKey: 'steel',
    texture: 'scratched',
    texAmount: 90,
    width: 11,
  }),
  ring('hammered-copper', '鎚目紅銅', {
    frame: 'scallop',
    color: '#b4693c',
    colorKey: 'copper',
    texture: 'hammered',
    texAmount: 85,
    width: 12,
    count: 18,
    depth: 50,
  }),
  ring('enemy-thorns', '敵人的尖刺', {
    frame: 'thorns',
    colorMode: 'gradient',
    g1: '#ff8a1f',
    g2: '#7a0c10',
    gAngle: 45,
    colorKey: 'enemy',
    width: 13,
    count: 20,
    depth: 70,
  }),
  ring('dragon-flames', '龍焰', {
    frame: 'flames',
    colorMode: 'gradient',
    g1: '#ffd23f',
    g2: '#b3111a',
    gAngle: 90,
    colorKey: 'lava',
    width: 18,
    count: 14,
    depth: 75,
  }),
  ring('ally-scallop', '同伴的花邊', {
    frame: 'scallop',
    color: '#1e8a4c',
    colorKey: 'emerald',
    width: 12,
    count: 18,
    depth: 50,
  }),
  ring('oak-iron', '橡木與鐵', {
    frame: 'studs',
    color: '#7a5230',
    colorKey: 'wood',
    accent: '#3c4148',
    texture: 'wood',
    texAmount: 70,
    width: 16,
    count: 16,
    depth: 55,
  }),
  ring('chain-guard', '鎖鏈護衛', {
    frame: 'chain',
    color: '#b5bcc6',
    colorKey: 'silver',
    accent: '#2b2d33',
    texture: 'scratched',
    texAmount: 60,
    width: 15,
    count: 28,
    depth: 50,
  }),
  ring('royal-gems', '王家寶石', {
    frame: 'gems',
    color: '#d9a521',
    colorKey: 'gold',
    accent: '#b3202e',
    width: 16,
    count: 12,
    depth: 50,
  }),
  ring('arcane-energy', '奧術能量', {
    frame: 'plain',
    colorMode: 'gradient',
    g1: '#b36cff',
    g2: '#1a2a8c',
    gAngle: 45,
    colorKey: 'arcane',
    texture: 'energy',
    texAmount: 85,
    energy: '#c7b3ff',
    width: 13,
  }),
  ring('frost-scales', '冰霜鱗片', {
    frame: 'scales',
    color: '#8fd3f0',
    colorKey: 'ice',
    width: 14,
    count: 22,
    depth: 40,
  }),
  ring('royal-braid', '王家編織', {
    frame: 'braid',
    color: '#d9a521',
    colorKey: 'gold',
    accent: '#2a1b4d',
    width: 13,
    count: 10,
    depth: 60,
  }),
  ring('bone-runes', '骨之符文', {
    frame: 'tally',
    color: '#d9cdb0',
    colorKey: 'bone',
    accent: '#b3202e',
    width: 14,
    count: 40,
    depth: 70,
  }),
  ring('lava-rope', '熔岩繩索', {
    frame: 'rope',
    color: '#e2571e',
    colorKey: 'custom',
    texture: 'liquid',
    texAmount: 50,
    width: 12,
    count: 44,
    depth: 50,
  }),
  ring('iron-guard', '鐵衛', {
    frame: 'segments',
    color: '#5a6068',
    colorKey: 'iron',
    accent: '#b5bcc6',
    width: 12,
    count: 16,
  }),
  ring('slate-twin', '板岩雙線', {
    frame: 'twin',
    color: '#4a5560',
    colorKey: 'slate',
    accent: '#1c2127',
    texture: 'stone',
    texAmount: 80,
    width: 12,
    depth: 50,
  }),
  ring('sapphire-moire', '藍寶石波紋', {
    frame: 'moire',
    color: '#2457b8',
    colorKey: 'sapphire',
    accent: '#12285a',
    width: 14,
    count: 9,
    depth: 50,
  }),
];

/** eidolon-ui 的範例：從它的預設樣式（平塗的霓虹、全部光暈、深色背景）開始 */
const EXAMPLE_BASE: Partial<Look> = {
  frame: 'ring',
  colorMode: 'solid',
  color: '#00f0ff',
  colorKey: 'n-cyan',
  accentOn: false,
  accent: '#fcee0a',
  width: 8,
  lightStrength: 0,
  texture: 'none',
  opacity: 100,
  glow: 'all',
  bg: 'color',
  bgColor: '#0b0b10',
  labelOn: false,
  labelStyle: 'plate',
  plateFrom: 'frame',
  plateColor: '#00f0ff',
  labelFrom: 'custom',
  labelColor: '#050507',
  badgeOn: true,
  badgeFrom: 'accent',
  badgeColor: '#fcee0a',
  badgeTextFrom: 'auto',
  badgeTextColor: '#050507',
  labelX: 0,
  labelY: 0.8,
  badgeX: 0.74,
  badgeY: 0.74,
};

const example = (id: string, name: string, p: Partial<Look>, fx: Partial<Fx> = {}): LookPreset => ({
  id,
  name,
  kind: 'example',
  patch: { ...EXAMPLE_BASE, ...p, fx: { ...DEFAULT_FX, ...fx } },
});

export const EXAMPLE_PRESETS: readonly LookPreset[] = [
  example('pc', 'PC', {
    frame: 'ring',
    color: '#00f0ff',
    colorKey: 'n-cyan',
    accentOn: true,
    accent: '#fcee0a',
    glow: 'all',
    labelOn: true,
    labelStyle: 'arc',
  }),
  example('enemy', '敵人', {
    frame: 'ring',
    color: '#ff003c',
    colorKey: 'n-red',
    glow: 'outer',
    bgColor: '#14050a',
    labelOn: false,
    badgeFrom: 'custom',
    badgeColor: '#ff003c',
  }),
  example('npc', 'NPC', {
    frame: 'hex',
    color: '#e8e8ee',
    colorKey: 'custom',
    width: 6,
    glow: 'off',
    labelOn: true,
    labelStyle: 'plate',
  }),
  example(
    'boss',
    '頭目',
    {
      frame: 'arcs',
      color: '#fcee0a',
      colorKey: 'n-yellow',
      accentOn: true,
      accent: '#ff003c',
      width: 11,
      glow: 'all',
      labelOn: true,
      labelStyle: 'arc',
    },
    { on: true, vig: true, vigColor: '#ff003c', vigAmt: 45 },
  ),
  example(
    'netrunner',
    '駭客',
    {
      frame: 'clip',
      color: '#39ff14',
      colorKey: 'n-green',
      accentOn: true,
      accent: '#00f0ff',
      glow: 'inner',
      labelOn: true,
      labelStyle: 'plate',
    },
    { on: true, tone: 'neon', toneMix: 35, scan: true, scanAmt: 30, scanGap: 4 },
  ),
];

/** 套用預設：patch 蓋在目前的外觀上（字型、效果複製一份） */
export function applyPreset(look: Look, p: LookPreset): Look {
  const merged = { ...look, ...p.patch } as Look;
  return normalizeLook({ ...merged, fx: { ...merged.fx }, font: { ...merged.font } });
}

/** 目前的外觀和這組預設相同嗎（只比預設有的欄位） */
export function presetMatches(look: Look, p: LookPreset): boolean {
  const target = applyPreset(look, p);
  return JSON.stringify(target) === JSON.stringify(normalizeLook(look));
}

/** 存成我的預設：整組外觀（自訂外框的圖不在裡面；套用時沒有自訂外框就回到單純） */
export function presetFromLook(
  id: string,
  name: string,
  look: Look,
  output?: LookPreset['output'],
): LookPreset {
  const patch: Partial<Look> = normalizeLook(look);
  return { id, name, kind: 'mine', patch, ...(output ? { output } : {}), savedAt: Date.now() };
}

/* ---------- 隨機（token-workshop 的 Shuffle） ---------- */

export function shufflePatch(rand: () => number = Math.random): Partial<Look> {
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rand() * a.length)];
  const between = (a: number, b: number) => a + rand() * (b - a);
  const frame = pick(RELIEF_FRAMES);
  const d = frameDefaults(frame);
  const metal = pick(METALS);
  const grad = rand() < 0.3 ? pick(GRADIENTS) : null;
  const tex: TextureId = rand() < 0.45 ? pick(TEXTURE_IDS.slice(1)) : 'none';
  return {
    frame,
    colorMode: grad ? 'gradient' : 'solid',
    color: metal.hex,
    colorKey: grad ? grad.key : metal.key,
    g1: grad ? grad.from : '#ff8a1f',
    g2: grad ? grad.to : '#7a0c10',
    gAngle: grad ? grad.angle : 45,
    accent: pick(METALS).hex,
    width: Math.round(between(9, 16)),
    count: Math.round(d.count * between(0.75, 1.3)),
    depth: Math.round(between(35, 80)),
    lineW: d.lineW,
    texture: tex,
    texAmount: tex === 'none' ? 60 : TEXTURE_AMOUNT[tex],
    texRotate: rand() < 0.5 ? 0 : 90,
    lightAngle: Math.round(rand() * 360),
    texSeed: 1 + Math.floor(rand() * 9999),
    energy: pick(['#5ec8ff', '#c7b3ff', '#ffd36b', '#7dff9b']),
  };
}

export const PRESET_MAX = 30;
export const PRESET_NAME_MAX = 24;
