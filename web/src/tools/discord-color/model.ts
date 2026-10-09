/**
 * 工具的資料：編輯區的格式樹、自訂 8 色、效果的顏色；預覽主題與前景／背景另外存（不列入復原）。
 * 讀回（自動保存、專案檔）時逐欄整理，壞掉的欄位用預設值。
 */
import { type AnsiNode, br, code, isValidCode, rgb, text } from './ansi';
import {
  CUSTOM_COUNT,
  DEFAULT_CUSTOM,
  DEFAULT_GRADIENT,
  DEFAULT_THEME,
  DEFAULT_ZEBRA,
  normalizeHex,
  THEME_IDS,
  type ThemeId,
} from './palette';
import { S } from './strings';

export const TOOL_ID = 'discord-color';
export const PROJECT_VERSION = 1;

export interface Settings {
  doc: AnsiNode[];
  /** 自訂 8 色（大寫 #RRGGBB） */
  custom: string[];
  gradient: [string, string];
  zebra: [string, string];
}

export type Target = 'fg' | 'bg';

export interface ViewSettings {
  theme: ThemeId;
  /** 顏色套用在文字（前景）或背景 */
  target: Target;
}

/** 開頁的範例：「歡迎使用 Discord 彩色文字產生器！」（Discord 是藍紫底白字、「彩色文字產生器」粗體＋經典 7 色） */
export function defaultDoc(): AnsiNode[] {
  const [lead, brand, colored, tail] = S.sample;
  return [
    text(lead),
    rgb('#5865F2', false, [rgb('#FFFFFF', true, [text(brand)])]),
    text(' '),
    code(
      1,
      Array.from(colored).map((ch, i) => code(31 + (i % 7), [text(ch)])),
    ),
    text(tail),
  ];
}

export function initialSettings(): Settings {
  return {
    doc: defaultDoc(),
    custom: [...DEFAULT_CUSTOM],
    gradient: [DEFAULT_GRADIENT[0], DEFAULT_GRADIENT[1]],
    zebra: [DEFAULT_ZEBRA[0], DEFAULT_ZEBRA[1]],
  };
}

export const initialView = (): ViewSettings => ({ theme: DEFAULT_THEME, target: 'fg' });

/* ---------- 整理 ---------- */

const MAX_DEPTH = 64;

/** 讀回的格式樹：認不得的節點略過（格式的內容保留），相鄰的文字合併 */
export function sanitizeDoc(raw: unknown, depth = 0): AnsiNode[] | null {
  if (!Array.isArray(raw)) return null;
  const out: AnsiNode[] = [];
  for (const n of raw) {
    if (!n || typeof n !== 'object') continue;
    const node = n as Record<string, unknown>;
    let next: AnsiNode | null = null;
    let inner: AnsiNode[] = [];
    if (node.type !== 'text' && node.type !== 'br' && depth < MAX_DEPTH)
      inner = sanitizeDoc(node.children, depth + 1) ?? [];
    if (node.type === 'text' && typeof node.text === 'string') {
      if (!node.text) continue;
      const last = out[out.length - 1];
      if (last?.type === 'text') {
        last.text += node.text;
        continue;
      }
      next = text(node.text);
    } else if (node.type === 'br') next = br();
    else if (node.type === 'code' && typeof node.code === 'number' && isValidCode(node.code))
      next = code(node.code, inner);
    else if (node.type === 'rgb') {
      const hex = normalizeHex(node.hex);
      if (hex) next = rgb(hex, node.fg === true, inner);
    }
    if (next) out.push(next);
    else if (node.type === 'code' || node.type === 'rgb')
      for (const c of inner) {
        const last = out[out.length - 1];
        if (c.type === 'text' && last?.type === 'text') last.text += c.text;
        else out.push(c);
      }
  }
  return out;
}

function colorPair(raw: unknown, fallback: readonly [string, string]): [string, string] {
  const list = Array.isArray(raw) ? raw : [];
  return [normalizeHex(list[0]) ?? fallback[0], normalizeHex(list[1]) ?? fallback[1]];
}

/** 自動保存與專案檔讀回的資料 → 可以用的設定（不是物件時回傳 null） */
export function sanitizeSettings(raw: unknown): Settings | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const d = raw as Record<string, unknown>;
  const base = initialSettings();
  const custom = Array.isArray(d.custom) ? d.custom : [];
  return {
    doc: sanitizeDoc(d.doc) ?? base.doc,
    custom: Array.from(
      { length: CUSTOM_COUNT },
      (_, i) => normalizeHex(custom[i]) ?? DEFAULT_CUSTOM[i],
    ),
    gradient: colorPair(d.gradient, DEFAULT_GRADIENT),
    zebra: colorPair(d.zebra, DEFAULT_ZEBRA),
  };
}

export function sanitizeView(raw: unknown): ViewSettings {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    theme: THEME_IDS.includes(d.theme as ThemeId) ? (d.theme as ThemeId) : DEFAULT_THEME,
    target: d.target === 'bg' ? 'bg' : 'fg',
  };
}
