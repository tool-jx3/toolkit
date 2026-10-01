/**
 * 文字軌跡產生器的狀態（不儲存：重新整理後回到預設，規格 F31）。
 *
 * 動作回傳要顯示的短暫訊息代號（null＝不顯示），由元件轉成 Toast。
 * 「有結果」＝結果欄不是空的：這時間距倍數（F11）、填空字元（F12）、行首替換（F13）、起訖對調（F16）、
 * 依字數縮放（F15）會接著重新產生；這類自動重產若產生不了（例如文字已經清空）就不提示、保留原本的結果。
 */
import { create } from 'zustand';
import { type Point, reversePath } from '@/core/path';
import {
  COLS,
  FILL_CHARS,
  type FillKind,
  fitPathToText,
  generate,
  isUsablePath,
  type OverlayLabel,
  type Shape,
  SPACING,
  shapePath,
  splitChars,
} from './logic';
import { S } from './strings';

export interface TextPathState {
  text: string;
  shape: Shape;
  path: Point[];
  cols: number;
  spacing: number;
  fill: FillKind;
  lineHead: boolean;
  /** 結果文字（空字串＝還沒有結果） */
  result: string;
  /** 繪製區上的疊字（軌跡重畫時清掉，直到再次產生） */
  labels: OverlayLabel[];
  labelSize: number;
}

export type MessageKey =
  | 'noText'
  | 'noPath'
  | 'reverseNoPath'
  | 'fewChars'
  | 'fitNoPath'
  | 'fitted';

export interface TextPathActions {
  setText(text: string): void;
  /** 選形狀：預設形狀換成那個軌跡（不重新產生）；自由繪製只切換、不清掉現有的軌跡 */
  selectShape(shape: Shape): void;
  /** 開始畫線：切到自由繪製、疊字消失 */
  drawStart(): void;
  /** 一筆畫完 */
  drawEnd(points: Point[]): void;
  setCols(cols: number): void;
  setSpacing(spacing: number): void;
  setFill(fill: FillKind): void;
  setLineHead(on: boolean): void;
  generate(): MessageKey | null;
  fit(): MessageKey | null;
  reverse(): MessageKey | null;
  clear(): void;
  /** 回到開頁狀態 */
  reset(): void;
}

export function initialState(): TextPathState {
  return {
    text: S.sampleText,
    shape: 'circle',
    path: shapePath('circle'),
    cols: COLS.default,
    spacing: SPACING.default,
    fill: 'ideographic',
    lineHead: false,
    result: '',
    labels: [],
    labelSize: 16,
  };
}

/** 依目前狀態產生；成功時回傳要合併的欄位 */
function run(s: TextPathState) {
  return generate({
    text: s.text,
    path: s.path,
    cols: s.cols,
    fill: FILL_CHARS[s.fill],
    lineHead: s.lineHead,
  });
}

function produced(s: TextPathState): Partial<TextPathState> | null {
  const r = run(s);
  return r.ok ? { result: r.text, labels: r.labels, labelSize: r.labelSize } : null;
}

export const useTextPath = create<TextPathState & TextPathActions>()((set, get) => {
  /** 已有結果時重新產生（失敗時不提示，只清掉疊字） */
  const regenerateIfShown = (next: TextPathState): Partial<TextPathState> => {
    if (!next.result) return {};
    return produced(next) ?? { labels: [] };
  };

  return {
    ...initialState(),

    setText: (text) => set({ text }),

    selectShape: (shape) => {
      if (shape === 'free') {
        set({ shape });
        return;
      }
      set({ shape, path: shapePath(shape), labels: [] });
    },

    drawStart: () => set({ shape: 'free', labels: [] }),

    drawEnd: (points) => set({ shape: 'free', path: points, labels: [] }),

    setCols: (cols) => set({ cols }),

    setSpacing: (spacing) => {
      const s = get();
      if (!s.result || !isUsablePath(s.path)) {
        set({ spacing });
        return;
      }
      /* F11：已有結果時立刻依字數縮放（不顯示訊息）並重新產生 */
      const fit = fitPathToText({
        path: s.path,
        count: splitChars(s.text).length,
        cols: s.cols,
        spacing,
      });
      const next: TextPathState = { ...s, spacing, path: fit.ok ? fit.path : s.path };
      set({ spacing, path: next.path, ...regenerateIfShown(next) });
    },

    setFill: (fill) => {
      const next = { ...get(), fill };
      set({ fill, ...regenerateIfShown(next) });
    },

    setLineHead: (lineHead) => {
      const next = { ...get(), lineHead };
      set({ lineHead, ...regenerateIfShown(next) });
    },

    generate: () => {
      const r = run(get());
      if (!r.ok) return r.reason === 'no-text' ? 'noText' : 'noPath';
      set({ result: r.text, labels: r.labels, labelSize: r.labelSize });
      return null;
    },

    fit: () => {
      const s = get();
      const fit = fitPathToText({
        path: s.path,
        count: splitChars(s.text).length,
        cols: s.cols,
        spacing: s.spacing,
      });
      if (!fit.ok) return fit.reason === 'few-chars' ? 'fewChars' : 'fitNoPath';
      const next: TextPathState = { ...s, path: fit.path, labels: [] };
      set({ path: fit.path, labels: [], ...regenerateIfShown(next) });
      return s.result ? null : 'fitted';
    },

    reverse: () => {
      const s = get();
      if (!isUsablePath(s.path)) return 'reverseNoPath';
      const next: TextPathState = { ...s, path: reversePath(s.path), labels: [] };
      set({ path: next.path, labels: [], ...regenerateIfShown(next) });
      return null;
    },

    clear: () => set({ shape: 'free', path: [], result: '', labels: [] }),

    reset: () => set(initialState()),
  };
});
