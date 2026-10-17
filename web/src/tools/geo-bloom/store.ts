/**
 * 設定的 store：自動儲存（localStorage `trpg-toolkit:geo-bloom`）＋復原／重做（規格 F51、F52）。
 * 種子也在裡面（「產生」換的種子可以復原）。原作在別的網域、沒有存檔：不搬移。
 */
import { createToolStore } from '@/core/storage';
import { randomSeedText } from './random';
import { DEFAULT_SETTINGS, type Settings, sanitizeSettings } from './settings';

export const TOOL_ID = 'geo-bloom';
export const DATA_VERSION = 1;

/** 預設值＋新的隨機種子（第一次開頁、重設） */
export const freshSettings = (): Settings => ({ ...DEFAULT_SETTINGS, seed: randomSeedText() });

export const useSettings = createToolStore<Settings>(TOOL_ID, freshSettings(), {
  version: DATA_VERSION,
});

/* 自動儲存讀回來的資料整理一次（手改過、舊版本的資料），不列入復原 */
{
  const st = useSettings.getState();
  const clean = sanitizeSettings(st.data);
  if (JSON.stringify(clean) !== JSON.stringify(st.data)) {
    st.replace(clean);
    useSettings.temporal.getState().clear();
  }
}

export const settingsNow = (): Settings => useSettings.getState().data;

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  useSettings.getState().update((d) => {
    (d as Settings)[key] = value;
  });
}

/** 「產生」：沒有固定種子時換一個新的種子（固定時不變，圖也不變） */
export function regenerate(): void {
  const s = settingsNow();
  if (s.lockSeed) return;
  setSetting('seed', randomSeedText());
}
