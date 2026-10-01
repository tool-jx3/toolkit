/**
 * 文字軌跡產生器的狀態（不儲存：重新整理後回到預設，規格 F31）。
 *
 * 動作回傳要顯示的短暫訊息代號（null＝不顯示），由元件轉成 Toast。
 * 「有結果」＝結果欄不是空的：這時間距倍數（F11）、填空字元（F12）、行首替換（F13）、起訖對調（F16）、
 * 依字數縮放（F15）會接著重新產生。自動重產產生不了時（例如文字已經清空），和按「產生」一樣顯示原因，
 * 結果保留不變（規格 7.1 的 F29 裁定）。間距倍數的縮放不成立（不到 2 個字）時直接結束，
 * 不重新產生、不顯示訊息（7.1 的 F11 裁定）。
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
  setFill(fill: FillKind): MessageKey | null;
  setLineHead(on: boolean): MessageKey | null;
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

interface Regenerated {
  /** 要合併的欄位（產生不了時是空的：結果與疊字都保留） */
  patch: Partial<TextPathState>;
  message: MessageKey | null;
}

/** 已有結果時重新產生；產生不了時回傳和按「產生」相同的訊息，結果不動 */
function regenerateIfShown(next: TextPathState): Regenerated {
  if (!next.result) return { patch: {}, message: null };
  const r = run(next);
  if (!r.ok) return { patch: {}, message: r.reason === 'no-text' ? 'noText' : 'noPath' };
  return { patch: { result: r.text, labels: r.labels, labelSize: r.labelSize }, message: null };
}

export const useTextPath = create<TextPathState & TextPathActions>()((set, get) => {
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
      /* F11：已有結果時立刻依字數縮放（不顯示訊息）並重新產生；
         縮放不成立（不到 2 個字）時直接結束：結果與軌跡都不變（7.1 裁定） */
      const fit = fitPathToText({
        path: s.path,
        count: splitChars(s.text).length,
        cols: s.cols,
        spacing,
      });
      if (!fit.ok) {
        set({ spacing });
        return;
      }
      const next: TextPathState = { ...s, spacing, path: fit.path, labels: [] };
      set({ spacing, path: fit.path, labels: [], ...regenerateIfShown(next).patch });
    },

    setFill: (fill) => {
      const r = regenerateIfShown({ ...get(), fill });
      set({ fill, ...r.patch });
      return r.message;
    },

    setLineHead: (lineHead) => {
      const r = regenerateIfShown({ ...get(), lineHead });
      set({ lineHead, ...r.patch });
      return r.message;
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
      const r = regenerateIfShown(next);
      set({ path: fit.path, labels: [], ...r.patch });
      return s.result ? r.message : 'fitted';
    },

    reverse: () => {
      const s = get();
      if (!isUsablePath(s.path)) return 'reverseNoPath';
      const next: TextPathState = { ...s, path: reversePath(s.path), labels: [] };
      const r = regenerateIfShown(next);
      set({ path: next.path, labels: [], ...r.patch });
      return r.message;
    },

    clear: () => set({ shape: 'free', path: [], result: '', labels: [] }),

    reset: () => set(initialState()),
  };
});
