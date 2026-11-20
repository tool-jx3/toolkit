/**
 * 「隱藏介面」預覽用的 CCFOLIA 房間畫面（模擬）。
 *
 * 房間畫面裡盤面、棋子、各種按鈕的結構不在本站的觀察範圍（message-box 規格 3.1.2），這裡的結構是**從
 * roomUi.ts 的選擇器反推**的：每個部分做成一塊標著名字的替身，元素、class、屬性剛好符合那個選擇器，
 * 讓使用者看得出勾了哪些、會消掉哪一塊。和真的 CCFOLIA 是否一致要以 OBS 為準（規格 3.9.3）。
 *
 * 聊天欄用 @/ccfolia/mock 的聊天頁模擬（同一個元件），所以「後面接上聊天視窗的 CSS」時也看得到聊天視窗。
 * 2026-11-20 同時有別的工作在改 @/ccfolia/，先放在工具目錄（之後和 roomUi.ts 的選擇器一起搬，D4）。
 */
import { MESSAGE_BOX } from '@/ccfolia';
import { mockAvatar, mockDie } from '@/ccfolia/mock/assets';
import { type ChatScene, createChatScene } from '@/ccfolia/mock/chat';
import { addStyle, h, type MockScene } from '@/ccfolia/mock/shared';
import { sampleTabs } from './samples';

/** 預覽的大小（房間畫面常用 16:9；只影響預覽） */
export const ROOM_PREVIEW_SIZE = { width: 1280, height: 720 } as const;

/** 右邊聊天欄的寬度（模擬） */
const CHAT_WIDTH = 320;

const svgUri = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;

/** 有文字的範例圖（前景、背景用） */
function labelImage(w: number, h: number, text: string, from: string, to: string): string {
  return svgUri(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}' width='${w}' height='${h}'>` +
      `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${from}'/><stop offset='1' stop-color='${to}'/></linearGradient></defs>` +
      `<rect width='${w}' height='${h}' fill='url(#g)'/>` +
      `<g stroke='rgba(255,255,255,0.18)' stroke-width='1'>${Array.from({ length: Math.floor(w / 40) }, (_, i) => `<line x1='${(i + 1) * 40}' y1='0' x2='${(i + 1) * 40}' y2='${h}'/>`).join('')}${Array.from({ length: Math.floor(h / 40) }, (_, i) => `<line x1='0' y1='${(i + 1) * 40}' x2='${w}' y2='${(i + 1) * 40}'/>`).join('')}</g>` +
      `<text x='16' y='34' font-size='22' font-family='sans-serif' fill='#ffffff' opacity='0.9'>${text}</text>` +
      `</svg>`,
  );
}

const ROOM_CSS = `
body { background-color: #121212; }
#root > div:first-child { padding: 0; position: relative; height: 100%; }
.MuiDrawer-root > .MuiDrawer-paper { width: ${CHAT_WIDTH}px; }
.tk-room-tag { position: absolute; left: 4px; top: 4px; z-index: 3; padding: 1px 6px; border-radius: 3px; background: rgba(0, 0, 0, 0.66); color: #fff; font: 12px/1.5 sans-serif; white-space: nowrap; pointer-events: none; }
.tk-room-bg { position: fixed; inset: 0; z-index: 0; background: linear-gradient(160deg, #2c3e5c 0%, #6b4a6e 55%, #c27a5a 100%); }
.tk-room-bg > .tk-room-tag { left: auto; right: ${CHAT_WIDTH + 12}px; top: 112px; }
header.MuiAppBar-positionFixed { position: fixed; z-index: 1100; top: 0; left: 0; right: ${CHAT_WIDTH}px; height: 48px; display: flex; align-items: center; gap: 12px; padding: 0 16px; box-sizing: border-box; background: #212121; color: #fff; font: 500 16px/1 sans-serif; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4); }
header.MuiAppBar-positionFixed .tk-room-tag { position: static; }
.tk-room-container { position: absolute; top: 48px; bottom: 0; left: 0; z-index: 1; }
.tk-room-board { position: absolute; inset: 0; overflow: hidden; }
.tk-room-board > .tk-room-tag { top: 104px; }
.tk-room-translate { position: absolute; left: 0; top: 0; }
.tk-room-scale { position: relative; transform-origin: 0 0; }
.tk-room-fg { position: absolute; left: 0; top: 0; width: 600px; height: 360px; }
.tk-room-fg img { display: block; width: 600px; height: 360px; }
.tk-room-obj { position: absolute; }
.tk-room-obj figure { margin: 0; position: relative; width: 72px; height: 72px; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5); }
.tk-room-obj figure img { display: block; width: 100%; height: 100%; }
.tk-room-panel { position: relative; display: flex; align-items: flex-end; justify-content: center; box-sizing: border-box; padding: 6px; border: 2px dashed rgba(255, 255, 255, 0.7); background: rgba(255, 255, 255, 0.16); color: #fff; font: 13px/1.4 sans-serif; }
.tk-room-cards { width: 70px; height: 96px; border-radius: 6px; background: repeating-linear-gradient(45deg, #2d5aa0 0 8px, #3d6ab0 8px 16px); border: 2px solid #fff; position: relative; }
.tk-room-dice-face { position: relative; }
.tk-room-dice-face img { display: block; width: 56px; height: 56px; }
.tk-room-dice-face .tk-room-tag { top: auto; bottom: -22px; }
.tk-room-rolling { position: relative; width: 100%; height: 100%; }
.tk-room-rolling-die { position: absolute; width: 64px; height: 64px; }
.tk-room-tools { position: absolute; right: 16px; top: 16px; display: flex; align-items: center; gap: 6px; }
.tk-room-tools button, .tk-room-fab { border: 0; border-radius: 50%; width: 40px; height: 40px; background: #424242; color: #fff; font-size: 20px; }
.tk-room-tools span { color: #fff; font: 13px/1 sans-serif; }
.tk-room-hint { padding: 4px 8px; border-radius: 4px; background: rgba(0, 0, 0, 0.6); color: #fff; font: 12px/1.4 sans-serif; }
.tk-room-bgm { position: absolute; right: 16px; bottom: 16px; display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 18px; background: rgba(33, 33, 33, 0.9); color: #fff; font: 13px/1.4 sans-serif; }
.tk-room-status { position: fixed; z-index: 2; top: 60px; left: 12px; display: flex; flex-direction: column; gap: 6px; }
.tk-room-status-row { display: flex; align-items: center; gap: 6px; }
.tk-room-status-row .MuiBadge-root img { display: block; width: 36px; height: 36px; border-radius: 50%; }
.tk-room-status-bars .tk-room-tag { position: static; display: inline-block; margin: 0 0 2px; }
.tk-room-status-bars { width: 110px; padding: 3px 6px; border-radius: 4px; background: rgba(0, 0, 0, 0.6); color: #fff; font: 11px/1.4 sans-serif; }
.tk-room-status-bars i { display: block; height: 4px; margin-top: 2px; background: #4caf50; }
.tk-room-timer .tk-room-tag { top: -22px; left: 0; }
.tk-room-timer { position: fixed; z-index: 2; top: 76px; left: 470px; transform: translateX(-50%); padding: 4px 18px; border-radius: 4px; background: #1e1e1e; color: #fff; font: 600 28px/1.3 sans-serif; box-shadow: 0 3px 5px rgba(0, 0, 0, 0.4); }
.tk-room-mb { position: absolute; z-index: 102; left: 16px; right: ${CHAT_WIDTH + 88}px; bottom: 16px; max-width: 720px; }
.tk-room-mb > .MuiPaper-root { position: relative; background: rgba(22, 22, 22, 0.84); color: #f5f5f5; border-radius: 4px; }
.tk-room-mb h6 { margin: 0; padding: 12px 24px 0; font: 500 14px/1.57 sans-serif; }
.tk-room-mb p { margin: 0; padding: 4px 24px 16px; font: 16px/1.5 sans-serif; }
.tk-room-cutin { position: fixed; z-index: 1300; left: 0; right: ${CHAT_WIDTH}px; top: 484px; height: 48px; display: flex; align-items: center; justify-content: center; background: linear-gradient(90deg, transparent, rgba(180, 30, 60, 0.85) 20%, rgba(180, 30, 60, 0.85) 80%, transparent); color: #fff; font: 700 24px/1 sans-serif; letter-spacing: 0.2em; }
.tk-room-fab-wrap { position: fixed; z-index: 2; right: ${CHAT_WIDTH + 16}px; bottom: 64px; }
.tk-room-fab { position: relative; }
.tk-room-fab .tk-room-tag { left: auto; right: 46px; top: 9px; }
.tk-room-ad { position: fixed; z-index: 1350; left: 790px; top: 260px; width: 160px; }
.tk-room-ad > div { position: relative; height: 100px; border-radius: 6px; background: #000; color: #ddd; display: flex; align-items: center; justify-content: center; font: 14px/1.4 sans-serif; border: 1px solid #555; }
.tk-room-snack { position: fixed; z-index: 1400; left: 0; right: ${CHAT_WIDTH}px; bottom: 154px; display: flex; justify-content: center; }
.tk-room-snack > div { position: relative; padding: 6px 16px 6px 16px; border-radius: 4px; background: #323232; color: #fff; font: 14px/1.43 sans-serif; }
.tk-room-snack .tk-room-tag, .tk-room-tools .tk-room-tag, .tk-room-bgm .tk-room-tag, .tk-room-hint .tk-room-tag { position: static; margin-right: 6px; }
`;

/** 骰子符號的圖片網址（CCFOLIA 的骰子圖在「…_dice/」底下；替身只用來比對屬性） */
const DIE_SRC = 'https://ccfolia.com/images/dice/basic_dice/6_4.png';

export class RoomUiScene implements MockScene {
  readonly chat: ChatScene;
  private labels: Record<string, string>;
  private chatTag: HTMLElement | null = null;
  private chatTagShown = true;

  constructor(labels: Record<string, string>) {
    this.labels = labels;
    this.chat = createChatScene({ tabs: sampleTabs(), selected: 0 });
  }

  /** 聊天欄的名字（接上聊天視窗的 CSS 時不顯示，免得蓋在聊天視窗上） */
  showChatTag(shown: boolean): void {
    this.chatTagShown = shown;
    if (this.chatTag) this.chatTag.style.display = shown ? '' : 'none';
  }

  mount(doc: Document): () => void {
    const unmount = this.chat.mount(doc);
    addStyle(doc, ROOM_CSS, 'ccfolia-room-ui');
    const wrapper = doc.querySelector('#root > div:first-child');
    if (wrapper) {
      const drawer = wrapper.firstElementChild;
      for (const el of this.build(doc)) wrapper.insertBefore(el, drawer);
    }
    this.chatTag = this.tag(doc, 'chat');
    doc.querySelector('.MuiDrawer-paper')?.append(this.chatTag);
    this.showChatTag(this.chatTagShown);
    return () => {
      this.chatTag = null;
      unmount();
    };
  }

  private tag(doc: Document, key: string): HTMLElement {
    return h(doc, 'span', { class: 'tk-room-tag' }, [this.labels[key] ?? key]);
  }

  private build(doc: Document): HTMLElement[] {
    const t = (k: string) => this.tag(doc, k);
    const obj = (left: number, top: number, child: HTMLElement) =>
      h(
        doc,
        'div',
        { 'data-field-object': '', class: 'tk-room-obj', style: `left: ${left}px; top: ${top}px;` },
        [child],
      );
    const piece = (seed: number) =>
      h(doc, 'figure', {}, [h(doc, 'img', { src: mockAvatar(seed), alt: '' }), t('characters')]);
    const panel = (cls: string, key: string, w: number, hgt: number) =>
      h(doc, 'div', { class: `${cls} tk-room-panel`, style: `width: ${w}px; height: ${hgt}px;` }, [
        t(key),
      ]);

    /* 標題列、背景（標題列的下一個是背景：ccfoliaCSS 1.36.2 的寫法也對得上） */
    const header = h(
      doc,
      'header',
      { class: 'MuiPaper-root MuiAppBar-root MuiAppBar-positionFixed' },
      [t('header'), '探索者們的房間'],
    );
    const bg = h(doc, 'div', { class: 'sc-bKoKAZ tk-room-bg' }, [t('background')]);

    /* 盤面：移動、縮放容器裡的前景與盤面上的物件 */
    const scale = h(doc, 'div', { class: 'tk-room-scale', style: 'transform: scale(1);' }, [
      h(
        doc,
        'div',
        {
          class: 'tk-room-fg',
          style: 'width: 600px; height: 360px; outline: 2px solid rgba(255, 255, 255, 0.85);',
        },
        [
          h(doc, 'img', {
            src: labelImage(600, 360, `${this.labels.foreground ?? ''}`, '#3f5d48', '#2b3b52'),
            alt: '',
          }),
        ],
      ),
      obj(110, 150, piece(0)),
      obj(210, 230, piece(1)),
      obj(310, 120, piece(6)),
      obj(410, 30, panel('sc-ezjsFQ', 'markerPanel', 170, 96)),
      obj(410, 160, panel('sc-iuhWPH', 'screenPanel', 170, 96)),
      obj(20, 200, h(doc, 'div', { class: 'sc-iiBnab tk-room-cards' }, [t('cardDeck')])),
      obj(
        330,
        270,
        h(doc, 'div', { class: 'tk-room-dice', 'aria-label': 'KP のダイス [1D6]' }, [
          /* 真的 CCFOLIA 是 img（src 含「_dice/」）；替身用帶 src 屬性的 div，名字才能跟著一起消失 */
          h(doc, 'div', { src: DIE_SRC, class: 'tk-room-dice-face' }, [
            h(doc, 'img', { src: mockDie(6, 4), alt: '' }),
            t('diceSymbol'),
          ]),
        ]),
      ),
    ]);
    const translate = h(
      doc,
      'div',
      { class: 'tk-room-translate', style: 'transform: translate(170px, 64px);' },
      [scale],
    );
    const rolling = h(
      doc,
      'div',
      { style: 'position: relative; width: 100%; height: 100%; overflow: hidden;' },
      [
        h(doc, 'img', {
          class: 'tk-room-rolling-die',
          src: mockDie(20, 17),
          alt: '',
          style: 'left: 800px; top: 104px;',
        }),
        h(doc, 'img', {
          class: 'tk-room-rolling-die',
          src: mockDie(6, 2),
          alt: '',
          style: 'left: 870px; top: 140px;',
        }),
        h(doc, 'span', { class: 'tk-room-tag', style: 'left: 800px; top: 80px;' }, [
          this.labels.rollingDice ?? '',
        ]),
      ],
    );
    const board = h(doc, 'div', { class: 'tk-room-board' }, [t('board'), translate, rolling]);
    const tools = h(doc, 'div', { class: 'tk-room-tools' }, [
      h(doc, 'div', { class: 'tk-room-hint', 'aria-label': 'Ctrl + ドラッグ' }, [
        t('ctrlDrag'),
        '範囲選択',
      ]),
      h(doc, 'button', { type: 'button', 'aria-label': '盤面を拡大する' }, ['＋']),
      h(doc, 'span', {}, [t('zoom'), '100%']),
      h(doc, 'button', { type: 'button', 'aria-label': '盤面を縮小する' }, ['－']),
    ]);
    const bgm = h(doc, 'div', { class: 'tk-room-bgm' }, [t('bgm'), '♪ 雨の街角']);
    const container = h(
      doc,
      'div',
      { tabindex: '0', class: 'tk-room-container', style: `right: ${CHAT_WIDTH}px;` },
      [board, tools, bgm],
    );

    /* 角色狀態（畫面上的角色清單） */
    const statusRow = (seed: number, name: string, hp: number, tagged: boolean) =>
      h(doc, 'div', { class: 'sc-tkStatusRow tk-room-status-row' }, [
        h(doc, 'span', { class: 'MuiBadge-root sc-tkStatusBadge' }, [
          h(doc, 'img', { src: mockAvatar(seed), alt: '' }),
        ]),
        h(doc, 'div', { class: 'tk-room-status-bars' }, [
          tagged ? t('status') : null,
          `${name}　HP ${hp}`,
          h(doc, 'i', { style: `width: ${hp * 8}%;` }),
        ]),
      ]);
    const status = h(doc, 'div', { class: 'tk-room-status' }, [
      statusRow(0, '林晴', 10, true),
      statusRow(1, '卡洛斯', 7, false),
    ]);
    const timer = h(doc, 'div', { class: 'MuiPaper-root MuiPaper-elevation5 tk-room-timer' }, [
      t('timer'),
      '04:59',
    ]);

    /* 訊息框（message-box 規格 3.1 的結構） */
    const mb = h(
      doc,
      'div',
      {
        class: 'MuiPaper-root MuiPaper-elevation MuiPaper-rounded MuiPaper-elevation6 tk-room-mb',
        role: MESSAGE_BOX.rootAttributes.role,
        'aria-live': MESSAGE_BOX.rootAttributes['aria-live'],
        'aria-atomic': MESSAGE_BOX.rootAttributes['aria-atomic'],
        'aria-label': MESSAGE_BOX.rootAttributes['aria-label'],
      },
      [
        h(
          doc,
          'div',
          { class: 'MuiPaper-root MuiPaper-elevation MuiPaper-rounded MuiPaper-elevation6' },
          [
            t('messageBox'),
            h(doc, 'h6', {}, ['林晴']),
            h(doc, 'p', {}, ['這扇門後面……好像有什麼聲音。']),
          ],
        ),
      ],
    );
    const cutIn = h(doc, 'div', { open: '', class: 'tk-room-cutin' }, [t('cutIn'), 'SAN CHECK']);
    const fab = h(doc, 'div', { class: 'tk-room-fab-wrap' }, [
      h(doc, 'div', {}, [
        h(
          doc,
          'button',
          {
            type: 'button',
            class: 'MuiButtonBase-root MuiFab-root tk-room-fab',
            'aria-label': '編集',
          },
          ['✎', t('edit')],
        ),
      ]),
    ]);
    const ad = h(doc, 'div', { class: 'MuiDialog-root tk-room-ad', role: 'presentation' }, [
      h(doc, 'div', {}, [t('ads'), '（廣告影片）']),
    ]);
    const snack = h(doc, 'div', { class: 'MuiSnackbar-root tk-room-snack' }, [
      h(doc, 'div', { role: 'alert' }, [t('monitoring'), '監視モード中です']),
    ]);
    return [header, bg, container, status, timer, mb, cutIn, fab, ad, snack];
  }
}
