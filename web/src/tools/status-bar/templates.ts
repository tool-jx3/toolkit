/**
 * 範本（本專案自做的繁中範本）：每個範本只寫和預設外觀不同的地方；套用時以「預設值＋範本」整批換掉，
 * 再保留條數、隱藏多餘的條、每條的名稱覆寫與危急勾選、角色清單、房間網址、檔名（規格 F02）。
 */
import { applyTemplate, type DeepPartial } from '@/core/storage';
import {
  type BarSlot,
  DEFAULT_SETTINGS,
  type ItemKind,
  normalizeSettings,
  type Settings,
  type SymbolKind,
} from './settings';

export interface StatusTemplate {
  id: string;
  name: string;
  /** 一句話說明 */
  description: string;
  data: DeepPartial<Settings>;
}

/** 套用範本時保留的設定（規格 F02） */
export const TEMPLATE_KEEP = [
  'barCount',
  'hideExtra',
  'bars.*.label',
  'bars.*.critical',
  'characters',
  'room',
  'fileName',
] as const;

type Pair = readonly [string, string];

/** 8 條的顏色＋符號＋道具（名稱覆寫與危急勾選套用時保留目前的值） */
function bars(
  colors: readonly Pair[],
  symbols: readonly SymbolKind[] = [],
  items: readonly ItemKind[] = [],
): DeepPartial<BarSlot>[] {
  return Array.from({ length: 8 }, (_, i) => {
    const [color1, color2] = colors[i % colors.length];
    const d = DEFAULT_SETTINGS.bars[i];
    return {
      color1,
      color2,
      symbol: symbols[i] ?? d.symbol,
      item: items[i] ?? d.item,
      label: '',
      critical: true,
    };
  });
}

const g = (family: string) => ({ source: 'google' as const, family });

export const TEMPLATES: readonly StatusTemplate[] = [
  {
    id: 'basic',
    name: '基本',
    description: '深色底槽、圓角、由上而下的漸層，文字壓在條上。適合任何畫面的預設款。',
    data: {},
  },
  {
    id: 'thin',
    name: '細線極簡',
    description: '細長的膠囊條、名稱加底線，標籤與數值放在條的上方，不搶畫面。',
    data: {
      barHeight: 8,
      barGap: 10,
      textPos: 'top',
      textGap: 4,
      shape: 'pill',
      border: { width: 0 },
      trough: { kind: 'dark', color: '#ffffff2e' },
      fill: 'solid',
      shadow: 25,
      text: { labelSize: 14, currentSize: 16, maxSize: 11, weight: 500, spacing: 0.06 },
      name: { look: 'underline', size: 16, weight: 500, accent: '#ffffff' },
      critical: { pulse: false, blink: true },
      bars: bars([
        ['#ff8a80', '#ff8a80'],
        ['#82b1ff', '#82b1ff'],
        ['#b388ff', '#b388ff'],
        ['#69f0ae', '#69f0ae'],
        ['#ffd180', '#ffd180'],
        ['#84ffff', '#84ffff'],
        ['#ff80ab', '#ff80ab'],
        ['#cfd8dc', '#cfd8dc'],
      ]),
    },
  },
  {
    id: 'hud',
    name: '科幻介面',
    description: '切角的發光條、等寬數字與刻度、掃描線，四角括號像戰術面板。',
    data: {
      textPos: 'three',
      labelWidth: 56,
      valueWidth: 90,
      barHeight: 22,
      barGap: 8,
      shape: 'chamfer',
      cut: 7,
      border: { width: 1, color: '#7df9ffa6' },
      trough: { kind: 'mix', color: '#03101acc', mix: 18 },
      fill: 'neon',
      shadow: 0,
      text: {
        labelFont: g('Rajdhani'),
        valueFont: g('Orbitron'),
        weight: 700,
        labelSize: 16,
        currentSize: 17,
        maxSize: 11,
        spacing: 0.08,
        color: '#e6fdff',
        maxColor: '#7df9ffb3',
        labelBarColor: true,
        outline: 'glow',
        outlineColor: '#00e5ff73',
      },
      name: {
        look: 'tab',
        font: g('Noto Sans TC'),
        size: 15,
        color: '#021015',
        accent: '#7df9ff',
      },
      glow: { on: true, spread: 8, strength: 55 },
      scanlines: { on: true, strength: 22, period: 3 },
      ticks: { on: true, count: 10, color: '#e6fdff', strength: 45 },
      brackets: { on: true, color: '#7df9ff', strength: 85, length: 7, width: 2, gap: 4 },
      frame: {
        on: true,
        kind: 'corners',
        width: 2,
        color: '#7df9ff',
        opacity: 70,
        gap: 6,
        corner: 18,
      },
      critical: { color: '#ff3d6e', barColor: true },
      red: { color: '#ff7a9a' },
      bars: bars(
        [
          ['#00e5ff', '#004a59'],
          ['#7c8cff', '#1c2266'],
          ['#c77dff', '#3a1466'],
          ['#3dffa8', '#0b5937'],
          ['#ffd23d', '#594500'],
          ['#3dd9ff', '#0b4459'],
          ['#ff7ad9', '#59143f'],
          ['#b0c4d4', '#2c3a45'],
        ],
        ['heart', 'bolt', 'eye', 'shield', 'star', 'drop', 'moon', 'gem'],
      ),
    },
  },
  {
    id: 'parchment',
    name: '羊皮紙',
    description: '舊紙質感的面板、明體字與墨色條，適合奇幻或古典的劇本。',
    data: {
      barHeight: 26,
      barGap: 8,
      textPos: 'two',
      labelWidth: 48,
      shape: 'round',
      radius: 3,
      border: { width: 1, color: '#3b2a1a99' },
      trough: { kind: 'dark', color: '#3b2a1a40' },
      fill: 'vgrad',
      shadow: 0,
      text: {
        labelFont: g('Noto Serif TC'),
        valueFont: g('Noto Serif TC'),
        weight: 700,
        labelSize: 16,
        currentSize: 16,
        maxSize: 12,
        color: '#2b1d10',
        maxColor: '#2b1d10b3',
        outline: 'none',
      },
      name: {
        look: 'underline',
        font: g('Noto Serif TC'),
        weight: 900,
        size: 19,
        color: '#2b1d10',
        accent: '#7a1f1f',
      },
      panel: {
        on: true,
        color: '#efe2c4f2',
        radius: 4,
        padding: 12,
        borderWidth: 1,
        borderColor: '#5a3d1e',
        borderOpacity: 45,
        texture: 'paper',
      },
      red: { color: '#a51d1d' },
      critical: { color: '#b3261e', pulse: false, blink: true },
      bars: bars([
        ['#a63a2b', '#5c1d14'],
        ['#2f5d8a', '#17304a'],
        ['#5c3f80', '#2f1f45'],
        ['#4d7a3a', '#26401c'],
        ['#a6782b', '#5c4014'],
        ['#2b7a7a', '#144040'],
        ['#8a2f5d', '#4a1730'],
        ['#6b6256', '#3a342c'],
      ]),
    },
  },
  {
    id: 'wafu',
    name: '和風墨韻',
    description: '斜切的條、楷書字型與朱紅、靛藍配色，名稱直書放在左側。',
    data: {
      barHeight: 24,
      barGap: 7,
      barWidth: 300,
      shape: 'slant',
      skew: 10,
      border: { width: 1, color: '#f5ead680' },
      trough: { kind: 'dark', color: '#1a1410cc' },
      fill: 'gloss',
      text: {
        labelFont: g('LXGW WenKai TC'),
        valueFont: g('LXGW WenKai TC'),
        weight: 700,
        labelSize: 17,
        currentSize: 18,
        maxSize: 12,
        color: '#fffaf0',
        outline: 'stroke',
        outlineColor: '#1a1410e6',
        outlineWidth: 2,
      },
      name: {
        pos: 'left',
        look: 'side',
        font: g('LXGW WenKai TC'),
        size: 22,
        vertical: true,
        verticalWrap: true,
        background: '#1a1410d9',
        accent: '#c8402a',
        gap: 8,
      },
      panel: {
        on: true,
        color: '#2a221ccc',
        radius: 2,
        padding: 10,
        borderWidth: 1,
        borderColor: '#d9b77a',
        borderOpacity: 40,
        texture: 'grain',
      },
      red: { color: '#ff7b5c' },
      critical: { color: '#e8452c', pulse: true },
      bars: bars([
        ['#d9483b', '#7a1f17'],
        ['#3d6aa8', '#1b2f52'],
        ['#7d5aa6', '#3a2752'],
        ['#6f9a4a', '#334a1f'],
        ['#d9a23b', '#7a5414'],
        ['#3b9aa6', '#17474d'],
        ['#c75a86', '#5c2440'],
        ['#a6998a', '#4d463d'],
      ]),
    },
  },
  {
    id: 'cute',
    name: '軟糖可愛',
    description: '圓滾滾的膠囊條、粉嫩配色與圓體字，條的左邊有小符號。',
    data: {
      barHeight: 28,
      barGap: 7,
      shape: 'pill',
      border: { width: 2, color: '#ffffffd9' },
      trough: { kind: 'mix', color: '#ffffffd9', mix: 22 },
      fill: 'gloss',
      shadow: 30,
      symbols: { show: true, size: 22, gap: 6 },
      text: {
        labelFont: g('Huninn'),
        valueFont: g('Huninn'),
        weight: 400,
        labelSize: 16,
        currentSize: 17,
        maxSize: 12,
        color: '#ffffff',
        maxColor: '#ffffffd9',
        outline: 'stroke',
        outlineColor: '#7a4a6be6',
        outlineWidth: 2,
      },
      name: {
        look: 'badge',
        font: g('Huninn'),
        weight: 400,
        size: 17,
        color: '#ffffff',
        accent: '#ff8fb8',
        align: 'center',
      },
      red: { color: '#ffe066', blink: true },
      critical: { color: '#ff5c8a', pulse: true, shake: true },
      bars: bars(
        [
          ['#ff8fb8', '#ff5c93'],
          ['#8fc8ff', '#5c9dff'],
          ['#c9a8ff', '#9d73ff'],
          ['#8fe3b0', '#4fc98a'],
          ['#ffd38f', '#ffb04f'],
          ['#8fe8f0', '#4fcfdb'],
          ['#ffa8c9', '#ff7aa8'],
          ['#d0d6e0', '#a8b0bf'],
        ],
        ['heart', 'star', 'moon', 'clover', 'bolt', 'drop', 'flame', 'gem'],
      ),
    },
  },
  {
    id: 'horror',
    name: '血跡驚悚',
    description: '暗紅色條、裂痕隨傷勢擴大，危急時震動閃爍，歸零後整條褪色。',
    data: {
      barHeight: 30,
      shape: 'notch',
      cut: 8,
      border: { width: 1, color: '#ff4d4d4d' },
      trough: { kind: 'dark', color: '#0a0505e6' },
      fill: 'vgrad',
      shadow: 60,
      text: {
        labelFont: g('Noto Serif TC'),
        valueFont: g('Noto Serif TC'),
        weight: 900,
        labelSize: 17,
        currentSize: 19,
        maxSize: 12,
        color: '#f2e6e6',
        maxColor: '#f2e6e699',
        outline: 'glow',
        outlineColor: '#8c0000d9',
      },
      name: {
        look: 'text',
        font: g('Noto Serif TC'),
        weight: 900,
        size: 20,
        color: '#ffdede',
      },
      red: { color: '#ff3b3b', blink: true },
      critical: { color: '#ff1f1f', pulse: true, blink: true, shake: true, barColor: false },
      zero: { on: true, gray: true, blink: true },
      cracks: { on: true, color: '#ffe0e0', opacity: 85 },
      grain: { on: true, strength: 45 },
      bars: bars([
        ['#b3122e', '#4d0612'],
        ['#5a2a8c', '#240f3d'],
        ['#7a1f5a', '#330a24'],
        ['#4d5a2a', '#1f240f'],
        ['#8c5a1f', '#3d240a'],
        ['#2a5a5a', '#0f2424'],
        ['#8c1f3d', '#3d0a17'],
        ['#5a5a5a', '#242424'],
      ]),
    },
  },
  {
    id: 'pixel',
    name: '復古像素',
    description: '一格一格的方塊條、點陣字與掃描線，像老遊戲機的畫面。',
    data: {
      barHeight: 20,
      barGap: 8,
      textPos: 'top',
      textGap: 3,
      shape: 'round',
      radius: 0,
      border: { width: 2, color: '#ffffffff' },
      trough: { kind: 'dark', color: '#101020ff' },
      fill: 'solid',
      segments: 10,
      segmentGap: 2,
      speed: 0,
      shadow: 0,
      text: {
        labelFont: g('DotGothic16'),
        valueFont: g('Press Start 2P'),
        weight: 400,
        labelSize: 16,
        currentSize: 12,
        maxSize: 9,
        spacing: 0.02,
        color: '#ffffff',
        maxColor: '#ffffffb3',
        outline: 'stroke',
        outlineColor: '#000000ff',
        outlineWidth: 2,
      },
      name: {
        look: 'plate',
        font: g('DotGothic16'),
        weight: 400,
        size: 17,
        background: '#101020f2',
      },
      scanlines: { on: true, strength: 30, period: 4 },
      frame: {
        on: true,
        kind: 'double',
        width: 2,
        color: '#ffffff',
        opacity: 90,
        gap: 6,
        radius: 0,
      },
      red: { color: '#ffd700', blink: true },
      critical: { color: '#ff3030', pulse: false, blink: true },
      bars: bars([
        ['#ff4040', '#ff4040'],
        ['#40a0ff', '#40a0ff'],
        ['#c060ff', '#c060ff'],
        ['#40e070', '#40e070'],
        ['#ffc020', '#ffc020'],
        ['#40e0e0', '#40e0e0'],
        ['#ff60c0', '#ff60c0'],
        ['#c0c0c0', '#c0c0c0'],
      ]),
    },
  },
  {
    id: 'card',
    name: '角色卡',
    description: '頭像在左、右上角顯示先攻值，名稱以頁籤放在條群上方，整張放在面板裡。',
    data: {
      barWidth: 250,
      barHeight: 26,
      barGap: 6,
      textInset: 8,
      avatar: {
        show: true,
        pos: 'left',
        width: 96,
        height: 96,
        fit: 'top',
        radius: 10,
        borderWidth: 2,
        borderColor: '#ffffffff',
        borderUseChar: true,
        gap: 10,
      },
      initiative: { show: true, corner: 'tr', size: 24, color: '#15161a', background: '#ffd76b' },
      border: { width: 1, color: '#ffffff33' },
      text: { labelSize: 15, currentSize: 16, maxSize: 11 },
      name: {
        pos: 'group',
        look: 'tab',
        size: 16,
        color: '#ffffff',
        accentUseChar: true,
        gap: 6,
      },
      panel: {
        on: true,
        color: '#14161ce6',
        radius: 12,
        padding: 10,
        borderWidth: 1,
        borderColor: '#ffffff',
        borderOpacity: 14,
        strip: true,
      },
      glow: { on: true, spread: 6, strength: 40 },
    },
  },
  {
    id: 'gem',
    name: '碎裂寶石',
    description: '每條旁邊一排寶石，數值減少時由右而左逐顆裂開；條身也會出現裂痕。',
    data: {
      barHeight: 22,
      barGap: 8,
      shape: 'arrow',
      cut: 9,
      border: { width: 1, color: '#ffffff66' },
      trough: { kind: 'mix', color: '#0b0d14d9', mix: 20 },
      fill: 'gloss',
      text: {
        labelSize: 15,
        currentSize: 16,
        maxSize: 11,
        outline: 'stroke',
        outlineColor: '#000000cc',
        outlineWidth: 1.5,
      },
      name: { look: 'side', accent: '#a7e8ff' },
      items: { on: true, count: 5, size: 20, gap: 2, side: 'left', distance: 8 },
      cracks: { on: true, color: '#ffffff', opacity: 70 },
      lead: { on: true, strength: 80 },
      critical: { color: '#ff4f6d' },
      bars: bars(
        [
          ['#ff5c7a', '#8c1430'],
          ['#5cc8ff', '#145a8c'],
          ['#b77cff', '#4a1f8c'],
          ['#5cffb0', '#148c55'],
          ['#ffd25c', '#8c6614'],
          ['#5cfff0', '#148c80'],
          ['#ff7ce0', '#8c1f73'],
          ['#d6e0ec', '#5a6675'],
        ],
        [],
        ['gem', 'gem', 'gem', 'gem', 'gem', 'gem', 'gem', 'gem'],
      ),
    },
  },
];

export function templateById(id: string | null | undefined): StatusTemplate | null {
  return TEMPLATES.find((t) => t.id === id) ?? null;
}

export const TEMPLATE_IDS = TEMPLATES.map((t) => t.id);

/** 範本的完整設定（預設值＋範本） */
export function templateSettings(t: StatusTemplate): Settings {
  return normalizeSettings(applyTemplate(DEFAULT_SETTINGS, t.data), TEMPLATE_IDS);
}

/**
 * 套用範本：範本有的與沒寫的（＝預設值）整批換掉，再保留 TEMPLATE_KEEP 的設定；
 * 記下最後套用的範本（CSS 開頭註記「以範本…為基礎」）。
 */
export function applyStatusTemplate(cur: Settings, id: string): Settings {
  const t = templateById(id);
  if (!t) return cur;
  const next = applyTemplate(cur, templateSettings(t), { keep: TEMPLATE_KEEP });
  next.templateId = t.id;
  return next;
}
