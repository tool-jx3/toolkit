/**
 * 範本（規格 1.1、5. D1）：28 組，本站自己寫的文字與配色（原作的預設集是作者的素材，未授權，不沿用）。
 * 分類比照原作的七類；數量比原作多三組（新版加的漫畫泡泡、想法泡泡、吶喊泡泡各一組）。
 */
import {
  type Align,
  BASE_SETTINGS,
  type Bubble,
  type IconId,
  newBubbleId,
  type Palette,
  type SbData,
  type StyleId,
} from './model';
import { styleDefaults } from './styles';

export const CATEGORY_IDS = ['chat', 'game', 'paper', 'show', 'system', 'card', 'sf'] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

export interface PresetBubble {
  style: StyleId;
  title?: string;
  text?: string;
  icon?: IconId;
  button?: string;
  align?: Align;
  colors?: Partial<Palette>;
}

export interface Preset {
  id: string;
  name: string;
  category: CategoryId;
  settings: Partial<Omit<SbData, 'bubbles' | 'presetId'>>;
  bubbles: PresetBubble[];
}

const MONO = { source: 'google', family: 'LXGW WenKai Mono TC', weight: 400 } as const;
const HAND = { source: 'google', family: 'Iansui', weight: 400 } as const;
const KAI = { source: 'google', family: 'LXGW WenKai TC', weight: 400 } as const;
const SERIF = { source: 'google', family: 'Noto Serif TC', weight: 600 } as const;
const ROUND = { source: 'google', family: 'Huninn', weight: 400 } as const;
const SANS_BOLD = { source: 'google', family: 'Noto Sans TC', weight: 700 } as const;
const SANS_BLACK = { source: 'google', family: 'Noto Sans TC', weight: 900 } as const;

const GRAY_MSG: Partial<Palette> = { fill: '#eceff3', text: '#1f2937' };

export const PRESETS: readonly Preset[] = [
  /* ---- 對話 ---- */
  {
    id: 'chat-blue',
    name: '藍色訊息泡泡',
    category: 'chat',
    settings: { enter: 'pop', idle: 'float', exit: 'fade' },
    bubbles: [{ style: 'messenger', text: '這次的劇本好可怕……\n今晚還睡得著嗎？', align: 'right' }],
  },
  {
    id: 'chat-duo',
    name: '兩人對話',
    category: 'chat',
    settings: { enter: 'side', idle: 'none', exit: 'fade', stagger: 0.8, hold: 2.2 },
    bubbles: [
      { style: 'messenger', text: '角色卡傳過去了，幫我看一下！', align: 'left', colors: GRAY_MSG },
      { style: 'messenger', text: '收到！等等就看。', align: 'right' },
    ],
  },
  {
    id: 'chat-join',
    name: '旅伴加入',
    category: 'chat',
    settings: { enter: 'zoom', idle: 'shine', exit: 'fade', fontSize: 18 },
    bubbles: [{ style: 'chat-card', title: '旅伴', text: '艾琳 在營火旁坐了下來。' }],
  },
  {
    id: 'party-grid',
    name: '隊伍狀態',
    category: 'chat',
    settings: {
      arrange: 'grid',
      columns: 2,
      gap: 18,
      order: 'random',
      enter: 'pop',
      enterDur: 0.3,
      stagger: 0.25,
      idle: 'none',
      exit: 'fade',
      fontSize: 18,
      hold: 1.8,
    },
    bubbles: [
      {
        style: 'chat-card',
        title: '艾琳',
        text: 'HP 12／12',
        colors: { fill: '#ffffff', border: '#e5e7eb', accent: '#14b8a6' },
      },
      {
        style: 'chat-card',
        title: '雷恩',
        text: 'HP 7／11',
        colors: { fill: '#ffffff', border: '#e5e7eb', accent: '#3b82f6' },
      },
      {
        style: 'chat-card',
        title: '米雅',
        text: 'SAN 45／60',
        colors: { fill: '#ffffff', border: '#e5e7eb', accent: '#8b5cf6' },
      },
      {
        style: 'chat-card',
        title: '老周',
        text: 'MP 10／13',
        colors: { fill: '#ffffff', border: '#e5e7eb', accent: '#ef4444' },
      },
    ],
  },
  {
    id: 'comic-speech',
    name: '漫畫對話泡泡',
    category: 'chat',
    settings: { enter: 'pop', idle: 'sway', exit: 'pop', fontSize: 24, font: SANS_BOLD },
    bubbles: [{ style: 'speech', text: '等一下……\n那扇門剛才是開著的嗎？', align: 'left' }],
  },
  {
    id: 'comic-thought',
    name: '心裡的話',
    category: 'chat',
    settings: { enter: 'zoom', idle: 'float', exit: 'fade', fontSize: 22, font: KAI },
    bubbles: [{ style: 'thought', text: '（他是不是在說謊？）', align: 'right' }],
  },
  /* ---- 遊戲・RPG ---- */
  {
    id: 'rpg-navy',
    name: '藍色 RPG 對話框',
    category: 'game',
    settings: { enter: 'wipe', idle: 'none', exit: 'wipe', hold: 2.4, wrapWidth: 520 },
    bubbles: [
      {
        style: 'rpg',
        title: '神秘的老人',
        text: '北方的塔裡，藏著你們要找的答案。\n去吧，天亮之前要回來。',
      },
    ],
  },
  {
    id: 'rpg-glitch',
    name: '故障的對話框',
    category: 'game',
    settings: {
      enter: 'glitch',
      idle: 'glitch',
      exit: 'glitch',
      enterDur: 0.45,
      exitDur: 0.4,
      wrapWidth: 520,
    },
    bubbles: [
      {
        style: 'rpg',
        title: '？？？',
        text: '你……\n不該看見這段記憶。',
        colors: { fill: '#3a0e18', border: '#e8a3b0', text: '#ffffff', accent: '#ff8fa3' },
      },
    ],
  },
  {
    id: 'battle-win',
    name: '戰鬥勝利',
    category: 'game',
    settings: { enter: 'spin', idle: 'shine', exit: 'fade', fontSize: 20, wrapWidth: 480 },
    bubbles: [{ style: 'battle', title: '— 勝利 —', text: '擊退了地下墓穴的守衛。' }],
  },
  {
    id: 'item-tag',
    name: '獲得道具',
    category: 'game',
    settings: { enter: 'pop', idle: 'shine', exit: 'fade', fontSize: 20, wrapWidth: 520 },
    bubbles: [{ style: 'tag', title: '稀有', text: '取得古老的銀色懷錶' }],
  },
  {
    id: 'combo-pile',
    name: '連續攻擊',
    category: 'game',
    settings: {
      arrange: 'pile',
      gap: 18,
      enter: 'pop',
      enterDur: 0.25,
      stagger: 0.2,
      idle: 'shake',
      exit: 'fade',
      exitDur: 0.25,
      exitTogether: true,
      hold: 1.2,
      fontSize: 20,
    },
    bubbles: [
      {
        style: 'battle',
        text: '第 1 擊 · 5',
        colors: { fill: '#2a2112', border: '#8a6a2b', accent: '#ffb84d' },
      },
      {
        style: 'battle',
        text: '第 2 擊 · 8',
        colors: { fill: '#2d1c12', border: '#8f5a2b', accent: '#ff9d4d' },
      },
      {
        style: 'battle',
        text: '第 3 擊 · 13',
        colors: { fill: '#301713', border: '#934a2e', accent: '#ff7f50' },
      },
      {
        style: 'battle',
        text: '追擊 · 21',
        colors: { fill: '#331317', border: '#963d3d', accent: '#ff6363' },
      },
      {
        style: 'battle',
        text: '終結技 · 34',
        colors: { fill: '#3a0f1c', border: '#a3324b', accent: '#ff4d7a' },
      },
    ],
  },
  {
    id: 'boss-phases',
    name: '首領戰三階段',
    category: 'game',
    settings: {
      arrange: 'swap',
      enter: 'zoom',
      idle: 'none',
      exit: 'glitch',
      hold: 1,
      exitDur: 0.35,
      wrapWidth: 480,
    },
    bubbles: [
      {
        style: 'window',
        title: '警告',
        text: '深淵中有東西醒來了。',
        icon: 'warn',
        button: '確認',
        colors: { fill: '#f7f8fa', border: '#d9dde5', text: '#2f3440', accent: '#e5484d' },
      },
      {
        style: 'battle',
        title: '第二形態',
        text: '觸手開始蠕動。',
        colors: { fill: '#22161c', border: '#6b3a4c', text: '#d9ffe8', accent: '#7dffb3' },
      },
      {
        style: 'neon',
        text: 'SAN 檢定！',
        colors: { border: '#ff3b5c', accent: '#ff8095', text: '#fff1f3' },
      },
    ],
  },
  /* ---- 便條・紙張 ---- */
  {
    id: 'kp-note',
    name: '給 KP 的紙條',
    category: 'paper',
    settings: { enter: 'drop', idle: 'none', exit: 'fall', font: HAND, fontSize: 22, hold: 2.4 },
    bubbles: [
      {
        style: 'sticky',
        title: '給 KP 的紙條',
        text: '我的角色其實會游泳！\n（之前忘了寫在卡上）',
      },
    ],
  },
  {
    id: 'diary-page',
    name: '日記的一頁',
    category: 'paper',
    settings: {
      enter: 'unroll',
      idle: 'none',
      exit: 'unroll',
      textAnim: 'line',
      font: KAI,
      fontSize: 22,
      hold: 2.2,
    },
    bubbles: [
      { style: 'notebook', title: '日記・第 3 頁', text: '地下室的門，\n昨天還沒有上鎖。' },
    ],
  },
  {
    id: 'wanted',
    name: '懸賞告示',
    category: 'paper',
    settings: { enter: 'zoom', idle: 'none', exit: 'fade', font: SERIF, fontSize: 20, hold: 2.4 },
    bubbles: [{ style: 'parchment', title: '懸　賞', text: '帶回森林女巫的黑貓\n賞金 50 枚金幣' }],
  },
  /* ---- 直播・標題 ---- */
  {
    id: 'neon-onair',
    name: '霓虹 ON AIR',
    category: 'show',
    settings: { enter: 'zoom', idle: 'flicker', exit: 'fade', fontSize: 22, font: SANS_BOLD },
    bubbles: [{ style: 'neon', title: 'ON AIR', text: '第三章・霧之港' }],
  },
  {
    id: 'breaking-news',
    name: '快訊跑馬燈',
    category: 'show',
    settings: {
      enter: 'wipe',
      idle: 'none',
      exit: 'wipe',
      fontSize: 20,
      wrapWidth: 640,
      hold: 2.6,
      font: SANS_BOLD,
    },
    bubbles: [{ style: 'news', title: '快訊', text: '阿卡姆鎮郊外發現巨大的腳印' }],
  },
  {
    id: 'shout-crit',
    name: '大成功！',
    category: 'show',
    settings: { enter: 'pop', idle: 'shake', exit: 'pop', fontSize: 36, font: SANS_BLACK },
    bubbles: [{ style: 'shout', text: '大成功！', align: 'center' }],
  },
  /* ---- 通知・系統 ---- */
  {
    id: 'toast-success',
    name: '擲骰成功通知',
    category: 'system',
    settings: { enter: 'side', idle: 'none', exit: 'fade', fontSize: 18, wrapWidth: 420 },
    bubbles: [
      { style: 'toast', title: '擲骰成功', text: '偵查 45 ≤ 60，你注意到了暗門。', icon: 'check' },
    ],
  },
  {
    id: 'window-warn',
    name: '注意視窗',
    category: 'system',
    settings: { enter: 'zoom', idle: 'none', exit: 'zoom', fontSize: 20, wrapWidth: 440 },
    bubbles: [
      {
        style: 'window',
        title: '注意',
        text: '前方的腳步聲越來越近了。\n仍要打開這扇門嗎？',
        icon: 'warn',
        button: '打開',
      },
    ],
  },
  {
    id: 'toast-fail',
    name: '檢定失敗通知',
    category: 'system',
    settings: { enter: 'side', idle: 'none', exit: 'fade', fontSize: 18, wrapWidth: 420 },
    bubbles: [
      {
        style: 'toast',
        title: '檢定失敗',
        text: '聆聽 72 > 50，什麼也沒聽見。',
        icon: 'cross',
        colors: { fill: '#fff5f5', border: '#f8cfcf', text: '#4a2323', accent: '#e5484d' },
      },
    ],
  },
  {
    id: 'window-choice',
    name: '選擇視窗',
    category: 'system',
    settings: { enter: 'pop', idle: 'none', exit: 'zoom', fontSize: 20, wrapWidth: 440 },
    bubbles: [
      {
        style: 'window',
        title: '選擇',
        text: '要跟著腳印走進森林嗎？',
        icon: 'question',
        button: '前進',
        colors: { fill: '#f8faff', border: '#d5dcf0', text: '#2d3240', accent: '#6c5ce7' },
      },
    ],
  },
  /* ---- 卡片・狀態 ---- */
  {
    id: 'glass-weather',
    name: '霧港天氣卡',
    category: 'card',
    settings: { enter: 'fade', enterDur: 0.5, idle: 'float', exit: 'fade', fontSize: 20 },
    bubbles: [{ style: 'glass', title: '霧之港 12°C', text: '濃霧・能見度 30 公尺' }],
  },
  {
    id: 'progress-capsules',
    name: '劇本進度',
    category: 'card',
    settings: {
      enter: 'left',
      stagger: 0.4,
      idle: 'none',
      exit: 'fade',
      font: ROUND,
      fontSize: 20,
      gap: 14,
      hold: 2,
    },
    bubbles: [
      {
        style: 'capsule',
        title: '序章',
        text: '已完成',
        align: 'center',
        colors: { fill: '#dcfce7', border: '#86d9a5', text: '#166534', accent: '#166534' },
      },
      {
        style: 'capsule',
        title: '第一章',
        text: '進行中',
        align: 'center',
        colors: { fill: '#fff3c4', border: '#f2c94c', text: '#8a5a00', accent: '#8a5a00' },
      },
      { style: 'capsule', title: '終章', text: '未開始', align: 'center' },
    ],
  },
  {
    id: 'choice-cards',
    name: '三選一',
    category: 'card',
    settings: {
      enter: 'wipe',
      stagger: 0.35,
      idle: 'none',
      exit: 'fade',
      fontSize: 19,
      gap: 14,
      hold: 2.2,
    },
    bubbles: [
      { style: 'card', title: 'A', text: '調查書架' },
      { style: 'card', title: 'B', text: '呼叫同伴', colors: { accent: '#f59e0b' } },
      { style: 'card', title: 'C', text: '躲進衣櫃', colors: { accent: '#64748b' } },
    ],
  },
  /* ---- 科幻・賽博 ---- */
  {
    id: 'hud-scan',
    name: '掃描面板',
    category: 'sf',
    settings: { enter: 'unroll', idle: 'scan', exit: 'unroll', font: MONO, fontSize: 20 },
    bubbles: [{ style: 'hud', title: 'SCAN // 03', text: '[ 生命反應 ]\n偵測到 2 個未知個體。' }],
  },
  {
    id: 'terminal-log',
    name: '終端機紀錄',
    category: 'sf',
    settings: {
      enter: 'fade',
      enterDur: 0.2,
      idle: 'none',
      exit: 'fade',
      textAnim: 'type',
      typeSpeed: 14,
      cursor: 'block',
      font: MONO,
      fontSize: 20,
      hold: 1.4,
      wrapWidth: 480,
    },
    bubbles: [
      {
        style: 'terminal',
        title: 'archive.log',
        text: '> 讀取檔案中 . . .\n> 第 7 號實驗紀錄\n> 狀態：已銷毀',
      },
    ],
  },
  {
    id: 'holo-signal',
    name: '全息通訊',
    category: 'sf',
    settings: {
      enter: 'glitch',
      idle: 'glitch',
      exit: 'glitch',
      fontSize: 18,
      fps: 12,
      font: MONO,
    },
    bubbles: [{ style: 'hologram', title: 'SIGNAL DETECTED', text: '來源：月球背面' }],
  },
];

export const presetOf = (id: string | null | undefined): Preset | undefined =>
  id ? PRESETS.find((p) => p.id === id) : undefined;

/** 範本的泡泡 → 完整的泡泡（沒寫的顏色用造型的預設） */
export function presetBubble(pb: PresetBubble): Bubble {
  const d = styleDefaults(pb.style);
  return {
    id: newBubbleId(),
    style: pb.style,
    title: pb.title ?? '',
    text: pb.text ?? '',
    icon: pb.icon ?? d.icon,
    button: pb.button ?? '',
    align: pb.align ?? 'left',
    colors: { ...d.colors, ...pb.colors },
  };
}

/** 套用範本：所有設定換成範本的（範本沒寫的用預設值） */
export function applyPreset(p: Preset): SbData {
  return {
    ...BASE_SETTINGS,
    ...p.settings,
    font: { ...(p.settings.font ?? BASE_SETTINGS.font) },
    presetId: p.id,
    bubbles: p.bubbles.map(presetBubble),
  };
}

export const DEFAULT_PRESET = PRESETS[0];
export const defaultData = (): SbData => applyPreset(DEFAULT_PRESET);
