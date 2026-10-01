/**
 * CCFOLIA 頁面與 Discord Streamkit 語音疊加層的 DOM 事實：產生自訂 CSS 時能用來選取元素的 class、屬性與階層。
 *
 * - 除了這裡列出的 MUI class、role／aria 屬性、`variant` 屬性之外，CCFOLIA 的元素只有 emotion 自動產生的
 *   雜湊 class（`css-` 開頭、會隨改版變），**不可用來選取**（擲骰結果配色例外，見 dice.ts）。
 * - Streamkit 的 class 是 CSS Modules 的「`Voice_` 名稱 `__` 雜湊」，只能以前綴比對。
 * - 依據：docs/refactor/specs/status-bar.md 3.1、message-box.md 3.1、chat-window.md 3.1、obs-tachie.md 3.1。
 *   這些規格撰寫時無法登入 CCFOLIA 直接核對；改版跑版時，先改這個檔案與 mock/ 的模擬頁。
 *
 * 選擇器都是完整的字串，可以直接接在一起：`${CHAT.listItem} ${CHAT.avatarColumn}`。
 */

/* ---------- 角色狀態頁（/rooms/{房間ID}/characters/{角色ID}） ---------- */

/** 狀態列最多幾條 */
export const MAX_STATUS_BARS = 8;

/** 條中的部位（相對於一條 `div[variant="bar"] > div`） */
export type BarPart = 'text' | 'label' | 'value' | 'current' | 'track' | 'trough' | 'fill';

const BAR_PARTS: Record<BarPart, string> = {
  text: '> div:first-child',
  label: '> div:first-child > p:first-child',
  value: '> div:first-child > p:nth-child(2)',
  current: '> div:first-child > p:nth-child(2) > span',
  track: '> div:nth-child(2)',
  trough: '> div:nth-child(2) > div:first-child',
  fill: '> div:nth-child(2) > div:nth-child(2)',
};

/**
 * 角色狀態頁（觀察日期 2026-09-14）：
 * ```
 * html > body > #root
 *   └ div（四周內距 8 px）
 *       └ div（一個角色，橫向排列，下外距 16 px）
 *           ├ span.MuiBadge-root（頭像＋先攻徽章）
 *           │   ├ div.MuiAvatar-root（外框）> div > div.MuiAvatar-root.MuiAvatar-square > img.MuiAvatar-img
 *           │   └ span.MuiBadge-badge（先攻；為 0 時多 MuiBadge-invisible）
 *           └ div（.MuiBadge-root 的下一個兄弟）
 *               └ div[variant="bar"]
 *                   └ div × 狀態數（一條）
 *                       ├ div（文字層）> p（名稱）、p（數值：span 目前值、文字「/」、文字 最大值）
 *                       └ div（條本體）> div（底槽）、div（填充，style="width: 83.3333%;"）
 * 另有 .MuiSnackbar-root（通知列）。
 * ```
 */
export const CHARACTER_PAGE = Object.freeze({
  observed: '2026-09-14',
  root: '#root',
  /** #root 底下的第一個 div（四周內距 8 px）。用 :first-child 避開同在 #root 下的通知列 */
  wrapper: '#root > div:first-child',
  /** 一個角色的列（橫向排列：頭像＋狀態欄） */
  row: '#root > div:first-child > div',
  badgeRoot: '.MuiBadge-root',
  /** 外層頭像框（MuiAvatar-circular、MuiAvatar-colorDefault） */
  avatar: '.MuiBadge-root > .MuiAvatar-root',
  /** 外層框與內層方形框之間、沒有 class 名可用的 div */
  avatarMiddle: '.MuiBadge-root > .MuiAvatar-root > div',
  avatarInner: '.MuiBadge-root .MuiAvatar-square',
  avatarImg: '.MuiBadge-root img.MuiAvatar-img',
  badge: '.MuiBadge-root > .MuiBadge-badge',
  badgeInvisibleClass: 'MuiBadge-invisible',
  /** 頭像右邊的欄（.MuiBadge-root 的下一個兄弟） */
  column: '.MuiBadge-root + div',
  /** 所有狀態列的容器（屬性 variant 的值固定是 bar） */
  bars: 'div[variant="bar"]',
  /** 一條（所有條） */
  bar: 'div[variant="bar"] > div',
  snackbar: '.MuiSnackbar-root',
  /** 目前值 span 的 color 屬性：目前值 ÷ 最大值 ≤ 0.8 時 secondary（紅字），否則 default */
  currentColorAttr: 'color',
  redAttrValue: 'secondary',
  normalAttrValue: 'default',
  /** 紅字的判斷門檻（≤） */
  redThreshold: 0.8,
});

/** 第 n 條（1 起算）；不給 n 時是所有條 */
export function barSelector(n?: number): string {
  return n ? `${CHARACTER_PAGE.bar}:nth-child(${n})` : CHARACTER_PAGE.bar;
}

/** 條中的部位：barPartSelector('fill', 2) → 第 2 條的填充 */
export function barPartSelector(part: BarPart, n?: number): string {
  return `${barSelector(n)} ${BAR_PARTS[part]}`;
}

/** 第 n 條之後的所有條（隱藏多餘的條用）：barsAfter(3) → 第 4 條起 */
export function barsAfterSelector(n: number): string {
  return `${CHARACTER_PAGE.bar}:nth-child(n + ${n + 1})`;
}

/* ---------- 房間畫面的訊息框（/rooms/{房間ID}） ---------- */

const MB_ROOT = '.MuiPaper-root[role="status"][aria-label="メッセージ"]';
const MB_BOX = `${MB_ROOT} > .MuiPaper-root`;
const MB_TOOLBAR = `${MB_BOX} > .MuiToolbar-root`;

/**
 * 房間畫面下方、發言時出現的訊息框（觀察日期 2026-09-25，CCFOLIA 1.37.4）：
 * ```
 * div.MuiPaper-root（role="status"、aria-live="polite"、aria-atomic="true"、aria-label="メッセージ"）
 *   ├ img（立繪；有立繪時才存在，是第一個子元素）
 *   └ div.MuiPaper-root（方框）
 *       ├ div（第一個子元素：骰子圖容器 > img × 骰子數）
 *       ├ div.MuiToolbar-root.MuiToolbar-gutters.MuiToolbar-dense（標題列）
 *       │   ├ h6.MuiTypography-subtitle2（名稱）
 *       │   ├ p.MuiTypography-body2.<結果配色 class>（擲骰時才有：「🎲 」＋最後一段）
 *       │   ├ div（撐開空間）
 *       │   ├ button.MuiIconButton-root[aria-label="スキップ"]
 *       │   └ button.MuiIconButton-root[aria-label="閉じる"]
 *       └ div（最後一個子元素：內文區）> p.MuiTypography-body1（內文，逐字打出）
 * ```
 * 關閉後 CCFOLIA 在根元素的 style 屬性寫入 `visibility: hidden`；滑入滑出也寫在 style 屬性的 transform。
 */
export const MESSAGE_BOX = Object.freeze({
  observed: '2026-09-25',
  ccfoliaVersion: '1.37.4',
  root: MB_ROOT,
  rootAttributes: Object.freeze({
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'true',
    'aria-label': 'メッセージ',
  }),
  portrait: `${MB_ROOT} > img`,
  box: MB_BOX,
  dice: `${MB_BOX} > div:first-child`,
  diceImg: `${MB_BOX} > div:first-child > img`,
  toolbar: MB_TOOLBAR,
  name: `${MB_TOOLBAR} > h6`,
  result: `${MB_TOOLBAR} > p`,
  spacer: `${MB_TOOLBAR} > div`,
  buttons: `${MB_TOOLBAR} > button`,
  skipButton: `${MB_TOOLBAR} > button[aria-label="スキップ"]`,
  closeButton: `${MB_TOOLBAR} > button[aria-label="閉じる"]`,
  body: `${MB_BOX} > div:last-child`,
  text: `${MB_BOX} > div:last-child > p`,
  /** 關閉後根元素的 style 屬性含這段 */
  hiddenStyle: 'visibility: hidden',
  /** 關閉狀態（選取用） */
  closedRoot: `${MB_ROOT}[style*="visibility: hidden"]`,
  skipLabel: 'スキップ',
  closeLabel: '閉じる',
});

/** 窄視窗時 CCFOLIA 會縮小立繪與骰子圖（視窗寬 < 900／< 600 px） */
export const MESSAGE_BOX_BREAKPOINTS = Object.freeze({ narrow: 900, small: 600 });

/** CCFOLIA 決定的節奏（CSS 改不了；預覽照這個模擬） */
export const MESSAGE_BOX_TIMING = Object.freeze({
  /** 每字約 80 ms */
  charMs: 80,
  /** 剛打出這些字或換行後停約 800 ms */
  pauseMs: 800,
  pauseAfter: Object.freeze(['。', '、', ',', '.', '\n']),
  /** 打完約 1.2 秒後換下一則；最後一則一直留著 */
  nextMs: 1200,
  /** 由下往上滑入，約 225 ms、減速 */
  slideInMs: 225,
  slideInEasing: 'cubic-bezier(0, 0, 0.2, 1)',
  /** 往下滑出，約 195 ms、加速；結束後寫入 visibility: hidden */
  slideOutMs: 195,
  slideOutEasing: 'cubic-bezier(0.4, 0, 1, 1)',
  /** 骰子圖：依序間隔 0.1 秒，各約 0.6 秒、回彈地轉兩圈出現 */
  diceStaggerMs: 100,
  diceMs: 600,
});

/* ---------- 聊天另開視窗（/rooms/{房間ID}/chat） ---------- */

const CH_PAPER = '.MuiDrawer-paper';
const CH_HEADER = `${CH_PAPER} > header.MuiAppBar-root`;
const CH_LOG = 'ul.MuiList-root[role="log"]';
const CH_ITEM = `${CH_LOG} div[data-index]`;

/**
 * 聊天另開視窗（觀察日期 2026-09，MUI v5）：
 * ```
 * #root > div（外圍 8px 內距）> div.MuiDrawer-root（docked）
 *   └ div.MuiPaper-root.MuiDrawer-paper（固定定位、縱向 flex、可捲動）
 *     ├ header.MuiAppBar-root
 *     │ ├ div.MuiToolbar-root（第 1 個）：button（關閉）、div、h6.MuiTypography-subtitle2「ルームチャット」、div、button（選單）
 *     │ └ div.MuiToolbar-root.MuiToolbar-dense（第 2 個；只在有參加者的秘匿分頁）> div.MuiAvatarGroup-root[role="group"] > div.MuiAvatar-root × 人數
 *     ├ ul.MuiList-root[role="log"]
 *     │ └ div（虛擬捲動的外層：高度＝已量測高度總和）> div（絕對定位＋位移）> div[data-index] × n
 *     │     ├ div.MuiListItem-root
 *     │     │ ├ div.MuiListItemAvatar-root > div（40×40）> div.MuiAvatar-root.MuiAvatar-square > img（系統訊息：只有空 div）
 *     │     │ ├ div.MuiListItemText-root
 *     │     │ │ ├ span.MuiListItemText-primary（style color＝角色顏色）：名稱＋span.MuiTypography-caption「 - 今日 21:04」
 *     │     │ │ └ p.MuiListItemText-secondary：內文＋（擲骰）span.MuiTypography-body2.<結果 class>＋（編輯過）span.MuiTypography-caption「[編集済]」
 *     │     │ └ div（自己的訊息才有：編輯按鈕）
 *     │     └ hr.MuiDivider-root
 *     └ div.MuiPaper-root（輸入區）> form > header.MuiAppBar-root > div.MuiToolbar-root > div.MuiTabs-root（分頁列）…
 * ```
 * - 被選的分頁看 `.Mui-selected`；主分頁 role="tab"，其他分頁 role="button"（**不能用 role="tab" 找分頁**）。
 * - 系統訊息靠「頭像欄裡的 div 是空的」辨認（需要 :has()，OBS 31 以上）。
 * - 清單高度為 0 時不算繪任何訊息，清單至少要保留 1px 高。
 */
export const CHAT = Object.freeze({
  observed: '2026-09',
  root: '#root',
  wrapper: '#root > div:first-child',
  drawer: '.MuiDrawer-root',
  paper: CH_PAPER,
  header: CH_HEADER,
  /** 標頭第 1 個 toolbar（「ルームチャット」那列）。參加者列也是 .MuiToolbar-root，要用 :first-child 排除 */
  titleToolbar: `${CH_HEADER} > .MuiToolbar-root:first-child`,
  titleText: `${CH_HEADER} > .MuiToolbar-root:first-child > h6`,
  titleButtons: `${CH_HEADER} > .MuiToolbar-root:first-child > button`,
  /** 標頭第 2 個 toolbar：秘匿分頁的參加者頭像列（直接放在 header 下，沒有包裝） */
  participantsToolbar: `${CH_HEADER} > .MuiToolbar-root:nth-child(2)`,
  avatarGroup: `${CH_HEADER} .MuiAvatarGroup-root`,
  participantAvatar: `${CH_HEADER} .MuiAvatarGroup-root > .MuiAvatar-root`,
  log: CH_LOG,
  /** 虛擬捲動的外層（清單的最後一個 div 子元素；行內樣式寫高度） */
  virtualOuter: `${CH_LOG} > div:last-child`,
  virtualInner: `${CH_LOG} > div:last-child > div`,
  /** 一則訊息 */
  item: CH_ITEM,
  listItem: `${CH_ITEM} > .MuiListItem-root`,
  avatarColumn: '.MuiListItemAvatar-root',
  avatarImg: '.MuiListItemAvatar-root img.MuiAvatar-img',
  textColumn: '.MuiListItemText-root',
  name: '.MuiListItemText-primary',
  time: '.MuiListItemText-primary > .MuiTypography-caption',
  body: '.MuiListItemText-secondary',
  /** 擲骰結果 span（內文 p 裡的 body2；他人的秘密擲骰沒有） */
  result: '.MuiListItemText-secondary > .MuiTypography-body2',
  edited: '.MuiListItemText-secondary > .MuiTypography-caption',
  /** 自己的訊息上的編輯按鈕（文字欄的下一個兄弟） */
  editButton: '.MuiListItemText-root + div',
  divider: 'hr.MuiDivider-root',
  inputPaper: `${CH_PAPER} > .MuiPaper-root`,
  form: `${CH_PAPER} > .MuiPaper-root > form`,
  tabsHeader: `${CH_PAPER} > .MuiPaper-root > form > header.MuiAppBar-root`,
  tabs: '.MuiTabs-root',
  tabsScroller: '.MuiTabs-scroller',
  tabList: '.MuiTabs-flexContainer',
  tab: 'button.MuiTab-root',
  selectedTab: 'button.MuiTab-root.Mui-selected',
  tabIndicator: '.MuiTabs-indicator',
  /** 秘匿分頁名稱前的鎖頭與名稱一起包在這裡 */
  tabLockBox: '.MuiBox-root',
  snackbar: '.MuiSnackbar-root',
  /** 標頭原本的標題、主分頁名稱、BCDice 那一行 */
  titleLabel: 'ルームチャット',
  mainTabName: 'メイン',
  dicebotLine: 'Dicebot engine : BCDice',
  /** 虛擬捲動在可見範圍前後預先算繪的則數（約） */
  overscan: 50,
});

/* ---------- Discord Streamkit 語音疊加層 ---------- */

/** Streamkit 的 class 前綴（後面接雜湊，會隨 Streamkit 更新而變；觀察日期 2026-09） */
export const STREAMKIT_CLASS = Object.freeze({
  container: 'Voice_voiceContainer__',
  states: 'Voice_voiceStates__',
  state: 'Voice_voiceState__',
  avatar: 'Voice_avatar__',
  speaking: 'Voice_avatarSpeaking__',
  user: 'Voice_user__',
  name: 'Voice_name__',
});

export type StreamkitPart = keyof typeof STREAMKIT_CLASS;

/** 以 class 前綴比對的選擇器：streamkitSelector('avatar') → '[class*="Voice_avatar__"]' */
export function streamkitSelector(part: StreamkitPart): string {
  return `[class*="${STREAMKIT_CLASS[part]}"]`;
}

/**
 * 語音疊加層：
 * ```
 * #root > div[class*=Voice_voiceContainer__] > ul[class*=Voice_voiceStates__]
 *   └ li[class*=Voice_voiceState__] × 頻道裡的每個人
 *     ├ img[class*=Voice_avatar__]（說話時同一個 img 再加 Voice_avatarSpeaking__；src 含 avatars/{使用者ID}/）
 *     └ div[class*=Voice_user__] > span[class*=Voice_name__]
 * ```
 * 在頻道裡＝DOM 裡有他的 img（離開就移除）；img 被 CSS 隱藏後仍可用「頁面裡有沒有這個 img」判斷。
 * 沒有自訂頭像的人用預設頭像（embed/avatars/0～5.png），網址不含 ID，無法辨認。
 */
export const STREAMKIT = Object.freeze({
  observed: '2026-09',
  root: '#root',
  container: `div${streamkitSelector('container')}`,
  states: `ul${streamkitSelector('states')}`,
  state: `li${streamkitSelector('state')}`,
  avatar: `img${streamkitSelector('avatar')}`,
  speaking: `img${streamkitSelector('speaking')}`,
  user: `div${streamkitSelector('user')}`,
  name: `span${streamkitSelector('name')}`,
});

/** 這個使用者的頭像 img（以頭像網址裡的「/avatars/{ID}/」辨認） */
export function streamkitUserAvatar(userId: string): string {
  const id = String(userId).replace(/\D+/g, '');
  return `img${streamkitSelector('avatar')}[src*="/avatars/${id}/"]`;
}

/** 這個使用者正在說話時的頭像 img */
export function streamkitUserSpeaking(userId: string): string {
  return `${streamkitUserAvatar(userId)}${streamkitSelector('speaking')}`;
}

/* ---------- OBS 瀏覽器來源 ---------- */

/**
 * OBS 瀏覽器來源的事實：
 * - `:has()`、「從後面數第 n 個符合條件者」、容器查詢單位要 OBS 31 以上（內建 Chromium 127）；
 *   OBS 30 是 Chromium 103，會略過含這些語法的規則（只有那條規則失效）。
 * - 自訂 CSS 欄預設已有一段讓背景透明的 CSS，要整段清空再貼上。
 * - CCFOLIA 的樣式在自訂 CSS 之後才插入頁面，權重相同時會蓋掉自訂 CSS。
 */
export const OBS = Object.freeze({
  /** 需要 :has() 的演出要這個版本以上 */
  minVersionForHas: 31,
  chromium: 127,
  oldChromium: 103,
});
