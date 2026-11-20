/**
 * CCFOLIA 房間畫面（`/rooms/{房間ID}`）的介面部分與選擇器（2026-11-20，chat-window 的「隱藏介面」新增；
 * chat-window 規格 3.9.1）。
 *
 * 房間畫面裡訊息框（dom.ts 的 MESSAGE_BOX）以外的結構，本站沒有直接觀察（不能登入 CCFOLIA）。這裡的選擇器是
 * 兩個原作記錄的事實：yudukiak/ccfoliaCSS（MIT，`CSS/asset/*.css`，CCFOLIA **v1.36.2**，2026-07-16）與
 * ngo1009db-hub/ccfolia-obs-css（未授權，只取選擇器這個事實；照使用者提供的 **1.36.4** 的 HTML，2026-11-15）。
 * 兩者不同時用 1.36.4 的。CCFOLIA 改版跑版時先改這個檔案與 mock/roomUi.ts。
 *
 * 純資料，不依賴 CSS 模組（隱藏的寫法用一般的「屬性 → 值」）。
 */
import { MESSAGE_BOX } from './dom';

/**
 * 選擇器靠的是什麼：
 * - mui：MUI 元件的 class（較穩定）
 * - structure：元素與屬性的位置（例：`[data-field-object] figure`）
 * - position：第幾個子元素、沒有 class 的包裝這類「位置」
 * - label：日文的 aria-label（CCFOLIA 的介面語言不是日文時可能無效）
 * - style：行內 style 的寫法
 * - class：styled-components 自動產生的 `sc-` class（CCFOLIA 改版就可能換掉）
 * mui、structure 以外的都算「改版容易失效」（isFragileRoomUiPart）。
 */
export type RoomUiBasis = 'mui' | 'structure' | 'position' | 'label' | 'style' | 'class';

/** 分組：盤面上的東西、演出、介面、通知與廣告 */
export type RoomUiGroup = 'board' | 'stage' | 'ui' | 'notice';

export const ROOM_UI_GROUPS: readonly RoomUiGroup[] = ['board', 'stage', 'ui', 'notice'];

export const ROOM_UI_PART_IDS = [
  'background',
  'foreground',
  'characters',
  'markerPanel',
  'screenPanel',
  'cardDeck',
  'diceSymbol',
  'board',
  'boardOutline',
  'messageBox',
  'cutIn',
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
] as const;

export type RoomUiPartId = (typeof ROOM_UI_PART_IDS)[number];

export interface RoomUiPart {
  id: RoomUiPartId;
  group: RoomUiGroup;
  /** 要隱藏的元素 */
  selectors: readonly string[];
  /** 隱藏的寫法（預設 display: none） */
  decls?: Readonly<Record<string, string>>;
  basis: RoomUiBasis;
  /** 選擇器的依據：ccfoliaCSS（1.36.2）、ngo（1.36.4）、both（兩者相同）、toolkit（本站 dom.ts） */
  source: 'ccfoliaCSS' | 'ngo' | 'both' | 'toolkit';
}

/** 盤面的容器（行內樣式以「right:」開頭：右邊讓出聊天欄的寬度） */
const BOARD_CONTAINER = 'div[tabindex="0"][style^="right:"]';
/** 盤面上的移動、縮放容器 */
const BOARD_SCALE = 'div[style^="transform: translate"] > div[style^="transform: scale"]';

/** 房間畫面的其他事實 */
export const ROOM_PAGE = Object.freeze({
  observed: '2026-11-20（ccfoliaCSS v1.36.2、ngo1009db-hub 1.36.4 的記錄）',
  /** 盤面的容器；聊天欄不在原位時把寬度改成 100%，讓出的位置收回 */
  boardContainer: BOARD_CONTAINER,
  /** 盤面上的移動、縮放兩層容器（前景、棋子等盤面物件都在裡面） */
  boardScale: BOARD_SCALE,
  /** 右邊的聊天欄（和聊天另開視窗是同一個元件，dom.ts 的 CHAT） */
  chatDrawer: '.MuiDrawer-root.MuiDrawer-docked',
});

export const ROOM_UI_PARTS: readonly RoomUiPart[] = Object.freeze([
  /* ---- 盤面上的東西 ---- */
  { id: 'background', group: 'board', selectors: ['.sc-bKoKAZ'], basis: 'class', source: 'ngo' },
  {
    id: 'foreground',
    group: 'board',
    selectors: [`${BOARD_SCALE} > div:not([data-field-object]) > img`],
    basis: 'style',
    source: 'ngo',
  },
  {
    id: 'characters',
    group: 'board',
    selectors: ['[data-field-object] figure'],
    basis: 'structure',
    source: 'ngo',
  },
  { id: 'markerPanel', group: 'board', selectors: ['.sc-ezjsFQ'], basis: 'class', source: 'both' },
  { id: 'screenPanel', group: 'board', selectors: ['.sc-iuhWPH'], basis: 'class', source: 'both' },
  {
    id: 'cardDeck',
    group: 'board',
    selectors: ['.sc-iiBnab'],
    basis: 'class',
    source: 'ccfoliaCSS',
  },
  {
    id: 'diceSymbol',
    group: 'board',
    selectors: ['div[aria-label*="のダイス ["] > [src*="_dice/"]'],
    basis: 'label',
    source: 'ccfoliaCSS',
  },
  {
    id: 'board',
    group: 'board',
    selectors: [`${BOARD_CONTAINER} > div:nth-child(1)`],
    basis: 'style',
    source: 'ccfoliaCSS',
  },
  {
    id: 'boardOutline',
    group: 'board',
    selectors: [`${BOARD_SCALE} > div[style]`],
    decls: { outline: 'unset' },
    basis: 'style',
    source: 'ccfoliaCSS',
  },
  /* ---- 演出 ---- */
  /* 訊息框：MUI 的 class 加上日文的 aria-label（メッセージ） */
  {
    id: 'messageBox',
    group: 'stage',
    selectors: [MESSAGE_BOX.root],
    basis: 'label',
    source: 'toolkit',
  },
  {
    id: 'cutIn',
    group: 'stage',
    selectors: ['div[open]'],
    basis: 'structure',
    source: 'ccfoliaCSS',
  },
  {
    id: 'rollingDice',
    group: 'stage',
    selectors: ['div[style="position: relative; width: 100%; height: 100%; overflow: hidden;"]'],
    basis: 'style',
    source: 'ccfoliaCSS',
  },
  /* ---- 介面 ---- */
  {
    id: 'header',
    group: 'ui',
    selectors: ['header.MuiAppBar-positionFixed'],
    basis: 'mui',
    source: 'ccfoliaCSS',
  },
  {
    id: 'chat',
    group: 'ui',
    selectors: ['.MuiDrawer-root.MuiDrawer-docked'],
    basis: 'mui',
    source: 'ccfoliaCSS',
  },
  {
    id: 'status',
    group: 'ui',
    selectors: [
      'div[class^="sc-"] > [class^="MuiBadge-root sc-"]',
      'div[class^="sc-"] > [class^="MuiBadge-root sc-"] + div',
    ],
    basis: 'class',
    source: 'ccfoliaCSS',
  },
  {
    id: 'timer',
    group: 'ui',
    selectors: ['.MuiPaper-elevation5'],
    basis: 'mui',
    source: 'ccfoliaCSS',
  },
  /* BGM：盤面容器（有行內樣式）的第 3 個子元素 */
  {
    id: 'bgm',
    group: 'ui',
    selectors: ['#root > div > div[tabindex="0"][style] > div:nth-child(3)'],
    basis: 'position',
    source: 'ccfoliaCSS',
  },
  {
    id: 'zoom',
    group: 'ui',
    selectors: [
      '[aria-label="盤面を拡大する"]',
      '[aria-label="盤面を拡大する"] + span',
      '[aria-label="盤面を縮小する"]',
    ],
    basis: 'label',
    source: 'ccfoliaCSS',
  },
  {
    id: 'ctrlDrag',
    group: 'ui',
    selectors: ['[aria-label="Ctrl + ドラッグ"]', '[aria-label="Command + ドラッグ"]'],
    basis: 'label',
    source: 'ccfoliaCSS',
  },
  /* 編輯按鈕：沒有 class 的包裝裡的 MUI 浮動按鈕 */
  {
    id: 'edit',
    group: 'ui',
    selectors: ['div:not([class]) > button.MuiFab-root'],
    basis: 'position',
    source: 'ccfoliaCSS',
  },
  /* ---- 通知與廣告 ---- */
  /* 廣告影片：對話框一律隱藏（進房間時的密碼、確認對話框也會被隱藏） */
  {
    id: 'ads',
    group: 'notice',
    selectors: ['.MuiDialog-root'],
    basis: 'mui',
    source: 'ccfoliaCSS',
  },
  {
    id: 'monitoring',
    group: 'notice',
    selectors: ['.MuiSnackbar-root'],
    basis: 'mui',
    source: 'ccfoliaCSS',
  },
] satisfies RoomUiPart[]);

export const roomUiPart = (id: RoomUiPartId): RoomUiPart =>
  ROOM_UI_PARTS.find((p) => p.id === id) as RoomUiPart;

export const isRoomUiPartId = (v: unknown): v is RoomUiPartId =>
  typeof v === 'string' && (ROOM_UI_PART_IDS as readonly string[]).includes(v);

/** 改版容易失效（靠位置、日文的按鈕名稱、行內樣式、自動產生的 class） */
export const isFragileRoomUiPart = (id: RoomUiPartId): boolean => {
  const b = roomUiPart(id).basis;
  return b !== 'mui' && b !== 'structure';
};

/** 靠日文的 aria-label（CCFOLIA 的介面語言不是日文時可能無效） */
export const usesJapaneseLabel = (id: RoomUiPartId): boolean => roomUiPart(id).basis === 'label';
