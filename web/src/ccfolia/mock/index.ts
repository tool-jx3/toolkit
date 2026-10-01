/**
 * ccfolia/mock：依 dom.ts 的外部事實自己寫的模擬頁（預覽 iframe 用；也用在測試）。
 *
 * - createCharacterScene：角色狀態頁（各狀態目前值／最大值、先攻、頭像、狀態名稱、通知列）
 * - createRoomScene：房間畫面＋訊息框（排隊、逐字打出、滑入滑出、關閉、骰子圖、窄來源規則）
 * - createChatScene：聊天另開視窗（分頁、參加者頭像列、虛擬捲動的高度規則、通知條、新增訊息）
 * - createStreamkitScene：Discord Streamkit 語音疊加層（誰在頻道、誰在說話、名字與頭像）
 *
 * 場景是一般的物件（不是 React 元件）：交給 CssPreviewFrame 的 scene，之後直接呼叫 update()／send() 等方法改狀態。
 */
export * from './assets';
export * from './character';
export * from './chat';
export * from './room';
export * from './shared';
export * from './streamkit';
