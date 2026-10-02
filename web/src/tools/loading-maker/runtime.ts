/**
 * 執行中的狀態（不存檔、不列入復原）：狀態列（F06）、處理中進度（F07）、解碼後的素材、
 * 預覽的跳轉要求（預覽開場／結尾、對齊整圈長度）、是否正在匯出。
 */
import { create } from 'zustand';
import { EMPTY_MEDIA, type SceneMedia } from './render';
import { S } from './strings';

export type StatusTone = 'info' | 'progress' | 'success' | 'warning' | 'danger';

export interface Runtime {
  status: { tone: StatusTone; text: string; id: number };
  /** 處理中的工作數（> 0 時顯示進度列、整頁標示忙碌） */
  busy: number;
  progress: { ratio: number; label: string };
  media: SceneMedia;
  /** 預覽跳到某個時間（n 每次加 1） */
  seek: { t: number; play: boolean; n: number } | null;
  exporting: boolean;
}

export const useRuntime = create<Runtime>(() => ({
  status: { tone: 'info', text: S.status.start, id: 0 },
  busy: 0,
  progress: { ratio: 0, label: '' },
  media: EMPTY_MEDIA,
  seek: null,
  exporting: false,
}));

let idleTimer: ReturnType<typeof setTimeout> | undefined;

/** 成功訊息約 6 秒後自動換回閒置訊息 */
export const SUCCESS_IDLE_MS = 6000;

export function setStatus(tone: StatusTone, text: string): void {
  clearTimeout(idleTimer);
  const id = useRuntime.getState().status.id + 1;
  useRuntime.setState({ status: { tone, text, id } });
  if (tone === 'success')
    idleTimer = setTimeout(() => {
      if (useRuntime.getState().status.id === id)
        useRuntime.setState({ status: { tone: 'info', text: S.status.idle, id: id + 1 } });
    }, SUCCESS_IDLE_MS);
}

/** 錯誤：顯示例外的內容 */
export const showError = (e: unknown): void =>
  setStatus('danger', e instanceof Error ? e.message : String(e));

/** 包住一段處理：期間顯示進度列並標示忙碌 */
export async function withBusy<T>(
  label: string,
  work: (progress: (ratio: number, label: string) => void) => Promise<T>,
): Promise<T> {
  useRuntime.setState((s) => ({ busy: s.busy + 1, progress: { ratio: 0, label } }));
  try {
    return await work((ratio, l) => useRuntime.setState({ progress: { ratio, label: l } }));
  } finally {
    useRuntime.setState((s) => ({ busy: Math.max(0, s.busy - 1) }));
  }
}

export const requestSeek = (t: number, play = true): void =>
  useRuntime.setState((s) => ({ seek: { t, play, n: (s.seek?.n ?? 0) + 1 } }));

export const setMedia = (patch: Partial<SceneMedia>): void =>
  useRuntime.setState((s) => ({ media: { ...s.media, ...patch } }));
