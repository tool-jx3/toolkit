/**
 * 元件展示頁用的示範 CSS（不是任何工具的正式輸出）：示範怎麼用 core/css 的規則建構器、ccfolia 的選擇器
 * 與裝飾產生器，組出能在 CCFOLIA／Streamkit 上生效的自訂 CSS。四個 G4 工具的實作者可以參考寫法。
 */
import {
  barPartSelector,
  barSelector,
  CHARACTER_PAGE,
  CHAT,
  DICE_RESULT_CLASS,
  exampleCharacterUrl,
  fillBelowSelector,
  MESSAGE_BOX,
  STREAMKIT,
  streamkitUserAvatar,
  streamkitUserSpeaking,
} from '@/ccfolia';
import {
  cornerBrackets,
  createCssSheet,
  cssFontWeight,
  cssString,
  cssUrl,
  darken,
  fontStack,
  googleFontUrls,
  lighten,
  localFontNames,
  px,
  rgba,
  type TextOutlineKind,
  textOutline,
  texture,
  textureDecls,
} from '@/core/css';
import type { FontValue } from '@/core/fonts';
import { type Anchor, anchorAxes } from '@/ui';

const PAGE_RESET = { background: 'transparent', overflow: 'hidden' };

/* ---------- 角色狀態頁（狀態條） ---------- */

export interface CharacterDemo {
  color: string;
  font: FontValue;
  outline: TextOutlineKind;
  /** 危急門檻（%） */
  threshold: number;
  url: string | null;
}

export function characterDemoCss(o: CharacterDemo): string {
  const css = createCssSheet({ animated: ['filter'] });
  const weight = cssFontWeight(o.font);
  css.header({
    title: '狀態條（元件展示頁的示範）',
    toolName: '元件展示',
    url: o.url,
    exampleUrl: exampleCharacterUrl(),
    obs: { version: 31, features: ['危急演出'] },
    localFonts: localFontNames([o.font]),
  });
  for (const u of googleFontUrls([o.font])) css.import(u);
  css.rule('html, body', { ...PAGE_RESET, height: 'auto' });
  css.rule(CHARACTER_PAGE.root, { display: 'inline-block', height: 'auto', margin: px(10) });
  css.rule(CHARACTER_PAGE.snackbar, { display: 'none' });
  css.rule(CHARACTER_PAGE.wrapper, { padding: 0 });
  css.rule(CHARACTER_PAGE.row, { margin: 0, 'align-items': 'center', gap: px(10) });
  css.rule(CHARACTER_PAGE.avatar, {
    width: px(64),
    height: px(64),
    'border-radius': px(8),
    border: `2px solid ${o.color}`,
    'background-color': rgba('#000000', 0.5),
  });
  css.rule(CHARACTER_PAGE.badge, {
    transform: 'none',
    transition: 'none',
    top: px(-6),
    right: px(-8),
    'font-family': fontStack(o.font),
    'background-color': o.color,
    color: '#15161a',
  });
  css.rule(`${CHARACTER_PAGE.badge}.${CHARACTER_PAGE.badgeInvisibleClass}`, { display: 'none' });
  css.rule(CHARACTER_PAGE.bars, {
    margin: 0,
    'max-width': 'none',
    display: 'flex',
    'flex-direction': 'column',
    gap: px(6),
  });
  css.rule(barSelector(), { width: px(240), margin: 0 });
  css.rule(barPartSelector('text'), { padding: `0 ${px(10)}`, 'pointer-events': 'none' });
  css.rule(`${barPartSelector('label')}, ${barPartSelector('value')}`, {
    'font-family': fontStack(o.font),
    'font-weight': weight,
    'font-size': px(15),
    color: '#ffffff',
    'text-shadow': textOutline(o.outline, '#000000', { opacity: 85 }),
  });
  css.rule(barPartSelector('current'), { color: 'inherit' });
  css.rule(barPartSelector('track'), {
    height: px(26),
    'border-radius': px(6),
    overflow: 'hidden',
  });
  css.rule(barPartSelector('trough'), {
    opacity: 1,
    'border-radius': 0,
    background: rgba('#000000', 0.6),
  });
  css.rule(barPartSelector('fill'), {
    'border-radius': 0,
    background: `linear-gradient(${lighten(o.color, 0.15)}, ${darken(o.color, 0.35)})`,
    transition: 'width 250ms ease-out',
  });
  /* 危急：剩餘比例低於門檻時條本體發光（需要 :has()，OBS 31 以上；舊 OBS 只是不會發光） */
  const below = fillBelowSelector(o.threshold);
  if (below) {
    const pulse = css.keyframes('tk-demo-pulse', {
      '0%, 100%': { filter: 'none' },
      '50%': { filter: `drop-shadow(0 0 6px ${rgba('#ff3b3b', 0.9)}) brightness(1.3)` },
    });
    css.rule(
      `${barSelector()}:has(> div:nth-child(2) > div:nth-child(2)${below}) > div:nth-child(2)`,
      {
        animation: `${pulse} 1.1s ease-in-out infinite`,
      },
    );
  }
  return css.toString();
}

/* ---------- 房間訊息框 ---------- */

export interface RoomDemo {
  paper: boolean;
  brackets: boolean;
  buttons: 'hover' | 'always' | 'never';
  url: string | null;
}

export function roomDemoCss(o: RoomDemo): string {
  const css = createCssSheet();
  css.header({
    title: '訊息框（元件展示頁的示範）',
    toolName: '元件展示',
    url: o.url,
    exampleUrl: 'https://ccfolia.com/rooms/{房間ID}',
    urlNote: '不加 /chat',
    size: { width: 1280, height: 720 },
  });
  css.rule('html, body', PAGE_RESET);
  /* 除了訊息框以外全部「看不見」（不改結構）；關閉時 CCFOLIA 寫在 style 的 visibility: hidden 要保持有效 */
  css.rule(`body *:not(:is(${MESSAGE_BOX.root}, ${MESSAGE_BOX.root} *))`, { visibility: 'hidden' });
  css.rule(`${MESSAGE_BOX.root}:not([style*="visibility: hidden"])`, { visibility: 'visible' });
  css.rule(MESSAGE_BOX.root, {
    position: 'fixed',
    left: px(16),
    right: px(16),
    bottom: px(16),
    'max-width': px(760),
    margin: '0 auto',
    background: 'none',
    'box-shadow': 'none',
    'z-index': 9999,
  });
  const tex = o.paper ? texture('paper') : null;
  css.rule(MESSAGE_BOX.box, {
    'background-color': o.paper ? '#efe4cb' : rgba('#14161c', 0.86),
    ...textureDecls(tex),
    color: o.paper ? '#3b2f22' : '#f5f5f5',
    'border-radius': px(8),
    'box-shadow': `0 4px 18px ${rgba('#000000', 0.4)}`,
  });
  if (!tex) css.rule(MESSAGE_BOX.box, { 'background-image': 'none' });
  css.rule(MESSAGE_BOX.name, { 'font-size': px(16), 'font-weight': 700 });
  css.rule(`${MESSAGE_BOX.result}.${DICE_RESULT_CLASS.success}`, { color: '#1d8cf0' });
  css.rule(`${MESSAGE_BOX.result}.${DICE_RESULT_CLASS.failure}`, { color: '#e0245e' });
  css.rule(MESSAGE_BOX.body, {
    height: px(3 * 17 * 1.6),
    padding: `0 ${px(24)} ${px(12)}`,
    overflow: 'hidden',
  });
  css.rule(MESSAGE_BOX.text, { 'font-size': px(17), 'line-height': 1.6 });
  if (o.buttons === 'never') css.rule(MESSAGE_BOX.buttons, { display: 'none' });
  if (o.buttons === 'hover') {
    css.rule(MESSAGE_BOX.buttons, { display: 'none' });
    css.rule(`html:hover ${MESSAGE_BOX.buttons}`, {
      display: 'inline-flex',
      background: rgba('#000000', 0.7),
      color: '#ffffff',
    });
  }
  if (o.brackets)
    css.rule(`${MESSAGE_BOX.box}::after`, {
      content: '""',
      position: 'absolute',
      inset: px(6),
      'pointer-events': 'none',
      background: cornerBrackets({
        length: 18,
        thickness: 2,
        color: rgba(o.paper ? '#5a3d1e' : '#ffffff', 0.8),
      }),
    });
  /* 窄來源時 CCFOLIA 會縮小立繪與骰子：寫回固定大小 */
  css.rule(MESSAGE_BOX.portrait, { width: px(240) });
  css.rule(`${MESSAGE_BOX.diceImg}`, { width: px(64), height: px(64) });
  return css.toString();
}

/* ---------- 聊天另開視窗 ---------- */

export interface ChatDemo {
  count: number;
  diceOnly: boolean;
  url: string | null;
}

export function chatDemoCss(o: ChatDemo): string {
  const css = createCssSheet({ animated: ['opacity', 'transform'] });
  css.header({
    title: '聊天視窗（元件展示頁的示範）',
    toolName: '元件展示',
    url: o.url,
    exampleUrl: 'https://ccfolia.com/rooms/<房間ID>/chat',
    urlNote: '一定要 /chat 結尾',
    obs: o.diceOnly ? { version: 31, features: ['只列擲骰'] } : null,
  });
  css.rule('html, body', PAGE_RESET);
  css.rule(CHAT.wrapper, { padding: 0 });
  css.rule(CHAT.snackbar, { display: 'none' });
  css.rule(CHAT.paper, {
    inset: px(10),
    width: 'auto',
    height: 'auto',
    border: 0,
    'border-radius': px(12),
    overflow: 'hidden',
    'background-color': rgba('#141821', 0.78),
    padding: px(10),
  });
  css.rule(`${CHAT.header}, ${CHAT.inputPaper}`, { display: 'none' });
  /* 清單至少 1px 高（0 高時 CCFOLIA 不算繪訊息） */
  css.rule(CHAT.log, {
    padding: 0,
    'min-height': px(1),
    overflow: 'hidden',
    display: 'flex',
    'flex-direction': 'column',
    'justify-content': 'flex-end',
  });
  /* 只留最新 N 則：較舊的訊息不佔空間（虛擬捲動會量到 0） */
  css.rule(`${CHAT.item}:not(:nth-last-child(-n + ${Math.max(1, o.count)}))`, { display: 'none' });
  if (o.diceOnly) css.rule(`${CHAT.item}:not(:has(${CHAT.result}))`, { display: 'none' });
  css.rule(CHAT.listItem, { padding: `${px(6)} 0` });
  css.rule(`${CHAT.item} ${CHAT.divider}`, { display: 'none' });
  css.rule(`${CHAT.item} ${CHAT.name}`, { 'font-size': px(14), 'font-weight': 700 });
  css.rule(`${CHAT.item} ${CHAT.body}`, { color: '#f2f2f2', 'font-size': px(15) });
  css.rule(`${CHAT.item} ${CHAT.result}.${DICE_RESULT_CLASS.success}`, {
    color: '#3aa0ff',
    'font-weight': 700,
  });
  css.rule(`${CHAT.item} ${CHAT.result}.${DICE_RESULT_CLASS.failure}`, {
    color: '#ff4f7a',
    'font-weight': 700,
  });
  css.rule(`${CHAT.item} ${CHAT.edited}, ${CHAT.editButton}`, { display: 'none' });
  const fadeIn = css.keyframes('tk-demo-in', {
    from: { opacity: 0, transform: 'translateY(18px)' },
    to: { opacity: 1, transform: 'none' },
  });
  css.rule(CHAT.item, { animation: `${fadeIn} 400ms cubic-bezier(0.22, 1, 0.36, 1) both` });
  return css.toString();
}

/* ---------- Discord Streamkit ---------- */

export interface StreamkitDemo {
  userId: string;
  name: string;
  anchor: Anchor;
  bounce: boolean;
  dim: boolean;
  hideWhenAway: boolean;
}

export function streamkitDemoCss(o: StreamkitDemo, image: string): string {
  const css = createCssSheet({ animated: ['transform', 'filter'] });
  css.header({
    title: 'Discord 通話立繪（元件展示頁的示範）',
    toolName: '元件展示',
    exampleUrl: 'https://streamkit.discord.com/overlay/voice/{伺服器ID}/{頻道ID}',
    obs: { version: 31, features: ['說話偵測', '不在頻道時隱藏'] },
    notes: ['只用一個頁面層畫立繪；Streamkit 原本的頭像與名字都隱藏，只拿來偵測說話。'],
  });
  css.rule('html, body', PAGE_RESET);
  /* Streamkit 的元素都不顯示（仍在 DOM 裡，:has() 還是選得到） */
  css.rule(STREAMKIT.container, { display: 'none' });
  const { x, y } = anchorAxes(o.anchor);
  const W = 240;
  const H = 480;
  css.rule('#root::before', {
    content: '""',
    position: 'fixed',
    width: px(W),
    height: px(H),
    background: `${cssUrl(image)} center bottom / contain no-repeat`,
    left: x === 'left' ? px(40) : x === 'center' ? `calc(50% - ${px(W / 2)})` : 'auto',
    right: x === 'right' ? px(40) : 'auto',
    top: y === 'top' ? px(40) : y === 'center' ? `calc(50% - ${px(H / 2)})` : 'auto',
    bottom: y === 'bottom' ? 0 : 'auto',
    filter: o.dim ? 'brightness(0.5)' : 'none',
  });
  css.rule('#root::after', {
    content: cssString(o.name),
    position: 'fixed',
    left: x === 'left' ? px(40) : x === 'center' ? `calc(50% - ${px(W / 2)})` : 'auto',
    right: x === 'right' ? px(40) : 'auto',
    width: px(W),
    'text-align': 'center',
    top: y === 'top' ? px(40 + H - 20) : y === 'center' ? `calc(50% + ${px(H / 2 - 20)})` : 'auto',
    bottom: y === 'bottom' ? px(8) : 'auto',
    color: '#ffffff',
    'font-size': px(32),
    'font-weight': 700,
    'text-shadow': textOutline('stroke', '#000000', { width: 3 }),
  });
  const speaking = streamkitUserSpeaking(o.userId);
  const bounce = css.keyframes('tk-demo-bounce', {
    '0%, 100%': { transform: 'none' },
    '50%': { transform: 'translateY(-10px)' },
  });
  css.rule(`#root:has(${speaking})::before`, {
    animation: o.bounce ? `${bounce} 750ms ease-in-out infinite` : null,
    filter: 'none',
  });
  if (o.hideWhenAway) {
    css.rule('#root::before, #root::after', { display: 'none' });
    css.rule(
      `#root:has(${streamkitUserAvatar(o.userId)})::before, #root:has(${streamkitUserAvatar(o.userId)})::after`,
      {
        display: 'block',
      },
    );
  }
  return css.toString();
}
