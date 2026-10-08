/**
 * 設定的 store：自動存檔（localStorage `trpg-toolkit:range-ruler`）＋復原／重做。
 * 自訂格存在各形狀的設定裡（方格與六角格分開）。舊版不保存任何設定，所以沒有舊存檔要搬。
 */
import type { Draft } from 'immer';
import { createToolStore } from '@/core/storage';
import {
  type CommonSettings,
  type CustomCell,
  DEFAULT_SETTINGS,
  RANGE,
  type Scheme,
  type Settings,
  type Shape,
  sanitizeSettings,
  schemeColors,
} from './settings';

export const TOOL_ID = 'range-ruler';

export const useSettings = createToolStore<Settings>(TOOL_ID, DEFAULT_SETTINGS, { version: 1 });

{
  const st = useSettings.getState();
  const clean = sanitizeSettings(st.data);
  if (JSON.stringify(clean) !== JSON.stringify(st.data)) {
    st.replace(clean);
    useSettings.temporal.getState().clear();
  }
}

const drawableRange = (v: number) =>
  Math.min(RANGE.range.max, Math.max(RANGE.range.min, Math.trunc(v)));

/** 目前形狀的設定（Immer 草稿） */
function edit(recipe: (d: Draft<CommonSettings>, shape: Shape) => void) {
  useSettings.getState().update((d) => recipe(d.shape === 'square' ? d.square : d.hex, d.shape));
}

export const actions = {
  setShape: (shape: Shape) => useSettings.getState().patch({ shape }),
  /**
   * 範圍一改，各距離的顏色依目前的配色重建（自訂配色時全部變回灰色，與舊版相同）。
   * 數值沒變（例如離開欄位時確定同一個值）時不重建，改過的顏色不會被洗掉。
   */
  setRange: (range: number) =>
    edit((d) => {
      const before = drawableRange(d.range);
      d.range = range;
      const after = drawableRange(range);
      if (after !== before) d.distColors = schemeColors(after, d.scheme);
    }),
  /** 換配色：各距離的顏色依新配色重建（「自訂」是全部灰色，之後逐一改） */
  setScheme: (scheme: Scheme) =>
    edit((d) => {
      d.scheme = scheme;
      d.distColors = schemeColors(drawableRange(d.range), scheme);
    }),
  setDistColor: (index: number, color: string) =>
    edit((d) => {
      d.distColors[index] = color;
    }),
  /** 目前形狀的其他欄位 */
  edit,
  setCustom: (key: string, cell: CustomCell) =>
    edit((d) => {
      d.customs[key] = cell;
    }),
  removeCustom: (key: string) =>
    edit((d) => {
      delete d.customs[key];
    }),
  clearCustoms: () =>
    edit((d) => {
      d.customs = {};
    }),
};
