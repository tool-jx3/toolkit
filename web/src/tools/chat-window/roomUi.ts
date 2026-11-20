/**
 * 隱藏 CCFOLIA 房間畫面的介面（OBS 的瀏覽器來源開房間網址 `/rooms/{房間ID}` 時用）：
 * 勾選要隱藏的部分 → 一段自訂 CSS。可以單獨用，也可以接在聊天視窗的 CSS 後面
 * （同一個瀏覽器來源開房間網址，房間右邊的聊天欄就照聊天視窗的設定顯示）。
 *
 * 參考 yudukiak/ccfoliaCSS（MIT，`CSS/asset/*.css`，對應 CCFOLIA v1.36.2）的分類與選擇器改寫；
 * 和 ngo1009db-hub/ccfolia-obs-css（照 1.36.4 的 HTML 重組，未授權，只參考選擇器的事實）不同的地方
 * 用比較新的那個（規格 3.9.1、D3）。訊息框用本站 `@/ccfolia` 的 MESSAGE_BOX（message-box 規格 3.1）。
 *
 * 這些選擇器是 CCFOLIA 房間畫面的外部事實（PROCESS.md 第 2 節），本來應該放在 `@/ccfolia/dom.ts`；
 * 2026-11-20 同時有別的工作在改 `@/ccfolia/`，先放在工具目錄（D4：之後搬過去）。
 * 純邏輯，不依賴 React。
 */
import { exampleRoomUrl, MESSAGE_BOX, roomUrlFrom } from '@/ccfolia';
import { type CssDecls, createCssSheet } from '@/core/css';

/** 選擇器靠的是什麼（越後面越容易隨 CCFOLIA 改版失效） */
export type RoomPartBasis = 'mui' | 'structure' | 'label' | 'style' | 'class';

export type RoomPartGroup = 'board' | 'stage' | 'ui' | 'notice';

export const ROOM_PART_IDS = [
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

export type RoomPartId = (typeof ROOM_PART_IDS)[number];

export interface RoomPart {
  id: RoomPartId;
  group: RoomPartGroup;
  /** 要隱藏的元素 */
  selectors: readonly string[];
  /** 隱藏的寫法（預設 display: none） */
  decls?: CssDecls;
  basis: RoomPartBasis;
  /** 選擇器的依據（寫進規格與說明） */
  source: 'ccfoliaCSS' | 'ngo' | 'both' | 'toolkit';
}

/** 盤面的容器（行內樣式以「right:」開頭：右邊讓出聊天欄的寬度） */
export const ROOM_BOARD_CONTAINER = 'div[tabindex="0"][style^="right:"]';
/** 盤面上的移動、縮放容器 */
const BOARD_SCALE = 'div[style^="transform: translate"] > div[style^="transform: scale"]';

export const ROOM_PARTS: readonly RoomPart[] = Object.freeze([
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
    selectors: [`${ROOM_BOARD_CONTAINER} > div:nth-child(1)`],
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
  {
    id: 'messageBox',
    group: 'stage',
    selectors: [MESSAGE_BOX.root],
    basis: 'mui',
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
  {
    id: 'bgm',
    group: 'ui',
    selectors: ['#root > div > div[tabindex="0"][style] > div:nth-child(3)'],
    basis: 'structure',
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
  {
    id: 'edit',
    group: 'ui',
    selectors: ['div:not([class]) > button.MuiFab-root'],
    basis: 'mui',
    source: 'ccfoliaCSS',
  },
  /* ---- 通知與廣告 ---- */
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
] satisfies RoomPart[]);

export const ROOM_PART_GROUPS: readonly RoomPartGroup[] = ['board', 'stage', 'ui', 'notice'];

export const roomPart = (id: RoomPartId): RoomPart =>
  ROOM_PARTS.find((p) => p.id === id) as RoomPart;

export const isRoomPartId = (v: unknown): v is RoomPartId =>
  typeof v === 'string' && (ROOM_PART_IDS as readonly string[]).includes(v);

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

/** 選擇器有用到自動產生的 class 或日文按鈕名稱（改版最容易失效）的部分 */
export const fragileParts = (ids: readonly RoomPartId[]): RoomPartId[] =>
  ids.filter((id) => {
    const b = roomPart(id).basis;
    return b === 'class' || b === 'label' || b === 'style';
  });

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
    ],
  });
  /* 頁面透明、沒有捲軸（ccfoliaCSS 的 -obs.css、-scrollbar.css） */
  css.rule('html, body', { background: 'transparent', margin: 0, overflow: 'hidden' });
  css.rule('::-webkit-scrollbar', { display: 'none' });
  /* 聊天欄不在原位（隱藏或改成聊天視窗）時，盤面用整個寬度 */
  if (parts.includes('chat') || merge) css.rule(ROOM_BOARD_CONTAINER, { width: '100%' });
  for (const id of parts) {
    const p = roomPart(id);
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
