/**
 * 模擬 CCFOLIA 的聊天另開視窗（/rooms/{房間ID}/chat）。結構見 dom.ts 的 CHAT（chat-window 規格 3.1）：
 * - 標頭（「ルームチャット」與兩個按鈕）、秘匿分頁才有的參加者頭像列；
 * - 訊息清單是虛擬捲動：外層 div 的高度＝已量測訊息高度總和，只算繪可見範圍前後約 50 則；
 *   被 CSS 隱藏（不佔空間）的訊息量到 0，所以只要隱藏較舊的訊息，可見範圍一定延伸到最新一則；
 *   **清單高度為 0 時不算繪任何訊息**（清單高度取決於訊息本身時會一直維持 0、畫面空白）；新訊息時捲到最新；
 * - 系統訊息沒有名字與頭像（頭像欄是空 div、名稱 span 是空的）；他人的秘密擲骰沒有結果 span；
 * - 分頁列：主分頁 role="tab"、其他分頁 role="button"，被選的有 .Mui-selected；秘匿分頁名稱前有鎖頭；
 * - 偶爾出現的通知條（.MuiSnackbar-root）。
 */
import {
  chatTimestamp,
  classifyDiceResult,
  DICE_RESULT_CLASS,
  type DiceOutcome,
  EDITED_MARK,
  SECRET_DICE_CHAT_TEXT,
} from '../dice';
import { CHAT } from '../dom';
import { mockAvatar } from './assets';
import { addStyle, fakeHash, h, type MockScene, resetBody, svg } from './shared';

export interface MockChatSpeaker {
  name: string;
  /** 角色顏色（CCFOLIA 寫在名稱的行內樣式） */
  color?: string;
  /** 頭像網址；null 時用範例頭像 */
  avatar?: string | null;
}

export interface MockChatMessage {
  /** 穩定的識別（同一則訊息重繪時不重建元素，進場動畫不會重播）；不給時自動產生 */
  id?: string;
  /** null＝系統訊息（例如「[ 角色 ] HP : 12 → 10」） */
  speaker: MockChatSpeaker | null;
  text: string;
  /** 擲骰結果（「＞ …」那段；分類與配色照 CCFOLIA） */
  result?: string | null;
  /** 結果的分類（成功／失敗／其他）；不給時照 CCFOLIA 的規則由結果文字判斷 */
  outcome?: DiceOutcome;
  /** 他人的秘密擲骰：內文換成「Secret dice 🎲」、沒有結果 */
  secretOther?: boolean;
  /** 名稱後的時間（預設依順序產生「 - 今日 21:00」…） */
  time?: string;
  /** 編輯過（多一個「[編集済]」） */
  edited?: boolean;
  /** 看的人自己的訊息（有滑過才出現的編輯按鈕） */
  own?: boolean;
}

export interface MockChatParticipant {
  name: string;
  /** 帳號大頭貼；null 時顯示名稱首字 */
  avatar?: string | null;
}

export interface MockChatTab {
  name: string;
  /** 秘匿分頁（名稱前有鎖頭） */
  secret?: boolean;
  /** 設定了參加者的秘匿分頁才有參加者頭像列 */
  participants?: readonly MockChatParticipant[];
  messages: readonly MockChatMessage[];
}

export interface ChatSceneState {
  tabs: readonly MockChatTab[];
  /** 目前開著的分頁 */
  selected: number;
  /** 通知條文字；null 不顯示 */
  snackbar: string | null;
}

const C = {
  wrapper: fakeHash('ch-wrapper'),
  drawer: fakeHash('ch-drawer'),
  paper: fakeHash('ch-paper'),
  header: fakeHash('ch-header'),
  toolbar: fakeHash('ch-toolbar'),
  dense: fakeHash('ch-toolbar-dense'),
  grow: fakeHash('ch-grow'),
  icon: fakeHash('ch-icon'),
  title: fakeHash('ch-title'),
  group: fakeHash('ch-avatar-group'),
  gAvatar: fakeHash('ch-group-avatar'),
  log: fakeHash('ch-log'),
  item: fakeHash('ch-item'),
  li: fakeHash('ch-li'),
  liAvatar: fakeHash('ch-li-avatar'),
  avWrap: fakeHash('ch-av-wrap'),
  avatar: fakeHash('ch-avatar'),
  img: fakeHash('ch-img'),
  text: fakeHash('ch-text'),
  primary: fakeHash('ch-primary'),
  caption: fakeHash('ch-caption'),
  secondary: fakeHash('ch-secondary'),
  edit: fakeHash('ch-edit'),
  hr: fakeHash('ch-hr'),
  input: fakeHash('ch-input'),
  tabs: fakeHash('ch-tabs'),
  scroller: fakeHash('ch-scroller'),
  flex: fakeHash('ch-flex'),
  tab: fakeHash('ch-tab'),
  badge: fakeHash('ch-badge'),
  dot: fakeHash('ch-dot'),
  box: fakeHash('ch-box'),
  ripple: fakeHash('ch-ripple'),
  indicator: fakeHash('ch-indicator'),
  charRow: fakeHash('ch-char-row'),
  field: fakeHash('ch-field'),
  textarea: fakeHash('ch-textarea'),
  dicebot: fakeHash('ch-dicebot'),
  snack: fakeHash('ch-snack'),
};

const SHADOW4 =
  '0px 2px 4px -1px rgba(0,0,0,0.2),0px 4px 5px 0px rgba(0,0,0,0.14),0px 1px 10px 0px rgba(0,0,0,0.12)';

/** 頁面原本的樣式（chat-window 規格 3.1） */
const ORIGINAL_CSS = `
html { overflow-y: scroll; }
html, body, #root { height: 100%; }
body { margin: 0; background-color: #202020; color: #fff; font-family: Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.43; }
.MuiPaper-root { color: #fff; }
.${C.wrapper} { padding: 8px; }
.${C.drawer} { flex: 0 0 auto; }
.${C.paper} { position: fixed; top: 0; right: 0; width: 100%; height: 100%; box-sizing: border-box; z-index: 1200; display: flex; flex-direction: column; overflow-y: auto; outline: 0; background-color: rgba(44, 44, 44, 0.87); border-left: 1px solid rgba(255, 255, 255, 0.12); }
.${C.header} { position: sticky; top: 0; z-index: 1100; display: flex; flex-direction: column; flex-shrink: 0; width: 100%; box-sizing: border-box; background-color: #212121; box-shadow: ${SHADOW4}; }
.${C.toolbar} { position: relative; display: flex; align-items: center; min-height: 56px; padding: 0 16px; }
@media (min-width: 600px) { .${C.toolbar} { min-height: 64px; padding: 0 24px; } }
.${C.dense} { min-height: 48px; }
.${C.grow} { flex-grow: 1; }
.${C.icon} { display: inline-flex; align-items: center; justify-content: center; padding: 8px; border: 0; border-radius: 50%; background: transparent; color: inherit; cursor: pointer; }
.${C.icon} svg { width: 24px; height: 24px; fill: currentColor; }
.${C.title} { margin: 0; font-size: 14px; font-weight: 500; line-height: 1.57; }
.${C.group} { display: flex; flex-direction: row-reverse; }
.${C.gAvatar} { position: relative; display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 40px; height: 40px; font-size: 20px; border-radius: 50%; overflow: hidden; box-sizing: content-box; border: 2px solid #212121; margin-left: -8px; background-color: #757575; color: #121212; }
.${C.gAvatar}:last-child { margin-left: 0; }
.${C.gAvatar} img { width: 100%; height: 100%; object-fit: cover; }
.${C.log} { list-style: none; margin: 0; padding: 8px 0; position: relative; flex: 1 1 0; min-height: 0; overflow-y: auto; }
.${C.li} { position: relative; display: flex; justify-content: flex-start; align-items: flex-start; box-sizing: border-box; width: 100%; padding: 8px 16px; text-align: left; }
.${C.liAvatar} { min-width: 56px; flex-shrink: 0; margin-top: 8px; }
.${C.avWrap} { width: 40px; height: 40px; overflow: hidden; }
.${C.avatar} { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; overflow: hidden; border-radius: 0; }
.${C.img} { width: 100%; height: 100%; object-fit: cover; }
.${C.text} { flex: 1 1 auto; min-width: 0; margin: 6px 0; }
.${C.primary} { display: block; margin: 0; font-size: 14px; font-weight: 500; line-height: 1.57; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.${C.caption} { margin: 0; font-size: 12px; font-weight: 400; line-height: 1.66; color: rgb(117, 117, 117); }
.${C.secondary} { display: block; margin: 0; font-size: 14px; font-weight: 400; line-height: 1.43; color: rgba(255, 255, 255, 0.7); }
.${DICE_RESULT_CLASS.success} { color: #2196f3; }
.${DICE_RESULT_CLASS.failure} { color: #dc004e; }
.${DICE_RESULT_CLASS.other} { color: rgba(255, 255, 255, 0.7); }
.${C.edit} { position: absolute; right: 16px; top: 8px; opacity: 0; }
.${C.li}:hover > .${C.edit} { opacity: 1; }
.${C.hr} { margin: 0 0 0 72px; flex-shrink: 0; border-width: 0 0 thin; border-style: solid; border-color: rgba(255, 255, 255, 0.12); }
.${C.input} { flex-shrink: 0; background-color: #121212; border-radius: 0; }
.${C.input} form { margin: 0; }
.${C.tabs} { display: flex; min-height: 48px; overflow: hidden; }
.${C.scroller} { position: relative; flex: 1 1 auto; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; white-space: nowrap; }
.${C.flex} { display: flex; }
.${C.tab} { position: relative; display: inline-flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0; min-height: 48px; min-width: 90px; max-width: 360px; padding: 12px 16px; border: 0; background: transparent; font: 500 14px/1.25 Roboto, Helvetica, Arial, sans-serif; letter-spacing: 0.02857em; text-transform: uppercase; color: rgba(255, 255, 255, 0.7); cursor: pointer; }
.${C.tab}.Mui-selected { color: #90caf9; }
.${C.badge} { position: relative; display: inline-flex; vertical-align: middle; }
.${C.box} { display: inline-flex; align-items: center; gap: 4px; }
.${C.box} svg { width: 16px; height: 16px; fill: currentColor; }
.${C.dot} { position: absolute; top: 0; right: -8px; width: 8px; height: 8px; border-radius: 4px; background: #f44336; transform: scale(0); }
.${C.ripple} { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.${C.indicator} { position: absolute; bottom: 0; height: 2px; background-color: #90caf9; transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1) 0ms; }
.${C.charRow} { display: flex; align-items: center; gap: 8px; padding: 8px 16px; font-size: 13px; }
.${C.charRow} img { width: 28px; height: 28px; border-radius: 4px; }
.${C.field} { padding: 0 16px 8px; }
.${C.textarea} { width: 100%; box-sizing: border-box; min-height: 44px; resize: none; border: 1px solid rgba(255, 255, 255, 0.23); border-radius: 4px; background: transparent; color: inherit; font: inherit; padding: 8px; }
.${C.dicebot} { padding: 4px 16px 8px; font-size: 12px; color: rgba(255, 255, 255, 0.5); }
.${C.snack} { position: fixed; z-index: 1400; left: 8px; right: 8px; bottom: 8px; display: flex; justify-content: center; }
.${C.snack} > div { background: #323232; color: #fff; padding: 6px 16px; border-radius: 4px; font-size: 14px; }
`;

const ICON_CLOSE =
  'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z';
const ICON_MENU =
  'M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z';
const ICON_LOCK =
  'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z';
const ICON_EDIT =
  'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z';

export const DEFAULT_CHAT_STATE: ChatSceneState = {
  tabs: [{ name: CHAT.mainTabName, messages: [] }],
  selected: 0,
  snackbar: null,
};

let autoId = 0;
const ids = new WeakMap<object, string>();
function keyOf(m: MockChatMessage): string {
  if (m.id) return m.id;
  let k = ids.get(m);
  if (!k) {
    k = `m${++autoId}`;
    ids.set(m, k);
  }
  return k;
}

export class ChatScene implements MockScene {
  private s: ChatSceneState;
  private doc: Document | null = null;
  private n: {
    root: HTMLElement;
    header: HTMLElement;
    titleBar: HTMLElement;
    participants: HTMLElement;
    group: HTMLElement;
    log: HTMLElement;
    outer: HTMLElement;
    inner: HTMLElement;
    tabList: HTMLElement;
    indicator: HTMLElement;
    snack: HTMLElement;
  } | null = null;
  private sizes = new Map<string, number>();
  private nodes = new Map<string, HTMLElement>();
  private ro: ResizeObserver | null = null;
  private raf = 0;
  private stick = true;
  /** 可見範圍前後預先算繪的則數 */
  readonly overscan: number;

  constructor(
    state: Partial<ChatSceneState> = {},
    { overscan = CHAT.overscan as number }: { overscan?: number } = {},
  ) {
    this.s = { ...DEFAULT_CHAT_STATE, ...state };
    this.overscan = overscan;
  }

  get state(): ChatSceneState {
    return this.s;
  }

  /** 目前分頁的訊息 */
  get messages(): readonly MockChatMessage[] {
    return this.s.tabs[this.s.selected]?.messages ?? [];
  }

  update(partial: Partial<ChatSceneState>): void {
    const tabChanged = partial.selected !== undefined && partial.selected !== this.s.selected;
    this.s = { ...this.s, ...partial };
    if (this.s.selected >= this.s.tabs.length) this.s = { ...this.s, selected: 0 };
    if (tabChanged) this.clearRendered();
    this.stick = true;
    this.renderAll();
  }

  selectTab(index: number): void {
    this.update({ selected: index });
  }

  /** 在某個分頁最後加一則（預設目前分頁），並捲到最新 */
  addMessage(message: MockChatMessage, tabIndex = this.s.selected): void {
    const tabs = this.s.tabs.map((t, i) =>
      i === tabIndex ? { ...t, messages: [...t.messages, message] } : t,
    );
    this.update({ tabs });
  }

  /** 換掉某個分頁的所有訊息 */
  setMessages(messages: readonly MockChatMessage[], tabIndex = this.s.selected): void {
    const tabs = this.s.tabs.map((t, i) => (i === tabIndex ? { ...t, messages } : t));
    this.update({ tabs });
  }

  /** 立刻重新量測與算繪（例如 CSS 改變之後；之後量到的高度有變時會再自動算一次） */
  refresh(): void {
    this.renderList();
  }

  mount(doc: Document): () => void {
    this.doc = doc;
    resetBody(doc);
    addStyle(doc, ORIGINAL_CSS, 'ccfolia-chat');
    this.build(doc);
    this.sizes.clear();
    this.nodes.clear();
    const RO = (doc.defaultView as (Window & typeof globalThis) | null)?.ResizeObserver;
    if (RO) {
      this.ro = new RO(() => this.scheduleRender());
      if (this.n) this.ro.observe(this.n.log);
    }
    this.n?.log.addEventListener('scroll', () => this.scheduleRender());
    this.stick = true;
    this.renderAll();
    return () => {
      this.ro?.disconnect();
      this.ro = null;
      const w = doc.defaultView;
      if (this.raf && w) w.cancelAnimationFrame?.(this.raf);
      this.raf = 0;
      if (this.doc === doc) {
        this.doc = null;
        this.n = null;
        this.nodes.clear();
      }
    };
  }

  private build(doc: Document): void {
    const iconButton = (label: string, path: string) =>
      h(
        doc,
        'button',
        {
          class: `MuiButtonBase-root MuiIconButton-root ${C.icon}`,
          type: 'button',
          'aria-label': label,
        },
        [svg(doc, '0 0 24 24', [path], { class: 'MuiSvgIcon-root' })],
      );
    const titleBar = h(
      doc,
      'div',
      { class: `MuiToolbar-root MuiToolbar-gutters MuiToolbar-regular ${C.toolbar}` },
      [
        iconButton('閉じる', ICON_CLOSE),
        h(doc, 'div', { class: C.grow }),
        h(doc, 'h6', { class: `MuiTypography-root MuiTypography-subtitle2 ${C.title}` }, [
          CHAT.titleLabel,
        ]),
        h(doc, 'div', { class: C.grow }),
        iconButton('メニュー', ICON_MENU),
      ],
    );
    const group = h(doc, 'div', { class: `MuiAvatarGroup-root ${C.group}`, role: 'group' });
    const participants = h(
      doc,
      'div',
      { class: `MuiToolbar-root MuiToolbar-gutters MuiToolbar-dense ${C.toolbar} ${C.dense}` },
      [group],
    );
    const header = h(
      doc,
      'header',
      {
        class: `MuiPaper-root MuiPaper-elevation MuiPaper-elevation4 MuiAppBar-root MuiAppBar-colorPrimary MuiAppBar-positionSticky ${C.header}`,
      },
      [titleBar],
    );
    const inner = h(doc, 'div', {
      style: 'position: absolute; top: 0px; left: 0px; width: 100%; transform: translateY(0px);',
    });
    const outer = h(doc, 'div', { style: 'height: 0px; width: 100%; position: relative;' }, [
      inner,
    ]);
    const log = h(doc, 'ul', { class: `MuiList-root MuiList-padding ${C.log}`, role: 'log' }, [
      outer,
    ]);
    const indicator = h(doc, 'span', { class: `MuiTabs-indicator ${C.indicator}` });
    const tabList = h(doc, 'div', { class: `MuiTabs-flexContainer ${C.flex}`, role: 'tablist' });
    const tabs = h(doc, 'div', { class: `MuiTabs-root ${C.tabs}` }, [
      h(doc, 'div', {}),
      h(doc, 'div', { class: `MuiTabs-scroller MuiTabs-scrollableX ${C.scroller}` }, [
        tabList,
        indicator,
      ]),
      h(doc, 'div', {}),
    ]);
    const input = h(
      doc,
      'div',
      { class: `MuiPaper-root MuiPaper-elevation MuiPaper-elevation0 ${C.input}` },
      [
        h(doc, 'form', {}, [
          h(
            doc,
            'header',
            {
              class: `MuiPaper-root MuiAppBar-root MuiAppBar-positionStatic ${C.header}`,
              style: 'position: static;',
            },
            [
              h(
                doc,
                'div',
                {
                  class: `MuiToolbar-root MuiToolbar-gutters MuiToolbar-dense ${C.toolbar} ${C.dense}`,
                  style: 'padding: 0;',
                },
                [tabs],
              ),
            ],
          ),
          h(doc, 'div', { class: C.charRow }, [
            h(doc, 'img', { src: mockAvatar(4), alt: '' }),
            h(doc, 'span', {}, ['（角色選擇）']),
          ]),
          h(doc, 'div', { class: `MuiFormControl-root MuiTextField-root ${C.field}` }, [
            h(doc, 'div', { class: 'MuiInputBase-root MuiInputBase-multiline' }, [
              h(doc, 'textarea', {
                class: `MuiInputBase-input ${C.textarea}`,
                rows: 2,
                'aria-label': 'メッセージ',
              }),
            ]),
          ]),
          h(doc, 'hr', { class: `MuiDivider-root ${C.hr}`, style: 'margin: 0;' }),
          h(doc, 'div', { class: C.dicebot }, [CHAT.dicebotLine]),
        ]),
      ],
    );
    const paper = h(
      doc,
      'div',
      {
        class: `MuiPaper-root MuiPaper-elevation MuiPaper-elevation0 MuiDrawer-paper MuiDrawer-paperAnchorRight MuiDrawer-paperAnchorDockedRight ${C.paper}`,
      },
      [header, log, input],
    );
    const snack = h(
      doc,
      'div',
      { class: `MuiSnackbar-root MuiSnackbar-anchorOriginBottomCenter ${C.snack}` },
      [h(doc, 'div', { class: 'MuiPaper-root MuiSnackbarContent-root', role: 'alert' })],
    );
    const root = h(doc, 'div', { id: 'root' }, [
      h(doc, 'div', { class: C.wrapper }, [
        h(doc, 'div', { class: `MuiDrawer-root MuiDrawer-docked ${C.drawer}` }, [paper]),
      ]),
    ]);
    doc.body.append(root);
    this.n = {
      root,
      header,
      titleBar,
      participants,
      group,
      log,
      outer,
      inner,
      tabList,
      indicator,
      snack,
    };
  }

  private clearRendered(): void {
    for (const el of this.nodes.values()) el.remove();
    this.nodes.clear();
  }

  private scheduleRender(): void {
    const w = this.doc?.defaultView;
    if (!w || this.raf) return;
    const run = () => {
      this.raf = 0;
      this.renderList();
    };
    this.raf =
      typeof w.requestAnimationFrame === 'function'
        ? w.requestAnimationFrame(run)
        : (w.setTimeout(run, 16) as unknown as number);
  }

  private renderAll(): void {
    this.renderHeader();
    this.renderTabs();
    this.renderSnack();
    this.renderList();
  }

  private renderHeader(): void {
    const n = this.n;
    const doc = this.doc;
    if (!n || !doc) return;
    const tab = this.s.tabs[this.s.selected];
    const people = tab?.secret ? (tab.participants ?? []) : [];
    if (people.length) {
      n.group.replaceChildren(
        ...people.map((p) =>
          h(
            doc,
            'div',
            {
              class: `MuiAvatar-root MuiAvatar-circular MuiAvatarGroup-avatar${p.avatar ? '' : ' MuiAvatar-colorDefault'} ${C.gAvatar}`,
            },
            [
              p.avatar
                ? h(doc, 'img', { class: 'MuiAvatar-img', src: p.avatar, alt: p.name })
                : (Array.from(p.name)[0] ?? ''),
            ],
          ),
        ),
      );
      if (!n.participants.isConnected) n.header.append(n.participants);
    } else n.participants.remove();
  }

  private renderTabs(): void {
    const n = this.n;
    const doc = this.doc;
    if (!n || !doc) return;
    const buttons = this.s.tabs.map((t, i) => {
      const selected = i === this.s.selected;
      const label: (Node | string)[] = t.secret
        ? [
            h(doc, 'div', { class: `MuiBox-root ${C.box}` }, [
              svg(doc, '0 0 24 24', [ICON_LOCK], { class: 'MuiSvgIcon-root' }),
              t.name,
            ]),
          ]
        : [t.name];
      const b = h(
        doc,
        'button',
        {
          class: `MuiButtonBase-root MuiTab-root MuiTab-textColorPrimary${selected ? ' Mui-selected' : ''} ${C.tab}`,
          type: 'button',
          role: i === 0 ? 'tab' : 'button',
          'aria-selected': selected ? 'true' : 'false',
          tabindex: selected ? '0' : '-1',
        },
        [
          h(doc, 'span', { class: `MuiBadge-root ${C.badge}` }, [
            ...label,
            h(doc, 'span', { class: `MuiBadge-badge MuiBadge-dot MuiBadge-invisible ${C.dot}` }),
          ]),
          h(doc, 'span', { class: `MuiTouchRipple-root ${C.ripple}` }),
        ],
      );
      b.addEventListener('click', () => this.selectTab(i));
      return b;
    });
    const add = h(
      doc,
      'button',
      {
        class: `MuiButtonBase-root MuiTab-root ${C.tab}`,
        type: 'button',
        role: 'button',
        'aria-label': '+',
      },
      ['+'],
    );
    n.tabList.replaceChildren(...buttons, add);
    const sel = buttons[this.s.selected];
    if (sel)
      n.indicator.setAttribute('style', `left: ${sel.offsetLeft}px; width: ${sel.offsetWidth}px;`);
  }

  private renderSnack(): void {
    const n = this.n;
    if (!n) return;
    if (this.s.snackbar) {
      (n.snack.firstElementChild as HTMLElement).textContent = this.s.snackbar;
      if (!n.snack.isConnected) n.root.append(n.snack);
    } else n.snack.remove();
  }

  private buildItem(doc: Document, m: MockChatMessage, index: number): HTMLElement {
    const system = !m.speaker;
    const avatarCol = h(
      doc,
      'div',
      { class: `MuiListItemAvatar-root MuiListItemAvatar-alignItemsFlexStart ${C.liAvatar}` },
      [
        system
          ? h(doc, 'div', {})
          : h(doc, 'div', { class: C.avWrap }, [
              h(doc, 'div', { class: `MuiAvatar-root MuiAvatar-square ${C.avatar}` }, [
                h(doc, 'img', {
                  class: `MuiAvatar-img ${C.img}`,
                  src: m.speaker?.avatar || mockAvatar(index),
                  alt: '',
                }),
              ]),
            ]),
      ],
    );
    const primary = h(
      doc,
      'span',
      {
        class: `MuiTypography-root MuiTypography-subtitle2 MuiTypography-noWrap MuiListItemText-primary ${C.primary}`,
        style: system ? null : `color: ${m.speaker?.color ?? '#ffffff'};`,
      },
      system
        ? []
        : [
            m.speaker?.name ?? '',
            h(doc, 'span', { class: `MuiTypography-root MuiTypography-caption ${C.caption}` }, [
              m.time ?? chatTimestamp(new Date(2026, 9, 1, 21, index % 60)),
            ]),
          ],
    );
    const secondaryChildren: (Node | string)[] = [m.secretOther ? SECRET_DICE_CHAT_TEXT : m.text];
    if (m.result && !m.secretOther) {
      secondaryChildren.push(
        h(
          doc,
          'span',
          {
            class: `MuiTypography-root MuiTypography-body2 ${DICE_RESULT_CLASS[m.outcome ?? classifyDiceResult(m.result)]}`,
          },
          [` ${m.result}`],
        ),
      );
    }
    if (m.edited)
      secondaryChildren.push(
        h(doc, 'span', { class: `MuiTypography-root MuiTypography-caption ${C.caption}` }, [
          EDITED_MARK,
        ]),
      );
    const secondary = h(
      doc,
      'p',
      {
        class: `MuiTypography-root MuiTypography-body2 MuiListItemText-secondary ${C.secondary}`,
        style: 'word-break: break-all; white-space: pre-wrap;',
      },
      secondaryChildren,
    );
    const li = h(
      doc,
      'div',
      {
        class: `MuiListItem-root MuiListItem-gutters MuiListItem-padding MuiListItem-alignItemsFlexStart ${C.li}`,
      },
      [
        avatarCol,
        h(doc, 'div', { class: `MuiListItemText-root MuiListItemText-multiline ${C.text}` }, [
          primary,
          secondary,
        ]),
        m.own
          ? h(doc, 'div', { class: C.edit }, [
              h(
                doc,
                'button',
                {
                  class: `MuiButtonBase-root MuiIconButton-root ${C.icon}`,
                  type: 'button',
                  'aria-label': '編集',
                },
                [svg(doc, '0 0 24 24', [ICON_EDIT], { class: 'MuiSvgIcon-root' })],
              ),
            ])
          : null,
      ],
    );
    return h(doc, 'div', { 'data-index': index, class: C.item }, [
      li,
      h(doc, 'hr', { class: `MuiDivider-root MuiDivider-fullWidth MuiDivider-inset ${C.hr}` }),
    ]);
  }

  /** 虛擬捲動：照 CCFOLIA 的規則決定要算繪哪些訊息 */
  private renderList(): void {
    const n = this.n;
    const doc = this.doc;
    if (!n || !doc) return;
    const msgs = this.messages;
    const keys = msgs.map(keyOf);
    const size = (k: string) => this.sizes.get(k) ?? 0;
    const starts: number[] = [];
    let total = 0;
    for (const k of keys) {
      starts.push(total);
      total += size(k);
    }
    n.outer.style.height = `${total}px`;
    /* 清單本身的高度（含內距；與 CCFOLIA 用的虛擬捲動套件一樣量外框）為 0 時不算繪任何訊息 */
    const H = n.log.getBoundingClientRect().height;
    let lo = 0;
    let hi = -1;
    if (H > 0 && msgs.length) {
      if (this.stick) n.log.scrollTop = n.log.scrollHeight;
      const top = n.log.scrollTop;
      let first = keys.findIndex((k, i) => starts[i] + size(k) > top);
      if (first < 0) first = msgs.length - 1;
      let last = first;
      while (last < msgs.length - 1 && starts[last + 1] < top + H) last++;
      lo = Math.max(0, first - this.overscan);
      hi = Math.min(msgs.length - 1, last + this.overscan);
    }
    const want = new Set(keys.slice(lo, hi + 1));
    for (const [k, el] of this.nodes) {
      if (!want.has(k)) {
        this.ro?.unobserve(el);
        el.remove();
        this.nodes.delete(k);
      }
    }
    let prev: HTMLElement | null = null;
    for (let i = lo; i <= hi; i++) {
      const k = keys[i];
      let el = this.nodes.get(k);
      if (!el) {
        el = this.buildItem(doc, msgs[i], i);
        this.nodes.set(k, el);
        this.ro?.observe(el);
      } else if (el.getAttribute('data-index') !== String(i))
        el.setAttribute('data-index', String(i));
      if (prev ? prev.nextSibling !== el : n.inner.firstChild !== el) {
        if (prev) prev.after(el);
        else n.inner.prepend(el);
      }
      prev = el;
    }
    n.inner.style.transform = `translateY(${hi >= lo ? starts[lo] : 0}px)`;
    /* 量測（被隱藏的訊息量到 0）；有變動就再算一次 */
    let changed = false;
    for (let i = lo; i <= hi; i++) {
      const k = keys[i];
      const el = this.nodes.get(k);
      if (!el) continue;
      const hgt = Math.round(el.getBoundingClientRect().height * 100) / 100;
      if (this.sizes.get(k) !== hgt) {
        this.sizes.set(k, hgt);
        changed = true;
      }
    }
    if (changed) {
      let t = 0;
      for (const k of keys) t += size(k);
      n.outer.style.height = `${t}px`;
      if (this.stick) n.log.scrollTop = n.log.scrollHeight;
      this.scheduleRender();
    }
  }
}

export const createChatScene = (
  state?: Partial<ChatSceneState>,
  options?: { overscan?: number },
): ChatScene => new ChatScene(state, options);
