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
    status: 'live',
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
    status: 'live',
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
    status: 'live',
    inspiration: {
      name: 'max-enterme/obs-tachie-generator',
      url: 'https://github.com/max-enterme/obs-tachie-generator',
    },
  },
  {
    id: 'status-bar',
    name: '狀態條產生器',
    summary:
      '把 CCFOLIA 的角色狀態頁變成直播用的 HP／MP 狀態條：調好外觀後複製 CSS 貼進 OBS 瀏覽器來源，數值會即時連動。',
    group: 'G4',
    status: 'live',
    inspiration: {
      name: 'shiki365/status-bar-maker',
      url: 'https://github.com/shiki365/status-bar-maker',
    },
  },
  {
    id: 'text-path',
    name: '文字軌跡產生器',
    summary:
      '把一段文字沿著圓、螺旋、愛心或自己畫的線排成文字圖案，輸出可以直接貼到聊天室或社群平台的純文字。',
    group: 'G1',
    status: 'live',
    inspiration: {
      name: 'sotsotssi/text-path-generator',
      url: 'https://github.com/sotsotssi/text-path-generator',
    },
  },
  {
    id: 'variant-manager',
    name: '角色差分管理器',
    summary:
      '一次整理同一個角色的表情差分：統一檔名、調整順序後打包成 ZIP，並產生 CCFOLIA 聊天面板用的「@差分名」清單。',
    group: 'G3',
    status: 'live',
    inspiration: {
      name: 'くま。／TRPG WEBツール観測所',
      url: 'https://kumachansteps.github.io/trpg-web-tools/',
    },
  },
  {
    id: 'collage-letter',
    name: '匿名拼貼信產生器',
    summary:
      '把一段文字做成「從雜誌剪字拼貼」的匿名信圖片：每個字是一張歪斜的彩色紙片，可下載透明 PNG、紙張底 JPG，或複製成 HTML、Roll20 格式。',
    group: 'G1',
    status: 'live',
    inspiration: {
      name: 'sotsotssi/collage-letter',
      url: 'https://github.com/sotsotssi/collage-letter',
    },
  },
  {
    id: 'typewriter',
    name: '打字機動畫產生器',
    summary:
      '把一段文字做成逐字出現、亂碼閃爍、片尾名單捲動或卡拉 OK 變色的透明動畫，匯出 APNG、GIF、WebP，打字還能配上節奏對應的音效。',
    group: 'G1',
    status: 'live',
    inspiration: {
      name: 'sotsotssi/Typewriter-apng',
      url: 'https://github.com/sotsotssi/Typewriter-apng',
    },
  },
  {
    id: 'cutin',
    name: '切入素材產生器',
    summary:
      '把擲骰結果、勝負或一句喊話做成無縫循環的透明動畫：加工、配色、特效一次套好，匯出 CCFOLIA 切入或 Discord 貼圖用的 APNG、GIF。',
    group: 'G1',
    status: 'live',
    inspiration: {
      name: 'Taku-Taku-Taku/cutin-maker',
      url: 'https://github.com/Taku-Taku-Taku/cutin-maker',
    },
  },
  {
    id: 'ccfolia-cropper',
    name: '立繪裁切器',
    summary:
      '把去背的全身立繪裁成 3:4 或 1:1 的上半身頭像：自動對準頭部，左右拖曳微調，可加描邊、光暈或陰影，逐張或整批下載 PNG。',
    group: 'G3',
    status: 'live',
    inspiration: {
      name: 'kimtaehee2018-maker/ccfolia-cropper',
      url: 'https://github.com/kimtaehee2018-maker/ccfolia-cropper',
    },
  },
  {
    id: 'icon-maker',
    name: '簡易頭像產生器',
    summary:
      '把角色圖放進圓角外框，加上名字牌與 HO 牌，拖曳排好版面後下載 1024 × 1024 的正方形頭像 PNG。',
    group: 'G3',
    status: 'live',
    inspiration: {
      name: 'くま。／TRPG WEBツール観測所',
      url: 'https://kumachansteps.github.io/trpg-web-tools/',
    },
  },
  {
    id: 'color-palette',
    name: '角色配色條產生器',
    summary:
      '替每位角色做一條直立的膠囊形配色條：由上到下排出髮色、膚色、衣服等顏色，長度依身高換算、底部對齊並排，可從立繪取色，匯出 PNG。',
    group: 'G3',
    status: 'live',
    inspiration: {
      name: 'sotsotssi/CharColorPalette',
      url: 'https://github.com/sotsotssi/CharColorPalette',
    },
  },
  {
    id: 'height-board',
    name: '立繪身高比較板',
    summary:
      '把多位角色的立繪依身高換成同一個比例尺並排在公分刻度上，一眼看出誰高誰矮：可調頭頂與腳底基準線、拖曳排位，匯出含刻度的 PNG。',
    group: 'G3',
    status: 'live',
    inspiration: {
      name: 'woolwag3338/character-height-board',
      url: 'https://github.com/woolwag3338/character-height-board',
    },
  },
  {
    id: 'emotion-maker',
    name: '表情產生器',
    summary:
      '用眼睛、眉毛、嘴巴和汗滴、怒筋、臉紅等漫畫符號拼出 Q 版表情，存成清單後排成一張附文字的合輯圖，匯出透明 PNG。',
    group: 'G3',
    status: 'live',
    inspiration: {
      name: 'sotsotssi/emotion-maker',
      url: 'https://github.com/sotsotssi/emotion-maker',
    },
  },
  {
    id: 'scene-transition',
    name: '場景轉換素材產生器',
    summary:
      '做出拉滿畫面的換場動畫：淡出、擦除、圓形收束、溶解、血液垂流等 53 種效果，可加字幕，匯出透明背景的 WebP 或 APNG。不需要伺服器，圖片不會離開你的電腦。',
    group: 'G2',
    status: 'live',
    inspiration: {
      name: 'shiki365/scene-transition-maker',
      url: 'https://github.com/shiki365/scene-transition-maker',
    },
  },
  {
    id: 'loading-maker',
    name: '讀取動畫產生器',
    summary:
      '把角色和進度條、轉圈圖示或換圖列組成跑團用的讀取畫面：可上傳角色動畫、拖曳排版，加上開場淡入與結尾消失演出，匯出 APNG、WebP、GIF。',
    group: 'G2',
    status: 'live',
    inspiration: {
      name: 'sotsotssi/loading-maker',
      url: 'https://github.com/sotsotssi/loading-maker',
    },
  },
  {
    id: 'bg-motion',
    name: '動態背景產生器',
    summary:
      '讓背景圖震動、搖晃、推近拉遠、水波扭曲、淡化，或在幾張圖之間溶接與擦除，再加上夜晚、起霧等濾鏡，匯出動態 WebP、APNG、GIF。',
    group: 'G2',
    status: 'live',
    inspiration: {
      name: 'くま。／TRPG WEBツール観測所',
      url: 'https://kumachansteps.github.io/trpg-web-tools/',
    },
  },
  {
    id: 'room-zip',
    name: '房間 ZIP 產生器',
    summary:
      '把自己的背景、立繪、面板圖整理成 CCFOLIA 可以直接匯入的房間 ZIP：設計共用部件、一次排好多個場景的立繪與演出，再加上棋子與劇本文字。全部在瀏覽器裡完成。',
    group: 'G5',
    status: 'live',
    inspiration: {
      name: 'johnko00/ccfolia-room-zip-maker-demo',
      url: 'https://github.com/johnko00/ccfolia-room-zip-maker-demo',
    },
  },
  {
    id: 'character-editor',
    name: '角色資料編輯器',
    summary:
      '讀入角色 JSON、CCFOLIA 編輯畫面的文字或 .json 檔，逐項確認差異後再覆寫；編輯狀態、參數與聊天面板，輸出可以直接貼進 CCFOLIA 的角色資料。',
    group: 'G5',
    status: 'live',
    inspiration: {
      name: 'organon-torah/ccfoliaCharacterEditor',
      url: 'https://github.com/organon-torah/ccfoliaCharacterEditor',
    },
  },
  {
    id: 'foreground-frame',
    name: '前景框產生器',
    summary:
      '做出 CCFOLIA「前景」用的框圖片：中間的窗透明、框上加線條、陰影、藤蔓與鎖鏈等裝飾，還能依時間帶、天氣做出好幾張差分，一次匯出成 ZIP。',
    group: 'G5',
    status: 'live',
    inspiration: {
      name: 'shiki365/foreground-frame-maker',
      url: 'https://github.com/shiki365/foreground-frame-maker',
    },
  },
  {
    id: 'log-converter',
    name: 'CCFOLIA 日誌轉換器',
    summary:
      '把 CCFOLIA 匯出的聊天日誌轉成小說、時間軸或 CCFOLIA 風格的網頁：指定旁白與閒聊、嵌入頭像與插圖、分割檔案，也能做成貼進部落格的版本。全部在瀏覽器裡處理。',
    group: 'G5',
    status: 'live',
    inspiration: {
      name: 'Eon-00/eon-ccfolia-log-converter',
      url: 'https://github.com/Eon-00/eon-ccfolia-log-converter',
    },
  },
  {
    id: 'psd-studio',
    name: 'CCFOLIA & 圖片調色工作室',
    summary:
      '一次替房間 ZIP、PSD 的每個圖層或一整批圖片調色：色相、曲線、漸層對應，也能單張微調；房間 ZIP 會自動改名並同步房間資料，還能補邊到 24 px 倍數、把 APNG 壓到上傳限制以內。',
    group: 'G5',
    status: 'next',
    inspiration: {
      name: 'fyam-hamu/F_Ccfolia-PSD-Studio',
      url: 'https://github.com/fyam-hamu/F_Ccfolia-PSD-Studio',
    },
  },
  {
    id: 'scenario-cards',
    name: '劇本資訊卡片產生器',
    summary:
      'KP／GM 帶團前整理劇本：選取劇本內文做成場景、探索地點、NPC、HO 秘匿等資訊卡片，一鍵複製成貼進 CCFOLIA 聊天欄的固定格式文字。',
    group: 'G5',
    status: 'live',
    inspiration: {
      name: 'くま。／TRPG WEBツール観測所',
      url: 'https://kumachansteps.github.io/trpg-web-tools/',
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
