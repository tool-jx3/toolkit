/**
 * 模擬 Discord Streamkit 的語音疊加層（語音小工具）。結構見 dom.ts 的 STREAMKIT（obs-tachie 規格 3.1）：
 * - 頻道裡的每個人一個 li（離開頻道就從 DOM 移除）；說話時頭像 img 多一個 Voice_avatarSpeaking__ class；
 * - class 是「Voice_名稱__雜湊」，雜湊故意用假的值，確保產生的 CSS 只靠前綴比對；
 * - 頭像 src 含「/avatars/{使用者ID}/」可以認人；沒有自訂頭像的人用預設頭像（網址不含 ID，無法辨認）。
 *   模擬頁的頭像是 data URI，後面用「#」接上 Discord 頭像網址的路徑（見 assets.ts 的 mockDiscordAvatar），
 *   預覽不必連網，選擇器照樣選得到。
 */
import { STREAMKIT_CLASS } from '../dom';
import { mockDiscordAvatar } from './assets';
import { addStyle, h, type MockScene, resetBody } from './shared';

export interface MockVoiceUser {
  /** Discord 使用者 ID（數字） */
  id: string;
  /** 顯示名稱（Streamkit 顯示的伺服器暱稱） */
  name: string;
  /** 在語音頻道裡（預設 true；false 時不在 DOM 裡） */
  inChannel?: boolean;
  /** 正在說話 */
  speaking?: boolean;
  /** 有自訂頭像（預設 true；false 時用預設頭像，網址不含 ID） */
  customAvatar?: boolean;
  /** 自訂頭像網址（不給時用模擬頭像） */
  avatarUrl?: string;
}

export interface StreamkitSceneState {
  users: readonly MockVoiceUser[];
}

/** 假的雜湊後綴（與真的不同） */
const HASH = {
  container: 'tkQ1x',
  states: 'tkW2y',
  state: 'tkE3z',
  avatar: 'tkR4a',
  speaking: 'tkT5b',
  user: 'tkY6c',
  name: 'tkU7d',
};
const cls = (part: keyof typeof HASH) => `${STREAMKIT_CLASS[part]}${HASH[part]}`;

/** 語音小工具原本的外觀（網址參數預設值時：白字、深色底的名字、說話時綠框） */
const ORIGINAL_CSS = `
html, body { margin: 0; background: transparent; }
body { font-family: Whitney, 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #ffffff; overflow: auto; }
.${cls('container')} { padding: 8px; }
.${cls('states')} { list-style: none; margin: 0; padding: 0; }
.${cls('state')} { display: flex; align-items: center; height: 46px; margin-bottom: 8px; }
.${cls('avatar')} { width: 40px; height: 40px; border-radius: 50%; border: 3px solid transparent; box-sizing: content-box; }
.${cls('speaking')} { border-color: #43b581; }
.${cls('user')} { margin-left: 8px; }
.${cls('name')} { display: inline-block; padding: 4px 6px; border-radius: 3px; background: rgba(30, 33, 36, 0.95); font-size: 14px; font-weight: 500; line-height: 16px; text-shadow: 0 0 1px #000; }
`;

export class StreamkitScene implements MockScene {
  private s: StreamkitSceneState;
  private doc: Document | null = null;
  private list: HTMLElement | null = null;
  private items = new Map<string, { li: HTMLElement; img: HTMLImageElement; name: HTMLElement }>();

  constructor(state: Partial<StreamkitSceneState> = {}) {
    this.s = { users: [], ...state };
  }

  get state(): StreamkitSceneState {
    return this.s;
  }

  update(partial: Partial<StreamkitSceneState>): void {
    this.s = { ...this.s, ...partial };
    this.render();
  }

  /** 改某個人的狀態（在不在頻道、說話中） */
  setUser(id: string, patch: Partial<MockVoiceUser>): void {
    this.update({ users: this.s.users.map((u) => (u.id === id ? { ...u, ...patch } : u)) });
  }

  mount(doc: Document): () => void {
    this.doc = doc;
    resetBody(doc, 'zh-Hant');
    addStyle(doc, ORIGINAL_CSS, 'streamkit-voice');
    this.list = h(doc, 'ul', { class: cls('states') });
    doc.body.append(
      h(doc, 'div', { id: 'root' }, [h(doc, 'div', { class: cls('container') }, [this.list])]),
    );
    this.items.clear();
    this.render();
    return () => {
      if (this.doc === doc) {
        this.doc = null;
        this.list = null;
        this.items.clear();
      }
    };
  }

  private render(): void {
    const doc = this.doc;
    const list = this.list;
    if (!doc || !list) return;
    const present = this.s.users.filter((u) => u.inChannel !== false);
    const keep = new Set(present.map((u) => u.id));
    for (const [id, it] of this.items) {
      if (!keep.has(id)) {
        it.li.remove();
        this.items.delete(id);
      }
    }
    let prev: HTMLElement | null = null;
    present.forEach((u, i) => {
      let it = this.items.get(u.id);
      if (!it) {
        const img = h(doc, 'img', { class: cls('avatar'), alt: '' }) as HTMLImageElement;
        const name = h(doc, 'span', { class: cls('name') });
        const li = h(doc, 'li', { class: cls('state') }, [
          img,
          h(doc, 'div', { class: cls('user') }, [name]),
        ]);
        it = { li, img, name };
        this.items.set(u.id, it);
      }
      const src = u.avatarUrl ?? mockDiscordAvatar(u.id, i, u.customAvatar !== false);
      if (it.img.getAttribute('src') !== src) it.img.setAttribute('src', src);
      it.img.className = u.speaking ? `${cls('avatar')} ${cls('speaking')}` : cls('avatar');
      if (it.name.textContent !== u.name) it.name.textContent = u.name;
      if (prev ? prev.nextSibling !== it.li : list.firstChild !== it.li) {
        if (prev) prev.after(it.li);
        else list.prepend(it.li);
      }
      prev = it.li;
    });
  }
}

export const createStreamkitScene = (state?: Partial<StreamkitSceneState>): StreamkitScene =>
  new StreamkitScene(state);
