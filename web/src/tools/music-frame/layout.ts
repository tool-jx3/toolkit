/**
 * 版面幾何（規格 3.2）：三種版面的封面、黑膠、文字區；標題／歌手／副標的自動縮小與換行；
 * 文字區由上而下的堆疊（標題、歌手、副標、歌詞、視覺化、進度條）與垂直置中；歌詞的大小與間距。
 * 純函式：量字寬的函式由呼叫端提供（畫布的 measureText；測試用假的）。
 */
import { FRAME_H, FRAME_W, type LayoutId, type LyricPosition, type VizId } from './model';

export interface ArtBox {
  x: number;
  y: number;
  /** 邊長 */
  s: number;
}

export interface TextArea {
  /** 對齊的基準 x（靠左時是左邊，置中時是中央） */
  x: number;
  /** 文字的最大寬度 */
  w: number;
  align: 'left' | 'center';
  /** 整疊文字的中心 y */
  cy: number;
  /** 標題的字級、最小字級、最多幾行 */
  ts: number;
  tmin: number;
  lines: number;
  /** 歌手、副標的字級 */
  as: number;
  ss: number;
  /** 視覺化的寬（不給時 min(w, 720)）、高 */
  vizW?: number;
  vizH: number;
  /** 視覺化上方的間距（不給時 52） */
  gapViz?: number;
  /** 長條的根數 */
  bars: number;
}

export interface FrameLayout {
  art: ArtBox;
  vinyl?: { cx: number; cy: number; R: number };
  text: TextArea;
}

/** 三種版面的位置與尺寸（1920 × 1080） */
export function frameLayout(id: LayoutId): FrameLayout {
  if (id === 'center')
    return {
      art: { x: (FRAME_W - 480) / 2, y: 84, s: 480 },
      text: {
        x: FRAME_W / 2,
        w: 1100,
        align: 'center',
        cy: 800,
        ts: 62,
        tmin: 40,
        lines: 1,
        as: 30,
        ss: 22,
        vizW: 880,
        vizH: 76,
        gapViz: 40,
        bars: 64,
      },
    };
  if (id === 'vinyl') {
    const s = 580;
    const x = 150;
    const R = 280;
    const cx = x + s - R + 235;
    const tx = cx + R + 110;
    return {
      art: { x, y: (FRAME_H - s) / 2, s },
      vinyl: { cx, cy: FRAME_H / 2, R },
      text: {
        x: tx,
        w: FRAME_W - tx - 150,
        align: 'left',
        cy: FRAME_H / 2,
        ts: 70,
        tmin: 46,
        lines: 2,
        as: 32,
        ss: 22,
        vizH: 96,
        bars: 44,
      },
    };
  }
  const s = 620;
  const x = 170;
  const tx = x + s + 120;
  return {
    art: { x, y: (FRAME_H - s) / 2, s },
    text: {
      x: tx,
      w: FRAME_W - tx - 170,
      align: 'left',
      cy: FRAME_H / 2,
      ts: 78,
      tmin: 50,
      lines: 2,
      as: 34,
      ss: 24,
      vizH: 110,
      bars: 48,
    },
  };
}

/** 文字的字重、字級與是不是標題（字距不同） */
export interface TextStyle {
  weight: number;
  size: number;
  title: boolean;
}

/** 量 text 在 style 下的寬度 */
export type Measure = (text: string, style: TextStyle) => number;

/** 字距：標題 −4%；字重 ≥ 500 的 −3%；其他 −2%（px） */
export const letterSpacingFor = ({ weight, size, title }: TextStyle) =>
  title ? -size * 0.04 : weight >= 500 ? -size * 0.03 : -size * 0.02;

/**
 * 換行：以空白分詞，一行放得下就接著放；單一個詞比一行還寬時逐字斷開（中文沒有空白，整句就是一個詞）。
 */
export function wrapText(text: string, maxW: number, style: TextStyle, measure: Measure): string[] {
  const out: string[] = [];
  let cur = '';
  for (const wd of text.split(' ')) {
    const test = cur ? `${cur} ${wd}` : wd;
    if (measure(test, style) <= maxW) {
      cur = test;
      continue;
    }
    if (cur) {
      out.push(cur);
      cur = '';
    }
    if (measure(wd, style) <= maxW) cur = wd;
    else {
      let piece = '';
      for (const ch of wd) {
        if (piece && measure(piece + ch, style) > maxW) {
          out.push(piece);
          piece = ch;
        } else piece += ch;
      }
      cur = piece;
    }
  }
  out.push(cur);
  return out;
}

export interface FittedText extends TextStyle {
  lines: string[];
}

/**
 * 自動縮小：從 size 開始每次小 2 px，換行後不超過 maxLines 行就用；到 min 還放不下時用 min、
 * 只留 maxLines 行，最後一行從尾巴刪字直到加上「…」放得下。
 */
export function fitText(
  text: string,
  weight: number,
  size: number,
  min: number,
  maxW: number,
  maxLines: number,
  title: boolean,
  measure: Measure,
): FittedText {
  for (let sz = size; sz >= min; sz -= 2) {
    const style = { weight, size: sz, title };
    const lines = wrapText(text, maxW, style, measure);
    if (lines.length <= maxLines) return { ...style, lines };
  }
  const style = { weight, size: min, title };
  const lines = wrapText(text, maxW, style, measure).slice(0, maxLines);
  let last = lines[lines.length - 1];
  while (Array.from(last).length > 1 && measure(`${last}…`, style) > maxW)
    last = Array.from(last).slice(0, -1).join('');
  lines[lines.length - 1] = `${last.trimEnd()}…`;
  return { ...style, lines };
}

/* ---------- 歌詞的大小與間距 ---------- */

export interface LyricDims {
  /** 目前這一句的字級 */
  s: number;
  /** 翻譯的字級 */
  t: number;
  /** 下一句的字級 */
  n: number;
  /** 歌詞與翻譯的間距 */
  gT: number;
  /** 上面與下一句的間距 */
  gN: number;
}

/** 有翻譯時：歌詞 →（小間距）→ 翻譯 →（大間距）→ 下一句 */
export function lyricDims(size: number, gapK: number, translated: boolean): LyricDims {
  return {
    s: size,
    t: Math.max(18, Math.round(size * 0.66)),
    n: Math.max(16, Math.round(size * (translated ? 0.58 : 0.62))),
    gT: Math.round(size * 0.26),
    gN: translated ? Math.round(size * gapK) : Math.round(size * 0.3),
  };
}

/** 歌詞放在曲目資訊下方時的大小（設定的 0.75 倍） */
export const stackLyricDims = (size: number, translated: boolean) =>
  lyricDims(Math.round(size * 0.75), 0.95, translated);

/** 歌詞放在曲目資訊下方時佔的高度 */
export function stackLyricHeight(size: number, translated: boolean, showNext: boolean): number {
  const z = stackLyricDims(size, translated);
  return z.s * 1.25 + (translated ? z.gT + z.t * 1.25 : 0) + (showNext ? z.gN + z.n * 1.25 : 0);
}

/** 畫面下方的歌詞的大小 */
export const bottomLyricDims = (size: number, translated: boolean) =>
  lyricDims(size, 0.8, translated);

/* ---------- 文字區的堆疊 ---------- */

export type StackItem =
  | ({ k: 'title' | 'artist' | 'subtitle'; y: number } & FittedText)
  | { k: 'lyrics'; y: number; h: number }
  | { k: 'viz'; y: number; h: number }
  | { k: 'progress'; y: number };

export interface Stack {
  items: StackItem[];
  /** 第一個項目的 y（畫面座標）；每個項目的位置＝top + item.y */
  top: number;
}

export interface StackInput {
  layout: LayoutId;
  title: string;
  artist: string;
  subtitle: string;
  viz: VizId;
  progress: boolean;
  /** 有要顯示的歌詞（開啟、而且有時間的句子） */
  lyricsActive: boolean;
  lyricPosition: LyricPosition;
  lyricSize: number;
  lyricShowNext: boolean;
  translated: boolean;
}

/**
 * 由上而下：標題（行高 1.16）→ 間距 0.26 倍標題字級 → 歌手（1.3）→ 8 px → 副標（1.35）
 * →（歌詞在資訊下方時）30 px（中央版面 18）＋歌詞 → 間距（版面給的，預設 52；中央＋歌詞時少 18）＋視覺化
 * → 進度條（有視覺化 26 px、沒有時中央 36／其他 48），進度條佔 44 px。整疊以版面的中心 y 置中；
 * 中央版面有歌詞時，整疊至少在封面下方 60 px。
 */
export function buildStack(input: StackInput, measure: Measure): Stack {
  const L = frameLayout(input.layout);
  const tc = L.text;
  const t = fitText(input.title || ' ', 700, tc.ts, tc.tmin, tc.w, tc.lines, true, measure);
  const a = input.artist
    ? fitText(input.artist, 500, tc.as, Math.round(tc.as * 0.75), tc.w, 1, false, measure)
    : null;
  const s = input.subtitle
    ? fitText(input.subtitle, 400, tc.ss, Math.round(tc.ss * 0.8), tc.w, 1, false, measure)
    : null;
  const items: StackItem[] = [];
  let y = 0;
  items.push({ k: 'title', y, ...t });
  y += t.lines.length * t.size * 1.16;
  if (a) {
    y += t.size * 0.26;
    items.push({ k: 'artist', y, ...a });
    y += a.size * 1.3;
  }
  if (s) {
    y += 8;
    items.push({ k: 'subtitle', y, ...s });
    y += s.size * 1.35;
  }
  const stacked = input.lyricsActive && input.lyricPosition === 'stack';
  const centerLyrics = stacked && input.layout === 'center';
  if (stacked) {
    y += centerLyrics ? 18 : 30;
    const h = stackLyricHeight(input.lyricSize, input.translated, input.lyricShowNext);
    items.push({ k: 'lyrics', y, h });
    y += h;
  }
  if (input.viz !== 'none') {
    y += (tc.gapViz ?? 52) - (centerLyrics ? 18 : 0);
    items.push({ k: 'viz', y, h: tc.vizH });
    y += tc.vizH;
  }
  if (input.progress) {
    y += input.viz !== 'none' ? 26 : input.layout === 'center' ? 36 : 48;
    items.push({ k: 'progress', y });
    y += 44;
  }
  let top = tc.cy - y / 2;
  if (centerLyrics) top = Math.max(top, L.art.y + L.art.s + 60);
  return { items, top };
}

/** 視覺化與進度條的寬度與左邊 */
export function vizBox(tc: TextArea): { x: number; w: number } {
  const w = tc.vizW ?? Math.min(tc.w, 720);
  return { x: tc.align === 'center' ? tc.x - w / 2 : tc.x, w };
}
