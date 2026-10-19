/**
 * 字型（規格 3.4、3.5、D2）：字幕用思源黑體 700；左上文字、時間碼與「NO SIGNAL」用「等寬」Noto Sans Mono 600 或「像素」VT323（× 1.3），
 * 字型沒有的字（中文、符號）用思源黑體補。畫之前只下載用到的字；網頁字型每載好一批就加 1，預覽依它重畫。
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { ensureFont, FALLBACK_STACK } from '@/core/fonts';
import { captionLines, type OsdFont, type VhsState } from './model';

export const CAPTION_FAMILY = 'Noto Sans TC';
export const CAPTION_WEIGHT = 700;
const CAPTION_STACK = `"${CAPTION_FAMILY}", ${FALLBACK_STACK}`;

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

export const captionFont = (size: number): string => `${CAPTION_WEIGHT} ${size}px ${CAPTION_STACK}`;

export const osdFontCss = (font: OsdFont, size: number): string => {
  const f = OSD_FONT_SPEC[font];
  return `${f.weight} ${size}px "${f.family}", ${MONO_REST}`;
};

/** 時間碼可能用到的字 */
const TIMECODE_CHARS = '0123456789:- ';
export const NO_SIGNAL = 'NO SIGNAL';

/** 畫面用到的字型與字（只下載這些字需要的部分） */
export function fontLoads(s: VhsState): { family: string; weight: number; text: string }[] {
  const osd = OSD_FONT_SPEC[s.osdFont];
  const osdText = `${s.osd}${TIMECODE_CHARS}${NO_SIGNAL}`;
  const caption = captionLines(s.caption).join('');
  const out = [
    { family: osd.family, weight: osd.weight, text: osdText },
    /* 等寬／像素字型沒有的字（中文、▶、● 等）由思源黑體補 */
    { family: CAPTION_FAMILY, weight: osd.weight, text: s.osd || '▶' },
  ];
  if (caption) out.push({ family: CAPTION_FAMILY, weight: CAPTION_WEIGHT, text: caption });
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
