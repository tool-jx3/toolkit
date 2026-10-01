/**
 * 模擬 CCFOLIA 的角色狀態頁（/rooms/{房間ID}/characters/{角色ID}）。結構見 dom.ts 的 CHARACTER_PAGE，
 * 原本的外觀依 status-bar 規格 3.1.4（沒有自訂 CSS 時的樣子），用來確認產生的 CSS 確實蓋過它們。
 *
 * 數值改變時跟 CCFOLIA 一樣只改文字與屬性（填充的 style 寬度、目前值的 color 屬性、徽章的 class），
 * 元素不重建，所以 CSS 的轉場與動畫會接續播放。
 *
 * ```ts
 * const scene = createCharacterScene({ statuses: [{ label: 'HP', value: 10, max: 12 }], initiative: 12 });
 * <CssPreviewFrame scene={scene} css={css} … />
 * scene.update({ statuses: [{ label: 'HP', value: 3, max: 12 }] });
 * ```
 */
import { currentColorAttr, fillStyleAttr } from '../character';
import { CHARACTER_PAGE, MAX_STATUS_BARS } from '../dom';
import { mockAvatar } from './assets';
import { addStyle, fakeHash, h, type MockScene, resetBody } from './shared';

export interface MockStatus {
  /** 狀態名稱（HP、MP、SAN…） */
  label: string;
  value: number;
  max: number;
}

export interface CharacterSceneState {
  /** 狀態（最多 8 條；依 CCFOLIA 角色「狀態」的順序） */
  statuses: MockStatus[];
  /** 先攻值；0 時 CCFOLIA 把徽章縮成看不見 */
  initiative: number;
  /** 棋子圖片網址；null 用範例頭像 */
  avatarUrl: string | null;
  /** 顯示通知列（MuiSnackbar） */
  snackbar: string | null;
}

const C = {
  wrapper: fakeHash('cf-wrapper'),
  row: fakeHash('cf-row'),
  badge: fakeHash('cf-badge-root'),
  avatar: fakeHash('cf-avatar'),
  avatarMid: fakeHash('cf-avatar-mid'),
  avatarSq: fakeHash('cf-avatar-sq'),
  img: fakeHash('cf-img'),
  badgeChip: fakeHash('cf-badge'),
  column: fakeHash('cf-column'),
  bars: fakeHash('cf-bars'),
  bar: fakeHash('cf-bar'),
  text: fakeHash('cf-text'),
  p: fakeHash('cf-p'),
  track: fakeHash('cf-track'),
  trough: fakeHash('cf-trough'),
  fill: fakeHash('cf-fill'),
  snack: fakeHash('cf-snack'),
};

/** 頁面原本的樣式（status-bar 規格 3.1.4） */
const ORIGINAL_CSS = `
html, body, #root { height: 100%; }
body { margin: 0; background: #ffffff; color: rgba(0, 0, 0, 0.87); font-family: Roboto, Helvetica, Arial, sans-serif; font-size: 16px; line-height: 1.5; }
.${C.wrapper} { padding: 8px; }
.${C.row} { display: flex; align-items: flex-start; margin-bottom: 16px; }
.${C.badge} { position: relative; display: inline-flex; vertical-align: middle; flex-shrink: 0; }
.${C.avatar} { position: relative; display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 40px; height: 40px; border-radius: 4px; border: 1px solid #f5f5f5; background-color: rgba(0, 0, 0, 0.64); color: #fff; overflow: hidden; box-sizing: content-box; }
.${C.avatarMid} { width: 100%; height: 100%; overflow: hidden; }
.${C.avatarSq} { position: relative; display: flex; width: 100%; height: 100%; border-radius: 0; overflow: hidden; }
.${C.img} { width: 100%; height: 100%; object-fit: cover; object-position: top; text-align: center; color: transparent; }
.${C.badgeChip} { display: flex; flex-flow: row wrap; place-content: center; align-items: center; position: absolute; box-sizing: border-box; font-family: Roboto, Helvetica, Arial, sans-serif; font-weight: 500; font-size: 12px; min-width: 20px; line-height: 1; padding: 0 6px; height: 20px; border-radius: 10px; z-index: 1; background-color: #f5f5f5; color: #424242; top: 4px; right: 4px; transform: scale(1) translate(50%, -50%); transform-origin: 100% 0%; transition: transform 225ms cubic-bezier(0.4, 0, 0.2, 1) 0ms; }
.${C.badgeChip}.${CHARACTER_PAGE.badgeInvisibleClass} { transform: scale(0) translate(50%, -50%); }
.${C.bars} { display: flex; flex-wrap: wrap; margin-left: 4px; max-width: 210px; }
.${C.bar} { position: relative; width: 96px; margin: 2px; }
.${C.text} { position: absolute; inset: 0; z-index: 1; display: flex; justify-content: space-between; align-items: center; padding: 1px; }
.${C.p} { margin: 0; font-size: 14px; font-weight: 800; line-height: 1; color: #424242; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  text-shadow: 1px 1px 0 #f5f5f5, -1px 1px 0 #f5f5f5, 1px -1px 0 #f5f5f5, -1px -1px 0 #f5f5f5, 0 1px 0 #f5f5f5, 0 -1px 0 #f5f5f5, 1px 0 0 #f5f5f5, -1px 0 0 #f5f5f5; }
.${C.p} span[color="secondary"] { color: rgb(154, 0, 54); }
.${C.track} { position: relative; height: 16px; box-sizing: content-box; }
.${C.trough} { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 1px; background-color: #f5f5f5; opacity: 0.38; }
.${C.fill} { position: absolute; top: 0; left: 0; height: 100%; border-radius: 1px; background-color: #f5f5f5; }
.${C.snack} { position: fixed; z-index: 1400; left: 8px; right: 8px; bottom: 8px; display: flex; justify-content: center; }
.${C.snack} > div { background: #323232; color: #fff; padding: 6px 16px; border-radius: 4px; font-size: 14px; }
`;

interface BarNodes {
  root: HTMLElement;
  label: HTMLElement;
  current: HTMLElement;
  maxText: Text;
  fill: HTMLElement;
}

export const DEFAULT_CHARACTER_STATE: CharacterSceneState = {
  statuses: [
    { label: 'HP', value: 10, max: 12 },
    { label: 'MP', value: 8, max: 14 },
    { label: 'SAN', value: 48, max: 60 },
  ],
  initiative: 12,
  avatarUrl: null,
  snackbar: null,
};

export class CharacterScene implements MockScene {
  private s: CharacterSceneState;
  private doc: Document | null = null;
  private bars: BarNodes[] = [];
  private barsBox: HTMLElement | null = null;
  private img: HTMLImageElement | null = null;
  private badge: HTMLElement | null = null;
  private snack: HTMLElement | null = null;
  private root: HTMLElement | null = null;

  constructor(state: Partial<CharacterSceneState> = {}) {
    this.s = { ...DEFAULT_CHARACTER_STATE, ...state };
  }

  get state(): CharacterSceneState {
    return this.s;
  }

  /** 改狀態（只改有給的欄位）；已掛載時立刻更新頁面 */
  update(partial: Partial<CharacterSceneState>): void {
    this.s = { ...this.s, ...partial };
    this.render();
  }

  mount(doc: Document): () => void {
    this.doc = doc;
    resetBody(doc);
    addStyle(doc, ORIGINAL_CSS, 'ccfolia-character');
    this.img = h(doc, 'img', {
      class: `MuiAvatar-img ${C.img}`,
      alt: '',
      draggable: 'false',
    }) as HTMLImageElement;
    this.badge = h(doc, 'span', {
      class: `MuiBadge-badge MuiBadge-standard MuiBadge-anchorOriginTopRight MuiBadge-anchorOriginTopRightRectangular MuiBadge-overlapRectangular ${C.badgeChip}`,
    });
    this.barsBox = h(doc, 'div', { variant: 'bar', class: C.bars });
    this.snack = h(
      doc,
      'div',
      { class: `MuiSnackbar-root MuiSnackbar-anchorOriginBottomCenter ${C.snack}` },
      [h(doc, 'div', { class: 'MuiPaper-root MuiSnackbarContent-root', role: 'alert' })],
    );
    this.root = h(doc, 'div', { id: 'root' }, [
      h(doc, 'div', { class: C.wrapper }, [
        h(doc, 'div', { class: C.row }, [
          h(doc, 'span', { class: `MuiBadge-root ${C.badge}` }, [
            h(
              doc,
              'div',
              { class: `MuiAvatar-root MuiAvatar-circular MuiAvatar-colorDefault ${C.avatar}` },
              [
                h(doc, 'div', { class: C.avatarMid }, [
                  h(doc, 'div', { class: `MuiAvatar-root MuiAvatar-square ${C.avatarSq}` }, [
                    this.img,
                  ]),
                ]),
              ],
            ),
            this.badge,
          ]),
          h(doc, 'div', { class: C.column }, [this.barsBox]),
        ]),
      ]),
    ]);
    doc.body.append(this.root);
    this.bars = [];
    this.render();
    return () => {
      if (this.doc === doc) {
        this.doc = null;
        this.bars = [];
        this.root = null;
      }
    };
  }

  private makeBar(doc: Document): BarNodes {
    const label = h(doc, 'p', {
      class: `MuiTypography-root MuiTypography-body2 MuiTypography-noWrap ${C.p}`,
    });
    const current = h(doc, 'span', { color: 'default' });
    const maxText = doc.createTextNode('');
    const value = h(doc, 'p', {
      class: `MuiTypography-root MuiTypography-body2 MuiTypography-noWrap ${C.p}`,
    });
    value.append(current, doc.createTextNode('/'), maxText);
    const fill = h(doc, 'div', { class: C.fill });
    const root = h(doc, 'div', { class: C.bar }, [
      h(doc, 'div', { class: C.text }, [label, value]),
      h(doc, 'div', { class: C.track }, [h(doc, 'div', { class: C.trough }), fill]),
    ]);
    return { root, label, current, maxText, fill };
  }

  private render(): void {
    const doc = this.doc;
    if (!doc || !this.barsBox || !this.img || !this.badge || !this.root) return;
    const list = this.s.statuses.slice(0, MAX_STATUS_BARS);
    /* 多出來的條才新增／移除，既有的元素原地更新 */
    while (this.bars.length < list.length) {
      const b = this.makeBar(doc);
      this.bars.push(b);
      this.barsBox.append(b.root);
    }
    while (this.bars.length > list.length) this.bars.pop()?.root.remove();
    list.forEach((st, i) => {
      const b = this.bars[i];
      if (b.label.textContent !== st.label) b.label.textContent = st.label;
      const cur = String(st.value);
      if (b.current.textContent !== cur) b.current.textContent = cur;
      const max = String(st.max);
      if (b.maxText.data !== max) b.maxText.data = max;
      const color = currentColorAttr(st.value, st.max);
      if (b.current.getAttribute('color') !== color) b.current.setAttribute('color', color);
      const style = fillStyleAttr(st.value, st.max);
      if (b.fill.getAttribute('style') !== style) b.fill.setAttribute('style', style);
    });
    const src = this.s.avatarUrl || mockAvatar(0);
    if (this.img.getAttribute('src') !== src) this.img.setAttribute('src', src);
    const ini = Math.max(0, Math.trunc(Number(this.s.initiative) || 0));
    this.badge.textContent = String(ini);
    this.badge.classList.toggle(CHARACTER_PAGE.badgeInvisibleClass, ini === 0);
    if (this.snack) {
      if (this.s.snackbar) {
        (this.snack.firstElementChild as HTMLElement).textContent = this.s.snackbar;
        if (!this.snack.isConnected) this.root.append(this.snack);
      } else this.snack.remove();
    }
  }
}

export const createCharacterScene = (state?: Partial<CharacterSceneState>): CharacterScene =>
  new CharacterScene(state);
