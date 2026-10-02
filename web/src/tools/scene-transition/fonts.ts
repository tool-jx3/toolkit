/**
 * 字幕字型（規格 F31、3.7.3）：電腦字型（黑體、明體、楷書、等寬、自訂名稱）＋ Google Fonts 27 套。
 * 主控裁定：電腦字型改用繁中系統字型，並加入台灣常見的楷書（標楷體）。
 * Google 字型只在選到而且字幕不空時才載入（只載入一種字重、只取字幕用到的字）。
 */
import { ensureFont } from '@/core/fonts';

export type FontFallback = 'sans' | 'serif' | 'kai' | 'mono';
export type FontGroupId = 'system' | 'jp-sans' | 'hand' | 'jp-serif' | 'tc' | 'latin';

export interface CaptionFont {
  id: string;
  /** 選單上的名稱 */
  label: string;
  /** 風格說明（選單第二行） */
  note?: string;
  group: FontGroupId;
  /** Google Fonts 的字型名稱（電腦字型不填） */
  family?: string;
  weight: number;
  /** 後備字型（字型沒載入或缺字時） */
  fallback: FontFallback;
}

export const CUSTOM_FONT = 'custom';

/** 系統字型堆疊（台灣常見的字型在前；Linux 的 Noto CJK 也列進來） */
export const SYSTEM_STACKS: Record<FontFallback, readonly string[]> = {
  sans: ['Microsoft JhengHei', '微軟正黑體', 'PingFang TC', 'Heiti TC', 'Noto Sans CJK TC'],
  serif: ['PMingLiU', '新細明體', 'Songti TC', 'Noto Serif CJK TC'],
  kai: ['DFKai-SB', '標楷體', 'BiauKai', 'Kaiti TC'],
  mono: ['Consolas', 'Menlo', 'Courier New', 'Microsoft JhengHei', 'PingFang TC'],
};
const GENERIC: Record<FontFallback, 'serif' | 'sans-serif' | 'monospace'> = {
  sans: 'sans-serif',
  serif: 'serif',
  kai: 'serif',
  mono: 'monospace',
};

export const FONT_GROUPS: readonly { id: FontGroupId; label: string }[] = [
  { id: 'system', label: '電腦字型' },
  { id: 'tc', label: '繁體中文（Google Fonts）' },
  { id: 'jp-sans', label: '黑體、圓體、普普風（Google Fonts）' },
  { id: 'hand', label: '手寫（Google Fonts）' },
  { id: 'jp-serif', label: '明體、毛筆、和風（Google Fonts）' },
  { id: 'latin', label: '只有英數字（Google Fonts，中文改用後備字型）' },
];

const g = (
  id: string,
  family: string,
  weight: number,
  group: FontGroupId,
  fallback: FontFallback,
  note: string,
): CaptionFont => ({ id, label: family, family, weight, group, fallback, note });

export const CAPTION_FONTS: readonly CaptionFont[] = [
  {
    id: 'gothic',
    label: '黑體',
    note: '微軟正黑體、蘋方等',
    group: 'system',
    weight: 700,
    fallback: 'sans',
  },
  {
    id: 'mincho',
    label: '明體',
    note: '新細明體、宋體等',
    group: 'system',
    weight: 700,
    fallback: 'serif',
  },
  { id: 'kai', label: '楷書', note: '標楷體等', group: 'system', weight: 700, fallback: 'kai' },
  { id: 'mono', label: '等寬', note: '適合英數字', group: 'system', weight: 700, fallback: 'mono' },
  {
    id: CUSTOM_FONT,
    label: '自訂名稱',
    note: '輸入電腦裡的字型名稱',
    group: 'system',
    weight: 700,
    fallback: 'sans',
  },
  g('noto-sans-tc', 'Noto Sans TC', 700, 'tc', 'sans', '思源黑體'),
  g('noto-serif-tc', 'Noto Serif TC', 700, 'tc', 'serif', '思源宋體'),
  g('lxgw-wenkai-tc', 'LXGW WenKai TC', 700, 'tc', 'kai', '霞鶩文楷'),
  g('chocolate', 'Chocolate Classical Sans', 400, 'tc', 'sans', '朱古力黑體'),
  g('cactus', 'Cactus Classical Serif', 400, 'tc', 'serif', '仙人掌明體'),
  g('noto-sans-jp', 'Noto Sans JP', 700, 'jp-sans', 'sans', '日文黑體'),
  g('zen-maru', 'Zen Maru Gothic', 700, 'jp-sans', 'sans', '圓體'),
  g('mplus-rounded', 'M PLUS Rounded 1c', 700, 'jp-sans', 'sans', '圓體'),
  g('kosugi-maru', 'Kosugi Maru', 400, 'jp-sans', 'sans', '圓體'),
  g('dela-gothic', 'Dela Gothic One', 400, 'jp-sans', 'sans', '極粗'),
  g('mochiy-pop', 'Mochiy Pop One', 400, 'jp-sans', 'sans', '普普風'),
  g('reggae', 'Reggae One', 400, 'jp-sans', 'sans', '有力'),
  g('dotgothic', 'DotGothic16', 400, 'jp-sans', 'sans', '點陣'),
  g('hachi-maru', 'Hachi Maru Pop', 400, 'hand', 'sans', '可愛圓字'),
  g('klee', 'Klee One', 600, 'hand', 'sans', '教科書體'),
  g('kurenaido', 'Zen Kurenaido', 400, 'hand', 'sans', '軟筆'),
  g('noto-serif-jp', 'Noto Serif JP', 700, 'jp-serif', 'serif', '日文明體'),
  g('shippori', 'Shippori Mincho B1', 700, 'jp-serif', 'serif', '明體'),
  g('zen-old', 'Zen Old Mincho', 700, 'jp-serif', 'serif', '古風明體'),
  g('kaisei', 'Kaisei Decol', 700, 'jp-serif', 'serif', '裝飾明體'),
  g('zen-antique', 'Zen Antique', 400, 'jp-serif', 'serif', '活版'),
  g('yuji-syuku', 'Yuji Syuku', 400, 'jp-serif', 'serif', '毛筆'),
  g('yuji-boku', 'Yuji Boku', 400, 'jp-serif', 'serif', '粗毛筆'),
  g('orbitron', 'Orbitron', 700, 'latin', 'sans', '科幻'),
  g('share-tech', 'Share Tech Mono', 400, 'latin', 'mono', '終端機'),
  g('press-start', 'Press Start 2P', 400, 'latin', 'sans', '點陣'),
  g('cinzel', 'Cinzel', 700, 'latin', 'serif', '碑文'),
];

export const FONT_IDS: readonly string[] = CAPTION_FONTS.map((f) => f.id);
const BY_ID = new Map(CAPTION_FONTS.map((f) => [f.id, f]));

export const fontById = (id: string): CaptionFont => BY_ID.get(id) ?? CAPTION_FONTS[0];

/** 選到的是 Google 字型（需要從網路載入） */
export const isWebFont = (id: string): boolean => !!BY_ID.get(id)?.family;

/** 字幕用的 canvas font 字串 */
export function captionFontCss(fontId: string, fontName: string, px: number): string {
  const f = fontById(fontId);
  const stack = SYSTEM_STACKS[f.fallback];
  const families = f.family
    ? [f.family, ...stack]
    : f.id === CUSTOM_FONT && fontName.trim()
      ? [fontName.trim(), ...stack]
      : [...stack];
  const list = families.map((name) => `"${name.replace(/["\\]/g, '')}"`).join(', ');
  return `${f.weight} ${px}px ${list}, ${GENERIC[f.fallback]}`;
}

/**
 * 載入字幕要用的 Google 字型（只載入字幕用到的字）。電腦字型直接回傳 true。
 * 約 10 秒內載不到就回傳 false（改用後備字型畫）。
 */
export async function ensureCaptionFont(fontId: string, text: string): Promise<boolean> {
  const f = fontById(fontId);
  if (!f.family || !text.trim()) return true;
  return ensureFont(f.family, f.weight, text, { timeoutMs: 10_000 });
}
