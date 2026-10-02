/**
 * 把「載入的日誌＋設定＋這份日誌的選擇＋圖片」整理成轉換的輸入（則的清單、成品選項、分割規則、檔名主體）。
 * 介面（按下轉換的當下）與單元測試共用這一段，確保兩邊的規則相同。
 */
import { buildEntries, type LogEntry } from './classify';
import { fileBaseFor, type LogSource, outputTitle, sourceTabs } from './load';
import type { RenderIllustration, RenderOptions } from './render';
import type { IllustrationAlign, IllustrationSize } from './render/common';
import {
  DEFAULT_TAB_TEXT,
  type LcSettings,
  type SplitRule,
  separatorText,
  splitRule,
  type TabColor,
  type TabStyle,
} from './settings';
import { OUT } from './strings';

/** 只對目前這份日誌有意義的選擇（載入時重設） */
export interface LogChoices {
  title: string;
  subtitle: string;
  summary: string;
  /** 旁白角色；null＝預設的 GM 選項 */
  narrator: string | null;
  /** 閒聊分頁；null＝不指定 */
  chatTab: string | null;
  nameColors: Record<string, string>;
  /** 不輸出的分頁（F55） */
  hiddenTabs: string[];
  tabStyles: Record<string, TabStyle>;
  /** 逐則頭像（F30，只有新格式） */
  useLogImages: boolean;
}

export interface IllustrationItem {
  id: string;
  /** 使用者輸入的「插在第幾則之後」原文 */
  position: string;
  source: 'file' | 'url';
  /** 選檔：處理後的 data URL */
  fileData: string;
  fileName: string;
  url: string;
  size: IllustrationSize;
  align: IllustrationAlign;
}

export interface ImageSet {
  /** 發言者的頭像：使用者上傳／網址（處理後），否則新格式的代表頭像（處理後） */
  profileImages: Record<string, string>;
  /** 新格式日誌裡的頭像：原圖 → 處理後 */
  messageImages: Record<string, string>;
}

export const DEFAULT_NARRATOR = 'GM';

/** 插圖的位置（F42）：空白、0、負數、非數字不插入 */
export function illustrationPosition(text: string): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const v = Number.parseInt(t, 10);
  return v > 0 ? v : null;
}

export function renderIllustrations(list: readonly IllustrationItem[]): RenderIllustration[] {
  const out: RenderIllustration[] = [];
  for (const it of list) {
    const position = illustrationPosition(it.position);
    const src = it.source === 'url' ? it.url.trim() : it.fileData;
    if (position === null || !src) continue;
    out.push({ position, src, size: it.size, align: it.align });
  }
  return out;
}

/** 分頁配色（F62）：開啟、而且有 2 個以上分頁時，每個分頁都有顏色（沒改過的是淺灰文字、透明背景） */
export function effectiveTabColors(
  settings: Pick<LcSettings, 'tabColorsEnabled' | 'tabColors'>,
  tabs: readonly string[],
): Record<string, TabColor> | null {
  if (!settings.tabColorsEnabled || tabs.length < 2) return null;
  const out: Record<string, TabColor> = {};
  for (const t of tabs) out[t] = settings.tabColors[t] ?? { text: DEFAULT_TAB_TEXT, bg: null };
  return out;
}

export interface Conversion {
  entries: LogEntry[];
  options: RenderOptions;
  rule: SplitRule;
  fileBase: string;
}

export function prepareConversion(
  source: LogSource,
  settings: LcSettings,
  choices: LogChoices,
  images: ImageSet,
  illustrations: readonly IllustrationItem[],
): Conversion {
  const entries = buildEntries(source.format, source.messages, {
    narrator: choices.narrator ?? DEFAULT_NARRATOR,
    chatTab: choices.chatTab,
    merge: settings.mergeConsecutive,
  });
  const tabs = sourceTabs(source);
  const fileBase = fileBaseFor(choices.title, source);
  const subNarrators: RenderOptions['subNarrators'] = Object.fromEntries(
    settings.subNarrators.map((s) => [s.speaker, { style: s.style, color: s.color }]),
  );
  const multiTab = tabs.length > 1;
  const options: RenderOptions = {
    style: settings.style,
    title: outputTitle(choices.title, fileBase, OUT.defaultTitle),
    subtitle: choices.subtitle,
    summary: choices.summary,
    fontUrl: settings.fontUrl,
    fontFamily: settings.fontFamily,
    fontSize: settings.fontSize,
    lineHeight: settings.lineHeight,
    pageWidth: settings.pageWidth,
    novelTypography: settings.novelTypography,
    palette: settings.palette,
    narrationMode: settings.narrationMode,
    narrationCenter: settings.narrationCenter,
    subNarrators,
    nameColors: choices.nameColors,
    hiddenTabs: new Set(multiTab ? choices.hiddenTabs : []),
    tabStyles: multiTab && settings.style === 'ccfolia' ? choices.tabStyles : {},
    tabColors: effectiveTabColors(settings, tabs),
    chatMode: settings.chatMode,
    showChatCount: settings.showChatCount,
    hideSystem: settings.hideSystem,
    longNameWrap: settings.longNameWrap,
    dialogueLayout: settings.dialogueLayout,
    separator: separatorText(settings.separatorType, settings.customSeparator),
    illustrations: renderIllustrations(illustrations),
    profileImages: images.profileImages,
    messageImages: source.format === 'v2' && choices.useLogImages ? images.messageImages : null,
    labels: OUT,
  };
  return { entries, options, rule: splitRule(settings), fileBase };
}

/** e2e 的掛鉤（testHook.ts）收的案例：日誌、設定、這份日誌的選擇、頭像與插圖 */
export interface HookCase {
  files: { name: string; text: string }[];
  settings: Partial<LcSettings>;
  choices: Partial<LogChoices> & { tabStylesAll?: 'label' };
  /** 使用比對用名稱顏色時給（蓋過日誌的初始值） */
  nameColors?: Record<string, string>;
  renames?: Record<string, string>;
  uploads?: Record<string, { kind: 'file'; data: string } | { kind: 'external'; url: string }>;
  illustrations?: (Omit<IllustrationItem, 'fileData'> & { data?: string })[];
}
