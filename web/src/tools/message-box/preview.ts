/**
 * 預覽的模擬房間畫面（@/ccfolia/mock 的 RoomScene）與範例訊息的送出、關閉、重新開始；
 * 自訂範例立繪（存在這個瀏覽器的 IndexedDB，不進 CSS 與專案檔）。
 */
import { create } from 'zustand';
import { createRoomScene, mockPortrait, type RoomPhase } from '@/ccfolia/mock';
import { createImageStore } from '@/core/image';
import {
  FIRST_SAMPLE,
  type Sample,
  type SampleKind,
  type SampleSpeaker,
  sampleAt,
  speakerByName,
  toRoomMessage,
} from './samples';
import { TOOL_ID } from './settings';
import { type PortraitShape, usePreview } from './store';

/** 預覽裡的房間畫面（整個頁面只有一個） */
export const roomScene = createRoomScene();

/* ---------- 範例立繪 ---------- */

interface PortraitState {
  /** 自訂範例立繪（data URI）；null＝用範例立繪 */
  custom: string | null;
  /** 自訂立繪是否存進了這個瀏覽器（存不下時只在本次開頁有效） */
  persisted: boolean;
}

export const usePortrait = create<PortraitState>(() => ({ custom: null, persisted: false }));

const images = createImageStore(TOOL_ID, 'portrait');
const CUSTOM_KEY = 'custom';

/** 立繪網址：自訂立繪優先，否則依形狀的範例立繪 */
export function portraitUrl(
  sp: SampleSpeaker,
  shape: PortraitShape,
  custom: string | null,
): string {
  return custom ?? mockPortrait(shape, sp.seed ?? 0);
}

const currentPortrait = (sp: SampleSpeaker): string =>
  portraitUrl(sp, usePreview.getState().data.shape, usePortrait.getState().custom);

/** 換掉畫面上（與排隊中）訊息的立繪，不重新打字 */
export function refreshPortraits(): void {
  roomScene.updateMessages((m) => {
    if (!m.portrait) return m;
    const sp = speakerByName(m.name);
    if (!sp || sp.seed === null) return m;
    const url = currentPortrait(sp);
    return url === m.portrait ? m : { ...m, portrait: url };
  });
}

/** 開頁時讀回自訂立繪 */
export async function loadCustomPortrait(): Promise<void> {
  const v = await images.load(CUSTOM_KEY);
  if (typeof v === 'string' && v.startsWith('data:image/')) {
    usePortrait.setState({ custom: v, persisted: true });
    refreshPortraits();
  }
}

/** 設定自訂立繪；回傳是否存進了這個瀏覽器 */
export async function setCustomPortrait(dataUri: string): Promise<boolean> {
  usePortrait.setState({ custom: dataUri, persisted: false });
  refreshPortraits();
  const ok = await images.save(CUSTOM_KEY, dataUri);
  if (usePortrait.getState().custom === dataUri) usePortrait.setState({ persisted: ok });
  return ok;
}

export async function clearCustomPortrait(): Promise<void> {
  usePortrait.setState({ custom: null, persisted: false });
  refreshPortraits();
  await images.remove(CUSTOM_KEY);
}

/* ---------- 送出訊息 ---------- */

/** 每一類範例已經送出幾則（輪流用） */
const counters: Record<SampleKind, number> = {
  chat: 0,
  success: 0,
  failure: 0,
  other: 0,
  secret: 0,
  long: 0,
};

/** 送出前訊息框是不是正在打字或等下一則（新的訊息要排隊） */
export const isBusy = (phase: RoomPhase = roomScene.phase): boolean =>
  phase === 'typing' || phase === 'waiting';

export function sendSample(sample: Sample): { queued: boolean } {
  const queued = isBusy();
  roomScene.send(toRoomMessage(sample, currentPortrait));
  return { queued };
}

/** 送出某一類的下一則範例 */
export function sendNextSample(kind: SampleKind): { queued: boolean; sample: Sample } {
  const sample = sampleAt(kind, counters[kind]);
  counters[kind]++;
  return { ...sendSample(sample), sample };
}

/** 重新開始：清掉排隊中的訊息、移除訊息框，再送出第一則範例 */
export function restartPreview(): void {
  roomScene.reset();
  for (const k of Object.keys(counters) as SampleKind[]) counters[k] = 0;
  counters.chat = 1;
  sendSample(FIRST_SAMPLE);
}

/** 開頁的第一則（F64）：還沒有任何訊息時才送 */
export function sendFirstSample(): void {
  if (roomScene.phase !== 'empty') return;
  counters.chat = 1;
  sendSample(FIRST_SAMPLE);
}
