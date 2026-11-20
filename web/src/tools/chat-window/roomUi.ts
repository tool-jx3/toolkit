/**
 * 隱藏 CCFOLIA 房間畫面的介面（OBS 的瀏覽器來源開房間網址 `/rooms/{房間ID}` 時用）：
 * 勾選要隱藏的部分 → 一段自訂 CSS。可以單獨用，也可以接在聊天視窗的 CSS 後面
 * （同一個瀏覽器來源開房間網址，房間右邊的聊天欄就照聊天視窗的設定顯示）。
 *
 * 參考 yudukiak/ccfoliaCSS（MIT，`CSS/asset/*.css`，對應 CCFOLIA v1.36.2）的分類與選擇器改寫。
 * 要隱藏的部分與選擇器（外部事實）在 `@/ccfolia/roomPage.ts`（2026-11-20 修正第 1 輪從這裡搬過去，規格 D4）；
 * 這裡是工具自己的部分：一鍵勾選、勾選的整理、產生 CSS。純邏輯，不依賴 React。
 */
import {
  exampleRoomUrl,
  isFragileRoomUiPart,
  isRoomUiPartId,
  ROOM_PAGE,
  ROOM_UI_GROUPS,
  ROOM_UI_PART_IDS,
  ROOM_UI_PARTS,
  type RoomUiGroup,
  type RoomUiPart,
  type RoomUiPartId,
  roomUiPart,
  roomUrlFrom,
  usesJapaneseLabel,
} from '@/ccfolia';
import { createCssSheet } from '@/core/css';

/* 工具裡沿用的名稱（@/ccfolia 的 ROOM_UI_*） */
export type RoomPartId = RoomUiPartId;
export type RoomPart = RoomUiPart;
export type RoomPartGroup = RoomUiGroup;
export const ROOM_PART_IDS = ROOM_UI_PART_IDS;
export const ROOM_PARTS = ROOM_UI_PARTS;
export const roomPart = roomUiPart;
export const isRoomPartId = isRoomUiPartId;
/** 盤面的容器（行內樣式以「right:」開頭：右邊讓出聊天欄的寬度） */
export const ROOM_BOARD_CONTAINER = ROOM_PAGE.boardContainer;

export const ROOM_PART_GROUPS: readonly RoomPartGroup[] = ROOM_UI_GROUPS;

/** 一鍵勾選 */
export const ROOM_PRESETS = {
  /** 只留盤面：介面、通知、訊息框、滾動的骰子、盤面的外框線都隱藏（ccfoliaCSS 的「盤面」那組） */
  board: [
    'boardOutline',
    'messageBox',
    'rollingDice',
    'header',
    'chat',
    'status',
    'timer',
    'bgm',
    'zoom',
    'ctrlDrag',
    'edit',
    'ads',
    'monitoring',
  ],
  /** 只隱藏介面與通知（盤面與演出照常） */
  ui: ['header', 'chat', 'status', 'timer', 'bgm', 'zoom', 'ctrlDrag', 'edit', 'ads', 'monitoring'],
  all: [...ROOM_PART_IDS],
  none: [],
} as const satisfies Record<string, readonly RoomPartId[]>;

export type RoomPreset = keyof typeof ROOM_PRESETS;

/** 預設：只留盤面 */
export const DEFAULT_ROOM_HIDE: readonly RoomPartId[] = ROOM_PRESETS.board;

/** 整理勾選：只留認得的、去掉重複、照清單的順序；不是陣列時用 fallback */
export function normalizeRoomHide(
  raw: unknown,
  fallback: readonly RoomPartId[] = DEFAULT_ROOM_HIDE,
): RoomPartId[] {
  if (!Array.isArray(raw)) return [...fallback];
  const set = new Set(raw.filter(isRoomPartId));
  return ROOM_PART_IDS.filter((id) => set.has(id));
}

/** 實際要隱藏的部分：和聊天視窗的 CSS 合在一起時，聊天欄不隱藏（要拿來當聊天視窗） */
export function roomHiddenParts(hide: readonly RoomPartId[], merge: boolean): RoomPartId[] {
  const set = new Set(hide);
  return ROOM_PART_IDS.filter((id) => set.has(id) && !(merge && id === 'chat'));
}

/** 改版容易失效的部分（選擇器靠位置、日文的按鈕名稱、行內樣式或自動產生的 class） */
export const fragileParts = (ids: readonly RoomPartId[]): RoomPartId[] =>
  ids.filter(isFragileRoomUiPart);

export interface RoomCssOptions {
  room: string;
  hide: readonly RoomPartId[];
  /** 接在後面的聊天視窗 CSS（不含開頭說明；以 @import 開頭也可以） */
  chatCss?: string | null;
  /** 部分的名稱（寫進開頭說明） */
  partName: (id: RoomPartId) => string;
  /** 合在一起時寫進說明的來源大小 */
  size?: { width: number; height: number } | null;
}

/** 隱藏介面的 CSS（有 chatCss 時：開頭說明 → 聊天視窗的 CSS → 隱藏的規則） */
export function buildRoomCss(o: RoomCssOptions): string {
  const merge = !!o.chatCss;
  const parts = roomHiddenParts(o.hide, merge);
  const css = createCssSheet();
  css.header({
    title: merge
      ? 'CCFOLIA 房間畫面：隱藏介面＋聊天視窗（OBS 瀏覽器來源的自訂 CSS）'
      : 'CCFOLIA 房間畫面：隱藏介面（OBS 瀏覽器來源的自訂 CSS）',
    toolName: '聊天視窗產生器',
    url: roomUrlFrom(o.room),
    exampleUrl: exampleRoomUrl('<房間ID>'),
    urlNote: '房間網址，不是 /chat 結尾的聊天頁',
    size: merge && o.size ? o.size : undefined,
    notes: [
      parts.length ? `隱藏：${parts.map(o.partName).join('、')}` : '沒有勾選要隱藏的部分。',
      merge ? '後面接著聊天視窗的 CSS：房間右邊的聊天欄會照聊天視窗的設定顯示。' : null,
      '選擇器依 CCFOLIA v1.36 時的頁面結構；CCFOLIA 改版後可能失效（自動產生的 class 與日文的按鈕名稱最容易變），失效時請回到工具重新產生。',
      parts.some(usesJapaneseLabel)
        ? 'CCFOLIA 的介面語言不是日文時，靠按鈕名稱的部分（訊息框、骰子符號、縮放按鈕、「Ctrl＋拖曳」的提示）可能無效。'
        : null,
      parts.includes('ads')
        ? '廣告影片的規則會隱藏所有對話框：在 OBS 的「互動」裡進房間（輸入密碼、確認）時先拿掉這段，進去後再貼回來。'
        : null,
    ],
  });
  /* 頁面透明、沒有捲軸（ccfoliaCSS 的 -obs.css、-scrollbar.css） */
  css.rule('html, body', { background: 'transparent', margin: 0, overflow: 'hidden' });
  css.rule('::-webkit-scrollbar', { display: 'none' });
  /* 聊天欄不在原位（隱藏或改成聊天視窗）時，盤面用整個寬度 */
  if (parts.includes('chat') || merge) css.rule(ROOM_BOARD_CONTAINER, { width: '100%' });
  for (const id of parts) {
    const p = roomUiPart(id);
    css.rule(p.selectors, p.decls ?? { display: 'none' });
  }
  const own = css.toString();
  if (!merge) return own;
  /* 開頭說明之後接聊天視窗的 CSS（@import 要在其他規則之前），再接隱藏的規則 */
  const end = own.indexOf('*/') + 2;
  const head = own.slice(0, end);
  const rules = own.slice(end).trim();
  return `${head}\n\n${(o.chatCss ?? '').trim()}\n\n${rules}\n`;
}
