/**
 * 狀態：
 * - useSettings：外觀設定＋角色清單（自動存檔、可復原；滑桿與文字欄放開／離開才記一步，最多 150 步）
 * - usePreview：設定分頁、預覽背景、預覽對象、測試數值（自動存檔，不列入復原）
 * - useSession：只在這次開頁有效的東西（換過的預覽頭像、狀態訊息、量到的來源大小）
 */
import { create } from 'zustand';
import {
  createPreviewStore,
  createToolStore,
  historyGesture,
  resetToolStore,
} from '@/core/storage';
import {
  DEFAULT_PREVIEW,
  DEFAULT_SETTINGS,
  normalizePreview,
  normalizeSettings,
  type PreviewData,
  type Settings,
  setPath,
  TOOL_ID,
} from './settings';
import { TEMPLATE_IDS } from './templates';

export const useSettings = createToolStore<Settings>(TOOL_ID, DEFAULT_SETTINGS, {
  version: 1,
  migrate: (persisted) => normalizeSettings(persisted, TEMPLATE_IDS),
  coalesceMs: 0,
  historyLimit: 150,
});

export const usePreview = createPreviewStore<PreviewData>(TOOL_ID, DEFAULT_PREVIEW);

/* 存檔可能缺欄位、來自舊版本或被改壞：開頁時修正一次（沒有變化時不寫回） */
{
  const cur = useSettings.getState().data;
  const fixed = normalizeSettings(cur, TEMPLATE_IDS);
  if (JSON.stringify(fixed) !== JSON.stringify(cur)) useSettings.getState().replace(fixed);
  useSettings.temporal.getState().clear();
  const p = usePreview.getState().data;
  const fp = normalizePreview(p);
  if (JSON.stringify(fp) !== JSON.stringify(p)) usePreview.getState().replace(fp);
}

/** 滑桿、數字欄、文字欄、色彩欄的「放開才記一步」 */
export const gesture = historyGesture(useSettings);

/** 依路徑改一個設定（例：set('avatar.width', 96)） */
export function setSetting(path: string, value: unknown): void {
  useSettings.getState().update((d) => {
    setPath(d as unknown as Record<string, unknown>, path, value);
  });
}

export type StatusTone = 'info' | 'success' | 'warning' | 'danger';

export interface SessionState {
  /** 換過的預覽頭像（object URL；不存檔、不寫進 CSS） */
  avatarUrl: string | null;
  status: { tone: StatusTone; text: string };
  /** 量到的來源大小（預覽對象的；說明區塊顯示用） */
  size: { width: number; height: number } | null;
}

export const useSession = create<SessionState>(() => ({
  avatarUrl: null,
  status: { tone: 'info', text: '' },
  size: null,
}));

export function setStatus(text: string, tone: StatusTone = 'info'): void {
  useSession.setState({ status: { tone, text } });
}

export function setPreviewAvatar(url: string | null): void {
  const prev = useSession.getState().avatarUrl;
  if (prev && prev !== url) URL.revokeObjectURL(prev);
  useSession.setState({ avatarUrl: url });
}

/** 全部重來：設定、角色清單、測試數值、預覽背景都回到初始狀態，清空復原紀錄，預覽頭像也還原 */
export function resetEverything(): void {
  resetToolStore(useSettings);
  const tab = usePreview.getState().data.tab;
  usePreview.getState().reset();
  usePreview.getState().patch({ tab });
  setPreviewAvatar(null);
}
