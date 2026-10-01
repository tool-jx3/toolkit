/**
 * 聊天視窗產生器：設定 → OBS 瀏覽器來源的自訂 CSS（套在 CCFOLIA「聊天另開視窗」頁面）。
 *
 * 依規格 3.4 描述的「套用後看得到的效果」自己設計的寫法；選擇器一律從 @/ccfolia 的 CHAT 取。
 * 重點：
 * - 只留最新 N 則＝把較舊的訊息 display: none（虛擬捲動會量到 0，可見範圍一路延伸到最新）；清單至少 1px 高。
 * - 只列擲骰／隱藏系統訊息用「:nth-last-child(-n + N of …)」＋ :has()（OBS 31）；舊 OBS 退回「最新 N 則」。
 * - 清單用 overflow: clip（不保留捲動位置），以 flex 的對齊決定超出時切掉哪一側。
 * - 會被動畫改的屬性（opacity、transform、filter、max-height、margin）不寫 !important。
 * - 角色色只存在名稱 span 的行內 color：線條、底線、膠囊都用 currentColor 畫在名稱 span（或其偽元素）上，
 *   文字色另外用 -webkit-text-fill-color 改。
 */
import {
  CHAT,
  chatUrlFrom,
  DICE_OUTCOMES,
  DICE_RESULT_CLASS,
  type DiceOutcome,
  exampleChatUrl,
} from '@/ccfolia';
import {
  type CssDecls,
  type CssSheet,
  cornerBrackets,
  createCssSheet,
  cssFontWeight,
  cssString,
  fontStack,
  googleFontUrls,
  localFontNames,
  num,
  px,
  rgba,
  singleLine,
  textOutline,
  texture,
  textureDecls,
  yiqTextColor,
} from '@/core/css';
import type { FontValue } from '@/core/fonts';
import {
  type ChatSettings,
  namePrefixActive,
  scrollActive,
  titleHasTab,
  usedFonts,
} from './settings';

/* ---------- 選擇器 ---------- */

const ITEM = CHAT.item;
/** 一則訊息（item 選擇器，可以帶 :has() 條件）裡的方框、文字欄、名稱 */
const liOf = (item: string) => `${item} > .MuiListItem-root`;
const txtOf = (item: string) => `${liOf(item)} > ${CHAT.textColumn}`;
const nameOf = (item: string) => `${txtOf(item)} > ${CHAT.name}`;
/** 有某種擲骰結果的訊息（OBS 31） */
const itemWith = (o: DiceOutcome) => `${ITEM}:has(${CHAT.result}.${DICE_RESULT_CLASS[o]})`;
const LI = liOf(ITEM);
const AV = `${LI} > ${CHAT.avatarColumn}`;
const TXT = txtOf(ITEM);
const NAME = nameOf(ITEM);
const TIME = `${NAME} > .MuiTypography-caption`;
const BODY = `${TXT} > ${CHAT.body}`;
const RES = `${TXT} > ${CHAT.result}`;
const HR = `${ITEM} > ${CHAT.divider}`;
/** 輸入區（div 的 MuiPaper；標頭 header 也是 MuiPaper，要排除） */
const INPUT = CHAT.inputPaper;
const TABS_ROW = CHAT.tabsHeader;
/** 一則訊息裡有擲骰結果（相對於一則訊息） */
const HAS_RESULT = `:has(${CHAT.result})`;
/** 系統訊息：頭像欄裡是空的 div */
const IS_SYSTEM = `:has(${CHAT.avatarColumn} > div:empty)`;
/** OBS 31（Chromium 127）才有的選擇器能力；舊 OBS 走 @supports not 的退路 */
const ADVANCED = '(selector(:has(a)) and selector(:nth-child(1 of a)))';

export const KEYFRAMES = {
  enter: 'tk-chat-in',
  fade: 'tk-chat-out',
  scroll: 'tk-chat-scroll',
  flash: 'tk-chat-flash',
} as const;

/* ---------- 小工具 ---------- */

const fontDecls = (font: FontValue, size: number): CssDecls => ({
  'font-family': fontStack(font),
  'font-weight': cssFontWeight(font),
  'font-size': px(size),
});

const justify = (a: ChatSettings['titleAlign']) =>
  a === 'center' ? 'center' : a === 'right' ? 'flex-end' : 'flex-start';

/** 文字效果（內文、名稱、擲骰結果共用） */
export function effectShadow(s: ChatSettings): string {
  return textOutline(s.effect, s.effectColor, { width: s.effectWidth });
}

/** 方框陰影（每則一框／泡泡）：黑色、往下 2px、模糊 10px */
const boxShadowOf = (s: ChatSettings) =>
  s.boxShadow > 0 ? `0 2px 10px ${rgba('#000000', s.boxShadow / 100)}` : '';

const outcomeColor = (s: ChatSettings, o: DiceOutcome) =>
  o === 'success' ? s.successColor : o === 'failure' ? s.failureColor : s.otherColor;

/** 對話泡泡尾巴的上緣位置：min(14, 頭像 ÷ 2 − 7)，6 以下時 8 */
export function bubbleTailTop(avatarSize: number): number {
  const t = Math.min(14, avatarSize / 2 - 7);
  return t <= 6 ? 8 : t;
}

/** 圓角方形頭像的圓角：大小 × 0.18 四捨五入 */
export const roundedAvatarRadius = (size: number): number => Math.round(size * 0.18);

/** 標題文字：換行換成空白（單行），前後的空白保留（例如「文字＋分頁名稱」時當作間隔） */
export const titleLine = (text: string): string =>
  String(text ?? '').replace(/\r\n|[\r\n\t\u2028\u2029]/g, ' ');

/** 角括號的粗細：max(2, 視窗外框粗細＋1) */
export const bracketThickness = (borderWidth: number): number => Math.max(2, borderWidth + 1);

/** 分隔線與內容的距離：max(2, 上下留白 ÷ 2) */
export const dividerOffset = (padY: number): number => Math.max(2, padY / 2);

/** 需要 OBS 31 以上的功能（寫進開頭說明） */
export function obsFeatures(s: ChatSettings): string[] {
  const f: string[] = [];
  if (s.diceOnly) f.push('只列出擲骰訊息');
  else if (s.hideSystem) f.push('隱藏系統訊息');
  if (s.accent === 'outcome') f.push('依擲骰成敗上色的左側線條');
  if (s.outcomeGlow && s.boxShape !== 'none') f.push('成敗時外框發光');
  return f;
}

/** 只顯示的訊息的篩選條件（null＝所有訊息） */
function messageFilter(s: ChatSettings): string | null {
  if (s.diceOnly) return HAS_RESULT;
  if (s.hideSystem) return `:not(${IS_SYSTEM})`;
  return null;
}

export interface BuildOptions {
  /** 最後套用的範本名稱（寫進開頭說明） */
  templateName?: string | null;
}

/* ---------- 主函式 ---------- */

export function buildChatCss(s: ChatSettings, options: BuildOptions = {}): string {
  const css = createCssSheet();
  const scroll = scrollActive(s);
  const fill = s.sizeMode === 'fill' || scroll;
  const top = s.anchor === 'top';
  const newestTop = s.order === 'newest-top';
  const prefixName = namePrefixActive(s);
  const fonts = usedFonts(s);
  const features = obsFeatures(s);

  /* ---- 開頭說明與字型 ---- */
  css.header({
    title: '聊天視窗（OBS 瀏覽器來源的自訂 CSS）',
    toolName: '聊天視窗產生器',
    template: options.templateName ?? null,
    url: chatUrlFrom(s.room),
    exampleUrl: exampleChatUrl('<房間ID>'),
    urlNote: '一定要是 /chat 結尾的聊天頁；填房間網址會拍到整個房間',
    size: { width: s.width, height: s.height },
    obs: features.length ? { version: 31, features } : null,
    localFonts: localFontNames(fonts),
    notes: [
      s.hoverTabs
        ? '要顯示其他分頁：在 OBS 的來源上按右鍵選「互動」，把滑鼠移到畫面上，從出現的分頁列點選。CCFOLIA 不會記住這個選擇，重新開啟後要再選一次。'
        : '分頁列不會出現：只會顯示 CCFOLIA 目前開著的分頁（重新載入後是主分頁「メイン」）。',
      scroll ? '長訊息慢慢捲動需要 OBS 31 以上（較舊的 OBS 會停在訊息開頭不動）。' : null,
    ],
  });
  for (const u of googleFontUrls(fonts)) css.import(u);

  page(css, s);
  windowBox(css, s, { fill, top });
  header(css, s);
  tabTitle(css, s);
  messageList(css, s, { fill, top, newestTop, scroll });
  messageBox(css, s, { scroll });
  avatar(css, s, { scroll });
  nameRules(css, s, prefixName);
  bodyRules(css, s, prefixName);
  resultRules(css, s);
  divider(css, s, newestTop);
  motion(css, s, { scroll, newestTop });
  return css.toString();
}

/* ---------- 頁面整體 ---------- */

function page(css: CssSheet, s: ChatSettings) {
  css.rule('html, body', { background: 'transparent', overflow: 'hidden', margin: 0 });
  css.rule(CHAT.root, { background: 'transparent' });
  css.rule(CHAT.wrapper, { padding: 0, margin: 0 });
  css.rule(CHAT.snackbar, { display: 'none' });
  /* 編輯按鈕、「[編集済]」、讀取中的提示 */
  css.rule([`${LI} > ${CHAT.editButton}`, `${TXT} > ${CHAT.edited}`, `${CHAT.log} > span`], {
    display: 'none',
  });
  /* 輸入區裡只留分頁列（角色選擇、輸入框、BCDice 那行一律不顯示） */
  css.rule(`${CHAT.form} > :not(header)`, { display: 'none' });
  if (!titleHasTab(s.titleMode)) css.rule(INPUT, { display: 'none' });
  if (s.hoverTabs) {
    /* 滑鼠在頁面上（只會發生在 OBS 的「互動」視窗）：分頁列出現在來源最上方 */
    css.rule(`html:hover ${INPUT}`, {
      display: 'block',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      'z-index': 1300,
      order: 0,
      margin: 0,
      padding: 0,
      background: '#212121',
      'box-shadow': `0 2px 8px ${rgba('#000000', 0.55)}`,
      'border-radius': 0,
      color: '#ffffff',
    });
  }
}

/* ---------- 視窗 ---------- */

function windowBox(css: CssSheet, s: ChatSettings, { fill, top }: { fill: boolean; top: boolean }) {
  const m = s.margin;
  const tex = s.texture === 'paper' || s.texture === 'grain' ? texture(s.texture) : null;
  const shadow = s.shadow > 0 ? `0 4px 18px ${rgba('#000000', s.shadow / 100)}` : 'none';
  css.rule(CHAT.paper, {
    position: 'fixed',
    left: px(m),
    right: px(m),
    top: fill || top ? px(m) : 'auto',
    bottom: fill || !top ? px(m) : 'auto',
    width: 'auto',
    height: 'auto',
    'max-height': fill ? 'none' : `calc(100% - ${px(2 * m)})`,
    'min-height': 0,
    display: 'flex',
    'flex-direction': 'column',
    overflow: 'hidden',
    padding: px(s.padding),
    'box-sizing': 'border-box',
    'background-color': rgba(s.bg),
    'background-image': tex ? tex.backgroundImage : 'none',
    ...(tex
      ? {
          'background-size': tex.backgroundSize,
          'background-repeat': tex.backgroundRepeat,
          'background-position': tex.backgroundPosition,
        }
      : {}),
    border: s.borderWidth > 0 ? `${px(s.borderWidth)} solid ${rgba(s.borderColor)}` : 'none',
    'border-radius': px(s.radius),
    'box-shadow': shadow,
    color: rgba(s.bodyColor),
    outline: 0,
  });
  if (s.texture === 'scanlines') {
    const lines = texture('scanlines');
    css.rule(`${CHAT.paper}::before`, {
      content: '""',
      position: 'absolute',
      inset: 0,
      'z-index': 5,
      'pointer-events': 'none',
      ...textureDecls(lines),
    });
  }
  if (s.brackets) {
    css.rule(`${CHAT.paper}::after`, {
      content: '""',
      position: 'absolute',
      inset: 0,
      'z-index': 6,
      'pointer-events': 'none',
      background: cornerBrackets({
        length: 18,
        thickness: bracketThickness(s.borderWidth),
        color: rgba(s.bracketColor),
      }),
    });
  }
}

/* ---------- 標頭：自訂文字的標題、參加者頭像 ---------- */

/** 標題列（自訂文字或分頁名稱）共用的外觀：對齊、底色帶、下底線、延伸線 */
function titleRowDecls(s: ChatSettings): CssDecls {
  const P = s.padding;
  const base: CssDecls = {
    display: 'flex',
    'flex-direction': 'row',
    'flex-wrap': 'nowrap',
    'align-items': 'center',
    'justify-content': s.titleStyle === 'lines' ? 'center' : justify(s.titleAlign),
    'min-height': 0,
    padding: 0,
    'font-size': px(s.titleSize),
    color: rgba(s.titleColor),
    background: 'none',
    'box-shadow': 'none',
    position: 'relative',
    width: 'auto',
  };
  switch (s.titleStyle) {
    case 'band':
      return {
        ...base,
        margin: `${px(-P)} ${px(-P)} 0`,
        padding: `0.45em ${px(P)}`,
        background: rgba(s.titleBandColor),
      };
    case 'underline':
      return {
        ...base,
        margin: 0,
        'padding-bottom': '0.3em',
        'border-bottom': `2px solid ${rgba(s.titleLineColor)}`,
      };
    default:
      return { ...base, margin: 0 };
  }
}

/** 標題文字本身（文字框）：字型、單行截斷、頁籤狀 */
function titleTextDecls(s: ChatSettings): CssDecls {
  const d: CssDecls = {
    ...fontDecls(s.titleFont, s.titleSize),
    'line-height': 1.3,
    'letter-spacing': '0.06em',
    'white-space': 'nowrap',
    overflow: 'hidden',
    'text-overflow': 'ellipsis',
    'text-transform': 'none',
    color: rgba(s.titleColor),
    '-webkit-text-fill-color': rgba(s.titleColor),
    'text-shadow': 'none',
  };
  if (s.titleStyle === 'tab') {
    const fg = yiqTextColor(s.titleLineColor);
    return {
      ...d,
      color: fg,
      '-webkit-text-fill-color': fg,
      background: rgba(s.titleLineColor),
      padding: '0.22em 0.9em',
      'border-radius': '0.4em 0.4em 0 0',
    };
  }
  return d;
}

/** 左右延伸線（標題列的 ::before／::after） */
function titleLines(css: CssSheet, row: string, s: ChatSettings) {
  if (s.titleStyle !== 'lines') return;
  css.rule([`${row}::before`, `${row}::after`], {
    content: '""',
    display: 'block',
    flex: '1 1 0',
    'min-width': '0.6em',
    height: '1px',
    background: rgba(s.titleLineColor),
  });
}

function header(css: CssSheet, s: ChatSettings) {
  const textTitle = s.titleMode === 'text';
  if (!textTitle && !s.participants) {
    css.rule(CHAT.header, { display: 'none' });
    return;
  }
  const G = s.titleGap;
  css.rule(CHAT.header, {
    position: 'static',
    display: 'flex',
    'flex-direction': 'column',
    'align-items': 'stretch',
    'flex-shrink': 0,
    width: 'auto',
    'min-height': 0,
    margin: 0,
    padding: 0,
    background: 'none',
    'box-shadow': 'none',
    color: 'inherit',
    'z-index': 'auto',
  });

  /* 自訂文字：CCFOLIA 的標頭列（「ルームチャット」與兩個按鈕）換成使用者的文字 */
  if (textTitle) {
    const row = CHAT.titleToolbar;
    const rowDecls = titleRowDecls(s);
    css.rule(row, {
      ...rowDecls,
      'margin-bottom': px(G),
    });
    css.rule([`${row} > button`, `${row} > div`], { display: 'none' });
    titleLines(css, row, s);
    const lineGap = s.titleStyle === 'lines' ? px(0.6 * s.titleSize) : 0;
    css.rule(CHAT.titleText, {
      flex: '0 1 auto',
      'min-width': 0,
      'max-width': '100%',
      margin: `0 ${lineGap}`,
      'font-size': 0,
      'line-height': 0,
      overflow: 'hidden',
    });
    css.rule(`${CHAT.titleText}::before`, {
      content: cssString(titleLine(s.titleText)),
      display: 'block',
      ...titleTextDecls(s),
    });
  } else {
    css.rule(CHAT.titleToolbar, { display: 'none' });
  }

  /* 秘匿分頁的參加者頭像列（只有設定了參加者的秘匿分頁才有這一列） */
  const pt = CHAT.participantsToolbar;
  if (!s.participants) {
    css.rule(pt, { display: 'none' });
    return;
  }
  const afterTitle = s.titleMode !== 'none';
  css.rule(pt, {
    display: 'flex',
    'align-items': 'center',
    'justify-content': justify(s.titleAlign),
    'flex-wrap': 'nowrap',
    'min-height': 0,
    padding: 0,
    margin: afterTitle ? `${px(6 - G)} 0 ${px(G)}` : `0 0 ${px(G)}`,
    background: 'none',
    position: 'static',
    overflow: 'hidden',
  });
  const prefix = singleLine(s.participantPrefix);
  if (prefix) {
    css.rule(`${pt}::before`, {
      content: cssString(prefix),
      flex: '0 1 auto',
      'min-width': 0,
      'margin-right': '0.5em',
      ...fontDecls(s.titleFont, s.participantPrefixSize),
      'line-height': 1.2,
      'letter-spacing': '0.06em',
      'white-space': 'nowrap',
      overflow: 'hidden',
      'text-overflow': 'ellipsis',
      color: rgba(s.titleColor),
    });
  }
  css.rule(CHAT.avatarGroup, {
    display: 'flex',
    'flex-direction': 'row-reverse',
    'flex-shrink': 0,
  });
  const S = s.participantSize;
  css.rule(CHAT.participantAvatar, {
    width: px(S),
    height: px(S),
    'box-sizing': 'content-box',
    'border-radius': '50%',
    border:
      s.participantRing > 0
        ? `${px(s.participantRing)} solid ${rgba(s.participantRingColor)}`
        : 'none',
    margin: `0 0 0 ${px(s.participantGap)}`,
    'background-color': '#5a5a5a',
    color: '#ffffff',
    'font-size': px(Math.max(8, Math.round(S * 0.45))),
    'flex-shrink': 0,
  });
  css.rule(`${CHAT.participantAvatar}:last-child`, { 'margin-left': 0 });
  css.rule(`${CHAT.participantAvatar} > img`, {
    width: '100%',
    height: '100%',
    'object-fit': 'cover',
  });
}

/* ---------- 標題含分頁名稱：輸入區的分頁列改造成只剩被選的那個分頁 ---------- */

function tabTitle(css: CssSheet, s: ChatSettings) {
  if (!titleHasTab(s.titleMode)) return;
  /* F86 開啟時，滑鼠在頁面上的期間恢復成一般的分頁列 */
  const q = s.hoverTabs ? 'html:not(:hover) ' : '';
  const G = s.titleGap;
  css.rule(`${q}${INPUT}`, {
    display: 'block',
    order: -1,
    position: 'static',
    'flex-shrink': 0,
    margin: `0 0 ${px(G)}`,
    padding: 0,
    background: 'none',
    'box-shadow': 'none',
    'border-radius': 0,
    color: 'inherit',
  });
  css.rule(`${q}${CHAT.form}`, { margin: 0, display: 'block' });
  const row = `${q}${TABS_ROW}`;
  css.rule(row, titleRowDecls(s));
  titleLines(css, row, s);
  const toolbar = `${row} > .MuiToolbar-root`;
  css.rule(toolbar, {
    display: 'block',
    flex: '0 1 auto',
    'min-width': 0,
    'min-height': 0,
    margin: s.titleStyle === 'lines' ? '0 0.6em' : 0,
    padding: 0,
    overflow: 'hidden',
  });
  const tabs = `${toolbar} ${CHAT.tabs}`;
  css.rule(tabs, { display: 'block', 'min-height': 0, overflow: 'hidden' });
  css.rule(`${tabs} > :not(${CHAT.tabsScroller})`, { display: 'none' });
  css.rule(`${tabs} ${CHAT.tabsScroller}`, {
    display: 'block',
    overflow: 'hidden',
    'white-space': 'nowrap',
    'min-width': 0,
  });
  css.rule(`${tabs} ${CHAT.tabList}`, { display: 'block' });
  css.rule([`${tabs} ${CHAT.tabIndicator}`, `${tabs} ${CHAT.tab}:not(.Mui-selected)`], {
    display: 'none',
  });
  const sel = `${tabs} ${CHAT.selectedTab}`;
  css.rule(sel, {
    display: 'inline-block',
    'vertical-align': 'top',
    'max-width': '100%',
    'min-width': 0,
    'min-height': 0,
    margin: 0,
    padding: 0,
    border: 0,
    background: 'none',
    opacity: 1,
    'text-align': 'left',
    cursor: 'default',
    ...titleTextDecls(s),
  });
  css.rule([`${sel} .MuiBadge-root`, `${sel} ${CHAT.tabLockBox}`], {
    display: 'inline',
    position: 'static',
  });
  css.rule([`${sel} .MuiBadge-badge`, `${sel} .MuiTouchRipple-root`], { display: 'none' });
  css.rule(
    `${sel} ${CHAT.tabLockBox} > svg`,
    s.titleLock
      ? {
          display: 'inline-block',
          width: '0.9em',
          height: '0.9em',
          'vertical-align': '-0.08em',
          'margin-right': '0.2em',
          fill: 'currentColor',
        }
      : { display: 'none' },
  );
  if (s.titleMode === 'text-tab')
    css.rule(`${sel}::before`, { content: cssString(titleLine(s.titleText)) });
}

/* ---------- 訊息清單：只留最新 N 則、排列、裁切 ---------- */

function messageList(
  css: CssSheet,
  s: ChatSettings,
  {
    fill,
    top,
    newestTop,
    scroll,
  }: { fill: boolean; top: boolean; newestTop: boolean; scroll: boolean },
) {
  /* 超出時切掉哪一側：最新在下切上方（flex-end）、最新在上切下方（flex-start）；捲動模式不會超出 */
  const cutTop = !newestTop && !scroll;
  css.rule(CHAT.log, {
    display: 'flex',
    'flex-direction': 'column',
    'justify-content': cutTop ? 'flex-end' : 'flex-start',
    flex: fill ? '1 1 0' : '0 1 auto',
    'min-height': px(1),
    margin: 0,
    padding: 0,
    overflow: 'clip',
    position: 'relative',
    'container-type': scroll ? 'size' : null,
  });
  /* 虛擬捲動的外層與內層改成一般的排列（高度跟著內容，不用位移） */
  css.rule(CHAT.virtualOuter, {
    position: 'relative',
    width: '100%',
    height: 'auto',
    'min-height': 0,
    flex: scroll ? '0 1 auto' : '0 0 auto',
    display: scroll ? 'flex' : 'block',
    'flex-direction': scroll ? 'column' : null,
    /* 訊息不夠多時擠到靠齊的那一邊；超出時 auto 外距是 0，改由 justify-content 決定 */
    margin: top ? '0 0 auto' : 'auto 0 0',
  });
  css.rule(CHAT.virtualInner, {
    position: 'static',
    transform: 'none',
    width: '100%',
    display: 'flex',
    'flex-direction': newestTop ? 'column-reverse' : 'column',
    gap: px(s.gap),
    'min-height': scroll ? 0 : null,
    flex: scroll ? '0 1 auto' : null,
  });
  css.rule(ITEM, {
    position: 'relative',
    'flex-shrink': scroll ? 1 : 0,
    display: scroll ? 'flex' : 'block',
    'flex-direction': scroll ? 'column' : null,
    'min-height': scroll ? 0 : null,
  });

  /* 只留最新 N 則 */
  const N = s.count;
  const filter = messageFilter(s);
  if (!filter) {
    css.rule(`${ITEM}:not(:nth-last-child(-n + ${N}))`, { display: 'none' });
  } else {
    css.supports(`not ${ADVANCED}`, (m) =>
      m.rule(`${ITEM}:not(:nth-last-child(-n + ${N}))`, { display: 'none' }),
    );
    css.rule(`${ITEM}:not(:nth-last-child(-n + ${N} of ${filter}))`, { display: 'none' });
  }
}

/* ---------- 一則訊息的方框、左側線條、成敗外框 ---------- */

function messageBox(css: CssSheet, s: ChatSettings, { scroll }: { scroll: boolean }) {
  const line = s.accent !== 'none' ? s.accentWidth : 0;
  const bw = s.boxBorderWidth;
  const border = bw > 0 ? `${px(bw)} solid ${rgba(s.boxBorderColor)}` : '0 none';
  const shadow = boxShadowOf(s);
  const pad = (left: number) =>
    `${px(s.boxPadY)} ${px(s.boxPadX)} ${px(s.boxPadY)} ${px(s.boxPadX + left)}`;

  const liBase: CssDecls = {
    display: 'flex',
    'align-items': 'flex-start',
    position: 'relative',
    margin: 0,
    width: '100%',
    'box-sizing': 'border-box',
    'min-height': 0,
    'flex-shrink': scroll ? 1 : null,
  };
  const textBase: CssDecls = {
    flex: '1 1 auto',
    'min-width': 0,
    margin: 0,
  };

  if (s.boxShape === 'card') {
    css.rule(LI, {
      ...liBase,
      padding: pad(line),
      'background-color': rgba(s.boxBg),
      border,
      'border-radius': px(s.boxRadius),
      'box-shadow': shadow || 'none',
      overflow: 'hidden',
    });
    css.rule(TXT, { ...textBase, position: 'static', padding: 0 });
  } else if (s.boxShape === 'bubble') {
    css.rule(LI, {
      ...liBase,
      padding: 0,
      background: 'none',
      border: 0,
      'border-radius': 0,
      'box-shadow': 'none',
      overflow: 'visible',
    });
    css.rule(TXT, {
      ...textBase,
      position: 'relative',
      padding: pad(line),
      'background-color': rgba(s.boxBg),
      border,
      'border-radius': px(s.boxRadius),
      'box-shadow': shadow || 'none',
      'box-sizing': 'border-box',
    });
    /* 指向頭像的尾巴 */
    css.rule(`${TXT}::after`, {
      content: '""',
      position: 'absolute',
      top: px(bubbleTailTop(s.avatarSize) - bw),
      left: px(-7 - bw),
      width: '7px',
      height: '14px',
      background: rgba(s.boxBg),
      'clip-path': 'polygon(100% 0, 0 50%, 100% 100%)',
      'pointer-events': 'none',
    });
  } else {
    css.rule(LI, {
      ...liBase,
      padding: pad(line ? line + 6 : 0),
      background: 'none',
      border: 0,
      'border-radius': 0,
      'box-shadow': 'none',
      overflow: scroll ? 'hidden' : 'visible',
    });
    css.rule(TXT, { ...textBase, position: 'static', padding: 0 });
  }

  /* 左側線條：畫在名稱 span 的 ::before（角色色就是名稱的行內 color，用 currentColor 取得） */
  if (line) {
    const r = s.boxShape === 'none' ? 0 : Math.max(0, s.boxRadius - bw);
    css.rule(`${NAME}::before`, {
      content: '""',
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: px(line),
      'border-radius': `${px(r)} 0 0 ${px(r)}`,
      background: s.accent === 'character' ? 'currentColor' : rgba(s.accentColor),
      'pointer-events': 'none',
    });
    if (s.accent === 'outcome') {
      for (const o of DICE_OUTCOMES)
        css.rule(`${nameOf(itemWith(o))}::before`, {
          background: rgba(outcomeColor(s, o)),
        });
    }
  }

  /* 成功、失敗時外框換成結果色並發光（OBS 31） */
  if (s.outcomeGlow && s.boxShape !== 'none') {
    const boxOf = s.boxShape === 'card' ? liOf : txtOf;
    for (const o of ['success', 'failure'] as const) {
      const c = rgba(outcomeColor(s, o));
      css.rule(boxOf(itemWith(o)), {
        'border-color': c,
        'box-shadow': `${shadow ? `${shadow}, ` : ''}0 0 12px ${c}`,
      });
    }
  }
}

/* ---------- 角色頭像 ---------- */

function avatar(css: CssSheet, s: ChatSettings, { scroll }: { scroll: boolean }) {
  if (!s.avatar) {
    css.rule(AV, { display: 'none' });
    return;
  }
  const S = s.avatarSize;
  const radius =
    s.avatarShape === 'circle'
      ? '50%'
      : s.avatarShape === 'rounded'
        ? px(roundedAvatarRadius(S))
        : 0;
  css.rule(AV, {
    display: 'block',
    width: px(S),
    'min-width': 0,
    'flex-shrink': 0,
    margin: `0 ${px(s.avatarGap)} 0 0`,
    'align-self': scroll || s.avatarAlign === 'top' ? 'flex-start' : 'center',
  });
  css.rule(`${AV} > div`, {
    width: px(S),
    height: px(S),
    'box-sizing': 'border-box',
    'border-radius': radius,
    border:
      s.avatarBorder > 0 ? `${px(s.avatarBorder)} solid ${rgba(s.avatarBorderColor)}` : 'none',
    overflow: 'hidden',
    'background-color': rgba('#000000', 0.2),
  });
  /* 系統訊息：保留同樣的寬度，不佔高度、沒有底色與外框 */
  css.rule(`${AV} > div:empty`, {
    height: 0,
    border: 0,
    'background-color': 'transparent',
  });
  css.rule(`${AV} .MuiAvatar-root`, {
    width: '100%',
    height: '100%',
    'border-radius': 0,
    background: 'none',
  });
  css.rule(`${AV} img`, {
    width: '100%',
    height: '100%',
    'object-fit': 'cover',
    'object-position': 'center top',
  });
}

/* ---------- 名稱與發言時間 ---------- */

function nameRules(css: CssSheet, s: ChatSettings, prefix: boolean) {
  /* 系統訊息沒有行內的角色色：線條改用內文顏色（不加 important，行內的角色色仍然優先） */
  css.rule(NAME, { color: rgba(s.bodyColor) }, { important: false });

  if (!s.name) {
    /* 不佔高度；元素保留（角色色的左側線條要用它的顏色） */
    css.rule(NAME, {
      display: 'block',
      height: 0,
      margin: 0,
      padding: 0,
      border: 0,
      'font-size': 0,
      'line-height': 0,
      overflow: 'hidden',
    });
    return;
  }

  const effect = effectShadow(s);
  const fill =
    s.nameStyle === 'pill'
      ? s.nameColorMode === 'custom'
        ? rgba(s.nameColor)
        : '#15161a'
      : s.nameColorMode === 'custom'
        ? rgba(s.nameColor)
        : 'currentColor';
  const base: CssDecls = {
    ...fontDecls(s.nameFont, s.nameSize),
    'line-height': 1.35,
    'letter-spacing': '0.02em',
    '-webkit-text-fill-color': fill,
    'text-shadow': s.nameStyle === 'pill' ? 'none' : effect,
  };

  if (prefix) {
    css.rule(NAME, {
      ...base,
      display: 'inline',
      margin: 0,
      padding: 0,
      'white-space': 'normal',
      overflow: 'visible',
    });
    css.rule(`${NAME}::after`, { content: '"："' });
    css.rule(`${NAME}:empty::after`, { content: 'none' });
    css.rule(TIME, { display: 'none' });
    return;
  }

  const decls: CssDecls = {
    ...base,
    display: 'block',
    'max-width': '100%',
    'white-space': 'nowrap',
    overflow: 'hidden',
    'text-overflow': 'ellipsis',
    margin: `0 0 ${px(s.nameGap)}`,
    padding: 0,
  };
  if (s.nameStyle === 'underline')
    Object.assign(decls, {
      width: 'fit-content',
      'padding-bottom': '0.12em',
      'border-bottom': '2px solid currentColor',
    });
  if (s.nameStyle === 'pill')
    Object.assign(decls, {
      width: 'fit-content',
      padding: '0.12em 0.65em',
      'border-radius': '0.6em',
      'background-color': 'currentColor',
    });
  css.rule(NAME, decls);
  /* 系統訊息：名稱是空的，不畫底線、膠囊、也不留間距 */
  css.rule(`${NAME}:empty`, {
    height: 0,
    margin: 0,
    padding: 0,
    border: 0,
    'background-color': 'transparent',
  });
  css.rule(
    TIME,
    s.time
      ? {
          display: 'inline',
          'font-family': 'inherit',
          'font-size': '0.78em',
          'font-weight': 400,
          'letter-spacing': 0,
          'margin-left': '0.3em',
          color: rgba(s.timeColor),
          '-webkit-text-fill-color': rgba(s.timeColor),
        }
      : { display: 'none' },
  );
}

/* ---------- 內文 ---------- */

function bodyRules(css: CssSheet, s: ChatSettings, prefix: boolean) {
  const decls: CssDecls = {
    ...fontDecls(s.bodyFont, s.bodySize),
    display: prefix ? 'inline' : 'block',
    margin: 0,
    'line-height': num(s.lineHeight, 2),
    'letter-spacing': `${num(s.letterSpacing, 2)}em`,
    color: rgba(s.bodyColor),
    'text-shadow': effectShadow(s),
    'white-space': 'pre-wrap',
    'word-break': 'break-all',
  };
  if (s.clampLines > 0 && !prefix)
    Object.assign(decls, {
      display: '-webkit-box',
      '-webkit-box-orient': 'vertical',
      '-webkit-line-clamp': s.clampLines,
      overflow: 'hidden',
    });
  css.rule(BODY, decls);
  if (prefix) css.rule(TXT, { display: 'block' });
  /* 系統訊息（名稱是空的）：內文淡一點 */
  css.rule(`${NAME}:empty + ${CHAT.body}`, { opacity: 0.75 });
}

/* ---------- 擲骰結果 ---------- */

function resultRules(css: CssSheet, s: ChatSettings) {
  const effect = effectShadow(s);
  const boxed = s.resultStyle !== 'plain';
  const decls: CssDecls = {
    ...fontDecls(s.resultFont, s.resultSize),
    'line-height': 1.35,
    'letter-spacing': '0.02em',
    'word-break': 'keep-all',
    'overflow-wrap': 'anywhere',
    'text-shadow': s.resultStyle === 'solid' ? 'none' : effect,
    display: s.resultBreak ? 'block' : 'inline',
    width: s.resultBreak && boxed ? 'fit-content' : null,
    'max-width': s.resultBreak ? '100%' : null,
    'margin-top': s.resultBreak ? '0.15em' : null,
    'margin-left': !s.resultBreak && boxed ? '0.2em' : null,
  };
  if (boxed)
    Object.assign(decls, {
      'border-radius': '0.35em',
      padding: '0.05em 0.55em 0.08em 0.3em',
      'box-decoration-break': 'clone',
      '-webkit-box-decoration-break': 'clone',
    });
  css.rule(RES, decls);
  for (const o of DICE_OUTCOMES) {
    const c = outcomeColor(s, o);
    const sel = `${RES}.${DICE_RESULT_CLASS[o]}`;
    const glow =
      s.resultGlow && o !== 'other' ? `0 0 6px ${rgba(c, 0.85)}, 0 0 14px ${rgba(c, 0.5)}` : '';
    if (s.resultStyle === 'solid') {
      const fg = yiqTextColor(c);
      css.rule(sel, {
        color: fg,
        '-webkit-text-fill-color': fg,
        'background-color': rgba(c),
        'box-shadow': glow || 'none',
      });
    } else {
      css.rule(sel, {
        color: rgba(c),
        'background-color': s.resultStyle === 'outline' ? rgba(c, 0.12) : null,
        border: s.resultStyle === 'outline' ? `1.5px solid ${rgba(c)}` : null,
        'text-shadow': glow ? (effect !== 'none' ? `${glow}, ${effect}` : glow) : null,
      });
    }
  }
}

/* ---------- 分隔線（相鄰兩則之間） ---------- */

function divider(css: CssSheet, s: ChatSettings, newestTop: boolean) {
  if (!s.divider) {
    css.rule(HR, { display: 'none' });
    return;
  }
  css.rule(HR, {
    display: 'block',
    height: '1px',
    margin: `${px(dividerOffset(s.boxPadY))} 0 0`,
    padding: 0,
    border: 0,
    'background-color': rgba(s.dividerColor),
    'flex-shrink': 0,
  });
  /* 最後一則（畫面上最下面那則）不畫：最新在下是最新的那則；最新在上是最舊的那則 */
  const N = s.count;
  const filter = messageFilter(s);
  const plain = newestTop
    ? [`${ITEM}:nth-last-child(${N}) > ${CHAT.divider}`, `${ITEM}:first-child > ${CHAT.divider}`]
    : [`${ITEM}:last-child > ${CHAT.divider}`];
  if (!filter) {
    css.rule(plain, { display: 'none' });
    return;
  }
  css.supports(`not ${ADVANCED}`, (m) => m.rule(plain, { display: 'none' }));
  css.rule(
    newestTop
      ? [
          `${ITEM}:nth-last-child(${N} of ${filter}) > ${CHAT.divider}`,
          `${ITEM}:nth-child(1 of ${filter}) > ${CHAT.divider}`,
        ]
      : [`${ITEM}:nth-last-child(1 of ${filter}) > ${CHAT.divider}`],
    { display: 'none' },
  );
}

/* ---------- 動態：進場、消失、長訊息捲動、結果閃一下 ---------- */

/** 進場動畫的關鍵影格 */
export function enterKeyframes(kind: ChatSettings['enter']): Record<string, CssDecls> | null {
  const slide = (t: string) => ({
    from: { opacity: 0, transform: t },
    to: { opacity: 1, transform: 'none' },
  });
  switch (kind) {
    case 'fade':
      return { from: { opacity: 0 }, to: { opacity: 1 } };
    case 'up':
      return slide('translateY(18px)');
    case 'down':
      return slide('translateY(-18px)');
    case 'left':
      return slide('translateX(40px)');
    case 'right':
      return slide('translateX(-40px)');
    case 'pop':
      return {
        '0%': { opacity: 0, transform: 'scale(0.6)', 'animation-timing-function': 'ease-out' },
        '60%': { opacity: 1, transform: 'scale(1.05)', 'animation-timing-function': 'ease-out' },
        '100%': { opacity: 1, transform: 'scale(1)' },
      };
    case 'blur':
      return {
        from: { opacity: 0, filter: 'blur(8px)' },
        to: { opacity: 1, filter: 'none' },
      };
    default:
      return null;
  }
}

/** 消失前的總等待秒數（捲動時從捲完才開始計時） */
export function fadeDelay(s: ChatSettings): number {
  return s.fadeStay + (scrollActive(s) ? s.scrollDelay + s.scrollDuration : 0);
}

function motion(
  css: CssSheet,
  s: ChatSettings,
  { scroll, newestTop }: { scroll: boolean; newestTop: boolean },
) {
  const anims: string[] = [];
  const frames = enterKeyframes(s.enter);
  if (frames) {
    const name = css.keyframes(KEYFRAMES.enter, frames);
    anims.push(`${name} ${num(s.enterDuration, 2)}s ease-out both`);
  }
  if (s.fade) {
    /* 前 75%：淡出（先慢後快）；後 25%：收起所佔的空間與上一則的間距 */
    const side = newestTop ? 'margin-bottom' : 'margin-top';
    const name = css.keyframes(KEYFRAMES.fade, {
      '0%': {
        opacity: 1,
        'max-height': '1000px',
        [side]: 0,
        'animation-timing-function': 'ease-in',
      },
      '75%': {
        opacity: 0,
        'max-height': '1000px',
        [side]: 0,
        'animation-timing-function': 'linear',
      },
      '100%': { opacity: 0, 'max-height': 0, [side]: px(-s.gap) },
    });
    anims.push(`${name} ${num(s.fadeDuration, 2)}s linear ${num(fadeDelay(s), 2)}s forwards`);
  }
  if (anims.length)
    css.rule(ITEM, {
      animation: anims.join(', '),
      'transform-origin': s.enter === 'pop' ? 'center' : null,
    });

  if (scroll) {
    /* 只往上：位移＝min(0, 清單高 − 方框上下留白與外框 − 文字欄高) */
    const inset =
      s.boxShape === 'bubble'
        ? 0
        : 2 * s.boxPadY + (s.boxShape === 'card' ? 2 * s.boxBorderWidth : 0);
    const name = css.keyframes(KEYFRAMES.scroll, {
      from: { transform: 'translateY(0)' },
      to: { transform: `translateY(min(0px, 100cqh - ${px(inset)} - 100%))` },
    });
    css.rule(TXT, {
      animation: `${name} ${num(s.scrollDuration, 2)}s linear ${num(s.scrollDelay, 2)}s both`,
      'align-self': 'flex-start',
    });
  }

  if (s.resultFlash) {
    const name = css.keyframes(KEYFRAMES.flash, {
      from: { filter: 'brightness(2.2)' },
      to: { filter: 'brightness(1)' },
    });
    css.rule(RES, { animation: `${name} 1.4s ease-out both` });
  }
}
