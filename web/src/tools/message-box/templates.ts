/**
 * 訊息框的範本（本專案自己設計的配色與排版）。範本只寫與基本值（BASE_APPEARANCE）不同的地方；
 * 套用時位置、方框、名稱、骰子結果、內文、立繪、骰子圖整批換成「基本值＋範本」，來源大小、房間網址、檔名保留。
 */
import { applyTemplate as mergeTemplate } from '@/core/storage';
import {
  BASE_APPEARANCE,
  DEFAULT_SETTINGS,
  type MbFont,
  type MbSettings,
  TEMPLATE_KEEP,
} from './settings';

type Appearance = typeof BASE_APPEARANCE;

export interface MbTemplate {
  id: string;
  name: string;
  description: string;
  values: Partial<Appearance>;
}

const g = (family: string, weight: number): MbFont => ({ source: 'google', family, weight });

export const TEMPLATES: readonly MbTemplate[] = [
  {
    id: 'classic',
    name: 'CCFOLIA 風',
    description: '接近 CCFOLIA 原本的深灰半透明方框，換成繁中字型、名稱改用暖金色。',
    values: {},
  },
  {
    id: 'novel',
    name: '視覺小說',
    description: '橫跨畫面的寬方框、名稱放在上緣的名牌，大字、柔邊陰影，立繪放大並稍微沉進方框。',
    values: {
      maxWidth: 1180,
      bottom: 24,
      side: 24,
      boxColor: '#0e1230',
      boxOpacity: 80,
      texture: 'deepen',
      borderWidth: 2,
      borderColor: '#9fb4ff',
      borderOpacity: 45,
      radius: 12,
      shadow: 50,
      padX: 36,
      padY: 18,
      namePos: 'plate',
      nameSize: 18,
      nameColor: '#ffffff',
      plateColor: '#3a4cb0',
      plateOpacity: 92,
      plateRadius: 8,
      plateInset: 28,
      plateGap: 4,
      resultStyle: 'band',
      colorSuccess: '#7fc8ff',
      colorFailure: '#ff7088',
      colorOther: '#d7dbea',
      textSize: 22,
      lineHeight: 1.7,
      textColor: '#ffffff',
      outline: 'soft',
      outlineOpacity: 60,
      portraitWidth: 380,
      portraitMaxHeight: 640,
      portraitOffset: 24,
      portraitSink: 40,
      diceSize: 72,
    },
  },
  {
    id: 'letter',
    name: '泛黃信紙',
    description:
      '舊紙質感的米色方框、褐色字與四角括號；名稱與結果用宋體、內文用文楷，適合書信與手記。',
    values: {
      boxColor: '#efe3c6',
      boxOpacity: 96,
      texture: 'paper',
      borderWidth: 1,
      borderColor: '#7a5a32',
      borderOpacity: 50,
      radius: 3,
      shadow: 45,
      brackets: true,
      bracketColor: '#7a5a32',
      bracketOpacity: 70,
      padX: 30,
      padY: 16,
      nameFont: g('Noto Serif TC', 700),
      nameSize: 16,
      nameColor: '#5a3a1a',
      resultStyle: 'outline',
      resultFont: g('Noto Serif TC', 700),
      colorSuccess: '#2f6db3',
      colorFailure: '#b3302f',
      colorOther: '#6b5a44',
      textFont: g('LXGW WenKai TC', 400),
      textSize: 18,
      lineHeight: 1.65,
      textColor: '#3b2a18',
    },
  },
  {
    id: 'scifi',
    name: '星際通訊',
    description: '深青色底加掃描線與青色細框、四角括號，文字微微發光，像太空船的通訊畫面。',
    values: {
      boxColor: '#04161c',
      boxOpacity: 84,
      texture: 'scanlines',
      borderWidth: 1,
      borderColor: '#3ee6ff',
      borderOpacity: 70,
      radius: 2,
      shadow: 30,
      brackets: true,
      bracketColor: '#3ee6ff',
      bracketOpacity: 90,
      padX: 26,
      padY: 14,
      nameColor: '#7ff3ff',
      resultStyle: 'outline',
      colorSuccess: '#3ee6ff',
      colorFailure: '#ff4d6d',
      colorOther: '#9fb3c8',
      textColor: '#d8fbff',
      letterSpacing: 0.05,
      outline: 'glow',
      outlineColor: '#00c8ff',
      outlineOpacity: 45,
    },
  },
  {
    id: 'horror',
    name: '深夜驚悚',
    description: '近乎全黑的顆粒方框、暗紅細框，宋體加寬字距；訊息直接在原位出現，失敗用血紅色帶。',
    values: {
      maxWidth: 820,
      entrance: 'instant',
      boxColor: '#0b0606',
      boxOpacity: 90,
      texture: 'grain',
      borderWidth: 1,
      borderColor: '#8a1010',
      borderOpacity: 70,
      radius: 0,
      shadow: 70,
      padX: 28,
      padY: 14,
      nameFont: g('Noto Serif TC', 700),
      nameSize: 16,
      nameColor: '#e8d9d0',
      resultStyle: 'band',
      resultFont: g('Noto Serif TC', 700),
      colorSuccess: '#c9c2b8',
      colorFailure: '#b3121b',
      colorOther: '#6e6560',
      textFont: g('Noto Serif TC', 400),
      textSize: 18,
      lineHeight: 1.75,
      letterSpacing: 0.06,
      textColor: '#e6ddd5',
      outline: 'soft',
      outlineOpacity: 90,
    },
  },
  {
    id: 'retro',
    name: '復古 RPG',
    description: '藍底白粗框的經典角色扮演遊戲對話框，點陣字型，原位出現。',
    values: {
      maxWidth: 820,
      entrance: 'instant',
      boxColor: '#0b1a78',
      boxOpacity: 94,
      borderWidth: 4,
      borderColor: '#ffffff',
      borderOpacity: 100,
      radius: 6,
      shadow: 0,
      padX: 22,
      padY: 12,
      nameFont: g('DotGothic16', 400),
      nameSize: 16,
      nameColor: '#ffe066',
      resultFont: g('DotGothic16', 400),
      colorSuccess: '#7fffd4',
      colorFailure: '#ff6b6b',
      colorOther: '#ffffff',
      textFont: g('DotGothic16', 400),
      textSize: 18,
      letterSpacing: 0.04,
      textColor: '#ffffff',
    },
  },
  {
    id: 'pastel',
    name: '粉彩可愛',
    description: '淺粉色圓角方框、粉紅名牌與色帶結果，粉圓體，適合輕鬆的日常團。',
    values: {
      boxColor: '#fff4f8',
      boxOpacity: 94,
      borderWidth: 3,
      borderColor: '#ffb3cf',
      borderOpacity: 100,
      radius: 20,
      shadow: 25,
      padX: 28,
      padY: 14,
      namePos: 'plate',
      nameFont: g('Huninn', 400),
      nameSize: 16,
      nameColor: '#ffffff',
      plateColor: '#ff8fb8',
      plateOpacity: 100,
      plateRadius: 14,
      plateInset: 24,
      plateLift: 4,
      plateGap: 2,
      resultStyle: 'band',
      resultFont: g('Huninn', 400),
      colorSuccess: '#7cc6ff',
      colorFailure: '#ff7a9c',
      colorOther: '#c4a7e7',
      textFont: g('Huninn', 400),
      textSize: 18,
      lineHeight: 1.65,
      textColor: '#5b3550',
      diceSize: 60,
    },
  },
  {
    id: 'subtitle',
    name: '透明字幕',
    description: '沒有底色的字幕風：方框完全透明，名稱與內文加黑色描邊，不擋住遊戲畫面。',
    values: {
      maxWidth: 1100,
      bottom: 20,
      boxOpacity: 0,
      shadow: 0,
      padX: 16,
      padY: 6,
      lines: 2,
      nameSize: 18,
      nameColor: '#ffe28a',
      textSize: 24,
      lineHeight: 1.5,
      textColor: '#ffffff',
      outline: 'stroke',
      outlineOpacity: 100,
      outlineWidth: 3,
      portraitWidth: 220,
      portraitMaxHeight: 420,
    },
  },
];

export const templateById = (id: string | null | undefined): MbTemplate | undefined =>
  TEMPLATES.find((t) => t.id === id);

export const isKnownTemplate = (id: string): boolean => !!templateById(id);

/** 範本的完整外觀（基本值＋範本的差異） */
export function templateAppearance(t: MbTemplate): Appearance {
  return { ...BASE_APPEARANCE, ...t.values };
}

/**
 * 套用範本（F02）：外觀整批換成範本的值，來源大小、房間網址、檔名保留；記下套用的範本。
 * 回傳新的設定（不改動傳入的值）。
 */
export function applyTemplateTo(current: MbSettings, t: MbTemplate): MbSettings {
  const full: MbSettings = { ...DEFAULT_SETTINGS, ...templateAppearance(t), template: t.id };
  return mergeTemplate(current, full, { keep: TEMPLATE_KEEP });
}
