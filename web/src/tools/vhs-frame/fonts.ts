/**
 * 字型（規格 3.4、3.5、D2）：字幕用思源黑體 700（2026-11-05 可以換成思源宋體 700）；左上文字、時間碼、頻道、日期戳記與「NO SIGNAL」
 * 用「等寬」Noto Sans Mono 600 或「像素」VT323（× 1.3），字型沒有的字（中文、符號）用思源黑體補。
 * 畫之前只下載用到的字；網頁字型每載好一批就加 1，預覽依它重畫。
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { ensureFont, FALLBACK_STACK } from '@/core/fonts';
import {
  type CaptionFont,
  captionScenes,
  channelText,
  introChannel,
  type OsdFont,
  stampLines,
  type VhsState,
} from './model';

export const CAPTION_FAMILY = 'Noto Sans TC';
export const CAPTION_WEIGHT = 700;

/** 字幕的字型：黑體（原本的）、明體 */
export const CAPTION_FONT_SPEC: Record<CaptionFont, { family: string; weight: number }> = {
  sans: { family: CAPTION_FAMILY, weight: CAPTION_WEIGHT },
  serif: { family: 'Noto Serif TC', weight: 700 },
};
const SERIF_REST = "'PMingLiU', 'MingLiU', 'Songti TC', serif";

export interface OsdFontSpec {
  family: string;
  weight: number;
  /** 字級的倍數（像素字型的字面小，放大一點才和等寬字型差不多大） */
  scale: number;
}

export const OSD_FONT_SPEC: Record<OsdFont, OsdFontSpec> = {
  mono: { family: 'Noto Sans Mono', weight: 600, scale: 1 },
  pixel: { family: 'VT323', weight: 400, scale: 1.3 },
};

const MONO_REST =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, "DejaVu Sans Mono", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Noto Sans CJK TC", monospace';

export const captionFont = (size: number, font: CaptionFont = 'sans'): string => {
  const f = CAPTION_FONT_SPEC[font];
  return font === 'sans'
    ? `${f.weight} ${size}px "${f.family}", ${FALLBACK_STACK}`
    : `${f.weight} ${size}px "${f.family}", ${SERIF_REST}, ${FALLBACK_STACK}`;
};

export const osdFontCss = (font: OsdFont, size: number): string => {
  const f = OSD_FONT_SPEC[font];
  return `${f.weight} ${size}px "${f.family}", ${MONO_REST}`;
};

/** 時間碼可能用到的字 */
const TIMECODE_CHARS = '0123456789:- ';
export const NO_SIGNAL = 'NO SIGNAL';

/** 頻道、日期戳記用到的字（只在用到時才加進去） */
function extraOsdText(s: VhsState): string {
  let text = '';
  if (s.timecode.mode === 'channel') text += channelText(s.channel);
  if (s.anim.intro) text += [0, 1, 2].map((k) => introChannel(s.channel, k)).join('');
  if (s.stamp.on) text += stampLines(s.stamp.value, s.stamp.format).join('');
  return text;
}

/** 畫面用到的字型與字（只下載這些字需要的部分） */
export function fontLoads(s: VhsState): { family: string; weight: number; text: string }[] {
  const osd = OSD_FONT_SPEC[s.osdFont];
  const osdText = `${s.osd}${TIMECODE_CHARS}${NO_SIGNAL}${extraOsdText(s)}`;
  const caption = captionScenes(s.caption)
    .map((l) => l.join(''))
    .join('');
  const cap = CAPTION_FONT_SPEC[s.captionStyle.font];
  const out = [
    { family: osd.family, weight: osd.weight, text: osdText },
    /* 等寬／像素字型沒有的字（中文、▶、● 等）由思源黑體補 */
    { family: CAPTION_FAMILY, weight: osd.weight, text: s.osd || '▶' },
  ];
  if (caption) out.push({ family: cap.family, weight: cap.weight, text: caption });
  return out;
}

/* ---------- 載好之後重畫 ---------- */

const useTick = create<{ tick: number }>(() => ({ tick: 0 }));
const bump = () => useTick.setState((s) => ({ tick: s.tick + 1 }));

let listening = false;
function listen(): void {
  if (listening || typeof document === 'undefined' || !document.fonts) return;
  listening = true;
  document.fonts.addEventListener?.('loadingdone', bump);
}

/** 字型載入的計數（放進畫圖的依賴，載好後重畫） */
export function useFontTick(): number {
  listen();
  return useTick((s) => s.tick);
}

/** 確保這組字型＋文字載好（載好後計數加 1） */
export function useEnsureFonts(list: readonly { family: string; weight: number; text: string }[]) {
  const key = list.map((x) => `${x.family}|${x.weight}|${x.text}`).join('\u0000');
  // biome-ignore lint/correctness/useExhaustiveDependencies: key 已包含 list 的內容
  useEffect(() => {
    let alive = true;
    void Promise.all(
      list.map((x) => ensureFont(x.family, x.weight, x.text).catch(() => false)),
    ).then(() => {
      if (alive) bump();
    });
    return () => {
      alive = false;
    };
  }, [key]);
}

/** 匯出前等字型 */
export async function waitFonts(s: VhsState): Promise<void> {
  await Promise.all(
    fontLoads(s).map((x) => ensureFont(x.family, x.weight, x.text).catch(() => false)),
  );
}
