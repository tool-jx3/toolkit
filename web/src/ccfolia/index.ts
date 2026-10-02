/**
 * ccfolia/：CCFOLIA、Discord Streamkit 與 OBS 相關的外部事實（資料格式、DOM 選擇器、網址、擲骰分類）。
 *
 * CCFOLIA 或 Streamkit 改版時集中修改這裡（以及 mock/ 的模擬頁）。外部資料格式屬於事實規格
 * （PROCESS.md 第 2 節），可以完整描述。
 *
 * - urls：房間／聊天頁／角色狀態頁網址的解析與組合、Streamkit 網址、Discord ID、圖片網址分類
 * - dom：三種 CCFOLIA 頁面與 Streamkit 的選擇器與結構常數（附觀察日期）
 * - character：角色狀態頁的填充寬度字串、紅字屬性、「剩餘比例低於門檻」的屬性選擇器
 * - dice：擲骰結果的分類與配色 class、訊息框只放最後一段的規則
 * - targets：匯出用途（CCFOLIA 切入、Discord 貼圖、Discord 附件）的容量上限、格式、尺寸與檢查
 * - mock/：依上述事實自己寫的模擬頁（預覽與測試用）
 */
import { CHARACTER_PAGE, CHAT, MESSAGE_BOX, STREAMKIT } from './dom';

export * from './character';
export * from './dice';
export * from './dom';
export * from './targets';
export * from './urls';

/** 角色的狀態列（HP、MP…） */
export interface CcfoliaStatus {
  label: string;
  value: number;
  max: number;
}

/** 角色的能力值（STR、DEX…） */
export interface CcfoliaParam {
  label: string;
  value: string;
}

/** 貼到 CCFOLIA 的角色資料（剪貼簿 JSON 的 data 部分）。待 G5 規格確認。 */
export interface CcfoliaCharacterData {
  name: string;
  initiative?: number;
  externalUrl?: string;
  iconUrl?: string | null;
  memo?: string;
  commands?: string;
  status?: CcfoliaStatus[];
  params?: CcfoliaParam[];
  color?: string;
  secret?: boolean;
  invisible?: boolean;
  hideStatus?: boolean;
  [key: string]: unknown;
}

/** 剪貼簿格式：{ kind: 'character', data: {...} } */
export interface CcfoliaCharacterClipboard {
  kind: 'character';
  data: CcfoliaCharacterData;
}

/** 建立剪貼簿 JSON 字串（空殼：G5 實作時補上欄位預設值與驗證） */
export function toCharacterClipboard(data: CcfoliaCharacterData): string {
  const payload: CcfoliaCharacterClipboard = { kind: 'character', data };
  return JSON.stringify(payload);
}

/** 房間 ZIP 內的檔案（空殼：G5 實作 room-zip 時定義完整結構） */
export interface CcfoliaRoomZipEntry {
  path: string;
  data: Uint8Array | string;
}

/**
 * 常用選擇器的扁平清單（P0 的空殼，G4 填入；完整的結構見 dom.ts 的 CHARACTER_PAGE、MESSAGE_BOX、CHAT、STREAMKIT）
 */
export const OBS_SELECTORS: Readonly<Record<string, string>> = Object.freeze({
  characterBars: CHARACTER_PAGE.bars,
  characterBar: CHARACTER_PAGE.bar,
  characterBadge: CHARACTER_PAGE.badge,
  messageBox: MESSAGE_BOX.root,
  messageBoxBody: MESSAGE_BOX.box,
  chatLog: CHAT.log,
  chatItem: CHAT.item,
  chatHeader: CHAT.header,
  streamkitAvatar: STREAMKIT.avatar,
  streamkitSpeaking: STREAMKIT.speaking,
});
