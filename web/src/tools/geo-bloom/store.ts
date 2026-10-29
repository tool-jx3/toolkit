/**
 * 設定的 store：自動儲存（localStorage `trpg-toolkit:geo-bloom`）＋復原／重做（規格 F51、F52）。
 * 種子也在裡面（「產生」換的種子可以復原）。原作在別的網域、沒有存檔：不搬移。
 */
import { createToolStore } from '@/core/storage';
import { randomSeedText } from './random';
import {
  DEFAULT_SETTINGS,
  type Settings,
  type ShapeToggle,
  sanitizeSettings,
  upgradeSettings,
} from './settings';
import { type BloomTemplate, withTemplate } from './templates';

export const TOOL_ID = 'geo-bloom';
/** 資料版本：2＝原作 2026-10 的設定（三角形、摩斯環、放射線的起點……）；1 的資料讀進來時補舊版的值（3.8） */
export const DATA_VERSION = 2;

/** 預設值＋新的隨機種子（第一次開頁、重設） */
export const freshSettings = (): Settings => ({ ...DEFAULT_SETTINGS, seed: randomSeedText() });

export const useSettings = createToolStore<Settings>(TOOL_ID, freshSettings(), {
  version: DATA_VERSION,
  migrate: (persisted, fromVersion) => upgradeSettings(persisted, fromVersion),
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

/**
 * 一次動作算一步復原：不和前後 0.4 秒內的變更合併（連按兩次「產生」、切開關、套用範本都各算一步）。
 * 拖滑桿、打字這類連續的變更照舊合併。
 */
export function step(fn: () => void): void {
  useSettings.beginGesture();
  try {
    fn();
  } finally {
    useSettings.endGesture();
  }
}

/** 開關、選項、勾選：一次切換一步 */
export function setOption<K extends keyof Settings>(key: K, value: Settings[K]): void {
  step(() => setSetting(key, value));
}

export function setShapeKind(kind: ShapeToggle, on: boolean): void {
  step(() =>
    useSettings.getState().update((d) => {
      d.shapes[kind] = on;
    }),
  );
}

/** 「產生」：沒有固定種子時換一個新的種子（固定時不變，圖也不變） */
export function regenerate(): void {
  if (settingsNow().lockSeed) return;
  step(() => setSetting('seed', randomSeedText()));
}

/** 套用範本（種子與固定種子不變） */
export function applyTemplate(t: BloomTemplate): void {
  step(() => {
    const st = useSettings.getState();
    st.replace(withTemplate(st.data, t));
  });
}

/** 全部重設：預設值＋新的種子（可以復原） */
export function resetSettings(): void {
  step(() => useSettings.getState().replace(freshSettings()));
}
