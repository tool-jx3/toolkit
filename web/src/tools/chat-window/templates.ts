/**
 * 聊天視窗產生器的範本（本專案自己做的繁中範本）。範本只寫跟「基礎外觀」不同的部分；
 * 套用時換掉所有外觀類設定，保留來源大小、房間網址、OBS 互動選項與檔名（預覽設定在另一個 store）。
 */
import type { FontValue } from '@/core/fonts';
import { applyTemplate } from '@/core/storage';
import {
  BASE_SETTINGS,
  type ChatSettings,
  NON_APPEARANCE_KEYS,
  normalizeSettings,
} from './settings';
import { S } from './strings';

export type TemplateData = Partial<Omit<ChatSettings, (typeof NON_APPEARANCE_KEYS)[number]>>;

export interface ChatTemplate {
  id: string;
  name: string;
  description: string;
  data: TemplateData;
}

const g = (family: string, weight: number): FontValue => ({ source: 'google', family, weight });

const DATA: { id: keyof typeof S.templates; data: TemplateData }[] = [
  /* 1. 一般用途（開頁的預設外觀） */
  { id: 'night', data: {} },
  /* 2. 擲骰專用 */
  {
    id: 'dice',
    data: {
      diceOnly: true,
      count: 5,
      sizeMode: 'fit',
      anchor: 'bottom',
      bg: '#101218cc',
      padding: 10,
      radius: 10,
      titleMode: 'text',
      titleText: '擲骰紀錄',
      titleStyle: 'underline',
      titleSize: 14,
      titleLineColor: '#4fb3ff',
      titleGap: 8,
      boxBg: '#ffffff0f',
      boxPadX: 9,
      boxPadY: 6,
      accent: 'outcome',
      accentWidth: 4,
      accentColor: '#8a8f99',
      avatarSize: 32,
      avatarShape: 'circle',
      avatarGap: 8,
      nameSize: 13,
      time: true,
      bodySize: 13,
      bodyColor: '#c9ced6',
      resultSize: 17,
      resultBreak: true,
      resultStyle: 'outline',
      resultGlow: true,
      resultFlash: true,
      enter: 'right',
      enterDuration: 0.4,
    },
  },
  /* 3. 單則放大 */
  {
    id: 'spotlight',
    data: {
      count: 1,
      sizeMode: 'fill',
      margin: 12,
      padding: 18,
      bg: '#0d0f14d9',
      radius: 16,
      shadow: 40,
      boxShape: 'none',
      boxPadX: 0,
      boxPadY: 0,
      avatarSize: 96,
      avatarGap: 18,
      nameStyle: 'underline',
      nameSize: 20,
      nameGap: 6,
      bodySize: 22,
      lineHeight: 1.6,
      resultSize: 24,
      resultBreak: true,
      resultGlow: true,
      resultFlash: true,
      enter: 'pop',
      enterDuration: 0.45,
      scroll: true,
      scrollDelay: 3,
      scrollDuration: 25,
    },
  },
  /* 4. 秘匿分頁用 */
  {
    id: 'secret',
    data: {
      count: 5,
      bg: '#1a1326d9',
      borderWidth: 1,
      borderColor: '#9a7be066',
      radius: 10,
      titleMode: 'text-tab',
      titleText: '密談中｜',
      titleStyle: 'tab',
      titleSize: 14,
      titleLineColor: '#9a7be0',
      titleGap: 0,
      titleLock: true,
      participants: true,
      participantPrefix: '參加者',
      participantPrefixSize: 12,
      participantSize: 24,
      participantGap: -6,
      participantRing: 2,
      participantRingColor: '#1a1326ff',
      boxBg: '#9a7be01f',
      accent: 'character',
      accentWidth: 3,
      enter: 'fade',
      enterDuration: 0.5,
    },
  },
  /* 5. 無背景紀錄 */
  {
    id: 'clear',
    data: {
      count: 8,
      gap: 4,
      margin: 16,
      padding: 0,
      bg: '#00000000',
      shadow: 0,
      radius: 0,
      boxShape: 'none',
      boxPadX: 0,
      boxPadY: 2,
      avatar: false,
      nameStyle: 'prefix',
      nameSize: 16,
      bodySize: 16,
      bodyColor: '#ffffff',
      effect: 'stroke',
      effectColor: '#000000e6',
      effectWidth: 2.5,
      resultSize: 16,
      enter: 'left',
      enterDuration: 0.3,
      fade: true,
      fadeStay: 20,
      fadeDuration: 1,
    },
  },
  /* 6. 對話泡泡 */
  {
    id: 'bubble',
    data: {
      count: 5,
      gap: 10,
      padding: 6,
      bg: '#00000000',
      shadow: 0,
      boxShape: 'bubble',
      boxBg: '#ffffffeb',
      boxRadius: 14,
      boxShadow: 25,
      boxPadX: 12,
      boxPadY: 8,
      avatarSize: 44,
      avatarShape: 'circle',
      avatarBorder: 2,
      avatarBorderColor: '#ffffffe6',
      avatarGap: 12,
      nameStyle: 'pill',
      nameSize: 12,
      nameGap: 4,
      bodyColor: '#2a2c33',
      effect: 'none',
      successColor: '#1c7ed6',
      failureColor: '#e03158',
      otherColor: '#5c6370',
      enter: 'up',
    },
  },
  /* 7. 舊紙張 */
  {
    id: 'parchment',
    data: {
      count: 5,
      gap: 4,
      padding: 16,
      bg: '#efe4cbff',
      texture: 'paper',
      radius: 6,
      shadow: 45,
      brackets: true,
      bracketColor: '#6b4a2acc',
      titleMode: 'text',
      titleText: '冒險手記',
      titleStyle: 'lines',
      titleFont: g('Noto Serif TC', 700),
      titleSize: 18,
      titleColor: '#4a3420',
      titleLineColor: '#8a6a44',
      titleAlign: 'center',
      titleGap: 10,
      boxShape: 'none',
      boxPadX: 4,
      boxPadY: 6,
      divider: true,
      dividerColor: '#6b4a2a40',
      avatarSize: 36,
      avatarShape: 'square',
      avatarBorder: 1,
      avatarBorderColor: '#6b4a2a99',
      nameFont: g('Noto Serif TC', 700),
      nameColorMode: 'custom',
      nameColor: '#5a3d22',
      bodyFont: g('Noto Serif TC', 400),
      bodyColor: '#3b2f22',
      effect: 'none',
      resultFont: g('Noto Serif TC', 700),
      successColor: '#1f5fa8',
      failureColor: '#a8242f',
      otherColor: '#5a4a3a',
      enter: 'fade',
      enterDuration: 0.6,
    },
  },
  /* 8. 終端機 */
  {
    id: 'terminal',
    data: {
      count: 8,
      gap: 3,
      padding: 12,
      bg: '#04120bf2',
      texture: 'scanlines',
      borderWidth: 1,
      borderColor: '#3dff8c55',
      radius: 4,
      shadow: 50,
      titleMode: 'tab',
      titleStyle: 'underline',
      titleFont: g('DotGothic16', 400),
      titleSize: 15,
      titleColor: '#3dff8c',
      titleLineColor: '#3dff8c',
      titleGap: 8,
      boxShape: 'none',
      boxPadX: 0,
      boxPadY: 1,
      avatar: false,
      nameStyle: 'prefix',
      nameFont: g('DotGothic16', 400),
      nameSize: 15,
      bodyFont: g('DotGothic16', 400),
      bodySize: 15,
      bodyColor: '#b8ffd2',
      effect: 'glow',
      effectColor: '#3dff8c59',
      resultFont: g('DotGothic16', 400),
      resultSize: 15,
      successColor: '#3dff8c',
      failureColor: '#ff4d4d',
      otherColor: '#9fd8b4',
      enter: 'blur',
      enterDuration: 0.3,
    },
  },
  /* 9. 擲骰當下顯示、之後消失 */
  {
    id: 'flash',
    data: {
      diceOnly: true,
      count: 1,
      sizeMode: 'fit',
      anchor: 'bottom',
      margin: 16,
      padding: 14,
      bg: '#0b0d12e6',
      radius: 40,
      borderWidth: 2,
      borderColor: '#ffffff33',
      shadow: 50,
      boxShape: 'none',
      boxPadX: 6,
      boxPadY: 0,
      avatarSize: 56,
      avatarShape: 'circle',
      avatarAlign: 'center',
      avatarGap: 14,
      nameSize: 15,
      bodySize: 15,
      resultStyle: 'solid',
      resultBreak: true,
      resultSize: 24,
      resultGlow: true,
      resultFlash: true,
      enter: 'pop',
      enterDuration: 0.5,
      fade: true,
      fadeStay: 8,
      fadeDuration: 0.6,
    },
  },
];

export const TEMPLATES: readonly ChatTemplate[] = DATA.map(({ id, data }) => ({
  id,
  name: S.templates[id].name,
  description: S.templates[id].description,
  data,
}));

export const DEFAULT_TEMPLATE_ID = TEMPLATES[0].id;

export function getTemplate(id: string | null | undefined): ChatTemplate | undefined {
  return id ? TEMPLATES.find((t) => t.id === id) : undefined;
}

export const isTemplateId = (id: string): boolean => !!getTemplate(id);

/** 範本的完整外觀（基礎外觀＋範本差異） */
export function templateAppearance(t: ChatTemplate): ChatSettings {
  return { ...BASE_SETTINGS, ...t.data, templateId: t.id };
}

/**
 * 套用範本：所有外觀類設定換成範本的（範本的標題文字、參加者前綴也在這時寫入），
 * 保留來源大小、房間網址、OBS 互動選項與檔名。
 */
export function applyChatTemplate(current: ChatSettings, t: ChatTemplate): ChatSettings {
  return applyTemplate(current, templateAppearance(t), { keep: [...NON_APPEARANCE_KEYS] });
}

/** 開頁（與全部重來）的初始狀態：基礎外觀＋第 1 個範本、來源 480 × 460、房間空白 */
export function initialSettings(): ChatSettings {
  return templateAppearance(TEMPLATES[0]);
}

/** 存檔或專案檔 → 合法的設定（範本 id 無效時當作沒有範本） */
export function normalizeChatSettings(raw: unknown): ChatSettings {
  return normalizeSettings(raw, initialSettings(), isTemplateId);
}
