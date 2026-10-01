/** 訊息框產生器的介面文字（只有台灣繁體中文；用詞照 DESIGN.md 第 5 節） */
import type { SampleKind } from './samples';

export const S = {
  /* ---- 分頁 ---- */
  tabs: {
    basic: '基本',
    box: '方框',
    name: '名稱',
    text: '內文',
    portrait: '立繪',
  },
  tabsLabel: '設定分類',

  /* ---- 範本（F01、F02） ---- */
  templateSection: '範本',
  templatePick: '選擇範本',
  templateApply: '套用',
  templateReplaces:
    '套用後會換掉：位置、方框、名稱、骰子結果、內文、立繪與骰子圖的設定。來源大小、房間網址、檔名與預覽設定不變（可以復原）。',
  templateCurrent: (name: string | null) =>
    name ? `目前以範本「${name}」為基礎。` : '目前沒有套用範本。',
  templateApplied: (name: string) => `已套用範本「${name}」。`,

  /* ---- 來源大小（F03、F04） ---- */
  sourceSection: '瀏覽器來源大小',
  sourceHint:
    'OBS 瀏覽器來源的寬高，預覽就是這個大小。立繪會超出方框上緣，高度要把立繪算進去；寬度小於 900 時 CCFOLIA 會縮小立繪與骰子圖，產生的 CSS 會改回設定的大小。',
  sourceWidth: '寬',
  sourceHeight: '高',
  sourceFieldHint: '離開欄位或按 Enter 才生效；空白或不是數字時回到預設。',
  presets: {
    fhd: '1920×1080',
    hd: '1280×720',
    lower: '下半部 1280×540',
  } as Record<string, string>,
  presetsLabel: '常用大小',
  sizeSet: (w: number, h: number) => `來源大小改成寬 ${w} × 高 ${h}。`,

  /* ---- 房間網址（F51、F52） ---- */
  roomSection: '房間網址',
  room: 'CCFOLIA 房間網址',
  roomPlaceholder: 'https://ccfolia.com/rooms/…（也可以只貼房間 ID）',
  roomHint: '訊息框只出現在房間畫面，所以來源要用房間網址；結尾是 /chat 的聊天畫面沒有訊息框。',
  sourceUrl: '瀏覽器來源網址',
  sourceUrlPlaceholder: '填好房間網址後會出現在這裡',
  urlCopied: '已複製網址，請貼到 OBS 瀏覽器來源的「網址」欄。',
  urlMissing:
    '還沒有來源網址。訊息框只存在 CCFOLIA 的房間畫面：請填房間網址（https://ccfolia.com/rooms/房間ID），不要用 /chat 結尾的聊天畫面網址。',
  goToRoom: '前往填寫房間網址',

  /* ---- 位置（F05～F09） ---- */
  positionSection: '位置',
  maxWidth: '方框最大寬度',
  maxWidthHint: '來源比較窄時，會保留左右留白並跟著縮小。',
  align: '靠齊位置',
  alignOptions: { left: '靠左', center: '置中', right: '靠右' },
  bottom: '下方留白',
  side: '左右留白',
  sideHint: '方框離來源左右邊的最小距離。',
  entrance: '出現方式',
  entranceOptions: { slide: '從下方滑入', instant: '直接在原位出現' },
  entranceHint: '滑入是 CCFOLIA 原本的動畫；原位出現時關閉後會在原位停約 0.2 秒再消失。',

  /* ---- 方框（F10～F18） ---- */
  boxSection: '方框',
  boxColor: '方框底色',
  opacity: '不透明度',
  texture: '質感',
  textureOptions: {
    none: '無',
    paper: '舊紙',
    grain: '顆粒',
    scanlines: '掃描線',
    deepen: '由上往下漸深',
  } as Record<string, string>,
  textureHint: '舊紙：中央亮、四周褐色暗角加細顆粒。掃描線疊在文字之上。漸深：上淡下濃。',
  borderWidth: '外框粗細',
  borderColor: '外框顏色',
  radius: '圓角',
  shadow: '陰影',
  shadowHint: '方框下方的柔和陰影；0 是沒有陰影。',
  brackets: '四角括號',
  bracketColor: '括號顏色',
  padX: '內側留白（左右）',
  padY: '內側留白（上下）',
  lines: '內文高度',
  linesUnit: '行',
  linesHint: '內文區固定放得下幾行。發言比較長時，CCFOLIA 會一直捲到最新的那幾行。',
  buttons: '略過／關閉按鈕',
  buttonsOptions: { hover: '滑鼠移上才顯示', never: '不顯示', always: '一直顯示' },
  buttonsHint:
    '「滑鼠移上才顯示」時實況畫面上看不到按鈕，只有在 OBS 的「互動」視窗裡把滑鼠移上去才會出現，可以在那裡關掉訊息框。',

  /* ---- 名稱（F19～F28） ---- */
  nameSection: '名稱',
  nameNote: 'CCFOLIA 放進訊息框的名稱沒有角色顏色，所以名稱只能設一種顏色。',
  showName: '顯示名稱',
  namePos: '名稱擺放',
  namePosOptions: { inside: '方框內', plate: '上緣名牌' },
  namePosHint: '名牌模式：名稱放在方框上緣外，骰子結果也一起移到名牌旁。',
  nameFont: '名稱字型',
  nameSize: '名稱大小',
  nameColor: '名稱文字色',
  nameGap: '名稱與內文的距離',
  plateColor: '名牌底色',
  plateRadius: '名牌圓角',
  plateBorder: '名牌外框粗細',
  plateBorderColor: '名牌外框顏色',
  plateInset: '名牌左右距離',
  plateInsetHint: '名牌離方框左緣的距離（右邊也保留同樣的距離）。',
  plateLift: '名牌上移',
  plateLiftHint: '名牌預設會沉進方框上緣約 0.7 個字高；往上移超過時，名牌與方框之間會空出間隔。',
  plateGap: '名牌與內文的距離',

  /* ---- 骰子結果（F29～F33） ---- */
  resultSection: '骰子結果',
  resultNote:
    'CCFOLIA 放進訊息框的只有骰子結果最後的「＞ …」部分（例如「🎲 ＞ 成功」），骰出的點數不在其中，CSS 沒辦法顯示。',
  resultChatWindow: [
    '想讓觀眾看到點數：台詞用訊息框，點數另外用',
    '的單則骰子顯示（見使用方式）。',
  ],
  chatWindowLink: '聊天視窗產生器',
  showResult: '顯示骰子結果',
  resultPos: '結果位置',
  resultPosOptions: { after: '接在名稱後', end: '標題列最右端' },
  resultPosPlate: '名牌模式時固定在名牌旁。',
  resultStyle: '結果樣式',
  resultStyleOptions: { text: '只有文字', outline: '細外框', band: '色帶' },
  resultStyleHint: '色帶的文字會依底色自動選深色或白色。',
  resultFont: '結果字型',
  resultSize: '結果大小',
  colorSuccess: '成功',
  colorFailure: '失敗',
  colorOther: '其他（不判定成敗）',
  outcomeHint:
    '結果含「成功」或「スペシャル」是成功，含「失敗」（含大失敗）是失敗；2D6 這類不判定成敗的擲骰算其他。',

  /* ---- 內文（F34～F40） ---- */
  textSection: '內文',
  textFont: '內文字型',
  textSize: '內文大小',
  textColor: '內文顏色',
  lineHeight: '行高',
  lineHeightHint: '以字級的倍數表示。',
  letterSpacing: '字距',
  letterSpacingHint: '以字級的倍數表示。',
  outline: '描邊',
  outlineOptions: { soft: '柔邊陰影', stroke: '描邊', glow: '發光', none: '無' },
  outlineHint: '也套用到方框內的名稱與骰子結果（名牌、色帶不套用）。',
  outlineColor: '描邊顏色',
  outlineWidth: '描邊粗細',
  localFontsWarning: (names: string[]) =>
    `用到電腦字型（${names.join('、')}）：跑 OBS 的電腦也必須安裝同一套字型，否則會換成一般字型。`,
  ccfoliaSection: 'CCFOLIA 決定的部分',
  ccfoliaNote: [
    '打字的速度（每字約 0.08 秒，句讀與換行後停約 0.8 秒）、打完到下一則的間隔（約 1.2 秒）、哪些發言會出現在訊息框，都是 CCFOLIA 決定的，CSS 改不了。',
    '只有主分頁與情報分頁的發言會出現；給別人的密語不會出現；秘密骰的內文會換成「シークレットダイス」。房間設定把訊息框隱藏（例如聊天輸入「hide mb」）時，OBS 裡也看不到。',
  ],

  /* ---- 立繪、骰子圖（F41～F50） ---- */
  portraitSection: '立繪',
  showPortrait: '顯示立繪',
  showPortraitHint:
    '沒有立繪的角色，或角色設定了「発言時キャラクターを表示しない」（發言時不顯示角色）時，CCFOLIA 本來就不放立繪。',
  portraitWidth: '立繪寬度',
  portraitWidthHint: '立繪以這個寬度等比縮放；來源寬度小於 900 時也維持這個寬度。',
  portraitMaxHeight: '立繪高度上限',
  portraitMaxHeightHint: '比這個高時再等比縮小，貼齊底邊與所在的那一側。',
  portraitSide: '立繪在哪一側',
  sideOptions: { left: '左', right: '右' },
  portraitOffset: '立繪距邊緣',
  portraitOffsetHint: '離方框左緣（在右側時是右緣）的距離；負值會伸出方框外。',
  portraitSink: '立繪下沉量',
  portraitSinkHint: '立繪底邊沉進方框的距離；0 時站在方框上緣，負值時浮在方框上方。',
  portraitFront: '立繪在方框前面',
  portraitFrontHint: '關閉時立繪在方框後面，沉進去的部分被方框蓋住。',
  portraitFlip: '立繪左右翻轉',
  diceSection: '骰子圖',
  showDice: '顯示骰子圖',
  showDiceHint:
    '擲骰時方框上方旋轉出現的骰子圖。只有房間設定開了「旧ダイス演出を利用する」（舊式骰子演出）時才有；秘密骰沒有。立繪在右側時骰子圖改到左側。',
  diceSize: '骰子圖大小',
  diceSizeHint: '每顆骰子圖的寬高；來源寬度小於 900 時也維持這個大小。',

  /* ---- 預覽與測試（F54～F64） ---- */
  previewLabel: 'OBS 預覽',
  previewNote:
    '模擬的 CCFOLIA 房間畫面套上目前的 CSS；預覽不能用滑鼠操作，請用下面的按鈕送出訊息。',
  testSection: '預覽訊息',
  sampleButtons: {
    chat: '聊天',
    success: '骰子成功',
    failure: '骰子失敗',
    other: '骰子無成敗',
    secret: '秘密骰',
    long: '長文',
  } as Record<SampleKind, string>,
  sampleButtonsLabel: '送出範例訊息',
  close: '關閉訊息框',
  restart: '重新開始預覽訊息',
  composerKinds: { chat: '聊天', dice: '骰子' },
  composerNoPortrait: '沒有立繪',
  composerPlaceholder: '內文；骰子時在「|」後面寫結果',
  composerExample: 'CC<=50 | (1D100<=50) ＞ 23 ＞ 成功',
  shape: '範例立繪',
  shapeOptions: { full: '全身直式', half: '半身方形' },
  customPortrait: '換成自己的立繪',
  customPortraitHint: '只用在預覽，不會寫進 CSS 或專案檔；圖片存在這個瀏覽器。',
  customPortraitDrop: '把圖片拖到這裡',
  customPortraitButton: '選擇圖片',
  clearPortrait: '清除自訂立繪',

  /* ---- 匯出（F65～F68） ---- */
  exportSection: '匯出',
  fileName: '檔名',
  fileNameHint: '儲存 CSS 與專案檔時的檔名；Windows 不能用的字元會換成底線。',

  /* ---- 狀態列（F74） ---- */
  ready: '就緒。調整左邊的設定，預覽會立即更新。',
  sent: (label: string) => `已送出「${label}」範例。`,
  sentCustom: '已送出自訂訊息。',
  queued: '前一則打完約 1.2 秒後才會換成這一則。',
  secretNote: '秘密骰在訊息框裡的內文會換成「シークレットダイス」，沒有骰子圖與結果。',
  diceNote: '訊息框只顯示結果最後的「＞ …」部分。',
  closed: '已關閉訊息框。下一則發言時會再滑出來（自己的 CCFOLIA 畫面上關掉，不影響 OBS 裡的）。',
  restarted: '已清掉排隊中的訊息，重新送出第一則範例。',
  copied: (w: number, h: number, hasUrl: boolean) =>
    `已複製 CSS，請貼到寬 ${w} × 高 ${h} 的瀏覽器來源的「自訂 CSS」欄（先清空原有的內容）。${
      hasUrl ? '' : '來源網址請用房間網址，不要加 /chat。'
    }`,
  copyFailed: '無法自動複製。已展開「查看 CSS」並選取全文，請按 Ctrl＋C（Mac：⌘＋C）手動複製。',
  saved: (name: string) => `已儲存「${name}」。`,
  projectSaved: (name: string) => `已存成專案檔「${name}」。`,
  projectOpened: (name: string) => `已開啟專案檔「${name}」。`,
  projectError: (msg: string) => `無法開啟專案檔：${msg}`,
  resetDone: '已全部重來，回到一開始的設定。',
  portraitSet: '已換成自己的立繪（只用在預覽）。',
  portraitNotSaved: '已換成自己的立繪，但圖片太大存不進這個瀏覽器，只在這次開頁有效。',
  portraitCleared: '已清除自訂立繪，回到範例立繪。',
  portraitError: (name: string) => `「${name}」不是可以讀取的圖片。`,
  undo: '復原',
  redo: '重做',

  /* ---- 專案 ---- */
  projectName: '訊息框',
  resetTitle: '全部重來？',
  resetDescription:
    '所有設定（含預覽設定）會回到一開始的樣子，復原紀錄也會清空，這個動作無法復原。自己的範例立繪不受影響。',
  resetConfirm: '全部重來',
  resetMenu: '全部重來…',

  /* ---- 說明（F82、F83、F88） ---- */
  usageTitle: '使用方式',
  obsUrlLabel: '房間網址（不加 /chat）',
  disclaimer: '本工具與 CCFOLIA 官方無關；CCFOLIA 改版時可能需要重新產生 CSS。',
} as const;
