/**
 * 狀態：
 * - useProfile：自介卡、地雷表、外觀（自動存檔 `trpg-toolkit:pl-profile`、復原／重做、專案檔）。讀回時整理。
 * - useView：不列入復原的畫面狀態與 KP 對照表（`trpg-toolkit:pl-profile:preview`）：分頁、輸出的格式與文字選項、
 *   KP 對照表的成員與篩選（區塊的收合由 Section 的 persistKey 記住）。
 * - assets：頭像的圖片（IndexedDB；狀態只存 id）。
 */
import type { StateStorage } from 'zustand/middleware';
import { createAssetStore, referencedAssetIds } from '@/core/assets';
import { createPreviewStore, createToolStore, historyGesture } from '@/core/storage';
import { type CompareFilter, type Member, normalizeMembers } from './compare';
import {
  DATA_VERSION,
  initialData,
  normalizeData,
  type ProfileData,
  projectAssetIds,
  TOOL_ID,
} from './model';
import type { TextStyle } from './text';

function local(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** 讀存檔時先整理（壞掉的存檔當作沒有存檔） */
function profileStorage(): StateStorage {
  return {
    getItem: (name) => {
      let raw: string | null = null;
      try {
        raw = local()?.getItem(name) ?? null;
      } catch {
        return null;
      }
      if (raw === null) return null;
      try {
        const parsed = JSON.parse(raw) as { state?: { data?: unknown }; version?: number };
        if (!parsed?.state || typeof parsed.state.data !== 'object') return null;
        const data = normalizeData(parsed.state.data);
        return JSON.stringify({ ...parsed, state: { ...parsed.state, data } });
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      const ls = local();
      if (!ls) throw new Error('localStorage 無法使用');
      ls.setItem(name, value);
    },
    removeItem: (name) => {
      try {
        local()?.removeItem(name);
      } catch {
        /* 刪不掉就算了 */
      }
    },
  };
}

/* 每個動作各一步（點程度、眼睛、標籤…）；文字欄與調色盤用 gesture 合成一步 */
export const useProfile = createToolStore<ProfileData>(TOOL_ID, initialData(), {
  version: DATA_VERSION,
  storage: profileStorage(),
  coalesceMs: 0,
});

export const profileNow = (): ProfileData => useProfile.getState().data;

/** 文字欄、滑桿：離開（放開）才記一步 */
export const gesture = historyGesture(useProfile);

export const assets = createAssetStore(TOOL_ID);

/** 整理圖片庫時保留的圖：狀態與復原紀錄裡用到的 */
export const referencedImages = (): Set<string> => referencedAssetIds(useProfile, projectAssetIds);

export type TabId = 'profile' | 'jirai' | 'look' | 'compare';
export type OutputView = 'image' | 'text';

export interface ViewState {
  tab: TabId;
  output: OutputView;
  textStyle: TextStyle;
  textProfile: boolean;
  textJirai: boolean;
  textIssuesOnly: boolean;
  compareFilter: CompareFilter;
  members: Member[];
}

export const useView = createPreviewStore<ViewState>(TOOL_ID, {
  tab: 'profile',
  output: 'image',
  textStyle: 'plain',
  textProfile: true,
  textJirai: true,
  textIssuesOnly: false,
  compareFilter: 'all',
  members: [],
});

/* 存在瀏覽器的成員清單是任何人都能改的輸入：開頁時整理一次 */
{
  const v = useView.getState().data;
  const members = normalizeMembers(v.members);
  const fixTab = ['profile', 'jirai', 'look', 'compare'].includes(v.tab) ? v.tab : 'profile';
  if (JSON.stringify(members) !== JSON.stringify(v.members) || fixTab !== v.tab)
    useView.getState().patch({ members, tab: fixTab });
}

export const viewNow = (): ViewState => useView.getState().data;
