/**
 * 狀態：四個模式＋WebP 設定自動存在瀏覽器（localStorage `trpg-toolkit:typewriter`，可復原／重做）；
 * 目前選的模式另外存（不列入復原）。主控裁定：自動儲存＋專案檔取代舊版的「存到瀏覽器／從瀏覽器載入」。
 */
import { createPreviewStore, createToolStore } from '@/core/storage';
import { DEFAULT_DATA, MODES, type Mode, normalizeData, type TwData } from './settings';

export const TOOL_ID = 'typewriter';

export const useTw = createToolStore<TwData>(TOOL_ID, DEFAULT_DATA, {
  version: 1,
  migrate: (persisted) => normalizeData(persisted) ?? DEFAULT_DATA,
});

export const useView = createPreviewStore(TOOL_ID, {
  mode: 'typing' as Mode,
  /** 匯出區選的格式 */
  format: 'apng',
});

export const currentMode = (): Mode => {
  const m = useView.getState().data.mode;
  return MODES.includes(m) ? m : 'typing';
};

export function setMode(mode: Mode): void {
  useView.getState().patch({ mode });
}

/** 改某個模式的一個設定 */
export function setField<M extends Mode, K extends keyof TwData[M]>(
  mode: M,
  key: K,
  value: TwData[M][K],
): void {
  useTw.getState().update((d) => {
    (d[mode] as unknown as TwData[M])[key] = value;
  });
}

/** 一次改某個模式的多個設定 */
export function patchMode<M extends Mode>(mode: M, patch: Partial<TwData[M]>): void {
  useTw.getState().update((d) => {
    Object.assign(d[mode] as unknown as TwData[M], patch);
  });
}

export function setWebp(patch: Partial<TwData['webp']>): void {
  useTw.getState().update((d) => {
    Object.assign(d.webp, patch);
  });
}
