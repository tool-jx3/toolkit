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
 * - characterData（G5）：角色資料（剪貼簿 JSON）的型別、讀取（四種錯誤）、型別修正、輸出、檔名
 * - editScreen（G5）：「キャラクター編集」對話框整頁複製文字的解析
 * - room（G5）：房間資料 `__data.json` 的型別、預設值（room、scene、marker、item、character、effect、note）、ID 與權杖
 * - roomZip（G5）：房間 ZIP 的圖片檔名（SHA-256）、寫入與自我檢查、讀取與引用清單、改名重寫
 * - board（G5）：盤面的格（24 px）、中心 ↔ 左上角、取整、前景的建議格數
 * - log（G5）：聊天日誌 HTML（舊格式／新格式）的解析與多檔合併
 * - mock/：依上述事實自己寫的模擬頁（預覽與測試用）
 */
import { CHARACTER_PAGE, CHAT, MESSAGE_BOX, STREAMKIT } from './dom';

export * from './board';
export * from './character';
export * from './characterData';
export * from './dice';
export * from './dom';
export * from './editScreen';
export * from './log';
export * from './room';
export * from './roomZip';
export * from './targets';
export * from './urls';

/** 房間 ZIP 內的檔案（P0 的空殼，向下相容；G5 的讀寫見 roomZip.ts） */
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
