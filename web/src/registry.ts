/**
 * 工具清單（單一來源）。
 *
 * - 建置設定（vite.config.ts）依 `status` 決定輸出位置：`next` → `next/<id>/`、`live` → `tools/<id>/`。
 * - ToolShell 的標題、群組分頁與靈感來源頁尾也從這裡讀。
 * - 之後首頁卡片也會改從這裡產生。
 *
 * 這個檔案同時被 Node（建置設定）與瀏覽器載入，不可以 import 任何只在瀏覽器存在的東西。
 */

export type ToolStatus = 'next' | 'live';

export type GroupId = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7' | 'G8' | 'G9' | 'dev';

export interface Inspiration {
  /** 顯示在頁尾「靈感來源：」後面的名稱 */
  name: string;
  /** 連結（原作網址）；出處不明、沒有網址時不填，頁尾只顯示名稱 */
  url?: string;
}

export interface ToolEntry {
  /** 網址用的 id，與目錄名稱相同（`web/src/tools/<id>/`） */
  id: string;
  /** 工具名稱（標題、群組分頁） */
  name: string;
  /** 一句話說明（首頁卡片、頁首） */
  summary: string;
  group: GroupId;
  status: ToolStatus;
  /** 原創工具不填 */
  inspiration?: Inspiration;
}

export const GROUPS: Record<GroupId, { name: string }> = {
  G1: { name: '文字演出' },
  G2: { name: '轉場與動態' },
  G3: { name: '立繪工作台' },
  G4: { name: 'OBS 疊加' },
  G5: { name: 'CCFOLIA 資料' },
  G6: { name: '劇本與紀錄' },
  G7: { name: '介紹圖與宣傳' },
  G8: { name: '影像與動圖' },
  G9: { name: '綜合' },
  dev: { name: '開發用' },
};

export const TOOLS: readonly ToolEntry[] = [
  {
    id: '_gallery',
    name: '元件展示',
    summary: '新框架的共用元件、核心模組與示範動畫，給實作者參考。',
    group: 'dev',
    status: 'next',
  },
  {
    id: 'textbox',
    name: '文字方框產生器',
    summary: '把文字排成框線方框或純文字表格，貼到 CCFOLIA 聊天欄也能左右對齊。',
    group: 'G1',
    status: 'live',
    inspiration: { name: 'sotsotssi/TextBoxGen', url: 'https://github.com/sotsotssi/TextBoxGen' },
  },
  {
    id: 'portrait-size',
    name: '立繪尺寸統一器',
    summary: '裁掉立繪四周的透明留白，再左右補透明邊統一寬度，切換差分時棋子大小不再忽大忽小。',
    group: 'G3',
    status: 'live',
    inspiration: {
      name: 'woolwag3338/character-image-size',
      url: 'https://github.com/woolwag3338/character-image-size',
    },
  },
  {
    id: 'apng-wipe',
    name: '輕量轉場 APNG 產生器',
    summary:
      '做出只有幾 KB 的單色轉場動畫：整片淡入淡出或從任一方向擦過去，透明背景、可直接拉伸成全畫面。',
    group: 'G2',
    status: 'live',
    inspiration: { name: '出處不明的轉場 APNG 小工具' },
  },
  {
    id: 'battlemap',
    name: '戰鬥地圖產生器',
    summary:
      '一鍵產生俯視的地下城戰鬥地圖（22 × 16 格），有石砌地城、洞穴、墓室三種地形，可匯出 PNG 當 VTT 背景。',
    group: 'G8',
    status: 'live',
    inspiration: {
      name: 'usagineko7865-debug/battlemap-generator',
      url: 'https://github.com/usagineko7865-debug/battlemap-generator',
    },
  },
  {
    id: 'message-box',
    name: '訊息框產生器',
    summary:
      '把 CCFOLIA 房間畫面發言時跳出的訊息框改成直播用的樣式：產生貼進 OBS 瀏覽器來源的自訂 CSS，畫面上只留訊息框。',
    group: 'G4',
    status: 'next',
    inspiration: {
      name: 'shiki365/message-box-maker',
      url: 'https://github.com/shiki365/message-box-maker',
    },
  },
  {
    id: 'chat-window',
    name: '聊天視窗產生器',
    summary:
      '做出 OBS 瀏覽器來源用的自訂 CSS，把 CCFOLIA 的聊天另開視窗變成直播畫面上的聊天／擲骰視窗，可以只列擲骰、依成敗上色。',
    group: 'G4',
    status: 'next',
    inspiration: {
      name: 'shiki365/chat-window-maker',
      url: 'https://github.com/shiki365/chat-window-maker',
    },
  },
  {
    id: 'text-fx',
    name: '文字演出產生器',
    summary:
      '把文字做成有登場、停留、退場動畫的透明素材（標語、長文、字幕），匯出 APNG、GIF、WebP、PNG。',
    group: 'G1',
    status: 'live',
  },
  {
    id: 'obs-tachie',
    name: 'Discord 通話立繪產生器',
    summary:
      '用 Discord 語音跑團直播時，把 Streamkit 的小頭像換成常駐立繪：說話時彈跳、發光或閃爍，可附名字標籤，產生 OBS 瀏覽器來源的自訂 CSS。',
    group: 'G4',
    status: 'next',
    inspiration: {
      name: 'max-enterme/obs-tachie-generator',
      url: 'https://github.com/max-enterme/obs-tachie-generator',
    },
  },
];

export function getTool(id: string): ToolEntry | undefined {
  return TOOLS.find((t) => t.id === id);
}

export function toolsInGroup(group: GroupId): ToolEntry[] {
  return TOOLS.filter((t) => t.group === group);
}

/** 工具建置後所在的目錄（相對於 repo 根目錄） */
export function outputDir(tool: Pick<ToolEntry, 'id' | 'status'>): string {
  return tool.status === 'live' ? `tools/${tool.id}` : `next/${tool.id}`;
}

/**
 * 從某個工具頁連到另一個工具頁的相對網址。
 * 所有工具頁都在根目錄下兩層（`tools/<id>/`、`next/<id>/`），所以一律先回到根目錄。
 */
export function hrefToTool(target: Pick<ToolEntry, 'id' | 'status'>): string {
  return `../../${outputDir(target)}/`;
}
