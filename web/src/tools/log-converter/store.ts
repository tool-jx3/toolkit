/**
 * 兩個 store：
 * - useSettings：自動記在瀏覽器的設定（F93；createToolStore，鍵名 trpg-toolkit:log-converter）；
 * - useSession：這次開頁的工作狀態（載入的日誌、這份日誌的選擇、頭像、插圖、轉換結果、預覽區段），不記住。
 */
import { create } from 'zustand';
import { createToolStore } from '@/core/storage';
import type { NoticeTone } from '@/ui';
import type { LogEntry } from './classify';
import type { LogSource } from './load';
import type { IllustrationItem, LogChoices } from './pipeline';
import type { ConvertResult } from './render';
import { DEFAULT_SETTINGS, type LcSettings, normalizeSettings, TOOL_ID } from './settings';

export const useSettings = createToolStore<LcSettings>(TOOL_ID, DEFAULT_SETTINGS, {
  version: 1,
  migrate: (raw) => normalizeSettings(raw),
  historyLimit: 1,
});

export function patchSettings(patch: Partial<LcSettings>): void {
  useSettings.getState().patch(patch);
}

/** 頭像的來源（F23～F25） */
export type ProfileSource =
  | { kind: 'file'; data: string; name: string }
  | { kind: 'url'; url: string; data: string }
  | { kind: 'external'; url: string };

export interface ProfileState {
  /** 卡片上選的是「選檔」還是「網址」 */
  mode: 'file' | 'url';
  /** 網址欄的文字 */
  url: string;
  source: ProfileSource | null;
  /** 處理後的圖（data URL，或直接引用的網址） */
  image: string | null;
  busy: boolean;
}

export interface StatusLine {
  text: string;
  tone: NoticeTone;
}

export interface Session {
  phase: 'empty' | 'analyzing' | 'loaded' | 'failed';
  source: LogSource | null;
  /** 檔案提示列（警告色，F03、F05、F06、F08、F09） */
  fileNotice: string | null;
  choices: LogChoices;
  profiles: Record<string, ProfileState>;
  /** 新格式日誌裡的頭像：原圖 → 依目前品質處理後的圖 */
  logAvatars: Record<string, string>;
  illustrations: IllustrationItem[];
  /** 圖片重新處理的進度（F29） */
  imageStatus: string | null;
  /** 結果區的狀態列（F69～F71） */
  status: StatusLine | null;
  result: ConvertResult | null;
  /** 轉換當下有沒有開啟部落格貼文版（F65、F78） */
  resultBlog: boolean;
  /** 轉換當下的所有「則」（預覽區段用） */
  entries: LogEntry[];
  previewStart: number;
  /** 0＝全部 */
  previewLimit: number;
  previewHtml: string | null;
  /** 預覽重畫的次數（淡入動畫用） */
  previewKey: number;
}

export const EMPTY_CHOICES: LogChoices = {
  title: '',
  subtitle: '',
  summary: '',
  narrator: null,
  chatTab: null,
  nameColors: {},
  hiddenTabs: [],
  tabStyles: {},
  useLogImages: true,
};

export const INITIAL_SESSION: Session = {
  phase: 'empty',
  source: null,
  fileNotice: null,
  choices: EMPTY_CHOICES,
  profiles: {},
  logAvatars: {},
  illustrations: [],
  imageStatus: null,
  status: null,
  result: null,
  resultBlog: false,
  entries: [],
  previewStart: 1,
  previewLimit: 500,
  previewHtml: null,
  previewKey: 0,
};

export const useSession = create<Session>(() => INITIAL_SESSION);

export const setSession = (patch: Partial<Session>): void => useSession.setState(patch);

export function setChoices(patch: Partial<LogChoices>): void {
  useSession.setState((s) => ({ choices: { ...s.choices, ...patch } }));
}

export function setProfile(speaker: string, patch: Partial<ProfileState>): void {
  useSession.setState((s) => ({
    profiles: { ...s.profiles, [speaker]: { ...blankProfile(), ...s.profiles[speaker], ...patch } },
  }));
}

export const blankProfile = (): ProfileState => ({
  mode: 'file',
  url: '',
  source: null,
  image: null,
  busy: false,
});

export function updateIllustration(id: string, patch: Partial<IllustrationItem>): void {
  useSession.setState((s) => ({
    illustrations: s.illustrations.map((it) => (it.id === id ? { ...it, ...patch } : it)),
  }));
}
