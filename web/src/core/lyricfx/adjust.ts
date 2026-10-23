/**
 * 逐句的手動調整（lyric-fx 規格 3.8、F75～F81）：通用的格式（types.ts 的 LyricLineAdjust）、範圍與正規化。
 * 工具（逐句清單、預覽上的操作、存檔）與風格（plan、draw）都用這裡的範圍；和風格無關，music-frame 之後也用這個。
 */
import type { LyricFont, LyricFxLine, LyricLineAdjust } from './types';

export const ADJUST_RANGES = {
  /** 角度（度） */
  angle: { min: -90, max: 90 },
  /** 字級的倍率 */
  scale: { min: 0.5, max: 2 },
  /** 不透明度的倍率 */
  opacity: { min: 0, max: 1 },
} as const;

const HEX = /^#[0-9a-f]{6}$/i;
/** 記下的折行最多幾行 */
const MAX_ROWS = 200;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** 比例存到小數 5 位（1920 寬的畫面約 0.02 px）、倍率與角度到小數 2 位 */
const round = (v: number, digits: number) => {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
};

function fontOf(v: unknown): LyricFont | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const source =
    o.source === 'google' || o.source === 'local' || o.source === 'upload' ? o.source : null;
  const family = typeof o.family === 'string' ? o.family.trim().slice(0, 200) : '';
  if (!source || !family) return null;
  const weight = finite(o.weight) ? clamp(Math.round(o.weight), 100, 1000) : 400;
  return { source, family, weight };
}

/**
 * 讀存檔、專案檔時修正：超出範圍的夾回、不合法的拿掉（x、y 要兩個都有；rows 要和位置或角度一起）；什麼都沒有時 null。
 * 倍率 1、不透明度 1 和沒有調整一樣，也拿掉。
 */
export function normalizeLineAdjust(raw: unknown): LyricLineAdjust | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const out: LyricLineAdjust = {};
  if (finite(o.x) && finite(o.y)) {
    out.x = round(clamp(o.x, 0, 1), 5);
    out.y = round(clamp(o.y, 0, 1), 5);
  }
  if (finite(o.angle))
    out.angle = round(clamp(o.angle, ADJUST_RANGES.angle.min, ADJUST_RANGES.angle.max), 2);
  /* 記下的折行：只和手動位置或角度一起（D27） */
  if (
    (out.x != null || out.angle != null) &&
    Array.isArray(o.rows) &&
    o.rows.length > 0 &&
    o.rows.length <= MAX_ROWS &&
    o.rows.every((r) => typeof r === 'string' && r.length <= 2000)
  )
    out.rows = [...(o.rows as string[])];
  if (typeof o.color === 'string' && HEX.test(o.color)) out.color = o.color.toLowerCase();
  if (typeof o.glowColor === 'string' && HEX.test(o.glowColor))
    out.glowColor = o.glowColor.toLowerCase();
  if (finite(o.scale)) {
    const s = round(clamp(o.scale, ADJUST_RANGES.scale.min, ADJUST_RANGES.scale.max), 2);
    if (s !== 1) out.scale = s;
  }
  if (finite(o.opacity)) {
    const a = round(clamp(o.opacity, ADJUST_RANGES.opacity.min, ADJUST_RANGES.opacity.max), 2);
    if (a !== 1) out.opacity = a;
  }
  const font = fontOf(o.font);
  if (font) out.font = font;
  return Object.keys(out).length ? out : null;
}

/** 這一句有手動位置（x、y）：位置固定（工具寫手動位置或角度時一律三個一起寫） */
export const hasManualPosition = (a: LyricLineAdjust | null | undefined): boolean =>
  !!a && finite(a.x) && finite(a.y);

/** 逐句用到的字型（工具在畫之前、匯出之前一起載入；同一套字型只列一次，附上用到它的字） */
export function adjustFonts(lines: readonly LyricFxLine[]): { font: LyricFont; text: string }[] {
  const map = new Map<string, { font: LyricFont; text: string }>();
  for (const l of lines) {
    const f = l.adjust?.font;
    if (!f) continue;
    const k = `${f.source}\n${f.family}\n${f.weight}`;
    const hit = map.get(k);
    if (hit) hit.text += l.text + l.tr;
    else map.set(k, { font: f, text: l.text + l.tr });
  }
  return [...map.values()];
}
