/**
 * 53 種效果（規格 1.11）。每個效果是一組「形狀＋初始設定」：形狀決定畫法（core/transition 的 20 種形狀之一），
 * 初始設定只列出和 BASE_LOOK 不同的值。數值沿用原作（MIT）的預設集（主控裁定：初始設定可以照用），
 * 名稱、分類、說明與範例字幕是本站自己寫的。
 *
 * 刻意差異（主控裁定）：E52 黑白輪閃改成交替閃爍後完全蓋上（推進比例 100%，舊版停在約 88%）。
 */
import type { TransitionShape } from '@/core/transition';
import type { Caption, Look } from './settings';

export type CategoryId =
  | 'fade'
  | 'wipe'
  | 'curtain'
  | 'figure'
  | 'pattern'
  | 'horror'
  | 'caption'
  | 'digital'
  | 'special';

/** 分類（選單的分組標題，依這個順序） */
export const CATEGORIES: readonly { id: CategoryId; label: string }[] = [
  { id: 'fade', label: '淡變' },
  { id: 'wipe', label: '擦除' },
  { id: 'curtain', label: '幕與條帶' },
  { id: 'figure', label: '圖形開合' },
  { id: 'pattern', label: '格紋與顆粒' },
  { id: 'horror', label: '驚悚氛圍' },
  { id: 'caption', label: '字幕' },
  { id: 'digital', label: '數位風' },
  { id: 'special', label: '翻轉與特殊' },
];

export interface EffectDef {
  /** 編號（E01～E53，與規格相同） */
  id: string;
  name: string;
  category: CategoryId;
  shape: TransitionShape;
  /** 效果的初始設定（只列出和 BASE_LOOK 不同的值） */
  look: Partial<Look>;
  /** 範例字幕與字幕的樣式（沒有範例字幕的效果不填） */
  caption?: Partial<Omit<Caption, 'fontSize' | 'fontName'>> & { caption: string };
  /** 檔案一定要循環播放（心跳）：選到時打開循環播放，換走時關掉 */
  loop?: boolean;
  /** 邊緣實心（合攏成發亮的線；固定特性，不是設定，規格 3.5.2） */
  solidEdge?: boolean;
  /** 選單下方的說明 */
  description: string;
}

export const EFFECTS: readonly EffectDef[] = [
  /* ---------- 淡變 ---------- */
  {
    id: 'E01',
    name: '黑色淡出',
    category: 'fade',
    shape: 'flat',
    look: { hold: 0.6 },
    description: '整個畫面慢慢變黑，最後停在全黑。',
  },
  {
    id: 'E02',
    name: '由黑淡入',
    category: 'fade',
    shape: 'flat',
    look: { mode: 'reveal' },
    description: '從全黑慢慢變透明，露出底下的場景。',
  },
  {
    id: 'E03',
    name: '白色淡出',
    category: 'fade',
    shape: 'flat',
    look: { color: '#ffffff', duration: 0.6, hold: 0.5 },
    description: '整個畫面慢慢變白，最後停在全白。',
  },
  {
    id: 'E04',
    name: '由白淡入',
    category: 'fade',
    shape: 'flat',
    look: { mode: 'reveal', color: '#ffffff' },
    description: '從全白慢慢變透明，露出底下的場景。',
  },
  {
    id: 'E05',
    name: '白光一閃',
    category: 'fade',
    shape: 'flat',
    look: { mode: 'sweep', color: '#ffffff', duration: 0.5, curve: 'quadOut', bandWidth: 255 },
    description: '白光一下子亮起再慢慢退去，適合回想或受到衝擊的瞬間。',
  },
  {
    id: 'E06',
    name: '黑色淡出再淡入',
    category: 'fade',
    shape: 'flat',
    look: { mode: 'roundtrip', duration: 0.6, hold: 0.8 },
    description: '變黑、停一下、再亮回來，一個檔案就完成換場。',
  },
  {
    id: 'E07',
    name: '雷光',
    category: 'fade',
    shape: 'flat',
    look: { color: '#ffffff', duration: 1, curve: 'lightning', reach: 85 },
    description: '白光閃兩、三下後消失，適合打雷或嚇一跳的場面。',
  },
  {
    id: 'E08',
    name: '燈光閃斷後轉暗',
    category: 'fade',
    shape: 'flat',
    look: { duration: 1.4, hold: 0.6, curve: 'flicker' },
    description: '像接觸不良的燈泡忽明忽暗閃幾下，然後整個暗下來。',
  },
  /* ---------- 擦除 ---------- */
  {
    id: 'E09',
    name: '向右擦除・蓋上',
    category: 'wipe',
    shape: 'linear',
    look: { duration: 0.55, hold: 0.5, softness: 25 },
    description: '黑色從左邊往右推過去，把畫面蓋滿。',
  },
  {
    id: 'E10',
    name: '向右擦除・揭開',
    category: 'wipe',
    shape: 'linear',
    look: { mode: 'reveal', duration: 0.55, softness: 25 },
    description: '黑色往右退開，畫面從左邊露出來。',
  },
  {
    id: 'E11',
    name: '向下擦除・蓋上',
    category: 'wipe',
    shape: 'linear',
    look: { duration: 0.55, hold: 0.5, softness: 25, direction: 'down' },
    description: '黑色從上面往下推，把畫面蓋滿。',
  },
  {
    id: 'E12',
    name: '對角擦除',
    category: 'wipe',
    shape: 'diagonal',
    look: { duration: 0.6, hold: 0.5, softness: 25, direction: 'down-right' },
    description: '黑色從左上角斜斜地推向右下角。',
  },
  {
    id: 'E13',
    name: '黑帶橫掃',
    category: 'wipe',
    shape: 'linear',
    look: { mode: 'sweep', curve: 'linear', bandWidth: 70 },
    description: '一條邊緣柔和的黑帶從左到右掃過，適合不想完全遮住畫面的小換場。',
  },
  {
    id: 'E14',
    name: '波浪邊擦除',
    category: 'wipe',
    shape: 'wave',
    look: { duration: 0.8, hold: 0.5, softness: 20, count: 3, strength: 40, option: 'sine' },
    description: '邊緣起伏成波浪，從左往右蓋滿畫面。',
  },
  {
    id: 'E15',
    name: '鋸齒邊擦除',
    category: 'wipe',
    shape: 'wave',
    look: { hold: 0.5, softness: 6, direction: 'down', count: 12, strength: 30, option: 'saw' },
    description: '邊緣是尖尖的鋸齒，從上往下蓋滿畫面。',
  },
  {
    id: 'E16',
    name: '時針掃過',
    category: 'wipe',
    shape: 'clock',
    look: { duration: 0.9, hold: 0.5, softness: 4, option: 'clockwise' },
    description: '從 12 點方向開始，像時針一樣順時針繞一圈蓋滿。',
  },
  {
    id: 'E17',
    name: '螺旋收束',
    category: 'wipe',
    shape: 'spiral',
    look: { duration: 1.2, hold: 0.5, softness: 16, count: 3 },
    description: '從外圍捲成漩渦，一圈一圈往中心收攏。',
  },
  {
    id: 'E18',
    name: '光緣擦除',
    category: 'wipe',
    shape: 'linear',
    look: { hold: 0.5, softness: 60, glow: true, glowColor: '#a8e0ff' },
    description: '邊界帶著淡藍色的光，從左往右推過去蓋滿。',
  },
  /* ---------- 幕與條帶 ---------- */
  {
    id: 'E19',
    name: '上下合攏',
    category: 'curtain',
    shape: 'split',
    look: { hold: 0.5, softness: 20 },
    description: '黑幕從上下兩邊往中間合起來。',
  },
  {
    id: 'E20',
    name: '中央向上下打開',
    category: 'curtain',
    shape: 'split',
    look: { mode: 'reveal', softness: 20, reverseOrder: true },
    description: '從中間的水平線往上下打開，露出畫面。',
  },
  {
    id: 'E21',
    name: '百葉窗',
    category: 'curtain',
    shape: 'blinds',
    look: { duration: 0.6, hold: 0.5, softness: 15 },
    description: '十條橫帶同時往下延伸，像拉下百葉窗。',
  },
  {
    id: 'E22',
    name: '中央向左右打開',
    category: 'curtain',
    shape: 'split',
    look: { mode: 'reveal', duration: 0.8, softness: 10, reverseOrder: true, axis: 'horizontal' },
    description: '從中間的直線往左右打開，像推開兩扇門。',
  },
  {
    id: 'E23',
    name: '寬銀幕黑邊',
    category: 'curtain',
    shape: 'split',
    look: { duration: 0.6, hold: 0.5, softness: 1, reach: 24 },
    description: '上下伸出黑邊後停住，適合回想或過場動畫般的演出。',
  },
  /* ---------- 圖形開合 ---------- */
  {
    id: 'E24',
    name: '圓形收束',
    category: 'figure',
    shape: 'circle',
    look: { duration: 0.8, hold: 0.5, softness: 12, reverseOrder: true },
    description: '透明的圓從大到小往中心收起，最後全黑。',
  },
  {
    id: 'E25',
    name: '圓形擴開',
    category: 'figure',
    shape: 'circle',
    look: { mode: 'reveal', duration: 0.8, softness: 12 },
    description: '從中心打開一個圓並慢慢擴大，露出畫面。',
  },
  {
    id: 'E26',
    name: '星形收束',
    category: 'figure',
    shape: 'figure',
    look: { duration: 0.9, hold: 0.5, softness: 4, reverseOrder: true, option: 'star' },
    description: '縮成星星的形狀往中心收起。',
  },
  {
    id: 'E27',
    name: '心形收束',
    category: 'figure',
    shape: 'figure',
    look: { duration: 0.9, hold: 0.5, softness: 4, reverseOrder: true, option: 'heart' },
    description: '縮成愛心的形狀往中心收起。',
  },
  {
    id: 'E28',
    name: '菱形擴開',
    category: 'figure',
    shape: 'figure',
    look: { mode: 'reveal', duration: 0.8, softness: 6, option: 'diamond' },
    description: '從中心打開菱形並擴大，露出畫面。',
  },
  {
    id: 'E29',
    name: '彈跳圓形擴開',
    category: 'figure',
    shape: 'circle',
    look: { mode: 'reveal', duration: 1, curve: 'bounceOut', softness: 6 },
    description: '圓形一邊彈跳一邊打開，適合輕快的場面。',
  },
  /* ---------- 格紋與顆粒 ---------- */
  {
    id: 'E30',
    name: '細粒溶解',
    category: 'pattern',
    shape: 'dissolve',
    look: { duration: 0.8, hold: 0.5, softness: 70, blockSize: 6 },
    description: '細小的方塊隨機浮現，像細沙一樣溶進黑色。',
  },
  {
    id: 'E31',
    name: '大方塊溶解',
    category: 'pattern',
    shape: 'dissolve',
    look: { duration: 0.8, hold: 0.5, softness: 50, blockSize: 24, seed: 3 },
    description: '大方塊一格一格隨機填滿。',
  },
  {
    id: 'E32',
    name: '方格斜向長出',
    category: 'pattern',
    shape: 'grid',
    look: {
      duration: 0.9,
      hold: 0.5,
      softness: 8,
      direction: 'down-right',
      count: 16,
      option: 'square',
    },
    description: '方格從左上到右下依序長大，把畫面蓋滿。',
  },
  {
    id: 'E33',
    name: '圓點橫向長出',
    category: 'pattern',
    shape: 'grid',
    look: { duration: 0.9, hold: 0.5, softness: 8, count: 20, option: 'circle' },
    description: '圓點從左到右依序長大，把畫面蓋滿。',
  },
  {
    id: 'E34',
    name: '棋盤格兩段',
    category: 'pattern',
    shape: 'grid',
    look: { duration: 0.8, hold: 0.5, softness: 4, count: 8, order: 'alternate', option: 'square' },
    description: '先蓋上棋盤格的一半，再補滿另一半。',
  },
  /* ---------- 驚悚氛圍 ---------- */
  {
    id: 'E35',
    name: '血液垂流',
    category: 'horror',
    shape: 'drip',
    look: {
      color: '#5c0008',
      duration: 1.6,
      hold: 0.6,
      curve: 'quadIn',
      softness: 8,
      count: 22,
      strength: 60,
      seed: 11,
    },
    description: '暗紅色的液體從上方滴落，越流越快，最後蓋滿畫面。',
  },
  {
    id: 'E36',
    name: '墨跡暈開',
    category: 'horror',
    shape: 'ink',
    look: { color: '#0b0b10', duration: 1.3, hold: 0.5, softness: 24, seed: 5, option: 'center' },
    description: '墨水從中心以不規則的邊緣暈開。',
  },
  {
    id: 'E37',
    name: '火燒蔓延',
    category: 'horror',
    shape: 'ink',
    look: {
      color: '#140a05',
      duration: 1.5,
      hold: 0.5,
      glow: true,
      direction: 'up',
      strength: 70,
      glowColor: '#ff7a1a',
      seed: 9,
      option: 'direction',
    },
    description: '邊緣透著橘色火光的焦黑，從下往上燒過來。',
  },
  {
    id: 'E38',
    name: '暗角',
    category: 'horror',
    shape: 'circle',
    look: {
      duration: 1,
      hold: 0.5,
      softness: 150,
      reach: 42,
      reverseOrder: true,
      ellipse: true,
    },
    description: '畫面四周暗下來後停住，適合回想或不安的場面。',
  },
  {
    id: 'E39',
    name: '心跳暗角',
    category: 'horror',
    shape: 'circle',
    look: {
      color: '#8f0010',
      duration: 1.1,
      curve: 'heartbeat',
      softness: 150,
      reach: 40,
      reverseOrder: true,
      ellipse: true,
    },
    loop: true,
    description: '暗紅色的四周像心跳一樣撲通、撲通地跳（一直循環）。',
  },
  /* ---------- 字幕 ---------- */
  {
    id: 'E40',
    name: '黑幕＋字幕',
    category: 'caption',
    shape: 'flat',
    look: { duration: 1, hold: 1.6 },
    caption: { caption: '——　三天後　——' },
    description: '畫面變黑，接著浮現一行字。',
  },
  {
    id: 'E41',
    name: '黑幕＋明體字幕',
    category: 'caption',
    shape: 'flat',
    look: { duration: 1.2, hold: 1.8 },
    caption: { caption: '那一夜，村子裡的燈全熄了', font: 'mincho' },
    description: '畫面變黑後以明體浮現文字，適合和風或恐怖的場面。',
  },
  {
    id: 'E42',
    name: '只有字幕',
    category: 'caption',
    shape: 'flat',
    look: { mode: 'roundtrip', duration: 0.5, hold: 2, reach: 0 },
    caption: { caption: '某座山間的古老宅邸', textPos: 'bottom', outline: true },
    description: '畫面不變，只在下方浮現一行字再消失。',
  },
  /* ---------- 數位風 ---------- */
  {
    id: 'E43',
    name: '訊號撕裂',
    category: 'digital',
    shape: 'tear',
    look: {
      color: '#070b1a',
      duration: 0.9,
      hold: 0.5,
      curve: 'flicker',
      softness: 30,
      glow: true,
      count: 26,
      glowColor: '#00e5ff',
      seed: 13,
    },
    description: '帶著青光的雜訊帶橫向撕裂掃過，閃幾下後蓋滿。',
  },
  {
    id: 'E44',
    name: '方塊雨',
    category: 'digital',
    shape: 'rain',
    look: {
      color: '#02120a',
      duration: 1.4,
      hold: 0.5,
      curve: 'quadIn',
      softness: 25,
      glow: true,
      count: 48,
      glowColor: '#39ff88',
      seed: 21,
    },
    description: '帶著綠光的方塊一欄一欄落下，把畫面蓋滿。',
  },
  {
    id: 'E45',
    name: '隔行掃描',
    category: 'digital',
    shape: 'interlace',
    look: {
      color: '#05070f',
      duration: 0.9,
      hold: 0.5,
      curve: 'linear',
      softness: 20,
      glow: true,
      count: 72,
      glowColor: '#7df9ff',
    },
    description: '先由上往下掃過隔行的掃描線，再補滿其餘的線。',
  },
  {
    id: 'E46',
    name: '六角格擴散',
    category: 'digital',
    shape: 'hex',
    look: {
      color: '#0a0f24',
      duration: 1,
      hold: 0.5,
      softness: 10,
      glow: true,
      count: 14,
      glowColor: '#3fa9ff',
      order: 'center',
    },
    description: '帶著藍光的六角格從中心往外依序長出。',
  },
  {
    id: 'E47',
    name: '雜訊方塊',
    category: 'digital',
    shape: 'dissolve',
    look: {
      color: '#0b0014',
      duration: 1,
      hold: 0.5,
      curve: 'flicker',
      softness: 90,
      glow: true,
      glowColor: '#ff2bd6',
      blockSize: 16,
      seed: 5,
    },
    description: '帶著洋紅色光的雜訊方塊閃爍幾下後蓋滿。',
  },
  {
    id: 'E48',
    name: '黑幕＋等寬字幕',
    category: 'digital',
    shape: 'flat',
    look: { color: '#03060c', duration: 0.8, hold: 1.6 },
    caption: { caption: 'SIGNAL LOST', font: 'mono', textColor: '#39ff88' },
    description: '畫面變暗後以綠色的等寬字顯示一行英文。',
  },
  /* ---------- 翻轉與特殊 ---------- */
  {
    id: 'E49',
    name: '上下夾合成光線',
    category: 'special',
    shape: 'split',
    look: {
      color: '#0c0618',
      duration: 0.35,
      hold: 0.5,
      curve: 'quadIn',
      softness: 30,
      reach: 96,
      glow: true,
      glowColor: '#f3eaff',
    },
    solidEdge: true,
    description: '從上下一口氣合起來，停在一條發亮的線上，適合表現空間翻轉。',
  },
  {
    id: 'E50',
    name: '光線向上下展開',
    category: 'special',
    shape: 'split',
    look: {
      color: '#0c0618',
      duration: 0.35,
      curve: 'quadIn',
      softness: 30,
      reach: 96,
      reversePlay: true,
      glow: true,
      glowColor: '#f3eaff',
    },
    solidEdge: true,
    description: '從一條發亮的線往上下打開；接在「上下夾合成光線」「旋轉夾合成光線」之後使用。',
  },
  {
    id: 'E51',
    name: '旋轉夾合成光線',
    category: 'special',
    shape: 'rotate',
    look: {
      color: '#0c0618',
      duration: 0.6,
      hold: 0.5,
      softness: 30,
      reach: 96,
      glow: true,
      glowColor: '#f3eaff',
    },
    solidEdge: true,
    description: '一邊旋轉半圈一邊合起來，停在一條發亮的水平線上。',
  },
  {
    id: 'E52',
    name: '黑白輪閃',
    category: 'special',
    shape: 'flat',
    look: { color: '#ffffff', duration: 1.6, strobe: 4 },
    description: '白、黑交替閃爍，最後整片變黑（畫面會閃爍）。',
  },
  {
    id: 'E53',
    name: '同心環交錯',
    category: 'special',
    shape: 'rings',
    look: {
      color: '#12002a',
      duration: 1.2,
      hold: 0.5,
      softness: 12,
      glow: true,
      count: 8,
      glowColor: '#c9a2ff',
    },
    description: '同心環隔一圈長出，再補滿中間的空隙。',
  },
];

export const EFFECT_IDS: readonly string[] = EFFECTS.map((e) => e.id);
export const DEFAULT_EFFECT = 'E01';

const BY_ID = new Map(EFFECTS.map((e) => [e.id, e]));

/** 依編號找效果；找不到時是第一個（E01） */
export function effectById(id: string): EffectDef {
  return BY_ID.get(id) ?? EFFECTS[0];
}

export const isEffectId = (id: unknown): id is string => typeof id === 'string' && BY_ID.has(id);

/** 效果的範例字幕（沒有範例的效果是空字串） */
export const sampleCaption = (id: string): string => BY_ID.get(id)?.caption?.caption ?? '';
