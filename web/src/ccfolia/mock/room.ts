/**
 * 模擬 CCFOLIA 的房間畫面（/rooms/{房間ID}）與發言時出現的訊息框。結構見 dom.ts 的 MESSAGE_BOX，
 * 原本的外觀與節奏依 message-box 規格 3.1.3、3.1.4、4.2：
 * - 發言排隊、一則一則顯示；逐字打出（每字約 80 ms，「。」「、」「,」「.」或換行後停約 800 ms），每打一字捲到最底；
 * - 打完約 1.2 秒後換下一則，最後一則一直留著；略過立刻換下一則；
 * - 由下往上滑入（約 225 ms、減速），關閉時往下滑出（約 195 ms、加速）後在根元素的 style 寫入 visibility: hidden；
 * - 訊息框元件只建立一次（換訊息時只換文字、立繪、骰子圖；骰子圖每次都是新的 img）；
 * - 秘密骰：內文換成「シークレットダイス」，沒有骰子圖與結果；
 * - 視窗寬 < 900／< 600 px 時立繪與骰子圖縮小（以 media query 重現，所以預覽 iframe 的寬度要等於來源寬度）。
 *
 * 盤面、棋子、上方列、聊天欄等其他部分是「替身」：結構不穩定也不在規格範圍，產生的 CSS 不能依賴它們，
 * 但要能讓它們全部看不見（替身也用 MUI 的 class，接近真實頁面）。
 */
import {
  classifyDiceResult,
  DICE_RESULT_CLASS,
  messageBoxResultText,
  SECRET_DICE_MESSAGE_BOX_TEXT,
} from '../dice';
import { MESSAGE_BOX, MESSAGE_BOX_TIMING } from '../dom';
import { mockAvatar, mockDie } from './assets';
import {
  addStyle,
  defaultTimers,
  fakeHash,
  h,
  type MockScene,
  resetBody,
  svg,
  type Timers,
} from './shared';

export interface MockDie {
  /** 面數（10＝十面骰；1D100 用兩顆：十位與個位） */
  faces: number;
  value: number;
}

export interface MockRoomMessage {
  /** 發言者名稱 */
  name: string;
  /** 內文 */
  text: string;
  /** 立繪網址；沒有立繪（或角色設定發言時不顯示）時 null */
  portrait?: string | null;
  /** 擲骰結果全文（例：'(1D100<=50) ＞ 23 ＞ 成功'）；訊息框只顯示最後一段 */
  result?: string | null;
  /** 骰子圖（只在房間設定開「旧ダイス演出を利用する」時才有） */
  dice?: readonly MockDie[];
  /** 秘密骰 */
  secret?: boolean;
}

export type RoomPhase = 'empty' | 'typing' | 'waiting' | 'shown' | 'closed';

export interface RoomSceneOptions {
  /** 立即顯示完整內文、不播滑入（截圖比對用） */
  instant?: boolean;
  timing?: Partial<typeof MESSAGE_BOX_TIMING>;
  /** 狀態改變時通知（例如打完一則、關閉） */
  onPhaseChange?: (phase: RoomPhase, message: MockRoomMessage | null) => void;
  timers?: Timers;
}

const C = {
  app: fakeHash('rm-app'),
  bar: fakeHash('rm-bar'),
  main: fakeHash('rm-main'),
  board: fakeHash('rm-board'),
  piece: fakeHash('rm-piece'),
  chat: fakeHash('rm-chat'),
  chatLine: fakeHash('rm-chat-line'),
  fab: fakeHash('rm-fab'),
  root: fakeHash('rm-mb-root'),
  portrait: fakeHash('rm-mb-portrait'),
  box: fakeHash('rm-mb-box'),
  dice: fakeHash('rm-mb-dice'),
  die: fakeHash('rm-mb-die'),
  toolbar: fakeHash('rm-mb-toolbar'),
  name: fakeHash('rm-mb-name'),
  spacer: fakeHash('rm-mb-spacer'),
  button: fakeHash('rm-mb-button'),
  body: fakeHash('rm-mb-body'),
  text: fakeHash('rm-mb-text'),
};

const PAPER_SHADOW =
  '0px 3px 5px -1px rgba(0,0,0,0.2),0px 6px 10px 0px rgba(0,0,0,0.14),0px 1px 18px 0px rgba(0,0,0,0.12)';
const PAPER_OVERLAY = 'linear-gradient(rgba(255, 255, 255, 0.11), rgba(255, 255, 255, 0.11))';

/** 頁面原本的樣式（message-box 規格 3.1.3） */
const ORIGINAL_CSS = `
html, body, #root { height: 100%; }
body { margin: 0; background-color: #121212; color: #fff; font-family: Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.43; overflow: hidden; }
.MuiPaper-root { background-color: #121212; color: #fff; border-radius: 4px; box-shadow: ${PAPER_SHADOW}; background-image: ${PAPER_OVERLAY}; }
.${C.app} { display: flex; flex-direction: column; height: 100%; }
.${C.bar} { display: flex; align-items: center; gap: 8px; min-height: 48px; padding: 0 16px; background-color: #212121; border-radius: 0; flex-shrink: 0; }
.${C.bar} span { font-size: 16px; font-weight: 500; }
.${C.main} { position: relative; display: flex; flex: 1; min-height: 0; }
.${C.board} { position: relative; flex: 1; overflow: hidden; background-color: #3c4a3a;
  background-image: linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px); background-size: 48px 48px; }
.${C.piece} { position: absolute; width: 56px; height: 56px; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,0.5); }
.${C.piece} img { width: 100%; height: 100%; display: block; }
.${C.chat} { width: 300px; flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; padding: 8px 12px; border-radius: 0; overflow: hidden; }
.${C.chatLine} { font-size: 13px; color: rgba(255,255,255,0.8); }
.${C.fab} { position: absolute; right: 316px; bottom: 16px; width: 56px; height: 56px; border-radius: 50%; border: 0; background: #90caf9; color: #000; font-size: 24px; box-shadow: ${PAPER_SHADOW}; }
.${C.root} { position: absolute; left: 16px; right: 88px; bottom: 16px; max-width: 720px; margin: 0 auto; z-index: 102; }
.${C.portrait} { position: absolute; bottom: 100%; left: 8px; width: 240px; height: auto; z-index: -1; transform-origin: center bottom; pointer-events: none; }
.${C.box} { position: relative; background-color: rgba(22, 22, 22, 0.84); color: #f5f5f5; }
.${C.dice} { position: absolute; bottom: 100%; right: 16px; margin-left: 180px; max-width: calc(100% - 196px); display: flex; flex-wrap: wrap-reverse; justify-content: center; z-index: -1; }
.${C.die} { width: 75px; height: 75px; animation: tk-mock-dice-in 600ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
@keyframes tk-mock-dice-in { from { transform: scale(0) rotate(0deg); opacity: 0; } to { transform: scale(1) rotate(720deg); opacity: 1; } }
.${C.toolbar} { position: relative; display: flex; align-items: center; min-height: 48px; padding-left: 16px; padding-right: 16px; }
.${C.name} { margin: 0; font-size: 14px; font-weight: 500; line-height: 1.57; }
.${C.toolbar} > p { margin: 0 0 0 16px; font-size: 14px; line-height: 1.43; }
.${DICE_RESULT_CLASS.success} { color: #2196f3; }
.${DICE_RESULT_CLASS.failure} { color: #dc004e; }
.${DICE_RESULT_CLASS.other} { color: rgba(255, 255, 255, 0.7); }
.${C.spacer} { flex-grow: 1; }
.${C.button} { display: inline-flex; align-items: center; justify-content: center; padding: 12px; margin: 0; border: 0; border-radius: 50%; background: transparent; color: inherit; cursor: pointer; }
.${C.button}:last-child { margin-right: -12px; }
.${C.button} svg { width: 28px; height: 28px; fill: currentColor; }
.${C.body} { height: 80px; padding: 0 24px 16px; overflow-y: auto; }
.${C.text} { margin: 0; font-size: 16px; line-height: 1.5; white-space: pre-wrap; }
@media (min-width: 600px) { .${C.toolbar} { padding-left: 24px; padding-right: 24px; } }
@media (max-width: 899.95px) {
  .${C.portrait} { width: 180px; }
  .${C.dice} { margin-left: 60px; max-width: calc(100% - 76px); }
  .${C.die} { width: 50px; height: 50px; }
  .${C.chat} { display: none; }
  .${C.fab} { right: 16px; }
}
@media (max-width: 599.95px) { .${C.portrait} { width: 120px; } }
`;

const ICON_SKIP = 'M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z';
const ICON_CLOSE =
  'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z';

export class RoomScene implements MockScene {
  private opts: RoomSceneOptions;
  private timing: typeof MESSAGE_BOX_TIMING;
  private timers: Timers;
  private doc: Document | null = null;
  private queue: MockRoomMessage[] = [];
  private current: MockRoomMessage | null = null;
  private chars: string[] = [];
  private typed = 0;
  private phaseValue: RoomPhase = 'empty';
  private timer: unknown = null;
  private slideTimer: unknown = null;
  /** 訊息框是否已經建立（建立一次後就留著） */
  private created = false;
  private hidden = false;
  private n: {
    root: HTMLElement;
    portrait: HTMLImageElement;
    box: HTMLElement;
    dice: HTMLElement;
    toolbar: HTMLElement;
    name: HTMLElement;
    result: HTMLElement;
    body: HTMLElement;
    text: HTMLElement;
    board: HTMLElement;
  } | null = null;

  constructor(opts: RoomSceneOptions = {}) {
    this.opts = opts;
    this.timing = { ...MESSAGE_BOX_TIMING, ...opts.timing };
    this.timers = opts.timers ?? defaultTimers;
  }

  /** 目前狀態：empty（還沒有發言）、typing、waiting（打完等下一則）、shown（最後一則留著）、closed */
  get phase(): RoomPhase {
    return this.phaseValue;
  }

  /** 排隊中的則數（不含正在顯示的） */
  get pending(): number {
    return this.queue.length;
  }

  get message(): MockRoomMessage | null {
    return this.current;
  }

  /** 立即顯示模式（截圖比對用）：打字與滑入都略過 */
  setInstant(instant: boolean): void {
    this.opts = { ...this.opts, instant };
    if (instant && this.phaseValue === 'typing') {
      this.typed = this.chars.length;
      this.clearTimer();
      this.renderMessage();
      this.afterTyped();
    }
  }

  /** 發言（排隊） */
  send(message: MockRoomMessage): void {
    this.queue.push(message);
    if (this.phaseValue === 'empty' || this.phaseValue === 'shown' || this.phaseValue === 'closed')
      this.next();
  }

  /** 按略過：立刻換下一則（沒有下一則時把這則打完） */
  skip(): void {
    if (this.queue.length) this.next();
    else if (this.current) {
      this.clearTimer();
      this.typed = this.chars.length;
      this.renderMessage();
      this.setPhase('shown');
    }
  }

  /** 按關閉：滑出後隱藏，下一則發言時再出現 */
  close(): void {
    if (!this.created || this.hidden) return;
    this.clearTimer();
    this.hidden = true;
    this.setPhase('closed');
    this.slideOut();
  }

  /** 清掉排隊中的訊息並移除訊息框（重新開始） */
  reset(): void {
    this.clearTimer();
    if (this.slideTimer) this.timers.clearTimeout(this.slideTimer);
    this.slideTimer = null;
    this.queue = [];
    this.current = null;
    this.chars = [];
    this.typed = 0;
    this.created = false;
    this.hidden = false;
    this.n?.root.remove();
    this.setPhase('empty');
  }

  mount(doc: Document): () => void {
    this.doc = doc;
    resetBody(doc);
    addStyle(doc, ORIGINAL_CSS, 'ccfolia-room');
    this.build(doc);
    if (this.created) {
      this.n?.board.append(this.n.root);
      this.renderMessage();
      if (this.hidden) this.n?.root.setAttribute('style', 'visibility: hidden;');
    }
    return () => {
      if (this.doc === doc) {
        this.doc = null;
        this.n = null;
      }
    };
  }

  /** 卸載時也停止計時 */
  dispose(): void {
    this.clearTimer();
    if (this.slideTimer) this.timers.clearTimeout(this.slideTimer);
  }

  private setPhase(p: RoomPhase): void {
    this.phaseValue = p;
    this.opts.onPhaseChange?.(p, this.current);
  }

  private clearTimer(): void {
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = null;
  }

  private build(doc: Document): void {
    const pieces = [0, 1, 2].map((i) =>
      h(
        doc,
        'div',
        { class: C.piece, style: `left: ${80 + i * 140}px; top: ${60 + (i % 2) * 90}px;` },
        [h(doc, 'img', { src: mockAvatar(i + 1), alt: '' })],
      ),
    );
    const board = h(doc, 'div', { class: C.board }, pieces);
    const chat = h(
      doc,
      'div',
      { class: `MuiPaper-root MuiPaper-elevation MuiDrawer-paper ${C.chat}` },
      [
        h(doc, 'div', { class: C.chatLine }, ['（聊天欄的替身）']),
        h(doc, 'div', { class: C.chatLine }, ['GM：歡迎來到這次的冒險。']),
        h(doc, 'div', { class: C.chatLine }, ['PL：準備好了！']),
      ],
    );
    const app = h(doc, 'div', { class: C.app }, [
      h(
        doc,
        'header',
        { class: `MuiPaper-root MuiAppBar-root MuiAppBar-positionStatic ${C.bar}` },
        [h(doc, 'span', {}, ['（上方列的替身）'])],
      ),
      h(doc, 'div', { class: C.main }, [
        board,
        chat,
        h(
          doc,
          'button',
          {
            class: `MuiButtonBase-root MuiFab-root ${C.fab}`,
            type: 'button',
            'aria-label': '替身按鈕',
          },
          ['＋'],
        ),
      ]),
    ]);
    doc.body.append(h(doc, 'div', { id: 'root' }, [app]));

    const portrait = h(doc, 'img', { class: C.portrait, alt: '' }) as HTMLImageElement;
    const dice = h(doc, 'div', { class: C.dice });
    const name = h(doc, 'h6', { class: `MuiTypography-root MuiTypography-subtitle2 ${C.name}` });
    const result = h(doc, 'p', { class: 'MuiTypography-root MuiTypography-body2' });
    const iconButton = (label: string, path: string) =>
      h(
        doc,
        'button',
        {
          class: `MuiButtonBase-root MuiIconButton-root MuiIconButton-sizeMedium ${C.button}`,
          type: 'button',
          tabindex: '0',
          'aria-label': label,
        },
        [svg(doc, '0 0 24 24', [path], { class: 'MuiSvgIcon-root' })],
      );
    const skip = iconButton(MESSAGE_BOX.skipLabel, ICON_SKIP);
    const close = iconButton(MESSAGE_BOX.closeLabel, ICON_CLOSE);
    skip.addEventListener('click', () => this.skip());
    close.addEventListener('click', () => this.close());
    const toolbar = h(
      doc,
      'div',
      { class: `MuiToolbar-root MuiToolbar-gutters MuiToolbar-dense ${C.toolbar}` },
      [name, h(doc, 'div', { class: C.spacer }), skip, close],
    );
    const text = h(doc, 'p', { class: `MuiTypography-root MuiTypography-body1 ${C.text}` });
    const body = h(doc, 'div', { class: C.body }, [text]);
    const box = h(
      doc,
      'div',
      { class: `MuiPaper-root MuiPaper-elevation MuiPaper-rounded MuiPaper-elevation6 ${C.box}` },
      [dice, toolbar, body],
    );
    const root = h(
      doc,
      'div',
      {
        class: `MuiPaper-root MuiPaper-elevation MuiPaper-rounded MuiPaper-elevation6 ${C.root}`,
        ...MESSAGE_BOX.rootAttributes,
      },
      [box],
    );
    this.n = { root, portrait, box, dice, toolbar, name, result, body, text, board };
  }

  private next(): void {
    this.clearTimer();
    const msg = this.queue.shift();
    if (!msg) return;
    this.current = msg;
    const text = msg.secret ? SECRET_DICE_MESSAGE_BOX_TEXT : msg.text;
    this.chars = Array.from(text);
    this.typed = this.opts.instant ? this.chars.length : 0;
    const wasHidden = !this.created || this.hidden;
    this.created = true;
    this.hidden = false;
    this.renderMessage(true);
    if (wasHidden) this.slideIn();
    if (this.opts.instant) {
      this.afterTyped();
    } else {
      this.setPhase('typing');
      this.scheduleType(this.timing.charMs);
    }
  }

  private scheduleType(ms: number): void {
    this.timer = this.timers.setTimeout(() => this.typeOne(), ms);
  }

  private typeOne(): void {
    this.timer = null;
    if (this.typed >= this.chars.length) {
      this.afterTyped();
      return;
    }
    this.typed++;
    this.renderText();
    if (this.typed >= this.chars.length) {
      this.afterTyped();
      return;
    }
    const last = this.chars[this.typed - 1];
    this.scheduleType(
      this.timing.pauseAfter.includes(last) ? this.timing.pauseMs : this.timing.charMs,
    );
  }

  private afterTyped(): void {
    this.setPhase('waiting');
    this.timer = this.timers.setTimeout(
      () => {
        this.timer = null;
        if (this.queue.length) this.next();
        else this.setPhase('shown');
      },
      this.opts.instant ? 0 : this.timing.nextMs,
    );
  }

  private renderText(): void {
    const n = this.n;
    if (!n) return;
    n.text.textContent = this.chars.slice(0, this.typed).join('');
    /* CCFOLIA 每打一字就把內文區捲到最底 */
    n.body.scrollTop = n.body.scrollHeight;
  }

  private renderMessage(newMessage = false): void {
    const n = this.n;
    const doc = this.doc;
    const msg = this.current;
    if (!n || !doc || !msg) return;
    if (!n.root.isConnected) n.board.append(n.root);
    /* 立繪：有立繪時是第一個子元素 */
    if (msg.portrait) {
      if (n.portrait.getAttribute('src') !== msg.portrait)
        n.portrait.setAttribute('src', msg.portrait);
      if (n.root.firstElementChild !== n.portrait) n.root.prepend(n.portrait);
    } else n.portrait.remove();
    n.name.textContent = msg.name;
    /* 擲骰結果：「🎲 」＋最後一段；秘密骰沒有 */
    if (msg.result && !msg.secret) {
      const outcome = classifyDiceResult(msg.result);
      n.result.className = `MuiTypography-root MuiTypography-body2 ${DICE_RESULT_CLASS[outcome]}`;
      n.result.textContent = messageBoxResultText(msg.result);
      if (!n.result.isConnected) n.name.after(n.result);
    } else n.result.remove();
    /* 骰子圖：每次擲骰都是新的 img（依序間隔 0.1 秒出現） */
    if (newMessage) {
      n.dice.replaceChildren(
        ...(msg.secret ? [] : (msg.dice ?? [])).map((d, i) =>
          h(doc, 'img', {
            class: C.die,
            src: mockDie(d.faces, d.value),
            alt: '',
            style: `animation-delay: ${i * this.timing.diceStaggerMs}ms;`,
          }),
        ),
      );
    }
    this.renderText();
  }

  private offset(): number {
    const n = this.n;
    const view = this.doc?.defaultView;
    if (!n || !view) return 0;
    const prev = n.root.style.transform;
    n.root.style.transform = 'none';
    const top = n.root.getBoundingClientRect().top;
    n.root.style.transform = prev;
    return Math.max(0, Math.round(view.innerHeight - top));
  }

  private slideIn(): void {
    const n = this.n;
    if (this.slideTimer) this.timers.clearTimeout(this.slideTimer);
    this.slideTimer = null;
    if (!n) return;
    if (this.opts.instant) {
      n.root.removeAttribute('style');
      return;
    }
    const y = this.offset();
    n.root.setAttribute('style', `transform: translateY(${y}px);`);
    void n.root.getBoundingClientRect();
    n.root.setAttribute(
      'style',
      `transform: none; transition: transform ${this.timing.slideInMs}ms ${this.timing.slideInEasing} 0ms;`,
    );
  }

  private slideOut(): void {
    const n = this.n;
    if (!n) return;
    const y = this.offset();
    if (this.opts.instant) {
      n.root.setAttribute('style', `transform: translateY(${y}px); visibility: hidden;`);
      return;
    }
    n.root.setAttribute(
      'style',
      `transform: translateY(${y}px); transition: transform ${this.timing.slideOutMs}ms ${this.timing.slideOutEasing} 0ms;`,
    );
    this.slideTimer = this.timers.setTimeout(() => {
      this.slideTimer = null;
      if (this.hidden && this.n)
        this.n.root.setAttribute('style', `transform: translateY(${y}px); visibility: hidden;`);
    }, this.timing.slideOutMs);
  }
}

export const createRoomScene = (opts?: RoomSceneOptions): RoomScene => new RoomScene(opts);
