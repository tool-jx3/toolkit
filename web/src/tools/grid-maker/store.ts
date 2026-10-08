/**
 * 設定的 store：自動存檔（localStorage `trpg-toolkit:grid-maker`）＋復原／重做。
 * 舊版不保存任何設定，所以沒有舊存檔要搬。
 */
import type { Draft } from 'immer';
import { createToolStore } from '@/core/storage';
import {
  DEFAULT_SETTINGS,
  type HexSettings,
  type Settings,
  type Shape,
  type SquareSettings,
  sanitizeSettings,
} from './settings';

export const TOOL_ID = 'grid-maker';

export const useSettings = createToolStore<Settings>(TOOL_ID, DEFAULT_SETTINGS, { version: 1 });

/* 自動存檔讀回來的資料整理一次（手改過、舊版本的資料），不列入復原 */
{
  const st = useSettings.getState();
  const clean = sanitizeSettings(st.data);
  if (JSON.stringify(clean) !== JSON.stringify(st.data)) {
    st.replace(clean);
    useSettings.temporal.getState().clear();
  }
}

export const actions = {
  setShape: (shape: Shape) => useSettings.getState().patch({ shape }),
  square: (recipe: (d: Draft<SquareSettings>) => void) =>
    useSettings.getState().update((d) => recipe(d.square)),
  hex: (recipe: (d: Draft<HexSettings>) => void) =>
    useSettings.getState().update((d) => recipe(d.hex)),
};
