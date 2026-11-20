/**
 * 聊天視窗產生器的「隱藏介面」（2026-11-20，規格 1.13、3.9、F114～F120）：部分的清單與選擇器、
 * 一鍵勾選、勾選的整理、隱藏介面的 CSS（單獨用、後面接聊天視窗的 CSS）。
 */
import { describe, expect, it } from 'vitest';
import { MESSAGE_BOX } from '@/ccfolia';
import { buildChatCss } from '@/tools/chat-window/css';
import {
  buildRoomCss,
  DEFAULT_ROOM_HIDE,
  fragileParts,
  normalizeRoomHide,
  ROOM_BOARD_CONTAINER,
  ROOM_PART_GROUPS,
  ROOM_PART_IDS,
  ROOM_PARTS,
  ROOM_PRESETS,
  type RoomPartId,
  roomHiddenParts,
  roomPart,
} from '@/tools/chat-window/roomUi';
import { S } from '@/tools/chat-window/strings';
import { initialSettings } from '@/tools/chat-window/templates';

const name = (id: RoomPartId) => S.room.parts[id];
const room = (
  hide: readonly RoomPartId[],
  extra: Partial<Parameters<typeof buildRoomCss>[0]> = {},
) => buildRoomCss({ room: '', hide, partName: name, ...extra });

describe('部分的清單（ccfoliaCSS 的分類＋盤面的外框線）', () => {
  it('22 個部分、四組；每個都有名字與選擇器', () => {
    expect(ROOM_PARTS).toHaveLength(22);
    expect(ROOM_PARTS.map((p) => p.id)).toEqual([...ROOM_PART_IDS]);
    for (const p of ROOM_PARTS) {
      expect(ROOM_PART_GROUPS).toContain(p.group);
      expect(p.selectors.length, p.id).toBeGreaterThan(0);
      expect(name(p.id), p.id).toBeTruthy();
    }
  });

  it('選擇器：訊息框用 @/ccfolia 的 MESSAGE_BOX；兩個來源不同時用 1.36.4 的；聊天欄是 docked 的抽屜', () => {
    expect(roomPart('messageBox').selectors).toEqual([MESSAGE_BOX.root]);
    expect(roomPart('background').selectors).toEqual(['.sc-bKoKAZ']);
    expect(roomPart('characters').selectors).toEqual(['[data-field-object] figure']);
    expect(roomPart('foreground').selectors[0]).toContain('div:not([data-field-object]) > img');
    expect(roomPart('chat').selectors).toEqual(['.MuiDrawer-root.MuiDrawer-docked']);
    expect(roomPart('zoom').selectors).toContain('[aria-label="盤面を拡大する"] + span');
    expect(roomPart('boardOutline').decls).toEqual({ outline: 'unset' });
  });

  it('容易失效的（15 項）：自動產生的 class、日文的按鈕名稱、行內樣式的寫法、位置', () => {
    expect(fragileParts([...ROOM_PART_IDS])).toEqual([
      'background',
      'foreground',
      'markerPanel',
      'screenPanel',
      'cardDeck',
      'diceSymbol',
      'board',
      'boardOutline',
      'messageBox',
      'rollingDice',
      'status',
      'bgm',
      'zoom',
      'ctrlDrag',
      'edit',
    ]);
    /* 訊息框也靠日文的 aria-label（メッセージ）；BGM、編輯按鈕靠位置（第 3 個子元素、沒有 class 的包裝） */
    expect(roomPart('messageBox').basis).toBe('label');
    expect(roomPart('bgm').basis).toBe('position');
    expect(roomPart('edit').basis).toBe('position');
  });

  it('一鍵勾選與預設（只留盤面＝ccfoliaCSS 的盤面那組）', () => {
    for (const ids of Object.values(ROOM_PRESETS))
      for (const id of ids) expect(ROOM_PART_IDS).toContain(id);
    expect(DEFAULT_ROOM_HIDE).toEqual(ROOM_PRESETS.board);
    expect(ROOM_PRESETS.board).not.toContain('characters');
    expect(ROOM_PRESETS.board).not.toContain('background');
    expect(ROOM_PRESETS.all).toHaveLength(22);
    expect(ROOM_PRESETS.none).toEqual([]);
  });

  it('勾選的整理與「合在一起時聊天欄不隱藏」', () => {
    expect(normalizeRoomHide(['ads', 'header', 'ads', 'x'])).toEqual(['header', 'ads']);
    expect(normalizeRoomHide(null)).toEqual([...DEFAULT_ROOM_HIDE]);
    expect(roomHiddenParts(['chat', 'ads'], false)).toEqual(['chat', 'ads']);
    expect(roomHiddenParts(['chat', 'ads'], true)).toEqual(['ads']);
  });
});

describe('隱藏介面的 CSS', () => {
  it('開頭說明：房間網址（不是 /chat）、隱藏的部分、改版可能失效', () => {
    let t = room(['header', 'chat']);
    expect(t).toContain('https://ccfolia.com/rooms/<房間ID>（房間網址，不是 /chat 結尾的聊天頁）');
    expect(t).toContain('隱藏：上方的標題列、聊天欄');
    expect(t).toContain('CCFOLIA 改版後可能失效');
    t = room([], { room: 'https://ccfolia.com/rooms/AbC_d-12xyz/chat' });
    expect(t).toContain('瀏覽器來源網址：https://ccfolia.com/rooms/AbC_d-12xyz（');
    expect(t).toContain('沒有勾選要隱藏的部分');
  });

  it('頁面透明、沒有捲軸；勾選的部分 display: none（!important）；聊天欄隱藏時盤面用整個寬度', () => {
    const t = room(['chat', 'ads', 'zoom']);
    expect(t).toContain('html,\nbody {\n  background: transparent !important;');
    expect(t).toContain('::-webkit-scrollbar {\n  display: none !important;');
    expect(t).toContain(`${ROOM_BOARD_CONTAINER} {\n  width: 100% !important;`);
    expect(t).toContain('.MuiDrawer-root.MuiDrawer-docked {\n  display: none !important;');
    expect(t).toContain('.MuiDialog-root {\n  display: none !important;');
    expect(t).toContain(
      '[aria-label="盤面を拡大する"],\n[aria-label="盤面を拡大する"] + span,\n[aria-label="盤面を縮小する"] {\n  display: none !important;',
    );
    expect(room(['ads'])).not.toContain(ROOM_BOARD_CONTAINER);
    /* 外框線是拿掉框線，不是隱藏 */
    expect(room(['boardOutline'])).toContain('outline: unset !important;');
    /* 沒勾的不輸出 */
    expect(room(['ads'])).not.toContain('MuiDrawer');
  });

  it('開頭說明：有靠日文按鈕名稱的部分時提醒介面語言；有廣告影片時提醒會隱藏所有對話框', () => {
    expect(room(['messageBox'])).toContain('CCFOLIA 的介面語言不是日文時');
    expect(room(['zoom'])).toContain('CCFOLIA 的介面語言不是日文時');
    expect(room(['header'])).not.toContain('介面語言');
    expect(room(['ads'])).toContain('廣告影片的規則會隱藏所有對話框');
    expect(room(['header'])).not.toContain('對話框');
  });

  it('全部勾選時每個部分的選擇器都在；大括號成對、註解沒有提早結束', () => {
    const t = room(ROOM_PART_IDS);
    for (const p of ROOM_PARTS) for (const sel of p.selectors) expect(t, p.id).toContain(sel);
    expect((t.match(/\{/g) ?? []).length).toBe((t.match(/\}/g) ?? []).length);
    expect((t.match(/\/\*/g) ?? []).length).toBe((t.match(/\*\//g) ?? []).length);
  });

  it('後面接上聊天視窗的 CSS：開頭說明 → 聊天視窗（@import 在最前面）→ 隱藏的規則；聊天欄不隱藏', () => {
    const s = initialSettings();
    const chat = buildChatCss(s, { header: false });
    const t = room(['chat', 'header'], { chatCss: chat, size: { width: 1920, height: 1080 } });
    expect(t).toContain('隱藏介面＋聊天視窗');
    expect(t).toContain('寬 1920 × 高 1080');
    expect(t).toContain('隱藏：上方的標題列');
    expect(t).not.toContain('.MuiDrawer-root.MuiDrawer-docked {');
    expect(t).toContain(`${ROOM_BOARD_CONTAINER} {\n  width: 100% !important;`);
    const head = t.indexOf('*/');
    const imp = t.indexOf('@import');
    expect(imp).toBeGreaterThan(head);
    /* @import 之前只有開頭的說明 */
    expect(t.slice(head + 2, imp).trim()).toBe('');
    expect(t.indexOf(chat.trim())).toBeGreaterThan(head);
    expect(t.indexOf('header.MuiAppBar-positionFixed {')).toBeGreaterThan(t.indexOf(chat.trim()));
    expect((t.match(/\/\*/g) ?? []).length).toBe((t.match(/\*\//g) ?? []).length);
  });
});
