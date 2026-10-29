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

export type GroupId = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7' | 'G8' | 'G9' | 'G10' | 'dev';

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
  G9: { name: 'CoC 跑團輔助' },
  G10: { name: '地圖與網格' },
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
    group: 'G10',
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
      '把文字做成有登場、停留、退場動畫的透明素材（標語、長文、字幕、SF 風的 HUD 標題），匯出 APNG、GIF、WebP、PNG。',
    group: 'G1',
    status: 'live',
    inspiration: {
      name: 'くま。／文字画像APNGメーカー',
      url: 'https://kumachansteps.github.io/trpg-web-tools/tools/text-apng-maker/',
    },
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
    id: 'discord-color',
    name: 'Discord 彩色文字產生器',
    summary:
      '選取文字套上粗體、底線、經典 8 色、自訂色或彩虹、漸層效果，預覽 Discord 四種主題，複製成 ANSI 程式碼區塊貼進 Discord 就是彩色訊息。',
    group: 'G1',
    status: 'live',
    inspiration: {
      name: 'rebane2001／Discord Colored Text Generator',
      url: 'https://gist.github.com/rebane2001/07f2d8e80df053c70a1576d27eabe97c',
    },
  },
  {
    id: 'speech-bubble',
    name: '動態對話泡泡產生器',
    summary:
      '選造型、填文字，做出會彈出、打字、漂浮再退場的對話泡泡、通知視窗與 RPG 對話框，匯出透明背景的 APNG、GIF、WebP 動畫。',
    group: 'G1',
    status: 'live',
    inspiration: {
      name: 'sotsotssi/TextBubbleMaker-preview',
      url: 'https://github.com/sotsotssi/TextBubbleMaker-preview',
    },
  },
  {
    id: 'lyric-fx',
    name: '歌詞演出產生器',
    summary:
      '放進音樂與有時間的歌詞，讓每一句帶著傾斜與透視落在畫面上逐字打出、抖動，唱完往上飄著淡出；匯出有聲影片、透明 WebM 或 PNG 連番，給直播疊加或 MV 用。',
    group: 'G1',
    status: 'live',
    inspiration: {
      name: 'YouRanCoder/LimbusLyricSimulator',
      url: 'https://github.com/YouRanCoder/LimbusLyricSimulator',
    },
  },
  {
    id: 'rpg-screenshot',
    name: 'RPG 截圖產生器',
    summary:
      '把一張圖做成老式 RPG 遊戲的截圖：像素化、抖色與色調濾鏡，加上訊息視窗、名字、選項、演出文字與掃描線，台詞可以分頁、換說話者、換顏色，匯出 PNG 或逐字打出的 GIF。',
    group: 'G1',
    status: 'live',
    inspiration: {
      name: 'dearmysn1p3r/DearMySn1p3r_43（RPG Screenshot Maker）',
      url: 'https://dearmysn1p3r.github.io/DearMySn1p3r_43/',
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
      '替每位角色做一條直立的膠囊形配色條：由上到下排出髮色、膚色、衣服等顏色，長度依身高換算、底部對齊並排，可從立繪取色，匯出 PNG。同一份角色清單也能排成色票櫃（圓形頭像與髮色、瞳色一覽，依顏色排序、點色塊複製色碼）與配色卡（照片＋自動取出的顏色、色名與 HEX，PNG／GIF）。',
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
    id: 'bg-remover',
    name: '立繪去背工具',
    summary:
      '去掉立繪、角色圖的背景：AI 模型認得動漫角色，白底與單色底也能依顏色去掉，再用筆刷修邊，存成透明 PNG／WebP。',
    group: 'G3',
    status: 'live',
    inspiration: {
      name: 'SkyTNT/anime-segmentation',
      url: 'https://github.com/SkyTNT/anime-segmentation',
    },
  },
  {
    id: 'anime-rig',
    name: '2.5D 動態立繪',
    summary:
      '拖進分好部件的 PSD 就自動綁定、當場動起來：眨眼、嘴型、頭髮物理，可以用攝影機或麥克風帶動，匯出透明 PNG 或影片。',
    group: 'G3',
    status: 'live',
    inspiration: { name: '852wa/Anime2.5DRig', url: 'https://github.com/852wa/Anime2.5DRig' },
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
      '讓背景圖震動、搖晃、推近拉遠、水波扭曲、淡化，再加上夜晚、起霧等濾鏡；或用「圖片切換」把幾張圖接起來，每張各自設定秒數與切換效果。匯出動態 WebP、APNG、GIF。',
    group: 'G2',
    status: 'live',
    inspiration: {
      name: 'くま。／TRPG WEBツール観測所',
      url: 'https://kumachansteps.github.io/trpg-web-tools/',
    },
  },
  {
    id: 'screenshot-fx',
    name: '截圖演出產生器',
    summary:
      '在截圖上畫放大框、螢光筆、塗黑：周圍變暗、框彈出放大、螢光筆畫出來、塗黑揭開或蓋上，背景可以模糊或透明，加上出處，匯出完成圖 PNG、APNG 或影片。',
    group: 'G2',
    status: 'live',
    inspiration: {
      name: 'KIIN／スクショ演出スタジオ',
      url: 'https://screenshot-studio-8n8.pages.dev/',
    },
  },
  {
    id: 'room-zip',
    name: '房間 ZIP 產生器',
    summary:
      '把自己的背景、立繪、面板圖整理成 CCFOLIA 可以直接匯入的房間 ZIP：設計共用部件、一次排好多個場景的立繪與演出，再加上棋子與劇本文字；也可以讀入 CCFOLIA 匯出的房間 ZIP 繼續改。全部在瀏覽器裡完成。',
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
    status: 'live',
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
  {
    id: 'scenario-text',
    name: '劇本文字產生器',
    summary:
      '貼上台本或描寫，切成一則一則的 CCFOLIA 劇本文字（シナリオテキスト），台詞帶說話者的立繪與差分、描寫與 HO 附圖，匯出成可以直接讀入房間的 ZIP。',
    group: 'G5',
    status: 'live',
    inspiration: {
      name: 'shiki365/scenario-text-maker',
      url: 'https://github.com/shiki365/scenario-text-maker',
    },
  },
  {
    id: 'scenario-editor',
    name: '劇本排版台',
    summary:
      '左邊逐段寫劇本、右邊即時排成 A4 書頁：標題、對話、檢定框、表格、流程圖、NPC 卡、目錄與彈出視窗，可以列印、下載 PDF 或匯出附目錄的閱覽 HTML；作品存在瀏覽器裡，保留過去的版本。',
    group: 'G6',
    status: 'live',
    inspiration: {
      name: 'sedn14636361/trpg-scenario-editor',
      url: 'https://github.com/sedn14636361/trpg-scenario-editor',
    },
  },
  {
    id: 'session-log',
    name: '跑團紀錄簿',
    summary:
      '把玩過、帶過的團記成表格：統計場次與時數、整理已通關劇本清單，也能把一團帶到團報產生器。',
    group: 'G6',
    status: 'live',
    inspiration: {
      name: 'くま。／TRPG WEBツール観測所',
      url: 'https://kumachansteps.github.io/trpg-web-tools/',
    },
  },
  {
    id: 'session-report',
    name: '團報產生器',
    summary:
      '填好系統、劇本、主持人與參加者，從 17 種版面挑一種，即時排出貼到 X 的團報：可以直接改、加分隔線與符號、算字數，一鍵複製或開啟發文畫面。',
    group: 'G6',
    status: 'live',
    inspiration: {
      name: 'くま。／TRPG WEBツール観測所',
      url: 'https://kumachansteps.github.io/trpg-web-tools/',
    },
  },
  {
    id: 'coc-typesetter',
    name: 'CoC 劇本排版工具',
    summary:
      '用簡單的標記寫克蘇魯神話劇本，即時排成 A5／B5／A4 的書頁：封面、目錄、章節編號、描述、檢定、KP 資訊與資料卡，長段落自動接到下一頁，可以列印成 PDF 或存成列印用 HTML。',
    group: 'G6',
    status: 'live',
    inspiration: {
      name: 'scenario-tool（作者不明）',
      url: 'https://scenario-tool-jade.vercel.app/coc-typesetter.html',
    },
  },
  {
    id: 'review-grid',
    name: '劇本心得九宮格',
    summary:
      '把跑過的劇本排成九宮格或清單：每格放劇本的圖、規則、作者，挑最多 3 個心得標籤（標籤可以自己改），存成 PNG 分享；收集團員的檔案還能排出同一個劇本的心得比較圖。',
    group: 'G6',
    status: 'live',
    inspiration: {
      name: 'sotsotssi/scenario-review',
      url: 'https://github.com/sotsotssi/scenario-review',
    },
  },
  {
    id: 'crossword',
    name: '填字遊戲產生器',
    summary:
      '把答案與提示（或從劇本、跑團日誌挑出的單字與句子）自動排成填字遊戲，當作劇本的謎題講義；題目版與解答版都能下載 PNG、HTML 或列印。',
    group: 'G6',
    status: 'live',
    inspiration: {
      name: 'sotsotssi/text2crossword',
      url: 'https://github.com/sotsotssi/text2crossword',
    },
  },
  {
    id: 'scratch-card',
    name: '刮刮卡產生器',
    summary:
      '做一張可以用滑鼠或手指刮開的刮刮卡當 handout：底下藏著隨機抽出的圖示、句子或圖片，刮開時噴出彩帶；可以存成能刮的互動 HTML，或複製分享連結給玩家。',
    group: 'G6',
    status: 'live',
    inspiration: {
      name: 'sotsotssi/Scratchcard',
      url: 'https://github.com/sotsotssi/Scratchcard',
    },
  },
  {
    id: 'lock-screen',
    name: '鎖定畫面訊息產生器',
    summary:
      '做一張角色手機的鎖定畫面當 handout：換上桌布、寫下最多 4 則訊息，匯出 PNG 或訊息一則一則跳出來的 GIF，也能把手機放在外框照片上。',
    group: 'G6',
    status: 'live',
    inspiration: { name: 'TEXTSCENE', url: 'https://textscene.netlify.app/' },
  },
  {
    id: 'id-ticket',
    name: '證件與票券產生器',
    summary:
      '做跑團用的證件與票券道具：員工證、學生證、記者證、刑警證、會員卡、1920 年代的偵探執照，以及電影票、登機證、車票、收據；放上照片、自動產生編號、條碼與 QR code，證件可以匯出 600 dpi 的印刷用 PNG，票券還能存成浮起加閃光的 GIF。',
    group: 'G6',
    status: 'live',
    inspiration: {
      name: 'dearmysn1p3r/DearMySn1p3r_20',
      url: 'https://dearmysn1p3r.github.io/DearMySn1p3r_20/',
    },
  },
  {
    id: 'clue-map',
    name: '調查熱點圖',
    summary:
      '在場景圖上畫出可以點的熱點，每個熱點藏著一則線索（文字、圖片、檢定提示），可以設成先找到別的線索才出現或隱藏；PL 點一點就翻出線索卡，匯出能玩的互動 HTML、分享連結與 KP 用的總覽 PNG。',
    group: 'G6',
    status: 'live',
    inspiration: {
      name: 'momo102938/MUNgs_click（콕콕）',
      url: 'https://momo102938.github.io/MUNgs_click/',
    },
  },
  {
    id: 'video-anim',
    name: '影片轉動圖工具',
    summary:
      '把影片的一段剪成循環播放的 APNG、WebP 或 GIF：選起點與終點、框出要的範圍、調整每秒格數、尺寸與播放速度，全部在瀏覽器裡轉換。',
    group: 'G8',
    status: 'live',
    inspiration: {
      name: 'sotsotssi/video-to-pic',
      url: 'https://github.com/sotsotssi/video-to-pic',
    },
  },
  {
    id: 'gif-combiner',
    name: 'GIF 接合器',
    summary:
      '把好幾張 GIF 動圖排進同一張畫布，各自照原本的速度循環：拖曳排版、拉角落改大小，或依格數一鍵排成格線，再合成一張 GIF（也能存成 APNG、WebP）。',
    group: 'G8',
    status: 'live',
    inspiration: {
      name: 'sotsotssi/GIF-Combiner',
      url: 'https://github.com/sotsotssi/GIF-Combiner',
    },
  },
  {
    id: 'music-frame',
    name: '音樂播放畫面產生器',
    summary:
      '做出跑團 BGM、角色主題曲的「正在播放」畫面：放進封面與音樂，選版面、配色、視覺化與邊框，可以隨時間顯示歌詞，存成 1920 × 1080 的 PNG 或有聲音的影片。',
    group: 'G8',
    status: 'live',
    inspiration: { name: 'zZnaptime/MVmaker', url: 'https://github.com/zZnaptime/MVmaker' },
  },
  {
    id: 'geo-bloom',
    name: '幾何花紋產生器',
    summary:
      '一鍵產生從中央的圓長出線條、圓與方形的幾何花紋，像星座圖、魔法陣或科幻介面：同一個種子畫出同一張，調數量、大小、重疊與配色，匯出 PNG 或 SVG，當封面、角色卡與宣傳圖的裝飾。',
    group: 'G8',
    status: 'live',
    inspiration: { name: 'al1scut/tkmizGeo', url: 'https://al1scut.github.io/tkmizGeo/' },
  },
  {
    id: 'vhs-frame',
    name: '錄影帶畫面產生器',
    summary:
      '把照片做成老錄影帶在映像管電視上播放的畫面：色差、撕裂、雜訊、掃描線與弧面，「磨損度」決定壞得多嚴重，加上字幕與時間碼，匯出 PNG 或字幕逐字打出的 GIF，當作錄影帶或監視器截圖的 handout。',
    group: 'G8',
    status: 'live',
    inspiration: {
      name: 'dearmysn1p3r/VHS_Maker',
      url: 'https://dearmysn1p3r.github.io/VHS_Maker/',
    },
  },
  {
    id: 'magic-circle',
    name: '魔法陣製作器',
    summary:
      '用鋼筆、手繪、圓與星形加上對稱尺畫出魔法陣、印記或簽名，放上盧恩文字與發光效果，再排好出場動態，匯出 PNG、GIF、APNG 或 WebP。',
    group: 'G7',
    status: 'live',
    inspiration: {
      name: 'sotsotssi/magic-circle-maker',
      url: 'https://github.com/sotsotssi/magic-circle-maker',
    },
  },
  {
    id: 'pair-maker',
    name: '角色介紹圖產生器',
    summary:
      '挑一個版型，在畫布上點哪裡就改哪裡：兩人資料、配對、花紋橫幅、多人資料卡、置頂貼文與會自動分頁的文字記錄，加上可自由旋轉的貼紙，下載 PNG 或 PDF。',
    group: 'G7',
    status: 'live',
    inspiration: {
      name: 'baegop157902/PairMaker',
      url: 'https://github.com/baegop157902/PairMaker',
    },
  },
  {
    id: 'character-select',
    name: '選角畫面產生器',
    summary:
      '做出格鬥遊戲風格的選角畫面動畫：放進角色圖片、設定每位玩家要選誰，游標依序移動並確定，可加大主格與選取效果，存成 APNG、WebP、GIF、MP4，或做成能自己選的互動 HTML。',
    group: 'G7',
    status: 'live',
    inspiration: {
      name: 'sotsotssi/select-your-chara',
      url: 'https://github.com/sotsotssi/select-your-chara',
    },
  },
  {
    id: 'acrylic-goods',
    name: '壓克力周邊工房',
    summary:
      '把去背圖做成可以轉動的 3D 壓克力立牌、會晃動的搖搖樂與多層的立體透視，調整厚度、留白與打光，存成會旋轉的 APNG、GIF、WebP 或 GLB 模型。',
    group: 'G7',
    status: 'live',
    inspiration: {
      name: 'sotsotssi/acrylic-goods',
      url: 'https://github.com/sotsotssi/acrylic-goods',
    },
  },
  {
    id: 'coc-dice',
    name: 'CoC 擲骰工具',
    summary:
      'CoC 7 版的技能檢定（獎勵骰、懲罰骰、自動判定成功等級）與自訂算式擲骰，附擲骰紀錄；另有傷害計算：貼上 BCDice 的擲骰結果，扣掉護甲後加總成「:HP-」指令。',
    group: 'G9',
    status: 'live',
    inspiration: {
      name: 'ihoukentiku/ihoukentiku.github.io',
      url: 'https://github.com/ihoukentiku/ihoukentiku.github.io',
    },
  },
  {
    id: 'coc-npc',
    name: 'CoC NPC 產生器',
    summary:
      '一次管理多個 CoC 7 版／6 版的 NPC：用骰子算式擲屬性，自動算出 HP、MP、SAN、DB 與體格，加上技能與攻擊指令，輸出可以直接貼進 CCFOLIA 的角色 JSON 與聊天面板。',
    group: 'G9',
    status: 'live',
    inspiration: {
      name: 'ihoukentiku/ihoukentiku.github.io',
      url: 'https://github.com/ihoukentiku/ihoukentiku.github.io',
    },
  },
  {
    id: 'coc-sheet',
    name: 'CoC 7 版調查員角色卡',
    summary:
      '在瀏覽器填好 CoC 7 版調查員角色卡：屬性的困難／極限、HP、SAN、DB、移動力與技能點數自動算，可以管理多張角色卡、裁切頭像，印成 A4 兩頁或存成 PDF、PNG，也能複製成 CCFOLIA 角色。',
    group: 'G9',
    status: 'live',
    inspiration: {
      name: 'ihoukentiku/ihoukentiku.github.io',
      url: 'https://github.com/ihoukentiku/ihoukentiku.github.io',
    },
  },
  {
    id: 'house-rules',
    name: 'CoC 房規表產生器',
    summary:
      '把 CoC 6 版／7 版團的房規整理成一張表：從常見的規則勾選、調整數值、寫注記，也能加自己的規則，匯出 PNG 圖片、純文字或 Markdown，貼到 Discord 或招募文。',
    group: 'G9',
    status: 'live',
    inspiration: {
      name: 'くま。／CoCハウスルール表メーカー',
      url: 'https://kumachansteps.github.io/trpg-web-tools/',
    },
  },
  {
    id: 'grid-maker',
    name: '網格產生器',
    summary:
      '產生透明背景的方格或六角格 PNG：設定格數、大小、線條與發光，可以加上 1-1、A1、流水號等座標；六角格能網格化成 CCFOLIA 對得齊的尺寸。',
    group: 'G10',
    status: 'live',
    inspiration: {
      name: 'ihoukentiku/ihoukentiku.github.io',
      url: 'https://github.com/ihoukentiku/ihoukentiku.github.io',
    },
  },
  {
    id: 'range-ruler',
    name: '距離量尺產生器',
    summary:
      '以中心格為起點，把每一格的距離寫在格子上、依距離上色，做成可以疊在地圖上的方格或六角格量尺 PNG；點格子就能個別改文字與顏色。',
    group: 'G10',
    status: 'live',
    inspiration: {
      name: 'ihoukentiku/ihoukentiku.github.io',
      url: 'https://github.com/ihoukentiku/ihoukentiku.github.io',
    },
  },
  {
    id: 'map-editor',
    name: '地圖編輯器',
    summary:
      '在方格或六角格上畫戰鬥地圖與平面圖：地面、牆壁、房間、家具與地圖符號、格子填色、手繪與文字，可以群組與布林運算；地圖自動存在瀏覽器，選範圍匯出 PNG、JPEG、SVG。',
    group: 'G10',
    status: 'live',
    inspiration: {
      name: 'ihoukentiku/ihoukentiku.github.io',
      url: 'https://github.com/ihoukentiku/ihoukentiku.github.io',
    },
  },
  {
    id: 'ai-fail',
    name: 'AI 誤判梗圖產生器',
    summary:
      '放一張照片，畫上 AI 物件辨識風格的綠框與標籤（例如把貓標成「object」），做成「AI 認錯了」的梗圖：可以多個框、改顏色與字級、調整前後，存成 PNG。',
    group: 'G7',
    status: 'live',
    inspiration: {
      name: 'swoonqx/ai-fails-meme-maker',
      url: 'https://github.com/swoonqx/ai-fails-meme-maker',
    },
  },
  {
    id: 'char-chart',
    name: '角色分析圖產生器',
    summary:
      '同一份角色清單做成兩種圖：把角色拖到性格四象限上（可以好幾頁，還能算兩人的契合度），或排成一圈畫關係圖、用不同的線連起來，存成 PNG。',
    group: 'G7',
    status: 'live',
    inspiration: {
      name: 'sotsotssi/char-quadrant',
      url: 'https://github.com/sotsotssi/char-quadrant',
    },
  },
  {
    id: 'floor-plan',
    name: '室內平面圖產生器',
    summary:
      '探索場景用的室內平面圖：從套房、透天厝、洋館、飯店、醫院、廢墟等範本開始，擺房間（牆自動產生）、門窗與家具；GM 專用的房間在 PL 圖裡蓋灰，隱藏線索可以另外開關，多樓層匯出 PNG。',
    group: 'G10',
    status: 'live',
    inspiration: {
      name: 'くま。／TRPG室内図メーカー',
      url: 'https://kumachansteps.github.io/trpg-web-tools/',
    },
  },
  {
    id: 'rank-chart',
    name: '排行榜產生器',
    summary:
      '盲選排行榜：放進角色的名字與照片，一次揭曉一位、當場決定名次，下一位是誰事先不知道、名次確定後就不能改，排完存成 PNG 或 WebP。',
    group: 'G7',
    status: 'live',
    inspiration: {
      name: 'sotsotssi/would-you-rank',
      url: 'https://github.com/sotsotssi/would-you-rank',
    },
  },
  {
    id: 'polaroid',
    name: '拍立得相框產生器',
    summary:
      '把角色圖放進拍立得相框、在下方白邊寫一行字，再用壓克力筆分三個圖層塗鴉、貼上自動加白邊的貼紙，存成 PNG。',
    group: 'G7',
    status: 'live',
    inspiration: {
      name: 'swoonqx/sw-polaroid',
      url: 'https://github.com/swoonqx/sw-polaroid',
    },
  },
  {
    id: 'relation-chart',
    name: '角色關係圖產生器',
    summary:
      '在畫布上擺角色、定義關係的顏色與線型、點兩個人拉出關係線，用標籤框出陣營、整理角色庫與關係庫、加便利貼與世界觀，自動排列後匯出 PNG、分層 SVG／PSD、可以分享的互動網頁，或把分頁做成時間軸動畫（GIF／影片）。',
    group: 'G7',
    status: 'live',
    inspiration: {
      name: 'PaiTei4234／Relationship Chart Maker',
      url: 'https://paitei4234.itch.io/relationshipchartmaker',
    },
  },
  {
    id: 'prose-card',
    name: '短文圖片產生器',
    summary:
      '把台詞、後日談、劇本宣傳文句或心得排成 1200 × 1600 的直式圖片：封面、內文頁或照片＋文字三種版面，文字可以加粗、換色、螢光筆，放不下時自動接到下一頁，存成 PNG 或 ZIP。',
    group: 'G7',
    status: 'live',
    inspiration: {
      name: 'dan0030/writeediter2',
      url: 'https://github.com/dan0030/writeediter2',
    },
  },
  {
    id: 'captcha-card',
    name: '驗證題梗圖產生器',
    summary:
      '做一張「請選出所有包含 ○○ 的圖片」的驗證題梗圖：放代表圖與 3 × 3／4 × 4 的圖片格、勾選答案，匯出 PNG，或游標一格一格點選、按下驗證的 GIF 動畫。',
    group: 'G7',
    status: 'live',
    inspiration: {
      name: 'dearmysn1p3r/DearMySn1p3r_44',
      url: 'https://dearmysn1p3r.github.io/DearMySn1p3r_44/',
    },
  },
  {
    id: 'social-post',
    name: '社群貼文產生器',
    summary:
      '做出相片社群 App 的貼文、留言、限時動態、個人頁、首頁動態與私訊畫面：照片輪播、按讚與留言、限時動態的版面與貼紙、朋友的貼文與限時動態、私訊的對話，存成 PNG，或從首頁動態與個人頁點進貼文、限時動態與私訊的 HTML 檔，給角色的社群帳號、handout 與宣傳用。',
    group: 'G7',
    status: 'live',
    inspiration: {
      name: 's2ndrome/4layout',
      url: 'https://s2ndrome.github.io/4layout/',
    },
  },
  {
    id: 'family-tree',
    name: '家系圖產生器',
    summary:
      '一代一列地接出人物卡片，做成舊家、名門的家系圖：雙擊直接改字、拖曳換順序或換父母、顏色分類與折疊子孫，匯出縱向或橫向的 PNG，給 KP 整理人物關係與 handout 用。',
    group: 'G7',
    status: 'live',
    inspiration: { name: '가계도 편집기', url: 'https://gagyedo.j-segrc.workers.dev' },
  },
  {
    id: 'map-fx',
    name: '地圖演出產生器',
    summary:
      '在地圖或平面圖上畫區域放大、移動路線與地點、房間遮罩，做成「路線一路畫過去、迷霧散開、房間出現」的探索演出，匯出 PNG、APNG、影片，或給 CCFOLIA 自由探索用的每個房間一張遮罩 PNG；進階 3D 把平面圖變成線框立體空間，鏡頭沿路線走過去並存成影片。',
    group: 'G10',
    status: 'live',
    inspiration: {
      name: 'KIIN／マップ・見取り図 演出スタジオ',
      url: 'https://map-stage.pages.dev/',
    },
  },
  {
    id: 'handout-maker',
    name: '線索道具產生器',
    summary:
      '做跑團用的線索道具圖：報紙剪報、通緝令、便條、便利貼、拍立得、系統視窗、遊戲的系統通知、終端機、手機簡訊、電子郵件，可以塗黑、蓋狀態印章、換紙張質感，匯出 PNG 或直接複製貼到 CCFOLIA。',
    group: 'G6',
    status: 'live',
    inspiration: { name: 'KKumuu/trpgforkk', url: 'https://github.com/KKumuu/trpgforkk' },
  },
  {
    id: 'ui-frame',
    name: 'UI 框素材產生器',
    summary:
      '選一個主色，做出整套透明 PNG 的 UI 框：文字冒險的訊息框、名字框、選項與系統按鈕（一般、滑過、按下、停用）附 TyranoScript 配置程式碼，或 CCFOLIA 螢幕面板、OBS 用的畫面外框、角色框、狀態徽章、骰子面板與留言板。',
    group: 'G4',
    status: 'live',
    inspiration: { name: 'KIIN／ノベワク STUDIO', url: 'https://novewaku-studio.pages.dev' },
  },
  {
    id: 'session-calendar',
    name: '團期行事曆',
    summary:
      '把跑團的場次、準備事項和其他預定排在同一張月曆上：標出台灣的國定假日與補假，拖曳新增多日的預定、換日子，算出空檔日期拿去揪團，整個月或整年存成 PNG，匯出入 JSON／iCal（可讀 Google 日曆匯出的檔案），也能把一團送到跑團紀錄簿。',
    group: 'G6',
    status: 'live',
    inspiration: {
      name: 'くま。／卓準備カレンダー',
      url: 'https://kumachansteps.github.io/trpg-web-tools/tools/session-check-calendar/',
    },
  },
  {
    id: 'pdf-compress',
    name: 'PDF 壓縮器',
    summary:
      '把劇本、手冊、角色卡的 PDF 縮小，方便傳 Discord（免費帳號 10 MB）、上傳 BOOTH 或雲端：整理結構、合併重複的圖片、照片依解析度重新壓縮，或整頁轉成圖片；一次可以壓很多個、留最小的、比原檔大就不換，檔案不會上傳。',
    group: 'G6',
    status: 'live',
    inspiration: {
      name: 'mrflamingchad67/qcompress',
      url: 'https://github.com/mrflamingchad67/qcompress',
    },
  },
  {
    id: 'npc-names',
    name: 'NPC 名字產生器',
    summary:
      'KP 臨時要幫 NPC 取名時，一鍵產生一批像樣的名字：日本（現代、昭和、大正～昭和初期，附平假名、片假名與羅馬拼音）、台灣、1920 年代的美國，依實際的人數抽、同一批不重複，點一下就複製，喜歡的可以鎖定留著。',
    group: 'G9',
    status: 'live',
  },
  {
    id: 'token-maker',
    name: 'VTT 棋子產生器',
    summary:
      '把立繪、頭像做成 CCFOLIA、Roll20、Foundry 等 VTT 用的圓形棋子：放進有花紋的外框，頭、角、武器可以出框蓋在外框上，敵人可以做成編號 1～N 的一組，存成透明背景的 PNG；檔案不會上傳。',
    group: 'G3',
    status: 'live',
    inspiration: {
      name: 'arcana-hanna/token-workshop',
      url: 'https://github.com/arcana-hanna/token-workshop',
    },
  },
];

export function getTool(id: string): ToolEntry | undefined {
  return TOOLS.find((t) => t.id === id);
}

export function toolsInGroup(group: GroupId): ToolEntry[] {
  return TOOLS.filter((t) => t.group === group);
}

/**
 * 群組分頁要列的工具：已上線的頁面只列已上線的工具（重寫中、還沒驗證的不出現在正式網站的分頁）；
 * 重寫中的頁面（`next/<id>/`）與開發伺服器列出整組。
 */
export function groupTabTools(tool: Pick<ToolEntry, 'group' | 'status'>, dev = false): ToolEntry[] {
  const all = toolsInGroup(tool.group);
  return dev || tool.status !== 'live' ? all : all.filter((t) => t.status === 'live');
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
